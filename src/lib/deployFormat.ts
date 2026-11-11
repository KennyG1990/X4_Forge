/** Shared existing deploy policy: explicit requests reject unknown values;
 * callers separately own persisted-value fallback and request precedence. */
export type DeployFormat = 'loose' | 'catalog';
export const DEPLOY_FORMATS: readonly DeployFormat[] = ['loose', 'catalog'] as const;
export const DEFAULT_DEPLOY_FORMAT: DeployFormat = 'loose';

export function normalizeDeployFormat(value: unknown): DeployFormat | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  return (DEPLOY_FORMATS as readonly string[]).includes(text) ? (text as DeployFormat) : null;
}
