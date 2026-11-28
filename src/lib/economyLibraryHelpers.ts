/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure X4 9.00 economy helpers for Baskets (libraries/baskets.xml), God Engine entries
 * (libraries/god.xml <products> & <stations>), curated vanilla presets, and validation.
 * Zero I/O, zero browser globals, zero runtime side effects.
 */

import { DOMParser } from '@xmldom/xmldom';
import type { JobDef, PatchBlock, WareDef, WareTransport } from '../types';

export interface BasketDef {
  id: string;
  patchId?: string;
  wares: string[];
  note?: string;
}

export interface GodEntryDef {
  kind: 'product' | 'station';
  id: string;
  patchId?: string;
  owner: string;
  ware?: string;
  race?: string;
  type: string;
  galaxyQuota: number;
  sectorQuota?: number;
  zoneQuota?: number;
  locationClass: 'galaxy' | 'cluster' | 'sector' | 'zone';
  locationMacro: string;
  locationFaction?: string;
  locationRelation?: string;
  locationComparison?: string;
  locationTags?: string;
  moduleRace?: string;
  stationTags?: string;
  encyclopedia?: boolean;
  note?: string;
}

export interface EconomyDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  scope: 'ware' | 'basket' | 'job' | 'god';
  targetId: string;
  message: string;
}

export const ALL_WARE_TRANSPORTS: readonly { value: WareTransport; label: string }[] = [
  { value: 'container', label: 'Container Cargo (Wares / Equipment / Food)' },
  { value: 'solid', label: 'Solid Minerals (Ore / Silicon / Ice)' },
  { value: 'liquid', label: 'Liquid Fluids (Helium / Hydrogen / Methane)' },
  { value: 'energy', label: 'Energy Cells (Universal Solar Output)' },
  { value: 'inventory', label: 'Personal Inventory Items (Spacesuit / Crafting)' },
  { value: 'equipment', label: 'Ship Equipment / Upgrades (Thrusters / Turrets)' },
  { value: 'ship', label: 'Hull / Vessel Ware Blueprint' },
];

export const WARE_GROUPS = [
  'agricultural',
  'energy',
  'food',
  'gases',
  'hightech',
  'minerals',
  'pharmaceutical',
  'refined',
  'shiptech',
  'water',
] as const;

export const VANILLA_JOB_ORDERS = [
  'Patrol',
  'TradeRoutine',
  'MiningRoutine',
  'Recon',
  'Plunder',
  'ProtectStation',
  'ProtectSector',
  'SupplyFleet',
  'Resupply',
  'Escort',
  'DockAndWait',
  'Flee',
] as const;

export const VANILLA_BASKET_PRESETS = [
  'all',
  'all_container',
  'bio',
  'building',
  'energy',
  'food',
  'gases',
  'hightech',
  'illegal',
  'minerals',
  'pharmaceutical',
  'refined',
  'shipbuilding',
  'shiptech',
] as const;

export const GOD_MODULE_SET_TYPES = [
  'factory',
  'shipyard',
  'wharf',
  'equipmentdock',
  'tradingstation',
  'defence',
  'piratebase',
] as const;

export const SUBORDINATE_ASSIGNMENTS = [
  'defence',
  'attack',
  'interception',
  'bombardment',
  'positiondefence',
  'assist',
  'mining',
  'trade',
  'build',
  'supplyfleet',
  'tradeforbuildstorage',
  'salvage',
  'follow',
  'police',
  'watchdog',
] as const;

function escAttr(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseFragment(xml: string): Document | null {
  if (!xml || !xml.trim()) return null;
  try {
    let fatal = false;
    const doc = new DOMParser({
      onError: (level: string) => { if (level === 'fatalError') fatal = true; },
    }).parseFromString(`<__root>${xml}</__root>`, 'text/xml');
    return !fatal && doc?.documentElement ? (doc as unknown as Document) : null;
  } catch {
    return null;
  }
}

function normalizeQuota(raw: unknown, fallback = 1): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

export function serializeBasketXml(basket: BasketDef): string {
  const id = basket.id.trim();
  const wares = Array.from(new Set((basket.wares || []).map(w => w.trim()).filter(Boolean)));
  const lines = [`<basket id="${escAttr(id)}">`, `  <wares>`];
  wares.forEach(ware => {
    lines.push(`    <ware ware="${escAttr(ware)}" />`);
  });
  lines.push(`  </wares>`, `</basket>`);
  return lines.join('\n');
}

export function serializeGodEntryXml(entry: GodEntryDef): string {
  const id = entry.id.trim();
  const owner = entry.owner.trim() || 'argon';
  const entryType = entry.type.trim() || 'factory';
  const locClass = entry.locationClass || 'galaxy';
  const locMacro = entry.locationMacro.trim() || 'xu_ep2_universe_macro';

  const quotaAttrs = [`galaxy="${normalizeQuota(entry.galaxyQuota, 1)}"`];
  if (typeof entry.sectorQuota === 'number' && Number.isFinite(entry.sectorQuota) && entry.sectorQuota >= 0) {
    quotaAttrs.push(`sector="${Math.round(entry.sectorQuota)}"`);
  }
  if (typeof entry.zoneQuota === 'number' && Number.isFinite(entry.zoneQuota) && entry.zoneQuota >= 0) {
    quotaAttrs.push(`zone="${Math.round(entry.zoneQuota)}"`);
  }

  const locAttrs = [
    `class="${escAttr(locClass)}"`,
    `macro="${escAttr(locMacro)}"`,
  ];
  if (entry.locationFaction?.trim()) locAttrs.push(`faction="${escAttr(entry.locationFaction.trim())}"`);
  if (entry.locationRelation?.trim()) locAttrs.push(`relation="${escAttr(entry.locationRelation.trim())}"`);
  if (entry.locationComparison?.trim()) locAttrs.push(`comparison="${escAttr(entry.locationComparison.trim())}"`);
  if (entry.locationTags?.trim()) locAttrs.push(`tags="${escAttr(entry.locationTags.trim())}"`);

  if (entry.kind === 'station') {
    const race = (entry.race || owner).trim();
    const encyc = entry.encyclopedia ? ` encyclopedia="true"` : '';
    const selectFaction = owner.startsWith('[') || owner.startsWith('faction.') ? owner : `faction.${owner}`;
    const stationTags = entry.stationTags?.trim() || `[${entryType}]`;
    return [
      `<station id="${escAttr(id)}" race="${escAttr(race)}" owner="${escAttr(owner)}" type="${escAttr(entryType)}"${encyc}>`,
      `  <quotas>`,
      `    <quota ${quotaAttrs.join(' ')} />`,
      `  </quotas>`,
      `  <location ${locAttrs.join(' ')} />`,
      `  <station>`,
      `    <select faction="${escAttr(selectFaction)}" tags="${escAttr(stationTags)}" />`,
      `  </station>`,
      `</station>`,
    ].join('\n');
  }

  const ware = (entry.ware || 'energycells').trim();
  const selectRace = entry.moduleRace?.trim() ? ` race="${escAttr(entry.moduleRace.trim())}"` : '';
  return [
    `<product id="${escAttr(id)}" ware="${escAttr(ware)}" owner="${escAttr(owner)}" type="${escAttr(entryType)}">`,
    `  <quotas>`,
    `    <quota ${quotaAttrs.join(' ')} />`,
    `  </quotas>`,
    `  <location ${locAttrs.join(' ')} />`,
    `  <module>`,
    `    <select ware="${escAttr(ware)}"${selectRace} />`,
    `  </module>`,
    `</product>`,
  ].join('\n');
}

export function parseBasketPatchBlocks(patches: PatchBlock[]): BasketDef[] {
  const out: BasketDef[] = [];
  for (const patch of patches || []) {
    if (patch.targetFile !== 'libraries/baskets.xml' || patch.action !== 'add' || patch.sel.trim() !== '/baskets') {
      continue;
    }
    const doc = parseFragment(patch.content);
    if (!doc) continue;
    const basketEl = doc.getElementsByTagName('basket')[0];
    if (!basketEl) continue;
    const id = basketEl.getAttribute('id') || '';
    if (!id.trim()) continue;
    const wareEls = basketEl.getElementsByTagName('ware');
    const wares: string[] = [];
    for (let i = 0; i < wareEls.length; i += 1) {
      const w = wareEls[i].getAttribute('ware');
      if (w && w.trim()) wares.push(w.trim());
    }
    out.push({
      id: id.trim(),
      patchId: patch.id,
      wares,
      note: patch.note || undefined,
    });
  }
  return out;
}

export function upsertBasketPatchBlock(patches: PatchBlock[], basket: BasketDef): PatchBlock[] {
  const content = serializeBasketXml(basket);
  const note = basket.note?.trim() || `Add trade basket "${basket.id.trim()}"`;
  if (basket.patchId && patches.some(p => p.id === basket.patchId)) {
    return patches.map(p => (
      p.id === basket.patchId
        ? { ...p, targetFile: 'libraries/baskets.xml', sel: '/baskets', action: 'add', pos: undefined, content, note, includeInBuild: true }
        : p
    ));
  }
  const newBlock: PatchBlock = {
    id: basket.patchId || `basket_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    targetFile: 'libraries/baskets.xml',
    sel: '/baskets',
    action: 'add',
    content,
    note,
    includeInBuild: true,
  };
  return [...(patches || []), newBlock];
}

export function parseGodPatchBlocks(patches: PatchBlock[]): GodEntryDef[] {
  const out: GodEntryDef[] = [];
  for (const patch of patches || []) {
    const sel = patch.sel.trim();
    if (patch.targetFile !== 'libraries/god.xml' || patch.action !== 'add') continue;
    if (sel !== '/god/products' && sel !== '/god/stations') continue;
    const doc = parseFragment(patch.content);
    if (!doc) continue;

    const rootEl = sel === '/god/products'
      ? doc.getElementsByTagName('product')[0]
      : doc.getElementsByTagName('station')[0];
    if (!rootEl) continue;

    const id = (rootEl.getAttribute('id') || '').trim();
    if (!id) continue;
    const quotaEl = rootEl.getElementsByTagName('quota')[0];
    const locEl = rootEl.getElementsByTagName('location')[0];
    const locClassRaw = (locEl?.getAttribute('class') || 'galaxy') as GodEntryDef['locationClass'];
    const locationClass = (['galaxy', 'cluster', 'sector', 'zone'].includes(locClassRaw) ? locClassRaw : 'galaxy');

    const sectorRaw = quotaEl?.getAttribute('sector');
    const zoneRaw = quotaEl?.getAttribute('zone');

    if (sel === '/god/products') {
      const selectEl = rootEl.getElementsByTagName('module')[0]?.getElementsByTagName('select')[0];
      out.push({
        kind: 'product',
        id,
        patchId: patch.id,
        owner: rootEl.getAttribute('owner') || 'argon',
        ware: rootEl.getAttribute('ware') || selectEl?.getAttribute('ware') || 'energycells',
        type: rootEl.getAttribute('type') || 'factory',
        galaxyQuota: normalizeQuota(quotaEl?.getAttribute('galaxy'), 1),
        ...(sectorRaw !== null && sectorRaw !== '' ? { sectorQuota: normalizeQuota(sectorRaw, 0) } : {}),
        ...(zoneRaw !== null && zoneRaw !== '' ? { zoneQuota: normalizeQuota(zoneRaw, 0) } : {}),
        locationClass,
        locationMacro: locEl?.getAttribute('macro') || 'xu_ep2_universe_macro',
        locationFaction: locEl?.getAttribute('faction') || undefined,
        locationRelation: locEl?.getAttribute('relation') || undefined,
        locationComparison: locEl?.getAttribute('comparison') || undefined,
        locationTags: locEl?.getAttribute('tags') || undefined,
        moduleRace: selectEl?.getAttribute('race') || undefined,
        note: patch.note || undefined,
      });
    } else {
      const innerStation = rootEl.getElementsByTagName('station')[0];
      const selectEl = innerStation?.getElementsByTagName('select')[0];
      out.push({
        kind: 'station',
        id,
        patchId: patch.id,
        owner: rootEl.getAttribute('owner') || 'argon',
        race: rootEl.getAttribute('race') || rootEl.getAttribute('owner') || 'argon',
        type: rootEl.getAttribute('type') || 'factory',
        encyclopedia: rootEl.getAttribute('encyclopedia') === 'true',
        galaxyQuota: normalizeQuota(quotaEl?.getAttribute('galaxy'), 1),
        ...(sectorRaw !== null && sectorRaw !== '' ? { sectorQuota: normalizeQuota(sectorRaw, 0) } : {}),
        ...(zoneRaw !== null && zoneRaw !== '' ? { zoneQuota: normalizeQuota(zoneRaw, 0) } : {}),
        locationClass,
        locationMacro: locEl?.getAttribute('macro') || 'xu_ep2_universe_macro',
        locationFaction: locEl?.getAttribute('faction') || undefined,
        locationRelation: locEl?.getAttribute('relation') || undefined,
        locationComparison: locEl?.getAttribute('comparison') || undefined,
        locationTags: locEl?.getAttribute('tags') || undefined,
        stationTags: selectEl?.getAttribute('tags') || undefined,
        note: patch.note || undefined,
      });
    }
  }
  return out;
}

export function upsertGodPatchBlock(patches: PatchBlock[], entry: GodEntryDef): PatchBlock[] {
  const sel = entry.kind === 'product' ? '/god/products' : '/god/stations';
  const content = serializeGodEntryXml(entry);
  const note = entry.note?.trim() || `Add God ${entry.kind} "${entry.id.trim()}"`;
  if (entry.patchId && patches.some(p => p.id === entry.patchId)) {
    return patches.map(p => (
      p.id === entry.patchId
        ? { ...p, targetFile: 'libraries/god.xml', sel, action: 'add', pos: undefined, content, note, includeInBuild: true }
        : p
    ));
  }
  const newBlock: PatchBlock = {
    id: entry.patchId || `god_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    targetFile: 'libraries/god.xml',
    sel,
    action: 'add',
    content,
    note,
    includeInBuild: true,
  };
  return [...(patches || []), newBlock];
}

export function removeEconomyPatchBlock(patches: PatchBlock[], patchId: string): PatchBlock[] {
  return (patches || []).filter(p => p.id !== patchId);
}

export function createStarterBasket(id: string, defaultWare = 'energycells'): BasketDef {
  return {
    id: id.trim(),
    wares: defaultWare.trim() ? [defaultWare.trim()] : [],
    note: `Custom trade basket ${id.trim()}`,
  };
}

export function createStarterGodProduct(id: string, defaultWare = 'energycells'): GodEntryDef {
  return {
    kind: 'product',
    id: id.trim(),
    owner: 'argon',
    ware: defaultWare.trim() || 'energycells',
    type: 'factory',
    galaxyQuota: 2,
    locationClass: 'galaxy',
    locationMacro: 'xu_ep2_universe_macro',
    locationFaction: 'argon',
    locationRelation: 'self',
    locationComparison: 'ge',
    moduleRace: 'argon',
    note: `Spawn ${defaultWare || 'ware'} production factories`,
  };
}

export function createStarterGodStation(id: string): GodEntryDef {
  return {
    kind: 'station',
    id: id.trim(),
    owner: 'argon',
    race: 'argon',
    type: 'defence',
    encyclopedia: false,
    galaxyQuota: 1,
    locationClass: 'galaxy',
    locationMacro: 'xu_ep2_universe_macro',
    locationFaction: 'argon',
    stationTags: '[defence]',
    note: `Spawn ${id.trim()} faction station`,
  };
}

export function validateEconomyDefinitions(input: {
  wares: WareDef[];
  jobs: JobDef[];
  baskets: BasketDef[];
  godEntries: GodEntryDef[];
}): EconomyDiagnostic[] {
  const out: EconomyDiagnostic[] = [];
  for (const w of input.wares || []) {
    if (w.includeInBuild === false) continue;
    if (!w.id.trim()) {
      out.push({ severity: 'error', code: 'ware.empty_id', scope: 'ware', targetId: w.id, message: 'Ware ID is required.' });
    }
    if (!(w.minPrice <= w.avgPrice && w.avgPrice <= w.maxPrice)) {
      out.push({
        severity: 'error',
        code: 'ware.price_order',
        scope: 'ware',
        targetId: w.id,
        message: `Ware "${w.id || w.name}": minPrice (${w.minPrice}) <= avgPrice (${w.avgPrice}) <= maxPrice (${w.maxPrice}) violated.`,
      });
    }
  }
  for (const b of input.baskets || []) {
    if (!b.id.trim()) {
      out.push({ severity: 'error', code: 'basket.empty_id', scope: 'basket', targetId: b.id, message: 'Basket ID is required.' });
    }
    if (!b.wares || b.wares.filter(w => w.trim()).length === 0) {
      out.push({ severity: 'warning', code: 'basket.no_wares', scope: 'basket', targetId: b.id, message: `Basket "${b.id}" has zero wares and will carry nothing.` });
    }
  }
  for (const j of input.jobs || []) {
    if (j.includeInBuild === false) continue;
    if (!j.id.trim()) {
      out.push({ severity: 'error', code: 'job.empty_id', scope: 'job', targetId: j.id, message: 'Job ID is required.' });
    }
    if (!j.orderId?.trim() && !j.taskScript?.trim()) {
      out.push({
        severity: 'error',
        code: 'job.missing_behavior',
        scope: 'job',
        targetId: j.id,
        message: `Job "${j.id || j.name}" must specify an X4 9.00 Order ID or a Task Script.`,
      });
    }
  }
  for (const g of input.godEntries || []) {
    if (!g.id.trim()) {
      out.push({ severity: 'error', code: 'god.empty_id', scope: 'god', targetId: g.id, message: 'God entry ID is required.' });
    }
    if (g.kind === 'product' && !g.ware?.trim()) {
      out.push({ severity: 'error', code: 'god.product_missing_ware', scope: 'god', targetId: g.id, message: `God product "${g.id}" needs a ware ID.` });
    }
    if (g.kind === 'station' && !g.race?.trim()) {
      out.push({ severity: 'error', code: 'god.station_missing_race', scope: 'god', targetId: g.id, message: `God station "${g.id}" needs a race.` });
    }
  }
  return out;
}

export function runEconomyLibraryHelpersSelftest(): {
  allPassed: boolean;
  passed: number;
  total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  // Basket upsert + roundtrip parse
  let patches: PatchBlock[] = [];
  patches = upsertBasketPatchBlock(patches, {
    id: 'mod_basket_quantum',
    wares: ['quantum_crystals', 'energycells'],
    note: 'Quantum trade basket',
  });
  const parsedBaskets = parseBasketPatchBlocks(patches);
  ok('basket_roundtrip_count', parsedBaskets.length === 1);
  ok('basket_roundtrip_fields', parsedBaskets[0]?.id === 'mod_basket_quantum' && parsedBaskets[0].wares.join(',') === 'quantum_crystals,energycells');

  // Update existing basket in-place (not duplicate)
  patches = upsertBasketPatchBlock(patches, {
    ...parsedBaskets[0],
    wares: ['quantum_crystals'],
  });
  const updatedBaskets = parseBasketPatchBlocks(patches);
  ok('basket_update_inplace', updatedBaskets.length === 1 && updatedBaskets[0].wares.length === 1);

  // God product + station roundtrip parse
  patches = upsertGodPatchBlock(patches, createStarterGodProduct('god_quantum_factory', 'quantum_crystals'));
  patches = upsertGodPatchBlock(patches, createStarterGodStation('god_argon_bastion'));
  const parsedGod = parseGodPatchBlocks(patches);
  ok('god_roundtrip_count', parsedGod.length === 2);
  ok('god_product_parsed', parsedGod[0]?.kind === 'product' && parsedGod[0].ware === 'quantum_crystals' && parsedGod[0].galaxyQuota === 2);
  ok('god_station_parsed', parsedGod[1]?.kind === 'station' && parsedGod[1].race === 'argon' && parsedGod[1].type === 'defence');

  // Removal
  patches = removeEconomyPatchBlock(patches, updatedBaskets[0].patchId!);
  ok('basket_removed', parseBasketPatchBlocks(patches).length === 0 && parseGodPatchBlocks(patches).length === 2);

  // Malformed XML patch in same file is safely ignored without throwing
  const withMalformed: PatchBlock[] = [
    ...patches,
    { id: 'bad', targetFile: 'libraries/baskets.xml', sel: '/baskets', action: 'add', content: '<basket id="broken"', note: '' },
  ];
  ok('malformed_basket_ignored', parseBasketPatchBlocks(withMalformed).length === 0);

  // Negative validation checks
  const neg = validateEconomyDefinitions({
    wares: [
      {
        id: 'bad_price_ware',
        name: 'Bad Price',
        description: '',
        transport: 'container',
        volume: 1,
        minPrice: 500,
        avgPrice: 200,
        maxPrice: 100,
        prodTime: 10,
        prodAmount: 1,
      },
      {
        id: '   ',
        name: 'Empty ID Ware',
        description: '',
        transport: 'container',
        volume: 1,
        minPrice: 10,
        avgPrice: 20,
        maxPrice: 30,
        prodTime: 10,
        prodAmount: 1,
      },
    ],
    jobs: [
      {
        id: 'bad_job',
        name: 'No Behavior',
        faction: 'argon',
        shipClass: 'fighter',
        shipMacro: 'ship_arg_s_fighter_01_a_macro',
        galaxyQuota: 1,
        sectorQuota: 1,
        taskScript: '',
        rebuildOnDestroy: true,
      },
      {
        id: '  ',
        name: 'Empty ID Job',
        faction: 'argon',
        shipClass: 'fighter',
        shipMacro: 'ship_arg_s_fighter_01_a_macro',
        galaxyQuota: 1,
        sectorQuota: 1,
        taskScript: 'masstraffic.patrol',
        rebuildOnDestroy: true,
      },
    ],
    baskets: [{ id: 'empty_b', wares: [] }, { id: '  ', wares: ['energycells'] }],
    godEntries: [
      { kind: 'product', id: 'bad_god', owner: 'argon', ware: '', type: 'factory', galaxyQuota: 1, locationClass: 'galaxy', locationMacro: 'xu_ep2_universe_macro' },
      { kind: 'station', id: '', owner: 'argon', race: '', type: 'defence', galaxyQuota: 1, locationClass: 'galaxy', locationMacro: 'xu_ep2_universe_macro' },
    ],
  });
  ok('neg_price_order_detected', neg.some(d => d.code === 'ware.price_order'));
  ok('neg_ware_empty_id_detected', neg.some(d => d.code === 'ware.empty_id'));
  ok('neg_job_behavior_detected', neg.some(d => d.code === 'job.missing_behavior'));
  ok('neg_job_empty_id_detected', neg.some(d => d.code === 'job.empty_id'));
  ok('neg_empty_basket_warned', neg.some(d => d.code === 'basket.no_wares'));
  ok('neg_basket_empty_id_detected', neg.some(d => d.code === 'basket.empty_id'));
  ok('neg_god_missing_ware', neg.some(d => d.code === 'god.product_missing_ware'));
  ok('neg_god_empty_id_detected', neg.some(d => d.code === 'god.empty_id'));
  ok('neg_god_missing_race_detected', neg.some(d => d.code === 'god.station_missing_race'));

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
