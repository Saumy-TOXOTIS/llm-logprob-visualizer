'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useChatStore } from '@/store/chatStore';
import { Plus, MessageSquare, Trash2, Settings } from 'lucide-react';
import { generateId } from '@/lib/utils';
import { useState } from 'react';
import { SettingsModal } from './SettingsModal';

export function Sidebar() {
  const conversations = useLiveQuery(() => db.conversations.orderBy('updatedAt').reverse().toArray());
  const { activeConversationId, setActiveConversation, globalSettings } = useChatStore();
  const [showSettings, setShowSettings] = useState(false);

  const createChat = async () => {
    const id = generateId();
    await db.conversations.add({
      id,
      title: 'New Conversation',
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      systemPrompt: globalSettings.systemPrompt,
      settings: { ...globalSettings },
      messages: []
    });
    setActiveConversation(id);
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await db.conversations.delete(id);
    if (activeConversationId === id) {
      setActiveConversation(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent relative">
      {/* Header */}
      <div className="p-4 border-b border-stone-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-stone-700">Conversations</h2>
          <p className="text-[11px] text-stone-500 mt-0.5">decision traces</p>
        </div>
        <button
          onClick={createChat}
          title="New conversation"
          className="ripple-button p-3 bg-[#d97757] hover:bg-[#c96442] rounded-2xl transition border border-[#b85c38]/20 shadow-sm text-white"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations?.map((conv) => (
          <div
            key={conv.id}
            onClick={() => setActiveConversation(conv.id)}
            className={`group cursor-pointer p-3 rounded-2xl border transition-all duration-200 flex items-center justify-between ${
              activeConversationId === conv.id 
                ? 'bg-white/80 border-stone-200 text-stone-950 shadow-sm translate-x-1' 
                : 'border-transparent hover:bg-white/55 hover:border-stone-200 text-stone-600 hover:text-stone-950'
            }`}
          >
            <div className="flex items-center gap-3 truncate">
              <MessageSquare className="w-4 h-4 shrink-0 opacity-50" />
              <span className="truncate text-sm font-medium">{conv.title}</span>
            </div>
            <button 
              onClick={(e) => deleteChat(conv.id, e)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Settings Action */}
      <div className="p-4 border-t border-stone-200">
        <button 
          onClick={() => setShowSettings(true)}
          title="Lab settings"
          className="ripple-button w-full py-2.5 px-3 flex items-center justify-center gap-2 rounded-2xl bg-white/65 hover:bg-white transition border border-stone-200 text-sm cursor-pointer text-stone-700"
        >
          <Settings className="w-4 h-4 text-stone-500" />
          <span className="text-xs uppercase tracking-[0.16em] font-bold">Lab</span>
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
