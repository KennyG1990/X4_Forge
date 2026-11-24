import React from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileCode,
  FolderGit2,
  GitFork,
  Globe,
  GripVertical,
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
}

export default function WorkspaceNavigationBar({
  layout,
  activeView,
  onNavigate,
  onMove,
  onToggleCollapsed,
  mdErrorCount,
  mdWarningCount,
}: WorkspaceNavigationBarProps) {
  const [dragged, setDragged] = React.useState<WorkspaceView | null>(null);
  const visible = visibleWorkspaceViews(layout);
  const isBottom = layout.workspaceDock === 'bottom';

  if (layout.workspaceBarCollapsed) {
    return (
      <div
        data-testid="workspace-bar-collapsed"
        className={`shrink-0 flex justify-center bg-[#10151e] ${isBottom ? 'border-t' : 'border-b'} border-slate-800/80`}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="h-5 px-3 inline-flex items-center gap-1 text-[10.5px] font-medium text-sky-400 hover:bg-sky-500/10 cursor-pointer"
          title="Show workspace navigation"
        >
          {isBottom ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Workspaces
        </button>
      </div>
    );
  }

  return (
    <nav
      id="view_selection_modes"
      data-testid="workspace-navigation"
      data-dock={layout.workspaceDock}
      aria-label="Forge workspaces"
      className={`shrink-0 min-w-0 bg-[#11161f] ${isBottom ? 'border-t' : 'border-b'} border-slate-800/80`}
    >
      <div className="h-[34px] min-w-0 flex items-center gap-1 px-2">
        <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto custom-scrollbar">
          {visible.map((id, index) => {
            const item = WORKSPACE_NAV_ITEMS.find(candidate => candidate.id === id)!;
            const Icon = ICONS[id];
            const active = activeView === id;
            const isMd = id === 'blueprint';
            const prevId = index > 0 ? visible[index - 1] : null;
            const showGroupSeparator = prevId !== null && VIEW_GROUPS[prevId] !== VIEW_GROUPS[id];

            const severityClass = isMd && mdErrorCount > 0
              ? active ? 'bg-rose-500/15 text-rose-200 border-rose-500/45' : 'text-rose-300 border-rose-500/20 hover:bg-rose-500/10'
              : isMd && mdWarningCount > 0
                ? active ? 'bg-amber-500/15 text-amber-200 border-amber-500/40' : 'text-amber-300 border-amber-500/15 hover:bg-amber-500/10'
                : active
                  ? 'bg-sky-500/15 text-sky-200 border-sky-500/45 shadow-xs'
                  : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-white/[0.05]';

            return (
              <React.Fragment key={id}>
                {showGroupSeparator && (
                  <span aria-hidden="true" className="hidden xl:block h-4 w-px bg-slate-800 mx-1 shrink-0" />
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
                  className={`h-[26px] shrink-0 rounded-md border px-2 inline-flex items-center gap-1.5 text-[11.5px] font-medium transition-colors cursor-pointer ${severityClass}`}
                  title={`${item.label} — drag to reorder`}
                >
                  <GripVertical className="hidden sm:block w-2.5 h-2.5 opacity-30" aria-hidden="true" />
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className={`${layout.density === 'compact' ? 'hidden xl:inline text-[11px]' : 'hidden lg:inline text-[11.5px]'}`}>
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
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="h-6 w-6 shrink-0 grid place-items-center rounded text-slate-500 hover:text-sky-300 hover:bg-white/5 cursor-pointer"
          title="Hide workspace navigation"
          data-testid="workspace-nav-collapse"
        >
          {isBottom ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>
    </nav>
  );
}
