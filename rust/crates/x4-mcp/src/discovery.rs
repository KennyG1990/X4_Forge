use crate::http_loopback::validate_loopback_url;
use crate::McpOptions;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

const ISOLATED_MODES: [&str; 3] = ["dev-build", "release-host", "lab"];

#[derive(Debug, Clone)]
pub struct ResolvedEndpoint {
    pub base_url: String,
    pub api_key: Option<String>,
    pub workspace_id: Option<String>,
    pub source: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveryRecord {
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    port: Option<u16>,
    #[serde(default)]
    host_mode: Option<String>,
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    api_key: Option<String>,
    #[serde(default)]
    workspace_id: Option<String>,
    #[serde(default)]
    started_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

fn is_isolated_mode(mode: &str) -> bool {
    let m = mode.trim().to_ascii_lowercase();
    ISOLATED_MODES.iter().any(|x| *x == m)
}

fn home_discovery_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(|h| PathBuf::from(h).join(".x4forge"))
}

fn norm_path(p: &Path) -> String {
    let canon = fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    let s = canon.to_string_lossy().replace('\\', "/");
    let stripped = s.strip_prefix("//?/").unwrap_or(&s).trim_end_matches('/');
    if cfg!(windows) {
        stripped.to_ascii_lowercase()
    } else {
        stripped.to_string()
    }
}

pub fn discover_endpoint(opts: &McpOptions) -> Result<Option<ResolvedEndpoint>, String> {
    let explicit_url = opts
        .url
        .clone()
        .or_else(|| std::env::var("X4FORGE_URL").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("auto"));

    let key = opts
        .api_key
        .clone()
        .or_else(|| std::env::var("X4FORGE_KEY").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let ws = opts
        .workspace_id
        .clone()
        .or_else(|| std::env::var("X4FORGE_WORKSPACE_ID").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if let Some(raw_url) = explicit_url {
        let parsed = validate_loopback_url(&raw_url)?;
        return Ok(Some(ResolvedEndpoint {
            base_url: parsed.base_url,
            api_key: key,
            workspace_id: ws,
            source: "explicit-url",
        }));
    }

    let env_disc = std::env::var("X4FORGE_DISCOVERY_DIR")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    let default_dir = home_discovery_dir();
    let disc_dir = match opts.discovery_dir.clone().or(env_disc).or_else(|| default_dir.clone()) {
        Some(d) => d,
        None => return Ok(None),
    };

    if !disc_dir.is_dir() {
        return Ok(None);
    }

    let allow_isolated = std::env::var("X4FORGE_ALLOW_ISOLATED_HOST")
        .ok()
        .is_some_and(|v| v.trim() == "1")
        || match default_dir.as_deref() {
            Some(def) => opts.discovery_dir.is_some()
                && norm_path(&disc_dir) != norm_path(def)
                && std::env::var("X4FORGE_ALLOW_ISOLATED_HOST").ok().as_deref() != Some("0"),
            None => false,
        };

    discover_from_dir(&disc_dir, allow_isolated, key, ws)
}

pub fn discover_from_dir(
    disc_dir: &Path,
    allow_isolated_host: bool,
    fallback_key: Option<String>,
    fallback_ws: Option<String>,
) -> Result<Option<ResolvedEndpoint>, String> {
    let mut files = Vec::new();
    let latest = disc_dir.join("latest.json");
    if latest.is_file() {
        files.push(latest);
    }
    let instances_dir = disc_dir.join("instances");
    if instances_dir.is_dir() {
        if let Ok(rd) = fs::read_dir(&instances_dir) {
            let mut inst_files: Vec<PathBuf> = rd
                .flatten()
                .map(|e| e.path())
                .filter(|p| {
                    p.is_file()
                        && p.extension()
                            .and_then(|e| e.to_str())
                            .is_some_and(|e| e.eq_ignore_ascii_case("json"))
                })
                .collect();
            inst_files.sort();
            files.extend(inst_files);
        }
    }

    let mut records: Vec<(String, DiscoveryRecord)> = Vec::new();
    for f in files {
        let Ok(raw) = fs::read_to_string(&f) else {
            continue;
        };
        let Ok(rec) = serde_json::from_str::<DiscoveryRecord>(&raw) else {
            continue;
        };
        let ts = rec
            .updated_at
            .clone()
            .or_else(|| rec.started_at.clone())
            .unwrap_or_default();
        records.push((ts, rec));
    }
    records.sort_by(|a, b| b.0.cmp(&a.0));

    let mut last_rejection: Option<String> = None;
    for (_, rec) in records {
        let effective_mode = rec
            .host_mode
            .as_deref()
            .or(rec.mode.as_deref())
            .unwrap_or("default");
        if !allow_isolated_host && is_isolated_mode(effective_mode) {
            last_rejection = Some(format!(
                "Refusing isolated Forge host mode '{effective_mode}' discovered in {}",
                disc_dir.display()
            ));
            continue;
        }
        let candidate_url = match (rec.url.as_deref(), rec.port) {
            (Some(u), _) if !u.trim().is_empty() => u.trim().to_string(),
            (_, Some(p)) if p > 0 => format!("http://127.0.0.1:{p}"),
            _ => continue,
        };
        let parsed = match validate_loopback_url(&candidate_url) {
            Ok(p) => p,
            Err(err) => {
                last_rejection = Some(err);
                continue;
            }
        };
        return Ok(Some(ResolvedEndpoint {
            base_url: parsed.base_url,
            api_key: rec.api_key.or(fallback_key),
            workspace_id: rec.workspace_id.or(fallback_ws),
            source: "discovered-instance",
        }));
    }

    if let Some(rej) = last_rejection {
        return Err(rej);
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_isolated_host_modes_unless_allowed() {
        let tmp = std::env::temp_dir().join(format!("x4mcp_disc_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        for mode in ["dev-build", "release-host", "lab"] {
            fs::write(
                tmp.join("latest.json"),
                format!(r#"{{"url":"http://127.0.0.1:3999","hostMode":"{mode}"}}"#),
            )
            .unwrap();
            let err = discover_from_dir(&tmp, false, None, None).unwrap_err();
            assert!(
                err.contains("Refusing isolated Forge host mode"),
                "expected refusal for {mode}, got: {err}"
            );
        }

        fs::write(
            tmp.join("latest.json"),
            r#"{"port":3999,"mode":"default"}"#,
        )
        .unwrap();
        let resolved = discover_from_dir(&tmp, false, None, None)
            .unwrap()
            .unwrap();
        assert_eq!(resolved.base_url, "http://127.0.0.1:3999");

        let _ = fs::remove_dir_all(&tmp);
    }
}
