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
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { ModWorkspace, TFile, TranslationPage, TranslationItem } from '../types';
import { toTFileName } from '../lib/modCompiler';
import { confirmDialog, promptDialog } from '../lib/uiDialogs';

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
  // Initialize from workspace if present, or fallback and initialize workspace state
  const [tFiles, setTFiles] = useState<TFile[]>(() => {
    return workspace.tFiles || [];
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

  const activeFile = tFiles[activeFileIdx] || tFiles[0];

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
  const handleAddLanguageFile = async () => {
    const nextUnusedLang = LANGUAGES_SUPPORT.find(l => !tFiles.some(tf => tf.languageId === l.id));
    const langId = nextUnusedLang?.id || '44';

    const newLangId = await promptDialog(`Enter Language ID Code (e.g., 44: English, 49: German, 33: French):`, langId);
    if (!newLangId) return;

    const matchedLang = LANGUAGES_SUPPORT.find(l => l.id === newLangId);
    const codeSuffix = matchedLang ? matchedLang.suffix : `L0${newLangId}`;
    const filename = toTFileName({ fileName: `0001-${codeSuffix}.xml`, languageId: newLangId });

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
  const handleDeleteLanguageFile = async (idx: number) => {
    if (tFiles.length <= 1) {
      alert("At least one language T-File must remain configured.");
      return;
    }
    const confirmed = await confirmDialog(`Are you sure you want to delete translation file: "${tFiles[idx].fileName}"?`, { okLabel: 'Delete', cancelLabel: 'Keep' });
    if (!confirmed) return;

    const nextFiles = tFiles.filter((_, i) => i !== idx);
    saveTFiles(nextFiles);
    setActiveFileIdx(Math.max(0, idx - 1));
  };

  // Add translation page to active file
  const handleAddPage = async () => {
    const pageId = await promptDialog(`Enter unused Page ID (X4 standard mod pages are usually 20000+):`, '20003');
    if (!pageId || isNaN(Number(pageId))) {
      if (pageId) alert("Page ID must be a numeric string.");
      return;
    }

    if (activeFile.pages.some(p => p.id === pageId)) {
      alert(`Page ID ${pageId} already exists in this file.`);
      return;
    }

    const pageTitle = await promptDialog(`Enter descriptive label for Page ${pageId}:`, 'Custom Dialogues');
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
  const handleDeletePage = async (pageId: string) => {
    if (activeFile.pages.length <= 1) {
      alert("At least one translation page must exist inside this L0xx language schema.");
      return;
    }
    if (!(await confirmDialog(`Verify discarding Page ID ${pageId} ("${activePage?.title}") and all its translations?`, { okLabel: 'Discard', cancelLabel: 'Keep' }))) {
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
  const handleAddItem = async () => {
    if (!activePage) return;

    // Find next available numeric ID in the current page items
    const ids = activePage.items.map(i => Number(i.id)).filter(n => !isNaN(n));
    const nextId = ids.length > 0 ? (Math.max(...ids) + 1).toString() : '1';

    const newId = await promptDialog("Enter Unique String Key ID (Numeric):", nextId);
    if (!newId || isNaN(Number(newId))) {
      if (newId) alert("Key ID must be a valid number.");
      return;
    }

    if (activePage.items.some(i => i.id === newId)) {
      alert(`Key ID ${newId} already exists in Page ${activePage.id}.`);
      return;
    }

    const textValue = await promptDialog("Enter translation text:", "New Text");
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
  const compileTFileXML = (file: TFile | undefined): string => {
    if (!file) {
      return `<?xml version="1.0" encoding="utf-8"?>\n<!-- Click "+ LANG" to create a Language translation t-file -->\n<language id="44">\n</language>`;
    }
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<language id="${file.languageId}">\n`;
    
    (file.pages || []).forEach(page => {
      const pTitle = page.title ? ` title="${page.title}"` : '';
      xml += `  <page id="${page.id}"${pTitle}>\n`;
      
      (page.items || []).forEach(item => {
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
              Files live inside the <code className="text-cyan-400 font-mono px-1 bg-black/40.2 rounded">/t/</code> directory under the schema <code className="text-cyan-300 font-mono px-1">0001-l0xx.xml</code> (where <code className="text-orange-400">044</code>: English, <code className="text-orange-400">049</code>: German, etc.).
            </p>
          </div>
        </div>
      )}

      {/* Main Grid View */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Bar: Translation files & pages list */}
        <div className="w-[280px] shrink-0 border-r border-white/5 bg-[#0e1117] flex flex-col justify-between">
          
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            
            {/* Header section: Languages and Pages Hierarchy Tree */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/5 pb-1">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 font-bold">
                  📁 languages tree
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleAddLanguageFile}
                    className="p-1 rounded bg-[#202530] text-emerald-400 hover:bg-[#2c3344] hover:text-white transition-all cursor-pointer text-[9px] font-bold uppercase font-mono flex items-center gap-0.5"
                    title="Add language file (e.g., German, French)"
                  >
                    <Plus className="w-2.5 h-2.5" /> LANG
                  </button>
                  <button
                    onClick={handleAddPage}
                    disabled={tFiles.length === 0}
                    className="p-1 rounded bg-[#202530] text-cyan-400 hover:bg-[#2c3344] hover:text-white transition-all cursor-pointer text-[9px] font-bold uppercase font-mono flex items-center gap-0.5 disabled:opacity-30 disabled:pointer-events-none"
                    title="Add unique Page ID catalogue"
                  >
                    <Plus className="w-2.5 h-2.5" /> PAGE
                  </button>
                </div>
              </div>

              <div className="space-y-4 font-mono text-[11px] scrollbar-thin">
                {tFiles.length === 0 ? (
                  <div className="text-[10px] text-slate-500 italic p-4 text-center">No language translation files created. Click "+ LANG" to create!</div>
                ) : (
                  tFiles.map((file, fIdx) => {
                    const matchedLang = LANGUAGES_SUPPORT.find(l => l.id === file.languageId);
                    const isFileActive = activeFileIdx === fIdx;

                    return (
                      <div key={file.fileName} className="space-y-1.5">
                        {/* File Level Root Node */}
                        <div className={`p-1.5 rounded flex items-center justify-between transition-colors ${
                          isFileActive ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/20' : 'bg-black/15 text-slate-400 border border-transparent'
                        }`}>
                          <button
                            onClick={() => {
                              setActiveFileIdx(fIdx);
                              if (file.pages && file.pages.length > 0) {
                                setActivePageId(file.pages[0].id);
                              } else {
                                setActivePageId('');
                              }
                            }}
                            className="flex-1 text-left flex items-center gap-1.5 cursor-pointer truncate"
                          >
                            <span className="text-xs">{matchedLang?.flag || '🌐'}</span>
                            <div className="truncate">
                              <span className="font-bold text-slate-200 block text-[10.5px] leading-tight">{file.fileName}</span>
                              <span className="text-[8.5px] text-slate-500 block">({matchedLang?.name || 'Custom'})</span>
                            </div>
                          </button>
                          
                          <button
                            onClick={() => handleDeleteLanguageFile(fIdx)}
                            className="p-1 hover:text-rose-400 rounded transition-colors cursor-pointer text-slate-600 ml-1 shrink-0"
                            title="Delete this Language translation file"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Pages Level Inside the File */}
                        <div className="pl-3.5 border-l border-white/5 space-y-2">
                          {file.pages.length === 0 ? (
                            <span className="text-[8.5px] text-slate-600 italic block py-0.5">No pages. Click "+ PAGE".</span>
                          ) : (
                            file.pages.map(page => {
                              const isPageActive = isFileActive && page.id === activePageId;
                              return (
                                <div key={page.id} className="space-y-0.5">
                                  {/* Page selector button */}
                                  <div className={`p-1 rounded flex items-center justify-between transition-colors ${
                                    isPageActive ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-slate-200'
                                  }`}>
                                    <button
                                      onClick={() => {
                                        setActiveFileIdx(fIdx);
                                        setActivePageId(page.id);
                                      }}
                                      className="flex-1 text-left cursor-pointer truncate flex items-center gap-1"
                                    >
                                      <span>📃 Page {page.id}</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setActiveFileIdx(fIdx);
                                        handleDeletePage(page.id);
                                      }}
                                      className="p-1 hover:text-rose-400 rounded transition-colors text-slate-600 shrink-0 cursor-pointer"
                                      title="Delete lookup Page"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>

                                  {/* T-Keys (leaf items of the hierarchy) */}
                                  <div className="pl-4 border-l border-white/[0.03] space-y-0.5 font-medium text-[9px] text-slate-600 block">
                                    {page.items.length === 0 ? (
                                      <span className="italic block text-[8.5px] py-0.5 text-slate-700">Empty Page</span>
                                    ) : (
                                      page.items.slice(0, 4).map(item => (
                                        <div key={item.id} className="truncate flex items-center gap-1 max-w-[200px]" title={`id:${item.id} -> ${item.value}`}>
                                          <span className="text-[8px] text-slate-600">{item.id}:</span>
                                          <span className="truncate text-slate-500">{item.value}</span>
                                        </div>
                                      ))
                                    )}
                                    {page.items.length > 4 && (
                                      <span className="text-[8px] text-slate-700 block italic">({page.items.length - 4} more keys...)</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
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
