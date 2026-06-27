// #23 — live-log error -> cue -> canvas navigation. PURE engine (no fs/network/React): it turns the
// debug-watcher's runtime findings (erroring cues + classified timeline) into a normalized, UI-ready alert
// list, and resolves each alert's cue name to a CANVAS NODE id so the UI can focus it (click-to-navigate).
// The watcher already attributes errors -> cues + sourceRef; this engine is the deterministic bridge from
// that attribution to the canvas node graph. Degrades safely on empty/garbage input (never throws).
import type { MDNode } from "../types";

export interface LiveLogAlert {
  id: string;                          // stable de-dup key + React key
  severity: "error" | "warning";
  cueName: string | null;              // the owning cue, if the line named one
  message: string;
  line?: number;                       // debuglog line number (for reference)
  nodeId: string | null;               // resolved canvas navigation target (null = no matching node)
}

interface WatcherLike {
  cueLiveness?: { erroring?: { name?: string; errors?: number; lastLineNo?: number }[] };
  timeline?: { kind?: string; severity?: string; label?: string; lineNumber?: number; evidence?: string }[];
}

/** Find the canvas node id for a cue by name (case-insensitive). Only `type:'cue'` nodes; null if none. */
export function resolveCueToNodeId(cueName: string, nodes: MDNode[]): string | null {
  if (!cueName || !Array.isArray(nodes)) return null;
  const target = cueName.trim().toLowerCase();
  if (!target) return null;
  for (const n of nodes) {
    if (!n || n.type !== "cue") continue;
    const nm = String((n.properties && n.properties.name) || n.label || n.id || "").trim().toLowerCase();
    if (nm === target) return n.id;
  }
  return null;
}

/** Normalize the watcher's runtime findings into navigable alerts. Erroring cues first (always cue-named, so
 *  navigable), then error/warning timeline items that name a cue. De-duplicated by stable id. */
export function buildLiveLogAlerts(watcher: WatcherLike | null | undefined, nodes: MDNode[]): LiveLogAlert[] {
  const alerts: LiveLogAlert[] = [];
  const seen = new Set<string>();
  const safeNodes = Array.isArray(nodes) ? nodes : [];

  for (const c of watcher?.cueLiveness?.erroring || []) {
    const cueName = String(c?.name || "").trim();
    if (!cueName) continue;
    const id = "cue:" + cueName;
    if (seen.has(id)) continue;
    seen.add(id);
    alerts.push({
      id, severity: "error", cueName,
      message: `Cue "${cueName}" is throwing ${c?.errors || 0} error(s) in-game`,
      line: c?.lastLineNo, nodeId: resolveCueToNodeId(cueName, safeNodes),
    });
  }

  for (const t of watcher?.timeline || []) {
    if (!t || (t.severity !== "error" && t.severity !== "warning")) continue;
    if (t.kind !== "cue") continue;                       // only cue-attributed lines are navigable
    const m = /cue\s+(\S+)/i.exec(String(t.label || ""));
    const cueName = m ? m[1] : null;
    const id = "tl:" + (cueName || t.label || "issue") + ":" + (t.lineNumber || 0);
    if (seen.has(id)) continue;
    seen.add(id);
    alerts.push({
      id, severity: t.severity as "error" | "warning", cueName,
      message: t.evidence ? String(t.evidence).slice(0, 160) : String(t.label || "live-log issue"),
      line: t.lineNumber, nodeId: cueName ? resolveCueToNodeId(cueName, safeNodes) : null,
    });
  }

  return alerts;
}

function mkNode(id: string, type: MDNode["type"], name: string): MDNode {
  return { id, type, label: name, xmlTag: type, x: 0, y: 0,
           properties: type === "cue" ? { name } : {}, propertiesSchema: [], inputs: [], outputs: [] };
}

export function runLiveLogNavSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  const nodes: MDNode[] = [
    mkNode("n1", "cue", "On_action"),
    mkNode("n2", "cue", "State"),
    mkNode("n3", "action", "set_value"),
  ];

  ok("resolve_exact_cue", resolveCueToNodeId("On_action", nodes) === "n1");
  ok("resolve_case_insensitive", resolveCueToNodeId("state", nodes) === "n2");
  ok("unknown_cue_is_null", resolveCueToNodeId("Nope", nodes) === null);
  ok("non_cue_node_ignored", resolveCueToNodeId("set_value", nodes) === null);
  ok("empty_input_safe", resolveCueToNodeId("", nodes) === null && resolveCueToNodeId("X", []) === null);

  const watcher: WatcherLike = {
    cueLiveness: { erroring: [{ name: "On_action", errors: 2, lastLineNo: 4310 }, { name: "Ghost", errors: 1 }] },
    timeline: [
      { kind: "cue", severity: "error", label: "Cue State", lineNumber: 4400, evidence: "Property lookup failed" },
      { kind: "marker", severity: "info", label: "[AIINF] marker", lineNumber: 4401, evidence: "benign noise" },
      { kind: "cue", severity: "info", label: "Cue State", lineNumber: 4402, evidence: "fired cleanly" },
    ],
  };
  const alerts = buildLiveLogAlerts(watcher, nodes);
  ok("erroring_cue_is_navigable", alerts.some(a => a.cueName === "On_action" && a.nodeId === "n1" && a.severity === "error"));
  ok("unmapped_cue_has_null_node", alerts.some(a => a.cueName === "Ghost" && a.nodeId === null));
  ok("timeline_error_cue_navigable", alerts.some(a => a.cueName === "State" && a.nodeId === "n2" && a.line === 4400));
  ok("info_lines_excluded", !alerts.some(a => /noise|fired cleanly/.test(a.message)));
  ok("ids_unique_dedup", new Set(alerts.map(a => a.id)).size === alerts.length);
  ok("garbage_safe", buildLiveLogAlerts(null, nodes).length === 0 && buildLiveLogAlerts(watcher, null as any).length >= 0);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
