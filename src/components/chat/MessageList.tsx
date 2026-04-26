'use client';

import { Message, ImageAttachment } from '@/types';
import { Bot, User, Activity, ArrowDown, AlertTriangle, FastForward, Copy, Microscope, ChevronRight, ChevronDown, BrainCircuit, Clipboard, GitCompareArrows, Sparkles, Infinity } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useEffect, useRef, useState } from 'react';
import { MessageBlock } from './MessageBlock';
import { ImageLightbox } from './ImageLightbox';
import { formatFileSize } from '@/lib/imageUtils';
import { Maximize2 } from 'lucide-react';
import { estimateTokenCount } from '@/lib/utils';

interface MessageListProps {
  messages: Message[];
  isGenerating?: boolean;
  onContinue?: () => void;
}

const ThinkingBlock = ({ reasoningText, initialCollapse, showTags }: { reasoningText: string, initialCollapse: boolean, showTags: boolean }) => {
  const [isOpen, setIsOpen] = useState(!initialCollapse);
  
  // Conditionally strip tags for visual cleanliness while leaving them in debug outputs
  let displayText = reasoningText;
  if (!showTags) {
     displayText = displayText.replace(/<\/?(?:\|)?(?:think|channel|thought|thinking|reasoning)(?:\|)?>/gi, '').trim();
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(displayText);
  };

  return (
    <div className="mb-6 rounded-2xl border border-zinc-700/50 bg-zinc-900/40 flex flex-col group overflow-hidden shadow-sm">
       <button 
         onClick={() => setIsOpen(!isOpen)}
         className="w-full px-5 py-3 flex items-center justify-between text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition bg-zinc-900/80"
       >
         <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition-colors" />
            <span className="tracking-widest uppercase">{isOpen ? 'Hide Reasoning' : 'Show Reasoning Trace'}</span>
         </div>
         {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
       </button>
       {isOpen && (
         <div className="p-5 border-t border-zinc-800/60 flex flex-col relative text-[13px] bg-[#0d1117] text-zinc-300">
           <div className="mb-4 text-[10px] uppercase tracking-widest text-zinc-500 flex justify-between border-b border-zinc-800/60 pb-2">
              <span>Model-exposed thought process</span>
              <div className="flex items-center gap-3">
                 <button onClick={handleCopy} className="flex items-center gap-1.5 hover:text-white transition group/btn">
                    <Copy className="w-3 h-3 group-hover/btn:text-amber-400"/> Copy Raw
                 </button>
              </div>
           </div>
           
           <div className="opacity-90 leading-relaxed font-sans">
              <MessageBlock content={displayText} />
           </div>
         </div>
       )}
    </div>
  );
};

// Helper to truncate base64 in request payloads for display
function truncateBase64InObj(obj: any): any {
  if (typeof obj === 'string') {
    // If it looks like a data URL or long base64 string, truncate it
    if (obj.startsWith('data:') && obj.length > 100) {
      return obj.substring(0, 60) + '...[TRUNCATED ' + formatFileSize(Math.round((obj.length * 3) / 4)) + ']';
    }
    if (obj.length > 500 && /^[A-Za-z0-9+/=]+$/.test(obj.substring(0, 100))) {
      return obj.substring(0, 50) + '...[TRUNCATED BASE64]';
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(truncateBase64InObj);
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = truncateBase64InObj(obj[key]);
    }
    return result;
  }
  return obj;
}

const DebugDrawer = ({ variant, message }: { variant: any, message: Message }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!variant || !variant.parsed) return null;

  const hasImages = message.images && message.images.length > 0;
  const debugData = {
    endpointTrace: {
      baseUrl: variant.settingsUsed?.baseUrl,
      endpointPath: variant.settingsUsed?.endpointPath,
      targetUrl: (variant.settingsUsed?.baseUrl || '') + (variant.settingsUsed?.endpointPath || ''),
      modelTargeted: variant.settingsUsed?.model
    },
    ...(hasImages ? {
      imageInput: {
        imagesAttached: message.images!.length,
        imageMimeTypes: message.images!.map(i => i.mimeType),
        imageSizes: message.images!.map(i => i.size),
        imageDimensions: message.images!.map(i => `${i.width}×${i.height}`),
        multimodalMode: true
      }
    } : {}),
    requestPayload: truncateBase64InObj(variant.requestPayload || "Legacy (Not Captured)"),
    warnings: variant.parsed.warnings,
    thinkingSource: variant.parsed.thinkingSource,
    closingMarkerFound: variant.parsed.closingMarkerFound,
    closingMarkerUsed: variant.parsed.closingMarkerUsed,
    closingMarkerIndex: variant.parsed.closingMarkerIndex,
    sentUserText: message.sentContent,
    rawTypesFound: variant.parsed.rawOutputTypes,
    thinkingTextLength: variant.reasoningText?.length || 0,
    finalTextLength: variant.finalText?.length || 0,
    finalTokensCount: variant.parsed.finalTokens?.length || 0,
    reasoningTokensCount: variant.parsed.reasoningTokens?.length || 0,
  };

  const handleCopyFull = () => {
    // Copy full untruncated JSON
    const full = {
      ...debugData,
      requestPayload: variant.requestPayload || "Legacy (Not Captured)"
    };
    navigator.clipboard.writeText(JSON.stringify(full, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4 rounded-xl border border-zinc-700/50 bg-black/40 text-xs text-left">
       <button onClick={() => setIsOpen(!isOpen)} className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition rounded-xl">
         <span>View Debug Trace {hasImages ? `(📎 ${message.images!.length} image${message.images!.length > 1 ? 's' : ''})` : ''}</span>
       </button>
       {isOpen && (
         <div className="p-3 border-t border-zinc-700/50 overflow-auto max-h-[400px]">
            <div className="flex justify-end mb-2">
              <button 
                onClick={handleCopyFull}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition"
              >
                <Clipboard className="w-3 h-3" />
                {copied ? 'Copied!' : 'Copy Full Request JSON'}
              </button>
            </div>
            <pre className="text-[10px] text-zinc-400 font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(debugData, null, 2)}
            </pre>
         </div>
       )}
    </div>
  );
};

const ImageGallery = ({ images }: { images: ImageAttachment[] }) => {
  const [lightboxImage, setLightboxImage] = useState<ImageAttachment | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {images.map(img => (
          <button
            key={img.id}
            onClick={() => setLightboxImage(img)}
            className="group relative rounded-lg overflow-hidden border border-blue-500/20 hover:border-blue-400/50 transition shadow-sm"
          >
            <img
              src={img.dataUrl}
              alt={img.name}
              className="w-[120px] h-[90px] object-cover group-hover:scale-105 transition-transform duration-200"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
              <span className="text-[9px] text-white/90 truncate w-full">{img.name}</span>
            </div>
          </button>
        ))}
      </div>
      {lightboxImage && (
        <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </>
  );
};

export function MessageList({ messages, isGenerating, onContinue }: MessageListProps) {
  const { setInspectedMessage, inspectedMessageId, toggleFullscreenReader, setSelectedPhase, globalSettings, openAnswerSpace } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, isGenerating, isAtBottom]);

  return (
    <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
      <div 
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex-1 overflow-y-auto p-4 scroll-smooth"
      >
        <div className="max-w-4xl mx-auto space-y-6 pb-4">
          {messages.filter(m => m.status !== 'generating').map((message) => {
            const isUser = message.role === 'user';
            const activeVariant = message.variants?.find(v => v.id === message.activeVariantId) || message.variants?.[0];
            const finalTokenCount = activeVariant?.parsed?.finalTokens?.length || activeVariant?.parsedLogprobs?.length || 0;
            const reasoningTokenCount = activeVariant?.parsed?.reasoningTokens?.length || 0;
            const totalTokens = finalTokenCount + reasoningTokenCount;
            const avgEntropy = activeVariant?.stats?.averageEntropy ?? activeVariant?.parsed?.finalTokens?.[0]?.entropy ?? 0;
            const confidence = activeVariant?.stats ? `${(activeVariant.stats.averageConfidence * 100).toFixed(1)}%` : 'n/a';
            const userTokenEstimate = isUser ? estimateTokenCount(message.content) : 0;
            
            return (
              <div 
                key={message.id} 
                className={`flex gap-4 max-w-4xl mx-auto w-full ${isUser ? 'flex-row-reverse' : ''}`}
              >
                <div className="shrink-0 flex items-start mt-2">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm ${
                    isUser 
                      ? 'bg-[#f1e5d5] border-stone-200 text-[#9a3412]' 
                      : message.status === 'error'
                        ? 'bg-red-500/10 border-red-500/30 text-red-500'
                        : 'bg-[#f1e5d5] border-stone-200 text-[#9a3412]'
                  }`}>
                    {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>
                </div>
                <div className={`flex-1 max-w-full lg:max-w-[88%] ${isUser ? 'text-right' : ''}`}>
                  <div className={`inline-block p-4 rounded-2xl text-sm leading-relaxed text-left w-full ${
                    isUser 
                      ? 'bg-[#fffaf2] border border-stone-200 text-stone-900 rounded-tr-none w-auto shadow-[0_12px_32px_rgba(69,52,32,0.07)]' 
                      : 'bg-transparent p-0'
                  }`}>
                    {isUser ? (
                      <>
                        <div className="whitespace-pre-wrap break-words">{message.content}</div>
                        {/* Image gallery for user messages */}
                        {message.images && message.images.length > 0 && (
                          <ImageGallery images={message.images} />
                        )}
                        <div className="mt-4 pt-3 border-t border-stone-200 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                          <span
                            title="Estimated input tokens"
                            className="px-2.5 py-1 rounded-full bg-[#f1e5d5] border border-stone-200 text-stone-700 font-mono"
                          >
                            {userTokenEstimate} tokens
                          </span>
                          <span className="px-2.5 py-1 rounded-full bg-white border border-stone-200 text-stone-500 font-mono">
                            input
                          </span>
                          {message.images && message.images.length > 0 && (
                            <span className="px-2.5 py-1 rounded-full bg-indigo-400/10 border border-indigo-400/15 font-mono">
                              {message.images.length} image{message.images.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </>
                    ) : message.status === 'error' ? (
                      <div className="text-red-400/90 text-sm whitespace-pre-wrap font-mono p-2">
                        {message.content}
                      </div>
                    ) : (
                      <div className="premium-card neural-border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#d97757]/25 hover:shadow-[0_18px_48px_rgba(69,52,32,0.10)] animate-in-soft">
                        <div className="flex items-center justify-between gap-3 pb-4 mb-5 border-b border-stone-200">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-[#f1e5d5] border border-stone-200 flex items-center justify-center">
                              <Sparkles className="w-4 h-4 text-[#9a3412]" />
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-stone-500 font-bold">AI Response</div>
                              <div className="text-[11px] text-stone-500">
                                {message.variants?.length || 1} sample{(message.variants?.length || 1) > 1 ? 's' : ''} captured
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => {
                                setInspectedMessage(message.id);
                                setSelectedPhase('final');
                              }}
                              className={`ripple-button flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition text-xs ${
                                inspectedMessageId === message.id
                                  ? 'border-[#d97757]/40 bg-[#d97757]/10 text-[#9a3412]'
                                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                              }`}
                            >
                              <Activity className="w-3.5 h-3.5" />
                              Logprobs
                            </button>
                            <button
                              onClick={() => {
                                setInspectedMessage(message.id, activeVariant?.parsed?.hasFinalText ? 'final' : 'reasoning');
                                openAnswerSpace();
                              }}
                              className="ripple-button flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 transition text-xs"
                            >
                              <Microscope className="w-3.5 h-3.5" />
                              Explore
                            </button>
                            <button
                              onClick={() => {
                                setInspectedMessage(message.id, activeVariant?.parsed?.hasFinalText ? 'final' : 'reasoning');
                                openAnswerSpace();
                              }}
                              className="ripple-button flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 transition text-xs"
                            >
                              <GitCompareArrows className="w-3.5 h-3.5" />
                              Compare
                            </button>
                            <button
                              onClick={() => {
                                setInspectedMessage(message.id, activeVariant?.parsed?.hasFinalText ? 'final' : 'reasoning');
                                openAnswerSpace();
                              }}
                              className="ripple-button flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#d97757]/25 bg-[#d97757]/10 hover:bg-[#d97757]/15 text-[#9a3412] transition text-xs"
                              title="Open llama.cpp full vocabulary explorer"
                            >
                              <Infinity className="w-3.5 h-3.5" />
                              Universe
                            </button>
                            <button
                              onClick={() => {
                                setInspectedMessage(message.id);
                                toggleFullscreenReader();
                              }}
                              title="Open reader"
                              className="ripple-button p-1.5 rounded-full border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 transition"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {activeVariant?.reasoningText && (
                           <ThinkingBlock reasoningText={activeVariant.reasoningText} initialCollapse={globalSettings.autoCollapseThinking} showTags={globalSettings.showThinkingTagsInChat} />
                        )}
                        {activeVariant?.finalText ? (
                           <MessageBlock content={activeVariant.finalText} />
                        ) : !isGenerating && !activeVariant?.finalText ? (
                           <div className="text-amber-400/80 italic text-sm py-2">No final output answer generated.</div>
                        ) : null}
                        
                        {activeVariant && <DebugDrawer variant={activeVariant} message={message} />}

                        {activeVariant && (
                          <div className="mt-5 pt-4 border-t border-stone-200 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                            <span className="px-2.5 py-1 rounded-full bg-[#f1e5d5] border border-stone-200 text-stone-700 font-mono">{totalTokens} tokens</span>
                            <span className="px-2.5 py-1 rounded-full bg-white border border-stone-200 font-mono">{message.variants?.length || 1} run{(message.variants?.length || 1) > 1 ? 's' : ''}</span>
                            <span className="px-2.5 py-1 rounded-full bg-white border border-stone-200 text-stone-700 font-mono">Confidence: {confidence}</span>
                            <span className="px-2.5 py-1 rounded-full bg-white border border-stone-200 text-stone-700 font-mono">Entropy: {avgEntropy.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Length Truncation Warning */}
                  {!isUser && message.variants && message.variants.length > 0 && message.variants[0].contentParts && message.variants[0].contentParts.length > 0 && 
                     message.variants[0].contentParts[message.variants[0].contentParts.length - 1].finishReason === 'length' && !isGenerating && (
                    <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-sm flex flex-col gap-2 relative">
                       <div className="flex items-center gap-2 font-medium tracking-wide">
                         <AlertTriangle className="w-4 h-4" />
                         <span>Token Generation Limit Hit (reason: length).</span>
                       </div>
                       <button 
                         onClick={onContinue}
                         className="flex items-center justify-center gap-2 px-3 py-2 mt-2 bg-amber-500 hover:bg-amber-400 border border-amber-500/40 rounded transition shadow text-black font-bold text-xs uppercase"
                       >
                         <FastForward className="w-4 h-4" />
                         Continue Generation exactly from context end
                       </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {isGenerating && (
            <div className="flex gap-4 max-w-4xl mx-auto w-full mb-16">
               <div className="shrink-0 flex items-start mt-2">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm bg-indigo-500/20 border-indigo-500/30 text-indigo-400">
                    <Bot className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="flex gap-1 items-center px-4 py-2 bg-transparent h-10 w-16">
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"></span>
                  </div>
                </div>
            </div>
          )}
        </div>
      </div>
      
      {!isAtBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 p-2 px-4 rounded-full bg-zinc-800/80 text-zinc-200 border border-zinc-600/50 shadow-lg backdrop-blur hover:bg-zinc-700/80 transition-all z-10 text-sm"
        >
          <ArrowDown className="w-4 h-4" />
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
