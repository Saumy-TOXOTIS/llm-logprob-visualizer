import { ParsedToken, TokenStats, BranchingAlternative } from '@/types';
import { classifySafety } from '../analytics/safety';

function getConfidenceBand(prob: number): 'high' | 'medium' | 'low' {
  if (prob >= 0.9) return 'high'; // > 90%
  if (prob >= 0.65) return 'medium'; // 65-90%
  return 'low'; // < 65%
}

function computeEntropy(probs: number[]): number {
  return probs.reduce((acc, p) => {
    if (p <= 0) return acc;
    return acc - p * Math.log2(p);
  }, 0);
}

export function parseLmStudioResponse(rawResponse: any, settings?: import('@/types').ChatSettings): import('@/types').ParsedResponse & { finishReason?: string } {
  let fullText = '';
  let fullRawTokens: any[] = [];
  let finishReason: string | undefined;
  const warnings: string[] = [];
  const rawOutputTypes: string[] = [];

  // Extract everything assuming it's final text initially
  if (rawResponse.output && Array.isArray(rawResponse.output)) {
    for (const out of rawResponse.output) {
      if (out.finish_reason) finishReason = out.finish_reason;
      if (out.type) rawOutputTypes.push(out.type);
      
      if (out.content) {
        for (const c of out.content) {
           if (c.type === 'output_text') {
              fullText += c.text || '';
              if (c.logprobs) {
                 fullRawTokens.push(...c.logprobs);
              }
           } else if (c.type === 'reasoning_text' || c.type?.includes('reasoning')) {
              // Graceful fallback if LM Studio Reasoning Section Parsing was on
              fullText += c.text || '';
              if (c.logprobs) {
                 fullRawTokens.push(...c.logprobs);
              }
           }
        }
      }
    }
  } 
  else if (rawResponse.choices && Array.isArray(rawResponse.choices)) {
    const choice = rawResponse.choices[0];
    if (choice.finish_reason) finishReason = choice.finish_reason;
    if (choice.message) {
      if (typeof choice.message.reasoning_content === 'string') {
        fullText += choice.message.reasoning_content;
      } else if (typeof choice.message.reasoning === 'string') {
        fullText += choice.message.reasoning;
      }
      if (typeof choice.message.content === 'string') {
        fullText += choice.message.content;
      }
      if (choice.logprobs && choice.logprobs.content) {
         fullRawTokens = choice.logprobs.content;
      }
    } 
    else if (typeof choice.text === 'string') {
      fullText = choice.text;
      if (choice.logprobs && choice.logprobs.tokens) {
        fullRawTokens = choice.logprobs.tokens.map((token: string, i: number) => ({
          token,
          logprob: choice.logprobs.token_logprobs[i],
          top_logprobs: choice.logprobs.top_logprobs ? choice.logprobs.top_logprobs[i] : null
        }));
      }
    }
  }

  // Strict closing-marker-first detection as defined by user acceptance criteria
  const closingMarkers = [
    { text: '</think>', type: 'qwen-think-tags' },
    { text: '</thinking>', type: 'heuristic' },
    { text: '</reasoning>', type: 'heuristic' },
    { text: '<channel|>', type: 'gemma-channel-thought', needsGemma: true },
    { text: '<|channel|>', type: 'gemma-channel-thought', needsGemma: true },
    { text: '\nFinal Answer:', type: 'heuristic' },
    { text: '\nFinal Decision:', type: 'heuristic' },
    { text: '\nConclusion:', type: 'heuristic' },
    { text: 'Final Answer:', type: 'heuristic' },
    { text: 'Final Decision:', type: 'heuristic' },
    { text: 'Conclusion:', type: 'heuristic' }
  ];

  let thinkingText = '';
  let finalText = '';
  let markerFound: "qwen-think-tags" | "gemma-channel-thought" | "custom" | "heuristic" | "none" = "none";
  let hasVisibleThinking = false;
  let closingMarkerFound = false;
  let closingMarkerUsed: string | null = null;
  let closingMarkerIndex = -1;
  let thinkingEndIdx = -1;

  // Let's also check for gemma opening to satisfy explicit matched pairs
  const gemmaOpeningIdx = Math.max(fullText.indexOf('<|channel>thought'), fullText.indexOf('<|channel|>thought'));
  
  if (gemmaOpeningIdx !== -1) {
     const possibleClosing1 = fullText.indexOf('<channel|>', gemmaOpeningIdx);
     const possibleClosing2 = fullText.indexOf('<|channel|>', gemmaOpeningIdx);
     
     if (possibleClosing1 !== -1) closingMarkerIndex = possibleClosing1;
     if (possibleClosing2 !== -1 && (possibleClosing1 === -1 || possibleClosing2 < possibleClosing1)) closingMarkerIndex = possibleClosing2;
     
     if (closingMarkerIndex !== -1) {
         closingMarkerFound = true;
         closingMarkerUsed = fullText.substring(closingMarkerIndex).startsWith('<channel|>') ? '<channel|>' : '<|channel|>';
         markerFound = "gemma-channel-thought";
     }
  } else {
     // Find the first occurrence of a matching closing marker
     const modelNameLower = settings?.model?.toLowerCase() || '';
     for (const m of closingMarkers) {
        if (m.needsGemma && !modelNameLower.includes('gemma')) continue;
        
        const idx = fullText.indexOf(m.text);
        if (idx !== -1) {
           closingMarkerIndex = idx;
           closingMarkerUsed = m.text;
           closingMarkerFound = true;
           markerFound = m.type as any;
           break;
        }
     }
  }

  if (closingMarkerFound && closingMarkerUsed) {
      thinkingEndIdx = closingMarkerIndex + closingMarkerUsed.length;
      thinkingText = fullText.substring(0, closingMarkerIndex); // everything up to closing marker
      finalText = fullText.substring(thinkingEndIdx); // everything after closing marker
      hasVisibleThinking = true;
      
      // Optionally strip explicit known starting markers from the start of thinkingText for clean presentation
      const startMarkers = ['<think>', '<thinking>', '<reasoning>', '<|channel|>thought', '<|channel>thought', 'Thinking Process:', 'Thinking Process\n'];
      for (const sm of startMarkers) {
         if (thinkingText.trimStart().startsWith(sm)) {
             thinkingText = thinkingText.trimStart().substring(sm.length);
             break;
         }
      }
  } else {
      // Check if it's truncated thinking text (has opening but no closing)
      const startMarkers = ['<think>', '<thinking>', '<reasoning>', '<|channel|>thought', '<|channel>thought', 'Thinking Process:', 'Thinking Process\n', 'Thinking process:'];
      let foundStartMarker = false;
      
      // We only assume the ENTIRE block is reasoning if it literally ran out of tokens while thinking.
      // If it finished normally (stop) and we just couldn't find a closing tag, we shouldn't blindly swallow the final answer.
      const isTruncated = finishReason === 'length';

      for (const sm of startMarkers) {
         if (fullText.includes(sm)) {
             foundStartMarker = true;
             if (isTruncated) {
                 thinkingText = fullText;
                 finalText = '';
                 thinkingEndIdx = fullText.length;
                 hasVisibleThinking = true;
                 
                 if (thinkingText.trimStart().startsWith(sm)) {
                     thinkingText = thinkingText.trimStart().substring(sm.length);
                 }
             } else {
                 // If it wasn't explicitly truncated, then the model probably just blended reasoning and final answer together.
                 // We'll just leave it all as final text so the user can at least read their output.
                 finalText = fullText;
                 thinkingEndIdx = -1;
             }
             break;
         }
      }
      
      if (!foundStartMarker) {
         finalText = fullText;
         thinkingEndIdx = -1;
      }
  }

  // Token mapping using string indexing char spans
  let rawReasoningTokens: any[] = [];
  let rawFinalTokens: any[] = [];
  let charCursor = 0;

  for (const rt of fullRawTokens) {
    let tokenStr = rt.token || '';
    let tokenStart = charCursor;
    // Tokens before/equal closing marker boundary go to thinkingTokens. No token drops.
    if (hasVisibleThinking && tokenStart < thinkingEndIdx) {
        rawReasoningTokens.push(rt);
    } else {
        rawFinalTokens.push(rt);
    }
    charCursor += tokenStr.length;
  }

  const mapTokens = (rawTokensArray: any[]): ParsedToken[] => {
    return rawTokensArray.map(rt => {
      const logprob = rt.logprob;
      const probability = Math.exp(logprob);
      let top_logprobs: BranchingAlternative[] = [];
      
      if (rt.top_logprobs) {
        const contextPrefix = fullText.substring(Math.max(0, charCursor - 50), charCursor);
        if (Array.isArray(rt.top_logprobs)) {
          top_logprobs = rt.top_logprobs.map((tl: any) => ({
            token: tl.token,
            logprob: tl.logprob,
            probability: Math.exp(tl.logprob),
            safetyTags: classifySafety(tl.token, contextPrefix)
          })).sort((a: any, b: any) => b.probability - a.probability);
        } else if (typeof rt.top_logprobs === 'object') {
          const topLogprobsObj = rt.top_logprobs;
          top_logprobs = Object.keys(topLogprobsObj).map(t => ({
            token: t,
            logprob: topLogprobsObj[t],
            probability: Math.exp(topLogprobsObj[t]),
            safetyTags: classifySafety(t, contextPrefix)
          })).sort((a, b) => b.probability - a.probability);
        }
      }

      let rank = top_logprobs.findIndex(t => t.token === rt.token);
      if (rank === -1) {
        rank = top_logprobs.length > 0 ? top_logprobs.length : 0;
      }

      const bestAlternative = top_logprobs[0] && top_logprobs[0].token !== rt.token 
        ? top_logprobs[0] 
        : top_logprobs[1];

      const marginToBest = bestAlternative ? (bestAlternative.probability - probability) : 0;
      const probs = top_logprobs.map(t => t.probability);
      const entropy = computeEntropy(probs);

      return {
        token: rt.token,
        logprob,
        probability,
        top_logprobs,
        rank,
        bestAlternative,
        entropy,
        confidenceBand: getConfidenceBand(probability),
        marginToBest
      };
    });
  };

  const finalTokens = mapTokens(rawFinalTokens);
  const reasoningTokens = mapTokens(rawReasoningTokens);

  if (finalText && finalTokens.length === 0) {
     warnings.push('Final text found but no final logprobs exposed.');
  }
  if (thinkingText && reasoningTokens.length === 0) {
     warnings.push('Reasoning text found but no reasoning logprobs exposed.');
  }
  if (thinkingText && !finalText.trim()) {
     warnings.push('Thinking was generated but no final answer after </think>.');
  }

  return { 
    finalText, 
    reasoningText: thinkingText, 
    finalTokens, 
    reasoningTokens,
    hasFinalText: !!finalText.trim(),
    hasReasoningText: !!thinkingText.trim(),
    hasFinalLogprobs: finalTokens.length > 0,
    hasReasoningLogprobs: reasoningTokens.length > 0,
    closingMarkerFound,
    closingMarkerUsed,
    closingMarkerIndex,
    thinkingSource: markerFound,
    warnings,
    rawOutputTypes,
    finishReason 
  };
}

export function buildTokenStats(tokens: ParsedToken[]): TokenStats {
  if (tokens.length === 0) {
    return { averageConfidence: 0, lowConfidenceCount: 0, nonTopCount: 0, averageEntropy: 0, hesitationCount: 0 };
  }

  let totalProb = 0;
  let totalEntropy = 0;
  let lowConf = 0;
  let nonTop = 0;
  let hesitation = 0;

  tokens.forEach(t => {
    totalProb += t.probability;
    totalEntropy += t.entropy;
    if (t.confidenceBand === 'low') lowConf++;
    if (t.rank > 0) nonTop++;
    if (t.bestAlternative && Math.abs(t.probability - t.bestAlternative.probability) < 0.1) {
      hesitation++;
    }
  });

  return {
    averageConfidence: totalProb / tokens.length,
    averageEntropy: totalEntropy / tokens.length,
    lowConfidenceCount: lowConf,
    nonTopCount: nonTop,
    hesitationCount: hesitation
  };
}
