/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  FolderOpen,
  HardDrive,
  Database,
  Gamepad2,
  Info,
  CheckCircle,
  AlertTriangle,
  Save,
  Sparkles,
  Settings as SettingsIcon
} from 'lucide-react';

type AiTier = 'off' | 'explain' | 'assist' | 'cobuild';

interface DirectorySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  modWorkspacePath: string;
  setModWorkspacePath: (path: string) => void;
  filesystemPath: string;
  setFilesystemPath: (path: string) => void;
  aiTier: AiTier;
  setAiTier: (t: AiTier) => void;
  /** Opens the AI provider/model/API-key modal. Reachable here at ALL tiers (incl. off). */
  onOpenAIConfig: () => void;
}

// A4.1 — opt-in AI presence tiers. Off by default; determinism is never gated by this.
const AI_TIERS: { id: AiTier; label: string; desc: string }[] = [
  { id: 'off', label: 'Off', desc: 'No AI anywhere. Forge stays a fully deterministic editor.' },
  { id: 'explain', label: 'Explain', desc: 'Read-only. AI explains errors/nodes on request — never changes your work.' },
  { id: 'assist', label: 'Assist', desc: 'AI may propose changes — staged, validated, applied only on your confirm.' },
  { id: 'cobuild', label: 'Co-build', desc: 'Step-by-step Architect drafting, still verified before anything applies.' },
];

/**
 * One row per directory the application can require. Each row carries a hover
 * tooltip describing exactly what that directory is for.
 */
function DirectoryRow({
  icon,
  title,
  tooltip,
  children
}: {
  icon: React.ReactNode;
  title: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-cyan-400">{icon}</span>
        <span className="text-[12px] font-mono font-bold text-white uppercase tracking-wide">{title}</span>
        <span className="relative group flex items-center">
          <Info className="w-3.5 h-3.5 text-slate-500 hover:text-cyan-400 cursor-help" />
          <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 z-50 hidden group-hover:block w-64 bg-[#05070a] border border-cyan-500/30 text-[10px] text-slate-300 font-sans leading-relaxed rounded p-2 shadow-xl">
            {tooltip}
          </span>
        </span>
      </div>
      {children}
    </div>
  );
}

export default function DirectorySettingsModal({
  isOpen,
  onClose,
  modWorkspacePath,
  setModWorkspacePath,
  filesystemPath,
  setFilesystemPath,
  aiTier,
  setAiTier,
  onOpenAIConfig
}: DirectorySettingsModalProps) {
  const [gamePath, setGamePath] = useState('');
  const [schemaPath, setSchemaPath] = useState('');
  const [workspaceInput, setWorkspaceInput] = useState('');
  const [filesystemInput, setFilesystemInput] = useState('');
  const [resolved, setResolved] = useState<any>(null);
  const [status, setStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; msg: string }>({ type: 'idle', msg: '' });

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const res = await fetch('/api/schema/config').then(r => r.json());
        setGamePath(res.config?.x4GamePath || res.resolved?.x4GamePath || '');
        setSchemaPath(res.config?.xsdSchemaPath || res.resolved?.schemaDir || '');
        setWorkspaceInput(res.config?.modWorkspacePath || res.resolved?.modWorkspacePath || '');
        setFilesystemInput(res.config?.filesystemPath || res.resolved?.filesystemPath || '');
        setResolved(res.resolved || null);
      } catch {
        setStatus({ type: 'error', msg: 'Could not load directory config from the server.' });
      }
    })();
  }, [isOpen]);

  const saveServerPaths = async () => {
    setStatus({ type: 'saving', msg: '' });
    try {
      const res = await fetch('/api/schema/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schemaDir: schemaPath.trim(),
          x4GamePath: gamePath.trim(),
          modWorkspacePath: workspaceInput.trim(),
          filesystemPath: filesystemInput.trim()
        })
      }).then(r => r.json());
      if (res.error) {
        setResolved(res.resolved || resolved);
        setStatus({ type: 'error', msg: res.error });
      } else {
        setResolved(res.resolved || null);
        setModWorkspacePath(workspaceInput.trim());
        setFilesystemPath(filesystemInput.trim());
        setStatus({
          type: 'success',
          msg: `Saved. Schema library reloaded: ${res.schema_counts?.events ?? 0} events, ${res.schema_counts?.conditions ?? 0} conditions, ${res.schema_counts?.actions ?? 0} actions.`
        });
      }
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to save directory settings.' });
    }
  };

  if (!isOpen) return null;

  const schemaOk = resolved?.mdExists && resolved?.commonExists;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[640px] max-h-[85vh] overflow-y-auto bg-[#0c0f16] border border-cyan-500/30 rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#141b25] rounded-t-xl">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-cyan-400" />
            <div>
              <span className="font-bold text-white text-sm block">Directory Settings</span>
              <span className="text-[10px] text-slate-400">Every folder the studio needs, in one place</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-all cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* 1. Mod Workspace folder */}
          <DirectoryRow
            icon={<HardDrive className="w-4 h-4" />}
            title="Mod Workspace Folder"
            tooltip="Your sandbox (e.g. a 'My X4 Mods' folder) where the studio writes compiled mods. Each mod becomes its own <modid>/ subfolder here, with content.xml and a .snapshots/ version history inside it."
          >
            <input
              type="text"
              value={workspaceInput}
              onChange={e => setWorkspaceInput(e.target.value)}
              placeholder="e.g. C:\Users\Moshi\Desktop\MyStagingWorkspace"
              className="w-full px-2 py-1.5 rounded bg-[#0F1115] border border-white/10 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
            />
          </DirectoryRow>

          {/* 1b. Filesystem folder */}
          <DirectoryRow
            icon={<FolderOpen className="w-4 h-4" />}
            title="Filesystem Folder"
            tooltip="The directory shown in the left-hand 'Filesystem' explorer sidebar. Used to browse and edit files. Defaults to your Mod Workspace folder if not configured."
          >
            <input
              type="text"
              value={filesystemInput}
              onChange={e => setFilesystemInput(e.target.value)}
              placeholder="e.g. G:\SteamLibrary\steamapps\common\X4 Foundations\extensions"
              className="w-full px-2 py-1.5 rounded bg-[#0F1115] border border-white/10 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
            />
          </DirectoryRow>

          {/* 2. X4 Game installation (server path) */}
          <DirectoryRow
            icon={<Gamepad2 className="w-4 h-4" />}
            title="X4 Game Installation"
            tooltip="The root folder of your X4 Foundations install (the folder containing the game .exe and the 'extensions' directory). Used to locate the game's reference files and schemas."
          >
            <input
              type="text"
              value={gamePath}
              onChange={e => setGamePath(e.target.value)}
              placeholder="e.g. G:\SteamLibrary\steamapps\common\X4 Foundations"
              className="w-full px-2 py-1.5 rounded bg-[#0F1115] border border-white/10 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
            />
          </DirectoryRow>

          {/* 3. XSD schema folder (server path) */}
          <DirectoryRow
            icon={<Database className="w-4 h-4" />}
            title="XSD Schema Folder"
            tooltip="The folder containing md.xsd and common.xsd. These power the studio's node validation and autocomplete against X4's real Mission Director schema. Usually inside an unpacked game/extension folder."
          >
            <input
              type="text"
              value={schemaPath}
              onChange={e => setSchemaPath(e.target.value)}
              placeholder="e.g. extensions/x4_ai_influence/md"
              className="w-full px-2 py-1.5 rounded bg-[#0F1115] border border-white/10 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
            />
            {resolved && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono mt-1">
                {schemaOk ? (
                  <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> md.xsd &amp; common.xsd found</span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> md.xsd / common.xsd not found at this path</span>
                )}
              </div>
            )}
          </DirectoryRow>

          {/* AI Assistant — opt-in tiers (off by default). Applied immediately (client-side). */}
          <DirectoryRow
            icon={<Sparkles className="w-4 h-4" />}
            title="AI Assistant (optional)"
            tooltip="Off by default. Controls how much AI assistance Forge offers. Determinism — validation, diagnostics, compile, the object browser, selftests — always works fully regardless of this setting. Your choice is saved on this device and applied immediately."
          >
            <div className="grid grid-cols-2 gap-1.5">
              {AI_TIERS.map(t => {
                const active = aiTier === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAiTier(t.id)}
                    title={t.desc}
                    className={`text-left p-2 rounded border transition-all cursor-pointer ${
                      active
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                        : 'bg-[#0F1115] border-white/10 text-slate-300 hover:border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wide">
                      {active && <CheckCircle className="w-3 h-3" />}
                      {t.label}
                    </div>
                    <div className="text-[9.5px] text-slate-400 font-sans leading-snug mt-0.5">{t.desc}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] text-slate-500 font-sans mt-1.5 leading-relaxed">
              AI is a convenience layer beside Forge's deterministic core, never in front of it. At <span className="text-slate-300 font-mono">Off</span> there is no AI anywhere in the app.
            </p>
            <button
              type="button"
              onClick={onOpenAIConfig}
              title="Provider, model and API key — configurable at any tier, including Off."
              className="mt-2 w-full px-2.5 py-1.5 rounded border border-amber-500/25 bg-amber-500/[0.04] hover:bg-amber-500/10 hover:border-amber-500/50 text-amber-300 text-[10.5px] font-mono font-bold uppercase tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3 h-3" />
              Configure AI engine — provider, model &amp; API key
            </button>
          </DirectoryRow>

          {/* Status + Save */}
          {status.msg && (
            <div
              className={`p-2 rounded text-[10px] font-mono leading-relaxed border ${
                status.type === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              {status.msg}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[9px] text-slate-500 font-sans">
              All directory paths are saved securely on the server config.
            </span>
            <button
              onClick={saveServerPaths}
              disabled={status.type === 'saving'}
              className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black rounded text-[11px] font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              {status.type === 'saving' ? 'Saving…' : 'Save Paths'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
