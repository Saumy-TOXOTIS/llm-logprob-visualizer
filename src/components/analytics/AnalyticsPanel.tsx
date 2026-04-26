'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useChatStore } from '@/store/chatStore';
import { TokenHeatmap } from './TokenHeatmap';
import { TokenInspector } from './TokenInspector';
import { UncertaintyDashboard } from './UncertaintyDashboard';
import { Activity, BrainCircuit, ChevronDown, DatabaseZap, GitBranch, Network, PlayCircle, Terminal, Infinity } from 'lucide-react';
import { ReplayPlayer } from './ReplayPlayer';
import { ReactNode, useEffect, useState } from 'react';

type IntelligenceSection = 'heatmap' | 'metrics' | 'branches' | 'answerSpace';

function CollapsibleSection({
  id,
  title,
  subtitle,
  icon: Icon,
  isOpen,
  onToggle,
  children,
}: {
  id: IntelligenceSection;
  title: string;
  subtitle?: string;
  icon: any;
  isOpen: boolean;
  onToggle: (id: IntelligenceSection) => void;
  children: ReactNode;
}) {
  return (
    <section className="premium-card overflow-hidden animate-in-soft">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-white/35 transition"
      >
        <div className="flex items-center gap-2.5 min-w-0 text-left">
          <div className="w-8 h-8 rounded-xl bg-[#efe4d4] border border-stone-200/90 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-[#8f3d20]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[11px] uppercase font-bold tracking-[0.17em] text-stone-800 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-stone-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-stone-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-3.5 pb-3.5 pt-1 border-t border-stone-200/70">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export function AnalyticsPanel() {
  const { inspectedMessageId, isDeveloperMode, toggleDeveloperMode, selectedPhase, setSelectedPhase, hoveredTokenIndex, lockedTokenIndex, openAnswerSpace } = useChatStore();
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [openSections, setOpenSections] = useState<Record<IntelligenceSection, boolean>>({
    heatmap: true,
    metrics: true,
    branches: true,
    answerSpace: false,
  });

  useEffect(() => {
    const stored = window.localStorage.getItem('logprob-intelligence-sections');
    if (stored) {
      try {
        setOpenSections(prev => ({ ...prev, ...JSON.parse(stored) }));
      } catch {
        // Keep defaults when local storage is malformed.
      }
    }
  }, []);

  const toggleSection = (id: IntelligenceSection) => {
    setOpenSections(prev => {
      const next = { ...prev, [id]: !prev[id] };
      window.localStorage.setItem('logprob-intelligence-sections', JSON.stringify(next));
      return next;
    });
  };

  const conversation = useLiveQuery(() => 
    inspectedMessageId ? db.conversations.filter(c => c.messages.some(m => m.id === inspectedMessageId)).first() : undefined,
    [inspectedMessageId]
  );
  
  const message = conversation?.messages.find((m: any) => m.id === inspectedMessageId);
  
  if (!inspectedMessageId || !message) {
    return (
      <div className="h-full flex flex-col bg-transparent">
        <div className="p-3.5 border-b border-stone-200/80">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] flex items-center gap-2 text-stone-700">
            <Activity className="w-3.5 h-3.5 text-[#8f3d20]" />
            Intelligence Panel
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(201,100,66,0.10),transparent_42%)]" />
          <div className="relative flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#efe4d4] border border-stone-200 flex items-center justify-center shadow-[0_12px_28px_rgba(69,52,32,0.06)]">
              <BrainCircuit className="w-7 h-7 text-[#8f3d20]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-stone-900">Start exploring how the model thinks...</h3>
              <p className="text-sm text-stone-500 max-w-xs mt-2">Select Logprobs on an AI response to reveal token confidence, entropy, discarded paths, and answer-space structure.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const variant = message.variants?.find(v => v.id === message.activeVariantId) || message.variants?.[0];
  if (!variant || !variant.parsed) {
    return (
      <div className="h-full flex flex-col bg-transparent">
        <div className="p-3.5 border-b border-stone-200/80">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] flex items-center gap-2 text-stone-700">
            <Activity className="w-3.5 h-3.5 text-[#8f3d20]" />
            Intelligence Panel
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-stone-500 bg-transparent p-8 text-center">
          <div className="premium-card p-8 max-w-sm">
            <Infinity className="w-7 h-7 mx-auto mb-3 text-[#8f3d20]" />
            <p className="text-sm text-stone-700">No normal logprobs are available, but llama.cpp Full Universe can still probe this response context.</p>
            <button
              onClick={openAnswerSpace}
              className="mt-4 w-full rounded-xl border border-[#b96b4e]/22 bg-[#b96b4e]/8 px-4 py-2 text-sm font-semibold text-[#8f3d20] hover:bg-[#b96b4e]/12 transition"
            >
              Open Full Universe
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeTokens = selectedPhase === 'final' ? (variant.parsed.finalTokens || []) : (variant.parsed.reasoningTokens || []);
  const activeStats = selectedPhase === 'final' ? variant.stats : variant.reasoningStats;
  const hasTextContext = selectedPhase === 'final' ? variant.parsed.hasFinalText : variant.parsed.hasReasoningText;

  const targetIndex = lockedTokenIndex !== null ? lockedTokenIndex : hoveredTokenIndex;
  const inspectedToken = targetIndex !== null && targetIndex < activeTokens.length ? activeTokens[targetIndex] : null;

  // Check if the user message that prompted this response had images
  const msgIndex = conversation?.messages.findIndex(m => m.id === inspectedMessageId) || 0;
  const userMsg = msgIndex > 0 ? conversation?.messages[msgIndex - 1] : null;
  const hasImageInput = userMsg?.images && userMsg.images.length > 0;

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="flex flex-col border-b border-stone-200/80 bg-[#fbf8f2]/62 p-3.5 shrink-0 pb-0 gap-3.5">
        <div className="flex items-center justify-between">
           <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] flex items-center gap-2 text-stone-700">
             <Activity className="w-3.5 h-3.5 text-[#8f3d20]" />
             Intelligence Panel
           </h2>
           <button 
             onClick={toggleDeveloperMode}
             className={`p-1.5 rounded-lg transition ${isDeveloperMode ? 'bg-[#b96b4e]/8 text-[#8f3d20] border border-[#b96b4e]/25' : 'hover:bg-stone-100 text-stone-500 hover:text-stone-800'}`}
             title="Toggle Developer Traces"
           >
             <Terminal className="w-3 h-3" />
           </button>
        </div>
        
        {hasImageInput && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-300">
            <span>📷</span>
            <span>Response generated from image+text input. Logprobs apply to generated text tokens, not image pixels.</span>
          </div>
        )}
        
        <div className="flex gap-4">
          <button 
            onClick={() => setSelectedPhase('final')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${selectedPhase === 'final' ? 'border-[#b96b4e] text-[#8f3d20]' : 'border-transparent text-stone-500 hover:text-stone-800'}`}
          >
            Final Output
          </button>
          <button 
             onClick={() => setSelectedPhase('reasoning')}
             className={`pb-3 text-sm font-medium transition-colors border-b-2 ${selectedPhase === 'reasoning' ? 'border-[#b96b4e] text-[#8f3d20]' : 'border-transparent text-stone-500 hover:text-stone-800'}`}
          >
            Thinking
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-3.5 min-h-0">
        {!hasTextContext && activeTokens.length === 0 ? (
           <div className="py-20 flex flex-col items-center justify-center text-stone-500 gap-4 text-center">
             <p className="text-sm">{selectedPhase === 'final' ? 'No final text exposed by this response.' : 'No visible thinking detected in this response.'}</p>
             <button
               onClick={openAnswerSpace}
               className="rounded-xl border border-[#b96b4e]/22 bg-[#b96b4e]/8 px-4 py-2 text-sm font-semibold text-[#8f3d20] hover:bg-[#b96b4e]/12 transition"
             >
               Open Full Universe
             </button>
           </div>
        ) : hasTextContext && activeTokens.length === 0 ? (
           <div className="py-20 flex flex-col items-center justify-center text-stone-500 gap-4 text-center px-6">
             <Activity className="w-8 h-8 opacity-20" />
             <p className="text-sm text-balance">
               {selectedPhase === 'final' ? 'Final text found, but logprobs were not exposed.' : 'Reasoning text found, but reasoning token logprobs were not exposed.'}
             </p>
             <button
               onClick={openAnswerSpace}
               className="rounded-xl border border-[#b96b4e]/22 bg-[#b96b4e]/8 px-4 py-2 text-sm font-semibold text-[#8f3d20] hover:bg-[#b96b4e]/12 transition"
             >
               Open Full Universe
             </button>
           </div>
        ) : (
          <>
            <CollapsibleSection
              id="heatmap"
              title="Token Heatmap"
              subtitle={`${activeTokens.length} generated tokens`}
              icon={DatabaseZap}
              isOpen={openSections.heatmap}
              onToggle={toggleSection}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-[0.14em] text-stone-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.8)]" />
                  Confident
                  <span className="w-2 h-2 rounded-full bg-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.8)] ml-2" />
                  Uncertain
                  <span className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.8)] ml-2" />
                  Low
                </div>
                <button 
                  onClick={() => setIsReplayMode(!isReplayMode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase transition shadow-sm ${
                    isReplayMode 
                      ? 'bg-[#c87556] text-white hover:bg-[#b96b4e]' 
                      : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  {isReplayMode ? 'Exit Replay' : 'Time Replay'}
                </button>
              </div>
              
              {isReplayMode ? (
                <ReplayPlayer tokens={activeTokens} />
              ) : (
                <TokenHeatmap tokens={activeTokens} />
              )}
            </CollapsibleSection>

            {!isReplayMode && (
              <>
                <CollapsibleSection
                  id="metrics"
                  title="Metrics Dashboard"
                  subtitle="confidence, entropy, hesitation"
                  icon={Activity}
                  isOpen={openSections.metrics}
                  onToggle={toggleSection}
                >
                  {activeStats && <UncertaintyDashboard stats={activeStats} tokens={activeTokens} />}
                </CollapsibleSection>

                <CollapsibleSection
                  id="branches"
                  title="Discarded Branch Explorer"
                  subtitle={inspectedToken ? `token #${(targetIndex ?? 0) + 1}` : 'hover a token to inspect'}
                  icon={GitBranch}
                  isOpen={openSections.branches}
                  onToggle={toggleSection}
                >
                  <TokenInspector token={inspectedToken} tokenIndex={targetIndex} activeTokens={activeTokens} />
                </CollapsibleSection>

                <CollapsibleSection
                  id="answerSpace"
                  title="Answer Space Explorer"
                  subtitle={`${message.variants?.length || 1} sample${(message.variants?.length || 1) > 1 ? 's' : ''} available`}
                  icon={Network}
                  isOpen={openSections.answerSpace}
                  onToggle={toggleSection}
                >
                  <div className="rounded-xl border border-[#b96b4e]/18 bg-[#b96b4e]/7 p-3.5">
                    <p className="text-sm text-stone-700">Open semantic clusters, discarded paths, and the llama.cpp full-vocabulary universe explorer.</p>
                    <button
                      onClick={() => useChatStore.getState().openAnswerSpace()}
                      className="ripple-button mt-4 w-full py-2 rounded-xl bg-[#b96b4e]/8 hover:bg-[#b96b4e]/12 border border-[#b96b4e]/22 text-[#8f3d20] text-sm font-semibold transition"
                    >
                      Open Full Universe Overlay
                    </button>
                  </div>
                </CollapsibleSection>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
