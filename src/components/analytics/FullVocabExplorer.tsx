'use client';

import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Conversation, FullVocabAlternative, FullVocabSnapshot, Message, MessageVariant } from '@/types';
import { fetchFullVocabSnapshot, getLlamaCppModelMeta } from '@/lib/llamacpp/api';
import { db } from '@/lib/db';
import { formatPercent } from '@/lib/utils';
import { Activity, DatabaseZap, GitBranch, Loader2, Search, Sparkles, Split, Zap } from 'lucide-react';

type Props = {
  conversation: Conversation;
  message: Message;
  variant?: MessageVariant;
};

function tokenLabel(token: string) {
  if (token === '\n') return '\\n';
  if (token === '\t') return '\\t';
  if (!token) return '<empty>';
  return token.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function formatMass(value: number) {
  return `${Math.min(100, value * 100).toFixed(2)}%`;
}

export function FullVocabExplorer({ conversation, message, variant }: Props) {
  const [snapshots, setSnapshots] = useState<FullVocabSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading-meta' | 'scanning' | 'expanding' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [minProbability, setMinProbability] = useState(0);
  const [visibleLimit, setVisibleLimit] = useState(conversation.settings.fullVocabDisplayLimit || 500);
  const [modelMeta, setModelMeta] = useState<{ nVocab: number; model: string; nCtxTrain: number } | null>(null);
  const [branchPrefix, setBranchPrefix] = useState('');
  const parentRef = useRef<HTMLDivElement | null>(null);

  const activeSnapshot = snapshots.find(s => s.id === activeSnapshotId) || snapshots[0] || null;
  const fullTarget = modelMeta?.nVocab || activeSnapshot?.nVocab || conversation.settings.fullVocabNProbs || 0;
  const isBusy = status === 'loading-meta' || status === 'scanning' || status === 'expanding';

  const filteredAlternatives = useMemo(() => {
    if (!activeSnapshot) return [];
    const normalizedQuery = query.trim().toLowerCase();
    let rows = activeSnapshot.alternatives;

    if (minProbability > 0) {
      rows = rows.filter(alt => alt.probability >= minProbability);
    }

    if (normalizedQuery) {
      rows = rows.filter(alt =>
        alt.token.toLowerCase().includes(normalizedQuery) ||
        String(alt.id ?? '').includes(normalizedQuery) ||
        String(alt.rank + 1).includes(normalizedQuery)
      );
    }

    return rows.slice(0, visibleLimit);
  }, [activeSnapshot, query, minProbability, visibleLimit]);

  const rowVirtualizer = useVirtualizer({
    count: filteredAlternatives.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 82,
    overscan: 10,
  });

  const loadModelMeta = async () => {
    setStatus('loading-meta');
    setError(null);
    const meta = await getLlamaCppModelMeta(conversation.settings);
    setModelMeta(meta);
    setStatus('idle');
    return meta;
  };

  const scanPrefix = async ({
    prefix,
    parentId,
    selectedAlt,
    mode
  }: {
    prefix: string;
    parentId?: string;
    selectedAlt?: FullVocabAlternative;
    mode: 'root' | 'current' | 'expand';
  }) => {
    setStatus(mode === 'expand' ? 'expanding' : 'scanning');
    setError(null);

    try {
      const meta = modelMeta || await loadModelMeta();
      const nProbs = conversation.settings.fullVocabNProbs && conversation.settings.fullVocabNProbs > 0
        ? conversation.settings.fullVocabNProbs
        : meta.nVocab;

      const snapshot = await fetchFullVocabSnapshot({
        conversation,
        message,
        variant,
        generatedPrefix: prefix,
        parentId,
        selectedToken: selectedAlt?.token,
        selectedTokenId: selectedAlt?.id,
        selectedTokenProbability: selectedAlt?.probability,
        nProbsOverride: nProbs
      });

      setSnapshots(prev => [snapshot, ...prev]);
      setActiveSnapshotId(snapshot.id);
      setBranchPrefix(prefix);
      await db.fullVocabSnapshots.put(snapshot);
      setStatus('idle');
    } catch (err: any) {
      setError(err.message || 'Full vocabulary scan failed.');
      setStatus('error');
    }
  };

  const scanRoot = () => scanPrefix({ prefix: '', mode: 'root' });
  const scanAfterCurrentOutput = () => scanPrefix({ prefix: variant?.finalText || variant?.content || '', mode: 'current' });
  const expandAlternative = (alt: FullVocabAlternative) => {
    const basePrefix = activeSnapshot?.generatedPrefix || branchPrefix;
    return scanPrefix({
      prefix: basePrefix + alt.token,
      parentId: activeSnapshot?.id,
      selectedAlt: alt,
      mode: 'expand'
    });
  };

  const totalCandidates = activeSnapshot?.alternatives.length || 0;
  const hiddenCount = activeSnapshot ? Math.max(0, activeSnapshot.nVocab - activeSnapshot.alternatives.length) : 0;
  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <div className="premium-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] font-bold text-[#9a3412]">
                <Sparkles className="w-4 h-4" />
                Full Vocabulary Universe
              </div>
              <h3 className="text-2xl font-semibold text-stone-950 mt-2">No-limit next-token explorer</h3>
              <p className="text-sm text-stone-500 mt-2 max-w-2xl">
                Uses llama.cpp native /completion with n_probs equal to the model vocabulary size, then expands branches one token at a time.
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-right shrink-0">
              <div className="text-[10px] uppercase tracking-[0.16em] text-stone-500">Target</div>
              <div className="font-mono text-lg text-stone-950">{fullTarget ? fullTarget.toLocaleString() : 'auto'}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            <button
              disabled={isBusy}
              onClick={scanRoot}
              className="ripple-button rounded-2xl border border-[#d97757]/25 bg-[#d97757]/10 hover:bg-[#d97757]/15 px-4 py-3 text-left transition disabled:opacity-50"
            >
              <Zap className="w-4 h-4 text-[#9a3412] mb-2" />
              <div className="text-sm font-semibold text-stone-900">Scan First Token</div>
              <div className="text-[11px] text-stone-500">Start from assistant turn</div>
            </button>
            <button
              disabled={isBusy || !(variant?.finalText || variant?.content)}
              onClick={scanAfterCurrentOutput}
              className="ripple-button rounded-2xl border border-stone-200 bg-white hover:bg-stone-50 px-4 py-3 text-left transition disabled:opacity-50"
            >
              <Split className="w-4 h-4 text-stone-600 mb-2" />
              <div className="text-sm font-semibold text-stone-900">Scan After Output</div>
              <div className="text-[11px] text-stone-500">Probe the current tail</div>
            </button>
            <button
              disabled={isBusy}
              onClick={loadModelMeta}
              className="ripple-button rounded-2xl border border-stone-200 bg-white hover:bg-stone-50 px-4 py-3 text-left transition disabled:opacity-50"
            >
              <DatabaseZap className="w-4 h-4 text-stone-600 mb-2" />
              <div className="text-sm font-semibold text-stone-900">Refresh Model</div>
              <div className="text-[11px] text-stone-500">{modelMeta?.model || 'Read /v1/models'}</div>
            </button>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <Activity className="w-4 h-4 text-stone-600 mb-2" />
              <div className="text-sm font-semibold text-stone-900">
                {activeSnapshot ? formatMass(activeSnapshot.topProbabilityMass) : '0.00%'} mass
              </div>
              <div className="text-[11px] text-stone-500">returned distribution</div>
            </div>
          </div>

          {isBusy && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#d97757]/20 bg-[#d97757]/10 px-4 py-3 text-sm text-[#9a3412]">
              <Loader2 className="w-4 h-4 animate-spin" />
              {status === 'loading-meta' ? 'Reading llama.cpp model metadata...' : 'Fetching full vocabulary probability universe...'}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="premium-card p-5">
          <div className="text-xs uppercase tracking-[0.18em] font-bold text-stone-500">Branch Path</div>
          <div className="mt-3 min-h-28 rounded-2xl border border-stone-200 bg-stone-50 p-4 font-mono text-sm text-stone-800 whitespace-pre-wrap break-words">
            {activeSnapshot?.generatedPrefix
              ? activeSnapshot.generatedPrefix
              : 'Root assistant position. Expand any token to walk the answer tree.'}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="rounded-xl bg-white border border-stone-200 p-2">
              <div className="text-[10px] uppercase text-stone-500">Candidates</div>
              <div className="font-mono text-stone-900">{totalCandidates.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-white border border-stone-200 p-2">
              <div className="text-[10px] uppercase text-stone-500">Hidden</div>
              <div className="font-mono text-stone-900">{hiddenCount.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-white border border-stone-200 p-2">
              <div className="text-[10px] uppercase text-stone-500">Entropy</div>
              <div className="font-mono text-stone-900">{activeSnapshot?.entropy.toFixed(2) || '0.00'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="premium-card p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2 flex-1">
            <Search className="w-4 h-4 text-stone-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search token text, token id, or rank..."
              className="bg-transparent outline-none text-sm text-stone-800 flex-1"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={visibleLimit}
              onChange={event => setVisibleLimit(Number(event.target.value))}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none"
            >
              <option value={100}>Show 100</option>
              <option value={500}>Show 500</option>
              <option value={2000}>Show 2,000</option>
              <option value={10000}>Show 10,000</option>
              <option value={250000}>Show all loaded</option>
            </select>
            <select
              value={minProbability}
              onChange={event => setMinProbability(Number(event.target.value))}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none"
            >
              <option value={0}>Any probability</option>
              <option value={0.001}>p &gt;= 0.1%</option>
              <option value={0.0001}>p &gt;= 0.01%</option>
              <option value={0.00001}>p &gt;= 0.001%</option>
            </select>
          </div>
        </div>

        {!activeSnapshot ? (
          <div className="mt-4 rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-12 text-center">
            <GitBranch className="w-10 h-10 text-[#9a3412] mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-stone-900">Run a scan to reveal the complete next-token universe.</h3>
            <p className="text-sm text-stone-500 mt-2">For this model, full mode should request all {fullTarget ? fullTarget.toLocaleString() : 'available'} vocabulary entries.</p>
          </div>
        ) : (
          <div ref={parentRef} className="mt-4 h-[58vh] overflow-auto rounded-3xl border border-stone-200 bg-stone-50 custom-scrollbar">
            <div
              style={{
                height: rowVirtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualItems.map(virtualRow => {
                const alt = filteredAlternatives[virtualRow.index];
                const width = `${Math.max(2, Math.min(100, alt.probability * 100))}%`;
                return (
                  <div
                    key={`${alt.rank}-${alt.id}-${alt.token}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="px-3 py-1.5"
                  >
                    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm hover:border-[#d97757]/30 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded-lg bg-stone-100 border border-stone-200 px-2 py-1 text-[11px] font-mono text-stone-500">
                              #{alt.rank + 1}
                            </span>
                            {alt.id !== undefined && (
                              <span className="rounded-lg bg-stone-100 border border-stone-200 px-2 py-1 text-[11px] font-mono text-stone-500">
                                id {alt.id}
                              </span>
                            )}
                            <span className="font-mono text-sm text-stone-950 truncate">
                              "{tokenLabel(alt.token)}"
                            </span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-stone-100 border border-stone-200 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-[#d97757] to-[#8f5f46]" style={{ width }} />
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[10px] font-mono text-stone-500">
                            <span>p {formatPercent(alt.probability)}</span>
                            <span>logprob {alt.logprob.toFixed(4)}</span>
                            {alt.safetyTags?.filter(tag => tag !== 'normal').map(tag => (
                              <span key={tag} className="rounded-full bg-red-50 border border-red-200 px-1.5 text-red-700 uppercase">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          disabled={isBusy}
                          onClick={() => expandAlternative(alt)}
                          className="ripple-button shrink-0 rounded-xl border border-[#d97757]/25 bg-[#d97757]/10 hover:bg-[#d97757]/15 px-3 py-2 text-xs font-semibold text-[#9a3412] disabled:opacity-50"
                        >
                          Expand
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
