import { useChatStore } from '@/store/chatStore';
import { PromptComposer } from './PromptComposer';
import { MessageList } from './MessageList';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { sendMessageToLmStudio } from '@/lib/lmstudio/api';
import { generateId } from '@/lib/utils';
import { Message, MessageVariant, ContentPart, ImageAttachment } from '@/types';
import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

export function ChatPanel() {
  const { activeConversationId, globalSettings, setInspectedMessage } = useChatStore();
  const conversation = useLiveQuery(() => 
    activeConversationId ? db.conversations.get(activeConversationId) : undefined,
    [activeConversationId]
  );
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!activeConversationId || !conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent text-zinc-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(201,100,66,0.10),transparent_42%)]" />
        <div className="relative premium-card p-8 text-center max-w-sm">
          <p className="text-stone-900 font-semibold">Start exploring how the model thinks...</p>
          <p className="text-sm text-stone-500 mt-2">Create or select a conversation to begin capturing token-level decisions.</p>
        </div>
      </div>
    );
  }

  const handleSend = async (content: string, images?: ImageAttachment[]) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError(null);

    const userMessageId = generateId();
    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content,
      images: images || undefined,
      createdAt: Date.now(),
      status: 'complete'
    };

    const newConversation = {
      ...conversation,
      messages: [...conversation.messages, userMessage],
      updatedAt: Date.now()
    };

    if (newConversation.messages.length === 1 && newConversation.title === 'New Conversation') {
      newConversation.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
    }

    await db.conversations.put(newConversation);

    try {
      const assistantMessageId = generateId();
      let assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        status: 'generating',
        variants: [],
        activeVariantId: '', 
      };

      await db.conversations.update(activeConversationId, {
        messages: [...newConversation.messages, assistantMessage],
        updatedAt: Date.now()
      });

      const sampleCount = conversation.settings.sampleCount || 1;
      const concurrency = 2;
      let completedCount = 0;
      let tasks = Array.from({ length: sampleCount }, (_, i) => i);
      let capturedSentContent = content;
      let capturedSettingsUsed = conversation.settings;

      const runTask = async () => {
         while (tasks.length > 0) {
            const taskIdx = tasks.shift();
            if (taskIdx === undefined) break;

            try {
               const {
                 rawResponse,
                 parsedOutput,
                 stats,
                 reasoningStats,
                 settingsUsed,
                 sentContent,
                 requestPayload
               } = await sendMessageToLmStudio(newConversation, content, conversation.settings);
               
               capturedSentContent = sentContent;
               capturedSettingsUsed = settingsUsed;

               const finalVariant = {
                 id: generateId(),
                 content: parsedOutput.finalText || parsedOutput.reasoningText || '',
                 finalText: parsedOutput.finalText,
                 reasoningText: parsedOutput.reasoningText,
                 rawResponse: rawResponse,
                 parsedLogprobs: parsedOutput.finalTokens,
                 parsed: parsedOutput,
                 stats: stats,
                 reasoningStats: reasoningStats,
                 createdAt: Date.now(),
                 settingsUsed: settingsUsed,
                 requestPayload: requestPayload,
                 contentParts: [] as any[]
               };
               
               if (parsedOutput.finishReason === 'length') {
                  finalVariant.contentParts.push({
                     id: generateId(),
                     finalText: parsedOutput.finalText,
                     reasoningText: parsedOutput.reasoningText,
                     parsed: parsedOutput,
                     createdAt: Date.now(),
                     finishReason: 'length'
                  });
               }
               
               // Transactional update to avoid race conditions
               await db.transaction('rw', db.conversations, async () => {
                  const dbConv = await db.conversations.get(activeConversationId);
                  if (!dbConv) return;
                  
                  const msgs = dbConv.messages.map(m => {
                     if (m.id === assistantMessageId) {
                        const newVariants = [...(m.variants || []), finalVariant];
                        return {
                           ...m,
                           variants: newVariants,
                           activeVariantId: newVariants[0].id,
                           content: newVariants[0].content, // display the first generated one by default
                           status: completedCount + 1 >= sampleCount ? 'complete' : 'generating'
                        } as Message;
                     }
                     if (m.id === userMessageId) {
                        return { ...m, sentContent: capturedSentContent, settingsUsed: capturedSettingsUsed };
                     }
                     return m;
                  });
                  await db.conversations.put({ ...dbConv, messages: msgs, updatedAt: Date.now() });
               });
               completedCount++;

               if (completedCount === 1) {
                  setInspectedMessage(assistantMessageId, parsedOutput.hasFinalText ? 'final' : 'reasoning');
               }
            } catch (err) {
               console.error("Sampling error on task", taskIdx, err);
               completedCount++; 
            }
         }
      };

      const workers = Array.from({ length: Math.min(sampleCount, concurrency) }, () => runTask());
      await Promise.all(workers);

      // Final status check ensuring we flip to complete if error threw early
      const finalDbConv = await db.conversations.get(activeConversationId);
      if (finalDbConv) {
          const msgs = finalDbConv.messages.map(m => m.id === assistantMessageId ? { ...m, status: 'complete' } as Message : m);
          await db.conversations.update(activeConversationId, { messages: msgs });
      }

    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to generate response.');
      
      const errorMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: 'I encountered an error connecting to the local LLM proxy.',
        createdAt: Date.now(),
        status: 'error'
      };
      await db.conversations.update(activeConversationId, {
        messages: [...newConversation.messages, errorMsg],
        updatedAt: Date.now()
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleContinue = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      const lastAsstMsg = conversation.messages[conversation.messages.length - 1];
      const activeVariant = lastAsstMsg.variants?.find((v: MessageVariant) => v.id === lastAsstMsg.activeVariantId) || lastAsstMsg.variants?.[0];
      const parsedLast = activeVariant?.parsed;

      let prompt = 'Continue exactly from where your previous answer stopped. Do not repeat earlier text.';
      
      if (parsedLast?.reasoningText && !parsedLast?.hasFinalText) {
          // If thinking was generated but missing final answer / missing marker close
          prompt = 'Using the reasoning above, provide only the final answer. Do not repeat reasoning. First close the reasoning block if needed.';
      }

      const settings = useChatStore.getState().globalSettings;

      const {
        rawResponse,
        parsedOutput,
        stats,
        reasoningStats
      } = await sendMessageToLmStudio(conversation, prompt, settings);

      if (!lastAsstMsg.variants || !activeVariant) return;

      const part: ContentPart = {
        id: crypto.randomUUID(),
        finalText: parsedOutput.finalText,
        reasoningText: parsedOutput.reasoningText,
        rawResponse,
        parsedLogprobs: parsedOutput.finalTokens,
        parsed: parsedOutput,
        stats,
        reasoningStats,
        createdAt: Date.now(),
        finishReason: parsedOutput.finishReason
      };

      const updatedVariant: MessageVariant = {
        ...activeVariant,
        content: activeVariant.content + (parsedOutput.finalText || ''),
        finalText: (activeVariant.finalText || '') + (parsedOutput.finalText || ''),
        reasoningText: (activeVariant.reasoningText || '') + (parsedOutput.reasoningText || ''),
        contentParts: [...(activeVariant.contentParts || []), part],
        parsedLogprobs: [...(activeVariant.parsedLogprobs || []), ...parsedOutput.finalTokens]
      };

      const newVariants = lastAsstMsg.variants.map((v: MessageVariant) => v.id === activeVariant.id ? updatedVariant : v);
      const updatedMessages = [...conversation.messages];
      updatedMessages[updatedMessages.length - 1] = {
        ...lastAsstMsg,
        content: updatedVariant.content,
        variants: newVariants
      };

      await db.conversations.update(activeConversationId, {
        messages: updatedMessages,
        updatedAt: Date.now()
      });

    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to continue sequence.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-transparent relative h-full min-h-0 overflow-hidden">
      <MessageList messages={conversation.messages} isGenerating={isGenerating} onContinue={handleContinue} />
      
      {error && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm shadow-lg backdrop-blur-md z-50">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="shrink-0">
        <PromptComposer onSend={handleSend} isGenerating={isGenerating} />
      </div>
    </div>
  );
}
