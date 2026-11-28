/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Concept A profile & display scaling controls for X4UiSourceEditor (`UI-P4`).
 * Gives `Source Editor scale mode` its own full-width row so labels never clip at 1280x800.
 */

import React from 'react';

export interface UiDisplayProfileFormProps {
  readonly width: number | null;
  readonly height: number | null;
  readonly scaleMode: string;
  readonly scaleModeDerivedValue: string;
  readonly scaleModeCustomValue: string;
  readonly userScale: number;
  readonly uiScale: number | null;
  readonly profileId: string;
  readonly truthGrade: string;
  readonly formattedWidth: string;
  readonly formattedHeight: string;
  readonly formattedScale: string;
  readonly gameTruth: string;
  readonly onUpdateDimension: (field: 'width' | 'height' | 'uiScale', raw: string) => void;
  readonly onUpdateScaleMode: (value: string) => void;
  readonly onUpdateUserScale: (raw: string) => void;
}

const INPUT_CLS =
  'w-full min-w-0 rounded border border-[#262c36] bg-[#0a0c10] px-2.5 py-1.5 text-[11px] text-[#eef2f7] focus:outline-none focus:border-[#3b82f6] disabled:opacity-55 disabled:cursor-not-allowed';

export function UiDisplayProfileForm({
  width,
  height,
  scaleMode,
  scaleModeDerivedValue,
  scaleModeCustomValue,
  userScale,
  uiScale,
  profileId,
  truthGrade,
  formattedWidth,
  formattedHeight,
  formattedScale,
  gameTruth,
  onUpdateDimension,
  onUpdateScaleMode,
  onUpdateUserScale,
}: UiDisplayProfileFormProps) {
  return (
    <section
      data-testid="x4-ui-profile-region"
      className="rounded-lg border border-[#262c36] bg-[#11141a] p-3.5 min-w-0"
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h2 className="text-xs font-sans font-semibold text-[#eef2f7]">Profile controls</h2>
        <span data-testid="x4-ui-profile-truth" className="text-[11px] font-medium text-amber-300 truncate">
          {truthGrade}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1 text-[11px] font-sans text-[#a0aab8]">
          Drawable width
          <input
            data-testid="x4-ui-profile-width"
            type="number"
            min="0.000001"
            step="any"
            value={width === null ? '' : width}
            onChange={event => onUpdateDimension('width', event.target.value)}
            className={`${INPUT_CLS} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-sans text-[#a0aab8]">
          Drawable height
          <input
            data-testid="x4-ui-profile-height"
            type="number"
            min="0.000001"
            step="any"
            value={height === null ? '' : height}
            onChange={event => onUpdateDimension('height', event.target.value)}
            className={`${INPUT_CLS} font-mono`}
          />
        </label>
      </div>

      <div className="mt-2.5">
        <label className="flex flex-col gap-1 text-[11px] font-sans text-[#a0aab8]">
          Source Editor scale mode
          <select
            data-testid="x4-ui-profile-scale-mode"
            value={scaleMode}
            onChange={event => onUpdateScaleMode(event.target.value)}
            className={INPUT_CLS}
          >
            <option value={scaleModeDerivedValue}>Derived from X4 user scale</option>
            <option value={scaleModeCustomValue}>Custom effective Helper scale</option>
          </select>
        </label>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1 text-[11px] font-sans text-[#a0aab8]">
          X4 user scale factor
          <input
            data-testid="x4-ui-profile-user-scale"
            type="number"
            min="0.000001"
            step="any"
            value={userScale}
            onChange={event => onUpdateUserScale(event.target.value)}
            className={`${INPUT_CLS} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-sans text-[#a0aab8]">
          Effective Helper scale
          <input
            data-testid="x4-ui-profile-scale"
            type="number"
            min="0.000001"
            step="any"
            value={uiScale === null ? '' : uiScale}
            disabled={scaleMode !== scaleModeCustomValue}
            onChange={event => onUpdateDimension('uiScale', event.target.value)}
            className={`${INPUT_CLS} font-mono`}
          />
        </label>
      </div>

      <div data-testid="x4-ui-profile-scale-derivation" className="mt-2.5 text-[11px] font-sans text-[#687385] leading-relaxed">
        Derived effective Helper scale = X4 user scale × drawable height ÷ 1080. Drawable width does not affect the derived value. Custom mode retains its effective value across height changes.
      </div>
      <div className="mt-1.5 text-[11px] font-mono text-[#687385] break-words">
        Profile: <span>{profileId}</span> · drawable {formattedWidth} × {formattedHeight} · effective Helper scale {formattedScale} · {gameTruth}
      </div>
    </section>
  );
}
