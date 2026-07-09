/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NPC Identity Probe — agent-only legacy (audit A6, 2026-07-09). The UI panel was
 * removed by Ken ("not supposed to be baked into the program"); the deterministic
 * engine (probe-log parsing, streamed save-candidate extraction, correlation verdicts)
 * is preserved here as a self-contained module so it no longer bloats server.ts.
 * Extracted VERBATIM from server.ts; deps injected to avoid circular imports.
 */

import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import type { Express } from "express";
import { resolveXsdConfig } from "../lib/xsdParser";

export interface NpcProbeDeps {
  findDebugLogCandidates: () => string[];
  readTail: (filePath: string, maxBytes: number) => string;
  errorMessage: (e: unknown) => string;
}

export function registerNpcIdentityProbeRoutes(app: Express, deps: NpcProbeDeps): void {
  const { findDebugLogCandidates, readTail, errorMessage } = deps;

type NpcProbeReading = {
  raw: string;
  idcode: string;
  name: string;
  owner: string;
  lineNumber: number;
  line: string;
  sourcePath?: string;
  timestamp?: string;
};

type NpcSaveCandidate = {
  candidateId: string;
  explicitId: boolean;
  tag: string;
  name: string;
  owner: string;
  role?: string;
  assignment?: string;
  ship?: string;
  station?: string;
  sector?: string;
  skills?: Record<string, string>;
  fields: Record<string, string>;
  rawPath: string;
  context: string;
  sourceOffset: number;
  score?: number;
  scoreReasons?: string[];
};

type NpcCandidateMatch = {
  candidateId: string;
  beforeCandidate?: NpcSaveCandidate;
  afterCandidate?: NpcSaveCandidate;
  score: number;
  reasons: string[];
};

const NPC_PROBE_CONFIDENCE_THRESHOLD = 0.75;
const NPC_NEAR_TIE_DELTA = 0.05;
const A3B_PROBE_RE = /A3b probe\s*=>\s*raw=([^\s]+)\s+idcode=([^\s]*)\s+name=(.*?)\s+owner=([^\s]*)/i;

function normalizeProbeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseNpcProbeLines(text: string, options: { targetName?: string; limit?: number; sourcePath?: string } = {}): NpcProbeReading[] {
  const target = normalizeProbeText(options.targetName);
  const readings: NpcProbeReading[] = [];
  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(A3B_PROBE_RE);
    if (!match) continue;
    const reading: NpcProbeReading = {
      raw: match[1] || "",
      idcode: match[2] || "",
      name: (match[3] || "").trim(),
      owner: match[4] || "",
      lineNumber: i + 1,
      line,
      sourcePath: options.sourcePath,
      timestamp: line.match(/^\s*(?:\[[^\]]+\]\s*)?(\d+(?:\.\d+)?|\d{1,2}:\d{2}:\d{2})/)?.[1]
    };
    if (target && !normalizeProbeText(reading.name).includes(target)) continue;
    readings.push(reading);
  }
  const limit = Math.max(0, Math.min(Number(options.limit || readings.length) || readings.length, 500));
  return limit > 0 ? readings.slice(-limit) : readings;
}

function resolveNpcProbeInputPath(input: unknown, purpose: "log" | "save"): string {
  const raw = String(input || "").trim();
  if (!raw) throw new Error(`${purpose}Path is required.`);
  const candidates: string[] = [];
  if (path.isAbsolute(raw)) candidates.push(path.normalize(raw));
  candidates.push(path.resolve(process.cwd(), raw));
  const resolved = resolveXsdConfig();
  if (resolved.modWorkspacePath) candidates.push(path.resolve(resolved.modWorkspacePath, raw));
  if (resolved.filesystemPath) candidates.push(path.resolve(resolved.filesystemPath, raw));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`No readable ${purpose} file found for: ${raw}`);
}

function parseNpcProbeLogFromFile(inputPath: unknown, targetName?: string, limit?: number): { readings: NpcProbeReading[]; sourcePath: string; bytesRead: number } {
  let selected = "";
  if (inputPath) {
    selected = resolveNpcProbeInputPath(inputPath, "log");
  } else {
    selected = findDebugLogCandidates().find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || "";
  }
  if (!selected) return { readings: [], sourcePath: "", bytesRead: 0 };
  const stat = fs.statSync(selected);
  const tail = readTail(selected, 1024 * 1024);
  return {
    readings: parseNpcProbeLines(tail, { targetName, limit, sourcePath: selected }),
    sourcePath: selected,
    bytesRead: Math.min(stat.size, 1024 * 1024)
  };
}

// Real X4 saves decompress to XML far larger than Node's max string length (~512MB), so a
// whole-file `.toString()` overflowed ("Cannot create a string longer than 0x1fffffe8 characters").
// Keep the decompressed BUFFER and let the scanner stringify only bounded windows around hits.
const NPC_SAVE_SCAN_SLICE = 32 * 1024 * 1024;  // 32MB per stringified slice — safely under the 512MB string cap
const NPC_SAVE_SCAN_OVERLAP = 64 * 1024;       // 64KB context margin: covers the 16KB back-scan + a name spanning a slice boundary

function readNpcSaveBuffer(savePathInput: unknown): { savePath: string; decoded: Buffer; gzipped: boolean; bytesRead: number; warnings: string[] } {
  const savePath = resolveNpcProbeInputPath(savePathInput, "save");
  const bytes = fs.readFileSync(savePath);
  const gzipped = savePath.toLowerCase().endsWith(".gz") || bytes.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]));
  const warnings: string[] = [];
  let decoded: Buffer;
  try {
    decoded = gzipped ? zlib.gunzipSync(bytes) : bytes;
  } catch (error) {
    throw new Error(`Failed to decompress save file: ${error?.message || error}`);
  }
  if (decoded.length > 300 * 1024 * 1024) {
    warnings.push(`Large decompressed save (${decoded.length} bytes); scanning in bounded ${NPC_SAVE_SCAN_SLICE}-byte windows.`);
  }
  return { savePath, decoded, gzipped, bytesRead: bytes.length, warnings };
}

function parseXmlishAttributes(openTag: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const attrRe = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(openTag))) {
    fields[match[1]] = match[2] ?? match[3] ?? "";
  }
  return fields;
}

function findClosestXmlOpenTag(text: string, offset: number): { tag: string; openTag: string; fields: Record<string, string>; start: number } {
  const openStart = text.lastIndexOf("<", offset);
  const openEnd = text.indexOf(">", offset);
  if (openStart >= 0 && openEnd > offset && openEnd - openStart < 4000) {
    const openTag = text.slice(openStart, openEnd + 1);
    const current = openTag.match(/^<([A-Za-z_][\w:.-]*)\b[^<>]*>$/);
    if (current && !openTag.startsWith("</") && !openTag.startsWith("<?") && !openTag.startsWith("<!--")) {
      return { tag: current[1], openTag, fields: parseXmlishAttributes(openTag), start: openStart };
    }
  }
  const start = Math.max(0, offset - 16000);
  const prefix = text.slice(start, offset);
  const tagMatches = Array.from(prefix.matchAll(/<([A-Za-z_][\w:.-]*)\b[^<>]*>/g));
  for (let i = tagMatches.length - 1; i >= 0; i--) {
    const match = tagMatches[i];
    const tag = match[1];
    if (/^(component|person|character|npc|entity|crew|pilot|marine|manager|employee|connection)$/i.test(tag)) {
      const openTag = match[0];
      return { tag, openTag, fields: parseXmlishAttributes(openTag), start: start + (match.index || 0) };
    }
  }
  const fallback = tagMatches[tagMatches.length - 1];
  if (fallback) {
    return { tag: fallback[1], openTag: fallback[0], fields: parseXmlishAttributes(fallback[0]), start: start + (fallback.index || 0) };
  }
  return { tag: "context", openTag: "", fields: {}, start: offset };
}

function extractNamedField(context: string, fields: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const direct = fields[name] ?? fields[name.toLowerCase()] ?? fields[name.toUpperCase()];
    if (direct) return String(direct);
  }
  for (const name of names) {
    const attr = context.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
    if (attr) return attr;
    const tag = context.match(new RegExp(`<${name}\\b[^>]*>([^<]+)</${name}>`, "i"))?.[1];
    if (tag) return tag.trim();
  }
  return "";
}

function extractSkillFields(context: string): Record<string, string> {
  const skills: Record<string, string> = {};
  const skillRe = /\b(boarding|engineering|management|morale|piloting|combat|leadership|navigation)\b\s*=\s*["']?([\w.+-]+)["']?/gi;
  let match: RegExpExecArray | null;
  while ((match = skillRe.exec(context))) skills[match[1].toLowerCase()] = match[2];
  return skills;
}

function explicitCandidateId(fields: Record<string, string>): string {
  const keys = ["id", "idcode", "code", "uniqueid", "uid", "ref", "component", "macro"];
  for (const key of keys) {
    if (fields[key]) return fields[key];
  }
  return "";
}

function makeNpcSaveCandidate(text: string, offset: number, targetName?: string): NpcSaveCandidate {
  const closest = findClosestXmlOpenTag(text, offset);
  const start = Math.max(0, Math.min(closest.start, offset) - 3000);
  const end = Math.min(text.length, offset + 3000);
  const context = text.slice(start, end);
  const fields = { ...parseXmlishAttributes(context), ...closest.fields };
  const explicitId = explicitCandidateId(fields);
  const name = extractNamedField(context, fields, ["name", "knownname", "firstname", "lastname"]) || String(targetName || "");
  const owner = extractNamedField(context, fields, ["owner", "faction", "race"]);
  const role = extractNamedField(context, fields, ["role", "type"]);
  const assignment = extractNamedField(context, fields, ["assignment", "task"]);
  const ship = extractNamedField(context, fields, ["ship", "shipid", "commander", "container"]);
  const station = extractNamedField(context, fields, ["station", "stationid"]);
  const sector = extractNamedField(context, fields, ["sector", "zone", "location"]);
  const fallbackId = `${closest.tag}@${offset}`;
  return {
    candidateId: explicitId || fallbackId,
    explicitId: Boolean(explicitId),
    tag: closest.tag,
    name,
    owner,
    role,
    assignment,
    ship,
    station,
    sector,
    skills: extractSkillFields(context),
    fields,
    rawPath: `${closest.tag}@${offset}`,
    context: context.slice(0, 2500),
    sourceOffset: offset
  };
}

function parseNpcSaveCandidatesFromBuffer(decoded: Buffer, targetName?: string): { candidates: NpcSaveCandidate[]; warnings: string[] } {
  const warnings: string[] = [];
  const candidates: NpcSaveCandidate[] = [];
  const seen = new Set<string>();
  const total = decoded.length;
  const hasTarget = Boolean(targetName && targetName.trim());
  const cap = hasTarget ? 200 : 100;
  const capWarning = hasTarget
    ? "Candidate scan stopped at 200 name hits."
    : "No targetName supplied; candidate scan capped at 100 identity-like tags.";
  const makeRe = () => hasTarget
    ? new RegExp(targetName!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
    : /<(person|character|npc|crew|pilot|marine|manager)\b[^>]*>/gi;
  // Scan the decompressed BUFFER in bounded slices, stringifying only one slice (+overlap) at a
  // time so we never exceed Node's max string length on a real (multi-hundred-MB) save XML.
  let base = 0;
  let stopped = false;
  while (base < total && !stopped) {
    const sliceEnd = Math.min(total, base + NPC_SAVE_SCAN_SLICE);
    const winStart = Math.max(0, base - NPC_SAVE_SCAN_OVERLAP);
    const winEnd = Math.min(total, sliceEnd + NPC_SAVE_SCAN_OVERLAP);
    const window = decoded.toString("utf8", winStart, winEnd);
    const re = makeRe();
    let match: RegExpExecArray | null;
    while ((match = re.exec(window))) {
      const globalOffset = winStart + match.index;
      // Only emit hits anchored in THIS slice [base, sliceEnd); the overlap margins exist for
      // context/back-scan and are re-scanned by the adjacent slice, so this avoids double-counting.
      if (globalOffset < base || globalOffset >= sliceEnd) continue;
      const candidate = makeNpcSaveCandidate(window, match.index, targetName);
      // Relabel offset-derived fields to GLOBAL offsets so dedup keys + rawPath match whole-file semantics.
      const globalLabel = `${candidate.tag}@${globalOffset}`;
      if (!candidate.explicitId) candidate.candidateId = globalLabel;
      candidate.rawPath = globalLabel;
      candidate.sourceOffset = globalOffset;
      const key = `${candidate.candidateId}:${candidate.sourceOffset}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
      if (candidates.length >= cap) {
        warnings.push(capWarning);
        stopped = true;
        break;
      }
    }
    base = sliceEnd;
  }
  if (!candidates.length) warnings.push(targetName ? `No save candidate contained targetName "${targetName}".` : "No identity-like save candidates found.");
  return { candidates, warnings };
}

function parseNpcSaveFile(savePath: unknown, targetName?: string): { savePath: string; gzipped: boolean; bytesRead: number; candidates: NpcSaveCandidate[]; warnings: string[] } {
  const save = readNpcSaveBuffer(savePath);
  const parsed = parseNpcSaveCandidatesFromBuffer(save.decoded, targetName);
  return { savePath: save.savePath, gzipped: save.gzipped, bytesRead: save.bytesRead, candidates: parsed.candidates, warnings: [...save.warnings, ...parsed.warnings] };
}

function scoreNpcCandidate(candidate: NpcSaveCandidate, reading?: NpcProbeReading, targetName?: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const target = normalizeProbeText(targetName || reading?.name);
  if (target && normalizeProbeText(candidate.name) === target) { score += 0.35; reasons.push("exact name match"); }
  else if (target && normalizeProbeText(candidate.context).includes(target)) { score += 0.2; reasons.push("target name present in candidate context"); }
  const owner = normalizeProbeText(reading?.owner);
  const candidateOwner = normalizeProbeText(candidate.owner);
  if (owner && candidateOwner && owner === candidateOwner) { score += 0.2; reasons.push("owner/faction match"); }
  else if (owner && normalizeProbeText(candidate.context).includes(owner)) { score += 0.1; reasons.push("owner present in context"); }
  if (reading?.idcode && normalizeProbeText(candidate.context).includes(normalizeProbeText(reading.idcode))) { score += 0.2; reasons.push("runtime idcode present in save context"); }
  if (candidate.role || candidate.assignment || candidate.ship || candidate.station || candidate.sector) { score += 0.05; reasons.push("assignment/location fields present"); }
  if (candidate.skills && Object.keys(candidate.skills).length > 0) { score += 0.05; reasons.push("skill vector fields present"); }
  if (!candidate.explicitId) { score -= 0.15; reasons.push("no explicit save-side id"); }
  return { score: Math.max(0, Math.min(1, score)), reasons };
}

function correlateNpcIdentity(input: { beforeLogReading?: NpcProbeReading; afterLogReading?: NpcProbeReading; beforeSavePath: string; afterSavePath: string; targetName?: string; threshold?: number }) {
  const threshold = Number(input.threshold || NPC_PROBE_CONFIDENCE_THRESHOLD);
  const beforeReading = input.beforeLogReading;
  const afterReading = input.afterLogReading;
  const targetName = input.targetName || beforeReading?.name || afterReading?.name || "";
  const beforeSave = parseNpcSaveFile(input.beforeSavePath, targetName);
  const afterSave = parseNpcSaveFile(input.afterSavePath, targetName);
  const warnings = [...beforeSave.warnings.map(w => `before: ${w}`), ...afterSave.warnings.map(w => `after: ${w}`)];
  const beforeById = new Map(beforeSave.candidates.filter(c => c.explicitId).map(c => [c.candidateId, c]));
  const afterById = new Map(afterSave.candidates.filter(c => c.explicitId).map(c => [c.candidateId, c]));
  const ids = Array.from(new Set([...beforeById.keys(), ...afterById.keys()]));
  const matches: NpcCandidateMatch[] = [];

  for (const id of ids) {
    const beforeCandidate = beforeById.get(id);
    const afterCandidate = afterById.get(id);
    const beforeScore = beforeCandidate ? scoreNpcCandidate(beforeCandidate, beforeReading, targetName) : { score: 0, reasons: ["missing before candidate"] };
    const afterScore = afterCandidate ? scoreNpcCandidate(afterCandidate, afterReading, targetName) : { score: 0, reasons: ["missing after candidate"] };
    const stableBonus = beforeCandidate && afterCandidate ? 0.25 : 0;
    const score = Math.min(1, ((beforeScore.score + afterScore.score) / 2) + stableBonus);
    matches.push({
      candidateId: id,
      beforeCandidate,
      afterCandidate,
      score,
      reasons: Array.from(new Set([...beforeScore.reasons, ...afterScore.reasons, stableBonus ? "same explicit save id appears before and after" : "save id not stable across snapshots"]))
    });
  }

  // If there are no explicit ids, still expose the strongest contextual candidates as failed evidence.
  if (!matches.length) {
    const contextual = [...beforeSave.candidates, ...afterSave.candidates]
      .map(candidate => {
        const scored = scoreNpcCandidate(candidate, candidate.rawPath.startsWith("before") ? beforeReading : afterReading, targetName);
        return { candidateId: candidate.candidateId, beforeCandidate: beforeSave.candidates.includes(candidate) ? candidate : undefined, afterCandidate: afterSave.candidates.includes(candidate) ? candidate : undefined, score: scored.score, reasons: scored.reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    matches.push(...contextual);
  }

  matches.sort((a, b) => b.score - a.score);
  const top = matches[0];
  const second = matches[1];
  const runtimeIdStable = Boolean(beforeReading?.raw && afterReading?.raw && beforeReading.raw === afterReading.raw);
  const idcodePresent = Boolean(beforeReading?.idcode || afterReading?.idcode);
  const stableSaveIdFound = Boolean(top?.beforeCandidate?.explicitId && top?.afterCandidate?.explicitId && top.beforeCandidate.candidateId === top.afterCandidate.candidateId);
  const nearTie = Boolean(top && second && top.score - second.score <= NPC_NEAR_TIE_DELTA);
  if (nearTie) warnings.push(`Ambiguous candidate tie: top ${top?.candidateId}=${top?.score.toFixed(2)}, second ${second?.candidateId}=${second?.score.toFixed(2)}.`);
  const runtimeToSaveMappingPossible = Boolean(top && top.score >= threshold && stableSaveIdFound && !nearTie);
  const recommendation = runtimeToSaveMappingPossible
    ? "Use save XML id"
    : nearTie
      ? "Ambiguous, needs better test subject"
      : runtimeIdStable
        ? "Runtime id only, session-bound"
        : "No reliable generic NPC identity";

  return {
    runtimeIdStable,
    idcodePresent,
    stableSaveIdFound,
    runtimeToSaveMappingPossible,
    mappingConfidence: top?.score || 0,
    threshold,
    recommendation,
    beforeLogReading: beforeReading,
    afterLogReading: afterReading,
    beforeSave: { path: beforeSave.savePath, gzipped: beforeSave.gzipped, candidates: beforeSave.candidates.length },
    afterSave: { path: afterSave.savePath, gzipped: afterSave.gzipped, candidates: afterSave.candidates.length },
    candidateMatches: matches.slice(0, 12),
    warnings
  };
}

function runNpcIdentityProbeSelftest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "x4-forge-npc-probe-"));
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  try {
    const logBefore = `[=ERROR=] 1.0 A3b probe => raw=458069 idcode= name=Manda Smitt owner=argon`;
    const logAfter = `[=ERROR=] 2.0 A3b probe => raw=2059935 idcode= name=Manda Smitt owner=argon`;
    const readings = parseNpcProbeLines(`${logBefore}\n${logAfter}`, { targetName: "Manda Smitt" });
    checks.push({ name: "parse A3b runtime probe lines", pass: readings.length === 2 && readings[0].raw === "458069" && readings[1].owner === "argon", detail: readings });

    const saveBefore = `<save><characters><character id="char-manda-001" name="Manda Smitt" owner="argon" role="service_crew" ship="Vigilant"><skills engineering="2" morale="3"/></character></characters></save>`;
    const saveAfter = `<save><characters><character id="char-manda-001" name="Manda Smitt" owner="argon" role="service_crew" ship="Vigilant"><skills engineering="2" morale="3"/></character></characters></save>`;
    const beforePath = path.join(tmpDir, "before.xml");
    const afterPath = path.join(tmpDir, "after.xml.gz");
    fs.writeFileSync(beforePath, saveBefore, "utf8");
    fs.writeFileSync(afterPath, zlib.gzipSync(Buffer.from(saveAfter, "utf8")));
    const gzParsed = parseNpcSaveFile(afterPath, "Manda Smitt");
    checks.push({ name: "parse gzip save candidates", pass: gzParsed.gzipped && gzParsed.candidates[0]?.candidateId === "char-manda-001", detail: gzParsed.candidates[0] });

    const correlated = correlateNpcIdentity({ beforeLogReading: readings[0], afterLogReading: readings[1], beforeSavePath: beforePath, afterSavePath: afterPath, targetName: "Manda Smitt" });
    checks.push({ name: "stable save id maps runtime-changing NPC", pass: correlated.runtimeIdStable === false && correlated.stableSaveIdFound && correlated.runtimeToSaveMappingPossible && correlated.recommendation === "Use save XML id", detail: correlated });

    const noCandidatePath = path.join(tmpDir, "empty.xml");
    fs.writeFileSync(noCandidatePath, `<save><characters><character id="other" name="Other Person" owner="argon"/></characters></save>`, "utf8");
    const missing = correlateNpcIdentity({ beforeLogReading: readings[0], afterLogReading: readings[1], beforeSavePath: noCandidatePath, afterSavePath: noCandidatePath, targetName: "Manda Smitt" });
    checks.push({ name: "no save candidate is not success", pass: !missing.runtimeToSaveMappingPossible && missing.recommendation === "No reliable generic NPC identity", detail: missing });

    const dupA = path.join(tmpDir, "dup-a.xml");
    const dupB = path.join(tmpDir, "dup-b.xml");
    const dupXml = `<save><character id="dup-1" name="Manda Smitt" owner="argon"/><character id="dup-2" name="Manda Smitt" owner="argon"/></save>`;
    fs.writeFileSync(dupA, dupXml, "utf8");
    fs.writeFileSync(dupB, dupXml, "utf8");
    const dup = correlateNpcIdentity({ beforeLogReading: readings[0], afterLogReading: readings[1], beforeSavePath: dupA, afterSavePath: dupB, targetName: "Manda Smitt" });
    checks.push({ name: "duplicate same-name candidates produce ambiguity", pass: !dup.runtimeToSaveMappingPossible && dup.recommendation === "Ambiguous, needs better test subject", detail: dup });

    const badGz = path.join(tmpDir, "bad.xml.gz");
    fs.writeFileSync(badGz, "not a gzip", "utf8");
    let badStructured = false;
    try { parseNpcSaveFile(badGz, "Manda Smitt"); } catch (error) { badStructured = /decompress/i.test(String(error?.message || error)); }
    checks.push({ name: "malformed gzip returns structured parse error", pass: badStructured });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort fixture cleanup */ }
  }
  return { allPassed: checks.every(c => c.pass), passed: checks.filter(c => c.pass).length, total: checks.length, checks };
}

app.post("/api/agent/npc-identity-probe/parse-log", (req, res) => {
  try {
    const result = parseNpcProbeLogFromFile(req.body?.logPath, req.body?.targetName, req.body?.limit);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "npc probe log parse failed" });
  }
});

app.post("/api/agent/npc-identity-probe/parse-save", (req, res) => {
  try {
    const result = parseNpcSaveFile(req.body?.savePath, req.body?.targetName);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "npc save parse failed" });
  }
});

app.post("/api/agent/npc-identity-probe/correlate", (req, res) => {
  try {
    const result = correlateNpcIdentity({
      beforeLogReading: req.body?.beforeLogReading,
      afterLogReading: req.body?.afterLogReading,
      beforeSavePath: req.body?.beforeSavePath,
      afterSavePath: req.body?.afterSavePath,
      targetName: req.body?.targetName,
      threshold: req.body?.threshold
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "npc identity correlation failed" });
  }
});

app.get("/api/agent/npc-identity-probe/selftest", (req, res) => {
  try {
    return res.json(runNpcIdentityProbeSelftest());
  } catch (error) {
    return res.status(500).json({ allPassed: false, error: error?.message || "npc identity probe selftest failed" });
  }
});
}
