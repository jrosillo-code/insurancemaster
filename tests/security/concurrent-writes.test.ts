import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonlStore, verifyEventChain, withFileLock } from '@rosillo/store';

/**
 * Concurrent writers (ADR-0011).
 *
 * The two applications are separate processes appending to one directory. Appending
 * an audit event is a read-then-write — the previous hash comes from what is already
 * on disk — so without a lock two processes both read the same head and both claim
 * it, forking the chain and producing corruption nobody caused maliciously.
 *
 * The load-bearing test here spawns real processes. An in-process test cannot
 * reproduce the race at all: Node runs the read and the write in the same tick.
 */

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rosillo-concurrent-'));
  tempDirs.push(dir);
  return dir;
}

describe('the advisory lock', () => {
  it('refuses a second holder while the first is inside the critical section', () => {
    const dir = makeDir();
    const target = join(dir, 'counter');
    const order: string[] = [];

    withFileLock(target, () => {
      order.push('outer-start');
      // A nested attempt cannot take the lock. It times out and proceeds unlocked
      // rather than deadlocking the request that already holds it.
      const inner = withFileLock(target, () => order.push('inner'), { timeoutMs: 50 });
      expect(inner.locked).toBe(false);
      order.push('outer-end');
    });

    expect(order).toEqual(['outer-start', 'inner', 'outer-end']);
  });

  it('reports whether the lock was actually held', () => {
    const dir = makeDir();
    expect(withFileLock(join(dir, 'free'), () => 'done')).toEqual({ value: 'done', locked: true });
  });

  it('breaks a lock left behind by a process that died', () => {
    const dir = makeDir();
    const target = join(dir, 'stale');
    // A lock file with no owner: written directly, never released.
    writeFileSync(`${target}.lock`, '', 'utf8');

    const result = withFileLock(target, () => 'recovered', { timeoutMs: 1_000, staleMs: 0 });
    expect(result.locked).toBe(true);
    expect(result.value).toBe('recovered');
  });

  it('releases the lock even when the work throws', () => {
    const dir = makeDir();
    const target = join(dir, 'boom');
    expect(() =>
      withFileLock(target, () => {
        throw new Error('failure inside the critical section');
      }),
    ).toThrow('failure inside the critical section');

    // The next caller must still be able to take it.
    expect(withFileLock(target, () => 'after').locked).toBe(true);
  });
});

const STORE_ENTRY = resolve(__dirname, '../../packages/store/src/index.ts');
const WRITERS = 4;
const EVENTS_PER_WRITER = 6;

/** Runs one writer process to completion. */
function runWriter(scriptPath: string, id: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--import', 'tsx', scriptPath, id], {
      cwd: resolve(__dirname, '../..'),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectPromise);
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : rejectPromise(new Error(`writer ${id} exited ${code}: ${stderr}`)),
    );
  });
}

describe('concurrent audit appends across processes', () => {
  it('produces one unbroken chain rather than a fork', async () => {
    const dir = makeDir();
    const scriptPath = join(dir, 'writer.mjs');

    writeFileSync(
      scriptPath,
      `import { JsonlStore } from ${JSON.stringify(STORE_ENTRY)};
const store = new JsonlStore(${JSON.stringify(dir)});
const id = process.argv[2];
for (let i = 0; i < ${EVENTS_PER_WRITER}; i += 1) {
  await store.appendAudit({
    occurredAt: new Date().toISOString(),
    actor: { type: 'SYSTEM', id },
    action: 'SESSION_STARTED',
    resource: { type: 'test', id: id + ':' + i },
    purposeCode: 'SECURITY_CONTROL',
    traceId: 'trace_' + id,
    modelRunId: null,
    beforeHash: null,
    afterHash: null,
    metadata: {},
  });
}
`,
      'utf8',
    );

    // Started together and awaited together, so the four genuinely overlap.
    await Promise.all(['a', 'b', 'c', 'd'].map((id) => runWriter(scriptPath, id)));

    const events = await new JsonlStore(dir).listAudit();
    expect(events.length).toBe(WRITERS * EVENTS_PER_WRITER);
    // The property that matters: one chain, no fork, no gap, no lost write.
    expect(verifyEventChain(events)).toEqual({ valid: true, brokenAtIndex: null });

    // Every writer's events survived; none was silently overwritten.
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(events.filter((event) => event.actor.id === id)).toHaveLength(EVENTS_PER_WRITER);
    }
  }, 60_000);
});
