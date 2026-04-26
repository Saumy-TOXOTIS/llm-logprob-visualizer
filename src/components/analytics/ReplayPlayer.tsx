'use client';

import { ParsedToken } from '@/types';
import { Play, Pause, Square, FastForward, Rewind } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/store/chatStore';

interface ReplayPlayerProps {
  tokens: ParsedToken[];
  onExit?: () => void;
}

export function ReplayPlayer({ tokens, onExit }: ReplayPlayerProps) {
  const { setLockedToken } = useChatStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeToken = tokens[Math.min(currentIndex, Math.max(0, tokens.length - 1))];
  const revealedTokens = tokens.slice(0, currentIndex);
  const replayText = revealedTokens.map(t => t.token).join('');
  const recentTokens = tokens.slice(Math.max(0, currentIndex - 12), Math.min(tokens.length, currentIndex + 1));
  const progress = tokens.length ? (currentIndex / tokens.length) * 100 : 0;

  // We are going to lock the token in the global store to simulate the replay progress.
  useEffect(() => {
    if (isPlaying && currentIndex < tokens.length) {
      setLockedToken(currentIndex);
      
      const token = tokens[currentIndex];
      // Simulate real writing: higher speed = shorter base delay
      // high entropy = artificial hesitation mapping.
      const delay = (150 / speed) + (token.entropy * 50);

      playTimerRef.current = setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
      }, delay);
    } else if (currentIndex >= tokens.length && isPlaying) {
      setIsPlaying(false);
    }

    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [isPlaying, currentIndex, tokens, speed, setLockedToken]);

  const handlePlayPause = () => {
    if (!isPlaying && currentIndex >= tokens.length) {
      setCurrentIndex(0); // Restart if clicked play when at end
    }
    setIsPlaying(!isPlaying);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
    setLockedToken(null);
  };

  const jumpBy = (delta: number) => {
    setIsPlaying(false);
    setCurrentIndex(prev => {
      const next = Math.max(0, Math.min(tokens.length, prev + delta));
      setLockedToken(next < tokens.length ? next : null);
      return next;
    });
  };

  const changeSpeed = () => {
    setSpeed(prev => {
      if (prev === 0.5) return 1;
      if (prev === 1) return 1.5;
      if (prev === 1.5) return 2;
      if (prev === 2) return 5;
      return 0.5;
    });
  };

  if (!tokens || tokens.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 bg-white/78 p-3.5 rounded-xl border border-stone-200/90 mt-3 shrink-0 shadow-sm">
      <div className="flex justify-between items-center text-[11px] uppercase font-bold text-[#8f3d20] tracking-wider">
        <span>Replay Generation</span>
        <span className="font-mono">{currentIndex} / {tokens.length}</span>
      </div>
      
      <div className="flex items-center gap-3">
        <button
          onClick={() => jumpBy(-10)}
          className="p-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 transition"
          title="Jump back 10 tokens"
        >
          <Rewind className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={handlePlayPause}
          className="p-1.5 rounded-full bg-[#b96b4e]/8 hover:bg-[#b96b4e]/12 text-[#8f3d20] border border-[#b96b4e]/20 transition"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button 
          onClick={handleStop}
          className="p-1.5 rounded-full hover:bg-red-50 text-stone-400 hover:text-red-600 transition"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        {onExit && (
           <button 
             onClick={onExit}
             className="text-[10px] uppercase tracking-wider px-2 py-1 bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 transition"
           >
             Exit
           </button>
        )}

        <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden border border-stone-200 mx-2 cursor-pointer" onClick={(e) => {
          // Allow scrubbing
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = (e.clientX - rect.left) / rect.width;
          const idx = Math.floor(percent * tokens.length);
          setCurrentIndex(idx);
          setLockedToken(idx);
        }}>
          <div 
            className="h-full bg-gradient-to-r from-[#c87556] to-[#7c6559] transition-all duration-100" 
            style={{ width: `${progress}%` }}
          />
        </div>

        <button 
          onClick={changeSpeed}
          className="px-2 py-1 flex items-center gap-1 rounded-lg bg-stone-50 border border-stone-200 hover:bg-stone-100 text-[11px] font-mono w-16 justify-center text-stone-700"
        >
          <FastForward className="w-3 h-3" />
          {speed}x
        </button>
        <button
          onClick={() => jumpBy(10)}
          className="p-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 transition"
          title="Jump forward 10 tokens"
        >
          <FastForward className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_180px] gap-3">
        <div className="rounded-xl border border-stone-200 bg-[#fffaf2]/80 p-3.5 min-h-36 max-h-72 overflow-auto custom-scrollbar">
          {replayText ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
              {replayText}
              {currentIndex < tokens.length && (
                <span className="ml-0.5 rounded bg-[#b96b4e]/12 px-1 text-[#8f3d20] font-mono animate-pulse">
                  {activeToken?.token || ''}
                </span>
              )}
            </div>
          ) : (
            <div className="h-full min-h-28 flex items-center justify-center text-sm text-stone-400 text-center">
              Press play to reveal the generated answer token by token.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-bold mb-2">Current Token</div>
          <div className="font-mono text-sm text-stone-950 break-all rounded-xl bg-white border border-stone-200 p-2 min-h-10">
            {currentIndex < tokens.length ? `"${activeToken?.token || ''}"` : 'Complete'}
          </div>
          {currentIndex < tokens.length && activeToken && (
            <div className="mt-3 space-y-2 text-[11px] font-mono text-stone-600">
              <div className="flex justify-between"><span>p</span><span>{(activeToken.probability * 100).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span>rank</span><span>{activeToken.rank === 0 ? 'top' : `#${activeToken.rank + 1}`}</span></div>
              <div className="flex justify-between"><span>entropy</span><span>{activeToken.entropy.toFixed(3)}</span></div>
              <div className={`rounded-full px-2 py-1 text-center uppercase text-[10px] ${
                activeToken.confidenceBand === 'high'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : activeToken.confidenceBand === 'medium'
                    ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {activeToken.confidenceBand}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3">
        <div className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-bold mb-2">Recent Token Trail</div>
        <div className="flex flex-wrap gap-1.5">
          {recentTokens.map((token, index) => {
            const absoluteIndex = Math.max(0, currentIndex - 12) + index;
            const isCurrent = absoluteIndex === currentIndex;
            return (
              <span
                key={`${absoluteIndex}-${token.token}`}
                className={`rounded-xl border px-2 py-1 text-xs font-mono ${
                  isCurrent
                    ? 'border-[#b96b4e]/25 bg-[#b96b4e]/8 text-[#8f3d20]'
                    : 'border-stone-200 bg-white text-stone-600'
                }`}
              >
                {token.token.replace(/\n/g, '\\n') || '<empty>'}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
