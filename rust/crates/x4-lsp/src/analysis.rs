use lsp_types::{Position, Range, Url};
use regex::Regex;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Debug, Clone)]
pub struct DocEntry {
    pub uri: Url,
    pub abs_path: Option<PathBuf>,
    pub rel_path: String,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct ModContext {
    pub mod_root: Option<PathBuf>,
    pub active_idx: usize,
    pub files: Vec<DocEntry>,
}

impl ModContext {
    pub fn active(&self) -> &DocEntry {
        &self.files[self.active_idx]
    }
}

#[derive(Debug, Clone)]
pub struct TEntry {
    pub uri: Url,
    pub rel_path: String,
    pub byte_start: usize,
    pub byte_end: usize,
    pub line: u32,
    pub col: u32,
    pub text: String,
}

/// Converts a byte offset in `text` into an LSP 0-based `(line, utf16_character)` position.
pub fn offset_to_lsp_pos(text: &str, byte_offset: usize) -> Position {
    let mut clamped = byte_offset.min(text.len());
    while clamped > 0 && !text.is_char_boundary(clamped) {
        clamped -= 1;
    }
    let prefix = &text[..clamped];
    let mut line = 0u32;
    let mut line_start = 0usize;
    for (idx, b) in prefix.bytes().enumerate() {
        if b == b'\n' {
            line += 1;
            line_start = idx + 1;
        }
    }
    let slice = &text[line_start..clamped];
    // Strip leading UTF-8 BOM only if at offset 0 on line 0
    let slice = if line == 0 {
        slice.strip_prefix('\u{feff}').unwrap_or(slice)
    } else {
        slice
    };
    let utf16_col = slice.encode_utf16().count() as u32;
    Position {
        line,
        character: utf16_col,
    }
}

/// Converts an LSP 0-based `(line, utf16_character)` position into a UTF-8 byte offset in `text`.
pub fn lsp_pos_to_offset(text: &str, pos: Position) -> usize {
    let mut cur_line = 0u32;
    let mut line_start = 0usize;
    if pos.line > 0 {
        let mut found = false;
        for (idx, b) in text.bytes().enumerate() {
            if b == b'\n' {
                cur_line += 1;
                if cur_line == pos.line {
                    line_start = idx + 1;
                    found = true;
                    break;
                }
            }
        }
        if !found {
            return text.len();
        }
    }
    let line_tail = &text[line_start..];
    let line_end_rel = line_tail
        .find('\n')
        .map(|i| {
            if i > 0 && line_tail.as_bytes()[i - 1] == b'\r' {
                i - 1
            } else {
                i
            }
        })
        .unwrap_or(line_tail.len());
    let line_str = &line_tail[..line_end_rel];
    let bom_offset = if pos.line == 0 && line_str.starts_with('\u{feff}') {
        3
    } else {
        0
    };
    let effective = &line_str[bom_offset..];
    let mut utf16_seen = 0u32;
    for (rel_byte, ch) in effective.char_indices() {
        if utf16_seen >= pos.character {
            return line_start + bom_offset + rel_byte;
        }
        utf16_seen += ch.len_utf16() as u32;
    }
    line_start + bom_offset + effective.len()
}

pub fn byte_span_to_range(text: &str, start: usize, end: usize) -> Range {
    Range {
        start: offset_to_lsp_pos(text, start),
        end: offset_to_lsp_pos(text, end),
    }
}

/// Replaces XML comments, CDATA blocks, and processing instructions with ASCII spaces
/// while preserving newlines and exact byte lengths.
pub fn mask_xml_comments_and_cdata(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = bytes.to_vec();
    let len = bytes.len();
    let mut i = 0usize;

    while i < len {
        if bytes[i] == b'<' {
            if bytes[i..].starts_with(b"<!--") {
                let end = bytes[i + 4..]
                    .windows(3)
                    .position(|w| w == b"-->")
                    .map(|p| i + 4 + p + 3)
                    .unwrap_or(len);
                for b in &mut out[i..end] {
                    if *b != b'\n' {
                        *b = b' ';
                    }
                }
                i = end;
                continue;
            }
            if bytes[i..].starts_with(b"<![CDATA[") {
                let end = bytes[i + 9..]
                    .windows(3)
                    .position(|w| w == b"]]>")
                    .map(|p| i + 9 + p + 3)
                    .unwrap_or(len);
                for b in &mut out[i..end] {
                    if *b != b'\n' {
                        *b = b' ';
                    }
                }
                i = end;
                continue;
            }
            if bytes[i..].starts_with(b"<?") {
                let end = bytes[i + 2..]
                    .windows(2)
                    .position(|w| w == b"?>")
                    .map(|p| i + 2 + p + 2)
                    .unwrap_or(len);
                for b in &mut out[i..end] {
                    if *b != b'\n' {
                        *b = b' ';
                    }
                }
                i = end;
                continue;
            }
        }
        i += 1;
    }

    // Safe because every non-newline byte replaced inside <!--..-->, <![CDATA[..]]>, <?..?>
    // removed complete valid UTF-8 codepoints delimited by ASCII boundaries.
    String::from_utf8_lossy(&out).into_owned()
}

pub fn uri_to_path(uri: &Url) -> Option<PathBuf> {
    if uri.scheme() != "file" {
        return None;
    }
    uri.to_file_path().ok()
}

pub fn path_to_uri(path: &Path) -> Option<Url> {
    let abs = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().ok()?.join(path)
    };
    Url::from_file_path(abs).ok()
}

pub fn normalize_path_string(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let trimmed = raw.strip_prefix("//?/").unwrap_or(&raw);
    if cfg!(windows) {
        trimmed.to_ascii_lowercase()
    } else {
        trimmed.to_string()
    }
}

pub fn normalize_uri_key(uri: &Url) -> String {
    if let Some(p) = uri_to_path(uri) {
        return normalize_path_string(&p);
    }
    uri.as_str().to_string()
}

pub fn find_mod_root(doc_path: &Path) -> Option<PathBuf> {
    let mut cur = if doc_path.is_file() {
        doc_path.parent()?.to_path_buf()
    } else {
        doc_path.to_path_buf()
    };
    for _ in 0..7 {
        if cur.join("content.xml").is_file() {
            return Some(cur);
        }
        if !cur.pop() {
            break;
        }
    }
    None
}

fn infer_rel_from_path(path: &Path) -> String {
    let norm = path.to_string_lossy().replace('\\', "/");
    for marker in ["/md/", "/aiscripts/", "/t/", "/ui/", "/libraries/"] {
        if let Some(idx) = norm.to_ascii_lowercase().rfind(marker) {
            return norm[idx + 1..].to_string();
        }
    }
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document.xml")
        .to_string()
}

pub fn rel_path_for_uri(uri: &Url, mod_root: Option<&Path>) -> String {
    if let Some(abs) = uri_to_path(uri) {
        if let Some(root) = mod_root {
            if let Ok(rel) = abs.strip_prefix(root) {
                return rel.to_string_lossy().replace('\\', "/");
            }
            let abs_norm = normalize_path_string(&abs);
            let root_norm = normalize_path_string(root);
            if let Some(rest) = abs_norm
                .strip_prefix(&root_norm)
                .and_then(|s| s.strip_prefix('/'))
            {
                // Preserve original casing if suffix length aligns
                let tail_len = rest.len();
                let raw = abs.to_string_lossy().replace('\\', "/");
                if raw.len() >= tail_len {
                    return raw[raw.len() - tail_len..].to_string();
                }
                return rest.to_string();
            }
        }
        return infer_rel_from_path(&abs);
    }
    uri.path()
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("document.xml")
        .to_string()
}

fn walk_disk_mod_files(root: &Path, dir: &Path, out: &mut Vec<(String, PathBuf)>) {
    let Ok(rd) = fs::read_dir(dir) else {
        return;
    };
    for entry in rd.flatten() {
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        let Ok(rel) = path.strip_prefix(root) else {
            continue;
        };
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if meta.file_type().is_dir() {
            let top = rel_str.split('/').next().unwrap_or("");
            if matches!(top, ".git" | "node_modules" | "target" | ".forge-backups") {
                continue;
            }
            walk_disk_mod_files(root, &path, out);
        } else if meta.file_type().is_file() {
            let lower = rel_str.to_ascii_lowercase();
            if lower == "content.xml"
                || lower == "forge.rules.json"
                || lower.ends_with(".xml")
                || lower.ends_with(".lua")
            {
                if meta.len() <= 8 * 1024 * 1024 {
                    out.push((rel_str, path));
                }
            }
        }
    }
}

pub fn collect_mod_files(
    doc_uri: &Url,
    open_docs: &HashMap<String, (Url, String)>,
) -> ModContext {
    let doc_key = normalize_uri_key(doc_uri);
    let doc_path = uri_to_path(doc_uri);
    let mod_root = doc_path.as_deref().and_then(find_mod_root);

    let mut entries_by_key: HashMap<String, DocEntry> = HashMap::new();

    if let Some(ref root) = mod_root {
        let mut disk_files = Vec::new();
        walk_disk_mod_files(root, root, &mut disk_files);
        disk_files.sort_by(|a, b| a.0.cmp(&b.0));
        for (rel, abs) in disk_files {
            if let Some(u) = path_to_uri(&abs) {
                let k = normalize_uri_key(&u);
                if let Some((open_u, open_text)) = open_docs.get(&k) {
                    entries_by_key.insert(
                        k,
                        DocEntry {
                            uri: open_u.clone(),
                            abs_path: Some(abs),
                            rel_path: rel,
                            text: open_text.clone(),
                        },
                    );
                } else if let Ok(bytes) = fs::read(&abs) {
                    if !bytes.contains(&0) {
                        entries_by_key.insert(
                            k,
                            DocEntry {
                                uri: u,
                                abs_path: Some(abs),
                                rel_path: rel,
                                text: String::from_utf8_lossy(&bytes).into_owned(),
                            },
                        );
                    }
                }
            }
        }
    }

    // Overlay open docs
    for (k, (u, text)) in open_docs {
        if !entries_by_key.contains_key(k) {
            let abs = uri_to_path(u);
            let rel = rel_path_for_uri(u, mod_root.as_deref());
            entries_by_key.insert(
                k.clone(),
                DocEntry {
                    uri: u.clone(),
                    abs_path: abs,
                    rel_path: rel,
                    text: text.clone(),
                },
            );
        }
    }

    // Ensure target document itself is present even if not opened via didOpen (e.g. disk file)
    if !entries_by_key.contains_key(&doc_key) {
        let text = doc_path
            .as_deref()
            .and_then(|p| fs::read_to_string(p).ok())
            .unwrap_or_default();
        let rel = rel_path_for_uri(doc_uri, mod_root.as_deref());
        entries_by_key.insert(
            doc_key.clone(),
            DocEntry {
                uri: doc_uri.clone(),
                abs_path: doc_path,
                rel_path: rel,
                text,
            },
        );
    }

    let mut files: Vec<DocEntry> = entries_by_key.into_values().collect();
    files.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    let active_idx = files
        .iter()
        .position(|d| normalize_uri_key(&d.uri) == doc_key)
        .unwrap_or(0);

    ModContext {
        mod_root,
        active_idx,
        files,
    }
}

/// Normalizes page/id integers like `"0998801"` -> `"998801"` to match X4 `t/` lookup rules.
pub fn normalize_num_str(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Ok(n) = trimmed.parse::<u64>() {
        n.to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn build_t_index(ctx: &ModContext) -> BTreeMap<(String, String), TEntry> {
    static PAGE_RE: OnceLock<Regex> = OnceLock::new();
    static T_RE: OnceLock<Regex> = OnceLock::new();
    static ID_ATTR_RE: OnceLock<Regex> = OnceLock::new();

    let page_re = PAGE_RE.get_or_init(|| Regex::new(r"(?is)<page\b([^>]*)>([\s\S]*?)</page>").unwrap());
    let t_re = T_RE.get_or_init(|| Regex::new(r"(?is)<t\b([^>]*)>([\s\S]*?)</t>").unwrap());
    let id_re = ID_ATTR_RE.get_or_init(|| Regex::new(r#"(?i)\bid\s*=\s*["'](\d+)["']"#).unwrap());

    let mut index = BTreeMap::new();
    for doc in &ctx.files {
        let lower = doc.rel_path.to_ascii_lowercase();
        let is_t = lower.starts_with("t/") || doc.text.contains("<language");
        if !is_t {
            continue;
        }
        let masked = mask_xml_comments_and_cdata(&doc.text);
        for pm in page_re.captures_iter(&masked) {
            let p_attrs = &pm[1];
            let Some(pid_cap) = id_re.captures(p_attrs) else {
                continue;
            };
            let page_id = normalize_num_str(&pid_cap[1]);
            let full_m = pm.get(0).unwrap();
            let body_m = pm.get(2).unwrap();
            let body_offset = body_m.start();

            for tm in t_re.captures_iter(body_m.as_str()) {
                let t_attrs = &tm[1];
                let Some(tid_cap) = id_re.captures(t_attrs) else {
                    continue;
                };
                let t_id = normalize_num_str(&tid_cap[1]);
                let tm_full = tm.get(0).unwrap();
                let tm_body = tm.get(2).unwrap();
                let exact_start = body_offset + tm_full.start();
                let exact_end = body_offset + tm_full.end();
                let body_start = body_offset + tm_body.start();
                let body_end = body_offset + tm_body.end();
                let pos = offset_to_lsp_pos(&doc.text, exact_start);
                let raw_text = if body_end <= doc.text.len() && body_start <= body_end {
                    doc.text[body_start..body_end].trim().to_string()
                } else {
                    String::new()
                };
                index.entry((page_id.clone(), t_id)).or_insert(TEntry {
                    uri: doc.uri.clone(),
                    rel_path: doc.rel_path.clone(),
                    byte_start: exact_start,
                    byte_end: exact_end,
                    line: pos.line,
                    col: pos.character,
                    text: raw_text,
                });
            }
            let _ = full_m;
        }
    }
    index
}

pub fn collect_lua_numeric_constants(src: &str) -> HashMap<String, String> {
    static LOCAL_NUM_RE: OnceLock<Regex> = OnceLock::new();
    static LOCAL_TBL_RE: OnceLock<Regex> = OnceLock::new();
    static FIELD_NUM_RE: OnceLock<Regex> = OnceLock::new();

    let num_re =
        LOCAL_NUM_RE.get_or_init(|| Regex::new(r"\blocal\s+([A-Za-z_]\w*)\s*=\s*(\d+)\b").unwrap());
    let tbl_re =
        LOCAL_TBL_RE.get_or_init(|| Regex::new(r"\blocal\s+([A-Za-z_]\w*)\s*=\s*\{([^}]*)\}").unwrap());
    let field_re = FIELD_NUM_RE.get_or_init(|| Regex::new(r"\b([A-Za-z_]\w*)\s*=\s*(\d+)\b").unwrap());

    let mut out = HashMap::new();
    for cap in num_re.captures_iter(src) {
        out.insert(cap[1].to_string(), normalize_num_str(&cap[2]));
    }
    for cap in tbl_re.captures_iter(src) {
        let tbl = &cap[1];
        for fcap in field_re.captures_iter(&cap[2]) {
            out.insert(format!("{tbl}.{}", &fcap[1]), normalize_num_str(&fcap[2]));
        }
    }
    out
}

pub fn resolve_lua_readtext_at_offset(src: &str, offset: usize) -> Option<(String, String)> {
    static CALL_RE: OnceLock<Regex> = OnceLock::new();
    let call_re = CALL_RE.get_or_init(|| {
        Regex::new(
            r"\bReadText\s*\(\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?|\d+)\s*,\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?|\d+)\s*\)",
        )
        .unwrap()
    });
    let consts = collect_lua_numeric_constants(src);
    for cap in call_re.captures_iter(src) {
        let m = cap.get(0).unwrap();
        if offset < m.start() || offset > m.end() {
            continue;
        }
        let raw_page = &cap[1];
        let raw_id = &cap[2];
        let page = if raw_page.bytes().all(|b| b.is_ascii_digit()) {
            Some(normalize_num_str(raw_page))
        } else {
            consts.get(raw_page).cloned()
        };
        let id = if raw_id.bytes().all(|b| b.is_ascii_digit()) {
            Some(normalize_num_str(raw_id))
        } else {
            consts.get(raw_id).cloned()
        };
        if let (Some(p), Some(i)) = (page, id) {
            return Some((p, i));
        }
    }
    None
}

pub fn complete_lua_readtext_at_offset(src: &str, offset: usize) -> Option<(Option<String>, String)> {
    static ARG2_RE: OnceLock<Regex> = OnceLock::new();
    static ARG1_RE: OnceLock<Regex> = OnceLock::new();

    let arg2_re = ARG2_RE.get_or_init(|| {
        Regex::new(r"\bReadText\s*\(\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?|\d+)\s*,\s*(\d*)$")
            .unwrap()
    });
    let arg1_re = ARG1_RE.get_or_init(|| Regex::new(r"\bReadText\s*\(\s*(\d*)$").unwrap());

    let safe_end = {
        let mut e = offset.min(src.len());
        while e > 0 && !src.is_char_boundary(e) {
            e -= 1;
        }
        e
    };
    let mut start = safe_end.saturating_sub(128);
    while start < safe_end && !src.is_char_boundary(start) {
        start += 1;
    }
    let before = &src[start..safe_end];
    if let Some(cap) = arg2_re.captures(before) {
        let raw_page = &cap[1];
        let consts = collect_lua_numeric_constants(src);
        let page = if raw_page.bytes().all(|b| b.is_ascii_digit()) {
            Some(normalize_num_str(raw_page))
        } else {
            consts.get(raw_page).cloned()
        };
        if let Some(p) = page {
            return Some((Some(p), cap[2].to_string()));
        }
    }
    if let Some(cap) = arg1_re.captures(before) {
        return Some((None, cap[1].to_string()));
    }
    None
}

#[derive(Debug, Clone)]
pub struct AttrMatch {
    pub name_lower: String,
    pub value: String,
    pub val_start: usize,
    pub val_end: usize,
}

pub fn extract_attrs_with_offsets(attr_raw: &str, attr_base_offset: usize) -> Vec<AttrMatch> {
    static ATTR_RE: OnceLock<Regex> = OnceLock::new();
    let re = ATTR_RE.get_or_init(|| {
        Regex::new(r#"([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')"#).unwrap()
    });
    let mut out = Vec::new();
    for cap in re.captures_iter(attr_raw) {
        let m_name = cap.get(1).unwrap();
        let m_val = cap.get(2).or_else(|| cap.get(3)).unwrap();
        out.push(AttrMatch {
            name_lower: m_name.as_str().to_ascii_lowercase(),
            value: m_val.as_str().to_string(),
            val_start: attr_base_offset + m_val.start(),
            val_end: attr_base_offset + m_val.end(),
        });
    }
    out
}

pub fn infer_var_types(text: &str) -> HashMap<String, (String, bool)> {
    static TAG_RE: OnceLock<Regex> = OnceLock::new();
    static VAR_RE: OnceLock<Regex> = OnceLock::new();
    let tag_re = TAG_RE.get_or_init(|| {
        Regex::new(r#"(?s)<([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)/?>"#).unwrap()
    });
    let var_re = VAR_RE.get_or_init(|| Regex::new(r"^\$[A-Za-z_]\w*$").unwrap());

    let masked = mask_xml_comments_and_cdata(text);
    let mut inferred: HashMap<String, (String, bool)> = HashMap::new();

    for cap in tag_re.captures_iter(&masked) {
        let tag_m = cap.get(1).unwrap();
        let tag = tag_m.as_str().to_ascii_lowercase();
        let attrs_m = cap.get(2).unwrap();
        let attrs = extract_attrs_with_offsets(attrs_m.as_str(), attrs_m.start());

        let name_val = attrs
            .iter()
            .find(|a| a.name_lower == "name" || a.name_lower == "groupname")
            .map(|a| a.value.trim());
        let Some(vname) = name_val else {
            continue;
        };

        let multiple = attrs
            .iter()
            .find(|a| a.name_lower == "multiple")
            .is_some_and(|a| matches!(a.value.trim().to_ascii_lowercase().as_str(), "true" | "1"));

        if tag == "param" {
            if let Some(t) = attrs.iter().find(|a| a.name_lower == "type") {
                let key = format!("${}", vname.trim_start_matches('$')).to_ascii_lowercase();
                inferred.entry(key).or_insert((t.value.trim().to_string(), false));
            }
            continue;
        }

        if !var_re.is_match(vname) {
            continue;
        }

        let guessed = match tag.as_str() {
            "find_ship" | "create_ship" => Some((if multiple { "list" } else { "ship" }, true)),
            "find_station" | "create_station" => {
                Some((if multiple { "list" } else { "station" }, true))
            }
            "find_sector" => Some((if multiple { "list" } else { "sector" }, true)),
            "find_cluster" => Some((if multiple { "list" } else { "cluster" }, true)),
            "find_zone" => Some((if multiple { "list" } else { "zone" }, true)),
            "find_object" => Some((if multiple { "list" } else { "object" }, true)),
            "find_dockingbay" => Some((if multiple { "list" } else { "dockingbay" }, true)),
            "create_group" => Some(("group", true)),
            "create_list" => Some(("list", true)),
            _ => None,
        };

        if let Some((ty, is_guess)) = guessed {
            inferred
                .entry(vname.to_ascii_lowercase())
                .or_insert((ty.to_string(), is_guess));
        }
    }

    inferred
}

/// Checks whether a sorted slice of open-doc normalized keys contains `key`.
pub fn sorted_unique_paths(ctx: &ModContext) -> HashSet<String> {
    ctx.files.iter().map(|f| f.rel_path.clone()).collect()
}
