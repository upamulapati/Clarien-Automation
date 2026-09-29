import { test, expect } from '@playwright/test';
import { CashTransactionPage } from '../../pages/CoreBanking/CashTransactionPage';
import { HomePage } from '../../pages/HomePages/HomePage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { captureEvidence } from '../../helpers/evidence';
import { CREDENTIALS } from '../../../data/credentials';
import { DEFAULT_CUSTOMER } from '../../config/testData';
import { recordTransactionId } from '../../helpers/sharedState';

const MAKER = CREDENTIALS.verifierCredentials;
const VERIFIER = CREDENTIALS.credentials;
const ACCOUNT_ID = '6000197087';
const CURRENCY = 'BMD';
const AMOUNT = '100.00';
const TRAN_TYPE_SUBTYPE = 'C/NP - Cash/Normal Payment';
const SOL_ID = DEFAULT_CUSTOMER.solId;

test.describe('HCASHWD - Cash Withdrawal Post and Verify', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(600000);
  });

  test('HCASHWD - post and verify cash withdrawal', async ({ page }) => {
    // Step 1-2: Login and invoke HCASHWD.
    const { homePage } = await loginToFinacle(page, MAKER.username, MAKER.password);
    const cash = new CashTransactionPage(page);

    await cash.invokeCashMenu('HCASHWD');
    await captureEvidence(page, 'HCASHWD menu invoked', { accountId: ACCOUNT_ID, amount: AMOUNT, ccy: CURRENCY });

    // Step 3-5: Add function, transaction type, then Go.
    await cash.selectFunction('A');
    await cash.selectTranTypeSubType(TRAN_TYPE_SUBTYPE);
    await cash.clickGo();
    await page.waitForTimeout(3000);
    await captureEvidence(page, 'HCASHWD add screen opened', { tranTypeSubType: TRAN_TYPE_SUBTYPE });

    // Step 6-8: Debit account, currency, amount and list all part transactions.
    await cash.selectCurrency(CURRENCY);
    await cash.selectPartTranType('D');
    await cash.enterAccountId(ACCOUNT_ID);
    await cash.enterAmount(AMOUNT);
    await cash.selectListAllPartTransaction();
    await captureEvidence(page, 'HCASHWD transaction details entered', {
      accountId: ACCOUNT_ID,
      amount: AMOUNT,
      ccy: CURRENCY,
      partTran: 'Debit',
    });

    // Step 8-9: Denomination and OK.
    await cash.clickDenomination();
    await cash.fillDenomination(AMOUNT);
    await cash.clickOk();

    // Step 10: Post.
    await cash.clickPost();
    await page.waitForTimeout(3000);

    const postError = await cash.getExactErrorMessage();
    if (postError) {
      await cash.logScreenMessages();
      throw new Error(`HCASHWD post error: ${postError}`);
    }

    const transactionId = await cash.getTransactionId();
    expect(transactionId, 'Transaction ID was not generated after Post').not.toBeNull();
    console.log(`=== HCASHWD Transaction ID: ${transactionId} ===`);

    const postMessage = await cash.getStatusMessage();
    expect(
      postMessage,
      `Expected posted success message, got: ${postMessage}`
    ).toMatch(/successfully|posted|completed| authorised| authorized/i);

    await captureEvidence(page, 'HCASHWD posted', {
      transactionId,
      accountId: ACCOUNT_ID,
      amount: AMOUNT,
      ccy: CURRENCY,
      postMessage,
    });

    if (transactionId) {
      recordTransactionId(transactionId);
    }

    // Acknowledge the confirmation screen.
    await cash.clickOk();
    await homePage.logout();

    // Step 11-15: Verifier login and verify.
    const { homePage: verifierHomePage } = await loginToFinacle(
      page,
      VERIFIER.username,
      VERIFIER.password
    );
    await cash.invokeCashMenu('HCASHWD');
    await cash.selectFunction('V');
    await cash.enterTransactionId(transactionId!);
    await cash.clickGo();
    await page.waitForTimeout(3000);

    await cash.clickVerifyOkOrSubmit();
    await page.waitForTimeout(3000);

    const verifyError = await cash.getExactErrorMessage();
    if (verifyError) {
      await cash.logScreenMessages();
      throw new Error(`HCASHWD verification error: ${verifyError}`);
    }

    const verifyMessage = await cash.getStatusMessage();
    expect(
      verifyMessage,
      `Expected verification success message, got: ${verifyMessage}`
    ).toMatch(/successfully|verified|authorised|authorized|approved|completed/i);

    console.log(`=== HCASHWD Verified: ${transactionId} - ${verifyMessage} ===`);
    await captureEvidence(page, 'HCASHWD verified', { transactionId, verifyMessage });
    await verifierHomePage.logout();
  });

  // === STRICT ASSERTIONS INJECTION ===
  test.afterEach(async ({ page }) => {
    const html = (await page.content()).toLowerCase();
    expect(html).not.toMatch(/core dump|internal server error/);
  });
});
