import { AnswerSpaceRun, AnswerCluster, CoverageReport } from '@/types';

function estimateCoverage(sampled: number, duplicates: number, clusters: number): 'low' | 'medium' | 'high' {
    const unqiueRatio = (sampled - duplicates) / Math.max(sampled, 1);
    
    if (sampled < 5) return 'low';
    if (sampled > 30 && unqiueRatio < 0.2 && clusters < 5) return 'high'; // We hit saturation, only generating same few answers
    if (unqiueRatio > 0.8) return 'low'; // Still highly variable, model space is very chaotic / creative
    
    return 'medium';
}

export function computeCoverage(run: AnswerSpaceRun, clusters: AnswerCluster[]): CoverageReport {
    const totalSamples = run.samples.length;
    let duplicateCount = 0;
    
    // Naively assume all items in a cluster beyond the first are 'duplicates' for practical coverage metrics
    clusters.forEach(c => {
        if (c.sampleIds) {
           duplicateCount += (c.sampleIds.length - 1);
        }
    });

    const uniqueOutputs = totalSamples - duplicateCount;
    const clusterCount = clusters.length;
    const duplicateRate = totalSamples > 0 ? duplicateCount / totalSamples : 0;
    const newClusterRate = totalSamples > 0 ? clusterCount / totalSamples : 0;

    let suggestions: string[] = [];
    const level = estimateCoverage(totalSamples, duplicateCount, clusterCount);

    if (level === 'high') {
         suggestions.push("Cluster saturation detected. More samples are unlikely to yield dramatically different answers.");
         suggestions.push("Suggestion: Increase temperature or top_p to force wider generation variance.");
    } else if (level === 'low') {
         suggestions.push("High diversity detected. The answer space remains massively unexplored.");
         if (totalSamples < 10) suggestions.push("Suggestion: Run more samples to identify dominant consensus patterns.");
    }

    return {
        totalSamples,
        uniqueOutputs,
        duplicateRate,
        clusterCount,
        newClusterRate,
        firstTokenCoverage: 0, // Placeholder for deep tree parse
        entropyCoverage: 0,
        estimatedCoverageLevel: level,
        suggestions
    };
}
