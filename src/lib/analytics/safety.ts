import { SafetyTag } from '@/types';

const HEURISTICS: Record<SafetyTag, RegExp[]> = {
  'violence': [/\b(kill|murder|attack|shoot|bomb|stab|blood|torture|destroy|assassinate)\b/i],
  'self-harm': [/\b(suicide|kill\s*myself|cut\s*myself|end\s*my\s*life|overdose|harm\s*myself)\b/i],
  'cyber': [/\b(hack|bypass|exploit|malware|ransomware|ddos|phishing|backdoor|trojan|keylogger)\b/i],
  'illegal': [/\b(steal|smuggle|fraud|bribe|drugs|meth|cocaine|weapon|cartel|heist|embezzle)\b/i],
  'hate/harassment': [/\b(slur|hate|harass|bully|racist|sexist|homophobic)\b/i],
  'sexual': [/\b(sex|porn|rape|nude|incest|fetish|pedophile|nsfw)\b/i],
  'medical/legal/financial high-stakes': [/\b(cancer|tumor|cure|diagnose|lawsuit|sue|invest|crypto|stocks\b.*guarantee)\b/i],
  'normal': []
};

// Simplified heuristic classifier
export function classifySafety(token: string, contextPrefix: string): SafetyTag[] {
  const combinedText = (contextPrefix + ' ' + token).toLowerCase();
  const tags: SafetyTag[] = [];

  for (const [tagRaw, regexList] of Object.entries(HEURISTICS)) {
    const tag = tagRaw as SafetyTag;
    if (tag === 'normal') continue;
    
    for (const regex of regexList) {
      if (regex.test(combinedText)) {
        tags.push(tag);
        break; // Only push the tag once per category
      }
    }
  }

  if (tags.length === 0) {
    tags.push('normal');
  }

  return tags;
}

export function hasHarmfulIntent(tags: SafetyTag[]): boolean {
  // Return true if the branch should be blocked from normal API continuation
  const harmfulTags: SafetyTag[] = ['violence', 'self-harm', 'cyber', 'illegal', 'hate/harassment', 'sexual'];
  return tags.some(t => harmfulTags.includes(t));
}
