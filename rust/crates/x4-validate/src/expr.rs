use crate::xml_wellformed::LineIndex;
use crate::{Diagnostic, Severity};
use regex::Regex;
use roxmltree::{Document, Node};
use std::collections::HashSet;
use std::sync::OnceLock;
use x4_corpus::{CorpusIndex, ScriptPropertyCatalog};

const EXPR_ATTRS: &[&str] = &[
    "value", "exact", "min", "max", "chance", "check", "object", "target", "group", "list",
    "table", "key", "param", "param2", "param3", "negate", "amount", "currency",
];

fn is_script_file(rel_path: &str, doc: &Document<'_>) -> bool {
    let lower = rel_path.replace('\\', "/").to_ascii_lowercase();
    let root = doc.root_element().tag_name().name();
    lower.starts_with("md/")
        || lower.starts_with("aiscripts/")
        || root == "mdscript"
        || root == "aiscript"
}

fn should_check_expr_attr(tag: &str, attr: &str) -> bool {
    if matches!(tag, "param" | "input_param") && attr == "value" {
        return true;
    }
    if tag == "do_if" || tag == "do_elseif" || tag == "do_while" || tag == "check_value" {
        return attr == "value";
    }
    if tag == "set_value" && (attr == "exact" || attr == "min" || attr == "max") {
        return true;
    }
    if matches!(tag, "do_all" | "delay") && (attr == "exact" || attr == "min" || attr == "max") {
        return true;
    }
    EXPR_ATTRS.contains(&attr) && !matches!(tag, "comment" | "debug_text" | "cue" | "library")
}

pub fn validate_script_expressions(
    rel_path: &str,
    clean_text: &str,
    line_idx: &LineIndex,
    doc: &Document<'_>,
    corpus: &CorpusIndex,
    out: &mut Vec<Diagnostic>,
) {
    if !is_script_file(rel_path, doc) {
        return;
    }

    let mut stack: Vec<Node<'_, '_>> = vec![doc.root_element()];
    while let Some(node) = stack.pop() {
        if !node.is_element() {
            continue;
        }
        let tag = node.tag_name().name();
        let (line, col) = line_idx.pos_clean(clean_text, node.range().start);

        if tag == "do_else" || tag == "do_elseif" {
            let mut prev = node.prev_sibling();
            while let Some(p) = prev {
                if p.is_element() {
                    break;
                }
                prev = p.prev_sibling();
            }
            let valid_prev = prev.is_some_and(|p| {
                let pt = p.tag_name().name();
                pt == "do_if" || pt == "do_elseif"
            });
            if !valid_prev {
                out.push(Diagnostic {
                    severity: Severity::Error,
                    code: "md.unmatched_else".to_string(),
                    category: "expression".to_string(),
                    message: format!(
                        "<{tag}> must immediately follow <do_if> or <do_elseif>."
                    ),
                    file_path: Some(rel_path.to_string()),
                    line: Some(line),
                    column: Some(col),
                    source_ref: None,
                    suggestions: Vec::new(),
                });
            }
        }

        for attr in node.attributes() {
            let aname = attr.name();
            if !should_check_expr_attr(tag, aname) {
                continue;
            }
            let val = attr.value();
            check_expr_value(
                rel_path,
                line,
                col,
                tag,
                aname,
                val,
                &corpus.script_properties,
                out,
            );
        }

        for ch in node.children().filter(|c| c.is_element()) {
            stack.push(ch);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn check_expr_value(
    rel_path: &str,
    line: u32,
    col: u32,
    tag: &str,
    attr: &str,
    val: &str,
    sp_catalog: &ScriptPropertyCatalog,
    out: &mut Vec<Diagnostic>,
) {
    let trimmed = val.trim();
    if trimmed.is_empty() && matches!(tag, "do_if" | "do_elseif" | "do_while" | "check_value") && attr == "value" {
        out.push(Diagnostic {
            severity: Severity::Error,
            code: "expression-syntax".to_string(),
            category: "expression".to_string(),
            message: format!("Empty expression in '{attr}' attribute of <{tag}>."),
            file_path: Some(rel_path.to_string()),
            line: Some(line),
            column: Some(col),
            source_ref: None,
            suggestions: Vec::new(),
        });
        return;
    }

    // 1. Delimiter balance ignoring single-quoted string literals and XPath/dynamic $
    let mut paren: i32 = 0;
    let mut bracket: i32 = 0;
    let mut brace: i32 = 0;
    let mut in_sq = false;
    let mut escaped = false;
    let chars: Vec<char> = trimmed.chars().collect();
    let mut i = 0usize;
    while i < chars.len() {
        let c = chars[i];
        if in_sq {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '\'' {
                in_sq = false;
            }
            i += 1;
            continue;
        }
        match c {
            '\'' => in_sq = true,
            '(' => paren += 1,
            ')' => {
                paren -= 1;
                if paren < 0 {
                    break;
                }
            }
            '[' => bracket += 1,
            ']' => {
                bracket -= 1;
                if bracket < 0 {
                    break;
                }
            }
            '{' => brace += 1,
            '}' => {
                brace -= 1;
                if brace < 0 {
                    break;
                }
            }
            _ => {}
        }
        i += 1;
    }

    if in_sq || paren != 0 || bracket != 0 || brace != 0 {
        out.push(Diagnostic {
            severity: Severity::Error,
            code: "expression-syntax".to_string(),
            category: "expression".to_string(),
            message: format!(
                "Unbalanced delimiters or unterminated string in '{attr}' expression on <{tag}>: {trimmed}"
            ),
            file_path: Some(rel_path.to_string()),
            line: Some(line),
            column: Some(col),
            source_ref: None,
            suggestions: Vec::new(),
        });
    }

    // 2. Trailing binary keyword operators (`and`, `or`, `+`, `*`, `/`, `==`, `!=`, `lt`, `gt`, `le`, `ge`)
    static TRAILING_OP_RE: OnceLock<Regex> = OnceLock::new();
    let trailing_re = TRAILING_OP_RE.get_or_init(|| {
        Regex::new(r"(?i)(?:^|\s)(?:and|or|==|!=|\+|-|\*|/|lt|gt|le|ge)\s*$").unwrap()
    });
    if trailing_re.is_match(trimmed) && !trimmed.starts_with('-') {
        out.push(Diagnostic {
            severity: Severity::Error,
            code: "expression-syntax".to_string(),
            category: "expression".to_string(),
            message: format!(
                "Incomplete trailing operator in '{attr}' expression on <{tag}>: {trimmed}"
            ),
            file_path: Some(rel_path.to_string()),
            line: Some(line),
            column: Some(col),
            source_ref: None,
            suggestions: Vec::new(),
        });
    }

    // 3. String formatting check: 'fmt'.[arg1, arg2]
    static FMT_CALL_RE: OnceLock<Regex> = OnceLock::new();
    let fmt_re = FMT_CALL_RE.get_or_init(|| {
        Regex::new(r"'((?:[^'\\]|\\.)*)'\.\[([^\]]*)\]").unwrap()
    });
    for cap in fmt_re.captures_iter(trimmed) {
        let fmt_str = &cap[1];
        let args_str = cap[2].trim();
        let (spec_count, bad_spec) = count_format_specifiers(fmt_str);
        if let Some(bad) = bad_spec {
            out.push(Diagnostic {
                severity: Severity::Warning,
                code: "expression-format-specifier".to_string(),
                category: "expression".to_string(),
                message: format!(
                    "Unsupported format specifier '%{bad}' in format string expression."
                ),
                file_path: Some(rel_path.to_string()),
                line: Some(line),
                column: Some(col),
                source_ref: None,
                suggestions: Vec::new(),
            });
        }
        let arg_count = count_top_level_args(args_str);
        if spec_count > arg_count {
            out.push(Diagnostic {
                severity: Severity::Warning,
                code: "format-arguments-missing".to_string(),
                category: "expression".to_string(),
                message: format!(
                    "Format string expects {spec_count} argument(s) but .[…] supplies only {arg_count}."
                ),
                file_path: Some(rel_path.to_string()),
                line: Some(line),
                column: Some(col),
                source_ref: None,
                suggestions: Vec::new(),
            });
        }
    }

    // 4. Text references inside string literals: {page,id}
    static STR_LIT_RE: OnceLock<Regex> = OnceLock::new();
    static TEXT_REF_RE: OnceLock<Regex> = OnceLock::new();
    let str_re = STR_LIT_RE.get_or_init(|| Regex::new(r"'((?:[^'\\]|\\.)*)'").unwrap());
    let brace_re = TEXT_REF_RE.get_or_init(|| Regex::new(r"\{([^{}]*)\}").unwrap());
    for cap in str_re.captures_iter(trimmed) {
        let lit = &cap[1];
        for bcap in brace_re.captures_iter(lit) {
            let inner = bcap[1].trim();
            if inner.is_empty() || inner.contains('$') || inner.contains('%') {
                continue;
            }
            if inner.contains(',') {
                let parts: Vec<&str> = inner.split(',').collect();
                if parts.len() != 2
                    || parts[0].trim().parse::<u64>().is_err()
                    || parts[1].trim().parse::<u64>().is_err()
                {
                    out.push(Diagnostic {
                        severity: Severity::Warning,
                        code: "expression-text-reference".to_string(),
                        category: "expression".to_string(),
                        message: format!(
                            "Malformed text reference '{{{inner}}}' inside string literal (expected '{{page,id}}')."
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

    // 5. Inverted null-safe guard: `not $x? and $x.prop`
    static NEG_GUARD_RE: OnceLock<Regex> = OnceLock::new();
    let ng_re = NEG_GUARD_RE.get_or_init(|| {
        Regex::new(r"(?i)\bnot\s+\$([A-Za-z_]\w*)\?\s+and\s+\$([A-Za-z_]\w*)\.").unwrap()
    });
    for cap in ng_re.captures_iter(trimmed) {
        if cap[1] == cap[2] {
            out.push(Diagnostic {
                severity: Severity::Warning,
                code: "expression-null-safe-exists".to_string(),
                category: "expression".to_string(),
                message: format!(
                    "'not ${}?' followed by 'and ${}.…' dereferences '${}' when it does not exist.",
                    &cap[1], &cap[1], &cap[1]
                ),
                file_path: Some(rel_path.to_string()),
                line: Some(line),
                column: Some(col),
                source_ref: None,
                suggestions: Vec::new(),
            });
        }
    }

    // 6. ScriptProperty root chain validation
    if sp_catalog.loaded {
        check_script_property_chains(rel_path, line, col, trimmed, sp_catalog, out);
    }
}

fn count_format_specifiers(fmt: &str) -> (usize, Option<char>) {
    let mut count = 0usize;
    let mut bad = None;
    let chars: Vec<char> = fmt.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '%' {
            if i + 1 < chars.len() {
                let next = chars[i + 1];
                if next == '%' {
                    i += 2;
                    continue;
                }
                // Consume flags/width/precision e.g. %02d or %.1f
                let mut j = i + 1;
                while j < chars.len() && (chars[j].is_ascii_digit() || matches!(chars[j], '.' | '-' | '+' | ' ' | '#')) {
                    j += 1;
                }
                if j < chars.len() {
                    let conv = chars[j];
                    if matches!(conv, 's' | 'd' | 'i' | 'u' | 'x' | 'X' | 'f' | 'e' | 'E' | 'g' | 'G' | 'o' | 'c') {
                        count += 1;
                    } else if bad.is_none() {
                        bad = Some(conv);
                    }
                    i = j + 1;
                    continue;
                }
            }
        }
        i += 1;
    }
    (count, bad)
}

fn count_top_level_args(args: &str) -> usize {
    if args.is_empty() {
        return 0;
    }
    let mut count = 1usize;
    let mut depth = 0i32;
    let mut in_sq = false;
    let mut escaped = false;
    for c in args.chars() {
        if in_sq {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '\'' {
                in_sq = false;
            }
            continue;
        }
        match c {
            '\'' => in_sq = true,
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth = (depth - 1).max(0),
            ',' if depth == 0 => count += 1,
            _ => {}
        }
    }
    count
}

fn check_script_property_chains(
    rel_path: &str,
    line: u32,
    col: u32,
    expr: &str,
    cat: &ScriptPropertyCatalog,
    out: &mut Vec<Diagnostic>,
) {
    // Strip single-quoted strings first so string text never triggers scriptproperty checks
    let clean = strip_single_quoted_strings(expr);
    static CHAIN_RE: OnceLock<Regex> = OnceLock::new();
    let chain_re = CHAIN_RE.get_or_init(|| {
        Regex::new(r"(?:^|[^A-Za-z0-9_.$@])([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)").unwrap()
    });

    for cap in chain_re.captures_iter(&clean) {
        let chain = &cap[1];
        let parts: Vec<&str> = chain.split('.').collect();
        if parts.len() < 2 {
            continue;
        }
        let root_lc = parts[0].to_ascii_lowercase();
        let Some(kw) = cat.keywords.get(&root_lc) else {
            continue;
        };
        if kw.dynamic {
            continue;
        }
        let prop1_lc = parts[1].to_ascii_lowercase();
        if !keyword_allows_head(cat, &root_lc, &prop1_lc) {
            out.push(Diagnostic {
                severity: Severity::Warning,
                code: "scriptproperty.unknown".to_string(),
                category: "scriptproperty".to_string(),
                message: format!(
                    "Unknown script property '{}.{}' on keyword '{}'.",
                    parts[0], parts[1], parts[0]
                ),
                file_path: Some(rel_path.to_string()),
                line: Some(line),
                column: Some(col),
                source_ref: Some(chain.to_string()),
                suggestions: Vec::new(),
            });
            continue;
        }
        if parts.len() == 2 && !kw.dynamic {
            if let Some(conts) = kw.continuations.get(&prop1_lc) {
                if !conts.is_empty() && !kw.bare_ok.contains(&prop1_lc) && !cat.bare_ok.contains(&prop1_lc) {
                    out.push(Diagnostic {
                        severity: Severity::Warning,
                        code: "scriptproperty.requires_subselector".to_string(),
                        category: "scriptproperty".to_string(),
                        message: format!(
                            "Script property '{}.{}' requires a subselector (e.g. '.{}').",
                            parts[0],
                            parts[1],
                            conts.iter().next().map(String::as_str).unwrap_or("*")
                        ),
                        file_path: Some(rel_path.to_string()),
                        line: Some(line),
                        column: Some(col),
                        source_ref: Some(chain.to_string()),
                        suggestions: Vec::new(),
                    });
                }
            }
        }
    }
}

fn keyword_allows_head(cat: &ScriptPropertyCatalog, kw_name: &str, head: &str) -> bool {
    let mut visited = HashSet::new();
    let mut cur = cat.keywords.get(kw_name);
    let mut is_dt = false;
    while let Some(entry) = cur {
        if !visited.insert((is_dt, entry.name.clone())) {
            break;
        }
        if entry.wildcard || entry.dynamic || entry.heads.contains(head) {
            return true;
        }
        if let Some(ref p) = entry.parent {
            is_dt = true;
            cur = cat.datatypes.get(p).or_else(|| cat.keywords.get(p));
        } else {
            break;
        }
    }
    false
}

fn strip_single_quoted_strings(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_sq = false;
    let mut esc = false;
    for c in s.chars() {
        if in_sq {
            if esc {
                esc = false;
            } else if c == '\\' {
                esc = true;
            } else if c == '\'' {
                in_sq = false;
            }
            out.push(' ');
        } else if c == '\'' {
            in_sq = true;
            out.push(' ');
        } else {
            out.push(c);
        }
    }
    out
}
