/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tiny shared XML/path utilities (audit round 2, R2 — 2026-07-09). These lived as
 * identical private copies in multiple lib modules; one definition, many consumers.
 */

/** Normalize an extension-relative path: forward slashes, no leading slash, trimmed. */
export function normPath(path: string): string {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

/** Minimal element view over @xmldom/xmldom nodes (keeps consumers decoupled from DOM lib types). */
export interface ElementLike {
  nodeType: number;
  nodeName: string;
  getAttribute(name: string): string | null;
  getElementsByTagName(name: string): ArrayLike<ElementLike>;
  childNodes: ArrayLike<ElementLike>;
  toString(): string;
}

/** Direct element children, optionally filtered by tag name. */
export function directElementChildren(el: ElementLike, name?: string): ElementLike[] {
  const out: ElementLike[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const kid = el.childNodes[i];
    if (kid.nodeType === 1 && (!name || kid.nodeName === name)) out.push(kid);
  }
  return out;
}

import { DOMParser } from '@xmldom/xmldom';

/**
 * Lenient parse (BACKLOG B6, 2026-07-09): parse an XML DOCUMENT or FRAGMENT into a real
 * DOM so scanners see structure — comments and CDATA are structurally invisible instead
 * of regex-visible (the class that indexed a doc-comment's `ref="…"` as a live cue ref).
 * Fragments (multiple top-level elements, e.g. custom_xml rawXml blobs) are wrapped.
 * Returns null on hard failure — callers degrade to their regex fallback, so malformed
 * input can never LOSE information relative to the old scanners.
 */
export function parseXmlLenient(xml: string): ElementLike | null {
  const text = String(xml || '').trim();
  if (!text) return null;
  const attempt = (s: string): ElementLike | null => {
    try {
      let hadFatal = false;
      const doc = new DOMParser({
        onError: (level: string) => { if (level === 'fatalError') hadFatal = true; },
      } as never).parseFromString(s, 'text/xml') as unknown as { documentElement: ElementLike | null };
      return hadFatal ? null : (doc?.documentElement ?? null);
    } catch {
      return null;
    }
  };
  // whole document first (declaration allowed), then fragment-wrapped
  return attempt(text) ?? attempt(`<__frag__>${text.replace(/^<\?xml[^>]*\?>/i, '')}</__frag__>`);
}

/** Depth-first walk over ELEMENT nodes (comments/CDATA/text skipped by construction). */
export function walkElements(root: ElementLike, visit: (el: ElementLike) => void): void {
  visit(root);
  for (const kid of directElementChildren(root)) walkElements(kid, visit);
}
