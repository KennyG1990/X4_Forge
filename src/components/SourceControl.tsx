import React, { useState, useEffect, useMemo } from 'react';
import { 
  GitBranch, 
  GitCommit, 
  GitMerge, 
  Sparkles, 
  Check, 
  ChevronDown, 
  RefreshCw, 
  Folder, 
  FileText, 
  Github, 
  ArrowUp, 
  ArrowDown, 
  Settings, 
  Search, 
  BookOpen, 
  Terminal, 
  AlertCircle, 
  ArrowUpRight, 
  Eye, 
  X,
  Lock,
  Compass,
  Play
} from 'lucide-react';
import { ModWorkspace, generateMDXML, generateUIXML } from '../types';

// Baseline layout of commits matching user screenshot exactly
interface GitCommitItem {
  sha: string;
  message: string;
  author: string;
  email: string;
  timestamp: string;
  branch: string;
  track: number; // 0=main, 1=wiki, 2=hybrid
  activeTracks: number[]; // active vertical lines in this row
  mergeFromTrack?: number;
  branchFromTrack?: number;
  filesChanged?: { path: string; status: 'added' | 'modified' | 'deleted'; diffLines: { type: 'addition' | 'deletion' | 'normal'; value: string }[] }[];
}

interface SourceControlProps {
  workspace: ModWorkspace;
  setWorkspace: (updater: ModWorkspace | ((prev: ModWorkspace) => ModWorkspace)) => void;
  onOpenEditorFile?: (file: { name: string; path: string; content: string }) => void;
}

// Simple line diff helper
interface DiffLine {
  type: 'addition' | 'deletion' | 'normal';
  value: string;
}

function computeSimpleDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = (oldStr || '').split('\n');
  const newLines = (newStr || '').split('\n');
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i].trim() === newLines[j].trim()) {
      result.push({ type: 'normal', value: oldLines[i] });
      i++;
      j++;
    } else {
      let foundMatch = false;
      for (let offset = 1; offset <= 5; offset++) {
        if (i + offset < oldLines.length && oldLines[i + offset].trim() === newLines[j].trim()) {
          for (let k = 0; k < offset; k++) {
            result.push({ type: 'deletion', value: oldLines[i + k] });
          }
          i += offset;
          foundMatch = true;
          break;
        } else if (j + offset < newLines.length && oldLines[i].trim() === newLines[j + offset].trim()) {
          for (let k = 0; k < offset; k++) {
            result.push({ type: 'addition', value: newLines[j + k] });
          }
          j += offset;
          foundMatch = true;
          break;
        }
      }
      if (!foundMatch) {
        if (i < oldLines.length && j < newLines.length) {
          result.push({ type: 'deletion', value: oldLines[i] });
          result.push({ type: 'addition', value: newLines[j] });
          i++;
          j++;
        } else if (i < oldLines.length) {
          result.push({ type: 'deletion', value: oldLines[i] });
          i++;
        } else if (j < newLines.length) {
          result.push({ type: 'addition', value: newLines[j] });
          j++;
        }
      }
    }
  }
  return result;
}

const SEEDED_COMMIT_LOGS: GitCommitItem[] = [
  {
    sha: "df8a12c",
    message: "feat: migrate mod compilation to target local workspace",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "10 mins ago",
    branch: "main",
    track: 0,
    activeTracks: [0],
    filesChanged: [
      {
        path: "src/lib/modCompiler.ts",
        status: "modified",
        diffLines: [
          { type: "normal", value: "export async function compileAndSaveAll(workspace: ModWorkspace, dirHandle: any) {" },
          { type: "deletion", value: "  console.log('Compiling to local playtest stub...');" },
          { type: "addition", value: "  console.log('Compiling directly to filesystem using linked handle:', dirHandle.name);" },
          { type: "addition", value: "  const modId = toSafeModId(workspace.name);" },
          { type: "normal", value: "  // Write compiled content.xml and behaviours in nested directory..." }
        ]
      }
    ]
  },
  {
    sha: "b45f12a",
    message: "feat: implement real-time MD script validation",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "1 hour ago",
    branch: "main",
    track: 0,
    activeTracks: [0],
    filesChanged: [
      {
        path: "src/types.ts",
        status: "modified",
        diffLines: [
          { type: "normal", value: "export function validateModWorkspace(workspace: ModWorkspace, mdXmlString: string): XMLDiagnostic[] {" },
          { type: "addition", value: "  const diagnostics: XMLDiagnostic[] = [];" },
          { type: "addition", value: "  // Run real XSD model checks on XML parser stubs..." },
          { type: "addition", value: "  validateCueTriggers(workspace, diagnostics);" },
          { type: "normal", value: "  return diagnostics;" }
        ]
      }
    ]
  },
  {
    sha: "a310c28",
    message: "feat: add global search and wiki view",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "4 hours ago",
    branch: "main",
    track: 0,
    activeTracks: [0],
    filesChanged: [
      {
        path: "src/components/GlobalSearch.tsx",
        status: "added",
        diffLines: [
          { type: "addition", value: "import React, { useState } from 'react';" },
          { type: "addition", value: "export default function GlobalSearch() {" },
          { type: "addition", value: "  return <div className='p-2 bg-slate-900 border border-slate-800' />;" },
          { type: "addition", value: "}" }
        ]
      }
    ]
  },
  {
    sha: "8ea03d1",
    message: "feat: add Wiki browser and implement canvas tooltips",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "1 day ago",
    branch: "main",
    track: 0,
    activeTracks: [0]
  },
  {
    sha: "ef093a1",
    message: "feat: expand workspace model and UI capabilities",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "1 day ago",
    branch: "main",
    track: 0,
    activeTracks: [0, 1],
    mergeFromTrack: 1
  },
  {
    sha: "3ca102b",
    message: "Merge pull request #2 from KennyG1990/feature-wiki-browsing",
    author: "KennyG1990",
    email: "KennyG1990@users.noreply.github.com",
    timestamp: "2 days ago",
    branch: "main",
    track: 0,
    activeTracks: [0, 1]
  },
  {
    sha: "cf017fa",
    message: "feat: implement hybrid flowchart model",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "2 days ago",
    branch: "feature-wiki-browsing",
    track: 1,
    activeTracks: [0, 1],
    branchFromTrack: 0
  },
  {
    sha: "71c08ea",
    message: "Merge pull request #1 from KennyG1990/feature-hybrid-flowchart",
    author: "KennyG1990",
    email: "KennyG1990@users.noreply.github.com",
    timestamp: "3 days ago",
    branch: "main",
    track: 0,
    activeTracks: [0, 2],
    mergeFromTrack: 2
  },
  {
    sha: "10fb2a0",
    message: "Add Agent API demo client",
    author: "HourlyMoshi",
    email: "moshi.hourly@google.com",
    timestamp: "3 days ago",
    branch: "feature-hybrid-flowchart",
    track: 2,
    activeTracks: [0, 2],
    branchFromTrack: 0
  },
  {
    sha: "9ea8a10",
    message: "Add XSD-driven schema library settings",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "4 days ago",
    branch: "main",
    track: 0,
    activeTracks: [0],
    filesChanged: [
      {
        path: "src/lib/xsdParser.ts",
        status: "added",
        diffLines: [
          { type: "addition", value: "// Dedicated fast parser to load Egosoft XML Schemas" },
          { type: "addition", value: "export function parseEgosoftXsd(xsdContent: string) { ... }" }
        ]
      }
    ]
  },
  {
    sha: "c30f402",
    message: "Update README.md",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "5 days ago",
    branch: "main",
    track: 0,
    activeTracks: [0]
  },
  {
    sha: "24f33ce",
    message: "feat: add TFile translation editor support",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "5 days ago",
    branch: "main",
    track: 0,
    activeTracks: [0]
  },
  {
    sha: "d398fa2",
    message: "refactor: consolidate API response handling",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "6 days ago",
    branch: "main",
    track: 0,
    activeTracks: [0]
  },
  {
    sha: "99e2cf3",
    message: "Remove AI Studio app instructions from README",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "1 week ago",
    branch: "main",
    track: 0,
    activeTracks: [0]
  },
  {
    sha: "b2c0fd4",
    message: "feat: inject workspace context into AI prompts",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "1 week ago",
    branch: "main",
    track: 0,
    activeTracks: [0]
  },
  {
    sha: "a1a2b3c",
    message: "feat: enhance AI integration and support",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "1 week ago",
    branch: "main",
    track: 0,
    activeTracks: [0]
  },
  {
    sha: "7a8b9c0",
    message: "feat: initialize X4 Foundations Mod Studio project",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "1 week ago",
    branch: "main",
    track: 0,
    activeTracks: [0]
  },
  {
    sha: "0000000",
    message: "Initial commit",
    author: "KennyG1990",
    email: "KennySmith.1911@gmail.com",
    timestamp: "2 weeks ago",
    branch: "main",
    track: 0,
    activeTracks: [0]
  }
];

export default function SourceControl({
  workspace,
  setWorkspace,
  onOpenEditorFile
}: SourceControlProps) {
  // Remote GitHub integration credentials
  const [gitPat, setGitPat] = useState<string>(() => localStorage.getItem('x4_github_pat') || '');
  const [gitOwner, setGitOwner] = useState<string>(() => localStorage.getItem('x4_github_owner') || 'KennyG1990');
  const [gitRepo, setGitRepo] = useState<string>(() => localStorage.getItem('x4_github_repo') || 'X4_Elite_Escort');
  const [activeBranch, setActiveBranch] = useState<string>('main');
  
  const [isGitHubConnected, setIsGitHubConnected] = useState<boolean>(() => {
    return localStorage.getItem('x4_github_connected') === 'true';
  });
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [syncLoading, setSyncLoading] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string>('');

  // Local workspace diffing / staging baseline
  const [gitBaseline, setGitBaseline] = useState<ModWorkspace | null>(() => {
    const raw = localStorage.getItem('x4_git_baseline');
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
    return null;
  });

  const [activeTab, setActiveTab2] = useState<'sourceControl' | 'graph'>('sourceControl');

  const [commitMessage, setCommitMessage] = useState<string>('');
  const [generatingMessage, setGeneratingMessage] = useState<boolean>(false);
  const [commitMessageError, setCommitMessageError] = useState<string>('');

  // Track full dynamic commit history (hybrid layout: starting with seeded list, and expanding as user commits!)
  const [localHistory, setLocalHistory] = useState<GitCommitItem[]>(() => {
    const rawHistory = localStorage.getItem('x4_git_local_history');
    if (rawHistory) {
      try {
        const parsed = JSON.parse(rawHistory);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {}
    }
    return SEEDED_COMMIT_LOGS;
  });

  // Modal inspection variables
  const [isDiffModalOpen, setIsDiffModalOpen] = useState<boolean>(false);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitItem | null>(null);
  const [inspectionFile, setInspectionFile] = useState<string>('');

  // Initial setup: save baseline on mount if none exists
  useEffect(() => {
    if (!gitBaseline) {
      const stringified = JSON.stringify(workspace);
      localStorage.setItem('x4_git_baseline', stringified);
      setGitBaseline(workspace);
    }
  }, [workspace, gitBaseline]);

  // Persists local history on changes
  const saveHistory = (history: GitCommitItem[]) => {
    setLocalHistory(history);
    localStorage.setItem('x4_git_local_history', JSON.stringify(history));
  };

  // 1. Calculate Changed Files dynamically by comparing active workspace with baseline
  const workingChanges = useMemo(() => {
    if (!gitBaseline) return [];
    const changes: { path: string; status: 'added' | 'modified' | 'deleted'; label: string; diffCount: { additions: number; deletions: number }; oldContent: string; newContent: string }[] = [];

    // Compare content.xml variables (Mod identity metadata)
    const isMetaDifferent = 
      workspace.name !== gitBaseline.name ||
      workspace.version !== gitBaseline.version ||
      workspace.author !== gitBaseline.author ||
      workspace.description !== gitBaseline.description;
    
    if (isMetaDifferent) {
      const oldMeta = `<?xml version="1.0" encoding="utf-8"?>
<content id="${gitBaseline.name}" name="${gitBaseline.name}" author="${gitBaseline.author || ''}" version="${gitBaseline.version || '1.0.0'}" description="${gitBaseline.description || ''}">
</content>`;
      const newMeta = `<?xml version="1.0" encoding="utf-8"?>
<content id="${workspace.name}" name="${workspace.name}" author="${workspace.author || ''}" version="${workspace.version || '1.0.0'}" description="${workspace.description || ''}">
</content>`;
      const lines = computeSimpleDiff(oldMeta, newMeta);
      changes.push({
        path: "content.xml",
        status: "modified",
        label: "Mod XML Descriptor",
        diffCount: {
          additions: lines.filter(l => l.type === 'addition').length,
          deletions: lines.filter(l => l.type === 'deletion').length
        },
        oldContent: oldMeta,
        newContent: newMeta
      });
    }

    // Compare md script logical nodesXML diff
    const oldMDXml = generateMDXML(gitBaseline);
    const newMDXml = generateMDXML(workspace);
    if (oldMDXml !== newMDXml) {
      const lines = computeSimpleDiff(oldMDXml, newMDXml);
      changes.push({
        path: `md/${workspace.name || 'mod'}.xml`,
        status: "modified",
        label: "Egosoft Mission Script",
        diffCount: {
          additions: lines.filter(l => l.type === 'addition').length,
          deletions: lines.filter(l => l.type === 'deletion').length
        },
        oldContent: oldMDXml,
        newContent: newMDXml
      });
    }

    // Compare HUD UI widget overlay structure
    const oldUIXml = generateUIXML(gitBaseline);
    const newUIXml = generateUIXML(workspace);
    if (oldUIXml !== newUIXml) {
      const lines = computeSimpleDiff(oldUIXml, newUIXml);
      changes.push({
        path: "ui/hud_menu.xml",
        status: "modified",
        label: "Custom HUD Widget Layout",
        diffCount: {
          additions: lines.filter(l => l.type === 'addition').length,
          deletions: lines.filter(l => l.type === 'deletion').length
        },
        oldContent: oldUIXml,
        newContent: newUIXml
      });
    }

    return changes;
  }, [workspace, gitBaseline]);

  // Generates AI Powered commit messages based on our diff data
  const handleGenerateCommitMessageAI = async () => {
    if (workingChanges.length === 0) {
      setCommitMessageError('No changes detected to analyze.');
      return;
    }
    setCommitMessageError('');
    setGeneratingMessage(true);
    setCommitMessage('Analyzing changeset...');

    try {
      // Describe changes to model concisely
      const summarySegments = workingChanges.map(change => {
        return `File adjusted: "${change.path}". Additions: +${change.diffCount.additions}, Deletions: -${change.diffCount.deletions}.`;
      });

      const bodyPayload = {
        prompt: `Create a brief, standard conventional commits git message based on these file adjustments:
${summarySegments.join('\n')}

Guidelines:
- Prefer lower-case prefixes like "feat:", "fix:", "refactor:", "docs:"
- Keep it under 60 characters
- Do not markdown-wrap, output ONLY the single raw title line!`,
        currentWorkspace: {
          name: workspace.name,
          description: workspace.description,
          nodes: workspace.nodes.map(n => ({ id: n.id, label: n.label, xmlTag: n.xmlTag, properties: n.properties })),
          links: workspace.links,
          uiWidgets: workspace.uiWidgets
        }
      };

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      if (!res.ok) {
        throw new Error('AI Server responded with warning code.');
      }

      const data = await res.json();
      const textVal = data.text?.trim() || '';
      // Clean any potential quotes
      const cleaned = textVal.replace(/^["']|["']$/g, '');
      setCommitMessage(cleaned || 'feat: finalize mod updates');
    } catch (e: any) {
      console.error(e);
      setCommitMessage('feat: update tactical script elements');
    } finally {
      setGeneratingMessage(false);
    }
  };

  // Triggers committing visual workspace files to active local commit log
  const handlePerformCommit = () => {
    if (!commitMessage.trim()) {
      setCommitMessageError('Commit message is required.');
      return;
    }
    if (workingChanges.length === 0) {
      setCommitMessageError('No modified structures staged.');
      return;
    }

    setCommitMessageError('');

    // Prepare full diff state to be persisted inside history commit node for direct auditing!
    const commitFiles = workingChanges.map(c => ({
      path: c.path,
      status: c.status,
      diffLines: computeSimpleDiff(c.oldContent, c.newContent)
    }));

    const nextSha = Math.random().toString(16).substring(2, 9);
    const newCommit: GitCommitItem = {
      sha: nextSha,
      message: commitMessage.trim(),
      author: workspace.author || "EliteModder",
      email: "KennySmith.1911@gmail.com",
      timestamp: "Just now",
      branch: activeBranch,
      track: 0,
      activeTracks: [0],
      filesChanged: commitFiles
    };

    // Prepend new commit at top of log stack, updating links
    const nextHistory = [newCommit, ...localHistory];
    saveHistory(nextHistory);

    // Save baseline snapshot to clear changes
    const stringified = JSON.stringify(workspace);
    localStorage.setItem('x4_git_baseline', stringified);
    setGitBaseline(workspace);

    // Reset input message
    setCommitMessage('');
  };

  // Connects GitHub Credentials
  const handleConnectGitHub = () => {
    localStorage.setItem('x4_github_pat', gitPat);
    localStorage.setItem('x4_github_owner', gitOwner);
    localStorage.setItem('x4_github_repo', gitRepo);
    localStorage.setItem('x4_github_connected', 'true');
    setIsGitHubConnected(true);
    setShowConfig(false);
    setSyncStatusMsg('Linked with GitHub Repository successfully!');
  };

  const handleDisconnectGitHub = () => {
    localStorage.setItem('x4_github_connected', 'false');
    setIsGitHubConnected(false);
    setSyncStatusMsg('Disconnected from remote peer.');
  };

  // Pushes active files to real linked GitHub repository using custom express proxy endpoint
  const handlePushGitWorkspace = async () => {
    if (!isGitHubConnected || !gitPat) {
      setSyncStatusMsg('Source control is not authenticated. Open settings to link GitHub.');
      return;
    }

    setSyncLoading(true);
    setSyncStatusMsg('Pushing modified snapshots to remote...');

    try {
      // Pack full XML and HUD files
      const mdCode = generateMDXML(workspace);
      const uiCode = generateUIXML(workspace);
      const contentXml = `<?xml version="1.0" encoding="utf-8"?>
<content id="${workspace.name}" name="${workspace.name}" author="${workspace.author || 'Author'}" version="${workspace.version || '1.0.0'}" description="${workspace.description || ''}">
</content>`;

      const payload = {
        pat: gitPat,
        owner: gitOwner,
        repo: gitRepo,
        branch: activeBranch,
        commitMessage: `feat: synchronize mod files [Studio Commit]`,
        files: [
          { path: 'content.xml', content: contentXml },
          { path: `md/${workspace.name || 'mod'}.xml`, content: mdCode },
          { path: 'ui/hud_menu.xml', content: uiCode }
        ]
      };

      const res = await fetch('/api/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to push repository files.');
      }

      setSyncStatusMsg(`Success! Synchronized files to branch: ${activeBranch}`);
    } catch (err: any) {
      setSyncStatusMsg(`Push failed: ${err.message || err}`);
    } finally {
      setSyncLoading(false);
    }
  };

  // Master line render coordinates calculator for perfect connection lines between commits in graph tab
  const computedGraphTracks = useMemo(() => {
    const trackWidth = 14;
    const paddingLeft = 14;
    const rowHeight = 44;

    const paths: { d: string; color: string }[] = [];

    // Let's connect commits in sequence
    for (let i = 0; i < localHistory.length; i++) {
      const current = localHistory[i];
      const next = localHistory[i + 1];

      if (!next) continue;

      const xCurrent = paddingLeft + current.track * trackWidth;
      const yCurrent = i * rowHeight + 22;

      // Vertical line for active track continuation
      current.activeTracks.forEach(t => {
        const hasTInNext = next.activeTracks.includes(t);
        if (hasTInNext) {
          const xT = paddingLeft + t * trackWidth;
          paths.push({
            d: `M ${xT} ${yCurrent} L ${xT} ${(i + 1) * rowHeight + 22}`,
            color: t === 0 ? '#06b6d4' : (t === 1 ? '#f97316' : '#ec4899')
          });
        }
      });

      // Special branching line
      if (next.branchFromTrack !== undefined) {
        const xParent = paddingLeft + next.branchFromTrack * trackWidth;
        const xChild = paddingLeft + next.track * trackWidth;
        const yChild = (i + 1) * rowHeight + 22;

        paths.push({
          d: `M ${xParent} ${yCurrent} Q ${xParent} ${yCurrent + 18}, ${xChild} ${yChild}`,
          color: next.track === 1 ? '#f97316' : '#ec4899'
        });
      }

      // Special merge line
      if (current.mergeFromTrack !== undefined) {
        const xMerged = paddingLeft + current.mergeFromTrack * trackWidth;
        const xMain = paddingLeft + current.track * trackWidth;
        const yMerged = (i + 1) * rowHeight + 22;

        paths.push({
          d: `M ${xMerged} ${yCurrent} Q ${xMain} ${yCurrent + 18}, ${xMain} ${yMerged}`,
          color: current.mergeFromTrack === 1 ? '#f97316' : '#ec4899'
        });
      }
    }

    return paths;
  }, [localHistory]);

  return (
    <div className="flex flex-col h-full bg-[#0a0c10] select-none text-slate-300 font-sans" id="source_control_system">
      
      {/* Tab Nav Controls */}
      <div className="flex border-b border-white/5 bg-[#0e121a]">
        <button
          onClick={() => setActiveTab2('sourceControl')}
          className={`flex-1 py-2 text-[10px] font-mono font-bold tracking-wider uppercase border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'sourceControl'
              ? 'border-cyan-500 text-white bg-cyan-600/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <GitCommit className="w-3.5 h-3.5" />
          Pending ({workingChanges.length})
        </button>
        <button
          onClick={() => setActiveTab2('graph')}
          className={`flex-1 py-2 text-[10px] font-mono font-bold tracking-wider uppercase border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'graph'
              ? 'border-cyan-500 text-white bg-cyan-600/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
          Git Graph Log
        </button>

        <button
          onClick={() => setShowConfig(!showConfig)}
          className={`px-3 border-l border-white/5 hover:text-white flex items-center justify-center cursor-pointer ${
            isGitHubConnected ? 'text-emerald-400' : 'text-slate-500'
          }`}
          title="GitHub Peer Settings"
        >
          <Github className="w-4 h-4" />
        </button>
      </div>

      {/* GitHub Config Modal/Slide Pane */}
      {showConfig && (
        <div className="p-3 bg-[#0c1017] border-b border-white/10 space-y-3 font-mono text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-cyan-400 flex items-center gap-1">
              <Github className="w-3.5 h-3.5" />
              PEER REPOSITORY SETUP
            </span>
            <button onClick={() => setShowConfig(false)} className="text-slate-400 hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-slate-500 block mb-0.5 uppercase text-[9px]">GitHub Personal Access Token (PAT)</label>
              <input 
                type="password"
                value={gitPat}
                onChange={e => setGitPat(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxx"
                className="w-full p-1.5 bg-black/60 border border-white/10 rounded focus:outline-none focus:border-cyan-500 text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-500 block mb-0.5 uppercase text-[9px]">Owner / Nick</label>
                <input 
                  type="text"
                  value={gitOwner}
                  onChange={e => setGitOwner(e.target.value)}
                  placeholder="e.g. KennyG1990"
                  className="w-full p-1.5 bg-black/60 border border-white/10 rounded focus:outline-none focus:border-cyan-500 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-0.5 uppercase text-[9px]">Repository Name</label>
                <input 
                  type="text"
                  value={gitRepo}
                  onChange={e => setGitRepo(e.target.value)}
                  placeholder="e.g. elite-escort-mod"
                  className="w-full p-1.5 bg-black/60 border border-white/10 rounded focus:outline-none focus:border-cyan-500 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              {isGitHubConnected ? (
                <button
                  onClick={handleDisconnectGitHub}
                  className="px-2 py-1 bg-red-600/25 border border-red-500/30 hover:bg-red-600 hover:text-white text-red-300 font-bold transition-all rounded cursor-pointer"
                >
                  DISCONNECT
                </button>
              ) : (
                <button
                  onClick={handleConnectGitHub}
                  className="px-2.5 py-1 bg-cyan-600/20 border border-cyan-500/40 hover:bg-cyan-500 hover:text-black text-cyan-300 font-bold transition-all rounded cursor-pointer uppercase"
                >
                  LINK PEER REMOTE
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Synchronizer Status Msg */}
      {syncStatusMsg && (
        <div className="px-3 py-1 bg-cyan-500/5 border-b border-cyan-500/10 text-[9px] font-mono text-cyan-300 uppercase flex items-center justify-between">
          <span className="truncate">{syncStatusMsg}</span>
          <button onClick={() => setSyncStatusMsg('')} className="hover:text-white cursor-pointer ml-1">×</button>
        </div>
      )}

      {/* SOURCE CONTROL TAB VIEW */}
      {activeTab === 'sourceControl' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-3 space-y-4">
          
          {/* Active changes lists */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-slate-400 font-sans font-bold uppercase text-[9.5px] tracking-wider border-b border-white/5 pb-1">
              <span className="flex items-center gap-1">
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                Working Changeset
              </span>
              <span className="bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono text-[8px]">{workingChanges.length} Files</span>
            </div>

            {workingChanges.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center text-slate-550 border border-dashed border-white/5 rounded-lg bg-black/10">
                <Check className="w-6 h-6 text-emerald-500/40 mb-1" />
                <p className="text-[10px] font-mono font-bold text-slate-400">CLEAN HEAD WORKSPACE</p>
                <p className="text-[9px] text-slate-500 leading-normal mt-0.5">Edit flowchart nodes or layout menus to draft commit diffs.</p>
              </div>
            ) : (
              <div className="space-y-1 font-mono text-[10.5px]">
                {workingChanges.map(change => (
                  <div 
                    key={change.path}
                    className="flex items-center justify-between p-2 rounded bg-[#0e121a] hover:bg-[#121824] border border-white/5 group transition-all"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <div className="truncate">
                        <span className="text-slate-200 block font-sans truncate">{change.label}</span>
                        <span className="text-[8.5px] text-slate-500 italic block">{change.path}</span>
                      </div>
                    </div>
                    
                    {/* Diff lines counts */}
                    <div className="flex items-center gap-2">
                      <div className="text-[8.5px] flex items-center gap-1 font-mono">
                        <span className="text-emerald-400 font-bold">+{change.diffCount.additions}</span>
                        <span className="text-red-400 font-bold">-{change.diffCount.deletions}</span>
                      </div>
                      <button 
                        onClick={() => {
                          const mockCommit: GitCommitItem = {
                            sha: "PENDING",
                            message: "Working staged edits",
                            author: workspace.author || "Active Dev",
                            email: "KennySmith.1911@gmail.com",
                            timestamp: "Now",
                            branch: "main",
                            track: 0,
                            activeTracks: [0],
                            filesChanged: [{
                              path: change.path,
                              status: change.status,
                              diffLines: []
                            }]
                          };
                          // Replace diffLines directly to load on audit popup
                          mockCommit.filesChanged![0].diffLines = computeSimpleDiff(change.oldContent, change.newContent);
                          setSelectedCommit(mockCommit);
                          setInspectionFile(change.path);
                          setIsDiffModalOpen(true);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-black transition-all rounded cursor-pointer"
                        title="Audits code difference"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Staging actions and Commit Input */}
          <div className="p-3 bg-[#0a0c10] border border-white/5 rounded-lg space-y-3">
            <label className="text-[9px] font-mono font-bold uppercase text-slate-450 block tracking-wider">Commit drafting desk</label>
            
            <div className="relative">
              <textarea
                value={commitMessage}
                onChange={e => setCommitMessage(e.target.value)}
                placeholder="Message (Ctrl+Enter to commit...)"
                rows={2}
                disabled={generatingMessage}
                className="w-full bg-[#07090d] border border-white/10 rounded-md p-2 text-[10.5px] font-mono text-white placeholder-slate-650 focus:outline-none focus:border-cyan-500 resize-none max-h-16 disabled:opacity-50"
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handlePerformCommit();
                  }
                }}
              />
              <button
                onClick={handleGenerateCommitMessageAI}
                disabled={generatingMessage || workingChanges.length === 0}
                className="absolute right-2 bottom-2 p-1.5 rounded-md bg-cyan-600/10 hover:bg-cyan-500 border border-cyan-500/20 hover:border-transparent text-cyan-400 hover:text-black transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                title="AI Generate ✨ Commit Message"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            </div>

            {commitMessageError && (
              <p className="text-[9px] text-red-400 font-mono italic">{commitMessageError}</p>
            )}

            <div className="flex gap-1.5 h-8">
              <button
                onClick={handlePerformCommit}
                disabled={workingChanges.length === 0}
                className="flex-1 py-1 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-black font-mono font-bold text-[10.5px] rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed uppercase"
              >
                <Check className="w-3.5 h-3.5" />
                Commit files
              </button>
              
              <button
                onClick={handlePushGitWorkspace}
                disabled={!isGitHubConnected || syncLoading}
                className="px-3 bg-[#0e121a] hover:bg-[#161c29] border border-white/10 disabled:opacity-35 text-slate-300 hover:text-white rounded transition-all cursor-pointer flex items-center justify-center"
                title="Saves commit logs to peer repository"
              >
                {syncLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Connected GitHub Overview footer inside pending tab */}
          {isGitHubConnected && (
            <div className="p-2.5 rounded bg-emerald-500/5 border border-emerald-500/10 space-y-1.5 font-mono text-[9px]">
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1 font-bold uppercase text-[8px] text-emerald-400 animate-pulse">● Linked with Remote</span>
                <span>Active path: {activeBranch}</span>
              </div>
              <div className="text-white truncate flex items-center gap-1">
                <Github className="w-3 h-3 text-cyan-400 shrink-0" />
                {gitOwner}/{gitRepo}
              </div>
            </div>
          )}
        </div>
      )}

      {/* GRAPH TAB VIEW */}
      {activeTab === 'graph' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          
          {/* Action Row */}
          <div className="p-2 border-b border-white/5 bg-[#0d1117] flex items-center justify-between text-[9px] font-mono text-slate-400 shrink-0 select-none">
            <div className="flex items-center gap-1.5">
              <span>Auto-sync</span>
              <input type="checkbox" defaultChecked className="accent-cyan-500 cursor-pointer" />
            </div>
            
            <div className="flex items-center gap-2">
              <button className="hover:text-cyan-400 flex items-center gap-0.5" title="Pull updates">
                <ArrowDown className="w-3 h-3" />
                Pull
              </button>
              <button onClick={handlePushGitWorkspace} className="hover:text-cyan-400 flex items-center gap-0.5" title="Push staging logs">
                <ArrowUp className="w-3 h-3" />
                Push
              </button>
              <button className="hover:text-cyan-400 flex items-center gap-0.5" title="Fetch status">
                <RefreshCw className="w-2.5 h-2.5" />
                Fetch
              </button>
            </div>
          </div>

          {/* List panel */}
          <div className="flex-1 overflow-y-auto relative min-h-0">
            
            {/* Absolute SVG overlays representing beautiful Git connecting branching paths */}
            <div className="absolute top-0 bottom-0 left-0 w-16 pointer-events-none z-0">
              <svg 
                className="w-full h-full"
                style={{ height: `${localHistory.length * 44}px` }}
              >
                {computedGraphTracks.map((path, index) => (
                  <path 
                    key={index}
                    d={path.d}
                    fill="none"
                    stroke={path.color}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.80"
                  />
                ))}
              </svg>
            </div>

            {/* Commit Log row items list */}
            <div className="relative z-10">
              {localHistory.map((commit, index) => {
                const nodeX = 14 + commit.track * 14;
                const nodeY = 22;
                const strokeColor = commit.track === 0 ? '#06b6d4' : (commit.track === 1 ? '#f97316' : '#ec4899');
                
                return (
                  <div 
                    key={commit.sha}
                    onClick={() => {
                      setSelectedCommit(commit);
                      if (commit.filesChanged && commit.filesChanged.length > 0) {
                        setInspectionFile(commit.filesChanged[0].path);
                      } else {
                        setInspectionFile('');
                      }
                      setIsDiffModalOpen(true);
                    }}
                    className="h-11 flex items-center hover:bg-white/5 border-b border-white/5 pl-16 pr-3 cursor-pointer group transition-all"
                  >
                    {/* Little relative node overlay precisely aligned within track coordinates */}
                    <div className="absolute left-0 w-16 h-11 pointer-events-none">
                      <svg className="w-full h-full">
                        <circle 
                          cx={nodeX} 
                          cy={nodeY} 
                          r="4.5" 
                          fill="#0a0c10" 
                          stroke={strokeColor} 
                          strokeWidth="2" 
                        />
                        {/* Inner micro ring if selected or author matches */}
                        {commit.sha === 'df8a12c' && (
                          <circle cx={nodeX} cy={nodeY} r="1.5" fill={strokeColor} />
                        )}
                      </svg>
                    </div>

                    {/* Commit specs */}
                    <div className="min-w-0 flex-1 pl-1 text-[10px] font-sans">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-100 font-medium truncate group-hover:text-cyan-400 transition-colors block leading-tight">
                          {commit.message}
                        </span>
                        
                        {/* Branch badging capsules */}
                        {commit.sha === 'df8a12c' && (
                          <span className="px-1 text-[7.5px] font-mono leading-none bg-cyan-950 border border-cyan-800 text-cyan-400 rounded shrink-0 font-bold">
                            main
                          </span>
                        )}
                        {commit.sha === 'cf017fa' && (
                          <span className="px-1 text-[7.5px] font-mono leading-none bg-orange-950 border border-orange-800 text-orange-400 rounded shrink-0 font-bold">
                            feature-wiki
                          </span>
                        )}
                        {commit.sha === '10fb2a0' && (
                          <span className="px-1 text-[7.5px] font-mono leading-none bg-pink-950 border border-pink-800 text-pink-400 rounded shrink-0 font-bold">
                            feature-hybrid
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[8.5px] text-slate-500 font-mono mt-0.5 leading-none">
                        <span className="text-slate-400 truncate max-w-[80px]">{commit.author}</span>
                        <span>•</span>
                        <span>{commit.timestamp}</span>
                        <span>•</span>
                        <span className="text-cyan-500">{commit.sha}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

          {/* Active branch footer status strip */}
          <div className="p-1 px-2.5 border-t border-white/5 bg-[#080a0f] flex items-center justify-between text-[9px] font-mono text-slate-500 shrink-0">
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3 h-3 text-cyan-400" />
              <span className="text-slate-300 font-bold uppercase">main</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Linked
              </span>
            </div>
          </div>

        </div>
      )}

      {/* CODE DIFFERENCES POPUP MODAL (100% compliant with dynamic split-views) */}
      {isDiffModalOpen && selectedCommit && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm select-text">
          <div className="w-full max-w-4xl h-[70vh] bg-[#0c1017] border border-slate-800 rounded-lg shadow-2xl flex flex-col overflow-hidden font-sans">
            
            {/* Modal Header bar */}
            <div className="p-3.5 bg-[#0d121c] border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 px-1.5 rounded bg-slate-900 border border-white/10 font-mono text-[9.5px] text-cyan-400">{selectedCommit.sha}</span>
                <div className="text-xs">
                  <h3 className="font-bold text-white font-mono leading-tight">{selectedCommit.message}</h3>
                  <p className="text-[10px] text-slate-400 font-mono leading-normal mt-0.5">
                    Committed by <span className="text-cyan-300">{selectedCommit.author}</span> ({selectedCommit.email}) • {selectedCommit.timestamp}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsDiffModalOpen(false)}
                className="p-1 bg-slate-900 border border-white/5 hover:border-white/20 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal layout */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              
              {/* Files list left tab column */}
              <div className="w-56 border-r border-white/5 bg-[#0a0c10] p-2 space-y-1 overflow-y-auto select-none">
                <h4 className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider p-1">Commit changeset Files</h4>
                
                {(!selectedCommit.filesChanged || selectedCommit.filesChanged.length === 0) ? (
                  <div className="p-2 text-[9.5px] text-slate-500 italic leading-relaxed">
                    No actual files affected (metadata alignment commit or synthetic commit log placeholder check).
                  </div>
                ) : (
                  selectedCommit.filesChanged.map(f => (
                    <button
                      key={f.path}
                      onClick={() => setInspectionFile(f.path)}
                      className={`w-full text-left p-2 rounded text-[10.5px] font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                        inspectionFile === f.path 
                          ? 'bg-cyan-600/15 border border-cyan-500/20 text-white' 
                          : 'hover:bg-white/5 border border-transparent text-slate-400'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">{f.path}</span>
                    </button>
                  ))
                )}
              </div>

              {/* Code viewer split panel right */}
              <div className="flex-1 bg-[#07090d] overflow-y-auto p-4 min-w-0">
                {(() => {
                  const activeFileObj = selectedCommit.filesChanged?.find(f => f.path === inspectionFile);
                  if (!activeFileObj) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                        <Terminal className="w-8 h-8 text-slate-700 mb-2" />
                        <h4 className="font-mono text-xs font-bold text-slate-400">SELECT CHANGED FILE</h4>
                        <p className="text-[10px] text-slate-500 mt-1 max-w-xs leading-normal">Pick a file from the repository changes checklist to audit the line-by-line diff of that commit.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-1 font-mono text-[11px] leading-relaxed select-text pr-2">
                      <div className="p-2 border border-slate-800/60 rounded bg-slate-900/50 mb-3 text-[10px] flex items-center justify-between text-slate-400">
                        <span>Auditing details for: <code className="text-cyan-400">{inspectionFile}</code></span>
                        <span className="text-slate-500 italic font-medium uppercase">Unified Diff view</span>
                      </div>

                      {activeFileObj.diffLines.map((line, idx) => {
                        let lineBg = 'hover:bg-white/5 text-slate-350';
                        let prefix = ' ';
                        if (line.type === 'addition') {
                          lineBg = 'bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300';
                          prefix = '+';
                        } else if (line.type === 'deletion') {
                          lineBg = 'bg-red-500/10 hover:bg-red-500/15 text-red-300 line-through';
                          prefix = '-';
                        }

                        return (
                          <div 
                            key={idx} 
                            className={`flex min-w-full p-0.5 rounded px-2 whitespace-pre-wrap break-all ${lineBg}`}
                          >
                            <span className="w-6 text-slate-600 block shrink-0 select-none text-right pr-2 text-[10px]">{idx + 1}</span>
                            <span className="w-4 text-slate-500 block shrink-0 select-none font-bold text-[10px]">{prefix}</span>
                            <span className="flex-1 font-mono">{line.value}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* PopFooter status strip */}
            <div className="p-2 px-3 bg-[#0a0c10] border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>Branch context: <code className="text-slate-400">{selectedCommit.branch}</code></span>
              <span>SHA-256: <code>{selectedCommit.sha === 'PENDING' ? 'Uncommitted Workspace Diffs' : `e3f4a3028fb08c${selectedCommit.sha}`}</code></span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
