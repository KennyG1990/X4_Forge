/** Quote-aware lexical spans for X4 XML documents and incomplete editor buffers. */
export const MAX_PROJECT_XML_DEPTH = 256;

function tagBoundary(xml: string, start: number, recoverMalformedTags = false): number {
  let quote = '';
  for (let i = start + 1; i < xml.length; i++) {
    const ch = xml[i];
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>' || (recoverMalformedTags && ch === '<')) return i;
  }
  return xml.length;
}

function opaqueMarkupEnd(xml: string, start: number): number | undefined {
  let end: number;
  let width: number;
  if (xml.startsWith('<!--', start)) {
    end = xml.indexOf('-->', start + 4);
    width = 3;
  } else if (xml.startsWith('<![CDATA[', start)) {
    end = xml.indexOf(']]>', start + 9);
    width = 3;
  } else if (xml.startsWith('<?', start)) {
    end = xml.indexOf('?>', start + 2);
    width = 2;
  } else return undefined;
  return end < 0 ? xml.length : end + width;
}

function* scanXmlMarkup(xml: string, kind: 'tag' | 'opaque', recoverMalformedTags = false) {
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf('<', cursor);
    if (start < 0) break;
    const opaqueEnd = opaqueMarkupEnd(xml, start);
    if (opaqueEnd !== undefined) {
      if (kind === 'opaque') yield { start, end: opaqueEnd, token: '', complete: true };
      cursor = opaqueEnd;
      continue;
    }
    if (xml.startsWith('<!', start)) {
      // A DOCTYPE internal subset may contain its own comments or instructions.
      const boundary = tagBoundary(xml, start, kind === 'opaque');
      cursor = xml[boundary] === '<' ? boundary : Math.min(boundary + 1, xml.length);
      continue;
    }
    const boundary = tagBoundary(xml, start, recoverMalformedTags);
    if (xml[boundary] === '<') {
      cursor = boundary;
      continue;
    }
    const complete = boundary < xml.length;
    const end = complete ? boundary + 1 : boundary;
    if (kind === 'tag') yield { start, end, token: xml.slice(start, end), complete };
    cursor = end;
  }
}

/** Read element tag tokens in source order, even in a partial XML document. */
export function scanXmlTagTokens(xml: string, options: { recoverMalformedTags?: boolean } = {}) {
  return scanXmlMarkup(xml, 'tag', options.recoverMalformedTags);
}

/** Blank comments, CDATA and processing instructions at their original source width. */
export function maskXmlOpaqueMarkup(xml: string): string {
  if (!/<(?:!--|!\[CDATA\[|\?)/.test(xml)) return xml;
  let cursor = 0;
  let masked = '';
  for (const { start, end } of scanXmlMarkup(xml, 'opaque', true)) {
    masked += xml.slice(cursor, start) + xml.slice(start, end).replace(/[^\r\n]/g, ' ');
    cursor = end;
  }
  return masked + xml.slice(cursor);
}
