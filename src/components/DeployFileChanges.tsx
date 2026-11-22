import React from 'react';
import type { DeployReviewData } from '../lib/deployClient';

const FILES_PER_PAGE = 50;
const numbers = new Intl.NumberFormat();

type FileChange = { action: string; path: string; bytes?: number; wasBytes?: number };

function countLabel(count: number | undefined, action: string): string {
  return count === undefined ? action + ' count unavailable' : numbers.format(count) + ' ' + action;
}

function byteLabel(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isSafeInteger(bytes) || bytes < 0) return 'Size unavailable';
  return numbers.format(bytes) + (bytes === 1 ? ' byte' : ' bytes');
}

export default function DeployFileChanges({ effect, label = 'File changes' }: {
  effect: NonNullable<DeployReviewData['effect']>;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const groups = React.useMemo(() => [
    { action: 'Added', files: Array.isArray(effect.added) ? effect.added : null },
    { action: 'Replaced', files: Array.isArray(effect.overwritten) ? effect.overwritten : null },
    { action: 'Removed', files: Array.isArray(effect.deleted) ? effect.deleted : null },
    { action: 'Preserved', files: Array.isArray(effect.preserved) ? effect.preserved : null },
  ] as const, [effect]);

  const rows = React.useMemo(() => {
    if (!open) return [];
    return groups.flatMap(({ action, files }) => (files ?? []).flatMap<FileChange>(file => {
      if (typeof file === 'string') return action === 'Preserved' && file ? [{ path: file, action }] : [];
      if (!file || typeof file.path !== 'string' || !file.path) return [];
      return [{ ...file, action }];
    }));
  }, [groups, open]);

  const availableTotal = groups.reduce((total, { files }) => total + (files?.length ?? 0), 0);
  const counts = groups.map(({ action, files }) => countLabel(files?.length, action.toLowerCase())).join(' · ');
  if (availableTotal === 0) {
    const hasCounts = groups.some(({ files }) => files !== null);
    return <p className="text-slate-300">{hasCounts ? <>{label} · {counts}</> : 'File details unavailable'}</p>;
  }

  const pageCount = Math.ceil(rows.length / FILES_PER_PAGE);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const start = currentPage * FILES_PER_PAGE;
  const end = Math.min(start + FILES_PER_PAGE, rows.length);
  const pageButtonStyle = 'rounded border border-white/15 px-2 py-1 text-slate-200 hover:bg-white/10 disabled:opacity-40';

  return (
    <details
      className="min-w-0 text-slate-300"
      data-testid="deploy-file-changes"
      onToggle={event => {
        setOpen(event.currentTarget.open);
        setPage(0);
      }}
    >
      <summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-cyan-400">
        {label} · {counts}
      </summary>
      {open && (
        <div className="mt-2 space-y-2">
          {rows.length < availableTotal && <p className="text-slate-400">Some file details are unavailable.</p>}
          <ul aria-label="Files affected by deployment" className="@container max-h-40 space-y-1 overflow-y-auto">
            {rows.slice(start, end).map(file => (
              <li
                key={file.action + ':' + file.path}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 rounded bg-black/15 px-2 py-1 @min-[30rem]:grid-cols-[5.5em_minmax(0,1fr)_auto]"
              >
                <code className="col-span-2 row-start-1 break-all text-slate-100 @min-[30rem]:col-span-1 @min-[30rem]:col-start-2">
                  {file.path}
                </code>
                <span className="col-start-1 row-start-2 @min-[30rem]:row-start-1">{file.action}</span>
                <span className="col-start-2 row-start-2 min-w-0 break-words text-right @min-[30rem]:col-start-3 @min-[30rem]:row-start-1">
                  {file.action === 'Replaced' && <>{byteLabel(file.wasBytes)} → </>}
                  {file.action !== 'Preserved' && byteLabel(file.bytes)}
                </span>
              </li>
            ))}
          </ul>
          {pageCount > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={pageButtonStyle} disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}>Previous files</button>
              <span>{numbers.format(start + 1)}–{numbers.format(end)} of {numbers.format(rows.length)} files</span>
              <button type="button" className={pageButtonStyle} disabled={currentPage === pageCount - 1}
                onClick={() => setPage(currentPage + 1)}>Next files</button>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
