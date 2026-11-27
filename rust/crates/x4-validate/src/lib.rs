pub mod content;
pub mod expr;
pub mod lua;
pub mod scripts;
pub mod xml_wellformed;
pub mod xsd;

use crate::content::{analyze_content_xml, cross_check_content, ContentFileSummary, TextRefHit};
use crate::expr::validate_script_expressions;
use crate::lua::{analyze_lua_file, cross_check_md_lua};
use crate::scripts::{
    analyze_script_file, check_content_xml_deps, cross_check_scripts, ScriptFileSummary,
};
use crate::xml_wellformed::{parse_xml, LineIndex};
use crate::xsd::{levenshtein, validate_xml_with_xsd, XsdRegistry};
use rayon::prelude::*;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use x4_corpus::{load_or_build_corpus, CorpusIndex};

const PROJECT_RULES_PATH: &str = "forge.rules.json";
const PROJECT_RULES_MAX_BYTES: usize = 256 * 1024;
const PROJECT_RULES_MAX_ITEMS: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Error,
}

impl Severity {
    pub fn rank(self) -> u8 {
        match self {
            Self::Info => 0,
            Self::Warning => 1,
            Self::Error => 2,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Info => "info",
            Self::Warning => "warning",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeverityGate {
    Hint,
    Info,
    Warning,
    Error,
}

impl SeverityGate {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s.trim().to_ascii_lowercase().as_str() {
            "hint" => Ok(Self::Hint),
            "info" => Ok(Self::Info),
            "warning" => Ok(Self::Warning),
            "error" => Ok(Self::Error),
            _ => Err("Use --fail-on at most once with error, warning, info, or hint.".to_string()),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Hint => "hint",
            Self::Info => "info",
            Self::Warning => "warning",
            Self::Error => "error",
        }
    }

    pub fn rank(self) -> u8 {
        match self {
            Self::Hint | Self::Info => 0,
            Self::Warning => 1,
            Self::Error => 2,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportFormat {
    Text,
    Json,
    Sarif,
    Github,
}

impl ReportFormat {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s.trim().to_ascii_lowercase().as_str() {
            "text" => Ok(Self::Text),
            "json" => Ok(Self::Json),
            "sarif" => Ok(Self::Sarif),
            "github" => Ok(Self::Github),
            _ => Err("--format must be text, json, sarif, or github.".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub severity: Severity,
    pub code: String,
    pub category: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_ref: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct LoadedFile {
    pub rel_path: String,
    pub abs_path: PathBuf,
    pub size: u64,
    pub sha256: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationCounts {
    pub error: usize,
    pub warning: usize,
    pub info: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub passed: bool,
    pub validation_ok: bool,
    pub fail_on: String,
    pub mod_id: String,
    pub source_hash: String,
    pub loaded_files: Vec<String>,
    pub skipped_files: Vec<String>,
    pub corpus_loaded: bool,
    pub schemas_loaded: usize,
    pub fixed_count: usize,
    pub suppressed_count: usize,
    pub counts: ValidationCounts,
    pub findings: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Default)]
pub struct ValidateOptions {
    pub unpacked_root: Option<PathBuf>,
    pub game_root: Option<PathBuf>,
    pub extension_roots: Vec<PathBuf>,
    pub corpus_cache: Option<PathBuf>,
    pub apply_fix: bool,
    pub fail_on: Option<SeverityGate>,
}

pub fn load_mod_files(mod_root: &Path) -> Result<(Vec<LoadedFile>, Vec<String>), String> {
    let root_meta = fs::symlink_metadata(mod_root)
        .map_err(|e| format!("Failed to inspect {}: {e}", mod_root.display()))?;
    if root_meta.file_type().is_symlink() || !root_meta.file_type().is_dir() {
        return Err(format!(
            "Mod target must be a real directory: {}",
            mod_root.display()
        ));
    }

    let mut abs_files = Vec::new();
    walk_mod_dir(mod_root, mod_root, &mut abs_files)?;
    abs_files.sort_by(|a, b| a.0.cmp(&b.0));

    let results: Vec<Result<(LoadedFile, bool), String>> = abs_files
        .into_par_iter()
        .map(|(rel, abs, size)| {
            let bytes = fs::read(&abs)
                .map_err(|e| format!("Failed to read {}: {e}", abs.display()))?;
            let sha256 = hex::encode(Sha256::digest(&bytes));
            if bytes.contains(&0) {
                return Ok((
                    LoadedFile {
                        rel_path: rel,
                        abs_path: abs,
                        size,
                        sha256,
                        text: String::new(),
                    },
                    true,
                ));
            }
            let text = String::from_utf8_lossy(&bytes).into_owned();
            Ok((
                LoadedFile {
                    rel_path: rel,
                    abs_path: abs,
                    size,
                    sha256,
                    text,
                },
                false,
            ))
        })
        .collect();

    let mut loaded = Vec::new();
    let mut skipped = Vec::new();
    for item in results {
        let (lf, is_bin) = item?;
        if is_bin {
            skipped.push(lf.rel_path);
        } else {
            loaded.push(lf);
        }
    }
    Ok((loaded, skipped))
}

fn walk_mod_dir(
    root: &Path,
    dir: &Path,
    out: &mut Vec<(String, PathBuf, u64)>,
) -> Result<(), String> {
    let rd = fs::read_dir(dir).map_err(|e| format!("Failed to read dir {}: {e}", dir.display()))?;
    for entry in rd {
        let entry = entry.map_err(|e| format!("Dir entry error in {}: {e}", dir.display()))?;
        let path = entry.path();
        let meta = fs::symlink_metadata(&path)
            .map_err(|e| format!("lstat {}: {e}", path.display()))?;
        if meta.file_type().is_symlink() {
            return Err(format!(
                "Symbolic link or reparse point is not allowed inside mod folder: {}",
                path.display()
            ));
        }
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        if meta.file_type().is_dir() {
            let top = rel.split('/').next().unwrap_or("");
            if matches!(top, ".git" | "node_modules" | "target" | ".forge-backups") {
                continue;
            }
            walk_mod_dir(root, &path, out)?;
        } else if meta.file_type().is_file() {
            let lower = rel.to_ascii_lowercase();
            let interesting = lower == "content.xml"
                || lower == PROJECT_RULES_PATH
                || lower.ends_with(".xml")
                || lower.ends_with(".xsd")
                || lower.ends_with(".lua")
                || lower.ends_with(".json");
            if interesting {
                out.push((rel, path, meta.len()));
            }
        }
    }
    Ok(())
}

pub fn validate_mod(mod_root: &Path, opts: &ValidateOptions) -> Result<ValidationReport, String> {
    let canon_mod = fs::canonicalize(mod_root).unwrap_or_else(|_| mod_root.to_path_buf());
    let (corpus, xsd_reg) = resolve_corpus_and_schemas(opts)?;

    let mut fixed_count = 0usize;
    if opts.apply_fix && !xsd_reg.schemas.is_empty() {
        fixed_count = apply_preferred_fixes(&canon_mod, &xsd_reg)?;
    }

    let (loaded, skipped) = load_mod_files(&canon_mod)?;
    if loaded.is_empty() {
        return Err(format!(
            "No loadable mod files found under: {}",
            canon_mod.display()
        ));
    }

    let mut source_hasher = Sha256::new();
    for lf in &loaded {
        source_hasher.update(lf.rel_path.as_bytes());
        source_hasher.update(b"\0");
        source_hasher.update(lf.sha256.as_bytes());
        source_hasher.update(b"\0");
    }
    let source_hash = hex::encode(source_hasher.finalize());

    enum PerFileOut {
        Xml {
            diags: Vec<Diagnostic>,
            script: ScriptFileSummary,
            content: ContentFileSummary,
        },
        Lua(lua::LuaFileSummary),
        Other(Vec<Diagnostic>),
    }

    let per_file: Vec<PerFileOut> = loaded
        .par_iter()
        .map(|lf| {
            let lower = lf.rel_path.to_ascii_lowercase();
            if lower.ends_with(".xml") {
                let mut diags = Vec::new();
                let line_idx = LineIndex::new(&lf.text);
                let clean = line_idx.strip_bom(&lf.text);
                match parse_xml(&lf.rel_path, clean) {
                    Ok(doc) => {
                        validate_xml_with_xsd(
                            &lf.rel_path,
                            clean,
                            &line_idx,
                            &doc,
                            &xsd_reg,
                            &corpus,
                            &mut diags,
                        );
                        validate_script_expressions(
                            &lf.rel_path,
                            clean,
                            &line_idx,
                            &doc,
                            &corpus,
                            &mut diags,
                        );
                        let script =
                            analyze_script_file(&lf.rel_path, clean, &line_idx, &doc, &corpus);
                        let content =
                            analyze_content_xml(&lf.rel_path, clean, &line_idx, &doc, &corpus);
                        PerFileOut::Xml {
                            diags,
                            script,
                            content,
                        }
                    }
                    Err(xml_err) => {
                        diags.push(xml_err);
                        PerFileOut::Other(diags)
                    }
                }
            } else if lower.ends_with(".lua") {
                PerFileOut::Lua(analyze_lua_file(&lf.rel_path, &lf.text, &corpus))
            } else {
                PerFileOut::Other(Vec::new())
            }
        })
        .collect();

    let mut diagnostics = Vec::new();
    let mut script_summaries = Vec::new();
    let mut content_summaries = Vec::new();
    let mut lua_registers = Vec::new();
    let mut lua_text_refs: Vec<TextRefHit> = Vec::new();

    for out in per_file {
        match out {
            PerFileOut::Xml {
                mut diags,
                mut script,
                mut content,
            } => {
                diagnostics.append(&mut diags);
                diagnostics.append(&mut script.diagnostics);
                diagnostics.append(&mut content.diagnostics);
                script_summaries.push(script);
                content_summaries.push(content);
            }
            PerFileOut::Lua(mut lsum) => {
                diagnostics.append(&mut lsum.diagnostics);
                lua_registers.append(&mut lsum.registered_events);
                lua_text_refs.append(&mut lsum.text_refs);
            }
            PerFileOut::Other(mut diags) => {
                diagnostics.append(&mut diags);
            }
        }
    }

    // Cross-file checks
    let mod_id = match check_content_xml_deps(&loaded, &mut diagnostics) {
        Some(id) if !id.is_empty() => id,
        Some(_) => canon_mod
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("mod")
            .to_string(),
        None => {
            diagnostics.push(Diagnostic {
                severity: Severity::Error,
                code: "project.structure".to_string(),
                category: "structural".to_string(),
                message: "Mod folder is missing root content.xml.".to_string(),
                file_path: Some("content.xml".to_string()),
                line: None,
                column: None,
                source_ref: None,
                suggestions: Vec::new(),
            });
            canon_mod
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("mod")
                .to_string()
        }
    };

    cross_check_scripts(&script_summaries, &corpus, &mut diagnostics);
    cross_check_content(&content_summaries, &lua_text_refs, &mut diagnostics);
    let md_raises: Vec<(String, String, u32, u32)> = script_summaries
        .iter()
        .flat_map(|s| s.md_raise_lua_events.iter().cloned())
        .collect();
    cross_check_md_lua(&md_raises, &lua_registers, &mut diagnostics);

    // Extension overlay directory checks (if --extensions provided)
    for ext_root in &opts.extension_roots {
        if !ext_root.is_dir() {
            diagnostics.push(Diagnostic {
                severity: Severity::Warning,
                code: "dep.missing_content_xml".to_string(),
                category: "dependency".to_string(),
                message: format!(
                    "Declared extension path '{}' does not exist.",
                    ext_root.display()
                ),
                file_path: None,
                line: None,
                column: None,
                source_ref: None,
                suggestions: Vec::new(),
            });
        }
    }

    // Apply forge.rules.json v1 policy & warning suppressions
    let (diagnostics, suppressed_count) = apply_forge_rules(&loaded, diagnostics);

    let mut counts = ValidationCounts {
        error: 0,
        warning: 0,
        info: 0,
    };
    for d in &diagnostics {
        match d.severity {
            Severity::Error => counts.error += 1,
            Severity::Warning => counts.warning += 1,
            Severity::Info => counts.info += 1,
        }
    }
    let gate = opts.fail_on.unwrap_or(SeverityGate::Error);
    let validation_ok = counts.error == 0;
    let passed = validation_ok
        && !diagnostics
            .iter()
            .any(|d| d.severity.rank() >= gate.rank());

    Ok(ValidationReport {
        passed,
        validation_ok,
        fail_on: gate.as_str().to_string(),
        mod_id,
        source_hash,
        loaded_files: loaded.into_iter().map(|l| l.rel_path).collect(),
        skipped_files: skipped,
        corpus_loaded: !corpus.factions.is_empty() || !corpus.md_providers.is_empty(),
        schemas_loaded: xsd_reg.schemas.len(),
        fixed_count,
        suppressed_count,
        counts,
        findings: diagnostics,
    })
}

fn resolve_corpus_and_schemas(opts: &ValidateOptions) -> Result<(CorpusIndex, XsdRegistry), String> {
    let effective_unpacked = opts
        .unpacked_root
        .clone()
        .or_else(|| {
            std::env::var("X4_REFERENCE_ROOT")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .map(PathBuf::from)
        });

    let mut schema_files: BTreeMap<String, String> = BTreeMap::new();
    let corpus = if let Some(ref up) = effective_unpacked {
        let c = load_or_build_corpus(up, opts.corpus_cache.as_deref())?;
        schema_files.extend(c.schema_files.clone());
        c
    } else {
        CorpusIndex::default()
    };

    if let Some(ref game_dir) = opts.game_root {
        collect_xsd_files(game_dir, &mut schema_files);
    }
    if let Ok(xsd_env) = std::env::var("X4_XSD_PATH") {
        let p = PathBuf::from(xsd_env.trim());
        if p.is_file() {
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                schema_files
                    .entry(name.to_ascii_lowercase())
                    .or_insert_with(|| p.to_string_lossy().into_owned());
            }
            if let Some(par) = p.parent() {
                collect_xsd_files(par, &mut schema_files);
            }
        } else if p.is_dir() {
            collect_xsd_files(&p, &mut schema_files);
        }
    }

    let xsd_reg = XsdRegistry::load(&schema_files);
    Ok((corpus, xsd_reg))
}

fn collect_xsd_files(dir: &Path, out: &mut BTreeMap<String, String>) {
    for sub in ["libraries", "md", "aiscripts", "ui/core", "."] {
        let p = if sub == "." {
            dir.to_path_buf()
        } else {
            dir.join(sub)
        };
        let Ok(rd) = fs::read_dir(p) else {
            continue;
        };
        for entry in rd.flatten() {
            let f = entry.path();
            if f.is_file()
                && f.extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|e| e.eq_ignore_ascii_case("xsd"))
            {
                if let Some(name) = f.file_name().and_then(|n| n.to_str()) {
                    out.entry(name.to_ascii_lowercase())
                        .or_insert_with(|| f.to_string_lossy().into_owned());
                }
            }
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForgeRulesRaw {
    #[serde(default)]
    version: Option<u32>,
    #[serde(default)]
    suppressions: Option<Vec<SuppressionRaw>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuppressionRaw {
    #[serde(default)]
    id: String,
    #[serde(default)]
    owner: String,
    #[serde(default)]
    reason: String,
    #[serde(default)]
    review_by: String,
    #[serde(default)]
    code: String,
    #[serde(default)]
    file: Option<String>,
    #[serde(default)]
    source_ref: Option<String>,
}

fn apply_forge_rules(
    loaded: &[LoadedFile],
    mut diags: Vec<Diagnostic>,
) -> (Vec<Diagnostic>, usize) {
    let rules_files: Vec<&LoadedFile> = loaded
        .iter()
        .filter(|f| f.rel_path.eq_ignore_ascii_case(PROJECT_RULES_PATH))
        .collect();
    if rules_files.is_empty() {
        sort_diagnostics(&mut diags);
        return (diags, 0);
    }
    if rules_files.len() > 1 {
        diags.push(Diagnostic {
            severity: Severity::Error,
            code: "rules.duplicate_file".to_string(),
            category: "rules".to_string(),
            message: "Project contains more than one root forge.rules.json.".to_string(),
            file_path: Some(PROJECT_RULES_PATH.to_string()),
            line: None,
            column: None,
            source_ref: None,
            suggestions: Vec::new(),
        });
        sort_diagnostics(&mut diags);
        return (diags, 0);
    }
    let rf = rules_files[0];
    if rf.size as usize > PROJECT_RULES_MAX_BYTES {
        diags.push(Diagnostic {
            severity: Severity::Error,
            code: "rules.file_too_large".to_string(),
            category: "rules".to_string(),
            message: "forge.rules.json exceeds 256 KiB.".to_string(),
            file_path: Some(PROJECT_RULES_PATH.to_string()),
            line: None,
            column: None,
            source_ref: None,
            suggestions: Vec::new(),
        });
        sort_diagnostics(&mut diags);
        return (diags, 0);
    }

    let parsed: ForgeRulesRaw = match serde_json::from_str(&rf.text) {
        Ok(v) => v,
        Err(e) => {
            diags.push(Diagnostic {
                severity: Severity::Error,
                code: "rules.invalid_json".to_string(),
                category: "rules".to_string(),
                message: format!("forge.rules.json is not valid JSON: {e}"),
                file_path: Some(PROJECT_RULES_PATH.to_string()),
                line: None,
                column: None,
                source_ref: None,
                suggestions: Vec::new(),
            });
            sort_diagnostics(&mut diags);
            return (diags, 0);
        }
    };

    if parsed.version != Some(1) {
        diags.push(Diagnostic {
            severity: Severity::Error,
            code: "rules.unsupported_version".to_string(),
            category: "rules".to_string(),
            message: "forge.rules.json version must be 1.".to_string(),
            file_path: Some(PROJECT_RULES_PATH.to_string()),
            line: None,
            column: None,
            source_ref: None,
            suggestions: Vec::new(),
        });
        sort_diagnostics(&mut diags);
        return (diags, 0);
    }

    let mut active_suppressions: Vec<SuppressionRaw> = Vec::new();
    let mut seen_ids = HashSet::new();
    if let Some(sups) = parsed.suppressions {
        if sups.len() > PROJECT_RULES_MAX_ITEMS {
            diags.push(Diagnostic {
                severity: Severity::Error,
                code: "rules.too_many_items".to_string(),
                category: "rules".to_string(),
                message: "forge.rules.json suppressions exceed 256 items.".to_string(),
                file_path: Some(PROJECT_RULES_PATH.to_string()),
                line: None,
                column: None,
                source_ref: None,
                suggestions: Vec::new(),
            });
        }
        for s in sups.into_iter().take(PROJECT_RULES_MAX_ITEMS) {
            if s.id.trim().is_empty() || !seen_ids.insert(s.id.clone()) {
                diags.push(Diagnostic {
                    severity: Severity::Error,
                    code: "rules.duplicate_id".to_string(),
                    category: "rules".to_string(),
                    message: format!("Invalid or duplicate suppression id '{}'.", s.id),
                    file_path: Some(PROJECT_RULES_PATH.to_string()),
                    line: None,
                    column: None,
                    source_ref: None,
                    suggestions: Vec::new(),
                });
                continue;
            }
            if s.owner.trim().is_empty() || s.reason.trim().len() < 8 || s.review_by.trim().len() != 10 {
                diags.push(Diagnostic {
                    severity: Severity::Error,
                    code: "rules.invalid_value".to_string(),
                    category: "rules".to_string(),
                    message: format!("Suppression '{}' requires owner, reason (>=8 chars), and reviewBy (YYYY-MM-DD).", s.id),
                    file_path: Some(PROJECT_RULES_PATH.to_string()),
                    line: None,
                    column: None,
                    source_ref: Some(s.id.clone()),
                    suggestions: Vec::new(),
                });
                continue;
            }
            if s.file.as_ref().is_none_or(|f| f.trim().is_empty())
                && s.source_ref.as_ref().is_none_or(|r| r.trim().is_empty())
            {
                diags.push(Diagnostic {
                    severity: Severity::Error,
                    code: "rules.overbroad_suppression".to_string(),
                    category: "rules".to_string(),
                    message: format!("Suppression '{}' must declare file and/or sourceRef; code-only suppression is forbidden.", s.id),
                    file_path: Some(PROJECT_RULES_PATH.to_string()),
                    line: None,
                    column: None,
                    source_ref: Some(s.id.clone()),
                    suggestions: Vec::new(),
                });
                continue;
            }
            active_suppressions.push(s);
        }
    }

    let mut kept = Vec::with_capacity(diags.len());
    let mut suppressed = 0usize;
    for d in diags {
        let is_suppressed = d.severity != Severity::Error
            && active_suppressions.iter().any(|rule| {
                rule.code == d.code
                    && rule
                        .file
                        .as_ref()
                        .is_none_or(|f| d.file_path.as_deref() == Some(f.as_str()))
                    && rule
                        .source_ref
                        .as_ref()
                        .is_none_or(|sr| d.source_ref.as_deref() == Some(sr.as_str()))
            });
        if is_suppressed {
            suppressed += 1;
        } else {
            kept.push(d);
        }
    }

    sort_diagnostics(&mut kept);
    (kept, suppressed)
}

fn sort_diagnostics(diags: &mut Vec<Diagnostic>) {
    diags.sort_by(|a, b| {
        b.severity
            .rank()
            .cmp(&a.severity.rank())
            .then_with(|| a.file_path.cmp(&b.file_path))
            .then_with(|| a.line.cmp(&b.line))
            .then_with(|| a.column.cmp(&b.column))
            .then_with(|| a.code.cmp(&b.code))
            .then_with(|| a.message.cmp(&b.message))
    });
}

pub fn apply_preferred_fixes(mod_root: &Path, registry: &XsdRegistry) -> Result<usize, String> {
    let md_known: BTreeSet<String> = registry.known_elements_for("md.xsd").into_iter().collect();
    let ai_known: BTreeSet<String> = registry
        .known_elements_for("aiscripts.xsd")
        .into_iter()
        .collect();
    if md_known.is_empty() && ai_known.is_empty() {
        return Ok(0);
    }

    let (files, _) = load_mod_files(mod_root)?;
    static OPEN_TAG_RE: OnceLock<Regex> = OnceLock::new();
    let tag_re = OPEN_TAG_RE.get_or_init(|| Regex::new(r"<(/?)([A-Za-z_][\w.:-]*)\b").unwrap());
    let mut fixed = 0usize;

    for lf in files {
        let lower = lf.rel_path.to_ascii_lowercase();
        let known = if lower.starts_with("md/") && !md_known.is_empty() {
            &md_known
        } else if lower.starts_with("aiscripts/") && !ai_known.is_empty() {
            &ai_known
        } else {
            continue;
        };

        let mut replacements: Vec<(usize, usize, String)> = Vec::new();
        // Quick tag pair map using open/close replacements if typo tag has unique dist<=2 match
        let mut rename_map: HashMap<String, String> = HashMap::new();
        for cap in tag_re.captures_iter(&lf.text) {
            let full_match = cap.get(2).unwrap();
            let tag = full_match.as_str();
            if known.contains(tag) {
                continue;
            }
            if let Some(target) = rename_map.get(tag) {
                replacements.push((full_match.start(), full_match.end(), target.clone()));
                continue;
            }
            let mut best: Vec<(usize, &String)> = known
                .iter()
                .filter_map(|cand| {
                    let d = levenshtein(&tag.to_ascii_lowercase(), &cand.to_ascii_lowercase());
                    (d > 0 && d <= 2).then_some((d, cand))
                })
                .collect();
            best.sort_by_key(|(d, s)| (*d, s.as_str()));
            if let Some((best_d, cand)) = best.first() {
                let unique = best.get(1).is_none_or(|(d2, _)| d2 > best_d);
                if unique {
                    rename_map.insert(tag.to_string(), (*cand).clone());
                    replacements.push((full_match.start(), full_match.end(), (*cand).clone()));
                }
            }
        }
        if !replacements.is_empty() {
            let mut updated = lf.text.clone();
            replacements.sort_by(|a, b| b.0.cmp(&a.0));
            for (start, end, rep) in replacements {
                updated.replace_range(start..end, &rep);
                fixed += 1;
            }
            fs::write(&lf.abs_path, updated.as_bytes())
                .map_err(|e| format!("Failed writing fix to {}: {e}", lf.abs_path.display()))?;
        }
    }
    Ok(fixed)
}

fn escape_github_cmd(s: &str) -> String {
    s.replace('%', "%25")
        .replace('\r', "%0D")
        .replace('\n', "%0A")
}

fn escape_github_prop(s: &str) -> String {
    escape_github_cmd(s).replace(':', "%3A").replace(',', "%2C")
}

fn safe_json_string(val: &Value, pretty: bool) -> String {
    let raw = if pretty {
        serde_json::to_string_pretty(val).unwrap_or_default()
    } else {
        serde_json::to_string(val).unwrap_or_default()
    };
    raw.replace("##[", "##\\u005b")
}

pub fn render_report(
    report: &ValidationReport,
    format: ReportFormat,
    pretty_json: bool,
) -> String {
    let limitations: Vec<&str> = if report.corpus_loaded {
        Vec::new()
    } else {
        vec!["Game-object reference checks require an unpacked corpus or the Forge backend."]
    };
    let summary = format!(
        "X4 Forge validation {} | validator={} | errors={} warnings={} info={} | coverage={} | CLI limits={} | fail-on={}",
        if report.passed { "PASS" } else { "FAIL" },
        if report.validation_ok { "ok" } else { "errors" },
        report.counts.error,
        report.counts.warning,
        report.counts.info,
        if report.corpus_loaded { "complete" } else { "incomplete" },
        limitations.len(),
        report.fail_on
    );

    match format {
        ReportFormat::Text => {
            if report.findings.is_empty() {
                summary
            } else {
                let mut lines = Vec::with_capacity(report.findings.len() + 2);
                lines.push(summary);
                for f in &report.findings {
                    let loc = match (&f.file_path, f.line) {
                        (Some(p), Some(l)) => format!(" ({p}:{l})"),
                        (Some(p), None) => format!(" ({p})"),
                        _ => String::new(),
                    };
                    lines.push(format!("[{}] {}: {}{}", f.severity.as_str(), f.code, f.message, loc));
                }
                lines.join("\n")
            }
        }
        ReportFormat::Json => {
            let val = json!({
                "passed": report.passed,
                "validationOk": report.validation_ok,
                "failOn": report.fail_on,
                "counts": report.counts,
                "summary": summary,
                "modId": report.mod_id,
                "sourceHash": report.source_hash,
                "corpusLoaded": report.corpus_loaded,
                "schemasLoaded": report.schemas_loaded,
                "fixedCount": report.fixed_count,
                "suppressedCount": report.suppressed_count,
                "limitations": limitations,
                "findings": report.findings,
            });
            safe_json_string(&val, pretty_json)
        }
        ReportFormat::Github => {
            let mut lines = Vec::with_capacity(report.findings.len() + 1);
            for f in &report.findings {
                let cmd = match f.severity {
                    Severity::Info => "notice",
                    Severity::Warning => "warning",
                    Severity::Error => "error",
                };
                let mut props = vec![format!("title={}", escape_github_prop(&f.code))];
                if let Some(ref fp) = f.file_path {
                    props.push(format!("file={}", escape_github_prop(fp)));
                    if let Some(line) = f.line {
                        props.push(format!("line={line}"));
                        if let Some(col) = f.column {
                            props.push(format!("col={col}"));
                        }
                    }
                }
                lines.push(format!(
                    "::{cmd} {}::{}",
                    props.join(","),
                    escape_github_cmd(&f.message)
                ));
            }
            lines.push(summary);
            lines.join("\n")
        }
        ReportFormat::Sarif => {
            let mut rule_ids = BTreeSet::new();
            for f in &report.findings {
                rule_ids.insert(f.code.clone());
            }
            let rules: Vec<Value> = rule_ids.into_iter().map(|id| json!({ "id": id })).collect();
            let results: Vec<Value> = report
                .findings
                .iter()
                .map(|f| {
                    let level = match f.severity {
                        Severity::Info => "note",
                        Severity::Warning => "warning",
                        Severity::Error => "error",
                    };
                    let mut obj = json!({
                        "ruleId": f.code,
                        "level": level,
                        "message": { "text": f.message },
                        "properties": { "category": f.category }
                    });
                    if let Some(ref fp) = f.file_path {
                        let mut phys = json!({
                            "artifactLocation": { "uri": fp, "uriBaseId": "%SRCROOT%" }
                        });
                        if let Some(l) = f.line {
                            let mut reg = json!({ "startLine": l });
                            if let Some(c) = f.column {
                                reg["startColumn"] = json!(c);
                            }
                            phys["region"] = reg;
                        }
                        obj["locations"] = json!([{ "physicalLocation": phys }]);
                    }
                    obj
                })
                .collect();
            let sarif = json!({
                "$schema": "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
                "version": "2.1.0",
                "runs": [{
                    "tool": { "driver": { "name": "X4 Forge", "rules": rules } },
                    "columnKind": "utf16CodeUnits",
                    "results": results,
                }]
            });
            safe_json_string(&sarif, pretty_json)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_clean_and_broken_mod_fixtures() {
        let tmp = std::env::temp_dir().join(format!("x4val_unit_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("md")).unwrap();
        fs::create_dir_all(tmp.join("ui")).unwrap();
        fs::write(
            tmp.join("content.xml"),
            "<content id=\"unit_clean\" name=\"Clean\" version=\"100\"/>",
        )
        .unwrap();
        fs::write(
            tmp.join("md/clean.xml"),
            "<mdscript name=\"Clean\"><cues><cue name=\"Init\"><actions><set_value name=\"$ok\" exact=\"1\"/><do_if value=\"$ok == 1\"><debug_text text=\"'ok'\"/></do_if></actions></cue></cues></mdscript>",
        )
        .unwrap();
        fs::write(
            tmp.join("ui/clean.lua"),
            "local function onEvt()\n  return true\nend\nRegisterEvent(\"unit.ready\", onEvt)\n",
        )
        .unwrap();
        fs::write(
            tmp.join("md/raise.xml"),
            "<mdscript name=\"Raise\"><cues><cue name=\"R\"><actions><raise_lua_event name=\"unit.ready\"/></actions></cue></cues></mdscript>",
        )
        .unwrap();

        let rep = validate_mod(&tmp, &ValidateOptions::default()).unwrap();
        assert!(rep.passed, "expected clean mod pass, got: {:?}", rep.findings);

        // Now break Lua + MD cue ref + unmatched_else
        fs::write(tmp.join("ui/bad.lua"), "local function broken(\n  return\n").unwrap();
        fs::write(
            tmp.join("md/bad.xml"),
            "<mdscript name=\"Bad\"><cues><cue name=\"B\"><actions><do_else/><signal_cue cue=\"NoSuchCue\"/></actions></cue></cues></mdscript>",
        )
        .unwrap();
        let bad = validate_mod(&tmp, &ValidateOptions::default()).unwrap();
        assert!(!bad.passed);
        assert!(bad.findings.iter().any(|f| f.code == "lua.syntax_error"));
        assert!(bad.findings.iter().any(|f| f.code == "md.unmatched_else"));
        assert!(bad.findings.iter().any(|f| f.code == "cue.unresolved"));
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn forge_rules_suppresses_warning_not_error() {
        let tmp = std::env::temp_dir().join(format!("x4val_rules_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("md")).unwrap();
        fs::write(
            tmp.join("content.xml"),
            "<content id=\"rules_test\" name=\"Rules\" version=\"100\"/>",
        )
        .unwrap();
        fs::write(
            tmp.join("md/warn.xml"),
            "<mdscript name=\"W\"><cues><cue name=\"C\"><actions><debug_text text=\"$unset\"/></actions></cue></cues></mdscript>",
        )
        .unwrap();
        fs::write(
            tmp.join("forge.rules.json"),
            r#"{"version":1,"suppressions":[{"id":"allow.unset","owner":"qa","reason":"intentional global var probe","reviewBy":"2027-01-01","code":"md_pitfall.variable_never_set","file":"md/warn.xml"}]}"#,
        )
        .unwrap();
        let rep = validate_mod(&tmp, &ValidateOptions::default()).unwrap();
        assert_eq!(rep.suppressed_count, 1);
        assert!(rep.findings.is_empty());
        let _ = fs::remove_dir_all(&tmp);
    }
}
