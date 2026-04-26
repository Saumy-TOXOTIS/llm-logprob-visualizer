export interface ImageAttachment {
  id: string;
  name: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  size: number;
  width: number;
  height: number;
  dataUrl: string;
  base64: string;
}

export interface GenerationSettings {
  baseUrl: string;
  endpointPath: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  top_p: number;
  top_logprobs: number;
  max_output_tokens: number;
  max_context_tokens?: number;
  top_k?: number;
  min_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  repeat_penalty?: number;
  seed?: number;
  stop?: string[];
  includeReasoningInContext: boolean;
  sampleCount?: number;
  
  // Vision & Image settings
  visionCapability?: 'text-only' | 'vision-capable' | 'auto';
  maxImageDimension?: number;
  imageQuality?: number;
  includeImagesInHistory?: boolean;

  // Local research mode
  localResearchMode?: boolean;
  showRiskLabelsOnly?: boolean;
  allowRawBranchContinuation?: boolean;

  // llama.cpp full-vocabulary observability
  llamaCppBaseUrl?: string;
  llamaCppModelAlias?: string;
  fullVocabNProbs?: number;
  fullVocabDisplayLimit?: number;
  fullVocabPostSampling?: boolean;
}

export interface ChatSettings extends GenerationSettings {
  baseUrl: string;
  endpointPath: string;
  model: string;
  systemPrompt: string;
  
  // UI Display Settings
  showThinkingTagsInChat: boolean;
  showThinkingTagsInHeatmap: boolean;
  autoCollapseThinking: boolean;
  defaultSelectedPhase: "final" | "reasoning" | "last";
}

export interface TokenStats {
  averageConfidence: number;
  lowConfidenceCount: number;
  nonTopCount: number;
  averageEntropy: number;
  hesitationCount: number;
}

export type SafetyTag = "violence" | "self-harm" | "cyber" | "illegal" | "hate/harassment" | "sexual" | "medical/legal/financial high-stakes" | "normal";

export type BranchExplorationMode = "raw_continuation" | "normal" | "safe_analysis" | "local_preview";

export interface BranchingAlternative {
  token: string;
  logprob: number;
  probability: number;
  safetyTags?: SafetyTag[];
}

export interface ParsedToken {
  token: string;
  logprob: number;
  probability: number;
  top_logprobs: BranchingAlternative[];
  rank: number; // 0 for top choice
  bestAlternative?: BranchingAlternative;
  entropy: number;
  confidenceBand: 'high' | 'medium' | 'low';
  marginToBest: number;
}

export interface ParsedResponse {
  finalText: string;
  reasoningText: string;
  finalTokens: ParsedToken[];
  reasoningTokens: ParsedToken[];
  hasFinalText: boolean;
  hasReasoningText: boolean;
  hasFinalLogprobs: boolean;
  hasReasoningLogprobs: boolean;
  closingMarkerFound: boolean;
  closingMarkerUsed: string | null;
  closingMarkerIndex: number;
  thinkingSource: "qwen-think-tags" | "gemma-channel-thought" | "custom" | "heuristic" | "none";
  warnings: string[];
  rawOutputTypes: string[];
}

export interface ContentPart {
  id: string;
  text?: string;
  finalText: string;
  reasoningText?: string;
  rawResponse?: any;
  parsedLogprobs?: ParsedToken[];
  parsed?: ParsedResponse;
  stats?: TokenStats;
  reasoningStats?: TokenStats;
  createdAt: number;
  finishReason?: string;
  incompleteDetails?: any;
}

export interface MessageVariant {
  id: string;
  content: string; // The merged content of all parts
  finalText?: string;
  reasoningText?: string;
  contentParts?: ContentPart[];
  rawResponse?: any; // Deprecated by contentParts but kept for backward compatibility if needed
  parsedLogprobs?: ParsedToken[]; // Merged parsed logprobs
  parsed?: ParsedResponse; // For simple tracking before merging
  stats?: TokenStats; // Merged token stats
  reasoningStats?: TokenStats;
  createdAt: number;
  settingsUsed?: GenerationSettings;
  requestPayload?: any;
}

export interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string; // The clean original text
  sentContent?: string; // The possibly mutated text sent to API
  images?: ImageAttachment[]; // Attached images for multimodal
  createdAt: number;
  status: 'complete' | 'generating' | 'error';
  variants?: MessageVariant[];
  activeVariantId?: string;
  
  // Audit properties for request body builder
  settingsUsed?: GenerationSettings;
}

export interface Conversation {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  systemPrompt: string;
  settings: ChatSettings;
  messages: Message[];
}

export interface BranchNode {
  id: string;
  parentId?: string;
  conversationId: string;
  messageId: string;
  variantId?: string;
  tokenIndex: number;
  prefix: string;
  chosenToken: string;
  alternativeToken: string;
  probability: number;
  logprob: number;
  rank: number;
  entropy: number;
  cumulativeProbability: number;
  visibleProbabilityMass: number;
  hiddenTailMass: number;
  safetyTags: SafetyTag[];
  mode: BranchExplorationMode;
  continuationText: string;
  createdAt: number;
  status: "preview" | "complete" | "error";
  error?: string;
}

export interface FullVocabAlternative {
  id?: number;
  token: string;
  bytes?: number[];
  logprob: number;
  probability: number;
  rank: number;
  safetyTags?: SafetyTag[];
}

export interface FullVocabSnapshot {
  id: string;
  conversationId: string;
  messageId: string;
  variantId?: string;
  parentId?: string;
  prompt: string;
  generatedPrefix: string;
  selectedToken?: string;
  selectedTokenId?: number;
  selectedTokenProbability?: number;
  nVocab: number;
  nProbs: number;
  postSampling: boolean;
  alternatives: FullVocabAlternative[];
  topProbabilityMass: number;
  entropy: number;
  createdAt: number;
  timings?: any;
  rawContent?: string;
}

// -------------------------------------------------------------
// Answer Space Explorer Advanced Typings
// -------------------------------------------------------------

export interface AnswerSample {
  id: string;
  text: string;
  thinkingText?: string;
  finalText?: string;
  tokens: ParsedToken[];
  stats: TokenStats;
  settingsUsed: GenerationSettings;
  seed?: number;
  rawResponse: any;
}

export interface BranchSample {
  id: string;
  parentSampleId: string;
  branchTokenIndex: number;
  originalToken: string;
  alternativeToken: string;
  prefix: string;
  continuationText: string;
  tokens: ParsedToken[];
  stats?: TokenStats;
}

export interface AnswerCluster {
  id: string;
  label: string;
  sampleIds: string[];
  representativeSampleId: string;
  size: number;
  percentage: number;
  commonPhrases?: string[];
  distinctPhrases?: string[];
  avgConfidence: number;
  avgEntropy: number;
}

export interface CoverageReport {
  totalSamples: number;
  uniqueOutputs: number;
  duplicateRate: number;
  clusterCount: number;
  newClusterRate: number;
  firstTokenCoverage: number;
  entropyCoverage: number;
  estimatedCoverageLevel: 'low' | 'medium' | 'high';
  suggestions: string[];
}

export interface AnswerSpaceRun {
  id: string;
  messageId: string;
  prompt: string;
  contextSnapshot: Message[]; // The messages leading up to the run
  settings: ChatSettings;
  createdAt: number;
  status: 'running' | 'complete' | 'aborted';
  
  samples: AnswerSample[];
  branches: BranchSample[];
  clusters: AnswerCluster[];
  coverage: CoverageReport;
}
