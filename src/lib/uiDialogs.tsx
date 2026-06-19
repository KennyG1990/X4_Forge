/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * In-app, NON-BLOCKING replacement for native alert()/confirm()/prompt().
 *
 * Calibration finding L4: the app used blocking native dialogs (29 sites). Native dialogs
 * freeze the renderer, look unprofessional, and can't be driven by automation. This module
 * provides:
 *   - toast(message, kind?)            — fire-and-forget notification (replaces alert)
 *   - confirmDialog(message, opts?)    — Promise<boolean> (replaces confirm)
 *   - promptDialog(message, def?, opts?) — Promise<string|null> (replaces prompt)
 * plus <DialogHost/>, mounted once at the app root, that renders the toast stack and the
 * active confirm/prompt modal. window.alert is also globally routed to toast() in main.tsx,
 * so any stray/legacy alert() becomes a toast too.
 *
 * Pure module-level pub/sub (no external deps) so it's callable from anywhere, incl.
 * non-component code, without prop drilling.
 */

import { useEffect, useState } from 'react';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
export interface ToastItem { id: number; message: string; kind: ToastKind }

interface PromptRequest {
  id: number;
  message: string;
  kind: 'confirm' | 'prompt';
  defaultValue?: string;
  okLabel: string;
  cancelLabel: string;
  resolve: (value: boolean | string | null) => void;
}

type Listener = () => void;

let toasts: ToastItem[] = [];
let activeRequest: PromptRequest | null = null;
let seq = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(l => l());

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Fire-and-forget toast. Auto-dismisses. Replaces alert() for notifications. */
export function toast(message: string, kind: ToastKind = 'info', ttlMs = 4200): void {
  const id = seq++;
  toasts = [...toasts, { id, message: String(message ?? ''), kind }];
  emit();
  if (ttlMs > 0) setTimeout(() => dismissToast(id), ttlMs);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter(t => t.id !== id);
  emit();
}

/** In-app confirm. Resolves true (OK) / false (Cancel). Replaces confirm(). */
export function confirmDialog(
  message: string,
  opts?: { okLabel?: string; cancelLabel?: string },
): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    activeRequest = {
      id: seq++, message: String(message ?? ''), kind: 'confirm',
      okLabel: opts?.okLabel ?? 'OK', cancelLabel: opts?.cancelLabel ?? 'Cancel',
      resolve: v => resolve(v === true),
    };
    emit();
  });
}

/** In-app prompt. Resolves the entered string, or null if cancelled. Replaces prompt(). */
export function promptDialog(
  message: string,
  defaultValue = '',
  opts?: { okLabel?: string; cancelLabel?: string },
): Promise<string | null> {
  return new Promise<string | null>(resolve => {
    activeRequest = {
      id: seq++, message: String(message ?? ''), kind: 'prompt', defaultValue: String(defaultValue ?? ''),
      okLabel: opts?.okLabel ?? 'OK', cancelLabel: opts?.cancelLabel ?? 'Cancel',
      resolve: v => resolve(typeof v === 'string' ? v : null),
    };
    emit();
  });
}

function resolveActive(value: boolean | string | null): void {
  const req = activeRequest;
  activeRequest = null;
  emit();
  req?.resolve(value);
}

const KIND_STYLE: Record<ToastKind, { border: string; bar: string }> = {
  info:    { border: 'rgba(56,189,248,0.4)',  bar: '#38bdf8' },
  success: { border: 'rgba(16,185,129,0.4)',  bar: '#10b981' },
  warning: { border: 'rgba(245,158,11,0.45)', bar: '#f59e0b' },
  error:   { border: 'rgba(239,68,68,0.45)',  bar: '#ef4444' },
};

/** Mount ONCE near the app root. Renders the toast stack + the active confirm/prompt modal. */
export default function DialogHost() {
  const [, force] = useState(0);
  const [inputValue, setInputValue] = useState('');
  useEffect(() => subscribe(() => force(n => n + 1)), []);

  // keep the local input seeded when a prompt opens
  useEffect(() => {
    if (activeRequest?.kind === 'prompt') setInputValue(activeRequest.defaultValue ?? '');
    // reason: activeRequest is a module-level mutable (non-reactive) value; the input should be seeded only when a new request opens, identified by its stable id. kind/defaultValue are read once at open and adding them is redundant with id (and could re-seed mid-edit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRequest?.id]);

  const req = activeRequest;

  return (
    <>
      {/* toast stack */}
      <div style={{ position: 'fixed', top: 14, right: 14, zIndex: 100000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380, pointerEvents: 'none' }} data-testid="toast-host">
        {toasts.map(t => {
          const s = KIND_STYLE[t.kind];
          return (
            <div key={t.id} role="status" data-testid="toast"
              style={{ pointerEvents: 'auto', background: 'rgba(11,13,18,0.96)', border: `1px solid ${s.border}`, borderLeft: `3px solid ${s.bar}`, color: '#e2e8f0', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, fontFamily: 'system-ui, sans-serif', boxShadow: '0 4px 16px rgba(0,0,0,0.45)', cursor: 'pointer', lineHeight: 1.35 }}
              onClick={() => dismissToast(t.id)}>
              {t.message}
            </div>
          );
        })}
      </div>

      {/* confirm / prompt modal */}
      {req && (
        <div data-testid="dialog-modal"
          style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => resolveActive(req.kind === 'confirm' ? false : null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#0f1218', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 18, width: 460, maxWidth: '90vw', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', boxShadow: '0 10px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.45, marginBottom: 14, whiteSpace: 'pre-wrap' }}>{req.message}</div>
            {req.kind === 'prompt' && (
              <input autoFocus data-testid="dialog-input" value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') resolveActive(inputValue); if (e.key === 'Escape') resolveActive(null); }}
                style={{ width: '100%', boxSizing: 'border-box', background: '#0b0d12', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 6, color: '#e2e8f0', padding: '7px 9px', fontSize: 13, marginBottom: 14, fontFamily: 'monospace' }} />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button data-testid="dialog-cancel" onClick={() => resolveActive(req.kind === 'confirm' ? false : null)}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: '#cbd5e1', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer' }}>
                {req.cancelLabel}
              </button>
              <button data-testid="dialog-ok" autoFocus={req.kind === 'confirm'}
                onClick={() => resolveActive(req.kind === 'confirm' ? true : inputValue)}
                style={{ background: '#2563eb', border: '1px solid #2563eb', color: '#fff', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
                {req.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
