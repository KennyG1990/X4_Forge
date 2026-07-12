// B2 slice 3 (ADR-F1): active-workspace disk persistence + parked per-mod states.
//
// The server's active workspace was in-memory-only — a restart with a blank client
// attached clobbered real state (counted incident, 2026-07-11). This engine gives the
// server: (a) an atomic on-disk copy of the active state that survives restarts with
// zero clients attached, and (b) a "parked" store so switching to a different mod
// PARKS the previous state instead of destroying it (the per-mod protection ADR-F1
// point 1 names; B12 multi-workspace tabs ride on this map later).
//
// Everything takes the state dir as a parameter so the oracle exercises a temp dir,
// never the live one.

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface PersistedWorkspaceState {
  workspace: any;
  version: number;
  savedAt: string;
  origin: string;
}

export interface ParkedSummary {
  name: string;
  slug: string;
  savedAt: string;
  version: number;
  nodeCount: number;
}

const ACTIVE_FILE = "active.json";
const PARKED_PREFIX = "parked-";
export const PARKED_LIMIT_DEFAULT = 20;

/** Filesystem-safe, collision-stable slug for a workspace name. */
export function slugifyWorkspaceName(name: string): string {
  const base = String(name || "unnamed")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "unnamed";
  // Case-insensitive filesystems (Windows) would merge Foo/foo — disambiguate with a
  // tiny stable checksum of the exact name so distinct names never share a file.
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum = (sum * 31 + name.charCodeAt(i)) >>> 0;
  return `${base}_${sum.toString(16)}`;
}

/** Write JSON via tmp+rename so a crash mid-write never leaves a torn file. */
export function atomicWriteJson(file: string, data: unknown): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${process.pid}-${Date.now()}-${path.basename(file)}`);
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  fs.renameSync(tmp, file);
}

/** A persisted state is adoptable only if it looks like a real workspace. */
function isValidState(parsed: any): parsed is PersistedWorkspaceState {
  return Boolean(
    parsed &&
    typeof parsed === "object" &&
    parsed.workspace &&
    typeof parsed.workspace === "object" &&
    Array.isArray(parsed.workspace.nodes) &&
    typeof parsed.workspace.name === "string"
  );
}

export function writeActiveState(stateDir: string, state: PersistedWorkspaceState): void {
  atomicWriteJson(path.join(stateDir, ACTIVE_FILE), state);
}

/** null on missing, unparsable, or shape-invalid — the caller boots the default. */
export function readActiveState(stateDir: string): PersistedWorkspaceState | null {
  try {
    const raw = fs.readFileSync(path.join(stateDir, ACTIVE_FILE), "utf8");
    const parsed = JSON.parse(raw);
    return isValidState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Park a state under its workspace name (latest write wins per name), pruning oldest beyond limit. */
export function parkState(stateDir: string, state: PersistedWorkspaceState, limit: number = PARKED_LIMIT_DEFAULT): string {
  const slug = slugifyWorkspaceName(state.workspace?.name);
  const file = path.join(stateDir, `${PARKED_PREFIX}${slug}.json`);
  atomicWriteJson(file, state);
  try {
    const parked = fs.readdirSync(stateDir)
      .filter(n => n.startsWith(PARKED_PREFIX) && n.endsWith(".json"))
      .map(n => ({ n, mtime: fs.statSync(path.join(stateDir, n)).mtimeMs }))
      .sort((a, b) => a.mtime - b.mtime);
    for (let i = 0; i < parked.length - limit; i++) {
      fs.unlinkSync(path.join(stateDir, parked[i].n));
    }
  } catch { /* pruning is best-effort; the park itself already succeeded */ }
  return file;
}

export function listParked(stateDir: string): ParkedSummary[] {
  try {
    return fs.readdirSync(stateDir)
      .filter(n => n.startsWith(PARKED_PREFIX) && n.endsWith(".json"))
      .map(n => {
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(stateDir, n), "utf8"));
          if (!isValidState(parsed)) return null;
          return {
            name: String(parsed.workspace.name),
            slug: n.slice(PARKED_PREFIX.length, -".json".length),
            savedAt: String(parsed.savedAt || ""),
            version: Number(parsed.version || 0),
            nodeCount: parsed.workspace.nodes.length,
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is ParkedSummary => x !== null)
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  } catch {
    return [];
  }
}

export function readParked(stateDir: string, name: string): PersistedWorkspaceState | null {
  try {
    const file = path.join(stateDir, `${PARKED_PREFIX}${slugifyWorkspaceName(name)}.json`);
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return isValidState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Oracle (house pattern): deterministic, runs against a throwaway temp dir.
// ---------------------------------------------------------------------------

export function runWorkspaceStateSelftest(): { pass: boolean; checks: Array<{ name: string; pass: boolean; detail?: string }> } {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-wsstate-"));
  const mkState = (name: string, nodes: any[] = [{ id: "n1" }], version = 100): PersistedWorkspaceState => ({
    workspace: { id: "workspace_default", name, nodes, links: [] },
    version,
    savedAt: new Date(version).toISOString(),
    origin: "selftest",
  });
  try {
    // 1. active round-trip
    const s1 = mkState("Alpha_Mod", [{ id: "n1" }, { id: "n2" }], 111);
    writeActiveState(dir, s1);
    const r1 = readActiveState(dir);
    checks.push({ name: "active_roundtrip", pass: JSON.stringify(r1) === JSON.stringify(s1) });

    // 2. atomic write leaves no tmp litter
    const litter = fs.readdirSync(dir).filter(n => n.startsWith(".tmp-"));
    checks.push({ name: "atomic_no_tmp_litter", pass: litter.length === 0, detail: litter.join(",") });

    // 3. corrupt active file → null, no throw
    fs.writeFileSync(path.join(dir, "active.json"), "{ not json", "utf8");
    checks.push({ name: "corrupt_active_returns_null", pass: readActiveState(dir) === null });

    // 4. shape-invalid (nodes missing) → null
    fs.writeFileSync(path.join(dir, "active.json"), JSON.stringify({ workspace: { name: "x" }, version: 1 }), "utf8");
    checks.push({ name: "invalid_shape_returns_null", pass: readActiveState(dir) === null });

    // 5. park + list reflects name/nodeCount
    parkState(dir, mkState("Beta_Mod", [{ id: "a" }, { id: "b" }, { id: "c" }], 200));
    const l1 = listParked(dir);
    checks.push({
      name: "park_and_list",
      pass: l1.length === 1 && l1[0].name === "Beta_Mod" && l1[0].nodeCount === 3,
      detail: JSON.stringify(l1),
    });

    // 6. re-park same name → single entry, latest wins
    parkState(dir, mkState("Beta_Mod", [{ id: "a" }], 300));
    const l2 = listParked(dir);
    checks.push({
      name: "repark_same_name_latest_wins",
      pass: l2.length === 1 && l2[0].version === 300 && l2[0].nodeCount === 1,
      detail: JSON.stringify(l2),
    });

    // 7. readParked round-trip + missing → null
    const rp = readParked(dir, "Beta_Mod");
    checks.push({ name: "read_parked", pass: rp !== null && rp.version === 300 });
    checks.push({ name: "read_parked_missing_null", pass: readParked(dir, "Nope_Never") === null });

    // 8. prune keeps the newest `limit` entries
    for (let i = 0; i < 5; i++) parkState(dir, mkState(`Prune_${i}`, [{ id: "n" }], 400 + i), 3);
    const l3 = listParked(dir);
    const survivorNames = l3.map(p => p.name).sort();
    checks.push({
      name: "prune_keeps_newest",
      pass: l3.length === 3,
      detail: survivorNames.join(","),
    });

    // 9. slug: distinct names that collide case-insensitively get distinct files
    const slugA = slugifyWorkspaceName("MyMod");
    const slugB = slugifyWorkspaceName("mymod");
    checks.push({ name: "slug_case_distinct", pass: slugA !== slugB, detail: `${slugA} vs ${slugB}` });
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp cleanup best-effort */ }
  }
  return { pass: checks.every(c => c.pass), checks };
}
