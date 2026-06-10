/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FolderIcon, 
  ChevronRight, 
  ChevronDown, 
  FileJson, 
  FileCode, 
  FileText, 
  Search, 
  Plus, 
  RefreshCw, 
  Save, 
  Trash2, 
  FolderOpen, 
  ExternalLink,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { ModWorkspace, sanitizeWorkspace } from '../types';
import { parseXMLToWorkspace } from '../lib/xmlParser';
import { generateMDXML, generateUIXML } from '../types';

export interface FSItem {
  name: string;
  kind: 'file' | 'directory';
  path: string;
  handle?: any; // FileSystemFileHandle or FileSystemDirectoryHandle
  children?: FSItem[];
  isMock?: boolean;
  content?: string; // For mock files
}

interface DirectoryExplorerProps {
  dirHandle: any | null;
  setDirHandle: (handle: any | null) => void;
  dirName: string;
  setDirName: (name: string) => void;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  workspaceView?: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'translation' | 'wiki';
  setWorkspaceView?: (view: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'translation' | 'wiki') => void;
  onOpenEditorFile?: (file: {
    name: string;
    path: string;
    content: string;
    handle?: any;
    isMock?: boolean;
  }) => void;
}

// 1. Initial high-fidelity Mock File System conforming to X4/Godot-style structures
const MOCK_FILESYSTEM_TREE: FSItem[] = [
  {
    name: "addons",
    kind: "directory",
    path: "res://addons",
    isMock: true,
    children: [
      {
        name: "world_generator_plugin",
        kind: "directory",
        path: "res://addons/world_generator_plugin",
        isMock: true,
        children: [
          { name: "plugin.cfg", kind: "file", path: "res://addons/world_generator_plugin/plugin.cfg", isMock: true, content: "[plugin]\nname=\"World Generator\"\nauthor=\"Space Creator\"\nversion=\"1.0.0\"" },
          { name: "README.md", kind: "file", path: "res://addons/world_generator_plugin/README.md", isMock: true, content: "# World Generator Addon\nCreates beautiful procedural asteroid belts." },
          { name: "world_generator_plugin.gd", kind: "file", path: "res://addons/world_generator_plugin/world_generator_plugin.gd", isMock: true, content: "extends EditorPlugin\n# Godot engine addon init script" }
        ]
      },
      {
        name: "ai_assistant_hub",
        kind: "directory",
        path: "res://addons/ai_assistant_hub",
        isMock: true,
        children: [
          { name: "assistant_setup.json", kind: "file", path: "res://addons/ai_assistant_hub/assistant_setup.json", isMock: true, content: "" }
        ]
      }
    ]
  },
  {
    name: "md",
    kind: "directory",
    path: "res://md",
    isMock: true,
    children: [
      {
        name: "Elite_Fighter_Escort.json",
        kind: "file",
        path: "res://md/Elite_Fighter_Escort.json",
        isMock: true,
        content: "" // Filled dynamically in initializer
      },
      {
        name: "Argon_Sector_Bounty.json",
        kind: "file",
        path: "res://md/Argon_Sector_Bounty.json",
        isMock: true,
        content: "" // Filled dynamically in initializer
      },
      {
        name: "Custom_Startup_Script.xml",
        kind: "file",
        path: "res://md/Custom_Startup_Script.xml",
        isMock: true,
        content: `<?xml version="1.0" encoding="utf-8"?>\n<mdscript name="Custom_Startup_Script">\n  <cues>\n    <cue name="My_Startup_Cue" state="active">\n      <conditions>\n        <event_cue_signalled cue="md.Setup.Start" />\n      </conditions>\n      <actions>\n        <show_help text="'Visual XML Mod initiated!'" duration="5" />\n      </actions>\n    </cue>\n  </cues>\n</mdscript>`
      }
    ]
  },
  {
    name: "ui",
    kind: "directory",
    path: "res://ui",
    isMock: true,
    children: [
      { name: "menu_layout_config.xml", kind: "file", path: "res://ui/menu_layout_config.xml", isMock: true, content: `<?xml version="1.0" encoding="utf-8"?>\n<ui_menu name="X4_Custom_Menu">\n  <theme>\n    <background color="#0F1115" opacity="0.95" />\n  </theme>\n</ui_menu>` }
    ]
  },
  {
    name: "aiscripts",
    kind: "directory",
    path: "res://aiscripts",
    isMock: true,
    children: [
      {
        name: "hunter.escort.behavior.xml",
        kind: "file",
        path: "res://aiscripts/hunter.escort.behavior.xml",
        isMock: true,
        content: `<?xml version="1.0" encoding="utf-8"?>\n<aiscript name="hunter.escort.behavior" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="aiscripts.xsd">\n  <params>\n    <param name="target" type="object" default="this.ship.commander" comment="Leader ship" />\n    <param name="flee_shield" type="number" default="25" />\n  </params>\n  <actions>\n    <move_to destination="$target" speed="90" />\n    <shoot target="$enemy" weapon="primary" />\n  </actions>\n</aiscript>`
      }
    ]
  },
  {
    name: "t",
    kind: "directory",
    path: "res://t",
    isMock: true,
    children: [
      {
        name: "0001-L044.xml",
        kind: "file",
        path: "res://t/0001-L044.xml",
        isMock: true,
        content: `<?xml version="1.0" encoding="utf-8"?>\n<language id="44">\n  <page id="20001" title="Weapon and Item Names">\n    <t id="1">Antimatter Disrupter Cannon</t>\n    <t id="2">Heavy Plasma Battery MK2</t>\n    <t id="3">Nanotech Hull Shielding</t>\n  </page>\n  <page id="20002" title="Dialogue and Messages">\n    <t id="1001">Warning. Incoming hazardous solar wind storm in 30 seconds!</t>\n    <t id="1002">Acolyte Squadron commander speaking. Standing by for flight vectors.</t>\n  </page>\n</language>`
      }
    ]
  },
  {
    name: "libraries",
    kind: "directory",
    path: "res://libraries",
    isMock: true,
    children: [
      {
        name: "wares.xml",
        kind: "file",
        path: "res://libraries/wares.xml",
        isMock: true,
        content: `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <add sel="/wares">
    <ware id="custom_weapon_item" name="{20001,1}" description="{20001,3}">
      <price min="25000" average="35000" max="45000" />
    </ware>
  </add>
</diff>`
      },
      {
        name: "jobs.xml",
        kind: "file",
        path: "res://libraries/jobs.xml",
        isMock: true,
        content: `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <add sel="/jobs">
    <job id="argon_heavy_patrol" name="Argon Heavy Patrol">
      <quota galaxy="5" />
    </job>
  </add>
</diff>`
      }
    ]
  },
  {
    name: "README.md",
    kind: "file",
    path: "res://README.md",
    isMock: true,
    content: "# X4 foundations Visual Modding Studio Workspace"
  }
];

export default function DirectoryExplorer({dirHandle,
  setDirHandle,
  dirName,
  setDirName,
  workspace,
  setWorkspace,
  saveCheckpoint,
  workspaceView,
  setWorkspaceView,
  onOpenEditorFile}: DirectoryExplorerProps) {
  const [fileFilter, setFileFilter] = useState('');
  const [fileTree, setFileTree] = useState<FSItem[]>(MOCK_FILESYSTEM_TREE);
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({
    "res://addons": true,
    "res://addons/world_generator_plugin": true,
    "res://md": true,
    "res://ui": true,
    "res://aiscripts": true,
    "res://t": true,
    "res://libraries": true
  });
  
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeFileHandle, setActiveFileHandle] = useState<any | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [syncOnEdits, setSyncOnEdits] = useState(true);
  const [isSandboxBlocked, setIsSandboxBlocked] = useState(false);

  // Load preset workspace states into mocks so they are fully playable
  useEffect(() => {
    // Populate raw JSON workspace presets inside the mock configurations
    const stored = localStorage.getItem('x4_mod_studio_workspace');
    const escortMock = MOCK_FILESYSTEM_TREE.find(n => n.name === 'md')?.children?.find(c => c.name === 'Elite_Fighter_Escort.json');
    const bountyMock = MOCK_FILESYSTEM_TREE.find(n => n.name === 'md')?.children?.find(c => c.name === 'Argon_Sector_Bounty.json');

    if (escortMock) {
      // Find Preset
      const p = localStorage.getItem('x4_mod_studio_workspace_preset_escort') || JSON.stringify(workspace);
      escortMock.content = p;
    }
    if (bountyMock) {
      const p = localStorage.getItem('x4_mod_studio_workspace_preset_bounty') || JSON.stringify(workspace);
      bountyMock.content = p;
    }
  }, []);

  // Sync state back to mock contents on edits if inside standard simulated mode
  useEffect(() => {
    if (syncOnEdits && !dirHandle && activeFilePath) {
      const serialized = JSON.stringify(workspace, null, 2);
      updateMockFileContent(fileTree, activeFilePath, serialized);
    }
  }, [workspace, activeFilePath, dirHandle]);

  const updateMockFileContent = (tree: FSItem[], path: string, content: string): boolean => {
    for (let i = 0; i < tree.length; i++) {
      if (tree[i].path === path) {
        tree[i].content = content;
        return true;
      }
      if (tree[i].children) {
        const found = updateMockFileContent(tree[i].children!, path, content);
        if (found) return true;
      }
    }
    return false;
  };

  // 2. Local recursive scanner of folders using Native Filesystem Access
  const scanRealLocalDirectory = async (handle: any): Promise<FSItem[]> => {
    const items: FSItem[] = [];
    try {
      for await (const entry of handle.values()) {
        const itemPath = `${dirName}://${entry.name}`;
        if (entry.kind === 'directory') {
          // Scan recursively
          const children = await scanRealLocalDirectory(entry);
          items.push({
            name: entry.name,
            kind: 'directory',
            path: itemPath,
            handle: entry,
            children
          });
        } else {
          items.push({
            name: entry.name,
            kind: 'file',
            path: itemPath,
            handle: entry
          });
        }
      }
    } catch (err) {
      console.warn("Real directory scanning failed or restricted.", err);
    }

    // Sort folders first, then files
    return items.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  };

  const handleRefreshDirectory = async () => {
    if (!dirHandle) {
      setStatusMessage({ type: 'info', text: "Refreshed simulated workspace!" });
      setTimeout(() => setStatusMessage(null), 2000);
      return;
    }

    try {
      const scanned = await scanRealLocalDirectory(dirHandle);
      setFileTree(scanned);
      setStatusMessage({ type: 'success', text: "Synced local project filesystem!" });
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: `Sync failed: ${e.message}` });
    }
  };

  // Re-scan whenever handle changes
  useEffect(() => {
    if (dirHandle) {
      handleRefreshDirectory();
    } else {
      setFileTree(MOCK_FILESYSTEM_TREE);
    }
  }, [dirHandle, dirName]);

  const toggleFolder = (path: string) => {
    setExpandedPaths(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  // 3. Mount Native File System Directory Picker
  const handleMountDirectory = async () => {
    setIsSandboxBlocked(false);
    if (!('showDirectoryPicker' in window)) {
      setStatusMessage({ 
        type: 'error', 
        text: "Direct Directory access is barred by your browser. Please try Chrome, Edge, or Opera." 
      });
      return;
    }

    try {
      const handle = await (window as any).showDirectoryPicker();
      setDirHandle(handle);
      setDirName(handle.name);
      setStatusMessage({ type: 'success', text: `Mounted filesystem: ${handle.name}` });
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'SecurityError') {
        setIsSandboxBlocked(true);
        setStatusMessage({
          type: 'error',
          text: "Iframe sandbox bounds barred directory requests. Access via New Tab!"
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: `FileSystem mount failed: ${err.message || 'Cancelled'}`
        });
      }
    }
  };

  // 4. File Click and Content Loader
  const handleFileClick = async (file: FSItem) => {
    try {
      saveCheckpoint();
      setActiveFilePath(file.path);
      setActiveFileHandle(file.handle || null);

      let fileText = '';

      if (file.isMock) {
        // Mock fallback retrieval
        if (file.content === "") {
          // Re-populate mock default matching active workspace schemas
          fileText = JSON.stringify(workspace, null, 2);
        } else {
          fileText = file.content || '';
        }
      } else if (file.handle) {
        // Read native file API chunk
        const f = await file.handle.getFile();
        fileText = await f.text();
      }

      
      onOpenEditorFile?.({
        name: file.name,
        path: file.path,
        content: fileText,
        handle: file.handle,
        isMock: file.isMock
      });

      const fileExtension = file.name.split('.').pop()?.toLowerCase();

      if (fileExtension === 'json') {
        try {
          const parsed = JSON.parse(fileText);
          if (parsed && typeof parsed === 'object') {
            const sanitized = sanitizeWorkspace(parsed);
            setWorkspace(sanitized);
            setStatusMessage({ type: 'success', text: `Opened Blueprint: ${file.name}` });
            setTimeout(() => setStatusMessage(null), 2000);
          } else {
            throw new Error("Invalid Mod Workspace configuration root.");
          }
        } catch (e: any) {
          setStatusMessage({ type: 'error', text: `JSON parse failed: ${e.message}` });
        }
          } else if (fileExtension === 'xml') {
        const isTFile = file.path.includes('/t/') || fileText.includes('<language');
        const isAIScript = file.path.includes('/aiscripts/') || fileText.includes('<aiscript');
        const isLibrary = file.path.includes('/libraries/') || fileText.includes('<diff');

        if (isTFile) {
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(fileText, "application/xml");
            const langEl = doc.getElementsByTagName("language")[0];
            if (langEl) {
              const languageId = langEl.getAttribute("id") || "44";
              const pagesList = langEl.getElementsByTagName("page");
              const pages: any[] = [];
              
              for (let i = 0; i < pagesList.length; i++) {
                const pEl = pagesList[i];
                const pageId = pEl.getAttribute("id") || "20001";
                const pageTitle = pEl.getAttribute("title") || `Page ${pageId}`;
                const itemsList = pEl.getElementsByTagName("t");
                const items: any[] = [];
                
                for (let j = 0; j < itemsList.length; j++) {
                  const tEl = itemsList[j];
                  const tId = tEl.getAttribute("id") || "1";
                  items.push({
                    id: tId,
                    value: tEl.textContent || "",
                    description: ""
                  });
                }
                pages.push({ id: pageId, title: pageTitle, items });
              }
              
              const targetTFile = {
                languageId,
                fileName: file.name,
                pages
              };
              
              setWorkspace(prev => {
                const currentTFiles = prev.tFiles || [];
                const existsIdx = currentTFiles.findIndex(f => f.languageId === languageId);
                let newTFiles = [...currentTFiles];
                if (existsIdx !== -1) {
                  newTFiles[existsIdx] = targetTFile;
                } else {
                  newTFiles.push(targetTFile);
                }
                return { ...prev, tFiles: newTFiles };
              });

              if (setWorkspaceView) {
                setWorkspaceView('translation');
              }
              setStatusMessage({ type: 'success', text: `Loaded Language t-file (${languageId}): ${file.name}` });
            } else {
              throw new Error("No language root tag identified.");
            }
          } catch (err: any) {
            setStatusMessage({ type: 'error', text: `Could not parse Language XML: ${err.message}` });
          }
          setTimeout(() => setStatusMessage(null), 2500);
        } else if (isAIScript) {
          if (setWorkspaceView) {
            setWorkspaceView('aiscripts');
          }
          setStatusMessage({ type: 'success', text: `Loaded AIScript Behavior: ${file.name}` });
          setTimeout(() => setStatusMessage(null), 2500);
        } else if (isLibrary) {
          if (setWorkspaceView) {
            setWorkspaceView('xmlpatch');
          }
          setStatusMessage({ type: 'success', text: `Opened Library XML Patch: ${file.name}` });
          setTimeout(() => setStatusMessage(null), 2500);
        } else {
          // Fallback to standard MD script parser
          const decoded = parseXMLToWorkspace(fileText);
          if (decoded && decoded.nodes.length > 0) {
            setWorkspace(decoded);
            if (setWorkspaceView) {
              setWorkspaceView('blueprint');
            }
            setStatusMessage({ type: 'success', text: `Imported XML Script: ${file.name}` });
            setTimeout(() => setStatusMessage(null), 2500);
          } else {
            setStatusMessage({ 
              type: 'error', 
              text: "Could not find compatible cues or actions nodes inside this XML script." 
            });
          }
        }
      } else {
        // Non-node standard text file
        setStatusMessage({ type: 'info', text: `Inspected text: ${file.name} (Opening in graph is restricted)` });
        setTimeout(() => setStatusMessage(null), 2000);
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `Failed opening file: ${err.message}` });
    }
  };

  // 5. Save Workspace back to active target file
  const handleSaveActiveFile = async () => {
    if (!activeFilePath) {
      setStatusMessage({ type: 'info', text: "Please select a file from the list to target for real-time saving." });
      return;
    }

    const fileExtension = activeFilePath.split('.').pop()?.toLowerCase();
    const contentToSave = fileExtension === 'json' 
      ? JSON.stringify(workspace, null, 2)
      : generateMDXML(workspace);

    try {
      if (activeFileHandle) {
        // Native write to linked system disk
        const writable = await activeFileHandle.createWritable();
        await writable.write(contentToSave);
        await writable.close();
        setStatusMessage({ type: 'success', text: `Saved directly back to local file: ${activeFilePath.split('/').pop()}` });
      } else {
        // Mock save
        updateMockFileContent(fileTree, activeFilePath, contentToSave);
        setStatusMessage({ type: 'success', text: `Workspace simulated save complete! (${activeFilePath.split('/').pop()})` });
      }
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `FileSystem write access blocked: ${err.message}` });
    }
  };

  // 6. Create or Add a new File element to targeted filesystem
  const handleAddNewFile = async (name: string, type: 'json' | 'xml') => {
    if (!name.trim()) return;
    const cleanName = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filename = cleanName.endsWith(`.${type}`) ? cleanName : `${cleanName}.${type}`;

    try {
      if (dirHandle) {
        // Native local storage file create
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writer = await fileHandle.createWritable();
        
        const initialContent = type === 'json' 
          ? JSON.stringify(workspace, null, 2)
          : generateMDXML(workspace);

        await writer.write(initialContent);
        await writer.close();

        await handleRefreshDirectory();
        setStatusMessage({ type: 'success', text: `Created file: ${filename}` });
      } else {
        // Mock add
        const parentCol = fileTree.find(n => n.name === 'md');
        if (parentCol && parentCol.children) {
          const mockPath = `res://director/${filename}`;
          const initialContent = type === 'json' 
            ? JSON.stringify(workspace, null, 2)
            : generateMDXML(workspace);

          parentCol.children.push({
            name: filename,
            kind: 'file',
            path: mockPath,
            isMock: true,
            content: initialContent
          });
          setFileTree([...fileTree]);
          setStatusMessage({ type: 'success', text: `Created simulated file: ${filename}` });
        }
      }
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Could not create file: ${err.message}` });
    }
  };

  const handleCreatePrompt = () => {
    const filename = prompt("Enter name for a new blueprint/script file (e.g., custom_patrol):", "custom_patrol");
    if (!filename) return;
    const selectType = confirm("Create as a Visual JSON Blueprint (OK) or raw Egosoft MD Script XML (Cancel)?");
    handleAddNewFile(filename, selectType ? 'json' : 'xml');
  };

  // Recursively filter tree lists
  const filterTreeItems = (items: FSItem[], query: string): FSItem[] => {
    if (!query) return items;
    const lc = query.toLowerCase();
    
    return items.map(item => {
      if (item.kind === 'file') {
        return item.name.toLowerCase().includes(lc) ? item : null;
      }
      
      const filteredChildren = filterTreeItems(item.children || [], query);
      if (filteredChildren.length > 0 || item.name.toLowerCase().includes(lc)) {
        return {
          ...item,
          children: filteredChildren
        };
      }
      return null;
    }).filter((item): item is FSItem => item !== null);
  };

  const filteredTree = filterTreeItems(fileTree, fileFilter);

  // Render recursive list nodes
  const renderFSNode = (item: FSItem, depth = 0) => {
    const isDir = item.kind === 'directory';
    const isExpanded = expandedPaths[item.path] ?? false;
    const isActive = activeFilePath === item.path;

    return (
      <div key={item.path} style={{ paddingLeft: `${depth * 10}px` }}>
        {isDir ? (
          <div>
            <button
              onClick={() => toggleFolder(item.path)}
              className="w-full flex items-center py-1.5 px-2 text-[#a5aab8] hover:text-white hover:bg-[#2d313d] rounded text-left transition-colors font-mono text-[11px] font-medium"
            >
              <span className="mr-0.5">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
              <span className="mr-1.5 text-cyan-500">
                <FolderIcon className="w-3.5 h-3.5" />
              </span>
              <span className="truncate">{item.name}</span>
            </button>
            {isExpanded && item.children && (
              <div className="border-l border-white/5 ml-3.5 my-0.5">
                {item.children.map(child => renderFSNode(child, depth + 1))}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => handleFileClick(item)}
            className={`w-full flex items-center py-1.5 px-2 rounded text-left transition-all font-mono text-[11px] border border-transparent ${
              isActive 
                ? 'bg-[#3d4254] text-cyan-400 border-cyan-500/30 font-semibold' 
                : 'text-slate-300 hover:text-white hover:bg-[#2d313d]'
            }`}
          >
            <span className="ml-4 mr-1.5 shrink-0">
              {item.name.endsWith('.json') ? (
                <FileJson className="w-3.5 h-3.5 text-amber-500" />
              ) : item.name.endsWith('.xml') ? (
                <FileCode className="w-3.5 h-3.5 text-[#06b6d4]" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-slate-400" />
              )}
            </span>
            <span className="truncate flex-1">{item.name}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#1b1e24] text-[#e0e0e0] overflow-hidden select-none font-sans border-r border-white/5">
      {/* FileExplorer Top Bar */}
      <div className="p-3 border-b border-white/10 shrink-0 space-y-2 bg-[#20232b]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4 text-[#06b6d4]" />
            <span className="font-mono text-xs font-bold uppercase tracking-wide text-white">Filesystem</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleRefreshDirectory}
              className="p-1.5 rounded hover:bg-[#2d313d] text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Refresh project folder"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCreatePrompt}
              className="p-1.5 rounded hover:bg-[#2d313d] text-cyan-400 hover:text-white transition-all cursor-pointer"
              title="Create new script or workspace"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {activeFilePath && (
              <button
                onClick={handleSaveActiveFile}
                className="p-1.5 rounded bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 hover:text-cyan-200 border border-cyan-500/30 transition-all cursor-pointer flex items-center gap-1 text-[10px]"
                title="Save current nodes back to active file file"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
            )}
          </div>
        </div>

        {/* Current Folder Path breadcrumb */}
        <div className="flex items-center gap-1.5 bg-black/35 rounded-md p-1.5 border border-white/5">
          <span className="font-mono text-[10px] text-cyan-500 flex-shrink-0">
            {dirHandle ? "ext://" : "res://"}
          </span>
          <span className="font-mono text-[10px] font-bold text-slate-300 truncate tracking-wide flex-1">
            {dirHandle ? `addons/${dirName}/` : "addons/world_generator_plugin/"}
          </span>
          {!dirHandle && (
            <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1 rounded uppercase tracking-widest font-mono">
              Demo
            </span>
          )}
        </div>

        {/* Target Local Directory Mount Trigger Button */}
        {!dirHandle && (
          <button
            onClick={handleMountDirectory}
            className="w-full py-1.5 px-3 rounded-md bg-gradient-to-r from-cyan-600/30 to-blue-600/30 border border-cyan-500/40 hover:border-cyan-500/80 text-cyan-400 font-mono text-[10px] font-bold tracking-tight hover:from-cyan-600/40 hover:to-blue-600/40 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            TARGET LOCAL DIRECTORY
          </button>
        )}

        {isSandboxBlocked && (
          <div className="p-2 border border-yellow-500/20 bg-yellow-500/5 text-[9.5px] text-yellow-500 font-sans leading-normal rounded-md space-y-1">
            <span className="font-bold block flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
              Iframe Sandbox Restricted Mount
            </span>
            <span>Authorize local folder access by opening AI Studio in a new tab using the URL in the right panel.</span>
          </div>
        )}

        {/* File filter input */}
        <div className="relative">
          <Search className="absolute left-2 top-2.5 w-3 h-3 text-slate-500" />
          <input
            type="text"
            value={fileFilter}
            onChange={e => setFileFilter(e.target.value)}
            placeholder="Filter Files"
            className="w-full pl-7 pr-2 py-1.5 rounded bg-black/45 border border-white/5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
          />
        </div>
      </div>

      {/* Directory Tree Scroll List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar scrollbar-thin scrollbar-thumb-white/10 select-none bg-[#1b1e24]">
        {/* Favorites shortcut header just like Godot */}
        <div className="px-2 py-1 text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
          <span>★ Favorites:</span>
        </div>
        <div className="pb-2 border-b border-white/5 mb-2 ml-2">
          <button 
            disabled={!dirHandle}
            className={`w-full text-left py-1.5 px-2 font-mono text-[11px] rounded transition-all flex items-center gap-1.5 ${
              dirHandle ? 'text-amber-500 hover:bg-[#2d313d]' : 'text-slate-600 cursor-not-allowed'
            }`}
          >
            📂 active_mod_workspace
          </button>
        </div>

        {/* Tree Render entry point */}
        <div className="space-y-1">
          {filteredTree.length === 0 ? (
            <div className="text-center py-6 text-[10px] font-mono text-slate-500">
              No files matched filters
            </div>
          ) : (
            filteredTree.map(item => renderFSNode(item))
          )}
        </div>
      </div>

      {/* Synchronized status indicators details */}
      {statusMessage && (
        <div className={`p-2 font-mono text-[10px] border-t leading-snug shrink-0 flex items-center gap-1.5 ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
            : statusMessage.type === 'error'
            ? 'bg-red-500/10 text-red-400 border-red-500/20'
            : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="flex-1 truncate">{statusMessage.text}</span>
        </div>
      )}

      {/* Godot style Footer feedback detail */}
      <div className="p-2 border-t border-white/5 bg-[#17191e] flex items-center justify-between font-mono text-[9px] text-slate-500 shrink-0">
        <span>Active File: {activeFilePath ? activeFilePath.split('/').pop() : 'None Loaded'}</span>
        {dirHandle && <span className="text-emerald-500">● RealTime Connected</span>}
      </div>
    </div>
  );
}
