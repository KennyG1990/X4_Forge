use crate::content::TextRefHit;
use crate::xml_wellformed::LineIndex;
use crate::{Diagnostic, Severity};
use std::collections::HashSet;
use x4_corpus::CorpusIndex;

#[derive(Debug, Clone, Default)]
pub struct LuaFileSummary {
    pub registered_events: Vec<(String, String, u32, u32)>, // (event, file, line, col)
    pub text_refs: Vec<TextRefHit>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum TokKind {
    Ident(String),
    Keyword(String),
    Str(String),
    Num,
    Op(String),
    LParen,
    RParen,
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    Comma,
    Semi,
    Colon,
    DoubleColon,
    Dot,
    DotDot,
    Vararg,
    Eq,
    Eof,
}

#[derive(Debug, Clone)]
struct Tok {
    kind: TokKind,
    byte_start: usize,
}

fn is_kw(s: &str) -> bool {
    matches!(
        s,
        "and"
            | "break"
            | "do"
            | "else"
            | "elseif"
            | "end"
            | "false"
            | "for"
            | "function"
            | "goto"
            | "if"
            | "in"
            | "local"
            | "nil"
            | "not"
            | "or"
            | "repeat"
            | "return"
            | "then"
            | "true"
            | "until"
            | "while"
    )
}

struct Lexer<'a> {
    src: &'a [u8],
    raw: &'a str,
    pos: usize,
}

impl<'a> Lexer<'a> {
    fn new(clean: &'a str) -> Self {
        Self {
            src: clean.as_bytes(),
            raw: clean,
            pos: 0,
        }
    }

    fn peek(&self) -> Option<u8> {
        self.src.get(self.pos).copied()
    }

    fn peek_n(&self, off: usize) -> Option<u8> {
        self.src.get(self.pos + off).copied()
    }

    fn long_bracket_level(&self, start: usize) -> Option<(usize, usize)> {
        if self.src.get(start) != Some(&b'[') {
            return None;
        }
        let mut idx = start + 1;
        let mut eqs = 0usize;
        while self.src.get(idx) == Some(&b'=') {
            eqs += 1;
            idx += 1;
        }
        if self.src.get(idx) == Some(&b'[') {
            Some((eqs, idx + 1))
        } else {
            None
        }
    }

    fn consume_long_bracket(&mut self, eqs: usize, body_start: usize) -> Result<String, usize> {
        let mut i = body_start;
        // Skip immediate newline after opening bracket
        if self.src.get(i) == Some(&b'\r') && self.src.get(i + 1) == Some(&b'\n') {
            i += 2;
        } else if self.src.get(i) == Some(&b'\n') {
            i += 1;
        }
        let text_start = i;
        while i < self.src.len() {
            if self.src[i] == b']' {
                let mut j = i + 1;
                let mut cnt = 0usize;
                while cnt < eqs && self.src.get(j) == Some(&b'=') {
                    cnt += 1;
                    j += 1;
                }
                if cnt == eqs && self.src.get(j) == Some(&b']') {
                    self.pos = j + 1;
                    return Ok(self.raw[text_start..i].to_string());
                }
            }
            i += 1;
        }
        Err(body_start)
    }

    fn tokenize_all(&mut self) -> Result<Vec<Tok>, (usize, String)> {
        let mut tokens = Vec::new();
        while let Some(b) = self.peek() {
            if b.is_ascii_whitespace() {
                self.pos += 1;
                continue;
            }
            let start = self.pos;

            // Comments
            if b == b'-' && self.peek_n(1) == Some(b'-') {
                self.pos += 2;
                if let Some((eqs, body_start)) = self.long_bracket_level(self.pos) {
                    if self.consume_long_bracket(eqs, body_start).is_err() {
                        return Err((start, "Unterminated long comment.".to_string()));
                    }
                } else {
                    while let Some(ch) = self.peek() {
                        self.pos += 1;
                        if ch == b'\n' {
                            break;
                        }
                    }
                }
                continue;
            }

            // Long strings [[...]] / [=[...]=]
            if b == b'[' {
                if let Some((eqs, body_start)) = self.long_bracket_level(self.pos) {
                    match self.consume_long_bracket(eqs, body_start) {
                        Ok(s) => {
                            tokens.push(Tok {
                                kind: TokKind::Str(s),
                                byte_start: start,
                            });
                            continue;
                        }
                        Err(_) => {
                            return Err((start, "Unterminated long string literal.".to_string()));
                        }
                    }
                }
            }

            // Quoted strings
            if b == b'"' || b == b'\'' {
                let quote = b;
                self.pos += 1;
                let mut out = String::new();
                let mut closed = false;
                while let Some(c) = self.peek() {
                    if c == b'\n' || c == b'\r' {
                        return Err((start, "Unclosed string literal before newline.".to_string()));
                    }
                    self.pos += 1;
                    if c == quote {
                        closed = true;
                        break;
                    }
                    if c == b'\\' {
                        if let Some(esc) = self.peek() {
                            self.pos += 1;
                            match esc {
                                b'n' => out.push('\n'),
                                b'r' => out.push('\r'),
                                b't' => out.push('\t'),
                                b'z' => {
                                    while self.peek().is_some_and(|w| w.is_ascii_whitespace()) {
                                        self.pos += 1;
                                    }
                                }
                                other => out.push(other as char),
                            }
                            continue;
                        }
                        return Err((start, "Unterminated escape in string literal.".to_string()));
                    }
                    out.push(c as char);
                }
                if !closed {
                    return Err((start, "Unterminated string literal.".to_string()));
                }
                tokens.push(Tok {
                    kind: TokKind::Str(out),
                    byte_start: start,
                });
                continue;
            }

            // Numbers (incl hex floats, scientific, LuaJIT ULL/LL/i suffixes)
            if b.is_ascii_digit()
                || (b == b'.' && self.peek_n(1).is_some_and(|n| n.is_ascii_digit()))
            {
                self.pos += 1;
                let mut is_hex = false;
                if b == b'0' && self.peek().is_some_and(|c| c == b'x' || c == b'X') {
                    is_hex = true;
                    self.pos += 1;
                }
                while let Some(c) = self.peek() {
                    if (is_hex && c.is_ascii_hexdigit()) || (!is_hex && c.is_ascii_digit()) || c == b'.' {
                        if c == b'.' && self.peek_n(1) == Some(b'.') {
                            break;
                        }
                        self.pos += 1;
                    } else if (!is_hex && (c == b'e' || c == b'E'))
                        || (is_hex && (c == b'p' || c == b'P'))
                    {
                        self.pos += 1;
                        if matches!(self.peek(), Some(b'+') | Some(b'-')) {
                            self.pos += 1;
                        }
                    } else {
                        break;
                    }
                }
                // Optional LuaJIT cdata integer suffix: ULL / LL / i
                while self.peek().is_some_and(|c| matches!(c, b'u' | b'U' | b'l' | b'L' | b'i' | b'I')) {
                    self.pos += 1;
                }
                tokens.push(Tok {
                    kind: TokKind::Num,
                    byte_start: start,
                });
                continue;
            }

            // Identifiers / Keywords
            if b.is_ascii_alphabetic() || b == b'_' {
                while self
                    .peek()
                    .is_some_and(|c| c.is_ascii_alphanumeric() || c == b'_')
                {
                    self.pos += 1;
                }
                let word = &self.raw[start..self.pos];
                let kind = if is_kw(word) {
                    TokKind::Keyword(word.to_string())
                } else {
                    TokKind::Ident(word.to_string())
                };
                tokens.push(Tok {
                    kind,
                    byte_start: start,
                });
                continue;
            }

            // Punctuators / Operators
            let two = (b, self.peek_n(1));
            let kind = match two {
                (b'.', Some(b'.')) => {
                    if self.peek_n(2) == Some(b'.') {
                        self.pos += 3;
                        TokKind::Vararg
                    } else {
                        self.pos += 2;
                        TokKind::DotDot
                    }
                }
                (b':', Some(b':')) => {
                    self.pos += 2;
                    TokKind::DoubleColon
                }
                (b'=', Some(b'='))
                | (b'~', Some(b'='))
                | (b'<', Some(b'='))
                | (b'>', Some(b'=')) => {
                    self.pos += 2;
                    TokKind::Op(self.raw[start..self.pos].to_string())
                }
                _ => {
                    self.pos += 1;
                    match b {
                        b'(' => TokKind::LParen,
                        b')' => TokKind::RParen,
                        b'{' => TokKind::LBrace,
                        b'}' => TokKind::RBrace,
                        b'[' => TokKind::LBracket,
                        b']' => TokKind::RBracket,
                        b',' => TokKind::Comma,
                        b';' => TokKind::Semi,
                        b':' => TokKind::Colon,
                        b'.' => TokKind::Dot,
                        b'=' => TokKind::Eq,
                        b'+' | b'-' | b'*' | b'/' | b'%' | b'^' | b'#' | b'<' | b'>' => {
                            TokKind::Op(self.raw[start..self.pos].to_string())
                        }
                        _ => {
                            return Err((
                                start,
                                format!("Unexpected character '{}' in Lua source.", b as char),
                            ));
                        }
                    }
                }
            };
            tokens.push(Tok {
                kind,
                byte_start: start,
            });
        }
        tokens.push(Tok {
            kind: TokKind::Eof,
            byte_start: self.raw.len(),
        });
        Ok(tokens)
    }
}

struct Parser<'a> {
    toks: &'a [Tok],
    i: usize,
    scopes: Vec<HashSet<String>>, // lexical local shadows
}

impl<'a> Parser<'a> {
    fn new(toks: &'a [Tok]) -> Self {
        Self {
            toks,
            i: 0,
            scopes: vec![HashSet::new()],
        }
    }

    fn cur(&self) -> &Tok {
        &self.toks[self.i.min(self.toks.len() - 1)]
    }

    fn bump(&mut self) {
        if self.i + 1 < self.toks.len() {
            self.i += 1;
        }
    }

    fn at_kw(&self, k: &str) -> bool {
        matches!(&self.cur().kind, TokKind::Keyword(w) if w == k)
    }

    fn eat_kw(&mut self, k: &str) -> bool {
        if self.at_kw(k) {
            self.bump();
            true
        } else {
            false
        }
    }

    fn expect_kw(&mut self, k: &str) -> Result<(), (usize, String)> {
        if self.eat_kw(k) {
            Ok(())
        } else {
            Err((
                self.cur().byte_start,
                format!("Expected keyword '{k}'."),
            ))
        }
    }

    fn is_block_end(&self) -> bool {
        matches!(
            &self.cur().kind,
            TokKind::Eof
        ) || matches!(
            &self.cur().kind,
            TokKind::Keyword(k) if matches!(k.as_str(), "else" | "elseif" | "end" | "until")
        )
    }

    fn is_shadowed(&self, name: &str) -> bool {
        self.scopes.iter().rev().any(|s| s.contains(name))
    }

    fn add_local(&mut self, name: &str) {
        if let Some(top) = self.scopes.last_mut() {
            top.insert(name.to_string());
        }
    }

    fn push_scope(&mut self) {
        self.scopes.push(HashSet::new());
    }

    fn pop_scope(&mut self) {
        if self.scopes.len() > 1 {
            self.scopes.pop();
        }
    }

    fn parse_chunk(
        &mut self,
        rel_path: &str,
        clean_text: &str,
        line_idx: &LineIndex,
        corpus: &CorpusIndex,
        out: &mut LuaFileSummary,
    ) -> Result<(), (usize, String)> {
        while !self.is_block_end() {
            if matches!(self.cur().kind, TokKind::Semi) {
                self.bump();
                continue;
            }
            if self.at_kw("return") {
                self.bump();
                if !self.is_block_end() && !matches!(self.cur().kind, TokKind::Semi) {
                    self.parse_expr_list(rel_path, clean_text, line_idx, corpus, out)?;
                }
                let _ = matches!(self.cur().kind, TokKind::Semi) && {
                    self.bump();
                    true
                };
                break;
            }
            self.parse_stmt(rel_path, clean_text, line_idx, corpus, out)?;
        }
        Ok(())
    }

    fn parse_stmt(
        &mut self,
        rel_path: &str,
        clean_text: &str,
        line_idx: &LineIndex,
        corpus: &CorpusIndex,
        out: &mut LuaFileSummary,
    ) -> Result<(), (usize, String)> {
        match &self.cur().kind.clone() {
            TokKind::Keyword(k) if k == "do" => {
                self.bump();
                self.push_scope();
                self.parse_chunk(rel_path, clean_text, line_idx, corpus, out)?;
                self.pop_scope();
                self.expect_kw("end")?;
            }
            TokKind::Keyword(k) if k == "while" => {
                self.bump();
                self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
                self.expect_kw("do")?;
                self.push_scope();
                self.parse_chunk(rel_path, clean_text, line_idx, corpus, out)?;
                self.pop_scope();
                self.expect_kw("end")?;
            }
            TokKind::Keyword(k) if k == "repeat" => {
                self.bump();
                self.push_scope();
                self.parse_chunk(rel_path, clean_text, line_idx, corpus, out)?;
                self.expect_kw("until")?;
                self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
                self.pop_scope();
            }
            TokKind::Keyword(k) if k == "if" => {
                self.bump();
                self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
                self.expect_kw("then")?;
                self.push_scope();
                self.parse_chunk(rel_path, clean_text, line_idx, corpus, out)?;
                self.pop_scope();
                while self.eat_kw("elseif") {
                    self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
                    self.expect_kw("then")?;
                    self.push_scope();
                    self.parse_chunk(rel_path, clean_text, line_idx, corpus, out)?;
                    self.pop_scope();
                }
                if self.eat_kw("else") {
                    self.push_scope();
                    self.parse_chunk(rel_path, clean_text, line_idx, corpus, out)?;
                    self.pop_scope();
                }
                self.expect_kw("end")?;
            }
            TokKind::Keyword(k) if k == "for" => {
                self.bump();
                let mut vars = Vec::new();
                let TokKind::Ident(first) = self.cur().kind.clone() else {
                    return Err((self.cur().byte_start, "Expected loop variable after 'for'.".into()));
                };
                vars.push(first);
                self.bump();
                if matches!(self.cur().kind, TokKind::Eq) {
                    self.bump();
                    self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
                    if !matches!(self.cur().kind, TokKind::Comma) {
                        return Err((self.cur().byte_start, "Expected ',' in numeric for.".into()));
                    }
                    self.bump();
                    self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
                    if matches!(self.cur().kind, TokKind::Comma) {
                        self.bump();
                        self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
                    }
                } else {
                    while matches!(self.cur().kind, TokKind::Comma) {
                        self.bump();
                        let TokKind::Ident(v) = self.cur().kind.clone() else {
                            return Err((self.cur().byte_start, "Expected identifier in generic for.".into()));
                        };
                        vars.push(v);
                        self.bump();
                    }
                    self.expect_kw("in")?;
                    self.parse_expr_list(rel_path, clean_text, line_idx, corpus, out)?;
                }
                self.expect_kw("do")?;
                self.push_scope();
                for v in vars {
                    self.add_local(&v);
                }
                self.parse_chunk(rel_path, clean_text, line_idx, corpus, out)?;
                self.pop_scope();
                self.expect_kw("end")?;
            }
            TokKind::Keyword(k) if k == "function" => {
                self.bump();
                while matches!(self.cur().kind, TokKind::Ident(_)) {
                    self.bump();
                    if matches!(self.cur().kind, TokKind::Dot | TokKind::Colon) {
                        self.bump();
                    } else {
                        break;
                    }
                }
                self.parse_func_body(rel_path, clean_text, line_idx, corpus, out)?;
            }
            TokKind::Keyword(k) if k == "local" => {
                self.bump();
                if self.eat_kw("function") {
                    let TokKind::Ident(name) = self.cur().kind.clone() else {
                        return Err((self.cur().byte_start, "Expected function name after 'local function'.".into()));
                    };
                    self.add_local(&name);
                    self.bump();
                    self.parse_func_body(rel_path, clean_text, line_idx, corpus, out)?;
                } else {
                    let mut names = Vec::new();
                    let TokKind::Ident(first) = self.cur().kind.clone() else {
                        return Err((self.cur().byte_start, "Expected local variable name.".into()));
                    };
                    names.push(first);
                    self.bump();
                    while matches!(self.cur().kind, TokKind::Comma) {
                        self.bump();
                        let TokKind::Ident(n) = self.cur().kind.clone() else {
                            return Err((self.cur().byte_start, "Expected variable name after ','.".into()));
                        };
                        names.push(n);
                        self.bump();
                    }
                    if matches!(self.cur().kind, TokKind::Eq) {
                        self.bump();
                        self.parse_expr_list(rel_path, clean_text, line_idx, corpus, out)?;
                    }
                    for n in names {
                        self.add_local(&n);
                    }
                }
            }
            TokKind::Keyword(k) if k == "break" => self.bump(),
            TokKind::Keyword(k) if k == "goto" => {
                self.bump();
                if !matches!(self.cur().kind, TokKind::Ident(_)) {
                    return Err((self.cur().byte_start, "Expected label name after 'goto'.".into()));
                }
                self.bump();
            }
            TokKind::DoubleColon => {
                self.bump();
                if !matches!(self.cur().kind, TokKind::Ident(_)) {
                    return Err((self.cur().byte_start, "Expected label identifier.".into()));
                }
                self.bump();
                if !matches!(self.cur().kind, TokKind::DoubleColon) {
                    return Err((self.cur().byte_start, "Expected closing '::'.".into()));
                }
                self.bump();
            }
            _ => {
                // Assignment or function call statement
                self.parse_suffixed_expr(rel_path, clean_text, line_idx, corpus, out)?;
                if matches!(self.cur().kind, TokKind::Comma | TokKind::Eq) {
                    while matches!(self.cur().kind, TokKind::Comma) {
                        self.bump();
                        self.parse_suffixed_expr(rel_path, clean_text, line_idx, corpus, out)?;
                    }
                    if !matches!(self.cur().kind, TokKind::Eq) {
                        return Err((self.cur().byte_start, "Expected '=' in assignment.".into()));
                    }
                    self.bump();
                    self.parse_expr_list(rel_path, clean_text, line_idx, corpus, out)?;
                }
            }
        }
        Ok(())
    }

    fn parse_func_body(
        &mut self,
        rel_path: &str,
        clean_text: &str,
        line_idx: &LineIndex,
        corpus: &CorpusIndex,
        out: &mut LuaFileSummary,
    ) -> Result<(), (usize, String)> {
        if !matches!(self.cur().kind, TokKind::LParen) {
            return Err((self.cur().byte_start, "Expected '(' in function signature.".into()));
        }
        self.bump();
        self.push_scope();
        while !matches!(self.cur().kind, TokKind::RParen) {
            if matches!(self.cur().kind, TokKind::Vararg) {
                self.bump();
                break;
            }
            let TokKind::Ident(p) = self.cur().kind.clone() else {
                return Err((self.cur().byte_start, "Expected parameter name.".into()));
            };
            self.add_local(&p);
            self.bump();
            if matches!(self.cur().kind, TokKind::Comma) {
                self.bump();
            } else {
                break;
            }
        }
        if !matches!(self.cur().kind, TokKind::RParen) {
            return Err((self.cur().byte_start, "Expected ')' after parameters.".into()));
        }
        self.bump();
        self.parse_chunk(rel_path, clean_text, line_idx, corpus, out)?;
        self.pop_scope();
        self.expect_kw("end")?;
        Ok(())
    }

    fn parse_expr_list(
        &mut self,
        rel_path: &str,
        clean_text: &str,
        line_idx: &LineIndex,
        corpus: &CorpusIndex,
        out: &mut LuaFileSummary,
    ) -> Result<Vec<Option<String>>, (usize, String)> {
        let mut res = Vec::new();
        res.push(self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?);
        while matches!(self.cur().kind, TokKind::Comma) {
            self.bump();
            res.push(self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?);
        }
        Ok(res)
    }

    fn parse_expr(
        &mut self,
        rel_path: &str,
        clean_text: &str,
        line_idx: &LineIndex,
        corpus: &CorpusIndex,
        out: &mut LuaFileSummary,
    ) -> Result<Option<String>, (usize, String)> {
        while matches!(&self.cur().kind, TokKind::Keyword(k) if k == "not")
            || matches!(&self.cur().kind, TokKind::Op(op) if op == "-" || op == "#")
        {
            self.bump();
        }
        let lit = self.parse_simple_expr(rel_path, clean_text, line_idx, corpus, out)?;
        let mut is_compound = false;
        while self.peek_binop().is_some() {
            is_compound = true;
            self.bump();
            while matches!(&self.cur().kind, TokKind::Keyword(k) if k == "not")
                || matches!(&self.cur().kind, TokKind::Op(o) if o == "-" || o == "#")
            {
                self.bump();
            }
            let _rhs = self.parse_simple_expr(rel_path, clean_text, line_idx, corpus, out)?;
        }
        Ok(if is_compound { None } else { lit })
    }

    fn peek_binop(&self) -> Option<&str> {
        match &self.cur().kind {
            TokKind::Op(s) => Some(s.as_str()),
            TokKind::DotDot => Some(".."),
            TokKind::Keyword(k) if k == "and" || k == "or" => Some(k.as_str()),
            _ => None,
        }
    }

    fn parse_simple_expr(
        &mut self,
        rel_path: &str,
        clean_text: &str,
        line_idx: &LineIndex,
        corpus: &CorpusIndex,
        out: &mut LuaFileSummary,
    ) -> Result<Option<String>, (usize, String)> {
        match &self.cur().kind.clone() {
            TokKind::Num => {
                let txt = &clean_text[self.cur().byte_start..];
                let num_prefix: String = txt
                    .chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect();
                self.bump();
                Ok(if num_prefix.is_empty() {
                    None
                } else {
                    Some(num_prefix)
                })
            }
            TokKind::Str(s) => {
                self.bump();
                Ok(Some(s.clone()))
            }
            TokKind::Vararg
            | TokKind::Keyword(_) => {
                if self.at_kw("function") {
                    self.bump();
                    self.parse_func_body(rel_path, clean_text, line_idx, corpus, out)?;
                } else if self.at_kw("nil") || self.at_kw("true") || self.at_kw("false") {
                    self.bump();
                } else {
                    self.bump();
                }
                Ok(None)
            }
            TokKind::LBrace => {
                self.parse_table_ctor(rel_path, clean_text, line_idx, corpus, out)?;
                Ok(None)
            }
            _ => {
                self.parse_suffixed_expr(rel_path, clean_text, line_idx, corpus, out)?;
                Ok(None)
            }
        }
    }

    fn parse_suffixed_expr(
        &mut self,
        rel_path: &str,
        clean_text: &str,
        line_idx: &LineIndex,
        corpus: &CorpusIndex,
        out: &mut LuaFileSummary,
    ) -> Result<(), (usize, String)> {
        let mut root_ident: Option<String> = None;
        let mut is_bare_global_call = false;
        let call_start = self.cur().byte_start;

        if matches!(self.cur().kind, TokKind::LParen) {
            self.bump();
            self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
            if !matches!(self.cur().kind, TokKind::RParen) {
                return Err((self.cur().byte_start, "Expected ')' closing grouped expression.".into()));
            }
            self.bump();
        } else if let TokKind::Ident(id) = self.cur().kind.clone() {
            is_bare_global_call = !self.is_shadowed(&id);
            root_ident = Some(id);
            self.bump();
        } else {
            return Err((self.cur().byte_start, "Unexpected token in expression.".into()));
        }

        loop {
            match &self.cur().kind {
                TokKind::Dot => {
                    is_bare_global_call = false;
                    self.bump();
                    if !matches!(self.cur().kind, TokKind::Ident(_)) {
                        return Err((self.cur().byte_start, "Expected field name after '.'.".into()));
                    }
                    self.bump();
                }
                TokKind::LBracket => {
                    is_bare_global_call = false;
                    self.bump();
                    self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
                    if !matches!(self.cur().kind, TokKind::RBracket) {
                        return Err((self.cur().byte_start, "Expected ']'.".into()));
                    }
                    self.bump();
                }
                TokKind::Colon => {
                    is_bare_global_call = false;
                    self.bump();
                    if !matches!(self.cur().kind, TokKind::Ident(_)) {
                        return Err((self.cur().byte_start, "Expected method name after ':'.".into()));
                    }
                    self.bump();
                    self.parse_call_args(None, call_start, rel_path, clean_text, line_idx, corpus, out)?;
                }
                TokKind::LParen | TokKind::LBrace | TokKind::Str(_) => {
                    let callee = if is_bare_global_call {
                        root_ident.as_deref()
                    } else {
                        None
                    };
                    self.parse_call_args(callee, call_start, rel_path, clean_text, line_idx, corpus, out)?;
                    is_bare_global_call = false;
                }
                _ => break,
            }
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn parse_call_args(
        &mut self,
        bare_callee: Option<&str>,
        call_start: usize,
        rel_path: &str,
        clean_text: &str,
        line_idx: &LineIndex,
        corpus: &CorpusIndex,
        out: &mut LuaFileSummary,
    ) -> Result<(), (usize, String)> {
        let mut args = Vec::new();
        match &self.cur().kind.clone() {
            TokKind::LParen => {
                self.bump();
                if !matches!(self.cur().kind, TokKind::RParen) {
                    args = self.parse_expr_list(rel_path, clean_text, line_idx, corpus, out)?;
                }
                if !matches!(self.cur().kind, TokKind::RParen) {
                    return Err((self.cur().byte_start, "Expected ')' after call arguments.".into()));
                }
                self.bump();
            }
            TokKind::LBrace => {
                self.parse_table_ctor(rel_path, clean_text, line_idx, corpus, out)?;
            }
            TokKind::Str(s) => {
                args.push(Some(s.clone()));
                self.bump();
            }
            _ => {
                return Err((self.cur().byte_start, "Expected function call arguments.".into()));
            }
        }

        if let Some(callee) = bare_callee {
            let (line, col) = line_idx.pos_clean(clean_text, call_start);
            match callee {
                "RegisterEvent" => {
                    if let Some(Some(ev)) = args.first() {
                        if !ev.is_empty() {
                            out.registered_events.push((
                                ev.clone(),
                                rel_path.to_string(),
                                line,
                                col,
                            ));
                        }
                    }
                }
                "ReadText" => {
                    if let (Some(Some(p)), Some(Some(id))) = (args.first(), args.get(1)) {
                        if p.chars().all(|c| c.is_ascii_digit())
                            && id.chars().all(|c| c.is_ascii_digit())
                        {
                            out.text_refs.push(TextRefHit {
                                page: p.clone(),
                                id: id.clone(),
                                file_path: rel_path.to_string(),
                                line,
                                column: col,
                            });
                        }
                    }
                }
                "GetFactionData" if !corpus.factions.is_empty() => {
                    if let Some(Some(fid)) = args.first() {
                        if !corpus.factions.contains(&fid.to_ascii_lowercase()) {
                            out.diagnostics.push(Diagnostic {
                                severity: Severity::Warning,
                                code: "reference.unknown_faction".to_string(),
                                category: "reference".to_string(),
                                message: format!("Unknown faction '{fid}' passed to GetFactionData."),
                                file_path: Some(rel_path.to_string()),
                                line: Some(line),
                                column: Some(col),
                                source_ref: Some(fid.clone()),
                                suggestions: Vec::new(),
                            });
                        }
                    }
                }
                "GetWareData" if !corpus.wares.is_empty() => {
                    if let Some(Some(wid)) = args.first() {
                        if !corpus.wares.contains(&wid.to_ascii_lowercase()) {
                            out.diagnostics.push(Diagnostic {
                                severity: Severity::Warning,
                                code: "reference.unknown_ware".to_string(),
                                category: "reference".to_string(),
                                message: format!("Unknown ware '{wid}' passed to GetWareData."),
                                file_path: Some(rel_path.to_string()),
                                line: Some(line),
                                column: Some(col),
                                source_ref: Some(wid.clone()),
                                suggestions: Vec::new(),
                            });
                        }
                    }
                }
                "GetMacroData" if !corpus.macros.is_empty() => {
                    if let Some(Some(mid)) = args.first() {
                        if !corpus.macros.contains(&mid.to_ascii_lowercase()) {
                            out.diagnostics.push(Diagnostic {
                                severity: Severity::Warning,
                                code: "reference.unknown_macro".to_string(),
                                category: "reference".to_string(),
                                message: format!("Unknown macro '{mid}' passed to GetMacroData."),
                                file_path: Some(rel_path.to_string()),
                                line: Some(line),
                                column: Some(col),
                                source_ref: Some(mid.clone()),
                                suggestions: Vec::new(),
                            });
                        }
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }

    fn parse_table_ctor(
        &mut self,
        rel_path: &str,
        clean_text: &str,
        line_idx: &LineIndex,
        corpus: &CorpusIndex,
        out: &mut LuaFileSummary,
    ) -> Result<(), (usize, String)> {
        self.bump(); // skip {
        while !matches!(self.cur().kind, TokKind::RBrace) {
            if matches!(self.cur().kind, TokKind::Eof) {
                return Err((self.cur().byte_start, "Unterminated table constructor '{'.".into()));
            }
            if matches!(self.cur().kind, TokKind::LBracket) {
                self.bump();
                self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
                if !matches!(self.cur().kind, TokKind::RBracket) {
                    return Err((self.cur().byte_start, "Expected ']' in table key.".into()));
                }
                self.bump();
                if !matches!(self.cur().kind, TokKind::Eq) {
                    return Err((self.cur().byte_start, "Expected '=' after table key.".into()));
                }
                self.bump();
                self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
            } else if matches!(self.cur().kind, TokKind::Ident(_))
                && self
                    .toks
                    .get(self.i + 1)
                    .is_some_and(|t| matches!(t.kind, TokKind::Eq))
            {
                self.bump();
                self.bump();
                self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
            } else {
                self.parse_expr(rel_path, clean_text, line_idx, corpus, out)?;
            }

            if matches!(self.cur().kind, TokKind::Comma | TokKind::Semi) {
                self.bump();
            } else {
                break;
            }
        }
        if !matches!(self.cur().kind, TokKind::RBrace) {
            return Err((self.cur().byte_start, "Expected '}' closing table constructor.".into()));
        }
        self.bump();
        Ok(())
    }
}

pub fn analyze_lua_file(
    rel_path: &str,
    raw_text: &str,
    corpus: &CorpusIndex,
) -> LuaFileSummary {
    let mut out = LuaFileSummary::default();
    let line_idx = LineIndex::new(raw_text);
    let clean = line_idx.strip_bom(raw_text);

    let tokens = match Lexer::new(clean).tokenize_all() {
        Ok(t) => t,
        Err((off, msg)) => {
            let (line, col) = line_idx.pos_clean(clean, off);
            out.diagnostics.push(Diagnostic {
                severity: Severity::Error,
                code: "lua.syntax_error".to_string(),
                category: "lua".to_string(),
                message: msg,
                file_path: Some(rel_path.to_string()),
                line: Some(line),
                column: Some(col),
                source_ref: None,
                suggestions: Vec::new(),
            });
            return out;
        }
    };

    let mut parser = Parser::new(&tokens);
    if let Err((off, msg)) = parser.parse_chunk(rel_path, clean, &line_idx, corpus, &mut out) {
        let (line, col) = line_idx.pos_clean(clean, off);
        out.diagnostics.push(Diagnostic {
            severity: Severity::Error,
            code: "lua.syntax_error".to_string(),
            category: "lua".to_string(),
            message: msg,
            file_path: Some(rel_path.to_string()),
            line: Some(line),
            column: Some(col),
            source_ref: None,
            suggestions: Vec::new(),
        });
    } else if !matches!(parser.cur().kind, TokKind::Eof) {
        let (line, col) = line_idx.pos_clean(clean, parser.cur().byte_start);
        out.diagnostics.push(Diagnostic {
            severity: Severity::Error,
            code: "lua.syntax_error".to_string(),
            category: "lua".to_string(),
            message: "Unexpected trailing block keyword before end of file.".to_string(),
            file_path: Some(rel_path.to_string()),
            line: Some(line),
            column: Some(col),
            source_ref: None,
            suggestions: Vec::new(),
        });
    }

    out
}

pub fn cross_check_md_lua(
    raises: &[(String, String, u32, u32)],
    registers: &[(String, String, u32, u32)],
    out: &mut Vec<Diagnostic>,
) {
    let mut reg_names: HashSet<String> = HashSet::new();
    for (ev, ..) in registers {
        reg_names.insert(ev.clone());
    }
    let mut raised_names: HashSet<String> = HashSet::new();
    for (ev, ..) in raises {
        raised_names.insert(ev.clone());
    }

    for (ev, file, line, col) in raises {
        if !reg_names.contains(ev) {
            out.push(Diagnostic {
                severity: Severity::Warning,
                code: "md_lua.missing_register".to_string(),
                category: "cross_file".to_string(),
                message: format!(
                    "MD raises Lua event '{ev}' but no Lua file in this mod calls RegisterEvent(\"{ev}\", ...)."
                ),
                file_path: Some(file.clone()),
                line: Some(*line),
                column: Some(*col),
                source_ref: Some(ev.clone()),
                suggestions: Vec::new(),
            });
        }
    }

    // Standard X4 game/core engine events that Lua registers without an MD <raise_lua_event>
    const ENGINE_EVENTS: &[&str] = &[
        "cArch_deployAtCursor",
        "gameStarted",
        "updateMenu",
        "reload",
        "openMenu",
        "closeMenu",
    ];
    if !raises.is_empty() || !registers.is_empty() {
        for (ev, file, line, col) in registers {
            let looks_engine = ENGINE_EVENTS.contains(&ev.as_str())
                || ev.starts_with("cArch_")
                || ev.starts_with("ui.");
            if !looks_engine && !raised_names.contains(ev) {
                out.push(Diagnostic {
                    severity: Severity::Warning,
                    code: "lua_md.missing_listener".to_string(),
                    category: "cross_file".to_string(),
                    message: format!(
                        "Lua calls RegisterEvent(\"{ev}\", ...) without a matching MD <raise_lua_event name=\"{ev}\"/> in this mod."
                    ),
                    file_path: Some(file.clone()),
                    line: Some(*line),
                    column: Some(*col),
                    source_ref: Some(ev.clone()),
                    suggestions: Vec::new(),
                });
            }
        }
    }
}
