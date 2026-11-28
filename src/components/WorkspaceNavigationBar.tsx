import React from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileCode,
  FolderGit2,
  GitFork,
  Globe,
  Layout,
  Map as MapIcon,
  Package,
  Plug,
  Scroll,
} from 'lucide-react';
import type { WorkspaceView } from '../lib/experienceMode';
import {
  WORKSPACE_NAV_ITEMS,
  visibleWorkspaceViews,
  type StudioLayoutPreferences,
} from '../lib/studioLayout';

const ICONS: Record<WorkspaceView, React.ComponentType<{ className?: string }>> = {
  blueprint: GitFork,
  aiscripts: Scroll,
  libraries: Package,
  'ui-designer': Layout,
  xmlpatch: FileCode,
  project: FolderGit2,
  galaxy: MapIcon,
  contracts: Plug,
  translation: Globe,
  wiki: BookOpen,
};

const VIEW_GROUPS: Record<WorkspaceView, 'logic' | 'data' | 'inspect'> = {
  blueprint: 'logic',
  aiscripts: 'logic',
  'ui-designer': 'logic',
  contracts: 'logic',
  libraries: 'data',
  xmlpatch: 'data',
  translation: 'data',
  project: 'inspect',
  galaxy: 'inspect',
  wiki: 'inspect',
};

interface WorkspaceNavigationBarProps {
  layout: StudioLayoutPreferences;
  activeView: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  onMove: (view: WorkspaceView, target: WorkspaceView | number) => void;
  onToggleCollapsed: () => void;
  mdErrorCount: number;
  mdWarningCount: number;
  trailing?: React.ReactNode;
}

export default function WorkspaceNavigationBar({
  layout,
  activeView,
  onNavigate,
  onMove,
  onToggleCollapsed,
  mdErrorCount,
  mdWarningCount,
  trailing,
}: WorkspaceNavigationBarProps) {
  const [dragged, setDragged] = React.useState<WorkspaceView | null>(null);
  const visible = visibleWorkspaceViews(layout);
  const isBottom = layout.workspaceDock === 'bottom';

  if (layout.workspaceBarCollapsed) {
    return (
      <div
        className={`shrink-0 h-8 px-2 flex items-center justify-between gap-2 bg-[#0e1117] ${isBottom ? 'border-t' : 'border-b'} border-white/[0.08]`}
      >
        <div data-testid="workspace-bar-collapsed" className="flex items-center">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="h-6 px-2.5 rounded inline-flex items-center gap-1 text-[11px] font-medium text-blue-300 hover:bg-blue-500/12 cursor-pointer"
            title="Show workspace navigation"
          >
            {isBottom ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Workspaces
          </button>
        </div>
        {trailing && <div className="shrink-0 flex items-center">{trailing}</div>}
      </div>
    );
  }

  return (
    <nav
      id="view_selection_modes"
      data-testid="workspace-navigation"
      data-dock={layout.workspaceDock}
      aria-label="Forge workspaces"
      className={`shrink-0 min-w-0 bg-[#0e1117] ${isBottom ? 'border-t' : 'border-b'} border-white/[0.08]`}
    >
      <div className="h-[34px] min-w-0 flex items-center gap-1 min-[1400px]:gap-1.5 px-2 min-[1400px]:px-2.5">
        <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto custom-scrollbar">
          {visible.map((id, index) => {
            const item = WORKSPACE_NAV_ITEMS.find(candidate => candidate.id === id)!;
            const Icon = ICONS[id];
            const active = activeView === id;
            const isMd = id === 'blueprint';
            const prevId = index > 0 ? visible[index - 1] : null;
            const showGroupSeparator = prevId !== null && VIEW_GROUPS[prevId] !== VIEW_GROUPS[id];

            const severityClass = isMd && mdErrorCount > 0
              ? active
                ? 'bg-rose-500/12 text-rose-200 border-b-2 border-b-rose-400 border-t-transparent border-x-transparent rounded-t-md rounded-b-none'
                : 'text-rose-300 border-transparent hover:bg-rose-500/10 rounded-md'
              : isMd && mdWarningCount > 0
                ? active
                  ? 'bg-amber-500/12 text-amber-200 border-b-2 border-b-amber-400 border-t-transparent border-x-transparent rounded-t-md rounded-b-none'
                  : 'text-amber-300 border-transparent hover:bg-amber-500/10 rounded-md'
                : active
                  ? 'bg-white/[0.05] text-[#eef2f7] border-b-2 border-b-blue-400 border-t-transparent border-x-transparent rounded-t-md rounded-b-none'
                  : 'text-[#94a3b8] border-transparent hover:text-[#eef2f7] hover:bg-white/[0.04] rounded-md';

            return (
              <React.Fragment key={id}>
                {showGroupSeparator && (
                  <span aria-hidden="true" className="hidden min-[1400px]:block h-3.5 w-px bg-white/[0.08] mx-1 shrink-0" />
                )}
                <button
                  type="button"
                  data-workspace-view={id}
                  aria-current={active ? 'page' : undefined}
                  draggable
                  onDragStart={() => setDragged(id)}
                  onDragEnd={() => setDragged(null)}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => {
                    event.preventDefault();
                    if (dragged && dragged !== id) {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const remaining = layout.workspaceOrder.filter(candidate => candidate !== dragged);
                      const targetIndex = remaining.indexOf(id);
                      onMove(dragged, targetIndex + (event.clientX > rect.left + rect.width / 2 ? 1 : 0));
                    }
                    setDragged(null);
                  }}
                  onClick={() => onNavigate(id)}
                  aria-label={item.label}
                  className={`h-[28px] shrink-0 border px-1.5 min-[1400px]:px-2 inline-flex items-center gap-1 min-[1400px]:gap-1.5 text-[11px] min-[1400px]:text-[11.5px] font-medium transition-colors cursor-pointer ${severityClass}`}
                  title={item.label}
                >
                  <Icon className="w-3 h-3 min-[1400px]:w-3.5 min-[1400px]:h-3.5 shrink-0" />
                  <span className={layout.density === 'compact' ? 'hidden xl:inline' : 'hidden lg:inline'}>
                    {item.label}
                  </span>
                  {isMd && (mdErrorCount > 0 || mdWarningCount > 0) && (
                    <span className={`w-1.5 h-1.5 rounded-full ${mdErrorCount > 0 ? 'bg-rose-400' : 'bg-amber-400'}`} />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        {trailing && <div className="shrink-0 flex items-center">{trailing}</div>}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="h-6 w-6 shrink-0 grid place-items-center rounded text-slate-400 hover:text-blue-300 hover:bg-white/5 cursor-pointer"
          title="Hide workspace navigation"
          data-testid="workspace-nav-collapse"
        >
          {isBottom ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>
    </nav>
  );
}
