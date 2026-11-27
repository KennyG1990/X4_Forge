use clap::{Parser, Subcommand};
use std::fs;
use std::io::{self, Read};
use std::path::PathBuf;
use x4_catdat::{
    extract_cat_entry, parse_cat_file, safe_catalog_name, write_cat_dat_layout, PackLayoutInput,
    MAX_CAT_ENTRIES, MAX_CAT_MANIFEST_BYTES,
};
use x4_corpus::load_or_build_corpus;
use x4_lsp::{run_stdio_lsp, LspOptions};
use x4_mcp::{run_stdio_mcp, McpMode, McpOptions};
use x4_tree::{hash_tree, HashTreeOptions};
use x4_validate::{
    render_report, validate_mod, ReportFormat, SeverityGate, ValidateOptions,
};

#[derive(Parser)]
#[command(
    name = "x4forge",
    about = "X4 Forge high-speed Rust engine (CLI, LSP 3.17, and MCP 2024-11-05)"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Parallel walk + SHA-256 hash a directory tree (fails cleanly on symlinks/reparse points).
    HashTree {
        root: PathBuf,
        #[arg(long)]
        check_utf8: bool,
        #[arg(long)]
        allow_missing: bool,
        #[arg(long)]
        max_entries: Option<usize>,
        #[arg(long)]
        max_bytes: Option<u64>,
        #[arg(long = "exclude-dir")]
        exclude_dirs: Vec<String>,
    },
    /// Parse a .cat manifest and emit entries JSON to stdout.
    CatList {
        cat_path: PathBuf,
        #[arg(long)]
        strict: bool,
    },
    /// Extract a single entry from a .cat/.dat pair.
    CatExtract {
        cat_path: PathBuf,
        dat_path: PathBuf,
        entry_name: String,
        #[arg(long)]
        out: Option<PathBuf>,
    },
    /// Pack a PackLayoutInput JSON (stdin) into atomic .cat/.dat volume pairs.
    CatPack {
        output_root: PathBuf,
        #[arg(long)]
        layout_stdin: bool,
        #[arg(long)]
        layout_file: Option<PathBuf>,
    },
    /// Index unpacked vanilla + DLC X4 corpus in parallel and output/cache CorpusIndex JSON.
    ScanCorpus {
        unpacked_root: PathBuf,
        #[arg(long)]
        cache: Option<PathBuf>,
        #[arg(long)]
        summary_only: bool,
    },
    /// Deterministic X4 mod validator (XSD + expressions + MD/AI + Lua + content + forge.rules.json).
    Validate {
        mod_dir: PathBuf,
        #[arg(long)]
        unpacked: Option<PathBuf>,
        #[arg(long)]
        game: Option<PathBuf>,
        #[arg(long)]
        extensions: Vec<PathBuf>,
        #[arg(long)]
        cache: Option<PathBuf>,
        #[arg(long)]
        fix: bool,
        #[arg(long)]
        json: bool,
        #[arg(long)]
        format: Option<String>,
        #[arg(long = "fail-on")]
        fail_on: Option<String>,
    },
    /// Run the LSP 3.17 language server over stdio (Content-Length JSON-RPC 2.0).
    Lsp {
        #[arg(long)]
        unpacked: Option<PathBuf>,
        #[arg(long)]
        cache: Option<PathBuf>,
    },
    /// Run the MCP 2024-11-05 server over stdio (newline-delimited JSON-RPC 2.0).
    Mcp {
        #[arg(long, default_value = "auto")]
        mode: String,
        #[arg(long)]
        unpacked: Option<PathBuf>,
        #[arg(long)]
        cache: Option<PathBuf>,
        #[arg(long)]
        url: Option<String>,
        #[arg(long)]
        key: Option<String>,
        #[arg(long = "workspace-id")]
        workspace_id: Option<String>,
        #[arg(long = "discovery-dir")]
        discovery_dir: Option<PathBuf>,
    },
}

fn main() {
    let cli = Cli::parse();
    let code = match run(cli) {
        Ok(c) => c,
        Err((c, msg)) => {
            eprintln!("x4forge: {msg}");
            c
        }
    };
    std::process::exit(code);
}

fn run(cli: Cli) -> Result<i32, (i32, String)> {
    match cli.command {
        Commands::HashTree {
            root,
            check_utf8,
            allow_missing,
            max_entries,
            max_bytes,
            exclude_dirs,
        } => {
            let report = hash_tree(
                &root,
                HashTreeOptions {
                    check_utf8,
                    allow_missing_root: allow_missing,
                    max_entries,
                    max_bytes,
                    exclude_dirs,
                },
            )
            .map_err(|e| (e.exit_code(), e.to_string()))?;
            let json = serde_json::to_string(&report)
                .map_err(|e| (2, format!("JSON serialize error: {e}")))?;
            println!("{json}");
            Ok(0)
        }
        Commands::CatList { cat_path, strict } => {
            let entries = parse_cat_file(&cat_path, MAX_CAT_MANIFEST_BYTES, MAX_CAT_ENTRIES, strict)
                .map_err(|e| (2, e))?;
            let json = serde_json::to_string(&entries)
                .map_err(|e| (2, format!("JSON serialize error: {e}")))?;
            println!("{json}");
            Ok(0)
        }
        Commands::CatExtract {
            cat_path,
            dat_path,
            entry_name,
            out,
        } => {
            let safe_target = safe_catalog_name(&entry_name)
                .ok_or_else(|| (2, format!("Unsafe catalog entry path: {entry_name}")))?;
            let entries = parse_cat_file(&cat_path, MAX_CAT_MANIFEST_BYTES, MAX_CAT_ENTRIES, true)
                .map_err(|e| (2, e))?;
            let entry = entries
                .iter()
                .find(|e| e.name.eq_ignore_ascii_case(&safe_target))
                .ok_or_else(|| (2, format!("Catalog entry not found: {safe_target}")))?;
            let bytes = extract_cat_entry(&dat_path, entry).map_err(|e| (2, e))?;
            if let Some(out_path) = out {
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| (2, format!("mkdir {}: {e}", parent.display())))?;
                }
                fs::write(&out_path, &bytes)
                    .map_err(|e| (2, format!("write {}: {e}", out_path.display())))?;
            } else {
                use std::io::Write;
                io::stdout()
                    .write_all(&bytes)
                    .map_err(|e| (2, format!("stdout write error: {e}")))?;
            }
            Ok(0)
        }
        Commands::CatPack {
            output_root,
            layout_stdin,
            layout_file,
        } => {
            let raw = if let Some(path) = layout_file {
                fs::read_to_string(&path)
                    .map_err(|e| (2, format!("Failed reading layout file {}: {e}", path.display())))?
            } else if layout_stdin {
                let mut buf = String::new();
                io::stdin()
                    .read_to_string(&mut buf)
                    .map_err(|e| (2, format!("Failed reading layout stdin: {e}")))?;
                buf
            } else {
                return Err((2, "Pass --layout-stdin or --layout-file <path>.".to_string()));
            };
            let layout: PackLayoutInput = serde_json::from_str(&raw)
                .map_err(|e| (2, format!("Invalid PackLayoutInput JSON: {e}")))?;
            let result = write_cat_dat_layout(&layout, &output_root);
            let ok = result.ok;
            let json = serde_json::to_string(&result)
                .map_err(|e| (2, format!("JSON serialize error: {e}")))?;
            println!("{json}");
            Ok(if ok { 0 } else { 1 })
        }
        Commands::ScanCorpus {
            unpacked_root,
            cache,
            summary_only,
        } => {
            let corpus = load_or_build_corpus(&unpacked_root, cache.as_deref())
                .map_err(|e| (2, e))?;
            if summary_only {
                let sum = serde_json::json!({
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
                });
                println!("{}", serde_json::to_string(&sum).unwrap());
            } else {
                let json = serde_json::to_string(&corpus)
                    .map_err(|e| (2, format!("JSON serialize error: {e}")))?;
                println!("{json}");
            }
            Ok(0)
        }
        Commands::Validate {
            mod_dir,
            unpacked,
            game,
            extensions,
            cache,
            fix,
            json,
            format,
            fail_on,
        } => {
            if json && format.is_some() {
                return Err((2, "Choose at most one output format (--json or --format).".into()));
            }
            let fmt = match format.as_deref() {
                Some(f) => ReportFormat::parse(f).map_err(|e| (2, e))?,
                None if json => ReportFormat::Json,
                None => ReportFormat::Text,
            };
            let gate = match fail_on.as_deref() {
                Some(g) => Some(SeverityGate::parse(g).map_err(|e| (2, e))?),
                None => None,
            };
            let report = validate_mod(
                &mod_dir,
                &ValidateOptions {
                    unpacked_root: unpacked,
                    game_root: game,
                    extension_roots: extensions,
                    corpus_cache: cache,
                    apply_fix: fix,
                    fail_on: gate,
                },
            )
            .map_err(|e| (2, e))?;

            println!("{}", render_report(&report, fmt, json));
            Ok(if report.passed { 0 } else { 1 })
        }
        Commands::Lsp { unpacked, cache } => run_stdio_lsp(LspOptions {
            unpacked_root: unpacked,
            corpus_cache: cache,
        })
        .map_err(|e| (2, e)),
        Commands::Mcp {
            mode,
            unpacked,
            cache,
            url,
            key,
            workspace_id,
            discovery_dir,
        } => {
            let parsed_mode = McpMode::parse(&mode).map_err(|e| (2, e))?;
            run_stdio_mcp(McpOptions {
                mode: parsed_mode,
                unpacked_root: unpacked,
                corpus_cache: cache,
                url,
                api_key: key,
                workspace_id,
                discovery_dir,
            })
            .map_err(|e| (2, e))
        }
    }
}
