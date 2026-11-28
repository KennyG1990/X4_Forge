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

const X4_UI_LAYOUT_RULE_CODES = new Set([
  'x4-ui.add-table-column-limit',
  'x4-ui.table-width-minimum',
  'x4-ui.column-index',
  'x4-ui.width-after-first-row',
  'x4-ui.reserve-scrollbar-no-variable-column',
  'x4-ui.column-percentage-total',
  'x4-ui.colspan-overrun',
  'x4-ui.font-scale',
  'x4-ui.rendered-non-ascii',
  'x4-ui.button-text-complex-property',
  'x4-ui.row-height-budget',
  'x4-ui.table-height-budget',
  'x4-ui.editbox-height-minimum',
]);

const X4_UI_LIFECYCLE_RULE_CODES = new Set([
  'x4-ui.inline-display',
  'x4-ui.same-layer-inline-open',
]);

const MD_LISTENER_PITFALL_CODES = new Set([
  'md_pitfall.ui_listener_one_shot',
  'md_pitfall.offer_accepted_keyword_cue',
  'md_pitfall.destroyed_event_source_required',
]);

const MD_LOOKUP_PITFALL_CODES = new Set([
  'md_pitfall.param3_table_barekey',
  'md_pitfall.products_existence',
]);

const MD_ACTION_CONTEXT_CODES = new Set([
  'md_pitfall.cancel_conversation_actor_or_template',
  'md_pitfall.return_context',
  'md.return_context',
]);

const MD_LIBRARY_PARAM_CODES = new Set([
  'md.run_actions_param_required',
  'md.run_actions_param_undeclared',
  'md.cue_library_param_required',
  'md.cue_library_param_undeclared',
]);

const MD_CALLABLE_PURPOSE_CODES = new Set([
  'md.run_actions_nonlibrary',
  'md.include_actions_run_library',
  'md.signal_library',
  'md.reference_context',
]);

const EXPRESSION_RULE_CODES = new Set([
  'md.unmatched_else',
  'expression-syntax',
  'expression-null-safe-exists',
  'expression-format-specifier',
  'format-arguments-missing',
  'expression-text-reference',
]);

const LUA_SYNTAX_AND_GLOBAL_CODES = new Set([
  'lua.syntax_error',
  'lua.syntax',
  'lua.undefined_global',
  'lua.global_before_definition',
  'lua.globals-order',
]);

const LUA_RUNTIME_HAZARD_CODES = new Set([
  'lua.fictional_ui_api',
  'lua.helper_cached_at_load',
  'lua.restricted_online_call',
  'lua.broad_package_path',
  'lua.djfhe_internal_require',
  'lua.menu_never_opened',
  'lua.registrations',
  'lua.runtime_scope_unverified',
]);

const MANIFEST_AND_STRUCTURE_CODES = new Set([
  'dep.duplicate',
  'dep.missing_content_xml',
  'dep.self',
  'project.structure',
]);

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
    matches: code => /^(xsd\.|schema\.)/.test(code) || code === 'md.xsd' || code === 'LIBRARY_SCHEMA_UNKNOWN',
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
    matches: code => code === 'md_pitfall.numeric_time_value',
    value: {
      title: 'Unitless number passed to a Mission Director time attribute',
      why: 'The timing attribute (such as play_cutscene/@timeout, cue/@checktime, cue/@checkinterval, delay/@exact, or show_notification/@timeout) receives a plain number or a variable/table field whose proven assignments are unitless numbers.',
      impact: 'X4 evaluates unitless numbers as numeric/float values rather than time values (for example logging "Evaluated value \'240LF\' is not of type time" on monitored play_cutscene timeouts).',
      next: 'Convert numeric expressions to time values such as "(value)s" or "1s * value", or store a time literal (such as "240s" or "500ms") at the assignment site.',
      basis: 'X4 9.00 Mission Director time-attribute and cross-cue provenance analysis',
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
    matches: code => code === 'x4-ui.verification-gap' || code === 'x4-ui.analysis-unavailable',
    value: {
      title: 'Lua UI static analysis is partial or unavailable',
      why: 'Dynamic table parameters, helper indirection, or unavailable Lua UI inputs prevented complete static proof for this file.',
      impact: 'Forge withholds unverified UI layout claims rather than guessing; unseen dynamic UI paths could still fail in X4.',
      next: 'Inspect the reported Lua UI gap or preview the menu with representative sample bindings, and verify dynamic branches in X4.',
      basis: 'bounded X4 Lua UI verification-gap analysis',
    },
  },
  {
    matches: code => X4_UI_LAYOUT_RULE_CODES.has(code),
    value: {
      title: 'X4 Lua UI table or widget constraint violated',
      why: 'A Lua UI table, column width, colspan, font scale, editbox/row height, or rendered string violates calibrated X4 widget engine limits.',
      impact: 'X4 CWidgetController can reject the entire frame, clip or overlap widgets, or close an active conversation menu when rendering.',
      next: 'Adjust the flagged addTable column count, width percentages, colspan, or height budget at the cited Lua line and verify in UI preview.',
      basis: 'calibrated X4 9.00 CWidgetController and Helper.lua static rules',
    },
  },
  {
    matches: code => X4_UI_LIFECYCLE_RULE_CODES.has(code),
    value: {
      title: 'X4 Lua UI frame display or menu-layer hazard',
      why: 'The menu triggers frame:display() inline inside an onClick callback or opens a second menu on the same UI layer synchronously.',
      impact: 'Inline display updates can lag by one click or paint over a newly opened same-layer menu in X4.',
      next: 'Defer frame display updates outside the immediate click handler or target a distinct UI layer when chaining OpenMenu calls.',
      basis: 'X4 9.00 UI frame lifecycle and menu-layer analysis',
    },
  },
  {
    matches: code => code === 'md_pitfall.variable_read_before_initialization' || code === 'md.variable_initial_state' || code === 'md_pitfall.variable_never_set',
    value: {
      title: 'Mission Director variable may be read before initialization',
      why: 'A strict local variable read occurs without a proven prior assignment across the cue namespace, library parameters, or control-flow branches.',
      impact: 'Reading an unset MD variable logs a runtime script error and evaluates to null unless populated earlier or restored from saved cue state.',
      next: 'Initialize the variable before the read on all preceding paths, or guard optional reads with $var? or null-suppressed @$var.',
      basis: 'Mission Director cue-namespace and intra-block variable availability analysis',
    },
  },
  {
    matches: code => code === 'md_pitfall.variable_read_after_removal' || code === 'md_pitfall.variable_read_when_absent',
    value: {
      title: 'Mission Director variable is read while proven absent',
      why: 'A strict local variable read occurs after <remove_value> or inside a negated $var? / <do_else> branch that proves the variable is unset.',
      impact: 'X4 logs an undefined-variable error at runtime and evaluates the read to null.',
      next: 'Assign a new value before reading the variable, or replace the strict read with a guarded or fallback expression.',
      basis: 'Mission Director intra-cue removal and existence-branch flow analysis',
    },
  },
  {
    matches: code => code === 'md_pitfall.no_event_condition' || code === 'md_pitfall.illegal_instantiate',
    value: {
      title: 'Mission Director cue trigger or instantiation mode is invalid',
      why: 'The cue uses non-event <check_*> conditions without an event, checkinterval, or valid one-shot onfail mode, or combines instantiate="true" with one-shot onfail.',
      impact: 'X4 rejects invalid check-only root cues at load ("Found non-event condition ..., event condition required!") or refuses illegal instantiation.',
      next: 'Add an <event_*> condition or checkinterval for repeating/instantiated cues, or use onfail="cancel" / onfail="complete" without instantiate on one-shot gate cues.',
      basis: 'X4 9.00 Mission Director cue trigger and instantiation rules',
    },
  },
  {
    matches: code => MD_LISTENER_PITFALL_CODES.has(code),
    value: {
      title: 'Mission Director event listener will fail or stop firing in X4',
      why: 'The listener omits instantiate="true"/reset on a root UI listener, passes cue="this|parent|static" to <event_offer_accepted>, or omits a target source on <event_object_destroyed>.',
      impact: 'The cue either fires only once and completes forever, never registers in-game, or fails X4 load validation.',
      next: 'Follow the finding remediation: add instantiate="true" for recurring UI listeners, bind $OfferCue / <event_object_signalled> for offer acceptance, or specify object=/group= on destroyed listeners.',
      basis: 'X4 9.00 Mission Director listener failure-corpus rules',
    },
  },
  {
    matches: code => MD_LOOKUP_PITFALL_CODES.has(code),
    value: {
      title: 'Mission Director property or table lookup evaluates unexpectedly',
      why: 'The expression accesses a bare property key on an event.param3 Lua table ($d.key instead of $d.$key) or tests $Station.products? existence instead of .count gt 0.',
      impact: 'Unrecognized bare property lookups evaluate to null/false and skip branches silently, while $Station.products? is true even on empty product lists.',
      next: 'Use $table.$key for Lua-supplied table keys and check $Station.products.count gt 0 when testing whether a station has products.',
      basis: 'X4 9.00 Mission Director table-key and pseudo-property semantics',
    },
  },
  {
    matches: code => MD_ACTION_CONTEXT_CODES.has(code),
    value: {
      title: 'Mission Director action is invalid in this runtime context',
      why: '<cancel_conversation> omits both actor and template, or <return> is used outside a <library purpose="run_actions"> context.',
      impact: 'X4 logs a load/runtime error or ignores the invalid return statement.',
      next: 'Supply actor or template on <cancel_conversation>, and use <return> only inside <library purpose="run_actions"> blocks.',
      basis: 'X4 9.00 Mission Director action-context validation',
    },
  },
  {
    matches: code => MD_LIBRARY_PARAM_CODES.has(code),
    value: {
      title: 'Mission Director library call arguments do not match declaration',
      why: 'A <run_actions> or <cue ref="..."> call omits a required <param> without a default value or passes a parameter name not declared by the target <library>.',
      impact: 'Missing required parameters leave library inputs unset, while undeclared parameter names are ignored and never bind inside the callee.',
      next: 'Align the caller <param name="..."/> list with the target <library><params> declaration.',
      basis: 'Mission Director library signature and call-argument cross-file check',
    },
  },
  {
    matches: code => MD_CALLABLE_PURPOSE_CODES.has(code),
    value: {
      title: 'Mission Director callable target has incompatible kind or purpose',
      why: 'An MD call or cue action targets a <library> where a <cue> is required, targets a <cue> from <run_actions>, or mismatches <library purpose="run_actions|include_actions">.',
      impact: 'X4 rejects the call at load or fails to execute the target block.',
      next: 'Match <signal_cue*>/<reset_cue>/<cancel_cue> to <cue> declarations, <run_actions> to purpose="run_actions" libraries, and <include_actions> to purpose="include_actions" libraries.',
      basis: 'X4 9.00 Mission Director callable kind and library-purpose contract',
    },
  },
  {
    matches: code => /^(cue\.|crossfile\.|project\.cue|project\.unresolved_cue_ref$|md\.cue_|md\.unknown_script_reference$)/.test(code),
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
    matches: code => code === 'aiscript.run_script_param_required' || code === 'aiscript.run_script_param_undeclared',
    value: {
      title: 'AI script run_script call arguments do not match target params',
      why: 'A literal <run_script> call passes an undeclared <param name="..."/> or omits a parameter that has no default in the resolved project-local <aiscript><params> declaration.',
      impact: 'Undeclared argument names never bind in the callee, and omitted required inputs can leave the called AI script without expected state.',
      next: 'Jump to the target AI script <params> block and align the <run_script> <param> names and required values.',
      basis: 'project-local AI script signature and literal run_script argument lint',
    },
  },
  {
    matches: code => code === 'aiscript.label_duplicate' || code === 'aiscript.resume_label_unresolved',
    value: {
      title: 'AI script label or resume target is invalid',
      why: 'An AI script declares duplicate <label name="..."/> targets in the same attention block or <resume label="..."/> names a label missing from that scope.',
      impact: 'X4 cannot resolve the intended execution jump reliably within the attention block.',
      next: 'Keep <label> names unique per attention block and ensure every <resume label="..."/> points to a label declared in the same scope.',
      basis: 'X4 AI script attention-scope label and resume lint',
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
    matches: code => EXPRESSION_RULE_CODES.has(code),
    value: {
      title: 'Script expression syntax, null-guard, or text-format hazard',
      why: 'An MD/AI script expression contains an unmatched else, combines null-suppression @ with ? (such as not @$x.y?), mismatches %s/%1 format arguments, or uses a malformed {page, id} text reference.',
      impact: 'X4 rejects malformed expressions or evaluates null-safe existence checks counterintuitively at runtime.',
      next: 'Rewrite not @$x.y? as explicit chained checks (for example not @$x or $x.y?), pair every else with if ... then, and align format specifiers and {page, id} syntax.',
      basis: 'X4 Mission Director and AI expression AST lint',
    },
  },
  {
    matches: code => LUA_SYNTAX_AND_GLOBAL_CODES.has(code),
    value: {
      title: 'Lua UI syntax error or undeclared global symbol',
      why: 'The Lua file failed LuaJIT 2.1 parsing, references a global absent from X4 and standard Lua allowlists, or reads a file-level global before its definition.',
      impact: 'Syntax errors prevent X4 from loading the Lua file at all; undeclared or out-of-order globals raise nil-value runtime faults when executed.',
      next: 'Fix the Lua syntax error, declare file-scoped helpers/variables as local before first use, or spell the exact X4 UI engine global.',
      basis: 'LuaJIT AST syntax and X4 9.00 UI environment global scope analysis',
    },
  },
  {
    matches: code => LUA_RUNTIME_HAZARD_CODES.has(code),
    value: {
      title: 'Lua UI runtime lifecycle, API, or module-loading hazard',
      why: 'The Lua file calls a non-existent or online-restricted UI API, caches Helper state too early at load time, mutates package.path broadly, or declares a menu that is never opened.',
      impact: 'The UI addon can fail during /reloadui or game boot, break sibling mods via shared package paths, or sit unreachable in-game.',
      next: 'Read Helper/Menus state inside menu lifecycle callbacks rather than file load, use supported X4 UI APIs, and keep require/registration scopes bounded.',
      basis: 'X4 9.00 UI Lua runtime lifecycle and packaging static analysis',
    },
  },
  {
    matches: code => MANIFEST_AND_STRUCTURE_CODES.has(code),
    value: {
      title: 'Extension manifest or project folder structure issue',
      why: 'content.xml is missing, declares a self-dependency or duplicate <dependency>, or the mod folder layout violates X4 extension structure rules.',
      impact: 'X4 may refuse to discover the extension, fail dependency ordering, or ignore misplaced files.',
      next: 'Ensure root content.xml exists with unique external <dependency> entries and place mod scripts under standard X4 subdirectories (md/, aiscripts/, ui/, libraries/, t/).',
      basis: 'X4 extension manifest and folder-structure validation',
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
    matches: code => code === 'additive.shadowed_vanilla_file',
    value: {
      title: 'Full XML file shadows a vanilla X4 file',
      why: 'In additiveOnly mode, shipping a non-<diff> XML file at the same relative path under aiscripts/, md/, libraries/, index/, or maps/ replaces the entire vanilla file instead of composing cleanly.',
      impact: 'Shadowing vanilla breaks compatibility with other mods and drops upstream Egosoft bugfixes across game updates.',
      next: 'Convert the file into an RFC 5261 <diff> patch with structural <add> operations anchored cleanly via sel XPath.',
      basis: 'additive-only vanilla file index check',
    },
  },
  {
    matches: code => code === 'additive.diff_replace_forbidden',
    value: {
      title: 'XML <diff> uses <replace> on a vanilla target',
      why: 'In additiveOnly mode, <replace> mutations overwrite vanilla nodes or attributes in place.',
      impact: 'Multiple mods replacing the same vanilla node conflict, and game updates touching that node fail or silently regress.',
      next: 'Replace destructive <replace> operations with structural <add> extensions or custom-named companion scripts/entries.',
      basis: 'additive-only diff operation guard',
    },
  },
  {
    matches: code => code === 'additive.diff_remove_forbidden',
    value: {
      title: 'XML <diff> uses <remove> on a vanilla target',
      why: 'In additiveOnly mode, <remove> deletes existing vanilla nodes from base or official DLC XML.',
      impact: 'Deleting vanilla nodes can break downstream vanilla scripts, jobs, wares, or companion mods expecting those elements.',
      next: 'Remove the <remove> operation and isolate mod-specific behavior inside additive <add> hooks.',
      basis: 'additive-only diff operation guard',
    },
  },
  {
    matches: code => code === 'additive.diff_attribute_add_forbidden',
    value: {
      title: 'XML <diff> mutates an attribute on a vanilla node',
      why: 'In additiveOnly mode, <add type="@..."> and selectors ending in /@attr modify attributes on existing vanilla elements just like an in-place overwrite.',
      impact: 'Attribute rewrites collide with other extensions and mask vanilla attribute defaults across game patches.',
      next: 'Avoid attribute-mutation adds on vanilla elements; append child elements with structural <add> or introduce a separate mod-owned entry.',
      basis: 'additive-only diff attribute guard',
    },
  },
  {
    matches: code => code === 'additive.reused_vanilla_aiscript_name',
    value: {
      title: 'AI script reuses a vanilla aiscript name',
      why: 'A non-<diff> file under aiscripts/ declares <aiscript name="..."> matching a base-game or official DLC script.',
      impact: 'Duplicate script names overwrite or collide with vanilla order and script execution.',
      next: 'Rename the custom script with a mod-specific prefix, or hook the vanilla script cleanly via an additive <diff><add> patch.',
      basis: 'additive-only vanilla aiscript name index',
    },
  },
  {
    matches: code => code === 'additive.reused_vanilla_mdscript_name',
    value: {
      title: 'Mission Director script reuses a vanilla mdscript name',
      why: 'A non-<diff> file under md/ declares <mdscript name="..."> matching a base-game or official DLC Mission Director script.',
      impact: 'Duplicate MD script names hijack or collide with canonical base/DLC cue hierarchies.',
      next: 'Rename the custom <mdscript> with a unique mod identifier, or extend the vanilla MD file cleanly with <diff><add>.',
      basis: 'additive-only vanilla mdscript name index',
    },
  },
  {
    matches: code => code === 'additive.reused_vanilla_page_id',
    value: {
      title: 'Localization file reuses a vanilla text page ID',
      why: 'A t/*.xml file defines <page id="..."> matching a numeric page ID owned by base-game or official DLC text files.',
      impact: 'Reusing vanilla localization page IDs risks overwriting vanilla UI strings and colliding with game updates.',
      next: 'Allocate a dedicated custom <page id="..."> outside vanilla page ranges and update references accordingly.',
      basis: 'additive-only vanilla localization page index',
    },
  },
  {
    matches: code => code.startsWith('additive.'),
    value: {
      title: 'Additive-only vanilla guard violation',
      why: 'The project enforces additiveOnly in forge.rules.json (or --additive-only), forbidding files that shadow vanilla XML, destructive <replace>/<remove>/<add type="@..."> <diff> mutations on vanilla nodes, reused vanilla aiscript/mdscript names, or reused vanilla t-file page IDs.',
      impact: 'Overwriting vanilla logic or page IDs creates fragile save/mod conflicts and breaks cleanly across X4 game updates.',
      next: 'Convert shadowed files into structural <diff><add> patches, avoid <replace>/<remove>/attribute <add> on vanilla nodes, give custom scripts unique names, and allocate unused mod-specific <page id="..."> ranges.',
      basis: 'project additive-only vanilla protection guard',
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
  const numericTimeExplain = make('md_pitfall.numeric_time_value', 'error');
  check(
    'md_pitfall.numeric_time_value receives specific time-conversion guidance (#72)',
    numericTimeExplain.title === 'Unitless number passed to a Mission Director time attribute'
      && /\(value\)s/.test(numericTimeExplain.next)
      && /type time/i.test(numericTimeExplain.impact),
    numericTimeExplain,
  );
  const allRegisteredFamilyCodes = [
    ...X4_UI_LAYOUT_RULE_CODES,
    ...X4_UI_LIFECYCLE_RULE_CODES,
    'x4-ui.verification-gap',
    'x4-ui.analysis-unavailable',
    'md_pitfall.variable_read_before_initialization',
    'md.variable_initial_state',
    'md_pitfall.variable_read_after_removal',
    'md_pitfall.variable_read_when_absent',
    'md_pitfall.no_event_condition',
    'md_pitfall.illegal_instantiate',
    ...MD_LISTENER_PITFALL_CODES,
    ...MD_LOOKUP_PITFALL_CODES,
    ...MD_ACTION_CONTEXT_CODES,
    ...MD_LIBRARY_PARAM_CODES,
    ...MD_CALLABLE_PURPOSE_CODES,
    'aiscript.run_script_param_required',
    'aiscript.run_script_param_undeclared',
    'aiscript.label_duplicate',
    'aiscript.resume_label_unresolved',
    ...EXPRESSION_RULE_CODES,
    ...LUA_SYNTAX_AND_GLOBAL_CODES,
    ...LUA_RUNTIME_HAZARD_CODES,
    ...MANIFEST_AND_STRUCTURE_CODES,
    'md.xsd',
  ];
  const uncoveredCodes = allRegisteredFamilyCodes.filter(code => make(code).title === 'Project validator finding');
  check(
    'every shipped MD pitfall, MD/AI call & label, expression AST, Lua/X4-UI, and manifest rule has specific guidance',
    uncoveredCodes.length === 0
      && make('md.run_actions_param_required').title === 'Mission Director library call arguments do not match declaration'
      && make('md.cue_library_param_undeclared').title === 'Mission Director library call arguments do not match declaration'
      && make('aiscript.run_script_param_undeclared').title === 'AI script run_script call arguments do not match target params'
      && make('aiscript.resume_label_unresolved', 'error').title === 'AI script label or resume target is invalid'
      && make('aiscript.order_param_missing_type').title === 'AI-script order contract is inconsistent'
      && make('md_pitfall.variable_read_before_initialization').title === 'Mission Director variable may be read before initialization'
      && make('expression-null-safe-exists').title === 'Script expression syntax, null-guard, or text-format hazard'
      && make('lua.undefined_global', 'info').title === 'Lua UI syntax error or undeclared global symbol'
      && make('x4-ui.add-table-column-limit', 'error').title === 'X4 Lua UI table or widget constraint violated',
    { uncoveredCodes },
  );
  check(
    'unregistered future codes in exact-matched namespaces still fail closed to generic guidance',
    ['x4-ui.future-rule', 'lua.future_rule', 'md_pitfall.future_rule', 'dep.future_rule', 'future.unregistered']
      .every(code => make(code).title === 'Project validator finding'),
  );
  const passed = checks.filter(item => item.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
