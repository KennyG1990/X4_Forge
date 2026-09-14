import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { X4UiEditorSessionInput, X4UiEditorSessionOwner, X4UiEditorSessionProjection } from '../lib/x4UiEditorSession';
import {
  capturePreviewScenario, previewScenarioMenuKey, previewScenarioStorageKey, projectPreviewScenario,
  readPreviewScenarios, removePreviewScenario, savePreviewScenario, migratePreviewScenarios,
  type X4UiPreviewScenario, type X4UiPreviewScenarioView,
} from '../lib/x4UiPreviewScenarios';
import type { WorkspaceSourceSplice } from '../lib/workspaceUndoHistory';

export default function X4UiPreviewScenarios({ scope, owner, input, projection, view, draftPending, transition, onApply }: {
  readonly scope: string;
  readonly owner: X4UiEditorSessionOwner;
  readonly input: X4UiEditorSessionInput;
  readonly projection: X4UiEditorSessionProjection;
  readonly view: X4UiPreviewScenarioView;
  readonly draftPending: boolean;
  readonly transition?: { readonly before: X4UiEditorSessionProjection; readonly splice: WorkspaceSourceSplice; readonly scope: string; readonly afterWorkspace: unknown };
  readonly onApply: (projection: X4UiEditorSessionProjection, view: X4UiPreviewScenarioView) => void;
}) {
  const [saved, setSaved] = useState<{ scope: string; scenarios: readonly X4UiPreviewScenario[] }>({ scope: '', scenarios: [] });
  const [name, setName] = useState('');
  const [feedback, setFeedback] = useState<{ scope: string; menu: string | null; message: string; error: boolean } | null>(null);
  const menu = previewScenarioMenuKey(projection);
  const targetId = projection.sampleCatalog?.targetId;
  const migrated = useRef(new WeakSet<object>());
  useLayoutEffect(() => {
    if (transition === undefined || transition.scope !== scope || transition.afterWorkspace !== input.workspace || migrated.current.has(transition)) return;
    migrated.current.add(transition);
    try {
      const result = migratePreviewScenarios(window.localStorage, scope, owner, input, transition.before, transition.splice);
      if (result.ok === true) setSaved({ scope, scenarios: result.scenarios });
      else setFeedback({ scope, menu, message: `Preview retained. Saved scenarios were not updated: ${result.message}`, error: true });
    } catch {
      setFeedback({ scope, menu, message: 'Preview retained. Saved scenarios were not updated: local storage is unavailable.', error: true });
    }
  }, [transition, scope, input, owner, menu]);
  const report = (message: string, error: boolean): void => setFeedback({ scope, menu, message, error });
  useEffect(() => {
    const refresh = (): void => {
      try {
        const result = readPreviewScenarios(window.localStorage, scope);
        setSaved({ scope, scenarios: result.ok ? result.scenarios : [] });
        if (result.ok === false) setFeedback({ scope, menu: null, message: result.message, error: true });
      } catch {
        setSaved({ scope, scenarios: [] });
        setFeedback({ scope, menu: null, message: 'Local scenario storage is unavailable. Preview editing still works.', error: true });
      }
    };
    refresh();
    const changed = (event: StorageEvent): void => {
      if (event.key === null || event.key === previewScenarioStorageKey(scope)) refresh();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [scope]);
  const scenarios = saved.scope === scope ? saved.scenarios.filter(item => item.sourceKey === menu && item.targetId === targetId) : [];
  const current = capturePreviewScenario(projection, view, 'current', 'Current');
  // This is a display comparison only. Applying still requires fresh catalog-issued authority.
  const selected = current.ok ? scenarios.find(item => JSON.stringify({ ...item, id: '', name: '' })
    === JSON.stringify({ ...current.scenario, id: '', name: '' }))?.id ?? '' : '';
  const disabled = !scope || menu === null || draftPending;
  const save = (): void => {
    if (disabled) return;
    const captured = capturePreviewScenario(projection, view, crypto.randomUUID(), name);
    if (captured.ok === false) { report(captured.message, true); return; }
    try {
      const result = savePreviewScenario(window.localStorage, scope, captured.scenario);
      if (result.ok === false) { report(result.message, true); return; }
      setSaved({ scope, scenarios: result.scenarios });
      setName('');
      report(`Saved “${captured.scenario.name}” on this computer.`, false);
    } catch { report('Not saved: local storage is unavailable. Existing scenarios are unchanged.', true); }
  };
  const choose = (id: string): void => {
    if (disabled || !id) return;
    try {
      // Refresh at the action boundary, so a stale tab cannot apply a deleted/replaced record.
      const read = readPreviewScenarios(window.localStorage, scope);
      if (read.ok === false) { report(read.message, true); return; }
      setSaved({ scope, scenarios: read.scenarios });
      const scenario = read.scenarios.find(item => item.id === id);
      if (scenario === undefined) { report('That scenario is no longer saved. Choose another.', true); return; }
      const result = projectPreviewScenario(owner, input, scenario);
      if (result.ok === false) { report(result.message, true); return; }
      onApply(result.projection, scenario.view);
      report(`Applied “${scenario.name}” to preview. Lua is unchanged.`, false);
    } catch { report('Scenario could not be applied. The current preview was left unchanged.', true); }
  };
  const remove = (id: string): void => {
    if (!scope || !id || saved.scope !== scope) return;
    try {
      const result = removePreviewScenario(window.localStorage, scope, id);
      if (result.ok === false) { report(result.message, true); return; }
      setSaved({ scope, scenarios: result.scenarios });
      report('Removed the saved scenario from this computer. Current preview values are unchanged; save them again to restore it.', false);
    } catch { report('Scenario was not removed: local storage is unavailable.', true); }
  };
  const visibleFeedback = feedback?.scope === scope && (feedback.menu === null || feedback.menu === menu) ? feedback : null;
  return <section data-testid="x4-ui-scenarios" className="space-y-2 rounded border border-white/10 p-3 text-xs text-slate-300">
    <h2 className="font-semibold text-cyan-200">Saved scenarios</h2>
    <p className="text-slate-400">This computer and browser only. Preview values and display size, not Lua or source undo history.</p>
    <label className="flex flex-col gap-1">Scenario
      <select aria-label="Saved scenario" data-testid="x4-ui-scenario-select" value={selected} disabled={disabled || scenarios.length === 0} onChange={event => choose(event.target.value)} className="rounded border border-white/10 bg-[#111722] p-2">
        <option value="">Current custom values</option>
        {scenarios.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <label className="flex flex-col gap-1">New scenario name
      <input aria-label="New scenario name" maxLength={60} value={name} onChange={event => setName(event.target.value)} className="rounded border border-white/10 bg-black/30 p-2" placeholder="e.g. Long message" />
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={save} disabled={disabled || !name.trim()} className="rounded border border-cyan-500/30 px-2 py-1.5 text-cyan-200 disabled:text-slate-600">Save scenario</button>
      <button type="button" onClick={() => remove(selected)} disabled={disabled || !selected} className="rounded border border-white/10 px-2 py-1.5 disabled:text-slate-600">Remove saved scenario</button>
    </div>
    {draftPending && <p>Apply or discard your input edits before saving or switching scenarios.</p>}
    <p className="text-slate-500">Preview values follow supported edits and Undo/Redo when their inputs remain unchanged. Changed or unrecognized inputs need new values.</p>
    {saved.scope === scope && saved.scenarios.length > 0 && <details>
      <summary className="cursor-pointer text-slate-400">Manage saved scenarios ({saved.scenarios.length}/20)</summary>
      <ul className="mt-2 space-y-2">
        {saved.scenarios.map(item => <li key={item.id} className="rounded border border-white/10 p-2">
          <div className="break-words">{item.name}</div>
          <div className="text-slate-500">{item.sourceKey === menu && item.targetId === targetId ? 'This menu revision' : 'Other menu or older revision — cannot apply here'}</div>
          <button type="button" aria-label={`Remove ${item.name}`} onClick={() => remove(item.id)} className="mt-1 rounded border border-white/10 px-2 py-1">Remove</button>
        </li>)}
      </ul>
    </details>}
    {visibleFeedback && <p data-testid="x4-ui-scenario-feedback" role={visibleFeedback.error ? 'alert' : 'status'} className={visibleFeedback.error ? 'text-amber-200' : 'text-cyan-200'}>{visibleFeedback.message}</p>}
  </section>;
}
