/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  FileCode,
  Globe,
  HelpCircle,
  Languages,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ModWorkspace, TFile, TranslationItem, TranslationPage } from '../types';
import { compileTFileXML } from '../lib/modCompiler';
import { confirmDialog, promptDialog } from '../lib/uiDialogs';
import { EmptyState, StatusPill } from './ui';

interface TFileEditorProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
}

const LANGUAGES_SUPPORT = [
  { id: '44', name: 'English', suffix: 'L044' },
  { id: '49', name: 'German', suffix: 'L049' },
  { id: '33', name: 'French', suffix: 'L033' },
  { id: '07', name: 'Russian', suffix: 'L007' },
  { id: '39', name: 'Italian', suffix: 'L039' },
  { id: '34', name: 'Spanish', suffix: 'L034' },
  { id: '86', name: 'Chinese', suffix: 'L086' },
  { id: '81', name: 'Japanese', suffix: 'L081' },
];

export default function TFileEditor({ workspace, setWorkspace }: TFileEditorProps) {
  const tFiles = useMemo(() => workspace.tFiles || [], [workspace.tFiles]);

  const [activeFileIdx, setActiveFileIdx] = useState<number>(0);
  const [activePageId, setActivePageId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [showHelper, setShowHelper] = useState<boolean>(false);
  const [showXmlPreview, setShowXmlPreview] = useState<boolean>(false);

  const safeFileIdx = tFiles.length === 0 ? 0 : Math.min(activeFileIdx, tFiles.length - 1);
  const activeFile = tFiles[safeFileIdx] || tFiles[0];

  const saveTFiles = (updatedFiles: TFile[]) => {
    setWorkspace(prev => ({
      ...prev,
      tFiles: updatedFiles,
    }));
  };

  useEffect(() => {
    if (activeFile && activeFile.pages.length > 0) {
      const pageExists = activeFile.pages.some(p => p.id === activePageId);
      if (!pageExists) {
        setActivePageId(activeFile.pages[0].id);
      }
    } else if (activePageId !== '') {
      setActivePageId('');
    }
  }, [activeFile, activePageId]);

  const activePage = activeFile?.pages.find(p => p.id === activePageId) || activeFile?.pages[0];

  const handleAddLanguageFile = async () => {
    const nextUnusedLang = LANGUAGES_SUPPORT.find(l => !tFiles.some(tf => tf.languageId === l.id));
    const langId = nextUnusedLang?.id || '44';

    const newLangId = await promptDialog(
      'Enter Language ID Code (e.g., 44: English, 49: German, 33: French):',
      langId,
    );
    if (!newLangId) return;

    const matchedLang = LANGUAGES_SUPPORT.find(l => l.id === newLangId);
    const codeSuffix = matchedLang ? matchedLang.suffix : `L0${newLangId}`;
    const candidateName = `0001-${codeSuffix}.xml`;
    const filenameMatch = candidateName.match(/^(.+?)-[lL](\d+)\.xml$/);
    const filename = filenameMatch
      ? `${filenameMatch[1]}-l${filenameMatch[2].padStart(3, '0')}.xml`
      : candidateName;

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
            { id: '1', value: 'Translated Item Name', description: 'Initial default name string' },
          ],
        },
      ],
    };

    const nextFiles = [...tFiles, newFile];
    saveTFiles(nextFiles);
    setActiveFileIdx(nextFiles.length - 1);
    setActivePageId('20001');
  };

  const handleDeleteLanguageFile = async (idx: number) => {
    if (tFiles.length <= 1) {
      alert('At least one language T-File must remain configured.');
      return;
    }
    const confirmed = await confirmDialog(
      `Are you sure you want to delete translation file: "${tFiles[idx].fileName}"?`,
      { okLabel: 'Delete', cancelLabel: 'Keep' },
    );
    if (!confirmed) return;

    const nextFiles = tFiles.filter((_, i) => i !== idx);
    saveTFiles(nextFiles);
    setActiveFileIdx(Math.max(0, idx - 1));
  };

  const handleAddPage = async () => {
    if (!activeFile) return;
    const pageId = await promptDialog(
      'Enter unused Page ID (X4 standard mod pages are usually 20000+):',
      '20003',
    );
    if (!pageId || isNaN(Number(pageId))) {
      if (pageId) alert('Page ID must be a numeric string.');
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
      items: [{ id: '1', value: 'New Translation Value', description: '' }],
    };

    const updatedPages = [...activeFile.pages, newPage];
    const updatedFiles = tFiles.map((f, idx) => (idx === safeFileIdx ? { ...f, pages: updatedPages } : f));
    saveTFiles(updatedFiles);
    setActivePageId(pageId);
  };

  const handleDeletePage = async (pageId: string) => {
    if (!activeFile) return;
    if (activeFile.pages.length <= 1) {
      alert('At least one translation page must exist inside this L0xx language schema.');
      return;
    }
    if (
      !(await confirmDialog(
        `Verify discarding Page ID ${pageId} ("${activePage?.title}") and all its translations?`,
        { okLabel: 'Discard', cancelLabel: 'Keep' },
      ))
    ) {
      return;
    }

    const updatedPages = activeFile.pages.filter(p => p.id !== pageId);
    const updatedFiles = tFiles.map((f, idx) => (idx === safeFileIdx ? { ...f, pages: updatedPages } : f));
    saveTFiles(updatedFiles);
    setActivePageId(updatedPages[0].id);
  };

  const handleAddItem = async () => {
    if (!activePage || !activeFile) return;

    const ids = activePage.items.map(i => Number(i.id)).filter(n => !isNaN(n));
    const nextId = ids.length > 0 ? (Math.max(...ids) + 1).toString() : '1';

    const newId = await promptDialog('Enter Unique String Key ID (Numeric):', nextId);
    if (!newId || isNaN(Number(newId))) {
      if (newId) alert('Key ID must be a valid number.');
      return;
    }

    if (activePage.items.some(i => i.id === newId)) {
      alert(`Key ID ${newId} already exists in Page ${activePage.id}.`);
      return;
    }

    const textValue = await promptDialog('Enter translation text:', 'New Text');
    if (textValue === null) return;

    const newItem: TranslationItem = {
      id: newId,
      value: textValue,
      description: '',
    };

    const updatedPages = activeFile.pages.map(p =>
      p.id === activePage.id ? { ...p, items: [...activePage.items, newItem] } : p,
    );
    const updatedFiles = tFiles.map((f, idx) => (idx === safeFileIdx ? { ...f, pages: updatedPages } : f));
    saveTFiles(updatedFiles);
  };

  const handleEditItemCell = (
    itemId: string,
    field: 'id' | 'value' | 'description',
    value: string,
  ) => {
    if (!activePage || !activeFile) return;
    if (field === 'id' && isNaN(Number(value))) return;
    if (field === 'id' && value !== itemId && activePage.items.some(i => i.id === value)) return;

    const updatedItems = activePage.items.map(item =>
      item.id === itemId ? { ...item, [field]: value } : item,
    );
    const updatedPages = activeFile.pages.map(p =>
      p.id === activePage.id ? { ...p, items: updatedItems } : p,
    );
    const updatedFiles = tFiles.map((f, idx) => (idx === safeFileIdx ? { ...f, pages: updatedPages } : f));
    saveTFiles(updatedFiles);
  };

  const handleDeleteItem = (itemId: string) => {
    if (!activePage || !activeFile) return;
    const updatedItems = activePage.items.filter(i => i.id !== itemId);
    const updatedPages = activeFile.pages.map(p =>
      p.id === activePage.id ? { ...p, items: updatedItems } : p,
    );
    const updatedFiles = tFiles.map((f, idx) => (idx === safeFileIdx ? { ...f, pages: updatedPages } : f));
    saveTFiles(updatedFiles);
  };

  const activeXMLOutput = useMemo(() => {
    if (!activeFile) {
      return `<?xml version="1.0" encoding="utf-8"?>\n<!-- Click "+ LANG" to create a Language translation t-file -->\n<language id="44">\n</language>`;
    }
    return compileTFileXML(activeFile);
  }, [activeFile]);

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(activeXMLOutput);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const filteredItems = useMemo(() => {
    const items = activePage?.items || [];
    if (!searchQuery.trim()) return items;
    const lc = searchQuery.trim().toLowerCase();
    return items.filter(
      item =>
        item.id.toLowerCase().includes(lc) ||
        item.value.toLowerCase().includes(lc) ||
        Boolean(item.description && item.description.toLowerCase().includes(lc)),
    );
  }, [activePage, searchQuery]);

  return (
    <div
      id="tfiles_editor_view"
      className="flex-1 bg-[#0c0e12] flex flex-col h-full overflow-hidden text-[#eef2f7]"
    >
      {/* Title Header */}
      <div className="bg-[#141820] border-b border-[#262c36] px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold text-xs text-[#eef2f7] truncate">
            Localization T-Files (/t/)
          </span>
          <StatusPill tone="success">
            {tFiles.length} lang{tFiles.length === 1 ? '' : 's'}
          </StatusPill>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="tfile-xml-toggle"
            onClick={() => setShowXmlPreview(prev => !prev)}
            className={`min-[1440px]:hidden text-[11px] px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 cursor-pointer font-medium ${
              showXmlPreview
                ? 'bg-blue-500/20 text-blue-200 border-blue-500/35'
                : 'bg-[#171b23] text-[#a0aab8] border-[#262c36] hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>XML Preview</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHelper(!showHelper)}
            className={`text-[11px] px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 cursor-pointer font-medium ${
              showHelper
                ? 'bg-blue-500/15 text-blue-200 border-blue-500/35'
                : 'bg-[#171b23] text-[#a0aab8] border-[#262c36] hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Guide</span>
          </button>
        </div>
      </div>

      {/* Quick Guide Panel */}
      {showHelper && (
        <div className="bg-[#11141a] border-b border-[#262c36] px-4 py-2.5 text-xs leading-relaxed text-[#a0aab8] flex items-start gap-2.5 shrink-0">
          <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-[#eef2f7] block">X4 String Translation Lookup</span>
            <p>
              Reference localized strings with{' '}
              <code className="text-emerald-300 font-mono px-1 bg-[#090b0f] rounded">
                {'{pageId, stringId}'}
              </code>{' '}
              (for example <code className="text-emerald-300 font-mono">{'{20001, 1}'}</code>). Files export
              under <code className="text-blue-300 font-mono">/t/0001-l0xx.xml</code> (<code className="font-mono">044</code> English, <code className="font-mono">049</code> German, etc.) with full XML entity escaping.
            </p>
          </div>
        </div>
      )}

      {/* Main Split View */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Rail: Translation files & pages */}
        <div className="w-[228px] shrink-0 border-r border-[#262c36] bg-[#11141a] flex flex-col justify-between overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
            <div className="flex items-center justify-between border-b border-[#262c36] pb-2">
              <span className="text-[11px] font-semibold text-[#a0aab8]">Languages Tree</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleAddLanguageFile}
                  className="px-2 py-1 rounded bg-[#171b23] border border-[#262c36] text-emerald-300 hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer text-[11px] font-medium flex items-center gap-0.5"
                  title="Add language file (e.g., German, French)"
                >
                  <Plus className="w-3 h-3" /> LANG
                </button>
                <button
                  type="button"
                  onClick={handleAddPage}
                  disabled={tFiles.length === 0}
                  className="px-2 py-1 rounded bg-[#171b23] border border-[#262c36] text-blue-300 hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer text-[11px] font-medium flex items-center gap-0.5 disabled:opacity-35 disabled:pointer-events-none"
                  title="Add unique Page ID catalogue"
                >
                  <Plus className="w-3 h-3" /> PAGE
                </button>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              {tFiles.length === 0 ? (
                <div className="text-xs text-[#687385] p-3 text-center">
                  No language files configured. Click + LANG above.
                </div>
              ) : (
                tFiles.map((file, fIdx) => {
                  const matchedLang = LANGUAGES_SUPPORT.find(l => l.id === file.languageId);
                  const isFileActive = safeFileIdx === fIdx;
                  return (
                    <div key={file.fileName} className="space-y-1.5">
                      <div
                        className={`p-2 rounded flex items-center justify-between transition-colors ${
                          isFileActive
                            ? 'bg-emerald-500/12 text-emerald-200 border border-emerald-500/30'
                            : 'bg-[#090b0f] text-[#a0aab8] border border-[#262c36]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveFileIdx(fIdx);
                            setActivePageId(file.pages?.[0]?.id || '');
                          }}
                          className="flex-1 min-w-0 text-left cursor-pointer"
                        >
                          <span className="font-mono font-semibold text-[#eef2f7] block text-xs truncate">
                            {file.fileName}
                          </span>
                          <span className="text-[11px] text-[#687385] block truncate">
                            {matchedLang?.name || `Lang ${file.languageId}`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLanguageFile(fIdx)}
                          className="p-1 hover:text-rose-300 rounded transition-colors cursor-pointer text-[#687385] shrink-0"
                          title="Delete this Language translation file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="pl-2.5 border-l border-[#262c36] space-y-1">
                        {file.pages.map(page => {
                          const isPageActive = isFileActive && page.id === activePage?.id;
                          return (
                            <div
                              key={page.id}
                              className={`px-2 py-1 rounded flex items-center justify-between gap-1 transition-colors ${
                                isPageActive
                                  ? 'bg-blue-500/15 text-blue-200 border border-blue-500/30'
                                  : 'text-[#a0aab8] hover:text-white'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveFileIdx(fIdx);
                                  setActivePageId(page.id);
                                }}
                                className="flex-1 min-w-0 text-left cursor-pointer truncate text-[11px] font-mono"
                              >
                                Page {page.id} ({page.items.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveFileIdx(fIdx);
                                  void handleDeletePage(page.id);
                                }}
                                className="p-0.5 hover:text-rose-300 rounded text-[#687385] shrink-0 cursor-pointer"
                                title="Delete lookup Page"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="px-3 py-2 bg-[#090b0f] border-t border-[#262c36] text-[11px] font-mono text-[#687385] shrink-0">
            Lookup syntax: {'{page, ID}'}
          </div>
        </div>

        {/* Center Panel: Interactive String Table */}
        <div
          className={`${showXmlPreview ? 'hidden min-[1440px]:flex' : 'flex'} flex-1 min-w-0 flex-col bg-[#0c0e12] overflow-hidden`}
        >
          {/* Search & Page Actions Toolbar (wraps cleanly, zero crushed search!) */}
          <div className="border-b border-[#262c36] bg-[#11141a] px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#687385]" />
              <input
                type="text"
                data-testid="tfile-search-input"
                placeholder="Search translations key ID or text..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[#090b0f] border border-[#262c36] text-xs placeholder-[#687385] focus:outline-none focus:border-blue-500 text-[#eef2f7]"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-[#a0aab8]">
                Page ID: <strong className="text-[#eef2f7] font-mono">{activePage?.id || 'None'}</strong>
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                disabled={!activePage}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer border ${
                  activePage
                    ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-500/35'
                    : 'bg-[#171b23] border-[#262c36] text-[#687385] cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Record Tag</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto w-full custom-scrollbar">
            {!activePage ? (
              <EmptyState
                icon={<Languages className="w-5 h-5" />}
                title="No translation page selected"
                description="Select or create a language file and page in the sidebar to edit localized string records."
              />
            ) : filteredItems.length === 0 ? (
              <EmptyState
                icon={<Search className="w-5 h-5" />}
                title={searchQuery ? 'No matching strings' : 'This translation page is empty'}
                description={
                  searchQuery
                    ? 'No translation key IDs, values, or notes matched your filter.'
                    : 'Click "Add Record Tag" above to create your first localized string.'
                }
              />
            ) : (
              <table className="w-full text-left border-collapse select-text">
                <thead>
                  <tr className="bg-[#11141a] text-[11px] text-[#a0aab8] border-b border-[#262c36]">
                    <th className="py-2.5 px-3 w-[108px] font-semibold">Key ID</th>
                    <th className="py-2.5 px-3 min-w-[180px] font-semibold">Translation Text</th>
                    <th className="py-2.5 px-3 w-[200px] font-semibold">Developer Note</th>
                    <th className="py-2.5 px-3 w-[56px] text-center font-semibold">Del</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-white/[0.06]">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-[#141820] transition-colors group">
                      <td className="p-2.5 align-top">
                        <input
                          type="text"
                          data-testid={`tfile-item-id-${item.id}`}
                          value={item.id}
                          onChange={e => handleEditItemCell(item.id, 'id', e.target.value)}
                          className="w-full bg-[#090b0f] border border-[#262c36] focus:border-blue-500 text-blue-300 font-mono text-xs px-2 py-1.5 rounded focus:outline-none"
                        />
                      </td>
                      <td className="p-2.5 align-top">
                        <textarea
                          rows={1}
                          data-testid={`tfile-item-value-${item.id}`}
                          value={item.value}
                          onChange={e => handleEditItemCell(item.id, 'value', e.target.value)}
                          className="w-full bg-[#090b0f] border border-[#262c36] focus:border-blue-500 text-[#eef2f7] text-xs px-2 py-1.5 rounded focus:outline-none resize-y"
                        />
                      </td>
                      <td className="p-2.5 align-top">
                        <input
                          type="text"
                          value={item.description || ''}
                          placeholder="Developer note..."
                          onChange={e => handleEditItemCell(item.id, 'description', e.target.value)}
                          className="w-full bg-[#090b0f] border border-[#262c36] focus:border-blue-500 text-[#a0aab8] text-xs px-2 py-1.5 rounded focus:outline-none"
                        />
                      </td>
                      <td className="p-2.5 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 rounded hover:bg-rose-500/15 text-[#687385] hover:text-rose-300 transition-colors cursor-pointer"
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

        {/* Right Side: Escaped Compiled XML Preview (side-by-side >=1440px, toggled <1440px) */}
        <div
          data-testid="tfile-xml-preview"
          className={`${showXmlPreview ? 'flex flex-1 min-w-0' : 'hidden'} min-[1440px]:flex min-[1440px]:flex-none min-[1440px]:w-[360px] shrink-0 border-l border-[#262c36] bg-[#11141a] flex-col overflow-hidden`}
        >
          <div className="px-3 py-2 border-b border-[#262c36] bg-[#141820] flex items-center justify-between gap-2 shrink-0 text-xs">
            <span className="text-[#eef2f7] font-semibold flex items-center gap-1.5 truncate">
              <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="truncate">{activeFile?.fileName || 'Compiled T-File XML'}</span>
            </span>
            <button
              type="button"
              onClick={handleCopyToClipboard}
              className="px-2.5 py-1 rounded border border-[#262c36] bg-[#171b23] hover:text-white text-[#a0aab8] flex items-center gap-1 cursor-pointer text-[11px] shrink-0"
              title="Copy translation XML string"
            >
              {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCode ? 'Copied' : 'Copy XML'}</span>
            </button>
          </div>

          <div className="flex-1 overflow-auto p-3 text-xs bg-[#090b0f] font-mono select-text whitespace-pre-wrap break-words leading-relaxed custom-scrollbar">
            <code className="text-cyan-300">{activeXMLOutput}</code>
          </div>

          <div className="p-3 bg-[#141820] border-t border-[#262c36] text-[11px] text-[#a0aab8] shrink-0 space-y-1 leading-snug">
            <span className="font-semibold text-[#eef2f7] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Safe XML Entity Escaping
            </span>
            <p>
              Translation text is compiled through <code className="font-mono">compileTFileXML</code> so characters like <code className="font-mono">&amp;</code>, <code className="font-mono">&lt;</code>,
              and <code className="font-mono">&gt;</code> never break X4 loading.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
