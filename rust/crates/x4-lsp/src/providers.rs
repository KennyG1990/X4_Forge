use crate::analysis::{
    build_t_index, byte_span_to_range, complete_lua_readtext_at_offset,
    extract_attrs_with_offsets, infer_var_types, lsp_pos_to_offset, mask_xml_comments_and_cdata,
    normalize_num_str, offset_to_lsp_pos, resolve_lua_readtext_at_offset, ModContext, TEntry,
};
use lsp_types::{
    CodeAction, CodeActionContext, CodeActionOrCommand, CodeActionKind, CodeLens, Command,
    CompletionItem, CompletionItemKind, Diagnostic as LspDiagnostic, DiagnosticSeverity,
    DocumentSymbol, FoldingRange, FoldingRangeKind, Hover, HoverContents, InlayHint,
    InlayHintKind, InlayHintLabel, Location, MarkupContent, MarkupKind, NumberOrString,
    ParameterInformation, ParameterLabel, Position, PrepareRenameResponse, Range, SemanticToken,
    SemanticTokenType, SemanticTokens, SignatureHelp, SignatureInformation, SymbolInformation,
    SymbolKind, TextEdit, Url, WorkspaceEdit,
};
use regex::Regex;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::sync::OnceLock;
use x4_corpus::CorpusIndex;
use x4_validate::xml_wellformed::{parse_xml, LineIndex};
use x4_validate::xsd::{damerau_levenshtein, route_schema_for_file, XsdRegistry};
use x4_validate::{validate_loaded_files, validate_single_document, LoadedFile, Severity};

pub fn semantic_token_types() -> Vec<SemanticTokenType> {
    vec![
        SemanticTokenType::VARIABLE,
        SemanticTokenType::KEYWORD,
        SemanticTokenType::PROPERTY,
        SemanticTokenType::ENUM_MEMBER,
        SemanticTokenType::FUNCTION,
        SemanticTokenType::NUMBER,
        SemanticTokenType::STRING,
        SemanticTokenType::OPERATOR,
        SemanticTokenType::CLASS,
        SemanticTokenType::PARAMETER,
    ]
}

const FALLBACK_MD_ELEMENTS: &[&str] = &[
    "mdscript",
    "cues",
    "cue",
    "library",
    "params",
    "param",
    "conditions",
    "actions",
    "set_value",
    "remove_value",
    "signal_cue",
    "signal_cue_instantly",
    "reset_cue",
    "cancel_cue",
    "force_cue",
    "run_actions",
    "include_actions",
    "debug_text",
    "find_ship",
    "find_station",
    "find_sector",
    "find_cluster",
    "find_zone",
    "find_object",
    "find_dockingbay",
    "create_ship",
    "create_station",
    "create_group",
    "create_list",
    "add_to_group",
    "append_to_list",
    "do_if",
    "do_elseif",
    "do_else",
    "do_while",
    "do_all",
    "do_any",
    "break",
    "continue",
    "event_cue_signalled",
    "event_cue_cancelled",
    "event_cue_completed",
    "event_game_loaded",
    "check_value",
    "check_any",
    "check_all",
    "raise_lua_event",
    "substitute_text",
    "write_to_logbook",
];

const FALLBACK_AI_ELEMENTS: &[&str] = &[
    "aiscript",
    "order",
    "params",
    "param",
    "interrupts",
    "handler",
    "init",
    "attention",
    "actions",
    "label",
    "resume",
    "wait",
    "move_to",
    "run_script",
    "set_value",
    "debug_text",
    "do_if",
    "do_elseif",
    "do_else",
    "do_while",
    "do_all",
    "return",
    "find_ship",
    "find_station",
    "find_sector",
];

// ---------------------------------------------------------------------------
// 1. LIVE DIAGNOSTICS
// ---------------------------------------------------------------------------

pub fn compute_diagnostics(
    ctx: &ModContext,
    corpus: &CorpusIndex,
    xsd_reg: &XsdRegistry,
) -> Vec<LspDiagnostic> {
    let active = ctx.active();
    let target_norm = active.rel_path.replace('\\', "/");

    let raw_diags = if ctx.mod_root.is_some()
        && ctx
            .files
            .iter()
            .any(|f| f.rel_path.eq_ignore_ascii_case("content.xml"))
    {
        let loaded: Vec<LoadedFile> = ctx
            .files
            .iter()
            .filter(|f| {
                let l = f.rel_path.to_ascii_lowercase();
                l == "content.xml"
                    || l == "forge.rules.json"
                    || l.ends_with(".xml")
                    || l.ends_with(".lua")
            })
            .map(|f| {
                LoadedFile::from_text(
                    f.rel_path.clone(),
                    f.abs_path.clone().unwrap_or_else(|| f.rel_path.clone().into()),
                    f.text.clone(),
                )
            })
            .collect();
        let mod_name = ctx
            .mod_root
            .as_ref()
            .and_then(|p| p.file_name())
            .and_then(|s| s.to_str())
            .unwrap_or("mod");
        let rep = validate_loaded_files(mod_name, &loaded, Vec::new(), corpus, xsd_reg, &[], 0, None);
        rep.findings
            .into_iter()
            .filter(|d| {
                d.file_path
                    .as_deref()
                    .map(|p| p.replace('\\', "/").eq_ignore_ascii_case(&target_norm))
                    .unwrap_or(false)
            })
            .collect()
    } else {
        validate_single_document(&active.rel_path, &active.text, corpus, xsd_reg)
    };

    raw_diags
        .into_iter()
        .map(|d| {
            let line_0 = d.line.unwrap_or(1).saturating_sub(1);
            let col_0 = d.column.unwrap_or(1).saturating_sub(1);
            let start = Position {
                line: line_0,
                character: col_0,
            };
            let end = Position {
                line: line_0,
                character: col_0.saturating_add(1),
            };
            let severity = match d.severity {
                Severity::Error => DiagnosticSeverity::ERROR,
                Severity::Warning => DiagnosticSeverity::WARNING,
                Severity::Info => DiagnosticSeverity::INFORMATION,
            };
            LspDiagnostic {
                range: Range { start, end },
                severity: Some(severity),
                code: Some(NumberOrString::String(d.code)),
                source: Some("x4forge".to_string()),
                message: d.message,
                ..Default::default()
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// 2. FOLDING RANGES
// ---------------------------------------------------------------------------

pub fn compute_folding_ranges(text: &str) -> Vec<FoldingRange> {
    static COMMENT_RE: OnceLock<Regex> = OnceLock::new();
    static TAG_RE: OnceLock<Regex> = OnceLock::new();
    let comment_re = COMMENT_RE.get_or_init(|| Regex::new(r"(?s)<!--([\s\S]*?)-->").unwrap());
    let tag_re = TAG_RE.get_or_init(|| {
        Regex::new(r#"(?s)<(/?)([A-Za-z_][\w.:-]*)(?:"[^"]*"|'[^']*'|[^'"<>])*/?>"#).unwrap()
    });

    let mut out = Vec::new();
    let mut region_stack: Vec<u32> = Vec::new();

    for cap in comment_re.captures_iter(text) {
        let full = cap.get(0).unwrap();
        let body = cap[1].trim();
        let start_line = offset_to_lsp_pos(text, full.start()).line;
        let end_line = offset_to_lsp_pos(text, full.end()).line;
        let lower = body.to_ascii_lowercase();
        if lower.starts_with("#region") {
            region_stack.push(start_line);
        } else if lower.starts_with("#endregion") {
            if let Some(reg_start) = region_stack.pop() {
                if end_line > reg_start {
                    out.push(FoldingRange {
                        start_line: reg_start,
                        start_character: None,
                        end_line,
                        end_character: None,
                        kind: Some(FoldingRangeKind::Region),
                        collapsed_text: None,
                    });
                }
            }
        } else if end_line > start_line {
            out.push(FoldingRange {
                start_line,
                start_character: None,
                end_line,
                end_character: None,
                kind: Some(FoldingRangeKind::Comment),
                collapsed_text: None,
            });
        }
    }

    let masked = mask_xml_comments_and_cdata(text);
    let mut tag_stack: Vec<(String, u32)> = Vec::new();
    for cap in tag_re.captures_iter(&masked) {
        let full = cap.get(0).unwrap();
        let is_close = !cap[1].is_empty();
        let tag = cap[2].to_ascii_lowercase();
        let self_close = !is_close && full.as_str().trim_end().ends_with("/>");
        let line = offset_to_lsp_pos(text, full.start()).line;

        if is_close {
            if let Some(pos) = tag_stack.iter().rposition(|(n, _)| n == &tag) {
                let (_, open_line) = tag_stack.remove(pos);
                tag_stack.truncate(pos);
                if line > open_line {
                    out.push(FoldingRange {
                        start_line: open_line,
                        start_character: None,
                        end_line: line,
                        end_character: None,
                        kind: None,
                        collapsed_text: None,
                    });
                }
            }
        } else if !self_close {
            tag_stack.push((tag, line));
        }
    }

    out.sort_by_key(|f| (f.start_line, f.end_line));
    out
}

// ---------------------------------------------------------------------------
// 3. DOCUMENT SYMBOLS
// ---------------------------------------------------------------------------

struct OpenSymNode {
    tag: String,
    open_start: usize,
    symbol: Option<DocumentSymbol>,
    seen_vars: Option<HashSet<String>>,
}

fn attach_symbol(stack: &mut [OpenSymNode], roots: &mut Vec<DocumentSymbol>, sym: DocumentSymbol) {
    for node in stack.iter_mut().rev() {
        if let Some(ref mut parent_sym) = node.symbol {
            let children = parent_sym.children.get_or_insert_with(Vec::new);
            children.push(sym);
            return;
        }
    }
    roots.push(sym);
}

#[allow(deprecated)]
fn make_doc_symbol(
    name: String,
    detail: Option<String>,
    kind: SymbolKind,
    range: Range,
    selection_range: Range,
) -> DocumentSymbol {
    DocumentSymbol {
        name: if name.is_empty() {
            "(unnamed)".to_string()
        } else {
            name
        },
        detail,
        kind,
        tags: None,
        deprecated: None,
        range,
        selection_range,
        children: Some(Vec::new()),
    }
}

pub fn compute_document_symbols(rel_path: &str, text: &str) -> Vec<DocumentSymbol> {
    if rel_path.to_ascii_lowercase().ends_with(".lua") {
        return compute_lua_symbols(text);
    }

    static TAG_RE: OnceLock<Regex> = OnceLock::new();
    static VAR_RE: OnceLock<Regex> = OnceLock::new();
    let tag_re = TAG_RE.get_or_init(|| {
        Regex::new(r#"(?s)<(/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)(/?)>"#)
            .unwrap()
    });
    let var_re = VAR_RE.get_or_init(|| Regex::new(r"^\$[A-Za-z_]\w*$").unwrap());

    let masked = mask_xml_comments_and_cdata(text);
    let mut roots: Vec<DocumentSymbol> = Vec::new();
    let mut stack: Vec<OpenSymNode> = Vec::new();
    let mut root_kind: Option<String> = None;

    for cap in tag_re.captures_iter(&masked) {
        let full = cap.get(0).unwrap();
        let is_close = !cap[1].is_empty();
        let tag_m = cap.get(2).unwrap();
        let tag = tag_m.as_str().to_ascii_lowercase();
        let attr_m = cap.get(3).unwrap();
        let self_close = !is_close && !cap[4].is_empty();

        if is_close {
            if let Some(pos) = stack.iter().rposition(|n| n.tag == tag) {
                while stack.len() > pos {
                    let popped = stack.pop().unwrap();
                    if let Some(mut sym) = popped.symbol {
                        sym.range.end = offset_to_lsp_pos(text, full.end());
                        attach_symbol(&mut stack, &mut roots, sym);
                    }
                }
            }
            continue;
        }

        if root_kind.is_none() {
            root_kind = Some(tag.clone());
        }
        let rkind = root_kind.as_deref().unwrap_or("");
        let attrs = extract_attrs_with_offsets(attr_m.as_str(), attr_m.start());
        let name_attr = attrs.iter().find(|a| a.name_lower == "name");
        let id_attr = attrs.iter().find(|a| a.name_lower == "id");
        let sel_attr = attrs.iter().find(|a| a.name_lower == "sel");

        let mut sym: Option<DocumentSymbol> = None;
        let base_range = byte_span_to_range(text, full.start(), full.end());

        if tag == "mdscript" || tag == "aiscript" {
            let label = name_attr
                .map(|a| a.value.clone())
                .unwrap_or_else(|| tag.clone());
            let sel_range = name_attr
                .map(|a| byte_span_to_range(text, a.val_start, a.val_end))
                .unwrap_or_else(|| byte_span_to_range(text, full.start() + 1, tag_m.end()));
            sym = Some(make_doc_symbol(
                label,
                Some(tag.clone()),
                SymbolKind::MODULE,
                base_range,
                sel_range,
            ));
        } else if tag == "cue" || tag == "library" {
            let label = name_attr
                .map(|a| a.value.clone())
                .unwrap_or_else(|| format!("({tag})"));
            let sel_range = name_attr
                .map(|a| byte_span_to_range(text, a.val_start, a.val_end))
                .unwrap_or_else(|| byte_span_to_range(text, full.start() + 1, tag_m.end()));
            let purpose = attrs
                .iter()
                .find(|a| a.name_lower == "purpose")
                .map(|a| a.value.clone())
                .unwrap_or_else(|| tag.clone());
            let kind = if tag == "cue" {
                SymbolKind::EVENT
            } else {
                SymbolKind::FUNCTION
            };
            sym = Some(make_doc_symbol(
                label,
                Some(purpose),
                kind,
                base_range,
                sel_range,
            ));
        } else if tag == "order" && rkind == "aiscript" {
            let label = id_attr
                .map(|a| a.value.clone())
                .unwrap_or_else(|| "order".to_string());
            let sel_range = id_attr
                .map(|a| byte_span_to_range(text, a.val_start, a.val_end))
                .unwrap_or(base_range);
            sym = Some(make_doc_symbol(
                label,
                Some("order".to_string()),
                SymbolKind::CLASS,
                base_range,
                sel_range,
            ));
        } else if tag == "attention" && rkind == "aiscript" {
            let min_val = attrs
                .iter()
                .find(|a| a.name_lower == "min")
                .map(|a| a.value.as_str())
                .unwrap_or("unknown");
            sym = Some(make_doc_symbol(
                format!("attention ({min_val})"),
                None,
                SymbolKind::METHOD,
                base_range,
                byte_span_to_range(text, full.start() + 1, tag_m.end()),
            ));
        } else if tag == "label" && rkind == "aiscript" {
            if let Some(na) = name_attr {
                sym = Some(make_doc_symbol(
                    na.value.clone(),
                    Some("label".to_string()),
                    SymbolKind::CONSTANT,
                    base_range,
                    byte_span_to_range(text, na.val_start, na.val_end),
                ));
            }
        } else if tag == "param" && stack.iter().any(|s| s.tag == "params") {
            if let Some(na) = name_attr {
                let pty = attrs
                    .iter()
                    .find(|a| a.name_lower == "type")
                    .map(|a| a.value.clone())
                    .unwrap_or_else(|| "param".to_string());
                sym = Some(make_doc_symbol(
                    na.value.clone(),
                    Some(pty),
                    SymbolKind::PROPERTY,
                    base_range,
                    byte_span_to_range(text, na.val_start, na.val_end),
                ));
            }
        } else if (tag == "set_value" || tag.starts_with("find_") || tag.starts_with("create_"))
            && name_attr.is_some_and(|a| var_re.is_match(a.value.trim()))
        {
            let na = name_attr.unwrap();
            let vname = na.value.trim().to_string();
            let key = vname.to_ascii_lowercase();
            let already = stack
                .iter_mut()
                .rev()
                .find(|s| s.seen_vars.is_some())
                .map(|s| !s.seen_vars.as_mut().unwrap().insert(key))
                .unwrap_or(false);
            if !already {
                sym = Some(make_doc_symbol(
                    vname,
                    Some(tag.clone()),
                    SymbolKind::VARIABLE,
                    base_range,
                    byte_span_to_range(text, na.val_start, na.val_end),
                ));
            }
        } else if rkind == "diff" && matches!(tag.as_str(), "add" | "replace" | "remove") {
            let label = match sel_attr {
                Some(sa) => format!("{tag} {}", sa.value),
                None => tag.clone(),
            };
            let sel_range = sel_attr
                .map(|sa| byte_span_to_range(text, sa.val_start, sa.val_end))
                .unwrap_or_else(|| byte_span_to_range(text, full.start() + 1, tag_m.end()));
            sym = Some(make_doc_symbol(
                label,
                Some("diff patch".to_string()),
                SymbolKind::KEY,
                base_range,
                sel_range,
            ));
        } else if !matches!(rkind, "mdscript" | "aiscript" | "diff")
            && stack.len() <= 2
            && (id_attr.is_some() || name_attr.is_some())
        {
            let chosen = id_attr.or(name_attr).unwrap();
            sym = Some(make_doc_symbol(
                chosen.value.clone(),
                Some(tag.clone()),
                SymbolKind::CLASS,
                base_range,
                byte_span_to_range(text, chosen.val_start, chosen.val_end),
            ));
        }

        if self_close {
            if let Some(s) = sym {
                attach_symbol(&mut stack, &mut roots, s);
            }
        } else {
            let tracks_vars = matches!(tag.as_str(), "cue" | "library" | "aiscript" | "mdscript");
            stack.push(OpenSymNode {
                tag,
                open_start: full.start(),
                symbol: sym,
                seen_vars: tracks_vars.then(HashSet::new),
            });
        }
    }

    // Flush unclosed tags gracefully (for mid-edit XML)
    while let Some(popped) = stack.pop() {
        let _ = popped.open_start;
        if let Some(sym) = popped.symbol {
            attach_symbol(&mut stack, &mut roots, sym);
        }
    }

    roots
}

fn compute_lua_symbols(text: &str) -> Vec<DocumentSymbol> {
    static FN_RE: OnceLock<Regex> = OnceLock::new();
    let re = FN_RE.get_or_init(|| {
        Regex::new(r"(?m)^\s*(?:local\s+)?function\s+([A-Za-z_][\w.:]*)\s*\(").unwrap()
    });
    re.captures_iter(text)
        .map(|cap| {
            let full = cap.get(0).unwrap();
            let name_m = cap.get(1).unwrap();
            make_doc_symbol(
                name_m.as_str().to_string(),
                Some("function".to_string()),
                SymbolKind::FUNCTION,
                byte_span_to_range(text, full.start(), full.end()),
                byte_span_to_range(text, name_m.start(), name_m.end()),
            )
        })
        .collect()
}

// ---------------------------------------------------------------------------
// 4. SEMANTIC TOKENS
// ---------------------------------------------------------------------------

struct RawSemToken {
    line: u32,
    start_char: u32,
    length: u32,
    token_type: u32,
}

fn is_x4_keyword(lower: &str) -> bool {
    matches!(
        lower,
        "player"
            | "this"
            | "event"
            | "md"
            | "global"
            | "static"
            | "staticbase"
            | "parent"
            | "namespace"
            | "if"
            | "then"
            | "else"
            | "and"
            | "or"
            | "not"
            | "typeof"
            | "true"
            | "false"
            | "null"
            | "pi"
            | "table"
    )
}

fn is_x4_lookup_root(lower: &str) -> bool {
    matches!(
        lower,
        "faction"
            | "ware"
            | "class"
            | "macro"
            | "race"
            | "sector"
            | "moodtype"
            | "licencetype"
            | "relationchangereason"
            | "killmethod"
            | "missiontype"
            | "attention"
            | "controlpost"
            | "skill"
            | "isclass"
            | "isrealclass"
            | "datatype"
    )
}

fn is_expr_attr(lower: &str) -> bool {
    matches!(
        lower,
        "value"
            | "exact"
            | "min"
            | "max"
            | "chance"
            | "object"
            | "space"
            | "sector"
            | "zone"
            | "destination"
            | "position"
            | "rotation"
            | "text"
            | "param"
            | "param1"
            | "param2"
            | "param3"
            | "name"
            | "result"
            | "list"
            | "group"
            | "groupname"
            | "filter"
            | "cue"
            | "ref"
            | "show"
            | "checkinterval"
            | "timeout"
            | "delay"
    )
}

pub fn compute_semantic_tokens(text: &str) -> SemanticTokens {
    static TAG_RE: OnceLock<Regex> = OnceLock::new();
    static EXPR_TOK_RE: OnceLock<Regex> = OnceLock::new();
    static XPATH_TOK_RE: OnceLock<Regex> = OnceLock::new();
    static EXPR_HINT_RE: OnceLock<Regex> = OnceLock::new();

    let tag_re = TAG_RE.get_or_init(|| {
        Regex::new(r#"(?s)<([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)/?>"#).unwrap()
    });
    let expr_re = EXPR_TOK_RE.get_or_init(|| {
        Regex::new(
            r"'(?:\\.|[^'])*'|\{[0-9]+\s*,\s*[0-9]+\}|\$[A-Za-z_]\w*|\d+(?:\.\d+)?(?:ms|km|min|deg|Cr|LF|[smhf])?\b|[A-Za-z_]\w*|[+\-*/%=!<>?@]+",
        )
        .unwrap()
    });
    let xpath_re = XPATH_TOK_RE.get_or_init(|| {
        Regex::new(
            r#"'(?:\\.|[^'])*'|"[^"]*"|@[A-Za-z_][\w.:-]*|\b(?:not|text|count|position|last|contains|starts-with)\b|[A-Za-z_][\w.:-]*|\d+|[=/\[\]()]"#,
        )
        .unwrap()
    });
    let hint_re = EXPR_HINT_RE.get_or_init(|| {
        Regex::new(r"[$'.{}\[\]+*/?]|\b(?:player|this|event|md|faction|ware|class)\b").unwrap()
    });

    let masked = mask_xml_comments_and_cdata(text);
    let mut raw: Vec<RawSemToken> = Vec::new();

    for cap in tag_re.captures_iter(&masked) {
        let tag = cap[1].to_ascii_lowercase();
        let attrs_m = cap.get(2).unwrap();
        for attr in extract_attrs_with_offsets(attrs_m.as_str(), attrs_m.start()) {
            if attr.name_lower == "comment" || attr.value.is_empty() || attr.value.contains('\n') {
                continue;
            }
            if matches!(tag.as_str(), "add" | "replace" | "remove")
                && matches!(attr.name_lower.as_str(), "sel" | "if")
            {
                for m in xpath_re.find_iter(&attr.value) {
                    let tok = m.as_str();
                    let kind = if tok.starts_with('\'') || tok.starts_with('"') {
                        6 // string
                    } else if tok.starts_with('@') {
                        9 // parameter
                    } else if tok.bytes().all(|b| b.is_ascii_digit()) {
                        5 // number
                    } else if tok.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_') {
                        if attr.value[m.end()..].starts_with('(') {
                            4 // function
                        } else if tok == "and" || tok == "or" {
                            1 // keyword
                        } else {
                            8 // class
                        }
                    } else {
                        7 // operator
                    };
                    let pos = offset_to_lsp_pos(text, attr.val_start + m.start());
                    raw.push(RawSemToken {
                        line: pos.line,
                        start_char: pos.character,
                        length: tok.encode_utf16().count() as u32,
                        token_type: kind,
                    });
                }
            } else if matches!(attr.name_lower.as_str(), "cue" | "ref")
                && !attr.value.contains('$')
                && !attr.value.contains('.')
            {
                let pos = offset_to_lsp_pos(text, attr.val_start);
                raw.push(RawSemToken {
                    line: pos.line,
                    start_char: pos.character,
                    length: attr.value.encode_utf16().count() as u32,
                    token_type: 4, // function
                });
            } else if is_expr_attr(&attr.name_lower) && hint_re.is_match(&attr.value) {
                let mut prev_word = String::new();
                for m in expr_re.find_iter(&attr.value) {
                    let tok = m.as_str();
                    let prev_was_dot = attr.value[..m.start()].trim_end().ends_with('.');
                    let kind = if tok.starts_with('\'') || tok.starts_with('{') {
                        prev_word.clear();
                        6 // string
                    } else if tok.starts_with('$') {
                        prev_word.clear();
                        0 // variable
                    } else if tok.bytes().next().is_some_and(|b| b.is_ascii_digit()) {
                        prev_word.clear();
                        5 // number
                    } else if tok.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_') {
                        let lower = tok.to_ascii_lowercase();
                        let k = if !prev_was_dot && (is_x4_keyword(&lower) || is_x4_lookup_root(&lower))
                        {
                            1 // keyword
                        } else if prev_was_dot && is_x4_lookup_root(&prev_word) {
                            3 // enumMember
                        } else if prev_was_dot && prev_word == "md" {
                            8 // class
                        } else if prev_was_dot {
                            2 // property
                        } else {
                            4 // function
                        };
                        prev_word = lower;
                        k
                    } else {
                        prev_word.clear();
                        7 // operator
                    };
                    let pos = offset_to_lsp_pos(text, attr.val_start + m.start());
                    raw.push(RawSemToken {
                        line: pos.line,
                        start_char: pos.character,
                        length: tok.encode_utf16().count() as u32,
                        token_type: kind,
                    });
                }
            }
        }
    }

    raw.sort_by_key(|t| (t.line, t.start_char));
    let mut data = Vec::with_capacity(raw.len());
    let mut prev_line = 0u32;
    let mut prev_char = 0u32;
    for t in raw {
        let delta_line = t.line - prev_line;
        let delta_start = if delta_line == 0 {
            t.start_char.saturating_sub(prev_char)
        } else {
            t.start_char
        };
        data.push(SemanticToken {
            delta_line,
            delta_start,
            length: t.length,
            token_type: t.token_type,
            token_modifiers_bitset: 0,
        });
        prev_line = t.line;
        prev_char = t.start_char;
    }

    SemanticTokens {
        result_id: None,
        data,
    }
}

// ---------------------------------------------------------------------------
// 5. INLAY HINTS
// ---------------------------------------------------------------------------

pub fn compute_inlay_hints(ctx: &ModContext, filter_range: Option<Range>) -> Vec<InlayHint> {
    static BRACE_RE: OnceLock<Regex> = OnceLock::new();
    static TAG_RE: OnceLock<Regex> = OnceLock::new();
    static VAR_RE: OnceLock<Regex> = OnceLock::new();
    let brace_re = BRACE_RE.get_or_init(|| Regex::new(r"\{\s*(\d+)\s*,\s*(\d+)\s*\}").unwrap());
    let tag_re = TAG_RE.get_or_init(|| {
        Regex::new(r#"(?s)<([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)/?>"#).unwrap()
    });
    let var_re = VAR_RE.get_or_init(|| Regex::new(r"^\$[A-Za-z_]\w*$").unwrap());

    let active = ctx.active();
    let text = &active.text;
    let t_index = build_t_index(ctx);
    let masked = mask_xml_comments_and_cdata(text);
    let var_types = infer_var_types(text);

    let in_filter = |pos: Position| -> bool {
        let Some(r) = filter_range else {
            return true;
        };
        (pos.line > r.start.line || (pos.line == r.start.line && pos.character >= r.start.character))
            && (pos.line < r.end.line || (pos.line == r.end.line && pos.character <= r.end.character))
    };

    let mut hints: Vec<InlayHint> = Vec::new();

    for cap in brace_re.captures_iter(&masked) {
        let page = normalize_num_str(&cap[1]);
        let id = normalize_num_str(&cap[2]);
        if let Some(entry) = t_index.get(&(page, id)) {
            let pos = offset_to_lsp_pos(text, cap.get(0).unwrap().end());
            if in_filter(pos) {
                let preview = if entry.text.chars().count() > 42 {
                    let cut: String = entry.text.chars().take(39).collect();
                    format!("{cut}…")
                } else {
                    entry.text.clone()
                };
                hints.push(InlayHint {
                    position: pos,
                    label: InlayHintLabel::String(format!(" \"{preview}\"")),
                    kind: Some(InlayHintKind::PARAMETER),
                    text_edits: None,
                    tooltip: None,
                    padding_left: Some(true),
                    padding_right: None,
                    data: None,
                });
            }
        }
    }

    let mut hinted_vars: HashSet<String> = HashSet::new();
    for cap in tag_re.captures_iter(&masked) {
        let tag = cap[1].to_ascii_lowercase();
        if tag == "param" {
            continue;
        }
        let attrs_m = cap.get(2).unwrap();
        let attrs = extract_attrs_with_offsets(attrs_m.as_str(), attrs_m.start());
        let Some(na) = attrs.iter().find(|a| a.name_lower == "name") else {
            continue;
        };
        let vname = na.value.trim();
        if !var_re.is_match(vname) {
            continue;
        }
        let key = vname.to_ascii_lowercase();
        if !hinted_vars.insert(key.clone()) {
            continue;
        }
        if let Some((ty, is_guess)) = var_types.get(&key) {
            let pos = offset_to_lsp_pos(text, na.val_end);
            if in_filter(pos) {
                hints.push(InlayHint {
                    position: pos,
                    label: InlayHintLabel::String(format!(
                        ": {ty}{}",
                        if *is_guess { "?" } else { "" }
                    )),
                    kind: Some(InlayHintKind::TYPE),
                    text_edits: None,
                    tooltip: None,
                    padding_left: None,
                    padding_right: None,
                    data: None,
                });
            }
        }
    }

    hints.sort_by_key(|h| (h.position.line, h.position.character));
    hints
}

// ---------------------------------------------------------------------------
// SHARED MD & AI SYMBOL GRAPH (Definition, References, CodeLens, Rename)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct MdDeclSpan {
    file_idx: usize,
    script_name: String,
    name: String,
    kind: String, // "cue" | "library"
    name_start: usize,
    name_end: usize,
    tag_start: usize,
    tag_end: usize,
}

#[derive(Debug, Clone)]
struct MdRefSpan {
    file_idx: usize,
    raw_value: String,
    target_script: Option<String>,
    target_name: String,
    terminal_start: usize,
    terminal_end: usize,
}

#[derive(Debug, Default)]
struct MdSymbolGraph {
    decls: Vec<MdDeclSpan>,
    refs: Vec<MdRefSpan>,
}

fn collect_md_symbol_graph(ctx: &ModContext) -> MdSymbolGraph {
    static TAG_RE: OnceLock<Regex> = OnceLock::new();
    let tag_re = TAG_RE.get_or_init(|| {
        Regex::new(r#"(?s)<(/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)(/?)>"#)
            .unwrap()
    });

    let mut graph = MdSymbolGraph::default();

    for (file_idx, doc) in ctx.files.iter().enumerate() {
        let lower = doc.rel_path.to_ascii_lowercase();
        if !lower.ends_with(".xml") {
            continue;
        }
        let masked = mask_xml_comments_and_cdata(&doc.text);
        if !masked.contains("<mdscript") && !lower.starts_with("md/") {
            continue;
        }

        let mut script_name = String::new();
        for cap in tag_re.captures_iter(&masked) {
            let full = cap.get(0).unwrap();
            let is_close = !cap[1].is_empty();
            if is_close {
                continue;
            }
            let tag = cap[2].to_ascii_lowercase();
            let attrs_m = cap.get(3).unwrap();
            let attrs = extract_attrs_with_offsets(attrs_m.as_str(), attrs_m.start());

            if tag == "mdscript" {
                if let Some(na) = attrs.iter().find(|a| a.name_lower == "name") {
                    script_name = na.value.trim().to_string();
                }
                continue;
            }

            if tag == "cue" || tag == "library" {
                if let Some(na) = attrs.iter().find(|a| a.name_lower == "name") {
                    let v = na.value.trim();
                    if !v.is_empty() {
                        graph.decls.push(MdDeclSpan {
                            file_idx,
                            script_name: script_name.clone(),
                            name: v.to_string(),
                            kind: tag.clone(),
                            name_start: na.val_start,
                            name_end: na.val_end,
                            tag_start: full.start(),
                            tag_end: full.end(),
                        });
                    }
                }
            }

            for attr in &attrs {
                let is_cue_or_ref = (attr.name_lower == "cue" && tag != "cue")
                    || (attr.name_lower == "ref"
                        && matches!(tag.as_str(), "run_actions" | "include_actions" | "cue"));
                if !is_cue_or_ref {
                    continue;
                }
                let val = attr.value.trim();
                if val.is_empty()
                    || val.starts_with('$')
                    || matches!(val, "this" | "parent" | "static")
                {
                    continue;
                }
                let leading = attr.value.find(val).unwrap_or(0);
                let (t_script, t_name, term_start, term_end) = if let Some(rest) = val.strip_prefix("md.")
                {
                    if let Some((sc, nm)) = rest.split_once('.') {
                        let ts = attr.val_start + leading + 3 + sc.len() + 1;
                        (
                            Some(sc.to_string()),
                            nm.to_string(),
                            ts,
                            ts + nm.len(),
                        )
                    } else {
                        continue;
                    }
                } else {
                    let ts = attr.val_start + leading;
                    (
                        (!script_name.is_empty()).then(|| script_name.clone()),
                        val.to_string(),
                        ts,
                        ts + val.len(),
                    )
                };
                graph.refs.push(MdRefSpan {
                    file_idx,
                    raw_value: val.to_string(),
                    target_script: t_script,
                    target_name: t_name,
                    terminal_start: term_start,
                    terminal_end: term_end,
                });
            }
        }
    }

    graph
}

fn ref_matches_decl(r: &MdRefSpan, decl: &MdDeclSpan) -> bool {
    if r.target_name != decl.name {
        return false;
    }
    match (&r.target_script, decl.script_name.is_empty()) {
        (Some(rs), false) => rs == &decl.script_name,
        _ => r.file_idx == decl.file_idx,
    }
}

// ---------------------------------------------------------------------------
// 6. CODELENS
// ---------------------------------------------------------------------------

pub fn compute_code_lenses(ctx: &ModContext) -> Vec<CodeLens> {
    let active = ctx.active();
    let masked = mask_xml_comments_and_cdata(&active.text);
    let mut lenses = Vec::new();

    if masked.contains("<mdscript") || active.rel_path.to_ascii_lowercase().starts_with("md/") {
        let graph = collect_md_symbol_graph(ctx);
        for decl in graph.decls.iter().filter(|d| d.file_idx == ctx.active_idx) {
            let count = graph
                .refs
                .iter()
                .filter(|r| ref_matches_decl(r, decl))
                .count();
            lenses.push(CodeLens {
                range: byte_span_to_range(&active.text, decl.tag_start, decl.tag_end),
                command: Some(Command {
                    title: format!(
                        "{count} reference{}",
                        if count == 1 { "" } else { "s" }
                    ),
                    command: "x4forge.showReferences".to_string(),
                    arguments: Some(vec![
                        json!(decl.name),
                        json!(count),
                        json!(active.uri.as_str()),
                    ]),
                }),
                data: None,
            });
        }
    } else if masked.contains("<aiscript")
        || active.rel_path.to_ascii_lowercase().starts_with("aiscripts/")
    {
        static TAG_RE: OnceLock<Regex> = OnceLock::new();
        let tag_re = TAG_RE.get_or_init(|| {
            Regex::new(r#"(?s)<(label|resume)\b((?:"[^"]*"|'[^']*'|[^'"<>])*?)/?>"#).unwrap()
        });
        let mut counts: HashMap<String, usize> = HashMap::new();
        let mut decls: Vec<(String, usize, usize)> = Vec::new();
        for cap in tag_re.captures_iter(&masked) {
            let full = cap.get(0).unwrap();
            let tag = cap[1].to_ascii_lowercase();
            let attrs_m = cap.get(2).unwrap();
            let attrs = extract_attrs_with_offsets(attrs_m.as_str(), attrs_m.start());
            if tag == "resume" {
                if let Some(la) = attrs.iter().find(|a| a.name_lower == "label") {
                    *counts.entry(la.value.to_ascii_lowercase()).or_insert(0) += 1;
                }
            } else if let Some(na) = attrs.iter().find(|a| a.name_lower == "name") {
                decls.push((na.value.clone(), full.start(), full.end()));
            }
        }
        for (name, start, end) in decls {
            let count = counts
                .get(&name.to_ascii_lowercase())
                .copied()
                .unwrap_or(0);
            lenses.push(CodeLens {
                range: byte_span_to_range(&active.text, start, end),
                command: Some(Command {
                    title: format!(
                        "{count} reference{}",
                        if count == 1 { "" } else { "s" }
                    ),
                    command: "x4forge.showReferences".to_string(),
                    arguments: Some(vec![json!(name), json!(count)]),
                }),
                data: None,
            });
        }
    }

    lenses
}

// ---------------------------------------------------------------------------
// 7. FORMAT SIGNATURE HELP
// ---------------------------------------------------------------------------

pub fn compute_signature_help(ctx: &ModContext, pos: Position) -> Option<SignatureHelp> {
    let active = ctx.active();
    let offset = lsp_pos_to_offset(&active.text, pos).min(active.text.len());
    let mut window_start = offset.saturating_sub(512);
    while window_start < offset && !active.text.is_char_boundary(window_start) {
        window_start += 1;
    }
    let prefix = &active.text[window_start..offset];
    let bytes = prefix.as_bytes();

    let mut depth = 0i32;
    let mut open_bracket: Option<usize> = None;
    let mut active_comma = 0u32;
    let mut in_str = false;

    let mut i = bytes.len();
    while i > 0 {
        i -= 1;
        let b = bytes[i];
        if b == b'\'' && (i == 0 || bytes[i - 1] != b'\\') {
            in_str = !in_str;
            continue;
        }
        if in_str {
            continue;
        }
        if matches!(b, b']' | b')' | b'}') {
            depth += 1;
        } else if matches!(b, b'(' | b'{') {
            if depth > 0 {
                depth -= 1;
            } else {
                break;
            }
        } else if b == b'[' {
            if depth > 0 {
                depth -= 1;
            } else {
                let before = prefix[..i].trim_end();
                if before.ends_with('.') {
                    open_bracket = Some(i);
                }
                break;
            }
        } else if b == b',' && depth == 0 {
            active_comma += 1;
        }
    }

    let open_idx = open_bracket?;
    let receiver = prefix[..open_idx]
        .trim_end()
        .strip_suffix('.')?
        .trim_end();

    static LIT_RE: OnceLock<Regex> = OnceLock::new();
    static TEXT_REF_RE: OnceLock<Regex> = OnceLock::new();
    static SPEC_RE: OnceLock<Regex> = OnceLock::new();

    let lit_re = LIT_RE.get_or_init(|| Regex::new(r"'((?:\\.|[^'])*)'$").unwrap());
    let text_ref_re = TEXT_REF_RE.get_or_init(|| Regex::new(r"\{\s*(\d+)\s*,\s*(\d+)\s*\}$").unwrap());
    let spec_re = SPEC_RE.get_or_init(|| Regex::new(r"%(?:%|,?(?:\.\d+)?(s|[1-9]\d*))").unwrap());

    let template = if let Some(cap) = lit_re.captures(receiver) {
        cap[1].to_string()
    } else if let Some(cap) = text_ref_re.captures(receiver) {
        let t_index = build_t_index(ctx);
        let p = normalize_num_str(&cap[1]);
        let id = normalize_num_str(&cap[2]);
        t_index
            .get(&(p.clone(), id.clone()))
            .map(|e| e.text.clone())
            .unwrap_or_else(|| format!("{{{p}, {id}}}"))
    } else {
        return None;
    };

    let mut placeholders: Vec<([u32; 2], usize)> = Vec::new();
    let mut seq_idx = 0usize;
    for cap in spec_re.captures_iter(&template) {
        let full = cap.get(0).unwrap();
        if full.as_str() == "%%" {
            continue;
        }
        let kind = cap.get(1).unwrap().as_str();
        let arg_idx = if kind == "s" {
            let idx = seq_idx;
            seq_idx += 1;
            idx
        } else {
            kind.parse::<usize>().ok()?.saturating_sub(1)
        };
        let u16_start = template[..full.start()].encode_utf16().count() as u32;
        let u16_end = template[..full.end()].encode_utf16().count() as u32;
        placeholders.push(([u16_start, u16_end], arg_idx));
    }

    if placeholders.is_empty() {
        return None;
    }

    let max_param = placeholders.iter().map(|(_, idx)| *idx).max().unwrap_or(0) + 1;
    let params: Vec<ParameterInformation> = (0..max_param)
        .map(|idx| {
            if let Some((span, _)) = placeholders.iter().find(|(_, p_idx)| *p_idx == idx) {
                ParameterInformation {
                    label: ParameterLabel::LabelOffsets(*span),
                    documentation: None,
                }
            } else {
                ParameterInformation {
                    label: ParameterLabel::Simple(format!("arg{}", idx + 1)),
                    documentation: None,
                }
            }
        })
        .collect();

    let active_param = active_comma.min((params.len() as u32).saturating_sub(1));
    Some(SignatureHelp {
        signatures: vec![SignatureInformation {
            label: template,
            documentation: None,
            parameters: Some(params),
            active_parameter: Some(active_param),
        }],
        active_signature: Some(0),
        active_parameter: Some(active_param),
    })
}

// ---------------------------------------------------------------------------
// 8 & 9. DEFINITION & REFERENCES
// ---------------------------------------------------------------------------

fn find_brace_text_at_offset(text: &str, offset: usize) -> Option<(String, String, usize, usize)> {
    static BRACE_RE: OnceLock<Regex> = OnceLock::new();
    let re = BRACE_RE.get_or_init(|| Regex::new(r"\{\s*(\d+)\s*,\s*(\d+)\s*\}").unwrap());
    for cap in re.captures_iter(text) {
        let m = cap.get(0).unwrap();
        if m.start() <= offset && offset <= m.end() {
            return Some((
                normalize_num_str(&cap[1]),
                normalize_num_str(&cap[2]),
                m.start(),
                m.end(),
            ));
        }
    }
    None
}

fn t_entry_to_location(entry: &TEntry, ctx: &ModContext) -> Location {
    let text = ctx
        .files
        .iter()
        .find(|f| f.uri == entry.uri)
        .map(|f| f.text.as_str())
        .unwrap_or("");
    let range = if text.is_empty() {
        Range {
            start: Position::new(entry.line, entry.col),
            end: Position::new(entry.line, entry.col),
        }
    } else {
        byte_span_to_range(text, entry.byte_start, entry.byte_end)
    };
    Location {
        uri: entry.uri.clone(),
        range,
    }
}

pub fn compute_definition(ctx: &ModContext, pos: Position) -> Vec<Location> {
    let active = ctx.active();
    let offset = lsp_pos_to_offset(&active.text, pos);
    let t_index = build_t_index(ctx);

    if active.rel_path.to_ascii_lowercase().ends_with(".lua") {
        if let Some((page, id)) = resolve_lua_readtext_at_offset(&active.text, offset) {
            if let Some(entry) = t_index.get(&(page, id)) {
                return vec![t_entry_to_location(entry, ctx)];
            }
        }
        return Vec::new();
    }

    if let Some((page, id, _, _)) = find_brace_text_at_offset(&active.text, offset) {
        if let Some(entry) = t_index.get(&(page, id)) {
            return vec![t_entry_to_location(entry, ctx)];
        }
    }

    // AIScript run_script -> aiscripts/<name>.xml
    static RUN_SCRIPT_RE: OnceLock<Regex> = OnceLock::new();
    let rs_re = RUN_SCRIPT_RE.get_or_init(|| {
        Regex::new(r#"(?s)<run_script\b([^>]*)name\s*=\s*["']'([^']+)'["']"#).unwrap()
    });
    for cap in rs_re.captures_iter(&active.text) {
        let m = cap.get(0).unwrap();
        if m.start() <= offset && offset <= m.end() {
            let target_rel = format!("aiscripts/{}.xml", &cap[2]);
            if let Some(target) = ctx
                .files
                .iter()
                .find(|f| f.rel_path.eq_ignore_ascii_case(&target_rel))
            {
                return vec![Location {
                    uri: target.uri.clone(),
                    range: Range::new(Position::new(0, 0), Position::new(0, 0)),
                }];
            }
        }
    }

    // AIScript <resume label="X"/> -> <label name="X"/>
    static RESUME_RE: OnceLock<Regex> = OnceLock::new();
    let res_re = RESUME_RE.get_or_init(|| {
        Regex::new(r#"<resume\b[^>]*\blabel\s*=\s*["']([A-Za-z_][\w.-]*)["']"#).unwrap()
    });
    for cap in res_re.captures_iter(&active.text) {
        let m = cap.get(0).unwrap();
        if m.start() <= offset && offset <= m.end() {
            let lbl = &cap[1];
            static LBL_RE: OnceLock<Regex> = OnceLock::new();
            let lbl_re = LBL_RE.get_or_init(|| {
                Regex::new(r#"<label\b[^>]*\bname\s*=\s*["']([A-Za-z_][\w.-]*)["']"#).unwrap()
            });
            for lcap in lbl_re.captures_iter(&active.text) {
                if lcap[1].eq_ignore_ascii_case(lbl) {
                    let nm = lcap.get(1).unwrap();
                    return vec![Location {
                        uri: active.uri.clone(),
                        range: byte_span_to_range(&active.text, nm.start(), nm.end()),
                    }];
                }
            }
        }
    }

    // MD cue / library definition
    let graph = collect_md_symbol_graph(ctx);
    for r in graph.refs.iter().filter(|r| r.file_idx == ctx.active_idx) {
        // cursor anywhere inside the ref attribute value
        let val_len = r.raw_value.len();
        let full_start = r.terminal_end.saturating_sub(val_len);
        if full_start <= offset && offset <= r.terminal_end {
            let matches: Vec<Location> = graph
                .decls
                .iter()
                .filter(|d| ref_matches_decl(r, d))
                .map(|d| {
                    let f = &ctx.files[d.file_idx];
                    Location {
                        uri: f.uri.clone(),
                        range: byte_span_to_range(&f.text, d.name_start, d.name_end),
                    }
                })
                .collect();
            if !matches.is_empty() {
                return matches;
            }
        }
    }

    Vec::new()
}

pub fn compute_references(
    ctx: &ModContext,
    pos: Position,
    include_declaration: bool,
) -> Vec<Location> {
    let active = ctx.active();
    let offset = lsp_pos_to_offset(&active.text, pos);

    // 1. Check $var under cursor
    if let Some((old_var, _)) = find_var_at_offset(&active.text, offset) {
        return find_var_occurrences(&active.text, &old_var)
            .into_iter()
            .map(|(s, e)| Location {
                uri: active.uri.clone(),
                range: byte_span_to_range(&active.text, s, e),
            })
            .collect();
    }

    // 2. Check MD cue / library
    let graph = collect_md_symbol_graph(ctx);
    if let Some(decl) = find_md_decl_at_cursor(&graph, ctx.active_idx, offset) {
        let mut out = Vec::new();
        if include_declaration {
            let df = &ctx.files[decl.file_idx];
            out.push(Location {
                uri: df.uri.clone(),
                range: byte_span_to_range(&df.text, decl.name_start, decl.name_end),
            });
        }
        for r in &graph.refs {
            if ref_matches_decl(r, &decl) {
                let rf = &ctx.files[r.file_idx];
                out.push(Location {
                    uri: rf.uri.clone(),
                    range: byte_span_to_range(&rf.text, r.terminal_start, r.terminal_end),
                });
            }
        }
        return out;
    }

    Vec::new()
}

// ---------------------------------------------------------------------------
// 10. PREPARE RENAME & RENAME
// ---------------------------------------------------------------------------

fn find_var_at_offset(text: &str, offset: usize) -> Option<(String, Range)> {
    static VAR_RE: OnceLock<Regex> = OnceLock::new();
    let var_re = VAR_RE.get_or_init(|| Regex::new(r"\$[A-Za-z_]\w*").unwrap());
    let mut win_start = offset.saturating_sub(64);
    while win_start > 0 && !text.is_char_boundary(win_start) {
        win_start -= 1;
    }
    let mut win_end = (offset + 64).min(text.len());
    while win_end < text.len() && !text.is_char_boundary(win_end) {
        win_end += 1;
    }
    let slice = &text[win_start..win_end];
    let local_off = offset - win_start;
    for m in var_re.find_iter(slice) {
        if m.start() <= local_off && local_off <= m.end() {
            let s = win_start + m.start();
            let e = win_start + m.end();
            return Some((m.as_str().to_string(), byte_span_to_range(text, s, e)));
        }
    }
    None
}

fn find_var_occurrences(text: &str, var_name: &str) -> Vec<(usize, usize)> {
    let masked = mask_xml_comments_and_cdata(text);
    let escaped = regex::escape(var_name);
    let Ok(re) = Regex::new(&format!(r"{escaped}\b")) else {
        return Vec::new();
    };
    re.find_iter(&masked)
        .map(|m| (m.start(), m.end()))
        .collect()
}

fn find_md_decl_at_cursor(
    graph: &MdSymbolGraph,
    active_idx: usize,
    offset: usize,
) -> Option<MdDeclSpan> {
    if let Some(d) = graph
        .decls
        .iter()
        .find(|d| d.file_idx == active_idx && d.name_start <= offset && offset <= d.name_end)
    {
        return Some(d.clone());
    }
    if let Some(r) = graph
        .refs
        .iter()
        .find(|r| r.file_idx == active_idx && r.terminal_start <= offset && offset <= r.terminal_end)
    {
        if let Some(d) = graph.decls.iter().find(|d| ref_matches_decl(r, d)) {
            return Some(d.clone());
        }
    }
    None
}

fn find_aiscript_label_at_cursor(
    text: &str,
    offset: usize,
) -> Option<(String, Range, Vec<(usize, usize)>)> {
    if !text.contains("<aiscript") {
        return None;
    }
    static LBL_RE: OnceLock<Regex> = OnceLock::new();
    let re = LBL_RE.get_or_init(|| {
        Regex::new(r#"(?s)<(label|resume)\b((?:"[^"]*"|'[^']*'|[^'"<>])*?)/?>"#).unwrap()
    });
    let masked = mask_xml_comments_and_cdata(text);
    let mut occs: Vec<(String, usize, usize)> = Vec::new();
    let mut target: Option<(String, Range)> = None;
    for cap in re.captures_iter(&masked) {
        let tag = cap[1].to_ascii_lowercase();
        let attrs_m = cap.get(2).unwrap();
        let key = if tag == "label" { "name" } else { "label" };
        let attrs = extract_attrs_with_offsets(attrs_m.as_str(), attrs_m.start());
        if let Some(a) = attrs.iter().find(|a| a.name_lower == key) {
            occs.push((a.value.clone(), a.val_start, a.val_end));
            if a.val_start <= offset && offset <= a.val_end {
                target = Some((
                    a.value.clone(),
                    byte_span_to_range(text, a.val_start, a.val_end),
                ));
            }
        }
    }
    let (name, range) = target?;
    let spans = occs
        .into_iter()
        .filter(|(v, _, _)| v == &name)
        .map(|(_, s, e)| (s, e))
        .collect();
    Some((name, range, spans))
}

pub fn compute_prepare_rename(ctx: &ModContext, pos: Position) -> Option<PrepareRenameResponse> {
    let active = ctx.active();
    let offset = lsp_pos_to_offset(&active.text, pos);

    if let Some((name, range)) = find_var_at_offset(&active.text, offset) {
        return Some(PrepareRenameResponse::RangeWithPlaceholder {
            range,
            placeholder: name,
        });
    }
    if let Some((name, range, _)) = find_aiscript_label_at_cursor(&active.text, offset) {
        return Some(PrepareRenameResponse::RangeWithPlaceholder {
            range,
            placeholder: name,
        });
    }
    let graph = collect_md_symbol_graph(ctx);
    if let Some(d) = find_md_decl_at_cursor(&graph, ctx.active_idx, offset) {
        let df = &ctx.files[d.file_idx];
        return Some(PrepareRenameResponse::RangeWithPlaceholder {
            range: byte_span_to_range(&df.text, d.name_start, d.name_end),
            placeholder: d.name,
        });
    }
    None
}

pub fn compute_rename(
    ctx: &ModContext,
    pos: Position,
    new_name: &str,
) -> Result<Option<WorkspaceEdit>, String> {
    let active = ctx.active();
    let offset = lsp_pos_to_offset(&active.text, pos);

    // 1. $var rename
    if let Some((old_var, _)) = find_var_at_offset(&active.text, offset) {
        let clean_new = if new_name.starts_with('$') {
            new_name.to_string()
        } else {
            format!("${new_name}")
        };
        static VALID_VAR: OnceLock<Regex> = OnceLock::new();
        let valid_re = VALID_VAR.get_or_init(|| Regex::new(r"^\$[A-Za-z_]\w*$").unwrap());
        if !valid_re.is_match(&clean_new) {
            return Err(format!("Invalid X4 variable name '{new_name}'."));
        }
        let edits: Vec<TextEdit> = find_var_occurrences(&active.text, &old_var)
            .into_iter()
            .map(|(s, e)| TextEdit {
                range: byte_span_to_range(&active.text, s, e),
                new_text: clean_new.clone(),
            })
            .collect();
        if edits.is_empty() {
            return Ok(None);
        }
        let mut changes = HashMap::new();
        changes.insert(active.uri.clone(), edits);
        return Ok(Some(WorkspaceEdit {
            changes: Some(changes),
            ..Default::default()
        }));
    }

    // 2. AIScript label rename
    if let Some((_, _, spans)) = find_aiscript_label_at_cursor(&active.text, offset) {
        static VALID_LBL: OnceLock<Regex> = OnceLock::new();
        let valid_re = VALID_LBL.get_or_init(|| Regex::new(r"^[A-Za-z_][\w.-]*$").unwrap());
        if !valid_re.is_match(new_name) {
            return Err(format!("Invalid AIScript label name '{new_name}'."));
        }
        let edits: Vec<TextEdit> = spans
            .into_iter()
            .map(|(s, e)| TextEdit {
                range: byte_span_to_range(&active.text, s, e),
                new_text: new_name.to_string(),
            })
            .collect();
        let mut changes = HashMap::new();
        changes.insert(active.uri.clone(), edits);
        return Ok(Some(WorkspaceEdit {
            changes: Some(changes),
            ..Default::default()
        }));
    }

    // 3. Cross-file MD cue / library rename
    let graph = collect_md_symbol_graph(ctx);
    if let Some(decl) = find_md_decl_at_cursor(&graph, ctx.active_idx, offset) {
        static VALID_IDENT: OnceLock<Regex> = OnceLock::new();
        let valid_re = VALID_IDENT.get_or_init(|| Regex::new(r"^[A-Za-z_][\w.-]*$").unwrap());
        if !valid_re.is_match(new_name) {
            return Err(format!("Invalid MD symbol name '{new_name}'."));
        }
        let mut changes: HashMap<Url, Vec<TextEdit>> = HashMap::new();
        let df = &ctx.files[decl.file_idx];
        changes.entry(df.uri.clone()).or_default().push(TextEdit {
            range: byte_span_to_range(&df.text, decl.name_start, decl.name_end),
            new_text: new_name.to_string(),
        });
        for r in &graph.refs {
            if ref_matches_decl(r, &decl) {
                let rf = &ctx.files[r.file_idx];
                changes.entry(rf.uri.clone()).or_default().push(TextEdit {
                    range: byte_span_to_range(&rf.text, r.terminal_start, r.terminal_end),
                    new_text: new_name.to_string(),
                });
            }
        }
        return Ok(Some(WorkspaceEdit {
            changes: Some(changes),
            ..Default::default()
        }));
    }

    Ok(None)
}

// ---------------------------------------------------------------------------
// 11. HOVER
// ---------------------------------------------------------------------------

fn identifier_token_at_offset(text: &str, offset: usize) -> Option<(String, usize, usize)> {
    let bytes = text.as_bytes();
    if bytes.is_empty() {
        return None;
    }
    let mut idx = offset.min(bytes.len().saturating_sub(1));
    let is_tok = |b: u8| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'$' | b'-' | b':');
    if !is_tok(bytes[idx]) && offset > 0 && is_tok(bytes[offset - 1]) {
        idx = offset - 1;
    }
    if !is_tok(bytes[idx]) {
        return None;
    }
    let mut s = idx;
    while s > 0 && is_tok(bytes[s - 1]) {
        s -= 1;
    }
    let mut e = idx + 1;
    while e < bytes.len() && is_tok(bytes[e]) {
        e += 1;
    }
    Some((text[s..e].to_string(), s, e))
}

pub fn compute_hover(
    ctx: &ModContext,
    pos: Position,
    corpus: &CorpusIndex,
    xsd_reg: &XsdRegistry,
) -> Option<Hover> {
    let active = ctx.active();
    let offset = lsp_pos_to_offset(&active.text, pos);
    let t_index = build_t_index(ctx);

    if active.rel_path.to_ascii_lowercase().ends_with(".lua") {
        if let Some((page, id)) = resolve_lua_readtext_at_offset(&active.text, offset) {
            if let Some(entry) = t_index.get(&(page.clone(), id.clone())) {
                return Some(Hover {
                    contents: HoverContents::Markup(MarkupContent {
                        kind: MarkupKind::Markdown,
                        value: format!(
                            "**Localized Text `{{{page}, {id}}}`**\n\n{}\n\n*Defined in `{}` line {}*",
                            entry.text,
                            entry.rel_path,
                            entry.line + 1
                        ),
                    }),
                    range: None,
                });
            }
        }
        return None;
    }

    // 1. {page, id}
    if let Some((page, id, s, e)) = find_brace_text_at_offset(&active.text, offset) {
        let range = byte_span_to_range(&active.text, s, e);
        if let Some(entry) = t_index.get(&(page.clone(), id.clone())) {
            return Some(Hover {
                contents: HoverContents::Markup(MarkupContent {
                    kind: MarkupKind::Markdown,
                    value: format!(
                        "**Localized Text `{{{page}, {id}}}`**\n\n{}\n\n*Defined in `{}` line {}*",
                        entry.text,
                        entry.rel_path,
                        entry.line + 1
                    ),
                }),
                range: Some(range),
            });
        }
    }

    // 2. $var inferred type & count
    if let Some((var_name, range)) = find_var_at_offset(&active.text, offset) {
        let var_types = infer_var_types(&active.text);
        let occs = find_var_occurrences(&active.text, &var_name).len();
        let ty_note = var_types
            .get(&var_name.to_ascii_lowercase())
            .map(|(t, g)| format!("Inferred type: `{t}{}`", if *g { "?" } else { "" }))
            .unwrap_or_else(|| "Inferred type: `any`".to_string());
        return Some(Hover {
            contents: HoverContents::Markup(MarkupContent {
                kind: MarkupKind::Markdown,
                value: format!("**Variable `{var_name}`**\n\n{ty_note} • {occs} occurrence(s) in file"),
            }),
            range: Some(range),
        });
    }

    // 3. Qualified lookup / scriptproperty / XML tag hover
    let (tok, s, e) = identifier_token_at_offset(&active.text, offset)?;
    let range = byte_span_to_range(&active.text, s, e);
    let lower = tok.to_ascii_lowercase();

    if let Some((ns, id)) = lower.split_once('.') {
        match ns {
            "faction" => {
                let present = corpus.factions.contains(id);
                return Some(Hover {
                    contents: HoverContents::Markup(MarkupContent {
                        kind: MarkupKind::Markdown,
                        value: format!(
                            "**Faction `{tok}`** — {}",
                            if present {
                                "present in loaded X4 corpus"
                            } else if corpus.factions.is_empty() {
                                "corpus not loaded"
                            } else {
                                "not found in corpus"
                            }
                        ),
                    }),
                    range: Some(range),
                });
            }
            "ware" => {
                let present = corpus.wares.contains(id);
                return Some(Hover {
                    contents: HoverContents::Markup(MarkupContent {
                        kind: MarkupKind::Markdown,
                        value: format!(
                            "**Ware `{tok}`** — {}",
                            if present {
                                "present in loaded X4 corpus"
                            } else if corpus.wares.is_empty() {
                                "corpus not loaded"
                            } else {
                                "not found in corpus"
                            }
                        ),
                    }),
                    range: Some(range),
                });
            }
            "macro" => {
                let present = corpus.macros.contains(id);
                return Some(Hover {
                    contents: HoverContents::Markup(MarkupContent {
                        kind: MarkupKind::Markdown,
                        value: format!(
                            "**Macro `{tok}`** — {}",
                            if present {
                                "present in loaded X4 corpus"
                            } else if corpus.macros.is_empty() {
                                "corpus not loaded"
                            } else {
                                "not found in corpus"
                            }
                        ),
                    }),
                    range: Some(range),
                });
            }
            "sector" => {
                let present = corpus.sectors.contains(id);
                return Some(Hover {
                    contents: HoverContents::Markup(MarkupContent {
                        kind: MarkupKind::Markdown,
                        value: format!(
                            "**Sector `{tok}`** — {}",
                            if present {
                                "present in loaded X4 corpus"
                            } else if corpus.sectors.is_empty() {
                                "corpus not loaded"
                            } else {
                                "not found in corpus"
                            }
                        ),
                    }),
                    range: Some(range),
                });
            }
            _ => {}
        }
        if let Some(kw) = corpus.script_properties.keywords.get(ns) {
            if let Some(res_type) = kw.prop_results.get(id) {
                return Some(Hover {
                    contents: HoverContents::Markup(MarkupContent {
                        kind: MarkupKind::Markdown,
                        value: format!("**Script Property `{tok}`** -> `{res_type}`"),
                    }),
                    range: Some(range),
                });
            }
        }
    }

    // Check XML tag XSD summary
    let line_idx = LineIndex::new(&active.text);
    let clean = line_idx.strip_bom(&active.text);
    if let Ok(doc) = parse_xml(&active.rel_path, clean) {
        if let Some(schema_key) = route_schema_for_file(&active.rel_path, &doc) {
            if let Some(schema) = xsd_reg.schemas.get(&schema_key) {
                if let Some(root_type) = schema.root_elements.get(&tok) {
                    let info = schema.resolve_type(root_type, 0);
                    let attrs_list: Vec<&String> = info.attrs.keys().take(12).collect();
                    return Some(Hover {
                        contents: HoverContents::Markup(MarkupContent {
                            kind: MarkupKind::Markdown,
                            value: format!(
                                "**`<`{tok}`>`** (`{schema_key}`)\n\nAttributes: {}",
                                attrs_list
                                    .iter()
                                    .map(|a| format!("`{a}`"))
                                    .collect::<Vec<_>>()
                                    .join(", ")
                            ),
                        }),
                        range: Some(range),
                    });
                }
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// 12. COMPLETION
// ---------------------------------------------------------------------------

pub fn compute_completion(
    ctx: &ModContext,
    pos: Position,
    corpus: &CorpusIndex,
    xsd_reg: &XsdRegistry,
) -> Vec<CompletionItem> {
    let active = ctx.active();
    let offset = lsp_pos_to_offset(&active.text, pos);
    let t_index = build_t_index(ctx);

    if active.rel_path.to_ascii_lowercase().ends_with(".lua") {
        if let Some((page_opt, prefix)) = complete_lua_readtext_at_offset(&active.text, offset) {
            match page_opt {
                Some(page) => {
                    let mut items = Vec::new();
                    for ((p, id), entry) in &t_index {
                        if p == &page && (prefix.is_empty() || id.starts_with(&prefix)) {
                            let detail: String = entry.text.chars().take(60).collect();
                            items.push(CompletionItem {
                                label: id.clone(),
                                kind: Some(CompletionItemKind::CONSTANT),
                                detail: Some(detail),
                                insert_text: Some(id.clone()),
                                ..Default::default()
                            });
                            if items.len() >= 100 {
                                break;
                            }
                        }
                    }
                    return items;
                }
                None => {
                    let mut pages: BTreeMap<String, usize> = BTreeMap::new();
                    for (p, _) in t_index.keys() {
                        if prefix.is_empty() || p.starts_with(&prefix) {
                            *pages.entry(p.clone()).or_insert(0) += 1;
                        }
                    }
                    return pages
                        .into_iter()
                        .take(100)
                        .map(|(p, count)| CompletionItem {
                            label: p.clone(),
                            kind: Some(CompletionItemKind::MODULE),
                            detail: Some(format!("{count} text entries")),
                            insert_text: Some(p),
                            ..Default::default()
                        })
                        .collect();
                }
            }
        }
        return Vec::new();
    }

    let before = &active.text[..offset.min(active.text.len())];
    static CUE_VAL_RE: OnceLock<Regex> = OnceLock::new();
    static LOOKUP_VAL_RE: OnceLock<Regex> = OnceLock::new();
    static TAG_PREFIX_RE: OnceLock<Regex> = OnceLock::new();

    let cue_val_re =
        CUE_VAL_RE.get_or_init(|| Regex::new(r#"\b(cue|ref)\s*=\s*["']([A-Za-z0-9_.]*)$"#).unwrap());
    let lookup_re = LOOKUP_VAL_RE
        .get_or_init(|| Regex::new(r"(faction|ware|macro|sector|player|this)\.([A-Za-z0-9_]*)$").unwrap());
    let tag_prefix_re = TAG_PREFIX_RE.get_or_init(|| Regex::new(r"<([A-Za-z_][\w.:-]*)$").unwrap());

    let mut win_start = offset.saturating_sub(128);
    while win_start < offset && !active.text.is_char_boundary(win_start) {
        win_start += 1;
    }
    let tail = &before[win_start..];

    // 1. cue="..." or ref="..."
    if let Some(cap) = cue_val_re.captures(tail) {
        let attr = cap[1].to_ascii_lowercase();
        let prefix = cap[2].to_ascii_lowercase();
        let graph = collect_md_symbol_graph(ctx);
        let mut seen = BTreeSet::new();
        let mut items = Vec::new();
        for d in &graph.decls {
            if attr == "ref" && d.kind != "library" {
                continue;
            }
            if !prefix.is_empty() && !d.name.to_ascii_lowercase().starts_with(&prefix) {
                continue;
            }
            if seen.insert(d.name.clone()) {
                items.push(CompletionItem {
                    label: d.name.clone(),
                    kind: Some(if d.kind == "library" {
                        CompletionItemKind::FUNCTION
                    } else {
                        CompletionItemKind::EVENT
                    }),
                    detail: Some(format!("{} in {}", d.kind, d.script_name)),
                    insert_text: Some(d.name.clone()),
                    ..Default::default()
                });
            }
        }
        return items;
    }

    // 2. Corpus / scriptproperty prefix
    if let Some(cap) = lookup_re.captures(tail) {
        let root = cap[1].to_ascii_lowercase();
        let prefix = cap[2].to_ascii_lowercase();
        let source: Box<dyn Iterator<Item = &String>> = match root.as_str() {
            "faction" => Box::new(corpus.factions.iter()),
            "ware" => Box::new(corpus.wares.iter()),
            "macro" => Box::new(corpus.macros.iter()),
            "sector" => Box::new(corpus.sectors.iter()),
            _ => {
                if let Some(kw) = corpus.script_properties.keywords.get(&root) {
                    return kw
                        .prop_results
                        .iter()
                        .filter(|(k, _)| prefix.is_empty() || k.starts_with(&prefix))
                        .take(100)
                        .map(|(k, ty)| CompletionItem {
                            label: k.clone(),
                            kind: Some(CompletionItemKind::PROPERTY),
                            detail: Some(ty.clone()),
                            insert_text: Some(k.clone()),
                            ..Default::default()
                        })
                        .collect();
                }
                Box::new(std::iter::empty())
            }
        };
        return source
            .filter(|id| prefix.is_empty() || id.starts_with(&prefix))
            .take(100)
            .map(|id| CompletionItem {
                label: id.clone(),
                kind: Some(CompletionItemKind::ENUM_MEMBER),
                detail: Some(format!("{root}.{id}")),
                insert_text: Some(id.clone()),
                ..Default::default()
            })
            .collect();
    }

    // 3. XML element name `<set_...`
    if let Some(cap) = tag_prefix_re.captures(tail) {
        let prefix = cap[1].to_ascii_lowercase();
        let candidates = known_elements_for_doc(&active.rel_path, &active.text, xsd_reg);
        return candidates
            .into_iter()
            .filter(|e| e.starts_with(&prefix))
            .take(100)
            .map(|e| CompletionItem {
                label: e.clone(),
                kind: Some(CompletionItemKind::KEYWORD),
                detail: Some("X4 XML element".to_string()),
                insert_text: Some(e),
                ..Default::default()
            })
            .collect();
    }

    Vec::new()
}

fn known_elements_for_doc(
    rel_path: &str,
    text: &str,
    xsd_reg: &XsdRegistry,
) -> BTreeSet<String> {
    let mut set = BTreeSet::new();
    let line_idx = LineIndex::new(text);
    let clean = line_idx.strip_bom(text);
    let schema_key = if let Ok(doc) = parse_xml(rel_path, clean) {
        route_schema_for_file(rel_path, &doc)
    } else if rel_path.to_ascii_lowercase().starts_with("md/") || text.contains("<mdscript") {
        Some("md.xsd".to_string())
    } else if rel_path.to_ascii_lowercase().starts_with("aiscripts/") || text.contains("<aiscript") {
        Some("aiscripts.xsd".to_string())
    } else {
        None
    };

    if let Some(key) = schema_key {
        if let Some(schema) = xsd_reg.schemas.get(&key) {
            set.extend(schema.all_elements.iter().cloned());
        }
    }
    if set.is_empty() {
        let lower = rel_path.to_ascii_lowercase();
        let fallback = if lower.starts_with("aiscripts/") || text.contains("<aiscript") {
            FALLBACK_AI_ELEMENTS
        } else {
            FALLBACK_MD_ELEMENTS
        };
        set.extend(fallback.iter().map(|s| s.to_string()));
    }
    set
}

// ---------------------------------------------------------------------------
// 13. CODE ACTIONS & WORKSPACE SYMBOLS
// ---------------------------------------------------------------------------

pub fn compute_code_actions(
    ctx: &ModContext,
    range: Range,
    _context: &CodeActionContext,
    xsd_reg: &XsdRegistry,
) -> Vec<CodeActionOrCommand> {
    static TAG_RE: OnceLock<Regex> = OnceLock::new();
    let tag_re = TAG_RE.get_or_init(|| {
        Regex::new(r#"(?s)<([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)(/?)>"#).unwrap()
    });

    let active = ctx.active();
    let text = &active.text;
    let offset = lsp_pos_to_offset(text, range.start);
    let masked = mask_xml_comments_and_cdata(text);
    let known_elements = known_elements_for_doc(&active.rel_path, text, xsd_reg);
    let graph = collect_md_symbol_graph(ctx);
    let known_cues: HashSet<String> = graph.decls.iter().map(|d| d.name.clone()).collect();

    let mut actions = Vec::new();

    for cap in tag_re.captures_iter(&masked) {
        let full = cap.get(0).unwrap();
        if offset < full.start() || offset > full.end() {
            continue;
        }
        let raw_tag_m = cap.get(1).unwrap();
        let raw_tag = raw_tag_m.as_str();
        let tag = raw_tag.to_ascii_lowercase();
        let attrs_m = cap.get(2).unwrap();
        let self_close = !cap[3].is_empty();
        let attrs = extract_attrs_with_offsets(attrs_m.as_str(), attrs_m.start());

        // 1. Typo element quick-fix via Damerau-Levenshtein
        if !known_elements.is_empty() && !known_elements.contains(&tag) && !known_elements.contains(raw_tag) {
            let mut scored: Vec<(usize, String)> = known_elements
                .iter()
                .filter_map(|cand| {
                    let d = damerau_levenshtein(&tag, &cand.to_ascii_lowercase());
                    (d > 0 && d <= 2).then(|| (d, cand.clone()))
                })
                .collect();
            scored.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
            scored.truncate(3);

            for (idx, (dist, cand)) in scored.iter().enumerate() {
                let mut edits = vec![TextEdit {
                    range: byte_span_to_range(text, raw_tag_m.start(), raw_tag_m.end()),
                    new_text: cand.clone(),
                }];
                if !self_close {
                    if let Ok(close_re) = Regex::new(&format!(r"</{}\s*>", regex::escape(raw_tag))) {
                        if let Some(cm) = close_re.find(&masked[full.end()..]) {
                            let c_start = full.end() + cm.start() + 2;
                            let c_end = c_start + raw_tag.len();
                            edits.push(TextEdit {
                                range: byte_span_to_range(text, c_start, c_end),
                                new_text: cand.clone(),
                            });
                        }
                    }
                }
                let is_preferred = idx == 0
                    && (*dist == 1
                        || scored.len() == 1
                        || scored.get(1).is_some_and(|(d2, _)| d2 > dist));
                let mut changes = HashMap::new();
                changes.insert(active.uri.clone(), edits);
                actions.push(CodeActionOrCommand::CodeAction(CodeAction {
                    title: format!("Change <{raw_tag}> to <{cand}>"),
                    kind: Some(CodeActionKind::QUICKFIX),
                    is_preferred: Some(is_preferred),
                    edit: Some(WorkspaceEdit {
                        changes: Some(changes),
                        ..Default::default()
                    }),
                    ..Default::default()
                }));
            }
        }

        // 2. Create missing cue / library stub
        let target_ref = match tag.as_str() {
            "signal_cue" | "signal_cue_instantly" => {
                attrs.iter().find(|a| a.name_lower == "cue").map(|a| (a.value.trim(), false))
            }
            "run_actions" | "include_actions" => {
                attrs.iter().find(|a| a.name_lower == "ref").map(|a| (a.value.trim(), true))
            }
            _ => None,
        };
        if let Some((cue_ref, is_lib)) = target_ref {
            static VALID_IDENT: OnceLock<Regex> = OnceLock::new();
            let valid_re = VALID_IDENT.get_or_init(|| Regex::new(r"^[A-Za-z_]\w*$").unwrap());
            if valid_re.is_match(cue_ref)
                && !matches!(cue_ref, "this" | "parent" | "static")
                && !known_cues.contains(cue_ref)
            {
                if let Some(close_cues_idx) = masked.rfind("</cues>") {
                    let stub = if is_lib {
                        let purp = if tag == "run_actions" {
                            " purpose=\"run_actions\""
                        } else {
                            ""
                        };
                        format!(
                            "\n    <library name=\"{cue_ref}\"{purp}>\n      <actions>\n      </actions>\n    </library>\n  "
                        )
                    } else {
                        format!(
                            "\n    <cue name=\"{cue_ref}\" instantiate=\"true\" namespace=\"this\">\n      <conditions>\n        <event_cue_signalled/>\n      </conditions>\n      <actions>\n      </actions>\n    </cue>\n  "
                        )
                    };
                    let ins_pos = offset_to_lsp_pos(text, close_cues_idx);
                    let mut changes = HashMap::new();
                    changes.insert(
                        active.uri.clone(),
                        vec![TextEdit {
                            range: Range::new(ins_pos, ins_pos),
                            new_text: stub,
                        }],
                    );
                    actions.push(CodeActionOrCommand::CodeAction(CodeAction {
                        title: format!(
                            "Create {} \"{cue_ref}\"",
                            if is_lib { "library" } else { "cue" }
                        ),
                        kind: Some(CodeActionKind::QUICKFIX),
                        is_preferred: Some(false),
                        edit: Some(WorkspaceEdit {
                            changes: Some(changes),
                            ..Default::default()
                        }),
                        ..Default::default()
                    }));
                }
            }
        }
        break;
    }

    actions
}

#[allow(deprecated)]
pub fn compute_workspace_symbols(ctx: &ModContext, query: &str) -> Vec<SymbolInformation> {
    let q = query.trim().to_ascii_lowercase();
    let mut results = Vec::new();

    for doc in &ctx.files {
        let doc_syms = compute_document_symbols(&doc.rel_path, &doc.text);
        collect_flat_symbols(&doc.uri, &doc_syms, None, &q, &mut results);
    }

    results
}

#[allow(deprecated)]
fn collect_flat_symbols(
    uri: &Url,
    syms: &[DocumentSymbol],
    container: Option<&str>,
    q: &str,
    out: &mut Vec<SymbolInformation>,
) {
    for sym in syms {
        if q.is_empty() || sym.name.to_ascii_lowercase().contains(q) {
            out.push(SymbolInformation {
                name: sym.name.clone(),
                kind: sym.kind,
                tags: None,
                deprecated: None,
                location: Location {
                    uri: uri.clone(),
                    range: sym.selection_range,
                },
                container_name: container.map(str::to_string),
            });
        }
        if let Some(ref children) = sym.children {
            collect_flat_symbols(uri, children, Some(&sym.name), q, out);
        }
    }
}

pub fn count_document_symbols(syms: &[DocumentSymbol]) -> usize {
    let mut n = syms.len();
    for s in syms {
        if let Some(ref ch) = s.children {
            n += count_document_symbols(ch);
        }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::DocEntry;
    use lsp_types::FoldingRangeKind;

    fn sample_md() -> String {
        [
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
            "<mdscript name=\"DemoScript\">",
            "  <!-- #region Setup -->",
            "  <cues>",
            "    <library name=\"HelperLib\" purpose=\"run_actions\">",
            "      <params><param name=\"Ship\" type=\"ship\"/></params>",
            "      <actions>",
            "        <debug_text text=\"{998801, 1}\"/>",
            "      </actions>",
            "    </library>",
            "    <cue name=\"Start\" instantiate=\"true\" namespace=\"this\">",
            "      <actions>",
            "        <find_ship name=\"$s\" space=\"player.sector\"/>",
            "        <run_actions ref=\"HelperLib\"><param name=\"Ship\" value=\"$s\"/></run_actions>",
            "        <debug_text text=\"'%s in %s'.[$s.knownname, player.sector.knownname]\"/>",
            "      </actions>",
            "    </cue>",
            "  </cues>",
            "  <!-- #endregion -->",
            "</mdscript>",
        ]
        .join("\n")
    }

    fn make_ctx(files: Vec<(&str, &str)>, active_idx: usize) -> ModContext {
        let entries = files
            .into_iter()
            .map(|(rel, txt)| DocEntry {
                uri: Url::parse(&format!("file:///test/{rel}")).unwrap(),
                abs_path: None,
                rel_path: rel.to_string(),
                text: txt.to_string(),
            })
            .collect();
        ModContext {
            mod_root: None,
            active_idx,
            files: entries,
        }
    }

    #[test]
    fn mirrors_all_14_x4_ide_features_checks() {
        let md = sample_md();
        let t_xml = "<language id=\"44\">\n  <page id=\"998801\">\n    <t id=\"1\">Patrol Ready</t>\n    <t id=\"2\">Sector Clear</t>\n  </page>\n</language>";
        let lua_src = "local PAGE = 998801\nlocal txt = ReadText(PAGE, 1)\nlocal inc = ReadText(998801, ";

        // 1. Folding ranges
        let folds = compute_folding_ranges(&md);
        assert!(folds.iter().any(|f| f.kind == Some(FoldingRangeKind::Region)));
        assert!(folds.iter().filter(|f| f.kind.is_none()).count() >= 4);

        // 2 & 3. Document symbols (outline + diff)
        let syms = compute_document_symbols("md/demo.xml", &md);
        assert_eq!(syms.len(), 1);
        assert_eq!(syms[0].name, "DemoScript");
        let root_children = syms[0].children.as_ref().unwrap();
        assert!(root_children.iter().any(|c| c.name == "HelperLib"));
        assert!(root_children.iter().any(|c| {
            c.name == "Start"
                && c.children
                    .as_ref()
                    .is_some_and(|ch| ch.iter().any(|v| v.name == "$s"))
        }));

        let diff_syms = compute_document_symbols(
            "md/gm_patrol.xml",
            "<diff>\n  <replace sel=\"/mdscript/cues/cue[@name='A']\"/>\n</diff>",
        );
        assert_eq!(diff_syms.len(), 1);
        assert!(diff_syms[0].name.contains("replace"));

        // 4. Semantic tokens
        let sem = compute_semantic_tokens(&md);
        assert!(sem.data.len() >= 6);

        // 5. Inlay hints
        let ctx_md = make_ctx(
            vec![("md/demo.xml", &md), ("t/0001-l044.xml", t_xml)],
            0,
        );
        let hints = compute_inlay_hints(&ctx_md, None);
        assert!(hints.iter().any(|h| {
            matches!(&h.label, InlayHintLabel::String(s) if s.contains("Patrol Ready"))
        }));
        assert!(hints.iter().any(|h| {
            matches!(&h.label, InlayHintLabel::String(s) if s == ": ship?")
        }));

        // 6. CodeLens
        let lenses = compute_code_lenses(&ctx_md);
        let lib_lens = lenses
            .iter()
            .find(|l| {
                l.command
                    .as_ref()
                    .and_then(|c| c.arguments.as_ref())
                    .and_then(|a| a.first())
                    == Some(&json!("HelperLib"))
            })
            .unwrap();
        assert_eq!(
            lib_lens.command.as_ref().unwrap().title,
            "1 reference"
        );

        // 7. Signature help
        let fmt_anchor = md.find("player.sector.knownname").unwrap();
        let fmt_pos = offset_to_lsp_pos(&md, fmt_anchor);
        let sig = compute_signature_help(&ctx_md, fmt_pos).unwrap();
        assert_eq!(sig.signatures[0].parameters.as_ref().unwrap().len(), 2);
        assert_eq!(sig.active_parameter, Some(1));

        // 8, 9, 10. Lua ReadText definition + completion
        let ctx_lua = make_ctx(
            vec![("ui/demo.lua", lua_src), ("t/0001-l044.xml", t_xml)],
            0,
        );
        let rt_pos = offset_to_lsp_pos(lua_src, lua_src.find("PAGE, 1").unwrap() + 2);
        let defs = compute_definition(&ctx_lua, rt_pos);
        assert_eq!(defs.len(), 1);
        assert!(defs[0].uri.as_str().ends_with("t/0001-l044.xml"));
        assert_eq!(defs[0].range.start.line, 2);

        let end_pos = offset_to_lsp_pos(lua_src, lua_src.len());
        let comps = compute_completion(&ctx_lua, end_pos, &CorpusIndex::default(), &XsdRegistry::default());
        assert_eq!(comps.len(), 2);
        assert_eq!(comps[0].label, "1");

        // 11 & 12. Rename ($s -> 3 edits; HelperLib -> 2 edits)
        let var_pos = offset_to_lsp_pos(&md, md.find("$s.knownname").unwrap() + 1);
        let var_edit = compute_rename(&ctx_md, var_pos, "$targetShip")
            .unwrap()
            .unwrap();
        let var_edits = var_edit.changes.unwrap().values().next().unwrap().len();
        assert_eq!(var_edits, 3);

        let lib_pos = offset_to_lsp_pos(&md, md.find("HelperLib\"").unwrap() + 2);
        let lib_edit = compute_rename(&ctx_md, lib_pos, "RenamedLib")
            .unwrap()
            .unwrap();
        let lib_edits = lib_edit.changes.unwrap().values().next().unwrap().len();
        assert_eq!(lib_edits, 2);

        // 13 & 14. XML Quick Fixes (typo set_valeu -> set_value + Create cue "NewCue")
        let typo_xml = "<mdscript name=\"T\"><cues><cue name=\"C\"><actions><set_valeu exact=\"1\"/><signal_cue cue=\"NewCue\"/></actions></cue></cues></mdscript>";
        let ctx_typo = make_ctx(vec![("md/typo.xml", typo_xml)], 0);
        let typo_pos = offset_to_lsp_pos(typo_xml, typo_xml.find("set_valeu").unwrap() + 3);
        let empty_ctx = CodeActionContext {
            diagnostics: Vec::new(),
            only: None,
            trigger_kind: None,
        };
        let typo_fixes = compute_code_actions(
            &ctx_typo,
            Range::new(typo_pos, typo_pos),
            &empty_ctx,
            &XsdRegistry::default(),
        );
        assert!(typo_fixes.iter().any(|ca| match ca {
            CodeActionOrCommand::CodeAction(a) => {
                a.is_preferred == Some(true)
                    && a.edit
                        .as_ref()
                        .and_then(|e| e.changes.as_ref())
                        .is_some_and(|ch| ch.values().flatten().any(|te| te.new_text == "set_value"))
            }
            _ => false,
        }));

        let cue_pos = offset_to_lsp_pos(typo_xml, typo_xml.find("NewCue").unwrap() + 2);
        let create_fixes = compute_code_actions(
            &ctx_typo,
            Range::new(cue_pos, cue_pos),
            &empty_ctx,
            &XsdRegistry::default(),
        );
        assert!(create_fixes.iter().any(|ca| match ca {
            CodeActionOrCommand::CodeAction(a) => a.title == "Create cue \"NewCue\"",
            _ => false,
        }));
    }
}
