/**
 * godLint.ts — B63/A2 (2026-07-18): god.xml station-placement macro resolution.
 *
 * libraries/god.xml places NPC stations/economy via `<station>` entries whose `<location class="sector"
 * macro="..._sector_macro"/>` (and other macro= attributes) must point at a REAL sector/zone/station
 * macro — a typo'd or missing macro id silently fails to spawn (research round 4, overhaul staple). The
 * game ships factions.xsd/etc. but nothing checks that god.xml's macro references RESOLVE.
 *
 * Cry-wolf-safe (only after B63 taught the object index to scan maps/ — sector macros are now in the
 * reference set, so vanilla god.xml's 151 macro refs resolve, 0 unresolved). The check is SKIPPED unless
 * a non-empty known-macro set is supplied (object index built) — never guess-flag. Known = the reference
 * set macros UNION the mod's OWN `<macro name>` definitions (a mod adding a new sector never cries wolf).
 *
 * NOT checked: matchextension="false" — corpus-FALSIFIED (495/496 vanilla locations OMIT it; it's a mod
 * convention, not a rule). DOM-parsed (comment-safe). Advisory WARNING. Pure — the caller injects known.
 */

import { DOMParser } from "@xmldom/xmldom";

export type GodLintKind = "unknown_macro";

export interface GodLintFinding {
  station: string;
  macro: string;
  kind: GodLintKind;
  message: string;
}

export interface GodLintResult {
  findings: GodLintFinding[];
  summary: { macroRefs: number; findings: number };
}

export interface LintGodInput {
  godXml: string;
  /** known macro ids (reference-set macros ∪ the mod's own <macro name> defs). undefined/empty ⇒ skip. */
  knownMacros?: Set<string>;
}

const MAX_REFS = 20000;

function parseDoc(content: string | null): Document | null {
  if (!content || !content.trim()) return null;
  const attempt = (xml: string): Document | null => {
    try {
      const doc = new DOMParser({ onError: () => { /* tolerate */ } }).parseFromString(xml, "text/xml");
      return doc && doc.documentElement ? (doc as unknown as Document) : null;
    } catch { return null; }
  };
  return attempt(content) || attempt(`<__wrap>${content}</__wrap>`);
}

/** Nearest enclosing <station id="…"> for context (walk up the ancestor chain). */
function enclosingStationId(el: Element | null): string {
  let n: any = el;
  while (n && n.nodeType === 1) {
    if ((n.tagName || n.nodeName) === "station") {
      const id = n.getAttribute && n.getAttribute("id");
      if (id) return id;
    }
    n = n.parentNode;
  }
  return "(station)";
}

export function lintGodMacros(input: LintGodInput): GodLintResult {
  const { godXml, knownMacros } = input;
  const findings: GodLintFinding[] = [];
  const doc = parseDoc(godXml);
  let macroRefs = 0;
  if (!doc) return { findings, summary: { macroRefs: 0, findings: 0 } };

  // Empty/absent known set ⇒ skip (object index not built) — never flag a real macro as unknown.
  const known = knownMacros && knownMacros.size ? new Set([...knownMacros].map(m => m.toLowerCase())) : undefined;
  if (!known) return { findings, summary: { macroRefs: 0, findings: 0 } };

  const all = doc.getElementsByTagName("*");
  const seen = new Set<string>();
  for (let i = 0; i < all.length && macroRefs < MAX_REFS; i++) {
    const macro = all[i].getAttribute("macro");
    if (!macro) continue;
    macroRefs++;
    if (known.has(macro.toLowerCase())) continue;
    const key = `${(all[i].tagName || all[i].nodeName)}|${macro}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      station: enclosingStationId(all[i]),
      macro,
      kind: "unknown_macro",
      message: `god.xml references macro "${macro}" (in <${(all[i].tagName || all[i].nodeName)}>), which is not a known sector/zone/station macro — check the id, or make sure the macro that defines it is present. A missing macro means the station silently won't spawn.`,
    });
  }
  return { findings, summary: { macroRefs, findings: findings.length } };
}

/* ------------------------------------------------------------------ *
 * Oracle — synthetic fixtures. Pure.
 * ------------------------------------------------------------------ */

export function runGodLintSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  const known = new Set(["cluster_01_sector001_macro", "xu_ep2_universe_macro", "zone001_cluster_19_sector001_macro"]);

  // Clean: all macros resolve → 0.
  const clean = `<?xml version="1.0"?><god><stations><station id="s1"><location class="sector" macro="cluster_01_sector001_macro"/></station></stations></god>`;
  ok("clean_zero", lintGodMacros({ godXml: clean, knownMacros: known }).findings.length === 0);

  // Unknown macro → flagged, with station context.
  const bad = `<god><stations><station id="mymod_st"><location class="sector" macro="typoed_sector_macro"/></station></stations></god>`;
  const r = lintGodMacros({ godXml: bad, knownMacros: known });
  ok("unknown_macro_flagged", r.findings.length === 1 && r.findings[0].macro === "typoed_sector_macro");
  ok("station_context", r.findings[0].station === "mymod_st", r.findings[0].station);

  // Empty/absent known set ⇒ skip entirely (object index not built) — never flag.
  ok("empty_known_skips", lintGodMacros({ godXml: bad, knownMacros: new Set() }).findings.length === 0);
  ok("absent_known_skips", lintGodMacros({ godXml: bad }).findings.length === 0);

  // Comment safety: a bad macro inside a comment is not flagged.
  const commented = `<god><stations><!--<location macro="typoed"/>--><station id="s"><location macro="xu_ep2_universe_macro"/></station></stations></god>`;
  ok("comment_safe", lintGodMacros({ godXml: commented, knownMacros: known }).findings.length === 0);

  // De-dupe: the same bad macro on many locations reports once per (tag,macro).
  const dup = `<god><stations><station id="a"><location macro="badmac"/></station><station id="b"><location macro="badmac"/></station></stations></god>`;
  ok("deduped", lintGodMacros({ godXml: dup, knownMacros: known }).findings.length === 1);

  // Robustness.
  ok("empty_safe", lintGodMacros({ godXml: "", knownMacros: known }).findings.length === 0);
  ok("malformed_safe", lintGodMacros({ godXml: "<god><stations><station id=", knownMacros: known }).summary.macroRefs >= 0);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
