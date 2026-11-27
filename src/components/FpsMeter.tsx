/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Frame cadence & longtask (>50ms main-thread stall) telemetry indicator.
 * Supports docked rendering inside the IDE status bar (default, eliminating bottom-left
 * Canvas minimap collisions) as well as standalone floating overlay rendering.
 */
import React, { useEffect, useRef, useState } from 'react';
import { isWebviewPerformanceCollecting, recordWebviewFrame, recordWebviewLongTask, setWebviewPerformanceSupport } from '../lib/webviewPerformance';

const LONGTASK_WINDOW_MS = 2000;

interface FpsMeterProps {
  variant?: 'docked' | 'floating';
}

export default function FpsMeter({ variant = 'docked' }: FpsMeterProps) {
  const [fps, setFps] = useState<number>(0);
  const [longtaskMs, setLongtaskMs] = useState<number>(0);
  const frames = useRef(0);
  const last = useRef(performance.now());
  const raf = useRef<number>(0);
  const lastLongtaskAt = useRef<number>(0);
  const worstLongtask = useRef<number>(0);

  useEffect(() => {
    let disposed = false;
    const visibility = (): 'visible' | 'hidden' | 'unknown' => document.visibilityState === 'visible' ? 'visible' : document.visibilityState === 'hidden' ? 'hidden' : 'unknown';
    let frameWindowVisible = visibility() === 'visible';
    let visibleSince = frameWindowVisible ? performance.now() : Infinity;
    const visibilityChanged = () => {
      frameWindowVisible = false;
      const current = visibility();
      visibleSince = current === 'visible' ? performance.now() : Infinity;
      setWebviewPerformanceSupport({ visibility: current, frames: current === 'visible' ? 'observing' : 'paused' });
    };
    setWebviewPerformanceSupport({ frames: frameWindowVisible ? 'observing' : 'paused', visibility: visibility(), longTasks: 'unsupported' });
    document.addEventListener('visibilitychange', visibilityChanged);
    const tick = (now: number) => {
      if (disposed) return;
      frames.current++;
      const elapsed = now - last.current;
      if (elapsed >= 500) {
        setFps(Math.round((frames.current * 1000) / elapsed));
        if (isWebviewPerformanceCollecting()) {
          let jsHeapUsedBytes: number | null = null;
          try {
            const heap = (performance as Performance & { memory?: { usedJSHeapSize?: unknown } }).memory?.usedJSHeapSize;
            if (typeof heap === 'number' && Number.isFinite(heap) && heap >= 0) jsHeapUsedBytes = heap;
          } catch { /* optional Chromium estimate, never process RSS */ }
          const visible = frameWindowVisible && visibility() === 'visible';
          recordWebviewFrame({
            fps: visible ? frames.current * 1000 / elapsed : null,
            frameIntervalMs: visible ? elapsed / frames.current : null,
            jsHeapUsedBytes,
            visibility: visibility(),
          });
        }
        frameWindowVisible = visibility() === 'visible';
        frames.current = 0;
        last.current = now;
        if (worstLongtask.current > 0 && now - lastLongtaskAt.current > LONGTASK_WINDOW_MS) {
          worstLongtask.current = 0;
          setLongtaskMs(0);
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    let observer: PerformanceObserver | null = null;
    try {
      if (typeof PerformanceObserver !== 'undefined'
          && (PerformanceObserver as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes?.includes('longtask')) {
        observer = new PerformanceObserver(list => {
          if (disposed) return;
          let worst = 0;
          for (const entry of list.getEntries()) {
            worst = Math.max(worst, entry.duration);
            recordWebviewLongTask(entry.duration, visibility() === 'visible' && entry.startTime >= visibleSince);
          }
          if (worst > 0) {
            lastLongtaskAt.current = performance.now();
            worstLongtask.current = Math.max(worstLongtask.current, Math.round(worst));
            setLongtaskMs(worstLongtask.current);
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
        setWebviewPerformanceSupport({ longTasks: 'supported' });
      }
    } catch {
      /* longtask observation unsupported — FPS-only indicator */
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf.current);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
      setWebviewPerformanceSupport({ frames: 'not-attached', visibility: 'unknown', longTasks: 'not-attached', heap: 'not-sampled' });
    };
  }, []);

  const color = fps >= 55 ? '#34d399' : fps >= 30 ? '#fbbf24' : '#f87171';
  const ltColor = longtaskMs >= 200 ? '#f87171' : '#fbbf24';
  const tooltip = 'FPS = rAF-sampled paint cadence (60 ≈ smooth). Cadence indicator, not a full profiler. ⚠ flags a recent main-thread longtask (>50ms stall).';

  if (variant === 'docked') {
    return (
      <div
        data-testid="fps-meter"
        title={tooltip}
        className="inline-flex items-center gap-2 px-2 py-0.5 font-mono text-[11px] font-medium select-none shrink-0"
        style={{ color }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="text-[9px]">●</span>
          <span>{fps} FPS</span>
        </span>
        {longtaskMs > 0 && (
          <span style={{ color: ltColor }} data-testid="fps-longtask">
            ⚠ {longtaskMs}ms
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: 10,
        bottom: 34,
        zIndex: 9999,
        pointerEvents: 'none',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        padding: '4px 8px',
        borderRadius: 6,
        background: 'rgba(11, 14, 20, 0.88)',
        border: `1px solid ${color}44`,
        color,
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      title={tooltip}
      data-testid="fps-meter"
    >
      <span><span style={{ marginRight: 5 }}>●</span>{fps} FPS</span>
      {longtaskMs > 0 && (
        <span style={{ color: ltColor }} data-testid="fps-longtask">⚠ {longtaskMs}ms</span>
      )}
    </div>
  );
}
