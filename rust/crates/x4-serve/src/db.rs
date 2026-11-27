use crate::auth::AgentScope;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const AGENT_KEY_PREFIX: &str = "x4fk_";

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn iso_utc_from_ms(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let sub_ms = ms.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let sec_of_day = secs.rem_euclid(86_400);
    let hour = sec_of_day / 3600;
    let minute = (sec_of_day % 3600) / 60;
    let second = sec_of_day % 60;

    // Howard Hinnant civil-from-days algorithm
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    format!("{year:04}-{m:02}-{d:02}T{hour:02}:{minute:02}:{second:02}.{sub_ms:03}Z")
}

pub fn random_hex(bytes_len: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes_len];
    getrandom::getrandom(&mut buf).map_err(|e| format!("CSPRNG error: {e}"))?;
    Ok(hex::encode(buf))
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn canonicalize_value(val: &Value) -> Value {
    match val {
        Value::Object(map) => {
            let mut sorted = BTreeMap::new();
            for (k, v) in map {
                sorted.insert(k.clone(), canonicalize_value(v));
            }
            let mut out = Map::new();
            for (k, v) in sorted {
                out.insert(k, v);
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(canonicalize_value).collect()),
        other => other.clone(),
    }
}

pub fn compute_workspace_hash(ws_val: &Value) -> String {
    let canon = canonicalize_value(ws_val);
    let encoded = serde_json::to_string(&canon).unwrap_or_default();
    sha256_hex(encoded.as_bytes())
}

pub fn compute_snapshot_hash(workspace_id: &str, version: i64, ws_hash: &str) -> String {
    let payload = format!("{workspace_id}:{version}:{ws_hash}");
    sha256_hex(payload.as_bytes())
}

pub fn default_workspace_value() -> Value {
    json!({
        "id": "ws_default",
        "name": "My_X4_Mod",
        "version": "1.0.0",
        "author": "X4 Forge",
        "description": "Default X4 Forge Rust workspace",
        "nodes": [],
        "links": [],
        "uiWidgets": [],
        "uiTheme": {
            "backgroundColor": "#0f172a",
            "borderColor": "#334155",
            "accentColor": "#38bdf8",
            "opacity": 0.95,
            "showIcons": true
        }
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecord {
    pub workspace_id: String,
    pub name: String,
    pub version: i64,
    pub workspace: Value,
    pub workspace_hash: String,
    pub snapshot_hash: String,
    pub origin: String,
    pub saved_at: String,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub snapshot_name: String,
    pub name: String,
    pub saved_at: String,
    pub sha256: String,
    pub bytes: i64,
    pub node_count: usize,
    pub link_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentKeyPublic {
    pub id: String,
    pub label: String,
    pub scope: String,
    pub workspace_id: String,
    pub created_at: i64,
    pub expires_at: Option<i64>,
    pub last_used_at: Option<i64>,
    pub use_count: i64,
    pub revoked_at: Option<i64>,
    pub hash_prefix: String,
    pub authority_mode: &'static str,
}

#[derive(Debug, Clone)]
pub struct VerifiedKey {
    pub id: String,
    pub label: String,
    pub scope: AgentScope,
    pub workspace_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerifyKeyFailure {
    Unknown,
    Expired,
    Revoked,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionReceipt {
    pub id: String,
    pub operation_id: Option<String>,
    pub timestamp: i64,
    pub saved_at: String,
    pub actor_kind: String,
    pub actor_label: String,
    pub route: String,
    pub workspace_id: String,
    pub status: String,
    pub summary: String,
}

#[derive(Debug)]
pub enum CasReplaceOutcome {
    Replaced {
        record: WorkspaceRecord,
        receipt: ActionReceipt,
        replayed: bool,
    },
    DryRun {
        current_version: i64,
        next_version: i64,
        workspace_hash: String,
        snapshot_hash: String,
    },
    Conflict {
        code: &'static str,
        message: String,
        current_version: i64,
        current_workspace_hash: String,
        current_snapshot_hash: String,
    },
    NotFound(String),
}

pub struct ForgeDb {
    conn: Connection,
}

impl ForgeDb {
    pub fn open(db_path: &Path) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed creating DB dir {}: {e}", parent.display()))?;
            }
        }
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed opening SQLite DB {}: {e}", db_path.display()))?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;

            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workspaces (
                workspace_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                version INTEGER NOT NULL,
                workspace_json TEXT NOT NULL,
                workspace_hash TEXT NOT NULL,
                snapshot_hash TEXT NOT NULL,
                origin TEXT NOT NULL,
                saved_at TEXT NOT NULL,
                updated_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workspace_snapshots (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                name TEXT NOT NULL,
                saved_at TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                bytes INTEGER NOT NULL,
                node_count INTEGER NOT NULL,
                link_count INTEGER NOT NULL,
                workspace_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ws_snaps ON workspace_snapshots(workspace_id, saved_at DESC);

            CREATE TABLE IF NOT EXISTS agent_keys (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                scope TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at_ms INTEGER NOT NULL,
                expires_at_ms INTEGER,
                last_used_at_ms INTEGER,
                use_count INTEGER NOT NULL DEFAULT 0,
                revoked_at_ms INTEGER
            );

            CREATE TABLE IF NOT EXISTS action_receipts (
                id TEXT PRIMARY KEY,
                operation_id TEXT UNIQUE,
                timestamp_ms INTEGER NOT NULL,
                actor_kind TEXT NOT NULL,
                actor_label TEXT NOT NULL,
                route TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                status TEXT NOT NULL,
                summary TEXT NOT NULL,
                before_json TEXT,
                after_json TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_receipts_ws ON action_receipts(workspace_id, timestamp_ms DESC);
            ",
        )
        .map_err(|e| format!("SQLite schema init error: {e}"))?;

        conn.execute(
            "INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1')",
            [],
        )
        .map_err(|e| format!("SQLite meta write error: {e}"))?;

        let db = Self { conn };
        db.ensure_default_workspace()?;
        Ok(db)
    }

    fn ensure_default_workspace(&self) -> Result<(), String> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM workspaces", [], |r| r.get(0))
            .map_err(|e| format!("SQLite count workspaces: {e}"))?;
        if count == 0 {
            let ws = default_workspace_value();
            let ws_json = serde_json::to_string(&ws).unwrap();
            let ws_hash = compute_workspace_hash(&ws);
            let snap_hash = compute_snapshot_hash("ws_default", 1, &ws_hash);
            let ts = now_ms();
            let saved_at = iso_utc_from_ms(ts);
            self.conn
                .execute(
                    "INSERT INTO workspaces (workspace_id, name, version, workspace_json, workspace_hash, snapshot_hash, origin, saved_at, updated_at_ms)
                     VALUES (?1, ?2, 1, ?3, ?4, ?5, 'seed', ?6, ?7)",
                    params![
                        "ws_default",
                        "My_X4_Mod",
                        ws_json,
                        ws_hash,
                        snap_hash,
                        saved_at,
                        ts
                    ],
                )
                .map_err(|e| format!("SQLite seed workspace error: {e}"))?;
        }
        Ok(())
    }

    pub fn workspace_count(&self) -> Result<i64, String> {
        self.conn
            .query_row("SELECT COUNT(*) FROM workspaces", [], |r| r.get(0))
            .map_err(|e| format!("SQLite workspace count error: {e}"))
    }

    pub fn receipt_count(&self) -> Result<i64, String> {
        self.conn
            .query_row("SELECT COUNT(*) FROM action_receipts", [], |r| r.get(0))
            .map_err(|e| format!("SQLite receipt count error: {e}"))
    }

    pub fn list_workspaces(&self) -> Result<Vec<WorkspaceRecord>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT workspace_id, name, version, workspace_json, workspace_hash, snapshot_hash, origin, saved_at, updated_at_ms
                 FROM workspaces ORDER BY updated_at_ms ASC, workspace_id ASC",
            )
            .map_err(|e| format!("SQLite prepare list_workspaces: {e}"))?;
        let rows = stmt
            .query_map([], row_to_workspace)
            .map_err(|e| format!("SQLite query list_workspaces: {e}"))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| format!("SQLite row list_workspaces: {e}"))?);
        }
        Ok(out)
    }

    pub fn get_workspace(&self, workspace_id: &str) -> Result<Option<WorkspaceRecord>, String> {
        self.conn
            .query_row(
                "SELECT workspace_id, name, version, workspace_json, workspace_hash, snapshot_hash, origin, saved_at, updated_at_ms
                 FROM workspaces WHERE workspace_id = ?1",
                params![workspace_id],
                row_to_workspace,
            )
            .optional()
            .map_err(|e| format!("SQLite get_workspace: {e}"))
    }

    pub fn create_workspace(
        &mut self,
        requested_id: Option<&str>,
        name: &str,
        workspace_val: Value,
        operation_id: &str,
        actor_kind: &str,
        actor_label: &str,
    ) -> Result<(WorkspaceRecord, ActionReceipt, bool), (u16, &'static str, String)> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| (500, "SQLITE_TX_ERROR", format!("Begin tx failed: {e}")))?;

        // Check operation_id idempotency/conflict
        if let Some(existing_rec) = find_receipt_by_op(&tx, operation_id)
            .map_err(|e| (500, "SQLITE_QUERY_ERROR", e))?
        {
            if existing_rec.0.route == "POST /api/agent/workspaces" {
                if let Some(ws) = get_workspace_tx(&tx, &existing_rec.0.workspace_id)
                    .map_err(|e| (500, "SQLITE_QUERY_ERROR", e))?
                {
                    return Ok((ws, existing_rec.0, true));
                }
            }
            return Err((
                409,
                "ACTION_RECEIPT_DUPLICATE_CONFLICT",
                format!("Operation id '{operation_id}' already used by a different operation."),
            ));
        }

        let ws_id = match requested_id {
            Some(s) if !s.trim().is_empty() => s.trim().to_string(),
            _ => format!(
                "ws_{}",
                random_hex(6).map_err(|e| (500, "RNG_ERROR", e))?
            ),
        };

        if get_workspace_tx(&tx, &ws_id)
            .map_err(|e| (500, "SQLITE_QUERY_ERROR", e))?
            .is_some()
        {
            return Err((
                409,
                "WORKSPACE_ALREADY_EXISTS",
                format!("Workspace '{ws_id}' already exists."),
            ));
        }

        let canon_ws = canonicalize_value(&workspace_val);
        let ws_json = serde_json::to_string(&canon_ws)
            .map_err(|e| (400, "PROJECT_INPUT_INVALID", format!("JSON serialize: {e}")))?;
        let ws_hash = compute_workspace_hash(&canon_ws);
        let snap_hash = compute_snapshot_hash(&ws_id, 1, &ws_hash);
        let ts = now_ms();
        let saved_at = iso_utc_from_ms(ts);

        tx.execute(
            "INSERT INTO workspaces (workspace_id, name, version, workspace_json, workspace_hash, snapshot_hash, origin, saved_at, updated_at_ms)
             VALUES (?1, ?2, 1, ?3, ?4, ?5, 'created', ?6, ?7)",
            params![ws_id, name, ws_json, ws_hash, snap_hash, saved_at, ts],
        )
        .map_err(|e| (500, "SQLITE_INSERT_ERROR", format!("Insert workspace failed: {e}")))?;

        let receipt = insert_receipt_tx(
            &tx,
            Some(operation_id),
            ts,
            actor_kind,
            actor_label,
            "POST /api/agent/workspaces",
            &ws_id,
            "applied",
            &format!("Created workspace '{ws_id}' ({name})"),
            None,
            Some(&ws_json),
        )
        .map_err(|e| (500, "ACTION_RECEIPT_ERROR", e))?;

        let rec = WorkspaceRecord {
            workspace_id: ws_id,
            name: name.to_string(),
            version: 1,
            workspace: canon_ws,
            workspace_hash: ws_hash,
            snapshot_hash: snap_hash,
            origin: "created".to_string(),
            saved_at,
            updated_at_ms: ts,
        };

        tx.commit()
            .map_err(|e| (500, "SQLITE_COMMIT_ERROR", format!("Commit failed: {e}")))?;
        Ok((rec, receipt, false))
    }

    #[allow(clippy::too_many_arguments)]
    pub fn replace_workspace_cas(
        &mut self,
        workspace_id: &str,
        operation_id: &str,
        actor_kind: &str,
        actor_label: &str,
        new_workspace: Value,
        expected_version: Option<i64>,
        expected_head: Option<&str>,
        expected_snapshot_hash: Option<&str>,
        dry_run: bool,
    ) -> Result<CasReplaceOutcome, String> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| format!("Begin tx: {e}"))?;

        if !dry_run {
            if let Some((receipt, _before, after)) = find_receipt_by_op(&tx, operation_id)? {
                let canon_incoming = serde_json::to_string(&canonicalize_value(&new_workspace))
                    .unwrap_or_default();
                let same_target = receipt.route == "POST /api/agent/workspace"
                    && receipt.workspace_id == workspace_id
                    && after.as_deref() == Some(canon_incoming.as_str());
                if same_target {
                    if let Some(rec) = get_workspace_tx(&tx, workspace_id)? {
                        return Ok(CasReplaceOutcome::Replaced {
                            record: rec,
                            receipt,
                            replayed: true,
                        });
                    }
                }
                if let Some(cur) = get_workspace_tx(&tx, workspace_id)? {
                    return Ok(CasReplaceOutcome::Conflict {
                        code: "ACTION_RECEIPT_DUPLICATE_CONFLICT",
                        message: format!(
                            "Operation id '{operation_id}' already committed a different change."
                        ),
                        current_version: cur.version,
                        current_workspace_hash: cur.workspace_hash,
                        current_snapshot_hash: cur.snapshot_hash,
                    });
                }
            }
        }

        let Some(cur) = get_workspace_tx(&tx, workspace_id)? else {
            return Ok(CasReplaceOutcome::NotFound(format!(
                "Workspace '{workspace_id}' not found."
            )));
        };

        if let Some(ev) = expected_version {
            if ev != cur.version {
                return Ok(CasReplaceOutcome::Conflict {
                    code: "WORKSPACE_CONFLICT",
                    message: format!(
                        "Workspace version conflict: expected {ev}, current is {}.",
                        cur.version
                    ),
                    current_version: cur.version,
                    current_workspace_hash: cur.workspace_hash,
                    current_snapshot_hash: cur.snapshot_hash,
                });
            }
        }
        if let Some(eh) = expected_head {
            if eh != cur.workspace_hash {
                return Ok(CasReplaceOutcome::Conflict {
                    code: "WORKSPACE_CONFLICT",
                    message: format!(
                        "Workspace head hash conflict: expected {eh}, current is {}.",
                        cur.workspace_hash
                    ),
                    current_version: cur.version,
                    current_workspace_hash: cur.workspace_hash,
                    current_snapshot_hash: cur.snapshot_hash,
                });
            }
        }
        if let Some(es) = expected_snapshot_hash {
            if es != cur.snapshot_hash {
                return Ok(CasReplaceOutcome::Conflict {
                    code: "WORKSPACE_CONFLICT",
                    message: format!(
                        "Workspace snapshot hash conflict: expected {es}, current is {}.",
                        cur.snapshot_hash
                    ),
                    current_version: cur.version,
                    current_workspace_hash: cur.workspace_hash,
                    current_snapshot_hash: cur.snapshot_hash,
                });
            }
        }

        let canon_new = canonicalize_value(&new_workspace);
        let next_ver = cur.version + 1;
        let new_ws_json = serde_json::to_string(&canon_new).unwrap_or_default();
        let new_ws_hash = compute_workspace_hash(&canon_new);
        let new_snap_hash = compute_snapshot_hash(workspace_id, next_ver, &new_ws_hash);

        if dry_run {
            return Ok(CasReplaceOutcome::DryRun {
                current_version: cur.version,
                next_version: next_ver,
                workspace_hash: new_ws_hash,
                snapshot_hash: new_snap_hash,
            });
        }

        let new_name = canon_new
            .get("name")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(&cur.name)
            .to_string();
        let old_ws_json = serde_json::to_string(&canonicalize_value(&cur.workspace)).unwrap_or_default();
        let ts = now_ms();
        let saved_at = iso_utc_from_ms(ts);

        tx.execute(
            "UPDATE workspaces
             SET name = ?1, version = ?2, workspace_json = ?3, workspace_hash = ?4, snapshot_hash = ?5, origin = 'api', saved_at = ?6, updated_at_ms = ?7
             WHERE workspace_id = ?8",
            params![
                new_name,
                next_ver,
                new_ws_json,
                new_ws_hash,
                new_snap_hash,
                saved_at,
                ts,
                workspace_id
            ],
        )
        .map_err(|e| format!("Update workspace failed: {e}"))?;

        let receipt = insert_receipt_tx(
            &tx,
            Some(operation_id),
            ts,
            actor_kind,
            actor_label,
            "POST /api/agent/workspace",
            workspace_id,
            "applied",
            &format!("Replaced workspace '{workspace_id}' v{} -> v{next_ver}", cur.version),
            Some(&old_ws_json),
            Some(&new_ws_json),
        )?;

        tx.commit().map_err(|e| format!("Commit replace_workspace: {e}"))?;

        Ok(CasReplaceOutcome::Replaced {
            record: WorkspaceRecord {
                workspace_id: workspace_id.to_string(),
                name: new_name,
                version: next_ver,
                workspace: canon_new,
                workspace_hash: new_ws_hash,
                snapshot_hash: new_snap_hash,
                origin: "api".to_string(),
                saved_at,
                updated_at_ms: ts,
            },
            receipt,
            replayed: false,
        })
    }

    pub fn list_snapshots(&self, workspace_id: &str) -> Result<Vec<SnapshotMeta>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, saved_at, sha256, bytes, node_count, link_count
                 FROM workspace_snapshots WHERE workspace_id = ?1
                 ORDER BY saved_at DESC, id DESC LIMIT 100",
            )
            .map_err(|e| format!("Prepare list_snapshots: {e}"))?;
        let rows = stmt
            .query_map(params![workspace_id], |r| {
                Ok(SnapshotMeta {
                    snapshot_name: r.get(0)?,
                    name: r.get(1)?,
                    saved_at: r.get(2)?,
                    sha256: r.get(3)?,
                    bytes: r.get(4)?,
                    node_count: r.get::<_, i64>(5)? as usize,
                    link_count: r.get::<_, i64>(6)? as usize,
                })
            })
            .map_err(|e| format!("Query list_snapshots: {e}"))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("Row list_snapshots: {e}"))?);
        }
        Ok(out)
    }

    pub fn create_snapshot(
        &mut self,
        workspace_id: &str,
        display_name: Option<&str>,
        actor_kind: &str,
        actor_label: &str,
    ) -> Result<SnapshotMeta, (u16, &'static str, String)> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| (500, "SQLITE_TX_ERROR", format!("Begin tx: {e}")))?;

        let cur = get_workspace_tx(&tx, workspace_id)
            .map_err(|e| (500, "SQLITE_QUERY_ERROR", e))?
            .ok_or_else(|| {
                (
                    404,
                    "WORKSPACE_NOT_FOUND",
                    format!("Workspace '{workspace_id}' not found."),
                )
            })?;

        let ts = now_ms();
        let saved_at = iso_utc_from_ms(ts);
        let rand_tag = random_hex(4).map_err(|e| (500, "RNG_ERROR", e))?;
        let snap_id = format!("snapshot_{ts}_{rand_tag}.json");
        let name = display_name
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(&snap_id)
            .to_string();
        let ws_json = serde_json::to_string(&cur.workspace).unwrap_or_default();
        let sha256 = sha256_hex(ws_json.as_bytes());
        let bytes = ws_json.len() as i64;
        let node_count = cur
            .workspace
            .get("nodes")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        let link_count = cur
            .workspace
            .get("links")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);

        tx.execute(
            "INSERT INTO workspace_snapshots (id, workspace_id, name, saved_at, sha256, bytes, node_count, link_count, workspace_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                snap_id,
                workspace_id,
                name,
                saved_at,
                sha256,
                bytes,
                node_count as i64,
                link_count as i64,
                ws_json
            ],
        )
        .map_err(|e| (500, "SNAPSHOT_INSERT_ERROR", format!("Insert snapshot failed: {e}")))?;

        insert_receipt_tx(
            &tx,
            None,
            ts,
            actor_kind,
            actor_label,
            "POST /api/agent/snapshots/create",
            workspace_id,
            "applied",
            &format!("Created snapshot '{snap_id}'"),
            None,
            None,
        )
        .map_err(|e| (500, "ACTION_RECEIPT_ERROR", e))?;

        tx.commit()
            .map_err(|e| (500, "SQLITE_COMMIT_ERROR", format!("Commit snapshot: {e}")))?;

        Ok(SnapshotMeta {
            snapshot_name: snap_id,
            name,
            saved_at,
            sha256,
            bytes,
            node_count,
            link_count,
        })
    }

    pub fn restore_snapshot(
        &mut self,
        workspace_id: &str,
        snapshot_name: &str,
        actor_kind: &str,
        actor_label: &str,
    ) -> Result<(WorkspaceRecord, ActionReceipt), (u16, &'static str, String)> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| (500, "SQLITE_TX_ERROR", format!("Begin tx: {e}")))?;

        let cur = get_workspace_tx(&tx, workspace_id)
            .map_err(|e| (500, "SQLITE_QUERY_ERROR", e))?
            .ok_or_else(|| {
                (
                    404,
                    "WORKSPACE_NOT_FOUND",
                    format!("Workspace '{workspace_id}' not found."),
                )
            })?;

        let snap_json_opt: Option<String> = tx
            .query_row(
                "SELECT workspace_json FROM workspace_snapshots WHERE id = ?1 AND workspace_id = ?2",
                params![snapshot_name, workspace_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| (500, "SQLITE_QUERY_ERROR", format!("Lookup snapshot: {e}")))?;
        let Some(snap_json) = snap_json_opt else {
            return Err((
                404,
                "SNAPSHOT_NOT_FOUND",
                format!("Snapshot '{snapshot_name}' not found."),
            ));
        };

        let restored_val: Value = serde_json::from_str(&snap_json)
            .map_err(|e| (500, "SNAPSHOT_CORRUPT", format!("Invalid snapshot JSON: {e}")))?;
        let canon = canonicalize_value(&restored_val);
        let new_ws_json = serde_json::to_string(&canon).unwrap_or_default();
        let next_ver = cur.version + 1;
        let ws_hash = compute_workspace_hash(&canon);
        let snap_hash = compute_snapshot_hash(workspace_id, next_ver, &ws_hash);
        let new_name = canon
            .get("name")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(&cur.name)
            .to_string();
        let old_ws_json = serde_json::to_string(&canonicalize_value(&cur.workspace)).unwrap_or_default();
        let ts = now_ms();
        let saved_at = iso_utc_from_ms(ts);

        tx.execute(
            "UPDATE workspaces
             SET name = ?1, version = ?2, workspace_json = ?3, workspace_hash = ?4, snapshot_hash = ?5, origin = 'snapshot_restore', saved_at = ?6, updated_at_ms = ?7
             WHERE workspace_id = ?8",
            params![
                new_name,
                next_ver,
                new_ws_json,
                ws_hash,
                snap_hash,
                saved_at,
                ts,
                workspace_id
            ],
        )
        .map_err(|e| (500, "SQLITE_UPDATE_ERROR", format!("Restore update: {e}")))?;

        let receipt = insert_receipt_tx(
            &tx,
            None,
            ts,
            actor_kind,
            actor_label,
            "POST /api/agent/snapshots/restore",
            workspace_id,
            "applied",
            &format!("Restored snapshot '{snapshot_name}'"),
            Some(&old_ws_json),
            Some(&new_ws_json),
        )
        .map_err(|e| (500, "ACTION_RECEIPT_ERROR", e))?;

        tx.commit()
            .map_err(|e| (500, "SQLITE_COMMIT_ERROR", format!("Commit restore: {e}")))?;

        Ok((
            WorkspaceRecord {
                workspace_id: workspace_id.to_string(),
                name: new_name,
                version: next_ver,
                workspace: canon,
                workspace_hash: ws_hash,
                snapshot_hash: snap_hash,
                origin: "snapshot_restore".to_string(),
                saved_at,
                updated_at_ms: ts,
            },
            receipt,
        ))
    }

    pub fn delete_snapshot(
        &mut self,
        workspace_id: &str,
        snapshot_name: &str,
        actor_kind: &str,
        actor_label: &str,
    ) -> Result<(), (u16, &'static str, String)> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| (500, "SQLITE_TX_ERROR", format!("Begin tx: {e}")))?;
        let deleted = tx
            .execute(
                "DELETE FROM workspace_snapshots WHERE id = ?1 AND workspace_id = ?2",
                params![snapshot_name, workspace_id],
            )
            .map_err(|e| (500, "SNAPSHOT_DELETE_ERROR", format!("Delete snapshot: {e}")))?;
        if deleted == 0 {
            return Err((
                404,
                "SNAPSHOT_NOT_FOUND",
                format!("Snapshot '{snapshot_name}' not found."),
            ));
        }
        let ts = now_ms();
        insert_receipt_tx(
            &tx,
            None,
            ts,
            actor_kind,
            actor_label,
            "POST /api/agent/snapshots/delete",
            workspace_id,
            "applied",
            &format!("Deleted snapshot '{snapshot_name}'"),
            None,
            None,
        )
        .map_err(|e| (500, "ACTION_RECEIPT_ERROR", e))?;
        tx.commit()
            .map_err(|e| (500, "SQLITE_COMMIT_ERROR", format!("Commit delete snapshot: {e}")))?;
        Ok(())
    }

    pub fn create_agent_key(
        &mut self,
        label: &str,
        scope: AgentScope,
        ttl_ms: Option<i64>,
        workspace_id: &str,
    ) -> Result<(String, AgentKeyPublic), String> {
        let raw_secret = random_hex(32)?;
        let token = format!("{AGENT_KEY_PREFIX}{raw_secret}");
        let token_hash = sha256_hex(token.as_bytes());
        let id = format!("key_{}", random_hex(6)?);
        let created_at = now_ms();
        let expires_at = ttl_ms.map(|ttl| created_at + ttl);
        let scope_str = scope.as_str();

        self.conn
            .execute(
                "INSERT INTO agent_keys (id, label, scope, workspace_id, token_hash, created_at_ms, expires_at_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    id,
                    label,
                    scope_str,
                    workspace_id,
                    token_hash,
                    created_at,
                    expires_at
                ],
            )
            .map_err(|e| format!("Insert agent key failed: {e}"))?;

        let record = AgentKeyPublic {
            id,
            label: label.to_string(),
            scope: scope_str.to_string(),
            workspace_id: workspace_id.to_string(),
            created_at,
            expires_at,
            last_used_at: None,
            use_count: 0,
            revoked_at: None,
            hash_prefix: token_hash[..8.min(token_hash.len())].to_string(),
            authority_mode: "preset",
        };
        Ok((token, record))
    }

    pub fn list_agent_keys(&mut self) -> Result<Vec<AgentKeyPublic>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, label, scope, workspace_id, token_hash, created_at_ms, expires_at_ms, last_used_at_ms, use_count, revoked_at_ms
                 FROM agent_keys ORDER BY created_at_ms DESC",
            )
            .map_err(|e| format!("Prepare list_agent_keys: {e}"))?;
        let rows = stmt
            .query_map([], |r| {
                let hash: String = r.get(4)?;
                let prefix: String = hash.chars().take(8).collect();
                Ok(AgentKeyPublic {
                    id: r.get(0)?,
                    label: r.get(1)?,
                    scope: r.get(2)?,
                    workspace_id: r.get(3)?,
                    created_at: r.get(5)?,
                    expires_at: r.get(6)?,
                    last_used_at: r.get(7)?,
                    use_count: r.get(8)?,
                    revoked_at: r.get(9)?,
                    hash_prefix: prefix,
                    authority_mode: "preset",
                })
            })
            .map_err(|e| format!("Query list_agent_keys: {e}"))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("Row list_agent_keys: {e}"))?);
        }
        Ok(out)
    }

    pub fn revoke_agent_key(&mut self, id: &str) -> Result<bool, String> {
        let ts = now_ms();
        let changed = self
            .conn
            .execute(
                "UPDATE agent_keys SET revoked_at_ms = ?1 WHERE id = ?2 AND revoked_at_ms IS NULL",
                params![ts, id],
            )
            .map_err(|e| format!("Revoke agent key failed: {e}"))?;
        Ok(changed > 0)
    }

    pub fn verify_agent_key(&mut self, token: &str) -> Result<VerifiedKey, VerifyKeyFailure> {
        let hash = sha256_hex(token.as_bytes());
        let row: Option<(String, String, String, String, Option<i64>, Option<i64>)> = self
            .conn
            .query_row(
                "SELECT id, label, scope, workspace_id, expires_at_ms, revoked_at_ms
                 FROM agent_keys WHERE token_hash = ?1",
                params![hash],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .optional()
            .map_err(|_| VerifyKeyFailure::Unknown)?;
        let Some((id, label, scope_str, workspace_id, expires_at, revoked_at)) = row else {
            return Err(VerifyKeyFailure::Unknown);
        };
        if revoked_at.is_some() {
            return Err(VerifyKeyFailure::Revoked);
        }
        let now = now_ms();
        if expires_at.is_some_and(|exp| now >= exp) {
            return Err(VerifyKeyFailure::Expired);
        }
        let scope = AgentScope::parse(&scope_str).ok_or(VerifyKeyFailure::Unknown)?;
        let _ = self.conn.execute(
            "UPDATE agent_keys SET last_used_at_ms = ?1, use_count = use_count + 1 WHERE id = ?2",
            params![now, id],
        );
        Ok(VerifiedKey {
            id,
            label,
            scope,
            workspace_id,
        })
    }

    pub fn list_receipts(
        &self,
        workspace_id: &str,
        limit: usize,
    ) -> Result<Vec<ActionReceipt>, String> {
        let cap = limit.clamp(1, 200) as i64;
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, operation_id, timestamp_ms, actor_kind, actor_label, route, workspace_id, status, summary
                 FROM action_receipts WHERE workspace_id = ?1
                 ORDER BY timestamp_ms DESC, rowid DESC LIMIT ?2",
            )
            .map_err(|e| format!("Prepare list_receipts: {e}"))?;
        let rows = stmt
            .query_map(params![workspace_id, cap], |r| {
                let ts: i64 = r.get(2)?;
                Ok(ActionReceipt {
                    id: r.get(0)?,
                    operation_id: r.get(1)?,
                    timestamp: ts,
                    saved_at: iso_utc_from_ms(ts),
                    actor_kind: r.get(3)?,
                    actor_label: r.get(4)?,
                    route: r.get(5)?,
                    workspace_id: r.get(6)?,
                    status: r.get(7)?,
                    summary: r.get(8)?,
                })
            })
            .map_err(|e| format!("Query list_receipts: {e}"))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("Row list_receipts: {e}"))?);
        }
        Ok(out)
    }

    pub fn revert_receipt(
        &mut self,
        receipt_id_opt: Option<&str>,
        workspace_id: &str,
        actor_kind: &str,
        actor_label: &str,
    ) -> Result<(String, WorkspaceRecord, ActionReceipt), (u16, &'static str, String)> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| (500, "SQLITE_TX_ERROR", format!("Begin tx: {e}")))?;

        let target: Option<(String, Option<String>)> = match receipt_id_opt {
            Some(rid) => tx
                .query_row(
                    "SELECT id, before_json FROM action_receipts WHERE id = ?1 AND workspace_id = ?2",
                    params![rid, workspace_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(|e| (500, "SQLITE_QUERY_ERROR", format!("Lookup receipt: {e}")))?,
            None => tx
                .query_row(
                    "SELECT id, before_json FROM action_receipts
                     WHERE workspace_id = ?1 AND before_json IS NOT NULL
                       AND route != 'POST /api/agent/history/revert'
                     ORDER BY timestamp_ms DESC, rowid DESC LIMIT 1",
                    params![workspace_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(|e| (500, "SQLITE_QUERY_ERROR", format!("Lookup latest receipt: {e}")))?,
        };

        let Some((reverted_id, before_opt)) = target else {
            return Err((
                404,
                "HISTORY_ENTRY_NOT_FOUND",
                "No matching reversible action history entry found.".to_string(),
            ));
        };
        let Some(before_json) = before_opt else {
            return Err((
                400,
                "HISTORY_NOT_REVERSIBLE",
                format!("Action '{reverted_id}' has no captured before-state."),
            ));
        };

        let cur = get_workspace_tx(&tx, workspace_id)
            .map_err(|e| (500, "SQLITE_QUERY_ERROR", e))?
            .ok_or_else(|| {
                (
                    404,
                    "WORKSPACE_NOT_FOUND",
                    format!("Workspace '{workspace_id}' not found."),
                )
            })?;

        let prev_val: Value = serde_json::from_str(&before_json)
            .map_err(|e| (500, "HISTORY_CORRUPT", format!("Corrupt before_json: {e}")))?;
        let canon = canonicalize_value(&prev_val);
        let new_ws_json = serde_json::to_string(&canon).unwrap_or_default();
        let next_ver = cur.version + 1;
        let ws_hash = compute_workspace_hash(&canon);
        let snap_hash = compute_snapshot_hash(workspace_id, next_ver, &ws_hash);
        let new_name = canon
            .get("name")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(&cur.name)
            .to_string();
        let cur_ws_json = serde_json::to_string(&canonicalize_value(&cur.workspace)).unwrap_or_default();
        let ts = now_ms();
        let saved_at = iso_utc_from_ms(ts);

        tx.execute(
            "UPDATE workspaces
             SET name = ?1, version = ?2, workspace_json = ?3, workspace_hash = ?4, snapshot_hash = ?5, origin = 'history_revert', saved_at = ?6, updated_at_ms = ?7
             WHERE workspace_id = ?8",
            params![
                new_name,
                next_ver,
                new_ws_json,
                ws_hash,
                snap_hash,
                saved_at,
                ts,
                workspace_id
            ],
        )
        .map_err(|e| (500, "SQLITE_UPDATE_ERROR", format!("Revert update failed: {e}")))?;

        let new_receipt = insert_receipt_tx(
            &tx,
            None,
            ts,
            actor_kind,
            actor_label,
            "POST /api/agent/history/revert",
            workspace_id,
            "applied",
            &format!("Reverted action '{reverted_id}'"),
            Some(&cur_ws_json),
            Some(&new_ws_json),
        )
        .map_err(|e| (500, "ACTION_RECEIPT_ERROR", e))?;

        tx.commit()
            .map_err(|e| (500, "SQLITE_COMMIT_ERROR", format!("Commit revert failed: {e}")))?;

        Ok((
            reverted_id,
            WorkspaceRecord {
                workspace_id: workspace_id.to_string(),
                name: new_name,
                version: next_ver,
                workspace: canon,
                workspace_hash: ws_hash,
                snapshot_hash: snap_hash,
                origin: "history_revert".to_string(),
                saved_at,
                updated_at_ms: ts,
            },
            new_receipt,
        ))
    }
}

fn row_to_workspace(r: &rusqlite::Row<'_>) -> rusqlite::Result<WorkspaceRecord> {
    let ws_json: String = r.get(3)?;
    let ws: Value = serde_json::from_str(&ws_json).unwrap_or_else(|_| Value::Object(Map::new()));
    Ok(WorkspaceRecord {
        workspace_id: r.get(0)?,
        name: r.get(1)?,
        version: r.get(2)?,
        workspace: ws,
        workspace_hash: r.get(4)?,
        snapshot_hash: r.get(5)?,
        origin: r.get(6)?,
        saved_at: r.get(7)?,
        updated_at_ms: r.get(8)?,
    })
}

fn get_workspace_tx(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Option<WorkspaceRecord>, String> {
    conn.query_row(
        "SELECT workspace_id, name, version, workspace_json, workspace_hash, snapshot_hash, origin, saved_at, updated_at_ms
         FROM workspaces WHERE workspace_id = ?1",
        params![workspace_id],
        row_to_workspace,
    )
    .optional()
    .map_err(|e| format!("SQLite get_workspace_tx: {e}"))
}

fn find_receipt_by_op(
    conn: &Connection,
    operation_id: &str,
) -> Result<Option<(ActionReceipt, Option<String>, Option<String>)>, String> {
    conn.query_row(
        "SELECT id, operation_id, timestamp_ms, actor_kind, actor_label, route, workspace_id, status, summary, before_json, after_json
         FROM action_receipts WHERE operation_id = ?1",
        params![operation_id],
        |r| {
            let ts: i64 = r.get(2)?;
            Ok((
                ActionReceipt {
                    id: r.get(0)?,
                    operation_id: r.get(1)?,
                    timestamp: ts,
                    saved_at: iso_utc_from_ms(ts),
                    actor_kind: r.get(3)?,
                    actor_label: r.get(4)?,
                    route: r.get(5)?,
                    workspace_id: r.get(6)?,
                    status: r.get(7)?,
                    summary: r.get(8)?,
                },
                r.get(9)?,
                r.get(10)?,
            ))
        },
    )
    .optional()
    .map_err(|e| format!("SQLite find_receipt_by_op: {e}"))
}

#[allow(clippy::too_many_arguments)]
fn insert_receipt_tx(
    conn: &Connection,
    operation_id: Option<&str>,
    timestamp_ms: i64,
    actor_kind: &str,
    actor_label: &str,
    route: &str,
    workspace_id: &str,
    status: &str,
    summary: &str,
    before_json: Option<&str>,
    after_json: Option<&str>,
) -> Result<ActionReceipt, String> {
    let rid = format!("act_{}", random_hex(8)?);
    conn.execute(
        "INSERT INTO action_receipts (id, operation_id, timestamp_ms, actor_kind, actor_label, route, workspace_id, status, summary, before_json, after_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            rid,
            operation_id,
            timestamp_ms,
            actor_kind,
            actor_label,
            route,
            workspace_id,
            status,
            summary,
            before_json,
            after_json
        ],
    )
    .map_err(|e| format!("Insert receipt failed: {e}"))?;

    Ok(ActionReceipt {
        id: rid,
        operation_id: operation_id.map(str::to_string),
        timestamp: timestamp_ms,
        saved_at: iso_utc_from_ms(timestamp_ms),
        actor_kind: actor_kind.to_string(),
        actor_label: actor_label.to_string(),
        route: route.to_string(),
        workspace_id: workspace_id.to_string(),
        status: status.to_string(),
        summary: summary.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wal_crud_cas_snapshots_keys_and_revert_round_trip() {
        let tmp = std::env::temp_dir().join(format!("x4serve_db_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let db_path = tmp.join("forge.db");
        let mut db = ForgeDb::open(&db_path).unwrap();

        let ws0 = db.get_workspace("ws_default").unwrap().unwrap();
        assert_eq!(ws0.version, 1);

        // CAS conflict
        let mut updated = ws0.workspace.clone();
        updated["name"] = json!("UpdatedMod");
        let conf = db
            .replace_workspace_cas(
                "ws_default",
                "op-1",
                "agent",
                "writer",
                updated.clone(),
                Some(99),
                None,
                None,
                false,
            )
            .unwrap();
        assert!(matches!(conf, CasReplaceOutcome::Conflict { .. }));

        // Valid CAS
        let ok = db
            .replace_workspace_cas(
                "ws_default",
                "op-2",
                "agent",
                "writer",
                updated.clone(),
                None,
                Some(&ws0.workspace_hash),
                Some(&ws0.snapshot_hash),
                false,
            )
            .unwrap();
        let ws1 = match ok {
            CasReplaceOutcome::Replaced { record, replayed, .. } => {
                assert!(!replayed);
                assert_eq!(record.version, 2);
                record
            }
            other => panic!("unexpected CAS result: {other:?}"),
        };

        // Replay same operation id -> idempotent
        let replay = db
            .replace_workspace_cas(
                "ws_default",
                "op-2",
                "agent",
                "writer",
                updated,
                None,
                None,
                None,
                false,
            )
            .unwrap();
        assert!(matches!(replay, CasReplaceOutcome::Replaced { replayed: true, .. }));

        // Snapshots
        let snap = db
            .create_snapshot("ws_default", Some("before-revert"), "studio", "Studio")
            .unwrap();
        assert_eq!(db.list_snapshots("ws_default").unwrap().len(), 1);
        db.delete_snapshot("ws_default", &snap.snapshot_name, "studio", "Studio")
            .unwrap();
        assert!(db.list_snapshots("ws_default").unwrap().is_empty());

        // Revert back to original name
        let (_, rev_ws, _) = db
            .revert_receipt(None, "ws_default", "studio", "Studio")
            .unwrap();
        assert_eq!(rev_ws.name, "My_X4_Mod");
        assert!(rev_ws.version > ws1.version);

        // Agent key plaintext never persisted
        let (tok, rec) = db
            .create_agent_key("test-key", AgentScope::Write, Some(60_000), "ws_default")
            .unwrap();
        assert!(tok.starts_with("x4fk_"));
        let raw_db_bytes = fs::read(&db_path).unwrap();
        assert!(!String::from_utf8_lossy(&raw_db_bytes).contains(&tok));
        let verified = db.verify_agent_key(&tok).unwrap();
        assert_eq!(verified.id, rec.id);
        assert!(db.revoke_agent_key(&rec.id).unwrap());
        assert_eq!(db.verify_agent_key(&tok).unwrap_err(), VerifyKeyFailure::Revoked);

        drop(db);
        let _ = fs::remove_dir_all(&tmp);
    }
}
