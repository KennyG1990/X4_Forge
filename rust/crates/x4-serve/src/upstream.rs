use axum::body::{to_bytes, Body};
use axum::extract::Request;
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::json;
use std::time::Duration;
use x4_mcp::http_loopback::{loopback_request, validate_loopback_url};

const MAX_PROXY_REQ_BYTES: usize = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(30);

pub fn validate_upstream_origin(raw: &str) -> Result<String, String> {
    let parsed = validate_loopback_url(raw)?;
    Ok(parsed.base_url)
}

pub async fn forward_to_upstream(upstream_base: &str, req: Request) -> Response {
    let method = req.method().as_str().to_string();
    let pq = req
        .uri()
        .path_and_query()
        .map(|p| p.as_str().to_string())
        .unwrap_or_else(|| "/".to_string());
    let target_url = format!("{upstream_base}{pq}");

    let mut fwd_headers: Vec<(String, String)> = Vec::new();
    for hname in [
        "authorization",
        "x-workspace-id",
        "x-forge-channel",
        "x-forge-operation-id",
        "x-client-id",
        "content-type",
    ] {
        if let Some(val) = req.headers().get(hname).and_then(|v| v.to_str().ok()) {
            fwd_headers.push((hname.to_string(), val.to_string()));
        }
    }

    let body_bytes = match to_bytes(req.into_body(), MAX_PROXY_REQ_BYTES).await {
        Ok(b) => b.to_vec(),
        Err(e) => {
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                axum::Json(json!({ "error": format!("Request body error: {e}") })),
            )
                .into_response();
        }
    };

    let send_body = if body_bytes.is_empty() && matches!(method.as_str(), "GET" | "HEAD") {
        None
    } else if body_bytes.is_empty() {
        None
    } else {
        Some(body_bytes)
    };

    let upstream_res = tokio::task::spawn_blocking(move || {
        loopback_request(
            &method,
            &target_url,
            &fwd_headers,
            send_body.as_deref(),
            UPSTREAM_TIMEOUT,
        )
    })
    .await;

    match upstream_res {
        Ok(Ok(resp)) => {
            let status = StatusCode::from_u16(resp.status).unwrap_or(StatusCode::BAD_GATEWAY);
            let mut out = Response::new(Body::from(resp.body));
            *out.status_mut() = status;
            if let Some(ct) = resp.headers.get("content-type") {
                if let Ok(hv) = HeaderValue::from_str(ct) {
                    out.headers_mut().insert(header::CONTENT_TYPE, hv);
                }
            }
            out
        }
        Ok(Err(err)) => (
            StatusCode::BAD_GATEWAY,
            axum::Json(json!({
                "ok": false,
                "code": "UPSTREAM_PROXY_ERROR",
                "error": err,
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(json!({ "error": format!("Upstream join error: {e}") })),
        )
            .into_response(),
    }
}
