use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;
use url::Url;

const MAX_HEADER_BYTES: usize = 64 * 1024;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct ParsedLoopbackUrl {
    pub base_url: String,
    pub host_header: String,
    pub connect_addrs: Vec<SocketAddr>,
    pub path_and_query: String,
}

#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

/// Validates that a URL strictly targets a local HTTP loopback endpoint without credentials or DNS tricks.
pub fn validate_loopback_url(raw: &str) -> Result<ParsedLoopbackUrl, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    let u = Url::parse(trimmed)
        .map_err(|e| format!("Refusing non-loopback Forge URL '{raw}': invalid URL ({e})"))?;

    let host_raw = u.host_str().unwrap_or("");
    let host_norm = host_raw.trim_start_matches('[').trim_end_matches(']');
    let is_loopback_host =
        host_norm.eq_ignore_ascii_case("localhost") || host_norm == "127.0.0.1" || host_norm == "::1";
    if !is_loopback_host {
        return Err(format!(
            "Refusing non-loopback Forge URL '{raw}': host '{host_raw}' must be 127.0.0.1, localhost, or ::1."
        ));
    }

    if !u.scheme().eq_ignore_ascii_case("http") {
        return Err(format!(
            "Refusing non-loopback Forge URL '{raw}': scheme '{}' is not plain http:// loopback.",
            u.scheme()
        ));
    }

    if !u.username().is_empty() || u.password().is_some() {
        return Err(format!(
            "Refusing non-loopback Forge URL '{raw}': embedded credentials are forbidden."
        ));
    }

    let port = u.port_or_known_default().ok_or_else(|| {
        format!("Refusing non-loopback Forge URL '{raw}': missing port.")
    })?;

    let addrs: Vec<SocketAddr> = (host_norm, port)
        .to_socket_addrs()
        .map_err(|e| format!("Failed resolving loopback address for '{raw}': {e}"))?
        .collect();
    if addrs.is_empty() || addrs.iter().any(|a| !a.ip().is_loopback()) {
        return Err(format!(
            "Refusing non-loopback Forge URL '{raw}': resolved address is not loopback."
        ));
    }

    let origin = if host_norm == "::1" {
        format!("http://[::1]:{port}")
    } else {
        format!("http://{host_norm}:{port}")
    };
    let host_header = if host_norm == "::1" {
        format!("[::1]:{port}")
    } else {
        format!("{host_norm}:{port}")
    };
    let pq = match u.query() {
        Some(q) => format!("{}?{q}", u.path()),
        None => u.path().to_string(),
    };

    Ok(ParsedLoopbackUrl {
        base_url: origin,
        host_header,
        connect_addrs: addrs,
        path_and_query: pq,
    })
}

pub fn loopback_request(
    method: &str,
    full_url: &str,
    headers: &[(String, String)],
    body: Option<&[u8]>,
    timeout: Duration,
) -> Result<HttpResponse, String> {
    let parsed = validate_loopback_url(full_url)?;

    let mut stream = None;
    let mut last_err = String::from("no address available");
    for addr in &parsed.connect_addrs {
        match TcpStream::connect_timeout(addr, timeout) {
            Ok(s) => {
                stream = Some(s);
                break;
            }
            Err(e) => {
                last_err = e.to_string();
            }
        }
    }
    let mut stream = stream.ok_or_else(|| {
        format!(
            "Forge sidecar unreachable at {}: {last_err}",
            parsed.base_url
        )
    })?;

    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));

    let path = if parsed.path_and_query.is_empty() {
        "/"
    } else {
        &parsed.path_and_query
    };

    let mut req = format!(
        "{} {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\nAccept: application/json\r\n",
        method.to_ascii_uppercase(),
        path,
        parsed.host_header
    );
    let mut has_content_type = false;
    for (k, v) in headers {
        if k.eq_ignore_ascii_case("content-type") {
            has_content_type = true;
        }
        let clean_k: String = k.chars().filter(|c| !matches!(c, '\r' | '\n' | ':')).collect();
        let clean_v: String = v.chars().filter(|c| !matches!(c, '\r' | '\n')).collect();
        req.push_str(&format!("{clean_k}: {clean_v}\r\n"));
    }
    if let Some(b) = body {
        if !has_content_type {
            req.push_str("Content-Type: application/json\r\n");
        }
        req.push_str(&format!("Content-Length: {}\r\n", b.len()));
    }
    req.push_str("\r\n");

    let mut payload = req.into_bytes();
    if let Some(b) = body {
        payload.extend_from_slice(b);
    }

    stream
        .write_all(&payload)
        .map_err(|e| format!("HTTP write failed: {e}"))?;
    stream.flush().map_err(|e| format!("HTTP flush failed: {e}"))?;

    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    reader
        .read_line(&mut status_line)
        .map_err(|e| format!("Failed reading HTTP status line: {e}"))?;
    let mut parts = status_line.trim_end_matches(['\r', '\n']).splitn(3, ' ');
    let _http_ver = parts.next().unwrap_or("");
    let status: u16 = parts
        .next()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| format!("Malformed HTTP status line: {}", status_line.trim()))?;

    let mut header_bytes = status_line.len();
    let mut resp_headers = BTreeMap::new();
    loop {
        let mut hline = String::new();
        let n = reader
            .read_line(&mut hline)
            .map_err(|e| format!("Failed reading HTTP headers: {e}"))?;
        if n == 0 {
            break;
        }
        header_bytes += n;
        if header_bytes > MAX_HEADER_BYTES {
            return Err("HTTP response headers exceed 64 KiB limit".to_string());
        }
        let trimmed = hline.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            resp_headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }

    if (300..=399).contains(&status) {
        return Err(format!(
            "Refusing HTTP redirect ({status}) from Forge sidecar (redirect: error policy)"
        ));
    }

    let is_chunked = resp_headers
        .get("transfer-encoding")
        .is_some_and(|v| v.to_ascii_lowercase().contains("chunked"));
    let content_length = resp_headers
        .get("content-length")
        .and_then(|v| v.parse::<usize>().ok());

    let body = if is_chunked {
        read_chunked_body(&mut reader)?
    } else if let Some(cl) = content_length {
        if cl > MAX_BODY_BYTES {
            return Err(format!("HTTP response Content-Length {cl} exceeds 8 MiB limit"));
        }
        let mut buf = vec![0u8; cl];
        reader
            .read_exact(&mut buf)
            .map_err(|e| format!("Failed reading HTTP response body: {e}"))?;
        buf
    } else {
        let mut buf = Vec::new();
        let mut limited = reader.take((MAX_BODY_BYTES + 1) as u64);
        limited
            .read_to_end(&mut buf)
            .map_err(|e| format!("Failed reading HTTP stream: {e}"))?;
        if buf.len() > MAX_BODY_BYTES {
            return Err("HTTP response body exceeds 8 MiB limit".to_string());
        }
        buf
    };

    Ok(HttpResponse {
        status,
        headers: resp_headers,
        body,
    })
}

fn read_chunked_body<R: BufRead>(reader: &mut R) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    loop {
        let mut size_line = String::new();
        let n = reader
            .read_line(&mut size_line)
            .map_err(|e| format!("Chunked header read error: {e}"))?;
        if n == 0 {
            break;
        }
        let size_hex = size_line
            .trim_end_matches(['\r', '\n'])
            .split(';')
            .next()
            .unwrap_or("")
            .trim();
        let chunk_len = usize::from_str_radix(size_hex, 16)
            .map_err(|_| format!("Invalid chunked encoding length '{size_hex}'"))?;
        if chunk_len == 0 {
            // Drain trailer lines
            loop {
                let mut tr = String::new();
                if reader.read_line(&mut tr).unwrap_or(0) == 0 || tr.trim().is_empty() {
                    break;
                }
            }
            break;
        }
        if out.len().saturating_add(chunk_len) > MAX_BODY_BYTES {
            return Err("Chunked HTTP response exceeds 8 MiB limit".to_string());
        }
        let start = out.len();
        out.resize(start + chunk_len, 0);
        reader
            .read_exact(&mut out[start..])
            .map_err(|e| format!("Chunked body read error: {e}"))?;
        let mut crlf = [0u8; 2];
        reader
            .read_exact(&mut crlf)
            .map_err(|e| format!("Chunked CRLF read error: {e}"))?;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn validates_strict_loopback_urls() {
        assert!(validate_loopback_url("http://127.0.0.1:3001").is_ok());
        assert!(validate_loopback_url("http://localhost:3000/").is_ok());
        assert!(validate_loopback_url("http://[::1]:3000").is_ok());

        for bad in [
            "https://evil.example.com",
            "https://127.0.0.1:3000",
            "http://169.254.169.254/latest/meta-data/",
            "http://user:pass@127.0.0.1:3000",
        ] {
            let err = validate_loopback_url(bad).unwrap_err();
            assert!(
                err.contains("Refusing non-loopback Forge URL"),
                "unexpected error for {bad}: {err}"
            );
        }
    }

    #[test]
    fn handles_chunked_and_refuses_302_redirects() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        let srv = thread::spawn(move || {
            for idx in 0..2 {
                let (mut sock, _) = listener.accept().unwrap();
                let mut req_buf = [0u8; 1024];
                let _ = sock.read(&mut req_buf);
                if idx == 0 {
                    let body = b"{\"ok\":true}";
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n{}\r\n0\r\n\r\n",
                        body.len(),
                        std::str::from_utf8(body).unwrap()
                    );
                    sock.write_all(resp.as_bytes()).unwrap();
                } else {
                    sock.write_all(
                        b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9999/\r\nContent-Length: 0\r\n\r\n",
                    )
                    .unwrap();
                }
            }
        });

        let ok_res = loopback_request(
            "GET",
            &format!("http://127.0.0.1:{port}/api/health"),
            &[],
            None,
            Duration::from_secs(2),
        )
        .unwrap();
        assert_eq!(ok_res.status, 200);
        assert_eq!(ok_res.body, b"{\"ok\":true}");

        let redir_err = loopback_request(
            "GET",
            &format!("http://127.0.0.1:{port}/api/redir"),
            &[],
            None,
            Duration::from_secs(2),
        )
        .unwrap_err();
        assert!(redir_err.contains("Refusing HTTP redirect (302)"));

        srv.join().unwrap();
    }
}
