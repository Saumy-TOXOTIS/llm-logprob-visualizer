'use client';

import { useChatStore } from '@/store/chatStore';
import { db } from '@/lib/db';
import { X, Server, Brain, Sliders, ToggleLeft, Save, Image as ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChatSettings } from '@/types';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { globalSettings, updateGlobalSettings, activeConversationId } = useChatStore();
  const [local, setLocal] = useState<ChatSettings>({ ...globalSettings });
  const [mounted, setMounted] = useState(false);
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const [dragOrigin, setDragOrigin] = useState<{
    pointerX: number;
    pointerY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const modeLabel = local.temperature <= 0.2
    ? 'Deterministic Mode'
    : local.temperature >= 0.9 || (local.sampleCount || 1) > 10
      ? 'High Creativity Mode'
      : 'Balanced Exploration Mode';
  const modeTone = modeLabel === 'Deterministic Mode'
    ? 'border-sky-400/25 bg-sky-400/10 text-sky-100'
    : modeLabel === 'High Creativity Mode'
      ? 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-100'
      : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100';

  const handleSave = async () => {
    // parse stop sequences cleanly
    let finalStop = local.stop;
    if (typeof local.stop === 'string') {
        const str = local.stop as string;
        finalStop = str.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    const updatedSettings = { ...local, stop: finalStop };
    updateGlobalSettings(updatedSettings);
    if (activeConversationId) {
      await db.conversations.update(activeConversationId, { settings: updatedSettings });
    }
    onClose();
  };

  const applyPreset = (preset: string) => {
     let newSettings = { ...local };
     switch(preset) {
        case 'deterministic':
          newSettings.temperature = 0;
          newSettings.top_p = 1;
          newSettings.top_logprobs = 20;
          newSettings.max_output_tokens = 2048;
          break;
        case 'balanced':
          newSettings.temperature = 0.7;
          newSettings.top_p = 0.95;
          newSettings.top_logprobs = 20;
          newSettings.max_output_tokens = 4096;
          break;
        case 'visible-thinking':
          newSettings.temperature = 0.7;
          newSettings.top_p = 0.95;
          newSettings.top_logprobs = 20;
          newSettings.max_output_tokens = 8192;
          break;
        case 'creative':
          newSettings.temperature = 1.0;
          newSettings.top_p = 0.95;
          newSettings.min_p = 0.05;
          newSettings.top_logprobs = 20;
          break;
        case 'low-random':
          newSettings.temperature = 0.2;
          newSettings.top_p = 0.9;
          newSettings.top_logprobs = 20;
          break;
        case 'long-analysis':
          newSettings.max_output_tokens = 12000;
          newSettings.top_logprobs = 20;
          break;
     }
     setLocal(newSettings);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!dragOrigin) return;

    const handleMouseMove = (event: MouseEvent) => {
      setModalOffset({
        x: dragOrigin.originX + event.clientX - dragOrigin.pointerX,
        y: dragOrigin.originY + event.clientY - dragOrigin.pointerY,
      });
    };

    const handleMouseUp = () => setDragOrigin(null);

    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragOrigin]);

  if (!mounted) return null;

  const modal = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-2xl z-[200] flex items-center justify-center p-6 animate-in-soft">
      <div
        className="bg-[#0b1118]/95 border border-white/10 w-full max-w-5xl rounded-[28px] shadow-[0_30px_120px_rgba(0,0,0,0.65)] flex flex-col max-h-[88vh] neural-border overflow-hidden text-zinc-100"
        style={{ transform: `translate(${modalOffset.x}px, ${modalOffset.y}px)` }}
      >
        
        {/* Header */}
        <div
          className="flex items-center justify-between p-6 border-b border-white/10 bg-gradient-to-r from-sky-400/8 via-violet-400/8 to-transparent cursor-grab active:cursor-grabbing"
          onMouseDown={(event) => {
            setDragOrigin({
              pointerX: event.clientX,
              pointerY: event.clientY,
              originX: modalOffset.x,
              originY: modalOffset.y,
            });
          }}
          title="Drag to move"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-400/20 to-violet-500/20 border border-sky-300/20 flex items-center justify-center shadow-[0_0_32px_rgba(56,189,248,0.14)]">
              <Sliders className="w-5 h-5 text-sky-200" />
            </div>
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">Lab Settings</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Tune sampling, context, limits, and multimodal behavior.</p>
            </div>
          </div>
          <button
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClose}
            className="p-2 hover:bg-white/8 rounded-2xl transition border border-transparent hover:border-white/10"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 min-h-0 bg-black/10 custom-scrollbar">
          
          <div className={`flex justify-between items-center p-4 rounded-2xl border ${modeTone}`}>
             <div>
               <div className="text-sm font-semibold">{modeLabel}</div>
               <div className="text-[11px] opacity-70 mt-0.5">Live preview of sampling posture based on temperature and sample count.</div>
             </div>
             <div className="font-mono text-xs">
               T {local.temperature.toFixed(2)} / P {local.top_p.toFixed(2)}
             </div>
          </div>

          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white/[0.045] p-4 rounded-2xl border border-white/10">
             <div className="text-sm font-medium text-zinc-300">Quick Parameter Presets</div>
             <select 
               className="bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-300 outline-none w-full md:w-56"
               onChange={(e) => applyPreset(e.target.value)}
               defaultValue="custom"
             >
                <option value="custom">Custom</option>
                <option value="deterministic">Deterministic Final Only</option>
                <option value="balanced">Balanced Probe</option>
                <option value="visible-thinking">Visible Thinking Probe</option>
                <option value="creative">Creative Branching</option>
                <option value="low-random">Low Randomness Reasoning</option>
                <option value="long-analysis">Long Analysis</option>
             </select>
          </div>

          {/* Connection Block */}
          <div className="space-y-4">
            <label className="text-xs uppercase tracking-[0.18em] font-semibold text-zinc-500 flex items-center gap-2 mb-2 pb-2">
              <Server className="w-4 h-4" /> Endpoint configuration
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
              <label className="block text-sm text-zinc-300 mb-2">Active Inference Provider</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLocal({...local, inferenceProvider: 'lmstudio'})}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    (local.inferenceProvider || 'lmstudio') === 'lmstudio'
                      ? 'border-sky-400/40 bg-sky-400/15 text-sky-100'
                      : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  <div className="text-sm font-semibold">LM Studio</div>
                  <div className="text-[11px] opacity-70">Chat via base URL + endpoint path</div>
                </button>
                <button
                  type="button"
                  onClick={() => setLocal({...local, inferenceProvider: 'llamacpp'})}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    local.inferenceProvider === 'llamacpp'
                      ? 'border-[#d97757]/50 bg-[#d97757]/15 text-orange-100'
                      : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  <div className="text-sm font-semibold">llama.cpp</div>
                  <div className="text-[11px] opacity-70">Chat + universe via llama-server</div>
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Base URL</label>
                <input 
                  type="text" 
                  value={local.baseUrl} 
                  onChange={(e) => setLocal({...local, baseUrl: e.target.value})}
                  className="w-full bg-black/40 border border-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Target Model</label>
                <div className="flex bg-black/40 border border-border rounded-lg focus-within:border-blue-500 transition">
                  <input 
                    type="text" 
                    value={local.model} 
                    onChange={(e) => setLocal({...local, model: e.target.value})}
                    className="flex-1 bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none w-full"
                    placeholder="Type model id..."
                  />
                  <select 
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        setLocal({...local, model: e.target.value});
                      }
                    }}
                    value={['qwen/qwen3.6-35b-a3b', 'google/gemma-4-26b-a4b'].includes(local.model) ? local.model : 'custom'}
                    className="bg-zinc-800 text-zinc-300 border-l border-border px-2 py-2 text-sm rounded-r-lg outline-none max-w-[100px]"
                  >
                    <option value="qwen/qwen3.6-35b-a3b">Qwen 35B</option>
                    <option value="google/gemma-4-26b-a4b">Gemma 26B</option>
                    <option value="custom">Custom...</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Endpoint Path</label>
              <div className="flex bg-black/40 border border-border rounded-lg focus-within:border-blue-500 transition">
                 <input 
                   type="text" 
                   value={local.endpointPath} 
                   onChange={(e) => setLocal({...local, endpointPath: e.target.value})}
                   className="flex-1 bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none font-mono text-[13px] w-full"
                   placeholder="/v1/responses"
                 />
                 <select 
                   onChange={(e) => {
                     if (e.target.value !== 'custom') {
                       setLocal({...local, endpointPath: e.target.value});
                     }
                   }}
                   value={['/v1/responses', '/v1/chat/completions', '/v1/completions'].includes(local.endpointPath) ? local.endpointPath : 'custom'}
                   className="bg-zinc-800 text-zinc-300 border-l border-border px-2 py-2 text-sm rounded-r-lg outline-none max-w-[150px]"
                 >
                   <option value="/v1/responses">/v1/responses</option>
                   <option value="/v1/chat/completions">/v1/chat/completions</option>
                   <option value="/v1/completions">/v1/completions</option>
                   <option value="custom">Custom...</option>
                 </select>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d97757]/25 bg-[#d97757]/10 p-4 space-y-4">
              <div>
                <div className="text-sm font-semibold text-[#fed7aa]">llama.cpp Full Universe Backend</div>
                <div className="text-[11px] text-orange-100/70 mt-1">
                  Used only by the Full Universe explorer. Normal chat can stay on LM Studio.
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">llama.cpp Base URL</label>
                  <input
                    type="text"
                    value={local.llamaCppBaseUrl || 'http://127.0.0.1:8080'}
                    onChange={(e) => setLocal({...local, llamaCppBaseUrl: e.target.value})}
                    className="w-full bg-black/40 border border-[#d97757]/20 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-[#d97757] outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">llama.cpp Model Alias</label>
                  <input
                    type="text"
                    value={local.llamaCppModelAlias || 'qwen3.5-9b'}
                    onChange={(e) => setLocal({...local, llamaCppModelAlias: e.target.value})}
                    className="w-full bg-black/40 border border-[#d97757]/20 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-[#d97757] outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Full Vocab n_probs</label>
                  <input
                    type="number"
                    placeholder="0 = auto n_vocab"
                    value={local.fullVocabNProbs || 0}
                    onChange={(e) => setLocal({...local, fullVocabNProbs: parseInt(e.target.value) || 0})}
                    className="w-full bg-black/40 border border-[#d97757]/20 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-[#d97757] outline-none transition font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Default Visible Rows</label>
                  <input
                    type="number"
                    value={local.fullVocabDisplayLimit || 500}
                    onChange={(e) => setLocal({...local, fullVocabDisplayLimit: parseInt(e.target.value) || 500})}
                    className="w-full bg-black/40 border border-[#d97757]/20 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-[#d97757] outline-none transition font-mono"
                  />
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-[#d97757]/20 bg-black/20 p-3 text-sm text-orange-100">
                <span>Use post-sampling probabilities</span>
                <input
                  type="checkbox"
                  checked={local.fullVocabPostSampling ?? false}
                  onChange={(e) => setLocal({...local, fullVocabPostSampling: e.target.checked})}
                  className="accent-[#d97757]"
                />
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs uppercase tracking-[0.18em] font-semibold text-zinc-500 flex items-center gap-2 mb-2 pb-2">
              <ToggleLeft className="w-4 h-4" /> UI & Context Handling
            </label>

            <div className="rounded-2xl border border-[#d97757]/25 bg-[#d97757]/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col pr-4">
                  <span className="text-sm font-semibold text-[#7c2d12]">Local Research Mode</span>
                  <span className="text-[11px] text-stone-600 mt-1">Show all observed branch labels as metadata and expose raw local continuation controls.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" checked={local.localResearchMode ?? true} onChange={(e) => setLocal({...local, localResearchMode: e.target.checked})} className="sr-only peer" />
                  <div className="w-9 h-5 bg-stone-300 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#d97757]"></div>
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white/60 p-3 text-sm text-stone-700">
                  <span>Risk labels only</span>
                  <input type="checkbox" checked={local.showRiskLabelsOnly ?? true} onChange={(e) => setLocal({...local, showRiskLabelsOnly: e.target.checked})} className="accent-[#d97757]" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white/60 p-3 text-sm text-stone-700">
                  <span>Raw branch continuation</span>
                  <input type="checkbox" checked={local.allowRawBranchContinuation ?? true} onChange={(e) => setLocal({...local, allowRawBranchContinuation: e.target.checked})} className="accent-[#d97757]" />
                </label>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 h-full">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                <span className="text-sm text-zinc-300">Show &lt;think&gt; tags in Chat</span>
                <input type="checkbox" checked={local.showThinkingTagsInChat} onChange={(e) => setLocal({...local, showThinkingTagsInChat: e.target.checked})} className="accent-blue-500" />
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                <span className="text-sm text-zinc-300">Collapse Thinking by Default</span>
                <input type="checkbox" checked={local.autoCollapseThinking} onChange={(e) => setLocal({...local, autoCollapseThinking: e.target.checked})} className="accent-blue-500" />
              </div>
            </div>
            
            <div className="flex flex-col gap-3 p-4 mt-2 rounded-xl border border-amber-500/10 bg-amber-500/5">
                <div className="flex items-center justify-between">
                   <div className="flex flex-col pr-4">
                      <span className="text-sm font-semibold text-amber-400">Include Reasoning in Context</span>
                      <span className="text-[10px] text-amber-500/60 mt-1">If enabled, model's past thinking blocks are fed back into subsequent conversation queries. Generally disabled to save context window space.</span>
                   </div>
                   <label className="relative inline-flex items-center cursor-pointer shrink-0">
                     <input type="checkbox" checked={local.includeReasoningInContext} onChange={(e) => setLocal({...local, includeReasoningInContext: e.target.checked})} className="sr-only peer" />
                     <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                   </label>
                </div>
            </div>
            <p className="text-[11px] text-amber-500/70 italic px-2">Note: To capture true visible reasoning logprobs, LM Studio must have Reasoning Section Parsing disabled for the model.</p>
          </div>

          {/* Vision & Image Block */}
          <div className="space-y-4">
            <label className="text-xs uppercase tracking-[0.18em] font-semibold text-zinc-500 flex items-center gap-2 mb-2 pb-2">
              <ImageIcon className="w-4 h-4" /> Vision & Image Input
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col">
                <label className="text-xs text-zinc-400 mb-1">Vision Capability</label>
                <select
                  value={local.visionCapability || 'auto'}
                  onChange={e => setLocal({...local, visionCapability: e.target.value as any})}
                  className="w-full bg-black/40 border border-border rounded px-3 py-1.5 text-sm outline-none"
                >
                  <option value="auto">Auto</option>
                  <option value="vision-capable">Vision-Capable</option>
                  <option value="text-only">Text Only</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-zinc-400">Max Image Dim</label>
                  <span className="text-xs font-mono text-zinc-300">{local.maxImageDimension || 1280}px</span>
                </div>
                <input type="range" min="256" max="4096" step="128" value={local.maxImageDimension || 1280} onChange={(e) => setLocal({...local, maxImageDimension: parseInt(e.target.value)})} className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-zinc-400">JPEG Quality</label>
                  <span className="text-xs font-mono text-zinc-300">{(local.imageQuality || 0.85).toFixed(2)}</span>
                </div>
                <input type="range" min="0.1" max="1" step="0.05" value={local.imageQuality || 0.85} onChange={(e) => setLocal({...local, imageQuality: parseFloat(e.target.value)})} className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex flex-col pr-4">
                <span className="text-sm text-zinc-300">Include Images in History</span>
                <span className="text-[10px] text-zinc-500 mt-0.5">Send image data in all conversation turns, not just the latest. Uses more context window.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" checked={local.includeImagesInHistory || false} onChange={(e) => setLocal({...local, includeImagesInHistory: e.target.checked})} className="sr-only peer" />
                <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>
          </div>

          {/* Behavior Block */}
          <div className="space-y-4">
            <label className="text-xs uppercase tracking-[0.18em] font-semibold text-zinc-500 flex items-center gap-2 mb-2 pb-2">
              <Brain className="w-4 h-4" /> Sampling Execution Parameters
            </label>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Globally Injected System Prompt</label>
              <textarea 
                value={local.systemPrompt} 
                onChange={(e) => setLocal({...local, systemPrompt: e.target.value})}
                rows={2}
                className="w-full bg-black/40 border border-border rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition custom-scrollbar resize-none"
              />
            </div>

            {/* Slider Configs */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 pt-2">
               <div className="space-y-1">
                 <div className="flex justify-between items-center"><label className="text-sm text-zinc-300">Temperature</label><span className="text-xs font-mono">{local.temperature}</span></div>
                 <input type="range" min="0" max="2" step="0.05" value={local.temperature} onChange={(e) => setLocal({...local, temperature: parseFloat(e.target.value)})} className="premium-range w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
               </div>
               
               <div className="space-y-1">
                 <div className="flex justify-between items-center"><label className="text-sm text-zinc-300">Top P</label><span className="text-xs font-mono">{local.top_p}</span></div>
                 <input type="range" min="0" max="1" step="0.01" value={local.top_p} onChange={(e) => setLocal({...local, top_p: parseFloat(e.target.value)})} className="premium-range w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer" />
               </div>

               <div className="space-y-1">
                 <div className="flex justify-between items-center z">
                   <label className="text-sm text-zinc-300 flex items-center gap-2">
                      <input type="checkbox" checked={local.min_p !== undefined} onChange={e => setLocal({...local, min_p: e.target.checked ? 0.05 : undefined})} className="accent-blue-500" /> Min P
                   </label>
                   <span className="text-xs font-mono">{local.min_p ?? 'n/a'}</span>
                 </div>
                 <input type="range" min="0" max="1" step="0.01" value={local.min_p || 0} disabled={local.min_p === undefined} onChange={(e) => setLocal({...local, min_p: parseFloat(e.target.value)})} className="premium-range w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer disabled:opacity-30" />
               </div>

               <div className="space-y-1">
                 <div className="flex justify-between items-center">
                   <label className="text-sm text-zinc-300 flex items-center gap-2">
                      <input type="checkbox" checked={local.top_k !== undefined} onChange={e => setLocal({...local, top_k: e.target.checked ? 40 : undefined})} className="accent-blue-500" /> Top K
                   </label>
                   <span className="text-xs font-mono">{local.top_k ?? 'n/a'}</span>
                 </div>
                 <input type="range" min="0" max="150" step="1" value={local.top_k || 0} disabled={local.top_k === undefined} onChange={(e) => setLocal({...local, top_k: parseInt(e.target.value)})} className="premium-range w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer disabled:opacity-30" />
               </div>

               <div className="space-y-1">
                 <div className="flex justify-between items-center">
                   <label className="text-sm text-zinc-300 flex items-center gap-2">
                      <input type="checkbox" checked={local.presence_penalty !== undefined} onChange={e => setLocal({...local, presence_penalty: e.target.checked ? 0 : undefined})} className="accent-blue-500" /> Presence Pen.
                   </label>
                   <span className="text-xs font-mono">{local.presence_penalty ?? 'n/a'}</span>
                 </div>
                 <input type="range" min="-2" max="2" step="0.05" value={local.presence_penalty || 0} disabled={local.presence_penalty === undefined} onChange={(e) => setLocal({...local, presence_penalty: parseFloat(e.target.value)})} className="premium-range w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer disabled:opacity-30" />
               </div>

               <div className="space-y-1">
                 <div className="flex justify-between items-center">
                   <label className="text-sm text-zinc-300 flex items-center gap-2">
                      <input type="checkbox" checked={local.repeat_penalty !== undefined} onChange={e => setLocal({...local, repeat_penalty: e.target.checked ? 1.0 : undefined})} className="accent-blue-500" /> Repeat Pen.
                   </label>
                   <span className="text-xs font-mono">{local.repeat_penalty ?? 'n/a'}</span>
                 </div>
                 <input type="range" min="0.8" max="2" step="0.05" value={local.repeat_penalty || 1} disabled={local.repeat_penalty === undefined} onChange={(e) => setLocal({...local, repeat_penalty: parseFloat(e.target.value)})} className="premium-range w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer disabled:opacity-30" />
               </div>
            </div>

            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-border/50">
               <div className="flex flex-col">
                  <label className="text-xs text-zinc-400 mb-1">Max Output Tokens</label>
                  <input type="number" value={local.max_output_tokens} onChange={e => setLocal({...local, max_output_tokens: parseInt(e.target.value)||0})} className="w-full bg-black/40 border border-border rounded px-3 py-1.5 text-sm outline-none" />
               </div>
               <div className="flex flex-col">
                  <label className="text-xs text-zinc-400 mb-1">Max Context Tokens</label>
                  <input type="number" placeholder="none" value={local.max_context_tokens || ''} onChange={e => setLocal({...local, max_context_tokens: parseInt(e.target.value)||undefined})} className="w-full bg-black/40 border border-border rounded px-3 py-1.5 text-sm outline-none" />
               </div>
               <div className="flex flex-col">
                  <label className="text-xs text-zinc-400 mb-1">Top Logprobs Captured</label>
                  <input type="number" value={local.top_logprobs} onChange={e => setLocal({...local, top_logprobs: parseInt(e.target.value)||0})} className="w-full bg-black/40 border border-border rounded px-3 py-1.5 text-sm outline-none font-mono text-blue-400" />
               </div>
               <div className="flex flex-col">
                  <label className="text-xs text-emerald-400 mb-1">Explore Samples</label>
                  <select 
                     value={local.sampleCount || 1} 
                     onChange={e => setLocal({...local, sampleCount: parseInt(e.target.value)||1})} 
                     className="w-full bg-black/40 border border-emerald-500/30 rounded px-3 py-1.5 text-sm outline-none font-mono text-emerald-300"
                  >
                     <option value={1}>1 Sample</option>
                     <option value={5}>5 Samples</option>
                     <option value={10}>10 Samples</option>
                     <option value={25}>25 Samples</option>
                     <option value={50}>50 Samples</option>
                  </select>
               </div>
            </div>

            <div>
              <label className="flex text-sm text-zinc-400 mb-2 justify-between">Stop Sequences <span className="text-[10px] opacity-60">Comma separated array elements</span></label>
              <input 
                value={Array.isArray(local.stop) ? local.stop.join(', ') : local.stop || ''} 
                onChange={(e) => setLocal({...local, stop: e.target.value as any})}
                placeholder="stop strings..."
                className="w-full bg-black/40 border border-border rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition"
              />
            </div>
            
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-black/20">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition">
            Cancel
          </button>
          <button onClick={handleSave} className="ripple-button flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 rounded-2xl text-sm text-white font-medium shadow-lg shadow-sky-900/20 transition">
            <Save className="w-4 h-4" /> Save Lab Settings
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
