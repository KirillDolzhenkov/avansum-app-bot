import { describe, expect, it } from 'vitest';
import { ConversationService } from '../src/services/conversation.service.js';
import { emptyDraft } from '../src/schemas/request.schema.js';

describe('ConversationService', () => {
  it('expires sessions after TTL', () => {
    let now = 0;
    const store = new ConversationService(1000, () => now);
    store.save(1, { state: 'collecting', draft: emptyDraft(), pendingQuestion: null, pendingField: null });

    now = 999;
    expect(store.get(1)).not.toBeNull();
    now = 1001;
    expect(store.get(1)).toBeNull();
  });

  it('keeps chats separate and deletes on demand', () => {
    const store = new ConversationService();
    store.save(1, { state: 'collecting', draft: emptyDraft(), pendingQuestion: null, pendingField: null });
    expect(store.get(2)).toBeNull();
    expect(store.delete(1)).toBe(true);
    expect(store.delete(1)).toBe(false);
  });
});
