import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';
import { TERM_DEPOSIT_DATA } from '../../config/testData';

const ACCOUNT_ID = TERM_DEPOSIT_DATA.spflowAccountId;
const SCREENS = TERM_DEPOSIT_DATA.screens;
const INTEREST_OUTFLOW_START_DATE = TERM_DEPOSIT_DATA.spflowInterestOutflowStartDate;

test('HOAACMTD/HOAACVTD - modify, verify, and validate revised TD principal flow', async ({ page }, testInfo) => {
  test.setTimeout(600000);
  const spPage = new ServicePackPage(page);
  const persistedDate = await spPage.servicePackTermDepositRevisedPrincipalFlow(ACCOUNT_ID, INTEREST_OUTFLOW_START_DATE, SCREENS);
  expect(persistedDate).toBe(INTEREST_OUTFLOW_START_DATE);
  await testInfo.attach('term-deposit-revised-flow', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await spPage.servicePackTermDepositClickOk();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
