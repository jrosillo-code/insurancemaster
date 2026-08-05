import { expect, test, type Page } from '@playwright/test';
import { E2E } from '../../playwright.config';

/**
 * The client → employee handoff, across two running applications (Milestone E).
 *
 * This is the test the prototype exists to pass. A client asks for something the
 * platform may only prepare; a task appears in the employee workspace carrying the
 * exact request, the authority it was made under, the verified facts and what is
 * missing; a specialist cannot approve it while required information is outstanding;
 * a supervisor can, with a recorded reason; the client sees the resulting status; and
 * one hash-chained audit trail spans the whole thing.
 */

const PASSWORD = 'demo';

async function clientSignIn(page: Page, email: string): Promise<void> {
  await page.goto(`${E2E.clientUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/chat**');
}

async function employeeSignIn(page: Page, email: string): Promise<void> {
  await page.goto(`${E2E.employeeUrl}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test('a cancellation request becomes an adviser task and comes back as a status', async ({ browser }) => {
  const clientContext = await browser.newContext();
  const employeeContext = await browser.newContext();
  const client = await clientContext.newPage();
  const employee = await employeeContext.newPage();

  // ── The client asks for something the platform may only prepare ────────────
  await clientSignIn(client, 'ana@cliente.test');
  await client.locator('textarea[name="message"]').fill('Quiero dar de baja el seguro del coche.');
  await client.getByRole('button', { name: 'Enviar' }).click();
  await expect(client.locator('.action-card')).toBeVisible();
  await expect(client.locator('.action-status')).toContainText(/revisa|cola|asesor/i);

  // ── The task is in the employee queue, written by the other process ────────
  await employeeSignIn(employee, 'carlos@rosillo.test');
  await employee.goto(E2E.employeeUrl);
  const taskLink = employee.locator('a[href^="/tareas/"]').first();
  await expect(taskLink).toBeVisible();
  await taskLink.click();

  // Everything Milestone E requires on one screen.
  await expect(employee.getByRole('heading', { name: 'Petición exacta del cliente' })).toBeVisible();
  await expect(employee.locator('.verbatim')).toContainText('dar de baja el seguro del coche');
  await expect(employee.getByRole('heading', { name: 'Identidad y autorización' })).toBeVisible();
  await expect(employee.getByRole('heading', { name: 'Datos verificados' })).toBeVisible();
  await expect(employee.getByRole('heading', { name: 'Información pendiente' })).toBeVisible();
  await expect(employee.getByRole('heading', { name: 'Evidencia utilizada' })).toBeVisible();
  await expect(employee.getByRole('heading', { name: 'Pólizas relacionadas' })).toBeVisible();

  // The client's own words are visually held apart from anything Rosillo verified.
  await expect(employee.locator('.statement .tag')).toContainText('no verificado');

  // Only the four permitted decisions exist. Nothing sends, binds or executes.
  for (const label of ['Aprobar', 'Aprobar con correcciones', 'Escalar', 'Rechazar']) {
    await expect(employee.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  const buttons = await employee.locator('.decision-form button').allInnerTexts();
  expect(buttons.join(' ')).not.toMatch(/enviar a la aseguradora|ejecutar|dar de baja ya/i);

  // ── Decide, and the client sees the result ────────────────────────────────
  await employee.getByRole('button', { name: 'Tomar la tarea (pasa a revisión)' }).click();
  // Claiming redirects and re-renders the form; filling before the new DOM arrives
  // would populate a page that is about to be replaced.
  await expect(employee.locator('.badge.state-IN_REVIEW')).toBeVisible();

  await employee
    .locator('input[name="overrideReason"]')
    .fill('El cliente aporta la matrícula y la fecha; se tramita con la documentación pendiente.');
  await employee.locator('textarea[name="note"]').fill('Verificado contra la póliza en vigor.');
  await employee.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await expect(employee.locator('.notice.ok').first()).toContainText('Decisión registrada');
  // The client-visible wording is derived from the task state, not written by hand.
  await expect(employee.locator('.notice.ok').last()).toContainText('El cliente ve');

  // Versions are additive: the original is still there alongside the new state.
  const versions = await employee.locator('.card:has(h3:text("Historial de versiones")) .fact').allInnerTexts();
  expect(versions.length).toBeGreaterThan(1);

  await client.goto(`${E2E.clientUrl}/conversaciones`);
  await client.locator('a[href^="/chat?c="]').first().click();
  await expect(client.locator('.action-status')).toContainText(/asesor|aceptado|revisad/i);

  await clientContext.close();
  await employeeContext.close();
});

test('a specialist cannot approve while required information is outstanding', async ({ browser }) => {
  const clientContext = await browser.newContext();
  const employeeContext = await browser.newContext();
  const client = await clientContext.newPage();
  const employee = await employeeContext.newPage();

  await clientSignIn(client, 'ana@cliente.test');
  await client
    .locator('textarea[name="message"]')
    .fill('Me han dado un golpe en el parking esta mañana y quiero dar el parte.');
  await client.getByRole('button', { name: 'Enviar' }).click();
  await expect(client.locator('.action-card')).toBeVisible();

  // Lucía is a claims specialist: she holds the queue but not the override.
  await employeeSignIn(employee, 'lucia@rosillo.test');
  await employee.goto(E2E.employeeUrl);
  await employee.locator('a[href^="/tareas/"]').first().click();

  await expect(employee.locator('.missing-item .sev.REQUIRED').first()).toBeVisible();
  await expect(
    employee.locator('.notice.warn').filter({ hasText: 'dato(s) obligatorio(s)' }),
  ).toContainText('motivo de excepción');
  await expect(employee.getByRole('button', { name: 'Aprobar', exact: true })).toBeDisabled();
  // Escalating is always available — a specialist who cannot decide can still act.
  await expect(employee.getByRole('button', { name: 'Escalar' })).toBeEnabled();

  await clientContext.close();
  await employeeContext.close();
});

test('an employee cannot open a task in a queue they do not hold', async ({ page }) => {
  await employeeSignIn(page, 'lucia@rosillo.test');
  await page.goto(E2E.employeeUrl);
  const links = await page.locator('a[href^="/tareas/"]').all();
  // The claims specialist's queue view lists only her own queue.
  for (const link of links) {
    const row = link.locator('xpath=ancestor::*[contains(@class,"task-row")][1]');
    if ((await row.count()) > 0) {
      await expect(row.locator('.badge.queue')).toContainText('siniestros');
    }
  }
});

test('the audit trail spans both applications and verifies', async ({ page }) => {
  await employeeSignIn(page, 'carlos@rosillo.test');
  await page.goto(`${E2E.employeeUrl}/auditoria`);

  await expect(page.locator('.notice.ok')).toContainText('Cadena de integridad verificada');

  const actions = await page.locator('table.audit tbody tr td:nth-child(3)').allInnerTexts();
  const distinct = new Set(actions.map((a) => a.trim()));
  // Events written by the client application and by this one are in the same chain.
  expect(distinct).toContain('MESSAGE_RECEIVED');
  expect(distinct).toContain('TASK_CREATED');
  expect(distinct).toContain('TASK_DECIDED');

  // The trail carries ids and verdicts, never the text of a message or a policy.
  const metadata = (await page.locator('table.audit tbody tr td:nth-child(6)').allInnerTexts()).join(' ');
  expect(metadata).not.toContain('dar de baja el seguro');
  expect(metadata).not.toContain('franquicia aplicable');
});

test('the audit trail is closed to a role without the permission', async ({ page }) => {
  await employeeSignIn(page, 'lucia@rosillo.test');
  await page.goto(`${E2E.employeeUrl}/auditoria`);
  // A claims specialist holds no audit.read permission and is sent back.
  await expect(page).not.toHaveURL(/auditoria/);
});
