/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Turns a validated, provenance-aware artifact plan into an X4 extension
 * package. This layer is deliberately generic: unknown source files are
 * payload, not errors, and compiler ownership is expressed only by the plan.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  hashArtifactFile,
  materializeArtifact,
  verifyMaterializedArtifact,
  type ArtifactPlan,
} from './artifactPipeline';
import {
  planCatDatCatalogs,
  verifyCatDatCatalogs,
  writeCatDatLayout,
  type CatDatPackEntry,
  type CatDatPackResult,
} from './x4CatDat';

export interface PackagedArtifactFile {
  path: string;
  size: number;
  sha256: string;
  role: 'loose' | 'catalog-manifest' | 'catalog-data';
}

export interface PackagedArtifactResult {
  ok: boolean;
  targetRoot: string;
  files: PackagedArtifactFile[];
  catalogs: CatDatPackResult;
  errors: string[];
}

function isRootCatalogPart(relativePath: string): boolean {
  return !relativePath.includes('/') && /\.(?:cat|dat|sig)$/i.test(relativePath);
}

function nextCatalogStart(entries: ArtifactPlan['entries']): number {
  let highest = 0;
  for (const entry of entries) {
    const match = /^ext_(\d+)\.(?:cat|dat|sig)$/i.exec(entry.path);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

function catalogArtifactLayout(plan: ArtifactPlan, options: { maxVolumeBytes?: number }, looseRoot?: string) {
  const looseEntries: ArtifactPlan['entries'] = [];
  const packedEntries: CatDatPackEntry[] = [];
  for (const entry of plan.entries) {
    if (entry.path.toLowerCase() === 'content.xml' || entry.catalogLoose || isRootCatalogPart(entry.path)) {
      looseEntries.push(entry);
    } else {
      packedEntries.push({ name: entry.path, size: entry.size, expectedSha256: entry.sha256,
        ...(looseRoot ? { sourcePath: path.join(looseRoot, ...entry.path.split('/')) } : {}) });
    }
  }
  const catalogs = planCatDatCatalogs(packedEntries, { maxVolumeBytes: options.maxVolumeBytes, startIndex: nextCatalogStart(plan.entries) });
  const looseRoots = new Set(looseEntries.map(entry => entry.path.split('/', 1)[0].toLowerCase()));
  const errors = [...catalogs.errors];
  for (const volume of catalogs.volumes) {
    for (const name of [volume.catName, volume.datName]) {
      if (looseRoots.has(name.toLowerCase())) errors.push(`Generated catalog conflicts with a loose artifact path: ${name}`);
    }
  }
  return { looseEntries, catalogs, errors };
}

/** Forecast exactly the physical output of catalog mode without touching the filesystem. */
export function forecastCatalogArtifact(plan: ArtifactPlan, options: { maxVolumeBytes?: number } = {}):
  { files: Array<{ path: string; size: number }> } | { errors: string[] } {
  if (!plan.ok) return { errors: plan.errors };
  const { looseEntries, catalogs, errors } = catalogArtifactLayout(plan, options);
  if (errors.length) return { errors };
  const files = looseEntries.map(entry => ({ path: entry.path, size: entry.size }));
  for (const volume of catalogs.volumes) {
    files.push({ path: volume.catName, size: volume.catBytes }, { path: volume.datName, size: volume.datBytes });
  }
  return { files: files.sort((left, right) => left.path.localeCompare(right.path)) };
}

function copyVerified(source: string, destination: string, expectedSize: number, expectedHash: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  const stat = fs.statSync(destination);
  const hash = hashArtifactFile(destination);
  if (stat.size !== expectedSize || hash !== expectedHash) {
    throw new Error(`loose-file verification mismatch for ${destination}`);
  }
}

/** Build a new/empty, verified packed artifact without touching a live target. */
export function materializeCatalogArtifact(
  plan: ArtifactPlan,
  targetRootInput: string,
  options: { maxVolumeBytes?: number } = {},
): PackagedArtifactResult {
  const targetRoot = path.resolve(targetRootInput);
  const files: PackagedArtifactFile[] = [];
  const errors = [...plan.errors];
  const emptyCatalogs: CatDatPackResult = { ok: false, volumes: [], errors: [] };
  if (!plan.ok) return { ok: false, targetRoot, files, catalogs: emptyCatalogs, errors };
  if (fs.existsSync(targetRoot) && fs.readdirSync(targetRoot).length > 0) {
    errors.push(`Packed artifact target must be new or empty: ${targetRoot}`);
    return { ok: false, targetRoot, files, catalogs: emptyCatalogs, errors };
  }

  const scratchParent = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-pack-'));
  const looseRoot = path.join(scratchParent, 'loose');
  try {
    const layout = catalogArtifactLayout(plan, options, looseRoot);
    if (layout.errors.length > 0) {
      return { ok: false, targetRoot, files, catalogs: emptyCatalogs, errors: [...errors, ...layout.errors] };
    }
    const loose = materializeArtifact(plan, looseRoot);
    if (!loose.ok) {
      errors.push(...loose.errors);
      return { ok: false, targetRoot, files, catalogs: emptyCatalogs, errors };
    }
    const looseVerification = verifyMaterializedArtifact(plan, looseRoot);
    if (!looseVerification.ok) {
      errors.push(...looseVerification.errors);
      return { ok: false, targetRoot, files, catalogs: emptyCatalogs, errors };
    }
    fs.mkdirSync(targetRoot, { recursive: true });

    for (const entry of layout.looseEntries) {
      const source = path.join(looseRoot, ...entry.path.split('/'));
      const destination = path.join(targetRoot, ...entry.path.split('/'));
      copyVerified(source, destination, entry.size, entry.sha256);
      files.push({ path: entry.path, size: entry.size, sha256: entry.sha256, role: 'loose' });
    }

    const catalogs = writeCatDatLayout(layout.catalogs, targetRoot);
    if (!catalogs.ok) errors.push(...catalogs.errors);
    const catalogVerification = verifyCatDatCatalogs(catalogs);
    if (!catalogVerification.ok) errors.push(...catalogVerification.errors);
    for (const volume of catalogs.volumes) {
      for (const [filePath, role] of [[volume.catPath, 'catalog-manifest'], [volume.datPath, 'catalog-data']] as const) {
        files.push({
          path: path.basename(filePath),
          size: fs.statSync(filePath).size,
          sha256: hashArtifactFile(filePath),
          role,
        });
      }
    }
    files.sort((left, right) => left.path.localeCompare(right.path));
    return { ok: errors.length === 0, targetRoot, files, catalogs, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { ok: false, targetRoot, files, catalogs: emptyCatalogs, errors };
  } finally {
    fs.rmSync(scratchParent, { recursive: true, force: true });
  }
}

