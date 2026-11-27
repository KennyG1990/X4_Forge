/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModWorkspace } from '../types';

export interface ConflictWarning {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: 'id_collision' | 'overlap' | 'validation' | 'pricing';
  title: string;
  message: string;
  affectedIds: string[];
  location: string;
}

interface ScanAccumulators {
  foundWarnings: ConflictWarning[];
  wareDefsMap: Map<string, Array<{ id: string; name?: string; source: string }>>;
  jobDefsMap: Map<string, Array<{ id: string; name?: string; source: string; details?: any }>>;
}

function collectWorkspaceDefinitions(workspace: ModWorkspace): ScanAccumulators {
  const foundWarnings: ConflictWarning[] = [];
  const wareDefsMap = new Map<string, Array<{ id: string; name?: string; source: string }>>();
  const jobDefsMap = new Map<string, Array<{ id: string; name?: string; source: string; details?: any }>>();

  for (const w of workspace.wares || []) {
    const list = wareDefsMap.get(w.id) || [];
    list.push({ id: w.id, name: w.name, source: 'Workspace Registry' });
    wareDefsMap.set(w.id, list);

    const nanFields = (['volume', 'minPrice', 'avgPrice', 'maxPrice', 'prodTime', 'prodAmount'] as const)
      .filter(k => !Number.isFinite(Number((w as unknown as Record<string, unknown>)[k])));
    if (nanFields.length > 0) {
      foundWarnings.push({
        id: `nan_ware_${w.id}`,
        severity: 'error',
        category: 'validation',
        title: 'Non-numeric ware field',
        message: `Ware '${w.id}' has non-numeric ${nanFields.join(', ')} — X4 rejects "NaN". Enter a number.`,
        affectedIds: [w.id],
        location: 'Workspace Registry',
      });
    }

    if (w.minPrice >= w.maxPrice) {
      foundWarnings.push({
        id: `price_floor_${w.id}`,
        severity: 'error',
        category: 'pricing',
        title: 'Invalid pricing range',
        message: `Min price (${w.minPrice} cr) is greater/equal to Max price (${w.maxPrice} cr) for '${w.id}'. X4 engine rejects unstable boundaries.`,
        affectedIds: [w.id],
        location: 'Workspace Registry',
      });
    }
    if (w.avgPrice < w.minPrice || w.avgPrice > w.maxPrice) {
      foundWarnings.push({
        id: `price_avg_${w.id}`,
        severity: 'warning',
        category: 'pricing',
        title: 'Average price anomalous',
        message: `Average price (${w.avgPrice} cr) must reside between Min floor and Max ceiling.`,
        affectedIds: [w.id],
        location: 'Workspace Registry',
      });
    }
  }

  for (const j of workspace.jobs || []) {
    const list = jobDefsMap.get(j.id) || [];
    list.push({ id: j.id, name: j.name, source: 'Workspace Registry', details: j });
    jobDefsMap.set(j.id, list);

    const nanJobFields = (['galaxyQuota', 'sectorQuota'] as const)
      .filter(k => !Number.isFinite(Number((j as unknown as Record<string, unknown>)[k])));
    if (nanJobFields.length > 0) {
      foundWarnings.push({
        id: `nan_job_${j.id}`,
        severity: 'error',
        category: 'validation',
        title: 'Non-numeric job quota',
        message: `Job '${j.id}' has non-numeric ${nanJobFields.join(', ')} — enter a number.`,
        affectedIds: [j.id],
        location: 'Workspace Registry',
      });
    }

    if (j.galaxyQuota <= 0) {
      foundWarnings.push({
        id: `quota_gal_${j.id}`,
        severity: 'error',
        category: 'validation',
        title: 'Zero quota limit',
        message: `Galaxy quota for job '${j.id}' is 0. No ships under this design will ever spawn.`,
        affectedIds: [j.id],
        location: 'Workspace Registry',
      });
    }
    if (j.sectorQuota > j.galaxyQuota) {
      foundWarnings.push({
        id: `quota_sec_${j.id}`,
        severity: 'warning',
        category: 'validation',
        title: 'Sector quota exceeds Galaxy',
        message: `Sector quota limit (${j.sectorQuota}) is greater than Galaxy quota (${j.galaxyQuota}). Spawn volumes will be capped by galaxy volume.`,
        affectedIds: [j.id],
        location: 'Workspace Registry',
      });
    }
  }

  for (const p of workspace.xmlPatches || []) {
    const xmlContent = p.content || '';
    const patchSource = `XML Patch Block: "${p.note || p.id}"`;

    const wareRegex = /<ware\s+id=["']([^"']+)["']/g;
    let wareMatch: RegExpExecArray | null;
    while ((wareMatch = wareRegex.exec(xmlContent)) !== null) {
      const wareId = wareMatch[1];
      const nameMatch = xmlContent.match(/name=["']([^"']+)["']/);
      const list = wareDefsMap.get(wareId) || [];
      list.push({ id: wareId, name: nameMatch?.[1], source: patchSource });
      wareDefsMap.set(wareId, list);
    }

    const jobRegex = /<job\s+id=["']([^"']+)["']/g;
    let jobMatch: RegExpExecArray | null;
    while ((jobMatch = jobRegex.exec(xmlContent)) !== null) {
      const jobId = jobMatch[1];
      const nameMatch = xmlContent.match(/name=["']([^"']+)["']/);
      const factionMatch = xmlContent.match(/faction=["']([^"']+)["']/);
      const tagMatch = xmlContent.match(/tags=["']([^"']+)["']/);
      const scriptMatch = xmlContent.match(/script=["']([^"']+)["']/);
      const list = jobDefsMap.get(jobId) || [];
      list.push({
        id: jobId,
        name: nameMatch?.[1],
        source: patchSource,
        details: {
          faction: factionMatch?.[1] ?? '',
          shipClass: tagMatch?.[1] ?? '',
          taskScript: scriptMatch?.[1] ?? '',
        },
      });
      jobDefsMap.set(jobId, list);
    }
  }

  return { foundWarnings, wareDefsMap, jobDefsMap };
}

function finalizeConflictScan({ foundWarnings, wareDefsMap, jobDefsMap }: ScanAccumulators): ConflictWarning[] {
  wareDefsMap.forEach((sources, wareId) => {
    if (sources.length <= 1) return;
    const distinctSources = Array.from(new Set(sources.map(s => s.source)));
    if (distinctSources.length > 1) {
      foundWarnings.push({
        id: `conflict_ware_${wareId}`,
        severity: 'error',
        category: 'id_collision',
        title: `Ware ID Conflict: '${wareId}'`,
        message: `The precise Ware ID is defined across overlapping resources: ${distinctSources.join(' AND ')}. Will cause silent overwritten errors.`,
        affectedIds: [wareId],
        location: distinctSources.join(' vs '),
      });
    } else {
      foundWarnings.push({
        id: `dup_ware_${wareId}`,
        severity: 'error',
        category: 'id_collision',
        title: `Duplicate Ware ID: '${wareId}'`,
        message: `Ware ID '${wareId}' is defined ${sources.length} times in ${distinctSources[0]}. X4 keeps only one — give each ware a unique id.`,
        affectedIds: [wareId],
        location: distinctSources[0],
      });
    }
  });

  jobDefsMap.forEach((sources, jobId) => {
    if (sources.length <= 1) return;
    const distinctSources = Array.from(new Set(sources.map(s => s.source)));
    if (distinctSources.length > 1) {
      foundWarnings.push({
        id: `conflict_job_${jobId}`,
        severity: 'error',
        category: 'id_collision',
        title: `Job ID Conflict: '${jobId}'`,
        message: `This Pilot Squad Job ID is declared in multiple file locations: ${distinctSources.join(' AND ')}. Engine parses only one.`,
        affectedIds: [jobId],
        location: distinctSources.join(' vs '),
      });
    } else {
      foundWarnings.push({
        id: `dup_job_${jobId}`,
        severity: 'error',
        category: 'id_collision',
        title: `Duplicate Job ID: '${jobId}'`,
        message: `Job ID '${jobId}' is defined ${sources.length} times in ${distinctSources[0]}. X4 keeps only one — give each job a unique id.`,
        affectedIds: [jobId],
        location: distinctSources[0],
      });
    }
  });

  const allJobsList: Array<{ id: string; name?: string; source: string; details: any }> = [];
  jobDefsMap.forEach((sources, jobId) => {
    sources.forEach(s => {
      if (s.details) allJobsList.push({ id: jobId, name: s.name, source: s.source, details: s.details });
    });
  });

  for (let i = 0; i < allJobsList.length; i++) {
    for (let j = i + 1; j < allJobsList.length; j++) {
      const jobA = allJobsList[i];
      const jobB = allJobsList[j];
      if (jobA.id === jobB.id) continue;

      const fA = String(jobA.details.faction || '').trim().toLowerCase();
      const fB = String(jobB.details.faction || '').trim().toLowerCase();
      const sClassA = String(jobA.details.shipClass || '').trim().toLowerCase();
      const sClassB = String(jobB.details.shipClass || '').trim().toLowerCase();
      const scriptA = String(jobA.details.taskScript || '').trim().toLowerCase();
      const scriptB = String(jobB.details.taskScript || '').trim().toLowerCase();

      const factionOverlap = fA && fB && (fA === fB || fA.includes(fB) || fB.includes(fA));
      const classOverlap = sClassA && sClassB && (sClassA === sClassB || sClassA.includes(sClassB) || sClassB.includes(sClassA));
      const scriptOverlap = scriptA && scriptB && (scriptA === scriptB || scriptA.includes(scriptB) || scriptB.includes(scriptA));

      if (factionOverlap && classOverlap && scriptOverlap) {
        foundWarnings.push({
          id: `overlap_job_${jobA.id}_${jobB.id}`,
          severity: 'warning',
          category: 'overlap',
          title: 'Overlapping NPC Flight Roles',
          message: `Job '${jobA.id}' (${jobA.source}) and Job '${jobB.id}' (${jobB.source}) share faction parameters (${jobA.details.faction}) and script logic (${jobA.details.taskScript}). Can saturate local patrol quota boundaries.`,
          affectedIds: [jobA.id, jobB.id],
          location: `${jobA.source} VS ${jobB.source}`,
        });
      }
    }
  }

  return foundWarnings;
}

export function scanWorkspaceLibraryConflicts(workspace: ModWorkspace): ConflictWarning[] {
  return finalizeConflictScan(collectWorkspaceDefinitions(workspace));
}

export async function scanLibraryConflictsWithDisk(workspace: ModWorkspace): Promise<ConflictWarning[]> {
  const acc = collectWorkspaceDefinitions(workspace);

  try {
    const listRes = await fetch('/api/fs/list');
    if (listRes.ok) {
      const tree = await listRes.json();
      const flattenFiles = (nodes: any[]): any[] => {
        const results: any[] = [];
        if (!Array.isArray(nodes)) return results;
        for (const n of nodes) {
          if (n.kind === 'file') results.push(n);
          else if (n.kind === 'directory' && n.children) results.push(...flattenFiles(n.children));
        }
        return results;
      };
      const xmlFiles = flattenFiles(tree).filter(
        f => f.name && f.name.endsWith('.xml') && f.path && f.path.includes('/libraries/'),
      );

      for (const file of xmlFiles) {
        try {
          const readRes = await fetch(`/api/fs/read?root=filesystem&path=${encodeURIComponent(file.path)}`);
          if (!readRes.ok) continue;
          const data = await readRes.json();
          const fileContent: string = data.content || '';
          const relativePath = file.path.split('/workspace/').pop() || file.path;

          const wareRegex = /<ware\s+id=["']([^"']+)["']/g;
          let fileWareMatch: RegExpExecArray | null;
          while ((fileWareMatch = wareRegex.exec(fileContent)) !== null) {
            const wareId = fileWareMatch[1];
            const subBlock = fileContent.substring(fileWareMatch.index, fileWareMatch.index + 250);
            const nameMatch = subBlock.match(/name=["']([^"']+)["']/);
            const list = acc.wareDefsMap.get(wareId) || [];
            list.push({ id: wareId, name: nameMatch?.[1], source: `Local Disk: ${relativePath}` });
            acc.wareDefsMap.set(wareId, list);
          }

          const jobRegex = /<job\s+id=["']([^"']+)["']/g;
          let fileJobMatch: RegExpExecArray | null;
          while ((fileJobMatch = jobRegex.exec(fileContent)) !== null) {
            const jobId = fileJobMatch[1];
            const subBlock = fileContent.substring(fileJobMatch.index, fileJobMatch.index + 400);
            const nameMatch = subBlock.match(/name=["']([^"']+)["']/);
            const factionMatch = subBlock.match(/faction=["']([^"']+)["']/);
            const tagsMatch = subBlock.match(/tags=["']([^"']+)["']/);
            const scriptMatch = subBlock.match(/script=["']([^"']+)["']/);
            const list = acc.jobDefsMap.get(jobId) || [];
            list.push({
              id: jobId,
              name: nameMatch?.[1],
              source: `Local Disk: ${relativePath}`,
              details: {
                faction: factionMatch?.[1] ?? '',
                shipClass: tagsMatch?.[1] ?? '',
                taskScript: scriptMatch?.[1] ?? '',
              },
            });
            acc.jobDefsMap.set(jobId, list);
          }
        } catch (fileErr) {
          console.error('Local file conflict check read failed for:', file.path, fileErr);
        }
      }
    }
  } catch (fsErr) {
    console.warn('FS scanning issue, falling back to memory arrays:', fsErr);
  }

  return finalizeConflictScan(acc);
}
