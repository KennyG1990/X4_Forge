/**
 * factionsLint.ts — B63 / round-4 A1 (2026-07-18): factions.xml relations validation.
 *
 * libraries/factions.xml holds each faction's `<relations><relation faction="Y" relation="0.1"/></relations>`.
 * factions.xml IS schema-covered (factions.xsd), but the XSD does not check the two authoring hazards big
 * faction/overhaul mods hit (Unlocked/Reactive Factions, DeadAir): a relation VALUE out of the legal range,
 * and a relation pointing at a faction id that doesn't exist (typo / a faction the mod forgot to add).
 *
 * Corpus-grounded + cry-wolf-safe:
 *   - value bounds are [-1, 1] — verified: 0 vanilla relations fall outside it.
 *   - unknown-faction is only checked when a reference set of known faction ids is supplied (vanilla +
 *     installed mods, from getReferenceSets), unioned with the mod's OWN `<faction id>` defs — so a mod
 *     defining a new faction and referencing it never cries wolf, and neither does vanilla-faction reuse.
 * DOM-parsed (comment-safe). Advisory WARNING. Pure — the caller injects the known-faction set.
 */

import { DOMParser } from "@xmldom/xmldom";

export type FactionLintKind = "relation_out_of_range" | "unknown_relation_faction";

export interface FactionLintFinding {
  faction: string;
  target: string;
  value?: string;
  kind: FactionLintKind;
  message: string;
}

export interface FactionsLintResult {
  findings: FactionLintFinding[];
  summary: { relations: number; findings: number; byKind: Record<FactionLintKind, number> };
}

export interface LintFactionsInput {
  factionsXml: string;
  /** known faction ids (vanilla + installed, from reference sets). undefined ⇒ skip the faction-id check. */
  knownFactions?: Set<string>;
}

const MAX_RELATIONS = 20000;

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

export function lintFactionRelations(input: LintFactionsInput): FactionsLintResult {
  const { factionsXml, knownFactions } = input;
  const findings: FactionLintFinding[] = [];
  const byKind: Record<FactionLintKind, number> = { relation_out_of_range: 0, unknown_relation_faction: 0 };
  const doc = parseDoc(factionsXml);
  let relations = 0;
  if (!doc) return { findings, summary: { relations: 0, findings: 0, byKind } };

  // The known set = the injected reference-set factions PLUS every faction this file defines
  // (a mod that adds new factions and wires their relations must not cry wolf).
  // An EMPTY reference set (object index not built yet) is treated as ABSENT — skip the faction-id
  // check entirely rather than flag every real faction as "unknown" (cry-wolf caught in the live proof).
  const known = knownFactions && knownFactions.size ? new Set<string>([...knownFactions].map(f => f.toLowerCase())) : undefined;
  const factionEls = doc.getElementsByTagName("faction");
  if (known) {
    for (let i = 0; i < factionEls.length; i++) {
      const id = factionEls[i].getAttribute("id");
      if (id) { known.add(id.toLowerCase()); known.add(id.toLowerCase().replace(/^faction\./, "")); }
    }
  }

  const add = (faction: string, target: string, kind: FactionLintKind, message: string, value?: string) => {
    findings.push({ faction, target, kind, message, ...(value !== undefined ? { value } : {}) });
    byKind[kind]++;
  };

  for (let i = 0; i < factionEls.length && relations < MAX_RELATIONS; i++) {
    const fid = factionEls[i].getAttribute("id") || "(no id)";
    const rels = factionEls[i].getElementsByTagName("relation");
    for (let j = 0; j < rels.length && relations < MAX_RELATIONS; j++) {
      relations++;
      const target = rels[j].getAttribute("faction") || "";
      const raw = rels[j].getAttribute("relation");

      if (raw !== null && raw !== "") {
        const v = Number(raw);
        if (!Number.isFinite(v) || v < -1 || v > 1) {
          add(fid, target, "relation_out_of_range",
            `Relation value "${raw}" (faction ${fid} → ${target || "?"}) is outside the legal range −1 to 1 — the game clamps or ignores out-of-range relations.`, raw);
        }
      }
      if (known && target && !known.has(target.toLowerCase()) && !known.has(target.toLowerCase().replace(/^faction\./, ""))) {
        add(fid, target, "unknown_relation_faction",
          `Faction ${fid} declares a relation to "${target}", which is not a known faction — check the id, or make sure the faction that defines it is present.`);
      }
    }
  }

  return { findings, summary: { relations, findings: findings.length, byKind } };
}

/* ------------------------------------------------------------------ *
 * Oracle — synthetic fixtures using real vanilla shapes/ids. Pure.
 * ------------------------------------------------------------------ */

export function runFactionsLintSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  const known = new Set(["argon", "teladi", "paranid", "xenon"]);

  // Clean vanilla-shaped file → 0 findings (mirrors the corpus-clean bar).
  const clean = `<?xml version="1.0"?><factions>
    <faction id="argon"><relations><relation faction="teladi" relation="0.1"/><relation faction="xenon" relation="-1"/></relations></faction>
  </factions>`;
  const rc = lintFactionRelations({ factionsXml: clean, knownFactions: known });
  ok("clean_zero", rc.findings.length === 0 && rc.summary.relations === 2, JSON.stringify(rc.summary));

  // Out-of-range value (1.5) → flagged; in-range (-1, 1) → not.
  const oor = `<factions><faction id="argon"><relations><relation faction="teladi" relation="1.5"/><relation faction="paranid" relation="-1"/></relations></faction></factions>`;
  const ror = lintFactionRelations({ factionsXml: oor, knownFactions: known });
  ok("out_of_range_flagged", ror.summary.byKind.relation_out_of_range === 1 && ror.findings.some(f => f.value === "1.5"));
  ok("in_range_not_flagged", !ror.findings.some(f => f.value === "-1"));

  // Unknown relation-target faction → flagged (only with a reference set).
  const unk = `<factions><faction id="argon"><relations><relation faction="zenith" relation="0.1"/></relations></faction></factions>`;
  ok("unknown_faction_flagged", lintFactionRelations({ factionsXml: unk, knownFactions: known }).summary.byKind.unknown_relation_faction === 1);

  // Same file WITHOUT a reference set → faction-id check SKIPPED (never guess-flag).
  ok("no_refset_skips_faction_check", lintFactionRelations({ factionsXml: unk }).summary.byKind.unknown_relation_faction === 0);

  // An EMPTY reference set (object index not built) is treated as absent → skip, don't flag real factions.
  ok("empty_refset_skips_faction_check", lintFactionRelations({ factionsXml: unk, knownFactions: new Set() }).summary.byKind.unknown_relation_faction === 0);

  // A mod that DEFINES a new faction and references it → not flagged (own factions count as known).
  const ownDef = `<factions><faction id="mynewfaction"><relations/></faction><faction id="argon"><relations><relation faction="mynewfaction" relation="0.5"/></relations></faction></factions>`;
  ok("own_defined_faction_ok", lintFactionRelations({ factionsXml: ownDef, knownFactions: known }).summary.byKind.unknown_relation_faction === 0);

  // Comment safety: a bad relation inside a comment is not flagged.
  const commented = `<factions><faction id="argon"><relations><!--<relation faction="zenith" relation="9"/>--><relation faction="teladi" relation="0.1"/></relations></faction></factions>`;
  ok("comment_safe", lintFactionRelations({ factionsXml: commented, knownFactions: known }).findings.length === 0);

  // Robustness.
  ok("empty_safe", lintFactionRelations({ factionsXml: "", knownFactions: known }).findings.length === 0);
  ok("malformed_safe", lintFactionRelations({ factionsXml: "<factions><faction id=", knownFactions: known }).summary.relations >= 0);
  ok("non_numeric_value_flagged", lintFactionRelations({ factionsXml: `<factions><faction id="a"><relations><relation faction="argon" relation="hostile"/></relations></faction></factions>`, knownFactions: known }).summary.byKind.relation_out_of_range === 1);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
