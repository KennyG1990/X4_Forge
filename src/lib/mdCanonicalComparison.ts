/**
 * Canonical form of an MD document for "was this semantically edited?" comparison. Strips
 * comments, sorts each tag's attributes, and collapses whitespace — so two documents that
 * differ ONLY in comments/formatting/attribute-order canonicalize identically, but ANY change
 * to a tag, attribute name, or attribute VALUE makes them differ. Used to decide whether to
 * re-emit the original bytes verbatim (unedited → true byte-fidelity, comments kept) or the
 * regenerated XML (the graph was actually edited).
 */
const MD_DEFAULT_ATTRS = new Set(['namespace="this"', 'instantiate="false"', 'state="active"']);
export function canonicalMd(xml: string): string {
  return String(xml || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // XML permits a literal `>` inside attributes; serializers commonly normalize it to
    // `&gt;`. They are the same value and must not make a faithful round-trip look different.
    .replace(/&gt;/g, '>')
    .replace(/<([a-zA-Z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g, (_m, tag, attrs, close) => {
      // Drop attributes that equal their X4 default — so a source that OMITS them and a regen
      // that ADDS them (e.g. namespace="this") canonicalize identically, and we keep the
      // byte-perfect original instead of falsely treating the default-add as an edit.
      const pairs = [...String(attrs).matchAll(/([\w.:-]+)\s*=\s*"([^"]*)"/g)]
        .map(p => `${p[1]}="${p[2]}"`).filter(a => !MD_DEFAULT_ATTRS.has(a)).sort();
      return `<${tag}${pairs.length ? ' ' + pairs.join(' ') : ''}${close ? '/' : ''}>`;
    })
    .replace(/>\s+</g, '><')
    .replace(/<([a-zA-Z_][\w.:-]*)([^>]*)><\/\1>/g, '<$1$2/>')
    .replace(/\s+/g, ' ')
    .trim();
}
