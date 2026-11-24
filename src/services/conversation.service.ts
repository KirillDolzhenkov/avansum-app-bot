import type { Session } from '../schemas/request.schema.js';

const DEFAULT_TTL_MS = 30 * 60 * 1000;

/**
 * In-memory storage of unfinished requests, keyed by Telegram chat id.
 * Lost on restart — acceptable for an MVP; a Redis/DB implementation would
 * keep the same three methods.
 */
export class ConversationService {
  private readonly sessions = new Map<number, Session>();

  constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  get(chatId: number): Session | null {
    const session = this.sessions.get(chatId);
    if (!session) return null;
    if (this.isExpired(session)) {
      this.sessions.delete(chatId);
      return null;
    }
    return session;
  }

  save(chatId: number, session: Omit<Session, 'updatedAt'>): void {
    this.sweep();
    this.sessions.set(chatId, { ...session, updatedAt: this.now() });
  }

  delete(chatId: number): boolean {
    return this.sessions.delete(chatId);
  }

  private isExpired(session: Session): boolean {
    return this.now() - session.updatedAt > this.ttlMs;
  }

  private sweep(): void {
    for (const [chatId, session] of this.sessions) {
      if (this.isExpired(session)) this.sessions.delete(chatId);
    }
  }
}
