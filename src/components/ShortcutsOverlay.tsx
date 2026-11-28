/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * B13 (audit #5) — keyboard-shortcuts documentation surface. Every shortcut the app
 * binds, in one discoverable place: press "?" anywhere (outside an input) or click
 * the keyboard button in the header. This file is the single source of truth for the
 * list — when a new binding is added elsewhere, add its row here in the same task.
 */

import { Keyboard } from 'lucide-react';
import { STUDIO_SHORTCUTS } from '../lib/forgeKnowledge';
import { ModalShell } from './ui';

const SHORTCUTS = STUDIO_SHORTCUTS;

const Key = ({ k }: { k: string }) => (
  <kbd className="px-1.5 py-0.5 rounded border border-white/15 bg-white/[0.06] text-[11px] font-mono text-slate-200 shadow-[0_1px_0_rgba(255,255,255,0.06)]">
    {k}
  </kbd>
);

export default function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell
      title="Keyboard shortcuts"
      icon={<Keyboard className="w-4 h-4 text-sky-400" />}
      onClose={onClose}
      dataTestId="shortcuts-overlay"
      closeButtonTestId="shortcuts-close-btn"
      closeButtonTitle="Close (Esc)"
      maxWidthClass="max-w-[460px]"
      zIndexClass="z-[200]"
      bodyClassName="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4"
      footer={(
        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
          Press <Key k="?" /> anywhere outside an input to reopen this list.
        </div>
      )}
    >
      <table className="w-full">
        <tbody>
          {SHORTCUTS.map((s, i) => (
            <tr key={i} className="border-t first:border-t-0 border-white/[0.06]">
              <td className="py-2 pr-3 whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  {s.keys.map((k, j) => (
                    <span key={j} className="inline-flex items-center gap-1">
                      {j > 0 && <span className="text-slate-500 text-[11px]">+</span>}
                      <Key k={k} />
                    </span>
                  ))}
                </span>
              </td>
              <td className="py-2 text-xs text-slate-200">{s.what}</td>
              <td className="py-2 pl-2 text-[11px] font-mono text-slate-400 text-right whitespace-nowrap">
                {s.where}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ModalShell>
  );
}
