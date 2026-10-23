/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * An ordered, source-preserving view of an imported X4 UI menu registration
 * and caller-supplied Lua texts.  This module deliberately has no knowledge
 * of the filesystem: callers provide every source string explicitly.
 */

import { DOMParser } from '@xmldom/xmldom';
import {
  buildX4UiCallModel,
  type X4UiCallModel,
  type X4UiLuaFileInput,
  type X4UiVerificationGap,
  type X4UiVerificationGapCategory
} from './x4UiCallModel';
import { indexXmlElementSpans, xmlElementSemanticPath, type XmlElementSourceSpan } from './xmlSourceSpans';

export interface X4UiSourceFileInputWithPath {
  readonly path: string;
  readonly text: string;
  readonly sourcePath?: string;
}

/** The existing call-model API calls the same user-facing path `rel`. */
export interface X4UiSourceFileInputWithRel {
  readonly rel: string;
  readonly text: string;
  readonly sourcePath?: string;
}

export type X4UiSourceFileInput = X4UiSourceFileInputWithPath | X4UiSourceFileInputWithRel;
export type X4UiSourceFileMap = Readonly<Record<string, string>>;
export type X4UiSourceFileInputs = readonly X4UiSourceFileInput[] | X4UiSourceFileMap;

export interface X4UiSourceBundleInput {
  readonly uiXml: string;
  readonly luaFiles: X4UiSourceFileInputs;
}

export type X4UiSourceDiagnosticSeverity = 'info' | 'warning' | 'error';

export type X4UiSourceDiagnosticCode =
  | 'malformed-xml'
  | 'missing-registration-name'
  | 'invalid-registration-path'
  | 'unsafe-traversal-registration'
  | 'unsafe-absolute-registration'
  | 'missing-lua-file'
  | 'duplicate-registration'
  | 'ambiguous-lua-file'
  | 'unregistered-lua-file'
  | 'unsafe-lua-file'
  | 'duplicate-supplied-lua-file'
  | 'lua-parse-failure'
  | 'dynamic-call-model-gap'
  | 'unsupported-call-model-gap';

export interface X4UiSourceDiagnostic {
  readonly code: X4UiSourceDiagnosticCode;
  readonly severity: X4UiSourceDiagnosticSeverity;
  readonly message: string;
  readonly registrationIndex?: number;
  readonly sourceIndex?: number;
  readonly path?: string;
  readonly gapCategory?: X4UiVerificationGapCategory;
}

export type X4UiXmlIssueLevel = 'warning' | 'error' | 'fatal';

export interface X4UiXmlIssue {
  readonly level: X4UiXmlIssueLevel;
  readonly message: string;
}

export interface X4UiSourceXmlState {
  readonly status: 'parsed' | 'malformed';
  readonly parsed: boolean;
  readonly issues: readonly X4UiXmlIssue[];
}

export type X4UiRegistrationPathSafety =
  | 'safe'
  | 'unsafe-traversal'
  | 'unsafe-absolute'
  | 'invalid';

export type X4UiRegistrationResolution =
  | 'resolved'
  | 'missing-file'
  | 'duplicate-registration'
  | 'ambiguous-source-file'
  | 'unsafe-traversal'
  | 'unsafe-absolute'
  | 'missing-name'
  | 'invalid-path'
  | 'malformed-xml';

export interface X4UiSourceRegistration {
  /** Zero-based position in the menu registration document order. */
  readonly index: number;
  readonly order: number;
  /** The decoded attribute value, retained exactly as supplied by the XML DOM. */
  readonly rawPath?: string;
  /** Alias making the preserved registration spelling explicit to consumers. */
  readonly rawSpelling?: string;
  /** A lookup-only key. It never replaces `rawPath` in the source projection. */
  readonly lookupKey?: string;
  readonly pathSafety: X4UiRegistrationPathSafety;
  readonly resolution: X4UiRegistrationResolution;
  readonly duplicate: boolean;
  readonly locked: boolean;
  readonly sourceIndexes: readonly number[];
  /** Present when exactly one supplied source has this contained lookup key. */
  readonly sourceIndex?: number;
}

export type X4UiLuaParseStatus = 'parsed' | 'locked';
export type X4UiCallModelVerificationStatus = 'verified' | 'unverified' | 'locked';

export interface X4UiSourceFile {
  readonly index: number;
  /** Caller spelling; this is never rewritten by normalization. */
  readonly path: string;
  readonly rawPath: string;
  readonly sourcePath?: string;
  readonly lookupKey?: string;
  readonly text: string;
  readonly callModel: X4UiCallModel;
  readonly parseStatus: X4UiLuaParseStatus;
  readonly verificationStatus: X4UiCallModelVerificationStatus;
  readonly verificationGaps: readonly X4UiVerificationGap[];
  readonly registrationIndexes: readonly number[];
  readonly registered: boolean;
  readonly unregistered: boolean;
  /** True only when an explicit CAS splice can target this source. */
  readonly editable: boolean;
  readonly diagnostics: readonly X4UiSourceDiagnostic[];
}

export interface X4UiSourceBundle {
  /** Raw ui.xml text, including BOM, line endings, and all formatting. */
  readonly uiXml: string;
  readonly xml: X4UiSourceXmlState;
  readonly registrations: readonly X4UiSourceRegistration[];
  /** Alias for consumers that want to emphasize document order. */
  readonly orderedRegistrations: readonly X4UiSourceRegistration[];
  readonly sourceFiles: readonly X4UiSourceFile[];
  /** Alias for `sourceFiles`; no source is dropped from this collection. */
  readonly files: readonly X4UiSourceFile[];
  /** Resolved sources in valid XML registration order; duplicates remain repeated. */
  readonly orderedFiles: readonly X4UiSourceFile[];
  readonly unregisteredFiles: readonly X4UiSourceFile[];
  readonly diagnostics: readonly X4UiSourceDiagnostic[];
  readonly locked: boolean;
  readonly hasUnverifiedCallModelGaps: boolean;
}

export interface X4UiSourceProjectionFile {
  readonly path: string;
  readonly text: string;
  readonly sourcePath?: string;
}

export interface X4UiSourceBundleProjection {
  readonly uiXml: string;
  readonly luaFiles: readonly X4UiSourceProjectionFile[];
}

export interface X4UiSourceSplice {
  readonly path: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly expectedText: string;
  readonly replacement: string;
}

export type X4UiSourceEdit = X4UiSourceSplice;

export type X4UiSourceSpliceRefusalReason =
  | 'malformed-xml'
  | 'invalid-path'
  | 'unsafe-traversal-path'
  | 'unsafe-absolute-path'
  | 'not-registered'
  | 'missing-file'
  | 'ambiguous-registration'
  | 'ambiguous-source-file'
  | 'lua-parse-locked'
  | 'invalid-range'
  | 'expected-text-mismatch'
  | 'replacement-parse-failure';

export interface X4UiSourceSpliceResult {
  readonly accepted: boolean;
  readonly bundle: X4UiSourceBundle;
  readonly reason: X4UiSourceSpliceRefusalReason | null;
}

export interface X4UiSourceBundleRegistrationFile {
  readonly path: string;
  readonly text: string;
  readonly sourcePath?: string;
}

export type X4UiSourceBundleRegistrationRefusalReason =
  | 'malformed-xml'
  | 'locked-bundle'
  | 'invalid-path'
  | 'unsafe-traversal-path'
  | 'unsafe-absolute-path'
  | 'duplicate-registration'
  | 'invalid-source'
  | 'unsupported-xml-declaration'
  | 'missing-addon'
  | 'missing-addon-name'
  | 'reserved-addon-name'
  | 'missing-registration-target'
  | 'ambiguous-registration-target'
  | 'registration-span-mismatch'
  | 'resulting-xml-malformed'
  | 'resulting-source-invalid';

export type X4UiSourceBundleRegistrationResult =
  | {
    readonly accepted: true;
    readonly changed: true;
    readonly bundle: X4UiSourceBundle;
    readonly reason: null;
    readonly detail: string;
  }
  | {
    readonly accepted: false;
    readonly changed: false;
    readonly bundle: X4UiSourceBundle;
    readonly reason: X4UiSourceBundleRegistrationRefusalReason;
    readonly detail: string;
  };

interface XmlNodeLike {
  readonly nodeType?: number;
  readonly nodeName?: string;
  readonly localName?: string | null;
  readonly childNodes?: {
    readonly length: number;
    item(index: number): XmlNodeLike | null;
  };
}

interface XmlElementLike extends XmlNodeLike {
  readonly namespaceURI?: string | null;
  getAttribute?(name: string): string | null;
  hasAttribute?(name: string): boolean;
}

interface XmlDocumentLike {
  readonly documentElement?: XmlElementLike | null;
}

interface PathNormalization {
  readonly kind: X4UiRegistrationPathSafety;
  readonly key?: string;
}

interface RegistrationCandidate {
  readonly rawPath?: string;
  readonly normalized: PathNormalization;
}

interface ParsedUiXml {
  readonly state: X4UiSourceXmlState;
  readonly registrations: readonly RegistrationCandidate[];
  readonly root: XmlElementLike | null;
}

interface CanonicalSourceInput {
  readonly path: string;
  readonly text: string;
  readonly sourcePath?: string;
}

interface MutableSourceDraft {
  readonly index: number;
  readonly input: CanonicalSourceInput;
  readonly normalized: PathNormalization;
  readonly callModel: X4UiCallModel;
  readonly registrationIndexes: number[];
}

const XML_ELEMENT_NODE = 1;

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]);
}

function freezeObject<T extends object>(value: T): T {
  return Object.freeze(value);
}

function elementName(element: XmlElementLike): string {
  if (typeof element.localName === 'string' && element.localName.length > 0) {
    return element.localName;
  }
  const nodeName = typeof element.nodeName === 'string' ? element.nodeName : '';
  const separator = nodeName.indexOf(':');
  return separator >= 0 ? nodeName.slice(separator + 1) : nodeName;
}

function elementAttribute(element: XmlElementLike, name: string): string | undefined {
  if (typeof element.hasAttribute === 'function' && !element.hasAttribute(name)) {
    return undefined;
  }
  if (typeof element.getAttribute !== 'function') return undefined;
  const value = element.getAttribute(name);
  return value === null || value === undefined ? undefined : value;
}

function childElements(element: XmlElementLike): XmlElementLike[] {
  const children = element.childNodes;
  if (!children) return [];

  const result: XmlElementLike[] = [];
  for (let index = 0; index < children.length; index += 1) {
    const child = children.item(index);
    if (!child) continue;
    if (child.nodeType === XML_ELEMENT_NODE || (typeof child.nodeName === 'string' && !child.nodeName.startsWith('#'))) {
      result.push(child as XmlElementLike);
    }
  }
  return result;
}

function normalizeXmlIssueLevel(level: unknown): X4UiXmlIssueLevel {
  const value = String(level).toLowerCase();
  if (value.includes('fatal')) return 'fatal';
  if (value.includes('warn')) return 'warning';
  return 'error';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

/**
 * Normalize only a safe lookup key. The original path is retained separately.
 * Backslashes are accepted as separators for lookup, but an absolute or
 * traversing spelling is never made safe by normalization.
 */
function normalizeContainedPath(rawPath: string | undefined): PathNormalization {
  if (rawPath === undefined || rawPath.length === 0 || rawPath.includes('\u0000')) {
    return { kind: 'invalid' };
  }

  const slashPath = rawPath.replace(/\\/g, '/');
  if (/^(?:[A-Za-z]:|\/)/.test(slashPath)) {
    return { kind: 'unsafe-absolute' };
  }

  const segments = slashPath.split('/');
  const normalizedSegments: string[] = [];
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.') continue;
    if (segment === '..') return { kind: 'unsafe-traversal' };
    normalizedSegments.push(segment);
  }

  if (normalizedSegments.length === 0) return { kind: 'invalid' };
  return { kind: 'safe', key: normalizedSegments.join('/') };
}

/** Reuse the bundle's contained-path authority for creation-time collision checks. */
export function normalizeX4UiSourcePath(rawPath: string | undefined): PathNormalization {
  return normalizeContainedPath(rawPath);
}

function parseUiXml(uiXml: string): ParsedUiXml {
  const issues: X4UiXmlIssue[] = [];
  let document: XmlDocumentLike | undefined;

  try {
    document = new DOMParser({
      onError: (level: unknown, message: unknown): void => {
        issues.push({
          level: normalizeXmlIssueLevel(level),
          message: String(message)
        });
      }
    // @xmldom/xmldom treats a JavaScript BOM as content rather than the XML
    // encoding marker. Strip it only for the validation parse; `uiXml` itself
    // remains untouched in the bundle and every projection.
    }).parseFromString(uiXml.startsWith('\uFEFF') ? uiXml.slice(1) : uiXml, 'text/xml') as unknown as XmlDocumentLike;
  } catch (error) {
    issues.push({ level: 'fatal', message: errorMessage(error) });
  }

  const root = document?.documentElement;
  const rootName = root ? elementName(root).toLowerCase() : '';
  if (!root || rootName === 'parsererror') {
    if (issues.length === 0) {
      issues.push({ level: 'fatal', message: 'XML document has no usable document element' });
    }
  }

  const registrations: RegistrationCandidate[] = [];
  if (root && rootName !== 'parsererror') {
    const visit = (element: XmlElementLike, insideMenusEnvironment: boolean): void => {
      const name = elementName(element).toLowerCase();
      const insideMenus = insideMenusEnvironment
        || (name === 'environment' && elementAttribute(element, 'type') === 'menus');

      if (insideMenus && name === 'file') {
        const rawPath = elementAttribute(element, 'name');
        registrations.push({
          rawPath,
          normalized: normalizeContainedPath(rawPath)
        });
      }

      for (const child of childElements(element)) visit(child, insideMenus);
    };
    visit(root, false);
  }

  const frozenIssues = freezeArray(issues.map(issue => freezeObject({ ...issue })));
  const malformed = frozenIssues.length > 0 || !root || rootName === 'parsererror';
  const state: X4UiSourceXmlState = freezeObject({
    status: malformed ? 'malformed' : 'parsed',
    parsed: !malformed,
    issues: frozenIssues
  });

  return {
    state,
    registrations: freezeArray(registrations.map(candidate => freezeObject({ ...candidate }))),
    root: root || null
  };
}

function canonicalSourceInputs(inputs: X4UiSourceFileInputs): CanonicalSourceInput[] {
  if (Array.isArray(inputs)) {
    return inputs.map(input => {
      const candidate = input as X4UiSourceFileInputWithPath & X4UiSourceFileInputWithRel;
      const path = typeof candidate.path === 'string' ? candidate.path : candidate.rel;
      return {
        path: typeof path === 'string' ? path : '',
        text: input.text,
        sourcePath: input.sourcePath
      };
    });
  }

  return Object.keys(inputs).map(path => ({ path, text: inputs[path] }));
}

function stabilizeCallModel(model: X4UiCallModel): X4UiCallModel {
  if (model.parsed) return model;

  // luaparse can expose parser-internal wording that changes after another
  // failed parse (notably for a leading BOM). Keep the existing model shape
  // and source locations, but make the locked reason stable for bundle users.
  return {
    ...model,
    verificationGaps: model.verificationGaps.map(gap => gap.category === 'parse'
      ? { ...gap, reason: 'Lua source could not be parsed' }
      : gap)
  };
}

/** Source-preserving parser entry point, including the equal-length BOM sentinel. */
export function buildX4UiSourceCallModel(source: X4UiSourceFileInputWithPath): X4UiCallModel {
  // luaparse rejects U+FEFF, although the shipped Lua source is valid. A
  // single ASCII space is an equal-length parser-only sentinel, so all
  // source offsets remain aligned with the caller's raw text.
  const parserText = source.text.startsWith('\uFEFF')
    ? ` ${source.text.slice(1)}`
    : source.text;
  const model = stabilizeCallModel(buildX4UiCallModel({
    rel: source.path,
    text: parserText,
    ...(source.sourcePath !== undefined ? { sourcePath: source.sourcePath } : {})
  } as X4UiLuaFileInput));

  if (parserText === source.text) return model;
  return {
    ...model,
    file: {
      ...model.file,
      text: source.text
    }
  };
}

function registrationDiagnostic(
  registration: X4UiSourceRegistration,
  sourceFileCount: number
): X4UiSourceDiagnostic | undefined {
  const path = registration.rawPath;
  switch (registration.resolution) {
    case 'missing-name':
      return {
        code: 'missing-registration-name',
        severity: 'error',
        message: `Menu registration ${registration.index} has no file name`,
        registrationIndex: registration.index
      };
    case 'invalid-path':
      return {
        code: 'invalid-registration-path',
        severity: 'error',
        message: `Menu registration ${registration.index} has an invalid contained path`,
        registrationIndex: registration.index,
        path
      };
    case 'unsafe-traversal':
      return {
        code: 'unsafe-traversal-registration',
        severity: 'error',
        message: `Menu registration ${registration.index} uses an unsafe traversal path`,
        registrationIndex: registration.index,
        path
      };
    case 'unsafe-absolute':
      return {
        code: 'unsafe-absolute-registration',
        severity: 'error',
        message: `Menu registration ${registration.index} uses an unsafe absolute path`,
        registrationIndex: registration.index,
        path
      };
    case 'missing-file':
      return {
        code: 'missing-lua-file',
        severity: 'error',
        message: `Menu registration ${registration.index} has no supplied Lua source`,
        registrationIndex: registration.index,
        path
      };
    case 'duplicate-registration':
      return {
        code: 'duplicate-registration',
        severity: 'error',
        message: `Menu registration ${registration.index} is a duplicate contained path`,
        registrationIndex: registration.index,
        path
      };
    case 'ambiguous-source-file':
      return {
        code: 'ambiguous-lua-file',
        severity: 'error',
        message: `Menu registration ${registration.index} matches ${sourceFileCount} supplied Lua sources`,
        registrationIndex: registration.index,
        path
      };
    default:
      return undefined;
  }
}

function sourceDiagnostic(
  code: X4UiSourceDiagnosticCode,
  severity: X4UiSourceDiagnosticSeverity,
  message: string,
  sourceIndex: number,
  path: string,
  gapCategory?: X4UiVerificationGapCategory
): X4UiSourceDiagnostic {
  return {
    code,
    severity,
    message,
    sourceIndex,
    path,
    ...(gapCategory ? { gapCategory } : {})
  };
}

function buildSourceFile(
  draft: MutableSourceDraft,
  sourceDiagnostics: readonly X4UiSourceDiagnostic[],
  registrations: readonly X4UiSourceRegistration[],
  xmlParsed: boolean,
  sourceKeyCount: number
): X4UiSourceFile {
  const parseStatus: X4UiLuaParseStatus = draft.callModel.parsed ? 'parsed' : 'locked';
  const verificationStatus: X4UiCallModelVerificationStatus = !draft.callModel.parsed
    ? 'locked'
    : draft.callModel.verificationGaps.length > 0
      ? 'unverified'
      : 'verified';
  const registered = xmlParsed && draft.registrationIndexes.length > 0;
  const resolvedRegistration = draft.registrationIndexes.length === 1
    ? registrations[draft.registrationIndexes[0]]
    : undefined;
  const editable = Boolean(
    xmlParsed
      && draft.normalized.kind === 'safe'
      && sourceKeyCount === 1
      && resolvedRegistration?.resolution === 'resolved'
      && draft.callModel.parsed
  );

  return freezeObject({
    index: draft.index,
    path: draft.input.path,
    rawPath: draft.input.path,
    ...(draft.input.sourcePath !== undefined ? { sourcePath: draft.input.sourcePath } : {}),
    ...(draft.normalized.key !== undefined ? { lookupKey: draft.normalized.key } : {}),
    text: draft.input.text,
    callModel: draft.callModel,
    parseStatus,
    verificationStatus,
    verificationGaps: freezeArray(draft.callModel.verificationGaps),
    registrationIndexes: freezeArray(draft.registrationIndexes),
    registered,
    unregistered: !registered,
    editable,
    diagnostics: freezeArray(sourceDiagnostics)
  });
}

/** Build a pure ordered bundle from raw ui.xml and caller-owned Lua strings. */
export function buildX4UiSourceBundle(input: X4UiSourceBundleInput): X4UiSourceBundle {
  const parsedXml = parseUiXml(input.uiXml);
  const canonicalInputs = canonicalSourceInputs(input.luaFiles);
  const sourceDrafts: MutableSourceDraft[] = canonicalInputs.map((source, index) => ({
    index,
    input: source,
    normalized: normalizeContainedPath(source.path),
    callModel: buildX4UiSourceCallModel(source),
    registrationIndexes: []
  }));

  const sourceIndexesByKey = new Map<string, number[]>();
  for (const draft of sourceDrafts) {
    const key = draft.normalized.key;
    if (key === undefined) continue;
    const indexes = sourceIndexesByKey.get(key) || [];
    indexes.push(draft.index);
    sourceIndexesByKey.set(key, indexes);
  }

  const registrationIndexesByKey = new Map<string, number[]>();
  parsedXml.registrations.forEach((candidate, index) => {
    if (candidate.normalized.key === undefined) return;
    const indexes = registrationIndexesByKey.get(candidate.normalized.key) || [];
    indexes.push(index);
    registrationIndexesByKey.set(candidate.normalized.key, indexes);
  });

  const registrationDrafts = parsedXml.registrations.map((candidate, index) => {
    const sourceIndexes = candidate.normalized.key === undefined
      ? []
      : sourceIndexesByKey.get(candidate.normalized.key) || [];
    const registrationIndexes = candidate.normalized.key === undefined
      ? []
      : registrationIndexesByKey.get(candidate.normalized.key) || [];
    const duplicate = registrationIndexes.length > 1;

    let resolution: X4UiRegistrationResolution;
    switch (candidate.normalized.kind) {
      case 'invalid':
        resolution = candidate.rawPath === undefined ? 'missing-name' : 'invalid-path';
        break;
      case 'unsafe-traversal':
        resolution = 'unsafe-traversal';
        break;
      case 'unsafe-absolute':
        resolution = 'unsafe-absolute';
        break;
      case 'safe':
        if (!parsedXml.state.parsed) resolution = 'malformed-xml';
        else if (sourceIndexes.length === 0) resolution = 'missing-file';
        else if (sourceIndexes.length > 1) resolution = 'ambiguous-source-file';
        else if (duplicate) resolution = 'duplicate-registration';
        else resolution = 'resolved';
        break;
    }
    if (!parsedXml.state.parsed && candidate.normalized.kind !== 'safe') {
      // Keep the path-safety classification visible even while XML is locked.
      // The bundle-level XML state remains the authoritative lock reason.
    }

    return {
      index,
      rawPath: candidate.rawPath,
      rawSpelling: candidate.rawPath,
      lookupKey: candidate.normalized.key,
      pathSafety: candidate.normalized.kind,
      resolution,
      duplicate,
      locked: !parsedXml.state.parsed || resolution !== 'resolved',
      sourceIndexes
    };
  });

  const registrations: X4UiSourceRegistration[] = registrationDrafts.map(draft => freezeObject({
    ...draft,
    order: draft.index,
    sourceIndexes: freezeArray(draft.sourceIndexes),
    ...(draft.sourceIndexes.length === 1 ? { sourceIndex: draft.sourceIndexes[0] } : {})
  }));

  for (const registration of registrations) {
    for (const sourceIndex of registration.sourceIndexes) {
      sourceDrafts[sourceIndex].registrationIndexes.push(registration.index);
    }
  }

  const diagnostics: X4UiSourceDiagnostic[] = [];
  for (const issue of parsedXml.state.issues) {
    diagnostics.push({
      code: 'malformed-xml',
      severity: 'error',
      message: issue.message
    });
  }
  if (parsedXml.state.status === 'malformed' && parsedXml.state.issues.length === 0) {
    diagnostics.push({
      code: 'malformed-xml',
      severity: 'error',
      message: 'ui.xml is malformed'
    });
  }

  for (const registration of registrations) {
    const diagnostic = registrationDiagnostic(
      registration,
      registration.sourceIndexes.length
    );
    if (diagnostic) diagnostics.push(diagnostic);
  }

  const sourceFiles: X4UiSourceFile[] = sourceDrafts.map(draft => {
    const sourceDiagnostics: X4UiSourceDiagnostic[] = [];
    const sourcePath = draft.input.path;
    const sourceKeyCount = draft.normalized.key === undefined
      ? 0
      : (sourceIndexesByKey.get(draft.normalized.key) || []).length;

    if (draft.normalized.kind !== 'safe') {
      sourceDiagnostics.push(sourceDiagnostic(
        'unsafe-lua-file',
        'error',
        'Supplied Lua source is outside the contained lookup namespace',
        draft.index,
        sourcePath
      ));
    }
    if (sourceKeyCount > 1) {
      sourceDiagnostics.push(sourceDiagnostic(
        'duplicate-supplied-lua-file',
        'error',
        'Multiple supplied Lua sources share one contained lookup key',
        draft.index,
        sourcePath
      ));
    }
    if (!draft.callModel.parsed) {
      sourceDiagnostics.push(sourceDiagnostic(
        'lua-parse-failure',
        'error',
        'Lua source could not be parsed and is locked',
        draft.index,
        sourcePath
      ));
    }
    for (const gap of draft.callModel.verificationGaps) {
      const gapCode = gap.status === 'dynamic' || gap.status === 'unknown'
        ? 'dynamic-call-model-gap'
        : 'unsupported-call-model-gap';
      sourceDiagnostics.push(sourceDiagnostic(
        gapCode,
        'warning',
        gap.reason,
        draft.index,
        sourcePath,
        gap.category
      ));
    }

    const file = buildSourceFile(
      draft,
      sourceDiagnostics,
      registrations,
      parsedXml.state.parsed,
      sourceKeyCount
    );
    diagnostics.push(...sourceDiagnostics);
    if (file.unregistered) {
      const unregisteredDiagnostic = sourceDiagnostic(
        'unregistered-lua-file',
        'info',
        'Supplied Lua source is not in the authoritative menus registration order',
        draft.index,
        sourcePath
      );
      diagnostics.push(unregisteredDiagnostic);
      return freezeObject({
        ...file,
        diagnostics: freezeArray([...file.diagnostics, unregisteredDiagnostic])
      });
    }
    return file;
  });

  const orderedFiles: X4UiSourceFile[] = [];
  if (parsedXml.state.parsed) {
    for (const registration of registrations) {
      if (registration.sourceIndex === undefined) continue;
      if (registration.resolution !== 'resolved' && registration.resolution !== 'duplicate-registration') continue;
      orderedFiles.push(sourceFiles[registration.sourceIndex]);
    }
  }

  const unregisteredFiles = sourceFiles.filter(file => file.unregistered);
  const frozenSourceFiles = freezeArray(sourceFiles);
  const frozenOrderedFiles = freezeArray(orderedFiles);
  const frozenUnregisteredFiles = freezeArray(unregisteredFiles);
  const frozenDiagnostics = freezeArray(diagnostics.map(diagnostic => freezeObject({ ...diagnostic })));
  const hasUnverifiedCallModelGaps = sourceFiles.some(file => file.verificationStatus === 'unverified');
  const locked = !parsedXml.state.parsed
    || sourceFiles.some(file => file.parseStatus === 'locked')
    || registrations.some(registration => registration.locked);

  return freezeObject({
    uiXml: input.uiXml,
    xml: parsedXml.state,
    registrations: freezeArray(registrations),
    orderedRegistrations: freezeArray(registrations),
    sourceFiles: frozenSourceFiles,
    files: frozenSourceFiles,
    orderedFiles: frozenOrderedFiles,
    unregisteredFiles: frozenUnregisteredFiles,
    diagnostics: frozenDiagnostics,
    locked,
    hasUnverifiedCallModelGaps
  });
}

/** Return raw ui.xml and every caller-supplied Lua string without regeneration. */
export function projectX4UiSourceBundle(bundle: X4UiSourceBundle): X4UiSourceBundleProjection {
  const luaFiles = bundle.sourceFiles.map(source => freezeObject({
    path: source.path,
    text: source.text,
    ...(source.sourcePath !== undefined ? { sourcePath: source.sourcePath } : {})
  }));
  return freezeObject({
    uiXml: bundle.uiXml,
    luaFiles: freezeArray(luaFiles)
  });
}

interface RawXmlToken {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface BoundXmlElement {
  readonly element: XmlElementLike;
  readonly span: XmlElementSourceSpan;
  readonly opening: RawXmlToken;
  readonly openingTag: string;
  readonly selfClosing: boolean;
  readonly closing?: RawXmlToken;
}

interface XmlInsertion {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

function xmlTokenAt(xml: string, start: number, limit = xml.length): RawXmlToken | null {
  if (start < 0 || start >= xml.length || xml[start] !== '<') return null;
  let quote = '';
  for (let index = start + 1; index < xml.length && index < limit; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === '\'') {
      quote = character;
      continue;
    }
    if (character === '>') {
      return {
        start,
        end: index + 1,
        text: xml.slice(start, index + 1)
      };
    }
  }
  return null;
}

function openingXmlToken(xml: string, span: XmlElementSourceSpan): { token: RawXmlToken; tag: string; selfClosing: boolean } | null {
  const token = xmlTokenAt(xml, span.start, span.end);
  if (!token || token.end > span.end) return null;
  const match = token.text.match(/^<\s*([A-Za-z_][\w:.-]*)(?:\s|\/?>)/);
  if (!match) return null;
  return {
    token,
    tag: match[1],
    selfClosing: /\/\s*>$/.test(token.text)
  };
}

function closingXmlToken(xml: string, span: XmlElementSourceSpan, tag: string): RawXmlToken | null {
  const start = xml.lastIndexOf('<', span.end - 1);
  if (start < span.start) return null;
  const token = xmlTokenAt(xml, start, span.end);
  if (!token || token.end !== span.end) return null;
  const match = token.text.match(/^<\s*\/\s*([A-Za-z_][\w:.-]*)\s*>$/);
  if (!match || match[1] !== tag) return null;
  return token;
}

function bindXmlElement(
  xml: string,
  element: XmlElementLike,
  spans: ReadonlyMap<string, XmlElementSourceSpan>
): BoundXmlElement | null {
  const semanticPath = xmlElementSemanticPath(element as unknown as Element);
  const span = spans.get(semanticPath);
  if (!span) return null;
  const opening = openingXmlToken(xml, span);
  if (!opening || opening.tag !== (element.nodeName || opening.tag)) return null;
  if (opening.selfClosing) {
    if (span.end !== opening.token.end) return null;
    return {
      element,
      span,
      opening: opening.token,
      openingTag: opening.tag,
      selfClosing: true
    };
  }
  const closing = closingXmlToken(xml, span, opening.tag);
  if (!closing) return null;
  return {
    element,
    span,
    opening: opening.token,
    openingTag: opening.tag,
    selfClosing: false,
    closing
  };
}

function lineEndingFor(xml: string): string {
  const match = xml.match(/\r\n|\n|\r/);
  return match ? match[0] : '\n';
}

function indentationBefore(xml: string, position: number): string | null {
  const previousLf = xml.lastIndexOf('\n', position - 1);
  const previousCr = xml.lastIndexOf('\r', position - 1);
  const lineStart = Math.max(previousLf, previousCr) + 1;
  const prefix = xml.slice(lineStart, position);
  return /^[ \t]*$/.test(prefix) ? prefix : null;
}

function directElementIndent(
  xml: string,
  parent: XmlElementLike,
  spans: ReadonlyMap<string, XmlElementSourceSpan>
): string | null {
  for (const child of childElements(parent)) {
    const bound = bindXmlElement(xml, child, spans);
    if (!bound) continue;
    const indent = indentationBefore(xml, bound.span.start);
    if (indent !== null) return indent;
  }
  return null;
}

function directFileIndent(
  xml: string,
  environment: XmlElementLike,
  spans: ReadonlyMap<string, XmlElementSourceSpan>
): string | null {
  for (const child of childElements(environment)) {
    if (child.nodeName !== 'file') continue;
    const bound = bindXmlElement(xml, child, spans);
    if (!bound) return null;
    const indent = indentationBefore(xml, bound.span.start);
    if (indent !== null) return indent;
  }
  return null;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;');
}

function containsUnsupportedXmlDeclaration(xml: string): boolean {
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf('<', cursor);
    if (start < 0) return false;
    if (xml.startsWith('<!--', start)) {
      const end = xml.indexOf('-->', start + 4);
      cursor = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', start)) {
      const end = xml.indexOf(']]>', start + 9);
      cursor = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<?', start)) {
      const end = xml.indexOf('?>', start + 2);
      cursor = end < 0 ? xml.length : end + 2;
      continue;
    }
    if (xml.startsWith('<!', start)) return true;
    const token = xmlTokenAt(xml, start);
    cursor = token ? token.end : xml.length;
  }
  return false;
}

function replaceSelfClosingElement(
  xml: string,
  bound: BoundXmlElement,
  childMarkup: string,
  lineEnding: string,
  childIndent: string
): XmlInsertion {
  const expandedOpening = bound.opening.text.replace(/\/\s*>$/, '>');
  const parentIndent = indentationBefore(xml, bound.span.start);
  if (parentIndent === null) {
    return {
      start: bound.span.start,
      end: bound.span.end,
      replacement: `${expandedOpening}${childMarkup}</${bound.openingTag}>`
    };
  }
  return {
    start: bound.span.start,
    end: bound.span.end,
    replacement: `${expandedOpening}${lineEnding}${childIndent}${childMarkup}${lineEnding}${parentIndent}</${bound.openingTag}>`
  };
}

function appendBeforeClosingElement(
  xml: string,
  bound: BoundXmlElement,
  childMarkup: string,
  lineEnding: string,
  childIndent: string
): XmlInsertion | null {
  if (!bound.closing) return null;
  const closingIndent = indentationBefore(xml, bound.closing.start);
  const closingLineStart = closingIndent === null
    ? bound.closing.start
    : bound.closing.start - closingIndent.length;
  return {
    start: closingLineStart,
    end: closingLineStart,
    replacement: closingIndent === null
      ? childMarkup
      : `${childIndent}${childMarkup}${lineEnding}`
  };
}

function addRegistrationToXml(
  uiXml: string,
  root: XmlElementLike,
  path: string
): XmlInsertion | null {
  const spans = indexXmlElementSpans(uiXml);
  const rootBinding = bindXmlElement(uiXml, root, spans);
  if (!rootBinding) return null;

  const fileMarkup = `<file name="${escapeXmlAttribute(path)}" />`;
  const lineEnding = lineEndingFor(uiXml);
  const menuEnvironments = childElements(root).filter(element => (
    element.nodeName === 'environment'
      && elementAttribute(element, 'type') === 'menus'
  ));
  const target = menuEnvironments.length > 0 ? menuEnvironments[menuEnvironments.length - 1] : null;

  if (target) {
    const targetBinding = bindXmlElement(uiXml, target, spans);
    if (!targetBinding) return null;
    if (targetBinding.selfClosing) {
      const targetIndent = indentationBefore(uiXml, targetBinding.span.start);
      const childIndent = targetIndent === null
        ? ''
        : (directFileIndent(uiXml, target, spans) || `${targetIndent}  `);
      return replaceSelfClosingElement(uiXml, targetBinding, fileMarkup, lineEnding, childIndent);
    }
    const targetIndent = indentationBefore(uiXml, targetBinding.span.start);
    const closingIndent = targetBinding.closing
      ? indentationBefore(uiXml, targetBinding.closing.start)
      : null;
    const childIndent = directFileIndent(uiXml, target, spans)
      || `${targetIndent ?? closingIndent ?? ''}  `;
    return appendBeforeClosingElement(uiXml, targetBinding, fileMarkup, lineEnding, childIndent);
  }

  if (rootBinding.selfClosing) {
    const rootIndent = indentationBefore(uiXml, rootBinding.span.start);
    const environmentIndent = rootIndent === null ? '' : `${rootIndent}  `;
    const fileIndent = rootIndent === null ? '' : `${environmentIndent}  `;
    const expandedOpening = rootBinding.opening.text.replace(/\/\s*>$/, '>');
    const replacement = rootIndent === null
      ? `${expandedOpening}<environment type="menus">${fileMarkup}</environment></${rootBinding.openingTag}>`
      : `${expandedOpening}${lineEnding}${environmentIndent}<environment type="menus">${lineEnding}${fileIndent}${fileMarkup}${lineEnding}${environmentIndent}</environment>${lineEnding}${rootIndent}</${rootBinding.openingTag}>`;
    return {
      start: rootBinding.span.start,
      end: rootBinding.span.end,
      replacement
    };
  }

  if (!rootBinding.closing) return null;
  const rootIndent = indentationBefore(uiXml, rootBinding.closing.start);
  if (rootIndent === null) {
    return {
      start: rootBinding.closing.start,
      end: rootBinding.closing.start,
      replacement: `<environment type="menus"><file name="${escapeXmlAttribute(path)}" /></environment>`
    };
  }
  const environmentIndent = directElementIndent(uiXml, root, spans) || `${rootIndent}  `;
  const fileIndent = `${environmentIndent}  `;
  return {
    start: rootBinding.closing.start - rootIndent.length,
    end: rootBinding.closing.start - rootIndent.length,
    replacement: `${environmentIndent}<environment type="menus">${lineEnding}${fileIndent}${fileMarkup}${lineEnding}${environmentIndent}</environment>${lineEnding}`
  };
}

function hasCaseMismatchedAddonSchemaTag(root: XmlElementLike): boolean {
  const schemaTags = new Set(['addon', 'environment', 'file', 'dependency', 'savedvariable']);
  const visit = (element: XmlElementLike): boolean => {
    const rawName = typeof element.nodeName === 'string' ? element.nodeName : '';
    const localRawName = rawName.slice(rawName.lastIndexOf(':') + 1);
    if (schemaTags.has(rawName.toLowerCase()) && !schemaTags.has(rawName)) return true;
    if (rawName.includes(':') && schemaTags.has(localRawName.toLowerCase())) return true;
    return childElements(element).some(child => visit(child));
  };
  return visit(root);
}

function hasUnsupportedNamespaceDeclaration(opening: string): boolean {
  const tag = opening.match(/^<\s*[A-Za-z_][\w:.-]*/);
  if (!tag) return true;
  let cursor = tag[0].length;
  while (cursor < opening.length) {
    while (cursor < opening.length && /[\s/]/.test(opening[cursor])) cursor += 1;
    if (opening[cursor] === '>') break;
    const name = opening.slice(cursor).match(/^[A-Za-z_:][\w:.-]*/);
    if (!name) {
      cursor += 1;
      continue;
    }
    const attributeName = name[0];
    cursor += attributeName.length;
    while (cursor < opening.length && /\s/.test(opening[cursor])) cursor += 1;
    if (opening[cursor] !== '=') continue;
    cursor += 1;
    while (cursor < opening.length && /\s/.test(opening[cursor])) cursor += 1;
    const quote = opening[cursor];
    if (quote === '"' || quote === '\'') {
      cursor += 1;
      while (cursor < opening.length && opening[cursor] !== quote) cursor += 1;
      if (cursor < opening.length) cursor += 1;
    } else {
      while (cursor < opening.length && !/[\s>]/.test(opening[cursor])) cursor += 1;
    }
    if (attributeName === 'xmlns' || (attributeName.startsWith('xmlns:') && attributeName !== 'xmlns:xsi')) {
      return true;
    }
  }
  return false;
}

function hasUnsupportedRegistrationTopology(
  root: XmlElementLike,
  uiXml: string,
  spans: ReadonlyMap<string, XmlElementSourceSpan>
): boolean {
  const validateElement = (element: XmlElementLike, expectedName: string): boolean => {
    if (element.nodeName !== expectedName) return true;
    if (element.nodeName.includes(':')) return true;
    if (element.namespaceURI !== undefined
      && element.namespaceURI !== null
      && element.namespaceURI !== '') return true;
    const binding = bindXmlElement(uiXml, element, spans);
    return binding === null || hasUnsupportedNamespaceDeclaration(binding.opening.text);
  };

  if (validateElement(root, 'addon')) return true;

  const leafNames = new Set(['file', 'dependency', 'savedvariable']);
  for (const environment of childElements(root)) {
    if (validateElement(environment, 'environment')) return true;
    if (elementAttribute(environment, 'type') !== 'menus') return true;

    for (const leaf of childElements(environment)) {
      if (!leafNames.has(leaf.nodeName || '')) return true;
      if (validateElement(leaf, leaf.nodeName || '')) return true;
      if (childElements(leaf).length > 0) return true;
      if (leaf.nodeName === 'file') {
        const fileName = elementAttribute(leaf, 'name');
        if (!fileName || fileName.length === 0) return true;
      }
      if (leaf.nodeName === 'savedvariable') {
        const variableName = elementAttribute(leaf, 'name');
        const storage = elementAttribute(leaf, 'storage');
        if (!variableName || variableName.length === 0 || /^__CORE/.test(variableName)) return true;
        if (storage !== 'savegame' && storage !== 'userdata') return true;
      }
    }
  }
  return false;
}

function registrationRefusal(
  bundle: X4UiSourceBundle,
  reason: X4UiSourceBundleRegistrationRefusalReason,
  detail: string
): X4UiSourceBundleRegistrationResult {
  return freezeObject({ accepted: false, changed: false, bundle, reason, detail });
}

/** Add one parsed Lua source and its exact local ui.xml registration. */
export function addX4UiSourceBundleRegistration(
  bundle: X4UiSourceBundle,
  file: X4UiSourceBundleRegistrationFile
): X4UiSourceBundleRegistrationResult {
  if (!bundle.xml.parsed) {
    return registrationRefusal(bundle, 'malformed-xml', 'The existing ui.xml is malformed and cannot be edited safely.');
  }
  if (bundle.locked) {
    return registrationRefusal(bundle, 'locked-bundle', 'The existing source bundle is locked by a parse or registration guard.');
  }
  if (!file || typeof file.path !== 'string') {
    return registrationRefusal(bundle, 'invalid-path', 'The new menu path must be a contained relative path.');
  }
  if (typeof file.text !== 'string') {
    return registrationRefusal(bundle, 'invalid-source', 'The new menu source must be a Lua string.');
  }

  const normalized = normalizeContainedPath(file.path);
  switch (normalized.kind) {
    case 'invalid':
      return registrationRefusal(bundle, 'invalid-path', 'The new menu path is empty or contains an invalid character.');
    case 'unsafe-traversal':
      return registrationRefusal(bundle, 'unsafe-traversal-path', 'The new menu path attempts to traverse outside the workspace.');
    case 'unsafe-absolute':
      return registrationRefusal(bundle, 'unsafe-absolute-path', 'The new menu path is absolute and cannot be shipped.');
    case 'safe':
      break;
  }
  if (!/[/\\].+\.lua$/i.test(file.path)) {
    return registrationRefusal(bundle, 'invalid-path', 'The new menu path must include a directory and end in .lua.');
  }
  if (bundle.registrations.some(registration => registration.lookupKey === normalized.key)
    || bundle.sourceFiles.some(source => source.lookupKey === normalized.key)) {
    return registrationRefusal(bundle, 'duplicate-registration', `The contained menu path already exists: ${file.path}`);
  }
  if (containsUnsupportedXmlDeclaration(bundle.uiXml)) {
    return registrationRefusal(bundle, 'unsupported-xml-declaration', 'DTD and other unsupported XML declarations are not edited or expanded.');
  }

  const parsed = parseUiXml(bundle.uiXml);
  const root = parsed.root;
  if (!root || !parsed.state.parsed) {
    return registrationRefusal(bundle, 'malformed-xml', 'The existing ui.xml failed the source-preserving XML parse.');
  }
  if (root.nodeName !== 'addon') {
    return registrationRefusal(bundle, 'missing-addon', 'The existing ui.xml root is not an addon manifest.');
  }
  if (hasCaseMismatchedAddonSchemaTag(root)) {
    return registrationRefusal(bundle, 'missing-registration-target', 'The existing ui.xml uses a case-mismatched addon schema element.');
  }
  const addonName = elementAttribute(root, 'name');
  if (!addonName || addonName.trim().length === 0) {
    return registrationRefusal(bundle, 'missing-addon-name', 'The addon manifest must retain a nonempty name attribute.');
  }
  if (/^ego_/i.test(addonName)) {
    return registrationRefusal(bundle, 'reserved-addon-name', 'The reserved ego_ addon namespace is not owned by this source operation.');
  }

  const sourceSpans = indexXmlElementSpans(bundle.uiXml);
  const rootBinding = bindXmlElement(bundle.uiXml, root, sourceSpans);
  if (!rootBinding) {
    return registrationRefusal(bundle, 'registration-span-mismatch', 'The addon DOM root could not be bound to its exact source span.');
  }
  if (hasUnsupportedRegistrationTopology(root, bundle.uiXml, sourceSpans)) {
    return registrationRefusal(bundle, 'missing-registration-target', 'The existing ui.xml does not match the supported addon/environment/file registration topology.');
  }

  const insertion = addRegistrationToXml(bundle.uiXml, root, file.path);
  if (!insertion) {
    return registrationRefusal(bundle, 'registration-span-mismatch', 'The DOM registration target could not be bound to an exact source span.');
  }
  const nextUiXml = bundle.uiXml.slice(0, insertion.start)
    + insertion.replacement
    + bundle.uiXml.slice(insertion.end);
  const projection = projectX4UiSourceBundle(bundle);
  const nextLuaFiles = [
    ...projection.luaFiles,
    freezeObject({
      path: file.path,
      text: file.text,
      ...(file.sourcePath !== undefined ? { sourcePath: file.sourcePath } : {})
    })
  ];
  let nextBundle: X4UiSourceBundle;
  try {
    nextBundle = buildX4UiSourceBundle({
      uiXml: nextUiXml,
      luaFiles: freezeArray(nextLuaFiles)
    });
  } catch (error) {
    return registrationRefusal(bundle, 'resulting-source-invalid', `The resulting source bundle could not be built: ${errorMessage(error)}`);
  }
  if (!nextBundle.xml.parsed) {
    return registrationRefusal(bundle, 'resulting-xml-malformed', 'The local registration insertion produced malformed ui.xml.');
  }
  const nextRegistration = nextBundle.registrations.filter(registration => registration.lookupKey === normalized.key);
  const nextSource = nextBundle.sourceFiles.filter(source => source.lookupKey === normalized.key);
  if (nextRegistration.length !== 1
    || nextRegistration[0].resolution !== 'resolved'
    || nextSource.length !== 1
    || !nextSource[0].registered
    || nextSource[0].parseStatus !== 'parsed'
    || nextBundle.registrations.length !== bundle.registrations.length + 1
    || nextBundle.sourceFiles.length !== bundle.sourceFiles.length + 1) {
    return registrationRefusal(bundle, 'resulting-source-invalid', 'The new source is not uniquely registered and parsed after projection.');
  }

  return freezeObject({
    accepted: true,
    changed: true,
    bundle: nextBundle,
    reason: null,
    detail: `Registered ${file.path} using a byte-local ui.xml insertion.`
  });
}

function refusal(
  bundle: X4UiSourceBundle,
  reason: X4UiSourceSpliceRefusalReason
): X4UiSourceSpliceResult {
  return freezeObject({ accepted: false, bundle, reason });
}

/**
 * Apply one compare-and-swap source splice. Refusals return the exact original
 * bundle object; successful edits rebuild only the supplied source projection
 * through the existing per-file call-model parser.
 */
export function spliceX4UiSourceBundle(
  bundle: X4UiSourceBundle,
  edit: X4UiSourceSplice
): X4UiSourceSpliceResult {
  if (!bundle.xml.parsed) return refusal(bundle, 'malformed-xml');

  const normalized = normalizeContainedPath(typeof edit.path === 'string' ? edit.path : undefined);
  switch (normalized.kind) {
    case 'invalid':
      return refusal(bundle, 'invalid-path');
    case 'unsafe-traversal':
      return refusal(bundle, 'unsafe-traversal-path');
    case 'unsafe-absolute':
      return refusal(bundle, 'unsafe-absolute-path');
    case 'safe':
      break;
  }

  const registrations = bundle.registrations.filter(registration => registration.lookupKey === normalized.key);
  if (registrations.length === 0) return refusal(bundle, 'not-registered');
  if (registrations.length !== 1) return refusal(bundle, 'ambiguous-registration');

  const registration = registrations[0];
  if (registration.sourceIndexes.length === 0) return refusal(bundle, 'missing-file');
  if (registration.sourceIndexes.length !== 1) return refusal(bundle, 'ambiguous-source-file');
  if (registration.resolution === 'duplicate-registration') {
    return refusal(bundle, 'ambiguous-registration');
  }
  if (registration.resolution === 'ambiguous-source-file') {
    return refusal(bundle, 'ambiguous-source-file');
  }
  if (registration.resolution !== 'resolved') {
    return refusal(bundle, 'missing-file');
  }

  const source = bundle.sourceFiles[registration.sourceIndexes[0]];
  if (!source || source.lookupKey !== normalized.key) return refusal(bundle, 'missing-file');
  if (!source.callModel.parsed || source.parseStatus !== 'parsed') {
    return refusal(bundle, 'lua-parse-locked');
  }
  if (
    !Number.isInteger(edit.startOffset)
    || !Number.isInteger(edit.endOffset)
    || edit.startOffset < 0
    || edit.endOffset < edit.startOffset
    || edit.endOffset > source.text.length
  ) {
    return refusal(bundle, 'invalid-range');
  }
  if (source.text.slice(edit.startOffset, edit.endOffset) !== edit.expectedText) {
    return refusal(bundle, 'expected-text-mismatch');
  }

  const replacement = typeof edit.replacement === 'string' ? edit.replacement : '';
  const nextText = source.text.slice(0, edit.startOffset)
    + replacement
    + source.text.slice(edit.endOffset);
  const nextModel = buildX4UiSourceCallModel({
    path: source.path,
    text: nextText,
    ...(source.sourcePath !== undefined ? { sourcePath: source.sourcePath } : {})
  });
  if (!nextModel.parsed) return refusal(bundle, 'replacement-parse-failure');

  const projection = projectX4UiSourceBundle(bundle);
  const nextLuaFiles = projection.luaFiles.map((file, index) => index === source.index
    ? freezeObject({
      path: file.path,
      text: nextText,
      ...(file.sourcePath !== undefined ? { sourcePath: file.sourcePath } : {})
    })
    : file);
  const nextBundle = buildX4UiSourceBundle({
    uiXml: projection.uiXml,
    luaFiles: freezeArray(nextLuaFiles)
  });
  return freezeObject({ accepted: true, bundle: nextBundle, reason: null });
}

export const applyX4UiSourceSplice = spliceX4UiSourceBundle;
export const applyX4UiSourceEdit = spliceX4UiSourceBundle;
