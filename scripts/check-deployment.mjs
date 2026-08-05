/**
 * Post-deployment check.
 *
 *   node scripts/check-deployment.mjs <concierge-url> <copilot-url>
 *
 * Drives a real browser against a real deployment and asserts the things that are
 * only true if the deployment is actually wired up:
 *
 *   - both surfaces respond and carry their security headers
 *   - a client can sign in and get a grounded answer with a citation
 *   - a request that must reach a person becomes a task in the *other* application,
 *     which is the only proof the two share a database
 *   - the audit chain spans both and verifies
 *   - nothing belonging to another client leaks into an answer
 *
 * Exits non-zero on the first failure. Read-only apart from creating one conversation
 * and one task, which is what a demo does anyway.
 *
 * SYNTHETIC DATA ONLY.
 */

import { chromium } from '@playwright/test';

const [, , CLIENT_URL, EMPLOYEE_URL] = process.argv;
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo';

if (!CLIENT_URL || !EMPLOYEE_URL) {
  console.error('Usage: node scripts/check-deployment.mjs <concierge-url> <copilot-url>');
  process.exit(2);
}

const trim = (url) => url.replace(/\/+$/, '');
const CLIENT = trim(CLIENT_URL);
const EMPLOYEE = trim(EMPLOYEE_URL);

let failures = 0;
let checks = 0;

function ok(label, detail = '') {
  checks += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
}

function bad(label, detail) {
  checks += 1;
  failures += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
}

function assert(condition, label, detail = '') {
  if (condition) ok(label, detail);
  else bad(label, detail);
  return Boolean(condition);
}

function section(title) {
  console.log(`\n\x1b[1m── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}\x1b[0m`);
}

async function signIn(page, base, email) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

async function ask(page, message) {
  await page.locator('textarea[name="message"]').fill(message);
  await page.getByRole('button', { name: /Enviar|Enviando/ }).click();
  await page.locator('.bubble.assistant').last().waitFor({ timeout: 45_000 });
}

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
});

try {
  // ── Reachability and headers ──────────────────────────────────────────────
  section('Reachability and security headers');

  for (const [name, base] of [
    ['concierge', CLIENT],
    ['copilot', EMPLOYEE],
  ]) {
    const probe = await browser.newContext();
    const page = await probe.newPage();
    let response;
    try {
      response = await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (error) {
      bad(`${name} responds`, error.message.split('\n')[0]);
      await probe.close();
      continue;
    }

    const status = response?.status() ?? 0;
    assert(status === 200, `${name} responds`, `HTTP ${status}`);

    const headers = response?.headers() ?? {};
    const csp = headers['content-security-policy'] ?? '';
    assert(/nonce-[^']+/.test(csp), `${name} sends a nonce-based CSP`);
    assert(!csp.includes("script-src 'unsafe-inline'"), `${name} CSP has no unsafe-inline script-src`);
    assert(headers['x-content-type-options'] === 'nosniff', `${name} sends X-Content-Type-Options`);
    assert(headers['referrer-policy'] === 'no-referrer', `${name} sends Referrer-Policy: no-referrer`);

    // HSTS is only meaningful over TLS, and only set in production.
    if (base.startsWith('https://')) {
      assert(Boolean(headers['strict-transport-security']), `${name} sends HSTS`);
    } else {
      console.log(`  \x1b[33m·\x1b[0m ${name} HSTS not checked — not served over https`);
    }

    // The banner is part of the layout, so it cannot be missing on any route.
    const banner = await page.locator('.synthetic-banner').first().innerText().catch(() => '');
    assert(banner.includes('DATOS SINTÉTICOS'), `${name} shows the synthetic-data banner`);

    await probe.close();
  }

  if (failures > 0) {
    console.log('\n\x1b[31mStopping: the surfaces are not both healthy.\x1b[0m');
    process.exit(1);
  }

  // ── A grounded answer ─────────────────────────────────────────────────────
  section('Client Concierge');

  const clientContext = await browser.newContext({ locale: 'es-ES' });
  const client = await clientContext.newPage();
  await signIn(client, CLIENT, 'ana@cliente.test');
  ok('signs in');

  await ask(client, '¿Cuál es la franquicia de mi coche?');
  const answerType = await client.locator('.answer-type').last().innerText().catch(() => '');
  const answer = await client.locator('.bubble.assistant').last().innerText().catch(() => '');
  assert(answer.includes('300'), 'answers a policy fact with the real figure');
  assert(answerType.length > 0, 'labels the answer type', answerType.trim());
  assert((await client.locator('.evidence-card').count()) > 0, 'cites its source');

  // Cross-client leakage: an unrelated namesake's insurer must not appear.
  const page1 = await client.locator('body').innerText();
  assert(!page1.includes('Mutua Sintética'), 'shows nothing belonging to the same-surname stranger');

  // ── The handoff ───────────────────────────────────────────────────────────
  section('Handoff across the two deployments');

  await client.goto(`${CLIENT}/chat`, { waitUntil: 'domcontentloaded' });
  await ask(client, 'Quiero dar de baja el seguro del coche.');
  const hasAction = (await client.locator('.action-card').count()) > 0;
  assert(hasAction, 'a cancellation is prepared, not executed');
  const actionText = await client.locator('.action-card').first().innerText().catch(() => '');
  assert(
    !/he dado de baja|enviado a la aseguradora/i.test(actionText),
    'the action never claims it was done',
  );

  const employeeContext = await browser.newContext({ locale: 'es-ES' });
  const employee = await employeeContext.newPage();
  await signIn(employee, EMPLOYEE, 'carlos@rosillo.test');
  ok('an employee signs in');

  await employee.goto(EMPLOYEE, { waitUntil: 'domcontentloaded' });
  const taskCount = await employee.locator('a[href^="/tareas/"]').count();
  const sharedDatabase = assert(
    taskCount > 0,
    'the task created in the Concierge appears in the Copilot queue',
    taskCount > 0 ? `${taskCount} task(s)` : 'empty queue — the two projects are not on the same database',
  );

  if (sharedDatabase) {
    await employee.locator('a[href^="/tareas/"]').first().click();
    await employee.locator('.verbatim').waitFor({ timeout: 20_000 });
    const verbatim = await employee.locator('.verbatim').innerText();
    assert(verbatim.includes('dar de baja'), "the client's exact words reached the reviewer");
    assert(
      (await employee.locator('.statement .tag').count()) > 0,
      'client statements are labelled as unverified',
    );

    const buttons = await employee.locator('.decision-form button').allInnerTexts().catch(() => []);
    assert(
      buttons.length > 0 && !/enviar a la aseguradora|ejecutar/i.test(buttons.join(' ')),
      'only prepare/approve decisions exist — nothing that acts outside Rosillo',
      buttons.join(' · ') || 'no decision form (task may already be decided)',
    );
  }

  // ── Audit ─────────────────────────────────────────────────────────────────
  section('Audit trail');

  await employee.goto(`${EMPLOYEE}/auditoria`, { waitUntil: 'domcontentloaded' });
  const onAuditPage = employee.url().includes('auditoria');
  if (assert(onAuditPage, 'a supervisor can open the audit trail')) {
    const notice = await employee.locator('.notice').first().innerText().catch(() => '');
    assert(notice.includes('verificada'), 'the hash chain verifies', notice.split('\n')[0]);

    const actions = await employee.locator('table.audit tbody tr td:nth-child(3)').allInnerTexts();
    const distinct = new Set(actions.map((a) => a.trim()));
    assert(distinct.has('MESSAGE_RECEIVED'), 'the trail contains events written by the Concierge');
    assert(distinct.has('TASK_CREATED'), 'the trail contains the handoff');

    const metadata = (await employee.locator('table.audit tbody tr td:nth-child(6)').allInnerTexts()).join(' ');
    assert(!metadata.includes('dar de baja el seguro'), 'the trail holds no message text');
  }

  // A role without audit.read must not reach it.
  const specialistContext = await browser.newContext({ locale: 'es-ES' });
  const specialist = await specialistContext.newPage();
  await signIn(specialist, EMPLOYEE, 'lucia@rosillo.test');
  await specialist.goto(`${EMPLOYEE}/auditoria`, { waitUntil: 'domcontentloaded' });
  assert(!specialist.url().includes('auditoria'), 'a role without audit.read is turned away');

  await clientContext.close();
  await employeeContext.close();
  await specialistContext.close();
} finally {
  await browser.close();
}

console.log(
  failures === 0
    ? `\n\x1b[32mAll ${checks} checks passed. The deployment is live and wired up correctly.\x1b[0m\n`
    : `\n\x1b[31m${failures} of ${checks} checks failed.\x1b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
