import { Fragment } from 'react';
import {
  parseInlineMarkdown,
  parseMarkdownBlocks,
  type InlineToken,
} from './docsRenderer';

function renderInlineTokens(tokens: InlineToken[], prefix: string) {
  return tokens.map((tok, idx) => {
    const key = `${prefix}-${idx}`;
    if (tok.kind === 'code') {
      return (
        <code
          key={key}
          className="rounded border border-[#262c36] bg-[#0a0c10] px-1.5 py-0.5 font-mono text-[11px] text-[#93c5fd]"
        >
          {tok.text}
        </code>
      );
    }
    if (tok.kind === 'strong') {
      return (
        <strong key={key} className="font-semibold text-[#eef2f7]">
          {renderInlineTokens(tok.children, key)}
        </strong>
      );
    }
    if (tok.kind === 'em') {
      return (
        <em key={key} className="italic text-[#e2e8f0]">
          {tok.text}
        </em>
      );
    }
    return <Fragment key={key}>{tok.text}</Fragment>;
  });
}

export interface DocsMarkdownProps {
  content: string;
}

/** Readable Concept A renderer for structured guide Markdown (headings, bullets, numbered steps, inline code). */
export default function DocsMarkdown({ content }: DocsMarkdownProps) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="space-y-3 text-xs leading-relaxed text-[#cbd5e1] select-text">
      {blocks.map((block, idx) => {
        if (block.kind === 'heading') {
          return (
            <h4 key={idx} className="pt-2 text-[13px] font-semibold text-[#eef2f7] tracking-tight">
              {renderInlineTokens(parseInlineMarkdown(block.text), `h-${idx}`)}
            </h4>
          );
        }
        if (block.kind === 'ul') {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1.5">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInlineTokens(parseInlineMarkdown(item), `ul-${idx}-${itemIdx}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'ol') {
          return (
            <ol key={idx} className="list-decimal pl-5 space-y-1.5">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInlineTokens(parseInlineMarkdown(item), `ol-${idx}-${itemIdx}`)}</li>
              ))}
            </ol>
          );
        }
        return <p key={idx}>{renderInlineTokens(parseInlineMarkdown(block.text), `p-${idx}`)}</p>;
      })}
    </div>
  );
}
