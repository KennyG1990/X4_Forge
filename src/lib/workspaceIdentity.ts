/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Workspace identity hash (BACKLOG B1, 2026-07-09 — sync-trust slice).
 *
 * The client/server workspace sync trusts a bare integer version; when the adoption gate
 * mis-fires (the restart-reset class fixed the same day), the canvas silently diverges
 * from the server with NOTHING visible to the user. This module gives both sides one
 * deterministic content hash so divergence can be DETECTED and SHOWN (a badge, not a
 * guess), and the user chooses: adopt the server copy or keep editing (their next edit
 * syncs up normally). Pure logic, shared by browser and server — no I/O, no crypto dep.
 */

import type { ModWorkspace } from '../types';

/** Deterministic JSON: objects serialize with sorted keys; undefined drops (like JSON). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(v => stableStringify(v === undefined ? null : v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** FNV-1a 32-bit ×2 over a string (same recipe as compileFidelity — proven adequate for
 * "did this content change", not a security boundary). */
function fnvHash(text: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c; h2 = Math.imul(h2, 0x01000193) >>> 0; h2 = (h2 + 0x9e3779b9) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/**
 * The exact deployable substance used by the legacy content hash.
 *
 * Keep this as the single field-list authority. Callers should sanitize the workspace before
 * asking for a canonical payload/string so browser and server receive the same shape.
 * Missing values remain present in the payload object and are omitted by stableStringify,
 * preserving the existing JSON-compatible semantics.
 */
export function canonicalWorkspaceContentPayload(ws: ModWorkspace | null | undefined): Record<string, unknown> | null {
  if (!ws || typeof ws !== 'object') return null;
  const w = ws as unknown as Record<string, unknown>;
  return {
    name: w.name, version: w.version, author: w.author, description: w.description,
    nodes: w.nodes, links: w.links,
    uiWidgets: w.uiWidgets, aiScripts: w.aiScripts, wares: w.wares, jobs: w.jobs,
    tFiles: w.tFiles, xmlPatches: w.xmlPatches, customLua: w.customLua,
    compileSettings: w.compileSettings, dependencies: w.dependencies,
    passthroughFiles: w.passthroughFiles, originalFiles: w.originalFiles,
    sourceStamp: w.sourceStamp, integrationContract: w.integrationContract,
    mdFileStem: w.mdFileStem,
  };
}

/** Stable string authority shared by the legacy short hash and server receipt hashing. */
export function canonicalWorkspaceContentString(ws: ModWorkspace | null | undefined): string {
  return stableStringify(canonicalWorkspaceContentPayload(ws));
}

/** Stable string authority for every field in an already-sanitized workspace snapshot. */
export function canonicalWorkspaceSnapshotString(ws: ModWorkspace | null | undefined): string {
  return stableStringify(ws);
}

/**
 * Content hash of the CANONICAL workspace substance. Includes everything that deploys
 * (nodes/links/domains/passthrough/stamp/meta); both sides must hash the same sanitized
 * shape — hash AFTER sanitizeWorkspace on both ends.
 */
export function workspaceContentHash(ws: ModWorkspace | null | undefined): string {
  if (!ws || typeof ws !== 'object') return 'empty';
  return fnvHash(canonicalWorkspaceContentString(ws));
}

/**
 * Complete digest of one already-sanitized authoritative workspace snapshot.
 *
 * This is deliberately separate from `workspaceContentHash`: that legacy hash is persisted
 * as the registry/CAS head and intentionally covers deployable substance. Polling needs to
 * observe every persisted/UI field without migrating or invalidating those durable heads.
 * `workspace.id` remains part of this digest because authoring surfaces use it for generated
 * paths and script identities. The registry canonicalizes accepted legacy records that omit
 * it before hashing/exposure, so the same stored record remains deterministic across processes.
 * Callers must sanitize first so server and browser compare the same canonical shape.
 */
export function workspaceSnapshotHash(ws: ModWorkspace | null | undefined): string {
  if (!ws || typeof ws !== 'object') return 'empty';
  return fnvHash(canonicalWorkspaceSnapshotString(ws));
}

const MAX_EXACT_DATA_COMPARISON_DEPTH = 64;
const MAX_EXACT_DATA_COMPARISON_VISITS = 100000;
const MAX_EXACT_DATA_COMPARISON_OWN_KEYS = 500000;

interface ExactDataComparisonContext {
  readonly leftActive: WeakSet<object>;
  readonly rightActive: WeakSet<object>;
  readonly completedPairs: WeakMap<object, WeakSet<object>>;
  visits: number;
  ownKeys: number;
}

function hasCompletedPair(
  context: ExactDataComparisonContext,
  left: object,
  right: object,
): boolean {
  return context.completedPairs.get(left)?.has(right) === true;
}

function rememberCompletedPair(
  context: ExactDataComparisonContext,
  left: object,
  right: object,
): void {
  let rights = context.completedPairs.get(left);
  if (!rights) {
    rights = new WeakSet<object>();
    context.completedPairs.set(left, rights);
  }
  rights.add(right);
}

/**
 * Compare ordinary data without invoking accessors or relying on a lossy/hash comparison.
 * A false result deliberately means "use the normalized value" at the App boundary.
 */
function exactPlainDataEqual(
  left: unknown,
  right: unknown,
  context: ExactDataComparisonContext,
  depth: number,
): boolean {
  if (left === null || right === null) return left === right;

  const leftType = typeof left;
  const rightType = typeof right;
  if (leftType !== rightType) return false;
  if (leftType === 'undefined' || leftType === 'string' || leftType === 'number' || leftType === 'boolean') {
    return Object.is(left, right);
  }
  if (leftType !== 'object') return false;

  const leftObject = left as object;
  const rightObject = right as object;
  if (depth > MAX_EXACT_DATA_COMPARISON_DEPTH || context.visits >= MAX_EXACT_DATA_COMPARISON_VISITS) return false;
  let leftIsArray: boolean;
  let rightIsArray: boolean;
  try {
    leftIsArray = Array.isArray(leftObject);
    rightIsArray = Array.isArray(rightObject);
    if (leftIsArray !== rightIsArray) return false;

    const leftPrototype = Object.getPrototypeOf(leftObject);
    const rightPrototype = Object.getPrototypeOf(rightObject);
    const supportedLeftPrototype = leftIsArray
      ? leftPrototype === Array.prototype
      : leftPrototype === Object.prototype || leftPrototype === null;
    const supportedRightPrototype = leftIsArray
      ? rightPrototype === Array.prototype
      : rightPrototype === Object.prototype || rightPrototype === null;
    if (!supportedLeftPrototype || !supportedRightPrototype || leftPrototype !== rightPrototype) return false;
    if (context.leftActive.has(leftObject) || context.rightActive.has(rightObject)) return false;
    if (hasCompletedPair(context, leftObject, rightObject)) return true;

    context.visits += 1;
    context.leftActive.add(leftObject);
    context.rightActive.add(rightObject);
    const leftKeys = Reflect.ownKeys(leftObject);
    const rightKeys = Reflect.ownKeys(rightObject);
    if (leftKeys.length !== rightKeys.length) return false;
    if (context.ownKeys + leftKeys.length > MAX_EXACT_DATA_COMPARISON_OWN_KEYS) return false;
    context.ownKeys += leftKeys.length;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const leftKey = leftKeys[index]!;
      const rightKey = rightKeys[index]!;
      if (leftKey !== rightKey) return false;

      const leftDescriptor = Object.getOwnPropertyDescriptor(leftObject, leftKey);
      const rightDescriptor = Object.getOwnPropertyDescriptor(rightObject, rightKey);
      if (!leftDescriptor || !rightDescriptor || !('value' in leftDescriptor) || !('value' in rightDescriptor)) {
        return false;
      }
      // SourceEdits freezes its accepted data; sanitizer clones may be mutable.
      // Those flags do not change data, but enumerability and every own value do.
      if (
        leftDescriptor.enumerable !== rightDescriptor.enumerable
        || !exactPlainDataEqual(leftDescriptor.value, rightDescriptor.value, context, depth + 1)
      ) return false;
    }
    rememberCompletedPair(context, leftObject, rightObject);
    return true;
  } catch {
    return false;
  } finally {
    context.leftActive.delete(leftObject);
    context.rightActive.delete(rightObject);
  }
}

/**
 * Retain the caller's workspace object only when normalization made no exact, safe data change.
 * Freezing or sealing the candidate does not change its data, keys or enumerability.
 * Unsupported graphs and descriptor shapes always fall back to the sanitizer's result.
 */
export function retainWorkspaceCandidateIfNormalizedUnchanged<T>(candidate: T, normalized: T): T {
  try {
    return exactPlainDataEqual(candidate, normalized, {
      leftActive: new WeakSet<object>(),
      rightActive: new WeakSet<object>(),
      completedPairs: new WeakMap<object, WeakSet<object>>(),
      visits: 0,
      ownKeys: 0,
    }, 0)
      ? candidate
      : normalized;
  } catch {
    return normalized;
  }
}

/* ------------------------------------------------------------------ *
 * Oracle
 * ------------------------------------------------------------------ */

export function runWorkspaceIdentitySelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  const base = {
    name: 'M', nodes: [{ id: 'n1', type: 'cue', properties: { name: 'Start', b: 1, a: 2 } }],
    links: [{ sourceNodeId: 'n1', targetNodeId: 'n2' }],
  } as unknown as ModWorkspace;

  // Compatibility fixtures captured before canonical payload extraction.
  ok('legacy_content_fixture_unchanged', workspaceContentHash(base) === 'c616589ddd4fd2a7');
  ok('legacy_snapshot_fixture_unchanged', workspaceSnapshotHash(base) === 'c616589ddd4fd2a7');

  const validCandidate = {
    id: 'workspace_identity_fixture',
    name: 'Identity Fixture',
    version: '1.0.0',
    author: 'Forge',
    description: 'identity helper fixture',
    nodes: [{
      id: 'node', type: 'cue', xmlTag: 'cue', label: 'Cue', x: 10, y: 20,
      properties: { name: 'Start' }, propertiesSchema: [], inputs: [], outputs: [], includeInBuild: true,
    }],
    links: [{ sourceNodeId: 'node', targetNodeId: 'node' }],
    uiWidgets: [{ id: 'widget', type: 'label', x: 10, y: 10, w: 100, h: 20, label: 'Ready', properties: {}, includeInBuild: true }],
    uiTheme: { backgroundColor: '#000', borderColor: '#111', accentColor: '#222', opacity: 1, showIcons: true },
    passthroughFiles: [
      { path: 'ui.xml', content: '<addon/>', reason: 'partial', bytes: 8 },
      { path: 'ui/menu.lua', content: 'return {}', reason: 'partial', bytes: 10 },
    ],
    compileSettings: { md: false, ui: true, ai: false, library: false, translations: false, patches: false },
    customLua: 'return {}',
  } as unknown as ModWorkspace;
  const validNormalized = JSON.parse(JSON.stringify(validCandidate)) as ModWorkspace;
  ok(
    'safe_exact_valid_nonempty_candidate_retains_identity',
    retainWorkspaceCandidateIfNormalizedUnchanged(validCandidate, validNormalized) === validCandidate,
  );
  const editedCandidate = {
    ...validCandidate,
    nodes: [...validCandidate.nodes, { ...validCandidate.nodes[0]!, id: 'node2' }],
  } as ModWorkspace;
  const editedNormalized = JSON.parse(JSON.stringify(editedCandidate)) as ModWorkspace;
  ok(
    'safe_exact_valid_edit_retains_identity',
    retainWorkspaceCandidateIfNormalizedUnchanged(editedCandidate, editedNormalized) === editedCandidate,
  );

  // Match SourceEdits' accepted-result freeze: every nested own data value is frozen,
  // including source records and arrays, without reading accessor properties.
  const freezeSourceEditFixture = <T>(value: T, seen = new WeakSet<object>()): T => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor) freezeSourceEditFixture(descriptor.value, seen);
    }
    return Object.freeze(value);
  };
  const frozenEditCandidate = JSON.parse(JSON.stringify(validCandidate)) as ModWorkspace;
  const editedLua = 'row[1]:createText("Edited title", { font = "Zekton", fontsize = 9 })';
  frozenEditCandidate.passthroughFiles![1] = {
    ...frozenEditCandidate.passthroughFiles![1]!,
    content: editedLua,
    bytes: editedLua.length,
  };
  const mutableEditNormalized = JSON.parse(JSON.stringify(frozenEditCandidate)) as ModWorkspace;
  freezeSourceEditFixture(frozenEditCandidate);
  ok(
    'source_edit_fixture_is_deep_frozen_and_normalized_clone_mutable',
    Object.isFrozen(frozenEditCandidate)
      && Object.isFrozen(frozenEditCandidate.nodes)
      && Object.isFrozen(frozenEditCandidate.nodes[0]!.properties)
      && Object.isFrozen(frozenEditCandidate.passthroughFiles)
      && Object.isFrozen(frozenEditCandidate.passthroughFiles![1])
      && !Object.isFrozen(mutableEditNormalized)
      && !Object.isFrozen(mutableEditNormalized.passthroughFiles![1]),
  );
  ok(
    'deep_frozen_source_edit_retains_identity_when_data_unchanged',
    retainWorkspaceCandidateIfNormalizedUnchanged(frozenEditCandidate, mutableEditNormalized) === frozenEditCandidate,
  );
  const correctedFrozenEdit = JSON.parse(JSON.stringify(mutableEditNormalized)) as ModWorkspace;
  correctedFrozenEdit.passthroughFiles![1]!.content = editedLua.replace('Edited title', 'Corrected title');
  ok(
    'deep_frozen_source_edit_changed_data_uses_normalized',
    retainWorkspaceCandidateIfNormalizedUnchanged(frozenEditCandidate, correctedFrozenEdit) === correctedFrozenEdit,
  );
  const correctedFrozenMetadata = JSON.parse(JSON.stringify(mutableEditNormalized)) as ModWorkspace;
  correctedFrozenMetadata.passthroughFiles![1]!.bytes = editedLua.length + 1;
  ok(
    'deep_frozen_source_edit_changed_metadata_uses_normalized',
    retainWorkspaceCandidateIfNormalizedUnchanged(frozenEditCandidate, correctedFrozenMetadata) === correctedFrozenMetadata,
  );
  const changedFrozenEnumerability = JSON.parse(JSON.stringify(mutableEditNormalized)) as ModWorkspace;
  Object.defineProperty(changedFrozenEnumerability.passthroughFiles![1], 'content', { enumerable: false });
  ok(
    'deep_frozen_source_edit_changed_enumerability_uses_normalized',
    retainWorkspaceCandidateIfNormalizedUnchanged(frozenEditCandidate, changedFrozenEnumerability) === changedFrozenEnumerability,
  );
  const frozenAccessorCandidate = JSON.parse(JSON.stringify(mutableEditNormalized)) as ModWorkspace;
  let frozenAccessorRead = false;
  Object.defineProperty(frozenAccessorCandidate.passthroughFiles![1], 'content', {
    enumerable: true,
    configurable: true,
    get: () => {
      frozenAccessorRead = true;
      return editedLua;
    },
  });
  freezeSourceEditFixture(frozenAccessorCandidate);
  ok(
    'deep_frozen_source_edit_accessor_falls_back_without_reading',
    retainWorkspaceCandidateIfNormalizedUnchanged(frozenAccessorCandidate, mutableEditNormalized) === mutableEditNormalized
      && !frozenAccessorRead,
  );

  const malformedCandidate = { name: 'M' } as unknown as ModWorkspace;
  const defaultNormalized = { name: 'M', nodes: [], links: [] } as unknown as ModWorkspace;
  ok(
    'normalization_default_change_uses_normalized',
    retainWorkspaceCandidateIfNormalizedUnchanged(malformedCandidate, defaultNormalized) === defaultNormalized,
  );
  const metadataCandidate = {
    passthroughFiles: [{ path: 'ui.xml', content: '<addon/>', reason: 'partial', bytes: 8 }],
  } as unknown as ModWorkspace;
  const metadataNormalized = {
    passthroughFiles: [{ path: 'ui.xml', content: '<addon/>', reason: 'partial', bytes: 9 }],
  } as unknown as ModWorkspace;
  ok(
    'normalization_metadata_change_uses_normalized',
    retainWorkspaceCandidateIfNormalizedUnchanged(metadataCandidate, metadataNormalized) === metadataNormalized,
  );
  const orderCandidate = { records: [{ id: 'a' }, { id: 'b' }] } as unknown as ModWorkspace;
  const orderNormalized = { records: [{ id: 'b' }, { id: 'a' }] } as unknown as ModWorkspace;
  ok(
    'normalization_array_order_change_uses_normalized',
    retainWorkspaceCandidateIfNormalizedUnchanged(orderCandidate, orderNormalized) === orderNormalized,
  );
  const keyOrderCandidate = { a: 1, b: 2 } as unknown as ModWorkspace;
  const keyOrderNormalized = { b: 2, a: 1 } as unknown as ModWorkspace;
  ok(
    'normalization_object_order_change_uses_normalized',
    retainWorkspaceCandidateIfNormalizedUnchanged(keyOrderCandidate, keyOrderNormalized) === keyOrderNormalized,
  );

  let accessorRead = false;
  const accessorCandidate: Record<string, unknown> = {};
  Object.defineProperty(accessorCandidate, 'name', {
    configurable: true,
    enumerable: true,
    get: () => {
      accessorRead = true;
      return 'M';
    },
  });
  const accessorNormalized = { name: 'M' } as unknown as ModWorkspace;
  ok(
    'accessor_falls_back_without_reading',
    retainWorkspaceCandidateIfNormalizedUnchanged<unknown>(accessorCandidate, accessorNormalized) === accessorNormalized
      && !accessorRead,
  );
  const cyclicCandidate: Record<string, unknown> = { name: 'M' };
  cyclicCandidate.self = cyclicCandidate;
  const cyclicNormalized = { name: 'M' } as unknown as ModWorkspace;
  ok(
    'cycle_falls_back_to_normalized',
    retainWorkspaceCandidateIfNormalizedUnchanged<unknown>(cyclicCandidate, cyclicNormalized) === cyclicNormalized,
  );
  const sharedCandidate = { value: { label: 'shared' } } as Record<string, unknown>;
  const sharedNormalized = { value: { label: 'shared' } } as Record<string, unknown>;
  sharedCandidate.left = sharedCandidate.value;
  sharedCandidate.right = sharedCandidate.value;
  sharedNormalized.left = sharedNormalized.value;
  sharedNormalized.right = sharedNormalized.value;
  ok(
    'shared_dag_pair_memo_retains',
    retainWorkspaceCandidateIfNormalizedUnchanged(sharedCandidate, sharedNormalized) === sharedCandidate,
  );

  const representativeNodes = Array.from({ length: 3000 }, (_, index) => ({
    id: `node_${index}`,
    type: 'cue',
    xmlTag: 'cue',
    label: `Node ${index}`,
    x: index % 800,
    y: Math.floor(index / 800) * 20,
    properties: { name: `Node ${index}`, index },
    propertiesSchema: Array.from({ length: 8 }, (_, schemaIndex) => ({
      key: `field_${schemaIndex}`,
      label: `Field ${schemaIndex}`,
      type: 'text',
    })),
    inputs: Array.from({ length: 4 }, (_, inputIndex) => ({
      name: `input_${inputIndex}`,
      type: 'event',
    })),
    outputs: Array.from({ length: 4 }, (_, outputIndex) => ({
      name: `output_${outputIndex}`,
      type: 'event',
    })),
    includeInBuild: true,
  }));
  const representativeLinks = Array.from({ length: 2999 }, (_, index) => ({
    sourceNodeId: `node_${index}`,
    targetNodeId: `node_${index + 1}`,
  }));
  const representativeSourceFiles = Array.from({ length: 109 }, (_, index) => ({
    path: index === 0 ? 'content.xml' : index === 1 ? 'ui.xml' : `assets/source_${index}.dat`,
    content: `source-${index}`,
    reason: 'partial',
    bytes: 9,
  }));
  const representativeCandidate = {
    ...validCandidate,
    nodes: representativeNodes,
    links: representativeLinks,
    passthroughFiles: representativeSourceFiles,
  } as unknown as ModWorkspace;
  const representativeNormalized = JSON.parse(JSON.stringify(representativeCandidate)) as ModWorkspace;
  ok(
    'representative_workspace_retains_with_calibrated_budget',
    retainWorkspaceCandidateIfNormalizedUnchanged(representativeCandidate, representativeNormalized) === representativeCandidate,
  );

  let deepCandidate: Record<string, unknown> = { value: 'leaf' };
  let deepNormalized: Record<string, unknown> = { value: 'leaf' };
  for (let depth = 0; depth <= MAX_EXACT_DATA_COMPARISON_DEPTH; depth += 1) {
    deepCandidate = { next: deepCandidate };
    deepNormalized = { next: deepNormalized };
  }
  ok(
    'comparison_depth_budget_falls_back',
    retainWorkspaceCandidateIfNormalizedUnchanged(deepCandidate, deepNormalized) === deepNormalized,
  );

  const wideCandidateItems = Array.from(
    { length: MAX_EXACT_DATA_COMPARISON_VISITS + 2 },
    (_, index) => ({ index }),
  ) as Record<string, unknown>[];
  const wideNormalizedItems = wideCandidateItems.map(item => ({ ...item }));
  let budgetGetterRead = false;
  Object.defineProperty(wideCandidateItems[wideCandidateItems.length - 1]!, 'danger', {
    configurable: true,
    enumerable: true,
    get: () => {
      budgetGetterRead = true;
      return 'must not run';
    },
  });
  const wideCandidate = { items: wideCandidateItems } as unknown as ModWorkspace;
  const wideNormalized = { items: wideNormalizedItems } as unknown as ModWorkspace;
  ok(
    'comparison_visit_budget_falls_back_without_getter',
    retainWorkspaceCandidateIfNormalizedUnchanged(wideCandidate, wideNormalized) === wideNormalized
      && !budgetGetterRead,
  );
  const wideKeyCandidate: Record<string, unknown> = {};
  const wideKeyNormalized: Record<string, unknown> = {};
  for (let index = 0; index <= MAX_EXACT_DATA_COMPARISON_OWN_KEYS; index += 1) {
    const key = `key_${index}`;
    wideKeyCandidate[key] = index;
    wideKeyNormalized[key] = index;
  }
  let wideKeyGetterRead = false;
  Object.defineProperty(wideKeyCandidate, 'late', {
    configurable: true,
    enumerable: true,
    get: () => {
      wideKeyGetterRead = true;
      return 'must not run';
    },
  });
  wideKeyNormalized.late = 'safe fallback';
  ok(
    'comparison_key_budget_falls_back_without_getter',
    retainWorkspaceCandidateIfNormalizedUnchanged(wideKeyCandidate, wideKeyNormalized) === wideKeyNormalized
      && !wideKeyGetterRead,
  );
  const nonPlainCandidate = { stamp: new Date(0) } as unknown as ModWorkspace;
  const nonPlainNormalized = { stamp: '1970-01-01T00:00:00.000Z' } as unknown as ModWorkspace;
  ok(
    'unsupported_non_plain_value_falls_back',
    retainWorkspaceCandidateIfNormalizedUnchanged(nonPlainCandidate, nonPlainNormalized) === nonPlainNormalized,
  );

  // key order must not matter
  const reordered = {
    links: [{ targetNodeId: 'n2', sourceNodeId: 'n1' }],
    nodes: [{ properties: { a: 2, b: 1, name: 'Start' }, type: 'cue', id: 'n1' }],
    name: 'M',
  } as unknown as ModWorkspace;
  ok('key_order_independent', workspaceContentHash(base) === workspaceContentHash(reordered));

  // undefined field === absent field (JSON round-trip through the API drops undefined)
  const withUndef = { ...base, customLua: undefined } as unknown as ModWorkspace;
  ok('undefined_equals_absent', workspaceContentHash(base) === workspaceContentHash(withUndef));

  // any substance change is detected
  const edited = JSON.parse(JSON.stringify(base)); edited.nodes[0].properties.name = 'Start2';
  ok('node_property_change_detected', workspaceContentHash(base) !== workspaceContentHash(edited));
  const linkEdit = JSON.parse(JSON.stringify(base)); linkEdit.links.push({ sourceNodeId: 'n2', targetNodeId: 'n3' });
  ok('link_add_detected', workspaceContentHash(base) !== workspaceContentHash(linkEdit));
  const renamed = JSON.parse(JSON.stringify(base)); renamed.name = 'M2';
  ok('workspace_rename_detected', workspaceContentHash(base) !== workspaceContentHash(renamed));
  ok('snapshot_hash_detects_non_cas_field', workspaceSnapshotHash(base) !== workspaceSnapshotHash({
    ...base,
    uiTheme: { backgroundColor: '#000', borderColor: '#111', accentColor: '#222', opacity: 1, showIcons: true },
  } as ModWorkspace));
  ok('snapshot_hash_detects_authoritative_internal_id', workspaceSnapshotHash(base) !== workspaceSnapshotHash({
    ...base,
    id: 'different-legacy-local-id',
  } as ModWorkspace));

  // JSON round-trip stability (client → POST → server → GET → client)
  ok('json_roundtrip_stable', workspaceContentHash(JSON.parse(JSON.stringify(base))) === workspaceContentHash(base));

  // degradation
  ok('null_and_undefined_hash_empty', workspaceContentHash(null) === 'empty' && workspaceContentHash(undefined) === 'empty');
  ok('snapshot_null_and_undefined_hash_empty', workspaceSnapshotHash(null) === 'empty' && workspaceSnapshotHash(undefined) === 'empty');

  // stableStringify basics
  ok('stable_stringify_sorts_keys', stableStringify({ b: 1, a: 2 }) === '{"a":2,"b":1}');
  ok('stable_stringify_arrays_ordered', stableStringify([1, 2]) !== stableStringify([2, 1]));

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
