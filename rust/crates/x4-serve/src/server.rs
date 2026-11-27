use crate::auth::{load_or_create_studio_token, validate_bind_host};
use crate::db::{iso_utc_from_ms, now_ms, ForgeDb};
use crate::routes::{
    fallback_handler, get_agent_keys, get_agent_schema, get_effective_capabilities, get_health,
    get_history, get_reference_search, get_reference_status, get_snapshots_list, get_workspace,
    get_workspaces, post_agent_keys, post_agent_keys_revoke, post_cat_extract, post_cat_list,
    post_history_revert, post_inspect, post_reference_scan, post_snapshots_create,
    post_snapshots_delete, post_snapshots_restore, post_tree_hash, post_validate, post_workspace,
    post_workspaces, AppState,
};
use crate::upstream::validate_upstream_origin;
use crate::ServeOptions;
use axum::routing::{get, post};
use axum::Router;
use serde_json::json;
use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::net::TcpListener;
use tokio::sync::RwLock;
use x4_corpus::CorpusIndex;
use x4_validate::xsd::XsdRegistry;
use x4_validate::{resolve_corpus_and_schemas, ValidateOptions};

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(get_health))
        .route("/api/agent/schema", get(get_agent_schema))
        .route("/api/reference/status", get(get_reference_status))
        .route(
            "/api/agent/capabilities/effective",
            get(get_effective_capabilities),
        )
        .route("/api/agent/keys", get(get_agent_keys).post(post_agent_keys))
        .route("/api/agent/keys/revoke", post(post_agent_keys_revoke))
        .route("/api/agent/workspaces", get(get_workspaces).post(post_workspaces))
        .route("/api/agent/workspace", get(get_workspace).post(post_workspace))
        .route("/api/agent/snapshots/list", get(get_snapshots_list))
        .route("/api/agent/snapshots/create", post(post_snapshots_create))
        .route("/api/agent/snapshots/restore", post(post_snapshots_restore))
        .route("/api/agent/snapshots/delete", post(post_snapshots_delete))
        .route("/api/agent/history", get(get_history))
        .route("/api/agent/history/revert", post(post_history_revert))
        .route("/api/agent/validate", post(post_validate))
        .route("/api/agent/reference/search", get(get_reference_search))
        .route("/api/agent/reference/scan", post(post_reference_scan))
        .route("/api/agent/inspect", post(post_inspect))
        .route("/api/agent/tree-hash", post(post_tree_hash))
        .route("/api/agent/cat/list", post(post_cat_list))
        .route("/api/agent/cat/extract", post(post_cat_extract))
        .fallback(fallback_handler)
        .with_state(state)
}

fn resolve_discovery_dir(opts: &ServeOptions) -> Option<PathBuf> {
    if opts.no_discovery {
        return None;
    }
    if let Some(ref d) = opts.discovery_dir {
        return Some(d.clone());
    }
    if let Ok(env_d) = std::env::var("X4FORGE_DISCOVERY_DIR") {
        let trimmed = env_d.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(|h| PathBuf::from(h).join(".x4forge"))
}

fn write_discovery_files(disc_dir: &Path, state: &AppState) -> Result<PathBuf, String> {
    let instances_dir = disc_dir.join("instances");
    fs::create_dir_all(&instances_dir).map_err(|e| {
        format!(
            "Failed creating discovery instances dir {}: {e}",
            instances_dir.display()
        )
    })?;
    let pid = std::process::id();
    let payload = serde_json::to_string_pretty(&json!({
        "url": format!("http://127.0.0.1:{}", state.port),
        "port": state.port,
        "pid": pid,
        "startedAt": state.started_at,
        "updatedAt": iso_utc_from_ms(now_ms()),
        "mode": state.mode,
        "version": state.version,
        "engine": "x4forge-rust",
    }))
    .unwrap();

    let inst_file = instances_dir.join(format!("{pid}.json"));
    let inst_tmp = instances_dir.join(format!("{pid}.json.tmp.{pid}"));
    fs::write(&inst_tmp, payload.as_bytes()).map_err(|e| format!("Write discovery tmp: {e}"))?;
    fs::rename(&inst_tmp, &inst_file).map_err(|e| format!("Rename discovery inst: {e}"))?;

    let latest_file = disc_dir.join("latest.json");
    let latest_tmp = disc_dir.join(format!("latest.json.tmp.{pid}"));
    fs::write(&latest_tmp, payload.as_bytes()).map_err(|e| format!("Write latest tmp: {e}"))?;
    fs::rename(&latest_tmp, &latest_file).map_err(|e| format!("Rename latest: {e}"))?;
    Ok(inst_file)
}

pub fn prepare_state(opts: &ServeOptions, bound_port: u16) -> Result<AppState, String> {
    let db_path = opts.data_dir.join("forge-serve.db");
    let db = ForgeDb::open(&db_path)?;
    let studio_token = load_or_create_studio_token(opts)?;

    let effective_unpacked = opts.unpacked_root.clone().or_else(|| {
        std::env::var("X4_REFERENCE_ROOT")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
    });
    let (corpus, xsd_reg) = if let Some(ref up) = effective_unpacked {
        match resolve_corpus_and_schemas(&ValidateOptions {
            unpacked_root: Some(up.clone()),
            corpus_cache: opts.corpus_cache.clone(),
            ..Default::default()
        }) {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("x4forge serve: corpus preload skipped ({e})");
                (CorpusIndex::default(), XsdRegistry::default())
            }
        }
    } else {
        (CorpusIndex::default(), XsdRegistry::default())
    };

    let upstream_url = match opts.upstream_url.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(u) => Some(validate_upstream_origin(u)?),
        None => None,
    };

    Ok(AppState {
        db: Arc::new(Mutex::new(db)),
        db_path,
        studio_token,
        port: bound_port,
        started_at: iso_utc_from_ms(now_ms()),
        mode: opts.mode.clone(),
        version: opts.version.clone(),
        static_dir: opts.static_dir.clone(),
        upstream_url,
        corpus_state: Arc::new(RwLock::new((corpus, xsd_reg))),
        unpacked_root: opts.unpacked_root.clone(),
        corpus_cache: opts.corpus_cache.clone(),
    })
}

pub fn run_serve_blocking(opts: ServeOptions) -> Result<i32, String> {
    let bind_ip = validate_bind_host(&opts.host)?;
    if let Some(ref u) = opts.upstream_url {
        let trimmed = u.trim();
        if !trimmed.is_empty() {
            validate_upstream_origin(trimmed)?;
        }
    }

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("Failed starting Tokio runtime: {e}"))?;

    rt.block_on(async move {
        let addr = SocketAddr::new(bind_ip, opts.port);
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| format!("Failed binding {addr}: {e}"))?;
        let local_addr = listener
            .local_addr()
            .map_err(|e| format!("Failed reading local_addr: {e}"))?;
        let bound_port = local_addr.port();

        let state = prepare_state(&opts, bound_port)?;
        let inst_file = if let Some(ref d) = resolve_discovery_dir(&opts) {
            match write_discovery_files(d, &state) {
                Ok(p) => Some(p),
                Err(e) => {
                    eprintln!("x4forge serve: discovery write warning: {e}");
                    None
                }
            }
        } else {
            None
        };

        if opts.ready_json {
            use std::io::Write;
            let line = json!({
                "ready": true,
                "port": bound_port,
                "url": format!("http://127.0.0.1:{bound_port}"),
                "pid": std::process::id(),
                "engine": "x4forge-rust",
            });
            println!("{line}");
            let _ = std::io::stdout().flush();
        } else {
            eprintln!("x4forge serve listening on http://127.0.0.1:{bound_port}");
        }

        let app = build_router(state);
        let serve_res = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = tokio::signal::ctrl_c().await;
            })
            .await
            .map_err(|e| format!("axum serve error: {e}"));

        if let Some(p) = inst_file {
            let _ = fs::remove_file(p);
        }

        serve_res?;
        Ok(0)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use x4_mcp::http_loopback::loopback_request;
    use std::time::Duration;

    #[test]
    fn axum_server_auth_scopes_and_traversal_work_end_to_end() {
        let tmp = std::env::temp_dir().join(format!("x4serve_http_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let data_dir = tmp.join("data");
        let static_dir = tmp.join("static");
        fs::create_dir_all(&data_dir).unwrap();
        fs::create_dir_all(&static_dir).unwrap();
        fs::write(
            static_dir.join("index.html"),
            "<!doctype html><html><head><title>Forge</title></head><body>ok</body></html>",
        )
        .unwrap();
        fs::write(tmp.join("outside.txt"), "SECRET_OUTSIDE").unwrap();

        let opts = ServeOptions {
            host: "127.0.0.1".to_string(),
            port: 0,
            data_dir,
            static_dir: Some(static_dir),
            studio_token: Some("unit-studio-tok".to_string()),
            no_discovery: true,
            ..Default::default()
        };

        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let port = rt.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let port = listener.local_addr().unwrap().port();
            let state = prepare_state(&opts, port).unwrap();
            let app = build_router(state);
            tokio::spawn(async move {
                let _ = axum::serve(listener, app)
                    .with_graceful_shutdown(async {
                        let _ = rx.await;
                    })
                    .await;
            });
            port
        });

        let base = format!("http://127.0.0.1:{port}");
        // Public routes
        let h = loopback_request("GET", &format!("{base}/api/health"), &[], None, Duration::from_secs(2)).unwrap();
        assert_eq!(h.status, 200);
        let s = loopback_request("GET", &format!("{base}/api/agent/schema"), &[], None, Duration::from_secs(2)).unwrap();
        assert_eq!(s.status, 200);

        // Unauthenticated workspace rejected 401
        let unauth = loopback_request("GET", &format!("{base}/api/agent/workspace"), &[], None, Duration::from_secs(2)).unwrap();
        assert_eq!(unauth.status, 401);

        // Studio mints read & write keys
        let studio_hdr = [("Authorization".to_string(), "Bearer unit-studio-tok".to_string())];
        let rk_res = loopback_request(
            "POST",
            &format!("{base}/api/agent/keys"),
            &studio_hdr,
            Some(br#"{"label":"r","scope":"read","ttl":"1h"}"#),
            Duration::from_secs(2),
        )
        .unwrap();
        assert_eq!(rk_res.status, 200);
        let read_key = serde_json::from_slice::<serde_json::Value>(&rk_res.body).unwrap()["token"]
            .as_str()
            .unwrap()
            .to_string();

        let wk_res = loopback_request(
            "POST",
            &format!("{base}/api/agent/keys"),
            &studio_hdr,
            Some(br#"{"label":"w","scope":"write","ttl":"1h"}"#),
            Duration::from_secs(2),
        )
        .unwrap();
        let write_key = serde_json::from_slice::<serde_json::Value>(&wk_res.body).unwrap()["token"]
            .as_str()
            .unwrap()
            .to_string();

        // Read key blocked 403 on write & keys
        let r_hdr = [("Authorization".to_string(), format!("Bearer {read_key}"))];
        let mut r_op_hdr = r_hdr.to_vec();
        r_op_hdr.push(("x-forge-operation-id".to_string(), "op_r1".to_string()));
        let r_write = loopback_request(
            "POST",
            &format!("{base}/api/agent/workspace"),
            &r_op_hdr,
            Some(br#"{"workspace":{"name":"X"}}"#),
            Duration::from_secs(2),
        )
        .unwrap();
        assert_eq!(r_write.status, 403);

        // Write key blocked 403 on key admin & wrong workspace
        let w_hdr = [("Authorization".to_string(), format!("Bearer {write_key}"))];
        let w_keys = loopback_request("GET", &format!("{base}/api/agent/keys"), &w_hdr, None, Duration::from_secs(2)).unwrap();
        assert_eq!(w_keys.status, 403);
        let mut w_other_hdr = w_hdr.to_vec();
        w_other_hdr.push(("x-workspace-id".to_string(), "ws_other".to_string()));
        let w_other = loopback_request("GET", &format!("{base}/api/agent/workspace"), &w_other_hdr, None, Duration::from_secs(2)).unwrap();
        assert_eq!(w_other.status, 403);

        // Static SPA & path traversal block
        let spa = loopback_request("GET", &format!("{base}/"), &[], None, Duration::from_secs(2)).unwrap();
        assert_eq!(spa.status, 200);
        assert!(String::from_utf8_lossy(&spa.body).contains("unit-studio-tok"));
        let trav = loopback_request("GET", &format!("{base}/%2e%2e/outside.txt"), &[], None, Duration::from_secs(2)).unwrap();
        assert!(trav.status == 403 || trav.status == 404);
        assert!(!String::from_utf8_lossy(&trav.body).contains("SECRET_OUTSIDE"));

        let _ = tx.send(());
        drop(rt);
        let _ = fs::remove_dir_all(&tmp);
    }
}
