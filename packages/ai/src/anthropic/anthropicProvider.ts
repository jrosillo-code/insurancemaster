import type {
  ClassifyIntentInput,
  ConciergeAIProvider,
  DraftAnswerInput,
  ProviderHealth,
  ProviderUsage,
} from '../provider';
import { promptRegistry } from '../registry';

/**
 * Opt-in Anthropic provider (ADR-0005).
 *
 * Off by default. The deterministic mock provider is what tests and the evaluation
 * suite run against; this exists so the same prompts and the same policy layer can
 * be measured against a live model without changing anything else.
 *
 * The provider is untrusted like any other: it returns `unknown`, and orchestration
 * validates, constrains and — where the model reached for something it may not have —
 * discards. Structured outputs are requested so the common case is well-formed, but
 * nothing downstream assumes it.
 *
 * SYNTHETIC DATA ONLY. Enabling this sends synthetic client messages and synthetic
 * document passages to Anthropic. It must not be enabled against real Rosillo data
 * without the vendor and data-protection review described in the blueprint (§12.1).
 */

const DEFAULT_MODEL = 'claude-opus-5';

/** JSON Schema for the intent classification call. */
const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string' },
    confidence: { type: 'number' },
    secondaryIntents: { type: 'array', items: { type: 'string' } },
    lifeEventType: { type: ['string', 'null'] },
    note: { type: 'string' },
  },
  required: ['intent', 'confidence', 'secondaryIntents', 'lifeEventType', 'note'],
  additionalProperties: false,
} as const;

/** JSON Schema for the answer drafting call. Note the absence of any id field. */
const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    answerType: {
      type: 'string',
      enum: ['FACT', 'EXPLANATION', 'PROCEDURE', 'PRELIMINARY', 'INSUFFICIENT', 'EMERGENCY', 'OUT_OF_SCOPE'],
    },
    clientMessage: { type: 'string' },
    citedEvidenceIndexes: { type: 'array', items: { type: 'integer' } },
    uncertainty: { type: 'array', items: { type: 'string' } },
    followUpQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['id', 'text', 'reason'],
        additionalProperties: false,
      },
    },
    proposedActionCodes: { type: 'array', items: { type: 'string' } },
    safetyNotice: { type: ['string', 'null'] },
  },
  required: [
    'answerType',
    'clientMessage',
    'citedEvidenceIndexes',
    'uncertainty',
    'followUpQuestions',
    'proposedActionCodes',
    'safetyNotice',
  ],
  additionalProperties: false,
} as const;

interface AnthropicClientLike {
  messages: {
    create(body: Record<string, unknown>): Promise<{
      content: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      stop_reason?: string | null;
    }>;
  };
}

export class AnthropicConciergeProvider implements ConciergeAIProvider {
  readonly name = 'anthropic';
  readonly promptVersions = promptRegistry.currentVersions();

  private client: AnthropicClientLike | null = null;
  private usage: ProviderUsage = { inputTokens: 0, outputTokens: 0, requests: 0 };

  constructor(readonly model: string = process.env['ANTHROPIC_MODEL'] ?? DEFAULT_MODEL) {}

  /**
   * Loads the SDK lazily so the package installs and type-checks without it.
   * The API key is read from the environment and never passed through a prompt.
   */
  private async getClient(): Promise<AnthropicClientLike> {
    if (this.client) return this.client;
    if (!process.env['ANTHROPIC_API_KEY']) {
      throw new Error('ANTHROPIC_API_KEY is not set; the anthropic provider cannot start.');
    }
    const module = (await import('@anthropic-ai/sdk')) as unknown as {
      default: new (options?: Record<string, unknown>) => AnthropicClientLike;
    };
    this.client = new module.default();
    return this.client;
  }

  async classifyIntent(input: ClassifyIntentInput): Promise<unknown> {
    const prompt = promptRegistry.get('INTENT_CLASSIFIER');
    const history = input.wrappedHistory.slice(-4).join('\n\n');
    return this.call({
      system: prompt.text,
      userText: [
        `Allowed intents: ${input.allowedIntents.join(', ')}`,
        `Reply language: ${input.language}`,
        history ? `Recent turns:\n${history}` : '',
        `Current message:\n${input.wrappedMessage}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      schema: INTENT_SCHEMA,
      // Classification is a short, scoped decision — low effort keeps it cheap and
      // fast. Thinking stays on (disabling it on Opus 5 has known failure modes).
      effort: 'low',
      // Room for the thinking as well as the answer. `max_tokens` caps both
      // together on Opus 5, and the classification itself is barely a hundred
      // tokens — a tight budget here truncates the reasoning, not the output.
      maxTokens: 4096,
    });
  }

  async draftAnswer(input: DraftAnswerInput): Promise<unknown> {
    const prompt = promptRegistry.get('ANSWER_DRAFTER');
    const candidates = input.candidates
      .map(
        (c) =>
          `[${c.index}] (tier ${c.tier}${c.stale ? ', SUPERSEDED' : ''}${
            c.viaDelegation ? ", ANOTHER PERSON'S RECORD" : ''
          }) ${c.label}\n${c.content}`,
      )
      .join('\n\n');
    // The thread goes before the evidence and the message, in reading order, so the
    // model meets the conversation the way the client experienced it.
    const history = input.wrappedHistory.slice(-6).join('\n\n');
    return this.call({
      system: prompt.text,
      userText: [
        `Intent: ${input.intent}`,
        `Reply language: ${input.language}`,
        history ? `Earlier in this conversation (oldest first):\n${history}` : '',
        `Active context: ${input.contextLabel}${input.organisationContext ? ' (organisation)' : ''}`,
        `Evidence sufficient: ${input.evidenceInsufficient ? 'NO' : 'yes'}`,
        input.insufficiencyReasons.length > 0
          ? `Insufficiency reasons: ${input.insufficiencyReasons.join('; ')}`
          : '',
        input.conflicts.length > 0 ? `Conflicting sources: ${input.conflicts.join('; ')}` : '',
        input.staleSources.length > 0 ? `Superseded sources: ${input.staleSources.join('; ')}` : '',
        `Permitted action codes: ${input.permittedActionCodes.join(', ') || 'none'}`,
        `Evidence candidates:\n${candidates || '(none)'}`,
        `Client message:\n${input.wrappedMessage}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      schema: DRAFT_SCHEMA,
      // Drafting is the intelligence-sensitive call: it has to hold the evidence
      // rules, the thread and the register at once, and getting it wrong is the
      // failure this whole architecture exists to prevent.
      effort: 'high',
      maxTokens: 16_000,
    });
  }

  private async call(options: {
    system: string;
    userText: string;
    schema: Record<string, unknown>;
    effort: 'low' | 'medium' | 'high';
    maxTokens: number;
  }): Promise<unknown> {
    const client = await this.getClient();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens,
      system: options.system,
      output_config: {
        effort: options.effort,
        format: { type: 'json_schema', schema: options.schema },
      },
      messages: [{ role: 'user', content: options.userText }],
    });

    this.usage = {
      inputTokens: this.usage.inputTokens + (response.usage?.input_tokens ?? 0),
      outputTokens: this.usage.outputTokens + (response.usage?.output_tokens ?? 0),
      requests: this.usage.requests + 1,
    };

    // A refusal is a legitimate outcome, not an exception — orchestration turns an
    // unparseable result into the safe insufficient-evidence path.
    if (response.stop_reason === 'refusal') return null;

    const text = response.content.find((block) => block.type === 'text')?.text;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!process.env['ANTHROPIC_API_KEY']) {
      return { ok: false, provider: this.name, model: this.model, detail: 'ANTHROPIC_API_KEY not set' };
    }
    try {
      await this.getClient();
      return { ok: true, provider: this.name, model: this.model };
    } catch (error) {
      return {
        ok: false,
        provider: this.name,
        model: this.model,
        detail: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
      };
    }
  }

  getUsage(): ProviderUsage {
    return { ...this.usage };
  }
}
