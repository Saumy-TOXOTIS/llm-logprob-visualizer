'use client';

import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Conversation, FullVocabAlternative, FullVocabSnapshot, Message, MessageVariant } from '@/types';
import { fetchFullVocabSnapshot, getLlamaCppModelMeta } from '@/lib/llamacpp/api';
import { db } from '@/lib/db';
import { formatPercent } from '@/lib/utils';
import { Activity, Clipboard, DatabaseZap, GitBranch, Loader2, Search, Sparkles, Split, TrendingDown, Zap } from 'lucide-react';

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

function formatTokenPercent(value?: number) {
  if (value === undefined) return 'root';
  if (value === 0) return '0%';
  if (value < 0.0001) return '<0.01%';
  return formatPercent(value);
}

function pathCumulativeProbability(path: FullVocabSnapshot[]) {
  return path.reduce((acc, snapshot) => acc * Math.max(snapshot.selectedTokenProbability ?? 1, 1e-12), 1);
}

function TreeNode({
  node,
  childrenByParent,
  activeSnapshotId,
  onSelect,
  depth = 0,
}: {
  node: FullVocabSnapshot;
  childrenByParent: Map<string, FullVocabSnapshot[]>;
  activeSnapshotId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  const children = childrenByParent.get(node.id) || [];
  const isActive = node.id === activeSnapshotId;
  const label = node.selectedToken ? tokenLabel(node.selectedToken) : 'Root scan';
  const probability = node.selectedTokenProbability;

  return (
    <div className="relative">
      <button
        onClick={() => onSelect(node.id)}
        className={`group w-full rounded-xl border p-2.5 text-left transition ${
          isActive
            ? 'border-[#b96b4e]/32 bg-[#b96b4e]/8 shadow-[0_8px_22px_rgba(185,107,78,0.09)]'
            : 'border-stone-200 bg-white hover:border-[#b96b4e]/25 hover:bg-[#fffaf2]'
        }`}
        style={{ marginLeft: depth ? 18 : 0 }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-sm text-stone-950 truncate">"{label}"</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-mono text-stone-500">
              <span>p {formatTokenPercent(probability)}</span>
              <span>entropy {node.entropy.toFixed(2)}</span>
              <span>{node.alternatives.length.toLocaleString()} candidates</span>
            </div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-mono text-stone-500">
            {children.length} child{children.length === 1 ? '' : 'ren'}
          </div>
        </div>
      </button>
      {children.length > 0 && (
        <div className="relative mt-2 space-y-2 before:absolute before:left-[10px] before:top-0 before:bottom-0 before:w-px before:bg-stone-200">
          {children.map(child => (
            <div key={child.id} className="relative before:absolute before:left-[10px] before:top-6 before:w-5 before:h-px before:bg-stone-200">
              <TreeNode
                node={child}
                childrenByParent={childrenByParent}
                activeSnapshotId={activeSnapshotId}
                onSelect={onSelect}
                depth={depth + 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

  const childrenByParent = useMemo(() => {
    const map = new Map<string, FullVocabSnapshot[]>();
    snapshots.forEach(snapshot => {
      if (!snapshot.parentId) return;
      const current = map.get(snapshot.parentId) || [];
      current.push(snapshot);
      current.sort((a, b) => (b.selectedTokenProbability || 0) - (a.selectedTokenProbability || 0));
      map.set(snapshot.parentId, current);
    });
    return map;
  }, [snapshots]);

  const rootSnapshots = useMemo(
    () => snapshots.filter(snapshot => !snapshot.parentId).sort((a, b) => a.createdAt - b.createdAt),
    [snapshots]
  );

  const activePath = useMemo(() => {
    if (!activeSnapshot) return [];
    const byId = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
    const path: FullVocabSnapshot[] = [];
    let cursor: FullVocabSnapshot | undefined = activeSnapshot;
    while (cursor) {
      path.unshift(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return path;
  }, [activeSnapshot, snapshots]);

  const cumulativeProbability = useMemo(() => pathCumulativeProbability(activePath), [activePath]);
  const timelinePoints = activePath.filter(snapshot => snapshot.selectedTokenProbability !== undefined);
  const topNextAlternatives = activeSnapshot?.alternatives.slice(0, 5) || [];

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
  const copyBranchPath = () => {
    const text = activeSnapshot?.generatedPrefix || '';
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <div className="premium-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] font-bold text-[#8f3d20]">
                <Sparkles className="w-3.5 h-3.5" />
                Full Vocabulary Universe
              </div>
              <h3 className="text-xl font-semibold text-stone-950 mt-2">No-limit next-token explorer</h3>
              <p className="text-sm text-stone-500 mt-2 max-w-2xl">
                Uses llama.cpp native /completion with n_probs equal to the model vocabulary size, then expands branches one token at a time.
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2.5 text-right shrink-0">
              <div className="text-[10px] uppercase tracking-[0.16em] text-stone-500">Target</div>
              <div className="font-mono text-base text-stone-950">{fullTarget ? fullTarget.toLocaleString() : 'auto'}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-4">
            <button
              disabled={isBusy}
              onClick={scanRoot}
              className="ripple-button rounded-xl border border-[#b96b4e]/22 bg-[#b96b4e]/8 hover:bg-[#b96b4e]/12 px-3 py-2.5 text-left transition disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 text-[#8f3d20] mb-2" />
              <div className="text-sm font-semibold text-stone-900">Scan First Token</div>
              <div className="text-[11px] text-stone-500">Start from assistant turn</div>
            </button>
            <button
              disabled={isBusy || !(variant?.finalText || variant?.content)}
              onClick={scanAfterCurrentOutput}
              className="ripple-button rounded-xl border border-stone-200 bg-white hover:bg-stone-50 px-3 py-2.5 text-left transition disabled:opacity-50"
            >
              <Split className="w-3.5 h-3.5 text-stone-600 mb-2" />
              <div className="text-sm font-semibold text-stone-900">Scan After Output</div>
              <div className="text-[11px] text-stone-500">Probe the current tail</div>
            </button>
            <button
              disabled={isBusy}
              onClick={loadModelMeta}
              className="ripple-button rounded-xl border border-stone-200 bg-white hover:bg-stone-50 px-3 py-2.5 text-left transition disabled:opacity-50"
            >
              <DatabaseZap className="w-3.5 h-3.5 text-stone-600 mb-2" />
              <div className="text-sm font-semibold text-stone-900">Refresh Model</div>
              <div className="text-[11px] text-stone-500">{modelMeta?.model || 'Read /v1/models'}</div>
            </button>
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2.5">
              <Activity className="w-3.5 h-3.5 text-stone-600 mb-2" />
              <div className="text-sm font-semibold text-stone-900">
                {activeSnapshot ? formatMass(activeSnapshot.topProbabilityMass) : '0.00%'} mass
              </div>
              <div className="text-[11px] text-stone-500">returned distribution</div>
            </div>
          </div>

          {isBusy && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#b96b4e]/20 bg-[#b96b4e]/8 px-3 py-2.5 text-sm text-[#8f3d20]">
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

        <div className="premium-card p-4">
          <div className="text-xs uppercase tracking-[0.18em] font-bold text-stone-500">Branch Path</div>
          <div className="mt-3 min-h-24 rounded-xl border border-stone-200 bg-stone-50/80 p-3.5 font-mono text-sm text-stone-800 whitespace-pre-wrap break-words">
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

      {snapshots.length > 0 && (
        <div className="grid grid-cols-1 2xl:grid-cols-[0.95fr_1.05fr] gap-4">
        <div className="premium-card p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] font-bold text-[#8f3d20]">
                  <GitBranch className="w-3.5 h-3.5" />
                  Branch Tree Map
                </div>
                <p className="text-sm text-stone-500 mt-1">Every expanded token becomes a navigable decision node.</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-right">
                <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Nodes</div>
                <div className="font-mono text-stone-950">{snapshots.length}</div>
              </div>
            </div>
            <div className="max-h-[420px] overflow-auto custom-scrollbar rounded-xl border border-stone-200 bg-stone-50/55 p-2.5 space-y-2">
              {rootSnapshots.map(root => (
                <TreeNode
                  key={root.id}
                  node={root}
                  childrenByParent={childrenByParent}
                  activeSnapshotId={activeSnapshotId}
                  onSelect={setActiveSnapshotId}
                />
              ))}
            </div>
          </div>

          <div className="premium-card p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] font-bold text-[#8f3d20]">
                  <TrendingDown className="w-3.5 h-3.5" />
                  Probability Timeline
                </div>
                <p className="text-sm text-stone-500 mt-1">Tracks confidence decay as you force a branch token by token.</p>
              </div>
              <button
                onClick={copyBranchPath}
                disabled={!activeSnapshot?.generatedPrefix}
                className="ripple-button rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50 flex items-center gap-2"
              >
                <Clipboard className="w-3.5 h-3.5" />
                Copy Path
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-2.5">
                <div className="text-[10px] uppercase text-stone-500">Depth</div>
                <div className="font-mono text-stone-950">{timelinePoints.length}</div>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-2.5">
                <div className="text-[10px] uppercase text-stone-500">Path Probability</div>
                <div className="font-mono text-stone-950">{formatTokenPercent(cumulativeProbability)}</div>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-2.5">
                <div className="text-[10px] uppercase text-stone-500">Active Entropy</div>
                <div className="font-mono text-stone-950">{activeSnapshot?.entropy.toFixed(2) || '0.00'}</div>
              </div>
            </div>

            {timelinePoints.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/80 p-7 text-center text-sm text-stone-500">
                Expand a token to start the probability timeline.
              </div>
            ) : (
              <div className="space-y-3 max-h-[350px] overflow-auto custom-scrollbar pr-1">
                {timelinePoints.map((snapshot, index) => {
                  const runningPath = activePath.slice(0, activePath.indexOf(snapshot) + 1);
                  const runningProbability = pathCumulativeProbability(runningPath);
                  const probability = snapshot.selectedTokenProbability || 0;
                  return (
                    <button
                      key={snapshot.id}
                      onClick={() => setActiveSnapshotId(snapshot.id)}
                      className={`w-full rounded-xl border p-2.5 text-left transition ${
                        snapshot.id === activeSnapshotId
                          ? 'border-[#b96b4e]/32 bg-[#b96b4e]/8'
                          : 'border-stone-200 bg-white hover:border-[#b96b4e]/25'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="rounded-lg bg-stone-100 border border-stone-200 px-2 py-1 text-[10px] font-mono text-stone-500">
                              step {index + 1}
                            </span>
                            <span className="font-mono text-sm text-stone-950 truncate">
                              "{tokenLabel(snapshot.selectedToken || '')}"
                            </span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-stone-100 border border-stone-200 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#c87556] to-[#7c6559]"
                              style={{ width: `${Math.max(2, Math.min(100, probability * 100))}%` }}
                            />
                          </div>
                          <div className="mt-1 flex flex-wrap gap-3 text-[10px] font-mono text-stone-500">
                            <span>selected p {formatTokenPercent(probability)}</span>
                            <span>cumulative {formatTokenPercent(runningProbability)}</span>
                            <span>entropy after token {snapshot.entropy.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500">token id</div>
                          <div className="font-mono text-xs text-stone-900">{snapshot.selectedTokenId ?? 'n/a'}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {topNextAlternatives.length > 0 && (
              <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50/80 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-stone-500 mb-2">Top next moves from active node</div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                  {topNextAlternatives.map(alt => (
                    <button
                      key={`${alt.rank}-${alt.id}-${alt.token}`}
                      onClick={() => expandAlternative(alt)}
                      disabled={isBusy}
                      className="rounded-xl border border-stone-200 bg-white hover:border-[#b96b4e]/30 p-2 text-left transition disabled:opacity-50"
                    >
                      <div className="font-mono text-xs text-stone-950 truncate">"{tokenLabel(alt.token)}"</div>
                      <div className="text-[10px] font-mono text-stone-500 mt-1">{formatPercent(alt.probability)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="premium-card p-3.5">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 flex-1">
            <Search className="w-3.5 h-3.5 text-stone-400" />
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
          <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-stone-50/80 p-10 text-center">
            <GitBranch className="w-8 h-8 text-[#8f3d20] mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-stone-900">Run a scan to reveal the complete next-token universe.</h3>
            <p className="text-sm text-stone-500 mt-2">For this model, full mode should request all {fullTarget ? fullTarget.toLocaleString() : 'available'} vocabulary entries.</p>
          </div>
        ) : (
          <div ref={parentRef} className="mt-4 h-[58vh] overflow-auto rounded-xl border border-stone-200 bg-stone-50/80 custom-scrollbar">
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
                    <div className="rounded-xl border border-stone-200 bg-white p-2.5 shadow-sm hover:border-[#b96b4e]/30 transition">
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
                            <div className="h-full rounded-full bg-gradient-to-r from-[#c87556] to-[#7c6559]" style={{ width }} />
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
                          className="ripple-button shrink-0 rounded-lg border border-[#b96b4e]/22 bg-[#b96b4e]/8 hover:bg-[#b96b4e]/12 px-3 py-2 text-xs font-semibold text-[#8f3d20] disabled:opacity-50"
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
