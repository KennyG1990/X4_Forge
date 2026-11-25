/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic, non-AI explanations for the shared project-diagnostic currency.
 * The message remains the precise finding; this layer explains the validator class
 * and the safest next action without inventing game/runtime facts.
 */

import { X4_CORE_RULE_PACK_EXPECTED_SHA256, resolveCoreX4DiagnosticRule } from './x4RulePacks';
import type {
  X4DiagnosticRuleInput,
  X4RuleApplicabilityStatus,
  X4RuleEvidenceV1,
  X4RuleGameVersionScopeV1,
  X4RuleIdentityV1,
  X4RuleResolutionV1,
} from './x4RulePackTypes';

export interface ExplainableDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code?: string;
  domain?: string;
  filePath?: string;
  targetGameVersion?: string;
  message: string;
}

export type DiagnosticRuleProvenance =
  | {
      readonly kind: 'matched';
      readonly packId: string;
      readonly packVersion: string;
      readonly packSha256: string;
      readonly ruleId: string;
      readonly ruleVersion: string;
      readonly evidence: X4RuleEvidenceV1;
      readonly applicability: X4RuleApplicabilityStatus;
      readonly scope: X4RuleGameVersionScopeV1;
    }
  | {
      readonly kind: 'unmatched';
      readonly input: X4DiagnosticRuleInput;
    }
  | {
      readonly kind: 'ambiguous';
      readonly input: X4DiagnosticRuleInput;
      readonly candidates: readonly X4RuleIdentityV1[];
      readonly refusal: string;
    };

export interface DiagnosticExplanation {
  code: string;
  title: string;
  why: string;
  impact: string;
  next: string;
  basis: string;
  deterministic: true;
  readonly ruleProvenance: DiagnosticRuleProvenance;
}

type Guidance = Omit<DiagnosticExplanation, 'code' | 'deterministic' | 'ruleProvenance'>;

const AMBIGUOUS_RULE_REFUSAL = 'Multiple governed X4 rules matched this diagnostic; no governed guidance was selected.';

/**
 * Convert internal serialized MD occurrence keys (`md.reference:[...]`, `md.declaration:[...]`)
 * into concise authored role/cue labels for UI cards while leaving ordinary `sourceRef` strings
 * verbatim. Suppression scopes must keep using the raw `sourceRef`.
 */
export function formatHumanDiagnosticSourceRef(sourceRef?: string): string | undefined {
  if (!sourceRef) return undefined;
  if (sourceRef.startsWith('md.reference_unpositioned:')) return undefined;
  if (sourceRef.startsWith('md.reference:')) {
    try {
      const parsed: unknown = JSON.parse(sourceRef.slice('md.reference:'.length));
      if (Array.isArray(parsed) && typeof parsed[2] === 'string' && parsed[2].trim()) {
        return parsed[2].trim();
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
  if (sourceRef.startsWith('md.declaration:')) {
    try {
      const parsed: unknown = JSON.parse(sourceRef.slice('md.declaration:'.length));
      if (Array.isArray(parsed) && typeof parsed[2] === 'string' && parsed[2].trim()) {
        return `cue@${parsed[2].trim()}`;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
  return sourceRef;
}

const GUIDANCE: Array<{ matches: (code: string) => boolean; value: Guidance }> = [
  {
    matches: code => code.startsWith('rules.'),
    value: {
      title: 'Project rule contract is invalid',
      why: 'The root forge.rules.json declaration failed its strict versioned policy checks.',
      impact: 'All warning suppressions are disabled and full-project validation fails closed until the rules file is valid.',
      next: 'Open forge.rules.json and correct the named property, scope, review date, or declared evidence contract.',
      basis: 'forge.rules.json v1 policy engine',
    },
  },
  {
    matches: code => /^(xsd\.|schema\.)/.test(code),
    value: {
      title: 'Game schema rejected this structure',
      why: 'The XML element, attribute, value, or placement does not satisfy the routed X4 game schema (XSD).',
      impact: 'X4 may reject the document or ignore the affected structure.',
      next: 'Jump to the file and align the named element or attribute with the schema diagnostic.',
      basis: 'routed X4 XSD validation',
    },
  },
  {
    matches: code => code === 'scriptproperty.unresolved_type',
    value: {
      title: 'Keyed lookup receiver type is unresolved',
      why: 'The game declares this keyed lookup on a subtype of the receiver visible to Forge.',
      impact: 'Forge cannot verify whether the receiver has that subtype at runtime.',
      next: 'Check the receiver type at the lookup in the game.',
      basis: 'X4 scriptproperties.xml datatype hierarchy',
    },
  },
  {
    matches: code => code.startsWith('scriptproperty.'),
    value: {
      title: 'Script-property chain is not proven',
      why: 'A segment or function in the expression was not found in the loaded scriptproperties vocabulary.',
      impact: 'Unknown X4 script properties commonly evaluate to null without a useful runtime error, so conditions can silently never fire.',
      next: 'Use the suggested canonical segment, or suppress only this exact known-good chain after runtime review.',
      basis: 'X4 scriptproperties.xml index',
    },
  },
  {
    matches: code => /^(reference\.|REF_UNKNOWN_|jobs\.|wares\.|factions\.|god\.)/.test(code),
    value: {
      title: 'Referenced game object is unresolved',
      why: 'The identifier was not found in the loaded vanilla/DLC reference corpus for this domain.',
      impact: 'The reference may resolve to nothing in game or may depend on content not declared by the mod.',
      next: 'Check the exact identifier, required DLC dependency, and the source file named by the finding.',
      basis: 'canonical X4 object/reference indexes',
    },
  },
  {
    matches: code => code === 'lua.raw_engine_id_in_player_text' || code === 'md_pitfall.raw_engine_id_in_player_text',
    value: {
      title: 'Raw engine ID reaches player-visible text',
      why: 'A player-facing UI element, notification, comm message, or logbook string concatenates or falls back to a raw faction, ware, or macro engine ID.',
      impact: 'Players see internal engine identifiers (such as "civilian", "loanshark", or "hullparts") instead of localized display names when a cached name is missing or an .id property is interpolated.',
      next: 'In Lua, resolve display names via GetFactionData(id, "name"), GetWareData(id, "name"), GetMacroData(id, "name"), or a display-name helper; in MD, use .knownname or .name (or .idcode for ship hull codes).',
      basis: 'Lua and Mission Director player-text sink and display-fallback static analysis',
    },
  },
  {
    matches: code => code === 'md_pitfall.order_cancelled_override_suspension' || code === 'order_cancelled_override_suspension',
    value: {
      title: 'Order-cancelled listener does not distinguish temporary override suspension',
      why: 'In X4, starting an override order (such as Attack or Flee in aiscripts/interrupt.attacked.xml with override="true") suspends the ship\'s current order rather than deleting it, yet still raises <event_object_order_cancelled> for the suspended order.',
      impact: 'Handlers that treat <event_object_order_cancelled> as permanent removal can prematurely abort mission/tracking state or re-queue a duplicate <create_order> while the original suspended order is still queued to resume.',
      next: 'Guard permanent-removal handlers with <check_value value="not event.param.exists"/> (vanilla md/factionsubgoal_recon.xml), check not $Ship.orders.indexof.{$Order}, or branch on @$Order.exists and @$Ship.order.isoverride when tracking suspended orders.',
      basis: 'X4 9.00 override-order suspension and Mission Director cancellation-handler analysis',
    },
  },
  {
    matches: code => code === 'md_lua.conversation_menu_without_deferred_redraw',
    value: {
      title: 'Conversation-triggered UI menu lacks a deferred redraw',
      why: 'An MD <event_conversation_started> cue raises a Lua event that opens this UI menu via OpenMenu, without scheduling a deferred redraw after its initial display.',
      impact: 'In X4, a menu drawn in the same frame as a starting native conversation renders underneath the conversation menu, so clicks or Return keys reach and cancel the conversation instead of the overlay.',
      next: 'Schedule one deferred redraw after open (for example ~0.3 s later in menu.onUpdate) so the overlay repaints above the native conversation menu.',
      basis: 'MD-Lua conversation-open and menu redraw cross-file analysis',
    },
  },
  {
    matches: code => /^(lua_md\.|md_lua\.|contract\.)/.test(code),
    value: {
      title: 'MD and Lua do not agree',
      why: 'The deterministic bridge scan found a listener, event, payload key, or contract declared on only one side.',
      impact: 'The UI or script handoff can fail silently even when both files are individually valid.',
      next: 'Compare the exact event/key in the named MD and Lua sources and make both sides use the same contract.',
      basis: 'MD-Lua AST and indexed-payload cross-file analysis',
    },
  },
  {
    matches: code => code === 'x4-ui.truncated-evidence',
    value: {
      title: 'Lua UI verification is incomplete',
      why: 'Forge reached a limit while collecting static UI evidence for this file.',
      impact: 'The file remains partly unverified. Unseen evidence may affect the result.',
      next: 'Review the retained coverage gaps for this file. Resolve dynamic or unsupported UI calls, rerun validation, and verify any remaining UI behavior in X4.',
      basis: 'bounded X4 Lua UI call analysis',
    },
  },
  {
    matches: code => /^(cue\.|crossfile\.|project\.cue|project\.unresolved_cue_ref$|md\.cue_)/.test(code),
    value: {
      title: 'Cross-file cue relationship is broken',
      why: 'A cue definition, signal, reset, cancel, or reference does not resolve consistently across the project.',
      impact: 'The dependent cue path cannot execute as authored.',
      next: 'Jump to the source and align the referenced cue name with an included definition.',
      basis: 'full-project cue index',
    },
  },
  {
    matches: code => /^(diff\.|post-apply\.|patch\.)/.test(code),
    value: {
      title: 'XML patch is unsafe or ineffective',
      why: 'The selector failed, matched ambiguously, or produced an invalid document after deterministic application.',
      impact: 'The patch may do nothing, affect the wrong node, or leave X4 with invalid merged XML.',
      next: 'Inspect the selector against the routed vanilla file and review the post-apply finding before release.',
      basis: 'vanilla-backed diff simulation and post-apply validation',
    },
  },
  {
    matches: code => /^(aiscript\.|order_param\.)/.test(code),
    value: {
      title: 'AI-script order contract is inconsistent',
      why: 'An order parameter, datatype, or AI-script structure does not match the known X4 contract.',
      impact: 'The order can receive the wrong value, fail to start, or behave differently from its UI declaration.',
      next: 'Align the parameter name, datatype, and reader with the canonical order and AI-script definitions.',
      basis: 'AI Script XSD and order-parameter cross-file lint',
    },
  },
  {
    matches: code => code.startsWith('tfile.') || code.startsWith('TFILE_'),
    value: {
      title: 'Text reference or translation is incomplete',
      why: 'A page/id reference is missing or the language files do not cover the same text keys.',
      impact: 'Players can see raw placeholders, missing labels, or inconsistent translations.',
      next: 'Add or align the named page/id across the required t-files.',
      basis: 'project t-file reference and coverage indexes',
    },
  },
  {
    matches: code => code.startsWith('migration.'),
    value: {
      title: 'Version-sensitive pattern detected',
      why: 'The source uses a construct tracked as deprecated, renamed, or behaviorally changed across X4 versions.',
      impact: 'It may work on one game version and fail or warn on another.',
      next: 'Review the named construct against the target X4 version before replacing or explicitly accepting it.',
      basis: 'version migration lint registry',
    },
  },
  {
    matches: code => code.startsWith('validation.'),
    value: {
      title: 'A required validation layer was unavailable',
      why: 'The backend could not load or inspect one of the declared schema, corpus, property, or disk-file inputs.',
      impact: 'This is not evidence that the project is clean; part of the referee did not run.',
      next: 'Restore the named validator input or file, then rerun full-project validation.',
      basis: 'full-project validation availability gates',
    },
  },
];

function genericGuidance(diagnostic: ExplainableDiagnostic): Guidance {
  const severity = diagnostic.severity === 'error' ? 'blocking error' : diagnostic.severity === 'warning' ? 'review warning' : 'informational finding';
  return {
    title: 'Project validator finding',
    why: `A deterministic project check emitted this ${severity}; no more specific explanation is registered for this code yet.`,
    impact: diagnostic.severity === 'error'
      ? 'The shared validation verdict remains blocked until the finding is resolved.'
      : 'The project may still build, but the named condition should be reviewed before release.',
    next: 'Use the exact finding message, file, and source reference as the authoritative repair target.',
    basis: 'shared full-project diagnostic',
  };
}

type DiagnosticRuleResolver = (input: X4DiagnosticRuleInput) => X4RuleResolutionV1;

function ruleProvenanceFor(resolution: X4RuleResolutionV1): DiagnosticRuleProvenance {
  if (resolution.kind === 'matched') {
    return {
      kind: 'matched',
      packId: resolution.packId,
      packVersion: resolution.packVersion,
      packSha256: resolution.packSha256,
      ruleId: resolution.ruleId,
      ruleVersion: resolution.ruleVersion,
      evidence: resolution.evidence,
      applicability: resolution.applicability,
      scope: resolution.scope,
    };
  }

  if (resolution.kind === 'ambiguous') {
    return {
      kind: 'ambiguous',
      input: resolution.input,
      candidates: resolution.candidates,
      refusal: AMBIGUOUS_RULE_REFUSAL,
    };
  }

  return { kind: 'unmatched', input: resolution.input };
}

function explainDiagnosticWithResolver(
  diagnostic: ExplainableDiagnostic,
  resolveRule: DiagnosticRuleResolver,
): DiagnosticExplanation {
  const code = String(diagnostic.code || 'project.finding').trim() || 'project.finding';
  const ruleInput: X4DiagnosticRuleInput = {
    code,
    ...(diagnostic.targetGameVersion === undefined ? {} : { targetGameVersion: diagnostic.targetGameVersion }),
  };
  const resolution = resolveRule(ruleInput);
  const ruleProvenance = ruleProvenanceFor(resolution);

  if (resolution.kind === 'matched') {
    return {
      code,
      ...resolution.guidance,
      basis: resolution.evidence.basis,
      deterministic: true,
      ruleProvenance,
    };
  }

  const selected = resolution.kind === 'ambiguous'
    ? genericGuidance(diagnostic)
    : GUIDANCE.find(entry => entry.matches(code))?.value || genericGuidance(diagnostic);
  return { code, ...selected, deterministic: true, ruleProvenance };
}

export function explainDiagnostic(diagnostic: ExplainableDiagnostic): DiagnosticExplanation {
  return explainDiagnosticWithResolver(diagnostic, resolveCoreX4DiagnosticRule);
}

export function runDiagnosticExplainSelftest() {
  const checks: Array<{ name: string; pass: boolean; detail?: unknown }> = [];
  const check = (name: string, pass: unknown, detail?: unknown) => checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
  const make = (code: string, severity: ExplainableDiagnostic['severity'] = 'warning') => explainDiagnostic({ code, severity, message: 'fixture' });
  const makeForVersion = (code: string, targetGameVersion: string) => explainDiagnostic({ code, severity: 'warning', message: 'fixture', targetGameVersion });
  check('scriptproperty names silent-null impact', /null/i.test(make('scriptproperty.unknown').impact));
  check('rules name fail-closed behavior', /disabled/i.test(make('rules.review_overdue').impact));
  check('xsd guidance names schema', /schema/i.test(make('xsd.invalid').why));
  check('bridge guidance names both sides', /both sides/i.test(make('lua_md.missing_listener').next));
  check('md_lua bridge guidance names both sides', /both sides/i.test(make('md_lua.missing_register').next));
  const convRedraw = make('md_lua.conversation_menu_without_deferred_redraw', 'warning');
  check('conversation menu redraw guidance names deferred redraw',
    convRedraw.title === 'Conversation-triggered UI menu lacks a deferred redraw'
    && /deferred redraw/i.test(convRedraw.next)
    && convRedraw.ruleProvenance.kind === 'unmatched', convRedraw);
  const rawLuaId = make('lua.raw_engine_id_in_player_text', 'warning');
  const rawMdId = make('md_pitfall.raw_engine_id_in_player_text', 'warning');
  check('raw engine id in player text guidance covers Lua and MD codes',
    rawLuaId.title === 'Raw engine ID reaches player-visible text'
    && rawMdId.title === 'Raw engine ID reaches player-visible text'
    && /GetFactionData/.test(rawLuaId.next)
    && /\.knownname/.test(rawMdId.next)
    && rawLuaId.ruleProvenance.kind === 'unmatched', { rawLuaId, rawMdId });
  const overridePitfall = make('md_pitfall.order_cancelled_override_suspension', 'info');
  const overrideCritic = make('order_cancelled_override_suspension', 'info');
  check('override order suspension guidance covers MD pitfall and Canvas critic codes (#67)',
    overridePitfall.title === 'Order-cancelled listener does not distinguish temporary override suspension'
    && overrideCritic.title === overridePitfall.title
    && /event\.param\.exists/.test(overridePitfall.next)
    && /\.isoverride/.test(overridePitfall.next)
    && overridePitfall.ruleProvenance.kind === 'unmatched', { overridePitfall, overrideCritic });
  const truncatedUi = make('x4-ui.truncated-evidence', 'info');
  check('truncated Lua UI evidence explains the limit and a revalidation path',
    truncatedUi.title === 'Lua UI verification is incomplete'
    && /limit/i.test(truncatedUi.why) && /partly unverified/i.test(truncatedUi.impact)
    && /retained coverage gaps.*rerun validation/i.test(truncatedUi.next)
    && truncatedUi.ruleProvenance.kind === 'unmatched');
  check('an adjacent unregistered UI code retains generic guidance',
    /no more specific explanation/i.test(make('x4-ui.future-rule', 'info').why));
  check('patch guidance names post-apply', /post-apply/i.test(make('diff.selector_missing').next));
  check('unavailable validator is not called clean', /not evidence.*clean/i.test(make('validation.md_schema_unavailable').impact));
  const fallback = make('future.unregistered', 'error');
  check('unknown code degrades honestly', /no more specific explanation/i.test(fallback.why), fallback);
  check('all explanations carry deterministic provenance', make('xsd.invalid').deterministic && make('rules.invalid_value').deterministic && fallback.deterministic);
  const xsd = make('XSD_invalid_element', 'error');
  const xsdProvenance = xsd.ruleProvenance;
  check(
    'uppercase XSD resolves the governed rule identity and hash',
    xsdProvenance.kind === 'matched'
      && xsdProvenance.packId === 'x4.core.diagnostics'
      && xsdProvenance.packVersion === '1.1.0'
      && xsdProvenance.packSha256 === X4_CORE_RULE_PACK_EXPECTED_SHA256
      && xsdProvenance.packSha256 === '55f96f23783d6b3acfe11b02eb14b9a063818babf21ca87c62adf8f99eca54a7'
      && xsdProvenance.ruleId === 'x4.schema.routed_validation'
      && xsdProvenance.ruleVersion === '1.0.0',
    xsdProvenance,
  );
  check(
    'uppercase XSD uses governed guidance and evidence',
    xsd.title === 'Game schema rejected this structure'
      && xsd.basis === 'Configured X4 XSD selected by deterministic schema routing.'
      && xsd.ruleProvenance.kind === 'matched'
      && xsd.ruleProvenance.evidence.grade === 'schema'
      && xsd.ruleProvenance.evidence.basis === xsd.basis
      && xsd.ruleProvenance.evidence.digestSha256 === 'f5786993e68ba1df76e89fba409a300ccd6e948dc84b9e1542e86e789bc0d847',
    xsd,
  );
  check(
    'missing target game version is unavailable',
    xsdProvenance.kind === 'matched' && xsdProvenance.applicability === 'unavailable',
    xsdProvenance,
  );
  const invalidTarget = makeForVersion('XSD_invalid_element', '9.00 ');
  check(
    'invalid target game version is unavailable',
    invalidTarget.ruleProvenance.kind === 'matched' && invalidTarget.ruleProvenance.applicability === 'unavailable',
    invalidTarget.ruleProvenance,
  );
  const applicableTarget = makeForVersion('XSD_invalid_element', '9.00');
  check(
    'explicit target game version is applicable',
    applicableTarget.ruleProvenance.kind === 'matched' && applicableTarget.ruleProvenance.applicability === 'applicable',
    applicableTarget.ruleProvenance,
  );
  const scriptProperty = makeForVersion('scriptproperty.unknown', '9.00');
  const propertyProvenance = scriptProperty.ruleProvenance;
  check(
    'scriptproperty resolves exact governed corpus authority and bounded correction guidance',
    propertyProvenance.kind === 'matched'
      && propertyProvenance.packVersion === '1.1.0'
      && propertyProvenance.packSha256 === X4_CORE_RULE_PACK_EXPECTED_SHA256
      && propertyProvenance.ruleId === 'x4.scriptproperty.unknown' && propertyProvenance.ruleVersion === '1.0.0'
      && propertyProvenance.applicability === 'applicable' && propertyProvenance.evidence.grade === 'corpus'
      && propertyProvenance.evidence.digestSha256 === '58f878efc06bd66752c4c66fd57cc168fa19e5b9136ee712a450ca84eaf76ff8'
      && scriptProperty.basis.includes('1b641b638c8892284bbf5943f9ed283e0adf79f696341a2f00a2361f16485a8f')
      && /null/i.test(scriptProperty.impact) && /declared datatype/.test(scriptProperty.next)
      && /unique one-edit/.test(scriptProperty.next) && /complete single-segment/.test(scriptProperty.next)
      && /exact source\/rule identity before the editor edit/.test(scriptProperty.next)
      && /Refuse embedded entities, ambiguous candidates, hinted receivers, unavailable applicability and stale input/.test(scriptProperty.next),
    scriptProperty,
  );
  const propertyWithoutVersion = make('scriptproperty.unknown').ruleProvenance;
  check('scriptproperty without target version withholds applicable authority',
    propertyWithoutVersion.kind === 'matched' && propertyWithoutVersion.applicability === 'unavailable');
  check('neighboring scriptproperty codes keep their independent fallback guidance',
    make('scriptproperty.requires_subselector').ruleProvenance.kind === 'unmatched'
      && make('scriptproperty.unresolved_type').ruleProvenance.kind === 'unmatched');
  const ambiguousCandidates: readonly X4RuleIdentityV1[] = [
    { packId: 'fixture.pack', packVersion: '1.0.0', packSha256: 'a'.repeat(64), ruleId: 'fixture.rule.a', ruleVersion: '1.0.0' },
    { packId: 'fixture.pack', packVersion: '1.0.0', packSha256: 'a'.repeat(64), ruleId: 'fixture.rule.b', ruleVersion: '1.0.0' },
  ];
  const ambiguous = explainDiagnosticWithResolver(
    { code: 'XSD_ambiguous_fixture', severity: 'warning', message: 'fixture' },
    input => ({ kind: 'ambiguous', input, candidates: ambiguousCandidates }),
  );
  check(
    'ambiguous resolution refuses governed guidance and exposes candidates',
    ambiguous.ruleProvenance.kind === 'ambiguous'
      && ambiguous.ruleProvenance.refusal === AMBIGUOUS_RULE_REFUSAL
      && ambiguous.ruleProvenance.candidates.map(candidate => candidate.ruleId).join(',') === 'fixture.rule.a,fixture.rule.b'
      && ambiguous.title === 'Project validator finding'
      && /no more specific explanation/i.test(ambiguous.why),
    ambiguous,
  );
  const deterministicA = make('XSD_invalid_element');
  const deterministicB = make('XSD_invalid_element');
  check(
    'rule provenance is deterministic',
    JSON.stringify(deterministicA.ruleProvenance) === JSON.stringify(deterministicB.ruleProvenance),
    deterministicA.ruleProvenance,
  );
  check(
    'uppercase REF_UNKNOWN, TFILE, and MD cue codes receive rule-specific guidance instead of generic fallback (#33, #66)',
    make('REF_UNKNOWN_WARE').title === 'Referenced game object is unresolved'
      && make('REF_UNKNOWN_FACTION').title === 'Referenced game object is unresolved'
      && make('TFILE_PAGE_ID').title === 'Text reference or translation is incomplete'
      && make('project.unresolved_cue_ref', 'error').title === 'Cross-file cue relationship is broken'
      && make('md.cue_duplicate_name', 'error').title === 'Cross-file cue relationship is broken'
      && formatHumanDiagnosticSourceRef('md.reference:["md/a.xml",4,"signal_cue/@cue"]') === 'signal_cue/@cue'
      && formatHumanDiagnosticSourceRef('md.reference_unpositioned:["md/a.xml",1]') === undefined
      && formatHumanDiagnosticSourceRef('faction@bogus') === 'faction@bogus',
  );
  const passed = checks.filter(item => item.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
