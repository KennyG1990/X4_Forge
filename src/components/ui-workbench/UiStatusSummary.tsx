/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Concept A top status summary cards for the HUD & Lua UI Workbench (`UI-P4`).
 * Keeps card text >= 11px and lets multi-segment lint summaries wrap cleanly
 * inside `min-w-0` cards so adjacent cards never overlap.
 */

import React from 'react';

export interface UiStatusFindingItem {
  readonly line?: number;
  readonly code?: string;
  readonly severity: 'error' | 'warning' | 'info' | string;
  readonly message: string;
}

export interface UiLintStatusCardProps {
  readonly testId: 'ui-generated-lint-status' | 'ui-custom-lint-status';
  readonly title: string;
  readonly statusText: string;
  readonly statusClass: string;
  readonly filePath: string;
  readonly axisText: string;
  readonly findings: ReadonlyArray<UiStatusFindingItem>;
}

export function UiLintStatusCard({
  testId,
  title,
  statusText,
  statusClass,
  filePath,
  axisText,
  findings,
}: UiLintStatusCardProps) {
  return (
    <div
      data-testid={testId}
      className="rounded-md border border-[#262c36] bg-[#11141a] px-2.5 py-2 min-w-0 overflow-hidden"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 min-w-0">
        <span className="text-[11px] font-sans font-semibold text-[#a0aab8]">
          {title}
        </span>
        <span className={`shrink-0 text-[11px] font-semibold text-right ${statusClass}`}>
          {statusText}
        </span>
      </div>
      <div className="mt-1 font-mono text-[11px] text-[#687385] truncate" title={filePath}>
        {filePath}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-[#a0aab8] break-words leading-snug">
        {axisText}
      </div>
      {findings.length > 0 && (
        <div className="mt-1.5 max-h-16 overflow-y-auto custom-scrollbar pr-1 space-y-0.5 break-words whitespace-pre-wrap font-mono text-[11px] leading-snug">
          {findings.slice(0, 3).map((fd, idx) => (
            <div
              key={`${testId}-${idx}`}
              className={
                fd.severity === 'error'
                  ? 'text-rose-300'
                  : fd.severity === 'warning'
                    ? 'text-amber-300'
                    : 'text-[#a0aab8]'
              }
            >
              {filePath}
              {fd.line ? `:${fd.line}` : ''} {fd.code ? `${fd.code} ` : ''}
              {fd.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface UiGeometryStatusCardProps {
  readonly widgetErrors: number;
  readonly widgetWarns: number;
  readonly widgetCount: number;
  readonly gridRows: number;
  readonly gridCols: number;
  readonly findings: ReadonlyArray<{ readonly severity: string; readonly message: string }>;
}

export function UiGeometryStatusCard({
  widgetErrors,
  widgetWarns,
  widgetCount,
  gridRows,
  gridCols,
  findings,
}: UiGeometryStatusCardProps) {
  return (
    <div
      data-testid="ui-geometry-status"
      className="rounded-md border border-[#262c36] bg-[#11141a] px-2.5 py-2 min-w-0 overflow-hidden"
      title="Pixel geometry summary for the design map only; not an X4 renderer."
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 min-w-0">
        <span className="text-[11px] font-sans font-semibold text-[#a0aab8]">
          Geometry design map
        </span>
        <span
          className={`shrink-0 text-[11px] font-semibold ${
            widgetErrors > 0 ? 'text-rose-400' : widgetWarns > 0 ? 'text-amber-400' : 'text-emerald-400'
          }`}
        >
          {widgetErrors > 0 || widgetWarns > 0
            ? `${widgetErrors} geometry errors · ${widgetWarns} warnings`
            : 'No geometry issues detected'}
        </span>
      </div>
      <div className="mt-1 font-mono text-[11px] text-[#687385] break-words leading-snug">
        {widgetCount > 0 ? `Legacy pixel map ${gridRows}×${gridCols}` : 'No widgets in design map'}
      </div>
      {findings.slice(0, 2).map((fd, idx) => (
        <div
          key={`geometry-${idx}`}
          className={`mt-1 font-mono text-[11px] break-words leading-snug ${
            fd.severity === 'error' ? 'text-rose-300' : 'text-amber-300'
          }`}
        >
          {fd.message}
        </div>
      ))}
    </div>
  );
}
