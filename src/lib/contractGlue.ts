/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lever 2 — external-integration / contract seam.
 *
 * A class of advanced X4 mods talks to an EXTERNAL local process over HTTP, via a
 * Lua HTTP client running inside the game. The studio's job is NOT to author that
 * external process — it owns the X4 side and the *contract* between them. This module
 * models the X4 <-> external HTTP/JSON contract as a first-class, validated artifact
 * and generates the glue Lua that runs inside X4:
 *
 *   MD  --(raise_lua_event "<ns>.<id>")-->  Lua glue  --(async HTTP)-->  external process
 *   MD  <--(AddUITriggeredEvent "<ns>.<id>.response")-- Lua glue  <--(JSON response)--
 *
 * The generated Lua is library-agnostic: the HTTP client is referenced by a
 * configurable expression (e.g. a non-blocking, callback-based client like the
 * community djfhe_http mod, or any other), so the studio never hard-codes a runtime.
 */

export type ContractFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';
export type ContractMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ContractField {
  name: string;
  type: ContractFieldType;
  required?: boolean;
  description?: string;
}

export interface ContractEndpoint {
  /** Stable identifier; used to derive Lua event names. Lowercase + underscores. */
  id: string;
  /**
   * 'http' (default): MD raises an event, the glue Lua calls the external process.
   * 'ui_event' (T4.3): an in-game Lua UI widget calls Glue.<id>(payload); the glue
   * type-guards the payload and forwards it to MD via AddUITriggeredEvent — the
   * SAME contract seam pointed at the widget→cue case (no external process).
   */
  kind?: 'http' | 'ui_event';
  method?: ContractMethod;
  /** Path appended to baseUrl, e.g. "/v1/status". Must start with "/". */
  path?: string;
  description?: string;
  /** JSON request-body fields (for POST/PUT/PATCH). */
  request?: ContractField[];
  /** Expected JSON response fields (documentation + future response validation). */
  response?: ContractField[];
}

export interface IntegrationContract {
  /**
   * Event namespace / mod-facing prefix, e.g. "myai". Lua event names are
   * "<namespace>.<endpoint.id>" (request, MD->Lua) and
   * "<namespace>.<endpoint.id>.response" / ".error" (Lua->MD).
   */
  namespace: string;
  /** Base URL of the external process, e.g. "http://127.0.0.1:8713". */
  baseUrl: string;
  /**
   * Lua expression that resolves to the async HTTP client. Library-agnostic and
   * configurable so the studio never hard-codes a runtime. The client is expected to
   * expose `request({ method, url, body, headers }, function(err, response) ... end)`.
   */
  httpClientExpr?: string;
  /** Lua expression that resolves to a JSON lib exposing `encode`/`decode`. */
  jsonLibExpr?: string;
  endpoints: ContractEndpoint[];
}

export interface ContractFinding {
  severity: 'error' | 'warning';
  endpointId?: string;
  message: string;
}

const ID_RE = /^[a-z][a-z0-9_]*$/;
const NS_RE = /^[a-z][a-z0-9_]*$/;
const METHODS: ContractMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const FIELD_TYPES: ContractFieldType[] = ['string', 'number', 'boolean', 'object', 'array'];

/**
 * Validate a contract so neither end can drift. Returns findings (errors block
 * generation; warnings are advisory). An empty array means the contract is clean.
 */
export function validateContract(contract: IntegrationContract): ContractFinding[] {
  const findings: ContractFinding[] = [];
  if (!contract || typeof contract !== 'object') {
    return [{ severity: 'error', message: 'Contract is missing or not an object.' }];
  }

  if (!contract.namespace || !NS_RE.test(contract.namespace)) {
    findings.push({ severity: 'error', message: `namespace "${contract.namespace ?? ''}" must match ${NS_RE} (lowercase, starts with a letter).` });
  }
  const endpoints = Array.isArray(contract.endpoints) ? contract.endpoints : [];
  // ui_event endpoints live entirely in-game; baseUrl only matters when at
  // least one endpoint actually goes over HTTP (T4.3).
  const hasHttp = endpoints.some(ep => ep && (ep.kind || 'http') === 'http');
  if (hasHttp) {
    if (!contract.baseUrl || !/^https?:\/\/.+/i.test(contract.baseUrl)) {
      findings.push({ severity: 'error', message: `baseUrl "${contract.baseUrl ?? ''}" must be an http(s) URL.` });
    } else if (!/^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:\d+)?/i.test(contract.baseUrl)) {
      findings.push({ severity: 'warning', message: `baseUrl "${contract.baseUrl}" is not a localhost address; external-integration mods normally talk to a *local* process.` });
    }
  }
  if (endpoints.length === 0) {
    findings.push({ severity: 'error', message: 'Contract has no endpoints.' });
  }

  const seen = new Set<string>();
  for (const ep of endpoints) {
    if (!ep || typeof ep !== 'object') {
      findings.push({ severity: 'error', message: 'An endpoint entry is missing or not an object.' });
      continue;
    }
    if (!ep.id || !ID_RE.test(ep.id)) {
      findings.push({ severity: 'error', endpointId: ep.id, message: `endpoint id "${ep.id ?? ''}" must match ${ID_RE}.` });
    } else if (seen.has(ep.id)) {
      findings.push({ severity: 'error', endpointId: ep.id, message: `duplicate endpoint id "${ep.id}".` });
    } else {
      seen.add(ep.id);
    }
    const kind = ep.kind || 'http';
    if (kind !== 'http' && kind !== 'ui_event') {
      findings.push({ severity: 'error', endpointId: ep.id, message: `endpoint "${ep.id}" has invalid kind "${String(ep.kind)}".` });
    }
    if (kind === 'http') {
      if (!METHODS.includes(ep.method as ContractMethod)) {
        findings.push({ severity: 'error', endpointId: ep.id, message: `endpoint "${ep.id}" has invalid method "${ep.method}".` });
      }
      if (!ep.path || !ep.path.startsWith('/')) {
        findings.push({ severity: 'error', endpointId: ep.id, message: `endpoint "${ep.id}" path "${ep.path ?? ''}" must start with "/".` });
      }
    } else if (ep.method || ep.path) {
      findings.push({ severity: 'warning', endpointId: ep.id, message: `endpoint "${ep.id}" is a ui_event; method/path are ignored.` });
    }
    const bodyMethods: ContractMethod[] = ['POST', 'PUT', 'PATCH'];
    if (kind === 'http' && ep.request && ep.request.length > 0 && !bodyMethods.includes(ep.method as ContractMethod)) {
      findings.push({ severity: 'warning', endpointId: ep.id, message: `endpoint "${ep.id}" is ${ep.method} but declares a request body; ${ep.method} bodies are usually ignored.` });
    }
    for (const f of [...(ep.request || []), ...(ep.response || [])]) {
      if (!f.name) findings.push({ severity: 'error', endpointId: ep.id, message: `endpoint "${ep.id}" has a field with no name.` });
      if (!FIELD_TYPES.includes(f.type)) findings.push({ severity: 'error', endpointId: ep.id, message: `endpoint "${ep.id}" field "${f.name}" has invalid type "${f.type}".` });
    }
  }
  return findings;
}

function luaComment(s: string): string {
  return String(s).replace(/\r?\n/g, ' ').replace(/--\[\[|\]\]/g, '');
}

/** Lua names for an endpoint's events, derived from namespace + id. */
export function endpointEventNames(namespace: string, id: string) {
  return {
    request: `${namespace}.${id}`,
    response: `${namespace}.${id}.response`,
    error: `${namespace}.${id}.error`
  };
}

/**
 * Generate the X4-side glue Lua for a contract. Throws if the contract has errors
 * (call validateContract first to surface them in the UI).
 */
export function generateHttpGlueLua(contract: IntegrationContract): string {
  const errors = validateContract(contract).filter(f => f.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`Cannot generate glue Lua: ${errors.length} contract error(s): ${errors.map(e => e.message).join('; ')}`);
  }

  const ns = contract.namespace;
  const httpClient = contract.httpClientExpr || 'require("extensions.sn_mod_support_apis.lua.simple_http")';
  const jsonLib = contract.jsonLibExpr || 'require("json")';
  const bodyMethods: ContractMethod[] = ['POST', 'PUT', 'PATCH'];

  const header = [
    `-- Auto-generated by X4:MD Studio — HTTP integration glue for "${ns}"`,
    `-- Contract: ${contract.endpoints.length} endpoint(s) against ${contract.baseUrl}`,
    `-- This is the X4-side glue ONLY; the external process is out of the studio's scope.`,
    `-- MD -> Lua:  raise_lua_event name="${ns}.<id>"  (param = request table)`,
    `-- Lua -> MD:  event "${ns}.<id>.response" (decoded body) | "${ns}.<id>.error" (message)`,
    ''
  ].join('\n');

  const preamble = [
    `local http = ${httpClient}`,
    `local json = ${jsonLib}`,
    '',
    `local Glue = {}`,
    `local BASE_URL = ${JSON.stringify(contract.baseUrl)}`,
    `local NS = ${JSON.stringify(ns)}`,
    ''
  ].join('\n');

  const fns: string[] = [];
  const registrations: string[] = [];

  const luaTypeOf = (t: ContractFieldType): string =>
    t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : (t === 'object' || t === 'array') ? 'table' : 'string';

  for (const ep of contract.endpoints) {
    const ev = endpointEventNames(ns, ep.id);

    if ((ep.kind || 'http') === 'ui_event') {
      // T4.3 — in-game UI widget → MD cue bridge: no HTTP involved. The widget's
      // Lua calls Glue.<id>(payload); the glue type-guards the declared fields
      // and forwards the table to MD via AddUITriggeredEvent (event_ui_triggered).
      const fields = ep.request || [];
      const guards: string[] = [`    payload = payload or {}`];
      for (const f of fields) {
        if (f.required) {
          guards.push(`    if payload[${JSON.stringify(f.name)}] == nil then DebugError(${JSON.stringify(`[${ns}] ${ep.id}: missing required field '${f.name}'`)}); return end`);
        }
        guards.push(`    if payload[${JSON.stringify(f.name)}] ~= nil and type(payload[${JSON.stringify(f.name)}]) ~= ${JSON.stringify(luaTypeOf(f.type))} then DebugError(${JSON.stringify(`[${ns}] ${ep.id}: field '${f.name}' must be ${luaTypeOf(f.type)}`)}); return end`);
      }
      fns.push([
        `-- ${ep.id}: ui_event${ep.description ? ` — ${luaComment(ep.description)}` : ''} (widget → MD, no HTTP)`,
        `function Glue.${ep.id}(payload)`,
        ...guards,
        `    AddUITriggeredEvent(NS, ${JSON.stringify(ep.id)}, payload)`,
        `end`,
        ``,
        `-- Other Lua (or MD via raise_lua_event "${ev.request}") can trigger it too.`,
        `RegisterEvent(${JSON.stringify(ev.request)}, function(_, param)`,
        `    Glue.${ep.id}(param)`,
        `end)`,
        ``
      ].join('\n'));
      registrations.push(ev.request);
      continue;
    }

    const sendsBody = bodyMethods.includes(ep.method as ContractMethod);
    const requiredFields = (ep.request || []).filter(f => f.required).map(f => f.name);

    const validationLines = requiredFields.length > 0
      ? [
          `    payload = payload or {}`,
          ...requiredFields.map(name =>
            `    if payload[${JSON.stringify(name)}] == nil then AddUITriggeredEvent(NS, ${JSON.stringify(`${ep.id}.error`)}, "missing required field: ${name}"); return end`)
        ]
      : [`    payload = payload or {}`];

    const responseFields = (ep.response || []).map(fld => fld.name).filter(Boolean);
    const responseCheckLines = responseFields.length > 0
      ? [
          `        if ok and type(decoded) == "table" then`,
          ...responseFields.map(name =>
            `            if decoded[${JSON.stringify(name)}] == nil then DebugError(${JSON.stringify(`[${ns}] ${ep.id}: response missing field '${name}'`)}) end`),
          `        end`
        ]
      : [];

    fns.push([
      `-- ${ep.id}: ${ep.method} ${ep.path}${ep.description ? ` — ${luaComment(ep.description)}` : ''}`,
      `function Glue.${ep.id}(payload)`,
      ...validationLines,
      `    local url = BASE_URL .. ${JSON.stringify(ep.path)}`,
      `    http.request({`,
      `        method = ${JSON.stringify(ep.method)},`,
      `        url = url,`,
      sendsBody ? `        body = json.encode(payload),` : `        -- ${ep.method}: no request body`,
      `        headers = { ["Content-Type"] = "application/json" }`,
      `    }, function(err, response)`,
      `        if err ~= nil then`,
      `            AddUITriggeredEvent(NS, ${JSON.stringify(`${ep.id}.error`)}, tostring(err))`,
      `            return`,
      `        end`,
      `        local ok, decoded = pcall(json.decode, response and response.body or "")`,
      ...responseCheckLines,
      `        AddUITriggeredEvent(NS, ${JSON.stringify(`${ep.id}.response`)}, ok and decoded or {})`,
      `    end)`,
      `end`,
      ``,
      `-- MD raises "${ev.request}" with a param table; call the endpoint.`,
      `RegisterEvent(${JSON.stringify(ev.request)}, function(_, param)`,
      `    Glue.${ep.id}(param)`,
      `end)`,
      ``
    ].join('\n'));

    registrations.push(ev.request);
  }

  const footer = [
    `-- Registered ${registrations.length} MD-triggered endpoint event(s):`,
    ...registrations.map(r => `--   ${r}`),
    `return Glue`,
    ''
  ].join('\n');

  return [header, preamble, fns.join('\n'), footer].join('\n');
}

/**
 * Self-test oracle for the contract-glue engine. Mirrors the studio's other
 * `*-selftest` endpoints: builds known-good and known-bad contracts and asserts the
 * validator + generator behave. Returns { allPassed, passed, total, checks }.
 */
function sampleForType(t: ContractFieldType): string {
  switch (t) {
    case 'number': return '0';
    case 'boolean': return 'true';
    case 'array': return '[]';
    case 'object': return 'table[]';
    default: return "''";
  }
}

/**
 * Generate the MD-side scaffold for a contract: per endpoint, a `<library>` cue that
 * raises the Lua call event (with the request fields as params) and a response-handler
 * cue that listens for the Lua-fired `<ns>.<id>.response` via `event_ui_triggered`.
 * This gives the modder BOTH ends of the contract (Lua glue + MD bridge) from one place.
 * Packaged at `md/<modId>_http.xml`. Throws on a contract with errors.
 */
export function generateContractMdScript(contract: IntegrationContract, modId: string): string {
  const errors = validateContract(contract).filter(fd => fd.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`Cannot generate MD scaffold: ${errors.length} contract error(s): ${errors.map(e => e.message).join('; ')}`);
  }
  const ns = contract.namespace;
  const blocks = contract.endpoints.map(ep => {
    const ev = endpointEventNames(ns, ep.id);
    const req = ep.request || [];
    if ((ep.kind || 'http') === 'ui_event') {
      const fieldList = req.map(fld => fld.name).join(', ') || 'none declared';
      return [
        `    <!-- ui_event ${ep.id} — raised by the mod's Lua UI via Glue.${ep.id}(payload) (fields: ${fieldList}). -->`,
        `    <cue name="On_${ep.id}">`,
        `      <conditions>`,
        `        <event_ui_triggered screen="'${ns}'" control="'${ep.id}'" />`,
        `      </conditions>`,
        `      <actions>`,
        `        <!-- event.param3 holds the payload table from AddUITriggeredEvent -->`,
        `        <debug_text text="'${ep.id}: '+event.param3" filter="general" />`,
        `      </actions>`,
        `    </cue>`
      ].join('\n');
    }
    const paramDecls = req.map(fld => `        <param name="${fld.name}" />`).join('\n');
    const payload = req.length
      ? `table[${req.map(fld => `$${fld.name}=$${fld.name}`).join(', ')}]`
      : 'null';
    const respFields = (ep.response || []).map(fld => fld.name).join(', ') || 'no declared fields';
    return [
      `    <!-- ${ep.method} ${ep.path} — call ${ep.id}: signal this library (with params) to fire the request. -->`,
      `    <library name="Call_${ep.id}">`,
      req.length ? `      <params>\n${paramDecls}\n      </params>` : `      <!-- no request fields -->`,
      `      <actions>`,
      `        <raise_lua_event name="'${ev.request}'" param="${payload}" />`,
      `      </actions>`,
      `    </library>`,
      ``,
      `    <!-- response for ${ep.id} (fields: ${respFields}) -->`,
      `    <cue name="On_${ep.id}_response">`,
      `      <conditions>`,
      `        <event_ui_triggered screen="'${ns}'" control="'${ep.id}.response'" />`,
      `      </conditions>`,
      `      <actions>`,
      `        <!-- event.param3 holds the decoded JSON response from AddUITriggeredEvent -->`,
      `        <debug_text text="'${ep.id} response: '+event.param3" filter="general" />`,
      `      </actions>`,
      `    </cue>`
    ].join('\n');
  }).join('\n\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="${modId}_http" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">\n  <cues>\n${blocks}\n  </cues>\n</mdscript>`;
}

export function runContractGlueSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  const good: IntegrationContract = {
    namespace: 'myai',
    baseUrl: 'http://127.0.0.1:8713',
    endpoints: [
      { id: 'get_status', method: 'GET', path: '/v1/status', response: [{ name: 'ok', type: 'boolean' }] },
      { id: 'send_prompt', method: 'POST', path: '/v1/prompt', request: [{ name: 'text', type: 'string', required: true }], response: [{ name: 'reply', type: 'string' }] },
      { id: 'hud_button_clicked', kind: 'ui_event', description: 'HUD button -> MD', request: [{ name: 'button_id', type: 'string', required: true }, { name: 'count', type: 'number' }] }
    ]
  };

  ok('valid_contract_clean', validateContract(good).filter(f => f.severity === 'error').length === 0);

  let lua = '';
  let threw = false;
  try { lua = generateHttpGlueLua(good); } catch { threw = true; }
  ok('generates_without_throwing', !threw && lua.length > 0);

  // every endpoint must produce a RegisterEvent + a Glue function + a response event
  const allEndpointsWired = good.endpoints.every(ep => {
    const ev = endpointEventNames(good.namespace, ep.id);
    const base = lua.includes(`RegisterEvent(${JSON.stringify(ev.request)}`)
      && lua.includes(`function Glue.${ep.id}(`);
    return (ep.kind || 'http') === 'http'
      ? base && lua.includes(JSON.stringify(`${ep.id}.response`))
      : base;
  });
  ok('all_endpoints_wired', allEndpointsWired);

  ok('emits_json_encode_and_decode', lua.includes('json.encode(') && lua.includes('json.decode'));
  ok('post_sends_body_get_does_not',
    lua.includes('body = json.encode(payload)') && lua.includes('-- GET: no request body'));
  ok('required_field_guarded', lua.includes('missing required field: text'));
  ok('async_callback_shape', lua.includes('function(err, response)') && lua.includes('AddUITriggeredEvent('));
  ok('response_shape_validated', lua.includes("response missing field 'reply'") && lua.includes('type(decoded) == "table"'));

  // validator must catch a broken contract
  const bad: IntegrationContract = {
    namespace: 'Bad Name',
    baseUrl: 'ftp://nope',
    endpoints: [
      { id: 'Dup', method: 'FETCH' as any, path: 'no-slash' },
      { id: 'dup', method: 'GET', path: '/a' },
      { id: 'dup', method: 'GET', path: '/b' }
    ]
  };
  const badFindings = validateContract(bad);
  ok('validator_flags_bad_namespace', badFindings.some(f => /namespace/.test(f.message)));
  ok('validator_flags_bad_baseurl', badFindings.some(f => /baseUrl/.test(f.message)));
  ok('validator_flags_bad_method', badFindings.some(f => /invalid method/.test(f.message)));
  ok('validator_flags_bad_path', badFindings.some(f => /must start with/.test(f.message)));
  ok('validator_flags_duplicate_id', badFindings.some(f => /duplicate endpoint id/.test(f.message)));

  let badThrew = false;
  try { generateHttpGlueLua(bad); } catch { badThrew = true; }
  ok('generator_refuses_bad_contract', badThrew);

  // MD scaffold checks
  let md = '';
  let mdThrew = false;
  try { md = generateContractMdScript(good, 'mymod'); } catch { mdThrew = true; }
  ok('md_generates_without_throwing', !mdThrew && md.length > 0);
  ok('md_is_mdscript', md.includes('<mdscript name="mymod_http"') && md.includes('</mdscript>'));
  ok('md_wires_call_and_response', good.endpoints.every(ep => (ep.kind || 'http') === 'ui_event'
    ? (md.includes(`<cue name="On_${ep.id}">`) && md.includes(`control="'${ep.id}'"`) && !md.includes(`<library name="Call_${ep.id}">`))
    : (md.includes(`<library name="Call_${ep.id}">`) && md.includes(`name="'${good.namespace}.${ep.id}'"`) && md.includes(`control="'${ep.id}.response'"`))));
  ok('md_passes_request_params', md.includes('<param name="text" />') && md.includes('$text=$text'));
  let mdBadThrew = false;
  try { generateContractMdScript(bad, 'x'); } catch { mdBadThrew = true; }
  ok('md_refuses_bad_contract', mdBadThrew);

  // T4.3 — ui_event endpoint kind (widget → MD bridge, no HTTP)
  ok('ui_event_lua_no_http', (() => {
    const start = lua.indexOf('function Glue.hud_button_clicked(');
    const end = lua.indexOf('\nend', start);
    const fn = start >= 0 && end > start ? lua.slice(start, end) : '';
    return fn.length > 0 && !fn.includes('http.request') && fn.includes('AddUITriggeredEvent(NS, "hud_button_clicked"');
  })());
  ok('ui_event_type_guards',
    lua.includes('type(payload["button_id"]) ~= "string"')
    && lua.includes('type(payload["count"]) ~= "number"')
    && lua.includes("missing required field 'button_id'"));
  ok('ui_event_md_listener_only',
    md.includes('<cue name="On_hud_button_clicked">')
    && md.includes(`control="'hud_button_clicked'"`)
    && !md.includes('Call_hud_button_clicked'));
  const pureUi: IntegrationContract = { namespace: 'uionly', baseUrl: '', endpoints: [{ id: 'btn', kind: 'ui_event', request: [] }] };
  ok('pure_ui_contract_needs_no_baseurl', validateContract(pureUi).filter(f => f.severity === 'error').length === 0);
  ok('ui_event_method_warns', validateContract({
    namespace: 'x1', baseUrl: '', endpoints: [{ id: 'a', kind: 'ui_event', method: 'GET' }]
  }).some(f => f.severity === 'warning' && /ignored/.test(f.message)));
  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
