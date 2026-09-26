/**
 * End-to-end walk through both journeys in a real browser, against the real API.
 * Mirrors the screen-recording script: teacher first, then student.
 *
 * Needs the API (with seeded demo data) and the web dev server running:
 *   npm run dev:api   and   npm run dev:web
 * Then: npx playwright test   (from apps/web)
 */
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

test.describe.configure({ mode: 'serial' });

let joinCode = '';
const studentName = `Asha${Date.now().toString().slice(-5)}`;

test('landing page offers both roles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /first investing mistakes/i })).toBeVisible();
  await shot(page, '01-landing');
});

test('teacher: demo class dashboard shows leaderboard and behavioural nudges', async ({ page }) => {
  await page.goto('/teacher/login');
  await page.getByLabel('Email').fill('demo.teacher@fundlab.app');
  await page.getByLabel('Password').fill('fundlab-demo');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'My classes' })).toBeVisible();
  await shot(page, '02-teacher-classes');

  await page.getByText('Class 10B — Investment Challenge').click();
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
  await expect(page.getByText('Needs a nudge')).toBeVisible();
  // Ishaan never invested: listed but not ranked.
  const ishaan = page.getByRole('row', { name: /Ishaan/ });
  await expect(ishaan).toContainText('Not started');
  await shot(page, '03-teacher-dashboard');

  await page.getByRole('link', { name: 'Dev' }).first().click();
  await expect(page.getByText('Worth a conversation')).toBeVisible();
  await expect(page.getByText('“good fund good fund”').first()).toBeVisible();
  await shot(page, '04-teacher-student-detail');
});

test('teacher: signs up, creates a new class and gets a code', async ({ page }) => {
  // A fresh teacher every run, so tests never add classes to the demo account.
  await page.goto('/teacher/login');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('E2E Teacher');
  await page.getByLabel('Email').fill(`e2e.${Date.now()}@test.fundlab.app`);
  await page.getByLabel('Password').fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'My classes' })).toBeVisible();
  await page.getByLabel('Class name').fill(`E2E class ${Date.now()}`);
  await page.getByLabel(/Starting money/).fill('100000');
  await page.getByRole('button', { name: /Create class/ }).click();
  const code = page.locator('.font-mono.text-3xl');
  await expect(code).toHaveText(/^[A-Z2-9]{6}$/);
  joinCode = (await code.textContent())!.trim();
  await shot(page, '05-teacher-class-created');
});

test('student: joins, explores, invests with a reason, sees portfolio, sells', async ({ page }) => {
  expect(joinCode).not.toBe('');
  await page.goto('/join');
  await page.getByLabel('Class code').fill(joinCode);
  await page.getByLabel('Your name in this class').fill(studentName);
  await shot(page, '06-student-join');
  await page.getByRole('button', { name: 'Join class' }).click();
  await expect(page.getByText('Write down your PIN')).toBeVisible();
  await page.getByRole('button', { name: /written it down/ }).click();

  await expect(page.getByText(/Your money is all cash right now/)).toBeVisible();
  await expect(page.getByText('₹1,00,000').first()).toBeVisible();
  await shot(page, '07-student-home-empty');

  await page.getByRole('link', { name: 'Explore funds' }).first().click();
  await expect(page.getByRole('heading', { name: 'Large cap' })).toBeVisible();
  await expect(page.getByText(/NAV on \d+ \w+ \d{4}/).first()).toBeVisible();
  await shot(page, '08-student-explore');

  await page.getByText('UTI Nifty 50 Index Fund').first().click();
  await expect(page.getByText('Latest published NAV')).toBeVisible();
  await expect(page.getByRole('img').or(page.locator('.recharts-surface')).first()).toBeVisible();
  await page.getByLabel('Amount to invest (₹)').fill('20000');
  await page.getByLabel('Why are you making this investment?').fill('An index of the 50 biggest companies is a steady, low-cost start');
  await shot(page, '09-student-fund-detail');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Confirm investment' }).click();
  await expect(page.getByText('Investment recorded')).toBeVisible();
  await shot(page, '10-student-bought');

  await page.getByRole('link', { name: 'See my portfolio' }).click();
  await expect(page.getByRole('cell', { name: /UTI Nifty 50 Index Fund/ })).toBeVisible();
  await expect(page.getByText('₹80,000').first()).toBeVisible(); // cash left
  await shot(page, '11-student-portfolio');

  await page.getByRole('link', { name: 'UTI Nifty 50 Index Fund' }).click();
  await page.getByRole('tab', { name: 'Sell units' }).click();
  await page.getByLabel('Sell all my units').check();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Confirm sale' }).click();
  await expect(page.getByText('Sale recorded')).toBeVisible();

  await page.getByRole('link', { name: 'My decisions' }).click();
  await expect(page.getByText('Bought').first()).toBeVisible();
  await expect(page.getByText('Sold').first()).toBeVisible();
  await shot(page, '12-student-decisions');
});

test('student: blocked from buying more than their cash, with the exact amount shown', async ({ page }) => {
  await page.goto('/join');
  await page.getByRole('tab', { name: 'I’ve joined before' }).click();
  await page.getByLabel('Class code').fill('BLUE42');
  await page.getByLabel('Your name in this class').fill('Aarav');
  await page.getByLabel('PIN').fill('246810');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText(/Aarav’s .* experiment/)).toBeVisible();
  await page.goto('/student/funds/120716');
  await page.getByLabel('Amount to invest (₹)').fill('50000');
  await page.getByLabel('Why are you making this investment?').fill('Trying to invest more than I have left');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Confirm investment' }).click();
  await expect(page.getByRole('alert')).toContainText('You only have ₹');
  await shot(page, '13-student-insufficient-cash');
});
