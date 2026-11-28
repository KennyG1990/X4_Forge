/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  GitFork,
  Plus,
  Trash,
  Sliders,
  Sparkles,
  HelpCircle,
  Check,
  Bookmark,
  Search,
  Copy,
  PlusCircle,
  FileText,
  GitCompare,
  ExternalLink,
} from 'lucide-react';
import { ModWorkspace } from '../types';
import { compileDiffDocument as compileSharedDiffDocument } from '../lib/modCompiler';
import { indexSourceBackedDiffFiles } from '../lib/domainSourceIndex';
import { escapeXPathLiteral } from '../lib/xpathSynth';
import ObjectIndexPicker from './ObjectIndexPicker';
import XPathInput from './XPathInput';
import BulkTransformPanel, { type BulkWorkspaceBinding, type GuidedHullTarget } from './BulkTransformPanel';
import { openNativeTextDiff, openOrMaterializeInNativeEditor } from '../lib/nativeEditor';
import { toast } from '../lib/uiDialogs';

interface XMLPatchSystemProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  readWorkspaceBinding: () => BulkWorkspaceBinding;
  saveCheckpoint?: (customTarget?: ModWorkspace) => void;
  onServerWorkspaceApplied?: (workspace: ModWorkspace, metadata: { workspaceHash: string; snapshotHash: string; version: number }) => void;
}

export interface PatchBlock {
  id: string;
  sel: string;
  action: 'add' | 'replace' | 'remove';
  content: string;
  note: string;
  pos?: 'before' | 'after' | 'prepend' | 'append';
  attrType?: string;
  targetFile?: string;
  includeInBuild?: boolean;
  generatedRuleId?: string;
  generatedPlanHash?: string;
  sourceSignature?: string;
}

interface SynthesizedPatchOp {
  type: 'add' | 'replace' | 'remove';
  sel: string;
  pos?: 'child' | 'before';
  attrType?: string;
  content?: string;
}

interface SynthesizedPatchResult {
  success?: boolean;
  targetFile?: string | null;
  sourceSignature?: string | null;
  ops: SynthesizedPatchOp[];
  diffXml: string;
  warnings?: string[];
}

type DiffWorkspaceAuthority = Pick<BulkWorkspaceBinding, 'workspaceId' | 'authorityEpoch'> & {
  selectionRevision: number;
};

interface DiffTargetSession extends DiffWorkspaceAuthority {
  targetFile: string;
  sourceSignature: string;
  baseXml: string;
}

interface DiffSynthesisRequest {
  session: DiffTargetSession;
  editedXml: string;
  controller: AbortController;
}

type DiffSynthesisState =
  | { kind: 'pending'; request: DiffSynthesisRequest }
  | { kind: 'error'; request: DiffSynthesisRequest; message: string }
  | { kind: 'ready'; request: DiffSynthesisRequest; result: SynthesizedPatchResult };

function sameDiffAuthority(session: DiffWorkspaceAuthority, current: DiffWorkspaceAuthority): boolean {
  return session.workspaceId === current.workspaceId && session.authorityEpoch === current.authorityEpoch
    && session.selectionRevision === current.selectionRevision;
}

function diffDraftKey(session: Pick<DiffTargetSession, 'workspaceId' | 'targetFile'>): string {
  return JSON.stringify([session.workspaceId, session.targetFile]);
}

const MERGE_PANE_PREVIEW_LIMIT = 12000;

function previewPaneText(value: string | null | undefined): string {
  const text = value || '';
  if (text.length <= MERGE_PANE_PREVIEW_LIMIT) return text;
  return `${text.slice(0, MERGE_PANE_PREVIEW_LIMIT)}\n\n... preview truncated at ${MERGE_PANE_PREVIEW_LIMIT.toLocaleString()} characters; synthesis still uses the full file ...`;
}

export interface BoilerplateSnippet {
  id: string;
  name: string;
  description: string;
  targetFile: string;
  sel: string;
  action: 'add' | 'replace' | 'remove';
  content: string;
}

export const BUILTIN_BOILERPLATES: BoilerplateSnippet[] = [
  {
    id: 'bp_new_ware',
    name: 'Add Custom Ware Def',
    description: 'XML layout to define a new commodity or trade ware inside libraries/wares.xml.',
    targetFile: 'libraries/wares.xml',
    sel: '/wares',
    action: 'add',
    content: `<ware id="ware_custom_darkmatter" name="Dark Matter Cannisters" description="Highly compressed gravitationally isolated dark matter." transport="container" volume="10" tags="economy equipment">
  <price min="1200" average="2500" max="4800" />
  <production time="60" amount="1" method="default" name="Dark Matter Synthesis">
    <primary>
      <ware ware="energycells" amount="100" />
      <ware ware="reachtransformers" amount="2" />
    </primary>
  </production>
</ware>`
  },
  {
    id: 'bp_patrol_job',
    name: 'Create Fighter Job Def',
    description: 'Spawns automatic defensive fleets or patrol squads in libraries/jobs.xml.',
    targetFile: 'libraries/jobs.xml',
    sel: '/jobs',
    action: 'add',
    content: `<job id="job_patrol_heavy_wing" name="Local Border Elite Squad" startactive="true">
  <modifiers rebuild="true" />
  <quota galaxy="5" sector="1" />
  <expirationtime min="7200" max="14400" />
  <task task="order.patrol" />
  <ship macro="ship_arg_s_fighter_01_a_macro">
    <select faction="argon" tags="[military, fighter]" />
    <owner exact="argon" overridenpc="true" />
  </ship>
</job>`
  },
  {
    id: 'bp_engine_speed',
    name: 'Ship Engine Speed Overdrive',
    description: 'Increases pitch, roll, yaw, and forward speed multiplier inside libraries/ship_macros.xml.',
    targetFile: 'libraries/ship_macros.xml',
    sel: '/macros/macro[@name="engine_arg_s_travel_01_macro"]/properties/thrust',
    action: 'replace',
    content: `<thrust pitch="2.5" roll="3.0" yaw="2.5" forward="350" reverse="150" />`
  },
  {
    id: 'bp_faction_entry',
    name: 'Register Custom Faction Def',
    description: 'Overrides faction standings, icons, and starting metrics in libraries/factions.xml.',
    targetFile: 'libraries/factions.xml',
    sel: '/factions',
    action: 'add',
    content: `<faction id="syndicate_outlaws" name="Custom Syndicate Outlaws" primaryrace="argon" shortname="SYN">
  <relations>
    <relation faction="player" value="0.1" />
    <relation faction="argon" value="-0.8" />
    <relation faction="xenon" value="-1.0" />
  </relations>
  <icon active="faction_syndicate_active" />
</faction>`
  },
  {
    id: 'bp_custom_cue',
    name: 'Mission Director Cue Template',
    description: 'Injects a standard game entry event-handler script template inside libraries/mission_director.xml.',
    targetFile: 'libraries/mission_director.xml',
    sel: '/mdscript/cues',
    action: 'add',
    content: `<cue name="Custom_Vessel_Reward_Event" instantiate="true">
  <conditions>
    <event_cue_signalled cue="md.Setup.Start" />
  </conditions>
  <actions>
    <create_ship name="$RewardShip" macro="ship_arg_s_fighter_01_a_macro" faction="faction.player">
      <space object="player.sector" />
    </create_ship>
  </actions>
</cue>`
  },
  {
    id: 'bp_shield_recharging',
    name: 'Ship Shield Def Tuning',
    description: 'Tweak ship shields direct regeneration and delays in libraries/ship_macros.xml.',
    targetFile: 'libraries/ship_macros.xml',
    sel: '/macros/macro[@name="ship_arg_xl_carrier_01_a_macro"]/properties/shield',
    action: 'add',
    content: `<rebuild rate="35" delay="1s" />`
  }
];

// B13b2 mailbox: the pretarget event fires while the workbench is unmounted (the same
// event switches the view); this module-scope listener lives from first import, so the
// mount effect can consume what arrived before mount.
let pendingPretarget: { targetFile: string; selector?: string } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('xmlpatch-pretarget', (ev: Event) => {
    const file = String((ev as CustomEvent).detail?.targetFile || '').trim();
    const selector = String((ev as CustomEvent).detail?.selector || '').trim();
    if (file) pendingPretarget = { targetFile: file, ...(selector ? { selector } : {}) };
  });
}

export default function XMLPatchSystem({ workspace, setWorkspace, readWorkspaceBinding, saveCheckpoint, onServerWorkspaceApplied }: XMLPatchSystemProps) {
  // QoL: default to a target that actually exists in vanilla (ship_macros.xml
  // does not — first open used to show a resolution error).
  const [targetFile, setTargetFile] = useState<string>('libraries/wares.xml');

  const patchBlocks = workspace.xmlPatches || [];
  const filteredBlocks = patchBlocks.filter(b => !b.targetFile || b.targetFile === targetFile);
  const sourceDiffFiles = useMemo(
    () => indexSourceBackedDiffFiles(workspace),
    [workspace],
  );
  const activeSourceDiff = useMemo(
    () => sourceDiffFiles.find(f => f.path.toLowerCase() === targetFile.toLowerCase()) || null,
    [sourceDiffFiles, targetFile],
  );

  const readDiffAuthority = (): DiffWorkspaceAuthority => {
    const { workspaceId, authorityEpoch } = readWorkspaceBinding();
    return { workspaceId, authorityEpoch, selectionRevision: window.__X4_WORKSPACE_CONTEXT__?.getSelectionRevision() ?? -1 };
  };
  const diffAuthority = readDiffAuthority();
  const { workspaceId: diffWorkspaceId, authorityEpoch: diffAuthorityEpoch, selectionRevision: diffSelectionRevision } = diffAuthority;
  const [loadedBaseFileSession, setBaseFileSession] = useState<DiffTargetSession | null>(null);
  const baseFileSession = loadedBaseFileSession?.targetFile === targetFile
    && sameDiffAuthority(loadedBaseFileSession, diffAuthority) ? loadedBaseFileSession : null;
  const baseFileContent = baseFileSession?.baseXml ?? null;
  const [baseFileLoading, setBaseFileLoading] = useState<boolean>(false);
  const [baseFileError, setBaseFileError] = useState<string | null>(null);
  const [effectiveSources, setEffectiveSources] = useState<Array<{ source: string; mode: string }>>([]);
  const [rightPanelTab, setRightPanelTab] = useState<'patch' | 'preview' | 'difftool'>('patch');
  const [pretargetSelector, setPretargetSelector] = useState<string>('');
  const [authoringMode, setAuthoringMode] = useState<'single' | 'bulk' | GuidedHullTarget>('single');
  const [compactPane, setCompactPane] = useState<'tree' | 'blocks' | 'preview'>('blocks');

  // T4.2 Inc 2 — Diff→Patch merge view: the user edits a copy of the vanilla
  // file and the studio synthesizes the minimal <diff> ops via
  // POST /api/agent/xpath-synth (engine: src/lib/xpathSynth.ts).
  const [dtEdited, setDtEdited] = useState<string>('');
  const [synthesis, setSynthesis] = useState<DiffSynthesisState | null>(null);
  const baseFileSessionRef = useRef<DiffTargetSession | null>(null);
  const editedCandidateRef = useRef<string>('');
  const dirtyDraftsRef = useRef<Map<string, string>>(new Map());
  const effectiveFileRequestRef = useRef(0);
  const synthesisRequestRef = useRef<DiffSynthesisRequest | null>(null);

  const currentSynthesis = synthesis?.request.session === baseFileSession ? synthesis : null;
  const dtBusy = currentSynthesis?.kind === 'pending';
  const dtError = currentSynthesis?.kind === 'error' ? currentSynthesis.message : null;
  const dtResult = currentSynthesis?.kind === 'ready' ? currentSynthesis.result : null;

  const retireSynthesis = useCallback(() => {
    const prior = synthesisRequestRef.current;
    synthesisRequestRef.current = null;
    prior?.controller.abort();
  }, []);

  const updateEditedCandidate = useCallback((content: string) => {
    retireSynthesis();
    editedCandidateRef.current = content;
    setDtEdited(content);
    setSynthesis(null);
  }, [retireSynthesis]);

  const ownsSynthesis = (request: DiffSynthesisRequest) =>
    synthesisRequestRef.current === request
    && baseFileSessionRef.current === request.session
    && editedCandidateRef.current === request.editedXml
    && sameDiffAuthority(request.session, readDiffAuthority());

  const acceptSynthesisReply = (request: DiffSynthesisRequest) => {
    if (ownsSynthesis(request)) return true;
    if (synthesisRequestRef.current === request) {
      retireSynthesis();
      setSynthesis(null);
    }
    return false;
  };

  const runDiffToPatch = async () => {
    const session = baseFileSession;
    if (!session || baseFileSessionRef.current !== session || !sameDiffAuthority(session, readDiffAuthority())) return;
    retireSynthesis();
    const request = { session, editedXml: editedCandidateRef.current, controller: new AbortController() };
    synthesisRequestRef.current = request;
    setSynthesis({ kind: 'pending', request });
    try {
      const res = await fetch('/api/agent/xpath-synth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: request.controller.signal,
        body: JSON.stringify({
          vanillaXml: session.baseXml,
          editedXml: request.editedXml,
          targetFile: session.targetFile,
          sourceSignature: session.sourceSignature,
        })
      });
      const data = await res.json();
      if (!acceptSynthesisReply(request)) return;
      if (!res.ok || data.error) throw new Error(data.error || `Synthesis failed (${res.status})`);
      if (data.targetFile !== session.targetFile || data.sourceSignature !== session.sourceSignature) {
        throw new Error('Synthesis response did not match the active target and source revision. Reload the target and try again.');
      }
      setSynthesis({ kind: 'ready', request, result: data });
    } catch (err) {
      if (acceptSynthesisReply(request)) {
        setSynthesis({ kind: 'error', request, message: err instanceof Error ? err.message : 'Patch synthesis failed.' });
      }
    }
  };

  const adoptSynthesizedOps = () => {
    if (currentSynthesis?.kind !== 'ready' || !currentSynthesis.result.ops?.length) return;
    const { request, result } = currentSynthesis;
    if (!ownsSynthesis(request)) {
      retireSynthesis();
      setSynthesis(null);
      return;
    }
    const { session } = request;
    const stamp = Date.now();
    const blocks: PatchBlock[] = result.ops.map((op, i) => ({
      id: `dt_${stamp}_${i}`,
      sel: op.sel,
      action: op.type,
      content: op.content || '',
      note: 'Diff→Patch synthesized',
      pos: op.pos === 'before' ? ('before' as const) : undefined,
      attrType: op.attrType || undefined,
      targetFile: session.targetFile,
      sourceSignature: session.sourceSignature,
    }));
    setWorkspace(prev => sameDiffAuthority(session, readDiffAuthority())
      ? { ...prev, xmlPatches: [...(prev.xmlPatches || []), ...blocks] }
      : prev);
    setCompactPane('tree');
    retireSynthesis();
    setSynthesis(null);
    setRightPanelTab('patch');
  };

  const resetEditedCandidate = () => {
    if (!baseFileSession) return;
    dirtyDraftsRef.current.delete(diffDraftKey(baseFileSession));
    updateEditedCandidate(baseFileSession.baseXml);
  };

  const dtChangedLineCount = useMemo(() => {
    if (!baseFileContent || !dtEdited) return 0;
    return computeSimpleDiff(baseFileContent, dtEdited).filter(line => line.type !== 'normal').length;
  }, [baseFileContent, dtEdited]);

  const dtBasePreview = useMemo(() => previewPaneText(baseFileContent), [baseFileContent]);
  const dtPatchPreview = useMemo(() => previewPaneText(dtResult?.diffXml), [dtResult]);

  // B13b2: override-map "DIFF→PATCH" jump — pre-target this workbench from anywhere.
  // The event usually fires while this component is UNMOUNTED (the same event switches
  // the view, and we mount after) — the module-scope mailbox below catches it; this
  // effect consumes the mailbox on mount and handles the already-mounted case live.
  useEffect(() => {
    const apply = (target: { targetFile: string; selector?: string }) => {
      if (!target.targetFile) return;
      pendingPretarget = null; // consumed — never replays on a later mount
      setTargetFile(target.targetFile);
      setPretargetSelector(target.selector || '');
      setRightPanelTab(target.selector ? 'patch' : 'difftool');
    };
    if (pendingPretarget) apply(pendingPretarget);
    const handlePretarget = (ev: Event) => apply({
      targetFile: String((ev as CustomEvent).detail?.targetFile || '').trim(),
      selector: String((ev as CustomEvent).detail?.selector || '').trim() || undefined,
    });
    window.addEventListener('xmlpatch-pretarget', handlePretarget);
    return () => window.removeEventListener('xmlpatch-pretarget', handlePretarget);
  }, []);

  useEffect(() => {
    if (!targetFile) return;
    const previous = baseFileSessionRef.current;
    if (previous) {
      const key = diffDraftKey(previous);
      if (editedCandidateRef.current === previous.baseXml) dirtyDraftsRef.current.delete(key);
      else dirtyDraftsRef.current.set(key, editedCandidateRef.current);
    }
    const requestId = effectiveFileRequestRef.current + 1;
    effectiveFileRequestRef.current = requestId;
    const controller = new AbortController();
    setBaseFileLoading(true);
    setBaseFileError(null);
    setEffectiveSources([]);
    baseFileSessionRef.current = null;
    setBaseFileSession(null);
    updateEditedCandidate('');
    fetch(`/api/reference/effective-file?path=${encodeURIComponent(targetFile)}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || 'Failed to load base file');
          });
        }
        return res.json();
      })
      .then(data => {
        if (controller.signal.aborted || effectiveFileRequestRef.current !== requestId) return;
        const relativePath = String(data.relativePath || '').replace(/\\/g, '/');
        if (relativePath !== targetFile.replace(/\\/g, '/')) {
          throw new Error(`Reference response target mismatch: expected ${targetFile}, received ${relativePath || '(missing path)'}.`);
        }
        const session: DiffTargetSession = {
          targetFile,
          workspaceId: diffWorkspaceId,
          authorityEpoch: diffAuthorityEpoch,
          selectionRevision: diffSelectionRevision,
          sourceSignature: String(data.signature || ''),
          baseXml: String(data.content || ''),
        };
        if (!session.sourceSignature) throw new Error('Reference response did not include a source signature.');
        baseFileSessionRef.current = session;
        setBaseFileSession(session);
        updateEditedCandidate(dirtyDraftsRef.current.get(diffDraftKey(session)) ?? session.baseXml);
        setEffectiveSources(Array.isArray(data.sources) ? data.sources : []);
        setBaseFileLoading(false);
      })
      .catch(err => {
        if (controller.signal.aborted || effectiveFileRequestRef.current !== requestId) return;
        setBaseFileError(err.message);
        setBaseFileLoading(false);
      });
    return () => {
      controller.abort();
      retireSynthesis();
    };
  }, [targetFile, diffWorkspaceId, diffAuthorityEpoch, diffSelectionRevision, updateEditedCandidate, retireSynthesis]);

  const parsedBaseDoc = useMemo(() => {
    if (!baseFileContent) return null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(baseFileContent, 'text/xml');
      const parserError = doc.getElementsByTagName("parsererror");
      if (parserError.length > 0) return null;
      return doc;
    } catch {
      return null;
    }
  }, [baseFileContent]);

  const hullTarget = useMemo<GuidedHullTarget | null>(() => {
    if (!parsedBaseDoc || parsedBaseDoc.documentElement.tagName !== 'macros' || !baseFileSession
      || baseFileSession.targetFile !== targetFile) return null;
    const ships = Array.from(parsedBaseDoc.documentElement.children).filter(element =>
      element.tagName === 'macro' && element.getAttribute('class')?.startsWith('ship_'));
    const macroName = ships.length === 1 ? ships[0].getAttribute('name') : null;
    if (!macroName) return null;
    const selector = `/macros/macro[@name=${escapeXPathLiteral(macroName)}]/properties/hull/@max`;
    const matches = parsedBaseDoc.evaluate(selector, parsedBaseDoc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const currentValue = matches.snapshotLength === 1 ? matches.snapshotItem(0)?.nodeValue?.trim() : null;
    if (!currentValue || !Number.isFinite(Number(currentValue))) return null;
    return {
      targetFile: targetFile.replace(/\\/g, '/'), macroName, selector, currentValue, sourceSignature: baseFileSession.sourceSignature,
      sourceLabel: effectiveSources.map(source => source.source).join(' + '),
    };
  }, [parsedBaseDoc, baseFileSession, targetFile, effectiveSources]);

  const previewSourceBlocks = useMemo<PatchBlock[]>(() => {
    if (filteredBlocks.length > 0 || !activeSourceDiff) return filteredBlocks;
    return activeSourceDiff.ops.map(op => ({
      id: `${activeSourceDiff.id}_op_${op.index}`,
      sel: op.sel,
      action: op.op,
      content: op.content,
      note: activeSourceDiff.path,
      pos: op.pos,
      attrType: op.attrType,
      targetFile: activeSourceDiff.path,
      includeInBuild: true,
    }));
  }, [filteredBlocks, activeSourceDiff]);

  const applyPatchesResult = useMemo(() => {
    if (!parsedBaseDoc) return { doc: null, errors: {} as Record<string, string> };
    
    const doc = parsedBaseDoc.cloneNode(true) as Document;
    const errors: Record<string, string> = {};

    previewSourceBlocks.forEach(b => {
      if (!b.sel || b.includeInBuild === false) return;
      try {
        const nodes = doc.evaluate(
          b.sel,
          doc,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );

        if (nodes.snapshotLength === 0) {
          errors[b.id] = "Selector matched 0 elements.";
          return;
        }

        for (let idx = 0; idx < nodes.snapshotLength; idx++) {
          const target = nodes.snapshotItem(idx) as Node;
          if (!target) continue;

          if (b.action === 'remove') {
            if (target.nodeType === Node.ATTRIBUTE_NODE) {
              const attr = target as Attr;
              const owner = attr.ownerElement;
              if (owner) {
                owner.removeAttribute(attr.name);
              }
            } else if (target.parentNode) {
              target.parentNode.removeChild(target);
            }
          } else if (b.action === 'replace') {
            if (target.nodeType === Node.ATTRIBUTE_NODE) {
              const attr = target as Attr;
              attr.value = b.content.trim();
            } else {
              const fragDoc = new DOMParser().parseFromString(`<root>${b.content}</root>`, 'text/xml');
              const parserError = fragDoc.getElementsByTagName("parsererror");
              if (parserError.length > 0) {
                throw new Error("XML syntax error in patch content.");
              }
              const parent = target.parentNode;
              if (parent) {
                const children = Array.from(fragDoc.documentElement.childNodes);
                children.forEach(child => {
                  const imported = doc.importNode(child, true);
                  parent.insertBefore(imported, target);
                });
                parent.removeChild(target);
              }
            }
          } else if (b.action === 'add') {
            if (target.nodeType === Node.ELEMENT_NODE) {
              if (b.attrType) {
                if (!b.attrType.startsWith('@')) {
                  throw new Error(`Unsupported add type "${b.attrType}". Expected @attribute.`);
                }
                (target as Element).setAttribute(b.attrType.slice(1), (b.content || '').trim());
                continue;
              }
              const fragDoc = new DOMParser().parseFromString(`<root>${b.content}</root>`, 'text/xml');
              const parserError = fragDoc.getElementsByTagName("parsererror");
              if (parserError.length > 0) {
                throw new Error("XML syntax error in patch content.");
              }
              const children = Array.from(fragDoc.documentElement.childNodes);
              const pos = b.pos || 'append';

              if (pos === 'prepend') {
                children.reverse().forEach(child => {
                  const imported = doc.importNode(child, true);
                  target.insertBefore(imported, target.firstChild);
                });
              } else if (pos === 'before') {
                const parent = target.parentNode;
                if (parent) {
                  children.forEach(child => {
                    const imported = doc.importNode(child, true);
                    parent.insertBefore(imported, target);
                  });
                }
              } else if (pos === 'after') {
                const parent = target.parentNode;
                if (parent) {
                  const nextSib = target.nextSibling;
                  children.forEach(child => {
                    const imported = doc.importNode(child, true);
                    parent.insertBefore(imported, nextSib);
                  });
                }
              } else {
                // append
                children.forEach(child => {
                  const imported = doc.importNode(child, true);
                  target.appendChild(imported);
                });
              }
            } else {
              throw new Error(b.attrType
                ? "Cannot add an attribute to a non-element target."
                : "Cannot add children to non-element target.");
            }
          }
        }
      } catch (err) {
        errors[b.id] = err.message || String(err);
      }
    });

    return { doc, errors };
  }, [parsedBaseDoc, previewSourceBlocks]);

  const validateBlockXPath = (b: PatchBlock) => {
    if (baseFileLoading) {
      return { status: 'loading', message: 'Loading base file...' };
    }
    if (baseFileError) {
      return { status: 'no_file', message: 'Effective corpus file unavailable (XPath validation skipped)' };
    }
    if (!parsedBaseDoc) {
      return { status: 'no_file', message: 'No valid base file loaded' };
    }
    if (!b.sel.trim()) {
      return { status: 'warn', message: 'XPath selector is empty' };
    }

    try {
      const result = parsedBaseDoc.evaluate(
        b.sel,
        parsedBaseDoc,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      const count = result.snapshotLength;
      if (count === 0) {
        return { status: 'error', message: '❌ Selector matches 0 elements. Patch will fail silently in-game.', count };
      } else if (count === 1) {
        return { status: 'success', message: '✅ Selector matches exactly 1 target element.', count };
      } else {
        return { status: 'warn', message: `⚠️ Selector matches multiple elements (${count} matches). Patch will apply to all of them.`, count };
      }
    } catch (err) {
      return { status: 'error', message: `❌ Invalid XPath selector syntax: ${err.message || err}` };
    }
  };

  function computeSimpleDiff(oldStr: string, newStr: string) {
    const oldLines = (oldStr || '').split(/\r?\n/);
    const newLines = (newStr || '').split(/\r?\n/);
    const result: { type: 'addition' | 'deletion' | 'normal'; value: string }[] = [];
    let i = 0;
    let j = 0;
    
    while (i < oldLines.length || j < newLines.length) {
      const oldLine = oldLines[i];
      const newLine = newLines[j];
      
      if (oldLine !== undefined && newLine !== undefined && oldLine.trim() === newLine.trim()) {
        result.push({ type: 'normal', value: oldLine });
        i++;
        j++;
      } else {
        let foundMatch = false;
        for (let offset = 1; offset <= 5; offset++) {
          const lookaheadOld = oldLines[i + offset];
          const lookaheadNew = newLines[j + offset];
          
          if (lookaheadOld !== undefined && newLine !== undefined && lookaheadOld.trim() === newLine.trim()) {
            for (let k = 0; k < offset; k++) {
              if (oldLines[i + k] !== undefined) {
                result.push({ type: 'deletion', value: oldLines[i + k] });
              }
            }
            i += offset;
            foundMatch = true;
            break;
          } else if (lookaheadNew !== undefined && oldLine !== undefined && oldLine.trim() === lookaheadNew.trim()) {
            for (let k = 0; k < offset; k++) {
              if (newLines[j + k] !== undefined) {
                result.push({ type: 'addition', value: newLines[j + k] });
              }
            }
            j += offset;
            foundMatch = true;
            break;
          }
        }
        if (!foundMatch) {
          if (oldLine !== undefined && newLine !== undefined) {
            result.push({ type: 'deletion', value: oldLine });
            result.push({ type: 'addition', value: newLine });
            i++;
            j++;
          } else if (oldLine !== undefined) {
            result.push({ type: 'deletion', value: oldLine });
            i++;
          } else if (newLine !== undefined) {
            result.push({ type: 'addition', value: newLine });
            j++;
          }
        }
      }
    }
    return result;
  }

  const previewDiffLines = useMemo(() => {
    if (!baseFileContent || !applyPatchesResult.doc) return [];
    try {
      const serializer = new XMLSerializer();
      const modifiedXml = serializer.serializeToString(applyPatchesResult.doc);
      return computeSimpleDiff(baseFileContent, modifiedXml);
    } catch {
      return [];
    }
  }, [baseFileContent, applyPatchesResult.doc]);

  const diffSnippet = useMemo(() => {
    if (previewDiffLines.length === 0) return [];
    const contextSize = 3;
    const result: { type: 'addition' | 'deletion' | 'normal'; value: string; label: string }[] = [];

    let oldLineNum = 1;
    let newLineNum = 1;
    const linesWithMeta = previewDiffLines.map(line => {
      let label = '';
      if (line.type === 'normal') {
        label = `${oldLineNum}→${newLineNum}`;
        oldLineNum++;
        newLineNum++;
      } else if (line.type === 'deletion') {
        label = `${oldLineNum}   `;
        oldLineNum++;
      } else {
        label = `   ${newLineNum}`;
        newLineNum++;
      }
      return { ...line, label };
    });

    const changeIndices = linesWithMeta
      .map((line, idx) => (line.type !== 'normal' ? idx : -1))
      .filter(idx => idx !== -1);

    if (changeIndices.length === 0) {
      return [{ type: 'normal' as const, value: 'No changes detected. Modify or add patch blocks to preview.', label: '' }];
    }

    const indicesToInclude = new Set<number>();
    changeIndices.forEach(changeIdx => {
      const start = Math.max(0, changeIdx - contextSize);
      const end = Math.min(linesWithMeta.length - 1, changeIdx + contextSize);
      for (let i = start; i <= end; i++) {
        indicesToInclude.add(i);
      }
    });

    let lastIncludedIdx = -1;
    linesWithMeta.forEach((line, idx) => {
      if (indicesToInclude.has(idx)) {
        if (lastIncludedIdx !== -1 && idx - lastIncludedIdx > 1) {
          result.push({ type: 'normal', value: `... [Skip ${idx - lastIncludedIdx - 1} lines] ...`, label: '...' });
        }
        result.push(line);
        lastIncludedIdx = idx;
      }
    });

    return result;
  }, [previewDiffLines]);

  const [sidebarTab, setSidebarTab] = useState<'recipes' | 'boilerplates' | 'tree'>('tree');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);

  // New customizable forms inside the boilerplates section
  const [isCreatingCustomBP, setIsCreatingCustomBP] = useState(false);
  const [newBPRelativePath, setNewBPRelativePath] = useState('libraries/wares.xml');
  const [newBPName, setNewBPName] = useState('');
  const [newBPDescription, setNewBPDescription] = useState('');
  const [newBPSel, setNewBPSel] = useState('/wares');
  const [newBPAction, setNewBPAction] = useState<'add' | 'replace' | 'remove'>('add');
  const [newBPContent, setNewBPContent] = useState('');

  const [customSnippets, setCustomSnippets] = useState<BoilerplateSnippet[]>(() => {
    try {
      const saved = localStorage.getItem('x4_custom_xml_snippets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleSaveBlockAsBoilerplate = (b: PatchBlock) => {
    const newBP: BoilerplateSnippet = {
      id: `custom_bp_${Date.now()}`,
      name: b.note || `Custom Patch: ${b.sel.substring(0, 16)}`,
      description: `Saved from active workbench on target file: ${b.targetFile || targetFile}`,
      targetFile: b.targetFile || targetFile,
      sel: b.sel,
      action: b.action,
      content: b.content
    };
    const updated = [newBP, ...customSnippets];
    setCustomSnippets(updated);
    localStorage.setItem('x4_custom_xml_snippets', JSON.stringify(updated));
    setSidebarTab('boilerplates');
    alert(`"${newBP.name}" has been successfully saved to your XML Boilerplates library!`);
  };

  const handleCreateCustomBoilerplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBPName.trim()) return alert("Please enter a name for the boilerplate.");
    
    const newBP: BoilerplateSnippet = {
      id: `custom_bp_${Date.now()}`,
      name: newBPName,
      description: newBPDescription || 'Custom user-saved XML boilerplate',
      targetFile: newBPRelativePath,
      sel: newBPSel,
      action: newBPAction,
      content: newBPContent
    };
    
    const updated = [newBP, ...customSnippets];
    setCustomSnippets(updated);
    localStorage.setItem('x4_custom_xml_snippets', JSON.stringify(updated));
    
    // reset form
    setNewBPName('');
    setNewBPDescription('');
    setNewBPSel('/wares');
    setNewBPAction('add');
    setNewBPContent('');
    setIsCreatingCustomBP(false);
  };

  const handleDeleteCustomSnippet = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customSnippets.filter(s => s.id !== id);
    setCustomSnippets(updated);
    localStorage.setItem('x4_custom_xml_snippets', JSON.stringify(updated));
  };

  const handleApplyBoilerplate = (bp: BoilerplateSnippet) => {
    const newBlock: PatchBlock = {
      id: `p_block_${Date.now()}`,
      sel: bp.sel,
      action: bp.action,
      content: bp.content,
      note: bp.name,
      targetFile: bp.targetFile
    };
    savePatches([...patchBlocks, newBlock]);
    if (bp.targetFile) {
      setTargetFile(bp.targetFile);
    }
  };

  const handleCopyToClipboardAndNotify = (bp: BoilerplateSnippet, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(bp.content);
    setCopiedSnippetId(bp.id);
    setTimeout(() => setCopiedSnippetId(null), 1500);
  };

  const savePatches = (newPatches: PatchBlock[]) => {
    setWorkspace(prev => ({
      ...prev,
      xmlPatches: newPatches
    }));
  };

  const handleAddPatchBlock = (action: 'add' | 'replace' | 'remove') => {
    let sel = '/';
    let content = '';
    let note = '';

    if (action === 'add') {
      sel = '/components/component[@name="ship_storage"]/properties';
      content = '<storage volume="1500" type="container" />';
      note = 'Add container volume to station storage pods';
    } else if (action === 'replace') {
      sel = '/soundlibrary/sound[@id="alarm_red"]/volume';
      content = '<volume level="0.8" />';
      note = 'Reduce sound volume of red alarms';
    } else {
      sel = '/police/scanners/frequent_checks';
      content = '';
      note = 'Mute space police scan timers';
    }

    const nBlock: PatchBlock = {
      id: `p_block_${Date.now()}`,
      sel: pretargetSelector || sel,
      action,
      content,
      note,
      targetFile
    };

    savePatches([...patchBlocks, nBlock]);
    setPretargetSelector('');
  };

  const handleDeletePatchBlock = (id: string) => {
    savePatches(patchBlocks.filter(b => b.id !== id));
  };

  const handleUpdatePatchBlock = (id: string, key: keyof PatchBlock, val: any) => {
    const next = patchBlocks.map(b => {
      if (b.id === id) {
        return { ...b, [key]: val };
      }
      return b;
    });
    savePatches(next);
  };

  // Recipe templates loader
  const handleLoadRecipe = (recipeKey: 'carrier_hangar' | 'combat_music' | 'shield_stats') => {
    let raw: PatchBlock;
    if (recipeKey === 'carrier_hangar') {
      raw = {
        id: `recipe_${Date.now()}`,
        sel: '/macros/macro[@name="ship_tel_xl_carrier_01_a_macro"]/properties/hangars',
        action: 'replace',
        content: '<dock capacity="80" class="ship_s" />\n    <dock capacity="20" class="ship_m" />',
        note: 'Expand XL Carrier drone & squad hangar counts',
        targetFile: 'libraries/ship_macros.xml'
      };
    } else if (recipeKey === 'combat_music') {
      raw = {
        id: `recipe_${Date.now()}`,
        sel: '/soundlibrary/playlist[@id="combat_music_playlist"]',
        action: 'add',
        content: '<track path="sound/music/custom_battle_drum" intensity="high" />',
        note: 'Inject deep custom war drum playlist track',
        targetFile: 'libraries/sound_library.xml'
      };
    } else {
      raw = {
        id: `recipe_${Date.now()}`,
        sel: '/parameters/shield[@id="boost_shield_regen"]/modifiers',
        action: 'replace',
        content: '<multiplier value="2.5" />',
        note: 'Boost combat overdrive shield multipliers',
        targetFile: 'libraries/ship_macros.xml'
      };
    }

    savePatches([...patchBlocks, raw]);
  };

  // Compile full patch document XML. SINGLE SOURCE OF TRUTH: the shared
  // modCompiler.compileDiffDocument (which escapes sel/attrs and emits the
  // attrType + attribute-replace forms). A local duplicate of this function
  // silently diverged once (dropped type="@attr") — do not reintroduce one.
  const compileDiffDocument = (): string => {
    if (filteredBlocks.length === 0 && activeSourceDiff) {
      return activeSourceDiff.rawXml;
    }
    return compileSharedDiffDocument(
      patchBlocks.filter(b => !b.targetFile || b.targetFile === targetFile),
      targetFile
    );
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(compileDiffDocument());
    alert("Diff Patch XML document copied on clipboard!");
  };

  const openNativeDiff = () => {
    if (!baseFileContent) return;
    const opened = openNativeTextDiff({
      title: `X4 Patch Candidate — ${targetFile}`,
      leftLabel: `${targetFile} (effective vanilla)`,
      rightLabel: `${targetFile} (edited candidate)`,
      leftContent: baseFileContent,
      rightContent: dtEdited,
      language: 'xml',
    });
    if (!opened) alert('Native diff viewing is available in the installed Antigravity/VS Code extension.');
  };

  return (
    <div id="xml_patch_workbench_view" className="flex-1 bg-[#0c0e12] flex flex-col h-full overflow-hidden text-[#eef2f7]">
      {/* Concept A Header Bar */}
      <div className="bg-[#141820] border-b border-[#262c36] px-3 py-2 flex flex-wrap items-center gap-2 justify-between text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <GitFork className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold text-[#eef2f7] truncate">XML Diff Workbench</span>
          <div className="ml-2 flex rounded border border-[#262c36] bg-[#090b0f] p-0.5 shrink-0">
            <button onClick={() => setAuthoringMode('single')} className={`rounded px-2.5 py-1 text-[11px] font-medium cursor-pointer ${authoringMode === 'single' ? 'bg-emerald-500/20 text-emerald-200 font-semibold' : 'text-[#a0aab8] hover:text-white'}`}>Single patch</button>
            <button onClick={() => setAuthoringMode('bulk')} className={`rounded px-2.5 py-1 text-[11px] font-medium cursor-pointer ${authoringMode === 'bulk' ? 'bg-blue-500/20 text-blue-200 font-semibold' : 'text-[#a0aab8] hover:text-white'}`}>Bulk transform</button>
          </div>
        </div>
        
        {/* Target file selectors */}
        {authoringMode === 'single' && <div className="flex flex-1 min-w-[260px] justify-end items-center gap-2 text-xs">
          <span className="text-[#a0aab8] font-medium text-[11px] shrink-0">Target:</span>
          <div className="w-[min(320px,55vw)] min-w-0">
            <ObjectIndexPicker
              endpoint="/api/agent/patch-targets"
              kind="patch-target"
              value={targetFile}
              onChange={v => setTargetFile(v)}
              placeholder="Search real base-game files… (e.g. libraries/wares.xml)"
            />
          </div>
          {effectiveSources.length > 0 && (
            <span className="max-w-52 truncate text-[11px] font-mono text-emerald-400" title={effectiveSources.map(source => `${source.source} (${source.mode})`).join(' → ')}>
              effective: {effectiveSources.map(source => source.source).join(' + ')}
            </span>
          )}
          {hullTarget && <button type="button" onClick={() => { setTargetFile(hullTarget.targetFile); setAuthoringMode(hullTarget); }}
            className="shrink-0 rounded border border-blue-500/35 bg-blue-500/15 px-2.5 py-1 text-[11px] font-medium text-blue-200 hover:bg-blue-500/25 cursor-pointer">Edit max hull</button>}
          {pretargetSelector && (
            <span className="max-w-72 truncate rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200" title={pretargetSelector}>
              Patch existing: {pretargetSelector}
            </span>
          )}
        </div>}
      </div>

      {authoringMode === 'single' && (
        <div data-testid="xmlpatch-compact-tabs" className="min-[1500px]:hidden h-10 shrink-0 min-w-0 overflow-x-auto custom-scrollbar border-b border-[#262c36] bg-[#11141a] px-2 flex items-center gap-1.5">
          <div className="flex-1 flex items-center justify-center gap-1 min-w-max">
            {(['tree', 'blocks', 'preview'] as const).map(pane => (
              <button key={pane} type="button" data-compact-pane={pane} onClick={() => setCompactPane(pane)} className={`h-7 px-3 rounded text-[11px] font-medium cursor-pointer ${compactPane === pane ? 'bg-blue-500/20 text-blue-200 border border-blue-500/35 font-semibold' : 'text-[#a0aab8] border border-transparent hover:text-white'}`}>
                {pane === 'tree' ? 'Patch Tree' : pane === 'blocks' ? 'Patch Blocks' : 'Preview & Diff'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 min-w-max border-l border-[#262c36] pl-2">
            {([
              ['patch', 'Patch XML'],
              ['preview', 'Applied Preview'],
              ['difftool', 'Diff→Patch'],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => { setRightPanelTab(tab); setCompactPane('preview'); }}
                className={`h-7 px-2.5 rounded text-[11px] font-medium cursor-pointer ${rightPanelTab === tab && compactPane === 'preview' ? 'bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/35 font-semibold' : 'text-[#a0aab8] border border-transparent hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {authoringMode !== 'single' ? (
        <BulkTransformPanel key={authoringMode === 'bulk' ? 'bulk' : 'hull'} workspace={workspace} setWorkspace={setWorkspace}
          readWorkspaceBinding={readWorkspaceBinding} saveCheckpoint={saveCheckpoint} onServerWorkspaceApplied={onServerWorkspaceApplied}
          guidedHull={authoringMode === 'bulk' ? undefined : authoringMode} />
      ) : (
      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Left Side: Recipes and template insertions */}
        <div data-xmlpatch-pane="tree" className={`${compactPane === 'tree' ? 'flex' : 'hidden'} min-[1500px]:flex w-full min-[1500px]:w-80 border-r border-[#262c36] p-3.5 flex-col h-full bg-[#11141a] overflow-y-auto space-y-4`}>
          {/* Tab switcher */}
          <div className="flex border-b border-[#262c36] mb-1 shrink-0">
            <button
              onClick={() => setSidebarTab('tree')}
              className={`flex-1 pb-2 text-center text-xs font-semibold transition-colors border-b-2 cursor-pointer ${
                sidebarTab === 'tree'
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-[#a0aab8] hover:text-white'
              }`}
            >
              Tree
            </button>
            <button
              onClick={() => setSidebarTab('recipes')}
              className={`flex-1 pb-2 text-center text-xs font-semibold transition-colors border-b-2 cursor-pointer ${
                sidebarTab === 'recipes'
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-[#a0aab8] hover:text-white'
              }`}
            >
              Recipes
            </button>
            <button
              onClick={() => setSidebarTab('boilerplates')}
              className={`flex-1 pb-2 text-center text-xs font-semibold transition-colors border-b-2 cursor-pointer ${
                sidebarTab === 'boilerplates'
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-[#a0aab8] hover:text-white'
              }`}
            >
              Boilerplates
            </button>
          </div>

          {sidebarTab === 'tree' ? (
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div>
                <h3 className="text-xs font-semibold text-emerald-300 border-b border-[#262c36] pb-1.5 mb-2 flex items-center gap-1.5">
                  XML Patches Tree
                </h3>
                <p className="text-[11px] text-[#687385] mb-3 leading-relaxed">
                  Hierarchy of all defined XML diff patch instructions in this mod.
                </p>

                <div className="space-y-3 font-mono text-[11px] max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
                  {patchBlocks.length === 0 && sourceDiffFiles.length === 0 ? (
                    <div className="text-xs text-[#687385] p-4 text-center border border-[#262c36] bg-[#090b0f] rounded">
                      No XML patches registered yet. Use the Patch Blocks workbench to add a diff operation.
                    </div>
                  ) : (
                    <>
                      {Array.from(new Set(patchBlocks.map(p => p.targetFile || targetFile))).map(tFile => {
                        const filePatches = patchBlocks.filter(p => (p.targetFile || targetFile) === tFile);
                        return (
                          <div key={tFile} className="space-y-1.5">
                            <button
                              onClick={() => setTargetFile(tFile)}
                              className={`w-full p-2 rounded font-semibold text-left flex items-center gap-1.5 transition-colors border cursor-pointer ${
                                targetFile === tFile ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' : 'bg-[#090b0f] text-[#a0aab8] border-[#262c36] hover:text-white'
                              }`}
                            >
                              <span className="truncate flex-1">{tFile}</span>
                              <span className="text-[11px] bg-[#171b23] px-1.5 rounded text-[#eef2f7]">{filePatches.length}</span>
                            </button>

                            <div className="pl-3 border-l border-[#262c36] space-y-1">
                              {filePatches.map(patch => (
                                <div
                                  key={patch.id}
                                  className="p-1.5 rounded bg-[#090b0f] border border-[#262c36] hover:border-blue-500/35 flex items-start justify-between gap-1 group/pnode"
                                >
                                  <button
                                    onClick={() => {
                                      setTargetFile(tFile);
                                    }}
                                    className="flex-1 min-w-0 text-left cursor-pointer"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-[11px] uppercase font-semibold px-1.5 rounded shrink-0 ${
                                        patch.action === 'add' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' :
                                        patch.action === 'replace' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25' :
                                        'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                                      }`}>
                                        {patch.action}
                                      </span>
                                      <span className="truncate text-[#eef2f7] font-medium" title={patch.sel}>{patch.sel}</span>
                                    </div>
                                    {patch.note && (
                                      <span className="text-[11px] text-[#687385] block truncate mt-0.5">{patch.note}</span>
                                    )}
                                  </button>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updated = patchBlocks.filter(p => p.id !== patch.id);
                                      savePatches(updated);
                                    }}
                                    className="p-1 text-[#687385] hover:text-rose-300 cursor-pointer ml-1 shrink-0"
                                    title="Delete patch specification element"
                                  >
                                    <Trash className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {sourceDiffFiles.length > 0 && (
                        <div data-testid="xmlpatch-source-diff-tree" className="pt-2 border-t border-[#262c36] space-y-2">
                          <div className="text-[11px] font-sans font-semibold text-emerald-300 flex items-center justify-between">
                            <span>Source-Backed Diffs (Disk)</span>
                            <span className="font-mono text-[#687385]">{sourceDiffFiles.length}</span>
                          </div>
                          {sourceDiffFiles.map(file => {
                            const selected = targetFile.toLowerCase() === file.path.toLowerCase();
                            const safeTestId = file.path.replace(/[^a-zA-Z0-9_-]/g, '_');
                            return (
                              <div key={file.id} className="space-y-1">
                                <button
                                  type="button"
                                  data-testid={`xmlpatch-source-file-${safeTestId}`}
                                  onClick={() => {
                                    setTargetFile(file.path);
                                    setCompactPane('blocks');
                                  }}
                                  className={`w-full p-2 rounded font-semibold text-left flex items-center gap-1.5 transition-colors border cursor-pointer ${
                                    selected
                                      ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40'
                                      : 'bg-[#090b0f] text-[#a0aab8] border-[#262c36] hover:text-white'
                                  }`}
                                >
                                  <span className="truncate flex-1">{file.path}</span>
                                  <span className="text-[11px] bg-[#171b23] px-1.5 rounded text-[#eef2f7]">
                                    {file.ops.length}
                                  </span>
                                  <span className="text-[11px] rounded bg-emerald-500/15 border border-emerald-500/30 px-1 text-emerald-300 shrink-0">
                                    disk
                                  </span>
                                </button>
                                <div className="pl-3 border-l border-emerald-500/30 space-y-1">
                                  {file.ops.map(op => (
                                    <button
                                      type="button"
                                      key={`${file.id}_op_${op.index}`}
                                      onClick={() => {
                                        setTargetFile(file.path);
                                        setCompactPane('blocks');
                                      }}
                                      className="w-full p-1.5 rounded bg-[#090b0f] border border-[#262c36] hover:border-emerald-500/35 text-left flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <span className={`text-[11px] uppercase font-semibold px-1.5 rounded shrink-0 ${
                                        op.op === 'add' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' :
                                        op.op === 'replace' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25' :
                                        'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                                      }`}>
                                        {op.op}
                                      </span>
                                      <span className="truncate text-[#eef2f7]">{op.sel || '(empty sel)'}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : sidebarTab === 'recipes' ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-emerald-300 border-b border-[#262c36] pb-1.5 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Diff Recipes Library
                </h3>
                <p className="text-[11px] text-[#a0aab8] mb-3 leading-relaxed">
                  Inject standard patch layouts for ship components, audio soundscapes, or statistics overrides.
                </p>

                <div className="space-y-2">
                  <button
                    onClick={() => handleLoadRecipe('carrier_hangar')}
                    className="w-full text-left p-2.5 rounded bg-[#171b23] border border-[#262c36] hover:border-emerald-500/40 transition-colors flex flex-col gap-1 cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-[#eef2f7]">Expand Carrier Hangar Bay</div>
                    <div className="text-[11px] text-[#687385] font-mono">libraries/ship_macros.xml</div>
                  </button>
                  
                  <button
                    onClick={() => handleLoadRecipe('combat_music')}
                    className="w-full text-left p-2.5 rounded bg-[#171b23] border border-[#262c36] hover:border-emerald-500/40 transition-colors flex flex-col gap-1 cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-[#eef2f7]">Custom Battle Tracks playlist</div>
                    <div className="text-[11px] text-[#687385] font-mono">libraries/sound_library.xml</div>
                  </button>

                  <button
                    onClick={() => handleLoadRecipe('shield_stats')}
                    className="w-full text-left p-2.5 rounded bg-[#171b23] border border-[#262c36] hover:border-emerald-500/40 transition-colors flex flex-col gap-1 cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-[#eef2f7]">Shield Generation Multipliers</div>
                    <div className="text-[11px] text-[#687385] font-mono">libraries/ship_macros.xml</div>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-[#a0aab8] border-b border-[#262c36] pb-1.5 mb-2 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
                  What are XML Diffs?
                </h3>
                <div className="bg-[#090b0f] p-3 rounded border border-[#262c36] text-[11px] leading-relaxed text-[#a0aab8] space-y-1.5">
                  <p>
                    In X4: Foundations, files are patched cleanly using RFC 5261 diffs so multiple mods can modify the same XML file safely.
                  </p>
                  <p>
                    • <span className="text-emerald-300 font-mono">&lt;add&gt;</span> appends nodes inside the selector.<br />
                    • <span className="text-emerald-300 font-mono">&lt;replace&gt;</span> replaces attributes or elements.<br />
                    • <span className="text-emerald-300 font-mono">&lt;remove&gt;</span> deletes matched elements.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div className="flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
                    Boilerplates &amp; Snippets
                  </h3>
                  
                  <button
                    onClick={() => setIsCreatingCustomBP(!isCreatingCustomBP)}
                    className="text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 px-2.5 py-1 rounded border border-emerald-500/30 transition-colors flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <PlusCircle className="w-3 h-3" />
                    {isCreatingCustomBP ? 'Cancel' : 'New'}
                  </button>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#687385]" />
                  <input
                    type="text"
                    placeholder="Search snippets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#090b0f] border border-[#262c36] text-xs text-[#eef2f7] rounded p-1.5 pl-8 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {isCreatingCustomBP ? (
                <form onSubmit={handleCreateCustomBoilerplate} className="bg-[#090b0f] border border-[#262c36] rounded p-3 space-y-2.5 shrink-0 select-none">
                  <div className="text-xs font-semibold text-emerald-300 border-b border-[#262c36] pb-1">Create Custom Boilerplate</div>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#a0aab8]">Snippet Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Inflow Engine Thrust"
                      value={newBPName}
                      onChange={(e) => setNewBPName(e.target.value)}
                      className="bg-[#11141a] border border-[#262c36] text-xs text-[#eef2f7] rounded p-1.5 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#a0aab8]">Description</label>
                    <input
                      type="text"
                      placeholder="Brief summary of what this code does"
                      value={newBPDescription}
                      onChange={(e) => setNewBPDescription(e.target.value)}
                      className="bg-[#11141a] border border-[#262c36] text-xs text-[#eef2f7] rounded p-1.5 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-[#a0aab8]">Target File</label>
                      <select
                        value={newBPRelativePath}
                        onChange={(e) => setNewBPRelativePath(e.target.value)}
                        className="bg-[#11141a] border border-[#262c36] text-[11px] text-[#eef2f7] rounded p-1.5 focus:outline-none cursor-pointer"
                      >
                        <option value="libraries/wares.xml">wares.xml</option>
                        <option value="libraries/baskets.xml">baskets.xml</option>
                        <option value="libraries/jobs.xml">jobs.xml</option>
                        <option value="libraries/god.xml">god.xml</option>
                        <option value="libraries/ship_macros.xml">ship_macros.xml</option>
                        <option value="libraries/factions.xml">factions.xml</option>
                        <option value="libraries/sound_library.xml">sound_library.xml</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-[#a0aab8]">Action Type</label>
                      <select
                        value={newBPAction}
                        onChange={(e) => setNewBPAction(e.target.value as any)}
                        className="bg-[#11141a] border border-[#262c36] text-[11px] text-[#eef2f7] rounded p-1.5 focus:outline-none cursor-pointer"
                      >
                        <option value="add">add node</option>
                        <option value="replace">replace attr/node</option>
                        <option value="remove">remove node</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#a0aab8]">XPath Selector / Node Target</label>
                    <XPathInput
                      targetPath={newBPRelativePath}
                      placeholder="e.g. /wares"
                      value={newBPSel}
                      onChange={setNewBPSel}
                      className="bg-[#11141a] border border-[#262c36] text-xs font-mono text-[#eef2f7] rounded p-1.5 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#a0aab8]">Code Content</label>
                    <textarea
                      placeholder="XML definition content..."
                      value={newBPContent}
                      onChange={(e) => setNewBPContent(e.target.value)}
                      rows={4}
                      className="bg-[#11141a] border border-[#262c36] text-xs font-mono text-[#eef2f7] rounded p-1.5 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs p-2 rounded font-semibold transition-colors cursor-pointer"
                  >
                    Save Boilerplate Snippet
                  </button>
                </form>
              ) : null}

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {[...customSnippets, ...BUILTIN_BOILERPLATES]
                  .filter(bp => {
                    const query = searchQuery.toLowerCase().trim();
                    if (!query) return true;
                    return (
                      bp.name.toLowerCase().includes(query) ||
                      bp.description.toLowerCase().includes(query) ||
                      bp.targetFile.toLowerCase().includes(query) ||
                      bp.content.toLowerCase().includes(query)
                    );
                  })
                  .map(bp => {
                    const isCustom = bp.id.startsWith('custom_bp_');
                    return (
                      <div
                        key={bp.id}
                        className="bg-[#171b23] border border-[#262c36] hover:border-emerald-500/40 p-2.5 rounded-lg flex flex-col gap-1.5 transition-colors group/bp relative"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex flex-col min-w-0">
                            <div className="text-xs font-semibold text-[#eef2f7] flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-[#a0aab8] shrink-0" />
                              <span className="truncate">{bp.name}</span>
                              {isCustom && <span className="text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 px-1.5 rounded">user</span>}
                            </div>
                            <div className="text-[11px] text-[#a0aab8] leading-normal mt-0.5">{bp.description}</div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => handleCopyToClipboardAndNotify(bp, e)}
                              className="p-1 rounded bg-[#090b0f] text-[#a0aab8] hover:text-blue-300 border border-[#262c36] cursor-pointer flex items-center justify-center transition-colors"
                              title="Copy code to clipboard"
                            >
                              {copiedSnippetId === bp.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            
                            {isCustom && (
                              <button
                                onClick={(e) => handleDeleteCustomSnippet(bp.id, e)}
                                className="p-1 rounded bg-[#090b0f] text-[#a0aab8] hover:text-rose-300 border border-[#262c36] cursor-pointer flex items-center justify-center transition-colors"
                                title="Delete custom snippet"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-[#687385]">
                          <span className="bg-[#090b0f] px-1.5 py-0.5 rounded text-[#a0aab8] truncate max-w-[140px]" title={bp.targetFile}>
                            {bp.targetFile}
                          </span>
                          <span className="bg-[#090b0f] px-1.5 py-0.5 rounded text-emerald-300">
                            sel: {bp.sel.substring(0, 16)}{bp.sel.length > 16 ? '...' : ''}
                          </span>
                          <span className="bg-[#090b0f] px-1.5 py-0.5 rounded text-fuchsia-300">
                            act: {bp.action}
                          </span>
                        </div>

                        <button
                          onClick={() => handleApplyBoilerplate(bp)}
                          className="w-full text-center py-1.5 mt-1 text-[11px] font-semibold text-emerald-200 hover:text-white bg-emerald-500/15 hover:bg-emerald-500/25 rounded border border-emerald-500/30 transition-colors cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Apply template to queue
                        </button>
                      </div>
                    );
                  })}
                {[...customSnippets, ...BUILTIN_BOILERPLATES].filter(bp => {
                  const query = searchQuery.toLowerCase().trim();
                  if (!query) return true;
                  return (
                    bp.name.toLowerCase().includes(query) ||
                    bp.description.toLowerCase().includes(query) ||
                    bp.targetFile.toLowerCase().includes(query) ||
                    bp.content.toLowerCase().includes(query)
                  );
                }).length === 0 && (
                  <div className="text-center py-8 text-[#687385] text-xs border border-[#262c36] rounded bg-[#090b0f]">
                    No snippets found matching your query.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center: Interactive Diff Blocks constructor */}
        <div data-xmlpatch-pane="blocks" className={`${compactPane === 'blocks' ? 'flex' : 'hidden'} min-[1500px]:flex min-w-0 flex-1 flex-col border-r border-[#262c36] overflow-hidden p-3 min-[1500px]:p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#262c36] mb-3 shrink-0">
            <h2 className="text-xs font-semibold text-[#eef2f7] flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-emerald-400" />
              Active Patch Blocks Queue
            </h2>
            
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleAddPatchBlock('add')}
                className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 rounded text-[11px] font-medium text-emerald-200 cursor-pointer"
              >
                + Add Block
              </button>
              <button
                onClick={() => handleAddPatchBlock('replace')}
                className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 rounded text-[11px] font-medium text-amber-200 cursor-pointer"
              >
                Replace Block
              </button>
              <button
                onClick={() => handleAddPatchBlock('remove')}
                className="px-2.5 py-1 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 rounded text-[11px] font-medium text-rose-200 cursor-pointer"
              >
                Remove Block
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1 custom-scrollbar">
            {activeSourceDiff && (
              <div
                data-testid="xmlpatch-source-diff-panel"
                className="bg-[#11141a] border border-emerald-500/35 p-3.5 rounded-lg space-y-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-mono text-emerald-300">
                        Source-Backed (Disk)
                      </span>
                      <span className="font-mono text-xs font-semibold text-[#eef2f7] truncate">
                        {activeSourceDiff.path}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#687385] mt-0.5">
                      {activeSourceDiff.ops.length} RFC 5261 operation{activeSourceDiff.ops.length === 1 ? '' : 's'} preserved byte-losslessly on disk.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await openOrMaterializeInNativeEditor(workspace, activeSourceDiff.path);
                      toast(result.message, result.ok ? 'success' : 'error');
                    }}
                    className="px-2.5 py-1 rounded border border-emerald-500/35 bg-emerald-500/15 hover:bg-emerald-500/25 text-[11px] font-medium text-emerald-200 cursor-pointer inline-flex items-center gap-1 shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open File
                  </button>
                </div>

                {activeSourceDiff.parseError && (
                  <div className="rounded border border-rose-500/40 bg-rose-950/25 p-2.5 text-[11px] text-rose-200 font-mono">
                    XML Parse Error: {activeSourceDiff.parseError}
                  </div>
                )}

                <div className="space-y-2">
                  {activeSourceDiff.ops.map(op => {
                    const syntheticBlock: PatchBlock = {
                      id: `${activeSourceDiff.id}_op_${op.index}`,
                      sel: op.sel,
                      action: op.op,
                      content: op.content,
                      note: activeSourceDiff.path,
                      pos: op.pos,
                      attrType: op.attrType,
                      targetFile: activeSourceDiff.path,
                    };
                    const xpathCheck = validateBlockXPath(syntheticBlock);
                    return (
                      <div
                        key={syntheticBlock.id}
                        data-testid={`xmlpatch-source-op-${op.index}`}
                        className="rounded border border-[#262c36] bg-[#090b0f] p-3 space-y-1.5 text-[11px]"
                      >
                        <div className="flex items-center gap-2 flex-wrap font-mono">
                          <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300 font-semibold uppercase">
                            #{op.index + 1} {op.op}
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
                        <div className="font-mono text-[11px] text-[#687385]">{xpathCheck.message}</div>
                        {op.content && (
                          <pre className="rounded border border-[#262c36] bg-[#0c0e12] p-2 font-mono text-[11px] text-[#cbd5e1] overflow-x-auto whitespace-pre">
                            {op.content}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredBlocks.length === 0 ? (
              !activeSourceDiff && (
                <div className="text-center py-24 text-xs text-[#687385]">
                  No patch blocks for this file. Click a header action to add a custom patch.
                </div>
              )
            ) : (
              filteredBlocks.map((b, bidx) => (
                <div
                  key={b.id}
                  className="bg-[#11141a] border border-[#262c36] hover:border-emerald-500/35 p-3.5 rounded-lg flex flex-col gap-2.5 relative group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[11px] bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-emerald-300 font-semibold uppercase rounded font-mono shrink-0">
                        #{bidx + 1} {b.action}
                      </span>
                      <input
                        type="text"
                        value={b.note}
                        onChange={(e) => handleUpdatePatchBlock(b.id, 'note', e.target.value)}
                        className="flex-1 min-w-0 font-semibold text-xs text-[#eef2f7] bg-transparent border-b border-transparent hover:border-[#262c36] focus:border-blue-500 focus:outline-none transition-colors py-0.5"
                        placeholder="Patch item description note..."
                      />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleSaveBlockAsBoilerplate(b)}
                        className="text-[#687385] hover:text-emerald-300 p-1 rounded hover:bg-[#171b23] transition-colors cursor-pointer"
                        title="Save this block to Boilerplates library"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeletePatchBlock(b.id)}
                        className="text-[#687385] hover:text-rose-300 p-1 rounded hover:bg-[#171b23] transition-colors cursor-pointer"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Target Node XPath selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 text-[11px]">
                    <span className="text-[#a0aab8] font-medium w-24 shrink-0">Sel (XPath):</span>
                    <XPathInput
                      targetPath={targetFile}
                      value={b.sel}
                      onChange={value => handleUpdatePatchBlock(b.id, 'sel', value)}
                      className="bg-[#090b0f] border border-[#262c36] rounded px-2.5 py-1.5 text-[#eef2f7] w-full focus:outline-none focus:border-blue-500 text-xs font-mono"
                      placeholder="e.g. /wares/ware[@id='ore']"
                    />
                  </div>

                  {/* Position selector for 'add' action */}
                  {b.action === 'add' && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 text-[11px]">
                      <span className="text-[#a0aab8] font-medium w-24 shrink-0">Position (pos):</span>
                      <select
                        value={b.pos || 'append'}
                        onChange={(e) => handleUpdatePatchBlock(b.id, 'pos', e.target.value)}
                        className="bg-[#090b0f] border border-[#262c36] rounded px-2.5 py-1.5 text-[#eef2f7] flex-1 focus:outline-none focus:border-blue-500 text-xs font-mono cursor-pointer"
                      >
                        <option value="append">append (Default - add as last child)</option>
                        <option value="prepend">prepend (add as first child)</option>
                        <option value="before">before (insert before target node)</option>
                        <option value="after">after (insert after target node)</option>
                      </select>
                    </div>
                  )}

                  {/* XPath Matches and Application Errors */}
                  {(() => {
                    const val = validateBlockXPath(b);
                    const err = applyPatchesResult.errors[b.id];
                    return (
                      <div className="sm:ml-24 text-[11px] font-mono flex flex-col gap-0.5">
                        {val.status === 'success' && (
                          <span className="text-emerald-300 font-semibold">{val.message}</span>
                        )}
                        {val.status === 'warn' && (
                          <span className="text-amber-300 font-medium">{val.message}</span>
                        )}
                        {val.status === 'error' && (
                          <span className="text-rose-300 font-semibold">{val.message}</span>
                        )}
                        {val.status === 'no_file' && (
                          <span className="text-[#687385]">{val.message}</span>
                        )}
                        {err && (
                          <span className="text-rose-300 font-semibold bg-rose-500/10 border border-rose-500/25 px-2 py-1 rounded mt-1">
                            Applied error: {err}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Code editor block for Add or Replace content */}
                  {b.action !== 'remove' && (
                    <div className="sm:ml-24 space-y-1 text-[11px]">
                      <span className="text-[#a0aab8] font-medium block">Patch Content:</span>
                      <textarea
                        value={b.content}
                        onChange={(e) => handleUpdatePatchBlock(b.id, 'content', e.target.value)}
                        rows={3}
                        className="w-full bg-[#090b0f] font-mono text-xs p-2.5 border border-[#262c36] focus:border-blue-500 rounded text-[#eef2f7] resize-y"
                        placeholder="<ware id='id' ... />"
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right side code preview area */}
        <div data-xmlpatch-pane="preview" className={`${compactPane === 'preview' ? 'flex' : 'hidden'} min-[1500px]:flex w-full min-[1500px]:w-[450px] min-w-0 bg-[#11141a] border-l border-[#262c36] p-3 min-[1500px]:p-4 flex-col overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-[#262c36] pb-2 mb-3 shrink-0 text-xs gap-2">
            <div className="hidden min-[1500px]:flex items-center gap-1 bg-[#090b0f] border border-[#262c36] p-0.5 rounded shrink-0">
              <button
                onClick={() => setRightPanelTab('patch')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded ${rightPanelTab === 'patch' ? 'bg-emerald-500 text-black' : 'text-[#a0aab8] hover:text-white'} cursor-pointer transition-colors`}
              >
                Patch XML
              </button>
              <button
                onClick={() => setRightPanelTab('preview')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded ${rightPanelTab === 'preview' ? 'bg-emerald-500 text-black' : 'text-[#a0aab8] hover:text-white'} cursor-pointer transition-colors`}
              >
                Applied Preview
              </button>
              <button
                onClick={() => setRightPanelTab('difftool')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded ${rightPanelTab === 'difftool' ? 'bg-fuchsia-500 text-black' : 'text-[#a0aab8] hover:text-white'} cursor-pointer transition-colors`}
              >
                Diff→Patch
              </button>
            </div>
            
            <button
              onClick={copyToClipboard}
              className="px-2.5 py-1 rounded bg-[#171b23] hover:text-white font-medium text-[11px] border border-[#262c36] text-[#a0aab8] cursor-pointer flex items-center gap-1 shrink-0"
            >
              Copy Diff
            </button>
          </div>

          {rightPanelTab === 'difftool' ? (
            <div className="flex-1 flex flex-col gap-2 min-h-0">
              <div className="flex flex-col gap-2 shrink-0">
                <div className="min-w-0">
                  <div className="text-[11px] text-[#a0aab8] font-medium truncate">
                    Three-pane merge: base file {'->'} edited candidate {'->'} generated patch
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono mt-1">
                    <span className="rounded border border-[#262c36] bg-[#090b0f] px-2 py-0.5 text-[#a0aab8]">
                      {dtChangedLineCount} line delta(s)
                    </span>
                    <span className={`rounded border px-2 py-0.5 ${dtResult ? 'border-fuchsia-500/35 bg-fuchsia-500/15 text-fuchsia-200' : 'border-[#262c36] bg-[#090b0f] text-[#687385]'}`}>
                      {dtResult ? `${dtResult.ops.length} op(s)` : 'not synthesized'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={openNativeDiff}
                    disabled={!baseFileContent}
                    title="Open the effective vanilla file and edited candidate in Antigravity's native diff viewer"
                    className="px-2.5 py-1.5 rounded bg-blue-500/15 hover:bg-blue-500/25 font-medium text-[11px] border border-blue-500/35 text-blue-200 cursor-pointer transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <GitCompare className="w-3.5 h-3.5" /> Native Diff
                  </button>
                  <button
                    onClick={runDiffToPatch}
                    disabled={dtBusy || !baseFileContent}
                    className="px-2.5 py-1.5 rounded bg-fuchsia-500/15 hover:bg-fuchsia-500/25 font-medium text-[11px] border border-fuchsia-500/35 text-fuchsia-200 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {dtBusy ? 'Synthesizing...' : 'Synthesize Patch'}
                  </button>
                  <button
                    onClick={resetEditedCandidate}
                    disabled={!baseFileContent}
                    className="px-2.5 py-1.5 rounded bg-[#171b23] hover:text-white font-medium text-[11px] border border-[#262c36] text-[#a0aab8] cursor-pointer transition-colors disabled:opacity-50"
                  >
                    Reset
                  </button>
                  <button
                    onClick={adoptSynthesizedOps}
                    disabled={!dtResult?.ops.length}
                    className="px-2.5 py-1.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 font-medium text-[11px] border border-emerald-500/35 text-emerald-200 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    Add to Workspace
                  </button>
                </div>
              </div>
              <div className="grid grid-rows-3 gap-2 flex-1 min-h-0">
                <div className="min-w-0 flex flex-col rounded-lg border border-[#262c36] bg-[#090b0f] overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-[#262c36] px-2.5 py-1.5 font-mono text-[11px]">
                    <span className="font-semibold text-[#a0aab8]">Base XML</span>
                    <span className="truncate text-[#687385]" title={targetFile}>{targetFile}</span>
                  </div>
                  <pre className="flex-1 min-h-0 overflow-auto custom-scrollbar p-2.5 font-mono text-[11px] leading-relaxed text-[#a0aab8] whitespace-pre-wrap break-all select-text">
                    {baseFileLoading ? 'Loading vanilla content...' : (baseFileError || dtBasePreview || 'No vanilla content loaded.')}
                  </pre>
                </div>

                <div className="min-w-0 flex flex-col rounded-lg border border-fuchsia-500/30 bg-[#090b0f] overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-fuchsia-500/20 px-2.5 py-1.5 font-mono text-[11px]">
                    <span className="font-semibold text-fuchsia-300">Edited XML</span>
                    <span className="text-[#687385]">candidate</span>
                  </div>
                  <textarea
                    data-testid="diff-patch-edited-xml"
                    value={baseFileSession ? dtEdited : ''}
                    onChange={e => updateEditedCandidate(e.target.value)}
                    spellCheck={false}
                    disabled={!baseFileContent}
                    placeholder={baseFileLoading ? 'Loading vanilla content...' : (baseFileError || 'No vanilla content available for this target.')}
                    className="flex-1 min-h-0 bg-transparent p-2.5 font-mono text-[11px] leading-relaxed text-[#eef2f7] resize-none focus:outline-none custom-scrollbar"
                  />
                </div>

                <div className="min-w-0 flex flex-col rounded-lg border border-emerald-500/25 bg-[#090b0f] overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-emerald-500/20 px-2.5 py-1.5 font-mono text-[11px]">
                    <span className="font-semibold text-emerald-300">Patch XML</span>
                    <span className="text-[#687385]">generated</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-2.5">
                    {dtError ? (
                      <div className="text-rose-300 text-xs bg-rose-500/10 border border-rose-500/25 rounded p-2">{dtError}</div>
                    ) : dtResult ? (
                      <div className="space-y-1.5">
                        {(dtResult.warnings || []).map((w, i) => (
                          <div key={i} className="text-amber-300 text-[11px] leading-snug">{w}</div>
                        ))}
                        <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-[#eef2f7] select-text">{dtPatchPreview}</pre>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-center text-[11px] text-[#687385] px-4">
                        Run synthesis to generate the minimal X4 diff patch for the edited candidate.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : rightPanelTab === 'patch' ? (
            <div className="flex-1 bg-[#090b0f] rounded-lg p-3 font-mono text-[11px] text-[#eef2f7] overflow-y-auto relative custom-scrollbar border border-[#262c36] leading-relaxed select-text">
              <pre
                data-testid={filteredBlocks.length === 0 && activeSourceDiff ? 'xmlpatch-source-raw-xml' : 'xmlpatch-generated-xml'}
                className="whitespace-pre"
              >
                {compileDiffDocument()}
              </pre>
            </div>
          ) : (
            <div className="flex-1 bg-[#090b0f] rounded-lg p-3 font-mono text-[11px] overflow-y-auto relative custom-scrollbar border border-[#262c36] leading-relaxed select-text flex flex-col gap-0.5">
              {baseFileLoading ? (
                <div className="text-center py-20 text-[#687385] text-xs">Loading base game XML...</div>
              ) : baseFileError ? (
                <div className="text-center py-16 text-[#687385] text-xs whitespace-pre-line px-4 leading-relaxed">
                  {baseFileError || `Effective canonical file '${targetFile}' is unavailable.`}
                </div>
              ) : (
                <div className="flex flex-col font-mono text-[11px]">
                  <div className="text-[11px] text-[#a0aab8] border-b border-[#262c36] pb-1.5 mb-1.5 font-semibold">
                    Unified Diff: {targetFile}
                  </div>
                  {diffSnippet.map((line, idx) => {
                    let lineClass = 'text-[#a0aab8]';
                    let prefix = ' ';
                    if (line.type === 'addition') {
                      lineClass = 'bg-emerald-950/45 text-emerald-300 border-l-2 border-emerald-500 px-1';
                      prefix = '+';
                    } else if (line.type === 'deletion') {
                      lineClass = 'bg-rose-950/45 text-rose-300 border-l-2 border-red-500 px-1';
                      prefix = '-';
                    } else if (line.label === '...') {
                      lineClass = 'text-[#687385] bg-[#141820] px-1 border-y border-[#262c36] py-0.5 my-0.5';
                      prefix = '';
                    }
                    return (
                      <div key={idx} className={`flex items-start font-mono transition-colors ${lineClass}`}>
                        <span className="w-10 select-none text-[11px] text-[#687385] mr-2 border-r border-[#262c36] pr-1.5 text-right font-normal shrink-0">
                          {line.label}
                        </span>
                        <span className="select-none font-bold text-[#687385] mr-1 shrink-0 w-3 text-center">{prefix}</span>
                        <span className="whitespace-pre flex-1 overflow-x-auto break-all select-text">{line.value}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
