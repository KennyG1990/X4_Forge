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

export interface DeployReviewData {
  ok?: boolean;
  stage?: string;
  dryRun?: boolean;
  bytesConfirmed?: boolean;
  modId?: string;
  sourceHash?: string;
  validation?: {
    outcome?: string;
    clean?: boolean;
    review?: {
      status?: string;
      counts?: Partial<Record<'acceptedErrors' | 'acceptedWarnings' | 'unacceptedErrors' | 'unacceptedWarnings' | 'unavailableChecks', number>>;
      approvals?: Array<{ findingId: string; code?: string; severity?: string; reason: string;
        actor?: { id?: string; label?: string }; receiptId?: string; reused?: boolean;
        originalReceiptId?: string; originalActor?: { id?: string; label?: string } }>;
      warningReviews?: { scopeHash: string; dependencyScope: string; newFindingIds: string[]; knownFindingIds: string[];
        rows: Array<{ receiptId: string; code: string; state: string; reason: string; actor: { id?: string; label?: string }; recordedAt: string }> };
    };
  };
}

/** Presentation only: deployment permission and approval validity remain server decisions. */
export function deployReviewView(data: DeployReviewData) {
  const review = data.validation?.review;
  const raw = review?.counts;
  const keys = ['acceptedErrors', 'acceptedWarnings', 'unacceptedErrors', 'unacceptedWarnings', 'unavailableChecks'] as const;
  const counts = raw && keys.every(key => Number.isSafeInteger(raw[key]) && raw[key]! >= 0)
    ? raw as Required<NonNullable<typeof raw>> : null;
  const outcome = data.validation?.outcome;
  const clean = data.validation?.clean === true && outcome === 'validation-clean'
    && counts !== null && keys.every(key => counts[key] === 0);
  const descriptions: Record<string, string> = {
    'validation-clean': 'Validation checks passed.',
    'warnings-present': 'Outstanding warnings need review.',
    'accepted-findings': 'Findings were accepted; validation remains qualified.',
    'accepted-findings-with-outstanding-warnings': 'Some findings were accepted; outstanding warnings remain.',
    'accepted-findings-and-incomplete-checks': 'Some findings were accepted; some checks remain incomplete.',
    'incomplete-checks': 'Some checks could not be completed.',
    'blocked-mod-findings': 'Validation found blocking errors.',
  };
  const validationText = counts && (counts.acceptedErrors || counts.acceptedWarnings) && review?.status !== 'recorded'
    ? review?.status === 'proposed' ? 'Finding acceptance is proposed; it has not been recorded.' : 'Approval status is unconfirmed.'
    : clean ? descriptions['validation-clean']
    : outcome === 'validation-clean' ? 'Clean validation could not be confirmed from the review metadata.'
    : descriptions[outcome || ''] || 'Validation status is unavailable.';
  const acceptanceLabel = review?.status === 'recorded' ? 'Accepted' : review?.status === 'proposed' ? 'Proposed acceptance' : 'Acceptance reported';
  const countText = counts
    ? `Outstanding: ${counts.unacceptedErrors} errors, ${counts.unacceptedWarnings} warnings. ${acceptanceLabel}: ${counts.acceptedErrors} errors, ${counts.acceptedWarnings} warnings. Unavailable checks: ${counts.unavailableChecks}.`
    : 'Review counts are unavailable.';
  const preview = data.dryRun === true || data.stage === 'preview';
  const confirmed = data.ok === true && data.bytesConfirmed === true && !preview;
  const title = preview ? 'Preview — not deployed'
    : data.ok !== true ? 'Deployment failed'
    : !confirmed ? 'Deployment reported — bytes unconfirmed'
    : clean ? 'Deployed — validation checks passed'
    : counts && (counts.unacceptedErrors || counts.unacceptedWarnings) ? 'Deployed — outstanding findings'
    : counts && counts.unavailableChecks ? 'Deployed — incomplete checks'
    : counts && (counts.acceptedErrors || counts.acceptedWarnings) ? review?.status === 'recorded' ? 'Deployed — accepted findings' : 'Deployed — approvals unconfirmed'
    : 'Deployed — validation unconfirmed';
  return { title, validationText, countText, counts, clean, confirmed, preview,
    tone: !preview && data.ok !== true ? 'error' as const : confirmed && clean ? 'clean' as const : 'qualified' as const };
}

export function deployValidationLabel(data: DeployReviewData): string {
  const view = deployReviewView(data);
  return `${view.validationText} ${view.countText}`;
}
