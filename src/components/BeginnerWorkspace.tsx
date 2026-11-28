import React, { useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, Gamepad2, Lightbulb, PackageCheck, Pencil, ShieldCheck } from 'lucide-react';
import type { MDNode, ModWorkspace, UIWidget } from '../types';
import type { ReadinessStage, ReadinessStatus } from '../lib/readiness';
import { BEGINNER_STEPS, combinedValidationStatus, workspaceHasBeginnerContent, type BeginnerStep } from '../lib/experienceMode';
import { applyNodePropertyChange, isNodeSelectionFailure } from '../lib/nodeSelectionDocument';
import PropertiesInspector from './PropertiesInspector';

interface BeginnerWorkspaceProps {
  width: number;
  step: BeginnerStep;
  onStepChange: (step: BeginnerStep) => void;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  selectedNode: MDNode | null;
  setSelectedNode: React.Dispatch<React.SetStateAction<MDNode | null>>;
  selectedWidget: UIWidget | null;
  setSelectedWidget: React.Dispatch<React.SetStateAction<UIWidget | null>>;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  readinessStages: ReadinessStage[];
  compileStatus: 'idle' | 'compiling' | 'success' | 'error';
  compileMessage: string;
  onDeploy: () => void;
  onConfirmExperience: () => void;
}

const statusClasses: Record<ReadinessStatus, string> = {
  pass: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  fail: 'border-red-500/45 bg-red-500/10 text-red-300',
  pending: 'border-slate-500/35 bg-slate-500/10 text-slate-300',
  stale: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  unavailable: 'border-red-500/35 bg-red-500/10 text-red-300',
};

const icons: Record<BeginnerStep, React.ReactNode> = {
  idea: <Lightbulb className="w-4 h-4" />,
  customize: <Pencil className="w-4 h-4" />,
  validate: <ShieldCheck className="w-4 h-4" />,
  deploy: <PackageCheck className="w-4 h-4" />,
  confirm: <Gamepad2 className="w-4 h-4" />,
};

export default function BeginnerWorkspace(props: BeginnerWorkspaceProps) {
  const {
    width, step, onStepChange, workspace, setWorkspace, selectedNode, setSelectedNode,
    selectedWidget, setSelectedWidget, saveCheckpoint, readinessStages, compileStatus,
    compileMessage, onDeploy, onConfirmExperience,
  } = props;
  const byId = (id: ReadinessStage['id']) => readinessStages.find(stageItem => stageItem.id === id)!;
  const validateStatus = combinedValidationStatus(readinessStages);
  const deployBlocked = ['fail', 'unavailable', 'pending', 'stale'].includes(byId('graph').status)
    || ['fail', 'unavailable', 'pending', 'stale'].includes(byId('package').status);
  const stepStatus = (id: BeginnerStep): ReadinessStatus | null => {
    if (id === 'validate') return validateStatus;
    if (id === 'deploy') return byId('deployed').status;
    if (id === 'confirm') return byId('experience').status;
    return null;
  };
  const [propertyEditError, setPropertyEditError] = useState('');
  const handlePropChange = (key: string, value: unknown) => {
    if (selectedNode) {
      const applied = applyNodePropertyChange(workspace, selectedNode.id, key, value);
      if (isNodeSelectionFailure(applied)) {
        setPropertyEditError(applied.message);
        return;
      }
      setPropertyEditError('');
      saveCheckpoint();
      setWorkspace(applied.workspace);
      setSelectedNode(applied.workspace.nodes.find(node => node.id === selectedNode.id) || null);
    } else if (selectedWidget) {
      setPropertyEditError('');
      saveCheckpoint();
      setWorkspace(current => ({ ...current, uiWidgets: current.uiWidgets.map(widget => widget.id === selectedWidget.id ? { ...widget, properties: { ...widget.properties, [key]: value } } : widget) }));
      setSelectedWidget(current => current ? { ...current, properties: { ...current.properties, [key]: value } } : null);
    }
  };
  const handleLabelChange = (label: string) => {
    if (selectedNode) {
      saveCheckpoint();
      setWorkspace(current => ({ ...current, nodes: current.nodes.map(node => node.id === selectedNode.id ? { ...node, label } : node) }));
      setSelectedNode(current => current ? { ...current, label } : null);
    } else if (selectedWidget) {
      saveCheckpoint();
      setWorkspace(current => ({ ...current, uiWidgets: current.uiWidgets.map(widget => widget.id === selectedWidget.id ? { ...widget, label } : widget) }));
      setSelectedWidget(current => current ? { ...current, label } : null);
    }
  };
  const evidenceCard = (stageItem: ReadinessStage) => (
    <div key={stageItem.id} data-testid={`beginner-evidence-${stageItem.id}`} data-status={stageItem.status} className={`rounded border p-3 ${statusClasses[stageItem.status]}`}>
      <div className="flex items-center gap-2 text-[11px] font-mono font-bold uppercase">
        {stageItem.status === 'pass' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
        {stageItem.label}
        <span className="ml-auto">{stageItem.summary}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{stageItem.evidence}</p>
    </div>
  );

  return (
    <aside data-testid="beginner-workspace" style={{ width }} className="shrink-0 h-full overflow-y-auto bg-[#0c0e12] border-r border-[#262c36] p-3 text-[#eef2f7]">
      <div className="mb-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#60a5fa]">Beginner workspace</div>
        <div className="mt-1 text-xs text-[#a0aab8]">One path from idea to proven game result.</div>
      </div>

      <nav aria-label="Beginner workflow" className="space-y-1.5" data-testid="beginner-steps">
        {BEGINNER_STEPS.map((item, index) => {
          const status = stepStatus(item.id);
          return (
            <button key={item.id} data-testid={`beginner-step-${item.id}`} data-status={status || 'neutral'} onClick={() => onStepChange(item.id)} className={`w-full rounded border px-3 py-2 text-left transition-colors cursor-pointer ${step === item.id ? 'border-[#3b82f6]/60 bg-[#3b82f6]/12 text-[#eef2f7]' : 'border-[#262c36] bg-[#11141a] text-[#a0aab8] hover:border-[#3b4454] hover:text-[#eef2f7]'}`}>
              <span className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-[11px] font-mono text-[#687385]">{index + 1}</span>
                <span className="text-[#60a5fa]">{icons[item.id]}</span>
                {item.label}
                {status && <span className={`ml-auto rounded border px-1.5 py-0.5 text-[11px] font-mono uppercase ${statusClasses[status]}`}>{status}</span>}
              </span>
            </button>
          );
        })}
      </nav>

      <section className="mt-4 border-t border-[#262c36] pt-4" data-testid={`beginner-panel-${step}`}>
        <h2 className="text-sm font-semibold text-[#eef2f7]">{BEGINNER_STEPS.find(item => item.id === step)?.label}</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[#a0aab8]">{BEGINNER_STEPS.find(item => item.id === step)?.description}</p>

        {step === 'idea' && (
          <div className="mt-3 rounded border border-[#3b82f6]/30 bg-[#11141a] p-3 text-[11px] text-[#a0aab8]">
            {workspaceHasBeginnerContent(workspace)
              ? <>You are working on <strong className="text-[#eef2f7]">{workspace.name}</strong>. Use Reset/New in the header to choose a different starting idea.</>
              : <>Choose a template in the editor. It creates editable content and starts the guided rail.</>}
          </div>
        )}

        {step === 'customize' && (selectedNode || selectedWidget ? (
          <>
            {propertyEditError && (
              <div
                data-testid="beginner-property-error"
                role="alert"
                className="mt-3 mb-2 rounded border border-rose-500/35 bg-rose-500/10 p-2 text-[11px] text-rose-200"
              >
                {propertyEditError}
              </div>
            )}
            <PropertiesInspector
              selectedNode={selectedNode}
              selectedWidget={selectedWidget}
              workspace={workspace}
              setWorkspace={setWorkspace}
              setSelectedNode={setSelectedNode}
              setSelectedWidget={setSelectedWidget}
              saveCheckpoint={saveCheckpoint}
              handleLabelChange={handleLabelChange}
              handlePropChange={handlePropChange}
              handleSendCuePackageToAIGuide={() => undefined}
              showAdvancedActions={false}
            />
          </>
        ) : (
          <div className="mt-3 rounded border border-[#262c36] bg-[#11141a] p-3 text-[11px] text-[#a0aab8]">Select a node or widget in the editor to customize its details. Patch, translation, AI, ware, and job workspaces edit directly in the center.</div>
        ))}

        {step === 'validate' && <div className="mt-3 space-y-2">{evidenceCard(byId('graph'))}{evidenceCard(byId('package'))}</div>}

        {step === 'deploy' && (
          <div className="mt-3 space-y-3">
            {evidenceCard(byId('deployed'))}
            {deployBlocked && (
              <div data-testid="beginner-deploy-blocker" className="rounded border border-red-500/35 bg-red-500/10 p-2 text-[11px] text-red-200">Deploy is not presented as ready: resolve the validation evidence above first.</div>
            )}
            <button data-testid="beginner-open-deploy" disabled={deployBlocked} onClick={onDeploy} className={`w-full rounded border px-3 py-2 text-xs font-semibold ${deployBlocked ? 'cursor-not-allowed border-slate-600/30 bg-slate-700/15 text-slate-500' : 'border-cyan-500/40 bg-cyan-600/20 text-cyan-100 hover:bg-cyan-600/30'}`}>Validate &amp; deploy… <ExternalLink className="ml-1 inline w-3 h-3" /></button>
            {compileMessage && <div data-testid="beginner-compile-message" className={`text-[11px] ${compileStatus === 'error' ? 'text-red-300' : compileStatus === 'success' ? 'text-emerald-300' : 'text-slate-400'}`}>{compileMessage}</div>}
          </div>
        )}

        {step === 'confirm' && (
          <div className="mt-3 space-y-2">
            {evidenceCard(byId('seen'))}
            {evidenceCard(byId('experience'))}
            {byId('seen').status === 'pass' && byId('experience').status !== 'pass' && (
              <button data-testid="beginner-confirm-experience" onClick={onConfirmExperience} className="w-full rounded border border-emerald-500/40 bg-emerald-600/20 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-600/30">I saw it and it worked</button>
            )}
          </div>
        )}
      </section>
    </aside>
  );
}
