/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A tiny always-on FPS meter (50th pass, Phase 2). Samples frames via
 * requestAnimationFrame and reports the rolling rate ~2×/second as a fixed overlay
 * badge, so canvas/editor performance is objectively readable from a screenshot
 * (60 = smooth, dropping numbers = jank). Pointer-events-none so it never intercepts
 * clicks; high z-index so it stays visible over panels.
 */
import React, { useEffect, useRef, useState } from 'react';

export default function FpsMeter() {
  const [fps, setFps] = useState<number>(0);
  const frames = useRef(0);
  const last = useRef(performance.now());
  const raf = useRef<number>(0);

  useEffect(() => {
    const tick = (now: number) => {
      frames.current++;
      const elapsed = now - last.current;
      if (elapsed >= 500) {
        setFps(Math.round((frames.current * 1000) / elapsed));
        frames.current = 0;
        last.current = now;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  // green ≥ 55, amber 30–54, red < 30
  const color = fps >= 55 ? '#10b981' : fps >= 30 ? '#f59e0b' : '#ef4444';

  return (
    <div
      style={{
        position: 'fixed',
        left: 10,
        bottom: 10,
        zIndex: 9999,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
        padding: '5px 9px',
        borderRadius: 8,
        background: 'rgba(8,11,15,0.82)',
        border: `1px solid ${color}55`,
        color,
        letterSpacing: '0.04em',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        userSelect: 'none',
      }}
      title="Live frame rate (requestAnimationFrame-sampled). 60 ≈ smooth; lower = jank."
      data-testid="fps-meter"
    >
      <span style={{ marginRight: 6 }}>●</span>{fps} FPS
    </div>
  );
}
