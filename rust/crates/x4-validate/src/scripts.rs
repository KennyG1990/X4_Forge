use crate::xml_wellformed::LineIndex;
use crate::{Diagnostic, LoadedFile, Severity};
use regex::Regex;
use roxmltree::{Document, Node};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;
use x4_corpus::{CorpusIndex, MdDeclDef, ScriptParamDef};

#[derive(Debug, Clone)]
pub struct ModMdDecl {
    pub qname: String,
    pub short_name: String,
    pub kind: String, // "cue" | "library"
    pub purpose: Option<String>,
    pub params: BTreeMap<String, ScriptParamDef>,
    pub file_path: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone)]
pub struct PendingMdRef {
    pub ref_name: String,
    pub role: &'static str, // "signal" | "run_actions" | "include_actions" | "other_cue"
    pub caller_tag: String,
    pub args: Vec<(String, u32, u32)>,
    pub file_path: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone)]
pub struct PendingAiScriptCall {
    pub script_id: String,
    pub is_order: bool,
    pub args: Vec<(String, u32, u32)>,
    pub file_path: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Default)]
pub struct ScriptFileSummary {
    pub md_decls: Vec<ModMdDecl>,
    pub md_refs: Vec<PendingMdRef>,
    pub md_raise_lua_events: Vec<(String, String, u32, u32)>,
    pub ai_script_decls: Vec<(String, BTreeMap<String, ScriptParamDef>)>,
    pub ai_calls: Vec<PendingAiScriptCall>,
    pub diagnostics: Vec<Diagnostic>,
}

fn dollar_vars_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\$([A-Za-z_]\w*)").unwrap())
}

pub fn analyze_script_file(
    rel_path: &str,
    clean_text: &str,
    line_idx: &LineIndex,
    doc: &Document<'_>,
    corpus: &CorpusIndex,
) -> ScriptFileSummary {
    let mut summary = ScriptFileSummary::default();
    let lower = rel_path.replace('\\', "/").to_ascii_lowercase();
    let root = doc.root_element();
    let root_tag = root.tag_name().name();

    let is_md = lower.starts_with("md/") || root_tag == "mdscript";
    let is_ai = lower.starts_with("aiscripts/") || root_tag == "aiscript";

    // RFC 5261 <diff> selector check when unpacked corpus exists
    if root_tag == "diff" && !corpus.root.is_empty() {
        check_diff_selectors(rel_path, clean_text, line_idx, root, &corpus.root, &mut summary.diagnostics);
    }

    if is_md {
        let mdscript_name = root.attribute("name").map(str::to_string).unwrap_or_default();
        if root_tag == "mdscript" {
            collect_md_tree(
                rel_path,
                clean_text,
                line_idx,
                root,
                &mdscript_name,
                false,
                &mut summary,
            );
        } else if root_tag == "diff" {
            // Diff files under md/ still declare cues inside <add> or raise Lua events
            collect_md_tree(
                rel_path,
                clean_text,
                line_idx,
                root,
                &mdscript_name,
                false,
                &mut summary,
            );
        }
    }

    if is_ai {
        collect_ai_file(rel_path, clean_text, line_idx, root, &mut summary);
    }

    summary
}

fn collect_md_tree(
    rel_path: &str,
    clean_text: &str,
    line_idx: &LineIndex,
    node: Node<'_, '_>,
    mdscript_name: &str,
    inside_run_library: bool,
    out: &mut ScriptFileSummary,
) {
    for child in node.children().filter(|c| c.is_element()) {
        let tag = child.tag_name().name();
        let (line, col) = line_idx.pos_clean(clean_text, child.range().start);

        match tag {
            "cue" | "library" => {
                let kind = if tag == "library" { "library" } else { "cue" };
                let purpose = child.attribute("purpose").map(str::to_string);
                let is_run_lib = tag == "library" && purpose.as_deref() == Some("run_actions");
                if let Some(name) = child.attribute("name") {
                    let params = extract_declared_params(child);
                    let qname = if mdscript_name.is_empty() {
                        format!("md.{name}")
                    } else {
                        format!("md.{mdscript_name}.{name}")
                    };
                    out.md_decls.push(ModMdDecl {
                        qname,
                        short_name: name.to_string(),
                        kind: kind.to_string(),
                        purpose: purpose.clone(),
                        params: params.clone(),
                        file_path: rel_path.to_string(),
                        line,
                        column: col,
                    });
                    // Check pitfall lints per cue/library block
                    check_md_cue_pitfalls(rel_path, clean_text, line_idx, child, &params, is_run_lib, &mut out.diagnostics);
                }
                collect_md_tree(rel_path, clean_text, line_idx, child, mdscript_name, is_run_lib, out);
            }
            "raise_lua_event" => {
                if let Some(ev) = child.attribute("name") {
                    let clean_ev = strip_quotes(ev);
                    if !clean_ev.is_empty() && !clean_ev.starts_with('$') {
                        out.md_raise_lua_events.push((
                            clean_ev,
                            rel_path.to_string(),
                            line,
                            col,
                        ));
                    }
                }
                collect_md_tree(rel_path, clean_text, line_idx, child, mdscript_name, inside_run_library, out);
            }
            "signal_cue" | "signal_cue_instantly" | "reset_cue" | "cancel_cue" | "cue_is_active" | "event_cue_signalled" => {
                if let Some(cval) = child.attribute("cue") {
                    let ctrimmed = cval.trim();
                    if !is_dynamic_cue_ref(ctrimmed) {
                        let role = if matches!(tag, "signal_cue" | "signal_cue_instantly") {
                            "signal"
                        } else {
                            "other_cue"
                        };
                        let args = extract_call_args(child, clean_text, line_idx);
                        out.md_refs.push(PendingMdRef {
                            ref_name: ctrimmed.to_string(),
                            role,
                            caller_tag: tag.to_string(),
                            args,
                            file_path: rel_path.to_string(),
                            line,
                            column: col,
                        });
                    }
                }
                collect_md_tree(rel_path, clean_text, line_idx, child, mdscript_name, inside_run_library, out);
            }
            "run_actions" | "include_actions" => {
                if let Some(rval) = child.attribute("ref") {
                    let rtrimmed = rval.trim();
                    if !is_dynamic_cue_ref(rtrimmed) {
                        let role = if tag == "run_actions" {
                            "run_actions"
                        } else {
                            "include_actions"
                        };
                        let args = extract_call_args(child, clean_text, line_idx);
                        out.md_refs.push(PendingMdRef {
                            ref_name: rtrimmed.to_string(),
                            role,
                            caller_tag: tag.to_string(),
                            args,
                            file_path: rel_path.to_string(),
                            line,
                            column: col,
                        });
                    }
                }
                collect_md_tree(rel_path, clean_text, line_idx, child, mdscript_name, inside_run_library, out);
            }
            "event_object_destroyed" => {
                if child.attribute("object").is_none() && child.attribute("group").is_none() {
                    out.diagnostics.push(Diagnostic {
                        severity: Severity::Error,
                        code: "md_pitfall.destroyed_event_source_required".to_string(),
                        category: "md_pitfall".to_string(),
                        message: "<event_object_destroyed> requires an 'object' or 'group' attribute."
                            .to_string(),
                        file_path: Some(rel_path.to_string()),
                        line: Some(line),
                        column: Some(col),
                        source_ref: None,
                        suggestions: Vec::new(),
                    });
                }
                collect_md_tree(rel_path, clean_text, line_idx, child, mdscript_name, inside_run_library, out);
            }
            "return" => {
                if !inside_run_library {
                    out.diagnostics.push(Diagnostic {
                        severity: Severity::Warning,
                        code: "md_pitfall.return_context".to_string(),
                        category: "md_pitfall".to_string(),
                        message: "<return> is only valid inside a <library purpose=\"run_actions\"> block."
                            .to_string(),
                        file_path: Some(rel_path.to_string()),
                        line: Some(line),
                        column: Some(col),
                        source_ref: None,
                        suggestions: Vec::new(),
                    });
                }
            }
            _ => {
                collect_md_tree(rel_path, clean_text, line_idx, child, mdscript_name, inside_run_library, out);
            }
        }
    }
}

fn check_md_cue_pitfalls(
    rel_path: &str,
    clean_text: &str,
    line_idx: &LineIndex,
    cue_node: Node<'_, '_>,
    params: &BTreeMap<String, ScriptParamDef>,
    _is_run_lib: bool,
    out: &mut Vec<Diagnostic>,
) {
    // One-shot UI listener trap: cue with <event_ui_triggered> lacks instantiate="true" and <reset_cue>
    let mut has_ui_event = false;
    let mut has_reset_self = false;
    if let Some(conds) = cue_node
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "conditions")
    {
        for d in conds.descendants().filter(|n| n.is_element()) {
            if d.tag_name().name() == "event_ui_triggered" {
                has_ui_event = true;
            }
        }
    }
    let cue_name = cue_node.attribute("name").unwrap_or("");
    let inst = cue_node.attribute("instantiate") == Some("true");
    if has_ui_event && !inst {
        for d in cue_node.descendants().filter(|n| n.is_element()) {
            if d.tag_name().name() == "reset_cue" {
                if let Some(c) = d.attribute("cue") {
                    if c == "this" || c == cue_name {
                        has_reset_self = true;
                    }
                }
            }
        }
        if !has_reset_self {
            let (line, col) = line_idx.pos_clean(clean_text, cue_node.range().start);
            out.push(Diagnostic {
                severity: Severity::Warning,
                code: "md_pitfall.ui_listener_one_shot".to_string(),
                category: "md_pitfall".to_string(),
                message: format!(
                    "UI cue '{cue_name}' listens to <event_ui_triggered> without instantiate=\"true\" or <reset_cue cue=\"this\"/> and will fire only once."
                ),
                file_path: Some(rel_path.to_string()),
                line: Some(line),
                column: Some(col),
                source_ref: None,
                suggestions: Vec::new(),
            });
        }
    }

    // Track variable writes & reads across cue scope (actions + conditions + delay)
    // Skip checking if cue contains <include_actions> or <run_actions>, which may assign vars externally
    let has_external_actions = cue_node.descendants().any(|n| {
        n.is_element() && matches!(n.tag_name().name(), "include_actions" | "run_actions")
    });
    if has_external_actions || cue_node.tag_name().name() == "library" {
        return;
    }

    let mut written: HashSet<String> = HashSet::new();
    for p in params.keys() {
        written.insert(p.clone());
    }
    let mut reads: Vec<(String, u32, u32)> = Vec::new();
    let mut removed_in_seq: HashSet<String> = HashSet::new();

    for d in cue_node.descendants().filter(|n| n.is_element()) {
        // Don't bleed nested child <cue> declarations into parent var scope
        if d != cue_node && matches!(d.tag_name().name(), "cue" | "library") {
            continue;
        }
        let dtag = d.tag_name().name();
        let (dline, dcol) = line_idx.pos_clean(clean_text, d.range().start);

        if dtag == "remove_value" {
            if let Some(n) = d.attribute("name") {
                for cap in dollar_vars_re().captures_iter(n) {
                    removed_in_seq.insert(cap[1].to_string());
                }
            }
        }

        let is_writer_tag = matches!(
            dtag,
            "set_value"
                | "create_list"
                | "create_group"
                | "append_to_list"
                | "add_to_group"
                | "do_all"
                | "do_for_each"
        ) || dtag.starts_with("create_")
            || dtag.starts_with("find_")
            || dtag.starts_with("get_")
            || dtag.starts_with("count_")
            || dtag.starts_with("evaluate_");

        for attr in d.attributes() {
            let an = attr.name();
            let av = attr.value();
            if !av.contains('$') {
                continue;
            }
            let is_write_attr = match an {
                "result" | "counter" | "object" | "group" | "list" | "table" => is_writer_tag || an == "result" || an == "counter",
                "name" => is_writer_tag && dtag != "remove_value",
                "valname" | "in" => dtag == "do_for_each",
                _ => false,
            };
            if is_write_attr && !av.contains('.') {
                for cap in dollar_vars_re().captures_iter(av) {
                    let vn = cap[1].to_string();
                    written.insert(vn.clone());
                    removed_in_seq.remove(&vn);
                }
            } else {
                for cap in dollar_vars_re().captures_iter(av) {
                    let vn = cap[1].to_string();
                    if removed_in_seq.contains(&vn) && !d.ancestors().any(|a| a.tag_name().name() == "do_if") {
                        out.push(Diagnostic {
                            severity: Severity::Warning,
                            code: "md_pitfall.variable_read_after_removal".to_string(),
                            category: "md_pitfall".to_string(),
                            message: format!("Variable '${vn}' is read on <{dtag}> after <remove_value>."),
                            file_path: Some(rel_path.to_string()),
                            line: Some(dline),
                            column: Some(dcol),
                            source_ref: None,
                            suggestions: Vec::new(),
                        });
                    }
                    // Also skip common event payload fields like event.* vs direct $var
                    reads.push((vn, dline, dcol));
                }
            }
        }
    }

    let mut reported: HashSet<String> = HashSet::new();
    for (var, line, col) in reads {
        if !written.contains(&var) && reported.insert(var.clone()) {
            out.push(Diagnostic {
                severity: Severity::Warning,
                code: "md_pitfall.variable_never_set".to_string(),
                category: "md_pitfall".to_string(),
                message: format!(
                    "Variable '${var}' is read in cue '{cue_name}' without being set in that scope."
                ),
                file_path: Some(rel_path.to_string()),
                line: Some(line),
                column: Some(col),
                source_ref: Some(format!("${var}")),
                suggestions: Vec::new(),
            });
        }
    }
}

fn collect_ai_file(
    rel_path: &str,
    clean_text: &str,
    line_idx: &LineIndex,
    root: Node<'_, '_>,
    out: &mut ScriptFileSummary,
) {
    if root.tag_name().name() == "aiscript" {
        if let Some(name) = root.attribute("name") {
            let params = extract_declared_params(root);
            out.ai_script_decls.push((name.to_ascii_lowercase(), params));
        }
    }
    for d in root.descendants().filter(|n| n.is_element()) {
        let tag = d.tag_name().name();
        let (line, col) = line_idx.pos_clean(clean_text, d.range().start);
        if tag == "run_script" || tag == "create_order" {
            let id_attr = if tag == "run_script" {
                d.attribute("name")
            } else {
                d.attribute("id")
            };
            if let Some(raw) = id_attr {
                let id = strip_quotes(raw);
                if !id.is_empty() && !id.starts_with('$') {
                    let args = extract_call_args(d, clean_text, line_idx);
                    out.ai_calls.push(PendingAiScriptCall {
                        script_id: id.to_ascii_lowercase(),
                        is_order: tag == "create_order",
                        args,
                        file_path: rel_path.to_string(),
                        line,
                        column: col,
                    });
                }
            }
        }
    }
}

fn extract_declared_params(node: Node<'_, '_>) -> BTreeMap<String, ScriptParamDef> {
    let mut map = BTreeMap::new();
    for ch in node.children().filter(|c| c.is_element()) {
        if ch.tag_name().name() == "params" {
            for p in ch
                .children()
                .filter(|c| c.is_element() && matches!(c.tag_name().name(), "param" | "input_param"))
            {
                if let Some(name) = p.attribute("name") {
                    let default_value = p.attribute("default").map(str::to_string);
                    let required = match p.attribute("required") {
                        Some("false") => false,
                        Some("true") => default_value.is_none(),
                        _ => default_value.is_none() && p.attribute("optional") != Some("true"),
                    };
                    map.insert(
                        name.to_string(),
                        ScriptParamDef {
                            name: name.to_string(),
                            required,
                            default_value,
                            param_type: p.attribute("type").map(str::to_string),
                        },
                    );
                }
            }
        }
    }
    map
}

fn extract_call_args(
    node: Node<'_, '_>,
    clean_text: &str,
    line_idx: &LineIndex,
) -> Vec<(String, u32, u32)> {
    let mut out = Vec::new();
    for ch in node.children().filter(|c| c.is_element()) {
        if matches!(ch.tag_name().name(), "param" | "input_param") {
            if let Some(n) = ch.attribute("name") {
                let (l, c) = line_idx.pos_clean(clean_text, ch.range().start);
                out.push((n.to_string(), l, c));
            }
        }
    }
    out
}

fn is_dynamic_cue_ref(v: &str) -> bool {
    v.is_empty()
        || v == "this"
        || v == "parent"
        || v.starts_with("this.")
        || v.starts_with("parent.")
        || v.starts_with('$')
        || v.starts_with('@')
        || v.contains('{')
        || v.starts_with('\'')
}

fn strip_quotes(v: &str) -> String {
    let t = v.trim();
    if t.len() >= 2 && t.starts_with('\'') && t.ends_with('\'') {
        t[1..t.len() - 1].to_string()
    } else {
        t.to_string()
    }
}

pub fn cross_check_scripts(
    summaries: &[ScriptFileSummary],
    corpus: &CorpusIndex,
    out: &mut Vec<Diagnostic>,
) {
    // 1. Build unified cue/library index (mod + unpacked corpus)
    let mut mod_by_qname: HashMap<String, Vec<&ModMdDecl>> = HashMap::new();
    let mut mod_by_short: HashMap<String, Vec<&ModMdDecl>> = HashMap::new();
    let mut mod_ai_scripts: HashMap<String, &BTreeMap<String, ScriptParamDef>> = HashMap::new();

    for sum in summaries {
        for decl in &sum.md_decls {
            mod_by_qname
                .entry(decl.qname.clone())
                .or_default()
                .push(decl);
            mod_by_short
                .entry(decl.short_name.clone())
                .or_default()
                .push(decl);
        }
        for (id, params) in &sum.ai_script_decls {
            mod_ai_scripts.insert(id.clone(), params);
        }
    }

    // Duplicate mod cue check
    for (qname, decls) in &mod_by_qname {
        if decls.len() > 1 {
            for dup in decls.iter().skip(1) {
                out.push(Diagnostic {
                    severity: Severity::Error,
                    code: "md.cue_duplicate_name".to_string(),
                    category: "cue_reference".to_string(),
                    message: format!("Duplicate cue/library name '{qname}'."),
                    file_path: Some(dup.file_path.clone()),
                    line: Some(dup.line),
                    column: Some(dup.column),
                    source_ref: Some(qname.clone()),
                    suggestions: Vec::new(),
                });
            }
        }
    }

    // Index corpus MD declarations for O(1) lookup
    let mut corpus_by_qname: HashMap<String, &MdDeclDef> = HashMap::new();
    let mut corpus_by_short: HashMap<String, &MdDeclDef> = HashMap::new();
    for (prov_name, opt) in &corpus.md_providers {
        if let Some(prov) = opt {
            for d in &prov.declarations {
                corpus_by_qname.insert(format!("md.{prov_name}.{}", d.name), d);
                corpus_by_short.entry(d.name.clone()).or_insert(d);
            }
        }
    }

    let corpus_has_md = !corpus.md_providers.is_empty();

    // Validate MD cue/library calls
    for sum in summaries {
        for call in &sum.md_refs {
            let short = call
                .ref_name
                .rsplit('.')
                .next()
                .unwrap_or(&call.ref_name)
                .to_string();

            let mod_hit = mod_by_qname
                .get(&call.ref_name)
                .and_then(|v| v.first().copied())
                .or_else(|| mod_by_short.get(&short).and_then(|v| v.first().copied()));

            if let Some(target) = mod_hit {
                check_md_role_and_params(
                    call,
                    target.kind.as_str(),
                    target.purpose.as_deref(),
                    &target.params,
                    out,
                );
                continue;
            }

            let corp_hit = corpus_by_qname
                .get(&call.ref_name)
                .copied()
                .or_else(|| {
                    if !call.ref_name.starts_with("md.") {
                        corpus_by_short.get(&short).copied()
                    } else {
                        None
                    }
                });

            if let Some(target) = corp_hit {
                let pmap: BTreeMap<String, ScriptParamDef> = target
                    .params
                    .iter()
                    .map(|p| (p.name.clone(), p.clone()))
                    .collect();
                check_md_role_and_params(
                    call,
                    target.kind.as_str(),
                    target.purpose.as_deref(),
                    &pmap,
                    out,
                );
                continue;
            }

            // Unresolved: flag mod-internal cues always; only flag external md.* if corpus was loaded or ref lacks dot
            if !call.ref_name.starts_with("md.") || corpus_has_md {
                let code = if call.role == "run_actions" || call.role == "include_actions" {
                    "md.cue_library_ref_unresolved"
                } else {
                    "cue.unresolved"
                };
                out.push(Diagnostic {
                    severity: Severity::Error,
                    code: code.to_string(),
                    category: "cue_reference".to_string(),
                    message: format!(
                        "Unresolved {} target '{}' referenced by <{}>.",
                        if call.role == "signal" || call.role == "other_cue" {
                            "cue"
                        } else {
                            "library"
                        },
                        call.ref_name,
                        call.caller_tag
                    ),
                    file_path: Some(call.file_path.clone()),
                    line: Some(call.line),
                    column: Some(call.column),
                    source_ref: Some(call.ref_name.clone()),
                    suggestions: Vec::new(),
                });
            }
        }

        // Validate AI script calls
        for aicall in &sum.ai_calls {
            if aicall.is_order {
                if !corpus.orders.is_empty() && !corpus.orders.contains_key(&aicall.script_id) {
                    out.push(Diagnostic {
                        severity: Severity::Warning,
                        code: "reference.unknown_order".to_string(),
                        category: "reference".to_string(),
                        message: format!("Unknown order id '{}'.", aicall.script_id),
                        file_path: Some(aicall.file_path.clone()),
                        line: Some(aicall.line),
                        column: Some(aicall.column),
                        source_ref: Some(aicall.script_id.clone()),
                        suggestions: Vec::new(),
                    });
                }
            } else if !mod_ai_scripts.contains_key(&aicall.script_id)
                && !corpus.ai_scripts.is_empty()
                && !corpus.ai_scripts.contains_key(&aicall.script_id)
            {
                out.push(Diagnostic {
                    severity: Severity::Warning,
                    code: "reference.unknown_aiscript".to_string(),
                    category: "reference".to_string(),
                    message: format!("Unknown aiscript '{}'.", aicall.script_id),
                    file_path: Some(aicall.file_path.clone()),
                    line: Some(aicall.line),
                    column: Some(aicall.column),
                    source_ref: Some(aicall.script_id.clone()),
                    suggestions: Vec::new(),
                });
            }
        }
    }
}

fn check_md_role_and_params(
    call: &PendingMdRef,
    kind: &str,
    purpose: Option<&str>,
    params: &BTreeMap<String, ScriptParamDef>,
    out: &mut Vec<Diagnostic>,
) {
    if call.role == "signal" && kind == "library" {
        out.push(Diagnostic {
            severity: Severity::Error,
            code: "md.signal_library".to_string(),
            category: "cue_reference".to_string(),
            message: format!(
                "<{}> targets <library> '{}'. Libraries must be called via <run_actions> or <include_actions>.",
                call.caller_tag, call.ref_name
            ),
            file_path: Some(call.file_path.clone()),
            line: Some(call.line),
            column: Some(call.column),
            source_ref: Some(call.ref_name.clone()),
            suggestions: Vec::new(),
        });
        return;
    }
    if call.role == "run_actions" && kind == "cue" {
        out.push(Diagnostic {
            severity: Severity::Warning,
            code: "md.run_actions_nonlibrary".to_string(),
            category: "cue_reference".to_string(),
            message: format!(
                "<run_actions> target '{}' resolves to a <cue>, not a <library>.",
                call.ref_name
            ),
            file_path: Some(call.file_path.clone()),
            line: Some(call.line),
            column: Some(call.column),
            source_ref: Some(call.ref_name.clone()),
            suggestions: Vec::new(),
        });
        return;
    }
    if call.role == "include_actions" && kind == "library" && purpose == Some("run_actions") {
        out.push(Diagnostic {
            severity: Severity::Warning,
            code: "md.include_actions_run_library".to_string(),
            category: "cue_reference".to_string(),
            message: format!(
                "<include_actions> targets '{}', which declares purpose=\"run_actions\" (use <run_actions>).",
                call.ref_name
            ),
            file_path: Some(call.file_path.clone()),
            line: Some(call.line),
            column: Some(call.column),
            source_ref: Some(call.ref_name.clone()),
            suggestions: Vec::new(),
        });
    }

    if kind == "library" && matches!(call.role, "run_actions" | "include_actions") {
        let is_run = call.role == "run_actions";
        let mut supplied = HashSet::new();
        for (aname, aline, acol) in &call.args {
            supplied.insert(aname.as_str());
            if !params.is_empty() && !params.contains_key(aname) {
                out.push(Diagnostic {
                    severity: if is_run { Severity::Warning } else { Severity::Error },
                    code: if is_run {
                        "md.run_actions_param_undeclared"
                    } else {
                        "md.cue_library_param_undeclared"
                    }
                    .to_string(),
                    category: "cue_reference".to_string(),
                    message: format!(
                        "<{}> passes undeclared parameter '{aname}' to library '{}'.",
                        call.caller_tag, call.ref_name
                    ),
                    file_path: Some(call.file_path.clone()),
                    line: Some(*aline),
                    column: Some(*acol),
                    source_ref: Some(aname.clone()),
                    suggestions: Vec::new(),
                });
            }
        }
        for (pname, pdef) in params {
            if pdef.required && !supplied.contains(pname.as_str()) {
                out.push(Diagnostic {
                    severity: if is_run { Severity::Warning } else { Severity::Error },
                    code: if is_run {
                        "md.run_actions_param_required"
                    } else {
                        "md.cue_library_param_required"
                    }
                    .to_string(),
                    category: "cue_reference".to_string(),
                    message: format!(
                        "<{}> omits required parameter '{pname}' on library '{}'.",
                        call.caller_tag, call.ref_name
                    ),
                    file_path: Some(call.file_path.clone()),
                    line: Some(call.line),
                    column: Some(call.column),
                    source_ref: Some(pname.clone()),
                    suggestions: Vec::new(),
                });
            }
        }
    }
}

fn check_diff_selectors(
    rel_path: &str,
    clean_text: &str,
    line_idx: &LineIndex,
    root: Node<'_, '_>,
    corpus_root: &str,
    out: &mut Vec<Diagnostic>,
) {
    let norm_rel = rel_path.replace('\\', "/");
    let target_file = Path::new(corpus_root).join(&norm_rel);
    if !target_file.is_file() {
        return;
    }
    let Ok(target_raw) = fs::read_to_string(&target_file) else {
        return;
    };
    let target_clean = target_raw.strip_prefix('\u{feff}').unwrap_or(&target_raw);
    let Ok(target_doc) = Document::parse(target_clean) else {
        return;
    };

    for child in root.children().filter(|c| c.is_element()) {
        if !matches!(child.tag_name().name(), "add" | "replace" | "remove") {
            continue;
        }
        let Some(sel) = child.attribute("sel") else {
            continue;
        };
        if !xpath_matches_any(&target_doc, sel) {
            let (line, col) = line_idx.pos_clean(clean_text, child.range().start);
            out.push(Diagnostic {
                severity: Severity::Error,
                code: "diff.selector_zero_match".to_string(),
                category: "diff".to_string(),
                message: format!(
                    "RFC 5261 selector sel=\"{sel}\" matched 0 nodes in base game '{}'.",
                    norm_rel
                ),
                file_path: Some(rel_path.to_string()),
                line: Some(line),
                column: Some(col),
                source_ref: Some(sel.to_string()),
                suggestions: Vec::new(),
            });
        }
    }
}

/// Evaluates common X4 XPath diff selectors: `/root/tag[@attr='val']`, `//tag[@attr='val']`, paths without predicates.
fn xpath_matches_any(doc: &Document<'_>, sel: &str) -> bool {
    let s = sel.trim();
    if s.is_empty() {
        return false;
    }
    // Evaluate simple common segments separated by `/` (handling `//` prefix or inside)
    let segments = parse_xpath_segments(s);
    if segments.is_empty() {
        return true; // complex axis/function: avoid false positive
    }
    let mut frontier: Vec<Node<'_, '_>> = vec![doc.root()];
    for (descendant, tag, pred_attr, pred_val) in segments {
        let mut next = Vec::new();
        for cur in frontier {
            if descendant {
                for n in cur.descendants().filter(|n| n.is_element()) {
                    if segment_matches(n, tag.as_deref(), pred_attr.as_deref(), pred_val.as_deref()) {
                        next.push(n);
                    }
                }
            } else {
                for n in cur.children().filter(|n| n.is_element()) {
                    if segment_matches(n, tag.as_deref(), pred_attr.as_deref(), pred_val.as_deref()) {
                        next.push(n);
                    }
                }
            }
        }
        if next.is_empty() {
            return false;
        }
        frontier = next;
    }
    !frontier.is_empty()
}

fn segment_matches(
    node: Node<'_, '_>,
    tag: Option<&str>,
    pred_attr: Option<&str>,
    pred_val: Option<&str>,
) -> bool {
    if let Some(t) = tag {
        if t != "*" && node.tag_name().name() != t {
            return false;
        }
    }
    if let (Some(a), Some(v)) = (pred_attr, pred_val) {
        return node.attribute(a) == Some(v);
    }
    true
}

type XPathSeg = (bool, Option<String>, Option<String>, Option<String>);

fn parse_xpath_segments(sel: &str) -> Vec<XPathSeg> {
    // Only evaluate simple deterministic tag/[@attr='val'] paths; bail cleanly on complex axes/expressions
    static STEP_RE: OnceLock<Regex> = OnceLock::new();
    let step_re = STEP_RE.get_or_init(|| {
        Regex::new(r"^(/?/?)([A-Za-z_*][\w.:-]*)(?:\[@([A-Za-z_][\w.:-]*)\s*=\s*'([^']*)'\])?$").unwrap()
    });
    let mut segs = Vec::new();
    let mut rest = sel.trim();
    while !rest.is_empty() {
        let descendant = rest.starts_with("//");
        if descendant {
            rest = &rest[2..];
        } else if let Some(r) = rest.strip_prefix('/') {
            rest = r;
        }
        if rest.is_empty() {
            return Vec::new();
        }
        // Find next top-level '/' outside '[...]' and quotes
        let mut split_at = rest.len();
        let mut depth = 0i32;
        let mut in_sq = false;
        for (idx, c) in rest.char_indices() {
            if c == '\'' {
                in_sq = !in_sq;
            } else if !in_sq {
                if c == '[' {
                    depth += 1;
                } else if c == ']' {
                    depth -= 1;
                } else if c == '/' && depth == 0 {
                    split_at = idx;
                    break;
                }
            }
        }
        let step = &rest[..split_at];
        rest = &rest[split_at..];
        if let Some(cap) = step_re.captures(step) {
            segs.push((
                descendant,
                Some(cap[2].to_string()),
                cap.get(3).map(|m| m.as_str().to_string()),
                cap.get(4).map(|m| m.as_str().to_string()),
            ));
        } else {
            return Vec::new();
        }
    }
    segs
}

pub fn check_content_xml_deps(files: &[LoadedFile], out: &mut Vec<Diagnostic>) -> Option<String> {
    let mut content_files: Vec<&LoadedFile> = files
        .iter()
        .filter(|f| f.rel_path.eq_ignore_ascii_case("content.xml"))
        .collect();
    let content = content_files.pop()?;
    let idx = LineIndex::new(&content.text);
    let clean = idx.strip_bom(&content.text);
    let Ok(doc) = Document::parse(clean) else {
        return None;
    };
    let root = doc.root_element();
    let mod_id = root.attribute("id").unwrap_or("").trim().to_string();
    let mut seen_deps: HashSet<String> = HashSet::new();

    for d in root.children().filter(|n| n.is_element() && n.tag_name().name() == "dependency") {
        let Some(dep_id) = d.attribute("id") else {
            continue;
        };
        let key = dep_id.trim().to_ascii_lowercase();
        let (line, col) = idx.pos_clean(clean, d.range().start);
        if !mod_id.is_empty() && key == mod_id.to_ascii_lowercase() {
            out.push(Diagnostic {
                severity: Severity::Error,
                code: "dep.self".to_string(),
                category: "dependency".to_string(),
                message: format!("content.xml declares self-dependency '{dep_id}'."),
                file_path: Some(content.rel_path.clone()),
                line: Some(line),
                column: Some(col),
                source_ref: Some(dep_id.to_string()),
                suggestions: Vec::new(),
            });
        } else if !seen_deps.insert(key) {
            out.push(Diagnostic {
                severity: Severity::Warning,
                code: "dep.duplicate".to_string(),
                category: "dependency".to_string(),
                message: format!("content.xml declares duplicate dependency '{dep_id}'."),
                file_path: Some(content.rel_path.clone()),
                line: Some(line),
                column: Some(col),
                source_ref: Some(dep_id.to_string()),
                suggestions: Vec::new(),
            });
        }
    }

    Some(mod_id)
}
