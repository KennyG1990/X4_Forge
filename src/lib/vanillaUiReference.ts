/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Vanilla-UI reference engine — stop validating our UI against two hand-picked examples.
 *
 * This profiles X4 menu Lua against the standalone-menu contract (X4_STANDALONE_MENU_SCHEMA) and
 * derives the REQUIRED patterns from a set of KNOWN-WORKING menus (vanilla menus harvested from the
 * base-game .cat/.dat, plus proven references like SirNukes' Standalone_Menu). It then validates a
 * candidate (our) menu against that observed truth and reports exactly which required-by-real-menus
 * elements are missing — the thing that would have saved hours on the AI-Influence chat window.
 *
 * Pure: Lua text in, plain data out. No fs / network / React (the deterministic referee). The call
 * patterns we match are FLAT (one call per line), so regex is the right tool here per the house
 * pattern (xmldom is for nested XML, not Lua call detection).
 */

import { stripLuaComments } from './luaStaticAnalysis';

const FICTIONAL_UI_API = [
  'RegisterLayout', 'AddUITrigger', 'RemoveAllUITriggers', 'SignalCue', 'OpenUIFrame',
  'UpdateProgressBarValue', 'CreateCoroutine',
];

export interface MenuLuaProfile {
  /** menu table declares a `name = "..."` (OpenMenu(name) must match it). */
  hasName: boolean;
  /** defines onShowMenu — the engine calls it after OpenMenu. */
  hasOnShowMenu: boolean;
  /** builds a frame via Helper.createFrameHandle (or low-level CreateFrame, like the chat window). */
  hasCreateFrame: boolean;
  /** calls frame:display() to actually show it. */
  hasFrameDisplay: boolean;
  /** registers with the engine via Helper.registerMenu. */
  hasRegisterMenu: boolean;
  /** inserts the menu into the global Menus list. */
  hasMenusInsert: boolean;
  /** opened via the engine function OpenMenu(name, ...). */
  hasOpenMenu: boolean;
  /** ANTI-PATTERN: caches the global Helper at file load (`local Helper = Helper`). */
  cachesHelperAtLoad: boolean;
  /** reads Helper lazily (rawget(_G,"Helper")) — the safe pattern. */
  lazyHelper: boolean;
  /** hallucinated UI calls present (cannot run). */
  fictionalApi: string[];
  /** heuristic: this file looks like it builds a standalone menu. */
  isMenuLike: boolean;
}

/** Profile a single Lua source against the standalone-menu contract. Never throws. */
export function profileMenuLua(text: string): MenuLuaProfile {
  const code = stripLuaComments(String(text ?? ''));
  const has = (re: RegExp) => re.test(code);

  const hasOnShowMenu = has(/\bonShowMenu\b/);
  const hasCreateFrame = has(/createFrameHandle\s*\(/) || has(/\bCreateFrame\s*\(/);
  const hasRegisterMenu = has(/registerMenu\s*\(/);
  const profile: MenuLuaProfile = {
    hasName: has(/\bname\s*=\s*['"]/),
    hasOnShowMenu,
    hasCreateFrame,
    hasFrameDisplay: has(/[:.]\s*display\s*\(/),
    hasRegisterMenu,
    hasMenusInsert: has(/table\.insert\s*\(\s*(?:_G\.)?Menus\b/) || has(/(?:_G\.)?Menus\s*\[\s*#\s*(?:_G\.)?Menus/),
    hasOpenMenu: has(/\bOpenMenu\s*\(/),
    cachesHelperAtLoad: has(/local\s+Helper\s*=\s*Helper\b/),
    lazyHelper: has(/rawget\s*\(\s*_G\s*,\s*['"]Helper['"]\s*\)/),
    fictionalApi: FICTIONAL_UI_API.filter((fn) => new RegExp('\\b' + fn + '\\s*\\(').test(code)),
    isMenuLike: hasOnShowMenu || hasCreateFrame || hasRegisterMenu,
  };
  return profile;
}

/** One schema element's support across a corpus of known-working menus. */
export interface SchemaEvidence {
  element: string;
  /** how many menu-like profiles exhibit this element. */
  presentIn: number;
  /** total menu-like profiles considered. */
  total: number;
  /** present in EVERY known-working menu → a hard requirement grounded in real menus. */
  universal: boolean;
}

/** Map a profile to the boolean for each schema element id. */
function elementPresent(p: MenuLuaProfile, element: string): boolean {
  switch (element) {
    case 'name': return p.hasName;
    case 'onShowMenu': return p.hasOnShowMenu;
    case 'frame': return p.hasCreateFrame && p.hasFrameDisplay;
    case 'registered': return p.hasRegisterMenu || p.hasMenusInsert;
    case 'opened': return p.hasOpenMenu;
    case 'safeHelper': return p.lazyHelper || !p.cachesHelperAtLoad;
    default: return false;
  }
}

const SCHEMA_ELEMENTS = ['name', 'onShowMenu', 'frame', 'registered', 'opened', 'safeHelper'] as const;

/**
 * Derive how strongly each schema element is supported across a corpus of KNOWN-WORKING menus.
 * `universal` elements are requirements grounded in real menus (not two hand-picked examples).
 * Only menu-like profiles are counted (skip controllers/helpers that don't build a menu).
 */
export function deriveSchemaEvidence(corpus: { name: string; profile: MenuLuaProfile }[]): SchemaEvidence[] {
  const menus = (corpus || []).filter((c) => c.profile?.isMenuLike);
  const total = menus.length;
  return SCHEMA_ELEMENTS.map((element) => {
    const presentIn = menus.filter((m) => elementPresent(m.profile, element)).length;
    return { element, presentIn, total, universal: total > 0 && presentIn === total };
  });
}

export interface VanillaValidationFinding {
  element: string;
  ok: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/**
 * Validate a candidate (our) menu against the patterns observed in the known-working corpus.
 * Missing a universally-present element → error. Plus the standalone anti-patterns.
 */
export function validateAgainstVanilla(candidate: MenuLuaProfile, evidence: SchemaEvidence[]): VanillaValidationFinding[] {
  const findings: VanillaValidationFinding[] = [];
  for (const ev of evidence) {
    if (!ev.universal) continue;
    const ok = elementPresent(candidate, ev.element);
    if (!ok) {
      findings.push({
        element: ev.element, ok: false, severity: 'error',
        message: `Candidate menu is MISSING "${ev.element}", which every known-working reference menu has (${ev.presentIn}/${ev.total}). It will likely not render.`,
      });
    }
  }
  if (candidate.cachesHelperAtLoad && !candidate.lazyHelper) {
    findings.push({
      element: 'safeHelper', ok: false, severity: 'error',
      message: 'Candidate caches the global Helper at file load (local Helper = Helper) without a lazy refetch. Helper is nil at menu-file load → registerMenu never runs and display() bails. Read it via rawget(_G,"Helper").',
    });
  }
  if (candidate.fictionalApi.length > 0) {
    findings.push({
      element: 'fictionalApi', ok: false, severity: 'error',
      message: `Candidate calls hallucinated UI functions that cannot run: ${candidate.fictionalApi.join(', ')}.`,
    });
  }
  if (findings.length === 0) {
    findings.push({ element: 'all', ok: true, severity: 'info', message: 'Candidate matches every requirement grounded in the known-working corpus.' });
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Oracle — house contract: { allPassed, pass, passed, total, checks }.
 * Fixtures mirror REAL shapes: SirNukes simple_menu/Standalone_Menu.lua (read live) and the proven
 * lazy-Helper AI-Influence chat menu, plus the broken pre-fix shape and a controller file.
 * ------------------------------------------------------------------ */
export function runVanillaUiReferenceSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  // KNOWN-WORKING #1 — SirNukes Standalone_Menu shape: registers in Menus + Helper.registerMenu,
  // onShowMenu builds via createFrameHandle + frame:display(), opened by OpenMenu(name).
  const sirNukes = `
    local menu = { name = "SimpleMenu" }
    local function Init() Menus = Menus or {}; table.insert(Menus, menu); if Helper then Helper.registerMenu(menu) end end
    function menu.onShowMenu() menu.create() end
    function menu.createFrame() menu.infoFrame = Helper.createFrameHandle(menu, {}) end
    function menu.create() menu.createFrame(); menu.infoFrame:display() end
    function menu.Open(args) OpenMenu("SimpleMenu", nil, nil, true) end
    return menu`;
  // KNOWN-WORKING #2 — the proven AI-Influence chat menu (lazy Helper).
  const aic = `
    local Helper = rawget(_G, "Helper")
    local function refreshHelper() if not Helper then Helper = rawget(_G, "Helper") end end
    local menu = { name = "X4_Terminal" }
    function menu.onShowMenu() refreshHelper(); menu.display() end
    function menu.ensureRegistered() refreshHelper(); table.insert(_G.Menus, menu); if Helper then Helper.registerMenu(menu) end end
    function menu.display() menu.frame = Helper.createFrameHandle(menu, {}); menu.frame:display() end`;
  const aicCtrl = `local function open() if OpenMenu then OpenMenu("X4_Terminal", nil, nil, true) end end`;
  // BROKEN — the pre-fix shape: caches Helper at load, no OpenMenu of its own.
  const broken = `
    local Helper = Helper
    local menu = { name = "Bad" }
    function menu.onShowMenu() menu.frame = Helper.createFrameHandle(menu, {}); menu.frame:display() end
    if Helper then Helper.registerMenu(menu) end
    return menu`;
  // FICTIONAL — hallucinated API.
  const fake = `RegisterLayout("ui/x.xml"); AddUITrigger("b", "click", function() end)`;

  const pSir = profileMenuLua(sirNukes);
  const pAic = profileMenuLua(aic);
  const pCtrl = profileMenuLua(aicCtrl);
  const pBroken = profileMenuLua(broken);
  const pFake = profileMenuLua(fake);

  ok('sirnukes_is_menu_like', pSir.isMenuLike, JSON.stringify(pSir));
  ok('sirnukes_has_openmenu', pSir.hasOpenMenu);
  ok('sirnukes_registered', pSir.hasRegisterMenu && pSir.hasMenusInsert);
  ok('aic_lazy_helper', pAic.lazyHelper && !pAic.cachesHelperAtLoad);
  ok('aic_builds_frame', pAic.hasCreateFrame && pAic.hasFrameDisplay);
  ok('ctrl_not_menu_like', !pCtrl.isMenuLike, JSON.stringify(pCtrl));
  ok('broken_caches_helper', pBroken.cachesHelperAtLoad && !pBroken.lazyHelper);
  ok('fake_flags_fictional', pFake.fictionalApi.includes('RegisterLayout'));

  // Evidence derived from the two known-working menus — every schema element should be universal.
  const evidence = deriveSchemaEvidence([
    { name: 'sirnukes', profile: pSir },
    { name: 'aic', profile: pAic },
    { name: 'ctrl', profile: pCtrl }, // skipped (not menu-like)
  ]);
  const ev = (e: string) => evidence.find((x) => x.element === e);
  ok('evidence_counts_only_menus', ev('opened')?.total === 2, JSON.stringify(evidence));
  ok('evidence_name_universal', !!ev('name')?.universal);
  ok('evidence_frame_universal', !!ev('frame')?.universal);
  ok('evidence_safehelper_universal', !!ev('safeHelper')?.universal);

  // Validate the BROKEN menu against the evidence → must flag the helper-cache anti-pattern.
  const brokenFindings = validateAgainstVanilla(pBroken, evidence);
  ok('broken_flagged_helper', brokenFindings.some((f) => f.element === 'safeHelper' && !f.ok), JSON.stringify(brokenFindings));
  // Validate a GOOD menu (aic) against the evidence → no errors (controller supplies OpenMenu in
  // the real addon; here aic itself lacks OpenMenu, so 'opened' is the only expected gap — assert
  // the helper + frame requirements pass).
  const aicFindings = validateAgainstVanilla(pAic, evidence);
  ok('aic_no_helper_or_fictional_error', !aicFindings.some((f) => (f.element === 'safeHelper' || f.element === 'fictionalApi') && !f.ok), JSON.stringify(aicFindings));
  // Validate the FICTIONAL file → flags fictionalApi.
  const fakeFindings = validateAgainstVanilla(pFake, evidence);
  ok('fake_flagged_fictional', fakeFindings.some((f) => f.element === 'fictionalApi' && !f.ok), JSON.stringify(fakeFindings));

  // Degrade safely on garbage.
  const pEmpty = profileMenuLua('');
  ok('empty_safe', pEmpty.isMenuLike === false && pEmpty.fictionalApi.length === 0);

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
