import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';
import { TOP_UP_DEPOSIT_DATA } from '../../config/testData';

const HTUTM_DATA = {
  screenCode: TOP_UP_DEPOSIT_DATA.spTransferScreenCode,
  creditAccount: TOP_UP_DEPOSIT_DATA.spTransferCreditAccount,
  debitAccount: TOP_UP_DEPOSIT_DATA.spTransferDebitAccount,
  amount: TOP_UP_DEPOSIT_DATA.spTransferAmount,
  installmentType: TOP_UP_DEPOSIT_DATA.spTransferInstallmentType,
};

test('HTUTM - top-up transfer maintenance', async ({ page }, testInfo) => {
  test.setTimeout(300000);
  const spPage = new ServicePackPage(page);
  const result = await spPage.servicePackTopUpTransferMaintenance(HTUTM_DATA);
  await testInfo.attach('topup-sp-transfer', { body: result.screenshot, contentType: 'image/png' });
  expect(result.transactionId).toBeTruthy();
  console.log('Top-up transfer transaction ID:', result.transactionId);
  expect(result.transactionId).toBeTruthy();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
