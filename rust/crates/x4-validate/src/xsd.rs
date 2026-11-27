use crate::xml_wellformed::LineIndex;
use crate::{Diagnostic, Severity};
use regex::Regex;
use roxmltree::{Document, Node};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use x4_corpus::CorpusIndex;

const XS_NS: &str = "http://www.w3.org/2001/XMLSchema";

#[derive(Debug, Clone, Default)]
pub struct XsdSimpleType {
    pub name: String,
    pub base: Option<String>,
    pub enums: BTreeSet<String>,
    pub patterns: Vec<String>,
    pub unions: Vec<String>,
    pub inline_members: Vec<XsdSimpleType>,
}

#[derive(Debug, Clone, Default)]
pub struct XsdAttrDef {
    pub name: String,
    pub type_name: Option<String>,
    pub required: bool,
    pub prohibited: bool,
    pub fixed: Option<String>,
    pub inline_simple: Option<XsdSimpleType>,
}

#[derive(Debug, Clone)]
pub struct ChildSlot {
    pub name: String,
    pub min_occurs: u32,
    pub max_occurs: Option<u32>,
    pub type_name: Option<String>,
    pub inline_type: Option<String>, // synthesized type key
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ComposerKind {
    Sequence,
    Choice,
    All,
    UnboundedChoice,
}

#[derive(Debug, Clone)]
pub struct XsdComplexType {
    pub name: String,
    pub mixed: bool,
    pub simple_content: bool,
    pub base: Option<String>,
    pub attrs: BTreeMap<String, XsdAttrDef>,
    pub attr_groups: Vec<String>,
    pub any_attribute: bool,
    pub any_child: bool,
    pub composer: ComposerKind,
    pub children: Vec<ChildSlot>,
    pub group_refs: Vec<String>,
}

impl Default for XsdComplexType {
    fn default() -> Self {
        Self {
            name: String::new(),
            mixed: false,
            simple_content: false,
            base: None,
            attrs: BTreeMap::new(),
            attr_groups: Vec::new(),
            any_attribute: false,
            any_child: false,
            composer: ComposerKind::UnboundedChoice,
            children: Vec::new(),
            group_refs: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct ResolvedTypeInfo {
    pub mixed: bool,
    pub simple_content: bool,
    pub any_attribute: bool,
    pub any_child: bool,
    pub composer: ComposerKind,
    pub attrs: BTreeMap<String, XsdAttrDef>,
    pub allowed_children: BTreeMap<String, ChildSlot>,
    pub ordered_sequence: Vec<ChildSlot>,
}

impl Default for ComposerKind {
    fn default() -> Self {
        Self::UnboundedChoice
    }
}

#[derive(Debug, Clone, Default)]
pub struct SingleSchema {
    pub root_elements: BTreeMap<String, String>, // element name -> type_key
    pub simple_types: BTreeMap<String, XsdSimpleType>,
    pub complex_types: BTreeMap<String, XsdComplexType>,
    pub attr_groups: BTreeMap<String, XsdComplexType>,
    pub groups: BTreeMap<String, XsdComplexType>,
    pub all_elements: BTreeSet<String>,
    pub anon_counter: usize,
}

impl SingleSchema {
    fn alloc_anon_name(&mut self, prefix: &str) -> String {
        self.anon_counter += 1;
        format!("__anon_{prefix}_{}", self.anon_counter)
    }

    pub fn resolve_type(&self, type_key: &str, depth: usize) -> ResolvedTypeInfo {
        if depth > 24 {
            return ResolvedTypeInfo::default();
        }
        let mut out = ResolvedTypeInfo::default();
        if let Some(st) = self.simple_types.get(type_key) {
            let _ = st;
            out.simple_content = true;
            return out;
        }
        let Some(ct) = self.complex_types.get(type_key) else {
            return out;
        };
        let mut has_base = false;
        if let Some(ref base) = ct.base {
            let base_key = normalize_xs_name(base);
            if self.complex_types.contains_key(&base_key) {
                out = self.resolve_type(&base_key, depth + 1);
                has_base = true;
            } else if self.simple_types.contains_key(&base_key) || base.starts_with("xs:") {
                out.simple_content = true;
                has_base = true;
            }
        }
        if ct.mixed {
            out.mixed = true;
        }
        if ct.simple_content {
            out.simple_content = true;
        }
        if ct.any_attribute {
            out.any_attribute = true;
        }
        if ct.any_child {
            out.any_child = true;
        }

        for grp_name in &ct.attr_groups {
            self.collect_attr_group(grp_name, &mut out, depth + 1);
        }
        for (k, v) in &ct.attrs {
            if v.prohibited {
                out.attrs.remove(k);
            } else {
                out.attrs.insert(k.clone(), v.clone());
            }
        }

        let mut local_slots = ct.children.clone();
        for gref in &ct.group_refs {
            self.collect_group_slots(gref, &mut local_slots, &mut out.any_child, depth + 1);
        }

        if ct.composer == ComposerKind::Sequence && !has_base && ct.group_refs.is_empty() {
            out.composer = ComposerKind::Sequence;
            if out.ordered_sequence.is_empty() {
                out.ordered_sequence = local_slots.clone();
            } else {
                out.ordered_sequence.extend(local_slots.clone());
            }
        } else if !local_slots.is_empty() && out.composer == ComposerKind::Sequence && has_base {
            out.ordered_sequence.extend(local_slots.clone());
        } else if ct.composer == ComposerKind::Choice || ct.composer == ComposerKind::All {
            out.composer = ct.composer;
        }

        for slot in local_slots {
            out.allowed_children
                .entry(slot.name.clone())
                .and_modify(|prev| {
                    prev.min_occurs = prev.min_occurs.min(slot.min_occurs);
                    prev.max_occurs = match (prev.max_occurs, slot.max_occurs) {
                        (Some(a), Some(b)) => Some(a.saturating_add(b)),
                        _ => None,
                    };
                    if prev.type_name.is_none() {
                        prev.type_name = slot.type_name.clone();
                    }
                    if prev.inline_type.is_none() {
                        prev.inline_type = slot.inline_type.clone();
                    }
                })
                .or_insert(slot);
        }

        out
    }

    fn collect_attr_group(&self, name: &str, out: &mut ResolvedTypeInfo, depth: usize) {
        if depth > 24 {
            return;
        }
        let key = normalize_xs_name(name);
        let Some(grp) = self.attr_groups.get(&key) else {
            return;
        };
        if grp.any_attribute {
            out.any_attribute = true;
        }
        for sub in &grp.attr_groups {
            self.collect_attr_group(sub, out, depth + 1);
        }
        for (k, v) in &grp.attrs {
            if v.prohibited {
                out.attrs.remove(k);
            } else {
                out.attrs.insert(k.clone(), v.clone());
            }
        }
    }

    fn collect_group_slots(
        &self,
        name: &str,
        slots: &mut Vec<ChildSlot>,
        any_child: &mut bool,
        depth: usize,
    ) {
        if depth > 24 {
            return;
        }
        let key = normalize_xs_name(name);
        let Some(grp) = self.groups.get(&key) else {
            return;
        };
        if grp.any_child {
            *any_child = true;
        }
        slots.extend(grp.children.clone());
        for sub in &grp.group_refs {
            self.collect_group_slots(sub, slots, any_child, depth + 1);
        }
    }
}

#[derive(Debug, Default)]
pub struct XsdRegistry {
    pub schemas: BTreeMap<String, SingleSchema>, // key: lowercase filename e.g. "md.xsd"
    pub schema_files: BTreeMap<String, String>,
}

fn is_xs(node: Node<'_, '_>, local: &str) -> bool {
    if !node.is_element() {
        return false;
    }
    let tag = node.tag_name();
    tag.name() == local && (tag.namespace() == Some(XS_NS) || tag.namespace().is_none())
}

fn normalize_xs_name(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some(pos) = trimmed.find(':') {
        let prefix = &trimmed[..pos];
        if prefix.eq_ignore_ascii_case("xs") || prefix.eq_ignore_ascii_case("xsd") {
            return format!("xs:{}", trimmed[pos + 1..].trim());
        }
    }
    trimmed.to_string()
}

fn parse_occurs(raw: Option<&str>, default_val: u32) -> Option<u32> {
    match raw.map(|s| s.trim()) {
        None => Some(default_val),
        Some("unbounded") => None,
        Some(other) => other.parse::<u32>().ok().or(Some(default_val)),
    }
}

impl XsdRegistry {
    pub fn load(schema_files: &BTreeMap<String, String>) -> Self {
        let mut reg = Self {
            schemas: BTreeMap::new(),
            schema_files: schema_files.clone(),
        };
        for target in [
            "md.xsd",
            "aiscripts.xsd",
            "diff.xsd",
            "factions.xsd",
            "wares.xsd",
            "jobs.xsd",
            "gamestarts.xsd",
            "addon.xsd",
            "coreaddon.xsd",
            "libraries.xsd",
            "common.xsd",
            "content.xsd",
            "cutscenes.xsd",
            "scriptproperties.xsd",
        ] {
            if let Some(p) = schema_files.get(target) {
                let mut schema = SingleSchema::default();
                let mut visited = HashSet::new();
                load_schema_file(Path::new(p), schema_files, &mut visited, &mut schema);
                reg.schemas.insert(target.to_string(), schema);
            }
        }
        reg
    }

    pub fn ensure_schema(&mut self, file_name_lc: &str) -> Option<&SingleSchema> {
        if !self.schemas.contains_key(file_name_lc) {
            if let Some(p) = self.schema_files.get(file_name_lc).cloned() {
                let mut schema = SingleSchema::default();
                let mut visited = HashSet::new();
                load_schema_file(Path::new(&p), &self.schema_files, &mut visited, &mut schema);
                self.schemas.insert(file_name_lc.to_string(), schema);
            }
        }
        self.schemas.get(file_name_lc)
    }

    pub fn known_elements_for(&self, schema_key: &str) -> Vec<String> {
        self.schemas
            .get(schema_key)
            .map(|s| s.all_elements.iter().cloned().collect())
            .unwrap_or_default()
    }
}

fn load_schema_file(
    path: &Path,
    schema_files: &BTreeMap<String, String>,
    visited: &mut HashSet<PathBuf>,
    out: &mut SingleSchema,
) {
    let canon = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    if !visited.insert(canon.clone()) {
        return;
    }
    let Ok(raw) = fs::read_to_string(&canon) else {
        return;
    };
    let clean = raw.strip_prefix('\u{feff}').unwrap_or(&raw);
    let Ok(doc) = Document::parse(clean) else {
        return;
    };
    let root = doc.root_element();
    for child in root.children().filter(|n| n.is_element()) {
        if is_xs(child, "include") || is_xs(child, "import") || is_xs(child, "redefine") {
            if let Some(loc) = child.attribute("schemaLocation") {
                let inc_rel = loc.trim().replace('\\', "/");
                let parent = canon.parent().unwrap_or_else(|| Path::new("."));
                let candidate = parent.join(&inc_rel);
                if candidate.is_file() {
                    load_schema_file(&candidate, schema_files, visited, out);
                } else if let Some(fname) = Path::new(&inc_rel)
                    .file_name()
                    .and_then(|n| n.to_str())
                {
                    if let Some(mapped) = schema_files.get(&fname.to_ascii_lowercase()) {
                        load_schema_file(Path::new(mapped), schema_files, visited, out);
                    }
                }
            }
            if is_xs(child, "redefine") {
                ingest_schema_children(child, out);
            }
        }
    }
    ingest_schema_children(root, out);
}

fn ingest_schema_children(parent: Node<'_, '_>, out: &mut SingleSchema) {
    for child in parent.children().filter(|n| n.is_element()) {
        if is_xs(child, "simpleType") {
            if let Some(name) = child.attribute("name") {
                let st = parse_simple_type(child, name);
                out.simple_types.insert(name.to_string(), st);
            }
        } else if is_xs(child, "complexType") {
            if let Some(name) = child.attribute("name") {
                let ct = parse_complex_type(child, name, out);
                out.complex_types.insert(name.to_string(), ct);
            }
        } else if is_xs(child, "attributeGroup") {
            if let Some(name) = child.attribute("name") {
                let ct = parse_attr_group(child, name, out);
                out.attr_groups.insert(name.to_string(), ct);
            }
        } else if is_xs(child, "group") {
            if let Some(name) = child.attribute("name") {
                let ct = parse_element_group(child, name, out);
                out.groups.insert(name.to_string(), ct);
            }
        } else if is_xs(child, "element") {
            if let Some(name) = child.attribute("name") {
                out.all_elements.insert(name.to_string());
                let tname = if let Some(t) = child.attribute("type") {
                    normalize_xs_name(t)
                } else if let Some(inline_ct) = child.children().find(|n| is_xs(*n, "complexType"))
                {
                    let key = out.alloc_anon_name(name);
                    let ct = parse_complex_type(inline_ct, &key, out);
                    out.complex_types.insert(key.clone(), ct);
                    key
                } else if let Some(inline_st) = child.children().find(|n| is_xs(*n, "simpleType"))
                {
                    let key = out.alloc_anon_name(name);
                    let st = parse_simple_type(inline_st, &key);
                    out.simple_types.insert(key.clone(), st);
                    key
                } else {
                    String::new()
                };
                if !tname.is_empty() {
                    out.root_elements.insert(name.to_string(), tname);
                }
            }
        }
    }
}

fn parse_simple_type(node: Node<'_, '_>, name: &str) -> XsdSimpleType {
    let mut st = XsdSimpleType {
        name: name.to_string(),
        ..Default::default()
    };
    for child in node.children().filter(|n| n.is_element()) {
        if is_xs(child, "restriction") {
            if let Some(base) = child.attribute("base") {
                st.base = Some(normalize_xs_name(base));
            }
            for facet in child.children().filter(|n| n.is_element()) {
                if is_xs(facet, "enumeration") {
                    if let Some(v) = facet.attribute("value") {
                        st.enums.insert(v.to_string());
                    }
                } else if is_xs(facet, "pattern") {
                    if let Some(v) = facet.attribute("value") {
                        st.patterns.push(v.to_string());
                    }
                }
            }
        } else if is_xs(child, "union") {
            if let Some(mt) = child.attribute("memberTypes") {
                for tok in mt.split_whitespace() {
                    st.unions.push(normalize_xs_name(tok));
                }
            }
            for sub in child.children().filter(|n| is_xs(*n, "simpleType")) {
                st.inline_members.push(parse_simple_type(sub, name));
            }
        } else if is_xs(child, "list") {
            st.base = Some("xs:string".to_string());
        }
    }
    st
}

fn parse_attr_node(node: Node<'_, '_>, out: &mut SingleSchema) -> Option<XsdAttrDef> {
    if let Some(r) = node.attribute("ref") {
        let name = normalize_xs_name(r);
        let req = node.attribute("use") == Some("required");
        let proh = node.attribute("use") == Some("prohibited");
        return Some(XsdAttrDef {
            name: name.clone(),
            type_name: None,
            required: req,
            prohibited: proh,
            fixed: node.attribute("fixed").map(str::to_string),
            inline_simple: None,
        });
    }
    let name = node.attribute("name")?.to_string();
    let req = node.attribute("use") == Some("required");
    let proh = node.attribute("use") == Some("prohibited");
    let type_name = node.attribute("type").map(normalize_xs_name);
    let inline_simple = node
        .children()
        .find(|n| is_xs(*n, "simpleType"))
        .map(|st| parse_simple_type(st, &format!("__attr_{name}")));
    let _ = out;
    Some(XsdAttrDef {
        name,
        type_name,
        required: req,
        prohibited: proh,
        fixed: node.attribute("fixed").map(str::to_string),
        inline_simple,
    })
}

fn parse_attr_group(node: Node<'_, '_>, name: &str, out: &mut SingleSchema) -> XsdComplexType {
    let mut ct = XsdComplexType {
        name: name.to_string(),
        ..Default::default()
    };
    for child in node.children().filter(|n| n.is_element()) {
        if is_xs(child, "attribute") {
            if let Some(a) = parse_attr_node(child, out) {
                ct.attrs.insert(a.name.clone(), a);
            }
        } else if is_xs(child, "attributeGroup") {
            if let Some(r) = child.attribute("ref") {
                ct.attr_groups.push(normalize_xs_name(r));
            }
        } else if is_xs(child, "anyAttribute") {
            ct.any_attribute = true;
        }
    }
    ct
}

fn parse_element_group(node: Node<'_, '_>, name: &str, out: &mut SingleSchema) -> XsdComplexType {
    let mut ct = XsdComplexType {
        name: name.to_string(),
        ..Default::default()
    };
    collect_particles(node, &mut ct, out, true);
    ct
}

fn parse_complex_type(node: Node<'_, '_>, name: &str, out: &mut SingleSchema) -> XsdComplexType {
    let mut ct = XsdComplexType {
        name: name.to_string(),
        mixed: node.attribute("mixed") == Some("true"),
        ..Default::default()
    };
    for child in node.children().filter(|n| n.is_element()) {
        if is_xs(child, "simpleContent") {
            ct.simple_content = true;
            for sub in child.children().filter(|n| n.is_element()) {
                if is_xs(sub, "extension") || is_xs(sub, "restriction") {
                    if let Some(base) = sub.attribute("base") {
                        ct.base = Some(normalize_xs_name(base));
                    }
                    collect_attr_decls(sub, &mut ct, out);
                }
            }
        } else if is_xs(child, "complexContent") {
            if child.attribute("mixed") == Some("true") {
                ct.mixed = true;
            }
            for sub in child.children().filter(|n| n.is_element()) {
                if is_xs(sub, "extension") || is_xs(sub, "restriction") {
                    if let Some(base) = sub.attribute("base") {
                        ct.base = Some(normalize_xs_name(base));
                    }
                    collect_particles(sub, &mut ct, out, true);
                    collect_attr_decls(sub, &mut ct, out);
                }
            }
        }
    }
    collect_particles(node, &mut ct, out, true);
    collect_attr_decls(node, &mut ct, out);
    ct
}

fn collect_attr_decls(parent: Node<'_, '_>, ct: &mut XsdComplexType, out: &mut SingleSchema) {
    for child in parent.children().filter(|n| n.is_element()) {
        if is_xs(child, "attribute") {
            if let Some(a) = parse_attr_node(child, out) {
                ct.attrs.insert(a.name.clone(), a);
            }
        } else if is_xs(child, "attributeGroup") {
            if let Some(r) = child.attribute("ref") {
                ct.attr_groups.push(normalize_xs_name(r));
            }
        } else if is_xs(child, "anyAttribute") {
            ct.any_attribute = true;
        }
    }
}

fn collect_particles(
    parent: Node<'_, '_>,
    ct: &mut XsdComplexType,
    out: &mut SingleSchema,
    top_level: bool,
) {
    for child in parent.children().filter(|n| n.is_element()) {
        if is_xs(child, "sequence") {
            let max_unbounded = child.attribute("maxOccurs") == Some("unbounded");
            if top_level && !max_unbounded && child.children().all(|n| !is_xs(n, "choice") && !is_xs(n, "group")) {
                ct.composer = ComposerKind::Sequence;
            } else if max_unbounded {
                ct.composer = ComposerKind::UnboundedChoice;
            }
            collect_particles(child, ct, out, false);
        } else if is_xs(child, "choice") {
            if top_level {
                ct.composer = if child.attribute("maxOccurs") == Some("unbounded") {
                    ComposerKind::UnboundedChoice
                } else {
                    ComposerKind::Choice
                };
            }
            collect_particles(child, ct, out, false);
        } else if is_xs(child, "all") {
            if top_level {
                ct.composer = ComposerKind::All;
            }
            collect_particles(child, ct, out, false);
        } else if is_xs(child, "any") {
            ct.any_child = true;
        } else if is_xs(child, "group") {
            if let Some(r) = child.attribute("ref") {
                ct.group_refs.push(normalize_xs_name(r));
            }
        } else if is_xs(child, "element") {
            let min_o = if top_level {
                parse_occurs(child.attribute("minOccurs"), 1).unwrap_or(0)
            } else {
                // Inside choice or repeated blocks, conservatively don't mark missing unless direct simple sequence.
                let p_tag = child.parent().map(|p| p.tag_name().name()).unwrap_or("");
                if p_tag == "choice" || child.parent().and_then(|p| p.attribute("minOccurs")) == Some("0") {
                    0
                } else {
                    parse_occurs(child.attribute("minOccurs"), 1).unwrap_or(0)
                }
            };
            let p_unbounded = child
                .parent()
                .is_some_and(|p| p.attribute("maxOccurs") == Some("unbounded"));
            let max_o = if p_unbounded {
                None
            } else {
                parse_occurs(child.attribute("maxOccurs"), 1)
            };

            if let Some(r) = child.attribute("ref") {
                let ref_name = normalize_xs_name(r);
                out.all_elements.insert(ref_name.clone());
                ct.children.push(ChildSlot {
                    name: ref_name.clone(),
                    min_occurs: min_o,
                    max_occurs: max_o,
                    type_name: None,
                    inline_type: None,
                });
            } else if let Some(name) = child.attribute("name") {
                out.all_elements.insert(name.to_string());
                let tname = child.attribute("type").map(normalize_xs_name);
                let inline_key = if let Some(inline_ct) =
                    child.children().find(|n| is_xs(*n, "complexType"))
                {
                    let key = out.alloc_anon_name(name);
                    let parsed = parse_complex_type(inline_ct, &key, out);
                    out.complex_types.insert(key.clone(), parsed);
                    Some(key)
                } else if let Some(inline_st) = child.children().find(|n| is_xs(*n, "simpleType"))
                {
                    let key = out.alloc_anon_name(name);
                    let parsed = parse_simple_type(inline_st, &key);
                    out.simple_types.insert(key.clone(), parsed);
                    Some(key)
                } else {
                    None
                };
                ct.children.push(ChildSlot {
                    name: name.to_string(),
                    min_occurs: min_o,
                    max_occurs: max_o,
                    type_name: tname,
                    inline_type: inline_key,
                });
            }
        }
    }
}

pub fn route_schema_for_file(rel_path: &str, doc: &Document<'_>) -> Option<String> {
    let norm = rel_path.replace('\\', "/");
    let lower = norm.to_ascii_lowercase();
    let root_name = doc.root_element().tag_name().name();

    if let Some(loc) = doc
        .root_element()
        .attribute(("http://www.w3.org/2001/XMLSchema-instance", "noNamespaceSchemaLocation"))
        .or_else(|| doc.root_element().attribute("noNamespaceSchemaLocation"))
    {
        if let Some(fname) = Path::new(&loc.replace('\\', "/"))
            .file_name()
            .and_then(|n| n.to_str())
        {
            return Some(fname.to_ascii_lowercase());
        }
    }

    if root_name == "diff" {
        return Some("diff.xsd".to_string());
    }
    if lower.starts_with("md/") && root_name == "mdscript" {
        return Some("md.xsd".to_string());
    }
    if lower.starts_with("aiscripts/") && root_name == "aiscript" {
        return Some("aiscripts.xsd".to_string());
    }
    if lower == "libraries/factions.xml" || root_name == "factions" {
        return Some("factions.xsd".to_string());
    }
    if lower == "libraries/wares.xml" || root_name == "wares" {
        return Some("wares.xsd".to_string());
    }
    if lower == "libraries/jobs.xml" || root_name == "jobs" {
        return Some("jobs.xsd".to_string());
    }
    if lower == "content.xml" || root_name == "content" {
        return Some("content.xsd".to_string());
    }
    None
}

pub fn validate_xml_with_xsd(
    rel_path: &str,
    clean_text: &str,
    line_idx: &LineIndex,
    doc: &Document<'_>,
    registry: &XsdRegistry,
    corpus: &CorpusIndex,
    out: &mut Vec<Diagnostic>,
) {
    let Some(schema_key) = route_schema_for_file(rel_path, doc) else {
        return;
    };
    let Some(schema) = registry.schemas.get(&schema_key) else {
        if !registry.schemas.is_empty()
            && doc
                .root_element()
                .attributes()
                .any(|a| a.name() == "noNamespaceSchemaLocation")
        {
            let (line, col) = line_idx.pos_clean(clean_text, doc.root_element().range().start);
            out.push(Diagnostic {
                severity: Severity::Warning,
                code: "LIBRARY_SCHEMA_UNKNOWN".to_string(),
                category: "schema".to_string(),
                message: format!(
                    "Schema '{schema_key}' named by xsi:noNamespaceSchemaLocation was not found in unpacked schemas."
                ),
                file_path: Some(rel_path.to_string()),
                line: Some(line),
                column: Some(col),
                source_ref: None,
                suggestions: Vec::new(),
            });
        }
        return;
    };

    let root = doc.root_element();
    let root_tag = root.tag_name().name();
    let Some(root_type) = schema.root_elements.get(root_tag) else {
        let (line, col) = line_idx.pos_clean(clean_text, root.range().start);
        out.push(Diagnostic {
            severity: Severity::Error,
            code: "XSD_UNKNOWN_ELEMENT".to_string(),
            category: "schema".to_string(),
            message: format!("Unknown root element <{root_tag}> for schema {schema_key}."),
            file_path: Some(rel_path.to_string()),
            line: Some(line),
            column: Some(col),
            source_ref: None,
            suggestions: suggest_nearest(root_tag, &schema.all_elements),
        });
        return;
    };

    // For <diff> patches: check top-level diff.xsd, but allow arbitrary XML payload inside <add>/<replace>
    validate_node(
        rel_path,
        clean_text,
        line_idx,
        root,
        root_type,
        schema,
        corpus,
        schema_key == "diff.xsd",
        true,
        out,
    );
}

#[allow(clippy::too_many_arguments)]
fn validate_node(
    rel_path: &str,
    clean_text: &str,
    line_idx: &LineIndex,
    node: Node<'_, '_>,
    type_key: &str,
    schema: &SingleSchema,
    corpus: &CorpusIndex,
    is_diff_schema: bool,
    is_root: bool,
    out: &mut Vec<Diagnostic>,
) {
    let resolved = schema.resolve_type(type_key, 0);
    let node_tag = node.tag_name().name();
    let (nline, ncol) = line_idx.pos_clean(clean_text, node.range().start);

    // 1. Text check
    let has_elem_children = node.children().any(|c| c.is_element());
    let has_nonempty_text = node
        .children()
        .filter(|c| c.is_text())
        .any(|t| t.text().is_some_and(|s| !s.trim().is_empty()));
    if has_nonempty_text && !resolved.mixed && !resolved.simple_content && !is_diff_schema {
        if resolved.attrs.is_empty() && resolved.allowed_children.is_empty() {
            // Simple/empty/untyped fallback: only flag when complex element explicitly forbids text
        } else if !has_elem_children || !resolved.allowed_children.is_empty() {
            out.push(Diagnostic {
                severity: Severity::Error,
                code: "XSD_TEXT_NOT_ALLOWED".to_string(),
                category: "schema".to_string(),
                message: format!("Element <{node_tag}> does not allow character text content."),
                file_path: Some(rel_path.to_string()),
                line: Some(nline),
                column: Some(ncol),
                source_ref: None,
                suggestions: Vec::new(),
            });
        }
    }

    // 2. Attributes check
    for attr in node.attributes() {
        let aname = attr.name();
        if aname == "xmlns"
            || attr.namespace() == Some("http://www.w3.org/2001/XMLSchema-instance")
            || aname == "noNamespaceSchemaLocation"
            || aname == "schemaLocation"
        {
            continue;
        }
        let Some(def) = resolved.attrs.get(aname) else {
            if !resolved.any_attribute && (!is_root || aname != "xmlns:xsi") {
                out.push(Diagnostic {
                    severity: Severity::Error,
                    code: "XSD_UNKNOWN_ATTRIBUTE".to_string(),
                    category: "schema".to_string(),
                    message: format!("Attribute '{aname}' is not allowed on <{node_tag}>."),
                    file_path: Some(rel_path.to_string()),
                    line: Some(nline),
                    column: Some(ncol),
                    source_ref: None,
                    suggestions: Vec::new(),
                });
            }
            continue;
        };

        let val = attr.value();
        if let Some(ref fixed) = def.fixed {
            if val != fixed {
                out.push(Diagnostic {
                    severity: Severity::Error,
                    code: "XSD_FIXED_VIOLATION".to_string(),
                    category: "schema".to_string(),
                    message: format!(
                        "Attribute '{aname}' on <{node_tag}> must have fixed value '{fixed}', found '{val}'."
                    ),
                    file_path: Some(rel_path.to_string()),
                    line: Some(nline),
                    column: Some(ncol),
                    source_ref: None,
                    suggestions: Vec::new(),
                });
            }
        }

        validate_attr_value(
            rel_path,
            nline,
            ncol,
            node_tag,
            aname,
            val,
            def,
            schema,
            corpus,
            out,
        );
    }

    // 3. Required attributes check
    for (req_name, def) in &resolved.attrs {
        if def.required && !def.prohibited && node.attribute(req_name.as_str()).is_none() {
            out.push(Diagnostic {
                severity: Severity::Error,
                code: "XSD_MISSING_REQUIRED".to_string(),
                category: "schema".to_string(),
                message: format!("Element <{node_tag}> is missing required attribute '{req_name}'."),
                file_path: Some(rel_path.to_string()),
                line: Some(nline),
                column: Some(ncol),
                source_ref: None,
                suggestions: Vec::new(),
            });
        }
    }

    // Inside <diff>/<add> or <diff>/<replace>, child elements are mod XML payload, not diff ops.
    if is_diff_schema && (node_tag == "add" || node_tag == "replace") {
        return;
    }

    // 4. Child elements check
    let mut child_counts: HashMap<String, u32> = HashMap::new();
    let mut child_tags_seen: Vec<(String, u32, u32)> = Vec::new();
    for ch in node.children().filter(|c| c.is_element()) {
        let ctag = ch.tag_name().name();
        let (cline, ccol) = line_idx.pos_clean(clean_text, ch.range().start);
        *child_counts.entry(ctag.to_string()).or_insert(0) += 1;
        child_tags_seen.push((ctag.to_string(), cline, ccol));

        let Some(slot) = resolved.allowed_children.get(ctag) else {
            if !resolved.any_child {
                let code = if schema.all_elements.contains(ctag) {
                    "XSD_ILLEGAL_CHILD"
                } else {
                    "XSD_UNKNOWN_ELEMENT"
                };
                let candidates: BTreeSet<String> = resolved.allowed_children.keys().cloned().collect();
                out.push(Diagnostic {
                    severity: Severity::Error,
                    code: code.to_string(),
                    category: "schema".to_string(),
                    message: format!("Element <{ctag}> is not allowed inside <{node_tag}>."),
                    file_path: Some(rel_path.to_string()),
                    line: Some(cline),
                    column: Some(ccol),
                    source_ref: None,
                    suggestions: suggest_nearest(ctag, &candidates),
                });
            }
            continue;
        };

        let next_type = slot
            .inline_type
            .as_deref()
            .or(slot.type_name.as_deref())
            .or_else(|| schema.root_elements.get(ctag).map(String::as_str));
        if let Some(nt) = next_type {
            validate_node(
                rel_path,
                clean_text,
                line_idx,
                ch,
                nt,
                schema,
                corpus,
                is_diff_schema,
                false,
                out,
            );
        }
    }

    // 5. Cardinality checks (strict sequence elements only)
    for (cname, count) in &child_counts {
        if let Some(slot) = resolved.allowed_children.get(cname) {
            if let Some(max_o) = slot.max_occurs {
                if *count > max_o && !resolved.any_child {
                    out.push(Diagnostic {
                        severity: Severity::Error,
                        code: "XSD_CHILD_CARDINALITY".to_string(),
                        category: "schema".to_string(),
                        message: format!(
                            "Element <{node_tag}> allows at most {max_o} <{cname}> child(ren), found {count}."
                        ),
                        file_path: Some(rel_path.to_string()),
                        line: Some(nline),
                        column: Some(ncol),
                        source_ref: None,
                        suggestions: Vec::new(),
                    });
                }
            }
        }
    }
    if resolved.composer == ComposerKind::Sequence && !resolved.ordered_sequence.is_empty() {
        for slot in &resolved.ordered_sequence {
            if slot.min_occurs > 0 {
                let actual = child_counts.get(&slot.name).copied().unwrap_or(0);
                if actual < slot.min_occurs {
                    out.push(Diagnostic {
                        severity: Severity::Error,
                        code: "XSD_CHILD_CARDINALITY".to_string(),
                        category: "schema".to_string(),
                        message: format!(
                            "Element <{node_tag}> requires at least {} <{}> child(ren), found {actual}.",
                            slot.min_occurs, slot.name
                        ),
                        file_path: Some(rel_path.to_string()),
                        line: Some(nline),
                        column: Some(ncol),
                        source_ref: None,
                        suggestions: Vec::new(),
                    });
                }
            }
        }
        // Order check: verify slot index is monotonically non-decreasing across sequence
        let mut slot_pos: HashMap<&str, usize> = HashMap::new();
        for (idx, s) in resolved.ordered_sequence.iter().enumerate() {
            slot_pos.entry(s.name.as_str()).or_insert(idx);
        }
        let mut max_seen: Option<usize> = None;
        for (ctag, cline, ccol) in &child_tags_seen {
            if let Some(&pos) = slot_pos.get(ctag.as_str()) {
                if let Some(prev) = max_seen {
                    if pos < prev {
                        out.push(Diagnostic {
                            severity: Severity::Error,
                            code: "XSD_CHILD_ORDER".to_string(),
                            category: "schema".to_string(),
                            message: format!(
                                "Child <{ctag}> is out of schema sequence order inside <{node_tag}>."
                            ),
                            file_path: Some(rel_path.to_string()),
                            line: Some(*cline),
                            column: Some(*ccol),
                            source_ref: None,
                            suggestions: Vec::new(),
                        });
                    }
                }
                max_seen = Some(pos);
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn validate_attr_value(
    rel_path: &str,
    line: u32,
    col: u32,
    tag: &str,
    attr_name: &str,
    val: &str,
    def: &XsdAttrDef,
    schema: &SingleSchema,
    corpus: &CorpusIndex,
    out: &mut Vec<Diagnostic>,
) {
    let tname = def.type_name.as_deref().unwrap_or("");
    let simple = def
        .inline_simple
        .as_ref()
        .or_else(|| schema.simple_types.get(tname));

    // Dynamic X4 expressions (e.g. $var, @expr, true, etc.): skip strict literal checks when type allows expressions
    let trimmed = val.trim();
    if let Some(st) = simple {
        validate_simple_type(rel_path, line, col, tag, attr_name, trimmed, st, schema, out);
    } else if tname.starts_with("xs:") {
        check_xs_builtin(rel_path, line, col, tag, attr_name, trimmed, tname, out);
    }

    // Corpus entity reference checks inside schema-validated XML when corpus is loaded
    if !corpus.factions.is_empty() && (tname == "factionlookup" || (attr_name == "faction" && !trimmed.starts_with('$') && !trimmed.starts_with("faction."))) {
        if let Some(raw_f) = trimmed.strip_prefix("faction.") {
            if !corpus.factions.contains(raw_f) && !corpus.factions.contains(trimmed) {
                emit_ref_warn(rel_path, line, col, "REF_UNKNOWN_FACTION", "faction", raw_f, out);
            }
        }
    }
    if !corpus.wares.is_empty() && tname == "warelookup" && !trimmed.starts_with('$') && !trimmed.contains('{') {
        let raw = trimmed.strip_prefix("ware.").unwrap_or(trimmed);
        if !raw.is_empty() && !corpus.wares.contains(raw) {
            emit_ref_warn(rel_path, line, col, "REF_UNKNOWN_WARE", "ware", raw, out);
        }
    }
    if !corpus.macros.is_empty() && tname == "macrolookup" && !trimmed.starts_with('$') && !trimmed.contains('{') {
        let raw = trimmed.strip_prefix("macro.").unwrap_or(trimmed);
        if !raw.is_empty() && !corpus.macros.contains(raw) {
            emit_ref_warn(rel_path, line, col, "REF_UNKNOWN_MACRO", "macro", raw, out);
        }
    }
}

fn emit_ref_warn(
    rel_path: &str,
    line: u32,
    col: u32,
    code: &str,
    kind: &str,
    id: &str,
    out: &mut Vec<Diagnostic>,
) {
    out.push(Diagnostic {
        severity: Severity::Warning,
        code: code.to_string(),
        category: "reference".to_string(),
        message: format!("Unknown {kind} reference '{id}' not found in unpacked corpus."),
        file_path: Some(rel_path.to_string()),
        line: Some(line),
        column: Some(col),
        source_ref: None,
        suggestions: Vec::new(),
    });
}

#[allow(clippy::too_many_arguments)]
fn validate_simple_type(
    rel_path: &str,
    line: u32,
    col: u32,
    tag: &str,
    attr_name: &str,
    val: &str,
    st: &XsdSimpleType,
    schema: &SingleSchema,
    out: &mut Vec<Diagnostic>,
) {
    let lower_name = st.name.to_ascii_lowercase();
    if lower_name.contains("time") && !lower_name.contains("expr") && !val.starts_with('$') && !val.contains('{') {
        // Basic X4 duration/time check (e.g. "5s", "10ms", "1min", "2h", or numeric)
        let ok_time = val.parse::<f64>().is_ok()
            || val.ends_with("ms")
            || val.ends_with('s')
            || val.ends_with("min")
            || val.ends_with('h');
        if !ok_time {
            out.push(Diagnostic {
                severity: Severity::Error,
                code: "XSD_TIME_FORMAT".to_string(),
                category: "schema".to_string(),
                message: format!("Invalid time format '{val}' for attribute '{attr_name}' on <{tag}>."),
                file_path: Some(rel_path.to_string()),
                line: Some(line),
                column: Some(col),
                source_ref: None,
                suggestions: Vec::new(),
            });
            return;
        }
    }

    // XSD <xs:union>: valid if ANY member type accepts `val`.
    if !st.unions.is_empty() || !st.inline_members.is_empty() {
        let mut any_match = false;
        let mut first_err: Option<Diagnostic> = None;
        for m in &st.unions {
            let mut probe = Vec::new();
            if m.starts_with("xs:") {
                check_xs_builtin(rel_path, line, col, tag, attr_name, val, m, &mut probe);
            } else if let Some(member_st) = schema.simple_types.get(m) {
                validate_simple_type(
                    rel_path,
                    line,
                    col,
                    tag,
                    attr_name,
                    val,
                    member_st,
                    schema,
                    &mut probe,
                );
            }
            if probe.is_empty() {
                any_match = true;
                break;
            }
            if first_err.is_none() {
                first_err = probe.into_iter().next();
            }
        }
        if !any_match {
            for member_st in &st.inline_members {
                let mut probe = Vec::new();
                validate_simple_type(
                    rel_path,
                    line,
                    col,
                    tag,
                    attr_name,
                    val,
                    member_st,
                    schema,
                    &mut probe,
                );
                if probe.is_empty() {
                    any_match = true;
                    break;
                }
                if first_err.is_none() {
                    first_err = probe.into_iter().next();
                }
            }
        }
        if !any_match {
            if let Some(diag) = first_err {
                out.push(diag);
            }
        }
        return;
    }

    if !st.enums.is_empty() && !st.enums.contains(val) {
        out.push(Diagnostic {
            severity: Severity::Error,
            code: "XSD_ENUM_VIOLATION".to_string(),
            category: "schema".to_string(),
            message: format!(
                "Value '{val}' for '{attr_name}' on <{tag}> is not one of the allowed enum values."
            ),
            file_path: Some(rel_path.to_string()),
            line: Some(line),
            column: Some(col),
            source_ref: None,
            suggestions: suggest_nearest(val, &st.enums),
        });
        return;
    }

    // W3C XSD 1.0: multiple <xs:pattern> siblings within a restriction step are ORed.
    if !st.patterns.is_empty() {
        let mut compiled = Vec::new();
        for pat in &st.patterns {
            let anchored = format!("^(?:{pat})$");
            if let Ok(re) = Regex::new(&anchored) {
                compiled.push((pat, re));
            }
        }
        if !compiled.is_empty() && !compiled.iter().any(|(_, re)| re.is_match(val)) {
            let pat = compiled[0].0;
            out.push(Diagnostic {
                severity: Severity::Error,
                code: "XSD_PATTERN_VIOLATION".to_string(),
                category: "schema".to_string(),
                message: format!(
                    "Value '{val}' for '{attr_name}' on <{tag}> does not match pattern /{pat}/."
                ),
                file_path: Some(rel_path.to_string()),
                line: Some(line),
                column: Some(col),
                source_ref: None,
                suggestions: Vec::new(),
            });
            return;
        }
    }

    if let Some(ref base) = st.base {
        if base.starts_with("xs:") {
            check_xs_builtin(rel_path, line, col, tag, attr_name, val, base, out);
        } else if let Some(parent_st) = schema.simple_types.get(base) {
            validate_simple_type(rel_path, line, col, tag, attr_name, val, parent_st, schema, out);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn check_xs_builtin(
    rel_path: &str,
    line: u32,
    col: u32,
    tag: &str,
    attr_name: &str,
    val: &str,
    builtin: &str,
    out: &mut Vec<Diagnostic>,
) {
    let valid = match builtin {
        "xs:boolean" => matches!(val, "true" | "false" | "1" | "0"),
        "xs:integer" | "xs:int" | "xs:long" | "xs:short" => val.parse::<i64>().is_ok(),
        "xs:nonNegativeInteger" | "xs:unsignedInt" | "xs:unsignedLong" => {
            val.parse::<u64>().is_ok()
        }
        "xs:positiveInteger" => val.parse::<u64>().is_ok_and(|n| n > 0),
        "xs:decimal" | "xs:float" | "xs:double" => val.parse::<f64>().is_ok_and(|n| n.is_finite()),
        _ => true,
    };
    if !valid {
        out.push(Diagnostic {
            severity: Severity::Error,
            code: "XSD_TYPE_VIOLATION".to_string(),
            category: "schema".to_string(),
            message: format!(
                "Attribute '{attr_name}' on <{tag}> expects {builtin}, found '{val}'."
            ),
            file_path: Some(rel_path.to_string()),
            line: Some(line),
            column: Some(col),
            source_ref: None,
            suggestions: Vec::new(),
        });
    }
}

pub fn levenshtein(a: &str, b: &str) -> usize {
    let b_chars: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b_chars.len()).collect();
    let mut curr = vec![0usize; b_chars.len() + 1];
    for (i, ca) in a.chars().enumerate() {
        curr[0] = i + 1;
        for (j, cb) in b_chars.iter().enumerate() {
            let cost = usize::from(ca != *cb);
            curr[j + 1] = (prev[j + 1] + 1).min(curr[j] + 1).min(prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b_chars.len()]
}

/// Optimal String Alignment (Damerau-Levenshtein) distance where adjacent
/// character transpositions count as edit distance 1.
pub fn damerau_levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    if a_chars.is_empty() {
        return b_chars.len();
    }
    if b_chars.is_empty() {
        return a_chars.len();
    }
    let mut prev2 = vec![0usize; b_chars.len() + 1];
    let mut prev1: Vec<usize> = (0..=b_chars.len()).collect();
    let mut curr = vec![0usize; b_chars.len() + 1];
    for i in 1..=a_chars.len() {
        curr[0] = i;
        for j in 1..=b_chars.len() {
            let cost = usize::from(a_chars[i - 1] != b_chars[j - 1]);
            let mut val = (prev1[j] + 1).min(curr[j - 1] + 1).min(prev1[j - 1] + cost);
            if i > 1
                && j > 1
                && a_chars[i - 1] == b_chars[j - 2]
                && a_chars[i - 2] == b_chars[j - 1]
            {
                val = val.min(prev2[j - 2] + 1);
            }
            curr[j] = val;
        }
        std::mem::swap(&mut prev2, &mut prev1);
        std::mem::swap(&mut prev1, &mut curr);
    }
    prev1[b_chars.len()]
}

pub fn suggest_nearest(needle: &str, haystack: &BTreeSet<String>) -> Vec<String> {
    let mut scored: Vec<(usize, &String)> = haystack
        .iter()
        .filter_map(|cand| {
            let d = damerau_levenshtein(&needle.to_ascii_lowercase(), &cand.to_ascii_lowercase());
            (d <= 3).then_some((d, cand))
        })
        .collect();
    scored.sort_by_key(|(d, s)| (*d, s.as_str()));
    scored.into_iter().take(3).map(|(_, s)| s.clone()).collect()
}
