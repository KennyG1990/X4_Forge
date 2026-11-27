use crate::db::{random_hex, ForgeDb, VerifyKeyFailure};
use crate::ServeOptions;
use axum::http::{HeaderMap, StatusCode};
use serde_json::{json, Value};
use std::fs;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::{Arc, Mutex, OnceLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum AgentScope {
    Read = 1,
    Write = 2,
    Deploy = 3,
}

impl AgentScope {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "read" => Some(Self::Read),
            "write" => Some(Self::Write),
            "deploy" | "all" => Some(Self::Deploy),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Write => "write",
            Self::Deploy => "deploy",
        }
    }
}

#[derive(Debug, Clone)]
pub enum Actor {
    Studio {
        label: String,
    },
    Agent {
        id: String,
        label: String,
        scope: AgentScope,
        workspace_id: String,
    },
}

impl Actor {
    pub fn kind_str(&self) -> &'static str {
        match self {
            Self::Studio { .. } => "studio",
            Self::Agent { .. } => "agent",
        }
    }

    pub fn label(&self) -> &str {
        match self {
            Self::Studio { label } | Self::Agent { label, .. } => label,
        }
    }
}

pub fn validate_bind_host(host: &str) -> Result<IpAddr, String> {
    let trimmed = host.trim();
    if trimmed.eq_ignore_ascii_case("localhost") || trimmed == "127.0.0.1" {
        return Ok(IpAddr::V4(Ipv4Addr::LOCALHOST));
    }
    if trimmed == "::1" || trimmed == "[::1]" {
        return Ok(IpAddr::V6(Ipv6Addr::LOCALHOST));
    }
    Err(format!(
        "Refusing non-loopback bind host '{host}': only 127.0.0.1, localhost, or ::1 is permitted."
    ))
}

pub fn load_or_create_studio_token(opts: &ServeOptions) -> Result<String, String> {
    if let Some(ref t) = opts.studio_token {
        let trimmed = t.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    if let Ok(env_t) = std::env::var("STUDIO_API_TOKEN") {
        let trimmed = env_t.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    fs::create_dir_all(&opts.data_dir)
        .map_err(|e| format!("Failed creating data dir {}: {e}", opts.data_dir.display()))?;
    let tok_path = opts.data_dir.join(".studio-api-token");
    if tok_path.is_file() {
        if let Ok(existing) = fs::read_to_string(&tok_path) {
            let trimmed = existing.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }
    let fresh = random_hex(32)?;
    let tmp_path = opts
        .data_dir
        .join(format!(".studio-api-token.tmp.{}", std::process::id()));
    fs::write(&tmp_path, fresh.as_bytes())
        .map_err(|e| format!("Failed writing token tmp file: {e}"))?;
    fs::rename(&tmp_path, &tok_path)
        .map_err(|e| format!("Failed renaming token file: {e}"))?;
    Ok(fresh)
}

pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let diff = a
        .iter()
        .zip(b.iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y));
    diff == 0
}

pub fn authenticate_request(
    headers: &HeaderMap,
    studio_token: &str,
    db: &Arc<Mutex<ForgeDb>>,
) -> Result<Actor, (StatusCode, Value)> {
    let raw = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let Some(tok) = raw.strip_prefix("Bearer ") else {
        return Err((
            StatusCode::UNAUTHORIZED,
            json!({ "error": "Unauthorized: Missing token." }),
        ));
    };

    if constant_time_eq(tok.as_bytes(), studio_token.as_bytes()) {
        return Ok(Actor::Studio {
            label: "Studio UI".to_string(),
        });
    }

    if tok.starts_with("x4fk_") {
        let verify_res = {
            let mut guard = db.lock().map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    json!({ "error": "Database lock poisoned." }),
                )
            })?;
            guard.verify_agent_key(tok)
        };
        return match verify_res {
            Ok(vk) => Ok(Actor::Agent {
                id: vk.id,
                label: vk.label,
                scope: vk.scope,
                workspace_id: vk.workspace_id,
            }),
            Err(VerifyKeyFailure::Expired) => Err((
                StatusCode::UNAUTHORIZED,
                json!({ "code": "AGENT_KEY_EXPIRED", "error": "Agent key has expired." }),
            )),
            Err(VerifyKeyFailure::Revoked) => Err((
                StatusCode::UNAUTHORIZED,
                json!({ "code": "AGENT_KEY_REVOKED", "error": "Agent key has been revoked." }),
            )),
            Err(VerifyKeyFailure::Unknown) => Err((
                StatusCode::UNAUTHORIZED,
                json!({ "code": "AGENT_KEY_INVALID", "error": "Invalid agent key." }),
            )),
        };
    }

    Err((
        StatusCode::UNAUTHORIZED,
        json!({ "error": "Unauthorized: Invalid token." }),
    ))
}

pub fn require_studio(actor: &Actor) -> Result<(), (StatusCode, Value)> {
    match actor {
        Actor::Studio { .. } => Ok(()),
        Actor::Agent { scope, .. } => Err((
            StatusCode::FORBIDDEN,
            json!({
                "code": "AGENT_STUDIO_ONLY",
                "authorityCode": "AGENT_SCOPE_DENIED",
                "error": "This administration route requires the Studio session token; agent keys are forbidden.",
                "scope": scope.as_str(),
            }),
        )),
    }
}

pub fn require_scope(actor: &Actor, required: AgentScope) -> Result<(), (StatusCode, Value)> {
    match actor {
        Actor::Studio { .. } => Ok(()),
        Actor::Agent { scope, .. } => {
            if *scope >= required {
                Ok(())
            } else {
                Err((
                    StatusCode::FORBIDDEN,
                    json!({
                        "code": "insufficient_scope",
                        "authorityCode": "AGENT_SCOPE_DENIED",
                        "error": format!(
                            "Agent key scope '{}' cannot invoke a '{}' route.",
                            scope.as_str(),
                            required.as_str()
                        ),
                        "scope": scope.as_str(),
                        "requiredScopes": [required.as_str()],
                    }),
                ))
            }
        }
    }
}

pub fn resolve_workspace_id(
    actor: &Actor,
    requested: Option<&str>,
    default_ws: &str,
) -> Result<String, (StatusCode, Value)> {
    let req_trimmed = requested.map(str::trim).filter(|s| !s.is_empty());
    match actor {
        Actor::Studio { .. } => Ok(req_trimmed.unwrap_or(default_ws).to_string()),
        Actor::Agent { workspace_id, .. } => {
            if let Some(req_ws) = req_trimmed {
                if req_ws != workspace_id {
                    return Err((
                        StatusCode::FORBIDDEN,
                        json!({
                            "code": "WORKSPACE_BINDING_MISMATCH",
                            "error": format!(
                                "This agent key is bound to workspace '{workspace_id}' and cannot access '{req_ws}'."
                            ),
                            "workspaceId": workspace_id,
                        }),
                    ));
                }
            }
            Ok(workspace_id.clone())
        }
    }
}

pub fn validate_operation_id(headers: &HeaderMap) -> Result<String, (StatusCode, Value)> {
    static OP_RE: OnceLock<regex_placeholder::OpValidator> = OnceLock::new();
    let _ = &OP_RE;
    let raw = headers
        .get("x-forge-operation-id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .trim();
    if is_valid_operation_id(raw) {
        Ok(raw.to_string())
    } else {
        Err((
            StatusCode::BAD_REQUEST,
            json!({
                "code": "ACTION_RECEIPT_OPERATION_ID_INVALID",
                "error": "A caller-owned x-forge-operation-id header is required."
            }),
        ))
    }
}

mod regex_placeholder {
    pub struct OpValidator;
}

fn is_valid_operation_id(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.is_empty() || bytes.len() > 128 {
        return false;
    }
    if !bytes[0].is_ascii_alphabetic() {
        return false;
    }
    bytes[1..]
        .iter()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enforces_strict_loopback_bind_host() {
        assert!(validate_bind_host("127.0.0.1").is_ok());
        assert!(validate_bind_host("localhost").is_ok());
        assert!(validate_bind_host("::1").is_ok());
        assert!(validate_bind_host("[::1]").is_ok());

        for bad in ["0.0.0.0", "::", "192.168.1.5", "evil.example.com"] {
            let err = validate_bind_host(bad).unwrap_err();
            assert!(
                err.contains("Refusing non-loopback bind host"),
                "unexpected error for {bad}: {err}"
            );
        }
    }
}
