/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * B13 (audit #5) — keyboard-shortcuts documentation surface. Every shortcut the app
 * binds, in one discoverable place: press "?" anywhere (outside an input) or click
 * the keyboard button in the header. This file is the single source of truth for the
 * list — when a new binding is added elsewhere, add its row here in the same task.
 */

import { X, Keyboard } from 'lucide-react';
import { STUDIO_SHORTCUTS } from '../lib/forgeKnowledge';

const SHORTCUTS = STUDIO_SHORTCUTS;

const Key = ({ k }: { k: string }) => (
  <kbd className="px-1.5 py-0.5 rounded border border-white/20 bg-white/10 text-[10px] font-mono text-slate-200 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
    {k}
  </kbd>
);

export default function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      data-testid="shortcuts-overlay"
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[440px] max-w-[92vw] rounded-lg border border-white/15 bg-[#161920] p-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <Keyboard className="w-4 h-4 text-cyan-400" />
          <h2 className="text-[12px] font-bold font-mono uppercase tracking-wider text-cyan-300">
            Keyboard shortcuts
          </h2>
          <button
            onClick={onClose}
            data-testid="shortcuts-close-btn"
            className="ml-auto p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/10 cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <table className="w-full">
          <tbody>
            {SHORTCUTS.map((s, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {s.keys.map((k, j) => (
                      <span key={j} className="inline-flex items-center gap-1">
                        {j > 0 && <span className="text-slate-600 text-[10px]">+</span>}
                        <Key k={k} />
                      </span>
                    ))}
                  </span>
                </td>
                <td className="py-1.5 text-[12px] text-slate-300">{s.what}</td>
                <td className="py-1.5 pl-2 text-[10px] font-mono uppercase text-slate-600 text-right whitespace-nowrap">
                  {s.where}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-[10px] text-slate-600 font-mono">
          Press <Key k="?" /> anywhere to reopen this list.
        </div>
      </div>
    </div>
  );
}
