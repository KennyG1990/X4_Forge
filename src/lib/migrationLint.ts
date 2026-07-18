/**
 * migrationLint.ts — B62c (2026-07-17): version-migration / deprecation linter.
 *
 * Every major X4 update renames or removes constructs; a mod written against the old game silently
 * breaks and the modder hand-hunts what changed (research round 3, F3). This scans a mod for
 * deprecated/renamed/removed constructs and reports the migration to-do — advisory only.
 *
 * The ruleset is GROUNDED in Egosoft's own Breaking Changes wiki
 * (https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding%20Support/Breaking%20Changes/) and then
 * CORPUS-VERIFIED against the unpacked 9.00 tree: every "removed"/"renamed" identifier below was
 * confirmed ABSENT from the live 9.00 schemas AND absent from live vanilla scripts (it survives only
 * inside XML comments, e.g. md/rml_find_resources.xml leaves the old get_highest_resource_yield calls
 * commented as a reference). That is why this MUST DOM-parse and inspect only LIVE nodes — a regex over
 * raw text would cry wolf on those commented remnants. Cry-wolf is the #1 failure mode of this surface;
 * the acceptance bar is that ALL vanilla 9.0 scripts lint clean.
 *
 * Distinct from patch-day readiness (B59a): that detects a <diff> SELECTOR that stopped matching a
 * moved target; this detects CONSTRUCTS (elements, script actions, property paths) that were renamed or
 * deleted outright. Pure — no game install needed (the ruleset is embedded, corpus-verified once).
 */

import { DOMParser } from "@xmldom/xmldom";

export interface MigrationRule {
  /** game version that introduced the break */
  version: string;
  /** 'element' = an element/script-action tag name that was removed/renamed;
   *  'property' = a script-property path fragment (matched as `.<name>` in attribute values). */
  kind: "element" | "property";
  /** the identifier to match (tag name, or property leaf name without the leading dot) */
  match: string;
  /** what happened + the replacement (shown to the modder) */
  message: string;
}

/**
 * CORPUS-VERIFIED ruleset (subset of the Breaking Changes wiki — only constructs a mod's XML/scripts
 * would actually contain, each confirmed absent from live vanilla 9.00). Extend per future game version.
 */
export const MIGRATION_RULES: MigrationRule[] = [
  // --- 9.00 ---
  { version: "9.00", kind: "element", match: "missiletags", message: "`<missiletags>` was replaced in 9.0 by a `<missile>` element with a `<tags>` subnode (and a new `<proximitytrigger>`)." },
  { version: "9.00", kind: "element", match: "get_highest_resource_yield", message: "The `<get_highest_resource_yield>` action was removed in 9.0. Use `$sector.bestyieldrating.{$ware}` instead (see libraries/regionyields.xml)." },
  { version: "9.00", kind: "element", match: "find_asteroid_in_cluster", message: "`<find_asteroid_in_cluster>` was removed in 9.0. Use the sector-scoped resource-finding variant." },
  { version: "9.00", kind: "element", match: "find_recyclable_in_cluster", message: "`<find_recyclable_in_cluster>` was removed in 9.0. Use the sector-scoped variant." },
  { version: "9.00", kind: "property", match: "isexceedingmadscore", message: "The property `ship.isexceedingmadscore` was renamed in 9.0 to `ship.madscore.isexceedingmax`." },
  { version: "9.00", kind: "property", match: "efficiencyupgrades", message: "`$object.efficiencyupgrades.*` was removed in 9.0 (efficiency upgrades no longer exist)." },
  { version: "9.00", kind: "property", match: "currentbestyield", message: "`$resourceprobe.currentbestyield` was removed in 9.0. Use `$resourceprobe.bestyieldrating`." },
  { version: "9.00", kind: "property", match: "averagemaxyield", message: "`$sector.averagemaxyield` was removed in 9.0. Use `$sector.yieldrating.{$ware}`." },
  { version: "9.00", kind: "property", match: "yieldthresholds", message: "`$galaxy.yieldthresholds` was removed in 9.0." },
  // --- 7.00 ---
  { version: "7.00", kind: "property", match: "purposemacro", message: "`macro.purposemacro` was removed in 7.0." },
  { version: "7.00", kind: "property", match: "purposename", message: "`macro.purposename` was removed in 7.0." },
];

export type MigrationKind = "deprecated_element" | "deprecated_property";

export interface MigrationFinding {
  filePath: string;
  version: string;
  kind: MigrationKind;
  match: string;
  message: string;
  /** how many live occurrences in this file (capped) */
  count: number;
}

export interface MigrationResult {
  findings: MigrationFinding[];
  summary: { files: number; findings: number };
}

const MAX_PER_RULE = 200;

function parseDoc(content: string | null): Document | null {
  if (!content || !content.trim()) return null;
  try {
    const doc = new DOMParser({ onError: () => { /* tolerate recoverable parse noise */ } })
      .parseFromString(content, "text/xml");
    // @xmldom drops comment TEXT from element traversal, so commented-out remnants never match.
    return doc && doc.documentElement ? (doc as unknown as Document) : null;
  } catch {
    return null;
  }
}

/** Lint one file's content against the ruleset. Returns per-rule findings (deduped by rule). */
function lintOne(filePath: string, content: string, rules: MigrationRule[]): MigrationFinding[] {
  const out: MigrationFinding[] = [];
  const doc = parseDoc(content);
  if (!doc) return out;

  for (const rule of rules) {
    if (rule.kind === "element") {
      const els = doc.getElementsByTagName(rule.match);
      const n = Math.min(els.length, MAX_PER_RULE);
      if (n > 0) out.push({ filePath, version: rule.version, kind: "deprecated_element", match: rule.match, message: rule.message, count: n });
    } else {
      // property: count attribute values that reference `.<name>` (a property access, not a bare token —
      // avoids matching an unrelated variable that merely contains the substring).
      const needle = "." + rule.match;
      let n = 0;
      const all = doc.getElementsByTagName("*");
      for (let i = 0; i < all.length && n < MAX_PER_RULE; i++) {
        const attrs = all[i].attributes;
        if (!attrs) continue;
        for (let a = 0; a < attrs.length; a++) {
          const v = attrs[a].value;
          if (v && v.toLowerCase().includes(needle)) { n++; break; }
        }
      }
      if (n > 0) out.push({ filePath, version: rule.version, kind: "deprecated_property", match: rule.match, message: rule.message, count: n });
    }
  }
  return out;
}

export interface LintMigrationInput {
  files: Array<{ path: string; content: string }>;
  /** default: all rules. Only MD / AI-script / libraries XML is worth scanning. */
  rules?: MigrationRule[];
}

/** Only these file kinds can contain the deprecated constructs — skip everything else cheaply. */
function isScannable(path: string): boolean {
  const p = path.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)(md|aiscripts)\/[^/]+\.xml$/.test(p) || /(^|\/)libraries\/[^/]+\.xml$/.test(p);
}

export function lintMigration(input: LintMigrationInput): MigrationResult {
  const rules = input.rules || MIGRATION_RULES;
  const findings: MigrationFinding[] = [];
  let scanned = 0;
  for (const f of input.files) {
    if (typeof f.content !== "string" || !isScannable(f.path)) continue;
    scanned++;
    findings.push(...lintOne(f.path, f.content, rules));
  }
  return { findings, summary: { files: scanned, findings: findings.length } };
}

/* ------------------------------------------------------------------ *
 * Oracle — synthetic fixtures using the REAL deprecated identifiers,
 * plus the comment-safety proof (the #1 cry-wolf guard). Pure.
 * ------------------------------------------------------------------ */

export function runMigrationLintSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  // A mod MD file using removed 9.0 constructs LIVE → flagged.
  const badMd = `<?xml version="1.0"?><mdscript name="M"><cues><cue name="C"><actions>
    <get_highest_resource_yield result="$y" sector="$s" ware="$w"/>
    <do_if value="$ship.isexceedingmadscore"><debug_text text="'x'"/></do_if>
    <set_value name="$e" exact="$object.efficiencyupgrades.speed"/>
  </actions></cue></cues></mdscript>`;
  const bad = lintMigration({ files: [{ path: "md/mymod.xml", content: badMd }] });
  ok("removed_action_flagged", bad.findings.some(f => f.match === "get_highest_resource_yield" && f.kind === "deprecated_element"));
  ok("renamed_property_flagged", bad.findings.some(f => f.match === "isexceedingmadscore" && f.kind === "deprecated_property"));
  ok("removed_property_flagged", bad.findings.some(f => f.match === "efficiencyupgrades"));
  ok("all_tagged_9_00", bad.findings.every(f => f.version === "9.00"), JSON.stringify(bad.findings.map(f => f.version)));

  // COMMENT SAFETY (the cry-wolf guard): the exact same constructs, but commented out → ZERO findings.
  const commentedMd = `<?xml version="1.0"?><mdscript name="M"><cues><cue name="C"><actions>
    <!--get_highest_resource_yield result="$y" sector="$s" ware="$w"/-->
    <!-- <do_if value="$ship.isexceedingmadscore"/> -->
    <debug_text text="'nothing deprecated here'"/>
  </actions></cue></cues></mdscript>`;
  const commented = lintMigration({ files: [{ path: "md/mymod.xml", content: commentedMd }] });
  ok("comments_never_flagged", commented.findings.length === 0, JSON.stringify(commented.findings.map(f => f.match)));

  // Property matching requires a `.` access — a variable that merely contains the token is NOT flagged.
  const looksSimilar = `<?xml version="1.0"?><mdscript name="M"><cues><cue name="C"><actions>
    <set_value name="$my_purposename_note" exact="1"/>
    <debug_text text="'purposename as a bare word, not a .property'"/>
  </actions></cue></cues></mdscript>`;
  const similar = lintMigration({ files: [{ path: "md/mymod.xml", content: looksSimilar }] });
  ok("bare_token_not_flagged", !similar.findings.some(f => f.match === "purposename"), JSON.stringify(similar.findings));

  // Non-scannable files are skipped (a content.xml mentioning the word is not scanned).
  const skip = lintMigration({ files: [{ path: "content.xml", content: `<content><get_highest_resource_yield/></content>` }] });
  ok("non_scannable_skipped", skip.summary.files === 0 && skip.findings.length === 0);

  // A clean modern mod → zero findings.
  const clean = lintMigration({ files: [{ path: "aiscripts/ok.xml", content: `<?xml version="1.0"?><aiscript name="A"><attention min="unknown"><actions><debug_text text="'fine'"/></actions></attention></aiscript>` }] });
  ok("clean_mod_zero", clean.findings.length === 0);

  // Missiletags element (9.0 rename) caught in a libraries file.
  const lib = lintMigration({ files: [{ path: "libraries/weapons.xml", content: `<?xml version="1.0"?><macros><macro><missiletags tags="x"/></macro></macros>` }] });
  ok("missiletags_element_flagged", lib.findings.some(f => f.match === "missiletags"));

  // Robustness: empty/malformed never crash.
  ok("empty_safe", lintMigration({ files: [] }).findings.length === 0);
  ok("malformed_safe", lintMigration({ files: [{ path: "md/x.xml", content: "<mdscript><cue" }] }).summary.files === 1);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
