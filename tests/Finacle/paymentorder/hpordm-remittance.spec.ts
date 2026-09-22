import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { PaymentOrderPage } from '../../pages/CoreBanking/PaymentOrderPage';
import { CREDENTIALS } from '../../../data/credentials';
import { writeSharedState, getSharedValue } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';
import { captureEvidence } from '../../helpers/evidence';
import { HPORDM_DATA, HPORDM_DATA_SWIFT, todayDDMMYYYY } from '../../helpers/common';

const SHARED_ACCOUNT_ID = getSharedValue<string>('accountId');
if (SHARED_ACCOUNT_ID) console.log(`[SharedState] Using debit/charging account from previous run: ${SHARED_ACCOUNT_ID}`);

const SCENARIOS = [
  { name: 'ACH', data: { ...HPORDM_DATA as any, debitAccount: SHARED_ACCOUNT_ID ?? HPORDM_DATA.debitAccount }, sharedKey: 'paymentOrderId' },
  { name: 'SWIFT', data: { ...HPORDM_DATA_SWIFT as any, debitAccount: SHARED_ACCOUNT_ID ?? HPORDM_DATA_SWIFT.debitAccount }, sharedKey: 'paymentOrderIdSwift' },
];

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

for (const scenario of SCENARIOS) {
  test(`HPORDM - add payment order remittance (${scenario.name})`, async ({ page }) => {
  test.setTimeout(900000);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page, lastDialogMessages);
  const paymentOrderPage = new PaymentOrderPage(page, lastDialogMessages);

  // Step 1: Select "Core Server" from the solution drop down.
  console.log('Selecting Core Server...');
  await accountPage.selectCoreServer();

  // Step 2: Type menu option "HPORDM".
  console.log('Searching for HPORDM...');
  await accountPage.searchTransactionManagement('HPORDM');
  await page.waitForTimeout(3000);

  // Step 3: Function - Add, Payment product - customer transfer, click GO.
  console.log('Selecting Add function...');
  await accountPage.selectFunction('Add');
  const businessDate = (await paymentOrderPage.getBusinessDate()) || todayDDMMYYYY();
  console.log(`Business date: ${businessDate}`);
  await captureEvidence(page, `Step 3: Add function opened (${scenario.name})`, { function: 'Add', paymentProduct: scenario.data.paymentProduct, businessDate });
  console.log('Selecting Payment product...');
  await paymentOrderPage.selectPaymentProduct(scenario.data.paymentProduct);
  console.log('Clicking product Go...');
  await paymentOrderPage.clickProductGo();
  await page.waitForTimeout(3000);
  await captureEvidence(page, `Step 3: Product opened (${scenario.name})`, { function: 'Add', paymentProduct: scenario.data.paymentProduct, businessDate });

  // Assertion: remittance entry form loaded
  const remittanceFormText = await paymentOrderPage.getPageText();
  expect(remittanceFormText).toContain('Debit A/c');

  // Step 4-9: Remittance header details.
  console.log('Entering debit account...');
  await paymentOrderPage.enterDebitAccount(scenario.data.debitAccount);
  console.log('Entering requested execution date...');
  await paymentOrderPage.enterRequestedExecutionDate(businessDate);
  console.log('Entering remittance CCY/AMT...');
  await paymentOrderPage.selectRemittanceCcy(scenario.data.ccy);
  await paymentOrderPage.enterRemittanceAmount(scenario.data.amount);
  if (scenario.data.needsUsdPopup) {
    console.log('Handling USD popup/rate code...');
    await page.waitForTimeout(3000);
    await paymentOrderPage.selectRateCodeIfPresent(scenario.data.rateCode);
    await page.waitForTimeout(2000);
  }
  console.log('Entering debit value date...');
  await paymentOrderPage.enterDebitValueDate(businessDate);
  console.log('Entering charging account...');
  await paymentOrderPage.enterChargingAccount(scenario.data.debitAccount);
  console.log('Entering debit execution date...');
  await paymentOrderPage.enterDebitExecutionDate(businessDate);
  console.log('Entering credit execution date...');
  await paymentOrderPage.enterCreditExecutionDate(businessDate);
  console.log('Entering credit value date...');
  await paymentOrderPage.enterCreditValueDate(businessDate);
  await page.waitForTimeout(1000);
  await captureEvidence(page, `Step 4-9: Remittance header filled (${scenario.name})`, { debitAccount: scenario.data.debitAccount, ccy: scenario.data.ccy, amount: scenario.data.amount, debitValueDate: businessDate, creditValueDate: businessDate });

  // Step 10: Beneficiary customer details.
  console.log('Entering beneficiary details...');
  await paymentOrderPage.selectBeneficiaryAddressType(scenario.data.beneficiaryAddressType);
  if (scenario.data.beneficiaryBic) {
    await paymentOrderPage.enterBeneficiaryBic(scenario.data.beneficiaryBic);
  }
  if (scenario.data.beneficiaryName) {
    await paymentOrderPage.enterBeneficiaryName(scenario.data.beneficiaryName);
  }
  if (scenario.data.beneficiaryAddress) {
    await paymentOrderPage.enterBeneficiaryAddress(scenario.data.beneficiaryAddress);
  }
  await paymentOrderPage.enterBeneficiaryAccountId(scenario.data.beneficiaryAccountId);
  await paymentOrderPage.enterBeneficiaryCountry(scenario.data.beneficiaryCountry || scenario.data.country);

  // Step 11: Account with institution - Address type F, BIC (auto-populates bank/branch), Country.
  console.log('Entering institution details...');
  await paymentOrderPage.selectInstitutionAddressType(scenario.data.institutionAddressType);
  await paymentOrderPage.enterBic(scenario.data.bic);
  await paymentOrderPage.enterCountry(scenario.data.country);
  await captureEvidence(page, `Step 10-11: Beneficiary and institution details (${scenario.name})`, { beneficiaryAccountId: scenario.data.beneficiaryAccountId, bic: scenario.data.bic, country: scenario.data.country, institutionAddressType: scenario.data.institutionAddressType });

  // Credit / charge details.
  console.log('Entering credit and charge details...');
  await paymentOrderPage.selectPaymentMethod(scenario.data.paymentMethod);
  await paymentOrderPage.clickFetchCharges();
  await page.waitForTimeout(2000);

  await paymentOrderPage.selectChargeOption(scenario.data.chargeOption);
  await page.waitForTimeout(1000);

  console.log('Viewing and submitting charge details...');
  await paymentOrderPage.clickViewCharges();
  await page.waitForTimeout(3000);
  await paymentOrderPage.clickChargeSubmit();
  await page.waitForTimeout(3000);
  await captureEvidence(page, `Step: Charges submitted (${scenario.name})`, { chargeOption: scenario.data.chargeOption });

  console.log('Visiting reimbursement details tab...');
  await paymentOrderPage.clickReimbursementDetailsTab();
  await page.waitForTimeout(2000);
  await paymentOrderPage.submitReimbursementDetails();
  await page.waitForTimeout(2000);

  console.log('Syncing form values...');
  await paymentOrderPage.syncRemittanceValues(scenario.data, businessDate);

  if (scenario.data.needsUsdPopup) {
    await paymentOrderPage.dumpFinwHtml('ach-fcc-finw.html');
  }

  console.log('Submitting payment order on main page...');
  await paymentOrderPage.clickMainSubmit();
  await page.waitForTimeout(3000);

  let postSubmitText = await paymentOrderPage.getPageText();
  console.log('postSubmitText preview:', postSubmitText.toLowerCase().replace(/\s+/g, ' ').slice(0, 3000));

  // Assertion: payment order should be added successfully without fatal/core/multibyte errors
  expect(postSubmitText.toLowerCase()).toContain('added successfully');
  expect(postSubmitText.toLowerCase()).not.toMatch(/fatal|core dump|internal server error|invalid field value/);

  const paymentOrderId = await paymentOrderPage.getPaymentOrderId(lastDialogMessages);
  console.log(`=== [${scenario.name}] PAYMENT ORDER ID: ${paymentOrderId} ===`);
  await captureEvidence(page, `Step: Payment order submitted (${scenario.name})`, { paymentOrderId, status: 'added successfully' });
  expect(paymentOrderId, 'Payment order ID must be generated').toMatch(/\d{6,}/);
  if (paymentOrderId) {
    writeSharedState({ [scenario.sharedKey]: paymentOrderId });
  }

  console.log('Logging out...');
  await homePage.logout();
  });

  test(`HPORDM - verify payment order (${scenario.name})`, async ({ page }) => {
    test.setTimeout(900000);

    const paymentOrderId = getSharedValue((state: any) => (state as any)[scenario.sharedKey] as string | undefined) ?? '';
    if (paymentOrderId) console.log(`[SharedState] [${scenario.name}] Using Payment Order ID: ${paymentOrderId}`);

    expect(paymentOrderId, 'Payment order ID must be available for verification').toMatch(/\d{6,}/);

    const lastDialogMessages: string[] = [];
    setupDialogHandlers(page, lastDialogMessages);

    const { homePage } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
    const accountPage = new AccountPage(page, lastDialogMessages);
    const paymentOrderPage = new PaymentOrderPage(page, lastDialogMessages);

    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();

    console.log('Searching for HPORDM...');
    await accountPage.searchTransactionManagement('HPORDM');
    await page.waitForTimeout(3000);

    console.log('Selecting Verify function...');
    await accountPage.selectFunction('Verify');
    console.log(`Entering Payment Order ID: ${paymentOrderId}`);
    await paymentOrderPage.enterPaymentOrderId(paymentOrderId);
    console.log('Clicking Go...');
    await paymentOrderPage.clickGo();
    await page.waitForTimeout(3000);
    await captureEvidence(page, `Step: Verify form loaded (${scenario.name})`, { paymentOrderId, function: 'Verify' });

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

    const businessDate = (await paymentOrderPage.getBusinessDate()) || todayDDMMYYYY();
    console.log('Visiting reimbursement details tab...');
    await paymentOrderPage.clickReimbursementDetailsTab();
    await page.waitForTimeout(2000);
    await paymentOrderPage.submitReimbursementDetails();
    await page.waitForTimeout(2000);

    console.log('Syncing form values...');
    await paymentOrderPage.syncRemittanceValues(scenario.data, businessDate);

    console.log('Submitting verification...');
    await paymentOrderPage.clickMainSubmit();
    await page.waitForTimeout(3000);

    const status = await paymentOrderPage.getPageText();
    await captureEvidence(page, `Step: Payment order verified (${scenario.name})`, { paymentOrderId, statusPreview: status.substring(0, 500) });
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
