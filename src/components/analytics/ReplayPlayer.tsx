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

  // We are going to lock the token in the global store to simulate the replay progress.
  useEffect(() => {
    if (isPlaying && currentIndex < tokens.length) {
      setLockedToken(currentIndex);
      
      const token = tokens[currentIndex];
      // Simulate real writing: higher speed = shorter base delay
      // high entropy = artificial hesitation mapping.
      let delay = (150 / speed) + (token.entropy * 50);

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

  const changeSpeed = () => {
    setSpeed(prev => {
      if (prev === 1) return 1.5;
      if (prev === 1.5) return 2;
      if (prev === 2) return 5;
      return 1;
    });
  };

  if (!tokens || tokens.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 bg-black/40 p-3 rounded-lg border border-border mt-4 shrink-0">
      <div className="flex justify-between items-center text-xs uppercase font-bold text-emerald-500 tracking-wider">
        <span>Replay Generation</span>
        <span>{currentIndex} / {tokens.length}</span>
      </div>
      
      <div className="flex items-center gap-3">
        <button 
          onClick={handlePlayPause}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button 
          onClick={handleStop}
          className="p-2 rounded-full hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition"
        >
          <Square className="w-4 h-4" />
        </button>
        {onExit && (
           <button 
             onClick={onExit}
             className="text-[10px] uppercase tracking-wider px-2 py-1 bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 transition"
           >
             Exit
           </button>
        )}

        <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden border border-white/5 mx-2 cursor-pointer" onClick={(e) => {
          // Allow scrubbing
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = (e.clientX - rect.left) / rect.width;
          const idx = Math.floor(percent * tokens.length);
          setCurrentIndex(idx);
          setLockedToken(idx);
        }}>
          <div 
            className="h-full bg-emerald-500 transition-all duration-100" 
            style={{ width: `${(currentIndex / tokens.length) * 100}%` }}
          />
        </div>

        <button 
          onClick={changeSpeed}
          className="px-2 py-1 flex items-center gap-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-mono w-16 justify-center"
        >
          <FastForward className="w-3 h-3" />
          {speed}x
        </button>
      </div>
    </div>
  );
}
