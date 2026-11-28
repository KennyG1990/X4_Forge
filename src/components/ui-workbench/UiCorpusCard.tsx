/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Concept A configured X4 corpus status card for X4UiSourceEditor (`UI-P4`).
 */

import React from 'react';

export interface UiCorpusCardProps {
  readonly statusLabel: string;
  readonly detail: string;
  readonly colorStatusLabel: string;
  readonly colorDetail: string;
  readonly onReload: () => void;
}

export function UiCorpusCard({
  statusLabel,
  detail,
  colorStatusLabel,
  colorDetail,
  onReload,
}: UiCorpusCardProps) {
  return (
    <section
      data-testid="x4-ui-corpus-region"
      className="rounded-lg border border-[#262c36] bg-[#11141a] p-3.5 min-w-0 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-sans font-semibold text-[#eef2f7]">Configured X4 corpus</h2>
          <button
            type="button"
            data-testid="x4-ui-corpus-reload"
            onClick={onReload}
            className="rounded border border-[#3b82f6]/40 bg-[#3b82f6]/15 hover:bg-[#3b82f6]/25 px-2.5 py-1 text-[11px] font-sans font-medium text-[#93c5fd] cursor-pointer"
          >
            Reload
          </button>
        </div>

        <div className="mt-2.5 text-[11px] font-sans text-[#a0aab8]">
          Status:{' '}
          <span data-testid="x4-ui-corpus-status" className="font-mono font-semibold text-[#eef2f7]">
            {statusLabel}
          </span>
        </div>
        <div data-testid="x4-ui-corpus-detail" className="mt-1 break-words font-mono text-[11px] text-[#687385] leading-relaxed">
          {detail}
        </div>

        <div className="mt-2.5 text-[11px] font-sans text-[#a0aab8]">
          Canonical-default color:{' '}
          <span data-testid="x4-ui-corpus-color-status" className="font-mono font-semibold text-[#eef2f7]">
            {colorStatusLabel}
          </span>
        </div>
        <div data-testid="x4-ui-corpus-color-detail" className="mt-1 break-words font-mono text-[11px] text-[#687385] leading-relaxed">
          {colorDetail}
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-[#262c36] text-[11px] font-sans text-[#687385]">
        Canonical status is accepted only from the configured loader.
      </div>
    </section>
  );
}
