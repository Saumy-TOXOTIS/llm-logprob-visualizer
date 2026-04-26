import { Conversation, ChatSettings, ImageAttachment } from '@/types';
import { parseLmStudioResponse, buildTokenStats } from './parser';

// Build a multimodal content array for a user message with images
function buildMultimodalContent(
  text: string,
  images: ImageAttachment[],
  endpoint: string
): any {
  if (endpoint === '/v1/responses') {
    const parts: any[] = [];
    if (text) parts.push({ type: 'input_text', text });
    images.forEach(img => {
      parts.push({
        type: 'input_image',
        image_url: `data:${img.mimeType};base64,${img.base64}`
      });
    });
    return parts;
  } else {
    // /v1/chat/completions format
    const parts: any[] = [];
    if (text) parts.push({ type: 'text', text });
    images.forEach(img => {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
      });
    });
    return parts;
  }
}

export async function sendMessageToLmStudio(
  conversation: Conversation,
  newMessage: string,
  settings: ChatSettings
) {
  // Construct the input array
  const input: any[] = [];

  // Add system prompt if not empty
  if (settings.systemPrompt) {
    input.push({ role: 'system', content: settings.systemPrompt });
  }

  // Add previous conversation context
  const lastMsgIndex = conversation.messages.length - 1;
  conversation.messages.forEach((msg, idx) => {
    if (msg.role !== 'system') {
       if (msg.status === 'error' || msg.status === 'generating') return;
       
       if (msg.role === 'assistant') {
          const activeVariant = msg.variants?.find(v => v.id === msg.activeVariantId) || msg.variants?.[0];
          let contentStr = msg.content;
          if (activeVariant) {
             if (settings.includeReasoningInContext) {
                contentStr = activeVariant.content;
             } else {
                contentStr = activeVariant.finalText || activeVariant.content;
             }
          }
          input.push({ role: 'assistant', content: contentStr });
       } else if (msg.role === 'user') {
          const hasImages = msg.images && msg.images.length > 0;
          const isLatestUserMsg = idx === lastMsgIndex || idx === lastMsgIndex - 1; // could be the just-added one
          
          if (hasImages && (settings.includeImagesInHistory || isLatestUserMsg)) {
             // Send with actual image data as multimodal content
             const content = buildMultimodalContent(msg.content, msg.images!, settings.endpointPath);
             input.push({ role: 'user', content });
          } else if (hasImages) {
             // Include text-only placeholder for older image messages
             const imageNames = msg.images!.map(i => i.name).join(', ');
             input.push({ role: 'user', content: `${msg.content}\n[Images attached: ${imageNames}]` });
          } else {
             input.push({ role: 'user', content: msg.content });
          }
       }
    }
  });

  // The new message is already in conversation.messages (saved by ChatPanel), so we just record what it was for debugging.
  const promptContent = newMessage;

  // Base payload parameters agnostic to standard mapping
  let payload: any = {
    model: settings.model,
    temperature: settings.temperature,
    top_p: settings.top_p,
    stream: false, 
  };

  // Optional params
  if (settings.max_context_tokens !== undefined) payload.max_context_tokens = settings.max_context_tokens;
  if (settings.top_k !== undefined) payload.top_k = settings.top_k;
  if (settings.min_p !== undefined) payload.min_p = settings.min_p;
  if (settings.presence_penalty !== undefined) payload.presence_penalty = settings.presence_penalty;
  if (settings.frequency_penalty !== undefined) payload.frequency_penalty = settings.frequency_penalty;
  if (settings.repeat_penalty !== undefined) payload.repeat_penalty = settings.repeat_penalty;
  if (settings.seed !== undefined) payload.seed = settings.seed;
  if (settings.stop && settings.stop.length > 0) payload.stop = settings.stop;

  // Use the user's setting, falling back to 32768 if undef/0
  const maxCap = settings.max_output_tokens || 32768;

  if (settings.endpointPath === '/v1/responses') {
     payload.input = input;
     payload.max_output_tokens = maxCap;
     if (settings.top_logprobs && settings.top_logprobs > 0) {
       payload.top_logprobs = settings.top_logprobs;
       payload.include = ["message.output_text.logprobs"];
     }
  } else if (settings.endpointPath === '/v1/chat/completions') {
     payload.messages = input;
     payload.max_tokens = maxCap;
     if (settings.top_logprobs && settings.top_logprobs > 0) {
       payload.logprobs = true;
       payload.top_logprobs = settings.top_logprobs;
     }
  } else if (settings.endpointPath === '/v1/completions') {
     let flatPrompt = "";
     input.forEach(m => {
       flatPrompt += m.role === 'system' ? `System: ${m.content}\n` : m.role === 'assistant' ? `Assistant: ${m.content}\n` : `User: ${m.content}\n`;
     });
     flatPrompt += "Assistant: ";
     
     payload.prompt = flatPrompt;
     payload.max_tokens = maxCap;
     if (settings.top_logprobs && settings.top_logprobs > 0) {
       payload.logprobs = settings.top_logprobs;
     }
  } else {
     // Custom endpoint fallback logic - treat like chat completions standard
     payload.messages = input;
     payload.max_tokens = maxCap;
     if (settings.top_logprobs && settings.top_logprobs > 0) {
       payload.logprobs = true;
       payload.top_logprobs = settings.top_logprobs;
     }
  }

  const proxyRes = await fetch('/api/lmstudio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: settings.baseUrl,
      endpointPath: settings.endpointPath,
      payload
    })
  });

  const rawJson = await proxyRes.json();
  
  if (!proxyRes.ok) {
    throw new Error(rawJson.error || 'Failed to fetch from proxy');
  }

  const parsed = parseLmStudioResponse(rawJson, settings);
  const finalStats = buildTokenStats(parsed.finalTokens);
  const reasoningStats = buildTokenStats(parsed.reasoningTokens);

  return {
    rawResponse: rawJson,
    parsedOutput: parsed,
    stats: finalStats,
    reasoningStats,
    settingsUsed: settings,
    sentContent: promptContent,
    requestPayload: payload // Returned for explicit debugging in UI
  };
}

export async function fetchDiscardedContinuation(
   conversation: Conversation,
   prompt: string,
   prefixBefore: string,
   discardedToken: string,
   settings: ChatSettings,
   mode: import('@/types').BranchExplorationMode = 'normal'
) {
   let flatPrompt = "";
   conversation.messages.forEach(m => {
       if (m.role === 'system') flatPrompt += `System: ${m.content}\n`;
       else if (m.role === 'assistant') {
          const activeVariant = m.variants?.find(v => v.id === m.activeVariantId) || m.variants?.[0];
          let contentStr = activeVariant?.content || m.content;
          flatPrompt += `Assistant: ${contentStr}\n`;
       } else flatPrompt += `User: ${m.content}\n`;
   });
   
   if (mode === 'safe_analysis') {
      flatPrompt += `\n[SYSTEM DIRECTIVE]: You are a safety analysis assistant. The user is inspecting a discarded token path from a previous generation. Provide a clinical, meta-level analysis of the text intent so far and indicate why it might break safety guidelines. Do NOT complete the original harmful task or emulate the sequence.\n`;
   }
   
   // The conversation object already includes the user's latest prompt, so we don't append it again.
   // We only append the Assistant prefix + the discarded token we are branching from.
   flatPrompt += `Assistant: ${prefixBefore}${discardedToken}`;

   const payload: any = {
      model: settings.model,
      prompt: flatPrompt,
      temperature: settings.temperature,
      top_p: settings.top_p,
      stream: false
   };
   if (settings.max_output_tokens && settings.max_output_tokens > 0) {
      payload.max_tokens = settings.max_output_tokens;
   } else {
      payload.max_tokens = -1;
   }

   let defaultStops = ['\nUser:', 'User:'];
   if (settings.stop && Array.isArray(settings.stop)) {
      payload.stop = [...settings.stop, ...defaultStops];
   } else {
      payload.stop = defaultStops;
   }

   const proxyRes = await fetch('/api/lmstudio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: settings.baseUrl,
        endpointPath: '/v1/completions', // Force completions endpoint to respect exact prefix formatting
        payload
      })
   });

   const rawJson = await proxyRes.json();
   
   if (!proxyRes.ok) {
      throw new Error(rawJson.error || 'Failed to fetch partial continuation from proxy');
   }

   const completionText = rawJson.choices?.[0]?.text || "";
   return prefixBefore + discardedToken + completionText;
}
