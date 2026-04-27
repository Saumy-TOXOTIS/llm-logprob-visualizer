'use client';

import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChatSettings, Conversation, FullVocabAlternative, FullVocabSnapshot, Message, MessageVariant } from '@/types';
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

function formatProbabilityFromLog(logProbability: number) {
  if (!Number.isFinite(logProbability)) return 'n/a';
  const log10 = logProbability / Math.LN10;
  if (log10 > -6) return formatTokenPercent(Math.exp(logProbability));
  return `10^${log10.toFixed(1)}`;
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return 'n/a';
  if (value >= 100000) return value.toExponential(2);
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function likelihoodLabel(averageProbability: number, depth: number) {
  if (depth === 0) return 'No forced path yet';
  if (averageProbability >= 0.25) return 'Natural path';
  if (averageProbability >= 0.05) return 'Plausible alternate';
  if (averageProbability >= 0.005) return 'Low-likelihood branch';
  return 'Rare forced branch';
}

function preferenceTraceLabel(score: number, depth: number) {
  if (depth === 0) return 'No path selected';
  if (score >= 85) return 'Strongly preferred route';
  if (score >= 65) return 'Model-leaning route';
  if (score >= 40) return 'Plausible but guided';
  if (score >= 15) return 'Heavily forced route';
  return 'Outside normal preference';
}

function preferenceExplanation(score: number, depth: number) {
  if (depth === 0) return 'Expand tokens to measure how much the model leans toward this answer path.';
  if (score >= 85) return 'The chosen tokens mostly sat at the top of the model distribution.';
  if (score >= 65) return 'The model often had this path near the front, but it still made some meaningful choices.';
  if (score >= 40) return 'The path is visible to the model, but several tokens had stronger alternatives above them.';
  if (score >= 15) return 'You are steering through tokens the model considered, but did not strongly prefer.';
  return 'This path exists in the vocabulary tree, but the model placed most probability mass elsewhere.';
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
  const effectiveSettings = useMemo<ChatSettings>(() => ({
    ...conversation.settings,
    ...(variant?.settingsUsed || {}),
    llamaCppBaseUrl: conversation.settings.llamaCppBaseUrl || variant?.settingsUsed?.llamaCppBaseUrl,
    llamaCppModelAlias: conversation.settings.llamaCppModelAlias || variant?.settingsUsed?.llamaCppModelAlias,
    fullVocabNProbs: conversation.settings.fullVocabNProbs,
    fullVocabDisplayLimit: conversation.settings.fullVocabDisplayLimit,
    fullVocabPostSampling: conversation.settings.fullVocabPostSampling
  }), [conversation.settings, variant?.settingsUsed]);
  const explorerConversation = useMemo<Conversation>(() => ({
    ...conversation,
    settings: effectiveSettings
  }), [conversation, effectiveSettings]);
  const [snapshots, setSnapshots] = useState<FullVocabSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading-meta' | 'scanning' | 'expanding' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [minProbability, setMinProbability] = useState(0);
  const [visibleLimit, setVisibleLimit] = useState(effectiveSettings.fullVocabDisplayLimit || 500);
  const [modelMeta, setModelMeta] = useState<{ nVocab: number; model: string; nCtxTrain: number } | null>(null);
  const [branchPrefix, setBranchPrefix] = useState('');
  const parentRef = useRef<HTMLDivElement | null>(null);

  const activeSnapshot = snapshots.find(s => s.id === activeSnapshotId) || snapshots[0] || null;
  const fullTarget = modelMeta?.nVocab || activeSnapshot?.nVocab || effectiveSettings.fullVocabNProbs || 0;
  const isBusy = status === 'loading-meta' || status === 'scanning' || status === 'expanding';
  const settingsSource = variant?.settingsUsed ? 'Original response settings' : 'Conversation settings';

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

  const timelinePoints = activePath.filter(snapshot => snapshot.selectedTokenProbability !== undefined);
  const topNextAlternatives = activeSnapshot?.alternatives.slice(0, 5) || [];
  const snapshotsById = useMemo(() => new Map(snapshots.map(snapshot => [snapshot.id, snapshot])), [snapshots]);

  const likelihoodStats = useMemo(() => {
    const scored = timelinePoints.map((snapshot, index) => {
      const probability = Math.max(snapshot.selectedTokenProbability ?? 0, 1e-300);
      const parent = snapshot.parentId ? snapshotsById.get(snapshot.parentId) : undefined;
      const parentAlternative = parent?.alternatives.find(alt => {
        if (snapshot.selectedTokenId !== undefined && alt.id !== undefined) return alt.id === snapshot.selectedTokenId;
        return alt.token === snapshot.selectedToken;
      });
      const massAbove = parentAlternative && parent
        ? parent.alternatives
            .slice(0, parentAlternative.rank)
            .reduce((sum, alt) => sum + alt.probability, 0)
        : undefined;

      return {
        snapshot,
        step: index + 1,
        probability,
        logprob: Math.log(probability),
        rank: parentAlternative ? parentAlternative.rank + 1 : undefined,
        massAbove
      };
    });

    const logProbability = scored.reduce((sum, point) => sum + point.logprob, 0);
    const averageLogProbability = scored.length ? logProbability / scored.length : 0;
    const averageProbability = scored.length ? Math.exp(averageLogProbability) : 0;
    const perplexity = scored.length ? Math.exp(-averageLogProbability) : 0;
    const weakest = scored.reduce<typeof scored[number] | null>(
      (current, point) => !current || point.probability < current.probability ? point : current,
      null
    );
    const knownPreference = scored.filter(point => point.massAbove !== undefined);
    const preferenceScore = knownPreference.length
      ? knownPreference.reduce((sum, point) => sum + Math.max(0, 1 - (point.massAbove || 0)), 0) / knownPreference.length * 100
      : 0;
    const averageMassAbove = knownPreference.length
      ? knownPreference.reduce((sum, point) => sum + (point.massAbove || 0), 0) / knownPreference.length
      : 0;
    const top1Count = scored.filter(point => point.rank === 1).length;
    const top5Count = scored.filter(point => point.rank !== undefined && point.rank <= 5).length;
    const top20Count = scored.filter(point => point.rank !== undefined && point.rank <= 20).length;
    const outsideTop20Count = scored.filter(point => point.rank !== undefined && point.rank > 20).length;
    const firstDivergence = scored.find(point => point.rank !== undefined && point.rank > 1) || null;
    const hardestForce = knownPreference.reduce<typeof knownPreference[number] | null>(
      (current, point) => !current || (point.massAbove || 0) > (current.massAbove || 0) ? point : current,
      null
    );

    return {
      depth: scored.length,
      logProbability,
      log10Probability: logProbability / Math.LN10,
      averageProbability,
      perplexity,
      weakest,
      scored,
      preferenceScore,
      averageMassAbove,
      top1Count,
      top5Count,
      top20Count,
      outsideTop20Count,
      firstDivergence,
      hardestForce,
      preferenceLabel: preferenceTraceLabel(preferenceScore, scored.length),
      preferenceExplanation: preferenceExplanation(preferenceScore, scored.length),
      label: likelihoodLabel(averageProbability, scored.length)
    };
  }, [timelinePoints, snapshotsById]);

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
    const meta = await getLlamaCppModelMeta(effectiveSettings);
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
      const nProbs = effectiveSettings.fullVocabNProbs && effectiveSettings.fullVocabNProbs > 0
        ? effectiveSettings.fullVocabNProbs
        : meta.nVocab;

      const snapshot = await fetchFullVocabSnapshot({
        conversation: explorerConversation,
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
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-mono text-stone-500">
                <span className="rounded-full border border-stone-200 bg-stone-50/80 px-2 py-1">{settingsSource}</span>
                <span className="rounded-full border border-stone-200 bg-stone-50/80 px-2 py-1">system {effectiveSettings.systemPrompt ? 'on' : 'empty'}</span>
                <span className="rounded-full border border-stone-200 bg-stone-50/80 px-2 py-1">T {effectiveSettings.temperature}</span>
                <span className="rounded-full border border-stone-200 bg-stone-50/80 px-2 py-1">Top-P {effectiveSettings.top_p}</span>
                {effectiveSettings.top_k !== undefined && (
                  <span className="rounded-full border border-stone-200 bg-stone-50/80 px-2 py-1">Top-K {effectiveSettings.top_k}</span>
                )}
                {effectiveSettings.min_p !== undefined && (
                  <span className="rounded-full border border-stone-200 bg-stone-50/80 px-2 py-1">Min-P {effectiveSettings.min_p}</span>
                )}
              </div>
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
                <div className="font-mono text-stone-950">{formatProbabilityFromLog(likelihoodStats.logProbability)}</div>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-2.5">
                <div className="text-[10px] uppercase text-stone-500">Active Entropy</div>
                <div className="font-mono text-stone-950">{activeSnapshot?.entropy.toFixed(2) || '0.00'}</div>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-[#b96b4e]/22 bg-[#b96b4e]/8 p-3.5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#8f3d20]">Path Likelihood</div>
                  <div className="mt-1 text-lg font-semibold text-stone-950">{likelihoodStats.label}</div>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-stone-500">
                    Scores the exact forced token chain you walked. This is not hidden thought frequency; it is the model&apos;s probability for this path under the current prompt and sampling settings.
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white/70 px-3 py-2 text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Joint p</div>
                  <div className="font-mono text-base text-stone-950">{formatProbabilityFromLog(likelihoodStats.logProbability)}</div>
                  <div className="font-mono text-[10px] text-stone-500">log10 {likelihoodStats.depth ? likelihoodStats.log10Probability.toFixed(2) : '0.00'}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="rounded-xl border border-stone-200 bg-white/62 p-2">
                  <div className="text-[10px] uppercase text-stone-500">Avg Token p</div>
                  <div className="font-mono text-sm text-stone-950">{likelihoodStats.depth ? formatTokenPercent(likelihoodStats.averageProbability) : 'n/a'}</div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white/62 p-2">
                  <div className="text-[10px] uppercase text-stone-500">Sum Logprob</div>
                  <div className="font-mono text-sm text-stone-950">{likelihoodStats.depth ? likelihoodStats.logProbability.toFixed(2) : 'n/a'}</div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white/62 p-2">
                  <div className="text-[10px] uppercase text-stone-500">Path Perplexity</div>
                  <div className="font-mono text-sm text-stone-950">{likelihoodStats.depth ? formatCompactNumber(likelihoodStats.perplexity) : 'n/a'}</div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white/62 p-2">
                  <div className="text-[10px] uppercase text-stone-500">Weakest Step</div>
                  <div className="font-mono text-sm text-stone-950 truncate">
                    {likelihoodStats.weakest
                      ? `#${likelihoodStats.weakest.step} ${formatTokenPercent(likelihoodStats.weakest.probability)}`
                      : 'n/a'}
                  </div>
                </div>
              </div>

              {likelihoodStats.weakest && (
                <div className="mt-2 rounded-xl border border-stone-200 bg-white/50 px-3 py-2 text-[11px] text-stone-500">
                  Weakest forced token:
                  <span className="mx-1 font-mono text-stone-950">&quot;{tokenLabel(likelihoodStats.weakest.snapshot.selectedToken || '')}&quot;</span>
                  at step {likelihoodStats.weakest.step}
                  {likelihoodStats.weakest.rank ? `, rank #${likelihoodStats.weakest.rank}` : ''}.
                </div>
              )}
            </div>

            <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50/80 p-3.5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#8f3d20]">Model Preference Trace</div>
                  <div className="mt-1 text-lg font-semibold text-stone-950">{likelihoodStats.preferenceLabel}</div>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-stone-500">
                    It's a proxy for how much the model was leaning towards this answer path. It measures rank, probability mass above your chosen tokens, and where you first left the strongest route.
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white/70 px-3 py-2 text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Preference</div>
                  <div className="font-mono text-base text-stone-950">{likelihoodStats.depth ? `${likelihoodStats.preferenceScore.toFixed(1)}/100` : 'n/a'}</div>
                  <div className="font-mono text-[10px] text-stone-500">lean score</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="rounded-xl border border-stone-200 bg-white/62 p-2">
                  <div className="text-[10px] uppercase text-stone-500">Top-1 Alignment</div>
                  <div className="font-mono text-sm text-stone-950">
                    {likelihoodStats.depth ? `${likelihoodStats.top1Count}/${likelihoodStats.depth}` : 'n/a'}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white/62 p-2">
                  <div className="text-[10px] uppercase text-stone-500">Top-5 Tokens</div>
                  <div className="font-mono text-sm text-stone-950">
                    {likelihoodStats.depth ? `${likelihoodStats.top5Count}/${likelihoodStats.depth}` : 'n/a'}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white/62 p-2">
                  <div className="text-[10px] uppercase text-stone-500">Mass Above</div>
                  <div className="font-mono text-sm text-stone-950">
                    {likelihoodStats.depth ? formatPercent(likelihoodStats.averageMassAbove) : 'n/a'}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white/62 p-2">
                  <div className="text-[10px] uppercase text-stone-500">Outside Top-20</div>
                  <div className="font-mono text-sm text-stone-950">
                    {likelihoodStats.depth ? `${likelihoodStats.outsideTop20Count}/${likelihoodStats.depth}` : 'n/a'}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
                <div className="rounded-xl border border-stone-200 bg-white/50 px-3 py-2 text-[11px] text-stone-500">
                  Divergence point:
                  {likelihoodStats.firstDivergence ? (
                    <>
                      <span className="mx-1 font-mono text-stone-950">&quot;{tokenLabel(likelihoodStats.firstDivergence.snapshot.selectedToken || '')}&quot;</span>
                      at step {likelihoodStats.firstDivergence.step}, rank #{likelihoodStats.firstDivergence.rank}.
                    </>
                  ) : likelihoodStats.depth ? (
                    <span className="ml-1 text-stone-950">no divergence from rank #1 in this traced path.</span>
                  ) : (
                    <span className="ml-1">expand a path first.</span>
                  )}
                </div>
                <div className="rounded-xl border border-stone-200 bg-white/50 px-3 py-2 text-[11px] text-stone-500">
                  Hardest forced choice:
                  {likelihoodStats.hardestForce ? (
                    <>
                      <span className="mx-1 font-mono text-stone-950">&quot;{tokenLabel(likelihoodStats.hardestForce.snapshot.selectedToken || '')}&quot;</span>
                      had {formatPercent(likelihoodStats.hardestForce.massAbove || 0)} probability mass above it.
                    </>
                  ) : likelihoodStats.depth ? (
                    <span className="ml-1 text-stone-950">not enough rank data for this path.</span>
                  ) : (
                    <span className="ml-1">expand a path first.</span>
                  )}
                </div>
              </div>

              <div className="mt-2 rounded-xl border border-stone-200 bg-white/50 px-3 py-2 text-[11px] text-stone-500">
                Interpretation: {likelihoodStats.preferenceExplanation}
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
                            {likelihoodStats.scored[index]?.rank && (
                              <span>rank #{likelihoodStats.scored[index].rank}</span>
                            )}
                            {likelihoodStats.scored[index]?.massAbove !== undefined && (
                              <span>mass above {formatPercent(likelihoodStats.scored[index].massAbove || 0)}</span>
                            )}
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
