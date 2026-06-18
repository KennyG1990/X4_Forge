/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * #64 Phase 1 (GLM Tier A #1) — read-only galaxy/sector MAP, deterministic core.
 *
 * Parses X4's universe macro files into a flat, positioned cluster/sector graph for a
 * 2D map view. This is the VIEWER foundation only — displaying already-correct game
 * data, so there is no "valid-XML ≠ correct-placement" problem here (that lives in the
 * deferred Phase 2 editor). Grounded against the real installed files (probed via
 * /api/agent/catdat-debug?file=maps/xu_ep2_universe/...):
 *   - galaxy.xml:   <macro class="galaxy"> with <connection ref="clusters"> children,
 *                   each carrying an optional <offset><position x y z/></offset>
 *                   (absent ⇒ origin, e.g. Cluster_01) and a <macro ref="Cluster_NN_macro"/>.
 *   - clusters.xml: <macro class="cluster"> with <connection ref="sectors"> children,
 *                   each with its own offset (relative to the cluster) + sector macro ref.
 * Sector absolute position = cluster position + sector offset. X4's map plane is X/Z
 * (Y is "up"); the renderer projects on x/z. Coords are in metres (~1.5e7 between clusters).
 *
 * Pure: no fs/network — the caller supplies the two XML strings. xmldom (not regex)
 * because the macro tree nests (station/region macros live inside connections we skip).
 * House pattern: engine + runGalaxyMapSelftest() over a synthetic fixture + public GET.
 */

import { DOMParser } from '@xmldom/xmldom';

export interface Vec3 { x: number; y: number; z: number }

export interface UniverseConnection {
  name?: string;
  /** what this connection slots into: "clusters" | "sectors" | "regions" | ... */
  ref?: string;
  /** the referenced child macro name (the connection's <macro ref=.../>) */
  macroRef: string;
  /** placement offset for the child; null when no <offset> is present (⇒ origin). */
  offset: Vec3 | null;
}

export interface UniverseMacro {
  name: string;
  class?: string;
  connections: UniverseConnection[];
}

export interface GalaxyCluster {
  /** cluster macro name, e.g. "Cluster_01_macro" */
  macro: string;
  pos: Vec3;
  sectors: GalaxySector[];
}

export interface GalaxySector {
  /** sector macro name, e.g. "Cluster_01_Sector001_macro" */
  macro: string;
  /** owning cluster macro */
  cluster: string;
  /** ABSOLUTE position (cluster pos + sector offset) */
  pos: Vec3;
}

export interface GalaxyMap {
  clusters: GalaxyCluster[];
  /** flattened sectors with absolute positions, for direct rendering */
  sectors: GalaxySector[];
  /** x/z bounds across all sectors (for map fit-to-view); zeros when empty */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  counts: { clusters: number; sectors: number; placedClusters: number };
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** Direct element children of `el` with the given tag (non-recursive). */
function directChildren(el: any, tag: string): any[] {
  const out: any[] = [];
  const kids = el?.childNodes;
  if (!kids) return out;
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    if (n && n.nodeType === 1 && (n.nodeName === tag || n.localName === tag)) out.push(n);
  }
  return out;
}

function num(v: string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Read a connection's <offset><position x y z/></offset>, or null if absent. */
function readOffset(connEl: any): Vec3 | null {
  const offset = directChildren(connEl, 'offset')[0];
  if (!offset) return null;
  const pos = directChildren(offset, 'position')[0];
  if (!pos) return null;
  return { x: num(pos.getAttribute('x')), y: num(pos.getAttribute('y')), z: num(pos.getAttribute('z')) };
}

/**
 * Parse an X4 universe macro file (<macros><macro ...>) into top-level macros with
 * their direct connections. Tolerant of recoverable parse noise; returns [] on failure.
 */
export function parseUniverseMacros(xml: string): UniverseMacro[] {
  if (!xml || typeof xml !== 'string') return [];
  let doc: any;
  try {
    doc = new DOMParser({ onError: () => { /* tolerate recoverable noise */ } })
      .parseFromString(xml, 'text/xml');
  } catch { return []; }
  const root = doc?.documentElement;
  if (!root) return [];

  const macros: UniverseMacro[] = [];
  for (const macroEl of directChildren(root, 'macro')) {
    const name = macroEl.getAttribute('name') || '';
    if (!name) continue;
    const cls = macroEl.getAttribute('class') || undefined;
    const connections: UniverseConnection[] = [];
    // a macro has one <connections> wrapper holding <connection> children
    for (const connsWrap of directChildren(macroEl, 'connections')) {
      for (const connEl of directChildren(connsWrap, 'connection')) {
        const childMacro = directChildren(connEl, 'macro')[0];
        const macroRef = childMacro?.getAttribute('ref') || '';
        if (!macroRef) continue; // skip connections without a referenced macro
        connections.push({
          name: connEl.getAttribute('name') || undefined,
          ref: connEl.getAttribute('ref') || undefined,
          macroRef,
          offset: readOffset(connEl),
        });
      }
    }
    macros.push({ name, class: cls, connections });
  }
  return macros;
}

/**
 * Build the positioned cluster/sector map from galaxy.xml + clusters.xml.
 * Cluster pos = galaxy-macro cluster-connection offset (origin if none).
 * Sector pos = cluster pos + cluster-macro sector-connection offset (origin if none).
 */
export function buildGalaxyMap(galaxyXml: string, clustersXml: string): GalaxyMap {
  const galaxyMacros = parseUniverseMacros(galaxyXml);
  const clusterMacros = parseUniverseMacros(clustersXml);

  // cluster macro name -> its sector connections (from clusters.xml)
  const clusterByName = new Map<string, UniverseMacro>();
  for (const m of clusterMacros) clusterByName.set(m.name, m);

  // galaxy macro: the one of class "galaxy" (fallback: first macro with cluster refs)
  const galaxy = galaxyMacros.find(m => m.class === 'galaxy')
    || galaxyMacros.find(m => m.connections.some(c => c.ref === 'clusters'))
    || galaxyMacros[0];

  const clusters: GalaxyCluster[] = [];
  const sectors: GalaxySector[] = [];
  let placedClusters = 0;

  const clusterConns = (galaxy?.connections || []).filter(c => c.ref === 'clusters');
  for (const cc of clusterConns) {
    const cpos = cc.offset || ZERO;
    if (cc.offset) placedClusters++;
    const clusterMacro = clusterByName.get(cc.macroRef);
    const clusterSectors: GalaxySector[] = [];
    if (clusterMacro) {
      for (const sc of clusterMacro.connections.filter(c => c.ref === 'sectors')) {
        const so = sc.offset || ZERO;
        const sector: GalaxySector = {
          macro: sc.macroRef,
          cluster: cc.macroRef,
          pos: { x: cpos.x + so.x, y: cpos.y + so.y, z: cpos.z + so.z },
        };
        clusterSectors.push(sector);
        sectors.push(sector);
      }
    }
    clusters.push({ macro: cc.macroRef, pos: { ...cpos }, sectors: clusterSectors });
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of sectors) {
    if (s.pos.x < minX) minX = s.pos.x;
    if (s.pos.x > maxX) maxX = s.pos.x;
    if (s.pos.z < minZ) minZ = s.pos.z;
    if (s.pos.z > maxZ) maxZ = s.pos.z;
  }
  const bounds = sectors.length
    ? { minX, maxX, minZ, maxZ }
    : { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

  return { clusters, sectors, bounds, counts: { clusters: clusters.length, sectors: sectors.length, placedClusters } };
}

/* ------------------------------------------------------------------ *
 * Deterministic oracle over a synthetic fixture that mirrors the real
 * galaxy.xml / clusters.xml shapes (origin-default cluster, offset cluster,
 * composed sector positions, skipped non-sector connections).
 * House shape: { allPassed, pass, passed, total, checks[] }.
 * ------------------------------------------------------------------ */
export function runGalaxyMapSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  // Cluster_01: no offset (⇒ origin). Cluster_02: offset 15e6,0,25.98e6 (real-shaped).
  const galaxyXml = `<?xml version="1.0" encoding="utf-8"?>
<macros>
  <macro name="XU_universe_macro" class="galaxy">
    <component ref="standardgalaxy" />
    <connections>
      <connection name="Cluster_01_connection" ref="clusters">
        <macro ref="Cluster_01_macro" connection="galaxy" />
      </connection>
      <connection name="Cluster_02_connection" ref="clusters">
        <offset><position x="15000000" y="0" z="25980000" /></offset>
        <macro ref="Cluster_02_macro" connection="galaxy" />
      </connection>
    </connections>
  </macro>
</macros>`;

  const clustersXml = `<?xml version="1.0" encoding="utf-8"?>
<macros>
  <macro name="Cluster_01_macro" class="cluster">
    <connections>
      <connection name="C01_Sector001_connection" ref="sectors">
        <macro ref="Cluster_01_Sector001_macro" connection="cluster" />
      </connection>
      <connection name="C01_Sector002_connection" ref="sectors">
        <offset><position x="1000" y="0" z="2000" /></offset>
        <macro ref="Cluster_01_Sector002_macro" connection="cluster" />
      </connection>
      <connection name="C01_region" ref="regions">
        <offset><position x="500" y="0" z="500" /></offset>
        <macro ref="some_region_macro" connection="cluster" />
      </connection>
    </connections>
  </macro>
  <macro name="Cluster_02_macro" class="cluster">
    <connections>
      <connection name="C02_Sector001_connection" ref="sectors">
        <offset><position x="-3000" y="0" z="4000" /></offset>
        <macro ref="Cluster_02_Sector001_macro" connection="cluster" />
      </connection>
    </connections>
  </macro>
</macros>`;

  const macros = parseUniverseMacros(galaxyXml);
  ok('parses the galaxy macro', macros.length === 1 && macros[0].class === 'galaxy');
  ok('parses cluster connections', macros[0].connections.filter(c => c.ref === 'clusters').length === 2);
  ok('connection with no offset → null', macros[0].connections.find(c => c.macroRef === 'Cluster_01_macro')?.offset === null);
  ok('connection offset parsed',
    macros[0].connections.find(c => c.macroRef === 'Cluster_02_macro')?.offset?.x === 15000000);

  const map = buildGalaxyMap(galaxyXml, clustersXml);
  ok('two clusters placed', map.counts.clusters === 2, JSON.stringify(map.counts));
  ok('placedClusters counts only those with an offset', map.counts.placedClusters === 1, String(map.counts.placedClusters));

  const c1 = map.clusters.find(c => c.macro === 'Cluster_01_macro')!;
  const c2 = map.clusters.find(c => c.macro === 'Cluster_02_macro')!;
  ok('Cluster_01 defaults to origin', c1.pos.x === 0 && c1.pos.z === 0);
  ok('Cluster_02 takes galaxy offset', c2.pos.x === 15000000 && c2.pos.z === 25980000, JSON.stringify(c2.pos));

  // sector position = cluster pos + sector offset
  const s1 = map.sectors.find(s => s.macro === 'Cluster_01_Sector001_macro')!; // c1 origin + no offset
  const s2 = map.sectors.find(s => s.macro === 'Cluster_01_Sector002_macro')!; // c1 origin + (1000,_,2000)
  const s3 = map.sectors.find(s => s.macro === 'Cluster_02_Sector001_macro')!; // c2 + (-3000,_,4000)
  ok('sector with no offset sits at its cluster', s1.pos.x === 0 && s1.pos.z === 0);
  ok('sector offset composes onto cluster', s2.pos.x === 1000 && s2.pos.z === 2000, JSON.stringify(s2.pos));
  ok('sector absolute = cluster + offset', s3.pos.x === 15000000 - 3000 && s3.pos.z === 25980000 + 4000, JSON.stringify(s3.pos));

  // region connections are NOT treated as sectors
  ok('non-sector (region) connection excluded', !map.sectors.some(s => s.macro === 'some_region_macro'));
  ok('total sectors = 3 (two in C01, one in C02; region skipped)', map.counts.sectors === 3, String(map.counts.sectors));

  // bounds span ALL sectors on x/z: min from the C01 origin sector, max from C02.
  ok('bounds minX is the origin sector (C01)', map.bounds.minX === 0, JSON.stringify(map.bounds));
  ok('bounds maxX from C02 sector', map.bounds.maxX === 15000000 - 3000, JSON.stringify(map.bounds));
  ok('bounds maxZ from C02 sector', map.bounds.maxZ === 25980000 + 4000, JSON.stringify(map.bounds));

  // degrades safely
  ok('empty/garbage input → empty map', buildGalaxyMap('', '').counts.sectors === 0 && parseUniverseMacros('<x/>').length === 0);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
