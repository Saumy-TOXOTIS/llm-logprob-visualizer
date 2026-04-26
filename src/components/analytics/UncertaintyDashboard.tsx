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
      "border p-3 rounded-2xl flex items-center gap-3 transition-all duration-200 hover:-translate-y-0.5",
      highlight ? "border-amber-400/30 bg-amber-400/10 text-amber-100 shadow-[0_0_22px_rgba(251,191,36,0.08)]" : "border-white/10 bg-white/[0.035] text-zinc-300"
    )}>
      <div className={cn("p-2 rounded-xl", highlight ? "bg-amber-400/20" : "bg-black/30")}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-[10px] uppercase font-bold text-zinc-500 mb-0.5">{title}</div>
        <div className="text-xl font-light">{value}</div>
      </div>
    </div>
  );

  const topUncertain = [...tokens].filter(t => t.confidenceBand !== 'high').sort((a, b) => a.probability - b.probability).slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {getMetricCard("Avg Confidence", formatPercent(stats.averageConfidence), Activity)}
        {getMetricCard("Low Conf Tokens", stats.lowConfidenceCount, ShieldAlert, stats.lowConfidenceCount > 0)}
        {getMetricCard("Non-Top Choices", stats.nonTopCount, SplitSquareHorizontal, stats.nonTopCount > 0)}
        {getMetricCard("Avg Entropy", stats.averageEntropy.toFixed(2), Zap)}
      </div>

      <div className="premium-card flex flex-col flex-1 overflow-hidden min-h-[260px]">
        <div className="p-3 border-b border-white/10 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
          Most Uncertain Tokens
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {topUncertain.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 text-sm">No low confidence tokens found.</div>
          ) : (
            topUncertain.map((t, i) => {
              const originalIndex = tokens.indexOf(t);
              return (
                <button 
                  key={i}
                  onClick={() => setLockedToken(originalIndex)}
                  className="w-full text-left flex items-center justify-between p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition text-sm"
                >
                  <span className="font-mono text-amber-400">"{t.token}"</span>
                  <span className="font-mono text-xs">{formatPercent(t.probability)}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
