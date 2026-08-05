import { randomUUID } from 'node:crypto';
import type { SessionKind } from './session';

/**
 * Server-side session records, so a session can be *revoked* (blueprint §12.3).
 *
 * A signed stateless token is unforgeable but not retractable: signing out clears the
 * cookie on one device and does nothing to a token already copied. For eight hours
 * afterwards that copy is a valid session and nothing on the server can say otherwise.
 * The only remedy was rotating `AUTH_SECRET`, which signs everyone out of everything.
 *
 * So the token now carries a session id, and the id is looked up on every request. The
 * record is the authority; the signature only proves the id was not tampered with.
 *
 * `revokeAllForSubject` exists because the realistic incident is not "I lost one
 * device" but "I think someone has my session" — and the honest answer to that is to
 * end all of them.
 */

export interface SessionRecord {
  sessionId: string;
  kind: SessionKind;
  subjectId: string;
  createdAt: string;
  expiresAt: number;
  revokedAt: string | null;
  /** Why it ended. Shown to no one; recorded so an incident can be reconstructed. */
  revokedReason: string | null;
}

export interface SessionRegistry {
  issue(input: { kind: SessionKind; subjectId: string; expiresAt: number; now: string }): Promise<SessionRecord>;
  /** Returns the record only if it exists, is unrevoked and has not expired. */
  active(sessionId: string, nowSeconds: number): Promise<SessionRecord | null>;
  revoke(sessionId: string, reason: string, now: string): Promise<void>;
  revokeAllForSubject(subjectId: string, reason: string, now: string): Promise<number>;
  /** Drops records that can no longer authorise anything. */
  prune(nowSeconds: number): Promise<number>;
}

export function newSessionId(): string {
  return `sess_${randomUUID().replace(/-/g, '')}`;
}

/**
 * In-memory registry. Correct for a single process, which is what local development
 * and the test suite are; a hosted deployment uses the store-backed one so revocation
 * holds across instances.
 */
export class InMemorySessionRegistry implements SessionRegistry {
  private readonly records = new Map<string, SessionRecord>();

  async issue(input: {
    kind: SessionKind;
    subjectId: string;
    expiresAt: number;
    now: string;
  }): Promise<SessionRecord> {
    const record: SessionRecord = {
      sessionId: newSessionId(),
      kind: input.kind,
      subjectId: input.subjectId,
      createdAt: input.now,
      expiresAt: input.expiresAt,
      revokedAt: null,
      revokedReason: null,
    };
    this.records.set(record.sessionId, record);
    return record;
  }

  async active(sessionId: string, nowSeconds: number): Promise<SessionRecord | null> {
    const record = this.records.get(sessionId);
    if (!record) return null;
    if (record.revokedAt !== null) return null;
    if (record.expiresAt <= nowSeconds) return null;
    return { ...record };
  }

  async revoke(sessionId: string, reason: string, now: string): Promise<void> {
    const record = this.records.get(sessionId);
    if (!record || record.revokedAt !== null) return;
    record.revokedAt = now;
    record.revokedReason = reason;
  }

  async revokeAllForSubject(subjectId: string, reason: string, now: string): Promise<number> {
    let revoked = 0;
    for (const record of this.records.values()) {
      if (record.subjectId !== subjectId || record.revokedAt !== null) continue;
      record.revokedAt = now;
      record.revokedReason = reason;
      revoked += 1;
    }
    return revoked;
  }

  async prune(nowSeconds: number): Promise<number> {
    let dropped = 0;
    for (const [id, record] of this.records) {
      if (record.expiresAt > nowSeconds && record.revokedAt === null) continue;
      this.records.delete(id);
      dropped += 1;
    }
    return dropped;
  }
}
