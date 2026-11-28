/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lever 2 — external-integration / contract seam (interactive surface).
 *
 * Lets the modder define the X4 <-> external-process HTTP/JSON contract (endpoints +
 * typed request/response shapes), validates it live, and shows the generated X4-side
 * glue Lua. The contract is stored on the workspace (`integrationContract`) and the
 * mod compiler packages the glue into the build. The external process stays out of
 * scope by design — the studio owns the X4 side and the contract.
 */

import React, { useMemo, useState } from 'react';
import { Plus, Trash, Plug, AlertTriangle, Code2, Info } from 'lucide-react';
import { ModWorkspace } from '../types';
import {
  generateHttpGlueLua,
  generateContractMdScript,
  validateContract,
  type IntegrationContract,
  type ContractEndpoint,
  type ContractField,
  type ContractMethod,
  type ContractFieldType
} from '../lib/contractGlue';

interface ContractEditorProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
}

const METHODS: ContractMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const FIELD_TYPES: ContractFieldType[] = ['string', 'number', 'boolean', 'object', 'array'];
const DEFAULT_FILE_BRIDGE = {
  directory: 'x4_forge_bridge',
  requestFile: 'request.json',
  responseFile: 'response.json',
  pollInterval: '1s',
  timeout: '10s'
};

const EMPTY_CONTRACT: IntegrationContract = {
  namespace: 'myext',
  baseUrl: 'http://127.0.0.1:8713',
  endpoints: [
    { id: 'get_status', method: 'GET', path: '/v1/status', response: [{ name: 'ok', type: 'boolean' }] }
  ]
};

export default function ContractEditor({ workspace, setWorkspace }: ContractEditorProps) {
  const contract = workspace.integrationContract;

  const update = (updater: (c: IntegrationContract) => IntegrationContract) => {
    setWorkspace(prev => ({
      ...prev,
      integrationContract: updater(prev.integrationContract || EMPTY_CONTRACT)
    }));
  };

  const setField = <K extends keyof IntegrationContract>(key: K, val: IntegrationContract[K]) =>
    update(c => ({ ...c, [key]: val }));

  const updateEndpoint = (idx: number, patch: Partial<ContractEndpoint>) =>
    update(c => ({ ...c, endpoints: c.endpoints.map((e, i) => (i === idx ? { ...e, ...patch } : e)) }));

  const addEndpoint = () =>
    update(c => ({ ...c, endpoints: [...c.endpoints, { id: `endpoint_${c.endpoints.length + 1}`, method: 'POST', path: '/v1/new', request: [], response: [] }] }));

  const removeEndpoint = (idx: number) =>
    update(c => ({ ...c, endpoints: c.endpoints.filter((_, i) => i !== idx) }));

  const updateFieldList = (epIdx: number, listKey: 'request' | 'response', fields: ContractField[]) =>
    updateEndpoint(epIdx, { [listKey]: fields } as Partial<ContractEndpoint>);

  const findings = useMemo(() => (contract ? validateContract(contract) : []), [contract]);
  const errorCount = findings.filter(f => f.severity === 'error').length;
  const lua = useMemo(() => {
    if (!contract || errorCount > 0) return '';
    try { return generateHttpGlueLua(contract); } catch { return ''; }
  }, [contract, errorCount]);
  const md = useMemo(() => {
    if (!contract || errorCount > 0) return '';
    try { return generateContractMdScript(contract, (workspace.id || 'mod') + '_http'); } catch { return ''; }
  }, [contract, errorCount, workspace.id]);
  const [preview, setPreview] = useState<'lua' | 'md'>('lua');

  if (!contract) {
    return (
      <div className="h-full bg-[#0c0e12] flex flex-col items-center justify-center text-center p-8 text-[#a0aab8]">
        <Plug className="w-10 h-10 text-blue-400 mb-3" />
        <h2 className="text-sm font-semibold text-[#eef2f7] mb-1">External HTTP Integration Contract</h2>
        <p className="text-xs max-w-md leading-relaxed mb-4">
          Define the contract between your X4 mod and an external local process (endpoints + JSON shapes).
          The studio validates it and generates the X4-side glue Lua; the external process stays yours.
        </p>
        <button
          onClick={() => setWorkspace(prev => ({ ...prev, integrationContract: EMPTY_CONTRACT }))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/35 text-blue-200 text-xs font-medium cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Create a contract
        </button>
      </div>
    );
  }

  const inputCls = 'w-full min-w-0 px-2.5 py-1.5 rounded-md bg-[#090b0f] border border-[#262c36] text-[#eef2f7] font-mono text-xs focus:outline-none focus:border-blue-500';
  const labelCls = 'text-[#a0aab8] block mb-1 text-[11px] font-medium';

  return (
    <div className="h-full bg-[#0c0e12] flex overflow-hidden">
      {/* Left: contract editor */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <div className="flex items-center gap-2 border-b border-[#262c36] pb-2">
          <Plug className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#eef2f7]">External Integration Contract</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Event Namespace</label>
            <input className={inputCls} value={contract.namespace} spellCheck={false}
              onChange={e => setField('namespace', e.target.value)} placeholder="myext" />
            <p className="text-[11px] text-[#687385] mt-1">Lua events: <code className="text-blue-300">{contract.namespace || 'ns'}.&lt;id&gt;</code></p>
          </div>
          <div>
            <label className={labelCls}>External Base URL</label>
            <input className={inputCls} value={contract.baseUrl} spellCheck={false}
              onChange={e => setField('baseUrl', e.target.value)} placeholder="http://127.0.0.1:8713" />
          </div>
        </div>

        <div>
          <label className={labelCls}>HTTP Client Lua Expr (optional)</label>
          <input className={inputCls} value={contract.httpClientExpr || ''} spellCheck={false}
            onChange={e => setField('httpClientExpr', e.target.value)}
            placeholder='require("extensions.sn_mod_support_apis.lua.simple_http")' />
        </div>

        <div className="flex items-center justify-between border-t border-[#262c36] pt-3">
          <span className="text-[11px] uppercase font-semibold text-[#a0aab8] tracking-wider">Endpoints ({contract.endpoints.length})</span>
          <button onClick={addEndpoint}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/35 text-blue-200 text-[11px] font-medium cursor-pointer">
            <Plus className="w-3 h-3" /> Add endpoint
          </button>
        </div>

        {contract.endpoints.map((ep, i) => (
          <div key={i} className="rounded-lg border border-[#262c36] bg-[#11141a] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input className={`${inputCls} flex-1`} value={ep.id} spellCheck={false}
                onChange={e => updateEndpoint(i, { id: e.target.value })} placeholder="endpoint_id" />
              <select className="px-2 py-1.5 rounded bg-[#090b0f] border border-[#262c36] text-fuchsia-300 font-mono text-xs"
                value={ep.kind || 'http'} onChange={e => {
                  const kind = e.target.value;
                  if (kind === 'ui_event') updateEndpoint(i, { kind: 'ui_event', method: undefined, path: undefined });
                  else if (kind === 'file_bridge') updateEndpoint(i, {
                    kind: 'file_bridge',
                    method: undefined,
                    path: undefined,
                    fileBridge: {
                      directory: ep.fileBridge?.directory || DEFAULT_FILE_BRIDGE.directory,
                      requestFile: ep.fileBridge?.requestFile || `${ep.id || 'endpoint'}_request.json`,
                      responseFile: ep.fileBridge?.responseFile || `${ep.id || 'endpoint'}_response.json`,
                      pollInterval: ep.fileBridge?.pollInterval || DEFAULT_FILE_BRIDGE.pollInterval,
                      timeout: ep.fileBridge?.timeout || DEFAULT_FILE_BRIDGE.timeout
                    }
                  });
                  else updateEndpoint(i, { kind: 'http' });
                }}
                title="http: MD → external process. ui_event: Lua UI widget → MD cue. file_bridge: request file + bounded poll.">
                <option value="http">HTTP</option>
                <option value="ui_event">UI EVENT</option>
                <option value="file_bridge">FILE</option>
              </select>
              {(ep.kind || 'http') === 'http' && (
                <select className="px-2 py-1.5 rounded bg-[#090b0f] border border-[#262c36] text-blue-300 font-mono text-xs"
                  value={ep.method || 'POST'} onChange={e => updateEndpoint(i, { method: e.target.value as ContractMethod })}>
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
              <button onClick={() => removeEndpoint(i)} title="Remove endpoint"
                className="p-1.5 rounded text-[#687385] hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer">
                <Trash className="w-3.5 h-3.5" />
              </button>
            </div>
            {(ep.kind || 'http') === 'http' ? (
              <>
                <input className={inputCls} value={ep.path || ''} spellCheck={false}
                  onChange={e => updateEndpoint(i, { path: e.target.value })} placeholder="/v1/path" />
                <FieldListEditor label="Request body fields" fields={ep.request || []}
                  onChange={fs => updateFieldList(i, 'request', fs)} />
                <FieldListEditor label="Response fields" fields={ep.response || []}
                  onChange={fs => updateFieldList(i, 'response', fs)} />
              </>
            ) : (ep.kind || 'http') === 'file_bridge' ? (
              <>
                <div className="text-[11px] text-[#687385] leading-snug">
                  FILE BRIDGE: MD writes a request file, raises a whitelisted poll event, and times out if no response arrives.
                </div>
                <FileBridgeSettingsEditor endpoint={ep} onChange={patch => updateEndpoint(i, { fileBridge: { ...(ep.fileBridge || {}), ...patch } })} inputCls={inputCls} labelCls={labelCls} />
                <FieldListEditor label="Request payload fields" fields={ep.request || []}
                  onChange={fs => updateFieldList(i, 'request', fs)} />
                <FieldListEditor label="Response fields" fields={ep.response || []}
                  onChange={fs => updateFieldList(i, 'response', fs)} />
              </>
            ) : (
              <>
                <div className="text-[11px] text-[#687385] leading-snug">
                  UI EVENT: a Lua widget calls <span className="font-mono text-fuchsia-300">Glue.{ep.id || 'id'}(payload)</span>;
                  the payload is type-guarded and forwarded to the MD listener cue <span className="font-mono text-fuchsia-300">On_{ep.id || 'id'}</span> via AddUITriggeredEvent.
                </div>
                <FieldListEditor label="Payload fields (type-guarded)" fields={ep.request || []}
                  onChange={fs => updateFieldList(i, 'request', fs)} />
              </>
            )}
          </div>
        ))}
      </div>

      {/* Right: validation + generated glue Lua */}
      <div className="w-[40%] min-w-[330px] border-l border-[#262c36] bg-[#11141a] flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-[#262c36] bg-[#141820] flex items-center gap-2 text-xs font-mono">
          <Code2 className="w-4 h-4 text-blue-400" />
          <div className="flex items-center gap-1">
            <button onClick={() => setPreview('lua')} className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${preview === 'lua' ? 'bg-blue-500/20 text-blue-200' : 'text-[#a0aab8] hover:text-white'}`}>ui/&lt;id&gt;_http.lua</button>
            <button onClick={() => setPreview('md')} className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${preview === 'md' ? 'bg-blue-500/20 text-blue-200' : 'text-[#a0aab8] hover:text-white'}`}>md/&lt;id&gt;_http.xml</button>
          </div>
        </div>

        {findings.length > 0 && (
          <div className="px-3 py-2 border-b border-[#262c36] space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
            {findings.map((f, idx) => (
              <div key={idx} className={`flex items-start gap-1.5 text-[11px] ${f.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}`}>
                {f.severity === 'error' ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <span>{f.endpointId ? `[${f.endpointId}] ` : ''}{f.message}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-auto p-3 bg-[#090b0f] font-mono text-[11px] leading-relaxed text-[#eef2f7] whitespace-pre select-text custom-scrollbar">
          {errorCount > 0
            ? <span className="text-[#687385] italic">Fix the {errorCount} contract error(s) above to generate the {preview === 'md' ? 'MD scaffold' : 'glue Lua'}.</span>
            : <pre className="whitespace-pre">{preview === 'md' ? md : lua}</pre>}
        </div>

        <div className="px-3 py-2 border-t border-[#262c36] bg-[#141820] text-[11px] text-[#a0aab8] leading-relaxed">
          Packaged into the mod build as <code className="text-blue-300">ui/&lt;id&gt;_http.lua</code> and <code className="text-blue-300">md/&lt;id&gt;_http.xml</code> on compile. MD drives HTTP/file calls via
          <code className="text-blue-300"> raise_lua_event name=&quot;{contract.namespace || 'ns'}.&lt;id&gt;&quot;</code>; the response returns on
          <code className="text-blue-300"> {contract.namespace || 'ns'}.&lt;id&gt;.response</code>.
        </div>
      </div>
    </div>
  );
}

function FileBridgeSettingsEditor({ endpoint, onChange, inputCls, labelCls }: {
  endpoint: ContractEndpoint;
  onChange: (patch: NonNullable<ContractEndpoint['fileBridge']>) => void;
  inputCls: string;
  labelCls: string;
}) {
  const cfg = endpoint.fileBridge || {};
  const set = (key: keyof NonNullable<ContractEndpoint['fileBridge']>, value: string) => onChange({ [key]: value });
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={labelCls}>Directory</label>
        <input className={inputCls} value={cfg.directory || DEFAULT_FILE_BRIDGE.directory} spellCheck={false}
          onChange={e => set('directory', e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Request File</label>
        <input className={inputCls} value={cfg.requestFile || `${endpoint.id || 'endpoint'}_request.json`} spellCheck={false}
          onChange={e => set('requestFile', e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Response File</label>
        <input className={inputCls} value={cfg.responseFile || `${endpoint.id || 'endpoint'}_response.json`} spellCheck={false}
          onChange={e => set('responseFile', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Poll</label>
          <input className={inputCls} value={cfg.pollInterval || DEFAULT_FILE_BRIDGE.pollInterval} spellCheck={false}
            onChange={e => set('pollInterval', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Timeout</label>
          <input className={inputCls} value={cfg.timeout || DEFAULT_FILE_BRIDGE.timeout} spellCheck={false}
            onChange={e => set('timeout', e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function FieldListEditor({ label, fields, onChange }: { label: string; fields: ContractField[]; onChange: (f: ContractField[]) => void }) {
  const add = () => onChange([...fields, { name: '', type: 'string' }]);
  const upd = (i: number, patch: Partial<ContractField>) => onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const del = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  return (
    <div className="pl-2.5 border-l border-[#262c36]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-[#a0aab8]">{label}</span>
        <button onClick={add} className="text-[11px] text-blue-300 hover:text-white font-medium cursor-pointer">+ field</button>
      </div>
      {fields.length === 0 && <p className="text-[11px] text-[#687385] italic">none</p>}
      {fields.map((f, i) => (
        <div key={i} className="flex items-center gap-1.5 mb-1.5">
          <input className="flex-1 min-w-0 px-2 py-1 rounded bg-[#090b0f] border border-[#262c36] text-[#eef2f7] font-mono text-xs focus:outline-none focus:border-blue-500"
            value={f.name} spellCheck={false} onChange={e => upd(i, { name: e.target.value })} placeholder="field_name" />
          <select className="px-1.5 py-1 rounded bg-[#090b0f] border border-[#262c36] text-[#a0aab8] font-mono text-xs"
            value={f.type} onChange={e => upd(i, { type: e.target.value as ContractFieldType })}>
            {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[11px] text-[#a0aab8] select-none cursor-pointer" title="required">
            <input type="checkbox" className="accent-blue-500" checked={!!f.required} onChange={e => upd(i, { required: e.target.checked })} />req
          </label>
          <button onClick={() => del(i)} className="p-1 text-[#687385] hover:text-rose-300 cursor-pointer" title="remove field">
            <Trash className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
