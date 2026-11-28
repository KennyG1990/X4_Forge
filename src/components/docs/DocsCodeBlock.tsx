import { useState, type ReactNode } from 'react';
import { Check, Code, Copy } from 'lucide-react';
import { tokenizeCode, type CodeTokenKind } from './docsRenderer';

const TOKEN_CLASSES: Record<CodeTokenKind, string> = {
  comment: 'text-[#687385] italic',
  tag: 'text-[#93c5fd]',
  attr: 'text-amber-300',
  string: 'text-emerald-300',
  keyword: 'text-violet-300 font-medium',
  number: 'text-sky-300',
  placeholder: 'text-amber-200 bg-amber-500/15 rounded px-0.5',
  text: 'text-[#cbd5e1]',
};

export interface DocsCodeBlockProps {
  code: string;
  lang: 'xml' | 'lua';
  label: string;
  extraActions?: ReactNode;
  copyTestId?: string;
}

/** Concept A syntax-highlighted XML/Lua code preview block with clipboard copy. */
export default function DocsCodeBlock({
  code,
  lang,
  label,
  extraActions,
  copyTestId,
}: DocsCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const tokens = tokenizeCode(code, lang);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-[#262c36] bg-[#0a0c10] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#262c36] bg-[#11141a] px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#a0aab8]">
          <Code className="w-3.5 h-3.5 text-[#93c5fd]" />
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          {extraActions}
          <button
            type="button"
            data-testid={copyTestId}
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-md border border-[#262c36] bg-[#0c0e12] hover:border-[#3b82f6]/50 px-2.5 py-1 text-[11px] font-medium text-[#cbd5e1] hover:text-[#eef2f7] transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="p-3.5 text-xs font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto select-text text-[#cbd5e1]">
        <code>
          {tokens.map((tok, idx) => (
            <span key={idx} className={TOKEN_CLASSES[tok.kind]}>
              {tok.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
