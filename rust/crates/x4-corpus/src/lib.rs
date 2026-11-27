use quick_xml::events::Event;
use quick_xml::Reader;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptParamDef {
    pub name: String,
    pub required: bool,
    pub default_value: Option<String>,
    pub param_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MdDeclDef {
    pub name: String,
    pub kind: String, // "cue" | "library"
    pub purpose: Option<String>,
    pub params: Vec<ScriptParamDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MdScriptProvider {
    pub name: String,
    pub relative_path: String,
    pub declarations: Vec<MdDeclDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiOrderDef {
    pub id: String,
    pub params: Vec<ScriptParamDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiScriptDef {
    pub id: String,
    pub relative_path: String,
    pub order: Option<AiOrderDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JobsVocabulary {
    pub classes: BTreeSet<String>,
    pub orders: BTreeSet<String>,
    pub sizes: BTreeSet<String>,
    pub factions: BTreeSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WaresVocabulary {
    pub transports: BTreeSet<String>,
    pub groups: BTreeSet<String>,
    pub tags: BTreeSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScriptPropertyEntry {
    pub name: String,
    pub parent: Option<String>,
    pub dynamic: bool,
    pub wildcard: bool,
    pub heads: BTreeSet<String>,
    pub full_names: BTreeSet<String>,
    pub bare_ok: BTreeSet<String>,
    pub prop_results: BTreeMap<String, String>,
    pub continuations: BTreeMap<String, BTreeSet<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScriptPropertyCatalog {
    pub loaded: bool,
    pub keywords: BTreeMap<String, ScriptPropertyEntry>,
    pub datatypes: BTreeMap<String, ScriptPropertyEntry>,
    pub union_heads: BTreeSet<String>,
    pub bare_ok: BTreeSet<String>,
    pub continuations: BTreeMap<String, BTreeSet<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CorpusIndex {
    pub version: u32,
    pub root: String,
    pub signature: String,
    pub file_count: usize,
    pub factions: BTreeSet<String>,
    pub wares: BTreeSet<String>,
    pub macros: BTreeSet<String>,
    pub sectors: BTreeSet<String>,
    pub ai_scripts: BTreeMap<String, AiScriptDef>,
    pub orders: BTreeMap<String, AiOrderDef>,
    pub md_providers: BTreeMap<String, Option<MdScriptProvider>>,
    pub jobs_vocabulary: JobsVocabulary,
    pub wares_vocabulary: WaresVocabulary,
    pub script_properties: ScriptPropertyCatalog,
    pub schema_files: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RefFileKind {
    Factions,
    Wares,
    Jobs,
    ScriptProperties,
    MacroIndex,
    Map,
    AiScript,
    MdScript,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
struct DiscoveredRefFile {
    abs_path: PathBuf,
    rel_path: String,
    source: String,
    kind: RefFileKind,
    size: u64,
    mtime_ms: u64,
}

fn walk_xml_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else {
        return;
    };
    for item in rd.flatten() {
        let p = item.path();
        let Ok(meta) = fs::symlink_metadata(&p) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.file_type().is_dir() {
            walk_xml_files(&p, out);
        } else if meta.file_type().is_file() {
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
            if ext.eq_ignore_ascii_case("xml") {
                out.push(p);
            }
        }
    }
}

fn file_mtime_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn normalize_rel(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .unwrap_or(abs)
        .to_string_lossy()
        .replace('\\', "/")
}

fn discover_reference_files(root: &Path) -> (Vec<DiscoveredRefFile>, BTreeMap<String, String>) {
    let mut files = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut schema_files: BTreeMap<String, String> = BTreeMap::new();

    let mut add_file = |abs: PathBuf, source: &str, kind: RefFileKind| {
        let key = abs.to_string_lossy().to_ascii_lowercase();
        if !seen.insert(key) {
            return;
        }
        let Ok(meta) = fs::symlink_metadata(&abs) else {
            return;
        };
        if meta.file_type().is_symlink() || !meta.file_type().is_file() {
            return;
        }
        files.push(DiscoveredRefFile {
            rel_path: normalize_rel(root, &abs),
            abs_path: abs,
            source: source.to_string(),
            kind,
            size: meta.len(),
            mtime_ms: file_mtime_ms(&meta),
        });
    };

    let collect_schemas = |dir: &Path, schemas: &mut BTreeMap<String, String>| {
        let Ok(rd) = fs::read_dir(dir) else {
            return;
        };
        for item in rd.flatten() {
            let p = item.path();
            if p.is_file()
                && p.extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|e| e.eq_ignore_ascii_case("xsd"))
            {
                if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    schemas
                        .entry(name.to_ascii_lowercase())
                        .or_insert_with(|| p.to_string_lossy().into_owned());
                }
            }
        }
    };
    collect_schemas(&root.join("libraries"), &mut schema_files);
    collect_schemas(&root.join("md"), &mut schema_files);
    collect_schemas(&root.join("aiscripts"), &mut schema_files);
    collect_schemas(&root.join("cutscenes"), &mut schema_files);
    collect_schemas(&root.join("t"), &mut schema_files);
    collect_schemas(&root.join("maps"), &mut schema_files);
    collect_schemas(&root.join("ui").join("core"), &mut schema_files);
    collect_schemas(root, &mut schema_files);

    let mut add_source = |base: &Path, source: &str| {
        add_file(
            base.join("libraries").join("factions.xml"),
            source,
            RefFileKind::Factions,
        );
        add_file(
            base.join("libraries").join("wares.xml"),
            source,
            RefFileKind::Wares,
        );
        add_file(
            base.join("libraries").join("jobs.xml"),
            source,
            RefFileKind::Jobs,
        );
        add_file(
            base.join("libraries").join("scriptproperties.xml"),
            source,
            RefFileKind::ScriptProperties,
        );
        add_file(
            base.join("index").join("macros.xml"),
            source,
            RefFileKind::MacroIndex,
        );
        for (sub, kind) in [
            ("maps", RefFileKind::Map),
            ("aiscripts", RefFileKind::AiScript),
            ("md", RefFileKind::MdScript),
        ] {
            let sub_dir = base.join(sub);
            if sub_dir.is_dir() {
                let mut found = Vec::new();
                walk_xml_files(&sub_dir, &mut found);
                found.sort();
                for p in found {
                    add_file(p, source, kind);
                }
            }
        }
    };

    add_source(root, "base");

    let ext_root = root.join("extensions");
    if let Ok(rd) = fs::read_dir(&ext_root) {
        let mut dlcs: Vec<(String, PathBuf)> = rd
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                let p = e.path();
                if name.to_ascii_lowercase().starts_with("ego_dlc_") && p.is_dir() {
                    Some((name, p))
                } else {
                    None
                }
            })
            .collect();
        dlcs.sort_by(|a, b| a.0.cmp(&b.0));
        for (name, p) in dlcs {
            add_source(&p, &name.to_ascii_lowercase());
        }
    }

    (files, schema_files)
}

fn compute_signature(root: &Path, files: &[DiscoveredRefFile], schemas: &BTreeMap<String, String>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(root.to_string_lossy().as_bytes());
    hasher.update(b"\n");
    for f in files {
        hasher.update(format!("{}|{}|{}\n", f.rel_path, f.size, f.mtime_ms).as_bytes());
    }
    for (k, v) in schemas {
        let size = fs::metadata(v).map(|m| m.len()).unwrap_or(0);
        hasher.update(format!("schema:{k}:{size}\n").as_bytes());
    }
    hex::encode(hasher.finalize())
}

#[derive(Default)]
struct PerFileExtract {
    factions: Vec<String>,
    wares: Vec<(String, Option<String>, Option<String>, Vec<String>)>,
    macros: Vec<String>,
    sectors: Vec<String>,
    job_classes: Vec<String>,
    job_orders: Vec<String>,
    job_sizes: Vec<String>,
    ai_script: Option<AiScriptDef>,
    md_script: Option<(String, MdScriptProvider)>,
    script_properties_xml: Option<String>,
}

fn attr_val(e: &quick_xml::events::BytesStart<'_>, name: &[u8]) -> Option<String> {
    for a in e.attributes().flatten() {
        if a.key.as_ref().eq_ignore_ascii_case(name) {
            return a.unescape_value().ok().map(|v| v.into_owned());
        }
    }
    None
}

fn extract_one_file(file: &DiscoveredRefFile) -> PerFileExtract {
    let mut out = PerFileExtract::default();
    let Ok(bytes) = fs::read(&file.abs_path) else {
        return out;
    };
    let text = String::from_utf8_lossy(&bytes);
    let clean = text.strip_prefix('\u{feff}').unwrap_or(&text);

    if file.kind == RefFileKind::ScriptProperties {
        out.script_properties_xml = Some(clean.to_string());
        return out;
    }

    let mut reader = Reader::from_str(clean);
    reader.config_mut().trim_text(true);

    let mut ai_id: Option<String> = None;
    let mut order_id: Option<String> = None;
    let mut order_params: Vec<ScriptParamDef> = Vec::new();
    let mut in_order = false;
    let mut in_order_params = false;

    let mut md_name: Option<String> = None;
    let mut md_decls: Vec<MdDeclDef> = Vec::new();
    let mut cur_md_decl: Option<(String, String, Option<String>, Vec<ScriptParamDef>)> = None;
    let mut in_decl_params = false;

    loop {
        let ev = reader.read_event();
        match ev {
            Ok(Event::Start(e)) => {
                let tag_bytes = e.name();
                let tag = String::from_utf8_lossy(tag_bytes.as_ref()).to_ascii_lowercase();
                match (file.kind, tag.as_str()) {
                    (RefFileKind::Factions, "faction") => {
                        if let Some(id) = attr_val(&e, b"id") {
                            let id_lc = id.trim().to_ascii_lowercase();
                            if !id_lc.is_empty() {
                                out.factions.push(id_lc);
                            }
                        }
                    }
                    (RefFileKind::Wares, "ware") => {
                        if let Some(id) = attr_val(&e, b"id") {
                            let id_lc = id.trim().to_ascii_lowercase();
                            if !id_lc.is_empty() {
                                let t = attr_val(&e, b"transport");
                                let g = attr_val(&e, b"group");
                                let tags = attr_val(&e, b"tags")
                                    .unwrap_or_default()
                                    .split_whitespace()
                                    .map(|s| s.to_string())
                                    .collect();
                                out.wares.push((id_lc, t, g, tags));
                            }
                        }
                    }
                    (RefFileKind::Jobs, "location") => {
                        if let Some(c) = attr_val(&e, b"class") {
                            out.job_classes.push(c);
                        }
                    }
                    (RefFileKind::Jobs, "order") => {
                        if let Some(o) = attr_val(&e, b"order") {
                            out.job_orders.push(o);
                        }
                    }
                    (RefFileKind::Jobs, "select") => {
                        if let Some(s) = attr_val(&e, b"size") {
                            out.job_sizes.push(s);
                        }
                    }
                    (RefFileKind::MacroIndex, "entry") => {
                        if let Some(name) = attr_val(&e, b"name") {
                            let n_lc = name.trim().to_ascii_lowercase();
                            if !n_lc.is_empty() {
                                out.macros.push(n_lc);
                            }
                        }
                    }
                    (RefFileKind::Map, "macro") => {
                        if let Some(name) = attr_val(&e, b"name") {
                            let n_lc = name.trim().to_ascii_lowercase();
                            if !n_lc.is_empty() {
                                out.macros.push(n_lc.clone());
                                if attr_val(&e, b"class")
                                    .is_some_and(|c| c.eq_ignore_ascii_case("sector"))
                                {
                                    out.sectors.push(n_lc);
                                }
                            }
                        }
                    }
                    (RefFileKind::AiScript, "aiscript") => {
                        if ai_id.is_none() {
                            if let Some(n) = attr_val(&e, b"name") {
                                ai_id = Some(n.trim().to_ascii_lowercase());
                            }
                        }
                    }
                    (RefFileKind::AiScript, "order") => {
                        if order_id.is_none() {
                            if let Some(id) = attr_val(&e, b"id") {
                                order_id = Some(id.trim().to_string());
                                in_order = true;
                            }
                        }
                    }
                    (RefFileKind::AiScript, "params") if in_order => {
                        in_order_params = true;
                    }
                    (RefFileKind::AiScript, "param") if in_order && in_order_params => {
                        if let Some(pname) = attr_val(&e, b"name") {
                            let def = attr_val(&e, b"default");
                            let req_attr = attr_val(&e, b"required");
                            let required = match req_attr.as_deref() {
                                Some(v) => matches!(v.trim(), "true" | "1"),
                                None => def.is_none(),
                            };
                            order_params.push(ScriptParamDef {
                                name: pname,
                                required,
                                default_value: def,
                                param_type: attr_val(&e, b"type"),
                            });
                        }
                    }
                    (RefFileKind::MdScript, "mdscript") => {
                        if md_name.is_none() {
                            if let Some(n) = attr_val(&e, b"name") {
                                md_name = Some(n.trim().to_string());
                            }
                        }
                    }
                    (RefFileKind::MdScript, "cue" | "library") => {
                        if let Some(n) = attr_val(&e, b"name") {
                            let purpose = attr_val(&e, b"purpose");
                            if cur_md_decl.is_none() {
                                cur_md_decl = Some((n, tag, purpose, Vec::new()));
                            } else {
                                md_decls.push(MdDeclDef {
                                    name: n,
                                    kind: tag,
                                    purpose,
                                    params: Vec::new(),
                                });
                            }
                        }
                    }
                    (RefFileKind::MdScript, "params") if cur_md_decl.is_some() => {
                        in_decl_params = true;
                    }
                    (RefFileKind::MdScript, "param") if in_decl_params => {
                        if let Some((_, _, _, ref mut params)) = cur_md_decl {
                            if let Some(pname) = attr_val(&e, b"name") {
                                let def = attr_val(&e, b"default");
                                let req_attr = attr_val(&e, b"required");
                                let required = match req_attr.as_deref() {
                                    Some(v) => matches!(v.trim(), "true" | "1"),
                                    None => def.is_none(),
                                };
                                params.push(ScriptParamDef {
                                    name: pname,
                                    required,
                                    default_value: def,
                                    param_type: attr_val(&e, b"type"),
                                });
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(e)) => {
                let tag_bytes = e.name();
                let tag = String::from_utf8_lossy(tag_bytes.as_ref()).to_ascii_lowercase();
                match (file.kind, tag.as_str()) {
                    (RefFileKind::Factions, "faction") => {
                        if let Some(id) = attr_val(&e, b"id") {
                            let id_lc = id.trim().to_ascii_lowercase();
                            if !id_lc.is_empty() {
                                out.factions.push(id_lc);
                            }
                        }
                    }
                    (RefFileKind::Wares, "ware") => {
                        if let Some(id) = attr_val(&e, b"id") {
                            let id_lc = id.trim().to_ascii_lowercase();
                            if !id_lc.is_empty() {
                                let t = attr_val(&e, b"transport");
                                let g = attr_val(&e, b"group");
                                let tags = attr_val(&e, b"tags")
                                    .unwrap_or_default()
                                    .split_whitespace()
                                    .map(|s| s.to_string())
                                    .collect();
                                out.wares.push((id_lc, t, g, tags));
                            }
                        }
                    }
                    (RefFileKind::Jobs, "location") => {
                        if let Some(c) = attr_val(&e, b"class") {
                            out.job_classes.push(c);
                        }
                    }
                    (RefFileKind::Jobs, "order") => {
                        if let Some(o) = attr_val(&e, b"order") {
                            out.job_orders.push(o);
                        }
                    }
                    (RefFileKind::Jobs, "select") => {
                        if let Some(s) = attr_val(&e, b"size") {
                            out.job_sizes.push(s);
                        }
                    }
                    (RefFileKind::MacroIndex, "entry") => {
                        if let Some(name) = attr_val(&e, b"name") {
                            let n_lc = name.trim().to_ascii_lowercase();
                            if !n_lc.is_empty() {
                                out.macros.push(n_lc);
                            }
                        }
                    }
                    (RefFileKind::Map, "macro") => {
                        if let Some(name) = attr_val(&e, b"name") {
                            let n_lc = name.trim().to_ascii_lowercase();
                            if !n_lc.is_empty() {
                                out.macros.push(n_lc.clone());
                                if attr_val(&e, b"class")
                                    .is_some_and(|c| c.eq_ignore_ascii_case("sector"))
                                {
                                    out.sectors.push(n_lc);
                                }
                            }
                        }
                    }
                    (RefFileKind::AiScript, "order") if order_id.is_none() => {
                        if let Some(id) = attr_val(&e, b"id") {
                            order_id = Some(id.trim().to_string());
                        }
                    }
                    (RefFileKind::AiScript, "param") if in_order && in_order_params => {
                        if let Some(pname) = attr_val(&e, b"name") {
                            let def = attr_val(&e, b"default");
                            let req_attr = attr_val(&e, b"required");
                            let required = match req_attr.as_deref() {
                                Some(v) => matches!(v.trim(), "true" | "1"),
                                None => def.is_none(),
                            };
                            order_params.push(ScriptParamDef {
                                name: pname,
                                required,
                                default_value: def,
                                param_type: attr_val(&e, b"type"),
                            });
                        }
                    }
                    (RefFileKind::MdScript, "cue" | "library") => {
                        if let Some(n) = attr_val(&e, b"name") {
                            md_decls.push(MdDeclDef {
                                name: n,
                                kind: tag,
                                purpose: attr_val(&e, b"purpose"),
                                params: Vec::new(),
                            });
                        }
                    }
                    (RefFileKind::MdScript, "param") if in_decl_params => {
                        if let Some((_, _, _, ref mut params)) = cur_md_decl {
                            if let Some(pname) = attr_val(&e, b"name") {
                                let def = attr_val(&e, b"default");
                                let req_attr = attr_val(&e, b"required");
                                let required = match req_attr.as_deref() {
                                    Some(v) => matches!(v.trim(), "true" | "1"),
                                    None => def.is_none(),
                                };
                                params.push(ScriptParamDef {
                                    name: pname,
                                    required,
                                    default_value: def,
                                    param_type: attr_val(&e, b"type"),
                                });
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_ascii_lowercase();
                if file.kind == RefFileKind::AiScript {
                    if tag == "params" {
                        in_order_params = false;
                    } else if tag == "order" {
                        in_order = false;
                        in_order_params = false;
                    }
                } else if file.kind == RefFileKind::MdScript {
                    if tag == "params" {
                        in_decl_params = false;
                    } else if tag == "cue" || tag == "library" {
                        in_decl_params = false;
                        if let Some((n, k, purpose, params)) = cur_md_decl.take() {
                            md_decls.push(MdDeclDef {
                                name: n,
                                kind: k,
                                purpose,
                                params,
                            });
                        }
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }

    if file.kind == RefFileKind::AiScript {
        let stem_id = file
            .abs_path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase());
        if let Some(id) = ai_id.or(stem_id) {
            out.ai_script = Some(AiScriptDef {
                id,
                relative_path: file.rel_path.clone(),
                order: order_id.map(|oid| AiOrderDef {
                    id: oid,
                    params: order_params,
                }),
            });
        }
    } else if file.kind == RefFileKind::MdScript {
        if let Some(name) = md_name {
            let key = name.to_ascii_lowercase();
            out.md_script = Some((
                key,
                MdScriptProvider {
                    name,
                    relative_path: file.rel_path.clone(),
                    declarations: md_decls,
                },
            ));
        }
    }

    out
}

fn property_head(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.starts_with("{$") {
        return String::new();
    }
    let before_brace = trimmed.split('{').next().unwrap_or(trimmed);
    let head = before_brace.split('.').next().unwrap_or(before_brace);
    head.trim().to_ascii_lowercase()
}

fn literal_segments(name: &str) -> Vec<String> {
    name.split('.')
        .map(str::trim)
        .filter(|s| !s.is_empty() && !s.starts_with('{'))
        .map(|s| s.to_ascii_lowercase())
        .collect()
}

pub fn parse_script_properties_xml(xml_sources: &[&str], out: &mut ScriptPropertyCatalog) {
    let mut current: Option<(bool, ScriptPropertyEntry)> = None;

    for xml in xml_sources {
        let clean = xml.strip_prefix('\u{feff}').unwrap_or(xml);
        let mut reader = Reader::from_str(clean);
        reader.config_mut().trim_text(true);
        loop {
            match reader.read_event() {
                Ok(Event::Start(e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_ascii_lowercase();
                    match tag.as_str() {
                        "keyword" | "datatype" => {
                            if let Some(name) = attr_val(&e, b"name") {
                                let key = name.trim().to_ascii_lowercase();
                                let is_kw = tag == "keyword";
                                let existing = if is_kw {
                                    out.keywords.remove(&key)
                                } else {
                                    out.datatypes.remove(&key)
                                };
                                let mut entry = existing.unwrap_or_else(|| ScriptPropertyEntry {
                                    name: key.clone(),
                                    ..Default::default()
                                });
                                if let Some(parent) = attr_val(&e, b"type") {
                                    let p_lc = parent.trim().to_ascii_lowercase();
                                    if !p_lc.is_empty() {
                                        entry.parent = Some(p_lc);
                                    }
                                }
                                current = Some((is_kw, entry));
                            }
                        }
                        "import" => {
                            if let Some((_, ref mut entry)) = current {
                                entry.dynamic = true;
                            }
                        }
                        "property" => {
                            if let Some((_, ref mut entry)) = current {
                                record_property(entry, &e, out);
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Empty(e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_ascii_lowercase();
                    match tag.as_str() {
                        "import" => {
                            if let Some((_, ref mut entry)) = current {
                                entry.dynamic = true;
                            }
                        }
                        "property" => {
                            if let Some((_, ref mut entry)) = current {
                                record_property(entry, &e, out);
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::End(e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_ascii_lowercase();
                    if (tag == "keyword" || tag == "datatype") && current.is_some() {
                        if let Some((is_kw, entry)) = current.take() {
                            if is_kw {
                                out.keywords.insert(entry.name.clone(), entry);
                            } else {
                                out.datatypes.insert(entry.name.clone(), entry);
                            }
                        }
                    }
                }
                Ok(Event::Eof) | Err(_) => break,
                _ => {}
            }
        }
    }

    if !out.keywords.is_empty() || !out.datatypes.is_empty() {
        out.loaded = true;
    }
}

fn record_property(
    entry: &mut ScriptPropertyEntry,
    e: &quick_xml::events::BytesStart<'_>,
    catalog: &mut ScriptPropertyCatalog,
) {
    let Some(raw_name) = attr_val(e, b"name") else {
        return;
    };
    let pname = raw_name.trim().to_ascii_lowercase();
    if pname.is_empty() {
        return;
    }
    entry.full_names.insert(pname.clone());
    if let Some(res_type) = attr_val(e, b"type") {
        let t_lc = res_type.trim().to_ascii_lowercase();
        if !t_lc.is_empty() {
            entry.prop_results.insert(pname.clone(), t_lc);
        }
    }
    let head = property_head(&pname);
    if head.is_empty() {
        entry.wildcard = true;
        return;
    }
    entry.heads.insert(head.clone());
    catalog.union_heads.insert(head.clone());

    let parts: Vec<&str> = pname.split('.').collect();
    if parts.len() == 1 || (!pname.contains('{') && parts.len() >= 1) {
        if !parts[0].contains('{') && parts.len() == 1 {
            entry.bare_ok.insert(head.clone());
            catalog.bare_ok.insert(head.clone());
        } else {
            // Multi-part property (e.g. `controlentity.{$controlpost}`) or `isclass.ship`
            if !pname.contains('{') {
                entry.bare_ok.insert(head.clone());
                catalog.bare_ok.insert(head.clone());
            }
            for seg in literal_segments(&pname) {
                catalog.union_heads.insert(seg);
            }
        }
    }
    if parts.len() > 1 {
        let cont = entry.continuations.entry(head.clone()).or_default();
        let glob_cont = catalog.continuations.entry(head).or_default();
        let second = parts[1].trim();
        if second.starts_with("{$") {
            cont.insert("*".to_string());
            glob_cont.insert("*".to_string());
        } else if !second.is_empty() {
            let sec_lc = second.to_ascii_lowercase();
            cont.insert(sec_lc.clone());
            glob_cont.insert(sec_lc);
        }
    }
}

pub fn load_or_build_corpus(
    root: &Path,
    cache_path: Option<&Path>,
) -> Result<CorpusIndex, String> {
    if !root.is_dir() {
        return Err(format!(
            "Unpacked X4 corpus directory does not exist: {}",
            root.display()
        ));
    }
    let canon_root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let (files, schema_files) = discover_reference_files(&canon_root);
    let signature = compute_signature(&canon_root, &files, &schema_files);

    if let Some(cp) = cache_path {
        if cp.is_file() {
            if let Ok(bytes) = fs::read(cp) {
                if let Ok(cached) = serde_json::from_slice::<CorpusIndex>(&bytes) {
                    if cached.version == 1 && cached.signature == signature {
                        return Ok(cached);
                    }
                }
            }
        }
    }

    let extracted: Vec<PerFileExtract> = files.par_iter().map(extract_one_file).collect();

    let mut factions = BTreeSet::new();
    let mut wares = BTreeSet::new();
    let mut macros = BTreeSet::new();
    let mut sectors = BTreeSet::new();
    let mut ai_scripts = BTreeMap::new();
    let mut orders = BTreeMap::new();
    let mut md_providers: BTreeMap<String, Option<MdScriptProvider>> = BTreeMap::new();
    let mut jobs_vocab = JobsVocabulary {
        classes: BTreeSet::new(),
        orders: BTreeSet::new(),
        sizes: BTreeSet::new(),
        factions: BTreeSet::new(),
    };
    let mut wares_vocab = WaresVocabulary {
        transports: BTreeSet::new(),
        groups: BTreeSet::new(),
        tags: BTreeSet::new(),
    };
    let mut sp_xmls: Vec<String> = Vec::new();
    let mut claimed_md: HashMap<String, String> = HashMap::new();

    for item in extracted {
        for f in item.factions {
            factions.insert(format!("faction.{f}"));
            factions.insert(f.clone());
            jobs_vocab.factions.insert(f);
        }
        for (id, t, g, tags) in item.wares {
            wares.insert(id);
            if let Some(tr) = t {
                wares_vocab.transports.insert(tr);
            }
            if let Some(gr) = g {
                wares_vocab.groups.insert(gr);
            }
            for tag in tags {
                wares_vocab.tags.insert(tag);
            }
        }
        for m in item.macros {
            macros.insert(m);
        }
        for s in item.sectors {
            sectors.insert(s);
        }
        for c in item.job_classes {
            jobs_vocab.classes.insert(c);
        }
        for o in item.job_orders {
            jobs_vocab.orders.insert(o);
        }
        for s in item.job_sizes {
            jobs_vocab.sizes.insert(s);
        }
        if let Some(ai) = item.ai_script {
            if let Some(ref ord) = ai.order {
                orders.entry(ord.id.to_ascii_lowercase()).or_insert_with(|| ord.clone());
            }
            ai_scripts.entry(ai.id.clone()).or_insert(ai);
        }
        if let Some((key, prov)) = item.md_script {
            let norm_rel = prov.relative_path.to_ascii_lowercase();
            // Strip leading `extensions/ego_dlc_*/` for DLC override comparison.
            let stripped = norm_rel
                .strip_prefix("extensions/")
                .and_then(|rest| rest.split_once('/').map(|(_, tail)| tail.to_string()))
                .unwrap_or_else(|| norm_rel.clone());
            match claimed_md.get(&key) {
                Some(prev_rel) if prev_rel != &stripped => {
                    // Ambiguous identity collision across distinct logical paths -> None (matches TS catalog)
                    md_providers.insert(key, None);
                }
                _ => {
                    claimed_md.insert(key.clone(), stripped);
                    md_providers.insert(key, Some(prov));
                }
            }
        }
        if let Some(xml) = item.script_properties_xml {
            sp_xmls.push(xml);
        }
    }

    let mut script_properties = ScriptPropertyCatalog::default();
    let sp_refs: Vec<&str> = sp_xmls.iter().map(|s| s.as_str()).collect();
    parse_script_properties_xml(&sp_refs, &mut script_properties);

    let index = CorpusIndex {
        version: 1,
        root: canon_root.to_string_lossy().into_owned(),
        signature,
        file_count: files.len(),
        factions,
        wares,
        macros,
        sectors,
        ai_scripts,
        orders,
        md_providers,
        jobs_vocabulary: jobs_vocab,
        wares_vocabulary: wares_vocab,
        script_properties,
        schema_files,
    };

    if let Some(cp) = cache_path {
        if let Some(parent) = cp.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let tmp = cp.with_extension(format!("tmp-{}", std::process::id()));
        if let Ok(json) = serde_json::to_vec(&index) {
            if fs::write(&tmp, json).is_ok() {
                let _ = fs::rename(&tmp, cp);
            }
        }
    }

    Ok(index)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::SystemTime;

    #[test]
    fn scans_mini_corpus_and_reuses_cache() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("x4_corpus_test_{nanos}"));
        fs::create_dir_all(dir.join("libraries")).unwrap();
        fs::create_dir_all(dir.join("md")).unwrap();
        fs::create_dir_all(dir.join("aiscripts")).unwrap();
        fs::create_dir_all(dir.join("index")).unwrap();
        fs::create_dir_all(dir.join("maps/xu_ep2_universe")).unwrap();

        fs::write(
            dir.join("libraries/factions.xml"),
            r#"<factions><faction id="argon" name="Argon"/></factions>"#,
        )
        .unwrap();
        fs::write(
            dir.join("libraries/wares.xml"),
            r#"<wares><ware id="energycells" transport="container" group="energy" tags="economy"/></wares>"#,
        )
        .unwrap();
        fs::write(
            dir.join("libraries/jobs.xml"),
            r#"<jobs><job id="test_job"><location class="sector"/><orders><order order="Patrol"/></orders><ship><select size="ship_m"/></ship></job></jobs>"#,
        )
        .unwrap();
        fs::write(
            dir.join("libraries/scriptproperties.xml"),
            r#"<scriptproperties><datatype name="component"><property name="isclass.ship" type="boolean"/><property name="controlentity.{$controlpost}" type="entity"/></datatype><keyword name="player"><property name="money" type="money"/></keyword></scriptproperties>"#,
        )
        .unwrap();
        fs::write(
            dir.join("index/macros.xml"),
            r#"<index><entry name="ship_arg_l_destroyer_01_a_macro" value="x"/></index>"#,
        )
        .unwrap();
        fs::write(
            dir.join("maps/xu_ep2_universe/sectors.xml"),
            r#"<macros><macro name="cluster_01_sector001_macro" class="sector"/></macros>"#,
        )
        .unwrap();
        fs::write(
            dir.join("aiscripts/move.generic.xml"),
            r#"<aiscript name="move.generic"><order id="Patrol" category="combat"><params><param name="destination" required="true"/></params></order><actions/></aiscript>"#,
        )
        .unwrap();
        fs::write(
            dir.join("md/setup.xml"),
            r#"<mdscript name="Setup"><cues><library name="RunLib" purpose="run_actions"><params><param name="target"/></params><actions/></library></cues></mdscript>"#,
        )
        .unwrap();

        let cache = dir.join("cache.json");
        let idx1 = load_or_build_corpus(&dir, Some(&cache)).unwrap();
        assert!(idx1.factions.contains("argon"));
        assert!(idx1.factions.contains("faction.argon"));
        assert!(idx1.wares.contains("energycells"));
        assert!(idx1.macros.contains("ship_arg_l_destroyer_01_a_macro"));
        assert!(idx1.sectors.contains("cluster_01_sector001_macro"));
        assert!(idx1.ai_scripts.contains_key("move.generic"));
        assert!(idx1.orders.contains_key("patrol"));
        assert!(idx1.md_providers.contains_key("setup"));
        assert!(idx1.script_properties.loaded);
        assert!(idx1.script_properties.union_heads.contains("money"));

        let idx2 = load_or_build_corpus(&dir, Some(&cache)).unwrap();
        assert_eq!(idx1.signature, idx2.signature);
        assert_eq!(idx1.file_count, idx2.file_count);

        let _ = fs::remove_dir_all(&dir);
    }
}
