import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Bug, Cpu, FolderGit2, Menu, Settings, Sparkles, Trash } from 'lucide-react';
import type { GLOBAL_ACTION_IDS } from '../lib/studioLayout';

export type StudioMenuAction = Extract<(typeof GLOBAL_ACTION_IDS)[number],
  'sync-mod' | 'ai-settings' | 'agent-api' | 'report-bug' | 'settings' | 'reset-workspace'
>;

interface StudioActionsMenuProps {
  expert: boolean;
  ai: { provider: string; model: string; reasoning: string } | null;
  agentOpen: boolean;
  nativeFiles: ReactNode;
  actions: Record<StudioMenuAction, () => void | Promise<void>>;
}

export default function StudioActionsMenu({ expert, ai, agentOpen, nativeFiles, actions }: StudioActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  function select(action: StudioMenuAction) {
    close();
    const pending = actions[action]();
    if (pending) {
      void pending.then(() => requestAnimationFrame(() => {
        // A confirmed or canceled dialog can unmount its focused button.
        // Restore the launcher only when the dialog left focus on the document.
        if (document.activeElement === document.body) triggerRef.current?.focus({ preventScroll: true });
      }));
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative flex shrink-0 items-center gap-1.5"
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={event => {
        if (!open || event.key !== 'Escape' || event.defaultPrevented || event.target instanceof HTMLSelectElement) return;
        event.preventDefault();
        close();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        data-testid="studio-menu-button"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(value => !value)}
        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded border border-white/10 bg-black/40 px-2 text-[11px] font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <Menu aria-hidden="true" className="h-4 w-4 shrink-0" />
        Studio actions
      </button>
      <div id={menuId} className={open
        ? 'studio-actions-popover min-[1200px]:contents'
        : 'hidden min-[1200px]:contents'}
      >
        {expert && <div data-global-action="native-project-files" className="mb-1 min-[1200px]:mb-0">{nativeFiles}</div>}
        {open && (
          <div role="group" aria-label="Studio actions" data-testid="studio-menu" className="min-[1200px]:studio-actions-popover">
            {expert && (
              <>
                <button
                  type="button"
                  data-global-action="sync-mod"
                  title="Load existing mods or push updates to GitHub"
                  onClick={() => select('sync-mod')}
                  className="studio-menu-item"
                >
                  <FolderGit2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Sync Mod
                </button>
                {ai && (
                  <button
                    type="button"
                    data-global-action="ai-settings"
                    title={'Configure AI: Active Engine: ' + ai.provider.toUpperCase() + ' | Model: ' + ai.model + ' | Reasoning: ' + ai.reasoning}
                    onClick={() => select('ai-settings')}
                    className="studio-menu-item"
                  >
                    <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span className="min-w-0">
                      AI Engine
                      <span className="block truncate font-normal normal-case text-slate-400">
                        {ai.provider.toUpperCase()} · {ai.model}{ai.reasoning !== 'none' && ' · ' + ai.reasoning + ' reasoning'}
                      </span>
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  data-global-action="agent-api"
                  aria-pressed={agentOpen}
                  title="Open External AI Agent API Control panel and documentation"
                  onClick={() => select('agent-api')}
                  className="studio-menu-item"
                >
                  <Cpu aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Agent API
                </button>
              </>
            )}
            <button type="button" data-testid="report-bug-button" data-global-action="report-bug" onClick={() => select('report-bug')} className="studio-menu-item">
              <Bug aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              Report Bug
            </button>
            <button
              type="button"
              data-global-action="settings"
              title="Manage all folders the studio uses (Mod Workspace, X4 game path, schema)"
              onClick={() => select('settings')}
              className="studio-menu-item"
            >
              <Settings aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              Studio Settings
            </button>
            <button type="button" data-global-action="reset-workspace" onClick={() => select('reset-workspace')} className="studio-menu-item">
              <Trash aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-red-300" />
              Reset Workspace…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
