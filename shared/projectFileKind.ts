export type ProjectFileKind = 'md' | 'lua' | 'ui' | 'content' | 't' | 'library' | 'aiscript' | 'other';

export function classifyPath(path: string): ProjectFileKind {
  const p = (path || '').replace(/\\/g, '/').toLowerCase();
  if (p === 'content.xml') return 'content';
  if (p === 'ui.xml') return 'ui';
  if (p.endsWith('.lua')) return 'lua';
  if (/(^|\/)md\/.+\.xml$/.test(p)) return 'md';
  if (/(^|\/)aiscripts\/.+\.xml$/.test(p)) return 'aiscript';
  if (/(^|\/)t\/.+\.xml$/.test(p)) return 't';
  if (/(^|\/)(libraries|index|maps|assets)\/.+/.test(p)) return 'library';
  if (/(^|\/)ui\/.+/.test(p)) return 'ui';
  return 'other';
}
