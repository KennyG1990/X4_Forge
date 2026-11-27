use crate::discovery::{discover_endpoint, ResolvedEndpoint};
use crate::http_loopback::{loopback_request, validate_loopback_url};
use crate::native_tools::{
    build_query_string, call_native_tool, is_native_tool, list_native_tools, pct_encode,
    NativeState,
};
use crate::{McpMode, McpOptions};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashMap};
use std::io::{self, BufRead, BufReader, BufWriter, Write};
use std::time::Duration;

const PROTOCOL_VERSION: &str = "2024-11-05";
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone)]
struct RemoteToolBinding {
    tool_descriptor: Value,
    method: String,
    path: String,
    input_location: String,
    fixed_body: Option<Map<String, Value>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapSurfaceEntry {
    id: String,
    status: String,
    #[serde(default)]
    note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapSurfaces {
    #[serde(default)]
    mcp: Vec<CapSurfaceEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapApiBinding {
    method: String,
    path: String,
    #[serde(default = "default_input_location")]
    input_location: String,
    #[serde(default = "default_role")]
    role: String,
    #[serde(default)]
    fixed_body: Option<Map<String, Value>>,
}

fn default_input_location() -> String {
    "body".to_string()
}

fn default_role() -> String {
    "primary".to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapDescriptor {
    id: String,
    #[serde(default = "default_version")]
    version: u64,
    #[serde(default)]
    description: String,
    #[serde(default)]
    input_schema: Option<Value>,
    #[serde(default)]
    api: Vec<CapApiBinding>,
    #[serde(default)]
    api_bindings: Vec<CapApiBinding>,
    #[serde(default)]
    surfaces: Option<CapSurfaces>,
}

fn default_version() -> u64 {
    1
}

struct McpState {
    opts: McpOptions,
    native: NativeState,
    endpoint: Option<ResolvedEndpoint>,
    remote_tools: HashMap<String, RemoteToolBinding>,
    remote_order: Vec<String>,
}

impl McpState {
    fn new(opts: McpOptions) -> Self {
        let native = NativeState::new(opts.unpacked_root.clone(), opts.corpus_cache.clone());
        Self {
            opts,
            native,
            endpoint: None,
            remote_tools: HashMap::new(),
            remote_order: Vec::new(),
        }
    }

    fn auth_headers(ep: &ResolvedEndpoint) -> Vec<(String, String)> {
        let mut h = vec![("x-forge-channel".to_string(), "mcp".to_string())];
        if let Some(ref k) = ep.api_key {
            if !k.is_empty() {
                h.push(("Authorization".to_string(), format!("Bearer {k}")));
            }
        }
        if let Some(ref w) = ep.workspace_id {
            if !w.is_empty() {
                h.push(("x-workspace-id".to_string(), w.clone()));
            }
        }
        h
    }

    fn refresh_remote_tools(&mut self) -> Result<(), String> {
        if self.opts.mode == McpMode::Standalone {
            return Ok(());
        }

        let ep_opt = discover_endpoint(&self.opts)?;
        let Some(ep) = ep_opt else {
            if self.opts.mode == McpMode::Proxy {
                return Err(
                    "Proxy mode requires a running local Forge sidecar or explicit --url"
                        .to_string(),
                );
            }
            return Ok(());
        };

        let headers = Self::auth_headers(&ep);
        let candidates = [
            "/api/agent/capabilities",
            "/api/agent/capabilities/effective",
            "/api/agent/schema",
        ];

        let mut last_err: Option<String> = None;
        let mut parsed_contract: Option<(Option<String>, Vec<CapDescriptor>)> = None;

        for route in candidates {
            let full = format!("{}{}", ep.base_url, route);
            match loopback_request("GET", &full, &headers, None, HTTP_TIMEOUT) {
                Ok(resp) if resp.status == 404 => {
                    last_err = Some(format!("HTTP 404 on {route}"));
                    continue;
                }
                Ok(resp) if (200..300).contains(&resp.status) => {
                    let val: Value = serde_json::from_slice(&resp.body)
                        .map_err(|e| format!("Invalid Forge JSON on {route}: {e}"))?;
                    let contract_obj = val.get("capability_contract").unwrap_or(&val);
                    let contract_hash = contract_obj
                        .get("contractHash")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    let caps_val = contract_obj
                        .get("capabilities")
                        .cloned()
                        .unwrap_or_else(|| json!([]));
                    let caps: Vec<CapDescriptor> = serde_json::from_value(caps_val)
                        .map_err(|e| format!("Invalid capability descriptor list: {e}"))?;
                    parsed_contract = Some((contract_hash, caps));
                    break;
                }
                Ok(resp) => {
                    let msg = String::from_utf8_lossy(&resp.body);
                    return Err(format!(
                        "Forge capability discovery {route} returned HTTP {}: {}",
                        resp.status,
                        msg.trim()
                    ));
                }
                Err(e) => {
                    return Err(e);
                }
            }
        }

        let Some((contract_hash, caps)) = parsed_contract else {
            let msg = last_err.unwrap_or_else(|| "no capability endpoint responded".to_string());
            if self.opts.mode == McpMode::Proxy {
                return Err(msg);
            }
            return Ok(());
        };

        self.endpoint = Some(ep);
        self.remote_tools.clear();
        self.remote_order.clear();

        for cap in caps {
            let bindings = if !cap.api.is_empty() {
                &cap.api
            } else {
                &cap.api_bindings
            };
            let primary_api = bindings
                .iter()
                .find(|b| b.role == "primary")
                .or_else(|| bindings.first());
            let Some(api) = primary_api else {
                continue;
            };
            let Some(ref surfaces) = cap.surfaces else {
                continue;
            };
            for surf in &surfaces.mcp {
                if !matches!(surf.status.as_str(), "connected" | "partial") {
                    continue;
                }
                let desc = match surf.note.as_deref() {
                    Some(note) if surf.status == "partial" && !note.is_empty() => {
                        format!("{} Projection limit: {note}", cap.description)
                    }
                    _ => cap.description.clone(),
                };
                let input_schema = cap
                    .input_schema
                    .clone()
                    .unwrap_or_else(|| json!({ "type": "object", "properties": {} }));
                let mut meta = Map::new();
                meta.insert("x4forge/capabilityId".to_string(), json!(cap.id));
                meta.insert("x4forge/capabilityVersion".to_string(), json!(cap.version));
                if let Some(ref ch) = contract_hash {
                    meta.insert("x4forge/contractHash".to_string(), json!(ch));
                }
                let descriptor = json!({
                    "name": surf.id,
                    "description": desc,
                    "inputSchema": input_schema,
                    "_meta": Value::Object(meta),
                });
                let tool_name = surf.id.clone();
                if !self.remote_tools.contains_key(&tool_name) {
                    self.remote_order.push(tool_name.clone());
                }
                self.remote_tools.insert(
                    tool_name,
                    RemoteToolBinding {
                        tool_descriptor: descriptor,
                        method: api.method.to_ascii_uppercase(),
                        path: api.path.clone(),
                        input_location: api.input_location.to_ascii_lowercase(),
                        fixed_body: api.fixed_body.clone(),
                    },
                );
            }
        }

        Ok(())
    }

    fn call_remote_tool(&self, name: &str, args: &Value) -> Result<Value, String> {
        let binding = self
            .remote_tools
            .get(name)
            .ok_or_else(|| format!("Remote binding disappeared for {name}"))?;
        let ep = self
            .endpoint
            .as_ref()
            .ok_or_else(|| "Forge endpoint is not initialized".to_string())?;

        let mut remaining: BTreeMap<String, Value> = match args.as_object() {
            Some(obj) => obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
            None => BTreeMap::new(),
        };

        // Substitute :param path segments
        let mut resolved_segments = Vec::new();
        for seg in binding.path.split('/') {
            if let Some(param_name) = seg.strip_prefix(':') {
                let raw_val = remaining
                    .remove(param_name)
                    .ok_or_else(|| format!("Missing required path parameter '{param_name}'"))?;
                let s = match raw_val {
                    Value::String(st) => st,
                    other => other.to_string(),
                };
                resolved_segments.push(pct_encode(&s));
            } else {
                resolved_segments.push(seg.to_string());
            }
        }
        let mut resolved_path = resolved_segments.join("/");
        if !resolved_path.starts_with('/') {
            resolved_path.insert(0, '/');
        }

        let headers = Self::auth_headers(ep);
        let is_get_or_query = binding.method == "GET"
            || matches!(
                binding.input_location.as_str(),
                "query" | "path-and-query"
            );

        let (full_url, body_bytes) = if binding.method == "GET" || is_get_or_query {
            let qs = build_query_string(&remaining);
            let url = if qs.is_empty() {
                format!("{}{}", ep.base_url, resolved_path)
            } else {
                format!("{}{resolved_path}?{qs}", ep.base_url)
            };
            (url, None)
        } else {
            let mut body_map = Map::new();
            for (k, v) in remaining {
                body_map.insert(k, v);
            }
            if let Some(ref fixed) = binding.fixed_body {
                for (fk, fv) in fixed {
                    body_map.insert(fk.clone(), fv.clone());
                }
            }
            let raw = serde_json::to_vec(&Value::Object(body_map))
                .map_err(|e| format!("Failed serializing body: {e}"))?;
            (format!("{}{}", ep.base_url, resolved_path), Some(raw))
        };

        let resp = loopback_request(
            &binding.method,
            &full_url,
            &headers,
            body_bytes.as_deref(),
            HTTP_TIMEOUT,
        )?;
        let text = String::from_utf8_lossy(&resp.body).into_owned();
        if (200..300).contains(&resp.status) {
            if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                Ok(parsed)
            } else {
                Ok(Value::String(text))
            }
        } else {
            Err(format!("Forge API {} HTTP {}: {}", resolved_path, resp.status, text))
        }
    }
}

pub fn run_stdio_loop(opts: McpOptions) -> Result<i32, String> {
    // Fail fast if explicit --url or X4FORGE_URL violates strict loopback SSRF guard.
    let explicit_env = std::env::var("X4FORGE_URL").ok().filter(|s| {
        let t = s.trim();
        !t.is_empty() && !t.eq_ignore_ascii_case("auto")
    });
    if let Some(ref raw_url) = opts.url.clone().or(explicit_env) {
        if !raw_url.trim().is_empty() && !raw_url.trim().eq_ignore_ascii_case("auto") {
            validate_loopback_url(raw_url)?;
        }
    }

    let mut state = McpState::new(opts);
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = BufReader::new(stdin.lock());
    let mut writer = BufWriter::new(stdout.lock());

    loop {
        let mut line = String::new();
        let n = reader
            .read_line(&mut line)
            .map_err(|e| format!("MCP stdin read error: {e}"))?;
        if n == 0 {
            break;
        }
        let trimmed = line.trim_end_matches(['\r', '\n']).trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(reply_val) = process_json_line(&mut state, trimmed) {
            let encoded = serde_json::to_string(&reply_val)
                .map_err(|e| format!("MCP stdout JSON error: {e}"))?;
            writer
                .write_all(encoded.as_bytes())
                .and_then(|_| writer.write_all(b"\n"))
                .and_then(|_| writer.flush())
                .map_err(|e| format!("MCP stdout write error: {e}"))?;
        }
    }
    Ok(0)
}

fn rpc_ok(id: Value, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    })
}

fn rpc_err(id: Value, code: i32, message: impl Into<String>) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message.into(),
        },
    })
}

fn process_json_line(state: &mut McpState, line: &str) -> Option<Value> {
    let msg: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return Some(rpc_err(Value::Null, -32700, "Parse error")),
    };

    let Some(obj) = msg.as_object() else {
        return Some(rpc_err(Value::Null, -32600, "Invalid Request"));
    };

    let id_opt = obj.get("id").cloned();
    let method = match obj.get("method").and_then(|v| v.as_str()) {
        Some(m) if !m.is_empty() => m,
        _ => {
            return id_opt.map(|id| rpc_err(id, -32600, "Invalid Request: missing method"));
        }
    };

    let Some(id) = id_opt else {
        // Notifications never produce a response.
        return None;
    };

    let params = obj.get("params").cloned();
    Some(handle_request(state, id, method, params))
}

fn handle_request(
    state: &mut McpState,
    id: Value,
    method: &str,
    params: Option<Value>,
) -> Value {
    match method {
        "initialize" => rpc_ok(
            id,
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {
                    "tools": {
                        "listChanged": false
                    }
                },
                "serverInfo": {
                    "name": "x4forge-mcp",
                    "version": "0.1.0"
                }
            }),
        ),
        "ping" => rpc_ok(id, json!({})),
        "tools/list" => {
            if let Some(ref p) = params {
                let Some(pobj) = p.as_object() else {
                    return rpc_err(
                        id,
                        -32602,
                        "Invalid tools/list params: expected an optional object",
                    );
                };
                if pobj.keys().any(|k| k != "cursor") {
                    return rpc_err(
                        id,
                        -32602,
                        "Invalid tools/list params: unsupported parameter key",
                    );
                }
                if let Some(cursor_val) = pobj.get("cursor") {
                    if !cursor_val.is_null() {
                        return rpc_err(
                            id,
                            -32602,
                            "Invalid params: cursor pagination is not supported",
                        );
                    }
                }
            }

            if let Err(err) = state.refresh_remote_tools() {
                if state.opts.mode == McpMode::Proxy || err.contains("Refusing non-loopback") {
                    return rpc_err(id, -32603, err);
                }
                eprintln!("x4forge mcp: remote discovery skipped ({err})");
            }

            let mut tools = Vec::new();
            for t in list_native_tools() {
                let name = t.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if state.opts.mode == McpMode::Proxy && state.remote_tools.contains_key(name) {
                    continue;
                }
                tools.push(t);
            }
            for rname in &state.remote_order {
                if let Some(binding) = state.remote_tools.get(rname) {
                    tools.push(binding.tool_descriptor.clone());
                }
            }
            rpc_ok(id, json!({ "tools": tools }))
        }
        "tools/call" => {
            let Some(p) = params.as_ref().and_then(|v| v.as_object()) else {
                return rpc_err(
                    id,
                    -32602,
                    "Invalid tools/call params: expected object with 'name'",
                );
            };
            if p.keys().any(|k| k != "name" && k != "arguments") {
                return rpc_err(
                    id,
                    -32602,
                    "Invalid tools/call params: unexpected field",
                );
            }
            let Some(tool_name) = p.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty())
            else {
                return rpc_err(id, -32602, "Invalid tools/call params: missing tool 'name'");
            };
            let args = match p.get("arguments") {
                None => Value::Object(Map::new()),
                Some(v) if v.is_object() => v.clone(),
                Some(_) => {
                    return rpc_err(
                        id,
                        -32602,
                        "Invalid tools/call params: 'arguments' must be a JSON object",
                    );
                }
            };

            if is_native_tool(tool_name) {
                return match call_native_tool(&mut state.native, tool_name, &args) {
                    Ok(res) => {
                        let text = serde_json::to_string_pretty(&res).unwrap_or_default();
                        rpc_ok(
                            id,
                            json!({
                                "content": [{ "type": "text", "text": text }],
                                "isError": false
                            }),
                        )
                    }
                    Err((-32602, msg)) => rpc_err(id, -32602, msg),
                    Err((_, msg)) => rpc_ok(
                        id,
                        json!({
                            "content": [{ "type": "text", "text": msg }],
                            "isError": true
                        }),
                    ),
                };
            }

            if state.opts.mode != McpMode::Standalone && !state.remote_tools.contains_key(tool_name)
            {
                if let Err(err) = state.refresh_remote_tools() {
                    if state.opts.mode == McpMode::Proxy {
                        return rpc_err(id, -32603, err);
                    }
                }
            }

            if state.remote_tools.contains_key(tool_name) {
                return match state.call_remote_tool(tool_name, &args) {
                    Ok(res) => {
                        let text = match res {
                            Value::String(s) => s,
                            other => serde_json::to_string_pretty(&other).unwrap_or_default(),
                        };
                        rpc_ok(
                            id,
                            json!({
                                "content": [{ "type": "text", "text": text }],
                                "isError": false
                            }),
                        )
                    }
                    Err(msg) => rpc_ok(
                        id,
                        json!({
                            "content": [{ "type": "text", "text": msg }],
                            "isError": true
                        }),
                    ),
                };
            }

            rpc_err(id, -32602, format!("Unknown tool: {tool_name}"))
        }
        other => rpc_err(id, -32601, format!("Method not found: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Read;
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn handles_protocol_errors_and_native_tools() {
        let tmp = std::env::temp_dir().join(format!("x4mcp_unit_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("md")).unwrap();
        fs::write(
            tmp.join("content.xml"),
            "<content id=\"mcp_unit\" name=\"MCP Unit\" version=\"100\"/>",
        )
        .unwrap();
        fs::write(
            tmp.join("md/test.xml"),
            "<mdscript name=\"Test\"><cues><cue name=\"Start\"><actions><debug_text text=\"'ok'\"/></actions></cue></cues></mdscript>",
        )
        .unwrap();

        let mut st = McpState::new(McpOptions {
            mode: McpMode::Standalone,
            ..Default::default()
        });

        let parse_err = process_json_line(&mut st, "{bad json").unwrap();
        assert_eq!(parse_err["error"]["code"], -32700);

        let unknown_meth =
            process_json_line(&mut st, r#"{"jsonrpc":"2.0","id":1,"method":"nope/op"}"#).unwrap();
        assert_eq!(unknown_meth["error"]["code"], -32601);

        let cursor_err = process_json_line(
            &mut st,
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"cursor":"c1"}}"#,
        )
        .unwrap();
        assert_eq!(cursor_err["error"]["code"], -32602);

        let unknown_tool = process_json_line(
            &mut st,
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"does_not_exist"}}"#,
        )
        .unwrap();
        assert_eq!(unknown_tool["error"]["code"], -32602);

        let hash_req = json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": { "name": "x4_hash_tree", "arguments": { "root": tmp.to_string_lossy() } }
        })
        .to_string();
        let hash_res = process_json_line(&mut st, &hash_req).unwrap();
        assert_eq!(hash_res["result"]["isError"], false);

        let val_req = json!({
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": { "name": "x4_validate_mod", "arguments": { "modDir": tmp.to_string_lossy() } }
        })
        .to_string();
        let val_res = process_json_line(&mut st, &val_req).unwrap();
        assert_eq!(val_res["result"]["isError"], false);

        let insp_req = json!({
            "jsonrpc": "2.0",
            "id": 6,
            "method": "tools/call",
            "params": { "name": "x4_inspect_document", "arguments": { "path": tmp.join("md/test.xml").to_string_lossy() } }
        })
        .to_string();
        let insp_res = process_json_line(&mut st, &insp_req).unwrap();
        assert_eq!(insp_res["result"]["isError"], false);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn proxies_remote_capabilities_and_enforces_fixed_body() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        let srv = thread::spawn(move || {
            use std::io::BufRead;
            for idx in 0..2 {
                let (mut sock, _) = listener.accept().unwrap();
                let mut reader = BufReader::new(sock.try_clone().unwrap());
                let mut headers_raw = String::new();
                let mut content_len = 0usize;
                loop {
                    let mut line = String::new();
                    let n = reader.read_line(&mut line).unwrap();
                    if n == 0 || line == "\r\n" || line == "\n" {
                        break;
                    }
                    if let Some((k, v)) = line.split_once(':') {
                        if k.trim().eq_ignore_ascii_case("content-length") {
                            content_len = v.trim().parse().unwrap_or(0);
                        }
                    }
                    headers_raw.push_str(&line);
                }
                let mut body_bytes = vec![0u8; content_len];
                if content_len > 0 {
                    reader.read_exact(&mut body_bytes).unwrap();
                }
                if idx == 0 {
                    assert!(headers_raw.contains("/api/agent/capabilities"));
                    let payload = json!({
                        "contractHash": "hash-abc",
                        "capabilities": [{
                            "id": "mock.echo",
                            "version": 1,
                            "description": "Echo test",
                            "inputSchema": { "type": "object", "properties": { "msg": { "type": "string" } } },
                            "api": [{
                                "method": "POST",
                                "path": "/api/mock/echo",
                                "inputLocation": "body",
                                "role": "primary",
                                "fixedBody": { "enforced": "server-pinned" }
                            }],
                            "surfaces": {
                                "mcp": [{ "id": "forge_mock_echo", "status": "connected" }]
                            }
                        }]
                    })
                    .to_string();
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                        payload.len(),
                        payload
                    );
                    sock.write_all(resp.as_bytes()).unwrap();
                } else {
                    assert!(headers_raw.to_ascii_lowercase().contains("authorization: bearer k-secret"));
                    assert!(headers_raw.to_ascii_lowercase().contains("x-workspace-id: ws-1"));
                    assert!(headers_raw.to_ascii_lowercase().contains("x-forge-channel: mcp"));
                    let body_str = String::from_utf8_lossy(&body_bytes);
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                        body_str.len(),
                        body_str
                    );
                    sock.write_all(resp.as_bytes()).unwrap();
                }
            }
        });

        let mut st = McpState::new(McpOptions {
            mode: McpMode::Proxy,
            url: Some(format!("http://127.0.0.1:{port}")),
            api_key: Some("k-secret".to_string()),
            workspace_id: Some("ws-1".to_string()),
            ..Default::default()
        });

        let list = process_json_line(&mut st, r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#)
            .unwrap();
        let tools = list["result"]["tools"].as_array().unwrap();
        let echo_tool = tools
            .iter()
            .find(|t| t["name"] == "forge_mock_echo")
            .unwrap();
        assert_eq!(echo_tool["_meta"]["x4forge/contractHash"], "hash-abc");

        let call = process_json_line(
            &mut st,
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"forge_mock_echo","arguments":{"msg":"hello","enforced":"tampered"}}}"#,
        )
        .unwrap();
        assert_eq!(call["result"]["isError"], false);
        let text = call["result"]["content"][0]["text"].as_str().unwrap();
        let echoed: Value = serde_json::from_str(text).unwrap();
        assert_eq!(echoed["enforced"], "server-pinned");
        assert_eq!(echoed["msg"], "hello");

        srv.join().unwrap();
    }
}
