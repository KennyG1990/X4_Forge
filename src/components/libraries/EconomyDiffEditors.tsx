import React from 'react';
import { Layers, Plus, Package, Trash } from 'lucide-react';
import ObjectIndexPicker from '../ObjectIndexPicker';
import { StatusPill } from '../ui';
import {
  GOD_MODULE_SET_TYPES,
  type BasketDef,
  type GodEntryDef,
} from '../../lib/economyLibraryHelpers';

export const ECO_INPUT_CLS =
  'w-full min-w-0 px-2.5 py-1.5 rounded-md bg-[#090b0f] border border-[#262c36] text-[#eef2f7] text-xs font-mono focus:outline-none focus:border-blue-500 transition-colors';
export const ECO_SELECT_CLS =
  'w-full min-w-0 px-2.5 py-1.5 rounded-md bg-[#090b0f] border border-[#262c36] text-[#eef2f7] text-xs cursor-pointer focus:outline-none focus:border-blue-500 transition-colors';
export const ECO_LABEL_CLS =
  'text-[#a0aab8] block mb-1 text-[11px] font-medium';
export const ECO_CARD_CLS =
  'p-3.5 rounded-lg bg-[#11141a] border border-[#262c36] space-y-3';
export const ECO_SECTION_TITLE_CLS =
  'text-xs font-semibold text-[#eef2f7] border-b border-white/[0.06] pb-1.5 flex items-center justify-between gap-2';

interface BasketEditorPanelProps {
  basket: BasketDef;
  workspaceWareIds: string[];
  onChange: (next: BasketDef) => void;
}

export function BasketEditorPanel({ basket, workspaceWareIds, onChange }: BasketEditorPanelProps) {
  const wares = basket.wares || [];

  const updateWareAt = (idx: number, val: string) => {
    const next = wares.map((w, i) => (i === idx ? val : w));
    onChange({ ...basket, wares: next });
  };

  const addWare = (wareId = '') => {
    onChange({ ...basket, wares: [...wares, wareId] });
  };

  const removeWareAt = (idx: number) => {
    onChange({ ...basket, wares: wares.filter((_, i) => i !== idx) });
  };

  const unusedCustomWares = workspaceWareIds.filter(id => id && !wares.includes(id));

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={ECO_CARD_CLS}>
        <div className={ECO_SECTION_TITLE_CLS}>
          <span className="flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-blue-400" />
            Trade Basket Identity (libraries/baskets.xml)
          </span>
          <StatusPill tone="info">{wares.filter(w => w.trim()).length} wares</StatusPill>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={ECO_LABEL_CLS}>Basket ID</label>
            <input
              type="text"
              data-testid="basket-id-input"
              value={basket.id}
              onChange={e => onChange({ ...basket, id: e.target.value })}
              className={ECO_INPUT_CLS}
              placeholder="mod_basket_quantum"
            />
          </div>
          <div>
            <label className={ECO_LABEL_CLS}>Patch Note (in XML Patches)</label>
            <input
              type="text"
              value={basket.note || ''}
              onChange={e => onChange({ ...basket, note: e.target.value })}
              className={ECO_INPUT_CLS}
              placeholder="Trade basket summary..."
            />
          </div>
        </div>
      </div>

      <div className={ECO_CARD_CLS}>
        <div className={ECO_SECTION_TITLE_CLS}>
          <span>Basket Ware References (&lt;wares&gt;&lt;ware ware=&quot;...&quot; /&gt;&lt;/wares&gt;)</span>
          <button
            type="button"
            data-testid="basket-add-ware-btn"
            onClick={() => addWare('')}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-blue-500/35 bg-blue-500/15 hover:bg-blue-500/25 text-blue-200 text-[11px] font-medium cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Add ware
          </button>
        </div>

        {unusedCustomWares.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-[#687385]">Quick-add mod ware:</span>
            {unusedCustomWares.slice(0, 8).map(wid => (
              <button
                key={wid}
                type="button"
                onClick={() => addWare(wid)}
                className="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-mono text-[11px] cursor-pointer"
              >
                + {wid}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {wares.length === 0 ? (
            <p className="text-xs text-[#687385] italic">
              No wares in this basket yet. Add vanilla or custom wares so jobs referencing this basket can trade them.
            </p>
          ) : (
            wares.map((wareId, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <ObjectIndexPicker
                    kind="ware"
                    endpoint="/api/reference/suggest"
                    value={wareId}
                    onChange={val => updateWareAt(idx, val)}
                    placeholder="Search ware ID (e.g. energycells, hullparts)…"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeWareAt(idx)}
                  title="Remove ware from basket"
                  className="p-1.5 rounded text-[#687385] hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                >
                  <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface GodEntryEditorPanelProps {
  entry: GodEntryDef;
  workspaceWareIds: string[];
  onChange: (next: GodEntryDef) => void;
}

export function GodEntryEditorPanel({ entry, workspaceWareIds, onChange }: GodEntryEditorPanelProps) {
  const isProduct = entry.kind === 'product';
  const wareListId = `god-ware-options-${entry.id || 'default'}`;

  return (
    <div className="space-y-4 max-w-2xl">
      <datalist id={wareListId}>
        {workspaceWareIds.map(wid => (
          <option key={wid} value={wid} />
        ))}
        <option value="energycells" />
        <option value="hullparts" />
        <option value="claytronics" />
        <option value="medicalsupplies" />
        <option value="foodrations" />
        <option value="siliconwafers" />
      </datalist>

      <div className={ECO_CARD_CLS}>
        <div className={ECO_SECTION_TITLE_CLS}>
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            God Engine Definition (libraries/god.xml)
          </span>
          <div className="flex items-center rounded border border-[#262c36] bg-[#090b0f] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => onChange({ ...entry, kind: 'product', ware: entry.ware || workspaceWareIds[0] || 'energycells' })}
              className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                isProduct ? 'bg-blue-500/20 text-blue-200' : 'text-[#687385] hover:text-white'
              }`}
            >
              Product (/god/products)
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...entry, kind: 'station', race: entry.race || entry.owner || 'argon' })}
              className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                !isProduct ? 'bg-blue-500/20 text-blue-200' : 'text-[#687385] hover:text-white'
              }`}
            >
              Station (/god/stations)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={ECO_LABEL_CLS}>God Entry ID</label>
            <input
              type="text"
              data-testid="god-id-input"
              value={entry.id}
              onChange={e => onChange({ ...entry, id: e.target.value })}
              className={ECO_INPUT_CLS}
            />
          </div>
          <div>
            <label className={ECO_LABEL_CLS}>Owner Faction</label>
            <ObjectIndexPicker
              kind="faction"
              endpoint="/api/reference/suggest"
              value={entry.owner}
              onChange={val => onChange({ ...entry, owner: val })}
              placeholder="Search owner faction (e.g. argon)…"
            />
          </div>
          {isProduct ? (
            <div>
              <label className={ECO_LABEL_CLS}>Produced Ware (ware)</label>
              <input
                type="text"
                data-testid="god-ware-input"
                list={wareListId}
                value={entry.ware || ''}
                onChange={e => onChange({ ...entry, ware: e.target.value })}
                className={ECO_INPUT_CLS}
                placeholder="energycells"
              />
            </div>
          ) : (
            <div>
              <label className={ECO_LABEL_CLS}>Station Race (race)</label>
              <input
                type="text"
                data-testid="god-race-input"
                value={entry.race || ''}
                onChange={e => onChange({ ...entry, race: e.target.value })}
                className={ECO_INPUT_CLS}
                placeholder="argon"
              />
            </div>
          )}
          <div>
            <label className={ECO_LABEL_CLS}>Module Set Type (type)</label>
            <select
              value={entry.type}
              onChange={e => onChange({ ...entry, type: e.target.value })}
              className={ECO_SELECT_CLS}
            >
              {GOD_MODULE_SET_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={ECO_CARD_CLS}>
        <div className={ECO_SECTION_TITLE_CLS}>
          <span>Quotas &amp; Galaxy Placement (&lt;quotas&gt;, &lt;location&gt;)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={ECO_LABEL_CLS}>Galaxy Quota</label>
            <input
              type="number"
              min={0}
              data-testid="god-galaxy-quota-input"
              value={entry.galaxyQuota}
              onChange={e => onChange({ ...entry, galaxyQuota: Math.max(0, Number(e.target.value) || 0) })}
              className={ECO_INPUT_CLS}
            />
          </div>
          <div>
            <label className={ECO_LABEL_CLS}>Sector Quota (opt)</label>
            <input
              type="number"
              min={0}
              value={entry.sectorQuota ?? ''}
              onChange={e => {
                const raw = e.target.value;
                onChange({ ...entry, sectorQuota: raw === '' ? undefined : Math.max(0, Number(raw) || 0) });
              }}
              className={ECO_INPUT_CLS}
              placeholder="any"
            />
          </div>
          <div>
            <label className={ECO_LABEL_CLS}>Zone Quota (opt)</label>
            <input
              type="number"
              min={0}
              value={entry.zoneQuota ?? ''}
              onChange={e => {
                const raw = e.target.value;
                onChange({ ...entry, zoneQuota: raw === '' ? undefined : Math.max(0, Number(raw) || 0) });
              }}
              className={ECO_INPUT_CLS}
              placeholder="any"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className={ECO_LABEL_CLS}>Location Class</label>
            <select
              value={entry.locationClass}
              onChange={e => onChange({ ...entry, locationClass: e.target.value as GodEntryDef['locationClass'] })}
              className={ECO_SELECT_CLS}
            >
              <option value="galaxy">galaxy</option>
              <option value="cluster">cluster</option>
              <option value="sector">sector</option>
              <option value="zone">zone</option>
            </select>
          </div>
          <div>
            <label className={ECO_LABEL_CLS}>Location Macro</label>
            <input
              type="text"
              value={entry.locationMacro}
              onChange={e => onChange({ ...entry, locationMacro: e.target.value })}
              className={ECO_INPUT_CLS}
              placeholder="xu_ep2_universe_macro"
            />
          </div>
          <div>
            <label className={ECO_LABEL_CLS}>Location Faction Filter (opt)</label>
            <input
              type="text"
              value={entry.locationFaction || ''}
              onChange={e => onChange({ ...entry, locationFaction: e.target.value || undefined })}
              className={ECO_INPUT_CLS}
              placeholder="argon"
            />
          </div>
          {isProduct ? (
            <div>
              <label className={ECO_LABEL_CLS}>Module Select Race (opt)</label>
              <input
                type="text"
                value={entry.moduleRace || ''}
                onChange={e => onChange({ ...entry, moduleRace: e.target.value || undefined })}
                className={ECO_INPUT_CLS}
                placeholder="argon"
              />
            </div>
          ) : (
            <div>
              <label className={ECO_LABEL_CLS}>Station Select Tags</label>
              <input
                type="text"
                value={entry.stationTags || ''}
                onChange={e => onChange({ ...entry, stationTags: e.target.value || undefined })}
                className={ECO_INPUT_CLS}
                placeholder="[defence]"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 items-center">
          <div>
            <label className={ECO_LABEL_CLS}>Patch Note</label>
            <input
              type="text"
              value={entry.note || ''}
              onChange={e => onChange({ ...entry, note: e.target.value })}
              className={ECO_INPUT_CLS}
            />
          </div>
          {!isProduct && (
            <label className="flex items-center gap-2 text-xs text-[#a0aab8] cursor-pointer pt-5">
              <input
                type="checkbox"
                checked={Boolean(entry.encyclopedia)}
                onChange={e => onChange({ ...entry, encyclopedia: e.target.checked })}
                className="rounded border-[#262c36] bg-[#090b0f] text-blue-500 focus:ring-0"
              />
              <span>Expose station entry in in-game Encyclopedia</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
