use serde_json::Value;
use std::io::{self, BufRead, Write};

const MAX_LSP_MESSAGE_BYTES: usize = 64 * 1024 * 1024;

/// Reads a single LSP Content-Length JSON-RPC 2.0 frame.
/// Returns `Ok(None)` on clean EOF before headers.
pub fn read_message<R: BufRead>(reader: &mut R) -> io::Result<Option<Value>> {
    let mut content_length: Option<usize> = None;
    let mut saw_header = false;

    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            if !saw_header {
                return Ok(None);
            }
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "Unexpected EOF while reading LSP headers",
            ));
        }
        saw_header = true;
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((name, val)) = trimmed.split_once(':') {
            if name.trim().eq_ignore_ascii_case("content-length") {
                let parsed: usize = val.trim().parse().map_err(|_| {
                    io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!("Invalid Content-Length header value: {}", val.trim()),
                    )
                })?;
                if parsed > MAX_LSP_MESSAGE_BYTES {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!("LSP Content-Length {parsed} exceeds 64 MiB limit"),
                    ));
                }
                content_length = Some(parsed);
            }
        }
    }

    let len = content_length.ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "Missing Content-Length header in LSP frame",
        )
    })?;

    let mut buf = vec![0u8; len];
    reader.read_exact(&mut buf)?;
    serde_json::from_slice(&buf).map(Some).map_err(|e| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Invalid JSON in LSP frame: {e}"),
        )
    })
}

/// Writes a single LSP Content-Length JSON-RPC 2.0 frame and flushes.
pub fn write_message<W: Write>(writer: &mut W, payload: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(payload)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("JSON encode: {e}")))?;
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    writer.write_all(header.as_bytes())?;
    writer.write_all(&body)?;
    writer.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Cursor;

    #[test]
    fn round_trips_multiple_frames_and_eof() {
        let mut wire = Vec::new();
        let m1 = json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize" });
        let m2 = json!({ "jsonrpc": "2.0", "method": "initialized", "params": {} });
        write_message(&mut wire, &m1).unwrap();
        write_message(&mut wire, &m2).unwrap();

        let mut cur = Cursor::new(wire);
        assert_eq!(read_message(&mut cur).unwrap(), Some(m1));
        assert_eq!(read_message(&mut cur).unwrap(), Some(m2));
        assert_eq!(read_message(&mut cur).unwrap(), None);
    }

    #[test]
    fn accepts_lowercase_content_length_and_extra_headers() {
        let body = r#"{"jsonrpc":"2.0","id":7,"method":"shutdown"}"#;
        let raw = format!(
            "content-type: application/vscode-jsonrpc; charset=utf-8\r\ncontent-length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let mut cur = Cursor::new(raw.into_bytes());
        let parsed = read_message(&mut cur).unwrap().unwrap();
        assert_eq!(parsed["id"], 7);
        assert_eq!(parsed["method"], "shutdown");
    }
}
