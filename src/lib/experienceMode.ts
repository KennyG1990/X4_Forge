import type { ModWorkspace } from '../types';
import type { ReadinessStage, ReadinessStatus } from './readiness';

export const EXPERIENCE_MODE_KEY = 'x4_forge_experience_mode';
export type ExperienceMode = 'beginner' | 'expert';
export type BeginnerStep = 'idea' | 'customize' | 'validate' | 'deploy' | 'confirm';
export type WorkspaceView = 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'contracts' | 'translation' | 'wiki' | 'project' | 'galaxy';

export const BEGINNER_STEPS: Array<{ id: BeginnerStep; label: string; description: string }> = [
  { id: 'idea', label: 'Choose idea', description: 'Start from a proven template or keep the current mod.' },
  { id: 'customize', label: 'Customize', description: 'Edit the selected part in its real visual editor.' },
  { id: 'validate', label: 'Validate', description: 'Resolve graph and package blockers before shipping.' },
  { id: 'deploy', label: 'Deploy', description: 'Review the package and deploy through the guarded wizard.' },
  { id: 'confirm', label: 'Confirm in game', description: 'Use machine evidence, then confirm what you saw.' },
];

export function parseExperienceMode(raw: string | null | undefined): ExperienceMode {
  return raw === 'expert' ? 'expert' : 'beginner';
}

export function workspaceHasBeginnerContent(workspace: ModWorkspace): boolean {
  return workspace.nodes.some(node => node.type !== 'comment')
    || workspace.uiWidgets.length > 0
    || (workspace.xmlPatches?.length ?? 0) > 0
    || (workspace.tFiles?.length ?? 0) > 0
    || (workspace.aiScripts?.length ?? 0) > 0
    || (workspace.wares?.length ?? 0) > 0
    || (workspace.jobs?.length ?? 0) > 0
    || Boolean(workspace.customLua?.trim());
}

export function beginnerEditorForWorkspace(
  workspace: ModWorkspace,
  selection: 'node' | 'widget' | null = null,
): WorkspaceView {
  if (selection === 'widget') return 'ui-designer';
  if (selection === 'node') return 'blueprint';
  if (workspace.nodes.some(node => node.type !== 'comment')) return 'blueprint';
  if (workspace.uiWidgets.length > 0 || workspace.customLua?.trim()) return 'ui-designer';
  if ((workspace.xmlPatches?.length ?? 0) > 0) return 'xmlpatch';
  if ((workspace.tFiles?.length ?? 0) > 0) return 'translation';
  if ((workspace.aiScripts?.length ?? 0) > 0) return 'aiscripts';
  if ((workspace.wares?.length ?? 0) > 0 || (workspace.jobs?.length ?? 0) > 0) return 'libraries';
  return 'blueprint';
}

const severity: Record<ReadinessStatus, number> = {
  fail: 6,
  unavailable: 5,
  stale: 4,
  pending: 3,
  warning: 2,
  pass: 1,
};

export function combinedValidationStatus(stages: ReadinessStage[]): ReadinessStatus {
  const relevant = stages.filter(stage => stage.id === 'graph' || stage.id === 'package');
  return relevant.reduce<ReadinessStatus>((worst, stage) => severity[stage.status] > severity[worst] ? stage.status : worst, 'pass');
}

export function runExperienceModeSelftest() {
  const workspace = (over: Partial<ModWorkspace> = {}): ModWorkspace => ({
    id: 'w', name: 'W', version: '1', author: 'A', description: '', nodes: [], links: [], uiWidgets: [],
    uiTheme: { backgroundColor: '#000', borderColor: '#000', accentColor: '#000', opacity: 1, showIcons: true },
    ...over,
  });
  const stage = (id: ReadinessStage['id'], status: ReadinessStatus): ReadinessStage => ({
    id, status, label: id, shortLabel: id, summary: status, evidence: status, owner: id === 'graph' ? 'canvas' : 'diagnostics',
  });
  const checks: Array<{ name: string; pass: boolean; detail?: unknown }> = [];
  const ok = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, detail });

  ok('default_is_beginner', parseExperienceMode(null) === 'beginner');
  ok('corrupt_preference_fails_to_beginner', parseExperienceMode('power-user') === 'beginner');
  ok('expert_preference_round_trips', parseExperienceMode('expert') === 'expert');
  ok('empty_routes_to_template_canvas', beginnerEditorForWorkspace(workspace()) === 'blueprint');
  ok('node_routes_to_blueprint', beginnerEditorForWorkspace(workspace({ nodes: [{ id: 'n', type: 'action', xmlTag: 'set_value', label: 'Set', x: 0, y: 0, properties: {}, propertiesSchema: [], inputs: [], outputs: [], includeInBuild: true }] })) === 'blueprint');
  ok('ui_routes_to_ui_designer', beginnerEditorForWorkspace(workspace({ uiWidgets: [{ id: 'u', type: 'button', label: 'Button', x: 0, y: 0, w: 1, h: 1, properties: {} }] })) === 'ui-designer');
  ok('patch_routes_to_patch_editor', beginnerEditorForWorkspace(workspace({ xmlPatches: [{ id: 'p', targetFile: 'libraries/wares.xml', sel: '/wares/ware', action: 'add', content: '<ware/>', note: '' }] })) === 'xmlpatch');
  ok('translation_routes_to_tfile_editor', beginnerEditorForWorkspace(workspace({ tFiles: [{ languageId: '44', fileName: '0001-L044.xml', pages: [] }] })) === 'translation');
  ok('selected_widget_wins_in_mixed_workspace', beginnerEditorForWorkspace(workspace({ nodes: [{ id: 'n', type: 'action', xmlTag: 'set_value', label: 'Set', x: 0, y: 0, properties: {}, propertiesSchema: [], inputs: [], outputs: [], includeInBuild: true }], uiWidgets: [{ id: 'u', type: 'button', label: 'Button', x: 0, y: 0, w: 1, h: 1, properties: {} }] }), 'widget') === 'ui-designer');
  ok('comment_only_is_empty', !workspaceHasBeginnerContent(workspace({ nodes: [{ id: 'c', type: 'comment', xmlTag: 'comment', label: 'Note', x: 0, y: 0, properties: {}, propertiesSchema: [], inputs: [], outputs: [], includeInBuild: false }] })));
  ok('package_failure_cannot_be_green', combinedValidationStatus([stage('graph', 'pass'), stage('package', 'fail')]) === 'fail');
  ok('offline_package_cannot_be_green', combinedValidationStatus([stage('graph', 'pass'), stage('package', 'unavailable')]) === 'unavailable');

  const passed = checks.filter(check => check.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
