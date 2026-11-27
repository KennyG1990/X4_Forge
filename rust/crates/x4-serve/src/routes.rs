use crate::auth::{
    authenticate_request, require_scope, require_studio, resolve_workspace_id,
    validate_operation_id, Actor, AgentScope,
};
use crate::capabilities::build_capability_contract;
use crate::db::{sha256_hex, CasReplaceOutcome, ForgeDb};
use crate::static_files::serve_static_path;
use crate::upstream::forward_to_upstream;
use axum::extract::{Query, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use base64::{engine::general_purpose::STANDARD as BASE64_STD, Engine as _};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;
use x4_catdat::{
    extract_cat_entry, parse_cat_file, safe_catalog_name, MAX_CAT_ENTRIES, MAX_CAT_MANIFEST_BYTES,
};
use x4_corpus::CorpusIndex;
use x4_lsp::analysis::{collect_mod_files, normalize_uri_key, path_to_uri};
use x4_lsp::providers::{
    compute_code_lenses, compute_diagnostics, compute_document_symbols, count_document_symbols,
};
use x4_tree::{hash_tree, HashTreeOptions};
use x4_validate::xsd::XsdRegistry;
use x4_validate::{
    resolve_corpus_and_schemas, validate_mod, validate_single_document, SeverityGate,
    ValidateOptions,
};

const VALID_MODES: [&str; 4] = ["default", "dev-build", "release-host", "lab"];

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<ForgeDb>>,
    pub db_path: PathBuf,
    pub studio_token: String,
    pub port: u16,
    pub started_at: String,
    pub mode: String,
    pub version: String,
    pub static_dir: Option<PathBuf>,
    pub upstream_url: Option<String>,
    pub corpus_state: Arc<RwLock<(CorpusIndex, XsdRegistry)>>,
    pub unpacked_root: Option<PathBuf>,
    pub corpus_cache: Option<PathBuf>,
}

impl AppState {
    pub fn public_identity(&self) -> Value {
        let mode = if VALID_MODES.contains(&self.mode.as_str()) {
            self.mode.as_str()
        } else {
            "unknown"
        };
        json!({
            "port": self.port,
            "pid": std::process::id(),
            "startedAt": self.started_at,
            "mode": mode,
            "version": self.version,
        })
    }
}

fn err_resp(status: StatusCode, val: Value) -> Response {
    (status, Json(val)).into_response()
}

fn header_workspace(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-workspace-id")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

fn ttl_ms_from_name(name: &str) -> Option<Option<i64>> {
    match name {
        "1h" => Some(Some(3_600_000)),
        "24h" => Some(Some(86_400_000)),
        "7d" => Some(Some(7 * 86_400_000)),
        "30d" => Some(Some(30 * 86_400_000)),
        "never" => Some(None),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// PUBLIC ROUTES
// ---------------------------------------------------------------------------

pub async fn get_health(State(state): State<AppState>) -> Response {
    let (ws_count, rec_count) = {
        let guard = state.db.lock().unwrap();
        (
            guard.workspace_count().unwrap_or(0),
            guard.receipt_count().unwrap_or(0),
        )
    };
    let corpus_guard = state.corpus_state.read().await;
    let (corpus, xsd_reg) = (&corpus_guard.0, &corpus_guard.1);
    Json(json!({
        "ok": true,
        "status": "ok",
        "engine": "x4forge-rust",
        "instance": state.public_identity(),
        "db": {
            "available": true,
            "driver": "rusqlite-bundled",
            "path": state.db_path.to_string_lossy(),
            "workspaces": ws_count,
            "receipts": rec_count,
        },
        "corpus": {
            "loaded": !corpus.root.is_empty(),
            "root": corpus.root,
            "fileCount": corpus.file_count,
            "factions": corpus.factions.len(),
            "wares": corpus.wares.len(),
            "macros": corpus.macros.len(),
            "sectors": corpus.sectors.len(),
            "schemas": xsd_reg.schemas.len(),
        },
    }))
    .into_response()
}

pub async fn get_agent_schema(State(state): State<AppState>) -> Response {
    Json(json!({
        "api_version": "2026-07-30.agent.v4",
        "engine": "x4forge-rust",
        "instance": state.public_identity(),
        "capability_contract": build_capability_contract(None),
        "auth": {
            "read_only_schema_is_public": true,
            "protected_routes": "All workspace and analysis routes require Authorization: Bearer <token>."
        }
    }))
    .into_response()
}

pub async fn get_reference_status(State(state): State<AppState>) -> Response {
    let guard = state.corpus_state.read().await;
    let (corpus, xsd_reg) = (&guard.0, &guard.1);
    let loaded = !corpus.root.is_empty();
    Json(json!({
        "ok": true,
        "ready": true,
        "engine": "x4forge-rust",
        "instance": state.public_identity(),
        "loaded": loaded,
        "root": corpus.root,
        "signature": corpus.signature,
        "fileCount": corpus.file_count,
        "counts": {
            "factions": corpus.factions.len(),
            "wares": corpus.wares.len(),
            "macros": corpus.macros.len(),
            "sectors": corpus.sectors.len(),
            "aiScripts": corpus.ai_scripts.len(),
            "orders": corpus.orders.len(),
            "mdProviders": corpus.md_providers.len(),
            "schemas": xsd_reg.schemas.len(),
        }
    }))
    .into_response()
}

// ---------------------------------------------------------------------------
// CAPABILITY DISCOVERY & KEYS
// ---------------------------------------------------------------------------

pub async fn get_effective_capabilities(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    let (filter_scope, actor_json) = match &actor {
        Actor::Studio { label } => (
            None,
            json!({ "kind": "studio", "label": label, "scope": "studio" }),
        ),
        Actor::Agent {
            id,
            label,
            scope,
            workspace_id,
        } => (
            Some(*scope),
            json!({
                "kind": "agent",
                "id": id,
                "label": label,
                "scope": scope.as_str(),
                "workspaceId": workspace_id,
            }),
        ),
    };
    let contract = build_capability_contract(filter_scope);
    let authority_hash = sha256_hex(serde_json::to_string(&contract).unwrap_or_default().as_bytes());
    Json(json!({
        "api_version": "2026-08-01.agent-effective.v1",
        "authority_hash": authority_hash,
        "actor": actor_json,
        "capability_contract": contract,
    }))
    .into_response()
}

pub async fn get_agent_keys(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_studio(&actor) {
        return err_resp(st, v);
    }
    let keys = {
        let mut guard = state.db.lock().unwrap();
        match guard.list_agent_keys() {
            Ok(list) => list,
            Err(e) => return err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e })),
        }
    };
    Json(json!({
        "keys": keys,
        "ttls": ["1h", "24h", "7d", "30d", "never"],
    }))
    .into_response()
}

pub async fn post_agent_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_studio(&actor) {
        return err_resp(st, v);
    }
    let Ok(Json(body)) = body_res else {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "code": "AGENT_KEY_REQUEST_INVALID", "error": "Invalid JSON body." }),
        );
    };
    let label = body
        .get("label")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let scope_raw = body.get("scope").and_then(|v| v.as_str()).unwrap_or("");
    let ttl_raw = body.get("ttl").and_then(|v| v.as_str()).unwrap_or("24h");
    if label.is_empty() {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Missing 'label'." }));
    }
    let Some(scope) = AgentScope::parse(scope_raw) else {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "error": "Invalid 'scope' — use read | write | deploy | all." }),
        );
    };
    let Some(ttl_ms) = ttl_ms_from_name(ttl_raw) else {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "error": "Invalid 'ttl' — use 1h | 24h | 7d | 30d | never." }),
        );
    };
    let ws_id = body
        .get("workspaceId")
        .and_then(|v| v.as_str())
        .or_else(|| header_workspace(&headers))
        .unwrap_or("ws_default")
        .trim()
        .to_string();

    let created = {
        let mut guard = state.db.lock().unwrap();
        guard.create_agent_key(label, scope, ttl_ms, &ws_id)
    };
    match created {
        Ok((token, record)) => Json(json!({ "token": token, "record": record })).into_response(),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e })),
    }
}

pub async fn post_agent_keys_revoke(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_studio(&actor) {
        return err_resp(st, v);
    }
    let Ok(Json(body)) = body_res else {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Invalid JSON body." }));
    };
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
    if id.is_empty() {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Missing 'id'." }));
    }
    let done = {
        let mut guard = state.db.lock().unwrap();
        guard.revoke_agent_key(id)
    };
    match done {
        Ok(true) => Json(json!({ "ok": true, "id": id })).into_response(),
        Ok(false) => err_resp(
            StatusCode::NOT_FOUND,
            json!({ "error": "No such active key (already revoked or unknown id)." }),
        ),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e })),
    }
}

// ---------------------------------------------------------------------------
// WORKSPACES & CAS MUTATION
// ---------------------------------------------------------------------------

pub async fn get_workspaces(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Read) {
        return err_resp(st, v);
    }
    let list = {
        let guard = state.db.lock().unwrap();
        guard.list_workspaces()
    };
    let rows = match list {
        Ok(r) => r,
        Err(e) => return err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e })),
    };

    let summaries: Vec<Value> = rows
        .into_iter()
        .filter(|w| match &actor {
            Actor::Studio { .. } => true,
            Actor::Agent { workspace_id, .. } => &w.workspace_id == workspace_id,
        })
        .map(|w| {
            json!({
                "workspaceId": w.workspace_id,
                "name": w.name,
                "version": w.version,
                "workspaceHash": w.workspace_hash,
                "snapshotHash": w.snapshot_hash,
                "origin": w.origin,
                "savedAt": w.saved_at,
            })
        })
        .collect();

    let default_id = match &actor {
        Actor::Studio { .. } => "ws_default".to_string(),
        Actor::Agent { workspace_id, .. } => workspace_id.clone(),
    };
    Json(json!({ "workspaces": summaries, "defaultWorkspaceId": default_id })).into_response()
}

pub async fn post_workspaces(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_studio(&actor) {
        return err_resp(st, v);
    }
    let op_id = match validate_operation_id(&headers) {
        Ok(id) => id,
        Err((st, v)) => return err_resp(st, v),
    };
    let Ok(Json(body)) = body_res else {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "code": "PROJECT_INPUT_INVALID", "error": "Expected JSON object body." }),
        );
    };

    let req_id = body
        .get("workspaceId")
        .or_else(|| body.get("id"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let mut ws_val = body
        .get("workspace")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(crate::db::default_workspace_value);

    let name = body
        .get("name")
        .and_then(|v| v.as_str())
        .or_else(|| ws_val.get("name").and_then(|v| v.as_str()))
        .unwrap_or("New_X4_Mod")
        .trim()
        .to_string();
    if let Some(obj) = ws_val.as_object_mut() {
        obj.insert("name".to_string(), Value::String(name.clone()));
    }

    let created = {
        let mut guard = state.db.lock().unwrap();
        guard.create_workspace(
            req_id,
            &name,
            ws_val,
            &op_id,
            actor.kind_str(),
            actor.label(),
        )
    };
    match created {
        Ok((rec, receipt, replayed)) => Json(json!({
            "workspaceId": rec.workspace_id,
            "workspace": rec.workspace,
            "version": rec.version,
            "workspaceHash": rec.workspace_hash,
            "snapshotHash": rec.snapshot_hash,
            "lastUpdated": rec.saved_at,
            "origin": rec.origin,
            "replayed": replayed,
            "receipt": receipt,
        }))
        .into_response(),
        Err((code_num, code_str, msg)) => {
            let st = StatusCode::from_u16(code_num).unwrap_or(StatusCode::BAD_REQUEST);
            err_resp(
                st,
                json!({ "success": false, "status": "FAILED", "code": code_str, "error": msg }),
            )
        }
    }
}

pub async fn get_workspace(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Read) {
        return err_resp(st, v);
    }
    let req_ws = query
        .get("workspaceId")
        .map(String::as_str)
        .or_else(|| header_workspace(&headers));
    let ws_id = match resolve_workspace_id(&actor, req_ws, "ws_default") {
        Ok(id) => id,
        Err((st, v)) => return err_resp(st, v),
    };
    let rec_opt = {
        let guard = state.db.lock().unwrap();
        guard.get_workspace(&ws_id)
    };
    match rec_opt {
        Ok(Some(rec)) => Json(json!({
            "workspaceId": rec.workspace_id,
            "workspace": rec.workspace,
            "version": rec.version,
            "workspaceHash": rec.workspace_hash,
            "snapshotHash": rec.snapshot_hash,
            "lastUpdated": rec.saved_at,
            "origin": rec.origin,
        }))
        .into_response(),
        Ok(None) => err_resp(
            StatusCode::NOT_FOUND,
            json!({ "code": "WORKSPACE_NOT_FOUND", "error": format!("Workspace '{ws_id}' not found.") }),
        ),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e })),
    }
}

pub async fn post_workspace(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    let op_id = match validate_operation_id(&headers) {
        Ok(id) => id,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Write) {
        return err_resp(st, v);
    }
    let Ok(Json(body)) = body_res else {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "code": "PROJECT_INPUT_INVALID", "error": "Expected JSON body." }),
        );
    };
    let Some(ws_obj) = body.get("workspace").filter(|v| v.is_object()).cloned() else {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "code": "PROJECT_INPUT_INVALID", "error": "POST /api/agent/workspace requires an object 'workspace' field." }),
        );
    };
    if body.get("force").and_then(|v| v.as_bool()) == Some(true) {
        if let Err((st, v)) = require_scope(&actor, AgentScope::Deploy) {
            return err_resp(st, v);
        }
    }
    let req_ws = body
        .get("workspaceId")
        .and_then(|v| v.as_str())
        .or_else(|| header_workspace(&headers));
    let ws_id = match resolve_workspace_id(&actor, req_ws, "ws_default") {
        Ok(id) => id,
        Err((st, v)) => return err_resp(st, v),
    };

    let expected_version = body.get("expectedVersion").and_then(|v| v.as_i64());
    let expected_head = body.get("expectedHead").and_then(|v| v.as_str());
    let expected_snap = body.get("expectedSnapshotHash").and_then(|v| v.as_str());
    let dry_run = body.get("dryRun").and_then(|v| v.as_bool()).unwrap_or(false);

    let outcome = {
        let mut guard = state.db.lock().unwrap();
        guard.replace_workspace_cas(
            &ws_id,
            &op_id,
            actor.kind_str(),
            actor.label(),
            ws_obj,
            expected_version,
            expected_head,
            expected_snap,
            dry_run,
        )
    };
    match outcome {
        Ok(CasReplaceOutcome::Replaced {
            record,
            receipt,
            replayed,
        }) => Json(json!({
            "workspaceId": record.workspace_id,
            "workspace": record.workspace,
            "version": record.version,
            "workspaceHash": record.workspace_hash,
            "snapshotHash": record.snapshot_hash,
            "lastUpdated": record.saved_at,
            "origin": record.origin,
            "replayed": replayed,
            "receipt": receipt,
        }))
        .into_response(),
        Ok(CasReplaceOutcome::DryRun {
            current_version,
            next_version,
            workspace_hash,
            snapshot_hash,
        }) => Json(json!({
            "dryRun": true,
            "workspaceId": ws_id,
            "currentVersion": current_version,
            "nextVersion": next_version,
            "workspaceHash": workspace_hash,
            "snapshotHash": snapshot_hash,
        }))
        .into_response(),
        Ok(CasReplaceOutcome::Conflict {
            code,
            message,
            current_version,
            current_workspace_hash,
            current_snapshot_hash,
        }) => err_resp(
            StatusCode::CONFLICT,
            json!({
                "success": false,
                "status": "FAILED",
                "code": code,
                "error": message,
                "currentVersion": current_version,
                "currentWorkspaceHash": current_workspace_hash,
                "currentSnapshotHash": current_snapshot_hash,
            }),
        ),
        Ok(CasReplaceOutcome::NotFound(msg)) => err_resp(
            StatusCode::NOT_FOUND,
            json!({ "code": "WORKSPACE_NOT_FOUND", "error": msg }),
        ),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e })),
    }
}

// ---------------------------------------------------------------------------
// SNAPSHOTS & ACTION HISTORY
// ---------------------------------------------------------------------------

pub async fn get_snapshots_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Read) {
        return err_resp(st, v);
    }
    let req_ws = query
        .get("modId")
        .or_else(|| query.get("workspaceId"))
        .map(String::as_str)
        .or_else(|| header_workspace(&headers));
    let ws_id = match resolve_workspace_id(&actor, req_ws, "ws_default") {
        Ok(id) => id,
        Err((st, v)) => return err_resp(st, v),
    };
    let snaps = {
        let guard = state.db.lock().unwrap();
        guard.list_snapshots(&ws_id)
    };
    match snaps {
        Ok(list) => Json(json!({
            "ok": true,
            "success": true,
            "modId": ws_id,
            "total": list.len(),
            "snapshots": list,
        }))
        .into_response(),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e })),
    }
}

pub async fn post_snapshots_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Write) {
        return err_resp(st, v);
    }
    let body = body_res.map(|Json(v)| v).unwrap_or_else(|_| json!({}));
    let req_ws = body
        .get("modId")
        .or_else(|| body.get("workspaceId"))
        .and_then(|v| v.as_str())
        .or_else(|| header_workspace(&headers));
    let ws_id = match resolve_workspace_id(&actor, req_ws, "ws_default") {
        Ok(id) => id,
        Err((st, v)) => return err_resp(st, v),
    };
    let name_opt = body.get("name").and_then(|v| v.as_str());
    let created = {
        let mut guard = state.db.lock().unwrap();
        guard.create_snapshot(&ws_id, name_opt, actor.kind_str(), actor.label())
    };
    match created {
        Ok(meta) => Json(json!({
            "ok": true,
            "success": true,
            "modId": ws_id,
            "snapshotName": meta.snapshot_name,
            "name": meta.name,
            "savedAt": meta.saved_at,
            "sha256": meta.sha256,
            "bytes": meta.bytes,
            "nodeCount": meta.node_count,
            "linkCount": meta.link_count,
        }))
        .into_response(),
        Err((st, code, msg)) => err_resp(
            StatusCode::from_u16(st).unwrap_or(StatusCode::BAD_REQUEST),
            json!({ "ok": false, "success": false, "code": code, "error": msg }),
        ),
    }
}

pub async fn post_snapshots_restore(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Write) {
        return err_resp(st, v);
    }
    let Ok(Json(body)) = body_res else {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "ok": false, "code": "CAPABILITY_INPUT_INVALID", "error": "Expected JSON object." }),
        );
    };
    let snap_name = body
        .get("snapshotName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if snap_name.is_empty() {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "ok": false, "code": "CAPABILITY_INPUT_INVALID", "error": "Missing 'snapshotName'." }),
        );
    }
    let req_ws = body
        .get("modId")
        .or_else(|| body.get("workspaceId"))
        .and_then(|v| v.as_str())
        .or_else(|| header_workspace(&headers));
    let ws_id = match resolve_workspace_id(&actor, req_ws, "ws_default") {
        Ok(id) => id,
        Err((st, v)) => return err_resp(st, v),
    };
    let restored = {
        let mut guard = state.db.lock().unwrap();
        guard.restore_snapshot(&ws_id, snap_name, actor.kind_str(), actor.label())
    };
    match restored {
        Ok((rec, receipt)) => Json(json!({
            "ok": true,
            "success": true,
            "snapshotName": snap_name,
            "workspaceId": rec.workspace_id,
            "workspace": rec.workspace,
            "version": rec.version,
            "workspaceHash": rec.workspace_hash,
            "snapshotHash": rec.snapshot_hash,
            "receipt": receipt,
        }))
        .into_response(),
        Err((st, code, msg)) => err_resp(
            StatusCode::from_u16(st).unwrap_or(StatusCode::BAD_REQUEST),
            json!({ "ok": false, "success": false, "code": code, "error": msg }),
        ),
    }
}

pub async fn post_snapshots_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Write) {
        return err_resp(st, v);
    }
    let Ok(Json(body)) = body_res else {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "ok": false, "code": "CAPABILITY_INPUT_INVALID", "error": "Expected JSON object." }),
        );
    };
    let snap_name = body
        .get("snapshotName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if snap_name.is_empty() {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "ok": false, "code": "CAPABILITY_INPUT_INVALID", "error": "Missing 'snapshotName'." }),
        );
    }
    let req_ws = body
        .get("modId")
        .or_else(|| body.get("workspaceId"))
        .and_then(|v| v.as_str())
        .or_else(|| header_workspace(&headers));
    let ws_id = match resolve_workspace_id(&actor, req_ws, "ws_default") {
        Ok(id) => id,
        Err((st, v)) => return err_resp(st, v),
    };
    let del = {
        let mut guard = state.db.lock().unwrap();
        guard.delete_snapshot(&ws_id, snap_name, actor.kind_str(), actor.label())
    };
    match del {
        Ok(()) => Json(json!({
            "ok": true,
            "success": true,
            "snapshotName": snap_name,
        }))
        .into_response(),
        Err((st, code, msg)) => err_resp(
            StatusCode::from_u16(st).unwrap_or(StatusCode::BAD_REQUEST),
            json!({ "ok": false, "success": false, "code": code, "error": msg }),
        ),
    }
}

pub async fn get_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Read) {
        return err_resp(st, v);
    }
    let req_ws = query
        .get("workspaceId")
        .map(String::as_str)
        .or_else(|| header_workspace(&headers));
    let ws_id = match resolve_workspace_id(&actor, req_ws, "ws_default") {
        Ok(id) => id,
        Err((st, v)) => return err_resp(st, v),
    };
    let limit = query
        .get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(50);
    let list = {
        let guard = state.db.lock().unwrap();
        guard.list_receipts(&ws_id, limit)
    };
    match list {
        Ok(receipts) => Json(json!({
            "ok": true,
            "workspaceId": ws_id,
            "total": receipts.len(),
            "receipts": receipts,
            "entries": receipts,
        }))
        .into_response(),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e })),
    }
}

pub async fn post_history_revert(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Write) {
        return err_resp(st, v);
    }
    let body = body_res.map(|Json(v)| v).unwrap_or_else(|_| json!({}));
    let id_opt = body
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let req_ws = body
        .get("workspaceId")
        .and_then(|v| v.as_str())
        .or_else(|| header_workspace(&headers));
    let ws_id = match resolve_workspace_id(&actor, req_ws, "ws_default") {
        Ok(id) => id,
        Err((st, v)) => return err_resp(st, v),
    };
    let reverted = {
        let mut guard = state.db.lock().unwrap();
        guard.revert_receipt(id_opt, &ws_id, actor.kind_str(), actor.label())
    };
    match reverted {
        Ok((reverted_id, rec, receipt)) => Json(json!({
            "ok": true,
            "success": true,
            "revertedToReceiptId": reverted_id,
            "workspaceId": rec.workspace_id,
            "workspace": rec.workspace,
            "version": rec.version,
            "workspaceHash": rec.workspace_hash,
            "snapshotHash": rec.snapshot_hash,
            "receipt": receipt,
        }))
        .into_response(),
        Err((st, code, msg)) => err_resp(
            StatusCode::from_u16(st).unwrap_or(StatusCode::BAD_REQUEST),
            json!({ "ok": false, "success": false, "code": code, "error": msg }),
        ),
    }
}

// ---------------------------------------------------------------------------
// IN-PROCESS RUST ENGINES (VALIDATE, CORPUS, LSP, TREE, CATDAT)
// ---------------------------------------------------------------------------

pub async fn post_validate(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Read) {
        return err_resp(st, v);
    }
    let Ok(Json(body)) = body_res else {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Expected JSON body." }));
    };

    if let Some(mod_dir) = body.get("modDir").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
        let mod_path = PathBuf::from(mod_dir.trim());
        let fail_on = match body.get("failOn").and_then(|v| v.as_str()) {
            Some(g) => match SeverityGate::parse(g) {
                Ok(parsed) => Some(parsed),
                Err(e) => return err_resp(StatusCode::BAD_REQUEST, json!({ "error": e })),
            },
            None => None,
        };
        let fix = body.get("fix").and_then(|v| v.as_bool()).unwrap_or(false);
        let unpacked = body
            .get("unpackedRoot")
            .and_then(|v| v.as_str())
            .map(PathBuf::from)
            .or_else(|| state.unpacked_root.clone());
        let cache = state.corpus_cache.clone();
        let res = tokio::task::spawn_blocking(move || {
            validate_mod(
                &mod_path,
                &ValidateOptions {
                    unpacked_root: unpacked,
                    game_root: None,
                    extension_roots: Vec::new(),
                    corpus_cache: cache,
                    apply_fix: fix,
                    fail_on,
                },
            )
        })
        .await;
        return match res {
            Ok(Ok(report)) => Json(serde_json::to_value(report).unwrap()).into_response(),
            Ok(Err(e)) => err_resp(StatusCode::BAD_REQUEST, json!({ "error": e })),
            Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e.to_string() })),
        };
    }

    let Some(text) = body.get("text").and_then(|v| v.as_str()).map(str::to_string) else {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "error": "POST /api/agent/validate requires either 'modDir' or 'text'." }),
        );
    };
    let rel_path = body
        .get("relPath")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            if text.contains("<mdscript") {
                "md/inline.xml".to_string()
            } else if text.contains("<aiscript") {
                "aiscripts/inline.xml".to_string()
            } else {
                "document.xml".to_string()
            }
        });

    let corpus_arc = state.corpus_state.clone();
    let res = tokio::task::spawn_blocking(move || {
        let guard = corpus_arc.blocking_read();
        let diags = validate_single_document(&rel_path, &text, &guard.0, &guard.1);
        let mut errors = 0usize;
        let mut warnings = 0usize;
        let mut info = 0usize;
        for d in &diags {
            match d.severity {
                x4_validate::Severity::Error => errors += 1,
                x4_validate::Severity::Warning => warnings += 1,
                x4_validate::Severity::Info => info += 1,
            }
        }
        json!({
            "passed": errors == 0,
            "validationOk": errors == 0,
            "relPath": rel_path,
            "counts": { "error": errors, "warning": warnings, "info": info },
            "findings": diags,
        })
    })
    .await;

    match res {
        Ok(val) => Json(val).into_response(),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e.to_string() })),
    }
}

pub async fn get_reference_search(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Read) {
        return err_resp(st, v);
    }
    let q = query
        .get("q")
        .or_else(|| query.get("query"))
        .map(|s| s.trim().to_ascii_lowercase())
        .unwrap_or_default();
    if q.is_empty() {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "error": "Missing required query parameter 'q'." }),
        );
    }
    let kind = query
        .get("kind")
        .map(|s| s.trim().to_ascii_lowercase())
        .unwrap_or_else(|| "all".to_string());
    let limit = query
        .get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(50)
        .clamp(1, 200);

    let guard = state.corpus_state.read().await;
    let corpus = &guard.0;
    let want = |k: &str| kind == "all" || kind == k;
    let mut items: Vec<Value> = Vec::new();
    let mut matched = 0usize;

    if want("faction") {
        for f in &corpus.factions {
            if f.contains(&q) {
                matched += 1;
                if items.len() < limit {
                    items.push(json!({ "kind": "faction", "id": f }));
                }
            }
        }
    }
    if want("ware") {
        for w in &corpus.wares {
            if w.contains(&q) {
                matched += 1;
                if items.len() < limit {
                    items.push(json!({ "kind": "ware", "id": w }));
                }
            }
        }
    }
    if want("macro") {
        for m in &corpus.macros {
            if m.contains(&q) {
                matched += 1;
                if items.len() < limit {
                    items.push(json!({ "kind": "macro", "id": m }));
                }
            }
        }
    }
    if want("sector") {
        for s in &corpus.sectors {
            if s.contains(&q) {
                matched += 1;
                if items.len() < limit {
                    items.push(json!({ "kind": "sector", "id": s }));
                }
            }
        }
    }
    if want("aiscript") {
        for (id, def) in &corpus.ai_scripts {
            if id.contains(&q) {
                matched += 1;
                if items.len() < limit {
                    items.push(json!({ "kind": "aiscript", "id": def.id, "relativePath": def.relative_path }));
                }
            }
        }
    }
    if want("order") {
        for (id, def) in &corpus.orders {
            if id.contains(&q) {
                matched += 1;
                if items.len() < limit {
                    items.push(json!({ "kind": "order", "id": def.id, "paramCount": def.params.len() }));
                }
            }
        }
    }
    if want("md") {
        for (k, prov) in &corpus.md_providers {
            if k.contains(&q) {
                matched += 1;
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

    Json(json!({
        "query": q,
        "kind": kind,
        "corpusLoaded": !corpus.root.is_empty(),
        "totalMatched": matched,
        "items": items,
    }))
    .into_response()
}

pub async fn post_reference_scan(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Write) {
        return err_resp(st, v);
    }
    let body = body_res.map(|Json(v)| v).unwrap_or_else(|_| json!({}));
    let unpacked = body
        .get("unpackedRoot")
        .and_then(|v| v.as_str())
        .map(|s| PathBuf::from(s.trim()))
        .or_else(|| state.unpacked_root.clone());
    let cache = body
        .get("cachePath")
        .and_then(|v| v.as_str())
        .map(|s| PathBuf::from(s.trim()))
        .or_else(|| state.corpus_cache.clone());
    let Some(up) = unpacked else {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "error": "Missing 'unpackedRoot' and no server --unpacked directory configured." }),
        );
    };

    let scanned = tokio::task::spawn_blocking(move || {
        resolve_corpus_and_schemas(&ValidateOptions {
            unpacked_root: Some(up),
            corpus_cache: cache,
            ..Default::default()
        })
    })
    .await;

    match scanned {
        Ok(Ok((corpus, xsd_reg))) => {
            let summary = json!({
                "ok": true,
                "root": corpus.root,
                "fileCount": corpus.file_count,
                "factions": corpus.factions.len(),
                "wares": corpus.wares.len(),
                "macros": corpus.macros.len(),
                "sectors": corpus.sectors.len(),
                "schemas": xsd_reg.schemas.len(),
            });
            let mut guard = state.corpus_state.write().await;
            *guard = (corpus, xsd_reg);
            Json(summary).into_response()
        }
        Ok(Err(e)) => err_resp(StatusCode::BAD_REQUEST, json!({ "error": e })),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e.to_string() })),
    }
}

pub async fn post_inspect(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Read) {
        return err_resp(st, v);
    }
    let Ok(Json(body)) = body_res else {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Expected JSON body." }));
    };
    let text_opt = body.get("text").and_then(|v| v.as_str()).map(str::to_string);
    let path_opt = body
        .get("path")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let rel_opt = body
        .get("relPath")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(str::to_string);

    let text = match text_opt {
        Some(t) => t,
        None => {
            let Some(ref p) = path_opt else {
                return err_resp(
                    StatusCode::BAD_REQUEST,
                    json!({ "error": "POST /api/agent/inspect requires 'text' or 'path'." }),
                );
            };
            match std::fs::read_to_string(p) {
                Ok(s) => s,
                Err(e) => return err_resp(StatusCode::BAD_REQUEST, json!({ "error": e.to_string() })),
            }
        }
    };

    let uri = match path_opt.as_deref() {
        Some(p) => path_to_uri(Path::new(p))
            .unwrap_or_else(|| url::Url::parse("file:///document.xml").unwrap()),
        None => {
            let rel = rel_opt.as_deref().unwrap_or("document.xml");
            url::Url::parse(&format!("file:///workspace/{rel}"))
                .unwrap_or_else(|_| url::Url::parse("file:///workspace/document.xml").unwrap())
        }
    };

    let corpus_arc = state.corpus_state.clone();
    let res = tokio::task::spawn_blocking(move || {
        let mut open_docs = HashMap::new();
        open_docs.insert(normalize_uri_key(&uri), (uri.clone(), text));
        let mut ctx = collect_mod_files(&uri, &open_docs);
        if let Some(rel) = rel_opt {
            ctx.files[ctx.active_idx].rel_path = rel;
        }
        let guard = corpus_arc.blocking_read();
        let active = ctx.active();
        let symbols = compute_document_symbols(&active.rel_path, &active.text);
        let lenses = compute_code_lenses(&ctx);
        let diags = compute_diagnostics(&ctx, &guard.0, &guard.1);
        json!({
            "relPath": active.rel_path,
            "symbolCount": count_document_symbols(&symbols),
            "symbols": symbols,
            "codeLensCount": lenses.len(),
            "codeLenses": lenses,
            "diagnosticCount": diags.len(),
            "diagnostics": diags,
        })
    })
    .await;

    match res {
        Ok(val) => Json(val).into_response(),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e.to_string() })),
    }
}

pub async fn post_tree_hash(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Read) {
        return err_resp(st, v);
    }
    let Ok(Json(body)) = body_res else {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Expected JSON body." }));
    };
    let Some(root) = body.get("root").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) else {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Missing 'root'." }));
    };
    let check_utf8 = body.get("checkUtf8").and_then(|v| v.as_bool()).unwrap_or(false);
    let exclude_dirs: Vec<String> = body
        .get("excludeDirs")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let root_pb = PathBuf::from(root.trim());

    let res = tokio::task::spawn_blocking(move || {
        hash_tree(
            &root_pb,
            HashTreeOptions {
                check_utf8,
                exclude_dirs,
                ..Default::default()
            },
        )
    })
    .await;
    match res {
        Ok(Ok(rep)) => Json(serde_json::to_value(rep).unwrap()).into_response(),
        Ok(Err(e)) => err_resp(StatusCode::BAD_REQUEST, json!({ "error": e.to_string() })),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e.to_string() })),
    }
}

pub async fn post_cat_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Read) {
        return err_resp(st, v);
    }
    let Ok(Json(body)) = body_res else {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Expected JSON body." }));
    };
    let Some(cat_path) = body.get("catPath").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) else {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Missing 'catPath'." }));
    };
    let strict = body.get("strict").and_then(|v| v.as_bool()).unwrap_or(true);
    let filter = body.get("filter").and_then(|v| v.as_str()).map(|s| s.to_ascii_lowercase());
    let limit = body.get("limit").and_then(|v| v.as_u64()).unwrap_or(200).clamp(1, 2000) as usize;
    let cat_pb = PathBuf::from(cat_path.trim());

    let res = tokio::task::spawn_blocking(move || {
        parse_cat_file(&cat_pb, MAX_CAT_MANIFEST_BYTES, MAX_CAT_ENTRIES, strict)
    })
    .await;
    match res {
        Ok(Ok(entries)) => {
            let filtered: Vec<_> = entries
                .iter()
                .filter(|e| filter.as_deref().is_none_or(|f| e.name.to_ascii_lowercase().contains(f)))
                .take(limit)
                .cloned()
                .collect();
            Json(json!({
                "totalEntries": entries.len(),
                "returned": filtered.len(),
                "entries": filtered,
            }))
            .into_response()
        }
        Ok(Err(e)) => err_resp(StatusCode::BAD_REQUEST, json!({ "error": e })),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e.to_string() })),
    }
}

pub async fn post_cat_extract(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_res: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let actor = match authenticate_request(&headers, &state.studio_token, &state.db) {
        Ok(a) => a,
        Err((st, v)) => return err_resp(st, v),
    };
    if let Err((st, v)) = require_scope(&actor, AgentScope::Read) {
        return err_resp(st, v);
    }
    let Ok(Json(body)) = body_res else {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Expected JSON body." }));
    };
    let Some(cat_path) = body.get("catPath").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) else {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Missing 'catPath'." }));
    };
    let Some(dat_path) = body.get("datPath").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) else {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Missing 'datPath'." }));
    };
    let Some(entry_name) = body.get("entryName").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) else {
        return err_resp(StatusCode::BAD_REQUEST, json!({ "error": "Missing 'entryName'." }));
    };
    let Some(safe_target) = safe_catalog_name(entry_name) else {
        return err_resp(
            StatusCode::BAD_REQUEST,
            json!({ "code": "CAT_UNSAFE_ENTRY", "error": format!("Unsafe catalog entry path '{entry_name}'") }),
        );
    };
    let max_inline = body.get("maxInlineBytes").and_then(|v| v.as_u64()).unwrap_or(262_144) as usize;
    let cat_pb = PathBuf::from(cat_path.trim());
    let dat_pb = PathBuf::from(dat_path.trim());

    let res = tokio::task::spawn_blocking(move || -> Result<Value, (StatusCode, String)> {
        let entries = parse_cat_file(&cat_pb, MAX_CAT_MANIFEST_BYTES, MAX_CAT_ENTRIES, true)
            .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
        let entry = entries
            .iter()
            .find(|e| e.name.eq_ignore_ascii_case(&safe_target))
            .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Catalog entry not found: {safe_target}")))?;
        let bytes = extract_cat_entry(&dat_pb, entry).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
        if bytes.len() > max_inline {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                format!("Entry exceeds maxInlineBytes ({})", max_inline),
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
    })
    .await;

    match res {
        Ok(Ok(v)) => Json(v).into_response(),
        Ok(Err((st, msg))) => err_resp(st, json!({ "error": msg })),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e.to_string() })),
    }
}

// ---------------------------------------------------------------------------
// FALLBACK: UPSTREAM STRANGLER PROXY + STATIC SPA
// ---------------------------------------------------------------------------

pub async fn fallback_handler(State(state): State<AppState>, req: Request) -> Response {
    let path = req.uri().path().to_string();
    if path.starts_with("/api/") {
        if let Some(ref upstream) = state.upstream_url {
            return forward_to_upstream(upstream, req).await;
        }
        return err_resp(
            StatusCode::NOT_FOUND,
            json!({ "ok": false, "code": "ROUTE_NOT_FOUND", "error": format!("No route matched {path}") }),
        );
    }

    if let Some(ref sdir) = state.static_dir {
        return serve_static_path(sdir, &path, &state.studio_token);
    }
    if let Some(ref upstream) = state.upstream_url {
        return forward_to_upstream(upstream, req).await;
    }

    err_resp(
        StatusCode::NOT_FOUND,
        json!({ "ok": false, "error": format!("No static-dir or route matched {path}") }),
    )
}

#[allow(dead_code)]
fn _unused_map_guard(_: Map<String, Value>) {}
