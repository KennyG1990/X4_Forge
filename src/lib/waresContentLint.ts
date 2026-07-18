/**
 * waresContentLint.ts — B61 phase 3 (2026-07-17): corpus-grounded content lint for wares.xml.
 *
 * Like jobs (B61), the game ships NO content XSD for wares.xml (schemaRouting maps it → null; only the
 * <diff> wrapper validates — B46P2). A semantically-wrong ware (invented transport type, a typo'd tag or
 * group, or a nonsensical price where min > max) compiles clean and misbehaves only in-game. This LEARNS
 * the legal closed-set vocabulary from vanilla wares.xml and checks a mod's wares against it, plus a
 * deterministic price-ordering sanity check. Advisory only.
 *
 * Mirrors jobsContentLint exactly (pure + vocabulary-injected; DOM-parsed = comment-safe; the server
 * wires learnWaresVocabulary() to the real wares.xml). Cry-wolf defence: only closed-set attributes are
 * checked (transport/group/individual tag tokens) + a pure arithmetic price check; unknown values are a
 * hint, not an assertion; the acceptance bar is that ALL vanilla wares lint clean.
 *
 * A `<ware>` appears twice in the schema: as a DEFINITION (`<ware id=... transport=...>`) and as a
 * production INPUT reference (`<ware ware="energycells" amount="50"/>`). Only definitions (those with an
 * `id`) are linted — the references are left alone.
 */

import { DOMParser } from "@xmldom/xmldom";

export interface WaresVocabulary {
  /** ware/@transport values (container, inventory, equipment, ship, ...) */
  transports: Set<string>;
  /** individual whitespace-split tokens from ware/@tags (economy, equipment, weapon, ...) */
  tags: Set<string>;
  /** ware/@group values (hightech, shiptech, refined, ...) */
  groups: Set<string>;
}

export type WareLintKind = "unknown_transport" | "unknown_tag" | "unknown_group" | "price_order";

export interface WareLintFinding {
  wareId: string;
  kind: WareLintKind;
  value: string;
  message: string;
}

export interface WaresLintResult {
  findings: WareLintFinding[];
  summary: { wares: number; findings: number; byKind: Record<WareLintKind, number> };
}

export interface LintWaresInput {
  waresXml: string;
  vocabulary: WaresVocabulary;
}

const MAX_WARES = 20000; // vanilla ~1600; runaway backstop.

function parseDoc(content: string | null): Document | null {
  if (!content || !content.trim()) return null;
  const attempt = (xml: string): Document | null => {
    try {
      const doc = new DOMParser({ onError: () => { /* tolerate recoverable parse noise */ } })
        .parseFromString(xml, "text/xml");
      return doc && doc.documentElement ? (doc as unknown as Document) : null;
    } catch {
      return null;
    }
  };
  return attempt(content) || attempt(`<__wrap>${content}</__wrap>`);
}

/** Only <ware> elements that DEFINE a ware (have an id) — not production input references (ware=…). */
function wareDefinitions(doc: Document): Element[] {
  const out: Element[] = [];
  const all = doc.getElementsByTagName("ware");
  for (let i = 0; i < all.length; i++) {
    if (all[i].getAttribute("id")) out.push(all[i]);
  }
  return out;
}

export function learnWaresVocabulary(vanillaWaresXml: string): WaresVocabulary {
  const vocab: WaresVocabulary = { transports: new Set(), tags: new Set(), groups: new Set() };
  const doc = parseDoc(vanillaWaresXml);
  if (!doc) return vocab;
  for (const w of wareDefinitions(doc)) {
    const t = w.getAttribute("transport"); if (t) vocab.transports.add(t);
    const g = w.getAttribute("group"); if (g) vocab.groups.add(g);
    const tags = w.getAttribute("tags");
    if (tags) for (const tok of tags.split(/\s+/)) if (tok) vocab.tags.add(tok);
  }
  return vocab;
}

function emptyByKind(): Record<WareLintKind, number> {
  return { unknown_transport: 0, unknown_tag: 0, unknown_group: 0, price_order: 0 };
}

export function lintWaresContent(input: LintWaresInput): WaresLintResult {
  const { waresXml, vocabulary } = input;
  const findings: WareLintFinding[] = [];
  const byKind = emptyByKind();
  const doc = parseDoc(waresXml);
  let count = 0;
  if (!doc) return { findings, summary: { wares: 0, findings: 0, byKind } };

  const add = (wareId: string, kind: WareLintKind, value: string, message: string) => {
    findings.push({ wareId, kind, value, message }); byKind[kind]++;
  };

  const defs = wareDefinitions(doc);
  for (let i = 0; i < defs.length && count < MAX_WARES; i++) {
    const w = defs[i];
    count++;
    const wareId = w.getAttribute("id") || "(no id)";

    const transport = w.getAttribute("transport");
    if (transport && !vocabulary.transports.has(transport)) {
      add(wareId, "unknown_transport", transport,
        `transport="${transport}" is not a known vanilla ware transport type (${[...vocabulary.transports].sort().join(", ")}). Check for a typo.`);
    }

    const group = w.getAttribute("group");
    if (group && !vocabulary.groups.has(group)) {
      add(wareId, "unknown_group", group,
        `group="${group}" is not a known vanilla ware group. Check for a typo — or ignore if your mod defines it.`);
    }

    const tags = w.getAttribute("tags");
    if (tags) {
      for (const tok of tags.split(/\s+/)) {
        if (tok && !vocabulary.tags.has(tok)) {
          add(wareId, "unknown_tag", tok,
            `tag "${tok}" is not a known vanilla ware tag. Check for a typo — or ignore if it is intentional.`);
        }
      }
    }

    // Price ordering — deterministic, no vocabulary needed. Only when all three are present numbers.
    const priceEls = w.getElementsByTagName("price");
    if (priceEls.length) {
      const p = priceEls[0];
      const min = Number(p.getAttribute("min"));
      const avg = Number(p.getAttribute("average"));
      const max = Number(p.getAttribute("max"));
      if (p.getAttribute("min") && p.getAttribute("average") && p.getAttribute("max")
          && Number.isFinite(min) && Number.isFinite(avg) && Number.isFinite(max)
          && !(min <= avg && avg <= max)) {
        add(wareId, "price_order", `${min}/${avg}/${max}`,
          `price min/average/max (${min}/${avg}/${max}) is out of order — it must satisfy min ≤ average ≤ max, or the economy math misbehaves.`);
      }
    }
  }

  return { findings, summary: { wares: count, findings: findings.length, byKind } };
}

/* ------------------------------------------------------------------ *
 * Oracle — synthetic fixtures using REAL vanilla vocabulary. Pure.
 * ------------------------------------------------------------------ */

export function runWaresContentLintSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  const vanilla = `<?xml version="1.0"?><wares>
    <ware id="energycells" name="EC" group="energy" transport="container" volume="1" tags="container economy">
      <price min="10" average="16" max="22"/>
    </ware>
    <ware id="advancedelectronics" group="shiptech" transport="container" volume="30" tags="container economy stationbuilding">
      <price min="710" average="1014" max="1318"/>
      <production time="720" amount="54"><primary><ware ware="energycells" amount="60"/></primary></production>
    </ware>
  </wares>`;
  const vocab = learnWaresVocabulary(vanilla);
  ok("learned_transports", vocab.transports.has("container"), [...vocab.transports].join(","));
  ok("learned_tags", vocab.tags.has("economy") && vocab.tags.has("stationbuilding"), [...vocab.tags].join(","));
  ok("learned_groups", vocab.groups.has("energy") && vocab.groups.has("shiptech"), [...vocab.groups].join(","));

  // Self-consistency: learn X, lint X → 0 findings (the cry-wolf bar in miniature).
  const clean = lintWaresContent({ waresXml: vanilla, vocabulary: vocab });
  ok("corpus_clean_self", clean.findings.length === 0 && clean.summary.wares === 2, JSON.stringify(clean.summary));
  // The nested production <ware ware="energycells"> reference must NOT be counted as a definition.
  ok("production_refs_not_counted", clean.summary.wares === 2);

  // Negative: a mod ware with a bad transport, bad group, bad tag, and inverted price.
  const bad = `<?xml version="1.0"?><wares>
    <ware id="mymod_thing" group="madeupgroup" transport="teleporter" tags="container invalidtag">
      <price min="500" average="100" max="900"/>
    </ware>
  </wares>`;
  const r = lintWaresContent({ waresXml: bad, vocabulary: vocab });
  ok("unknown_transport_flagged", r.summary.byKind.unknown_transport === 1 && r.findings.some(f => f.value === "teleporter"));
  ok("unknown_group_flagged", r.summary.byKind.unknown_group === 1 && r.findings.some(f => f.value === "madeupgroup"));
  ok("unknown_tag_flagged", r.summary.byKind.unknown_tag === 1 && r.findings.some(f => f.value === "invalidtag"));
  ok("known_tag_not_flagged", !r.findings.some(f => f.value === "container"));
  ok("price_order_flagged", r.summary.byKind.price_order === 1 && r.findings.some(f => f.kind === "price_order"));

  // A well-ordered price is NOT flagged.
  const okPrice = lintWaresContent({ waresXml: `<wares><ware id="x" transport="container" tags="economy"><price min="1" average="2" max="3"/></ware></wares>`, vocabulary: vocab });
  ok("good_price_not_flagged", okPrice.summary.byKind.price_order === 0);

  // DIFF wrapper: a ware added via <diff><add sel="/wares"> is found and linted.
  const diff = `<?xml version="1.0"?><diff><add sel="/wares"><ware id="dw" transport="warpgate" tags="economy"><price min="1" average="2" max="3"/></ware></add></diff>`;
  const dr = lintWaresContent({ waresXml: diff, vocabulary: vocab });
  ok("diff_wrapper_found", dr.summary.wares === 1 && dr.findings.some(f => f.value === "warpgate"));

  // Robustness.
  ok("empty_safe", lintWaresContent({ waresXml: "", vocabulary: vocab }).findings.length === 0);
  ok("malformed_safe", lintWaresContent({ waresXml: "<wares><ware id='x' transport=", vocabulary: vocab }).summary.wares >= 0);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
