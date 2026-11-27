use axum::body::Body;
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::json;
use std::fs;
use std::path::{Component, Path, PathBuf};

fn percent_decode(raw: &str) -> Result<String, ()> {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err(());
            }
            let hi = char::from(bytes[i + 1]).to_digit(16).ok_or(())?;
            let lo = char::from(bytes[i + 2]).to_digit(16).ok_or(())?;
            out.push(((hi << 4) | lo) as u8);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| ())
}

fn mime_for_path(p: &Path) -> &'static str {
    match p
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs" | "cjs") => "application/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("ico") => "image/x-icon",
        Some("wasm") => "application/wasm",
        Some("woff2") => "font/woff2",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

pub fn inject_studio_token(html: &str, studio_token: &str) -> String {
    let encoded_token = serde_json::to_string(studio_token).unwrap_or_else(|_| "\"\"".to_string());
    let script = format!("<script>window.__STUDIO_API_TOKEN__={encoded_token};</script>");
    if let Some(pos) = html.to_ascii_lowercase().find("</head>") {
        let mut out = String::with_capacity(html.len() + script.len() + 8);
        out.push_str(&html[..pos]);
        out.push_str("  ");
        out.push_str(&script);
        out.push('\n');
        out.push_str(&html[pos..]);
        out
    } else {
        format!("{script}\n{html}")
    }
}

fn forbidden(msg: &str) -> Response {
    (
        StatusCode::FORBIDDEN,
        axum::Json(json!({ "error": msg, "code": "PATH_TRAVERSAL_FORBIDDEN" })),
    )
        .into_response()
}

pub fn serve_static_path(static_dir: &Path, raw_uri_path: &str, studio_token: &str) -> Response {
    let Ok(canon_root) = fs::canonicalize(static_dir) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let Ok(decoded) = percent_decode(raw_uri_path) else {
        return forbidden("Forbidden: Invalid URI encoding.");
    };

    if decoded.contains('\0') || decoded.contains('\\') || raw_uri_path.contains("..") {
        return forbidden("Forbidden: Directory traversal detected.");
    }

    let trimmed = decoded.trim_start_matches('/');
    let mut rel_parts: Vec<&str> = Vec::new();
    for seg in trimmed.split('/') {
        if seg.is_empty() {
            continue;
        }
        if seg == "." || seg == ".." || seg.contains(':') {
            return forbidden("Forbidden: Directory traversal detected.");
        }
        rel_parts.push(seg);
    }

    let mut candidate: PathBuf = canon_root.clone();
    for part in &rel_parts {
        candidate.push(part);
    }
    if candidate
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return forbidden("Forbidden: Directory traversal detected.");
    }

    let is_root_or_spa = rel_parts.is_empty()
        || (!candidate.exists()
            && !rel_parts
                .last()
                .is_some_and(|s| s.contains('.')));

    let target_file = if is_root_or_spa {
        canon_root.join("index.html")
    } else {
        candidate
    };

    let Ok(meta) = fs::symlink_metadata(&target_file) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if meta.file_type().is_symlink() || !meta.file_type().is_file() {
        return forbidden("Forbidden: Special or non-file static asset rejected.");
    }
    let Ok(canon_target) = fs::canonicalize(&target_file) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !canon_target.starts_with(&canon_root) {
        return forbidden("Forbidden: Directory traversal detected.");
    }

    let Ok(bytes) = fs::read(&canon_target) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let mime = mime_for_path(&canon_target);
    if mime.starts_with("text/html") {
        let html = String::from_utf8_lossy(&bytes);
        let injected = inject_studio_token(&html, studio_token);
        let mut resp = Response::new(Body::from(injected));
        *resp.status_mut() = StatusCode::OK;
        resp.headers_mut()
            .insert(header::CONTENT_TYPE, HeaderValue::from_static("text/html; charset=utf-8"));
        return resp;
    }

    let mut resp = Response::new(Body::from(bytes));
    *resp.status_mut() = StatusCode::OK;
    if let Ok(hv) = HeaderValue::from_str(mime) {
        resp.headers_mut().insert(header::CONTENT_TYPE, hv);
    }
    resp
}
