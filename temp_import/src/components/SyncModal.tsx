/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  FileJson, 
  FileCode,
  ArrowRightLeft,
  ClipboardPaste,
  ShieldAlert,
  FolderSync
} from 'lucide-react';
import { ModWorkspace, MDNode, MDLink, NODE_TEMPLATES } from '../types';
import { parseXMLToWorkspace } from '../lib/xmlParser';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  setWorkspaceView?: (view: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'translation') => void;
}

export default function SyncModal({
  isOpen,
  onClose,
  workspace,
  setWorkspace,
  saveCheckpoint,
  setWorkspaceView
}: SyncModalProps) {
  const [activeTab, setActiveTab] = useState<'import'>('import');
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'refused' | 'info'; msg: string } | null>(null);

  // Raw Import Paste Area Text
  const [importText, setImportText] = useState('');
  const [dragActive, setDragActive] = useState(false);

  if (!isOpen) return null;

  // Raw Content text/file parser execution
  const executeImport = (textToImport: string, format: 'json' | 'xml') => {
    if (!textToImport.trim()) {
      setStatusBanner({ type: 'refused', msg: 'Please enter or drop file data to load.' });
      return;
    }

    try {
      if (format === 'json') {
        const parsed = JSON.parse(textToImport);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes)) {
          // Valid workspace json
          saveCheckpoint();
          setWorkspace(parsed);
          setStatusBanner({ 
            type: 'success', 
            msg: `Workspace JSON "${parsed.name || 'mod'}" parsed successfully! Re-rendered ${parsed.nodes.length} visual nodes.` 
          });
          onClose();
        } else {
          throw new Error("Missing mandatory 'nodes' schema attribute.");
        }
      } else {
        const isTFile = textToImport.includes('<language');
        const isAIScript = textToImport.includes('<aiscript');
        const isLibrary = textToImport.includes('<diff');

        if (isTFile) {
          // Parse Language T-File
          const parser = new DOMParser();
          const doc = parser.parseFromString(textToImport, "application/xml");
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
              fileName: `0001-L0${languageId}.xml`,
              pages
            };
            
            saveCheckpoint();
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
            
            setStatusBanner({
              type: 'success',
              msg: `Language translation catalog (${languageId}) parsed and loaded successfully!`
            });
            onClose();
          } else {
            throw new Error("Invalid language XML root structure.");
          }
        } else if (isAIScript) {
          if (setWorkspaceView) {
            setWorkspaceView('aiscripts');
          }
          setStatusBanner({
            type: 'success',
            msg: `AIScript XML imported successfully! Visually routed to Behavior Tree builder.`
          });
          onClose();
        } else if (isLibrary) {
          if (setWorkspaceView) {
            setWorkspaceView('xmlpatch');
          }
          setStatusBanner({
            type: 'success',
            msg: `X4 Library XML patch imported. Redirected to the XML Patching code viewer.`
          });
          onClose();
        } else {
          // Run customized Egosoft Script Parser
          const reconstructed = parseXMLToWorkspace(textToImport);
          if (reconstructed && reconstructed.nodes.length > 0) {
            saveCheckpoint();
            setWorkspace(reconstructed);
            if (setWorkspaceView) {
              setWorkspaceView('blueprint');
            }
            setStatusBanner({
              type: 'success',
              msg: `Reconstructed Mission script successfully! Generated ${reconstructed.nodes.length} nodes and ${reconstructed.links.length} visual node chains.`
            });
            onClose();
          } else {
            throw new Error("No compatible game nodes (cues, events, actions) were identified in this script file.");
          }
        }
      }
    } catch (e: any) {
      setStatusBanner({ type: 'refused', msg: `Parse Error: ${e.message || "Ensure correct XML structure."}` });
    }
  };

  // Drag and Drop files handling
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();

      reader.onload = (event) => {
        const contentText = event.target?.result as string || '';
        setImportText(contentText);
        const ext = file.name.split('.').pop()?.toLowerCase();
        
        if (ext === 'json') {
          executeImport(contentText, 'json');
        } else if (ext === 'xml') {
          executeImport(contentText, 'xml');
        } else {
          setStatusBanner({ type: 'info', msg: `Identified file structure as text. Extracted raw text content.` });
        }
      };
      reader.readAsText(file);
    }
  };

  // File picker handler
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const contentText = event.target?.result as string || '';
        setImportText(contentText);
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'json') executeImport(contentText, 'json');
        else executeImport(contentText, 'xml');
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 transition-all animate-fade-in font-sans">
      <div className="w-full max-w-4xl bg-[#141822] border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header section */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#171c2a]">
          <div className="flex items-center gap-2.5">
            <FolderSync className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-mono font-bold text-white tracking-wider uppercase">Mod Cloud Sync & File Parser</h2>
              <p className="text-[10px] font-mono text-slate-400">Import existing workspace JSON or Egosoft XML files</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Alerts banner */}
        {statusBanner && (
          <div className={`p-3 text-[11px] font-mono border-b flex items-center justify-between transition-all ${
            statusBanner.type === 'success' 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : statusBanner.type === 'refused'
              ? 'bg-red-500/10 text-red-400 border-red-500/20'
              : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
          }`}>
            <div className="flex items-center gap-2">
              {statusBanner.type === 'success' ? <CheckCircle2 className="w-4.5 h-4.5" /> : <AlertCircle className="w-4.5 h-4.5" />}
              <span>{statusBanner.msg}</span>
            </div>
            <button 
              onClick={() => setStatusBanner(null)} 
              className="text-[10px] underline cursor-pointer hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Category Selector Tabs */}
        <div className="flex border-b border-white/5 bg-black/15 font-mono text-xs">
          <button
            onClick={() => { setActiveTab('import'); setStatusBanner(null); }}
            className={`flex-1 py-3 border-b-2 text-center font-bold tracking-tight transition-all cursor-pointer ${
              activeTab === 'import'
                ? 'border-cyan-500 text-white bg-cyan-600/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📂 IMPORT JSON / MD XML
          </button>
          {/* GitHub Repo Manager moved to the SOURCE (Source Control) panel — see SourceControl.tsx › Remotes tab. */}
        </div>

        {/* Modal Container Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* TAB 1: FILE IMPORTER */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center select-none cursor-pointer transition-all ${
                  dragActive 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-white/10 hover:border-cyan-500/40 bg-black/25'
                }`}
              >
                <input 
                  type="file" 
                  id="import-file-picker" 
                  accept=".json,.xml"
                  className="hidden" 
                  onChange={handleFileInput}
                />
                <label htmlFor="import-file-picker" className="cursor-pointer space-y-2 block">
                  <Upload className="w-8 h-8 text-cyan-400 mx-auto" />
                  <div className="text-white text-xs font-mono font-medium">
                    Drag and drop file here, or <span className="text-cyan-400 underline">browse computer</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Accepts exported Workspace <span className="text-slate-400">.json</span> or Egosoft Mission Director <span className="text-slate-400">.xml</span> files
                  </p>
                </label>
              </div>

              <div className="relative">
                <div className="flex items-center justify-between mb-1.5 font-mono">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    Or Paste Raw Code to Load
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => executeImport(importText, 'json')}
                      className="px-2 py-0.5 rounded text-[10px] bg-indigo-600/20 text-indigo-400 border border-indigo-500/35 hover:bg-indigo-600/35 cursor-pointer transition-all flex items-center gap-1"
                    >
                      <FileJson className="w-3 h-3" />
                      Import Workspace JSON
                    </button>
                    <button
                      onClick={() => executeImport(importText, 'xml')}
                      className="px-2 py-0.5 rounded text-[10px] bg-cyan-600/20 text-cyan-400 border border-cyan-500/35 hover:bg-cyan-600/35 cursor-pointer transition-all flex items-center gap-1"
                    >
                      <FileCode className="w-3 h-3" />
                      Parse Egosoft XML Script
                    </button>
                  </div>
                </div>
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder="Paste workspace JSON or standard X4 MD script XML here..."
                  className="w-full h-44 p-3 rounded-lg bg-black/60 border border-white/10 font-mono text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500 transition-all resize-none"
                />
              </div>

              <div className="bg-slate-950/40 p-3 rounded-lg border border-white/5 space-y-1.5 text-[10.5px] leading-relaxed text-slate-400 font-mono">
                <div className="text-cyan-400 uppercase font-bold text-[11px] flex items-center gap-1 mb-1">
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  X4 smart XML parser technology:
                </div>
                <div>• Auto-creates <span className="text-purple-400 font-semibold">Mission Cue</span> visual nodes dynamically mapped with logical ids.</div>
                <div>• Translates nested event triggers and value conditions such as <span className="text-yellow-400">&lt;event_cue_signalled&gt;</span>.</div>
                <div>• Decodes action sequences like <span className="text-emerald-400">&lt;create_ship&gt;</span> or <span className="text-emerald-400">&lt;reward_player&gt;</span> and auto-formats correct wiring links.</div>
              </div>
            </div>
          )}

          {/* GitHub Repo Manager (load / commit & push) has moved to the SOURCE panel:
              SourceControl.tsx › Remotes tab. This modal is now import-only. */}

        </div>

        {/* Technical Footer */}
        <div className="p-3 bg-[#0d1017] border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-yellow-500" />
            <span>Local import parser only</span>
          </div>
          <span>GitHub moved to SOURCE</span>
        </div>
      </div>
    </div>
  );
}
