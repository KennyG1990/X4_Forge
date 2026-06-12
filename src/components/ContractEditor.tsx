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
      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
        <Plug className="w-10 h-10 text-cyan-500/60 mb-3" />
        <h2 className="text-sm font-bold text-slate-200 mb-1">External HTTP Integration Contract</h2>
        <p className="text-[11px] max-w-md leading-relaxed mb-4">
          Define the contract between your X4 mod and an external local process (endpoints + JSON shapes).
          The studio validates it and generates the X4-side glue Lua; the external process stays yours.
        </p>
        <button
          onClick={() => setWorkspace(prev => ({ ...prev, integrationContract: EMPTY_CONTRACT }))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold"
        >
          <Plus className="w-3.5 h-3.5" /> Create a contract
        </button>
      </div>
    );
  }

  const inputCls = 'w-full px-2 py-1.5 rounded bg-black/60 border border-white/10 text-white font-mono text-[11px] focus:outline-none focus:border-cyan-500';
  const labelCls = 'text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold';

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left: contract editor */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
          <Plug className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400">External Integration Contract</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Event Namespace</label>
            <input className={inputCls} value={contract.namespace} spellCheck={false}
              onChange={e => setField('namespace', e.target.value)} placeholder="myext" />
            <p className="text-[9px] text-slate-600 mt-1">Lua events: <code className="text-cyan-500">{contract.namespace || 'ns'}.&lt;id&gt;</code></p>
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

        <div className="flex items-center justify-between border-t border-white/10 pt-3">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Endpoints ({contract.endpoints.length})</span>
          <button onClick={addEndpoint}
            className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[9px] font-bold">
            <Plus className="w-2.5 h-2.5" /> Add endpoint
          </button>
        </div>

        {contract.endpoints.map((ep, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input className={`${inputCls} flex-1`} value={ep.id} spellCheck={false}
                onChange={e => updateEndpoint(i, { id: e.target.value })} placeholder="endpoint_id" />
              <select className="px-2 py-1.5 rounded bg-black/60 border border-white/10 text-fuchsia-300 font-mono text-[11px]"
                value={ep.kind || 'http'} onChange={e => updateEndpoint(i, e.target.value === 'ui_event'
                  ? { kind: 'ui_event', method: undefined, path: undefined }
                  : { kind: 'http' })}
                title="http: MD → external process. ui_event: Lua UI widget → MD cue (no HTTP).">
                <option value="http">HTTP</option>
                <option value="ui_event">UI EVENT</option>
              </select>
              {(ep.kind || 'http') === 'http' && (
                <select className="px-2 py-1.5 rounded bg-black/60 border border-white/10 text-cyan-300 font-mono text-[11px]"
                  value={ep.method || 'POST'} onChange={e => updateEndpoint(i, { method: e.target.value as ContractMethod })}>
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
              <button onClick={() => removeEndpoint(i)} title="Remove endpoint"
                className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10">
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
            ) : (
              <>
                <div className="text-[9px] text-slate-500 font-sans leading-snug">
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
      <div className="w-[42%] min-w-[360px] border-l border-white/10 bg-[#0c0e14] flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2 text-[11px] font-mono">
          <Code2 className="w-4 h-4 text-cyan-400" />
          <div className="flex items-center gap-1">
            <button onClick={() => setPreview('lua')} className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${preview === 'lua' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-white'}`}>ui/&lt;id&gt;_http.lua</button>
            <button onClick={() => setPreview('md')} className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${preview === 'md' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-white'}`}>md/&lt;id&gt;_http.xml</button>
          </div>
        </div>

        {findings.length > 0 && (
          <div className="px-3 py-2 border-b border-white/10 space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
            {findings.map((f, idx) => (
              <div key={idx} className={`flex items-start gap-1.5 text-[10px] ${f.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                {f.severity === 'error' ? <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> : <Info className="w-3 h-3 mt-0.5 shrink-0" />}
                <span>{f.endpointId ? `[${f.endpointId}] ` : ''}{f.message}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-auto p-3 font-mono text-[10.5px] leading-relaxed text-slate-300 whitespace-pre select-text scrollbar-thin">
          {errorCount > 0
            ? <span className="text-slate-600 italic">Fix the {errorCount} contract error(s) above to generate the {preview === 'md' ? 'MD scaffold' : 'glue Lua'}.</span>
            : <pre className="whitespace-pre">{preview === 'md' ? md : lua}</pre>}
        </div>

        <div className="px-3 py-1.5 border-t border-white/10 text-[9px] text-slate-500 leading-relaxed">
          Packaged into the mod build as <code className="text-cyan-500">ui/&lt;id&gt;_http.lua</code> on compile. MD drives a call via
          <code className="text-cyan-500"> raise_lua_event name="{contract.namespace || 'ns'}.&lt;id&gt;"</code>; the response returns on
          <code className="text-cyan-500"> {contract.namespace || 'ns'}.&lt;id&gt;.response</code>.
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
    <div className="pl-2 border-l border-white/5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8.5px] uppercase font-bold text-slate-500 tracking-wider">{label}</span>
        <button onClick={add} className="text-[8.5px] text-cyan-400 hover:text-cyan-300 font-bold">+ field</button>
      </div>
      {fields.length === 0 && <p className="text-[9px] text-slate-700 italic">none</p>}
      {fields.map((f, i) => (
        <div key={i} className="flex items-center gap-1 mb-1">
          <input className="flex-1 px-1.5 py-1 rounded bg-black/50 border border-white/10 text-white font-mono text-[10px] focus:outline-none focus:border-cyan-500"
            value={f.name} spellCheck={false} onChange={e => upd(i, { name: e.target.value })} placeholder="field_name" />
          <select className="px-1 py-1 rounded bg-black/50 border border-white/10 text-slate-300 font-mono text-[10px]"
            value={f.type} onChange={e => upd(i, { type: e.target.value as ContractFieldType })}>
            {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-0.5 text-[8.5px] text-slate-400 select-none" title="required">
            <input type="checkbox" className="accent-cyan-500" checked={!!f.required} onChange={e => upd(i, { required: e.target.checked })} />req
          </label>
          <button onClick={() => del(i)} className="p-1 text-slate-600 hover:text-red-400" title="remove field">
            <Trash className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
