import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';

const HTUTM_DATA = {
  screenCode: 'HTUTM',
  creditAccount: '9300000131',
  debitAccount: '500USD2297007',
  amount: '500',
  installmentType: 'Normal Installment',
};

test('HTUTM - top-up transfer maintenance', async ({ page }, testInfo) => {
  test.setTimeout(300000);
  const spPage = new ServicePackPage(page);
  const result = await spPage.servicePackTopUpTransferMaintenance(HTUTM_DATA);
  await testInfo.attach('topup-sp-transfer', { body: result.screenshot, contentType: 'image/png' });
  expect(result.transactionId).toBeTruthy();
  console.log('Top-up transfer transaction ID:', result.transactionId);
});
