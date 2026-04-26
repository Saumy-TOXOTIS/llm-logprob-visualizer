'use client';

import { ParsedToken } from '@/types';
import { useChatStore } from '@/store/chatStore';
import { cn, formatPercent } from '@/lib/utils';
import { HelpCircle, Lock, Unlock, Database } from 'lucide-react';
import { useRef, useState } from 'react';
import { VirtualizedTokenHeatmap } from './VirtualizedTokenHeatmap';

interface TokenHeatmapProps {
  tokens: ParsedToken[];
}

export function TokenHeatmap({ tokens }: TokenHeatmapProps) {
  const { hoveredTokenIndex, lockedTokenIndex, setHoveredToken, setLockedToken } = useChatStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [mode, setMode] = useState<'confidence' | 'entropy'>('confidence');

  const getColor = (token: ParsedToken, isSelected: boolean) => {
    if (mode === 'entropy') {
       // High entropy = hot/purple, Low entropy = cool/transparent
       if (token.entropy > 1.5) return isSelected ? 'bg-fuchsia-500 text-white shadow-[0_0_15px_rgba(217,70,239,0.4)]' : 'bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 relative font-bold';
       if (token.entropy > 0.5) return isSelected ? 'bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]' : 'bg-orange-50 text-orange-700 hover:bg-orange-100';
       return 'bg-stone-100 text-stone-600';
    }

    // Default confidence mode
    switch (token.confidenceBand) {
      case 'high': return isSelected ? 'bg-emerald-500 text-white shadow-[0_0_14px_rgba(34,197,94,0.22)]' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-[0_0_10px_rgba(34,197,94,0.05)]';
      case 'medium': return isSelected ? 'bg-yellow-300 text-stone-950 shadow-[0_0_14px_rgba(250,204,21,0.22)]' : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100 shadow-[0_0_10px_rgba(250,204,21,0.05)]';
      case 'low': return isSelected ? 'bg-rose-500 text-white shadow-[0_0_14px_rgba(251,113,133,0.22)]' : 'bg-rose-50 text-rose-700 hover:bg-rose-100 shadow-[0_0_10px_rgba(251,113,133,0.05)]';
      default: return 'bg-stone-100 text-stone-600';
    }
  };

  const handleMouseEnter = (idx: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (lockedTokenIndex === null) {
      timeoutRef.current = setTimeout(() => {
        setHoveredToken(idx);
      }, 50); // slight debounce
    }
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (lockedTokenIndex === null) {
      timeoutRef.current = setTimeout(() => {
        setHoveredToken(null);
      }, 100);
    }
  };

  const handleClick = (idx: number) => {
    if (lockedTokenIndex === idx) {
      setLockedToken(null);
    } else {
      setLockedToken(idx);
    }
  };

  if (!tokens || tokens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500 gap-3">
        <HelpCircle className="w-8 h-8 opacity-50" />
        <p>No token logprobs found.<br/><span className="text-sm">Increase max_output_tokens or ensure Top Logprobs &gt; 0.</span></p>
      </div>
    );
  }

  // Find active token mapping for the inline preview popover.
  const previewIndex = lockedTokenIndex !== null ? lockedTokenIndex : hoveredTokenIndex;
  const previewToken = previewIndex !== null ? tokens[previewIndex] : null;

  return (
    <div className="flex flex-col gap-2">
      {/* Action Row */}
      <div className="flex justify-between items-center px-1">
        <div className="text-[11px] text-stone-500 flex items-center gap-2">
          {lockedTokenIndex !== null ? (
            <span className="flex items-center gap-1 text-[#8f3d20]"><Lock className="w-3 h-3" /> Token locked</span>
          ) : (
            <span className="flex items-center gap-1"><Unlock className="w-3 h-3" /> Hover active</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-stone-200 rounded-xl p-0.5 shadow-sm">
             <button 
                onClick={() => setMode('confidence')}
                className={`px-2 py-1 rounded-lg text-[9.5px] font-bold uppercase tracking-wider transition ${mode === 'confidence' ? 'bg-stone-800 text-white' : 'text-stone-500 hover:text-stone-900'}`}
             >
                Confidence
             </button>
             <button 
                onClick={() => setMode('entropy')}
                className={`px-2 py-1 rounded-lg text-[9.5px] font-bold uppercase tracking-wider transition ${mode === 'entropy' ? 'bg-[#b96b4e]/8 text-[#8f3d20]' : 'text-stone-500 hover:text-stone-900'}`}
             >
                Entropy
             </button>
          </div>
          {lockedTokenIndex !== null && (
            <button onClick={() => setLockedToken(null)} className="text-[10px] uppercase font-bold text-stone-500 hover:text-stone-900 px-2 py-1.5 bg-white border border-stone-200 rounded-lg pl-1 ml-2">Unlock</button>
          )}
        </div>
      </div>

      {tokens.length > 800 ? (
         <div className="flex flex-col gap-1">
           <div className="text-[10px] text-amber-500/80 uppercase font-bold tracking-widest flex items-center gap-1">
             <Database className="w-3 h-3" />
             Large mode enabled ({tokens.length} tokens)
           </div>
           <VirtualizedTokenHeatmap 
             tokens={tokens}
             getColor={getColor}
             handleMouseEnter={handleMouseEnter}
             handleClick={handleClick}
             handleMouseLeave={handleMouseLeave}
           />
         </div>
      ) : (
        <div 
          className="p-3 bg-white/68 rounded-xl border border-stone-200/90 flex flex-wrap content-start leading-7 overflow-y-auto relative"
          style={{ maxHeight: '75vh' }}
          onMouseLeave={handleMouseLeave}
        >
          {tokens.map((token, idx) => {
            const isSelected = lockedTokenIndex === idx || (lockedTokenIndex === null && hoveredTokenIndex === idx);
            
            return (
               <span
                key={`${idx}-${token.token}`}
                onMouseEnter={() => handleMouseEnter(idx)}
                onClick={() => handleClick(idx)}
                title={`Probability: ${formatPercent(token.probability)} | Rank: ${token.rank === 0 ? 'Top' : `#${token.rank + 1}`} | Entropy: ${token.entropy.toFixed(3)} | Alternatives: ${token.top_logprobs.slice(0, 4).map(a => `${a.token.trim() || 'space'} ${formatPercent(a.probability)}`).join(', ')}`}
                style={{ animationDelay: `${Math.min(idx, 40) * 10}ms` }}
                className={cn(
                  "token-fade-in inline-block px-1.5 py-0.5 rounded-lg font-mono text-[13px] transition-all duration-200 relative cursor-pointer m-px border border-white/70",
                  getColor(token, isSelected),
                  isSelected && 'z-10 scale-105 ring-1 ring-[#b96b4e]/25'
                )}
              >
                {token.rank > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 text-[8px] bg-amber-500 text-white px-1 rounded-full shadow-lg">
                    #{token.rank + 1}
                  </span>
                )}
                {token.token}
              </span>
            );
          })}
        </div>
      )}

      {/* Floating Instant Preview Bubble */}
      {previewToken && lockedTokenIndex === null && (
        <div className="premium-card border-sky-300/20 p-3 text-sm shadow-2xl flex flex-col gap-1 transition-opacity animate-in-soft">
           <div className="flex justify-between items-center mb-1">
             <span className="text-stone-500 text-xs font-bold uppercase tracking-wide">Hover Preview</span>
             <span className="text-[#8f3d20] font-mono">{formatPercent(previewToken.probability)}</span>
           </div>
            <div className="text-stone-900">
              <span className="font-mono bg-stone-100 border border-stone-200 px-2 rounded">"{previewToken.token}"</span>
           </div>
           {previewToken.bestAlternative && (
              <div className="text-xs text-stone-500 mt-1 flex gap-2">
                Alt: <span className="font-mono text-stone-700">"{previewToken.bestAlternative.token}"</span> 
               <span>({formatPercent(previewToken.bestAlternative.probability)})</span>
             </div>
           )}
        </div>
      )}
    </div>
  );
}
