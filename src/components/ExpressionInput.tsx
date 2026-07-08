/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ExpressionInput — a text input with Gmail-style completion for MD expressions
 * (beta-UX pass, 2026-07-09). Typing `$station.` pops the REAL legal properties from
 * scriptproperties.xml with docs; cue-reference fields get the workspace's own cue
 * names + the engine keywords. Keyboard: ↑/↓ select, Enter/Tab accept, Esc dismiss.
 * Falls back to a plain input silently when the server index is unavailable.
 */

import React, { useEffect, useRef, useState } from 'react';

export interface LocalSuggestion { insert: string; label: string; detail?: string }

interface ExpressionInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** static, client-side suggestions (e.g. cue names) shown when the field is short/plain */
  localSuggestions?: LocalSuggestion[];
  /** enable server-side property-chain completion (default true) */
  chainCompletion?: boolean;
}

const INPUT_CLASS = 'w-full p-1.5 rounded bg-black/60 border border-white/10 text-white focus:outline-none focus:border-cyan-500';

const ExpressionInput: React.FC<ExpressionInputProps> = ({ value, onChange, placeholder, className, localSuggestions, chainCompletion = true }) => {
  const [items, setItems] = useState<LocalSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const seqRef = useRef(0);

  const refresh = (text: string, caret: number) => {
    // local (cue-name etc.) suggestions: prefix match on the whole value
    const local = (localSuggestions || [])
      .filter(s => !text || s.insert.toLowerCase().startsWith(text.toLowerCase()))
      .slice(0, 12);
    if (local.length && !text.includes('.')) {
      setItems(local);
      setOpen(true);
      setActive(0);
      return;
    }
    if (!chainCompletion || !text.includes('.')) { setOpen(false); return; }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const seq = ++seqRef.current;
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/agent/suggest/expression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, caret }),
        });
        if (!res.ok || seq !== seqRef.current) return;
        const data = await res.json();
        const next: LocalSuggestion[] = (data.suggestions || []).map((s: LocalSuggestion) => ({ insert: s.insert, label: s.label, detail: s.detail }));
        setItems(next);
        setOpen(next.length > 0);
        setActive(0);
      } catch { setOpen(false); }
    }, 140);
  };

  useEffect(() => () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); }, []);

  const accept = (s: LocalSuggestion) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? value.length;
    const upTo = value.slice(0, caret);
    const rest = value.slice(caret);
    // replace the partial segment being typed (after the last dot), or the whole
    // value for local (non-chain) suggestions
    const dotIdx = upTo.lastIndexOf('.');
    const next = dotIdx >= 0 && upTo.slice(dotIdx + 1).match(/^[A-Za-z_]?\w*$/)
      ? upTo.slice(0, dotIdx + 1) + s.insert + rest
      : s.insert + rest;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => el?.focus());
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        data-testid="expression-input"
        className={className || INPUT_CLASS}
        onChange={e => {
          onChange(e.target.value);
          refresh(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (!open || !items.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(items[active]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {open && items.length > 0 && (
        <div
          data-testid="expression-suggestions"
          className="absolute left-0 right-0 top-full mt-0.5 z-50 max-h-56 overflow-y-auto rounded border border-cyan-500/30 bg-[#0a0d14] shadow-2xl"
        >
          {items.map((s, i) => (
            <button
              key={s.insert + i}
              type="button"
              onMouseDown={e => { e.preventDefault(); accept(s); }}
              className={`w-full text-left px-2 py-1 font-mono text-[10px] flex flex-col gap-0.5 ${
                i === active ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <span className="font-bold">{s.label}</span>
              {s.detail && <span className="text-[9px] text-slate-500 leading-tight truncate">{s.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExpressionInput;
