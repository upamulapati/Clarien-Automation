import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { PaymentOrderPage } from '../../pages/CoreBanking/PaymentOrderPage';
import { CREDENTIALS } from '../../../data/credentials';
import { getSharedValue } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';
import { HPORDM_DATA, HPORDM_DATA_SWIFT } from '../../helpers/common';

const SCENARIOS = [
  { name: 'ACH', data: HPORDM_DATA as any, sharedKey: 'paymentOrderId' },
  { name: 'SWIFT', data: HPORDM_DATA_SWIFT as any, sharedKey: 'paymentOrderIdSwift' },
];

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

for (const scenario of SCENARIOS) {
  test(`HPORDM - verify payment order (${scenario.name})`, async ({ page }) => {
    test.setTimeout(900000);

    const paymentOrderId = getSharedValue((state: any) => (state as any)[scenario.sharedKey] as string | undefined) ?? '';
    if (paymentOrderId) console.log(`[SharedState] [${scenario.name}] Using Payment Order ID: ${paymentOrderId}`);

    expect(paymentOrderId, 'Payment order ID must be available for verification').toMatch(/\d{6,}/);

    const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
  const accountPage = new AccountPage(page);
  const paymentOrderPage = new PaymentOrderPage(page);

  // Step 1: Select "Core Server".
  console.log('Selecting Core Server...');
  await accountPage.selectCoreServer();

  // Step 2: Type menu option "HPORDM".
  console.log('Searching for HPORDM...');
  await accountPage.searchTransactionManagement('HPORDM');
  await page.waitForTimeout(3000);

  // Step 3: Function - V - Verify, enter payment order ID, Go.
  console.log('Selecting Verify function...');
  await accountPage.selectFunction('Verify');
  console.log(`Entering Payment Order ID: ${paymentOrderId}`);
  await paymentOrderPage.enterPaymentOrderId(paymentOrderId);
  console.log('Clicking Go...');
  await paymentOrderPage.clickGo();
  await page.waitForTimeout(3000);

  // Step 4: Land on payment order page and validate all the details.
  console.log('Validating payment order details...');
  const pageText = await paymentOrderPage.getPageText();
  const cleanText = pageText.replace(/[,\s]/g, '').toLowerCase();

  expect(pageText).toContain(scenario.data.debitAccount);
  expect(cleanText).toContain(`${scenario.data.ccy}${scenario.data.amount}`.toLowerCase());
  expect(pageText).toContain(scenario.data.beneficiaryAccountId);
  expect(pageText).toContain(scenario.data.bic);
  expect(pageText).toContain(scenario.data.bankCode);
  expect(pageText).toContain(scenario.data.branchCode);
  expect(pageText).toContain(scenario.data.country);

  if (scenario.data.ourCorrespondentBic) {
    expect(pageText).toContain(scenario.data.ourCorrespondentBic);
    expect(pageText).toContain(scenario.data.ourCorrespondentBranchCode);
    expect(pageText).toContain(scenario.data.ourCorrespondentBankCode);
  }

  // Step 7: Click Submit - Payment order is verified successfully.
  console.log('Submitting verification...');
  await paymentOrderPage.clickMainSubmit();
  await page.waitForTimeout(3000);

  const status = await paymentOrderPage.getPageText();
  expect(status.toLowerCase()).toContain('verified');
  expect(status.toLowerCase()).not.toMatch(/fatal|core dump|internal server error|invalid field value|failed/);
  console.log('Status after submit:', status.substring(0, 200));

  console.log('Logging out...');
  await homePage.logout();
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
