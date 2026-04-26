'use client';

import { ParsedToken } from '@/types';
import { useChatStore } from '@/store/chatStore';
import { cn } from '@/lib/utils';
import { useRef, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualizedTokenHeatmapProps {
  tokens: ParsedToken[];
  getColor: (token: ParsedToken, isSelected: boolean) => string;
  handleMouseEnter: (idx: number) => void;
  handleClick: (idx: number) => void;
  handleMouseLeave: () => void;
}

export function VirtualizedTokenHeatmap({ tokens, getColor, handleMouseEnter, handleClick, handleMouseLeave }: VirtualizedTokenHeatmapProps) {
  const { hoveredTokenIndex, lockedTokenIndex } = useChatStore();
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(8); // Default columns

  // Responsive column calculation
  useEffect(() => {
    if (parentRef.current) {
      const width = parentRef.current.getBoundingClientRect().width;
      // Assume average token pill is around 45px wide
      setColumns(Math.max(4, Math.floor(width / 45)));
    }
  }, []);

  const rowCount = Math.ceil(tokens.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // Fixed row height
    overscan: 5,
  });

  return (
    <div 
      ref={parentRef}
      onMouseLeave={handleMouseLeave}
      className="bg-black/24 rounded-2xl border border-white/10 max-h-[350px] overflow-y-auto w-full relative"
    >
      <div
        className="w-full relative"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowTokens = tokens.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.index}
              className="absolute top-0 left-0 w-full flex items-center px-2"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="flex w-full gap-1">
                {rowTokens.map((token, colIdx) => {
                  const idx = startIndex + colIdx;
                  const isSelected = lockedTokenIndex === idx || (lockedTokenIndex === null && hoveredTokenIndex === idx);

                  return (
                    <span
                      key={`${idx}-${token.token}`}
                      onMouseEnter={() => handleMouseEnter(idx)}
                      onClick={() => handleClick(idx)}
                      title={`Probability: ${(token.probability * 100).toFixed(1)}% | Entropy: ${token.entropy.toFixed(3)} | Rank: ${token.rank === 0 ? 'Top' : `#${token.rank + 1}`}`}
                      className={cn(
                        "inline-block px-2 py-0.5 rounded-xl font-mono text-[14px] transition-all duration-200 cursor-pointer truncate max-w-[150px] shrink border border-white/[0.035]",
                        getColor(token, isSelected),
                        isSelected && 'z-10 ring-1 ring-white/50 scale-105'
                      )}
                    >
                      {token.rank > 0 && (
                        <span className="absolute -top-1.5 -right-0.5 text-[8px] bg-amber-500 text-white px-1 rounded-full shadow-lg z-20">
                          #{token.rank + 1}
                        </span>
                      )}
                      {token.token}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
