'use client';

import { useChatStore } from '@/store/chatStore';
import { cn } from '@/lib/utils';
import { ReactNode, useEffect, useState } from 'react';
import { AnswerSpaceExplorer } from '../analytics/AnswerSpaceExplorer';
import { BrainCircuit, Cpu, Flame, Gauge, HardDrive, Moon, Server, Sun, Target } from 'lucide-react';

function ModelIdentityBar() {
  const { globalSettings, uiTheme, toggleUiTheme } = useChatStore();
  const isLlamaCpp = globalSettings.inferenceProvider === 'llamacpp';
  const modelName = isLlamaCpp
    ? (globalSettings.llamaCppModelAlias || globalSettings.model || 'qwen3.5-9b')
    : (globalSettings.model || 'Unknown model');
  const provider = isLlamaCpp
    ? 'llama.cpp Local'
    : globalSettings.baseUrl?.includes('localhost') || globalSettings.baseUrl?.includes('127.0.0.1')
      ? 'LM Studio Local'
      : 'Custom Provider';
  const quantization = (() => {
    const normalized = modelName.toLowerCase();
    if (normalized.includes('qwen3.5') || normalized.includes('qwen/qwen3.5')) return 'Q8_0';
    if (normalized.includes('qwen3.6-35b') || normalized.includes('qwen/qwen3.6')) return 'IQ4_NL';
    if (normalized.includes('gemma-4-26b') || normalized.includes('gemma4-26b')) return 'Q4_K_M';
    return 'Q4';
  })();

  const badges = [
    { label: provider, value: isLlamaCpp ? (globalSettings.llamaCppBaseUrl || 'http://127.0.0.1:8080') : (globalSettings.baseUrl || 'offline'), icon: Server, tone: 'text-stone-700 border-stone-200 bg-white/60' },
    { label: 'Quantization', value: quantization, icon: HardDrive, tone: 'text-stone-700 border-stone-200 bg-white/60' },
    { label: 'Device', value: 'CPU/GPU', icon: Cpu, tone: 'text-stone-700 border-stone-200 bg-white/60' },
    { label: 'Temp', value: globalSettings.temperature.toFixed(2), icon: Flame, tone: 'text-[#8f3d20] border-[#b96b4e]/18 bg-[#b96b4e]/8' },
    { label: 'Top-P', value: globalSettings.top_p.toFixed(2), icon: Target, tone: 'text-[#8f3d20] border-[#b96b4e]/18 bg-[#b96b4e]/8' },
  ];

  return (
    <div className="h-14 shrink-0 px-4 border-b border-stone-200/80 bg-[#fbf8f2]/88 backdrop-blur-2xl">
      <div className="h-full flex items-center gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 mr-auto">
          <div className="w-8 h-8 rounded-xl bg-[#efe4d4] border border-stone-200 flex items-center justify-center shadow-sm">
            <BrainCircuit className="w-4 h-4 text-[#8f3d20]" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.2em] text-stone-500 font-bold">Local AI observability</div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[15px] font-semibold text-stone-950 truncate max-w-[280px]">{modelName}</span>
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-stone-500">
                <Gauge className="w-3 h-3 opacity-70" />
                live inference context
              </span>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 overflow-hidden">
          {badges.map(({ label, value, icon: Icon, tone }) => (
            <div
              key={label}
              className={cn(
                'group flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] neural-border',
                tone
              )}
              title={`${label}: ${value}`}
            >
              <Icon className="w-3 h-3 opacity-75" />
              <span className="text-stone-500">{label}</span>
              <span className="font-mono font-semibold text-stone-900 max-w-[140px] truncate">{value}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={toggleUiTheme}
          title={uiTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={uiTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="theme-toggle ripple-button shrink-0 h-8 w-14 rounded-full border border-stone-200 bg-white/65 px-1 shadow-sm transition hover:bg-white"
        >
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full bg-[#efe4d4] text-[#8f3d20] shadow-sm transition-transform duration-300',
              uiTheme === 'dark' && 'translate-x-6'
            )}
          >
            {uiTheme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          </span>
        </button>
      </div>
    </div>
  );
}

export function AppLayout({
  sidebar,
  chat,
  analytics
}: {
  sidebar: ReactNode;
  chat: ReactNode;
  analytics: ReactNode;
}) {
  const { isSidebarOpen, isSplitView, uiTheme, setUiTheme } = useChatStore();
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(470);
  const [activeResize, setActiveResize] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    const savedLeft = Number(window.localStorage.getItem('logprob-left-width'));
    const savedRight = Number(window.localStorage.getItem('logprob-right-width'));
    const savedTheme = window.localStorage.getItem('logprob-ui-theme');
    if (savedLeft) setLeftWidth(Math.min(420, Math.max(240, savedLeft)));
    if (savedRight) setRightWidth(Math.min(680, Math.max(360, savedRight)));
    if (savedTheme === 'light' || savedTheme === 'dark') setUiTheme(savedTheme);
  }, [setUiTheme]);

  useEffect(() => {
    window.localStorage.setItem('logprob-ui-theme', uiTheme);
    document.documentElement.classList.toggle('dark', uiTheme === 'dark');
    document.body.classList.toggle('theme-dark', uiTheme === 'dark');
  }, [uiTheme]);

  useEffect(() => {
    if (!activeResize) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (activeResize === 'left') {
        const next = Math.min(420, Math.max(240, event.clientX));
        setLeftWidth(next);
        window.localStorage.setItem('logprob-left-width', String(next));
      } else {
        const next = Math.min(680, Math.max(360, window.innerWidth - event.clientX));
        setRightWidth(next);
        window.localStorage.setItem('logprob-right-width', String(next));
      }
    };

    const handleMouseUp = () => setActiveResize(null);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeResize]);

  return (
    <div className={cn("app-shell flex h-screen w-full overflow-hidden bg-background text-foreground", uiTheme === 'dark' && 'theme-dark dark')}>
      <div className="flex flex-col h-full w-full min-w-0">
        <ModelIdentityBar />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Navigation */}
          <div
            className={cn(
              "shrink-0 transition-[width,opacity] duration-300 ease-in-out border-r border-stone-200/80 h-full bg-[#f4ede2]/72 backdrop-blur-xl relative",
              isSidebarOpen ? "opacity-100" : "w-0 opacity-0 overflow-hidden"
            )}
            style={{ width: isSidebarOpen ? leftWidth : 0 }}
          >
            <div className="h-full flex flex-col min-h-0" style={{ width: leftWidth }}>
              {sidebar}
            </div>
            {isSidebarOpen && (
              <button
                type="button"
                aria-label="Resize navigation"
                title="Drag to resize navigation"
                onMouseDown={() => setActiveResize('left')}
                className="absolute -right-1.5 top-0 h-full w-3 cursor-col-resize group z-30"
              >
                  <span className="absolute left-1/2 top-1/2 h-14 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-300/55 group-hover:bg-[#b96b4e] transition" />
              </button>
            )}
          </div>

          {/* Primary Focus */}
          <div className="flex-1 flex flex-col h-full min-w-0 min-h-0 transition-all duration-300 bg-[#fbf8f2]">
            {chat}
          </div>

          {/* Intelligence Panel */}
          <div
            className={cn(
              "shrink-0 transition-[width,transform] duration-300 ease-in-out border-l border-stone-200/80 bg-[#f7f1e8]/82 backdrop-blur-2xl h-full z-10 shadow-[-10px_0_30px_rgba(69,52,32,0.045)] relative",
              isSplitView ? "translate-x-0" : "w-0 translate-x-full overflow-hidden"
            )}
            style={{ width: isSplitView ? rightWidth : 0 }}
          >
            {isSplitView && (
              <button
                type="button"
                aria-label="Resize intelligence panel"
                title="Drag to resize intelligence panel"
                onMouseDown={() => setActiveResize('right')}
                className="absolute -left-1.5 top-0 h-full w-3 cursor-col-resize group z-30"
              >
                <span className="absolute left-1/2 top-1/2 h-14 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-300/55 group-hover:bg-[#b96b4e] transition" />
              </button>
            )}
            <div className="h-full flex flex-col min-h-0" style={{ width: rightWidth }}>
              {analytics}
            </div>
          </div>
        </div>
      </div>  
      
      <AnswerSpaceExplorer />
    </div>
  );
}
