/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  FileDiff,
  GitBranch,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
} from 'lucide-react';
import {
  AI_ATTENTION_LEVELS,
  AI_ORDER_CATEGORIES,
  AI_ORDER_PARAM_TYPES,
  normalizeAiAttentionLevel,
  type AIAction,
  type AIBehaviorScript,
  type AIInterruptHandler,
  type AIParam,
  type AIScriptDiffOp,
  type AIScriptPatchBlock,
  type AiAttentionTier,
  type ModWorkspace,
} from '../types';
import { lintAiscript } from '../lib/aiscriptLint';
import { indexSourceBackedAiScripts, type SourceBackedAiScript } from '../lib/domainSourceIndex';
import { compileScriptToXML } from '../lib/modCompiler';
import { openOrMaterializeInNativeEditor } from '../lib/nativeEditor';
import { promptDialog, toast } from '../lib/uiDialogs';
import { EmptyState, PanelHeader, StatusPill } from './ui';

export type { AIAction, AIBehaviorScript, AIParam } from '../types';

interface AIScriptEditorProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
}

type WorkbenchTab = 'order' | 'actions' | 'interrupts' | 'diff' | 'xml';

const ATTENTION_DESCRIPTIONS: Record<AiAttentionTier, string> = {
  unknown: 'OOS fallback — runs regardless of player proximity',
  ingalaxy: 'Galaxy-wide minimum LOD',
  incluster: 'Cluster visible LOD',
  sectorvisible: 'Sector visible on map',
  insector: 'Player in same sector (standard patrol/combat)',
  adjacentzone: 'Adjacent zone to player',
  visible: 'Object visible to player camera',
  inzone: 'Same zone as player',
  nearby: 'High-frequency close proximity',
  adjacentroom: 'Station interior adjacent room',
  inroom: 'Same station room as player',
};

const VANILLA_INTERRUPT_REFS = [
  'AttackHandler',
  'SectorChangeHandler',
  'MissileLockHandler',
  'ScannedHandler',
  'InspectedHandler',
  'ResupplyHandler',
  'TideHandler',
] as const;

export const DEFAULT_AI_SCRIPTS: AIBehaviorScript[] = [
  {
    id: 'ai_order_patrol_sector',
    name: 'order.forge.patrol.sector',
    description: 'Player/NPC sector patrol <order> script with X4 9.00 insector LOD, AttackHandler ref, save migration <patch>, and <label>/<resume> loop.',
    command: 'combat',
    attentionLevel: 'insector',
    version: 2,
    priority: 5,
    order: {
      id: 'ForgeSectorPatrol',
      name: '{1041, 391}',
      description: '{1041, 392}',
      category: 'combat',
      infinite: true,
      allowInLoop: false,
      requiresXml: '<match shiptype="shiptype.lasertower" negate="true" />\n<match class="class.spacesuit" negate="true" />',
      locationObject: '$space',
      locationCondition: '$space.exists',
    },
    params: [
      { name: 'space', type: 'sector', text: '{1041, 10007}', defaultValue: 'this.sector', required: true, comment: 'Target patrol sector' },
      { name: 'pursuetargets', type: 'bool', text: '{1041, 10091}', defaultValue: 'false', advanced: true, comment: 'Pursue fleeing hostiles' },
      { name: 'timeout', type: 'time', text: '{1041, 10034}', defaultValue: '15min', advanced: true, comment: 'Patrol duration limit', inputParams: [{ name: 'min', value: '0s' }, { name: 'max', value: '10h' }] },
    ],
    interrupts: [
      { id: 'int_p1', ref: 'AttackHandler' },
      {
        id: 'int_p2',
        event: 'event_object_hull_damaged',
        conditionsXml: '<event_object_hull_damaged object="this.ship" />',
        action: 'flee',
        actionsXml: '<run_interrupt_script name="\'move.flee\'" />',
        consume: false,
      },
    ],
    patches: [
      { id: 'pat_p1', sinceVersion: 2, early: false, comment: 'Initialize v2 sector scan state', actionsXml: '<set_value name="$lastscan" exact="0s" />' },
    ],
    actions: [
      { id: 'act_p1', command: 'label', label: 'Entry label', properties: { name: 'start' } },
      { id: 'act_p2', command: 'find_objects', label: 'Find hostile ships in sector', properties: { result: '$enemies', class: 'ship', space: '$space' } },
      { id: 'act_p3', command: 'move_to', label: 'Patrol sector center', properties: { object: 'this.ship', destination: '$space', flightbehaviour: 'flightbehaviour.generic', forceposition: 'false', finishonapproach: 'true', timeout: '20s' } },
      { id: 'act_p4', command: 'shoot', label: 'Engage nearest hostile', properties: { object: 'this.ship', target: '@$enemies.{1}', weaponmode: 'weaponmode.attackenemies' } },
      { id: 'act_p5', command: 'wait', label: 'Cycle delay', properties: { exact: '5s' } },
      { id: 'act_p6', command: 'resume', label: 'Return to start label', properties: { label: 'start' } },
    ],
  },
  {
    id: 'ai_order_mine_auto',
    name: 'order.forge.mine.auto',
    description: 'Resource harvesting <order> script using visible attention tier, order.dock delegation, and <label>/<resume>.',
    command: 'mining',
    attentionLevel: 'visible',
    version: 1,
    order: {
      id: 'ForgeAutoMine',
      name: '{1041, 411}',
      description: '{1041, 412}',
      category: 'mining',
      infinite: true,
      allowInLoop: false,
      locationObject: '$sector',
      locationCondition: '$sector.exists',
    },
    params: [
      { name: 'sector', type: 'sector', text: '{1041, 10007}', defaultValue: 'this.sector', required: true, comment: 'Harvest sector' },
      { name: 'ware', type: 'ware', text: '{1041, 10144}', defaultValue: 'ware.ore', required: true, comment: 'Mineral ware' },
    ],
    interrupts: [
      { id: 'int_m1', ref: 'TideHandler' },
    ],
    actions: [
      { id: 'act_m1', command: 'label', label: 'Mining loop start', properties: { name: 'start' } },
      { id: 'act_m2', command: 'find_objects', label: 'Locate asteroids', properties: { result: '$asteroids', class: 'asteroid', space: '$sector' } },
      { id: 'act_m3', command: 'move_to', label: 'Approach asteroid cluster', properties: { object: 'this.ship', destination: '@$asteroids.{1}', flightbehaviour: 'flightbehaviour.mining', forceposition: 'false', finishonapproach: 'true', timeout: '30s' } },
      { id: 'act_m4', command: 'wait', label: 'Harvest cycle', properties: { exact: '15s' } },
      { id: 'act_m5', command: 'dock_at', label: 'Dock at refinery via order.dock', properties: { destination: 'this.ship.commander' } },
      { id: 'act_m6', command: 'resume', label: 'Restart mining cycle', properties: { label: 'start' } },
    ],
  },
  {
    id: 'ai_diff_flee_tune',
    name: 'move.flee',
    description: 'Non-destructive RFC 5261 <diff> patch targeting vanilla aiscripts/move.flee.xml instead of shadowing the base script.',
    command: 'patch',
    attentionLevel: 'unknown',
    mode: 'diff',
    namespaced: true,
    params: [],
    interrupts: [],
    actions: [],
    diffOps: [
      {
        id: 'diff_op_1',
        op: 'add',
        sel: '//aiscript/init',
        pos: 'append',
        content: '<debug_text text="\'Forge flee patch active\'" chance="0" />',
      },
    ],
  },
];

const ACTION_PALETTE: Array<{ command: AIAction['command']; label: string }> = [
  { command: 'label', label: '<label>' },
  { command: 'resume', label: '<resume>' },
  { command: 'move_to', label: '<move_to>' },
  { command: 'run_script', label: '<run_script>' },
  { command: 'shoot', label: '<shoot_at>' },
  { command: 'find_objects', label: '<find_object>' },
  { command: 'wait', label: '<wait>' },
  { command: 'dock_at', label: 'order.dock' },
  { command: 'flee', label: 'move.flee' },
  { command: 'custom_xml', label: 'Custom XML' },
];

export default function AIScriptEditor({ workspace, setWorkspace }: AIScriptEditorProps) {
  const scripts = useMemo(() => workspace.aiScripts || [], [workspace.aiScripts]);
  const sourceScripts = useMemo(
    () => indexSourceBackedAiScripts(workspace),
    [workspace],
  );

  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(() => {
    if (scripts.length > 0) return scripts[0].id;
    if (sourceScripts.length > 0) return sourceScripts[0].id;
    return DEFAULT_AI_SCRIPTS[0].id;
  });
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('order');
  const [sourceTab, setSourceTab] = useState<'overview' | 'diff' | 'xml'>('overview');
  const [vanillaPreview, setVanillaPreview] = useState<{
    path: string;
    loading: boolean;
    content: string | null;
    error: string | null;
  } | null>(null);
  const [copiedXml, setCopiedXml] = useState(false);

  const modMatch = scripts.find(s => s.id === selectedScriptId);
  const sourceMatch: SourceBackedAiScript | null =
    !modMatch ? sourceScripts.find(s => s.id === selectedScriptId) || null : null;
  const presetMatch = DEFAULT_AI_SCRIPTS.find(s => s.id === selectedScriptId);
  const isSourceBacked = Boolean(sourceMatch && !modMatch);
  const isPreset = Boolean(presetMatch && !modMatch && !sourceMatch);
  const activeScript = modMatch || (!isSourceBacked ? presetMatch : undefined) || null;

  useEffect(() => {
    if (selectedScriptId) {
      const exists = Boolean(modMatch || sourceMatch || presetMatch);
      if (!exists) {
        setSelectedScriptId(scripts[0]?.id || sourceScripts[0]?.id || DEFAULT_AI_SCRIPTS[0].id);
      }
    }
  }, [scripts, sourceScripts, selectedScriptId, modMatch, sourceMatch, presetMatch]);

  useEffect(() => {
    setVanillaPreview(null);
    if (!sourceMatch) return;
    setSourceTab(sourceMatch.mode === 'diff' ? 'diff' : 'overview');
  }, [sourceMatch]);

  useEffect(() => {
    if (!activeScript) return;
    if (activeScript.mode === 'diff' && activeTab !== 'diff' && activeTab !== 'xml') {
      setActiveTab('diff');
    } else if (activeScript.mode !== 'diff' && activeTab === 'diff') {
      setActiveTab('order');
    }
  }, [activeScript, activeTab]);

  const compiledXml = useMemo(
    () => (activeScript ? compileScriptToXML(activeScript) : ''),
    [activeScript]
  );

  const lintFindings = useMemo(
    () => (activeScript && activeScript.mode !== 'diff' ? lintAiscript(compiledXml) : []),
    [activeScript, compiledXml]
  );
  const sourceLintFindings = useMemo(
    () => (sourceMatch && sourceMatch.mode === 'aiscript' && !sourceMatch.parseError ? lintAiscript(sourceMatch.rawXml) : []),
    [sourceMatch]
  );
  const activeLintFindings = isSourceBacked ? sourceLintFindings : lintFindings;
  const lintErrors = activeLintFindings.filter(f => f.severity === 'error');
  const lintWarnings = activeLintFindings.filter(f => f.severity === 'warning');

  const declaredLabels = useMemo(
    () =>
      (activeScript?.actions || [])
        .filter(a => a.command === 'label')
        .map(a => String(a.properties?.name || '').trim())
        .filter(Boolean),
    [activeScript]
  );

  const saveScriptsState = (newScripts: AIBehaviorScript[]) => {
    setWorkspace(prev => ({
      ...prev,
      aiScripts: newScripts,
    }));
  };

  const updateActiveScript = (updater: (script: AIBehaviorScript) => AIBehaviorScript) => {
    if (!activeScript || isPreset) return;
    saveScriptsState(scripts.map(s => (s.id === activeScript.id ? updater(s) : s)));
  };

  const handleInstantiateTemplate = (preset: AIBehaviorScript) => {
    const cloned: AIBehaviorScript = structuredClone(preset);
    const exists = scripts.some(s => s.name === cloned.name);
    cloned.id = `ai_script_${Date.now()}`;
    cloned.name = exists && cloned.mode !== 'diff' ? `${cloned.name}.custom` : cloned.name;
    saveScriptsState([...scripts, cloned]);
    setSelectedScriptId(cloned.id);
    toast(`Cloned "${cloned.name}" into workspace aiScripts.`, 'success');
  };

  const handleCreateNewScript = async () => {
    const name = await promptDialog(
      'Enter script file name under aiscripts/ (e.g., order.forge.escort):',
      'order.forge.escort'
    );
    if (!name) return;

    const newScript: AIBehaviorScript = {
      id: `ai_script_${Date.now()}`,
      name: name.trim(),
      description: 'X4 9.00 order/behavior script',
      command: 'combat',
      attentionLevel: 'insector',
      version: 1,
      mode: 'aiscript',
      order: {
        id: name.trim().replace(/[^a-zA-Z0-9]+/g, '_'),
        name: `'{1041, 391}'`,
        description: `'{1041, 392}'`,
        category: 'combat',
        infinite: true,
        allowInLoop: false,
      },
      params: [
        { name: 'target', type: 'object', text: '{1041, 10027}', defaultValue: 'null', required: false, comment: 'Target object' },
      ],
      interrupts: [{ id: `int_${Date.now()}`, ref: 'AttackHandler' }],
      patches: [],
      actions: [
        { id: `act_${Date.now()}_0`, command: 'label', label: 'Start label', properties: { name: 'start' } },
        { id: `act_${Date.now()}_1`, command: 'wait', label: 'Idle cycle', properties: { exact: '5s' } },
        { id: `act_${Date.now()}_2`, command: 'resume', label: 'Loop start', properties: { label: 'start' } },
      ],
      includeInBuild: true,
    };

    saveScriptsState([...scripts, newScript]);
    setSelectedScriptId(newScript.id);
    setActiveTab('order');
  };

  const handleDeleteScript = () => {
    if (!activeScript || isPreset) return;
    const filtered = scripts.filter(s => s.id !== activeScript.id);
    saveScriptsState(filtered);
    setSelectedScriptId(filtered[0]?.id || DEFAULT_AI_SCRIPTS[0].id);
  };

  const handleAddParam = () => {
    updateActiveScript(script => ({
      ...script,
      params: [
        ...(script.params || []),
        {
          name: `param_${(script.params || []).length + 1}`,
          type: script.order?.id ? 'number' : 'object',
          text: script.order?.id ? `'{1041, 10064}'` : undefined,
          defaultValue: '0',
          comment: 'Order parameter',
        },
      ],
    }));
  };

  const handleAddAction = (command: AIAction['command']) => {
    let defaults: Record<string, any> = {};
    let label = '';
    switch (command) {
      case 'label':
        defaults = { name: declaredLabels.includes('start') ? `step_${Date.now() % 1000}` : 'start' };
        label = 'Flow label anchor';
        break;
      case 'resume':
        defaults = { label: declaredLabels[0] || 'start' };
        label = 'Resume at label';
        break;
      case 'run_script':
        defaults = { name: "'move.generic'", result: '', paramsXml: '' };
        label = 'Delegate sub-script';
        break;
      case 'move_to':
        defaults = { object: 'this.ship', destination: '$target', flightbehaviour: 'flightbehaviour.generic', forceposition: 'false', finishonapproach: 'true', timeout: '10s' };
        label = 'Flight path movement';
        break;
      case 'flee':
        defaults = {};
        label = 'Run vanilla move.flee';
        break;
      case 'shoot':
        defaults = { object: 'this.ship', target: '$enemy', weaponmode: 'weaponmode.attackenemies' };
        label = 'Engage target';
        break;
      case 'dock_at':
        defaults = { destination: '$station' };
        label = 'Delegate to order.dock';
        break;
      case 'wait':
        defaults = { exact: '10s' };
        label = 'Wait duration';
        break;
      case 'find_objects':
        defaults = { result: '$targets', class: 'ship', space: 'this.sector' };
        label = 'Scan objects in space';
        break;
      case 'custom_xml':
        defaults = { rawXml: '<debug_text text="\'AI script step\'" chance="0" />' };
        label = 'Custom aiscripts.xsd XML';
        break;
    }

    const nextAct: AIAction = {
      id: `ai_act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      command,
      label,
      properties: defaults,
    };

    updateActiveScript(script => ({
      ...script,
      actions: [...(script.actions || []), nextAct],
    }));
  };

  const handleMoveAction = (index: number, delta: -1 | 1) => {
    updateActiveScript(script => {
      const list = [...(script.actions || [])];
      const targetIdx = index + delta;
      if (targetIdx < 0 || targetIdx >= list.length) return script;
      const [moved] = list.splice(index, 1);
      list.splice(targetIdx, 0, moved);
      return { ...script, actions: list };
    });
  };

  const handleAddInterruptRef = (refName: string) => {
    updateActiveScript(script => ({
      ...script,
      interrupts: [
        ...(script.interrupts || []),
        { id: `int_${Date.now()}`, ref: refName },
      ],
    }));
  };

  const handleAddInlineInterrupt = () => {
    updateActiveScript(script => ({
      ...script,
      interrupts: [
        ...(script.interrupts || []),
        {
          id: `int_${Date.now()}`,
          event: 'event_object_attacked',
          conditionsXml: '<event_object_attacked object="this.ship" />',
          action: 'flee',
          actionsXml: '<run_interrupt_script name="\'move.flee\'" />',
          consume: true,
        },
      ],
    }));
  };

  const handleAddPatch = () => {
    updateActiveScript(script => {
      const nextVersion = Math.max(1, (script.patches || []).reduce((m, p) => Math.max(m, p.sinceVersion), script.version || 1));
      const nextPatch: AIScriptPatchBlock = {
        id: `patch_${Date.now()}`,
        sinceVersion: nextVersion,
        early: false,
        comment: `Save migration since v${nextVersion}`,
        actionsXml: '<set_value name="$migrated" exact="true" />',
      };
      return {
        ...script,
        patches: [...(script.patches || []), nextPatch],
      };
    });
  };

  const handleAddDiffOp = () => {
    updateActiveScript(script => {
      const nextOp: AIScriptDiffOp = {
        id: `diff_${Date.now()}`,
        op: 'replace',
        sel: '//aiscript/attention/actions/wait',
        content: '<wait exact="2s" />',
      };
      return {
        ...script,
        diffOps: [...(script.diffOps || []), nextOp],
      };
    });
  };

  const currentAttention = activeScript ? normalizeAiAttentionLevel(activeScript.attentionLevel) : 'unknown';

  const inputClass =
    'w-full rounded border border-[#262c36] bg-[#0a0c10] px-2.5 py-1.5 text-[11px] text-[#eef2f7] focus:outline-none focus:border-[#3b82f6] disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div id="ai_script_editor_view" className="flex-1 bg-[#0c0e12] flex flex-col h-full overflow-hidden text-[#eef2f7]">
      <PanelHeader
        icon={<Cpu className="w-4 h-4 text-[#60a5fa]" />}
        title="AI Scripts"
        subtitle="aiscripts.xsd · common.xsd attentionlookup · RFC 5261 diff"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {(activeScript || sourceMatch) && (
              <StatusPill
                tone={
                  sourceMatch?.parseError
                    ? 'error'
                    : sourceMatch?.mode === 'diff'
                      ? 'info'
                      : lintErrors.length > 0
                        ? 'error'
                        : lintWarnings.length > 0
                          ? 'warning'
                          : 'success'
                }
                className="text-[11px]"
              >
                <span data-testid="ai-script-lint-badge" className="inline-flex items-center gap-1">
                  {sourceMatch?.parseError || lintErrors.length > 0 || lintWarnings.length > 0 ? (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  ) : sourceMatch?.mode === 'diff' ? (
                    <FileDiff className="w-3.5 h-3.5" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  {sourceMatch?.parseError
                    ? 'XML Parse Error'
                    : sourceMatch?.mode === 'diff'
                      ? `RFC 5261 Diff · ${sourceMatch.diffOps.length} op${sourceMatch.diffOps.length === 1 ? '' : 's'}`
                      : lintErrors.length > 0
                        ? `${lintErrors.length} error${lintErrors.length === 1 ? '' : 's'}`
                        : lintWarnings.length > 0
                          ? `${lintWarnings.length} warning${lintWarnings.length === 1 ? '' : 's'}`
                          : 'XSD & Lint Clean'}
                </span>
              </StatusPill>
            )}

            {activeScript && !isPreset && (
              <div className="inline-flex rounded border border-[#262c36] bg-[#0a0c10] p-0.5 text-[11px]">
                <button
                  type="button"
                  data-testid="ai-mode-aiscript"
                  onClick={() => updateActiveScript(s => ({ ...s, mode: 'aiscript' }))}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                    activeScript.mode !== 'diff'
                      ? 'bg-[#3b82f6]/20 text-[#93c5fd] font-medium'
                      : 'text-[#a0aab8] hover:text-[#eef2f7]'
                  }`}
                >
                  Full Script
                </button>
                <button
                  type="button"
                  data-testid="ai-mode-diff"
                  onClick={() =>
                    updateActiveScript(s => ({
                      ...s,
                      mode: 'diff',
                      namespaced: true,
                      diffOps: s.diffOps?.length
                        ? s.diffOps
                        : [{ id: `diff_${Date.now()}`, op: 'add', sel: '//aiscript/init', pos: 'append', content: '<debug_text text="\'patch\'" chance="0" />' }],
                    }))
                  }
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                    activeScript.mode === 'diff'
                      ? 'bg-[#3b82f6]/20 text-[#93c5fd] font-medium'
                      : 'text-[#a0aab8] hover:text-[#eef2f7]'
                  }`}
                >
                  RFC 5261 Diff
                </button>
              </div>
            )}

            {isSourceBacked && sourceMatch && (
              <button
                type="button"
                data-testid="ai-open-source-file-btn"
                onClick={async () => {
                  const result = await openOrMaterializeInNativeEditor(workspace, sourceMatch.path);
                  toast(result.message, result.ok ? 'success' : 'error');
                }}
                className="px-2.5 py-1 rounded border border-emerald-500/35 bg-emerald-500/12 hover:bg-emerald-500/20 text-[11px] font-medium text-emerald-200 cursor-pointer inline-flex items-center gap-1"
                title={`Open ${sourceMatch.path} in the IDE editor`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open File
              </button>
            )}

            {activeScript && !isPreset && (
              <button
                type="button"
                onClick={async () => {
                  const fileName = activeScript.name.endsWith('.xml') ? activeScript.name : `${activeScript.name}.xml`;
                  const result = await openOrMaterializeInNativeEditor(workspace, `aiscripts/${fileName}`);
                  toast(result.message, result.ok ? 'success' : 'error');
                }}
                className="px-2.5 py-1 rounded border border-[#262c36] bg-[#171b23] hover:border-[#3b82f6]/60 text-[11px] font-medium text-[#eef2f7] cursor-pointer inline-flex items-center gap-1"
                title="Open as a real file tab in the IDE"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#60a5fa]" />
                Open File
              </button>
            )}

            <button
              type="button"
              onClick={handleCreateNewScript}
              data-testid="ai-new-script-btn"
              className="px-2.5 py-1 rounded bg-[#3b82f6]/20 border border-[#3b82f6]/45 hover:bg-[#3b82f6]/30 text-[#93c5fd] font-medium text-[11px] cursor-pointer inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              New Script
            </button>

            {activeScript && !isPreset && (
              <button
                type="button"
                onClick={handleDeleteScript}
                className="p-1.5 rounded border border-[#262c36] text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                title="Delete selected AI script"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        }
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Navigation List */}
        <aside className="w-60 border-r border-[#262c36] bg-[#0e1117] flex flex-col shrink-0 overflow-hidden text-[11px]">
          <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
            <div className="space-y-1">
              <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-[#a0aab8]">
                <span>Workspace Scripts</span>
                <span data-testid="ai-workspace-script-count" className="text-[11px] font-mono text-[#687385]">{scripts.length + sourceScripts.length}</span>
              </div>
              {scripts.length === 0 && sourceScripts.length === 0 ? (
                <div className="px-2.5 py-3 rounded border border-dashed border-[#262c36] text-[11px] text-[#687385] leading-relaxed">
                  No custom AI scripts yet. Clone an X4 9.00 starter below or click New Script.
                </div>
              ) : (
                <>
                  {scripts.map(s => {
                    const selected = selectedScriptId === s.id;
                    const tier = s.mode === 'diff' ? 'diff' : normalizeAiAttentionLevel(s.attentionLevel);
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => setSelectedScriptId(s.id)}
                        className={`w-full text-left px-2.5 py-2 rounded border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[#171b23] border-[#3b82f6]/50 text-[#eef2f7]'
                            : 'bg-transparent border-transparent text-[#a0aab8] hover:bg-[#171b23]/60 hover:text-[#eef2f7]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate font-mono text-[11px] font-medium">{s.name || 'unnamed'}</span>
                          <span className="shrink-0 rounded bg-[#0a0c10] border border-[#262c36] px-1.5 py-0.5 text-[11px] font-mono text-[#93c5fd]">
                            {s.mode === 'diff' ? 'diff' : s.order?.id ? 'order' : 'script'}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#687385] font-mono truncate">
                          {s.mode === 'diff' ? `${s.diffOps?.length ?? 0} diff ops` : `${tier} · v${s.version ?? 1}`}
                        </div>
                      </button>
                    );
                  })}

                  {sourceScripts.length > 0 && (
                    <div data-testid="ai-source-scripts-section" className="pt-2 space-y-1">
                      <div className="px-2 py-0.5 flex items-center justify-between text-[11px] font-medium text-emerald-300/90">
                        <span>Source-Backed (Disk)</span>
                        <span className="font-mono text-[#687385]">{sourceScripts.length}</span>
                      </div>
                      {sourceScripts.map(s => {
                        const selected = selectedScriptId === s.id;
                        return (
                          <button
                            type="button"
                            key={s.id}
                            data-testid={`ai-source-script-${s.stem}`}
                            onClick={() => setSelectedScriptId(s.id)}
                            className={`w-full text-left px-2.5 py-2 rounded border transition-colors cursor-pointer ${
                              selected
                                ? 'bg-[#171b23] border-emerald-500/50 text-[#eef2f7]'
                                : 'bg-transparent border-transparent text-[#a0aab8] hover:bg-[#171b23]/60 hover:text-[#eef2f7]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="truncate font-mono text-[11px] font-medium">{s.name}</span>
                              <span className="shrink-0 inline-flex items-center gap-1">
                                <span className="rounded bg-[#0a0c10] border border-[#262c36] px-1.5 py-0.5 text-[11px] font-mono text-[#93c5fd]">
                                  {s.mode === 'diff' ? 'diff' : s.order?.id ? 'order' : 'script'}
                                </span>
                                <span className="rounded bg-emerald-500/15 border border-emerald-500/35 px-1.5 py-0.5 text-[11px] font-mono text-emerald-300">
                                  disk
                                </span>
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-[#687385] font-mono truncate">
                              {s.mode === 'diff'
                                ? `${s.diffOps.length} diff ops → ${s.targetVanillaPath}`
                                : `${s.attentionLevels[0] || 'aiscript'}${s.version !== undefined ? ` · v${s.version}` : ''} · ${s.path}`}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="border-t border-[#262c36] pt-3 space-y-1">
              <div className="px-2 py-1 text-[11px] font-semibold text-[#a0aab8]">X4 9.00 Starters</div>
              {DEFAULT_AI_SCRIPTS.map(preset => {
                const selected = isPreset && selectedScriptId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`rounded border transition-colors flex items-center justify-between gap-1 px-2 py-1.5 ${
                      selected
                        ? 'bg-[#171b23] border-[#3b82f6]/45 text-[#eef2f7]'
                        : 'border-transparent text-[#a0aab8] hover:bg-[#171b23]/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedScriptId(preset.id)}
                      className="flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <div className="truncate font-mono text-[11px] font-medium">{preset.name}</div>
                      <div className="text-[11px] text-[#687385] font-mono truncate">
                        {preset.mode === 'diff' ? 'RFC 5261 diff' : `${preset.attentionLevel} · ${preset.order?.category || 'script'}`}
                      </div>
                    </button>
                    <button
                      type="button"
                      data-testid={`ai-clone-preset-${preset.id}`}
                      onClick={() => handleInstantiateTemplate(preset)}
                      className="shrink-0 p-1 rounded border border-[#262c36] bg-[#0a0c10] text-[#60a5fa] hover:border-[#3b82f6]/60 cursor-pointer"
                      title="Clone starter into active mod"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main Workbench */}
        {isSourceBacked && sourceMatch ? (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div
              data-testid="ai-source-backed-banner"
              className="px-4 py-2 bg-[#141820] border-b border-[#262c36] flex items-center justify-between gap-3 text-[11px] shrink-0"
            >
              <span className="text-[#a0aab8] min-w-0 truncate">
                <span className="mr-2 inline-flex rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-emerald-300">
                  Source-Backed (Disk)
                </span>
                Indexed directly from <code className="text-[#eef2f7] font-mono">{sourceMatch.path}</code> — original XML bytes deploy losslessly without re-compilation.
              </span>
              <button
                type="button"
                onClick={async () => {
                  const result = await openOrMaterializeInNativeEditor(workspace, sourceMatch.path);
                  toast(result.message, result.ok ? 'success' : 'error');
                }}
                className="shrink-0 px-3 py-1 rounded border border-emerald-500/35 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 font-medium cursor-pointer inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Edit File on Disk
              </button>
            </div>

            <div className="px-4 py-2 border-b border-[#262c36] bg-[#11141a] flex items-center gap-1.5 shrink-0">
              {sourceMatch.mode === 'aiscript' ? (
                <button
                  type="button"
                  data-testid="ai-source-tab-overview"
                  onClick={() => setSourceTab('overview')}
                  className={`px-3 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                    sourceTab === 'overview' ? 'bg-[#3b82f6]/20 text-[#93c5fd] border border-[#3b82f6]/40' : 'text-[#a0aab8] hover:text-[#eef2f7]'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Overview &amp; Lint ({sourceMatch.params.length})
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="ai-source-tab-diff"
                  onClick={() => setSourceTab('diff')}
                  className={`px-3 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                    sourceTab === 'diff' ? 'bg-[#3b82f6]/20 text-[#93c5fd] border border-[#3b82f6]/40' : 'text-[#a0aab8] hover:text-[#eef2f7]'
                  }`}
                >
                  <FileDiff className="w-3.5 h-3.5" />
                  Diff Operations ({sourceMatch.diffOps.length})
                </button>
              )}

              <button
                type="button"
                data-testid="ai-source-tab-xml"
                onClick={() => setSourceTab('xml')}
                className={`px-3 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer ml-auto ${
                  sourceTab === 'xml' ? 'bg-[#3b82f6]/20 text-[#93c5fd] border border-[#3b82f6]/40' : 'text-[#a0aab8] hover:text-[#eef2f7]'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Source XML
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {sourceMatch.parseError && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-950/25 px-3.5 py-2.5 text-[11px] text-rose-200">
                  <span className="font-semibold mr-2">XML Parse Error:</span>
                  <span className="font-mono">{sourceMatch.parseError}</span>
                </div>
              )}

              {sourceTab === 'overview' && sourceMatch.mode === 'aiscript' && (
                <div className="space-y-4">
                  <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-3">
                    <h3 className="text-xs font-semibold text-[#eef2f7]">Indexed AIScript Summary</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 text-[11px]">
                      <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2.5">
                        <div className="text-[#687385]">Script Name</div>
                        <div className="font-mono text-[#eef2f7] mt-0.5 truncate">{sourceMatch.name}</div>
                      </div>
                      <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2.5">
                        <div className="text-[#687385]">Relative Path</div>
                        <div className="font-mono text-[#eef2f7] mt-0.5 truncate">{sourceMatch.path}</div>
                      </div>
                      <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2.5">
                        <div className="text-[#687385]">Version / Priority</div>
                        <div className="font-mono text-[#eef2f7] mt-0.5">
                          v{sourceMatch.version ?? 1}{sourceMatch.priority !== undefined ? ` · p${sourceMatch.priority}` : ''}
                        </div>
                      </div>
                      <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2.5">
                        <div className="text-[#687385]">Attention Tiers</div>
                        <div className="font-mono text-[#eef2f7] mt-0.5 truncate">
                          {sourceMatch.attentionLevels.join(', ') || 'none'}
                        </div>
                      </div>
                      <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2.5">
                        <div className="text-[#687385]">Interrupt Handlers</div>
                        <div className="font-mono text-[#eef2f7] mt-0.5">{sourceMatch.interruptCount}</div>
                      </div>
                      <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2.5">
                        <div className="text-[#687385]">Migration Patches</div>
                        <div className="font-mono text-[#eef2f7] mt-0.5">
                          {sourceMatch.patchVersions.length > 0 ? sourceMatch.patchVersions.map(v => `v${v}`).join(', ') : 'none'}
                        </div>
                      </div>
                    </div>
                  </section>

                  {sourceMatch.order && (
                    <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-2.5">
                      <h3 className="text-xs font-semibold text-[#eef2f7]">
                        AI Order (<code className="font-mono text-[#93c5fd]">{sourceMatch.order.id || 'order'}</code>)
                      </h3>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                        <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2">
                          <span className="text-[#687385] block">Name</span>
                          <span className="font-mono text-[#eef2f7]">{sourceMatch.order.name || '—'}</span>
                        </div>
                        <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2">
                          <span className="text-[#687385] block">Category</span>
                          <span className="font-mono text-[#eef2f7]">{sourceMatch.order.category || '—'}</span>
                        </div>
                        <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2">
                          <span className="text-[#687385] block">Infinite</span>
                          <span className="font-mono text-[#eef2f7]">{sourceMatch.order.infinite ? 'true' : 'false'}</span>
                        </div>
                        <div className="rounded border border-[#262c36] bg-[#0a0c10] p-2">
                          <span className="text-[#687385] block">Params</span>
                          <span className="font-mono text-[#eef2f7]">{sourceMatch.params.length}</span>
                        </div>
                      </div>
                    </section>
                  )}

                  {sourceMatch.params.length > 0 && (
                    <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-2.5">
                      <h3 className="text-xs font-semibold text-[#eef2f7]">Declared Parameters ({sourceMatch.params.length})</h3>
                      <div className="space-y-1.5">
                        {sourceMatch.params.map((p, idx) => (
                          <div key={`${p.name}_${idx}`} className="rounded border border-[#262c36] bg-[#0a0c10] px-3 py-2 flex items-center justify-between gap-3 text-[11px]">
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="font-mono font-semibold text-[#eef2f7]">{p.name || '(unnamed)'}</span>
                              <span className="rounded border border-[#262c36] bg-[#11141a] px-1.5 py-0.5 font-mono text-[#93c5fd]">{p.type}</span>
                              {p.required && <span className="text-amber-300 font-mono">required</span>}
                            </div>
                            <span className="font-mono text-[#687385] truncate">{p.text || p.defaultValue || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-[#eef2f7]">Static AIScript &amp; Order-Param Lint</h3>
                    {sourceLintFindings.length === 0 ? (
                      <div className="text-[11px] text-emerald-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        No static order-param, label, or signature findings in {sourceMatch.path}.
                      </div>
                    ) : (
                      <div className="space-y-1.5" data-testid="ai-lint-findings-list">
                        {sourceLintFindings.map((finding, i) => (
                          <div
                            key={`${finding.code}_${i}`}
                            className={`rounded border px-3 py-2 text-[11px] ${
                              finding.severity === 'error'
                                ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                                : 'border-amber-500/40 bg-amber-950/25 text-amber-200'
                            }`}
                          >
                            <span className="font-mono font-semibold mr-2">{finding.code}</span>
                            <span>{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {sourceTab === 'diff' && sourceMatch.mode === 'diff' && (
                <div className="space-y-4">
                  <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <h3 className="text-xs font-semibold text-[#eef2f7]">
                          Vanilla Target: <code className="font-mono text-[#93c5fd]">{sourceMatch.targetVanillaPath}</code>
                        </h3>
                        <p className="text-[11px] text-[#687385] mt-0.5">
                          RFC 5261 patch matching stem <code className="font-mono text-[#a0aab8]">{sourceMatch.stem}</code> against vanilla or effective extension files.
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid="ai-source-fetch-vanilla-btn"
                        onClick={async () => {
                          const target = sourceMatch.targetVanillaPath || `aiscripts/${sourceMatch.stem}.xml`;
                          setVanillaPreview({ path: target, loading: true, content: null, error: null });
                          try {
                            const res = await fetch(`/api/reference/effective-file?path=${encodeURIComponent(target)}`);
                            const data = await res.json();
                            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
                            setVanillaPreview({ path: target, loading: false, content: String(data.content || ''), error: null });
                          } catch (err) {
                            setVanillaPreview({
                              path: target,
                              loading: false,
                              content: null,
                              error: err instanceof Error ? err.message : String(err),
                            });
                          }
                        }}
                        className="px-2.5 py-1 rounded border border-[#262c36] bg-[#171b23] hover:border-[#3b82f6]/50 text-[11px] text-[#93c5fd] cursor-pointer"
                      >
                        Inspect Vanilla Target
                      </button>
                    </div>
                    {vanillaPreview && vanillaPreview.path === sourceMatch.targetVanillaPath && (
                      <div className="rounded border border-[#262c36] bg-[#090b0f] p-2.5 text-[11px] font-mono">
                        {vanillaPreview.loading ? (
                          <span className="text-[#a0aab8]">Loading vanilla reference...</span>
                        ) : vanillaPreview.error ? (
                          <span className="text-amber-300">Vanilla target unavailable: {vanillaPreview.error}</span>
                        ) : (
                          <pre className="max-h-48 overflow-auto whitespace-pre text-[#cbd5e1] custom-scrollbar">
                            {vanillaPreview.content}
                          </pre>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-2.5">
                    <h3 className="text-xs font-semibold text-[#eef2f7]">
                      RFC 5261 Operations ({sourceMatch.diffOps.length})
                    </h3>
                    <div className="space-y-2.5">
                      {sourceMatch.diffOps.map((op, idx) => (
                        <div
                          key={`${op.op}_${op.index}`}
                          data-testid={`ai-source-diff-op-${idx}`}
                          className="rounded border border-[#262c36] bg-[#0a0c10] p-3 space-y-2 text-[11px]"
                        >
                          <div className="flex items-center gap-2 flex-wrap font-mono">
                            <span className="rounded border border-[#3b82f6]/40 bg-[#3b82f6]/15 px-1.5 py-0.5 text-[#93c5fd] uppercase font-semibold">
                              {op.op}
                            </span>
                            {op.pos && (
                              <span className="rounded border border-[#262c36] bg-[#11141a] px-1.5 py-0.5 text-[#a0aab8]">
                                pos={op.pos}
                              </span>
                            )}
                            {op.attrType && (
                              <span className="rounded border border-[#262c36] bg-[#11141a] px-1.5 py-0.5 text-[#a0aab8]">
                                type={op.attrType}
                              </span>
                            )}
                            <span className="text-[#eef2f7] break-all">{op.sel || '(empty sel)'}</span>
                          </div>
                          {op.content && (
                            <pre className="rounded border border-[#262c36] bg-[#090b0f] p-2.5 font-mono text-[11px] text-[#cbd5e1] overflow-x-auto whitespace-pre">
                              {op.content}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {sourceTab === 'xml' && (
                <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#eef2f7]">
                      Source XML (<code className="font-mono text-[#a0aab8]">{sourceMatch.path}</code>)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(sourceMatch.rawXml);
                        setCopiedXml(true);
                        setTimeout(() => setCopiedXml(false), 1800);
                      }}
                      className="px-2.5 py-1 rounded border border-[#262c36] bg-[#0a0c10] text-[11px] text-[#eef2f7] inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedXml ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedXml ? 'Copied' : 'Copy XML'}
                    </button>
                  </div>

                  {sourceLintFindings.length > 0 && (
                    <div className="space-y-1.5" data-testid="ai-lint-findings-list">
                      {sourceLintFindings.map((finding, i) => (
                        <div
                          key={`${finding.code}_${i}`}
                          className={`rounded border px-3 py-2 text-[11px] ${
                            finding.severity === 'error'
                              ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                              : 'border-amber-500/40 bg-amber-950/25 text-amber-200'
                          }`}
                        >
                          <span className="font-mono font-semibold mr-2">{finding.code}</span>
                          <span>{finding.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <pre
                    data-testid="ai-xml-preview"
                    className="rounded border border-[#262c36] bg-[#090b0f] p-3 font-mono text-[11px] leading-relaxed text-[#cbd5e1] overflow-x-auto whitespace-pre"
                  >
                    {sourceMatch.rawXml}
                  </pre>
                </section>
              )}
            </div>
          </div>
        ) : !activeScript ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <EmptyState
              icon={<Bot className="w-6 h-6" />}
              title="No AI script selected"
              description="Clone an X4 9.00 reference starter from the left rail or click New Script."
            >
              <button
                type="button"
                onClick={handleCreateNewScript}
                className="px-3 py-1.5 rounded bg-[#3b82f6] text-white text-[11px] font-medium cursor-pointer"
              >
                New AI Script
              </button>
            </EmptyState>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {isPreset && (
              <div
                id="ai-preset-warning-banner"
                className="px-4 py-2 bg-[#171b23] border-b border-[#262c36] flex items-center justify-between gap-3 text-[11px] shrink-0"
              >
                <span className="text-[#a0aab8]">
                  Viewing read-only X4 9.00 starter <code className="text-[#eef2f7]">{activeScript.name}</code>. Clone it into your mod to edit parameters, handlers, and actions.
                </span>
                <button
                  type="button"
                  data-testid="ai-instantiate-banner-btn"
                  onClick={() => handleInstantiateTemplate(activeScript)}
                  className="shrink-0 px-3 py-1 rounded bg-[#3b82f6] hover:bg-[#2563eb] text-white font-medium cursor-pointer inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Clone to Mod
                </button>
              </div>
            )}

            {/* Workbench Subtabs */}
            <div className="px-4 py-2 border-b border-[#262c36] bg-[#11141a] flex items-center gap-1.5 shrink-0">
              {activeScript.mode !== 'diff' ? (
                <>
                  <button
                    type="button"
                    data-testid="ai-tab-order"
                    onClick={() => setActiveTab('order')}
                    className={`px-3 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'order' ? 'bg-[#3b82f6]/20 text-[#93c5fd] border border-[#3b82f6]/40' : 'text-[#a0aab8] hover:text-[#eef2f7]'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Order &amp; Params ({activeScript.params.length})
                  </button>
                  <button
                    type="button"
                    data-testid="ai-tab-actions"
                    onClick={() => setActiveTab('actions')}
                    className={`px-3 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'actions' ? 'bg-[#3b82f6]/20 text-[#93c5fd] border border-[#3b82f6]/40' : 'text-[#a0aab8] hover:text-[#eef2f7]'
                    }`}
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    Attention &amp; Actions ({activeScript.actions.length})
                  </button>
                  <button
                    type="button"
                    data-testid="ai-tab-interrupts"
                    onClick={() => setActiveTab('interrupts')}
                    className={`px-3 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'interrupts' ? 'bg-[#3b82f6]/20 text-[#93c5fd] border border-[#3b82f6]/40' : 'text-[#a0aab8] hover:text-[#eef2f7]'
                    }`}
                  >
                    Interrupts &amp; Patches ({(activeScript.interrupts?.length ?? 0) + (activeScript.patches?.length ?? 0)})
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  data-testid="ai-tab-diff"
                  onClick={() => setActiveTab('diff')}
                  className={`px-3 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'diff' ? 'bg-[#3b82f6]/20 text-[#93c5fd] border border-[#3b82f6]/40' : 'text-[#a0aab8] hover:text-[#eef2f7]'
                  }`}
                >
                  <FileDiff className="w-3.5 h-3.5" />
                  Diff Operations ({activeScript.diffOps?.length ?? 0})
                </button>
              )}

              <button
                type="button"
                data-testid="ai-tab-xml"
                onClick={() => setActiveTab('xml')}
                className={`px-3 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer ml-auto ${
                  activeTab === 'xml' ? 'bg-[#3b82f6]/20 text-[#93c5fd] border border-[#3b82f6]/40' : 'text-[#a0aab8] hover:text-[#eef2f7]'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                XML Preview
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'order' && activeScript.mode !== 'diff' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Left: Script + Order Definition */}
                  <div className="space-y-4">
                    <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-3">
                      <h3 className="text-xs font-semibold text-[#eef2f7]">AIScript Metadata</h3>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-[11px] text-[#a0aab8] mb-1">Script Name (<code className="font-mono text-[#eef2f7]">&lt;aiscript name&gt;</code>)</label>
                          <input
                            type="text"
                            disabled={isPreset}
                            value={activeScript.name}
                            onChange={e => updateActiveScript(s => ({ ...s, name: e.target.value }))}
                            className={`${inputClass} font-mono`}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#a0aab8] mb-1">Version</label>
                          <input
                            type="number"
                            min={0}
                            disabled={isPreset}
                            value={activeScript.version ?? 1}
                            onChange={e => updateActiveScript(s => ({ ...s, version: Math.max(0, Number(e.target.value) || 0) }))}
                            className={`${inputClass} font-mono`}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-[11px] text-[#a0aab8] mb-1">Description</label>
                          <input
                            type="text"
                            disabled={isPreset}
                            value={activeScript.description}
                            onChange={e => updateActiveScript(s => ({ ...s, description: e.target.value }))}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#a0aab8] mb-1">Priority</label>
                          <input
                            type="number"
                            min={0}
                            disabled={isPreset}
                            value={activeScript.priority ?? 0}
                            onChange={e => updateActiveScript(s => ({ ...s, priority: Math.max(0, Number(e.target.value) || 0) }))}
                            className={`${inputClass} font-mono`}
                          />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xs font-semibold text-[#eef2f7]">Player / NPC Order Definition (<code className="font-mono text-[#93c5fd]">&lt;order&gt;</code>)</h3>
                          <p className="text-[11px] text-[#687385]">Enables <code className="font-mono text-[#a0aab8]">orderparamlookup</code> types and ship order queue visibility.</p>
                        </div>
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-[#eef2f7] cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={isPreset}
                            data-testid="ai-order-enabled"
                            checked={Boolean(activeScript.order?.id)}
                            onChange={e =>
                              updateActiveScript(s => ({
                                ...s,
                                order: e.target.checked
                                  ? {
                                      id: s.name.replace(/[^a-zA-Z0-9]+/g, '_') || 'CustomOrder',
                                      name: '{1041, 391}',
                                      description: '{1041, 392}',
                                      category: 'combat',
                                      infinite: true,
                                      allowInLoop: false,
                                    }
                                  : undefined,
                              }))
                            }
                            className="accent-[#3b82f6]"
                          />
                          Declare <code className="font-mono text-[#93c5fd]">&lt;order&gt;</code>
                        </label>
                      </div>

                      {activeScript.order && (
                        <div className="space-y-2.5 pt-1 border-t border-[#262c36]">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] text-[#a0aab8] mb-1">Order ID</label>
                              <input
                                type="text"
                                disabled={isPreset}
                                value={activeScript.order.id}
                                onChange={e => updateActiveScript(s => ({ ...s, order: { ...s.order!, id: e.target.value } }))}
                                className={`${inputClass} font-mono`}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#a0aab8] mb-1">Category</label>
                              <select
                                disabled={isPreset}
                                value={activeScript.order.category || 'combat'}
                                onChange={e => updateActiveScript(s => ({ ...s, order: { ...s.order!, category: e.target.value as any } }))}
                                className={`${inputClass} font-mono`}
                              >
                                {AI_ORDER_CATEGORIES.map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] text-[#a0aab8] mb-1">UI Name (<code className="font-mono text-[#eef2f7]">&#123;page, id&#125;</code>)</label>
                              <input
                                type="text"
                                disabled={isPreset}
                                value={activeScript.order.name || ''}
                                onChange={e => updateActiveScript(s => ({ ...s, order: { ...s.order!, name: e.target.value } }))}
                                className={`${inputClass} font-mono`}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#a0aab8] mb-1">Location Object</label>
                              <input
                                type="text"
                                disabled={isPreset}
                                placeholder="$space"
                                value={activeScript.order.locationObject || ''}
                                onChange={e => updateActiveScript(s => ({ ...s, order: { ...s.order!, locationObject: e.target.value } }))}
                                className={`${inputClass} font-mono`}
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#a0aab8]">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                disabled={isPreset}
                                checked={Boolean(activeScript.order.infinite)}
                                onChange={e => updateActiveScript(s => ({ ...s, order: { ...s.order!, infinite: e.target.checked } }))}
                                className="accent-[#3b82f6]"
                              />
                              <code className="font-mono text-[#eef2f7]">infinite="true"</code>
                            </label>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                disabled={isPreset}
                                checked={activeScript.order.allowInLoop === false}
                                onChange={e => updateActiveScript(s => ({ ...s, order: { ...s.order!, allowInLoop: !e.target.checked } }))}
                                className="accent-[#3b82f6]"
                              />
                              <code className="font-mono text-[#eef2f7]">allowinloop="false"</code>
                            </label>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                disabled={isPreset}
                                checked={Boolean(activeScript.order.canPlayerCancel)}
                                onChange={e => updateActiveScript(s => ({ ...s, order: { ...s.order!, canPlayerCancel: e.target.checked } }))}
                                className="accent-[#3b82f6]"
                              />
                              <code className="font-mono text-[#eef2f7]">canplayercancel</code>
                            </label>
                          </div>

                          <div>
                            <label className="block text-[11px] text-[#a0aab8] mb-1"><code className="font-mono text-[#eef2f7]">&lt;requires&gt;</code> ship filters</label>
                            <textarea
                              disabled={isPreset}
                              rows={2}
                              value={activeScript.order.requiresXml || ''}
                              onChange={e => updateActiveScript(s => ({ ...s, order: { ...s.order!, requiresXml: e.target.value } }))}
                              className={`${inputClass} font-mono`}
                              placeholder='<match class="class.spacesuit" negate="true" />'
                            />
                          </div>
                        </div>
                      )}
                    </section>
                  </div>

                  {/* Right: Script / Order Parameters */}
                  <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-[#eef2f7]">Parameters (<code className="font-mono text-[#93c5fd]">&lt;params&gt;</code>)</h3>
                        <p className="text-[11px] text-[#687385]">
                          {activeScript.order?.id
                            ? 'Uses 16 aiscripts.xsd orderparamlookup types. Non-internal params require a text label.'
                            : 'Bare aiscript params emit name/default/comment only (enable <order> above for UI types).'}
                        </p>
                      </div>
                      {!isPreset && (
                        <button
                          type="button"
                          data-testid="ai-add-param"
                          onClick={handleAddParam}
                          className="px-2.5 py-1 rounded border border-[#262c36] bg-[#171b23] hover:border-[#3b82f6]/60 text-[11px] text-[#93c5fd] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Param
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      {activeScript.params.map((param, idx) => (
                        <div key={`${param.name}_${idx}`} className="rounded border border-[#262c36] bg-[#0a0c10] p-3 space-y-2">
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-5">
                              <label className="block text-[11px] text-[#687385] mb-0.5">Name</label>
                              <input
                                type="text"
                                disabled={isPreset}
                                value={param.name}
                                onChange={e =>
                                  updateActiveScript(s => ({
                                    ...s,
                                    params: s.params.map((p, i) => (i === idx ? { ...p, name: e.target.value } : p)),
                                  }))
                                }
                                className={`${inputClass} font-mono`}
                              />
                            </div>
                            <div className="col-span-5">
                              <label className="block text-[11px] text-[#687385] mb-0.5">Order Type</label>
                              <select
                                disabled={isPreset || !activeScript.order?.id}
                                value={param.type === 'boolean' ? 'bool' : param.type === 'faction' ? 'internal' : param.type}
                                onChange={e =>
                                  updateActiveScript(s => ({
                                    ...s,
                                    params: s.params.map((p, i) => (i === idx ? { ...p, type: e.target.value as AIParam['type'] } : p)),
                                  }))
                                }
                                className={`${inputClass} font-mono`}
                              >
                                {AI_ORDER_PARAM_TYPES.map(t => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </div>
                            <div className="col-span-2 flex justify-end pt-4">
                              {!isPreset && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      params: s.params.filter((_, i) => i !== idx),
                                    }))
                                  }
                                  className="p-1.5 rounded text-[#687385] hover:text-rose-400 cursor-pointer"
                                  title="Delete parameter"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] text-[#687385] mb-0.5">Default Expression</label>
                              <input
                                type="text"
                                disabled={isPreset}
                                value={param.defaultValue}
                                onChange={e =>
                                  updateActiveScript(s => ({
                                    ...s,
                                    params: s.params.map((p, i) => (i === idx ? { ...p, defaultValue: e.target.value } : p)),
                                  }))
                                }
                                className={`${inputClass} font-mono`}
                              />
                            </div>
                            {activeScript.order?.id && (
                              <div>
                                <label className="block text-[11px] text-[#687385] mb-0.5">Text Label (<code className="font-mono text-[#a0aab8]">text=""</code>)</label>
                                <input
                                  type="text"
                                  disabled={isPreset}
                                  data-testid={`ai-param-text-${idx}`}
                                  value={param.text ?? ''}
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      params: s.params.map((p, i) => (i === idx ? { ...p, text: e.target.value } : p)),
                                    }))
                                  }
                                  placeholder="{1041, 10064}"
                                  className={`${inputClass} font-mono`}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'actions' && activeScript.mode !== 'diff' && (
                <div className="space-y-4">
                  {/* Real X4 9.00 common.xsd attentionlookup bar */}
                  <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-[#eef2f7]">Attention Tier (<code className="font-mono text-[#93c5fd]">&lt;attention min="..."&gt;</code>)</h3>
                        <p className="text-[11px] text-[#a0aab8]">
                          {ATTENTION_DESCRIPTIONS[currentAttention]}
                        </p>
                      </div>
                      <select
                        disabled={isPreset}
                        data-testid="ai-attention-select"
                        value={currentAttention}
                        onChange={e => updateActiveScript(s => ({ ...s, attentionLevel: e.target.value as AiAttentionTier }))}
                        className="rounded border border-[#262c36] bg-[#0a0c10] px-3 py-1.5 font-mono text-[11px] text-[#eef2f7] focus:outline-none focus:border-[#3b82f6]"
                      >
                        {AI_ATTENTION_LEVELS.map(tier => (
                          <option key={tier} value={tier}>{tier}</option>
                        ))}
                      </select>
                    </div>
                  </section>

                  {/* Action Additions Toolbar */}
                  {!isPreset && (
                    <div className="rounded-lg border border-[#262c36] bg-[#11141a] p-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-[#a0aab8] mr-1">Add action:</span>
                      {ACTION_PALETTE.map(item => (
                        <button
                          key={item.command}
                          type="button"
                          data-testid={`ai-add-action-${item.command}`}
                          onClick={() => handleAddAction(item.command)}
                          className="px-2.5 py-1 rounded border border-[#262c36] bg-[#0a0c10] hover:border-[#3b82f6]/60 hover:text-[#93c5fd] font-mono text-[11px] text-[#eef2f7] cursor-pointer"
                        >
                          + {item.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Sequential Action Cards */}
                  <div className="space-y-2.5">
                    {activeScript.actions.map((act, idx) => (
                      <div key={act.id} className="rounded-lg border border-[#262c36] bg-[#11141a] p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-6 h-6 rounded bg-[#0a0c10] border border-[#262c36] flex items-center justify-center font-mono text-[11px] text-[#93c5fd] shrink-0">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              disabled={isPreset}
                              value={act.label}
                              onChange={e =>
                                updateActiveScript(s => ({
                                  ...s,
                                  actions: s.actions.map(a => (a.id === act.id ? { ...a, label: e.target.value } : a)),
                                }))
                              }
                              className="flex-1 bg-transparent border-b border-transparent focus:border-[#3b82f6] text-xs font-medium text-[#eef2f7] focus:outline-none py-0.5"
                            />
                            <span className="shrink-0 font-mono text-[11px] text-[#687385] bg-[#0a0c10] border border-[#262c36] px-2 py-0.5 rounded">
                              &lt;{act.command === 'dock_at' ? 'run_script order.dock' : act.command === 'flee' ? 'run_script move.flee' : act.command === 'shoot' ? 'shoot_at' : act.command === 'find_objects' ? 'find_object' : act.command}&gt;
                            </span>
                          </div>
                          {!isPreset && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button type="button" onClick={() => handleMoveAction(idx, -1)} className="p-1 text-[#a0aab8] hover:text-white cursor-pointer" title="Move up">
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => handleMoveAction(idx, 1)} className="p-1 text-[#a0aab8] hover:text-white cursor-pointer" title="Move down">
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => updateActiveScript(s => ({ ...s, actions: s.actions.filter(a => a.id !== act.id) }))}
                                className="p-1 text-[#687385] hover:text-rose-400 cursor-pointer"
                                title="Delete action"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-8">
                          {act.command === 'label' && (
                            <div>
                              <label className="block text-[11px] text-[#687385] mb-0.5">Label Name</label>
                              <input
                                type="text"
                                disabled={isPreset}
                                value={act.properties.name || ''}
                                onChange={e =>
                                  updateActiveScript(s => ({
                                    ...s,
                                    actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, name: e.target.value } } : a)),
                                  }))
                                }
                                className={`${inputClass} font-mono`}
                              />
                            </div>
                          )}

                          {act.command === 'resume' && (
                            <div>
                              <label className="block text-[11px] text-[#687385] mb-0.5">Target Label</label>
                              <input
                                type="text"
                                disabled={isPreset}
                                list={`labels_${act.id}`}
                                value={act.properties.label || ''}
                                onChange={e =>
                                  updateActiveScript(s => ({
                                    ...s,
                                    actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, label: e.target.value } } : a)),
                                  }))
                                }
                                className={`${inputClass} font-mono`}
                              />
                              <datalist id={`labels_${act.id}`}>
                                {declaredLabels.map(lbl => (
                                  <option key={lbl} value={lbl} />
                                ))}
                              </datalist>
                            </div>
                          )}

                          {act.command === 'run_script' && (
                            <>
                              <div>
                                <label className="block text-[11px] text-[#687385] mb-0.5">Script Name Expr</label>
                                <input
                                  type="text"
                                  disabled={isPreset}
                                  value={act.properties.name || ''}
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, name: e.target.value } } : a)),
                                    }))
                                  }
                                  className={`${inputClass} font-mono`}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-[#687385] mb-0.5">Result Var (optional)</label>
                                <input
                                  type="text"
                                  disabled={isPreset}
                                  value={act.properties.result || ''}
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, result: e.target.value } } : a)),
                                    }))
                                  }
                                  className={`${inputClass} font-mono`}
                                />
                              </div>
                            </>
                          )}

                          {act.command === 'move_to' && (
                            <>
                              <div>
                                <label className="block text-[11px] text-[#687385] mb-0.5">Destination</label>
                                <input
                                  type="text"
                                  disabled={isPreset}
                                  value={act.properties.destination || ''}
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, destination: e.target.value } } : a)),
                                    }))
                                  }
                                  className={`${inputClass} font-mono`}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-[#687385] mb-0.5">Flight Behaviour</label>
                                <input
                                  type="text"
                                  disabled={isPreset}
                                  value={act.properties.flightbehaviour || ''}
                                  placeholder="flightbehaviour.generic"
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, flightbehaviour: e.target.value } } : a)),
                                    }))
                                  }
                                  className={`${inputClass} font-mono`}
                                />
                              </div>
                            </>
                          )}

                          {act.command === 'shoot' && (
                            <>
                              <div>
                                <label className="block text-[11px] text-[#687385] mb-0.5">Target</label>
                                <input
                                  type="text"
                                  disabled={isPreset}
                                  value={act.properties.target || ''}
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, target: e.target.value } } : a)),
                                    }))
                                  }
                                  className={`${inputClass} font-mono`}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-[#687385] mb-0.5">Weapon Mode</label>
                                <select
                                  disabled={isPreset}
                                  value={act.properties.weaponmode || 'weaponmode.attackenemies'}
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, weaponmode: e.target.value } } : a)),
                                    }))
                                  }
                                  className={`${inputClass} font-mono`}
                                >
                                  <option value="weaponmode.any">weaponmode.any</option>
                                  <option value="weaponmode.attackenemies">weaponmode.attackenemies</option>
                                  <option value="weaponmode.attackcapital">weaponmode.attackcapital</option>
                                  <option value="weaponmode.attackfighters">weaponmode.attackfighters</option>
                                </select>
                              </div>
                            </>
                          )}

                          {act.command === 'dock_at' && (
                            <div>
                              <label className="block text-[11px] text-[#687385] mb-0.5">Dock Destination (<code className="font-mono text-[#a0aab8]">order.dock</code>)</label>
                              <input
                                type="text"
                                disabled={isPreset}
                                value={act.properties.destination ?? act.properties.station ?? ''}
                                onChange={e =>
                                  updateActiveScript(s => ({
                                    ...s,
                                    actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, destination: e.target.value } } : a)),
                                  }))
                                }
                                className={`${inputClass} font-mono`}
                              />
                            </div>
                          )}

                          {act.command === 'wait' && (
                            <div>
                              <label className="block text-[11px] text-[#687385] mb-0.5">Exact Duration (<code className="font-mono text-[#a0aab8]">exact</code>)</label>
                              <input
                                type="text"
                                disabled={isPreset}
                                value={act.properties.exact || ''}
                                placeholder="e.g. 5s"
                                onChange={e =>
                                  updateActiveScript(s => ({
                                    ...s,
                                    actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, exact: e.target.value } } : a)),
                                  }))
                                }
                                className={`${inputClass} font-mono`}
                              />
                            </div>
                          )}

                          {act.command === 'find_objects' && (
                            <>
                              <div>
                                <label className="block text-[11px] text-[#687385] mb-0.5">Class (<code className="font-mono text-[#a0aab8]">class.*</code>)</label>
                                <select
                                  disabled={isPreset}
                                  value={act.properties.class || 'ship'}
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, class: e.target.value } } : a)),
                                    }))
                                  }
                                  className={`${inputClass} font-mono`}
                                >
                                  <option value="ship">ship</option>
                                  <option value="asteroid">asteroid</option>
                                  <option value="station">station</option>
                                  <option value="wreck">wreck</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] text-[#687385] mb-0.5">Space (<code className="font-mono text-[#a0aab8]">this.sector</code>)</label>
                                <input
                                  type="text"
                                  disabled={isPreset}
                                  value={act.properties.space || 'this.sector'}
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, space: e.target.value } } : a)),
                                    }))
                                  }
                                  className={`${inputClass} font-mono`}
                                />
                              </div>
                            </>
                          )}

                          {act.command === 'custom_xml' && (
                            <div className="md:col-span-2">
                              <textarea
                                disabled={isPreset}
                                rows={3}
                                value={act.properties.rawXml || ''}
                                onChange={e =>
                                  updateActiveScript(s => ({
                                    ...s,
                                    actions: s.actions.map(a => (a.id === act.id ? { ...a, properties: { ...a.properties, rawXml: e.target.value } } : a)),
                                  }))
                                }
                                className={`${inputClass} font-mono`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'interrupts' && activeScript.mode !== 'diff' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Global Interrupt Handlers */}
                  <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-[#eef2f7]">Global Interrupts (<code className="font-mono text-[#93c5fd]">&lt;interrupts&gt;</code>)</h3>
                        <p className="text-[11px] text-[#687385]">Reference vanilla library handlers or author inline <code className="font-mono text-[#a0aab8]">&lt;conditions&gt;</code> + non-blocking <code className="font-mono text-[#a0aab8]">&lt;actions&gt;</code>.</p>
                      </div>
                      {!isPreset && (
                        <button
                          type="button"
                          onClick={handleAddInlineInterrupt}
                          className="px-2.5 py-1 rounded border border-[#262c36] bg-[#171b23] text-[11px] text-[#93c5fd] hover:border-[#3b82f6]/60 cursor-pointer"
                        >
                          + Inline Handler
                        </button>
                      )}
                    </div>

                    {!isPreset && (
                      <div className="flex flex-wrap gap-1.5">
                        {VANILLA_INTERRUPT_REFS.map(refName => (
                          <button
                            key={refName}
                            type="button"
                            onClick={() => handleAddInterruptRef(refName)}
                            className="px-2 py-0.5 rounded border border-[#262c36] bg-[#0a0c10] hover:border-[#3b82f6]/60 font-mono text-[11px] text-[#a0aab8] hover:text-[#eef2f7] cursor-pointer"
                          >
                            + ref="{refName}"
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2">
                      {(activeScript.interrupts || []).map((handler: AIInterruptHandler, idx) => (
                        <div key={handler.id} className="rounded border border-[#262c36] bg-[#0a0c10] p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-semibold text-[#93c5fd]">
                              {handler.ref ? `<handler ref="${handler.ref}" />` : `<handler> (${handler.event || 'inline'})`}
                            </span>
                            {!isPreset && (
                              <button
                                type="button"
                                onClick={() => updateActiveScript(s => ({ ...s, interrupts: s.interrupts.filter((_, i) => i !== idx) }))}
                                className="p-1 text-[#687385] hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          {!handler.ref && (
                            <div className="space-y-2">
                              <div>
                                <label className="block text-[11px] text-[#687385] mb-0.5">Conditions XML</label>
                                <input
                                  type="text"
                                  disabled={isPreset}
                                  value={handler.conditionsXml || ''}
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      interrupts: s.interrupts.map((h, i) => (i === idx ? { ...h, conditionsXml: e.target.value } : h)),
                                    }))
                                  }
                                  className={`${inputClass} font-mono`}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-[#687385] mb-0.5">Actions XML (non-blocking)</label>
                                <input
                                  type="text"
                                  disabled={isPreset}
                                  value={handler.actionsXml || ''}
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      interrupts: s.interrupts.map((h, i) => (i === idx ? { ...h, actionsXml: e.target.value } : h)),
                                    }))
                                  }
                                  className={`${inputClass} font-mono`}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Save-Game Migration Patches + Init/Abort */}
                  <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-[#eef2f7]">Save Migration <code className="font-mono text-[#93c5fd]">&lt;patch sinceversion&gt;</code></h3>
                        <p className="text-[11px] text-[#687385]">Runs non-blocking repair actions when saves load an older script version.</p>
                      </div>
                      {!isPreset && (
                        <button
                          type="button"
                          data-testid="ai-add-patch"
                          onClick={handleAddPatch}
                          className="px-2.5 py-1 rounded border border-[#262c36] bg-[#171b23] text-[11px] text-[#93c5fd] hover:border-[#3b82f6]/60 cursor-pointer"
                        >
                          + Add Patch
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {(activeScript.patches || []).map((patch, idx) => (
                        <div key={patch.id} className="rounded border border-[#262c36] bg-[#0a0c10] p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#a0aab8]">sinceversion=</span>
                              <input
                                type="number"
                                min={1}
                                disabled={isPreset}
                                value={patch.sinceVersion}
                                onChange={e =>
                                  updateActiveScript(s => ({
                                    ...s,
                                    patches: (s.patches || []).map((p, i) =>
                                      i === idx ? { ...p, sinceVersion: Math.max(1, Number(e.target.value) || 1) } : p
                                    ),
                                  }))
                                }
                                className="w-16 rounded border border-[#262c36] bg-[#11141a] px-2 py-0.5 font-mono text-[11px] text-[#eef2f7]"
                              />
                              <label className="inline-flex items-center gap-1 text-[11px] text-[#a0aab8] cursor-pointer">
                                <input
                                  type="checkbox"
                                  disabled={isPreset}
                                  checked={Boolean(patch.early)}
                                  onChange={e =>
                                    updateActiveScript(s => ({
                                      ...s,
                                      patches: (s.patches || []).map((p, i) => (i === idx ? { ...p, early: e.target.checked } : p)),
                                    }))
                                  }
                                  className="accent-[#3b82f6]"
                                />
                                early
                              </label>
                            </div>
                            {!isPreset && (
                              <button
                                type="button"
                                onClick={() => updateActiveScript(s => ({ ...s, patches: (s.patches || []).filter((_, i) => i !== idx) }))}
                                className="p-1 text-[#687385] hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <textarea
                            disabled={isPreset}
                            rows={2}
                            value={patch.actionsXml}
                            onChange={e =>
                              updateActiveScript(s => ({
                                ...s,
                                patches: (s.patches || []).map((p, i) => (i === idx ? { ...p, actionsXml: e.target.value } : p)),
                              }))
                            }
                            className={`${inputClass} font-mono`}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'diff' && activeScript.mode === 'diff' && (
                <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-[#eef2f7]">RFC 5261 <code className="font-mono text-[#93c5fd]">&lt;diff&gt;</code> Operations (<code className="font-mono text-[#a0aab8]">aiscripts/{activeScript.name}.xml</code>)</h3>
                      <p className="text-[11px] text-[#687385]">Patch vanilla scripts by XPath without replacing the whole script.</p>
                    </div>
                    {!isPreset && (
                      <button
                        type="button"
                        data-testid="ai-add-diff-op"
                        onClick={handleAddDiffOp}
                        className="px-2.5 py-1 rounded border border-[#262c36] bg-[#171b23] text-[11px] text-[#93c5fd] hover:border-[#3b82f6]/60 cursor-pointer"
                      >
                        + Add Diff Op
                      </button>
                    )}
                  </div>
                  <div className="space-y-2.5">
                    {(activeScript.diffOps || []).map((op, idx) => (
                      <div key={op.id} className="rounded border border-[#262c36] bg-[#0a0c10] p-3 space-y-2">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <select
                            disabled={isPreset}
                            value={op.op}
                            onChange={e =>
                              updateActiveScript(s => ({
                                ...s,
                                diffOps: (s.diffOps || []).map((d, i) => (i === idx ? { ...d, op: e.target.value as AIScriptDiffOp['op'] } : d)),
                              }))
                            }
                            className={`col-span-2 ${inputClass} font-mono`}
                          >
                            <option value="add">add</option>
                            <option value="replace">replace</option>
                            <option value="remove">remove</option>
                          </select>
                          <input
                            type="text"
                            disabled={isPreset}
                            value={op.sel}
                            onChange={e =>
                              updateActiveScript(s => ({
                                ...s,
                                diffOps: (s.diffOps || []).map((d, i) => (i === idx ? { ...d, sel: e.target.value } : d)),
                              }))
                            }
                            placeholder="//aiscript/attention/actions"
                            className={`col-span-9 ${inputClass} font-mono`}
                          />
                          {!isPreset && (
                            <button
                              type="button"
                              onClick={() => updateActiveScript(s => ({ ...s, diffOps: (s.diffOps || []).filter((_, i) => i !== idx) }))}
                              className="col-span-1 p-1 text-[#687385] hover:text-rose-400 cursor-pointer justify-self-end"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {op.op !== 'remove' && (
                          <textarea
                            disabled={isPreset}
                            rows={2}
                            value={op.content || ''}
                            onChange={e =>
                              updateActiveScript(s => ({
                                ...s,
                                diffOps: (s.diffOps || []).map((d, i) => (i === idx ? { ...d, content: e.target.value } : d)),
                              }))
                            }
                            className={`${inputClass} font-mono`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === 'xml' && (
                <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#eef2f7]">
                      Compiled XML (<code className="font-mono text-[#a0aab8]">aiscripts/{activeScript.name.endsWith('.xml') ? activeScript.name : `${activeScript.name}.xml`}</code>)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(compiledXml);
                        setCopiedXml(true);
                        setTimeout(() => setCopiedXml(false), 1800);
                      }}
                      className="px-2.5 py-1 rounded border border-[#262c36] bg-[#0a0c10] text-[11px] text-[#eef2f7] inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedXml ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedXml ? 'Copied' : 'Copy XML'}
                    </button>
                  </div>

                  {lintFindings.length > 0 && (
                    <div className="space-y-1.5" data-testid="ai-lint-findings-list">
                      {lintFindings.map((finding, i) => (
                        <div
                          key={`${finding.code}_${i}`}
                          className={`rounded border px-3 py-2 text-[11px] ${
                            finding.severity === 'error'
                              ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                              : 'border-amber-500/40 bg-amber-950/25 text-amber-200'
                          }`}
                        >
                          <span className="font-mono font-semibold mr-2">{finding.code}</span>
                          <span>{finding.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <pre
                    data-testid="ai-xml-preview"
                    className="rounded border border-[#262c36] bg-[#090b0f] p-3 font-mono text-[11px] leading-relaxed text-[#cbd5e1] overflow-x-auto whitespace-pre"
                  >
                    {compiledXml}
                  </pre>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
