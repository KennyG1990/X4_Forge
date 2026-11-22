/** Original XML source positions shared by validation and native editor navigation. */
import type { Node as XmlNode } from '@xmldom/xmldom';

/** Map original UTF-16 source offsets to one-based line and column positions. */
export function createSourcePositionLocator(source: string): (offset: number) => { line: number; column: number } {
  let starts: number[] | undefined;
  return offset => {
    if (!starts) {
      starts = [0];
      for (const newline of source.matchAll(/\r\n?|\n/g)) starts.push(newline.index + newline[0].length);
    }
    let low = 0;
    let high = starts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= offset) low = middle;
      else high = middle;
    }
    return { line: low + 1, column: offset - starts[low] + 1 };
  };
}

/** Map xmldom's normalized XML node locators back to original authored text. */
export function createXmlNodePositionLocator(source: string) {
  const locateRaw = createSourcePositionLocator(source);
  let domLines: number[] | undefined;
  const rawOffset = (node: XmlNode): number | undefined => {
    if (!node.lineNumber || !node.columnNumber) return undefined;
    if (!domLines) {
      const bom = source.startsWith('\uFEFF') ? 1 : 0;
      domLines = [bom];
      const endings = /\r[\n\u0085]?|[\n\u0085\u2028\u2029]/g;
      endings.lastIndex = bom;
      let match: RegExpExecArray | null;
      while ((match = endings.exec(source))) domLines.push(match.index + match[0].length);
    }
    const start = domLines[node.lineNumber - 1];
    if (start === undefined) return undefined;
    const offset = start + node.columnNumber - 1;
    return offset >= start && offset <= source.length ? offset : undefined;
  };
  return { offset: rawOffset, locateRaw, point(node: XmlNode) {
    const offset = rawOffset(node);
    if (offset === undefined) return undefined;
    if (node.nodeType === 1 && !source.startsWith(`<${node.nodeName}`, offset)) return undefined;
    if (node.nodeType === 2) {
      // Attr positions identify the opening quote, not the attribute name.
      // Verify correspondence before claiming the first authored value character.
      if (source[offset] !== '"' && source[offset] !== "'") return undefined;
      let cursor = offset - 1;
      while (cursor >= 0 && /\s/.test(source[cursor])) cursor--;
      if (source[cursor--] !== '=') return undefined;
      while (cursor >= 0 && /\s/.test(source[cursor])) cursor--;
      const start = cursor - node.nodeName.length + 1;
      if (start < 1 || source.slice(start, cursor + 1) !== node.nodeName || !/\s/.test(source[start - 1])) return undefined;
      return locateRaw(offset + 1);
    }
    return locateRaw(offset);
  } };
}

const XML_VALUE_ENTITIES = new Map([
  ['&amp;', '&'], ['&apos;', "'"], ['&quot;', '"'], ['&lt;', '<'], ['&gt;', '>'],
]);

/** Map a raw XML attribute caret back to its decoded UTF-16 offset if the parser agrees. */
export function decodedXmlAttributeCursor(raw: string, value: string, rawCursor: number): number | undefined {
  if (rawCursor < 0 || rawCursor >= raw.length) return undefined;
  if (raw === value) return rawCursor;

  let cursor = rawCursor;
  const decoded = raw.replace(/&(?:#(?:x[\da-fA-F]+|\d+)|amp|apos|quot|lt|gt);|\r[\n\u0085]?|[\t\n\u0085\u2028\u2029]/g,
    (token, offset: number) => {
      let replacement = XML_VALUE_ENTITIES.get(token) ?? ' ';
      if (token.startsWith('&#')) {
        const hex = token.startsWith('&#x');
        const number = Number.parseInt(token.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
        if (number < 1 || number > 0x10ffff) return token;
        replacement = String.fromCodePoint(number);
      }

      if (rawCursor > offset) {
        cursor += rawCursor < offset + token.length ? offset - rawCursor : replacement.length - token.length;
      }
      return replacement;
    });
  return decoded === value ? cursor : undefined;
}
