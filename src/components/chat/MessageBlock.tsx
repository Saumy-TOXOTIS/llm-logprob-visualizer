'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface MessageBlockProps {
  content: string;
}

export function MessageBlock({ content }: MessageBlockProps) {
  return (
    <div className="markdown-prose prose-sm md:prose-base 
                    prose-headings:font-semibold prose-headings:text-stone-900 prose-headings:mt-6 prose-headings:mb-3
                    prose-p:text-stone-800 prose-p:leading-relaxed prose-p:my-3
                    prose-a:text-[#8f3d20] hover:prose-a:text-[#6f2f18] prose-a:no-underline hover:prose-a:underline
                    prose-strong:text-stone-900 prose-strong:font-semibold 
                    prose-ul:list-disc prose-ul:pl-6 prose-ol:list-decimal prose-ol:pl-6 prose-li:my-1 prose-li:text-stone-800
                    prose-blockquote:border-l-4 prose-blockquote:border-[#b96b4e]/35 prose-blockquote:bg-[#b96b4e]/5 prose-blockquote:py-2 prose-blockquote:px-5 prose-blockquote:rounded-r-xl prose-blockquote:not-italic prose-blockquote:text-stone-700 prose-blockquote:my-4
                    break-word whitespace-pre-wrap 
                    prose-pre:bg-[#2b2926] prose-pre:border prose-pre:border-stone-300 prose-pre:overflow-x-auto prose-pre:whitespace-pre prose-pre:shadow-md prose-pre:rounded-xl prose-pre:my-6
                    prose-code:font-mono prose-code:before:content-none prose-code:after:content-none"
         style={{ maxHeight: 'none', overflowY: 'auto', display: 'block', wordBreak: 'break-word', width: '100%' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : 'text';
            const codeString = String(children).replace(/\n$/, '');

            if (!inline) {
               return <CodeBlockRenderer language={language} codeString={codeString} className={className} props={props}>{children}</CodeBlockRenderer>;
            }
            
            return (
              <code className="bg-[#b96b4e]/8 text-[#8f3d20] px-1.5 py-0.5 rounded-md text-[13px] border border-[#b96b4e]/18" {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlockRenderer({ language, codeString, className, props, children }: any) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(codeString);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-xl overflow-hidden mb-4 border border-stone-300">
      <div className="flex items-center justify-between px-4 py-1.5 bg-stone-100 border-b border-stone-300">
        <span className="text-xs font-mono text-stone-500">{language}</span>
        <button 
           onClick={handleCopy}
           className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 transition-colors bg-white hover:bg-stone-50 px-2 py-1 rounded-md border border-stone-200"
        >
           {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
           <span>{isCopied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <div className="relative">
        <code className={`${className} block p-4 text-sm overflow-x-auto`} {...props}>
          {children}
        </code>
      </div>
    </div>
  );
}
