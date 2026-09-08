import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { PaymentOrderPage } from '../../pages/CoreBanking/PaymentOrderPage';
import { CREDENTIALS } from '../../../data/credentials';
import { writeSharedState } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';
import { HPORDM_DATA, HPORDM_DATA_SWIFT, HPORDM_DATA_ACH_FCC, HPORDM_DATA_SWIFT_FCC, todayDDMMYYYY } from '../../helpers/common';

const SCENARIOS = [
  { name: 'ACH', data: HPORDM_DATA as any, sharedKey: 'paymentOrderId' },
  { name: 'SWIFT', data: HPORDM_DATA_SWIFT as any, sharedKey: 'paymentOrderIdSwift' },
  { name: 'ACH-FCC', data: HPORDM_DATA_ACH_FCC as any, sharedKey: 'paymentOrderIdAchFcc' },
  { name: 'SWIFT-FCC', data: HPORDM_DATA_SWIFT_FCC as any, sharedKey: 'paymentOrderIdSwiftFcc' },
];

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

for (const scenario of SCENARIOS) {
  test(`HPORDM - add payment order remittance (${scenario.name})`, async ({ page }) => {
  test.setTimeout(900000);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page);
  const paymentOrderPage = new PaymentOrderPage(page);

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
  console.log('Selecting Payment product...');
  await paymentOrderPage.selectPaymentProduct(scenario.data.paymentProduct);
  console.log('Clicking product Go...');
  await paymentOrderPage.clickProductGo();
  await page.waitForTimeout(3000);

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

  // Step 10: Beneficiary customer - Address type F, BIC (auto-populates bank/branch), Account ID, Country.
  console.log('Entering beneficiary details...');
  await paymentOrderPage.selectBeneficiaryAddressType(scenario.data.beneficiaryAddressType);
  await paymentOrderPage.enterBeneficiaryBic(scenario.data.beneficiaryBic);
  await paymentOrderPage.enterBeneficiaryAccountId(scenario.data.beneficiaryAccountId);
  await paymentOrderPage.enterBeneficiaryCountry(scenario.data.beneficiaryCountry || scenario.data.country);

  // Step 11: Account with institution - Address type F, BIC (auto-populates bank/branch), Country.
  console.log('Entering institution details...');
  await paymentOrderPage.selectInstitutionAddressType(scenario.data.institutionAddressType);
  await paymentOrderPage.enterBic(scenario.data.bic);
  await paymentOrderPage.enterCountry(scenario.data.country);

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

  console.log('Visiting reimbursement details tab...');
  await paymentOrderPage.clickReimbursementDetailsTab();
  await page.waitForTimeout(2000);
  await paymentOrderPage.submitReimbursementDetails();
  await page.waitForTimeout(2000);

  console.log('Syncing form values...');
  await paymentOrderPage.syncRemittanceValues(scenario.data, businessDate);

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
  expect(paymentOrderId, 'Payment order ID must be generated').toMatch(/\d{6,}/);
  if (paymentOrderId) {
    writeSharedState({ [scenario.sharedKey]: paymentOrderId });
  }

  console.log('Logging out...');
  await homePage.logout();
  });
}
