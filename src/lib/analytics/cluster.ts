import { MessageVariant } from '@/types';

// Extract raw text for basic comparison (naive unigram Jaccard match)
function extractWords(text: string): Set<string> {
    return new Set((text || '').toLowerCase().match(/\w+/g) || []);
}

function computeJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 1;
    let intersection = 0;
    const arrayA = Array.from(setA);
    for (let word of arrayA) {
        if (setB.has(word)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return intersection / union;
}

export interface ClusteredAnswer {
    representative: MessageVariant;
    variants: MessageVariant[];
    size: number;
    averageConfidence: number;
}

// Groups identical or statistically highly parallel outputs
export function clusterVariants(variants: MessageVariant[], similarityThreshold: number = 0.85): ClusteredAnswer[] {
    const clusters: ClusteredAnswer[] = [];
    
    // Iterate variants and group
    for (const v of variants) {
        let placed = false;
        const vWords = extractWords(v.finalText || v.content || '');

        for (const c of clusters) {
            const reprWords = extractWords(c.representative.finalText || c.representative.content || '');
            const sim = computeJaccardSimilarity(vWords, reprWords);
            if (sim >= similarityThreshold) {
                c.variants.push(v);
                c.size++;
                
                // Keep moving average
                if (v.stats) {
                    c.averageConfidence = ((c.averageConfidence * (c.size - 1)) + v.stats.averageConfidence) / c.size;
                }
                placed = true;
                break;
            }
        }

        if (!placed) {
            clusters.push({
                representative: v,
                variants: [v],
                size: 1,
                averageConfidence: v.stats?.averageConfidence || 0
            });
        }
    }

    // Sort heavily populated clusters first
    return clusters.sort((a, b) => b.size - a.size);
}
