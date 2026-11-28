import React from 'react';
import { Crosshair, RotateCcw } from 'lucide-react';
import {
  formatPosition,
  padFromPosition,
  parsePosition,
  positionFromPad,
  updatePositionAxis,
  type SpawnPosition,
} from '../lib/positionPicker';

interface PositionPickerProps {
  value: unknown;
  onChange: (value: string) => void;
  nodeTag?: string;
}

const PRESETS: Array<{ label: string; value: SpawnPosition }> = [
  { label: 'Origin', value: { x: 0, y: 0, z: 0 } },
  { label: 'Ahead', value: { x: 0, y: 0, z: 1000 } },
  { label: 'High', value: { x: 0, y: 2500, z: 0 } },
  { label: 'Far', value: { x: 5000, y: 0, z: 5000 } },
];

export default function PositionPicker({ value, onChange, nodeTag }: PositionPickerProps) {
  const parsed = parsePosition(value);
  const pad = padFromPosition(value);
  const pos = parsed.position;
  const isStation = nodeTag === 'create_station';

  const updateAxis = (axis: keyof SpawnPosition, raw: string) => {
    onChange(updatePositionAxis(value, axis, Number(raw)));
  };

  const handlePadPointer = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    onChange(positionFromPad(value, px, py));
  };

  return (
    <div className="space-y-2 rounded border border-[#262c36] bg-[#11141a] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-[#93c5fd]">
          <Crosshair className="h-3.5 w-3.5" />
          {isStation ? 'Station Position' : 'Spawn Position'}
        </div>
        <button
          type="button"
          onClick={() => onChange(formatPosition({ x: 0, y: 0, z: isStation ? 5000 : 1000 }))}
          title="Reset to safe default offset"
          className="rounded border border-[#262c36] bg-[#171b23] p-1 text-[#a0aab8] hover:border-[#3b82f6]/50 hover:text-[#eef2f7] cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <button
        type="button"
        data-testid="position-picker-pad"
        onPointerDown={handlePadPointer}
        onPointerMove={(e) => { if (e.buttons === 1) handlePadPointer(e); }}
        className="relative h-28 w-full overflow-hidden rounded border border-[#262c36] bg-[#0a0c10] cursor-crosshair"
        title="Click or drag to set X/Z offset"
      >
        <div className="absolute left-1/2 top-0 h-full w-px bg-[#3b82f6]/20" />
        <div className="absolute left-0 top-1/2 h-px w-full bg-[#3b82f6]/20" />
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#3b82f6]/45" />
        <div
          data-testid="position-picker-marker"
          className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300 bg-emerald-400/25 shadow-[0_0_12px_rgba(52,211,153,0.7)]"
          style={{ left: `${pad.x * 100}%`, top: `${pad.y * 100}%` }}
        />
        <span className="absolute left-1.5 top-1 text-[11px] font-mono text-[#687385]">-X -Z</span>
        <span className="absolute bottom-1 right-1.5 text-[11px] font-mono text-[#687385]">+X +Z</span>
      </button>

      <div className="grid grid-cols-3 gap-1.5">
        {(['x', 'y', 'z'] as Array<keyof SpawnPosition>).map(axis => (
          <label key={axis} className="space-y-1">
            <span className="block text-[11px] font-mono font-semibold uppercase text-[#687385]">{axis.toUpperCase()}</span>
            <input
              data-testid={`position-picker-${axis}`}
              type="number"
              value={pos[axis]}
              onChange={e => updateAxis(axis, e.target.value)}
              className="w-full rounded border border-[#262c36] bg-[#0a0c10] px-2 py-1 text-[11px] text-[#eef2f7] focus:border-[#3b82f6] focus:outline-none"
            />
          </label>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1">
        {PRESETS.map(preset => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(formatPosition(preset.value))}
            className="rounded border border-[#262c36] bg-[#171b23] px-1.5 py-1 text-[11px] font-mono font-semibold uppercase text-[#a0aab8] hover:border-[#3b82f6]/50 hover:text-[#eef2f7] cursor-pointer"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {!parsed.valid && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          Invalid coordinate text. Picker is previewing 0,0,0 until the value is corrected.
        </div>
      )}
    </div>
  );
}
