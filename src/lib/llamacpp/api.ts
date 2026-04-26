import { ChatSettings, Conversation, FullVocabAlternative, FullVocabSnapshot, Message, MessageVariant } from '@/types';
import { classifySafety } from '@/lib/analytics/safety';
import { generateId } from '@/lib/utils';
import { buildTokenStats, parseLmStudioResponse } from '@/lib/lmstudio/parser';

type LlamaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function computeEntropy(probs: number[]): number {
  return probs.reduce((acc, p) => {
    if (p <= 0) return acc;
    return acc - p * Math.log2(p);
  }, 0);
}

async function callLlamaCpp(baseUrl: string, endpointPath: string, payload?: any, method?: 'GET' | 'POST') {
  const response = await fetch('/api/llamacpp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl,
      endpointPath,
      payload,
      method
    })
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error || 'llama.cpp request failed');
  }
  return json;
}

export async function getLlamaCppModelMeta(settings: ChatSettings) {
  const baseUrl = settings.llamaCppBaseUrl || 'http://127.0.0.1:8080';
  const data = await callLlamaCpp(baseUrl, '/v1/models', undefined, 'GET');
  const preferred = settings.llamaCppModelAlias || settings.model;
  const models = data?.data || data?.models || [];
  const match = models.find((m: any) => m.id === preferred || m.model === preferred || m.name === preferred) || models[0];
  return {
    raw: data,
    model: match?.id || match?.model || match?.name || preferred,
    nVocab: Number(match?.meta?.n_vocab || 0),
    nCtxTrain: Number(match?.meta?.n_ctx_train || 0)
  };
}

export function buildTemplateMessages(
  conversation: Conversation,
  assistantMessage: Message,
  settings: ChatSettings
): LlamaMessage[] {
  const messages: LlamaMessage[] = [];
  if (settings.systemPrompt) {
    messages.push({ role: 'system', content: settings.systemPrompt });
  }

  const assistantIndex = conversation.messages.findIndex(m => m.id === assistantMessage.id);
  const contextMessages = assistantIndex >= 0
    ? conversation.messages.slice(0, assistantIndex)
    : conversation.messages;

  contextMessages.forEach(msg => {
    if (msg.status === 'error' || msg.status === 'generating' || msg.role === 'system') return;

    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
      return;
    }

    const activeVariant = msg.variants?.find(v => v.id === msg.activeVariantId) || msg.variants?.[0];
    const content = settings.includeReasoningInContext
      ? activeVariant?.content || msg.content
      : activeVariant?.finalText || activeVariant?.content || msg.content;

    if (content) {
      messages.push({ role: 'assistant', content });
    }
  });

  return messages;
}

export async function applyLlamaTemplate(settings: ChatSettings, messages: LlamaMessage[]) {
  const baseUrl = settings.llamaCppBaseUrl || 'http://127.0.0.1:8080';
  const data = await callLlamaCpp(baseUrl, '/apply-template', { messages });
  return String(data.prompt || '');
}

export function buildLlamaChatMessages(conversation: Conversation, settings: ChatSettings): LlamaMessage[] {
  const messages: LlamaMessage[] = [];
  if (settings.systemPrompt) {
    messages.push({ role: 'system', content: settings.systemPrompt });
  }

  conversation.messages.forEach(msg => {
    if (msg.status === 'error' || msg.status === 'generating' || msg.role === 'system') return;

    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
      return;
    }

    const activeVariant = msg.variants?.find(v => v.id === msg.activeVariantId) || msg.variants?.[0];
    const content = settings.includeReasoningInContext
      ? activeVariant?.content || msg.content
      : activeVariant?.finalText || activeVariant?.content || msg.content;

    if (content) {
      messages.push({ role: 'assistant', content });
    }
  });

  return messages;
}

export async function sendMessageToLlamaCpp(
  conversation: Conversation,
  newMessage: string,
  settings: ChatSettings
) {
  const baseUrl = settings.llamaCppBaseUrl || 'http://127.0.0.1:8080';
  const messages = buildLlamaChatMessages(conversation, settings);
  const prompt = await applyLlamaTemplate(settings, messages);

  const payload: any = {
    prompt,
    n_predict: settings.max_output_tokens || 2048,
    temperature: settings.temperature,
    top_p: settings.top_p,
    stream: false,
    cache_prompt: true,
    return_tokens: true,
    post_sampling_probs: false,
    n_probs: Math.max(0, settings.top_logprobs || 0)
  };

  if (settings.top_k !== undefined) payload.top_k = settings.top_k;
  if (settings.min_p !== undefined) payload.min_p = settings.min_p;
  if (settings.presence_penalty !== undefined) payload.presence_penalty = settings.presence_penalty;
  if (settings.frequency_penalty !== undefined) payload.frequency_penalty = settings.frequency_penalty;
  if (settings.repeat_penalty !== undefined) payload.repeat_penalty = settings.repeat_penalty;
  if (settings.seed !== undefined) payload.seed = settings.seed;
  if (settings.stop && settings.stop.length > 0) payload.stop = settings.stop;

  const rawJson = await callLlamaCpp(baseUrl, '/completion', payload);
  const parsed = parseLmStudioResponse(rawJson, settings);
  const finalStats = buildTokenStats(parsed.finalTokens);
  const reasoningStats = buildTokenStats(parsed.reasoningTokens);

  return {
    rawResponse: rawJson,
    parsedOutput: parsed,
    stats: finalStats,
    reasoningStats,
    settingsUsed: settings,
    sentContent: newMessage,
    requestPayload: payload
  };
}

export async function fetchFullVocabSnapshot({
  conversation,
  message,
  variant,
  generatedPrefix,
  parentId,
  selectedToken,
  selectedTokenId,
  selectedTokenProbability,
  nProbsOverride
}: {
  conversation: Conversation;
  message: Message;
  variant?: MessageVariant;
  generatedPrefix: string;
  parentId?: string;
  selectedToken?: string;
  selectedTokenId?: number;
  selectedTokenProbability?: number;
  nProbsOverride?: number;
}): Promise<FullVocabSnapshot> {
  const settings = conversation.settings;
  const baseUrl = settings.llamaCppBaseUrl || 'http://127.0.0.1:8080';
  const meta = await getLlamaCppModelMeta(settings);
  const nVocab = meta.nVocab || settings.fullVocabNProbs || 0;
  const nProbs = nProbsOverride || settings.fullVocabNProbs || nVocab;

  if (!nProbs || nProbs <= 0) {
    throw new Error('Could not determine llama.cpp vocabulary size. Check /v1/models response.');
  }

  const templateMessages = buildTemplateMessages(conversation, message, settings);
  const prompt = await applyLlamaTemplate(settings, templateMessages);
  const completionPrompt = prompt + generatedPrefix;

  const payload: any = {
    prompt: completionPrompt,
    n_predict: 1,
    temperature: settings.temperature,
    top_p: settings.top_p,
    n_probs: nProbs,
    post_sampling_probs: settings.fullVocabPostSampling ?? false,
    return_tokens: true,
    cache_prompt: true
  };

  if (settings.top_k !== undefined) payload.top_k = settings.top_k;
  if (settings.min_p !== undefined) payload.min_p = settings.min_p;
  if (settings.presence_penalty !== undefined) payload.presence_penalty = settings.presence_penalty;
  if (settings.frequency_penalty !== undefined) payload.frequency_penalty = settings.frequency_penalty;
  if (settings.repeat_penalty !== undefined) payload.repeat_penalty = settings.repeat_penalty;
  if (settings.seed !== undefined) payload.seed = settings.seed;
  if (settings.stop && settings.stop.length > 0) payload.stop = settings.stop;

  const data = await callLlamaCpp(baseUrl, '/completion', payload);
  const probabilityBlock = data?.completion_probabilities?.[0];
  const rawAlternatives = probabilityBlock?.top_logprobs || [];

  const alternatives: FullVocabAlternative[] = rawAlternatives.map((entry: any, rank: number) => {
    const logprob = Number(entry.logprob);
    const probability = Math.exp(logprob);
    return {
      id: typeof entry.id === 'number' ? entry.id : undefined,
      token: String(entry.token ?? ''),
      bytes: Array.isArray(entry.bytes) ? entry.bytes : undefined,
      logprob,
      probability,
      rank,
      safetyTags: classifySafety(String(entry.token ?? ''), generatedPrefix.slice(-80))
    };
  });

  const topProbabilityMass = alternatives.reduce((sum, alt) => sum + alt.probability, 0);
  const entropy = computeEntropy(alternatives.map(alt => alt.probability));

  return {
    id: generateId(),
    conversationId: conversation.id,
    messageId: message.id,
    variantId: variant?.id,
    parentId,
    prompt,
    generatedPrefix,
    selectedToken,
    selectedTokenId,
    selectedTokenProbability,
    nVocab,
    nProbs,
    postSampling: payload.post_sampling_probs,
    alternatives,
    topProbabilityMass,
    entropy,
    createdAt: Date.now(),
    timings: data?.timings,
    rawContent: data?.content
  };
}
