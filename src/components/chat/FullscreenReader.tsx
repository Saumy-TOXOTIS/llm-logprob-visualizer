'use client';

import { useChatStore } from '@/store/chatStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { X, Copy, Download } from 'lucide-react';
import { MessageBlock } from './MessageBlock';
import { useEffect } from 'react';

export function FullscreenReader() {
  const { isFullscreenReader, toggleFullscreenReader, inspectedMessageId, activeConversationId } = useChatStore();

  const conversation = useLiveQuery(() => 
    activeConversationId ? db.conversations.get(activeConversationId) : undefined,
    [activeConversationId]
  );

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreenReader) {
        toggleFullscreenReader();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFullscreenReader, toggleFullscreenReader]);

  if (!isFullscreenReader || !inspectedMessageId || !conversation) return null;

  const message = conversation.messages.find(m => m.id === inspectedMessageId);
  if (!message) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
  };

  const handleExport = () => {
    const blob = new Blob([message.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response_${message.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-3xl flex flex-col pt-10">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button 
          onClick={handleCopy}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-400 transition"
          title="Copy Markdown"
        >
          <Copy className="w-5 h-5" />
        </button>
        <button 
          onClick={handleExport}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-400 transition"
          title="Export Markdown"
        >
          <Download className="w-5 h-5" />
        </button>
        <button 
          onClick={toggleFullscreenReader}
          className="p-2 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-lg text-red-400 transition"
          title="Close Reader (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-32 flex justify-center">
        <div className="w-full max-w-4xl pt-8">
          <MessageBlock content={message.content} />
        </div>
      </div>
    </div>
  );
}
