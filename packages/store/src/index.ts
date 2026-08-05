import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AuditEvent, AuditEventInput } from '@rosillo/audit';
import { AuditLog, buildAuditEvent, verifyEventChain } from '@rosillo/audit';
import type { AIRun, ConciergeResponse, EmployeeDecision, HandoffTask, TaskState } from '@rosillo/domain';
import { withFileLock } from './lock';

/**
 * @rosillo/store — append-only persistence for conversations, tasks and audit.
 *
 * Two properties matter more than durability here. First, **append-only**: analysis
 * versions, audit events and employee decisions are never updated in place, so a
 * task's history can always be replayed (blueprint §13.3, §14.4). Second,
 * **swappable**: the port below is what orchestration depends on, so moving to
 * PostgreSQL for a pilot is a new implementation rather than a rewrite (ADR-0011).
 */

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'CLIENT' | 'ASSISTANT';
  text: string;
  createdAt: string;
  /** Present on assistant messages. */
  responseId?: string;
  answerType?: string;
  traceId?: string;
}

export interface Conversation {
  id: string;
  accountId: string;
  contextType: 'PERSON' | 'ORGANISATION';
  contextId: string;
  createdAt: string;
  updatedAt: string;
  title: string;
}

/**
 * Titles a conversation from the client's opening words.
 *
 * Kept short and stripped of line breaks so a long first message does not turn the
 * history list into a wall of text.
 */
export function conversationTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return 'Nueva consulta';
  return cleaned.length <= 70 ? cleaned : `${cleaned.slice(0, 69)}…`;
}

/** A task plus its immutable version history. */
export interface StoredTask {
  task: HandoffTask;
  /** Every version ever written, oldest first. The last entry is current. */
  versions: HandoffTask[];
  decisions: EmployeeDecision[];
}

export interface PlatformStore {
  createConversation(input: Omit<Conversation, 'createdAt' | 'updatedAt'>): Promise<Conversation>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  listConversations(accountId: string): Promise<Conversation[]>;
  appendMessage(message: ConversationMessage): Promise<void>;
  listMessages(conversationId: string): Promise<ConversationMessage[]>;

  saveResponse(response: ConciergeResponse): Promise<void>;
  getResponse(responseId: string): Promise<ConciergeResponse | null>;

  createTask(task: HandoffTask): Promise<HandoffTask>;
  getTask(taskId: string): Promise<StoredTask | null>;
  listTasks(filter?: { queue?: string; state?: TaskState; clientId?: string }): Promise<HandoffTask[]>;
  listTasksForConversation(conversationId: string): Promise<HandoffTask[]>;
  /** Writes a new immutable version. The previous version is retained. */
  appendTaskVersion(task: HandoffTask): Promise<void>;
  recordDecision(decision: EmployeeDecision): Promise<void>;

  recordAIRun(run: AIRun): Promise<void>;
  listAIRuns(traceId: string): Promise<AIRun[]>;

  appendAudit(input: AuditEventInput): Promise<AuditEvent>;
  listAudit(filter?: { traceId?: string; resourceType?: string; resourceId?: string }): Promise<AuditEvent[]>;
  verifyAuditChain(): Promise<{ valid: boolean; brokenAtIndex: number | null }>;
}

/** In-memory store. The default for tests: fast, isolated, and trivially resettable. */
export class InMemoryStore implements PlatformStore {
  protected readonly conversations = new Map<string, Conversation>();
  protected readonly messages = new Map<string, ConversationMessage[]>();
  protected readonly responses = new Map<string, ConciergeResponse>();
  protected readonly tasks = new Map<string, StoredTask>();
  protected readonly aiRuns: AIRun[] = [];
  protected readonly auditLog = new AuditLog();

  /** Clears cached state so a file-backed subclass can rebuild from disk. */
  protected resetCaches(): void {
    this.conversations.clear();
    this.messages.clear();
    this.responses.clear();
    this.tasks.clear();
    this.aiRuns.length = 0;
  }

  async createConversation(input: Omit<Conversation, 'createdAt' | 'updatedAt'>): Promise<Conversation> {
    const now = new Date().toISOString();
    const conversation: Conversation = { ...input, createdAt: now, updatedAt: now };
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    return { ...conversation };
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const found = this.conversations.get(conversationId);
    return found ? { ...found } : null;
  }

  async listConversations(accountId: string): Promise<Conversation[]> {
    return [...this.conversations.values()]
      .filter((c) => c.accountId === accountId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => ({ ...c }));
  }

  async appendMessage(message: ConversationMessage): Promise<void> {
    const list = this.messages.get(message.conversationId) ?? [];
    const firstFromClient = message.role === 'CLIENT' && !list.some((m) => m.role === 'CLIENT');
    list.push({ ...message });
    this.messages.set(message.conversationId, list);
    const conversation = this.conversations.get(message.conversationId);
    if (conversation) {
      conversation.updatedAt = message.createdAt;
      // A history whose every entry reads "Nueva consulta" is not a history. The
      // client's opening words are the only title that helps them find it again.
      if (firstFromClient) conversation.title = conversationTitle(message.text);
    }
  }

  async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    return (this.messages.get(conversationId) ?? []).map((m) => ({ ...m }));
  }

  async saveResponse(response: ConciergeResponse): Promise<void> {
    this.responses.set(response.responseId, structuredClone(response));
  }

  async getResponse(responseId: string): Promise<ConciergeResponse | null> {
    const found = this.responses.get(responseId);
    return found ? structuredClone(found) : null;
  }

  async createTask(task: HandoffTask): Promise<HandoffTask> {
    this.tasks.set(task.taskId, {
      task: structuredClone(task),
      versions: [structuredClone(task)],
      decisions: [],
    });
    return structuredClone(task);
  }

  async getTask(taskId: string): Promise<StoredTask | null> {
    const found = this.tasks.get(taskId);
    return found ? structuredClone(found) : null;
  }

  async listTasks(filter: { queue?: string; state?: TaskState; clientId?: string } = {}): Promise<HandoffTask[]> {
    return [...this.tasks.values()]
      .map((entry) => entry.task)
      .filter((t) => (filter.queue ? t.employeeQueue === filter.queue : true))
      .filter((t) => (filter.state ? t.state === filter.state : true))
      .filter((t) => (filter.clientId ? t.clientId === filter.clientId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => structuredClone(t));
  }

  async listTasksForConversation(conversationId: string): Promise<HandoffTask[]> {
    return [...this.tasks.values()]
      .map((entry) => entry.task)
      .filter((t) => t.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((t) => structuredClone(t));
  }

  async appendTaskVersion(task: HandoffTask): Promise<void> {
    const existing = this.tasks.get(task.taskId);
    if (!existing) throw new Error(`Unknown task ${task.taskId}`);
    // The previous version stays in `versions`; only the pointer moves.
    existing.versions.push(structuredClone(task));
    existing.task = structuredClone(task);
  }

  async recordDecision(decision: EmployeeDecision): Promise<void> {
    const existing = this.tasks.get(decision.taskId);
    if (!existing) throw new Error(`Unknown task ${decision.taskId}`);
    existing.decisions.push(structuredClone(decision));
  }

  async recordAIRun(run: AIRun): Promise<void> {
    this.aiRuns.push(structuredClone(run));
  }

  async listAIRuns(traceId: string): Promise<AIRun[]> {
    return this.aiRuns.filter((r) => r.traceId === traceId).map((r) => structuredClone(r));
  }

  async appendAudit(input: AuditEventInput): Promise<AuditEvent> {
    return this.auditLog.append(input);
  }

  async listAudit(
    filter: { traceId?: string; resourceType?: string; resourceId?: string } = {},
  ): Promise<AuditEvent[]> {
    return this.auditLog
      .all()
      .filter((e) => (filter.traceId ? e.traceId === filter.traceId : true))
      .filter((e) => (filter.resourceType ? e.resource.type === filter.resourceType : true))
      .filter((e) => (filter.resourceId ? e.resource.id === filter.resourceId : true));
  }

  async verifyAuditChain(): Promise<{ valid: boolean; brokenAtIndex: number | null }> {
    return this.auditLog.verifyChain();
  }
}

/**
 * JSONL-backed store for local development and the demo.
 *
 * Every mutation appends one line to a file. That is a poor database and an
 * excellent audit log: history is physically append-only, and a tampered line is
 * detectable through the audit hash chain. A pilot needs PostgreSQL with row-level
 * security — see docs/adr/ADR-0011.
 */
export class JsonlStore extends InMemoryStore {
  private readonly dir: string;
  /** Last-seen size+mtime per file, used to detect another process's writes. */
  private fingerprints = new Map<string, string>();
  private loadedOnce = false;

  constructor(dir: string = process.env['ROSILLO_DATA_DIR'] ?? '.data') {
    super();
    this.dir = dir;
  }

  /**
   * Reloads when the files have changed on disk.
   *
   * The Concierge and the employee workspace are separate processes sharing this
   * directory, so a cache populated once would never see the other side's writes —
   * a client would keep seeing "in the queue" after an adviser had already acted.
   * Fingerprinting size and mtime is cheap and catches every append.
   */
  private ensureLoaded(): void {
    mkdirSync(this.dir, { recursive: true });
    const files = this.loaders().map(([file]) => file);

    let changed = !this.loadedOnce;
    for (const file of files) {
      const path = join(this.dir, file);
      let fingerprint = 'absent';
      if (existsSync(path)) {
        const stats = statSync(path);
        fingerprint = `${stats.size}:${stats.mtimeMs}`;
      }
      if (this.fingerprints.get(file) !== fingerprint) {
        this.fingerprints.set(file, fingerprint);
        changed = true;
      }
    }
    if (!changed) return;

    this.loadedOnce = true;
    this.resetCaches();
    for (const [file, apply] of this.loaders()) {
      const path = join(this.dir, file);
      if (!existsSync(path)) continue;
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (line.trim().length === 0) continue;
        try {
          apply(JSON.parse(line));
        } catch {
          // A malformed line is skipped rather than crashing the app; the audit
          // chain verification is what surfaces tampering.
        }
      }
    }
  }

  private loaders(): [string, (value: unknown) => void][] {
    return [
      ['conversations.jsonl', (v) => this.conversations.set((v as Conversation).id, v as Conversation)],
      [
        'messages.jsonl',
        (v) => {
          const message = v as ConversationMessage;
          const list = this.messages.get(message.conversationId) ?? [];
          list.push(message);
          this.messages.set(message.conversationId, list);
        },
      ],
      ['responses.jsonl', (v) => this.responses.set((v as ConciergeResponse).responseId, v as ConciergeResponse)],
      [
        'tasks.jsonl',
        (v) => {
          const task = v as HandoffTask;
          const existing = this.tasks.get(task.taskId);
          if (existing) {
            existing.versions.push(task);
            existing.task = task;
          } else {
            this.tasks.set(task.taskId, { task, versions: [task], decisions: [] });
          }
        },
      ],
      [
        'decisions.jsonl',
        (v) => {
          const decision = v as EmployeeDecision;
          this.tasks.get(decision.taskId)?.decisions.push(decision);
        },
      ],
    ];
  }

  private append(file: string, value: unknown): void {
    const path = join(this.dir, file);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(value)}\n`, 'utf8');
  }

  override async createConversation(input: Omit<Conversation, 'createdAt' | 'updatedAt'>): Promise<Conversation> {
    this.ensureLoaded();
    const conversation = await super.createConversation(input);
    this.append('conversations.jsonl', conversation);
    return conversation;
  }

  override async getConversation(conversationId: string): Promise<Conversation | null> {
    this.ensureLoaded();
    return super.getConversation(conversationId);
  }

  override async listConversations(accountId: string): Promise<Conversation[]> {
    this.ensureLoaded();
    return super.listConversations(accountId);
  }

  override async appendMessage(message: ConversationMessage): Promise<void> {
    this.ensureLoaded();
    await super.appendMessage(message);
    this.append('messages.jsonl', message);
    // The conversation's title and last-activity time change when a message lands.
    // Re-appending the record persists both; the loader keeps the last line for an
    // id, so the newest state wins on reload.
    const conversation = this.conversations.get(message.conversationId);
    if (conversation) this.append('conversations.jsonl', conversation);
  }

  override async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    this.ensureLoaded();
    return super.listMessages(conversationId);
  }

  override async saveResponse(response: ConciergeResponse): Promise<void> {
    this.ensureLoaded();
    await super.saveResponse(response);
    this.append('responses.jsonl', response);
  }

  override async getResponse(responseId: string): Promise<ConciergeResponse | null> {
    this.ensureLoaded();
    return super.getResponse(responseId);
  }

  override async createTask(task: HandoffTask): Promise<HandoffTask> {
    this.ensureLoaded();
    const created = await super.createTask(task);
    this.append('tasks.jsonl', created);
    return created;
  }

  override async getTask(taskId: string): Promise<StoredTask | null> {
    this.ensureLoaded();
    return super.getTask(taskId);
  }

  override async listTasks(filter?: { queue?: string; state?: TaskState; clientId?: string }): Promise<HandoffTask[]> {
    this.ensureLoaded();
    return super.listTasks(filter);
  }

  override async listTasksForConversation(conversationId: string): Promise<HandoffTask[]> {
    this.ensureLoaded();
    return super.listTasksForConversation(conversationId);
  }

  override async appendTaskVersion(task: HandoffTask): Promise<void> {
    this.ensureLoaded();
    await super.appendTaskVersion(task);
    this.append('tasks.jsonl', task);
  }

  override async recordDecision(decision: EmployeeDecision): Promise<void> {
    this.ensureLoaded();
    await super.recordDecision(decision);
    this.append('decisions.jsonl', decision);
  }

  override async recordAIRun(run: AIRun): Promise<void> {
    this.ensureLoaded();
    await super.recordAIRun(run);
    this.append('ai-runs.jsonl', run);
  }

  /**
   * Appends to the shared audit file, chaining from whatever is already on disk.
   *
   * The in-memory `AuditLog` cannot be the source of truth here: two processes
   * write this file, and each would otherwise chain from its own last event and
   * fork the history. Reading the tail first keeps one verifiable chain.
   */
  override async appendAudit(input: AuditEventInput): Promise<AuditEvent> {
    this.ensureLoaded();
    // Read-then-write, and the read decides the chain. Two processes doing this
    // concurrently would both see the same head and both claim it as their
    // predecessor, forking the chain. The lock makes the pair atomic across
    // processes; the re-read inside it is what makes holding the lock worthwhile.
    const { value } = withFileLock(join(this.dir, 'audit.jsonl'), () => {
      const existing = this.readAuditFile();
      const previous = existing[existing.length - 1] ?? null;
      const event = buildAuditEvent(
        input,
        previous?.eventHash ?? null,
        `evt_${String(existing.length + 1).padStart(6, '0')}`,
      );
      this.append('audit.jsonl', event);
      return event;
    });
    return value;
  }

  override async listAudit(
    filter: { traceId?: string; resourceType?: string; resourceId?: string } = {},
  ): Promise<AuditEvent[]> {
    this.ensureLoaded();
    return this.readAuditFile()
      .filter((e) => (filter.traceId ? e.traceId === filter.traceId : true))
      .filter((e) => (filter.resourceType ? e.resource.type === filter.resourceType : true))
      .filter((e) => (filter.resourceId ? e.resource.id === filter.resourceId : true));
  }

  override async verifyAuditChain(): Promise<{ valid: boolean; brokenAtIndex: number | null }> {
    this.ensureLoaded();
    return verifyEventChain(this.readAuditFile());
  }

  private readAuditFile(): AuditEvent[] {
    const path = join(this.dir, 'audit.jsonl');
    if (!existsSync(path)) return [];
    const events: AuditEvent[] = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        events.push(JSON.parse(line) as AuditEvent);
      } catch {
        // A malformed line is skipped; chain verification is what reports tampering.
      }
    }
    return events;
  }
}

export { verifyEventChain };
export * from './lock';
export * from './postgres';
export * from './factory';
