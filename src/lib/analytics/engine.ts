import { db } from '@/lib/db';
import { AnswerSpaceRun, AnswerSample, ChatSettings, Conversation } from '@/types';
import { sendMessageToLmStudio } from '@/lib/lmstudio/api';

export class AnswerSpaceEngine {
   
   static async createTask(messageId: string, prompt: string, contextSnapshot: any[], settings: ChatSettings) {
      const run: AnswerSpaceRun = {
         id: crypto.randomUUID(),
         messageId,
         prompt,
         contextSnapshot,
         settings,
         createdAt: Date.now(),
         status: 'running',
         samples: [],
         branches: [],
         clusters: [],
         coverage: {
             totalSamples: 0,
             uniqueOutputs: 0,
             duplicateRate: 0,
             clusterCount: 0,
             newClusterRate: 0,
             firstTokenCoverage: 0,
             entropyCoverage: 0,
             estimatedCoverageLevel: 'low',
             suggestions: []
         }
      };
      await db.answerSpaceRuns.put(run);
      return run;
   }

   static async executeSampling(runId: string, sampleCount: number, concurrency: number = 3) {
      let completedCount = 0;
      let tasks = Array.from({ length: sampleCount }, (_, i) => i);
      
      const runTask = async () => {
         while (tasks.length > 0) {
            const taskIdx = tasks.shift();
            if (taskIdx === undefined) break;

            const run = await db.answerSpaceRuns.get(runId);
            if (!run || run.status === 'aborted') return;

            try {
               const dummyConv: any = { messages: run.contextSnapshot, settings: run.settings };
               const {
                   rawResponse,
                   parsedOutput,
                   stats,
                   settingsUsed
               } = await sendMessageToLmStudio(dummyConv, run.prompt, run.settings);
               
               const sample: AnswerSample = {
                  id: crypto.randomUUID(),
                  text: parsedOutput.finalText || parsedOutput.reasoningText || '',
                  thinkingText: parsedOutput.reasoningText,
                  finalText: parsedOutput.finalText,
                  tokens: parsedOutput.finalTokens,
                  stats: stats || { averageConfidence: 0, lowConfidenceCount: 0, nonTopCount: 0, averageEntropy: 0, hesitationCount: 0},
                  settingsUsed: settingsUsed,
                  rawResponse: rawResponse
               };
               
               await db.transaction('rw', db.answerSpaceRuns, async () => {
                   const activeRun = await db.answerSpaceRuns.get(runId);
                   if (activeRun) {
                       activeRun.samples.push(sample);
                       activeRun.coverage.totalSamples = activeRun.samples.length;
                       await db.answerSpaceRuns.put(activeRun);
                   }
               });
            } catch(e) {
               console.error("Sampling task failed", taskIdx, e);
            }
         }
      };

      const workers = Array.from({ length: Math.min(sampleCount, concurrency) }, () => runTask());
      await Promise.all(workers);

      await db.transaction('rw', db.answerSpaceRuns, async () => {
         const activeRun = await db.answerSpaceRuns.get(runId);
         if (activeRun) {
             activeRun.status = 'complete';
             await db.answerSpaceRuns.put(activeRun);
         }
      });
   }
}
