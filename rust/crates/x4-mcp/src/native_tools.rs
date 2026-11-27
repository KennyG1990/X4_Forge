use base64::{engine::general_purpose::STANDARD as BASE64_STD, Engine as _};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use url::Url;
use x4_catdat::{
    extract_cat_entry, parse_cat_file, safe_catalog_name, MAX_CAT_ENTRIES, MAX_CAT_MANIFEST_BYTES,
};
use x4_corpus::{load_or_build_corpus, CorpusIndex};
use x4_lsp::analysis::{collect_mod_files, path_to_uri};
use x4_lsp::providers::{
    compute_code_lenses, compute_diagnostics, compute_document_symbols, count_document_symbols,
};
use x4_tree::{hash_tree, HashTreeOptions};
use x4_validate::xsd::XsdRegistry;
use x4_validate::{
    resolve_corpus_and_schemas, validate_mod, SeverityGate, ValidateOptions,
};

pub const NATIVE_TOOL_NAMES: &[&str] = &[
    "x4_validate_mod",
    "x4_scan_corpus",
    "x4_search_corpus",
    "x4_hash_tree",
    "x4_cat_list",
    "x4_cat_extract",
    "x4_inspect_document",
];

pub fn is_native_tool(name: &str) -> bool {
    NATIVE_TOOL_NAMES.contains(&name)
}

#[derive(Default)]
pub struct NativeState {
    pub default_unpacked: Option<PathBuf>,
    pub default_cache: Option<PathBuf>,
    pub corpus_cache: HashMap<String, (CorpusIndex, XsdRegistry)>,
    pub empty_pair: (CorpusIndex, XsdRegistry),
}

impl NativeState {
    pub fn new(unpacked: Option<PathBuf>, cache: Option<PathBuf>) -> Self {
        Self {
            default_unpacked: unpacked,
            default_cache: cache,
            corpus_cache: HashMap::new(),
            empty_pair: (CorpusIndex::default(), XsdRegistry::default()),
        }
    }

    fn get_or_load_refs(
        &mut self,
        unpacked_opt: Option<&str>,
        cache_opt: Option<&str>,
    ) -> Result<(&CorpusIndex, &XsdRegistry), String> {
        let up = unpacked_opt
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .or_else(|| self.default_unpacked.clone())
            .or_else(|| {
                std::env::var("X4_REFERENCE_ROOT")
                    .ok()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .map(PathBuf::from)
            });
        let cp = cache_opt
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .or_else(|| self.default_cache.clone());

        let Some(up_path) = up else {
            return Ok((&self.empty_pair.0, &self.empty_pair.1));
        };
        let key = format!(
            "{}|{}",
            up_path.to_string_lossy(),
            cp.as_ref().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()
        );
        if !self.corpus_cache.contains_key(&key) {
            let v_opts = ValidateOptions {
                unpacked_root: Some(up_path),
                corpus_cache: cp,
                ..Default::default()
            };
            let pair = resolve_corpus_and_schemas(&v_opts)?;
            self.corpus_cache.insert(key.clone(), pair);
        }
        let pair = &self.corpus_cache[&key];
        Ok((&pair.0, &pair.1))
    }
}

fn meta_native() -> Value {
    json!({
        "x4forge/native": true,
        "x4forge/engine": "rust"
    })
}

pub fn list_native_tools() -> Vec<Value> {
    vec![
        json!({
            "name": "x4_validate_mod",
            "description": "Validate an X4 mod directory in-process via pure Rust (XML/XSD, expressions, MD/AIScript cross-refs, Lua syntax, and forge.rules.json).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "modDir": { "type": "string", "description": "Absolute or workspace path to the mod directory." },
                    "unpackedRoot": { "type": "string", "description": "Optional path to unpacked X4 game corpus." },
                    "gameRoot": { "type": "string", "description": "Optional path to packed game directory containing XSD schemas." },
                    "cachePath": { "type": "string", "description": "Optional path to CorpusIndex JSON cache." },
                    "failOn": { "type": "string", "enum": ["error", "warning", "info", "hint"] },
                    "fix": { "type": "boolean", "description": "Apply unambiguous preferred tag typo auto-fixes." }
                },
                "required": ["modDir"],
                "additionalProperties": false
            },
            "_meta": meta_native()
        }),
        json!({
            "name": "x4_scan_corpus",
            "description": "Scan and index unpacked vanilla + DLC X4 files in parallel, returning corpus counts or full index.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "unpackedRoot": { "type": "string" },
                    "cachePath": { "type": "string" },
                    "summaryOnly": { "type": "boolean" }
                },
                "required": [],
                "additionalProperties": false
            },
            "_meta": meta_native()
        }),
        json!({
            "name": "x4_search_corpus",
            "description": "Search loaded X4 corpus (factions, wares, macros, sectors, aiscripts, orders, md providers, scriptproperties).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "kind": { "type": "string", "enum": ["all", "faction", "ware", "macro", "sector", "aiscript", "order", "md", "scriptproperty"] },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 200 },
                    "unpackedRoot": { "type": "string" },
                    "cachePath": { "type": "string" }
                },
                "required": ["query"],
                "additionalProperties": false
            },
            "_meta": meta_native()
        }),
        json!({
            "name": "x4_hash_tree",
            "description": "Multi-core SHA-256 hash and file tree walk (rejects symlinks/reparse points cleanly).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "root": { "type": "string" },
                    "checkUtf8": { "type": "boolean" },
                    "allowMissing": { "type": "boolean" },
                    "maxEntries": { "type": "integer", "minimum": 1 },
                    "maxBytes": { "type": "integer", "minimum": 1 },
                    "excludeDirs": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["root"],
                "additionalProperties": false
            },
            "_meta": meta_native()
        }),
        json!({
            "name": "x4_cat_list",
            "description": "Parse an X4 .cat catalog manifest and list matching entries.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "catPath": { "type": "string" },
                    "strict": { "type": "boolean" },
                    "filter": { "type": "string" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 2000 }
                },
                "required": ["catPath"],
                "additionalProperties": false
            },
            "_meta": meta_native()
        }),
        json!({
            "name": "x4_cat_extract",
            "description": "Extract a single asset from an X4 .cat/.dat catalog pair to disk or inline UTF-8/base64.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "catPath": { "type": "string" },
                    "datPath": { "type": "string" },
                    "entryName": { "type": "string" },
                    "outPath": { "type": "string" },
                    "maxInlineBytes": { "type": "integer", "minimum": 1, "maximum": 1048576 }
                },
                "required": ["catPath", "datPath", "entryName"],
                "additionalProperties": false
            },
            "_meta": meta_native()
        }),
        json!({
            "name": "x4_inspect_document",
            "description": "Inspect a single X4 XML or Lua document for outline symbols, CodeLenses, and diagnostics.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "text": { "type": "string" },
                    "relPath": { "type": "string" },
                    "unpackedRoot": { "type": "string" }
                },
                "required": [],
                "additionalProperties": false
            },
            "_meta": meta_native()
        }),
    ]
}

fn opt_str<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(|v| v.as_str())
}

fn opt_bool(args: &Value, key: &str) -> Option<bool> {
    args.get(key).and_then(|v| v.as_bool())
}

fn opt_u64(args: &Value, key: &str) -> Option<u64> {
    args.get(key).and_then(|v| v.as_u64())
}

pub fn call_native_tool(
    state: &mut NativeState,
    name: &str,
    args: &Value,
) -> Result<Value, (i32, String)> {
    let obj = args.as_object().ok_or_else(|| {
        (-32602, format!("Invalid arguments for {name}: expected JSON object"))
    })?;

    match name {
        "x4_validate_mod" => {
            let mod_dir = opt_str(args, "modDir")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| (-32602, "x4_validate_mod requires non-empty string 'modDir'".to_string()))?;
            let fail_on = match opt_str(args, "failOn") {
                Some(g) => Some(SeverityGate::parse(g).map_err(|e| (-32602, e))?),
                None => None,
            };
            let unpacked = opt_str(args, "unpackedRoot")
                .map(PathBuf::from)
                .or_else(|| state.default_unpacked.clone());
            let game = opt_str(args, "gameRoot").map(PathBuf::from);
            let cache = opt_str(args, "cachePath")
                .map(PathBuf::from)
                .or_else(|| state.default_cache.clone());
            let fix = opt_bool(args, "fix").unwrap_or(false);

            let report = validate_mod(
                Path::new(mod_dir),
                &ValidateOptions {
                    unpacked_root: unpacked,
                    game_root: game,
                    extension_roots: Vec::new(),
                    corpus_cache: cache,
                    apply_fix: fix,
                    fail_on,
                },
            )
            .map_err(|e| (-32603, e))?;
            Ok(serde_json::to_value(report).unwrap())
        }
        "x4_scan_corpus" => {
            let up = opt_str(args, "unpackedRoot")
                .map(PathBuf::from)
                .or_else(|| state.default_unpacked.clone())
                .or_else(|| {
                    std::env::var("X4_REFERENCE_ROOT")
                        .ok()
                        .filter(|s| !s.trim().is_empty())
                        .map(PathBuf::from)
                })
                .ok_or_else(|| {
                    (
                        -32602,
                        "x4_scan_corpus requires 'unpackedRoot' (or --unpacked / X4_REFERENCE_ROOT)"
                            .to_string(),
                    )
                })?;
            let cache = opt_str(args, "cachePath")
                .map(PathBuf::from)
                .or_else(|| state.default_cache.clone());
            let summary_only = opt_bool(args, "summaryOnly").unwrap_or(true);
            let corpus = load_or_build_corpus(&up, cache.as_deref()).map_err(|e| (-32603, e))?;
            let reg = XsdRegistry::load(&corpus.schema_files);
            let key = format!(
                "{}|{}",
                up.to_string_lossy(),
                cache.as_ref().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()
            );
            let out = if summary_only {
                json!({
                    "version": corpus.version,
                    "root": corpus.root,
                    "signature": corpus.signature,
                    "fileCount": corpus.file_count,
                    "factions": corpus.factions.len(),
                    "wares": corpus.wares.len(),
                    "macros": corpus.macros.len(),
                    "sectors": corpus.sectors.len(),
                    "aiScripts": corpus.ai_scripts.len(),
                    "orders": corpus.orders.len(),
                    "mdProviders": corpus.md_providers.len(),
                    "scriptPropertyKeywords": corpus.script_properties.keywords.len(),
                    "scriptPropertyDatatypes": corpus.script_properties.datatypes.len(),
                    "schemaFiles": corpus.schema_files.len(),
                })
            } else {
                serde_json::to_value(&corpus).unwrap()
            };
            state.corpus_cache.insert(key, (corpus, reg));
            Ok(out)
        }
        "x4_search_corpus" => {
            let query = opt_str(args, "query")
                .map(|s| s.trim().to_ascii_lowercase())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| (-32602, "x4_search_corpus requires non-empty string 'query'".to_string()))?;
            let kind = opt_str(args, "kind").unwrap_or("all").to_ascii_lowercase();
            let limit = opt_u64(args, "limit").unwrap_or(50).clamp(1, 200) as usize;
            let (corpus, _) = state
                .get_or_load_refs(opt_str(args, "unpackedRoot"), opt_str(args, "cachePath"))
                .map_err(|e| (-32603, e))?;

            let mut items: Vec<Value> = Vec::new();
            let mut matched_total = 0usize;
            let want = |k: &str| kind == "all" || kind == k;

            if want("faction") {
                for f in &corpus.factions {
                    if f.contains(&query) {
                        matched_total += 1;
                        if items.len() < limit {
                            items.push(json!({ "kind": "faction", "id": f }));
                        }
                    }
                }
            }
            if want("ware") {
                for w in &corpus.wares {
                    if w.contains(&query) {
                        matched_total += 1;
                        if items.len() < limit {
                            items.push(json!({ "kind": "ware", "id": w }));
                        }
                    }
                }
            }
            if want("macro") {
                for m in &corpus.macros {
                    if m.contains(&query) {
                        matched_total += 1;
                        if items.len() < limit {
                            items.push(json!({ "kind": "macro", "id": m }));
                        }
                    }
                }
            }
            if want("sector") {
                for s in &corpus.sectors {
                    if s.contains(&query) {
                        matched_total += 1;
                        if items.len() < limit {
                            items.push(json!({ "kind": "sector", "id": s }));
                        }
                    }
                }
            }
            if want("aiscript") {
                for (id, def) in &corpus.ai_scripts {
                    if id.contains(&query) {
                        matched_total += 1;
                        if items.len() < limit {
                            items.push(json!({
                                "kind": "aiscript",
                                "id": def.id,
                                "relativePath": def.relative_path,
                            }));
                        }
                    }
                }
            }
            if want("order") {
                for (id, def) in &corpus.orders {
                    if id.to_ascii_lowercase().contains(&query) {
                        matched_total += 1;
                        if items.len() < limit {
                            items.push(json!({
                                "kind": "order",
                                "id": def.id,
                                "paramCount": def.params.len(),
                            }));
                        }
                    }
                }
            }
            if want("md") {
                for (k, prov) in &corpus.md_providers {
                    if k.contains(&query) {
                        matched_total += 1;
                        if items.len() < limit {
                            items.push(json!({
                                "kind": "md",
                                "id": k,
                                "relativePath": prov.as_ref().map(|p| p.relative_path.as_str()),
                            }));
                        }
                    }
                }
            }
            if want("scriptproperty") {
                for (k, entry) in &corpus.script_properties.keywords {
                    if k.contains(&query) {
                        matched_total += 1;
                        if items.len() < limit {
                            items.push(json!({
                                "kind": "scriptproperty",
                                "id": entry.name,
                                "dynamic": entry.dynamic,
                            }));
                        }
                    }
                }
            }

            Ok(json!({
                "query": query,
                "kind": kind,
                "corpusLoaded": !corpus.root.is_empty(),
                "totalMatched": matched_total,
                "items": items,
            }))
        }
        "x4_hash_tree" => {
            let root = opt_str(args, "root")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| (-32602, "x4_hash_tree requires non-empty string 'root'".to_string()))?;
            let exclude_dirs = obj
                .get("excludeDirs")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            let rep = hash_tree(
                Path::new(root),
                HashTreeOptions {
                    check_utf8: opt_bool(args, "checkUtf8").unwrap_or(false),
                    allow_missing_root: opt_bool(args, "allowMissing").unwrap_or(false),
                    max_entries: opt_u64(args, "maxEntries").map(|n| n as usize),
                    max_bytes: opt_u64(args, "maxBytes"),
                    exclude_dirs,
                },
            )
            .map_err(|e| (-32603, e.to_string()))?;
            Ok(serde_json::to_value(rep).unwrap())
        }
        "x4_cat_list" => {
            let cat_path = opt_str(args, "catPath")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| (-32602, "x4_cat_list requires non-empty string 'catPath'".to_string()))?;
            let strict = opt_bool(args, "strict").unwrap_or(true);
            let filter = opt_str(args, "filter").map(|s| s.trim().to_ascii_lowercase());
            let limit = opt_u64(args, "limit").unwrap_or(200).clamp(1, 2000) as usize;
            let entries = parse_cat_file(
                Path::new(cat_path),
                MAX_CAT_MANIFEST_BYTES,
                MAX_CAT_ENTRIES,
                strict,
            )
            .map_err(|e| (-32603, e))?;
            let filtered: Vec<_> = entries
                .iter()
                .filter(|e| {
                    filter
                        .as_deref()
                        .is_none_or(|f| e.name.to_ascii_lowercase().contains(f))
                })
                .take(limit)
                .cloned()
                .collect();
            Ok(json!({
                "totalEntries": entries.len(),
                "returned": filtered.len(),
                "entries": filtered,
            }))
        }
        "x4_cat_extract" => {
            let cat_path = opt_str(args, "catPath")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| (-32602, "x4_cat_extract requires 'catPath'".to_string()))?;
            let dat_path = opt_str(args, "datPath")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| (-32602, "x4_cat_extract requires 'datPath'".to_string()))?;
            let entry_name = opt_str(args, "entryName")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| (-32602, "x4_cat_extract requires 'entryName'".to_string()))?;
            let safe_target = safe_catalog_name(entry_name)
                .ok_or_else(|| (-32602, format!("Unsafe catalog entry path '{entry_name}'")))?;
            let entries = parse_cat_file(
                Path::new(cat_path),
                MAX_CAT_MANIFEST_BYTES,
                MAX_CAT_ENTRIES,
                true,
            )
            .map_err(|e| (-32603, e))?;
            let entry = entries
                .iter()
                .find(|e| e.name.eq_ignore_ascii_case(&safe_target))
                .ok_or_else(|| (-32603, format!("Catalog entry not found: {safe_target}")))?;
            let bytes = extract_cat_entry(Path::new(dat_path), entry).map_err(|e| (-32603, e))?;
            if let Some(out_p) = opt_str(args, "outPath").map(str::trim).filter(|s| !s.is_empty()) {
                let p = Path::new(out_p);
                if let Some(par) = p.parent() {
                    fs::create_dir_all(par)
                        .map_err(|e| (-32603, format!("Failed creating parent dir: {e}")))?;
                }
                fs::write(p, &bytes).map_err(|e| (-32603, format!("Failed writing output: {e}")))?;
                return Ok(json!({
                    "ok": true,
                    "entryName": safe_target,
                    "bytes": bytes.len(),
                    "outPath": p.to_string_lossy(),
                }));
            }
            let max_inline = opt_u64(args, "maxInlineBytes").unwrap_or(262_144) as usize;
            if bytes.len() > max_inline {
                return Err((
                    -32603,
                    format!(
                        "Entry '{}' size ({} bytes) exceeds maxInlineBytes ({}); pass outPath to extract to disk.",
                        safe_target,
                        bytes.len(),
                        max_inline
                    ),
                ));
            }
            let (encoding, content) = match std::str::from_utf8(&bytes) {
                Ok(s) if !bytes.contains(&0) => ("utf8", s.to_string()),
                _ => ("base64", BASE64_STD.encode(&bytes)),
            };
            Ok(json!({
                "ok": true,
                "entryName": safe_target,
                "bytes": bytes.len(),
                "encoding": encoding,
                "content": content,
            }))
        }
        "x4_inspect_document" => {
            let path_opt = opt_str(args, "path").map(str::trim).filter(|s| !s.is_empty());
            let text_opt = opt_str(args, "text").map(str::to_string);
            let rel_opt = opt_str(args, "relPath").map(str::to_string);

            if path_opt.is_none() && text_opt.is_none() {
                return Err((
                    -32602,
                    "x4_inspect_document requires at least 'path' or 'text'".to_string(),
                ));
            }

            let text = match text_opt {
                Some(t) => t,
                None => {
                    let p = Path::new(path_opt.unwrap());
                    fs::read_to_string(p)
                        .map_err(|e| (-32603, format!("Failed reading {}: {e}", p.display())))?
                }
            };
            let uri = match path_opt {
                Some(p) => path_to_uri(Path::new(p))
                    .unwrap_or_else(|| Url::parse("file:///document.xml").unwrap()),
                None => {
                    let rel = rel_opt.as_deref().unwrap_or("document.xml");
                    Url::parse(&format!("file:///workspace/{rel}"))
                        .unwrap_or_else(|_| Url::parse("file:///workspace/document.xml").unwrap())
                }
            };
            let mut open_docs = HashMap::new();
            let key = x4_lsp::analysis::normalize_uri_key(&uri);
            open_docs.insert(key, (uri.clone(), text));
            let mut ctx = collect_mod_files(&uri, &open_docs);
            if let Some(rel) = rel_opt {
                ctx.files[ctx.active_idx].rel_path = rel;
            }
            let (corpus, xsd_reg) = state
                .get_or_load_refs(opt_str(args, "unpackedRoot"), None)
                .map_err(|e| (-32603, e))?;
            let active = ctx.active();
            let symbols = compute_document_symbols(&active.rel_path, &active.text);
            let lenses = compute_code_lenses(&ctx);
            let diags = compute_diagnostics(&ctx, corpus, xsd_reg);
            let count_syms = count_document_symbols(&symbols);

            Ok(json!({
                "relPath": active.rel_path,
                "symbolCount": count_syms,
                "symbols": symbols,
                "codeLensCount": lenses.len(),
                "codeLenses": lenses,
                "diagnosticCount": diags.len(),
                "diagnostics": diags,
            }))
        }
        _ => Err((-32602, format!("Unknown tool: {name}"))),
    }
}

pub fn build_query_string(params: &BTreeMap<String, Value>) -> String {
    let mut pairs = Vec::new();
    for (k, v) in params {
        if v.is_null() {
            continue;
        }
        let s = match v {
            Value::String(st) => st.clone(),
            other => other.to_string(),
        };
        pairs.push(format!("{}={}", pct_encode(k), pct_encode(&s)));
    }
    pairs.join("&")
}

pub fn pct_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.as_bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(*b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}
