import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Bug, Cpu, FolderGit2, Menu, PackageCheck, PanelBottom, PanelRight, Settings, Sparkles, Trash } from 'lucide-react';
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
  onOpenReleaseCenter?: () => void;
  onToggleBottomDock?: () => void;
  onToggleRightInspector?: () => void;
}

export default function StudioActionsMenu({
  expert,
  ai,
  agentOpen,
  nativeFiles,
  actions,
  onOpenReleaseCenter,
  onToggleBottomDock,
  onToggleRightInspector,
}: StudioActionsMenuProps) {
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
        if (document.activeElement === document.body) triggerRef.current?.focus({ preventScroll: true });
      }));
    }
  }

  function runExtra(fn?: () => void) {
    close();
    fn?.();
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
        className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-700/70 bg-[#0d1118] px-2.5 text-[11.5px] font-medium text-slate-200 hover:border-sky-500/45 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 cursor-pointer transition-colors"
      >
        <Menu aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        Studio actions
      </button>
      <div
        id={menuId}
        className={open
          ? 'studio-actions-popover min-[1200px]:contents'
          : 'hidden min-[1200px]:contents'}
      >
        {expert && <div data-global-action="native-project-files" className="mb-1 min-[1200px]:mb-0">{nativeFiles}</div>}
        {open && (
          <div role="group" aria-label="Studio actions" data-testid="studio-menu" className="min-[1200px]:studio-actions-popover space-y-0.5">
            {expert && (
              <>
                <div className="studio-menu-section-label">Project &amp; Delivery</div>
                <button
                  type="button"
                  data-global-action="sync-mod"
                  title="Load existing mods or push updates to GitHub"
                  onClick={() => select('sync-mod')}
                  className="studio-menu-item"
                >
                  <FolderGit2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                  Sync Mod
                </button>
                {onOpenReleaseCenter && (
                  <button
                    type="button"
                    onClick={() => runExtra(onOpenReleaseCenter)}
                    className="studio-menu-item"
                    title="Package mod for Nexus Mods or Steam Workshop"
                  >
                    <PackageCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    Release Center
                  </button>
                )}

                <div className="my-1 border-t border-slate-800/80" />
                <div className="studio-menu-section-label">Workbench &amp; Agents</div>
                {onToggleBottomDock && (
                  <button
                    type="button"
                    onClick={() => runExtra(onToggleBottomDock)}
                    className="studio-menu-item"
                  >
                    <PanelBottom aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="flex-1">Toggle Bottom Panel</span>
                    <span className="forge-kbd">Ctrl+J</span>
                  </button>
                )}
                {onToggleRightInspector && (
                  <button
                    type="button"
                    onClick={() => runExtra(onToggleRightInspector)}
                    className="studio-menu-item"
                  >
                    <PanelRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    Toggle Right Inspector
                  </button>
                )}
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
                      <span className="block truncate text-[10px] font-normal text-slate-400">
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
                  <Cpu aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                  Agent API
                </button>
              </>
            )}

            <div className="my-1 border-t border-slate-800/80" />
            <div className="studio-menu-section-label">Settings &amp; Support</div>
            <button
              type="button"
              data-global-action="settings"
              title="Manage all folders, layout preferences, release mode, and AI settings"
              onClick={() => select('settings')}
              className="studio-menu-item"
            >
              <Settings aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              Studio Settings
            </button>
            <button type="button" data-testid="report-bug-button" data-global-action="report-bug" onClick={() => select('report-bug')} className="studio-menu-item">
              <Bug aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              Report Bug
            </button>
            <button type="button" data-global-action="reset-workspace" onClick={() => select('reset-workspace')} className="studio-menu-item">
              <Trash aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-rose-400" />
              Reset Workspace…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
