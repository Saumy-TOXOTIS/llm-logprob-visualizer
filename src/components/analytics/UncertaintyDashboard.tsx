'use client';

import { TokenStats, ParsedToken } from '@/types';
import { Activity, ShieldAlert, Zap, SplitSquareHorizontal } from 'lucide-react';
import { formatPercent, cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';

interface UncertaintyDashboardProps {
  stats: TokenStats;
  tokens: ParsedToken[];
}

export function UncertaintyDashboard({ stats, tokens }: UncertaintyDashboardProps) {
  const { setLockedToken } = useChatStore();

  const getMetricCard = (title: string, value: string | number, Icon: any, highlight: boolean = false) => (
    <div className={cn(
      "border p-2.5 rounded-xl flex items-center gap-2.5 transition-all duration-200 hover:-translate-y-0.5",
      highlight ? "border-amber-300/50 bg-amber-50 text-amber-800 shadow-sm" : "border-stone-200 bg-white/70 text-stone-800"
    )}>
      <div className={cn("p-1.5 rounded-lg", highlight ? "bg-amber-100" : "bg-stone-100")}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-[9.5px] uppercase font-bold text-stone-500 mb-0.5">{title}</div>
        <div className="text-lg font-light">{value}</div>
      </div>
    </div>
  );

  const topUncertain = [...tokens].filter(t => t.confidenceBand !== 'high').sort((a, b) => a.probability - b.probability).slice(0, 5);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5">
        {getMetricCard("Avg Confidence", formatPercent(stats.averageConfidence), Activity)}
        {getMetricCard("Low Conf Tokens", stats.lowConfidenceCount, ShieldAlert, stats.lowConfidenceCount > 0)}
        {getMetricCard("Non-Top Choices", stats.nonTopCount, SplitSquareHorizontal, stats.nonTopCount > 0)}
        {getMetricCard("Avg Entropy", stats.averageEntropy.toFixed(2), Zap)}
      </div>

      <div className="premium-card flex flex-col flex-1 overflow-hidden min-h-[260px]">
        <div className="p-3 border-b border-stone-200/80 text-[11px] font-bold uppercase tracking-[0.15em] text-stone-500">
          Most Uncertain Tokens
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {topUncertain.length === 0 ? (
            <div className="p-4 text-center text-stone-500 text-sm">No low confidence tokens found.</div>
          ) : (
            topUncertain.map((t, i) => {
              const originalIndex = tokens.indexOf(t);
              return (
                <button 
                  key={i}
                  onClick={() => setLockedToken(originalIndex)}
                  className="w-full text-left flex items-center justify-between p-2 rounded-lg hover:bg-stone-50 border border-transparent hover:border-stone-200 transition text-sm"
                >
                  <span className="font-mono text-[#8f3d20]">"{t.token}"</span>
                  <span className="font-mono text-xs text-stone-600">{formatPercent(t.probability)}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
