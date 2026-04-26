import { MessageVariant, ParsedToken } from '@/types';

export interface BranchNode {
    token: string;
    isRoot: boolean;
    children: Map<string, BranchNode>;
    variantsCrossing: number[];
    averageProb: number;
    entropy: number;
    terminalCount: number;
}

export function buildPrefixTree(variants: MessageVariant[], maxDepth: number = 25): BranchNode {
    const root: BranchNode = {
        token: 'ROOT',
        isRoot: true,
        children: new Map(),
        variantsCrossing: [],
        averageProb: 1.0,
        entropy: 0,
        terminalCount: 0
    };

    variants.forEach((v, vIndex) => {
        const tokens = v.parsedLogprobs || [];
        
        let currentNode = root;
        currentNode.variantsCrossing.push(vIndex);

        const limit = Math.min(tokens.length, maxDepth);
        for (let i = 0; i < limit; i++) {
            const tok: ParsedToken = tokens[i];
            
            if (!currentNode.children.has(tok.token)) {
                currentNode.children.set(tok.token, {
                    token: tok.token,
                    isRoot: false,
                    children: new Map(),
                    variantsCrossing: [],
                    averageProb: 0, // Accumulate and average out later
                    entropy: tok.entropy,
                    terminalCount: 0
                });
            }

            const child = currentNode.children.get(tok.token)!;
            child.variantsCrossing.push(vIndex);
            
            // Running average simple
            child.averageProb = ((child.averageProb * (child.variantsCrossing.length - 1)) + tok.probability) / child.variantsCrossing.length;
            
            currentNode = child;
        }
        currentNode.terminalCount++;
    });

    return root;
}
