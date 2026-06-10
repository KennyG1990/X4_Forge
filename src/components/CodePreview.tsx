/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Clipboard, 
  Check, 
  Download, 
  Terminal, 
  AlertTriangle, 
  CheckCircle,
  FileCode,
  FileJson,
  Brain,
  Sparkles,
  RefreshCw,
  Compass,
  Activity,
  Folder,
  Save,
  Wrench,
  Upload,
  Cpu,
  X,
  PackageCheck
} from 'lucide-react';
import { ModWorkspace, generateMDXML, generateUIXML, validateModWorkspace, XMLDiagnostic, MDNode } from '../types';
import { getAIHeaders, handleApiResponse } from '../lib/apiHelper';
import { parseXMLToWorkspace } from '../lib/xmlParser';
import MDScanner from './MDScanner';
import PlaytestWorkspace from './PlaytestWorkspace';

export interface EditorFile {
  name: string;
  path: string;
  content: string;
  handle?: any;
  isMock?: boolean;
}

interface CodePreviewProps {
  workspace: ModWorkspace;
  setWorkspace?: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  saveCheckpoint?: (customTarget?: ModWorkspace) => void;
  dirHandle: any | null;
  setDirHandle: (handle: any | null) => void;
  dirName: string;
  setDirName: (name: string) => void;
  activeEditorFile: EditorFile | null;
  setActiveEditorFile: React.Dispatch<React.SetStateAction<EditorFile | null>>;
  selectedNode: MDNode | null;
}

interface ScriptAnalysis {
  summary: string;
  triggerCondition: string;
  flowSteps: Array<{
    nodeId: string;
    nodeLabel: string;
    xmlTag: string;
    plainEnglishAction: string;
    sequenceOrder: number;
  }>;
  entityRegistry: Array<{
    name: string;
    type: string;
    detail: string;
  }>;
}

interface LogIssue {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  errorLogSnippet: string;
  explanation: string;
  impact: string;
  suggestedAction: string;
  affectedNodeId?: string;
  autoFix?: {
    type: 'update_node_property';
    nodeId: string;
    propertyKey: string;
    propertyValue: string;
  };
}

interface LogAnalysisResult {
  parsedLogsCount: number;
  summaryOfGameMDReload: string;
  issues: LogIssue[];
}

export default function CodePreview({ 
  workspace, 
  setWorkspace, 
  saveCheckpoint, 
  dirHandle, 
  setDirHandle, 
  dirName, 
  setDirName,
  activeEditorFile,
  setActiveEditorFile,
  selectedNode
}: CodePreviewProps) {
  const [codeActiveTab, setCodeActiveTab] = useState<'md' | 'ui' | 'node' | 'file'>('md');
  const [toolActiveTab, setToolActiveTab] = useState<'analyzer' | 'playtest'>('analyzer');
  const [copied, setCopied] = useState<boolean>(false);
  const [diagnostics, setDiagnostics] = useState<XMLDiagnostic[]>([]);
  
  // Cognitive Analyzer states
  const [analysisResult, setAnalysisResult] = useState<ScriptAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastAnalyzedWorkspace, setLastAnalyzedWorkspace] = useState<string>('');

  // Playtest Live Debugger states
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncErrorMsg, setSyncErrorMsg] = useState<string>('');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(true);
  
  const [logInput, setLogInput] = useState<string>('');
  const [diagnosingLogs, setDiagnosingLogs] = useState<boolean>(false);
  const [logAnalysis, setLogAnalysis] = useState<LogAnalysisResult | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [successfulFixApplied, setSuccessfulFixApplied] = useState<string | null>(null);

  // Compile states
  const [compileStatus, setCompileStatus] = useState<'idle' | 'compiling' | 'success' | 'error'>('idle');
  const [compileMessage, setCompileMessage] = useState<string>('');

  // File Editor states
  const [editorContent, setEditorContent] = useState<string>('');
  const [editorSaveStatus, setEditorSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [editorError, setEditorError] = useState<string>('');

  const mdCode = generateMDXML(workspace);
  const uiCode = generateUIXML(workspace);

  const generateNodeXMLPreview = (node: MDNode) => {
    let xml = `<${node.xmlTag}`;
    Object.entries(node.properties || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        xml += ` ${k}="${v}"`;
      }
    });
    if (node.comment) {
      xml += ` comment="${node.comment}"`;
    }
    xml += ` />`;
    return xml;
  };

  let currentCode = '';
  if (codeActiveTab === 'md') {
    currentCode = mdCode;
  } else if (codeActiveTab === 'ui') {
    currentCode = uiCode;
  } else if (codeActiveTab === 'node') {
    currentCode = selectedNode ? generateNodeXMLPreview(selectedNode) : '';
  } else if (codeActiveTab === 'file') {
    currentCode = editorContent;
  }

  const workspaceSerialized = JSON.stringify({
    name: workspace.name,
    description: workspace.description,
    author: workspace.author,
    version: workspace.version,
    nodes: workspace.nodes.map(n => ({ id: n.id, type: n.type, label: n.label, xmlTag: n.xmlTag, properties: n.properties })),
    links: workspace.links,
    uiWidgets: workspace.uiWidgets.map(w => ({ id: w.id, type: w.type, label: w.label, properties: w.properties }))
  });

  const isAnalysisStale = analysisResult !== null && lastAnalyzedWorkspace !== workspaceSerialized;

  // Check if File System Access API is supported
  const isFileSystemAccessSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  // Run diagnostics validator updates
  useEffect(() => {
    const reports = validateModWorkspace(workspace, mdCode);
    setDiagnostics(reports);
  }, [workspace, mdCode]);

  // Handle automatic synchronization to folder handle on workspace edits
  useEffect(() => {
    if (autoSaveEnabled && dirHandle) {
      saveToDirectory(dirHandle, false);
    }
  }, [workspaceSerialized, autoSaveEnabled, dirHandle]);

  useEffect(() => {
    if (activeEditorFile) {
      setEditorContent(activeEditorFile.content);
      setCodeActiveTab('file');
      setEditorSaveStatus('idle');
      setEditorError('');
    }
  }, [activeEditorFile?.path]);

  const saveActiveEditorFile = async () => {
    if (!activeEditorFile) return;
    setEditorSaveStatus('saving');
    try {
      if (activeEditorFile.handle) {
        const writable = await activeEditorFile.handle.createWritable();
        await writable.write(editorContent);
        await writable.close();
      }
      activeEditorFile.content = editorContent;
      setEditorSaveStatus('saved');
      setTimeout(() => setEditorSaveStatus('idle'), 2000);
    } catch (err: any) {
      setEditorSaveStatus('error');
      setEditorError(err.message || 'Save failed.');
    }
  };

  const handleEditorContentChange = (val: string) => {
    setEditorContent(val);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = () => {
    const blob = new Blob([currentCode], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = codeActiveTab === 'md' 
      ? `${workspace.name || 'custom_md_script'}.xml` 
      : codeActiveTab === 'ui'
      ? `${workspace.name || 'custom_menu_layout'}_ui.xml`
      : activeEditorFile?.name || 'edited_file.xml';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const triggerAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: getAIHeaders(),
        body: JSON.stringify({ workspace })
      });
      const data = await handleApiResponse(response, "Failed to establish telemetry connection to server.");
      setAnalysisResult(data.analysis);
      setLastAnalyzedWorkspace(workspaceSerialized);
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || "Failed to catalog script outline. Verify telemetry status.");
    } finally {
      setAnalyzing(false);
    }
  };

  const saveToDirectory = async (handle: any, showFeedback: boolean) => {
    if (!handle) return;
    if (showFeedback) {
      setSyncStatus('syncing');
    }
    try {
      const nameSanitized = (workspace.name || 'x4_md_studio_mod').replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      
      // 1. Write core MD XML
      const dirDir = await handle.getDirectoryHandle('md', { create: true });
      const mdFile = await dirDir.getFileHandle(`${nameSanitized}.xml`, { create: true });
      const mdWritable = await mdFile.createWritable();
      await mdWritable.write(generateMDXML(workspace));
      await mdWritable.close();

      // 2. Write UI layout XML if populated
      if (workspace.uiWidgets && workspace.uiWidgets.length > 0) {
        const uiDir = await handle.getDirectoryHandle('md_ui_layouts', { create: true });
        const uiFile = await uiDir.getFileHandle(`${nameSanitized}_ui.xml`, { create: true });
        const uiWritable = await uiFile.createWritable();
        await uiWritable.write(generateUIXML(workspace));
        await uiWritable.close();
      }

      // 3. Write AIScripts behavior trees
      if (workspace.aiScripts && workspace.aiScripts.length > 0) {
        const aiDir = await handle.getDirectoryHandle('aiscripts', { create: true });
        for (const script of workspace.aiScripts) {
          const fileName = script.name.endsWith('.xml') ? script.name : `${script.name}.xml`;
          await writeTextFile(aiDir, fileName, compileScriptToXML(script));
        }
      }

      // 4. Write Libraries (Wares / Jobs)
      if (workspace.wares && workspace.wares.length > 0) {
        const libDir = await handle.getDirectoryHandle('libraries', { create: true });
        await writeTextFile(libDir, 'wares.xml', compileWaresXML(workspace.wares));
      }
      if (workspace.jobs && workspace.jobs.length > 0) {
        const libDir = await handle.getDirectoryHandle('libraries', { create: true });
        await writeTextFile(libDir, 'jobs.xml', compileJobsXML(workspace.jobs));
      }

      // 5. Write Translation files
      if (workspace.tFiles && workspace.tFiles.length > 0) {
        const tDir = await handle.getDirectoryHandle('t', { create: true });
        for (const tFile of workspace.tFiles) {
          await writeTextFile(tDir, tFile.fileName || `0001-L${tFile.languageId}.xml`, compileTFileXML(tFile));
        }
      }

      // 6. Write XML diff patches grouped by file
      if (workspace.xmlPatches && workspace.xmlPatches.length > 0) {
        const patchesByFile: Record<string, any[]> = {};
        workspace.xmlPatches.forEach((patch: any) => {
          const file = patch.targetFile || 'libraries/ship_macros.xml';
          if (!patchesByFile[file]) {
            patchesByFile[file] = [];
          }
          patchesByFile[file].push(patch);
        });

        for (const [filePath, filePatches] of Object.entries(patchesByFile)) {
          await writeTextFileAtPath(handle, filePath, compileDiffDocument(filePatches, filePath));
        }
      }

      if (showFeedback) {
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 2000);
      }
    } catch (err: any) {
      console.error("Playtest Directory Sync Error:", err);
      if (showFeedback) {
        setSyncStatus('error');
        setSyncErrorMsg(err.message || "Disk write access refused. Try opening MD Studio in a new tab to bypass iframe security sandbox bounds.");
        setTimeout(() => setSyncStatus('idle'), 5000);
      }
    }
  };

  const handleLinkDirectory = async () => {
    if (!isFileSystemAccessSupported) {
      alert("Your browser does not fully support Direct Folder Sync. Please use Google Chrome, Edge, or Opera.");
      return;
    }
    try {
      const handle = await (window as any).showDirectoryPicker();
      setDirHandle(handle);
      setDirName(handle.name);
      await saveToDirectory(handle, true);
    } catch (err: any) {
      console.error("Directory picking failed/cancelled", err);
      if (err.name === 'SecurityError') {
        setSyncStatus('error');
        setSyncErrorMsg("Iframe security sandbox blocked folder access. Open the app in a new tab by clicking the url on the right!");
        setTimeout(() => setSyncStatus('idle'), 6000);
      }
    }
  };

  const handleTriggerLogAnalysis = async () => {
    if (!logInput.trim()) return;
    setDiagnosingLogs(true);
    setDiagnosticError(null);
    try {
      const response = await fetch('/api/gemini/analyze-log', {
        method: 'POST',
        headers: getAIHeaders(),
        body: JSON.stringify({ workspace, logs: logInput })
      });
      const data = await handleApiResponse(response, "Log parsing request rejected.");
      setLogAnalysis(data.analysis);
    } catch (err: any) {
      console.error(err);
      setDiagnosticError(err.message || "Failed to analyze X4 script logs via Gemini.");
    } finally {
      setDiagnosingLogs(false);
    }
  };

  const handleApplyAutoFix = (fix: any) => {
    if (!setWorkspace || !saveCheckpoint) {
      console.warn("Auto-fix not supported in this frame state.");
      return;
    }

    if (fix.type === 'update_node_property' && fix.nodeId && fix.propertyKey) {
      saveCheckpoint();
      setWorkspace(prev => {
        const updatedNodes = prev.nodes.map(n => {
          if (n.id === fix.nodeId) {
            return {
              ...n,
              properties: {
                ...n.properties,
                [fix.propertyKey]: fix.propertyValue
              }
            };
          }
          return n;
        });
        return {
          ...prev,
          nodes: updatedNodes
        };
      });

      setSuccessfulFixApplied(`Successfully repaired property '${fix.propertyKey}' to '${fix.propertyValue}'!`);
      setTimeout(() => setSuccessfulFixApplied(null), 4000);

      if (logAnalysis) {
        setLogAnalysis(prev => {
          if (!prev) return null;
          return {
            ...prev,
            issues: prev.issues.filter(issue => issue.autoFix?.nodeId !== fix.nodeId || issue.autoFix?.propertyKey !== fix.propertyKey)
          };
        });
      }
    }
  };

  const insertDemoX4Log = () => {
    const defaultCueName = workspace.nodes.find(n => n.type === 'cue')?.properties?.name || "My_Custom_Cue";
    const demoText = `[General] 2045.29: ==========================================
[General] 2045.29: X4: Foundations v6.20 Hotfix 1 (512390)
[General] 2045.29: Command Line: -debug all -logfile uidata.log -reloaddirector
[General] 2045.29: ==========================================
[MD Engine] Error: Parsing XML file extensions\\${workspace.name || 'X4_My_Custom_Mod'}\\md\\${workspace.name || 'X4_My_Custom_Mod'}.xml
*** Context:md.${defaultCueName}: cue has active state but 'instantiate' attribute is currently 'false'. Re-instantiation will fail on game reloads! Correct setting is recommended to be 'true' for persistent script triggers.
[MD Engine] Warning: Property 'faction' has unrecognized faction code 'ARGON_MILITARY' in cue '${defaultCueName}'. X4 standard code is 'argon'.
*** Context:md.Spawn_Escort_Ships: missing macro definition 'ship_arg_s_fighter_01_a'. Verify model path.`;
    setLogInput(demoText);
  };

  const handleLogFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setLogInput(text);
    };
    reader.readAsText(file);
  };

  const toSafeModId = (name: string) => {
    const safe = name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return safe || 'x4_md_studio_mod';
  };

  const toContentVersion = (value: string) => {
    const digits = String(value || '').replace(/\D/g, '');
    return (digits || '1').slice(0, 6).padStart(3, '0');
  };

  const escapeXmlAttr = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const escapeXmlText = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  const compileTFileXML = (file: NonNullable<ModWorkspace['tFiles']>[number]) => {
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<language id="${escapeXmlAttr(file.languageId)}">\n`;
    file.pages.forEach(page => {
      const title = page.title ? ` title="${escapeXmlAttr(page.title)}"` : '';
      xml += `  <page id="${escapeXmlAttr(page.id)}"${title}>\n`;
      page.items.forEach(item => {
        const comment = item.description ? ` <!-- ${escapeXmlText(item.description)} -->` : '';
        xml += `    <t id="${escapeXmlAttr(item.id)}">${escapeXmlText(item.value)}</t>${comment}\n`;
      });
      xml += `  </page>\n`;
    });
    xml += `</language>`;
    return xml;
  };

  const generateContentXML = (modId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const displayName = workspace.name || modId;
    const description = workspace.description || 'Generated by X4:MD Studio';
    const author = workspace.author || 'X4:MD Studio';
    return `<?xml version="1.0" encoding="utf-8"?>\n<content id="${escapeXmlAttr(modId)}" name="${escapeXmlAttr(displayName)}" description="${escapeXmlAttr(description)}" author="${escapeXmlAttr(author)}" version="${toContentVersion(workspace.version)}" date="${today}" save="0" enabled="1">\n  <text language="44" name="${escapeXmlAttr(displayName)}" description="${escapeXmlAttr(description)}" author="${escapeXmlAttr(author)}" />\n</content>\n`;
  };

  const compileScriptToXML = (script: any): string => {
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<aiscript name="${escapeXmlAttr(script.name)}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="aiscripts.xsd">\n`;
    xml += `  <!-- X4 Foundations Autopilot & Task Script Behavior -->\n`;
    xml += `  <!-- Generated visually using X4 Mod Studio Behaviors Suite -->\n`;
    xml += `  <params>\n`;
    (script.params || []).forEach((p: any) => {
      xml += `    <param name="${escapeXmlAttr(p.name)}" type="${escapeXmlAttr(p.type)}" default="${escapeXmlAttr(p.defaultValue)}" comment="${escapeXmlAttr(p.comment)}" />\n`;
    });
    xml += `  </params>\n`;

    if (script.interrupts && script.interrupts.length > 0) {
      xml += `  <interrupts>\n`;
      script.interrupts.forEach((int: any) => {
        xml += `    <handler event="${escapeXmlAttr(int.event)}">\n`;
        xml += `      <actions>\n`;
        if (int.action === 'flee') {
          xml += `        <run_script name="'move.flee'" />\n`;
        } else if (int.action === 'dock_at_safety') {
          xml += `        <run_script name="'move.dockat'" />\n`;
        } else {
          xml += `        <write_to_logbook text="'Interrupt event fired: ${escapeXmlAttr(int.event)}'" />\n`;
        }
        xml += `      </actions>\n`;
        xml += `    </handler>\n`;
      });
      xml += `  </interrupts>\n`;
    }

    xml += `  <attention min="${escapeXmlAttr(script.attentionLevel || 'low')}">\n`;
    xml += `    <actions>\n`;
    xml += `      <label name="start" />\n`;

    (script.actions || []).forEach((act: any) => {
      xml += `      <!-- Action: ${escapeXmlText(act.label)} -->\n`;
      switch (act.command) {
        case 'move_to':
          xml += `      <move_to object="this.ship" destination="${escapeXmlAttr(act.properties.destination || '$target')}" forceposition="false" finishonfound="true">\n`;
          xml += `        <interrupt_after_time time="10s" />\n`;
          xml += `      </move_to>\n`;
          break;
        case 'flee':
          xml += `      <run_script name="'move.flee'" />\n`;
          break;
        case 'shoot':
          xml += `      <shoot_at object="this.ship" target="${escapeXmlAttr(act.properties.target || '$enemy')}" turretmode="attackhostile" />\n`;
          break;
        case 'dock_at':
          xml += `      <dock_at object="this.ship" station="${escapeXmlAttr(act.properties.station || '$station')}" />\n`;
          break;
        case 'wait':
          if (act.properties.exact) {
            xml += `      <wait exact="${escapeXmlAttr(act.properties.exact)}" />\n`;
          } else {
            xml += `      <wait min="${escapeXmlAttr(act.properties.min || '2s')}" max="${escapeXmlAttr(act.properties.max || '10s')}" />\n`;
          }
          break;
        case 'find_objects':
          xml += `      <find_object name="$targets" class="class.${escapeXmlAttr(act.properties.class || 'ship')}" space="player.sector" multiple="true" />\n`;
          break;
        case 'custom_xml':
          xml += `      ${act.properties.rawXml || '<!-- custom nodes -->'}\n`;
          break;
      }
    });

    xml += `      <wait exact="5s" />\n`;
    xml += `      <resume label="start" />\n`;
    xml += `    </actions>\n`;
    xml += `  </attention>\n`;
    xml += `</aiscript>`;
    return xml;
  };

  const compileWaresXML = (wares: any[]): string => {
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<diff>\n`;
    xml += `  <!-- XML Diff Patch adding to core wares database file: libraries/wares.xml -->\n`;
    xml += `  <add sel="/wares">\n`;
    wares.forEach((item: any) => {
      xml += `    <ware id="${escapeXmlAttr(item.id)}" name="${escapeXmlAttr(item.name)}" description="${escapeXmlAttr(item.description)}" transport="${escapeXmlAttr(item.transport)}" volume="${item.volume}" tags="economy equipment">\n`;
      xml += `      <price min="${item.minPrice}" average="${item.avgPrice}" max="${item.maxPrice}" />\n`;
      xml += `      <production time="${item.prodTime}" amount="${item.prodAmount}" method="default" name="Assembly output">\n`;
      xml += `        <primary>\n`;
      xml += `          <ware ware="ore" amount="15" />\n`;
      xml += `          <ware ware="energycells" amount="40" />\n`;
      xml += `        </primary>\n`;
      xml += `      </production>\n`;
      xml += `    </ware>\n`;
    });
    xml += `  </add>\n`;
    xml += `</diff>`;
    return xml;
  };

  const compileJobsXML = (jobs: any[]): string => {
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<diff>\n`;
    xml += `  <!-- XML Diff Patch adding new AI pilot squad to core jobs database: libraries/jobs.xml -->\n`;
    xml += `  <add sel="/jobs">\n`;
    jobs.forEach((item: any) => {
      xml += `    <job id="${escapeXmlAttr(item.id)}" name="${escapeXmlAttr(item.name)}" active="true">\n`;
      xml += `      <expiration min="7200" max="14400" />\n`;
      xml += `      <modifiers rebuild="${item.rebuildOnDestroy ? 'true' : 'false'}" />\n`;
      xml += `      <ship>\n`;
      xml += `        <select faction="${escapeXmlAttr(item.faction)}" tags="military ${escapeXmlAttr(item.shipClass)}" />\n`;
      xml += `        <loadout>\n`;
      xml += `          <level min="0.8" max="1.0" />\n`;
      xml += `        </loadout>\n`;
      xml += `      </ship>\n`;
      xml += `      <quota galaxy="${item.galaxyQuota}" sector="${item.sectorQuota}" />\n`;
      xml += `      <task script="${escapeXmlAttr(item.taskScript)}" />\n`;
      xml += `    </job>\n`;
    });
    xml += `  </add>\n`;
    xml += `</diff>`;
    return xml;
  };

  const compileDiffDocument = (patches: any[], targetFile: string): string => {
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<!-- XML Diff patch targeting file: "${escapeXmlAttr(targetFile)}" -->\n`;
    xml += `<!-- Applied safely into the central Egosoft index registry -->\n`;
    xml += `<diff>\n`;
    patches.forEach((b: any) => {
      xml += `  <!-- ${escapeXmlText(b.note || '')} -->\n`;
      if (b.action === 'remove') {
        xml += `  <remove sel="${escapeXmlAttr(b.sel)}" />\n\n`;
      } else {
        xml += `  <${b.action} sel="${escapeXmlAttr(b.sel)}">\n`;
        const lines = (b.content || '').split('\n');
        lines.forEach((l: string) => {
          xml += `    ${l}\n`;
        });
        xml += `  </${b.action}>\n\n`;
      }
    });
    xml += `</diff>`;
    return xml;
  };

  const writeTextFileAtPath = async (baseHandle: any, filePath: string, content: string) => {
    const parts = filePath.split('/');
    let currentDir = baseHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
    }
    const filename = parts[parts.length - 1];
    const fileHandle = await currentDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  };

  const validatePackageReadiness = (): XMLDiagnostic[] => {
    const reports: XMLDiagnostic[] = [];
    const modId = toSafeModId(workspace.name);

    if (!workspace.name?.trim()) {
      reports.push({
        severity: 'error',
        message: 'Compiled extension needs a mod name. This becomes the content.xml name and package folder.',
        category: 'egosoft'
      });
    }

    if (!/^[a-z0-9_]+$/.test(modId)) {
      reports.push({
        severity: 'error',
        message: `Compiled extension id "${modId}" must use lowercase letters, numbers, and underscores only.`,
        category: 'egosoft'
      });
    }

    if (!workspace.author?.trim()) {
      reports.push({
        severity: 'warning',
        message: 'Compiled content.xml has no explicit author. Set Mod Meta author before shipping.',
        category: 'egosoft'
      });
    }

    if (!workspace.description?.trim()) {
      reports.push({
        severity: 'warning',
        message: 'Compiled content.xml has no explicit description. Manual users need this in the Extensions menu.',
        category: 'egosoft'
      });
    }

    if (!workspace.nodes.some(node => node.type === 'cue')) {
      reports.push({
        severity: 'error',
        message: 'Compiled MD package has no cue nodes. The extension can load, but the MD script has no executable entry point.',
        category: 'egosoft'
      });
    }

    return reports;
  };

  const writeTextFile = async (directoryHandle: any, filename: string, content: string) => {
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  };

  const handleCompileModProject = async () => {
    if (!dirHandle) {
      setCompileStatus('error');
      setCompileMessage('Link your X4 extensions folder before compiling a package.');
      setToolActiveTab('playtest');
      return;
    }

    setCompileStatus('compiling');
    setCompileMessage('');

    try {
      const blocking = validatePackageReadiness().filter(report => report.severity === 'error');
      if (blocking.length > 0) {
        throw new Error(blocking.map(report => report.message).join(' '));
      }

      const modId = toSafeModId(workspace.name);
      const modDir = await dirHandle.getDirectoryHandle(modId, { create: true });
      const directorDir = await modDir.getDirectoryHandle('md', { create: true });

      // 1. Manifest content.xml and README.md
      await writeTextFile(modDir, 'content.xml', generateContentXML(modId));
      await writeTextFile(modDir, 'README.md', `# ${workspace.name || modId}\n\nGenerated by X4:MD Studio.\n\nInstall location:\n\n\`\`\`\nX4 Foundations/extensions/${modId}/\n\`\`\`\n\nRuntime reload during development: save files, then run \`refreshmd\` in X4's debug command input.\n`);

      // 2. Mission Director (md) script
      await writeTextFile(directorDir, `${modId}.xml`, generateMDXML(workspace));

      // 3. UI widget layouts
      if (workspace.uiWidgets?.length) {
        const uiDir = await modDir.getDirectoryHandle('md_ui_layouts', { create: true });
        await writeTextFile(uiDir, `${modId}_ui.xml`, generateUIXML(workspace));
      }

      // 4. AIScripts behavior trees
      if (workspace.aiScripts?.length) {
        const aiDir = await modDir.getDirectoryHandle('aiscripts', { create: true });
        for (const script of workspace.aiScripts) {
          const fileName = script.name.endsWith('.xml') ? script.name : `${script.name}.xml`;
          await writeTextFile(aiDir, fileName, compileScriptToXML(script));
        }
      }

      // 5. Libraries (Wares / Jobs)
      if (workspace.wares?.length) {
        const libDir = await modDir.getDirectoryHandle('libraries', { create: true });
        await writeTextFile(libDir, 'wares.xml', compileWaresXML(workspace.wares));
      }
      if (workspace.jobs?.length) {
        const libDir = await modDir.getDirectoryHandle('libraries', { create: true });
        await writeTextFile(libDir, 'jobs.xml', compileJobsXML(workspace.jobs));
      }

      // 6. Translation files
      if (workspace.tFiles?.length) {
        const tDir = await modDir.getDirectoryHandle('t', { create: true });
        for (const tFile of workspace.tFiles) {
          await writeTextFile(tDir, tFile.fileName || `0001-L${tFile.languageId}.xml`, compileTFileXML(tFile));
        }
      }

      // 7. XML diff patches grouped by file
      if (workspace.xmlPatches?.length) {
        const patchesByFile: Record<string, any[]> = {};
        workspace.xmlPatches.forEach((patch: any) => {
          const file = patch.targetFile || 'libraries/ship_macros.xml';
          if (!patchesByFile[file]) {
            patchesByFile[file] = [];
          }
          patchesByFile[file].push(patch);
        });

        for (const [filePath, filePatches] of Object.entries(patchesByFile)) {
          await writeTextFileAtPath(modDir, filePath, compileDiffDocument(filePatches, filePath));
        }
      }

      setCompileStatus('success');
      setCompileMessage(`Compiled extension folder: extensions/${modId}`);
      setToolActiveTab('playtest');
      window.dispatchEvent(new CustomEvent('x4-mod-compiled'));
      setTimeout(() => setCompileStatus('idle'), 3500);
    } catch (err: any) {
      setCompileStatus('error');
      setCompileMessage(err.message || 'Compile failed.');
      setToolActiveTab('playtest');
    }
  };

  const highlightXML = (rawXML: string) => {
    return rawXML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/(&lt;\/?[a-zA-Z0-9_:-]+)(\s|&gt;)/g, '<span class="text-cyan-400 font-semibold">$1</span>$2')
      .replace(/([a-zA-Z0-9_:-]+)="([^"]*)"/g, '<span class="text-purple-400">$1</span>=<span class="text-emerald-300">"$2"</span>')
      .replace(/(&lt;!--.*?--&gt;)/g, '<span class="text-slate-500 font-mono italic">$1</span>');
  };

  const highlightCode = (rawText: string) => {
    const ext = activeEditorFile?.name.split('.').pop()?.toLowerCase();
    if (ext === 'json') {
      return rawText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/("(?:\\.|[^"\\])*")(\s*:)?/g, (_match, key, colon) => colon ? `<span class="text-cyan-300">${key}</span>${colon}` : `<span class="text-emerald-300">${key}</span>`)
        .replace(/\b(true|false|null)\b/g, '<span class="text-amber-300">$1</span>');
    }
    return highlightXML(rawText);
  };

  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  const isFileEditorActive = codeActiveTab === 'file' && activeEditorFile;

  return (
    <div id="code_preview_container" className="flex-1 bg-[#0a0c10] flex flex-col h-full overflow-hidden text-slate-300 border-l border-white/5 font-mono">
      
      {/* ================================================================ */}
      {/* SECTION 1: COMPILED XML FILE VIEWER                             */}
      {/* ================================================================ */}
      <div className="flex-[6] flex flex-col min-h-0 border-b border-white/10 overflow-hidden">
        {/* Upper Code Tab Option Bar */}
        <div className="flex border-b border-white/5 bg-black/45 justify-between items-center px-3.5 py-2 shrink-0 select-none">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {selectedNode && (
              <button
                onClick={() => setCodeActiveTab('node')}
                className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer max-w-[220px] ${
                  codeActiveTab === 'node'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/35'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
                title={`Selected canvas node: ${selectedNode.id}`}
              >
                <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">NODE: {selectedNode.xmlTag}</span>
              </button>
            )}
            {activeEditorFile && (
              <button
                onClick={() => setCodeActiveTab('file')}
                className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer max-w-[220px] ${
                  codeActiveTab === 'file'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/35'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
                title={activeEditorFile.path}
              >
                <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{activeEditorFile.name}</span>
              </button>
            )}
            <button
              onClick={() => setCodeActiveTab('md')}
              className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                codeActiveTab === 'md'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-cyan-400" />
              MD.xml
            </button>
            <button
              onClick={() => setCodeActiveTab('ui')}
              className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                codeActiveTab === 'ui'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <FileJson className="w-3.5 h-3.5 text-cyan-400" />
              UI_LAYOUT.xml
            </button>
          </div>

          {/* Code Utility triggers */}
          <div id="code_actions" className="flex items-center gap-1.5 shrink-0">
            {isFileEditorActive && (
              <>
                <button
                  onClick={saveActiveEditorFile}
                  disabled={editorSaveStatus === 'saving'}
                  className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded font-mono text-[9px] text-emerald-400 hover:text-white flex items-center gap-1 hover:bg-emerald-500/20 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  title="Save active filesystem file"
                >
                  <Save className={`w-3 h-3 ${editorSaveStatus === 'saving' ? 'animate-pulse' : ''}`} />
                  {editorSaveStatus === 'saved' ? 'SAVED' : 'SAVE'}
                </button>
                <button
                  onClick={() => {
                    setActiveEditorFile(null);
                    setCodeActiveTab('md');
                  }}
                  className="px-2 py-1 bg-slate-900 border border-white/10 rounded font-mono text-[9px] text-slate-400 hover:text-red-300 flex items-center gap-1 hover:bg-red-500/10 transition-all cursor-pointer"
                  title="Close active file editor"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            )}
            <button
              onClick={handleCompileModProject}
              disabled={compileStatus === 'compiling'}
              className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/35 rounded font-mono text-[9px] text-emerald-400 hover:text-white flex items-center gap-1 hover:bg-emerald-500/20 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
              title="Compile this workspace into a complete X4 extension folder"
            >
              <PackageCheck className={`w-3 h-3 ${compileStatus === 'compiling' ? 'animate-pulse' : ''}`} />
              COMPILE
            </button>
            <button
              onClick={copyToClipboard}
              className="px-2.5 py-1 bg-slate-900 border border-white/10 rounded font-mono text-[9px] text-slate-300 hover:text-cyan-400 flex items-center gap-1 hover:bg-slate-800 transition-all active:scale-[0.98] cursor-pointer"
              title="Copy compiled raw XML file to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  COPIED
                </>
              ) : (
                <>
                  <Clipboard className="w-3 h-3" />
                  COPY
                </>
              )}
            </button>
            <button
              onClick={downloadFile}
              className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded font-mono text-[9px] text-cyan-400 hover:text-white flex items-center gap-1 hover:bg-cyan-500/25 transition-all active:scale-[0.98] cursor-pointer"
              title="Download compiled XML element"
            >
              <Download className="w-3 h-3" />
              DL
            </button>
          </div>
        </div>

        {/* XML preview raw contents display */}
        <div id="xml_code_viewport" className="flex-1 overflow-hidden font-mono text-[11px] leading-relaxed bg-[#050608]/95 relative select-text min-h-0 scrollbar-thin">
          {isFileEditorActive ? (
            <div className="relative h-full w-full overflow-auto">
              <pre
                aria-hidden="true"
                className="absolute inset-0 p-4 whitespace-pre min-w-full min-h-full pointer-events-none font-mono leading-relaxed"
                dangerouslySetInnerHTML={{ __html: highlightCode(editorContent) + '\n' }}
              />
              <textarea
                value={editorContent}
                onChange={e => handleEditorContentChange(e.target.value)}
                spellCheck={false}
                className="absolute inset-0 w-full h-full resize-none p-4 bg-transparent text-transparent caret-cyan-300 selection:bg-cyan-500/30 outline-none font-mono leading-relaxed whitespace-pre overflow-auto"
                aria-label={`Editing ${activeEditorFile.name}`}
              />
              <div className="absolute bottom-2 right-3 px-2 py-1 rounded bg-black/75 border border-white/10 text-[9px] text-slate-400 pointer-events-none">
                {editorSaveStatus === 'error' ? editorError : activeEditorFile.path}
              </div>
            </div>
          ) : (
            <div className="h-full overflow-auto p-4">
              <pre 
                className="whitespace-pre overflow-x-auto pr-10 hover:text-white transition-colors duration-100 font-mono"
                dangerouslySetInnerHTML={{ __html: highlightXML(currentCode) }}
              />
            </div>
          )}
        </div>

        {/* X4 Engine Pre-Validation Diagnostics Monitor */}
        <div className="border-t border-white/5 bg-black/45 px-3.5 py-2.5 space-y-2 font-mono text-xs max-h-48 overflow-y-auto shrink-0 transition-all scrollbar-thin">
          <div className="flex items-center justify-between border-b border-white/5 pb-1.5 select-none font-mono">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold tracking-tight text-[10px]">
              <Terminal className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              EGOSOFT SCHEMA XML VALIDATOR (DIAGNOSTICS)
            </div>
            <div className="flex items-center gap-2 text-[9px] font-bold">
              <span className="flex items-center gap-1 text-slate-355 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 block" /> {errors.length} Errors
              </span>
              <span className="flex items-center gap-1 text-slate-355 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 block" /> {warnings.length} Warnings
              </span>
            </div>
          </div>

          {diagnostics.length === 0 ? (
            <div className="text-emerald-400/90 text-[10px] leading-normal flex items-center gap-2 bg-emerald-500/5 p-2 rounded border border-emerald-500/10 font-sans font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>No syntax warning flags detected. Your visual coordinates match strict Schema expectations!</span>
            </div>
          ) : (
            <div className="space-y-1.5 font-sans">
              {diagnostics.map((diag, index) => {
                const itemStyle = diag.severity === 'error' 
                  ? 'bg-red-500/5 text-red-300 border-red-500/15' 
                  : (diag.severity === 'warning' ? 'bg-amber-500/5 text-amber-300 border-amber-500/15' : 'bg-blue-500/5 text-blue-300 border-blue-500/15');
                
                return (
                  <div key={index} className={`p-1.5 rounded border text-[10px] leading-relaxed flex items-start gap-2 ${itemStyle}`}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <div>
                      <span className="font-mono font-bold tracking-tight text-white uppercase block text-[8px] mb-0.5">
                        [{diag.severity}] ID: {diag.category.toUpperCase()}
                      </span>
                      {diag.message}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 2: LIVE SIMULATION DIAGNOSTICS & PLAYTEST HUB          */}
      {/* ================================================================ */}
      <div className="flex-[4] flex flex-col min-h-0 bg-[#080a0e] overflow-hidden select-none border-t border-[#df9825]/10">
        
        {/* Diagnostic Tool Segmented Header */}
        <div className="flex border-b border-white/5 bg-black/45 justify-between items-center px-3.5 py-1.5 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none font-mono">
            <button
              onClick={() => setToolActiveTab('analyzer')}
              className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                toolActiveTab === 'analyzer'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Brain className="w-3.5 h-3.5 animate-pulse text-amber-500" />
              MD SCANNER
            </button>
            <button
              onClick={() => setToolActiveTab('playtest')}
              className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                toolActiveTab === 'playtest'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              PLAYTEST WORKSPACE
            </button>
          </div>

          {/* Action triggers specific to tabs */}
          <div id="tool_actions" className="flex items-center gap-1.5 shrink-0">
            {toolActiveTab === 'analyzer' ? (
              analysisResult && (
                <button
                  onClick={triggerAnalysis}
                  disabled={analyzing}
                  className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 rounded font-mono text-[9px] flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer font-bold uppercase"
                  title="Re-run plain English description update on structural changes"
                >
                  <RefreshCw className={`w-3 h-3 ${analyzing ? "animate-spin" : ""}`} />
                  ANALYZE
                </button>
              )
            ) : (
              dirHandle && (
                <button
                  onClick={() => saveToDirectory(dirHandle, true)}
                  disabled={syncStatus === 'syncing'}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded font-mono text-[9px] flex items-center gap-1 transition-all cursor-pointer font-bold uppercase"
                  title="Force immediate sync to disk"
                >
                  <Save className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-pulse' : ''}`} />
                  SYNC FILES
                </button>
              )
            )}
          </div>
        </div>

        {/* Viewport display */}
        <div className="flex-1 overflow-y-auto bg-[#06070a]/95 flex flex-col relative text-xs min-h-0 scrollbar-thin">
          {toolActiveTab === 'analyzer' ? (
            <MDScanner
              workspace={workspace}
              analysisResult={analysisResult}
              analyzing={analyzing}
              analysisError={analysisError}
              triggerAnalysis={triggerAnalysis}
              isAnalysisStale={isAnalysisStale}
            />
          ) : (
            <PlaytestWorkspace
              dirHandle={dirHandle}
              dirName={dirName}
              syncStatus={syncStatus}
              syncErrorMsg={syncErrorMsg}
              autoSaveEnabled={autoSaveEnabled}
              setAutoSaveEnabled={setAutoSaveEnabled}
              saveToDirectory={saveToDirectory}
              handleLinkDirectory={handleLinkDirectory}
              logInput={logInput}
              setLogInput={setLogInput}
              diagnosingLogs={diagnosingLogs}
              logAnalysis={logAnalysis}
              diagnosticError={diagnosticError}
              successfulFixApplied={successfulFixApplied}
              handleTriggerLogAnalysis={handleTriggerLogAnalysis}
              insertDemoX4Log={insertDemoX4Log}
              handleLogFileChange={handleLogFileChange}
              handleApplyAutoFix={handleApplyAutoFix}
              compileStatus={compileStatus}
              compileMessage={compileMessage}
              handleCompileModProject={handleCompileModProject}
            />
          )}
        </div>

      </div>

    </div>
  );
}
