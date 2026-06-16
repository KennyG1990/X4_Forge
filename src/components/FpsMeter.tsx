/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A tiny always-on performance overlay (50th pass, Phase 2; H4 supplement 2026-06-16).
 *
 * IMPORTANT — what this is and is NOT (H4): the FPS number is a *cadence* indicator,
 * sampled from requestAnimationFrame deltas (mainly main-thread paint cadence). A green
 * 60 means the rAF loop is keeping up; it does NOT prove "no perf problems" — it can miss
 * off-loop cost (network round-trips, React commit/layout thrash) and brief main-thread
 * stalls that the ~2×/sec average smooths over.
 *
 * To stop a green number from hiding jank, this overlay ALSO observes main-thread
 * `longtask` entries (>50ms blocks) via PerformanceObserver where supported, and surfaces
 * the worst recent longtask as a ⚠ badge. So: FPS = cadence; ⚠ = a real main-thread stall
 * the FPS average would otherwise paper over.
 *
 * Pointer-events-none so it never intercepts clicks; high z-index so it stays visible.
 */
import React, { useEffect, useRef, useState } from 'react';

const LONGTASK_WINDOW_MS = 2000; // how long a longtask stays flagged

export default function FpsMeter() {
  const [fps, setFps] = useState<number>(0);
  const [longtaskMs, setLongtaskMs] = useState<number>(0);
  const frames = useRef(0);
  const last = useRef(performance.now());
  const raf = useRef<number>(0);
  const lastLongtaskAt = useRef<number>(0);
  const worstLongtask = useRef<number>(0);

  useEffect(() => {
    const tick = (now: number) => {
      frames.current++;
      const elapsed = now - last.current;
      if (elapsed >= 500) {
        setFps(Math.round((frames.current * 1000) / elapsed));
        frames.current = 0;
        last.current = now;
        // Expire the longtask flag once its window has passed.
        if (worstLongtask.current > 0 && now - lastLongtaskAt.current > LONGTASK_WINDOW_MS) {
          worstLongtask.current = 0;
          setLongtaskMs(0);
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    // PerformanceObserver longtask supplement — not all engines support 'longtask'
    // (Chromium does), so guard and degrade gracefully to the FPS-only overlay.
    let observer: PerformanceObserver | null = null;
    try {
      if (typeof PerformanceObserver !== 'undefined'
          && (PerformanceObserver as any).supportedEntryTypes?.includes('longtask')) {
        observer = new PerformanceObserver(list => {
          let worst = 0;
          for (const entry of list.getEntries()) worst = Math.max(worst, entry.duration);
          if (worst > 0) {
            lastLongtaskAt.current = performance.now();
            worstLongtask.current = Math.max(worstLongtask.current, Math.round(worst));
            setLongtaskMs(worstLongtask.current);
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
      }
    } catch {
      /* longtask observation unsupported — FPS-only overlay */
    }

    return () => {
      cancelAnimationFrame(raf.current);
      observer?.disconnect();
    };
  }, []);

  // green ≥ 55, amber 30–54, red < 30
  const color = fps >= 55 ? '#10b981' : fps >= 30 ? '#f59e0b' : '#ef4444';
  // longtask severity: amber 50–199ms, red ≥ 200ms
  const ltColor = longtaskMs >= 200 ? '#ef4444' : '#f59e0b';

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
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      title={
        'FPS = rAF-sampled paint cadence (60 ≈ smooth). It is a cadence indicator, not a full profiler — '
        + 'it can miss network/off-loop cost. ⚠ flags a recent main-thread longtask (>50ms stall) the FPS average would hide.'
      }
      data-testid="fps-meter"
    >
      <span><span style={{ marginRight: 6 }}>●</span>{fps} FPS</span>
      {longtaskMs > 0 && (
        <span style={{ color: ltColor }} data-testid="fps-longtask">⚠ {longtaskMs}ms</span>
      )}
    </div>
  );
}
