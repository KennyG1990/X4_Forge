/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Concept A preview canvas host and PNG export card for X4UiSourceEditor (`UI-P4`).
 * Export ownership stays inside `X4UiSourceEditor.tsx` so `durable-writers.json` anchor counts remain intact.
 */

import React from 'react';

export interface UiCanvasStageProps {
  readonly canvasHostRef: React.RefObject<HTMLDivElement | null>;
  readonly canvasStatus: string;
  readonly canvasStatusLabel: string;
  readonly canvasDetail: string;
  readonly canvasExportReady: boolean;
  readonly canvasExportBusy: boolean;
  readonly canvasExportStatusText: string;
  readonly selectedSourceFile: string;
  readonly selectedSourceHash: string;
  readonly selectedTargetName: string;
  readonly selectedTargetId: string;
  readonly selectedTargetKind: string;
  readonly exportProfileId: string;
  readonly exportProfileWidth: string;
  readonly exportProfileHeight: string;
  readonly exportEffectiveScale: string;
  readonly nativeBitmapWidth: string;
  readonly nativeBitmapHeight: string;
  readonly gameTruth: string;
  readonly onExportCanvas: () => void;
}

export function UiCanvasStage({
  canvasHostRef,
  canvasStatus,
  canvasStatusLabel,
  canvasDetail,
  canvasExportReady,
  canvasExportBusy,
  canvasExportStatusText,
  selectedSourceFile,
  selectedSourceHash,
  selectedTargetName,
  selectedTargetId,
  selectedTargetKind,
  exportProfileId,
  exportProfileWidth,
  exportProfileHeight,
  exportEffectiveScale,
  nativeBitmapWidth,
  nativeBitmapHeight,
  gameTruth,
  onExportCanvas,
}: UiCanvasStageProps) {
  return (
    <section
      data-testid="x4-ui-preview-region"
      className="mt-3 rounded-lg border border-[#262c36] bg-[#11141a] p-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-sans font-semibold text-[#eef2f7]">Source preview canvas</h2>
        <span
          data-testid="x4-ui-canvas-status"
          className={`text-[11px] font-mono font-medium ${
            canvasStatus === 'current' ? 'text-[#eef2f7]' : 'text-amber-300'
          }`}
        >
          {canvasStatusLabel}
        </span>
      </div>

      <section
        data-testid="x4-ui-canvas-export-region"
        className="mt-2.5 rounded-md border border-emerald-500/30 bg-emerald-950/15 p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[11px] font-sans font-semibold text-emerald-300">
            Current PNG evidence export
          </h3>
          <button
            type="button"
            data-testid="x4-ui-canvas-export"
            disabled={!canvasExportReady || canvasExportBusy}
            onClick={onExportCanvas}
            className="rounded border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1 text-[11px] font-sans font-medium text-emerald-200 cursor-pointer disabled:cursor-not-allowed disabled:border-[#262c36] disabled:bg-transparent disabled:text-[#687385]"
          >
            Export current PNG
          </button>
        </div>

        <div data-testid="x4-ui-canvas-export-status" className="mt-2 break-words font-mono text-[11px] text-amber-200">
          {canvasExportStatusText}
        </div>

        <div data-testid="x4-ui-canvas-export-metadata" className="mt-2 grid grid-cols-1 gap-1.5 font-mono text-[11px] text-[#a0aab8] lg:grid-cols-2">
          <div data-testid="x4-ui-canvas-export-source">
            Source file: <span className="break-all text-[#eef2f7]">{selectedSourceFile} · sha256 {selectedSourceHash}</span>
          </div>
          <div data-testid="x4-ui-canvas-export-target">
            Target: <span className="break-all text-[#eef2f7]">{selectedTargetName} · id {selectedTargetId} · kind {selectedTargetKind}</span>
          </div>
          <div data-testid="x4-ui-canvas-export-profile">
            Profile: <span className="text-[#eef2f7]">{exportProfileId} · drawable {exportProfileWidth} × {exportProfileHeight} · Effective Helper scale {exportEffectiveScale}</span>
          </div>
          <div data-testid="x4-ui-canvas-export-native-bitmap">
            Native bitmap: <span data-testid="x4-ui-canvas-export-native-width" className="text-[#eef2f7]">{nativeBitmapWidth}</span> × <span data-testid="x4-ui-canvas-export-native-height" className="text-[#eef2f7]">{nativeBitmapHeight}</span>
          </div>
        </div>

        <div data-testid="x4-ui-canvas-export-boundary" className="mt-2 font-mono text-[11px] font-semibold text-amber-300">
          Preview evidence only · {gameTruth}
        </div>
      </section>

      <div
        data-testid="x4-ui-canvas-host"
        ref={canvasHostRef}
        className="mt-2.5 flex min-h-24 max-h-[70vh] items-start justify-start overflow-auto rounded border border-[#262c36] bg-[#090b0f] p-2.5"
      />
      <div data-testid="x4-ui-canvas-detail" className="mt-2 font-mono text-[11px] text-[#687385] break-words">
        {canvasDetail} · {gameTruth}
      </div>
    </section>
  );
}
