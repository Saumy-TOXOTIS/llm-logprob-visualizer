'use client';

import { ParsedToken, BranchingAlternative, BranchExplorationMode, BranchNode } from '@/types';
import { SearchX, ChevronDown, FlaskConical, ShieldAlert, X, GitBranch } from 'lucide-react';
import { formatPercent } from '@/lib/utils';
import { useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { db } from '@/lib/db';
import { fetchDiscardedContinuation } from '@/lib/lmstudio/api';
import { ExperimentModal } from './ExperimentModal';

function PressureBar({ gap }: { gap: number }) {
  const pressure = Math.max(0, Math.min(1, 1 - (gap * 1.5)));
  let color = 'from-emerald-500 to-emerald-400';
  if (pressure > 0.45) color = 'from-amber-500 to-yellow-400';
  if (pressure > 0.75) color = 'from-rose-500 to-red-400';

  return (
    <div className="bg-stone-100 p-2 rounded-xl text-xs font-mono mb-2 border border-stone-200">
      <div className="flex justify-between items-center mb-1">
        <span className="text-stone-500">Decision Pressure</span>
        <span className="text-stone-700">{Math.round(pressure * 100)}%</span>
      </div>
      <div className="h-2 rounded-full bg-white border border-stone-200 overflow-hidden" title="High pressure means closely tied alternatives">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-300`}
          style={{ width: `${Math.max(4, pressure * 100)}%` }}
        />
      </div>
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string, defaultOpen?: boolean, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-stone-200 rounded-xl bg-white overflow-hidden mb-2">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2.5 flex justify-between items-center hover:bg-stone-50 transition text-[11px] font-bold uppercase text-stone-600"
      >
        {title}
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="p-2.5 border-t border-stone-200 bg-[#fffaf2]/80">
          {children}
        </div>
      )}
    </div>
  );
}

type FilterMode = 'all' | 'high_prob' | 'low_prob' | 'unsafe' | 'non_top_chosen' | 'top_discarded';

export function TokenInspector({ token, tokenIndex, activeTokens }: { token: ParsedToken | null, tokenIndex?: number | null, activeTokens?: ParsedToken[] }) {
  const { isDeveloperMode, activeConversationId, inspectedMessageId, globalSettings } = useChatStore();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [experimentAlt, setExperimentAlt] = useState<BranchingAlternative | null>(null);
  const [experimentResult, setExperimentResult] = useState<{ mode: string, text: string, status: 'loading' | 'success' | 'error' } | null>(null);

  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-stone-500 bg-white rounded-xl border border-stone-200 h-64">
        <span className="text-xl text-stone-400 mb-2 font-mono">_</span>
        <p>Hover or click a token to inspect its branches.</p>
      </div>
    );
  }

  const visibleProbabilityMass = Math.min(1, token.top_logprobs.reduce((sum, alt) => sum + alt.probability, 0));
  const hiddenTailMass = Math.max(0, 1 - visibleProbabilityMass);

  let interpretationText = '';
  if (token.confidenceBand === 'high') interpretationText = 'Model strongly expected this token. Low sampling variance.';
  else if (token.confidenceBand === 'low') interpretationText = 'Model was highly uncertain here. High variance.';
  
  if (token.rank > 0) interpretationText += ' Non-top alternative selected (branching jump).';
  else if (token.marginToBest < 0.1 && token.top_logprobs.length > 1) interpretationText += ' Strong hesitation: top two probabilities are extremely close.';

  const handleContinue = async (mode: BranchExplorationMode, alt: BranchingAlternative) => {
    if (!activeConversationId || !inspectedMessageId) return;
    
    setExperimentResult({ mode, text: '', status: 'loading' });
    
    try {
       const conv = await db.conversations.get(activeConversationId);
       if (!conv) throw new Error("Conversation not found");
       
       const msg = conv.messages.find(m => m.id === inspectedMessageId);
       if (!msg) throw new Error("Message not found");
       if (tokenIndex == null || !activeTokens) throw new Error("Missing active tokens context");
       const variant = msg.variants?.find(v => v.id === msg.activeVariantId) || msg.variants?.[0];
       
       const prefixTokens = activeTokens.slice(0, tokenIndex);
       const prefixBefore = prefixTokens.map(t => t.token).join('');
       const baseBranch: Omit<BranchNode, 'id' | 'continuationText' | 'createdAt' | 'status' | 'error'> = {
          conversationId: activeConversationId,
          messageId: inspectedMessageId,
          variantId: variant?.id,
          tokenIndex,
          prefix: prefixBefore,
          chosenToken: token.token,
          alternativeToken: alt.token,
          probability: alt.probability,
          logprob: alt.logprob,
          rank: token.top_logprobs.findIndex(t => t.token === alt.token),
          entropy: token.entropy,
          cumulativeProbability: prefixTokens.reduce((acc, t) => acc * Math.max(t.probability, 1e-8), Math.max(alt.probability, 1e-8)),
          visibleProbabilityMass,
          hiddenTailMass,
          safetyTags: alt.safetyTags || ['normal'],
          mode
       };
       
       if (mode === 'local_preview') {
          const previewText = prefixBefore + alt.token + " [LOCAL PREVIEW PAUSED]";
          await db.branchNodes.put({
             ...baseBranch,
             id: crypto.randomUUID(),
             continuationText: previewText,
             createdAt: Date.now(),
             status: 'preview'
          });
          setExperimentResult({ mode, text: previewText, status: 'success' });
          return;
       }

       const originalPromptMsg = conv.messages.slice().reverse().find(m => m.role === 'user');
       const originalPrompt = originalPromptMsg?.content || "";

       const result = await fetchDiscardedContinuation(conv, originalPrompt, prefixBefore, alt.token, conv.settings || globalSettings, mode);
       await db.branchNodes.put({
          ...baseBranch,
          id: crypto.randomUUID(),
          continuationText: result,
          createdAt: Date.now(),
          status: 'complete'
       });
       setExperimentResult({ mode, text: result, status: 'success' });
    } catch (err: any) {
       console.error(err);
       let errMsg = err.message || "Failed to analyze branch";
       if (errMsg === 'fetch failed') {
           errMsg = "Fetch failed: The local proxy timed out because the model took longer than 5 minutes to generate. It was likely stuck in an infinite loop predicting tokens. Stop sequences have now been added to prevent this hallucination.";
       }
       setExperimentResult({ mode, text: errMsg, status: 'error' });
    }
  };

  const filteredAlternatives = token.top_logprobs.filter(alt => {
    if (alt.token === token.token) return false; // purely discarded
    if (filter === 'all') return true;
    if (filter === 'high_prob') return alt.probability > 0.1;
    if (filter === 'low_prob') return alt.probability <= 0.1;
    if (filter === 'unsafe') return alt.safetyTags && alt.safetyTags.some(t => t !== 'normal' && t !== 'medical/legal/financial high-stakes');
    if (filter === 'non_top_chosen') return token.rank > 0;
    if (filter === 'top_discarded') return alt.probability > token.probability;
    return true;
  });

  return (
    <div className="flex flex-col gap-2">
      <CollapsibleSection title="Basic" defaultOpen={true}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-[10px] uppercase text-stone-500 mb-1">Chosen Token</h3>
          <div className="text-2xl font-mono px-3 py-1 bg-stone-100 rounded-xl border border-stone-200 text-stone-900 shadow-inner">
              "{token.token}"
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-light text-[#8f3d20]">{formatPercent(token.probability)}</div>
            <div className="text-xs text-stone-500 font-mono">logprob: {token.logprob.toFixed(4)}</div>
          </div>
        </div>
      </CollapsibleSection>

      {interpretationText && (
        <div className="rounded-xl border border-[#b96b4e]/18 bg-[#b96b4e]/8 p-3 text-xs text-stone-700">
          {interpretationText}
        </div>
      )}

      <CollapsibleSection title="Metrics">
        <div className="grid grid-cols-2 gap-2 text-sm mb-2">
          <div className="bg-stone-100 p-2 rounded-xl border border-stone-200">
            <div className="text-stone-500 text-[10px] uppercase mb-1">Rank</div>
            <div className="font-mono text-stone-900">{token.rank === 0 ? 'Top' : `#${token.rank + 1}`}</div>
          </div>
          <div className="bg-stone-100 p-2 rounded-xl border border-stone-200">
            <div className="text-stone-500 text-[10px] uppercase mb-1">Entropy</div>
            <div className="font-mono text-[#8f3d20]">{token.entropy.toFixed(3)}</div>
          </div>
          <div className="bg-stone-100 p-2 rounded-xl border border-stone-200">
            <div className="text-stone-500 text-[10px] uppercase mb-1">Visible Mass</div>
            <div className="font-mono text-emerald-700">{formatPercent(visibleProbabilityMass)}</div>
          </div>
          <div className="bg-stone-100 p-2 rounded-xl border border-stone-200">
            <div className="text-stone-500 text-[10px] uppercase mb-1">Hidden Tail</div>
            <div className="font-mono text-rose-700">{formatPercent(hiddenTailMass)}</div>
          </div>
        </div>
        <PressureBar gap={token.marginToBest} />
      </CollapsibleSection>

      <CollapsibleSection title={`Discarded Branch Explorer (${token.top_logprobs.length > 0 ? token.top_logprobs.length - 1 : 0})`} defaultOpen={true}>
        <p className="text-xs text-stone-600 mb-3 bg-[#b96b4e]/8 p-2 border border-[#b96b4e]/18 rounded-xl">
          These are real next-token candidates exposed by top_logprobs. They are not complete answers unless continued.
        </p>

        <div className="flex flex-wrap gap-1 mb-3">
           <button onClick={() => setFilter('all')} className={`text-[10px] px-2 py-1 rounded border ${filter === 'all' ? 'bg-[#b96b4e]/8 border-[#b96b4e]/25 text-[#8f3d20]' : 'border-stone-200 text-stone-500 hover:bg-stone-50'}`}>All</button>
           <button onClick={() => setFilter('high_prob')} className={`text-[10px] px-2 py-1 rounded border ${filter === 'high_prob' ? 'bg-[#b96b4e]/8 border-[#b96b4e]/25 text-[#8f3d20]' : 'border-stone-200 text-stone-500 hover:bg-stone-50'}`}>High Prob</button>
           <button onClick={() => setFilter('low_prob')} className={`text-[10px] px-2 py-1 rounded border ${filter === 'low_prob' ? 'bg-[#b96b4e]/8 border-[#b96b4e]/25 text-[#8f3d20]' : 'border-stone-200 text-stone-500 hover:bg-stone-50'}`}>Low Prob</button>
           <button onClick={() => setFilter('unsafe')} className={`text-[10px] px-2 py-1 rounded border flex items-center gap-1 ${filter === 'unsafe' ? 'bg-red-50 border-red-200 text-red-700' : 'border-stone-200 text-stone-500 hover:bg-stone-50'}`}><ShieldAlert className="w-3 h-3"/> Unsafe</button>
           {(token.rank > 0 || filter === 'top_discarded') && (
             <button onClick={() => setFilter('top_discarded')} className={`text-[10px] px-2 py-1 rounded border ${filter === 'top_discarded' ? 'bg-[#b96b4e]/8 border-[#b96b4e]/25 text-[#8f3d20]' : 'border-stone-200 text-stone-500 hover:bg-stone-50'}`}>Stronger than Chosen</button>
           )}
        </div>

        <div className="flex flex-col space-y-2 max-h-96 overflow-y-auto pr-1">
          {filteredAlternatives.length === 0 ? (
            <div className="p-4 text-center text-stone-500 flex flex-col items-center border border-dashed border-stone-300 rounded-xl">
              <SearchX className="w-5 h-5 mb-2 opacity-50" />
              No alternatives match filter
            </div>
          ) : (
            filteredAlternatives.map((alt, i) => {
              const gap = token.probability - alt.probability;
              const tag = Math.abs(gap) < 0.1 ? 'close call' : alt.probability < 0.05 ? 'low prob' : 'interesting';
              const tagClass = tag === 'close call'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : tag === 'low prob'
                  ? 'bg-stone-100 text-stone-600 border-stone-200'
                  : 'bg-violet-50 text-violet-700 border-violet-200';
              return (
              <div key={`${i}-${alt.token}`} className="group flex flex-col gap-3 p-3 rounded-xl border border-stone-200 bg-white shadow-sm hover:border-[#b96b4e]/25 hover:-translate-y-0.5 transition-all duration-200">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#efe4d4] border border-stone-200 flex items-center justify-center shrink-0">
                      <GitBranch className="w-3.5 h-3.5 text-[#8f3d20]" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-stone-900 text-sm truncate">"{alt.token}"</div>
                      <div className={`inline-flex mt-1 text-[9px] uppercase px-1.5 py-0.5 rounded-full font-bold border ${tagClass}`}>
                        {tag}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <span className="text-xs text-[#8f3d20] font-mono">{formatPercent(alt.probability)}</span>
                     <button 
                       onClick={() => setExperimentAlt(alt)}
                       title="Experiment / Continue branch"
                       className="ripple-button px-2 py-1.5 flex items-center gap-1.5 opacity-90 hover:opacity-100 text-[#8f3d20] hover:bg-[#b96b4e]/12 border border-[#b96b4e]/20 transition cursor-pointer bg-[#b96b4e]/8 rounded-full text-[10px] font-bold uppercase"
                     >
                       <FlaskConical className="w-3.5 h-3.5" />
                       Continue
                     </button>
                  </div>
                </div>

                <div className="text-[10px] text-stone-500 font-mono line-clamp-1 mb-1 relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-[#b96b4e]/38 before:rounded pl-2">
                   .. <span className="line-through opacity-70">"{token.token}"</span> <span className="text-[#8f3d20]">"{alt.token}"</span> ..
                </div>

                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-stone-200 border border-stone-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#c87556] to-[#7c6559] transition-all"
                      style={{ width: `${Math.max(3, Math.min(100, alt.probability * 100))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-stone-500 font-mono">
                    <span>alternative probability</span>
                    <span>gap vs chosen: {(gap * 100).toFixed(1)}%</span>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-1">
                  <div className="flex flex-wrap gap-1">
                    {alt.safetyTags?.map(t => t !== 'normal' && (
                       <span key={t} className={`text-[9px] uppercase px-1.5 rounded font-bold ${['violence', 'cyber', 'self-harm', 'illegal', 'hate/harassment', 'sexual'].includes(t) ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                         {t}
                       </span>
                    ))}
                  </div>
                  <div className="text-[10px] text-stone-500 flex gap-2">
                    <span title="Difference from chosen token probability">Gap: {(gap * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )})
          )}
        </div>
        
        {experimentResult && (
          <div className="mt-4 p-3 border border-[#b96b4e]/22 bg-white rounded-xl shadow-sm">
             <div className="flex items-center justify-between mb-2">
                 <h4 className="text-[10px] uppercase font-bold text-[#8f3d20]">Experimental Branch Result ({experimentResult.mode})</h4>
                 <button onClick={() => setExperimentResult(null)} className="text-stone-400 hover:text-stone-700">
                    <X className="w-3 h-3" />
                 </button>
             </div>
             {experimentResult.status === 'loading' ? (
                 <div className="text-xs text-[#8f3d20] animate-pulse flex items-center justify-center p-4">
                   <FlaskConical className="w-4 h-4 animate-bounce mr-2" />
                   Running branch analysis...
                </div>
             ) : experimentResult.status === 'error' ? (
                 <div className="text-xs text-red-700 whitespace-pre-wrap font-mono">
                   {experimentResult.text}
                </div>
             ) : (
                 <div className="text-xs text-stone-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                   {experimentResult.text}
                </div>
             )}
          </div>
        )}
      </CollapsibleSection>

      {isDeveloperMode && (
        <CollapsibleSection title="Raw Logits (Dev Mode)">
           <pre className="text-[10px] text-stone-700 font-mono bg-stone-100 border border-stone-200 p-2 rounded-xl overflow-x-auto">
             {JSON.stringify({
               token_id: token.token,
               probability: token.probability,
               logprob: token.logprob,
               rank: token.rank,
               marginToBest: token.marginToBest
             }, null, 2)}
           </pre>
        </CollapsibleSection>
      )}

      <ExperimentModal 
         isOpen={!!experimentAlt} 
         onClose={() => setExperimentAlt(null)} 
         token={token} 
         alternative={experimentAlt} 
         onContinue={handleContinue}
      />
    </div>
  );
}
