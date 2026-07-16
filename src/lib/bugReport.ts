/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * B52 — Bug reporter engine. Builds a PREFILLED GitHub new-issue URL + markdown body from a
 * user's report and an auto-gathered environment context. Deliberately secret-free by
 * construction: the app never calls GitHub — the user's browser opens the URL and THEY submit
 * under their own account (Ken's decision: bugs land in the repo's Issues tab). Clipboard copy
 * of the full markdown is the universal fallback.
 *
 * House pattern: pure function of its inputs (no DOM, no fetch, no wall-clock) + a selftest
 * oracle registered in server.ts SELFTESTS.
 */

/** Where reports land (Ken, 2026-07-16): the public repo's Issues tab. */
export const BUG_TRACKER_REPO = 'KennyG1990/X4_Forge';
export const BUG_TRACKER_NEW_ISSUE = `https://github.com/${BUG_TRACKER_REPO}/issues/new`;

/** GitHub rejects very long URLs; stay comfortably under the ~8k practical cap. */
const MAX_URL_LENGTH = 7500;

export interface BugReportInput {
  title: string;
  /** What happened / steps to reproduce (user-typed, free text). */
  description: string;
  /** Auto-gathered environment key→value pairs; rendered as a table when included. */
  context?: Record<string, string>;
  includeContext?: boolean;
}

export interface BuiltBugReport {
  ok: boolean;
  error?: string;
  /** Prefilled GitHub new-issue URL (labels=bug, title, body). */
  issueUrl?: string;
  /** Full markdown body (NOT truncated) — what "Copy report" puts on the clipboard. */
  body?: string;
  /** True when the URL's body had to be shortened to fit; the clipboard copy stays complete. */
  truncated?: boolean;
}

/**
 * Strip anything secret-shaped from a value before it can ride along in a public issue:
 * agent keys (x4fk_…), 64-hex session tokens, and bearer fragments.
 */
export function redactSecrets(value: string): string {
  return value
    .replace(/x4fk_[0-9a-f]{16,}/gi, '[redacted]')
    .replace(/\b[0-9a-f]{64}\b/gi, '[redacted]')
    .replace(/bearer\s+[a-z0-9._-]{8,}/gi, 'Bearer [redacted]');
}

export function buildBugReport(input: BugReportInput): BuiltBugReport {
  const title = (input.title || '').trim();
  if (!title) return { ok: false, error: 'A short title is required.' };

  const description = redactSecrets((input.description || '').trim() || '_No description provided._');

  const sections: string[] = [description];
  if (input.includeContext !== false && input.context && Object.keys(input.context).length) {
    const rows = Object.entries(input.context)
      .map(([k, v]) => `| ${k} | ${redactSecrets(String(v)).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')} |`)
      .join('\n');
    sections.push(`### Environment\n\n| | |\n|---|---|\n${rows}`);
  }
  sections.push('_Reported from X4 Forge Studio._');
  const body = sections.join('\n\n');

  const urlFor = (b: string) =>
    `${BUG_TRACKER_NEW_ISSUE}?labels=bug&title=${encodeURIComponent(redactSecrets(title))}&body=${encodeURIComponent(b)}`;

  let issueUrl = urlFor(body);
  let truncated = false;
  if (issueUrl.length > MAX_URL_LENGTH) {
    truncated = true;
    // Binary-shrink the body until the URL fits; the FULL body still ships via clipboard.
    let keep = body.length;
    while (issueUrl.length > MAX_URL_LENGTH && keep > 200) {
      keep = Math.floor(keep * 0.8);
      issueUrl = urlFor(`${body.slice(0, keep)}\n\n…_(report truncated to fit the URL — the full text was copied to the clipboard; please paste it here)_`);
    }
  }

  return { ok: true, issueUrl, body, truncated };
}

// ---------------------------------------------------------------------------
// Oracle
// ---------------------------------------------------------------------------

export function runBugReportSelftest(): { pass: boolean; checks: Array<{ name: string; pass: boolean; detail?: string }> } {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  const ctx = { 'App version': '1.0.215', Platform: 'Win32', Workspace: 'My_Mod (4 nodes / 3 links)' };
  const r = buildBugReport({ title: 'Canvas & nodes "break"', description: 'Steps:\n1. do thing\n2. boom', context: ctx });
  ok('happy path ok', r.ok === true && !!r.issueUrl && !!r.body);
  ok('targets the agreed repo new-issue page', (r.issueUrl || '').startsWith(`${BUG_TRACKER_NEW_ISSUE}?labels=bug&`));
  ok('title url-encoded', (r.issueUrl || '').includes(encodeURIComponent('Canvas & nodes "break"')));
  ok('body carries the environment table', (r.body || '').includes('### Environment') && (r.body || '').includes('| App version | 1.0.215 |'));
  ok('body carries the user description', (r.body || '').includes('1. do thing'));

  const noTitle = buildBugReport({ title: '   ', description: 'x' });
  ok('empty title rejected', noTitle.ok === false && !!noTitle.error);

  const secret = buildBugReport({
    title: 'leak test',
    description: 'my key is x4fk_0123456789abcdef0123456789abcdef and token ' + 'a'.repeat(64) + ' plus Bearer abcdefghijklmnop',
    context: { Token: 'x4fk_ffffffffffffffffffffffffffffffff' },
  });
  ok('secrets redacted from description and context',
    !(secret.body || '').includes('x4fk_0123') && !(secret.body || '').includes('a'.repeat(64))
    && !(secret.body || '').includes('abcdefghijklmnop') && !(secret.body || '').includes('x4fk_ffff')
    && ((secret.body || '').match(/\[redacted\]/g) || []).length >= 3);

  const big = buildBugReport({ title: 't', description: 'x'.repeat(20000), context: ctx });
  ok('oversized report truncates URL but keeps full body', big.ok === true && big.truncated === true
    && (big.issueUrl || '').length <= 7500 && (big.body || '').length >= 20000,
    `url=${(big.issueUrl || '').length} body=${(big.body || '').length}`);
  ok('truncated URL still parses + carries the truncation note',
    decodeURIComponent((big.issueUrl || '').split('&body=')[1] || '').includes('report truncated'));

  const noCtx = buildBugReport({ title: 't', description: 'd', context: ctx, includeContext: false });
  ok('context omitted when user opts out', !(noCtx.body || '').includes('### Environment'));

  return { pass: checks.every(c => c.pass), checks };
}
