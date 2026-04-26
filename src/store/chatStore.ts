import { create } from 'zustand';
import { ChatSettings } from '@/types';

interface ChatState {
  activeConversationId: string | null;
  inspectedMessageId: string | null;
  selectedPhase: 'final' | 'reasoning';
  
  // Advanced UX Token state
  // Advanced UX Token state
  hoveredTokenIndex: number | null;
  lockedTokenIndex: number | null;
  isDeveloperMode: boolean;
  isFullscreenReader: boolean;
  isFullscreenAnalytics: boolean;
  isAnswerSpaceOpen: boolean;
  
  isSidebarOpen: boolean;
  isSplitView: boolean;
  globalSettings: ChatSettings;
  
  setActiveConversation: (id: string | null) => void;
  setInspectedMessage: (id: string | null, phase?: 'final' | 'reasoning') => void;
  setSelectedPhase: (phase: 'final' | 'reasoning') => void;
  setHoveredToken: (index: number | null) => void;
  setLockedToken: (index: number | null) => void;
  
  toggleDeveloperMode: () => void;
  toggleFullscreenReader: () => void;
  toggleFullscreenAnalytics: () => void;
  toggleAnswerSpace: () => void;
  openAnswerSpace: () => void;
  closeAnswerSpace: () => void;
  toggleSidebar: () => void;
  toggleSplitView: () => void;
  updateGlobalSettings: (settings: Partial<ChatSettings>) => void;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  baseUrl: 'http://localhost:1234',
  endpointPath: '/v1/responses',
  model: 'qwen/qwen3.5-9b',
  systemPrompt: '',
  temperature: 1,
  top_p: 0.95,
  top_k: 48,
  min_p: 0.05,
  presence_penalty: 1,
  repeat_penalty: 1.5,
  top_logprobs: 20,
  max_output_tokens: 2048,
  includeReasoningInContext: false,
  sampleCount: 1,
  
  // UI Display Settings
  showThinkingTagsInChat: true,
  showThinkingTagsInHeatmap: true,
  autoCollapseThinking: true,
  defaultSelectedPhase: "final",

  // Vision & Image defaults
  visionCapability: 'auto',
  maxImageDimension: 1280,
  imageQuality: 0.85,
  includeImagesInHistory: false,

  localResearchMode: true,
  showRiskLabelsOnly: true,
  allowRawBranchContinuation: true,

  llamaCppBaseUrl: 'http://127.0.0.1:8080',
  llamaCppModelAlias: 'qwen3.5-9b',
  fullVocabNProbs: 0,
  fullVocabDisplayLimit: 500,
  fullVocabPostSampling: false
};

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  inspectedMessageId: null,
  selectedPhase: 'final',
  
  hoveredTokenIndex: null,
  lockedTokenIndex: null,
  isDeveloperMode: false,
  isFullscreenReader: false,
  isFullscreenAnalytics: false,
  isAnswerSpaceOpen: false,
  
  isSidebarOpen: true,
  isSplitView: true,
  globalSettings: DEFAULT_SETTINGS,

  setActiveConversation: (id) => set({ activeConversationId: id, inspectedMessageId: null, hoveredTokenIndex: null, lockedTokenIndex: null, selectedPhase: 'final' }),
  setInspectedMessage: (id, phase) => set({ inspectedMessageId: id, hoveredTokenIndex: null, lockedTokenIndex: null, selectedPhase: phase || 'final' }),
  setSelectedPhase: (phase) => set({ selectedPhase: phase, hoveredTokenIndex: null, lockedTokenIndex: null }),
  
  setHoveredToken: (index) => set({ hoveredTokenIndex: index }),
  setLockedToken: (index) => set({ lockedTokenIndex: index }),
  
  toggleDeveloperMode: () => set((state) => ({ isDeveloperMode: !state.isDeveloperMode })),
  toggleFullscreenReader: () => set((state) => ({ isFullscreenReader: !state.isFullscreenReader })),
  toggleFullscreenAnalytics: () => set((state) => ({ isFullscreenAnalytics: !state.isFullscreenAnalytics })),
  toggleAnswerSpace: () => set((state) => ({ isAnswerSpaceOpen: !state.isAnswerSpaceOpen })),
  openAnswerSpace: () => set({ isAnswerSpaceOpen: true }),
  closeAnswerSpace: () => set({ isAnswerSpaceOpen: false }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  toggleSplitView: () => set((state) => ({ isSplitView: !state.isSplitView })),
  updateGlobalSettings: (newSettings) => set((state) => ({
    globalSettings: { ...state.globalSettings, ...newSettings }
  }))
}));
