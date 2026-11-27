use crate::auth::AgentScope;
use crate::db::sha256_hex;
use serde_json::{json, Value};

struct CapabilityDef {
    id: &'static str,
    version: u64,
    title: &'static str,
    description: &'static str,
    min_scope: AgentScope,
    effects: &'static [&'static str],
    method: &'static str,
    path: &'static str,
    input_location: &'static str,
    mcp_id: &'static str,
    input_schema: fn() -> Value,
}

fn schema_obj(props: Value, required: &[&str]) -> Value {
    json!({
        "type": "object",
        "properties": props,
        "required": required,
        "additionalProperties": false
    })
}

fn capabilities_table() -> &'static [CapabilityDef] {
    static DEFS: &[CapabilityDef] = &[
        CapabilityDef {
            id: "workspace.list",
            version: 1,
            title: "List Workspaces",
            description: "List workspaces visible to the caller.",
            min_scope: AgentScope::Read,
            effects: &["read"],
            method: "GET",
            path: "/api/agent/workspaces",
            input_location: "none",
            mcp_id: "list_workspaces",
            input_schema: || schema_obj(json!({}), &[]),
        },
        CapabilityDef {
            id: "workspace.read",
            version: 2,
            title: "Get Workspace",
            description: "Read the bound workspace snapshot, version, and CAS hashes.",
            min_scope: AgentScope::Read,
            effects: &["read"],
            method: "GET",
            path: "/api/agent/workspace",
            input_location: "none",
            mcp_id: "get_workspace",
            input_schema: || schema_obj(json!({}), &[]),
        },
        CapabilityDef {
            id: "workspace.write",
            version: 1,
            title: "Replace Workspace",
            description: "Replace the bound workspace with optimistic concurrency and action receipt.",
            min_scope: AgentScope::Write,
            effects: &["workspace-write", "audit-write"],
            method: "POST",
            path: "/api/agent/workspace",
            input_location: "body",
            mcp_id: "replace_workspace",
            input_schema: || {
                schema_obj(
                    json!({
                        "workspace": { "type": "object" },
                        "expectedVersion": { "type": "integer" },
                        "expectedHead": { "type": "string" },
                        "expectedSnapshotHash": { "type": "string" },
                        "dryRun": { "type": "boolean" }
                    }),
                    &["workspace"],
                )
            },
        },
        CapabilityDef {
            id: "snapshots.list",
            version: 1,
            title: "List Workspace Snapshots",
            description: "List saved workspace snapshots.",
            min_scope: AgentScope::Read,
            effects: &["read"],
            method: "GET",
            path: "/api/agent/snapshots/list",
            input_location: "query",
            mcp_id: "list_workspace_snapshots",
            input_schema: || schema_obj(json!({ "modId": { "type": "string" } }), &[]),
        },
        CapabilityDef {
            id: "snapshots.create",
            version: 1,
            title: "Create Workspace Snapshot",
            description: "Create a point-in-time SQLite snapshot of the current workspace.",
            min_scope: AgentScope::Write,
            effects: &["workspace-write", "audit-write"],
            method: "POST",
            path: "/api/agent/snapshots/create",
            input_location: "body",
            mcp_id: "create_workspace_snapshot",
            input_schema: || {
                schema_obj(
                    json!({ "name": { "type": "string" }, "modId": { "type": "string" } }),
                    &[],
                )
            },
        },
        CapabilityDef {
            id: "snapshots.restore",
            version: 1,
            title: "Restore Workspace Snapshot",
            description: "Restore a named snapshot into the workspace.",
            min_scope: AgentScope::Write,
            effects: &["workspace-write", "audit-write"],
            method: "POST",
            path: "/api/agent/snapshots/restore",
            input_location: "body",
            mcp_id: "restore_workspace_snapshot",
            input_schema: || {
                schema_obj(
                    json!({ "snapshotName": { "type": "string" }, "modId": { "type": "string" } }),
                    &["snapshotName"],
                )
            },
        },
        CapabilityDef {
            id: "snapshots.delete",
            version: 1,
            title: "Delete Workspace Snapshot",
            description: "Delete a named workspace snapshot.",
            min_scope: AgentScope::Write,
            effects: &["workspace-write", "delete", "audit-write"],
            method: "POST",
            path: "/api/agent/snapshots/delete",
            input_location: "body",
            mcp_id: "delete_workspace_snapshot",
            input_schema: || {
                schema_obj(
                    json!({ "snapshotName": { "type": "string" }, "modId": { "type": "string" } }),
                    &["snapshotName"],
                )
            },
        },
        CapabilityDef {
            id: "history.list",
            version: 1,
            title: "List Action History",
            description: "List durable action receipts for the workspace.",
            min_scope: AgentScope::Read,
            effects: &["read"],
            method: "GET",
            path: "/api/agent/history",
            input_location: "query",
            mcp_id: "list_action_history",
            input_schema: || schema_obj(json!({ "limit": { "type": "integer" } }), &[]),
        },
        CapabilityDef {
            id: "history.revert",
            version: 1,
            title: "Revert Action History",
            description: "Restore workspace state from a recorded action receipt before-image.",
            min_scope: AgentScope::Write,
            effects: &["workspace-write", "audit-write"],
            method: "POST",
            path: "/api/agent/history/revert",
            input_location: "body",
            mcp_id: "revert_action_history",
            input_schema: || schema_obj(json!({ "id": { "type": "string" } }), &[]),
        },
        CapabilityDef {
            id: "project.validate",
            version: 1,
            title: "Validate X4 Mod",
            description: "Validate an on-disk mod directory or inline XML/Lua files using x4-validate.",
            min_scope: AgentScope::Read,
            effects: &["analyze"],
            method: "POST",
            path: "/api/agent/validate",
            input_location: "body",
            mcp_id: "validate_mod",
            input_schema: || {
                schema_obj(
                    json!({
                        "modDir": { "type": "string" },
                        "relPath": { "type": "string" },
                        "text": { "type": "string" }
                    }),
                    &[],
                )
            },
        },
        CapabilityDef {
            id: "reference.status",
            version: 1,
            title: "Reference Corpus Status",
            description: "Inspect loaded X4 reference corpus & XSD summary.",
            min_scope: AgentScope::Read,
            effects: &["read"],
            method: "GET",
            path: "/api/reference/status",
            input_location: "none",
            mcp_id: "get_reference_status",
            input_schema: || schema_obj(json!({}), &[]),
        },
        CapabilityDef {
            id: "reference.search",
            version: 1,
            title: "Search Reference Symbols",
            description: "Search loaded factions, wares, macros, sectors, AI scripts, orders, and MD providers.",
            min_scope: AgentScope::Read,
            effects: &["read"],
            method: "GET",
            path: "/api/agent/reference/search",
            input_location: "query",
            mcp_id: "search_reference_symbols",
            input_schema: || {
                schema_obj(
                    json!({
                        "q": { "type": "string" },
                        "kind": { "type": "string" },
                        "limit": { "type": "integer" }
                    }),
                    &["q"],
                )
            },
        },
        CapabilityDef {
            id: "reference.scan",
            version: 1,
            title: "Rescan Reference Corpus",
            description: "Scan unpacked X4 reference files and refresh in-memory corpus/XSD index.",
            min_scope: AgentScope::Write,
            effects: &["analyze"],
            method: "POST",
            path: "/api/agent/reference/scan",
            input_location: "body",
            mcp_id: "scan_reference_corpus",
            input_schema: || {
                schema_obj(
                    json!({ "unpackedRoot": { "type": "string" }, "cachePath": { "type": "string" } }),
                    &[],
                )
            },
        },
        CapabilityDef {
            id: "lsp.inspect",
            version: 1,
            title: "Inspect X4 Document",
            description: "Compute symbols, CodeLenses, and live diagnostics for an X4 XML or Lua document.",
            min_scope: AgentScope::Read,
            effects: &["analyze"],
            method: "POST",
            path: "/api/agent/inspect",
            input_location: "body",
            mcp_id: "inspect_document",
            input_schema: || {
                schema_obj(
                    json!({ "relPath": { "type": "string" }, "text": { "type": "string" } }),
                    &["text"],
                )
            },
        },
        CapabilityDef {
            id: "tree.hash",
            version: 1,
            title: "Hash Physical Tree",
            description: "Compute multi-core SHA-256 tree hash and UTF-8 checks on a directory.",
            min_scope: AgentScope::Read,
            effects: &["read"],
            method: "POST",
            path: "/api/agent/tree-hash",
            input_location: "body",
            mcp_id: "hash_tree",
            input_schema: || {
                schema_obj(
                    json!({ "root": { "type": "string" }, "checkUtf8": { "type": "boolean" } }),
                    &["root"],
                )
            },
        },
        CapabilityDef {
            id: "catdat.list",
            version: 1,
            title: "List Catalog Entries",
            description: "List entries in an X4 .cat manifest.",
            min_scope: AgentScope::Read,
            effects: &["read"],
            method: "POST",
            path: "/api/agent/cat/list",
            input_location: "body",
            mcp_id: "list_cat_entries",
            input_schema: || {
                schema_obj(
                    json!({ "catPath": { "type": "string" }, "filter": { "type": "string" }, "limit": { "type": "integer" } }),
                    &["catPath"],
                )
            },
        },
        CapabilityDef {
            id: "catdat.extract",
            version: 1,
            title: "Extract Catalog Entry",
            description: "Extract a single safe entry from an X4 .cat/.dat catalog pair.",
            min_scope: AgentScope::Read,
            effects: &["read"],
            method: "POST",
            path: "/api/agent/cat/extract",
            input_location: "body",
            mcp_id: "extract_cat_entry",
            input_schema: || {
                schema_obj(
                    json!({ "catPath": { "type": "string" }, "datPath": { "type": "string" }, "entryName": { "type": "string" } }),
                    &["catPath", "datPath", "entryName"],
                )
            },
        },
    ];
    DEFS
}

fn scopes_allowed_for(min_scope: AgentScope) -> &'static [&'static str] {
    match min_scope {
        AgentScope::Read => &["read", "write", "deploy"],
        AgentScope::Write => &["write", "deploy"],
        AgentScope::Deploy => &["deploy"],
    }
}

pub fn build_capability_contract(filter_scope: Option<AgentScope>) -> Value {
    let caps: Vec<Value> = capabilities_table()
        .iter()
        .filter(|d| filter_scope.is_none_or(|actor_sc| actor_sc >= d.min_scope))
        .map(|d| {
            json!({
                "id": d.id,
                "version": d.version,
                "title": d.title,
                "description": d.description,
                "inputSchema": (d.input_schema)(),
                "access": {
                    "public": false,
                    "studioSession": true,
                    "agentScopes": scopes_allowed_for(d.min_scope),
                },
                "effects": d.effects,
                "apiBindings": [{
                    "method": d.method,
                    "path": d.path,
                    "inputLocation": d.input_location,
                    "role": "primary"
                }],
                "surfaces": {
                    "mcp": [{
                        "id": d.mcp_id,
                        "status": "connected"
                    }]
                }
            })
        })
        .collect();

    let canonical_json = serde_json::to_string(&caps).unwrap_or_default();
    let contract_hash = sha256_hex(canonical_json.as_bytes());
    json!({
        "schemaVersion": "forge.capability.v1",
        "contractHash": contract_hash,
        "capabilities": caps,
    })
}
