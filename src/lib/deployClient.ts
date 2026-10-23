/** Every browser deploy is preview-bound. This helper never approves a finding for the user. */
export async function fetchVerifiedDeploy(init: RequestInit, fetcher: typeof fetch = fetch): Promise<Response> {
  if (typeof init.body !== 'string') throw new Error('Deploy body must be serialized JSON.');
  const body = JSON.parse(init.body);
  const preview = await fetcher('/api/agent/deploy-verify', { ...init, body: JSON.stringify({ ...body, dryRun: true }) });
  const data = await preview.clone().json();
  if (!preview.ok || !data.ok || body.dryRun === true) return preview;
  if (!data.modId || !['sourceHash', 'artifactHash', 'bindingHash'].every(k => /^[a-f0-9]{64}$/.test(data[k] || ''))) {
    throw new Error('Forge did not provide a deploy identity. No deployment was attempted.');
  }
  return fetcher('/api/agent/deploy-verify', { ...init, body: JSON.stringify({ ...body, dryRun: false,
    expectedModId: data.modId, expectedSourceHash: data.sourceHash,
    expectedArtifactHash: data.artifactHash, expectedBindingHash: data.bindingHash }) });
}

export function deployValidationLabel(data: { validation?: { outcome?: string; clean?: boolean } }): string {
  return data.validation?.clean === true ? 'Validation complete.'
    : `Validation qualified: ${data.validation?.outcome || 'coverage unknown'}. Not a clean validation result.`;
}
