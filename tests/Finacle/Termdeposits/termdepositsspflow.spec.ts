import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';
import COMMON_DATA from '../../../data/common-data.json';

const ACCOUNT_ID = '9200000658';
const SCREENS = COMMON_DATA.termDeposit.screens;
const INTEREST_OUTFLOW_START_DATE = '30-08-2026';

test('HOAACMTD/HOAACVTD - modify, verify, and validate revised TD principal flow', async ({ page }, testInfo) => {
  test.setTimeout(600000);
  const spPage = new ServicePackPage(page);
  const persistedDate = await spPage.servicePackTermDepositRevisedPrincipalFlow(ACCOUNT_ID, INTEREST_OUTFLOW_START_DATE, SCREENS);
  expect(persistedDate).toBe(INTEREST_OUTFLOW_START_DATE);
  await testInfo.attach('term-deposit-revised-flow', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await spPage.servicePackTermDepositClickOk();
});
