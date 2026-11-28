/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure deterministic Markdown & syntax-highlighting tokenizers for Docs & Pattern Library.
 * Zero React/DOM/Node imports so browser components and CLI selftests share one engine.
 */

export type InlineToken =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'strong'; readonly children: InlineToken[] }
  | { readonly kind: 'em'; readonly text: string };

export type MarkdownBlock =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'ul'; readonly items: string[] }
  | { readonly kind: 'ol'; readonly items: string[] };

export type CodeTokenKind = 'comment' | 'tag' | 'attr' | 'string' | 'keyword' | 'number' | 'placeholder' | 'text';

export interface CodeToken {
  readonly kind: CodeTokenKind;
  readonly text: string;
}

const HEADING_RE = /^#{1,4}\s+(.*)$/;
const UL_ITEM_RE = /^[-*]\s+(.*)$/;
const OL_ITEM_RE = /^\d+\.\s+(.*)$/;

/** Parse multi-line guide markdown into headings, lists (preserving internal hyphens), and paragraphs. */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const input = String(markdown || '');
  if (!input.trim()) return [];
  const lines = input.split(/\r\n?|\n/);
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }

    const headingMatch = HEADING_RE.exec(trimmed);
    if (headingMatch) {
      blocks.push({ kind: 'heading', text: headingMatch[1].trim() });
      i++;
      continue;
    }

    if (UL_ITEM_RE.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        const itemMatch = UL_ITEM_RE.exec(cur);
        if (!itemMatch) break;
        items.push(itemMatch[1].trim());
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    if (OL_ITEM_RE.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        const itemMatch = OL_ITEM_RE.exec(cur);
        if (!itemMatch) break;
        items.push(itemMatch[1].trim());
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (!cur || HEADING_RE.test(cur) || UL_ITEM_RE.test(cur) || OL_ITEM_RE.test(cur)) break;
      paraLines.push(cur);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ kind: 'paragraph', text: paraLines.join(' ') });
    }
  }

  return blocks;
}

/** Parse inline `` `code` ``, `**bold**` (with nested inline code), and `*italic*` without throwing on unclosed delimiters. */
export function parseInlineMarkdown(text: string): InlineToken[] {
  const input = String(text || '');
  if (!input) return [];
  const tokens: InlineToken[] = [];
  let i = 0;
  let plainStart = 0;

  const flushPlain = (end: number) => {
    if (end > plainStart) {
      tokens.push({ kind: 'text', text: input.slice(plainStart, end) });
    }
  };

  while (i < input.length) {
    if (input[i] === '`') {
      const close = input.indexOf('`', i + 1);
      if (close > i + 1) {
        flushPlain(i);
        tokens.push({ kind: 'code', text: input.slice(i + 1, close) });
        i = close + 1;
        plainStart = i;
        continue;
      }
    }

    if (input.startsWith('**', i)) {
      const close = input.indexOf('**', i + 2);
      if (close > i + 2) {
        flushPlain(i);
        const inner = input.slice(i + 2, close);
        tokens.push({ kind: 'strong', children: parseInlineCodeOnly(inner) });
        i = close + 2;
        plainStart = i;
        continue;
      }
    }

    if (input[i] === '*' && !input.startsWith('**', i)) {
      const next = input[i + 1];
      if (next && !/\s/.test(next)) {
        const close = findSingleAsteriskClose(input, i + 1);
        if (close > i + 1) {
          flushPlain(i);
          tokens.push({ kind: 'em', text: input.slice(i + 1, close) });
          i = close + 1;
          plainStart = i;
          continue;
        }
      }
    }

    i++;
  }

  flushPlain(input.length);
  return tokens;
}

function findSingleAsteriskClose(input: string, from: number): number {
  for (let idx = from; idx < input.length; idx++) {
    const ch = input[idx];
    if (ch === '\n' || ch === '\r') return -1;
    if (ch === '*') {
      if (idx > from && !/\s/.test(input[idx - 1]) && input[idx + 1] !== '*') {
        return idx;
      }
      return -1;
    }
  }
  return -1;
}

function parseInlineCodeOnly(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  let plainStart = 0;
  while (i < text.length) {
    if (text[i] === '`') {
      const close = text.indexOf('`', i + 1);
      if (close > i + 1) {
        if (i > plainStart) tokens.push({ kind: 'text', text: text.slice(plainStart, i) });
        tokens.push({ kind: 'code', text: text.slice(i + 1, close) });
        i = close + 1;
        plainStart = i;
        continue;
      }
    }
    i++;
  }
  if (plainStart < text.length) {
    tokens.push({ kind: 'text', text: text.slice(plainStart) });
  }
  return tokens;
}

const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then',
  'true', 'until', 'while',
]);

/** Exact character-preserving syntax tokenizer for XML and Lua code snippets. */
export function tokenizeCode(code: string, lang: 'xml' | 'lua'): CodeToken[] {
  const src = String(code || '');
  if (!src) return [];
  return lang === 'lua' ? tokenizeLua(src) : tokenizeXml(src);
}

function pushToken(out: CodeToken[], kind: CodeTokenKind, text: string) {
  if (!text) return;
  const prev = out[out.length - 1];
  if (prev && prev.kind === kind) {
    out[out.length - 1] = { kind, text: prev.text + text };
  } else {
    out.push({ kind, text });
  }
}

function tokenizeXml(src: string): CodeToken[] {
  const out: CodeToken[] = [];
  let i = 0;

  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      const next = end === -1 ? src.length : end + 3;
      pushToken(out, 'comment', src.slice(i, next));
      i = next;
      continue;
    }

    if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i + 2);
      const next = end === -1 ? src.length : end + 2;
      pushToken(out, 'comment', src.slice(i, next));
      i = next;
      continue;
    }

    if (src[i] === '<') {
      const openEnd = src.startsWith('</', i) ? i + 2 : i + 1;
      let nameEnd = openEnd;
      while (nameEnd < src.length && /[A-Za-z0-9_.:-]/.test(src[nameEnd])) {
        nameEnd++;
      }
      if (nameEnd > openEnd) {
        pushToken(out, 'tag', src.slice(i, nameEnd));
        i = nameEnd;
        while (i < src.length) {
          const ch = src[i];
          if (ch === '>') {
            pushToken(out, 'tag', '>');
            i++;
            break;
          }
          if (src.startsWith('/>', i)) {
            pushToken(out, 'tag', '/>');
            i += 2;
            break;
          }
          if (/\s/.test(ch)) {
            let wsEnd = i + 1;
            while (wsEnd < src.length && /\s/.test(src[wsEnd])) wsEnd++;
            pushToken(out, 'text', src.slice(i, wsEnd));
            i = wsEnd;
            continue;
          }
          if (ch === '"' || ch === "'") {
            let strEnd = i + 1;
            while (strEnd < src.length && src[strEnd] !== ch) strEnd++;
            if (strEnd < src.length) strEnd++;
            pushToken(out, 'string', src.slice(i, strEnd));
            i = strEnd;
            continue;
          }
          if (ch === '=') {
            pushToken(out, 'text', '=');
            i++;
            continue;
          }
          if (/[^\s=/>"']/.test(ch)) {
            let attrEnd = i + 1;
            while (attrEnd < src.length && /[^\s=/>"']/.test(src[attrEnd])) attrEnd++;
            pushToken(out, 'attr', src.slice(i, attrEnd));
            i = attrEnd;
            continue;
          }
          pushToken(out, 'text', ch);
          i++;
        }
        continue;
      }
      pushToken(out, 'text', '<');
      i++;
      continue;
    }

    // Check if an embedded Lua comment/mixed guide line inside mixed XML+Lua block appears.
    const nextLt = src.indexOf('<', i);
    const next = nextLt === -1 ? src.length : nextLt;
    pushToken(out, 'text', src.slice(i, next));
    i = next;
  }

  return out;
}

function tokenizeLua(src: string): CodeToken[] {
  const out: CodeToken[] = [];
  let i = 0;

  while (i < src.length) {
    if (src.startsWith('--', i)) {
      const nl = src.indexOf('\n', i + 2);
      const next = nl === -1 ? src.length : nl;
      pushToken(out, 'comment', src.slice(i, next));
      i = next;
      continue;
    }

    const ch = src[i];
    if (ch === '"' || ch === "'") {
      let end = i + 1;
      while (end < src.length) {
        if (src[end] === '\\' && end + 1 < src.length) {
          end += 2;
          continue;
        }
        if (src[end] === ch) {
          end++;
          break;
        }
        if (src[end] === '\n' || src[end] === '\r') break;
        end++;
      }
      const lit = src.slice(i, end);
      const phRe = /<[A-Z][A-Z0-9_]*>/g;
      let cursor = 0;
      let phMatch: RegExpExecArray | null;
      while ((phMatch = phRe.exec(lit)) !== null) {
        if (phMatch.index > cursor) pushToken(out, 'string', lit.slice(cursor, phMatch.index));
        pushToken(out, 'placeholder', phMatch[0]);
        cursor = phMatch.index + phMatch[0].length;
      }
      if (cursor < lit.length) pushToken(out, 'string', lit.slice(cursor));
      i = end;
      continue;
    }

    if (ch === '<') {
      const ph = /^<[A-Z][A-Z0-9_]*>/.exec(src.slice(i));
      if (ph) {
        pushToken(out, 'placeholder', ph[0]);
        i += ph[0].length;
        continue;
      }
    }

    if (/[A-Za-z_]/.test(ch)) {
      let idEnd = i + 1;
      while (idEnd < src.length && /[A-Za-z0-9_]/.test(src[idEnd])) idEnd++;
      const word = src.slice(i, idEnd);
      pushToken(out, LUA_KEYWORDS.has(word) ? 'keyword' : 'text', word);
      i = idEnd;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let numEnd = i + 1;
      while (numEnd < src.length && /[0-9.]/.test(src[numEnd])) numEnd++;
      pushToken(out, 'number', src.slice(i, numEnd));
      i = numEnd;
      continue;
    }

    let plainEnd = i + 1;
    while (
      plainEnd < src.length
      && !src.startsWith('--', plainEnd)
      && src[plainEnd] !== '"'
      && src[plainEnd] !== "'"
      && src[plainEnd] !== '<'
      && !/[A-Za-z_0-9]/.test(src[plainEnd])
    ) {
      plainEnd++;
    }
    pushToken(out, 'text', src.slice(i, plainEnd));
    i = plainEnd;
  }

  return out;
}
