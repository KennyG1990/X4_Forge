use crate::xml_wellformed::LineIndex;
use crate::{Diagnostic, Severity};
use regex::Regex;
use roxmltree::Document;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::sync::OnceLock;
use x4_corpus::CorpusIndex;

#[derive(Debug, Clone)]
pub struct TextRefHit {
    pub page: String,
    pub id: String,
    pub file_path: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Default)]
pub struct ContentFileSummary {
    pub mod_factions: BTreeSet<String>,
    pub mod_wares: BTreeSet<String>,
    pub t_entries: Vec<(String, String, String)>, // (lang_code, page_id, t_id)
    pub text_refs: Vec<TextRefHit>,
    pub diagnostics: Vec<Diagnostic>,
}

fn text_ref_brace_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\{(\d+)\s*,\s*(\d+)\}").unwrap())
}

fn lang_from_t_path(rel_path: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)-L(\d+)\.xml$").unwrap());
    if let Some(cap) = re.captures(rel_path) {
        cap[1].to_string()
    } else {
        "default".to_string()
    }
}

pub fn analyze_content_xml(
    rel_path: &str,
    clean_text: &str,
    line_idx: &LineIndex,
    doc: &Document<'_>,
    corpus: &CorpusIndex,
) -> ContentFileSummary {
    let mut out = ContentFileSummary::default();
    let lower = rel_path.replace('\\', "/").to_ascii_lowercase();
    let root = doc.root_element();
    let root_tag = root.tag_name().name();

    let is_factions = lower == "libraries/factions.xml" || root_tag == "factions";
    let is_wares = lower == "libraries/wares.xml" || root_tag == "wares";
    let is_jobs = lower == "libraries/jobs.xml" || root_tag == "jobs";
    let is_t_file = lower.starts_with("t/") || root_tag == "language";

    // Collect mod-local faction/ware IDs + validate domain rules
    for d in root.descendants().filter(|n| n.is_element()) {
        let tag = d.tag_name().name();
        let (line, col) = line_idx.pos_clean(clean_text, d.range().start);

        if is_factions || (root_tag == "diff" && lower.contains("factions.xml")) {
            if tag == "faction" {
                if let Some(id) = d.attribute("id") {
                    out.mod_factions.insert(id.trim().to_ascii_lowercase());
                }
            } else if tag == "relation" {
                if let Some(rel_str) = d.attribute("relation") {
                    match rel_str.trim().parse::<f64>() {
                        Ok(v) if (-1.0..=1.0).contains(&v) => {}
                        _ => {
                            out.diagnostics.push(Diagnostic {
                                severity: Severity::Error,
                                code: "factions.relation_out_of_range".to_string(),
                                category: "factions".to_string(),
                                message: format!(
                                    "Faction relation value '{rel_str}' must be a float in [-1.0, 1.0]."
                                ),
                                file_path: Some(rel_path.to_string()),
                                line: Some(line),
                                column: Some(col),
                                source_ref: None,
                                suggestions: Vec::new(),
                            });
                        }
                    }
                }
            }
        }

        if is_wares || (root_tag == "diff" && lower.contains("wares.xml")) {
            if tag == "ware" {
                if let Some(id) = d.attribute("id") {
                    out.mod_wares.insert(id.trim().to_ascii_lowercase());
                }
                if !corpus.wares_vocabulary.transports.is_empty() {
                    if let Some(tr) = d.attribute("transport") {
                        let t = tr.trim().to_ascii_lowercase();
                        if !t.is_empty() && !corpus.wares_vocabulary.transports.contains(&t) {
                            out.diagnostics.push(Diagnostic {
                                severity: Severity::Warning,
                                code: "wares.unknown_transport".to_string(),
                                category: "wares".to_string(),
                                message: format!("Unknown ware transport '{tr}'."),
                                file_path: Some(rel_path.to_string()),
                                line: Some(line),
                                column: Some(col),
                                source_ref: None,
                                suggestions: Vec::new(),
                            });
                        }
                    }
                }
                if !corpus.wares_vocabulary.groups.is_empty() {
                    if let Some(gr) = d.attribute("group") {
                        let g = gr.trim().to_ascii_lowercase();
                        if !g.is_empty() && !corpus.wares_vocabulary.groups.contains(&g) {
                            out.diagnostics.push(Diagnostic {
                                severity: Severity::Warning,
                                code: "wares.unknown_group".to_string(),
                                category: "wares".to_string(),
                                message: format!("Unknown ware group '{gr}'."),
                                file_path: Some(rel_path.to_string()),
                                line: Some(line),
                                column: Some(col),
                                source_ref: None,
                                suggestions: Vec::new(),
                            });
                        }
                    }
                }
            } else if tag == "price" {
                if let (Some(mn), Some(av), Some(mx)) =
                    (d.attribute("min"), d.attribute("average"), d.attribute("max"))
                {
                    if let (Ok(a), Ok(b), Ok(c)) = (
                        mn.trim().parse::<i64>(),
                        av.trim().parse::<i64>(),
                        mx.trim().parse::<i64>(),
                    ) {
                        if a > b || b > c || a < 0 {
                            out.diagnostics.push(Diagnostic {
                                severity: Severity::Error,
                                code: "wares.invalid_price_range".to_string(),
                                category: "wares".to_string(),
                                message: format!(
                                    "Ware <price> requires 0 <= min ({a}) <= average ({b}) <= max ({c})."
                                ),
                                file_path: Some(rel_path.to_string()),
                                line: Some(line),
                                column: Some(col),
                                source_ref: None,
                                suggestions: Vec::new(),
                            });
                        }
                    }
                }
            }
        }

        if is_jobs || (root_tag == "diff" && lower.contains("jobs.xml")) {
            if tag == "order" && !corpus.orders.is_empty() {
                if let Some(ord) = d.attribute("order") {
                    let o = ord.trim().to_ascii_lowercase();
                    if !o.is_empty() && !corpus.orders.contains_key(&o) {
                        out.diagnostics.push(Diagnostic {
                            severity: Severity::Warning,
                            code: "jobs.unknown_order".to_string(),
                            category: "jobs".to_string(),
                            message: format!("Unknown job order '{ord}'."),
                            file_path: Some(rel_path.to_string()),
                            line: Some(line),
                            column: Some(col),
                            source_ref: None,
                            suggestions: Vec::new(),
                        });
                    }
                }
            } else if tag == "category" && !corpus.jobs_vocabulary.sizes.is_empty() {
                if let Some(sz) = d.attribute("size") {
                    let s = sz.trim().to_ascii_lowercase();
                    if !s.is_empty() && !corpus.jobs_vocabulary.sizes.contains(&s) {
                        out.diagnostics.push(Diagnostic {
                            severity: Severity::Warning,
                            code: "jobs.unknown_size".to_string(),
                            category: "jobs".to_string(),
                            message: format!("Unknown job ship size '{sz}'."),
                            file_path: Some(rel_path.to_string()),
                            line: Some(line),
                            column: Some(col),
                            source_ref: None,
                            suggestions: Vec::new(),
                        });
                    }
                }
            }
        }

        // Literal `faction.xyz` / `ware.xyz` / `macro.xyz` corpus checks in attributes
        if !corpus.factions.is_empty() {
            check_literal_entity_refs(rel_path, line, col, d, corpus, &mut out.diagnostics);
        }

        // Collect {page,id} text refs in non-comment attributes/text
        for attr in d.attributes() {
            if attr.name() == "comment" {
                continue;
            }
            for cap in text_ref_brace_re().captures_iter(attr.value()) {
                out.text_refs.push(TextRefHit {
                    page: cap[1].to_string(),
                    id: cap[2].to_string(),
                    file_path: rel_path.to_string(),
                    line,
                    column: col,
                });
            }
        }
    }

    if is_t_file {
        let lang = lang_from_t_path(rel_path);
        collect_t_file(rel_path, clean_text, line_idx, root, &lang, &mut out);
    }

    out
}

fn check_literal_entity_refs(
    rel_path: &str,
    line: u32,
    col: u32,
    node: roxmltree::Node<'_, '_>,
    corpus: &CorpusIndex,
    out: &mut Vec<Diagnostic>,
) {
    static FAC_RE: OnceLock<Regex> = OnceLock::new();
    static WARE_RE: OnceLock<Regex> = OnceLock::new();
    static MACRO_RE: OnceLock<Regex> = OnceLock::new();

    let fac_re = FAC_RE.get_or_init(|| Regex::new(r"\bfaction\.([A-Za-z_]\w*)").unwrap());
    let ware_re = WARE_RE.get_or_init(|| Regex::new(r"\bware\.([A-Za-z_]\w*)").unwrap());
    let macro_re = MACRO_RE.get_or_init(|| Regex::new(r"\bmacro\.([A-Za-z_]\w*)").unwrap());

    for attr in node.attributes() {
        if attr.name() == "comment" {
            continue;
        }
        let val = attr.value();
        for cap in fac_re.captures_iter(val) {
            let id = cap[1].to_ascii_lowercase();
            if !corpus.factions.contains(&id) {
                out.push(Diagnostic {
                    severity: Severity::Warning,
                    code: "reference.unknown_faction".to_string(),
                    category: "reference".to_string(),
                    message: format!("Faction reference 'faction.{}' is not in canonical X4 corpus.", &cap[1]),
                    file_path: Some(rel_path.to_string()),
                    line: Some(line),
                    column: Some(col),
                    source_ref: Some(format!("faction.{}", &cap[1])),
                    suggestions: Vec::new(),
                });
            }
        }
        for cap in ware_re.captures_iter(val) {
            let id = cap[1].to_ascii_lowercase();
            if !corpus.wares.contains(&id) {
                out.push(Diagnostic {
                    severity: Severity::Warning,
                    code: "reference.unknown_ware".to_string(),
                    category: "reference".to_string(),
                    message: format!("Ware reference 'ware.{}' is not in canonical X4 corpus.", &cap[1]),
                    file_path: Some(rel_path.to_string()),
                    line: Some(line),
                    column: Some(col),
                    source_ref: Some(format!("ware.{}", &cap[1])),
                    suggestions: Vec::new(),
                });
            }
        }
        for cap in macro_re.captures_iter(val) {
            let id = cap[1].to_ascii_lowercase();
            if !corpus.macros.contains(&id) {
                out.push(Diagnostic {
                    severity: Severity::Warning,
                    code: "reference.unknown_macro".to_string(),
                    category: "reference".to_string(),
                    message: format!("Macro reference 'macro.{}' is not in canonical X4 corpus.", &cap[1]),
                    file_path: Some(rel_path.to_string()),
                    line: Some(line),
                    column: Some(col),
                    source_ref: Some(format!("macro.{}", &cap[1])),
                    suggestions: Vec::new(),
                });
            }
        }
    }
}

fn collect_t_file(
    rel_path: &str,
    clean_text: &str,
    line_idx: &LineIndex,
    root: roxmltree::Node<'_, '_>,
    lang: &str,
    out: &mut ContentFileSummary,
) {
    let mut seen_per_page: HashSet<(String, String)> = HashSet::new();
    for page_node in root
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "page")
    {
        let Some(page_id) = page_node.attribute("id") else {
            continue;
        };
        let pid = page_id.trim().to_string();
        for t_node in page_node
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == "t")
        {
            let Some(tid_raw) = t_node.attribute("id") else {
                continue;
            };
            let tid = tid_raw.trim().to_string();
            if !seen_per_page.insert((pid.clone(), tid.clone())) {
                let (line, col) = line_idx.pos_clean(clean_text, t_node.range().start);
                out.diagnostics.push(Diagnostic {
                    severity: Severity::Warning,
                    code: "tfile.duplicate_id".to_string(),
                    category: "tfile".to_string(),
                    message: format!("Duplicate <t id=\"{tid}\"> inside <page id=\"{pid}\">."),
                    file_path: Some(rel_path.to_string()),
                    line: Some(line),
                    column: Some(col),
                    source_ref: Some(format!("{pid},{tid}")),
                    suggestions: Vec::new(),
                });
            }
            out.t_entries.push((lang.to_string(), pid.clone(), tid));
        }
    }
}

pub fn cross_check_content(
    summaries: &[ContentFileSummary],
    extra_text_refs: &[TextRefHit],
    out: &mut Vec<Diagnostic>,
) {
    // Map page -> set of entry ids (union across languages) & per-language entry counts
    let mut pages: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut page_by_lang: BTreeMap<(String, String), BTreeSet<String>> = BTreeMap::new();
    let mut all_langs: BTreeSet<String> = BTreeSet::new();

    for sum in summaries {
        for (lang, page, id) in &sum.t_entries {
            all_langs.insert(lang.clone());
            pages.entry(page.clone()).or_default().insert(id.clone());
            page_by_lang
                .entry((page.clone(), lang.clone()))
                .or_default()
                .insert(id.clone());
        }
    }

    // Dangling {page,id} targeting mod-owned page
    let mut seen_refs = HashSet::new();
    for hit in summaries
        .iter()
        .flat_map(|s| s.text_refs.iter())
        .chain(extra_text_refs.iter())
    {
        if let Some(ids) = pages.get(&hit.page) {
            if !ids.contains(&hit.id)
                && seen_refs.insert((
                    hit.file_path.clone(),
                    hit.line,
                    hit.column,
                    hit.page.clone(),
                    hit.id.clone(),
                ))
            {
                out.push(Diagnostic {
                    severity: Severity::Warning,
                    code: "tfile.dangling_text_ref".to_string(),
                    category: "tfile".to_string(),
                    message: format!(
                        "Text reference {{{},{}}} targets mod page {}, which lacks <t id=\"{}\">.",
                        hit.page, hit.id, hit.page, hit.id
                    ),
                    file_path: Some(hit.file_path.clone()),
                    line: Some(hit.line),
                    column: Some(hit.column),
                    source_ref: Some(format!("{},{}", hit.page, hit.id)),
                    suggestions: Vec::new(),
                });
            }
        }
    }

    // Cross-language completeness warning when multiple languages exist
    if all_langs.len() > 1 {
        for (page, all_ids) in &pages {
            let max = all_ids.len();
            for lang in &all_langs {
                let have = page_by_lang
                    .get(&(page.clone(), lang.clone()))
                    .map(|s| s.len())
                    .unwrap_or(0);
                if have > 0 && have < max {
                    out.push(Diagnostic {
                        severity: Severity::Info,
                        code: "tfile.incomplete_translation".to_string(),
                        category: "tfile".to_string(),
                        message: format!(
                            "Page {page}: language L{lang} defines {have} of {max} text entries."
                        ),
                        file_path: Some("t/".to_string()),
                        line: None,
                        column: None,
                        source_ref: Some(format!("{page}:L{lang}")),
                        suggestions: Vec::new(),
                    });
                }
            }
        }
    }
}
