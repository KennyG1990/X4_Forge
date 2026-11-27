use crate::{Diagnostic, Severity};
use roxmltree::{Document, ParsingOptions};

#[derive(Debug, Clone)]
pub struct LineIndex {
    line_starts: Vec<usize>,
    bom_len: usize,
}

impl LineIndex {
    pub fn new(text: &str) -> Self {
        let bom_len = if text.starts_with('\u{feff}') { 3 } else { 0 };
        let clean = &text[bom_len..];
        let mut line_starts = vec![0usize];
        for (idx, b) in clean.bytes().enumerate() {
            if b == b'\n' {
                line_starts.push(idx + 1);
            }
        }
        Self {
            line_starts,
            bom_len,
        }
    }

    pub fn strip_bom<'a>(&self, text: &'a str) -> &'a str {
        &text[self.bom_len..]
    }

    /// Map a byte offset inside `clean` (`strip_bom(text)`) to 1-based `(line, utf16_col)`.
    pub fn pos_clean(&self, clean: &str, offset: usize) -> (u32, u32) {
        let mut clamped = offset.min(clean.len());
        while clamped > 0 && !clean.is_char_boundary(clamped) {
            clamped -= 1;
        }
        let line_idx = match self.line_starts.binary_search(&clamped) {
            Ok(i) => i,
            Err(i) => i.saturating_sub(1),
        };
        let start = self.line_starts[line_idx];
        let slice = &clean[start..clamped];
        let utf16_col = slice.encode_utf16().count() as u32 + 1;
        ((line_idx + 1) as u32, utf16_col)
    }

    /// Map a byte offset inside original `text` (possibly with leading UTF-8 BOM) to 1-based `(line, utf16_col)`.
    pub fn pos_raw(&self, raw: &str, offset: usize) -> (u32, u32) {
        let clean_offset = offset.saturating_sub(self.bom_len);
        self.pos_clean(self.strip_bom(raw), clean_offset)
    }
}

pub fn parse_xml<'a>(rel_path: &str, clean_text: &'a str) -> Result<Document<'a>, Diagnostic> {
    let opts = ParsingOptions {
        allow_dtd: true,
        ..Default::default()
    };
    Document::parse_with_options(clean_text, opts).map_err(|err| {
        let pos = err.pos();
        Diagnostic {
            severity: Severity::Error,
            code: "xml.wellformedness".to_string(),
            category: "structural".to_string(),
            message: format!("Malformed XML: {err}"),
            file_path: Some(rel_path.to_string()),
            line: Some(pos.row),
            column: Some(pos.col),
            source_ref: None,
            suggestions: Vec::new(),
        }
    })
}
