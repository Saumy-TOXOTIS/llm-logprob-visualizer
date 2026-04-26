import Dexie, { type Table } from 'dexie';
import { Conversation, AnswerSpaceRun, BranchNode, FullVocabSnapshot } from '@/types';

export class LogprobDB extends Dexie {
  conversations!: Table<Conversation, string>;
  answerSpaceRuns!: Table<AnswerSpaceRun, string>;
  branchNodes!: Table<BranchNode, string>;
  fullVocabSnapshots!: Table<FullVocabSnapshot, string>;

  constructor() {
    super('LogprobVisualizerDB');
    this.version(1).stores({
      conversations: 'id, updatedAt, createdAt, title, pinned',
    });
    this.version(2).stores({
      answerSpaceRuns: 'id, messageId, createdAt, status'
    });
    // Version 3: ImageAttachment support added to Message objects
    this.version(3).stores({});
    this.version(4).stores({
      branchNodes: 'id, conversationId, messageId, variantId, tokenIndex, parentId, createdAt, status'
    });
    this.version(5).stores({
      fullVocabSnapshots: 'id, conversationId, messageId, variantId, parentId, createdAt'
    });
  }
}

export const db = new LogprobDB();
