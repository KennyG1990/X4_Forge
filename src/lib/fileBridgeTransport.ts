/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P1 transport remainder — file-bridge polling composite.
 *
 * This does not replace the existing HTTP/JSON contract seam in contractGlue. It
 * covers the narrow offline fallback shape: write a request file, poll on a
 * bounded interval, and keep a whitelist of action ids the bridge may execute.
 */

import { endpointEventNames } from './contractEvents';

export interface FileBridgePollingOptions {
  namespace: string;
  actionId: string;
  directory: string;
  requestFile: string;
  responseFile: string;
  requestPayloadExpr: string;
  pollInterval: string;
  timeout: string;
}

export interface FileBridgeActionWhitelist {
  namespace: string;
  actions: string[];
}

const ID_RE = /^[a-z][a-z0-9_]*$/;
// P7: a safe path SEGMENT must start with an alnum/underscore (no leading dot) and
// contain no ".." sequence, so a directory/file name can never be "..", "...", ".hidden"
// or "a..b" and thus can never escape its intended folder. `/` and `\` are already
// excluded by the charset.
const SAFE_SEGMENT_RE = /^[a-z0-9_][a-z0-9_.-]*$/;
const isUnsafeSegment = (s: string): boolean => !SAFE_SEGMENT_RE.test(s) || s.includes('..');

function escapeXmlAttr(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function x4String(value: string): string {
  return `'${String(value).replace(/'/g, "\\'")}'`;
}

function safeTime(value: string, fallback: string): string {
  const s = String(value || '').trim();
  if (!s) return fallback;
  if (/^\d+(\.\d+)?$/.test(s)) return `${s}s`;
  return s;
}

export function validateFileBridgePollingOptions(options: FileBridgePollingOptions): string[] {
  const errors: string[] = [];
  if (!ID_RE.test(options.namespace || '')) errors.push('namespace must be lowercase snake_case and start with a letter.');
  if (!ID_RE.test(options.actionId || '')) errors.push('actionId must be lowercase snake_case and start with a letter.');
  if (isUnsafeSegment(options.directory || '')) errors.push('directory must be a safe single folder name (no "..", no leading dot).');
  if (isUnsafeSegment(options.requestFile || '')) errors.push('requestFile must be a safe file name (no "..", no leading dot).');
  if (isUnsafeSegment(options.responseFile || '')) errors.push('responseFile must be a safe file name (no "..", no leading dot).');
  if (!String(options.requestPayloadExpr || '').trim()) errors.push('requestPayloadExpr is required.');
  return errors;
}

/**
 * MD action subgraph fragment. Intended for a custom_xml action node or direct
 * contract preview: request write, bounded poll loop, and explicit timeout event.
 */
export function buildFileBridgePollingSubgraph(options: FileBridgePollingOptions): string {
  const errors = validateFileBridgePollingOptions(options);
  if (errors.length) throw new Error(`Invalid file bridge polling options: ${errors.join(' ')}`);

  const ev = endpointEventNames(options.namespace, options.actionId);
  const deadline = `$${options.actionId}_file_bridge_deadline`;
  const poll = safeTime(options.pollInterval, '1s');
  const timeout = safeTime(options.timeout, '10s');
  const payloadExpr = escapeXmlAttr(options.requestPayloadExpr);
  const pollParam = `table[action=${x4String(options.actionId)}, request=${x4String(options.requestFile)}, response=${x4String(options.responseFile)}]`;

  return [
    `<set_value name="${deadline}" exact="player.age + ${escapeXmlAttr(timeout)}" />`,
    `<debug_to_file directory="${escapeXmlAttr(x4String(options.directory))}" name="${escapeXmlAttr(x4String(options.requestFile))}" text="${payloadExpr}" output="false" append="false" />`,
    `<do_while value="player.age lt ${deadline}">`,
    `  <delay exact="${escapeXmlAttr(poll)}" />`,
    `  <raise_lua_event name="${escapeXmlAttr(x4String(`${ev.request}.poll`))}" param="${escapeXmlAttr(pollParam)}" />`,
    `</do_while>`,
    `<raise_lua_event name="${escapeXmlAttr(x4String(`${ev.request}.timeout`))}" param="${escapeXmlAttr(x4String(`timeout waiting for ${options.responseFile}`))}" />`,
  ].join('\n');
}

export function validateActionWhitelist(whitelist: FileBridgeActionWhitelist): string[] {
  const errors: string[] = [];
  if (!ID_RE.test(whitelist.namespace || '')) errors.push('namespace must be lowercase snake_case and start with a letter.');
  const seen = new Set<string>();
  for (const action of whitelist.actions || []) {
    if (!ID_RE.test(action)) errors.push(`invalid action id "${action}".`);
    if (seen.has(action)) errors.push(`duplicate action id "${action}".`);
    seen.add(action);
  }
  if (seen.size === 0) errors.push('at least one whitelisted action is required.');
  return errors;
}

export function buildActionWhitelistLua(whitelist: FileBridgeActionWhitelist): string {
  const errors = validateActionWhitelist(whitelist);
  if (errors.length) throw new Error(`Invalid file bridge action whitelist: ${errors.join(' ')}`);
  const lines = [
    `-- File-bridge action whitelist for ${whitelist.namespace}`,
    `local ALLOWED_ACTIONS = {`,
    ...whitelist.actions.map(action => `  [${JSON.stringify(action)}] = true,`),
    `}`,
    ``,
    `local function isAllowedAction(action)`,
    `  return ALLOWED_ACTIONS[tostring(action or "")] == true`,
    `end`,
  ];
  return lines.join('\n');
}

export function runFileBridgeTransportSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  const opts: FileBridgePollingOptions = {
    namespace: 'myai',
    actionId: 'send_prompt',
    directory: 'x4_forge_bridge',
    requestFile: 'send_prompt_request.json',
    responseFile: 'send_prompt_response.json',
    requestPayloadExpr: `table[action='send_prompt', text=$text, quote='"<&']`,
    pollInterval: '0.5',
    timeout: '12',
  };

  let xml = '';
  let threw = false;
  try { xml = buildFileBridgePollingSubgraph(opts); } catch { threw = true; }
  ok('polling_subgraph_generates', !threw && xml.length > 0);
  ok('writes_request_file', xml.includes('<debug_to_file') && xml.includes(`name="'send_prompt_request.json'"`));
  ok('polls_with_timeout', xml.includes('<do_while value="player.age lt $send_prompt_file_bridge_deadline">') && xml.includes('<delay exact="0.5s" />'));
  ok('emits_timeout_event', xml.includes(`'myai.send_prompt.timeout'`) && xml.includes('timeout waiting for send_prompt_response.json'));
  ok('escapes_payload_xml', xml.includes('&quot;') && xml.includes('&lt;') && xml.includes('&amp;'));
  ok('poll_event_uses_contract_names', xml.includes(`'myai.send_prompt.poll'`) && xml.includes(`action=\\'send_prompt\\'`) === false);

  const bad = validateFileBridgePollingOptions({ ...opts, actionId: '../bad' });
  ok('validator_blocks_unsafe_action', bad.some(e => /actionId/.test(e)), bad);

  // P7: path-traversal segments must be rejected for directory + file names.
  ok('validator_blocks_dotdot_directory',
    validateFileBridgePollingOptions({ ...opts, directory: '..' }).some(e => /directory/.test(e)));
  ok('validator_blocks_traversal_file',
    validateFileBridgePollingOptions({ ...opts, requestFile: 'a..b.json' }).some(e => /requestFile/.test(e)));
  ok('validator_blocks_leading_dot_file',
    validateFileBridgePollingOptions({ ...opts, responseFile: '.secret' }).some(e => /responseFile/.test(e)));
  ok('validator_allows_safe_names',
    validateFileBridgePollingOptions({ ...opts, directory: 'x4_forge_bridge', requestFile: 'req.json', responseFile: 'resp.json' })
      .every(e => !/directory|requestFile|responseFile/.test(e)));

  let lua = '';
  let luaThrew = false;
  try { lua = buildActionWhitelistLua({ namespace: 'myai', actions: ['send_prompt', 'get_status'] }); } catch { luaThrew = true; }
  ok('whitelist_lua_generates', !luaThrew && lua.includes('ALLOWED_ACTIONS'));
  ok('whitelist_contains_only_declared_actions', lua.includes('["send_prompt"] = true') && lua.includes('["get_status"] = true') && !lua.includes('delete_file'));
  ok('whitelist_validator_blocks_duplicates', validateActionWhitelist({ namespace: 'myai', actions: ['a', 'a'] }).some(e => /duplicate/.test(e)));

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
