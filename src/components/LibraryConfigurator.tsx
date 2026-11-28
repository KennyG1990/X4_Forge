/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  BadgeAlert,
  Check,
  Copy,
  Database,
  ExternalLink,
  FileCode2,
  GitPullRequest,
  Plus,
  Trash,
} from 'lucide-react';
import type {
  JobDef,
  JobShipSize,
  ModWorkspace,
  PatchBlock,
  WareDef,
  WareProductionDef,
  WareTransport,
} from '../types';
import ObjectIndexPicker, { type IndexItem } from './ObjectIndexPicker';
import { toast } from '../lib/uiDialogs';
import {
  indexSourceBackedAiScripts,
  indexSourceBackedLibraries,
  type SourceBackedLibraryItem,
} from '../lib/domainSourceIndex';
import { openOrMaterializeInNativeEditor } from '../lib/nativeEditor';
import { scanLibraryConflictsWithDisk, type ConflictWarning } from '../lib/libraryConflicts';
import {
  compileDiffDocument,
  compileJobsXML,
  compileWaresXML,
} from '../lib/modCompiler';
import {
  ALL_WARE_TRANSPORTS,
  createStarterBasket,
  createStarterGodProduct,
  createStarterGodStation,
  parseBasketPatchBlocks,
  parseGodPatchBlocks,
  removeEconomyPatchBlock,
  serializeBasketXml,
  serializeGodEntryXml,
  SUBORDINATE_ASSIGNMENTS,
  upsertBasketPatchBlock,
  upsertGodPatchBlock,
  validateEconomyDefinitions,
  VANILLA_BASKET_PRESETS,
  VANILLA_JOB_ORDERS,
  WARE_GROUPS,
} from '../lib/economyLibraryHelpers';
import { EmptyState, StatusPill } from './ui';
import {
  BasketEditorPanel,
  ECO_CARD_CLS,
  ECO_INPUT_CLS,
  ECO_LABEL_CLS,
  ECO_SECTION_TITLE_CLS,
  ECO_SELECT_CLS,
  GodEntryEditorPanel,
} from './libraries/EconomyDiffEditors';

export type { WareDef, JobDef } from '../types';
export type { ConflictWarning };

interface LibraryConfiguratorProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  /** B13: push an undo checkpoint before destructive edits (deletes) so Ctrl+Z works here too. */
  saveCheckpoint?: () => void;
  onOpenConflicts?: () => void;
}

type LibrarySubTab = 'wares' | 'baskets' | 'jobs' | 'god';

const SHIP_CLASSES: Array<{ value: JobDef['shipClass']; label: string }> = [
  { value: 'fighter', label: 'Fighter (S)' },
  { value: 'corvette', label: 'Corvette / Frigate (M)' },
  { value: 'freighter', label: 'Freighter / Miner (M/L)' },
  { value: 'destroyer', label: 'Destroyer (L)' },
  { value: 'carrier', label: 'Carrier / Battleship (XL)' },
];

const SHIP_SIZES: Array<{ value: '' | JobShipSize; label: string }> = [
  { value: '', label: 'Infer from tags / macro' },
  { value: 'ship_xs', label: 'ship_xs (XS Drone / Suit)' },
  { value: 'ship_s', label: 'ship_s (Small Fighter / Scout)' },
  { value: 'ship_m', label: 'ship_m (Medium Corvette / Freighter)' },
  { value: 'ship_l', label: 'ship_l (Large Destroyer / Freighter)' },
  { value: 'ship_xl', label: 'ship_xl (XL Carrier / Auxiliary)' },
];

function stripDiffWrapper(xml: string, rootTag: 'wares' | 'jobs'): string {
  const inner = xml.match(new RegExp(`<add\\s+sel="\\/${rootTag}">([\\s\\S]*?)<\\/add>`, 'i'))?.[1];
  if (!inner) return `<?xml version="1.0" encoding="utf-8"?>\n<${rootTag} />`;
  return `<?xml version="1.0" encoding="utf-8"?>\n<${rootTag}>\n${inner.replace(/^\n+|\n+$/g, '')}\n</${rootTag}>`;
}

export default function LibraryConfigurator({
  workspace,
  setWorkspace,
  saveCheckpoint,
  onOpenConflicts,
}: LibraryConfiguratorProps) {
  const [activeSubTab, setActiveSubTab] = useState<LibrarySubTab>('wares');
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [isPatchMode, setIsPatchMode] = useState<boolean>(true);
  const [showXmlPreview, setShowXmlPreview] = useState<boolean>(false);
  const [copiedXml, setCopiedXml] = useState<boolean>(false);
  const [warnings, setWarnings] = useState<ConflictWarning[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Inline "new item id" entry (non-blocking, replaces window.prompt). null = not adding.
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addingGodKind, setAddingGodKind] = useState<'product' | 'station'>('product');
  const [addingCollision, setAddingCollision] = useState<IndexItem | null>(null);
  const [addingCommitBusy, setAddingCommitBusy] = useState(false);
  const addingSessionRef = useRef(0);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(null);

  const wares = useMemo(() => workspace.wares || [], [workspace.wares]);
  const jobs = useMemo(() => workspace.jobs || [], [workspace.jobs]);
  const xmlPatches = useMemo(() => workspace.xmlPatches || [], [workspace.xmlPatches]);
  const baskets = useMemo(() => parseBasketPatchBlocks(xmlPatches), [xmlPatches]);
  const godEntries = useMemo(() => parseGodPatchBlocks(xmlPatches), [xmlPatches]);

  const sourceLibs = useMemo(
    () => indexSourceBackedLibraries(workspace),
    [workspace],
  );
  const sourceAiScripts = useMemo(
    () => indexSourceBackedAiScripts(workspace),
    [workspace],
  );

  const workspaceOrderIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...(workspace.aiScripts || [])
            .map(s => s.order?.id?.trim())
            .filter((v): v is string => Boolean(v)),
          ...sourceAiScripts
            .map(s => s.order?.id?.trim())
            .filter((v): v is string => Boolean(v)),
        ]),
      ),
    [workspace.aiScripts, sourceAiScripts],
  );

  const economyDiagnostics = useMemo(
    () => validateEconomyDefinitions({ wares, jobs, baskets, godEntries }),
    [wares, jobs, baskets, godEntries],
  );

  const scanProjectFilesForConflicts = async () => {
    setIsScanning(true);
    try {
      const foundWarnings = await scanLibraryConflictsWithDisk(workspace);
      setWarnings(foundWarnings);
    } finally {
      setIsScanning(false);
    }
  };

  React.useEffect(() => {
    void scanProjectFilesForConflicts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.wares, workspace.jobs, workspace.xmlPatches]);

  const saveWares = (newWares: WareDef[]) => {
    setWorkspace(prev => ({ ...prev, wares: newWares }));
  };

  const saveJobs = (newJobs: JobDef[]) => {
    setWorkspace(prev => ({ ...prev, jobs: newJobs }));
  };

  const savePatches = (newPatches: PatchBlock[]) => {
    setWorkspace(prev => ({ ...prev, xmlPatches: newPatches }));
  };

  const handleCreateWare = (rawId: string) => {
    const wId = (rawId || '').trim();
    if (!wId) return;
    const nWare: WareDef = {
      id: wId,
      name: 'Quantum Focus Crystals',
      description: 'Highly volatile carbon lattices that refract focus laser beam emitters.',
      transport: 'container',
      tags: 'economy equipment',
      volume: 4,
      minPrice: 180,
      avgPrice: 350,
      maxPrice: 720,
      prodTime: 30,
      prodAmount: 10,
      productionMethod: 'default',
      productionName: 'Assembly output',
      primaryWares: [],
    };
    const next = [...wares, nWare];
    saveWares(next);
    setSelectedSourceKey(null);
    setActiveItemIndex(wares.length);
  };

  const handleCreateJob = (rawId: string) => {
    const jId = (rawId || '').trim();
    if (!jId) return;
    const nJob: JobDef = {
      id: jId,
      name: 'Demolition Patrol Squad',
      faction: 'yaki',
      shipClass: 'corvette',
      shipMacro: 'ship_split_m_corvette_01_a_macro',
      galaxyQuota: 6,
      sectorQuota: 2,
      taskScript: '',
      rebuildOnDestroy: true,
    };
    const next = [...jobs, nJob];
    saveJobs(next);
    setSelectedSourceKey(null);
    setActiveItemIndex(jobs.length);
  };

  const handleCreateBasket = (rawId: string) => {
    const id = (rawId || '').trim();
    if (!id) return;
    if (baskets.some(b => b.id.toLowerCase() === id.toLowerCase())) {
      toast(`Basket "${id}" already exists in this workspace.`, 'warning');
      return;
    }
    const starter = createStarterBasket(id, wares[0]?.id || 'energycells');
    savePatches(upsertBasketPatchBlock(xmlPatches, starter));
    setSelectedSourceKey(null);
    setActiveItemIndex(baskets.length);
  };

  const handleCreateGodEntry = (rawId: string, kind: 'product' | 'station') => {
    const id = (rawId || '').trim();
    if (!id) return;
    if (godEntries.some(g => g.id.toLowerCase() === id.toLowerCase())) {
      toast(`God entry "${id}" already exists in this workspace.`, 'warning');
      return;
    }
    const starter =
      kind === 'product'
        ? createStarterGodProduct(id, wares[0]?.id || 'energycells')
        : createStarterGodStation(id);
    savePatches(upsertGodPatchBlock(xmlPatches, starter));
    setSelectedSourceKey(null);
    setActiveItemIndex(godEntries.length);
  };

  const beginAdd = () => {
    addingSessionRef.current += 1;
    setAddingCommitBusy(false);
    setAddingId('');
    setAddingCollision(null);
  };
  const cancelAdd = () => {
    addingSessionRef.current += 1;
    setAddingCommitBusy(false);
    setAddingId(null);
    setAddingCollision(null);
  };
  const changeAddingId = (value: string) => {
    addingSessionRef.current += 1;
    setAddingCommitBusy(false);
    setAddingId(value);
    setAddingCollision(null);
  };

  const commitAdd = async () => {
    const id = (addingId || '').trim();
    if (!id) return;

    if (activeSubTab === 'baskets') {
      handleCreateBasket(id);
      cancelAdd();
      return;
    }
    if (activeSubTab === 'god') {
      handleCreateGodEntry(id, addingGodKind);
      cancelAdd();
      return;
    }

    const kind = activeSubTab === 'wares' ? 'ware' : 'job';
    const projectCollision = (kind === 'ware' ? wares : jobs).some(
      item => item.id.toLowerCase() === id.toLowerCase(),
    );
    if (projectCollision) return;

    const session = addingSessionRef.current;
    setAddingCommitBusy(true);
    try {
      const response = await fetch(
        `/api/reference/suggest?kind=${kind}&q=${encodeURIComponent(id)}&intent=new-definition&limit=10`,
      );
      if (!response.ok) throw new Error(`canonical lookup failed (${response.status})`);
      const body = await response.json();
      if (addingSessionRef.current !== session) return;
      const exact = (Array.isArray(body.items) ? body.items : []).find(
        (item: IndexItem) =>
          String(item.insertText || item.id || item.label || '').trim().toLowerCase() ===
          id.toLowerCase(),
      );
      if (exact) {
        setAddingCollision(exact);
        toast(`"${id}" already exists in the X4 corpus. Patch the existing definition instead.`, 'warning');
        return;
      }
      if (kind === 'ware') handleCreateWare(id);
      else handleCreateJob(id);
      addingSessionRef.current += 1;
      setAddingId(null);
      setAddingCollision(null);
    } catch (error) {
      if (addingSessionRef.current !== session) return;
      toast(
        `Could not verify "${id}" against the canonical corpus; no definition was created. ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    } finally {
      if (addingSessionRef.current === session) setAddingCommitBusy(false);
    }
  };

  const patchExisting = (item: IndexItem) => {
    const targetFile = item.path?.toLowerCase().includes('/libraries/')
      ? item.path.slice(item.path.toLowerCase().indexOf('libraries/'))
      : activeSubTab === 'wares'
        ? 'libraries/wares.xml'
        : 'libraries/jobs.xml';
    window.dispatchEvent(
      new CustomEvent('xmlpatch-pretarget', {
        detail: {
          targetFile,
          selector:
            item.selector ||
            `/${activeSubTab}/${activeSubTab === 'wares' ? 'ware' : 'job'}[@id='${item.insertText || item.id || item.label || ''}']`,
        },
      }),
    );
    cancelAdd();
  };

  const handleDeleteActiveItem = () => {
    if (activeSubTab === 'wares') {
      const victim = wares[activeItemIndex];
      if (!victim) return;
      saveCheckpoint?.();
      saveWares(wares.filter((_, i) => i !== activeItemIndex));
      setActiveItemIndex(0);
      toast(`Deleted ware "${victim.id || 'ware'}" — Ctrl+Z to undo.`);
    } else if (activeSubTab === 'jobs') {
      const victim = jobs[activeItemIndex];
      if (!victim) return;
      saveCheckpoint?.();
      saveJobs(jobs.filter((_, i) => i !== activeItemIndex));
      setActiveItemIndex(0);
      toast(`Deleted job "${victim.id || 'job'}" — Ctrl+Z to undo.`);
    } else if (activeSubTab === 'baskets') {
      const victim = baskets[activeItemIndex];
      if (!victim?.patchId) return;
      saveCheckpoint?.();
      savePatches(removeEconomyPatchBlock(xmlPatches, victim.patchId));
      setActiveItemIndex(0);
      toast(`Deleted basket "${victim.id}" — Ctrl+Z to undo.`);
    } else {
      const victim = godEntries[activeItemIndex];
      if (!victim?.patchId) return;
      saveCheckpoint?.();
      savePatches(removeEconomyPatchBlock(xmlPatches, victim.patchId));
      setActiveItemIndex(0);
      toast(`Deleted God entry "${victim.id}" — Ctrl+Z to undo.`);
    }
  };

  const handleUpdateActiveWareProp = <K extends keyof WareDef>(key: K, val: WareDef[K]) => {
    saveWares(wares.map((w, idx) => (idx === activeItemIndex ? { ...w, [key]: val } : w)));
  };

  const getPrimaryWares = (): NonNullable<WareDef['primaryWares']> =>
    ((activeWare as WareDef)?.primaryWares || []) as NonNullable<WareDef['primaryWares']>;

  const updatePrimaryWare = (index: number, key: 'ware' | 'amount', val: string | number) => {
    const next = getPrimaryWares().map((entry, i) => (i === index ? { ...entry, [key]: val } : entry));
    handleUpdateActiveWareProp('primaryWares', next);
  };

  const addPrimaryWare = () => {
    handleUpdateActiveWareProp('primaryWares', [...getPrimaryWares(), { ware: '', amount: 1 }]);
  };

  const removePrimaryWare = (index: number) => {
    handleUpdateActiveWareProp(
      'primaryWares',
      getPrimaryWares().filter((_, i) => i !== index),
    );
  };

  const handleUpdateActiveJobProp = <K extends keyof JobDef>(key: K, val: JobDef[K]) => {
    saveJobs(jobs.map((j, idx) => (idx === activeItemIndex ? { ...j, [key]: val } : j)));
  };

  const activeWare = activeSubTab === 'wares' ? wares[activeItemIndex] : undefined;
  const activeJob = activeSubTab === 'jobs' ? jobs[activeItemIndex] : undefined;
  const activeBasket = activeSubTab === 'baskets' ? baskets[activeItemIndex] : undefined;
  const activeGod = activeSubTab === 'god' ? godEntries[activeItemIndex] : undefined;
  const activeSourceItems: SourceBackedLibraryItem[] = sourceLibs[activeSubTab];
  const editableCountForTab =
    activeSubTab === 'wares'
      ? wares.length
      : activeSubTab === 'jobs'
        ? jobs.length
        : activeSubTab === 'baskets'
          ? baskets.length
          : godEntries.length;
  const activeSourceItem: SourceBackedLibraryItem | null =
    (selectedSourceKey ? activeSourceItems.find(item => item.key === selectedSourceKey) : null) ||
    (editableCountForTab === 0 ? activeSourceItems[0] || null : null);

  const activeId =
    activeSubTab === 'wares'
      ? activeWare?.id
      : activeSubTab === 'jobs'
        ? activeJob?.id
        : activeSubTab === 'baskets'
          ? activeBasket?.id
          : activeGod?.id;

  const projectPath = `libraries/${activeSubTab}.xml`;

  const compiledPreviewXml = useMemo(() => {
    if (activeSourceItem) {
      return activeSourceItem.fullFileXml;
    }
    if (activeSubTab === 'wares') {
      const diffXml = compileWaresXML(wares.filter(w => w.includeInBuild !== false));
      return isPatchMode ? diffXml : stripDiffWrapper(diffXml, 'wares');
    }
    if (activeSubTab === 'jobs') {
      const diffXml = compileJobsXML(jobs.filter(j => j.includeInBuild !== false));
      return isPatchMode ? diffXml : stripDiffWrapper(diffXml, 'jobs');
    }
    if (activeSubTab === 'baskets') {
      if (!isPatchMode) {
        return [
          '<?xml version="1.0" encoding="utf-8"?>',
          '<baskets>',
          ...baskets.map(b =>
            serializeBasketXml(b)
              .split('\n')
              .map(line => `  ${line}`)
              .join('\n'),
          ),
          '</baskets>',
        ].join('\n');
      }
      return compileDiffDocument(
        xmlPatches.filter(p => p.targetFile === 'libraries/baskets.xml'),
        'libraries/baskets.xml',
      );
    }
    if (!isPatchMode) {
      const stations = godEntries.filter(g => g.kind === 'station');
      const products = godEntries.filter(g => g.kind === 'product');
      const lines = ['<?xml version="1.0" encoding="utf-8"?>', '<god>'];
      if (stations.length) {
        lines.push('  <stations>');
        stations.forEach(s =>
          serializeGodEntryXml(s)
            .split('\n')
            .forEach(l => lines.push(`    ${l}`)),
        );
        lines.push('  </stations>');
      }
      if (products.length) {
        lines.push('  <products>');
        products.forEach(p =>
          serializeGodEntryXml(p)
            .split('\n')
            .forEach(l => lines.push(`    ${l}`)),
        );
        lines.push('  </products>');
      }
      lines.push('</god>');
      return lines.join('\n');
    }
    return compileDiffDocument(
      xmlPatches.filter(p => p.targetFile === 'libraries/god.xml'),
      'libraries/god.xml',
    );
  }, [activeSourceItem, activeSubTab, baskets, godEntries, isPatchMode, jobs, wares, xmlPatches]);

  const activeItemDiskWarnings = activeId
    ? warnings.filter(w => w.affectedIds.includes(activeId))
    : [];
  const activeItemEconomyDiagnostics = activeId
    ? economyDiagnostics.filter(d => d.targetId === activeId)
    : [];

  const switchSubTab = (tab: LibrarySubTab) => {
    setActiveSubTab(tab);
    setActiveItemIndex(0);
    setSelectedSourceKey(null);
    cancelAdd();
  };

  return (
    <div
      id="libraries_configurator_view"
      className="flex-1 bg-[#0c0e12] flex flex-col h-full overflow-hidden text-[#eef2f7]"
    >
      {/* Concept A Header Bar */}
      <div className="bg-[#141820] border-b border-[#262c36] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Database className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-semibold text-[#eef2f7] truncate">
            X4 Economy &amp; Population Libraries
          </span>
          <StatusPill tone={economyDiagnostics.some(d => d.severity === 'error') ? 'error' : 'info'}>
            {wares.length + sourceLibs.wares.length}W · {baskets.length + sourceLibs.baskets.length}B · {jobs.length + sourceLibs.jobs.length}J · {godEntries.length + sourceLibs.god.length}G
          </StatusPill>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const result = await openOrMaterializeInNativeEditor(workspace, projectPath);
              toast(result.message, result.ok ? 'success' : 'error');
            }}
            className="px-2.5 py-1 rounded text-[11px] font-medium border border-blue-500/30 bg-blue-500/12 text-blue-200 hover:bg-blue-500/20 transition-colors cursor-pointer flex items-center gap-1.5"
            title={`Open ${projectPath} as a real Antigravity file tab`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in Antigravity
          </button>

          <button
            type="button"
            data-testid="library-xml-preview-toggle"
            onClick={() => setShowXmlPreview(prev => !prev)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
              showXmlPreview
                ? 'border-blue-500/40 bg-blue-500/20 text-blue-200'
                : 'border-[#262c36] bg-[#171b23] text-[#a0aab8] hover:text-white'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            Preview XML
          </button>

          <button
            type="button"
            onClick={() => setIsPatchMode(prev => !prev)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
              isPatchMode
                ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300'
                : 'border-[#262c36] bg-[#171b23] text-[#a0aab8] hover:text-white'
            }`}
            title="Switch between modular RFC 5261 XML diff patches and standalone root XML"
          >
            <GitPullRequest className="w-3.5 h-3.5" />
            {isPatchMode ? 'Mode: XML Diff (Patches)' : 'Mode: Standalone XML'}
          </button>

          <div className="flex items-center border border-[#262c36] bg-[#090b0f] p-0.5 rounded-md">
            {(
              [
                ['wares', 'wares.xml'],
                ['baskets', 'baskets.xml'],
                ['jobs', 'jobs.xml'],
                ['god', 'god.xml'],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => switchSubTab(tab)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  activeSubTab === tab
                    ? 'bg-blue-500/20 text-blue-200 font-semibold'
                    : 'text-[#a0aab8] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Side: Economy Asset List */}
        <div className="w-[264px] shrink-0 border-r border-[#262c36] flex flex-col bg-[#11141a] overflow-hidden">
          <div className="px-3 py-2 border-b border-[#262c36] shrink-0 flex items-center justify-between bg-[#141820]">
            <span className="text-[11px] font-semibold text-[#a0aab8]">
              {activeSubTab === 'wares'
                ? 'Wares Hierarchy'
                : activeSubTab === 'baskets'
                  ? 'Trade Baskets'
                  : activeSubTab === 'jobs'
                    ? 'NPC Jobs Hierarchy'
                    : 'God Spawns'}
            </span>
            <button
              type="button"
              onClick={beginAdd}
              className="px-2 py-1 rounded hover:bg-[#1e2430] text-blue-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium border border-blue-500/30 bg-blue-500/10"
              title={`Create new ${activeSubTab} entry`}
            >
              <Plus className="w-3 h-3" /> ADD
            </button>
          </div>

          {addingId !== null && (
            <div className="p-2.5 border-b border-[#262c36] bg-[#090b0f] shrink-0 space-y-2">
              {activeSubTab === 'god' && (
                <div className="flex items-center gap-1 rounded border border-[#262c36] bg-[#11141a] p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setAddingGodKind('product')}
                    className={`flex-1 py-0.5 rounded font-medium cursor-pointer ${
                      addingGodKind === 'product' ? 'bg-blue-500/20 text-blue-200' : 'text-[#687385]'
                    }`}
                  >
                    Product
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingGodKind('station')}
                    className={`flex-1 py-0.5 rounded font-medium cursor-pointer ${
                      addingGodKind === 'station' ? 'bg-blue-500/20 text-blue-200' : 'text-[#687385]'
                    }`}
                  >
                    Station
                  </button>
                </div>
              )}
              <div className="flex items-start gap-1.5">
                <div className="flex-1 min-w-0">
                  {activeSubTab === 'wares' || activeSubTab === 'jobs' ? (
                    <ObjectIndexPicker
                      value={addingId}
                      onChange={changeAddingId}
                      kind={activeSubTab === 'wares' ? 'ware' : 'job'}
                      endpoint="/api/reference/suggest"
                      intent="new-definition"
                      autoFocus
                      onExactMatchChange={setAddingCollision}
                      onExistingSelect={patchExisting}
                      placeholder={
                        activeSubTab === 'wares' ? 'ware_antimatter_capsules' : 'job_trader_hauler'
                      }
                      existingActionLabel="Patch existing"
                    />
                  ) : (
                    <input
                      type="text"
                      autoFocus
                      value={addingId}
                      onChange={e => changeAddingId(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void commitAdd();
                        else if (e.key === 'Escape') cancelAdd();
                      }}
                      placeholder={
                        activeSubTab === 'baskets' ? 'mod_basket_quantum' : 'god_quantum_factory'
                      }
                      className={ECO_INPUT_CLS}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void commitAdd()}
                  title="Create new definition"
                  disabled={Boolean(addingCollision) || addingCommitBusy}
                  className="px-2.5 py-1.5 rounded bg-blue-500/15 hover:bg-blue-500/30 border border-blue-500/35 text-blue-200 text-[11px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {addingCommitBusy ? 'Checking…' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={cancelAdd}
                  title="Cancel (Esc)"
                  className="px-2 py-1.5 rounded text-[#a0aab8] hover:text-rose-300 hover:bg-rose-500/10 text-[11px] font-medium cursor-pointer"
                >
                  Esc
                </button>
              </div>
              {addingCollision && (
                <div className="flex items-center justify-between gap-2 rounded border border-amber-400/25 bg-amber-500/10 px-2.5 py-2">
                  <p className="min-w-0 text-[11px] text-amber-200 leading-snug">
                    <span className="mr-1.5 inline-flex rounded border border-amber-400/35 px-1 py-0.5 text-[11px] font-bold">
                      EXISTS
                    </span>
                    <strong>{addingCollision.insertText || addingCollision.id || addingCollision.label}</strong>{' '}
                    already exists in {addingCollision.source || 'the corpus'}. Patch it instead of creating a
                    duplicate.
                  </p>
                  <button
                    type="button"
                    onClick={() => patchExisting(addingCollision)}
                    className="shrink-0 rounded border border-amber-400/35 bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25 cursor-pointer"
                  >
                    Patch existing {addingCollision.insertText || addingCollision.id || addingCollision.label}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2.5 space-y-3 text-xs custom-scrollbar">
            {activeSubTab === 'wares' ? (
              wares.length === 0 && activeSourceItems.length === 0 ? (
                <div className="text-xs text-[#687385] p-4 text-center">
                  No wares catalogued yet. Click ADD above to create one.
                </div>
              ) : (
                ALL_WARE_TRANSPORTS.map(({ value: transport }) => {
                  const transportWares = wares.filter(w => (w.transport || 'container') === transport);
                  if (transportWares.length === 0) return null;
                  return (
                    <div key={transport} className="space-y-1">
                      <div className="text-[11px] font-semibold text-blue-300 uppercase flex items-center justify-between py-1 border-b border-white/[0.06]">
                        <span>{transport}</span>
                        <span className="text-[#687385]">{transportWares.length}</span>
                      </div>
                      <div className="pl-2 border-l border-[#262c36] space-y-1">
                        {transportWares.map(item => {
                          const idx = wares.findIndex(w => w.id === item.id);
                          const itemWarn = warnings.filter(w => w.affectedIds.includes(item.id));
                          const hasError =
                            itemWarn.some(w => w.severity === 'error') ||
                            economyDiagnostics.some(d => d.targetId === item.id && d.severity === 'error');
                          const hasWarn = itemWarn.some(w => w.severity === 'warning');
                          const isSelected = !activeSourceItem && activeItemIndex === idx;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSelectedSourceKey(null);
                                setActiveItemIndex(idx);
                              }}
                              className={`w-full text-left py-1.5 px-2 rounded transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                                isSelected
                                  ? hasError
                                    ? 'bg-rose-500/15 text-rose-200 font-semibold border-l-2 border-rose-500'
                                    : hasWarn
                                      ? 'bg-amber-500/15 text-amber-200 font-semibold border-l-2 border-amber-500'
                                      : 'bg-blue-500/15 text-blue-200 font-semibold border-l-2 border-blue-500'
                                  : 'text-[#a0aab8] hover:bg-white/[0.04] hover:text-white'
                              }`}
                            >
                              <span className="truncate flex-1">{item.name}</span>
                              <span className="text-[11px] font-mono text-[#687385] truncate max-w-[90px]">
                                {item.id}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )
            ) : activeSubTab === 'baskets' ? (
              baskets.length === 0 && activeSourceItems.length === 0 ? (
                <div className="text-xs text-[#687385] p-4 text-center">
                  No trade baskets authored yet. Click ADD to define one for <code className="font-mono">libraries/baskets.xml</code>.
                </div>
              ) : (
                <div className="space-y-1">
                  {baskets.map((basket, idx) => (
                    <button
                      key={basket.patchId || basket.id}
                      type="button"
                      onClick={() => {
                        setSelectedSourceKey(null);
                        setActiveItemIndex(idx);
                      }}
                      className={`w-full text-left py-1.5 px-2.5 rounded transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                        !activeSourceItem && activeItemIndex === idx
                          ? 'bg-blue-500/15 text-blue-200 font-semibold border-l-2 border-blue-500'
                          : 'text-[#a0aab8] hover:bg-white/[0.04] hover:text-white'
                      }`}
                    >
                      <span className="truncate font-mono">{basket.id}</span>
                      <span className="text-[11px] text-[#687385] shrink-0">
                        {basket.wares.length}w
                      </span>
                    </button>
                  ))}
                </div>
              )
            ) : activeSubTab === 'jobs' ? (
              jobs.length === 0 && activeSourceItems.length === 0 ? (
                <div className="text-xs text-[#687385] p-4 text-center">
                  No NPC jobs catalogued yet. Click ADD above to create one.
                </div>
              ) : (
                Array.from(new Set(jobs.map(j => j.faction || 'other'))).map(faction => {
                  const factionJobs = jobs.filter(j => (j.faction || 'other') === faction);
                  return (
                    <div key={faction} className="space-y-1">
                      <div className="text-[11px] font-semibold text-amber-300 uppercase flex items-center justify-between py-1 border-b border-white/[0.06]">
                        <span>{faction}</span>
                        <span className="text-[#687385]">{factionJobs.length}</span>
                      </div>
                      <div className="pl-2 border-l border-[#262c36] space-y-1">
                        {factionJobs.map(item => {
                          const idx = jobs.findIndex(j => j.id === item.id);
                          const itemWarn = warnings.filter(w => w.affectedIds.includes(item.id));
                          const hasError =
                            itemWarn.some(w => w.severity === 'error') ||
                            economyDiagnostics.some(d => d.targetId === item.id && d.severity === 'error');
                          const hasWarn = itemWarn.some(w => w.severity === 'warning');
                          const isSelected = !activeSourceItem && activeItemIndex === idx;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSelectedSourceKey(null);
                                setActiveItemIndex(idx);
                              }}
                              className={`w-full text-left py-1.5 px-2 rounded transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                                isSelected
                                  ? hasError
                                    ? 'bg-rose-500/15 text-rose-200 font-semibold border-l-2 border-rose-500'
                                    : hasWarn
                                      ? 'bg-amber-500/15 text-amber-200 font-semibold border-l-2 border-amber-500'
                                      : 'bg-blue-500/15 text-blue-200 font-semibold border-l-2 border-blue-500'
                                  : 'text-[#a0aab8] hover:bg-white/[0.04] hover:text-white'
                              }`}
                            >
                              <span className="truncate flex-1">{item.name}</span>
                              <span className="text-[11px] font-mono text-[#687385] truncate max-w-[90px]">
                                {item.orderId || item.id}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )
            ) : godEntries.length === 0 && activeSourceItems.length === 0 ? (
              <div className="text-xs text-[#687385] p-4 text-center">
                No God product factories or station spawns defined yet.
              </div>
            ) : (
              (['product', 'station'] as const).map(kind => {
                const subset = godEntries.filter(g => g.kind === kind);
                if (subset.length === 0) return null;
                return (
                  <div key={kind} className="space-y-1">
                    <div className="text-[11px] font-semibold text-blue-300 uppercase flex items-center justify-between py-1 border-b border-white/[0.06]">
                      <span>{kind === 'product' ? 'Products' : 'Stations'}</span>
                      <span className="text-[#687385]">{subset.length}</span>
                    </div>
                    <div className="pl-2 border-l border-[#262c36] space-y-1">
                      {subset.map(entry => {
                        const idx = godEntries.findIndex(
                          g => (g.patchId || g.id) === (entry.patchId || entry.id),
                        );
                        return (
                          <button
                            key={entry.patchId || entry.id}
                            type="button"
                            onClick={() => {
                              setSelectedSourceKey(null);
                              setActiveItemIndex(idx);
                            }}
                            className={`w-full text-left py-1.5 px-2 rounded transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                              !activeSourceItem && activeItemIndex === idx
                                ? 'bg-blue-500/15 text-blue-200 font-semibold border-l-2 border-blue-500'
                                : 'text-[#a0aab8] hover:bg-white/[0.04] hover:text-white'
                            }`}
                          >
                            <span className="truncate font-mono">{entry.id}</span>
                            <span className="text-[11px] text-[#687385] shrink-0">
                              {entry.owner} · {entry.galaxyQuota}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}

            {activeSourceItems.length > 0 && (
              <div
                data-testid={`library-source-list-${activeSubTab}`}
                className="space-y-1 pt-2 border-t border-white/[0.06]"
              >
                <div className="text-[11px] font-semibold text-emerald-300 uppercase flex items-center justify-between py-1 border-b border-white/[0.06]">
                  <span>Source-Backed (Disk)</span>
                  <span className="text-[#687385]">{activeSourceItems.length}</span>
                </div>
                <div className="pl-2 border-l border-emerald-500/30 space-y-1">
                  {activeSourceItems.map(item => {
                    const selected = activeSourceItem?.key === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        data-testid={`library-source-item-${item.id}`}
                        onClick={() => setSelectedSourceKey(item.key)}
                        className={`w-full text-left py-1.5 px-2 rounded transition-colors cursor-pointer ${
                          selected
                            ? 'bg-emerald-500/15 text-emerald-200 font-semibold border-l-2 border-emerald-500'
                            : 'text-[#a0aab8] hover:bg-white/[0.04] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate font-mono text-[11px]">{item.label}</span>
                          <span className="shrink-0 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[11px] font-mono text-emerald-300">
                            {item.subKind || item.op || 'disk'}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] font-mono text-[#687385]">
                          {item.summary}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Compact single-owner conflict status footer (detailed issues live in Diagnostics -> Mod Conflicts) */}
          <div
            data-testid="library-conflicts-handoff"
            className="border-t border-[#262c36] shrink-0 bg-[#141820] px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <BadgeAlert
                className={`w-4 h-4 shrink-0 ${
                  warnings.some(w => w.severity === 'error')
                    ? 'text-rose-400'
                    : warnings.length > 0
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }`}
              />
              {warnings.length > 0 ? (
                <span
                  className={`px-1.5 py-0.5 rounded font-medium ${
                    warnings.some(w => w.severity === 'error')
                      ? 'bg-rose-500/15 text-rose-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {warnings.length} conflict{warnings.length === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="text-emerald-400 font-medium">No conflicts</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => void scanProjectFilesForConflicts()}
                disabled={isScanning}
                className="px-2 py-1 rounded border border-[#262c36] bg-[#171b23] hover:text-white text-[#a0aab8] text-[11px] cursor-pointer disabled:opacity-50"
                title="Re-scan Wares & Jobs for collisions"
              >
                {isScanning ? 'Scanning…' : 'Scan'}
              </button>
              {onOpenConflicts && (
                <button
                  type="button"
                  data-testid="library-open-conflicts-btn"
                  onClick={onOpenConflicts}
                  className="px-2 py-1 rounded border border-blue-500/35 bg-blue-500/15 hover:bg-blue-500/25 text-blue-200 text-[11px] font-medium cursor-pointer"
                >
                  Diagnostics →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Center portion: Visual controls detail editor sheet */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[#0c0e12]">
          {activeSourceItem ? (
            <div data-testid="library-source-backed-panel" className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#262c36] shrink-0 flex items-center justify-between gap-2 bg-[#11141a]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-mono text-emerald-300">
                      Source-Backed (Disk)
                    </span>
                    <h2 className="text-sm font-semibold text-[#eef2f7] truncate">
                      {activeSourceItem.label}
                    </h2>
                  </div>
                  <p className="text-[11px] text-[#687385] font-mono mt-0.5 truncate">
                    {activeSourceItem.path} · ID: {activeSourceItem.id} · Preserved byte-losslessly on deploy
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const result = await openOrMaterializeInNativeEditor(workspace, activeSourceItem.path);
                    toast(result.message, result.ok ? 'success' : 'error');
                  }}
                  className="px-2.5 py-1.5 rounded border border-emerald-500/35 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-[11px] font-medium cursor-pointer inline-flex items-center gap-1.5 shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open File
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {activeSourceItem.parseError && (
                  <div className="rounded-lg border border-rose-500/40 bg-rose-950/25 p-3 text-xs text-rose-200">
                    <span className="font-semibold mr-2">XML Parse Error:</span>
                    <span className="font-mono">{activeSourceItem.parseError}</span>
                  </div>
                )}

                <div className={ECO_CARD_CLS}>
                  <div className={ECO_SECTION_TITLE_CLS}>Indexed Disk Entry</div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                    <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2.5">
                      <div className="text-[#687385]">Entry ID</div>
                      <div className="font-mono text-[#eef2f7] mt-0.5 truncate">{activeSourceItem.id}</div>
                    </div>
                    <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2.5">
                      <div className="text-[#687385]">Kind</div>
                      <div className="font-mono text-[#eef2f7] mt-0.5">
                        {activeSourceItem.entryKind}{activeSourceItem.subKind ? ` (${activeSourceItem.subKind})` : ''}
                      </div>
                    </div>
                    <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2.5">
                      <div className="text-[#687385]">Source File</div>
                      <div className="font-mono text-[#eef2f7] mt-0.5 truncate">{activeSourceItem.path}</div>
                    </div>
                    <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2.5">
                      <div className="text-[#687385]">Summary</div>
                      <div className="font-mono text-[#eef2f7] mt-0.5 truncate">{activeSourceItem.summary}</div>
                    </div>
                  </div>
                  {activeSourceItem.sel && (
                    <div className="mt-2 rounded border border-[#262c36] bg-[#0a0c10] px-2.5 py-2 text-[11px] font-mono text-[#cbd5e1] break-all">
                      <span className="text-[#687385] mr-2">sel:</span>
                      {activeSourceItem.sel}
                    </div>
                  )}
                </div>

                <div className={ECO_CARD_CLS}>
                  <div className={ECO_SECTION_TITLE_CLS}>Exact Source XML Fragment</div>
                  <pre
                    data-testid="library-source-snippet"
                    className="rounded border border-[#262c36] bg-[#090b0f] p-3 font-mono text-[11px] leading-relaxed text-[#cbd5e1] overflow-x-auto whitespace-pre"
                  >
                    {activeSourceItem.rawSnippet}
                  </pre>
                </div>
              </div>
            </div>
          ) : !activeId ? (
            <EmptyState
              icon={<Database className="w-5 h-5" />}
              title={`No ${activeSubTab} entry selected`}
              description={
                activeSubTab === 'baskets'
                  ? 'Trade baskets group custom or vanilla wares so NPC Jobs and Traders can trade them across the galaxy.'
                  : activeSubTab === 'god'
                    ? 'God entries spawn dynamic faction factories and defensive stations via libraries/god.xml.'
                    : 'Select an asset from the left hierarchy or click ADD to author a new X4 9.00 definition.'
              }
            >
              <div className="flex flex-wrap items-center justify-center gap-2">
                {activeSubTab === 'baskets' && (
                  <button
                    type="button"
                    data-testid="create-starter-basket-btn"
                    onClick={() => handleCreateBasket('mod_trade_basket')}
                    className="px-3 py-1.5 rounded border border-blue-500/35 bg-blue-500/15 hover:bg-blue-500/25 text-blue-200 text-xs font-medium cursor-pointer"
                  >
                    + Create Starter Trade Basket
                  </button>
                )}
                {activeSubTab === 'god' && (
                  <>
                    <button
                      type="button"
                      data-testid="create-starter-god-product-btn"
                      onClick={() => handleCreateGodEntry('mod_god_product', 'product')}
                      className="px-3 py-1.5 rounded border border-blue-500/35 bg-blue-500/15 hover:bg-blue-500/25 text-blue-200 text-xs font-medium cursor-pointer"
                    >
                      + Add Product Factory
                    </button>
                    <button
                      type="button"
                      data-testid="create-starter-god-station-btn"
                      onClick={() => handleCreateGodEntry('mod_god_station', 'station')}
                      className="px-3 py-1.5 rounded border border-[#262c36] bg-[#171b23] hover:text-white text-[#a0aab8] text-xs font-medium cursor-pointer"
                    >
                      + Add Station Spawn
                    </button>
                  </>
                )}
              </div>
            </EmptyState>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-[#262c36] shrink-0 flex items-center justify-between gap-2 bg-[#11141a]">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[#eef2f7] truncate">
                    {activeSubTab === 'wares'
                      ? activeWare?.name
                      : activeSubTab === 'jobs'
                        ? activeJob?.name
                        : activeId}
                  </h2>
                  <p className="text-[11px] text-[#687385] font-mono mt-0.5 truncate">
                    {projectPath} · ID: {activeId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteActiveItem}
                  className="px-2.5 py-1.5 text-rose-300 border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20 rounded text-[11px] font-medium cursor-pointer transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Trash className="w-3.5 h-3.5" />
                  Remove Item
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {activeItemEconomyDiagnostics.length > 0 && (
                  <div
                    data-testid="economy-inline-diagnostics"
                    className={`p-3 rounded-lg border space-y-1.5 ${
                      activeItemEconomyDiagnostics.some(d => d.severity === 'error')
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : 'bg-amber-500/10 border-amber-500/30'
                    }`}
                  >
                    {activeItemEconomyDiagnostics.map(diag => (
                      <div
                        key={`${diag.code}:${diag.targetId}`}
                        className="flex items-center gap-2 text-xs text-[#eef2f7]"
                      >
                        <StatusPill tone={diag.severity}>{diag.code}</StatusPill>
                        <span>{diag.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {activeItemDiskWarnings.length > 0 && (
                  <div
                    className={`p-3 rounded-lg border space-y-1.5 ${
                      activeItemDiskWarnings.some(w => w.severity === 'error')
                        ? 'bg-rose-500/10 border-rose-500/25'
                        : 'bg-amber-500/10 border-amber-500/25'
                    }`}
                  >
                    <div
                      className={`text-xs font-semibold flex items-center gap-1.5 ${
                        activeItemDiskWarnings.some(w => w.severity === 'error')
                          ? 'text-rose-300'
                          : 'text-amber-300'
                      }`}
                    >
                      <BadgeAlert className="w-4 h-4" />
                      <span>Mod Conflicts &amp; Warnings</span>
                    </div>
                    {activeItemDiskWarnings.map(w => (
                      <div key={w.id} className="text-xs text-[#a0aab8]">
                        <strong className="text-[#eef2f7]">{w.title}:</strong> {w.message}
                        <div className="text-[11px] font-mono text-[#687385]">Target: {w.location}</div>
                      </div>
                    ))}
                  </div>
                )}

                {activeSubTab === 'wares' && activeWare && (
                  <div className="space-y-4 max-w-2xl">
                    <datalist id="ware-group-suggestions">
                      {WARE_GROUPS.map(g => (
                        <option key={g} value={g} />
                      ))}
                    </datalist>

                    <div className={ECO_CARD_CLS}>
                      <div className={ECO_SECTION_TITLE_CLS}>
                        <span>Ware Identity &amp; X4 9.00 Classification</span>
                        <StatusPill tone="info">{activeWare.transport}</StatusPill>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={ECO_LABEL_CLS}>Ware Display Name</label>
                          <input
                            type="text"
                            value={activeWare.name}
                            onChange={e => handleUpdateActiveWareProp('name', e.target.value)}
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Cargo Transport Method</label>
                          <select
                            value={activeWare.transport}
                            onChange={e =>
                              handleUpdateActiveWareProp('transport', e.target.value as WareTransport)
                            }
                            className={ECO_SELECT_CLS}
                          >
                            {ALL_WARE_TRANSPORTS.map(t => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Ware Group (group)</label>
                          <input
                            type="text"
                            data-testid="ware-group-input"
                            list="ware-group-suggestions"
                            value={activeWare.group || ''}
                            onChange={e =>
                              handleUpdateActiveWareProp('group', e.target.value || undefined)
                            }
                            placeholder="hightech, refined, shiptech..."
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Factory Name (factoryname)</label>
                          <input
                            type="text"
                            data-testid="ware-factoryname-input"
                            value={activeWare.factoryName || ''}
                            onChange={e =>
                              handleUpdateActiveWareProp('factoryName', e.target.value || undefined)
                            }
                            placeholder="{20201,404} or custom name"
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Ware Tags</label>
                          <input
                            type="text"
                            value={activeWare.tags || ''}
                            onChange={e => handleUpdateActiveWareProp('tags', e.target.value)}
                            placeholder="economy equipment"
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Component Macro Ref (&lt;component ref&gt;)</label>
                          <input
                            type="text"
                            data-testid="ware-componentref-input"
                            value={activeWare.componentRef || ''}
                            onChange={e =>
                              handleUpdateActiveWareProp('componentRef', e.target.value || undefined)
                            }
                            placeholder="ship_arg_m_corvette_01_a_macro"
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={ECO_LABEL_CLS}>Cargo Volume (m3)</label>
                          <input
                            type="number"
                            value={activeWare.volume}
                            onChange={e => handleUpdateActiveWareProp('volume', Number(e.target.value))}
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Production Assembly Cycle</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={activeWare.prodTime}
                              onChange={e => handleUpdateActiveWareProp('prodTime', Number(e.target.value))}
                              className={ECO_INPUT_CLS}
                              placeholder="sec"
                            />
                            <span className="text-[11px] text-[#687385] shrink-0">sec for</span>
                            <input
                              type="number"
                              value={activeWare.prodAmount}
                              onChange={e => handleUpdateActiveWareProp('prodAmount', Number(e.target.value))}
                              className={ECO_INPUT_CLS}
                              placeholder="qty"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={ECO_CARD_CLS}>
                      <div className={ECO_SECTION_TITLE_CLS}>
                        <span>Primary Production Recipe (&lt;production&gt;)</span>
                        <button
                          type="button"
                          onClick={addPrimaryWare}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/35 text-blue-200 text-[11px] font-medium cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Add input
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={ECO_LABEL_CLS}>Method</label>
                          <input
                            type="text"
                            value={activeWare.productionMethod || 'default'}
                            onChange={e => handleUpdateActiveWareProp('productionMethod', e.target.value)}
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Recipe Name</label>
                          <input
                            type="text"
                            value={activeWare.productionName || ''}
                            onChange={e => handleUpdateActiveWareProp('productionName', e.target.value)}
                            placeholder="Assembly output"
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        {getPrimaryWares().length === 0 && (
                          <p className="text-[11px] text-[#687385]">
                            No primary inputs — raw harvestable resource or external input.
                          </p>
                        )}
                        {getPrimaryWares().map((entry, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <ObjectIndexPicker
                                kind="ware"
                                endpoint="/api/reference/suggest"
                                value={entry.ware}
                                onChange={v => updatePrimaryWare(i, 'ware', v)}
                                placeholder="Search ware…"
                              />
                            </div>
                            <input
                              type="number"
                              min={1}
                              value={entry.amount}
                              onChange={e =>
                                updatePrimaryWare(i, 'amount', Number(e.target.value) || e.target.value)
                              }
                              title="Amount consumed per production cycle"
                              className="w-24 px-2 py-1.5 rounded bg-[#090b0f] border border-[#262c36] text-emerald-300 text-center font-mono text-xs focus:outline-none focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => removePrimaryWare(i)}
                              title="Remove input"
                              className="p-1.5 rounded text-[#687385] hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Multi-method Additional Production Recipes */}
                    <div className={ECO_CARD_CLS}>
                      <div className={ECO_SECTION_TITLE_CLS}>
                        <span>Additional Production Methods (Terran / Teladi / Closed Loop)</span>
                        <button
                          type="button"
                          data-testid="ware-add-method-btn"
                          onClick={() => {
                            const existing = activeWare.additionalProductions || [];
                            const nextProd: WareProductionDef = {
                              method: 'teladi',
                              name: 'Teladi Method',
                              time: activeWare.prodTime || 30,
                              amount: activeWare.prodAmount || 10,
                              primaryWares: [{ ware: 'teladianium', amount: 10 }],
                            };
                            handleUpdateActiveWareProp('additionalProductions', [...existing, nextProd]);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/35 text-blue-200 text-[11px] font-medium cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Add method
                        </button>
                      </div>
                      {(activeWare.additionalProductions || []).length === 0 ? (
                        <p className="text-[11px] text-[#687385]">
                          Single production method only. Add alternate faction recipes (e.g. <code className="font-mono">teladi</code>, <code className="font-mono">terran</code>,
                          <code className="font-mono">closedloop</code>) to support multiple shipyard/station blueprints.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {(activeWare.additionalProductions || []).map((alt, altIdx) => (
                            <div
                              key={altIdx}
                              className="p-3 rounded border border-[#262c36] bg-[#090b0f] space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-blue-300">
                                  Method #{altIdx + 2}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateActiveWareProp(
                                      'additionalProductions',
                                      (activeWare.additionalProductions || []).filter((_, i) => i !== altIdx),
                                    )
                                  }
                                  className="text-[11px] text-[#687385] hover:text-rose-300 cursor-pointer"
                                >
                                  Remove method
                                </button>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <input
                                  type="text"
                                  data-testid={`ware-alt-method-${altIdx}`}
                                  value={alt.method}
                                  onChange={e => {
                                    const list = [...(activeWare.additionalProductions || [])];
                                    list[altIdx] = { ...alt, method: e.target.value };
                                    handleUpdateActiveWareProp('additionalProductions', list);
                                  }}
                                  placeholder="teladi"
                                  className={ECO_INPUT_CLS}
                                />
                                <input
                                  type="text"
                                  value={alt.name || ''}
                                  onChange={e => {
                                    const list = [...(activeWare.additionalProductions || [])];
                                    list[altIdx] = { ...alt, name: e.target.value || undefined };
                                    handleUpdateActiveWareProp('additionalProductions', list);
                                  }}
                                  placeholder="Recipe name"
                                  className={ECO_INPUT_CLS}
                                />
                                <input
                                  type="number"
                                  value={alt.time}
                                  onChange={e => {
                                    const list = [...(activeWare.additionalProductions || [])];
                                    list[altIdx] = { ...alt, time: Number(e.target.value) || 0 };
                                    handleUpdateActiveWareProp('additionalProductions', list);
                                  }}
                                  placeholder="sec"
                                  className={ECO_INPUT_CLS}
                                />
                                <input
                                  type="number"
                                  value={alt.amount}
                                  onChange={e => {
                                    const list = [...(activeWare.additionalProductions || [])];
                                    list[altIdx] = { ...alt, amount: Number(e.target.value) || 0 };
                                    handleUpdateActiveWareProp('additionalProductions', list);
                                  }}
                                  placeholder="amount"
                                  className={ECO_INPUT_CLS}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={ECO_CARD_CLS}>
                      <div className={ECO_SECTION_TITLE_CLS}>
                        <span>Dynamic Pricing Matrix (Credits)</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className={ECO_LABEL_CLS}>Min Floor</label>
                          <input
                            type="number"
                            data-testid="ware-min-price-input"
                            value={activeWare.minPrice}
                            onChange={e => handleUpdateActiveWareProp('minPrice', Number(e.target.value))}
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Average</label>
                          <input
                            type="number"
                            data-testid="ware-avg-price-input"
                            value={activeWare.avgPrice}
                            onChange={e => handleUpdateActiveWareProp('avgPrice', Number(e.target.value))}
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Max Ceiling</label>
                          <input
                            type="number"
                            data-testid="ware-max-price-input"
                            value={activeWare.maxPrice}
                            onChange={e => handleUpdateActiveWareProp('maxPrice', Number(e.target.value))}
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={ECO_LABEL_CLS}>Economic Description</label>
                        <textarea
                          value={activeWare.description}
                          onChange={e => handleUpdateActiveWareProp('description', e.target.value)}
                          className="w-full p-2.5 h-16 rounded-md bg-[#090b0f] border border-[#262c36] text-[#eef2f7] text-xs focus:outline-none focus:border-blue-500 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeSubTab === 'baskets' && activeBasket && (
                  <BasketEditorPanel
                    basket={activeBasket}
                    workspaceWareIds={wares.map(w => w.id)}
                    onChange={updated => savePatches(upsertBasketPatchBlock(xmlPatches, updated))}
                  />
                )}

                {activeSubTab === 'jobs' && activeJob && (
                  <div className="space-y-4 max-w-2xl">
                    <datalist id="job-order-suggestions">
                      {workspaceOrderIds.map(oid => (
                        <option key={`ws:${oid}`} value={oid} />
                      ))}
                      {VANILLA_JOB_ORDERS.map(oid => (
                        <option key={`ego:${oid}`} value={oid} />
                      ))}
                    </datalist>
                    <datalist id="job-basket-suggestions">
                      {baskets.map(b => (
                        <option key={`ws:${b.id}`} value={b.id} />
                      ))}
                      {VANILLA_BASKET_PRESETS.map(b => (
                        <option key={`ego:${b}`} value={b} />
                      ))}
                    </datalist>

                    <div className={ECO_CARD_CLS}>
                      <div className={ECO_SECTION_TITLE_CLS}>
                        <span>Job Identity, Ship &amp; Faction</span>
                        <StatusPill tone="info">{activeJob.faction}</StatusPill>
                      </div>
                      <div>
                        <label className={ECO_LABEL_CLS}>Job Name Description</label>
                        <input
                          type="text"
                          value={activeJob.name}
                          onChange={e => handleUpdateActiveJobProp('name', e.target.value)}
                          className={ECO_INPUT_CLS}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={ECO_LABEL_CLS}>Owning Faction</label>
                          <ObjectIndexPicker
                            kind="faction"
                            endpoint="/api/reference/suggest"
                            value={activeJob.faction}
                            onChange={v => handleUpdateActiveJobProp('faction', v)}
                            placeholder="Search factions… (stores the short code)"
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Legacy Task Script (or leave blank when using Order)</label>
                          <ObjectIndexPicker
                            kind="aiscript"
                            endpoint="/api/reference/suggest"
                            value={activeJob.taskScript}
                            onChange={value => handleUpdateActiveJobProp('taskScript', value)}
                            placeholder="Search canonical/project AI scripts…"
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Ship Class</label>
                          <select
                            value={activeJob.shipClass}
                            onChange={e =>
                              handleUpdateActiveJobProp(
                                'shipClass',
                                e.target.value as JobDef['shipClass'],
                              )
                            }
                            className={ECO_SELECT_CLS}
                          >
                            {SHIP_CLASSES.map(c => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Ship Size (&lt;select size=&quot;...&quot;&gt;)</label>
                          <select
                            data-testid="job-ship-size-select"
                            value={activeJob.shipSize || ''}
                            onChange={e =>
                              handleUpdateActiveJobProp(
                                'shipSize',
                                (e.target.value || undefined) as JobShipSize | undefined,
                              )
                            }
                            className={ECO_SELECT_CLS}
                          >
                            {SHIP_SIZES.map(s => (
                              <option key={s.value || 'auto'} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className={ECO_LABEL_CLS}>Ship Macro</label>
                        <ObjectIndexPicker
                          kind="macro"
                          endpoint="/api/reference/suggest"
                          value={activeJob.shipMacro}
                          onChange={value => handleUpdateActiveJobProp('shipMacro', value)}
                          placeholder="Search canonical ship macros…"
                        />
                      </div>
                    </div>

                    {/* X4 9.00 Default Order & Trade Basket */}
                    <div className={ECO_CARD_CLS}>
                      <div className={ECO_SECTION_TITLE_CLS}>
                        <span>X4 9.00 Default Order (&lt;orders&gt;) &amp; Trade Basket</span>
                        <button
                          type="button"
                          data-testid="job-add-order-param-btn"
                          onClick={() =>
                            handleUpdateActiveJobProp('orderParams', [
                              ...(activeJob.orderParams || []),
                              { name: 'range', value: 'sector' },
                            ])
                          }
                          className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/35 text-blue-200 text-[11px] font-medium cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Add param
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={ECO_LABEL_CLS}>
                            Default Order ID (links AI Scripts &lt;order id&gt; or Vanilla)
                          </label>
                          <input
                            type="text"
                            data-testid="job-order-id-input"
                            list="job-order-suggestions"
                            value={activeJob.orderId || ''}
                            onChange={e =>
                              handleUpdateActiveJobProp('orderId', e.target.value || undefined)
                            }
                            placeholder="Patrol, TradeRoutine, MiningRoutine..."
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Ware Basket (&lt;basket basket=&quot;...&quot;&gt;)</label>
                          <input
                            type="text"
                            data-testid="job-basket-input"
                            list="job-basket-suggestions"
                            value={activeJob.basket || ''}
                            onChange={e =>
                              handleUpdateActiveJobProp('basket', e.target.value || undefined)
                            }
                            placeholder="bio, hightech, or custom basket..."
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={ECO_LABEL_CLS}>Category Tags (&lt;category tags=&quot;...&quot;&gt;)</label>
                        <input
                          type="text"
                          value={activeJob.categoryTags || ''}
                          onChange={e =>
                            handleUpdateActiveJobProp('categoryTags', e.target.value || undefined)
                          }
                          placeholder="[factionlogic, freighter, trader]"
                          className={ECO_INPUT_CLS}
                        />
                      </div>

                      {(activeJob.orderParams || []).length > 0 && (
                        <div className="space-y-2 pt-1">
                          {(activeJob.orderParams || []).map((param, pIdx) => (
                            <div key={pIdx} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={param.name}
                                onChange={e => {
                                  const next = [...(activeJob.orderParams || [])];
                                  next[pIdx] = { ...param, name: e.target.value };
                                  handleUpdateActiveJobProp('orderParams', next);
                                }}
                                placeholder="param name"
                                className={ECO_INPUT_CLS}
                              />
                              <input
                                type="text"
                                value={param.value}
                                onChange={e => {
                                  const next = [...(activeJob.orderParams || [])];
                                  next[pIdx] = { ...param, value: e.target.value };
                                  handleUpdateActiveJobProp('orderParams', next);
                                }}
                                placeholder="value"
                                className={ECO_INPUT_CLS}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateActiveJobProp(
                                    'orderParams',
                                    (activeJob.orderParams || []).filter((_, i) => i !== pIdx),
                                  )
                                }
                                className="p-1.5 rounded text-[#687385] hover:text-rose-300 cursor-pointer"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Spawn Quotas, Location & Environment */}
                    <div className={ECO_CARD_CLS}>
                      <div className={ECO_SECTION_TITLE_CLS}>
                        <span>Quotas, Spawn Location (&lt;location&gt;) &amp; Environment</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={ECO_LABEL_CLS}>Max Galaxy Spawns</label>
                          <input
                            type="number"
                            value={activeJob.galaxyQuota}
                            onChange={e =>
                              handleUpdateActiveJobProp('galaxyQuota', Number(e.target.value))
                            }
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Max Sector Spawns</label>
                          <input
                            type="number"
                            value={activeJob.sectorQuota}
                            onChange={e =>
                              handleUpdateActiveJobProp('sectorQuota', Number(e.target.value))
                            }
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className={ECO_LABEL_CLS}>Location Class</label>
                          <select
                            value={activeJob.locationClass || ''}
                            onChange={e =>
                              handleUpdateActiveJobProp(
                                'locationClass',
                                (e.target.value || undefined) as JobDef['locationClass'],
                              )
                            }
                            className={ECO_SELECT_CLS}
                          >
                            <option value="">Default (none emitted)</option>
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
                            value={activeJob.locationMacro || ''}
                            onChange={e =>
                              handleUpdateActiveJobProp('locationMacro', e.target.value || undefined)
                            }
                            placeholder="xu_ep2_universe_macro"
                            className={ECO_INPUT_CLS}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[#a0aab8]">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeJob.rebuildOnDestroy}
                            onChange={e =>
                              handleUpdateActiveJobProp('rebuildOnDestroy', e.target.checked)
                            }
                            className="rounded border-[#262c36] bg-[#090b0f] text-blue-500 focus:ring-0"
                          />
                          <span>Rebuild if destroyed</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            data-testid="job-buildatshipyard-checkbox"
                            checked={Boolean(activeJob.buildAtShipyard)}
                            onChange={e =>
                              handleUpdateActiveJobProp(
                                'buildAtShipyard',
                                e.target.checked ? true : undefined,
                              )
                            }
                            className="rounded border-[#262c36] bg-[#090b0f] text-blue-500 focus:ring-0"
                          />
                          <span>Build at Shipyard (<code className="font-mono">buildatshipyard</code>)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(activeJob.commandeerable)}
                            onChange={e =>
                              handleUpdateActiveJobProp(
                                'commandeerable',
                                e.target.checked ? true : undefined,
                              )
                            }
                            className="rounded border-[#262c36] bg-[#090b0f] text-blue-500 focus:ring-0"
                          />
                          <span>Commandeerable</span>
                        </label>
                      </div>
                    </div>

                    {/* Subordinate Fleet Wings */}
                    <div className={ECO_CARD_CLS}>
                      <div className={ECO_SECTION_TITLE_CLS}>
                        <span>Subordinate Escort Wings (&lt;subordinates&gt;)</span>
                        <button
                          type="button"
                          data-testid="job-add-subordinate-btn"
                          onClick={() =>
                            handleUpdateActiveJobProp('subordinates', [
                              ...(activeJob.subordinates || []),
                              {
                                job: jobs[0]?.id || 'argon_fighter_patrol_s',
                                assignment: 'interception',
                                group: 1,
                                rebuild: true,
                              },
                            ])
                          }
                          className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/35 text-blue-200 text-[11px] font-medium cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Add subordinate
                        </button>
                      </div>
                      {(activeJob.subordinates || []).length === 0 ? (
                        <p className="text-[11px] text-[#687385]">
                          No subordinate wings assigned. Attach fighter/escort jobs using valid X4 9.00
                          assignments (<code className="font-mono">interception</code>, <code className="font-mono">defence</code>, <code className="font-mono">attack</code>, <code className="font-mono">trade</code>).
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {(activeJob.subordinates || []).map((sub, sIdx) => (
                            <div key={sIdx} className="grid grid-cols-1 sm:grid-cols-[1fr_150px_70px_auto] gap-2 items-center">
                              <input
                                type="text"
                                data-testid={`job-sub-id-${sIdx}`}
                                value={sub.job}
                                onChange={e => {
                                  const next = [...(activeJob.subordinates || [])];
                                  next[sIdx] = { ...sub, job: e.target.value };
                                  handleUpdateActiveJobProp('subordinates', next);
                                }}
                                placeholder="subordinate job id"
                                className={ECO_INPUT_CLS}
                              />
                              <select
                                value={sub.assignment || 'defence'}
                                onChange={e => {
                                  const next = [...(activeJob.subordinates || [])];
                                  next[sIdx] = { ...sub, assignment: e.target.value };
                                  handleUpdateActiveJobProp('subordinates', next);
                                }}
                                className={ECO_SELECT_CLS}
                              >
                                {SUBORDINATE_ASSIGNMENTS.map(a => (
                                  <option key={a} value={a}>
                                    {a}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={sub.group ?? 1}
                                onChange={e => {
                                  const next = [...(activeJob.subordinates || [])];
                                  next[sIdx] = { ...sub, group: Number(e.target.value) || 1 };
                                  handleUpdateActiveJobProp('subordinates', next);
                                }}
                                title="Wing group 1-10"
                                className={ECO_INPUT_CLS}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateActiveJobProp(
                                    'subordinates',
                                    (activeJob.subordinates || []).filter((_, i) => i !== sIdx),
                                  )
                                }
                                className="p-1.5 rounded text-[#687385] hover:text-rose-300 cursor-pointer"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeSubTab === 'god' && activeGod && (
                  <GodEntryEditorPanel
                    entry={activeGod}
                    workspaceWareIds={wares.map(w => w.id)}
                    onChange={updated => savePatches(upsertGodPatchBlock(xmlPatches, updated))}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Collapsible Live XML Preview Pane */}
        {showXmlPreview && (
          <div
            data-testid="library-xml-preview"
            className="w-[380px] xl:w-[440px] shrink-0 border-l border-[#262c36] bg-[#090b0f] flex flex-col overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-[#262c36] bg-[#141820] flex items-center justify-between gap-2 shrink-0">
              <span className="text-[11px] font-semibold text-[#eef2f7] truncate">
                {projectPath} ({isPatchMode ? 'RFC 5261 Diff' : 'Standalone XML'})
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(compiledPreviewXml);
                  setCopiedXml(true);
                  setTimeout(() => setCopiedXml(false), 1800);
                }}
                className="px-2 py-1 rounded border border-[#262c36] bg-[#171b23] text-[11px] text-[#a0aab8] hover:text-white flex items-center gap-1 cursor-pointer shrink-0"
              >
                {copiedXml ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedXml ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-[#a0aab8] select-text custom-scrollbar">
              {compiledPreviewXml}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
