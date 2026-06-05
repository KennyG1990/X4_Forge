/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Languages, 
  Plus, 
  Search, 
  Trash2, 
  Copy, 
  Check, 
  FileCode, 
  Sparkles, 
  BookOpen, 
  AlertCircle,
  HelpCircle,
  Save,
  MessageSquare
} from 'lucide-react';
import { ModWorkspace, TFile, TranslationPage, TranslationItem } from '../types';

interface TFileEditorProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
}

const LANGUAGES_SUPPORT = [
  { id: '44', name: 'English', suffix: 'L044', flag: '🇬🇧' },
  { id: '49', name: 'German', suffix: 'L049', flag: '🇩🇪' },
  { id: '33', name: 'French', suffix: 'L033', flag: '🇫🇷' },
  { id: '07', name: 'Russian', suffix: 'L007', flag: '🇷🇺' },
  { id: '39', name: 'Italian', suffix: 'L039', flag: '🇮🇹' },
  { id: '34', name: 'Spanish', suffix: 'L034', flag: '🇪🇸' },
  { id: '86', name: 'Chinese', suffix: 'L086', flag: '🇨🇳' },
  { id: '81', name: 'Japanese', suffix: 'L081', flag: '🇯🇵' },
];

export default function TFileEditor({ workspace, setWorkspace }: TFileEditorProps) {
  // Initial fallback mock data for T-files
  const defaultTFiles: TFile[] = [
    {
      languageId: '44',
      fileName: '0001-L044.xml',
      pages: [
        {
          id: '20001',
          title: 'Weapon and Item Names',
          items: [
            { id: '1', value: 'Antimatter Disrupter Cannon', description: 'Heavy capital ship interceptor weapon' },
            { id: '2', value: 'Heavy Plasma Battery MK2', description: 'Station siege plasma cannon names' },
            { id: '3', value: 'Nanotech Hull Shielding', description: 'Adaptive player shielding item' }
          ]
        },
        {
          id: '20002',
          title: 'Dialogue and Messages',
          items: [
            { id: '1001', value: 'Warning. Incoming hazardous solar wind storm in 30 seconds!', description: 'Sector entry notification alert' },
            { id: '1002', value: 'Acolyte Squadron commander speaking. Standing by for flight vectors.', description: 'Pilot response message' },
            { id: '1003', value: 'Argon Protection bounty cleared. Credits transferred.', description: 'Bounty reward log feedback' }
          ]
        }
      ]
    },
    {
      languageId: '49',
      fileName: '0001-L049.xml',
      pages: [
        {
          id: '20001',
          title: 'Weapon and Item Names (DE)',
          items: [
            { id: '1', value: 'Antimaterie-Disruptor-Kanone', description: 'Schwere GKS-Abfangwaffe' },
            { id: '2', value: 'Schwere Plasmabatterie MK2', description: 'Stationen-Belagerungswaffen' }
          ]
        }
      ]
    }
  ];

  // Initialize from workspace if present, or fallback and initialize workspace state
  const [tFiles, setTFiles] = useState<TFile[]>(() => {
    if (workspace.tFiles && workspace.tFiles.length > 0) {
      return workspace.tFiles;
    }
    return defaultTFiles;
  });

  const [activeFileIdx, setActiveFileIdx] = useState<number>(0);
  const [activePageId, setActivePageId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [showHelper, setShowHelper] = useState<boolean>(true);

  // Sync to workspace on change
  const saveTFiles = (updatedFiles: TFile[]) => {
    setTFiles(updatedFiles);
    setWorkspace(prev => ({
      ...prev,
      tFiles: updatedFiles
    }));
  };

  const activeFile = tFiles[activeFileIdx] || tFiles[0] || defaultTFiles[0];

  // Ensure an active page is selected
  useEffect(() => {
    if (activeFile && activeFile.pages.length > 0) {
      const pageExists = activeFile.pages.some(p => p.id === activePageId);
      if (!pageExists) {
        setActivePageId(activeFile.pages[0].id);
      }
    } else {
      setActivePageId('');
    }
  }, [activeFileIdx, activeFile, activePageId]);

  const activePage = activeFile?.pages.find(p => p.id === activePageId) || activeFile?.pages[0];

  // Actions: Add New Language file
  const handleAddLanguageFile = () => {
    const nextUnusedLang = LANGUAGES_SUPPORT.find(l => !tFiles.some(tf => tf.languageId === l.id));
    const langId = nextUnusedLang?.id || '44';
    const langName = nextUnusedLang?.name || 'English';
    const suffix = nextUnusedLang?.suffix || 'L044';

    const newLangId = prompt(`Enter Language ID Code (e.g., 44: English, 49: German, 33: French):`, langId);
    if (!newLangId) return;

    const matchedLang = LANGUAGES_SUPPORT.find(l => l.id === newLangId);
    const codeSuffix = matchedLang ? matchedLang.suffix : `L0${newLangId}`;
    const filename = `0001-${codeSuffix}.xml`;

    // Check if duplicate filename
    if (tFiles.some(f => f.languageId === newLangId)) {
      alert(`A translation t-file for language ID ${newLangId} already exists!`);
      return;
    }

    const newFile: TFile = {
      languageId: newLangId,
      fileName: filename,
      pages: [
        {
          id: '20001',
          title: 'Primary Mod Translations',
          items: [
            { id: '1', value: 'Translated Item Name', description: 'Initial default name string' }
          ]
        }
      ]
    };

    const nextFiles = [...tFiles, newFile];
    saveTFiles(nextFiles);
    setActiveFileIdx(nextFiles.length - 1);
    setActivePageId('20001');
  };

  // Delete Language File
  const handleDeleteLanguageFile = (idx: number) => {
    if (tFiles.length <= 1) {
      alert("At least one language T-File must remain configured.");
      return;
    }
    const confirmed = confirm(`Are you sure you want to delete translation file: "${tFiles[idx].fileName}"?`);
    if (!confirmed) return;

    const nextFiles = tFiles.filter((_, i) => i !== idx);
    saveTFiles(nextFiles);
    setActiveFileIdx(Math.max(0, idx - 1));
  };

  // Add translation page to active file
  const handleAddPage = () => {
    const pageId = prompt(`Enter unused Page ID (X4 standard mod pages are usually 20000+):`, '20003');
    if (!pageId || isNaN(Number(pageId))) {
      if (pageId) alert("Page ID must be a numeric string.");
      return;
    }

    if (activeFile.pages.some(p => p.id === pageId)) {
      alert(`Page ID ${pageId} already exists in this file.`);
      return;
    }

    const pageTitle = prompt(`Enter descriptive label for Page ${pageId}:`, 'Custom Dialogues');
    if (pageTitle === null) return;

    const newPage: TranslationPage = {
      id: pageId,
      title: pageTitle || `Page ${pageId}`,
      items: [
        { id: '1', value: 'New Translation Value', description: '' }
      ]
    };

    const updatedPages = [...activeFile.pages, newPage];
    const updatedFiles = tFiles.map((f, idx) => {
      if (idx === activeFileIdx) {
        return { ...f, pages: updatedPages };
      }
      return f;
    });

    saveTFiles(updatedFiles);
    setActivePageId(pageId);
  };

  // Delete active page
  const handleDeletePage = (pageId: string) => {
    if (activeFile.pages.length <= 1) {
      alert("At least one translation page must exist inside this L0xx language schema.");
      return;
    }
    if (!confirm(`Verify discarding Page ID ${pageId} ("${activePage?.title}") and all its translations?`)) {
      return;
    }

    const updatedPages = activeFile.pages.filter(p => p.id !== pageId);
    const updatedFiles = tFiles.map((f, idx) => {
      if (idx === activeFileIdx) {
        return { ...f, pages: updatedPages };
      }
      return f;
    });

    saveTFiles(updatedFiles);
    setActivePageId(updatedPages[0].id);
  };

  // Add Item to current Page
  const handleAddItem = () => {
    if (!activePage) return;
    
    // Find next available numeric ID in the current page items
    const ids = activePage.items.map(i => Number(i.id)).filter(n => !isNaN(n));
    const nextId = ids.length > 0 ? (Math.max(...ids) + 1).toString() : '1';

    const newId = prompt("Enter Unique String Key ID (Numeric):", nextId);
    if (!newId || isNaN(Number(newId))) {
      if (newId) alert("Key ID must be a valid number.");
      return;
    }

    if (activePage.items.some(i => i.id === newId)) {
      alert(`Key ID ${newId} already exists in Page ${activePage.id}.`);
      return;
    }

    const textValue = prompt("Enter translation text:", "New Text");
    if (textValue === null) return;

    const newItem: TranslationItem = {
      id: newId,
      value: textValue,
      description: ''
    };

    const updatedItems = [...activePage.items, newItem];
    const updatedPages = activeFile.pages.map(p => {
      if (p.id === activePage.id) {
        return { ...p, items: updatedItems };
      }
      return p;
    });

    const updatedFiles = tFiles.map((f, idx) => {
      if (idx === activeFileIdx) {
        return { ...f, pages: updatedPages };
      }
      return f;
    });

    saveTFiles(updatedFiles);
  };

  // Edit individual cell
  const handleEditItemCell = (itemId: string, field: 'id' | 'value' | 'description', value: string) => {
    if (!activePage) return;

    if (field === 'id' && isNaN(Number(value))) {
      return; // ID must remain numeric
    }

    // Verify uniqueness if editing ID
    if (field === 'id' && value !== itemId && activePage.items.some(i => i.id === value)) {
      return; // reject duplicate IDs
    }

    const updatedItems = activePage.items.map(item => {
      if (item.id === itemId) {
        return { ...item, [field]: value };
      }
      return item;
    });

    const updatedPages = activeFile.pages.map(p => {
      if (p.id === activePage.id) {
        return { ...p, items: updatedItems };
      }
      return p;
    });

    const updatedFiles = tFiles.map((f, idx) => {
      if (idx === activeFileIdx) {
        return { ...f, pages: updatedPages };
      }
      return f;
    });

    saveTFiles(updatedFiles);
  };

  // Delete translation item
  const handleDeleteItem = (itemId: string) => {
    if (!activePage) return;
    
    const updatedItems = activePage.items.filter(i => i.id !== itemId);
    const updatedPages = activeFile.pages.map(p => {
      if (p.id === activePage.id) {
        return { ...p, items: updatedItems };
      }
      return p;
    });

    const updatedFiles = tFiles.map((f, idx) => {
      if (idx === activeFileIdx) {
        return { ...f, pages: updatedPages };
      }
      return f;
    });

    saveTFiles(updatedFiles);
  };

  // Compile XML output
  const compileTFileXML = (file: TFile): string => {
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<language id="${file.languageId}">\n`;
    
    file.pages.forEach(page => {
      const pTitle = page.title ? ` title="${page.title}"` : '';
      xml += `  <page id="${page.id}"${pTitle}>\n`;
      
      page.items.forEach(item => {
        const comment = item.description ? ` <!-- ${item.description} -->` : '';
        xml += `    <t id="${item.id}">${item.value}</t>${comment}\n`;
      });
      
      xml += `  </page>\n`;
    });
    
    xml += `</language>`;
    return xml;
  };

  const activeXMLOutput = compileTFileXML(activeFile);

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(activeXMLOutput);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Filter items matching query
  const filteredItems = activePage?.items.filter(item => {
    if (!searchQuery) return true;
    const lc = searchQuery.toLowerCase();
    return item.id.includes(lc) || 
           item.value.toLowerCase().includes(lc) || 
           (item.description && item.description.toLowerCase().includes(lc));
  }) || [];

  return (
    <div id="tfiles_editor_view" className="flex-1 bg-[#0a0c10] flex flex-col h-full overflow-hidden text-slate-300">
      
      {/* Title Header */}
      <div className="h-14 border-b border-white/5 bg-[#12141a] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-slate-200 uppercase tracking-tight">X4 Language T-Files Engine (/t/)</span>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded uppercase font-mono font-bold">
            XML Catalogues
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelper(!showHelper)}
            className={`text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer font-mono ${
              showHelper ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/25' : 'bg-slate-800 text-slate-400 border border-transparent hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Guide Panel</span>
          </button>
        </div>
      </div>

      {/* Quick Guide Panel */}
      {showHelper && (
        <div className="bg-[#121620] border-b border-[#059669]/20 p-3 text-xs leading-relaxed text-slate-400 flex items-start gap-2.5 shrink-0 select-none">
          <AlertCircle className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-slate-200 block">X4 String Translation Files (t-files):</span>
            <p>
              Mod objects referencing names, subtitles, or messages use string lookups with the syntax <code className="text-emerald-400 font-mono px-1 bg-black/40 rounded">{"{pageId, stringId}"}</code> (e.g. <code className="text-emerald-400 font-mono px-1 bg-black/40 rounded">{"{20001, 1}"}</code> will fetch <em>"Antimatter Disrupter Cannon"</em>). 
              Files live inside the <code className="text-cyan-400 font-mono px-1 bg-black/40.2 rounded">/t/</code> directory under the schema <code className="text-cyan-300 font-mono px-1">0001-L0xx.xml</code> (where <code className="text-orange-400">044</code>: English, <code className="text-orange-400">049</code>: German, etc.).
            </p>
          </div>
        </div>
      )}

      {/* Main Grid View */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Bar: Translation files & pages list */}
        <div className="w-[280px] shrink-0 border-r border-white/5 bg-[#0e1117] flex flex-col justify-between">
          
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            
            {/* Header section 1: Translation Files List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Languages className="w-3 h-3 text-emerald-400" /> Language files
                </span>
                <button
                  onClick={handleAddLanguageFile}
                  className="p-1 rounded bg-[#202530] text-emerald-400 hover:bg-[#2c3344] hover:text-white transition-colors cursor-pointer"
                  title="Add language file (e.g., German, French)"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1">
                {tFiles.map((file, idx) => {
                  const matchedLang = LANGUAGES_SUPPORT.find(l => l.id === file.languageId);
                  const isCur = idx === activeFileIdx;
                  return (
                    <div 
                      key={file.fileName}
                      className={`flex items-center justify-between p-2 rounded group transition-all font-mono text-[11px] ${
                        isCur ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-black/25 hover:bg-[#202530] text-slate-400 border border-transparent'
                      }`}
                    >
                      <button
                        onClick={() => { setActiveFileIdx(idx); }}
                        className="flex-1 text-left flex items-center gap-1.5 cursor-pointer truncate"
                      >
                        <span className="text-xs">{matchedLang?.flag || '🌐'}</span>
                        <div className="truncate">
                          <span className="font-bold block text-slate-200 group-hover:text-white">{file.fileName}</span>
                          <span className="text-[9px] text-slate-500">Lang: {file.languageId} ({matchedLang?.name || 'Custom'})</span>
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteLanguageFile(idx)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 rounded transition-opacity cursor-pointer ml-1"
                        title="Delete translation file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Header section 2: Pages within the file */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <BookOpen className="w-3 h-3 text-cyan-400" /> Lookup Pages
                </span>
                <button
                  onClick={handleAddPage}
                  className="p-1 rounded bg-[#202530] text-cyan-400 hover:bg-[#2c3344] hover:text-white transition-colors cursor-pointer"
                  title="Add unique Page ID catalogue"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {activeFile && activeFile.pages.length === 0 ? (
                <div className="text-center py-4 text-[10px] font-mono text-slate-600">
                  No Pages declared.
                </div>
              ) : (
                <div className="space-y-1">
                  {activeFile?.pages.map(page => {
                    const isCur = page.id === activePageId;
                    return (
                      <div
                        key={page.id}
                        className={`group flex items-center justify-between p-2 rounded transition-all font-mono text-[11px] ${
                          isCur ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-semibold' : 'bg-black/15 hover:bg-[#202530] text-slate-400'
                        }`}
                      >
                        <button
                          onClick={() => setActivePageId(page.id)}
                          className="flex-1 text-left cursor-pointer truncate"
                        >
                          <span className="text-white block truncate">Page {page.id}</span>
                          <span className="text-[9px] text-slate-500 truncate block">{page.title || 'Translation catalogue'}</span>
                        </button>
                        <button
                          onClick={() => handleDeletePage(page.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 rounded transition-opacity cursor-pointer"
                          title="Delete Page"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Quick Technical Summary */}
          <div className="p-3 bg-black/45 border-t border-white/5 font-mono text-[9px] text-slate-500 space-y-1 select-none shrink-0">
            <div>Factions database: Argon, Xenon, Teladi</div>
            <div>Syntax: {"{page, ID}"} parser valid</div>
          </div>
        </div>

        {/* Center Panel: Interactive Record Grid list */}
        <div className="flex-1 flex flex-col bg-[#0d0f14] overflow-hidden">
          
          {/* Internal filters toolbar */}
          <div className="h-12 border-b border-white/5 bg-[#11141b] px-3 flex items-center justify-between gap-4 shrink-0 font-mono text-xs">
            
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search translations key ID or text..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-md bg-black/45 border border-white/10 text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/35 transition-all text-slate-200"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-slate-500">Page ID: <strong className="text-slate-300 font-mono">{activePage?.id || 'None'}</strong></span>
              <button
                onClick={handleAddItem}
                disabled={!activePage}
                className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase font-mono tracking-tight transition-all flex items-center gap-1 cursor-pointer border ${
                  activePage 
                    ? 'bg-emerald-600/10 hover:bg-emerald-600/25 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/50' 
                    : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Record Tag</span>
              </button>
            </div>
          </div>

          {/* Grid listing */}
          <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
            
            {!activePage ? (
              <div className="text-center py-20 text-slate-500 font-mono text-xs flex flex-col items-center justify-center gap-2">
                <Languages className="w-8 h-8 text-slate-600 animate-pulse" />
                <span>Select a lang file page from the sidebar to inspect items</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-20 text-slate-500 font-mono text-xs">
                {searchQuery ? "No translations matched your filter query" : "This translation page is empty"}
              </div>
            ) : (
              <table className="w-full text-left font-mono border-collapse select-text">
                <thead>
                  <tr className="bg-black/35 text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/5">
                    <th className="py-2.5 px-3 w-[120px] font-bold">Key ID (&lt;t id="..."&gt;)</th>
                    <th className="py-2.5 px-3 font-bold">Translation Text</th>
                    <th className="py-2.5 px-3 w-[240px] font-bold">Description / Developer note</th>
                    <th className="py-2.5 px-3 w-[60px] text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-white/5">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-[#13161f] transition-colors group">
                      <td className="p-3">
                        <input
                          type="text"
                          value={item.id}
                          onChange={e => handleEditItemCell(item.id, 'id', e.target.value)}
                          className="w-full bg-black/30 hover:bg-[#202530] focus:bg-[#222938] border border-transparent focus:border-cyan-500/30 text-cyan-400 text-xs px-2 py-1 rounded focus:outline-none transition-colors"
                        />
                      </td>
                      <td className="p-3">
                        <textarea
                          rows={1}
                          value={item.value}
                          onChange={e => handleEditItemCell(item.id, 'value', e.target.value)}
                          className="w-full bg-black/30 hover:bg-[#202530] focus:bg-[#222938] border border-transparent focus:border-cyan-500/30 text-slate-200 text-xs px-2 py-1.5 rounded focus:outline-none transition-colors resize-none align-middle"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={item.description || ''}
                          placeholder="No commentary note..."
                          onChange={e => handleEditItemCell(item.id, 'description', e.target.value)}
                          className="w-full bg-black/30 hover:bg-[#202530] focus:bg-[#222938] border border-transparent focus:border-cyan-500/30 text-slate-400 text-[10.5px] px-2 py-1 rounded focus:outline-none transition-colors"
                        />
                      </td>
                      <td className="p-3 text-center align-middle">
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1 rounded hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer inline-block"
                          title="Purge translation row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Side: Compiling code viewer */}
        <div className="w-[380px] shrink-0 border-l border-white/5 bg-[#0f1218] flex flex-col overflow-hidden">
          
          <div className="h-10 border-b border-white/5 bg-[#13161f] px-3 flex items-center justify-between shrink-0 font-mono text-[10px]">
            <span className="text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <FileCode className="w-3 text-cyan-400" /> Compiled Catalog XML Code
            </span>
            <button
              onClick={handleCopyToClipboard}
              className="p-1 px-2.5 rounded hover:bg-[#222838] transition-all text-cyan-400 hover:text-cyan-200 border border-cyan-500/10 hover:border-cyan-500/30 font-mono flex items-center gap-1 cursor-pointer text-[9px]"
              title="Copy translation XML string"
            >
              {copiedCode ? <Check className="w-3 h-3 text-emerald-400 animate-pulse" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCode ? "Copying Done" : "Copy XML"}</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 text-xs bg-[#0b0c10] font-mono select-text select-all whitespace-pre leading-normal select-none custom-scrollbar">
            <code className="text-[#06b6d4]">
              {activeXMLOutput}
            </code>
          </div>
          
          <div className="p-3 bg-[#131720] border-t border-white/5 font-mono text-[9px] shrink-0 space-y-1.5 leading-snug">
            <span className="font-bold text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" /> Auto-Localization System
            </span>
            <p className="text-slate-500">
              The Mission Director engine validates these lookup pages into static buffers. Any modifications you complete here sync with the file explorer when exporting.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
