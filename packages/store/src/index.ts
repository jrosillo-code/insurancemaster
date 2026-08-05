import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AuditEvent, AuditEventInput } from '@rosillo/audit';
import { AuditLog, verifyEventChain } from '@rosillo/audit';
import type { AIRun, ConciergeResponse, EmployeeDecision, HandoffTask, TaskState } from '@rosillo/domain';

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
    list.push({ ...message });
    this.messages.set(message.conversationId, list);
    const conversation = this.conversations.get(message.conversationId);
    if (conversation) conversation.updatedAt = message.createdAt;
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
  private loaded = false;

  constructor(dir: string = process.env['ROSILLO_DATA_DIR'] ?? '.data') {
    super();
    this.dir = dir;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    mkdirSync(this.dir, { recursive: true });
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

  override async appendAudit(input: AuditEventInput): Promise<AuditEvent> {
    this.ensureLoaded();
    const event = await super.appendAudit(input);
    this.append('audit.jsonl', event);
    return event;
  }
}

export { verifyEventChain };
