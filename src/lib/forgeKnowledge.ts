/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared deterministic X4 Forge knowledge index (#19 UI/API/MCP parity):
 * single source of truth for in-app X4 Wiki topics, Studio keyboard shortcuts,
 * and starter-template guided onboarding rails across Studio UI, Agent HTTP API,
 * and stdio MCP (`query_forge_knowledge`). Pure TypeScript — zero React/DOM/I/O.
 */

import { MOD_TEMPLATES, type RailGuide } from './modTemplates';

export type WikiCategory = 'mdscript' | 'aiscript' | 'xmlpatch' | 'luaui' | 'reference';
export type ForgeKnowledgeSection = 'all' | 'wiki' | 'shortcuts' | 'onboarding';

export interface WikiTopic {
  id: string;
  title: string;
  category: WikiCategory;
  summary: string;
  content: string;
  codeTemplate?: string;
  egosoftUrl?: string;
}

export interface ShortcutRow {
  keys: string[];
  what: string;
  where: string;
}

export interface StarterOnboardingGuide {
  id: string;
  name: string;
  title: string;
  blurb: string;
  domains: Array<'md' | 'xmlpatch' | 'tfile' | 'luaui'>;
  rail: RailGuide | null;
}

export const WIKI_TOPICS: WikiTopic[] = [
  {
    id: 'mdscript_basics',
    title: 'Mission Director (MD) Scripting Basics',
    category: 'mdscript',
    summary: 'Understand the core workflow, lifecycle, and execution hierarchy of Egosoft MD xml scripts.',
    content: "Mission Director (MD) scripts govern game events, missions, custom sector behaviors, and world-state logic. MD files reside inside `/md` and use the `.xml` extension. Logic is entirely triggered by hierarchical **cues**.\n\n### 1. The Cue Hierarchy\nCues form a dependency tree. A child cue can ONLY activate if its parent cue is already `completed` or `active`.\n- **instantiate**: If set to `true`, a new copy of the cue is spawned each time the condition triggers. Extremely useful for background triggers (e.g. listening for sector entrances repeatedly).\n- **namespace**: If set to `this`, all variables declared within the cue (using `name=\"$VarName\"`) are scoped locally, ensuring no memory leakage or naming conflicts.\n\n### 2. Cue Sections\n- **`<conditions>`**: Triggers that the game engine evaluates. Can be events (e.g. `<event_game_loaded/>`) or condition evaluations (e.g. `<check_value value=\"...\"/>`).\n- **`<actions>`**: Deterministic game logic executed immediately on trigger completion. Used to spawn fleets, grant credit, edit tables, create UI, etc.",
    codeTemplate: `<cue name="My_Startup_Trigger" instantiate="true" namespace="this">
  <conditions>
    <event_game_loaded />
  </conditions>
  <actions>
    <!-- Log verification message to the modding developer debug logbook -->
    <write_to_logbook category="general" text="'X4 Forge - Active Workspace Loaded'" />
  </actions>
</cue>`,
    egosoftUrl: 'https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/Mission%20Director%20Introduction/',
  },
  {
    id: 'mdscript_spawning_ships',
    title: 'Spawning Ships under Player Wing',
    category: 'mdscript',
    summary: 'Learn how to dynamically specify ship macros, set faction trueowners, recruit pilots, and deploy escorts safely.',
    content: "Spawning fighters, capital ships, or transport freighters is central to custom escort and war logic. This is achieved via the `<create_ship>` element under the cue's `<actions>` segment.\n\n### Critical Positioning Rules\nTo prevent ship spawning directly inside stations or planets (which causes collision bugs or instant physics deaths), always wrap the coordinate inside a `<safepos>` wrapper. Set the target relative positioning anchor (e.g. relative to player play-ship or a specific sector gate).",
    codeTemplate: `<create_ship name="$HeavyEscort" macro="ship_arg_s_fighter_01_a_macro" faction="faction.player">
  <!-- Deploys ship safely within 3 kilometers of playerplayship -->
  <safepos object="player.playship" max="3km" />
  <pilot>
    <!-- Recruits a high-tier pilot automatically under player control -->
    <select faction="faction.player" tags="tag.aipilot" />
  </pilot>
</create_ship>`,
    egosoftUrl: 'https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/MD%20Script%20Elements/create_ship',
  },
  {
    id: 'mdscript_event_handling',
    title: 'Sector Entrances & Threat Detection Triggers',
    category: 'mdscript',
    summary: 'Capture location changes, intercept player gate transitions, and evaluate sector ownership dynamically.',
    content: "Capturing when a ship or the player transitions between system gates is vital for ambush systems, custom missions, and sector-wide alert tracking.\n\n### Common Location Hooks\n- **`event_object_changed_sector`**: Activates whenever a tracked entity crosses a gate boundary.\n- **`event_object_changed_owner`**: Intercepts sector ownership changes. Highly relevant for dynamic expansion campaigns.",
    codeTemplate: `<cue name="On_Player_Enter_Sector" instantiate="true" namespace="this">
  <conditions>
    <event_object_changed_sector object="player.playship" />
  </conditions>
  <actions>
    <set_value name="$EnteredSector" exact="event.object.sector" />
    <show_help duration="10s" custom="'Warning: Entered system ' + $EnteredSector.knownname" />
  </actions>
</cue>`,
    egosoftUrl: 'https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/MD%20Script%20Elements/event_object_changed_sector',
  },
  {
    id: 'mdscript_order_override_suspension',
    title: 'Order Cancellation vs. Override Suspension (event_object_order_cancelled)',
    category: 'mdscript',
    summary: 'Prevent duplicate order re-queuing and premature teardown when combat or police overrides suspend a ship order.',
    content: "In X4 9.00, starting an override order on a ship — most commonly `<create_order ... immediate=\"true\" override=\"true\">` inside `aiscripts/interrupt.attacked.xml` (`'Attack'` / `'Flee'`), `aiscripts/lib.respond.inspected.xml`, `aiscripts/lib.respond.foundlockbox.xml`, `aiscripts/lib.respond.foundabandonedship.xml`, or `md/conversations.xml` — **suspends** the currently running order rather than deleting it. Once the override finishes, the suspended order automatically resumes.\n\n### The Trap (`FF-28` / `#67`)\nEven though the interrupted order still exists in `$Ship.orders` and will resume on its own, X4 raises `<event_object_order_cancelled>` at the moment the override takes control. A cue that treats every `<event_object_order_cancelled>` as permanent cancellation will either:\n- Re-issue a second `<create_order>` while the original order is still suspended in the queue (causing duplicate orders), or\n- Prematurely tear down mission/tracking state while the ship is merely defending itself or fleeing.\n\n### Proven Guards\n1. **Permanent removal only (Egosoft vanilla idiom in `md/factionsubgoal_recon.xml`):** Check `<check_value value=\"not event.param.exists\" />` (or `not $Ship.orders.indexof.{$Order}`).\n2. **Track live override suspension explicitly:** Branch on `<do_if value=\"@$Order.exists and @$Ship.order.isoverride\">` to pause watchers until `<event_object_order_ready>` / order resumption.\n3. **Inspect all vanilla override issuers:** Browse **Override Orders** in the Object Browser or call MCP `list_override_order_issuers` (`GET /api/agent/reference/override-orders`).",
    codeTemplate: `<cue name="On_Tracked_Order_Removed" instantiate="true" namespace="this">
  <conditions>
    <event_object_order_cancelled object="$TrackedShip" />
    <!-- Ignore temporary suspension when an override="true" order (Attack/Flee/Police) interrupts -->
    <check_value value="not event.param.exists" />
  </conditions>
  <actions>
    <debug_text text="'Order permanently removed on ' + $TrackedShip.knownname" />
  </actions>
</cue>`,
  },
  {
    id: 'aiscript_basics',
    title: 'AIScript & Pilot Behaviors Overview',
    category: 'aiscript',
    summary: 'AIScript handles low-level pilot actions, pathfinding, trade routes, combat flight AI, and task automation loops.',
    content: "While Mission Director scripts manage higher-level game state and story cues, **AIScripts** run inside pilot cockpit computation frames. AIScripts reside in `/aiscripts` and define the dynamic loop profiles of ships.\n\n### Architecture of an AIScript\n- **`<params>`**: Configuration parameters passed from superior orders or GUI menus.\n- **`<interrupts>`**: Specialized exception loops. If a ship takes damage, receives a flee signal, or sees a xenon gate spawn, it pauses the action queue and runs the associated interrupt actions.\n- **`<actions>`**: Sequential imperative loops. Use elements like `<move_to>`, `<dock_at>`, `<wait>`, and `<shoot>` to control the ship macro.",
    codeTemplate: `<?xml version="1.0" encoding="utf-8"?>
<aiscript name="order.patrol.custom" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <params>
    <param name="destination" type="object" default="this.ship.sector" />
    <param name="range" type="length" default="10km" />
  </params>
  <actions>
    <do_while value="this.ship.isoperational">
      <move_to object="this.destination" destination="this.destination" />
      <wait min="10s" max="20s" />
    </do_while>
  </actions>
</aiscript>`,
    egosoftUrl: 'https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/AIScript%20Overview/',
  },
  {
    id: 'aiscript_commands',
    title: 'AIScript Core Pilot Commands Reference',
    category: 'aiscript',
    summary: 'A cheatsheet covering the primary pilot navigation, trade routine, and combat targeting code tags.',
    content: "When writing custom scripts for ships inside `/aiscripts`, these basic pilot action tags are essential:\n\n- **`<move_to>`**: Instructs pilot to orient and burn toward physical target coordinates.\n- **`<dock_at>`**: Initiates matching orbit paths, alignments, landing pad requests, and final docking clamps connection.\n- **`<wait>`**: Holds ship operation queue for random/fixed durations to prevent CPU throttling.\n- **`<find_objects>`**: Performs proximity radar sweeps to collect local asteroids, hostile ships, or tradestation facilities under filter rules.",
    codeTemplate: `<attention min="visible">
  <actions>
    <move_to object="this.ship" destination="this.destination" forceposition="true" />
    <wait min="5s" max="15s" />
  </actions>
</attention>`,
    egosoftUrl: 'https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/AIScripts/Pilot%20Actions',
  },
  {
    id: 'xmlpatch_diff',
    title: 'XML Patching & Diff File Mechanics',
    category: 'xmlpatch',
    summary: 'X4 Foundation relies on XML diff patching to append, modify, or delete elements inside Egosoft core game files safely.',
    content: "In X4 Foundations, you **NEVER** overwrite complete, default game data files (e.g. `wares.xml`). Overwriting causes game crashes or breaks compatibility with other mods. Instead, we write **XML Patch Files** (Diffs).\n\n### 1. XML Diff Structure\nYour patch file must reside at the same relative directory path (e.g., `/libraries/wares.xml`) but begin with the root tag `<diff>`.\n\n### 2. Available Patch operations\n- **`add`**: appends new nodes at an XPath location.\n- **`replace`**: replaces an existing node's property or full element.\n- **`remove`**: deletes a node or attribute.\n- **`sel`**: XPath selector expression targeting the exact game element (e.g. `sel=\"/wares/ware[@id='energycells']/price\"`).",
    codeTemplate: `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <!-- Injects a new high-importance custom weapon modification into core shield generators listings -->
  <add sel="/libraries/wares">
    <ware id="ware.mod_shield_custom" name="Titanium Supercharger Shield Mod">
      <price min="10000" average="15000" max="20000" />
    </ware>
  </add>
</diff>`,
    egosoftUrl: 'https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/XML%20Patching%20Introduction/',
  },
  {
    id: 'luaui_overview',
    title: 'Lua UI Customization & HUD Extensions',
    category: 'luaui',
    summary: 'How X4 translates visual interface layout schemas into functional LUA overlays and in-cockpit display charts.',
    content: "X4 Foundations utilizes custom-compiled LUA modules and in-game UI templates to render HUD dashboards, crosshair indicators, sector operations charts, and weapon terminal maps.\n\n### UI Blueprint Translation\nWhen designing custom HUD widgets, they must be formatted into clean XML templates representation. These are rendered inside parent containers, styled securely, and mapped directly to triggers or signal callbacks inside MD script variables. This allows pilot actions to trigger real-time progress bar movements or alert sounds!",
    codeTemplate: `<ui_layout>
  <!-- Visual frame map representation for tactical dashboards -->
  <window name="Tactical_Operations_Console" x="120" y="80" w="400" h="300">
    <header text="TACTICAL ALERT OVERVIEW" />
    <progressbar value="90" color="#ff2200" text="Shield Capacitor" />
    <button text="DECLARE RED ALERT" signal="My_Alert_Trigger" />
  </window>
</ui_layout>`,
    egosoftUrl: 'https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/Lua%20UI%20Customization/',
  },
  {
    id: 'luaui_button_3_steps',
    title: 'Wire a HUD Button in 3 Steps',
    category: 'luaui',
    summary: 'The complete Forge path from a drawn button to an in-game reaction: design it, signal it, catch it in MD.',
    content: "The Forge wires HUD → game logic through MD signals; you never write Lua by hand.\n\n### Step 1 — Draw the button\nOpen **HUD & LUA UI** (top bar) and add a `button` widget inside a `window` (or load the *HUD Button* starter template). Its `label` is what the pilot reads.\n\n### Step 2 — Name its signal\nIn the button's properties set `signal` to a cue-friendly name, e.g. `My_Button_Pressed`. The compiler emits the Lua that raises this as an MD-visible signal when clicked.\n\n### Step 3 — Catch it in MD\nOn the MD canvas, add a cue whose condition is `event_cue_signalled` with `cue=\"md.$YourScript$.My_Button_Pressed\"` — or simply an event node listening for the signal name. Everything the game can do (spawn, reward, log, speak) hangs off that cue's actions.\n\nDeploy (the rail's one-click deploy works here too), load a save, click your button, and watch the cue fire in the debug watcher.",
    codeTemplate: `<!-- Step 1+2 (HUD designer output): -->
<button text="DECLARE RED ALERT" signal="My_Button_Pressed" />

<!-- Step 3 (MD side — catches the click): -->
<cue name="On_My_Button" instantiate="true" namespace="this">
  <conditions>
    <event_cue_signalled cue="md.Setup.My_Button_Pressed" />
  </conditions>
  <actions>
    <write_to_logbook category="general" text="'HUD button pressed!'" />
  </actions>
</cue>`,
    egosoftUrl: 'https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding/Lua%20UI%20Customization/',
  },
  {
    id: 'luaui_kuertee_compat',
    title: 'UI Extensions Framework Compatibility (kuertee)',
    category: 'luaui',
    summary: 'Make a UI mod hook into the widely-used kuertee UI Extensions framework instead of raw ui/ diffs — the ecosystem-standard way.',
    content: "Most UI and quality-of-life mods don't patch the game's `ui/` files directly — they extend the community-standard **kuertee UI Extensions** framework (very commonly a required dependency). Targeting its hooks makes your mod compatible with the whole UI-mod ecosystem instead of fighting it.\n\n### 1. Declare the dependency\nIn your `content.xml`, require the framework by its extension id **`kuertee_ui_extensions`**. In the Forge, add it under the workspace's dependencies so the compiled `content.xml` emits a `<dependency>` element.\n\n### 2. Register a callback into an existing menu\nThe framework exposes a per-menu `registerCallback(callbackName, callbackFunc, modId)` — you attach your function to a named hook on a game menu (e.g. the Map menu) and pass your own mod id. Deregister with `deregisterCallback(callbackName, nil, modId)`.\n\n### 3. Clean up on deactivation\nListen for the framework's deactivate signal so your mod tidies up when disabled — an `event_ui_triggered` on the OptionsMenu `uix_deactivate_mod` control, gated on your mod id.\n\n**Note:** the Forge's HUD designer emits a *standalone* menu (see \"Wire a HUD Button\"); authoring a framework-callback mod means hand-writing the small Lua below (a raw-Lua starter is planned). Identifiers here are the framework's own — see its GitHub for the full hook list.",
    codeTemplate: `<!-- content.xml: require the framework -->
<dependency id="kuertee_ui_extensions" name="kuertee UI Extensions" />

-- your mod's Lua: hook into a game menu (grounded on the framework's API)
MapMenu.registerCallback("buttonToggleObjectList_on_start", myCallbackFunc, "my_mod_id")
-- ...and deregister when done:
-- MapMenu.deregisterCallback("buttonToggleObjectList_on_start", nil, "my_mod_id")

<!-- MD: clean up when the user disables your mod -->
<cue name="On_UIX_Deactivate" instantiate="true">
  <conditions>
    <event_ui_triggered screen="'OptionsMenu'" control="'uix_deactivate_mod'" />
    <check_value value="event.param3 == 'my_mod_id'" />
  </conditions>
  <actions><!-- teardown here --></actions>
</cue>`,
    egosoftUrl: 'https://github.com/kuertee/x4-mod-ui-extensions',
  },
  {
    id: 'reference_ai_anti_hallucination',
    title: 'Is this just another AI mod generator?',
    category: 'reference',
    summary: 'How the Forge keeps AI-authored mods honest — the same real-schema validation a hand-built mod faces, driven by the validator, not the model.',
    content: "**Straight answer: no — and here's the mechanism.**\n\nThe knock on AI-made mods is fair: a language model will happily invent a command that doesn't exist, an attribute the schema never had, or a cue reference that points at nothing — and you don't find out until the game silently ignores it or refuses to load.\n\n### The Forge doesn't trust the AI's output\nIt runs the generated mod through the **exact same validators a hand-built mod faces** — Egosoft's own XML schemas, cross-file cue resolution, script-property checks, and a set of known-pitfall rules pulled from real mods. Not a sanity check the AI grades itself on. The same wall your own hand-written XML would hit.\n\n### The validator drives the repair — not the model\nIf the generated mod passes on the first try, you're done; the AI is never asked to \"fix\" anything. If it doesn't, the validator hands the model the exact failing findings, asks for a correction, and re-validates. That loop is **bounded** (a few attempts, then it stops), and if the same problem survives two rounds it gives up instead of spinning. When it still can't make a mod validate, **it tells you plainly** — you get the findings, not a broken mod dressed up as finished.\n\n### What this does and doesn't buy you\nIt catches the *structural* lies — invented tags, wrong attributes, dangling references, script properties that don't exist. It does **not** promise the mod does what you pictured; no validator can read your mind, and the game is the final judge. The promise is narrower and more useful: what the AI hands you is a mod actually *shaped like a real X4 mod*, not a plausible-looking hallucination you debug in-game.\n\n(AI is off by default. The studio is a full deterministic editor without ever calling a model — the validation above runs on everything, AI-authored or not.)",
  },
];

export const STUDIO_SHORTCUTS: ShortcutRow[] = [
  { keys: ['Ctrl', 'Z'], what: 'Undo last action', where: 'Everywhere' },
  { keys: ['Ctrl', 'Y'], what: 'Redo (also Ctrl+Shift+Z)', where: 'Everywhere' },
  { keys: ['Ctrl', 'K'], what: 'Search workspace (also Cmd+K or /)', where: 'Expert' },
  { keys: ['?'], what: 'Show this shortcuts list', where: 'Everywhere' },
  { keys: ['Space'], what: 'Quick-add node palette at the cursor', where: 'Canvas' },
  { keys: ['C'], what: 'Add a Comment Box (groups selected nodes)', where: 'Canvas' },
  { keys: ['Ctrl', 'F'], what: 'Search nodes by label, tag, or field', where: 'Canvas' },
  { keys: ['Esc'], what: 'Close dialogs and popups', where: 'Dialogs' },
];

export const STARTER_ONBOARDING_GUIDES: StarterOnboardingGuide[] = MOD_TEMPLATES.map(tpl => {
  const built = tpl.build();
  const domains: Array<'md' | 'xmlpatch' | 'tfile' | 'luaui'> = [];
  if (built.nodes.length > 0) domains.push('md');
  if ((built.xmlPatches?.length ?? 0) > 0) domains.push('xmlpatch');
  if ((built.tFiles?.length ?? 0) > 0) domains.push('tfile');
  if ((built.uiWidgets?.length ?? 0) > 0) domains.push('luaui');
  return {
    id: tpl.id,
    name: tpl.name,
    title: tpl.title,
    blurb: tpl.blurb,
    domains,
    rail: tpl.rail ? { ...tpl.rail } : null,
  };
});

export interface QueryForgeKnowledgeInput {
  section?: ForgeKnowledgeSection;
  category?: WikiCategory;
  q?: string;
}

export interface QueryForgeKnowledgeResult {
  ok: true;
  section: ForgeKnowledgeSection;
  category: WikiCategory | null;
  query: string;
  counts: {
    wikiTopics: number;
    shortcuts: number;
    starterGuides: number;
  };
  wikiTopics: WikiTopic[];
  shortcuts: ShortcutRow[];
  starterGuides: StarterOnboardingGuide[];
}

export function queryForgeKnowledge(input: QueryForgeKnowledgeInput = {}): QueryForgeKnowledgeResult {
  const section: ForgeKnowledgeSection = input.section || 'all';
  const category = input.category || null;
  const query = (input.q || '').trim();
  const needle = query.toLowerCase();

  const includeWiki = section === 'all' || section === 'wiki';
  const includeShortcuts = section === 'all' || section === 'shortcuts';
  const includeOnboarding = section === 'all' || section === 'onboarding';

  const wikiTopics = includeWiki
    ? WIKI_TOPICS.filter(topic => {
        if (category && topic.category !== category) return false;
        if (!needle) return true;
        return (
          topic.id.toLowerCase().includes(needle)
          || topic.title.toLowerCase().includes(needle)
          || topic.summary.toLowerCase().includes(needle)
          || topic.content.toLowerCase().includes(needle)
          || (topic.codeTemplate ? topic.codeTemplate.toLowerCase().includes(needle) : false)
        );
      })
    : [];

  const shortcuts = includeShortcuts
    ? STUDIO_SHORTCUTS.filter(row => {
        if (!needle) return true;
        return (
          row.keys.join('+').toLowerCase().includes(needle)
          || row.what.toLowerCase().includes(needle)
          || row.where.toLowerCase().includes(needle)
        );
      })
    : [];

  const starterGuides = includeOnboarding
    ? STARTER_ONBOARDING_GUIDES.filter(guide => {
        if (!needle) return true;
        return (
          guide.id.toLowerCase().includes(needle)
          || guide.name.toLowerCase().includes(needle)
          || guide.title.toLowerCase().includes(needle)
          || guide.blurb.toLowerCase().includes(needle)
          || guide.domains.some(domain => domain.includes(needle))
          || (guide.rail?.tweakHint.toLowerCase().includes(needle) ?? false)
          || (guide.rail?.gameCheck.toLowerCase().includes(needle) ?? false)
        );
      })
    : [];

  return {
    ok: true,
    section,
    category,
    query,
    counts: {
      wikiTopics: wikiTopics.length,
      shortcuts: shortcuts.length,
      starterGuides: starterGuides.length,
    },
    wikiTopics,
    shortcuts,
    starterGuides,
  };
}

/**
 * Strip Windows drive paths (`C:\...`, `G:/...`) and POSIX home paths (`/Users/...`, `/home/...`)
 * from diagnostic values so bug-report bundles stay host-path-free.
 */
export function scrubBugReportValue(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\s|"`'<>]+/g, '<host-path>')
    .replace(/(?:\/Users|\/home)\/[^\s|"`'<>]+/g, '<host-path>');
}

export function runForgeKnowledgeSelftest(): {
  pass: boolean;
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
} {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  const all = queryForgeKnowledge();
  ok('all section returns wiki, shortcuts, and starter guides',
    all.wikiTopics.length >= 10 && all.shortcuts.length >= 8 && all.starterGuides.length >= 8);

  const luaOnly = queryForgeKnowledge({ section: 'wiki', category: 'luaui', q: 'kuertee' });
  ok('wiki category + substring filter narrows to kuertee topic',
    luaOnly.wikiTopics.length === 1 && luaOnly.wikiTopics[0].id === 'luaui_kuertee_compat'
      && luaOnly.shortcuts.length === 0 && luaOnly.starterGuides.length === 0);

  const overrideWiki = queryForgeKnowledge({ section: 'wiki', category: 'mdscript', q: 'event_object_order_cancelled' });
  ok('wiki covers FF-28 override suspension on event_object_order_cancelled (#67)',
    overrideWiki.wikiTopics.some(t => t.id === 'mdscript_order_override_suspension' && t.content.includes('not event.param.exists')));

  const shortcutsOnly = queryForgeKnowledge({ section: 'shortcuts', q: 'comment' });
  ok('shortcuts filter finds Canvas Comment Box binding',
    shortcutsOnly.shortcuts.length === 1 && shortcutsOnly.shortcuts[0].keys.includes('C'));

  const onboardingOnly = queryForgeKnowledge({ section: 'onboarding', q: 'gamestart' });
  ok('onboarding filter finds Custom Game Start rail guide',
    onboardingOnly.starterGuides.some(g => g.id === 'custom_gamestart' && Boolean(g.rail?.tweakHint)));

  const scrubbed = scrubBugReportValue('Failed reading G:\\Forge-QA\\secret\\file.xml and /Users/alice/mod/content.xml');
  ok('scrubBugReportValue redacts Windows and POSIX host paths',
    !scrubbed.includes('Forge-QA') && !scrubbed.includes('alice') && scrubbed.includes('<host-path>'));

  return { pass: checks.every(c => c.pass), checks };
}
