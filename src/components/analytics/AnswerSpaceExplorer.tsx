import { useChatStore } from '@/store/chatStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { X, Network, LayoutGrid, Infinity } from 'lucide-react';
import { useState, useMemo } from 'react';
import { clusterVariants } from '@/lib/analytics/cluster';
import { fetchDiscardedContinuation } from '@/lib/lmstudio/api';
import { BranchNode } from '@/types';
import { FullVocabExplorer } from './FullVocabExplorer';

export function AnswerSpaceExplorer() {
  const { inspectedMessageId, isAnswerSpaceOpen, closeAnswerSpace, activeConversationId } = useChatStore();
  
  const [activeTab, setActiveTab] = useState<'gallery' | 'discarded' | 'universe'>('universe');
  const [expandedClusterIndex, setExpandedClusterIndex] = useState<number | null>(null);
  
  const [continuingBranches, setContinuingBranches] = useState<Record<number, boolean>>({});
  const [continuationResults, setContinuationResults] = useState<Record<number, string>>({});
  
  // Diff viewer state
  const [isComparing, setIsComparing] = useState(false);
  const [compareTargetIdx, setCompareTargetIdx] = useState<number | null>(null);

  const conversation = useLiveQuery(() => 
    activeConversationId ? db.conversations.get(activeConversationId) : undefined,
    [activeConversationId]
  );

  const message = conversation?.messages.find(m => m.id === inspectedMessageId);
  const savedBranches = (useLiveQuery(
    () => inspectedMessageId
      ? db.branchNodes.where('messageId').equals(inspectedMessageId).reverse().sortBy('createdAt')
      : ([] as BranchNode[]),
    [inspectedMessageId]
  ) || []) as BranchNode[];

  const clusters = useMemo(() => {
    if (!message || !message.variants) return [];
    // Ensure they have generated some output
    const validVariants = message.variants.filter(v => (v.finalText || v.reasoningText || '').length > 0);
    return clusterVariants(validVariants, 0.85);
  }, [message]);

  const activeVariant = message?.variants?.find(v => v.id === message.activeVariantId) || message?.variants?.[0];

  const discardedBranches = useMemo(() => {
     if (!message || !message.variants) return [];
     
     const branches: any[] = [];
     
     message.variants.forEach((v, variantIndex) => {
         const tokens = v.parsedLogprobs || [];
         
         let prefixAgg = "";
         tokens.forEach((tk, idx) => {
             // Only log high entropy or discarded elements mathematically significant
             tk.top_logprobs?.forEach((alt) => {
                if (alt.token !== tk.token) {
                   branches.push({
                      variantIndex,
                      variantId: v.id,
                      tokenIndex: idx,
                      contextBefore: prefixAgg,
                      chosenToken: tk.token,
                      chosenProb: tk.probability,
                      discardedToken: alt.token,
                      discardedProb: alt.probability,
                      entropy: tk.entropy,
                      probGap: Math.abs(tk.probability - alt.probability)
                   });
                }
             });
             prefixAgg += tk.token;
         });
     });
     
     // Sort by probability gap ascending (closest decisions), then discarded probability descending
     return branches.sort((a, b) => a.probGap - b.probGap || b.discardedProb - a.discardedProb);
  }, [message]);

  const handleContinueBranch = async (branchIndex: number, branch: any) => {
     if (!conversation || !message) return;
     setContinuingBranches(prev => ({ ...prev, [branchIndex]: true }));
     
     try {
        const resultText = await fetchDiscardedContinuation(
           conversation,
           message.content, // original user query (assumed preceding assistant)
           branch.contextBefore,
           branch.discardedToken,
           conversation.settings
        );
        setContinuationResults(prev => ({ ...prev, [branchIndex]: resultText }));
     } catch(e: any) {
        setContinuationResults(prev => ({ ...prev, [branchIndex]: "Error: " + e.message }));
     }
     
     setContinuingBranches(prev => ({ ...prev, [branchIndex]: false }));
  };

  if (!isAnswerSpaceOpen || !message) return null;

  return (
    <div className="fixed inset-0 bg-stone-950/38 backdrop-blur-xl z-50 flex flex-col p-5 animate-in-soft">
      
      {/* Header */}
      <div className="flex items-center justify-between bg-[#fbf8f2]/94 border border-stone-200/90 p-3.5 rounded-t-2xl neural-border">
         <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-[#efe4d4] border border-stone-200 rounded-xl shadow-sm">
               <Network className="w-4 h-4 text-[#8f3d20]" />
            </div>
            <div>
               <h2 className="text-lg font-bold text-stone-950">
                  Answer Space Explorer
               </h2>
               <p className="text-xs text-stone-500">
                  {message.variants?.length || 0} samples mapped - {clusters.length} distinct semantic clusters
               </p>
            </div>
         </div>
         
         <div className="flex items-center gap-3">
             <div className="flex bg-white/78 border border-stone-200 rounded-xl p-1 shadow-sm">
                <button 
                  onClick={() => setActiveTab('universe')}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition flex items-center gap-1.5 ${activeTab === 'universe' ? 'bg-[#c87556] text-white' : 'text-stone-500 hover:text-stone-900'}`}
                >
                  <Infinity className="w-3.5 h-3.5" /> Full Universe
                </button>
                <button 
                  onClick={() => setActiveTab('gallery')}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition flex items-center gap-1.5 ${activeTab === 'gallery' ? 'bg-stone-800 text-white' : 'text-stone-500 hover:text-stone-900'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Groups
                </button>
                <button 
                  onClick={() => setActiveTab('discarded')}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition flex items-center gap-1.5 ${activeTab === 'discarded' ? 'bg-[#c87556] text-white' : 'text-stone-500 hover:text-stone-900'}`}
                >
                  <Network className="w-3.5 h-3.5" /> Discarded Branches
                </button>
             </div>
             
             <button onClick={closeAnswerSpace} className="p-2 hover:bg-stone-100 rounded-xl transition border border-transparent hover:border-stone-200">
               <X className="w-5 h-5 text-stone-500" />
             </button>
         </div>
      </div>

      {/* Body Area */}
      <div className="flex-1 bg-[#f7f1e8]/94 border-x border-b border-stone-200/90 rounded-b-2xl overflow-y-auto p-5">
         {activeTab === 'universe' && conversation && (
            <FullVocabExplorer conversation={conversation} message={message} variant={activeVariant} />
         )}

         {activeTab === 'gallery' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
               {clusters.map((cluster, i) => {
                  const isExpanded = expandedClusterIndex === i;
                  return (
                  <div key={i} className={`premium-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-300/25 hover:shadow-[0_14px_34px_rgba(16,185,129,0.08)] flex flex-col ${isExpanded ? 'xl:col-span-3 min-h-[60vh]' : ''}`}>
                     <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                           <span className="px-2.5 py-0.5 bg-[#b96b4e]/8 text-[#8f3d20] text-[11px] font-bold rounded-full border border-[#b96b4e]/20">
                             Cluster {i + 1}
                           </span>
                           <span className="text-xs text-stone-500">{cluster.size} instances</span>
                        </div>
                        <div className="text-right">
                           <div className="text-[10px] text-stone-500 uppercase tracking-widest mb-0.5">Confidence</div>
                           <div className="text-sm font-mono font-semibold text-[#8f3d20]">
                              {(cluster.averageConfidence * 100).toFixed(1)}%
                           </div>
                        </div>
                     </div>
                     
                     <div className={`flex-1 text-sm text-stone-800 relative ${isExpanded ? 'overflow-y-auto pr-2' : 'overflow-hidden'}`}>
                        <p className={`${isExpanded ? '' : 'line-clamp-6'} opacity-80 leading-relaxed text-[13px] whitespace-pre-wrap`}>
                           {cluster.representative.finalText || cluster.representative.content || "No final text generated."}
                        </p>
                        {!isExpanded && <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>}
                     </div>
                     
                     {isComparing && compareTargetIdx === i ? (
                        <div className="mt-4 pt-4 border-t border-stone-200 flex flex-col gap-3">
                           <div className="text-[10px] text-[#8f3d20] font-bold uppercase tracking-widest flex items-center gap-2">
                             Comparing against Cluster 1 (Dominant)
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                              <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-[13px] text-stone-600 font-mono whitespace-pre-wrap">
                                 {clusters[0].representative.finalText || clusters[0].representative.content}
                              </div>
                              <div className="p-3 bg-[#b96b4e]/8 border border-[#b96b4e]/18 rounded-xl text-[13px] text-stone-900 font-mono whitespace-pre-wrap">
                                 {cluster.representative.finalText || cluster.representative.content}
                              </div>
                           </div>
                           <button onClick={() => {setIsComparing(false); setCompareTargetIdx(null);}} className="w-full py-1.5 mt-2 bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 rounded-xl text-xs font-semibold transition">
                              Close Comparison
                           </button>
                        </div>
                     ) : (
                        <div className="mt-4 pt-4 border-t border-stone-200 flex gap-2">
                           <button onClick={() => setExpandedClusterIndex(isExpanded ? null : i)} className="ripple-button flex-1 py-2 bg-white hover:bg-stone-50 rounded-2xl text-xs font-semibold transition text-stone-700 border border-stone-200">
                              {isExpanded ? 'Collapse' : 'Maximize Read'}
                           </button>
                           {i !== 0 && (
                              <button 
                                 onClick={() => {setIsComparing(true); setCompareTargetIdx(i); setExpandedClusterIndex(i);}} 
                                 className="ripple-button flex-1 py-2 bg-[#b96b4e]/8 hover:bg-[#b96b4e]/12 text-[#8f3d20] border border-[#b96b4e]/20 rounded-xl text-xs font-semibold transition"
                              >
                                 Compare vs Cluster 1
                              </button>
                           )}
                        </div>
                     )}
                  </div>
               )})}
            </div>
         )}

         {activeTab === 'discarded' && (
            <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
               {savedBranches && savedBranches.length > 0 && (
                  <div className="premium-card p-5">
                     <div className="flex items-center justify-between mb-4">
                        <div>
                           <h3 className="text-lg font-bold text-stone-900">Branch Archive</h3>
                           <p className="text-sm text-stone-500">{savedBranches.length} explored local branch{savedBranches.length > 1 ? 'es' : ''}</p>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-[#b96b4e]/8 border border-[#b96b4e]/18 text-[#8f3d20] text-xs font-semibold">
                          Local Research
                        </span>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                       {savedBranches.map(branch => (
                         <div key={branch.id} className="rounded-2xl border border-stone-200 bg-white/75 p-3">
                           <div className="flex items-center justify-between gap-2 mb-2">
                             <div className="font-mono text-sm text-stone-900 truncate">
                               <span className="line-through text-stone-400">{branch.chosenToken}</span>
                               <span className="mx-1 text-stone-400">-&gt;</span>
                               <span className="text-[#8f3d20]">{branch.alternativeToken}</span>
                             </div>
                             <span className="text-[10px] uppercase rounded-full bg-stone-100 border border-stone-200 px-2 py-0.5 text-stone-500">
                               {branch.mode.replace('_', ' ')}
                             </span>
                           </div>
                           <div className="flex flex-wrap gap-1 mb-2">
                             {branch.safetyTags.map(tag => tag !== 'normal' && (
                               <span key={tag} className="text-[9px] uppercase rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-red-700">
                                 {tag}
                               </span>
                             ))}
                           </div>
                           <div className="text-[11px] text-stone-500 font-mono mb-2">
                             p={Math.round(branch.probability * 1000) / 10}% - entropy={branch.entropy.toFixed(2)} - tail={Math.round(branch.hiddenTailMass * 1000) / 10}%
                           </div>
                           <p className="text-xs text-stone-700 line-clamp-4 whitespace-pre-wrap">
                             {branch.continuationText}
                           </p>
                         </div>
                       ))}
                     </div>
                  </div>
               )}

               <div className="flex flex-col items-center justify-center p-7 text-center bg-white/68 border border-stone-200 rounded-xl">
                  <Network className="w-8 h-8 text-[#8f3d20] mb-3" />
                  <h3 className="text-lg font-bold text-stone-900">Discarded Possibilities ({discardedBranches.length})</h3>
                  <p className="text-sm text-stone-500 mt-2 max-w-xl">
                    These are token-level possibilities exposed by top_logprobs. They are real next-token candidates considered by the model, but not complete answers unless continued.
                  </p>
               </div>

               <div className="grid grid-cols-1 gap-4">
                  {discardedBranches.map((branch, i) => {
                     // Build the local substitution text
                     const safeContext = branch.contextBefore.length > 80 ? '...' + branch.contextBefore.slice(-80) : branch.contextBefore;
                     return (
                     <div key={i} className="premium-card p-4 hover:border-amber-400/30 transition-all duration-300 hover:-translate-y-0.5 flex flex-col gap-3.5 relative overflow-hidden group">
                        
                        {/* decorative background pulse for tight gaps */}
                        {branch.probGap < 0.1 && (
                           <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition pointer-events-none"></div>
                        )}

                        <div className="flex justify-between items-start">
                           <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-mono font-bold text-stone-500">
                                #{i + 1}
                              </span>
                              <div>
                                 <div className="text-xs text-stone-500 mb-0.5">Token Position: {branch.tokenIndex} - Entropy: {branch.entropy.toFixed(2)}</div>
                                 <div className="text-sm text-stone-700">
                                    <span className="opacity-50">{safeContext}</span>
                                    <span className="bg-red-50 text-red-700 px-1 rounded-sm mx-1 line-through decoration-red-500/50">{branch.chosenToken}</span>
                                    <span className="bg-[#b96b4e]/8 text-[#8f3d20] font-bold px-1 rounded-sm">{branch.discardedToken}</span>
                                 </div>
                              </div>
                           </div>
                           <div className="flex flex-col items-end gap-1 shrink-0 bg-stone-100 p-2 rounded-lg border border-stone-200">
                              <div className="text-[10px] uppercase text-stone-500 font-bold tracking-wider">Gap: {(branch.probGap * 100).toFixed(1)}%</div>
                              <div className="flex items-center gap-3 text-xs font-mono">
                                 <span className="text-stone-500">Chosen: {(branch.chosenProb * 100).toFixed(1)}%</span>
                                 <span className="text-[#8f3d20] font-bold">Discarded: {(branch.discardedProb * 100).toFixed(1)}%</span>
                              </div>
                           </div>
                        </div>
                        
                        <div className="pt-3 border-t border-stone-200 flex gap-3">
                           {continuationResults[i] ? (
                              <div className="w-full flex flex-col gap-2 bg-white p-4 rounded-xl border border-[#b96b4e]/22 shadow-inner">
                                 <div className="flex justify-between items-center mb-1 text-[11px] font-bold uppercase text-[#8f3d20] tracking-wider">
                                    <span>Alternative Branch Generated</span>
                                    <span className="text-stone-400 font-mono">Via /v1/completions</span>
                                 </div>
                                 <div className="text-sm text-stone-800 leading-relaxed font-mono whitespace-pre-wrap">
                                    <span className="text-stone-400">{safeContext}</span>
                                    <span className="bg-[#b96b4e]/8 text-[#8f3d20] px-1 rounded-sm font-bold">{branch.discardedToken}</span>
                                    <span>{continuationResults[i].slice(branch.contextBefore.length + branch.discardedToken.length)}</span>
                                 </div>
                              </div>
                           ) : (
                              <div className="flex gap-3 items-center w-full">
                                 <button 
                                    onClick={() => handleContinueBranch(i, branch)}
                                    disabled={continuingBranches[i]}
                                    className={`px-4 py-1.5 ${continuingBranches[i] ? 'bg-stone-100 text-stone-400 cursor-not-allowed' : 'bg-[#b96b4e]/8 hover:bg-[#b96b4e]/12 text-[#8f3d20]'} border border-[#b96b4e]/20 rounded-lg text-xs font-bold transition flex items-center gap-2`}
                                 >
                                    {continuingBranches[i] ? 'Generating Context...' : 'Continue this discarded path'}
                                 </button>
                                 <div className="text-[11px] text-stone-500 flex items-center px-2">Local substitution only - not a full regenerated answer.</div>
                              </div>
                           )}
                        </div>
                     </div>
                  )})}

                  {discardedBranches.length === 0 && (
                     <div className="text-center p-12 text-stone-500 border border-dashed border-stone-300 bg-white/60 rounded-2xl">
                        No discarded branches were exposed by top_logprobs for this response. Increase Top Logprobs captured or use a backend that exposes more alternatives.
                     </div>
                  )}
               </div>
            </div>
         )}
      </div>

    </div>
  );
}
