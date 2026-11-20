import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import { recordTransactionId, updateSharedState } from '../../helpers/sharedState';
import { TRANSFER_DATA, DEFAULT_CUSTOMER } from '../../config/excelTestData';
import { captureEvidence } from '../../helpers/evidence';

const MAKER = CREDENTIALS.credentials;
const MODIFIER = CREDENTIALS.secondCredentials;

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

test.describe('Transfer Maintenance - Modify', () => {
  let homePage: HomePage;
  let tmPage: AccountPage;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(900000);
    homePage = new HomePage(page);
    tmPage = new AccountPage(page);
  });

  test('HTM - Add, save, modify and post', async ({ page }) => {
    const ROW: any = TRANSFER_DATA[0] ?? {};
    const STEP: any = ROW.data ?? {};

    const SOL_ID = STEP.solId ?? DEFAULT_CUSTOMER.solId ?? '100';
    const TRAN_TYPE_SUBTYPE = STEP.tranTypeSubType ?? 'T/CI';

    const entries = tmPage.getHtmPartTransactions(STEP);
    const debit = entries.find((e) => e.type === 'D');
    const credit = entries.find((e) => e.type === 'C');

    expect(debit, 'Debit part transaction must be configured in transfer data').toBeTruthy();
    expect(credit, 'Credit part transaction must be configured in transfer data').toBeTruthy();

    // Currency rule: Post by Part Transaction when the two sides differ.
    const fallbackCcy = STEP.ccy ?? STEP.currency ?? DEFAULT_CUSTOMER.ccy ?? 'BMD';
    const getCcy = (entry: any) => {
      const f = entry?.fields ?? {};
      return (
        f['debitRef.CCY'] ??
        f['creditRef.CCY'] ??
        f['Ref.CCY'] ??
        f['ccy'] ??
        f['currency'] ??
        fallbackCcy
      );
    };
    const debitCcy = String(getCcy(debit)).toUpperCase();
    const creditCcy = String(getCcy(credit)).toUpperCase();
    const usePostByPartTransaction = debitCcy !== creditCcy;

    // Modified values can be driven from optional Excel columns so the sheet
    // only needs one set of modify fields, not duplicated per debit/credit side.
    const MODIFY_FIELDS = {
      transactionParticulars: STEP.modifiedTransactionParticulars || '123',
      transactionParticularsCode: STEP.modifiedTransactionParticularsCode || 'SAI',
      remarks1: STEP.modifiedRemarks1 || 'test1',
      remarks2: STEP.modifiedRemarks2 || 'test2',
    };

    async function assertHtmSuccess(stage: string, successPattern?: RegExp) {
      const hasError = await tmPage.checkHtmError();
      const statusMsg = await tmPage.getStatusMessage();
      const isError =
        hasError ||
        !!(statusMsg && /error|failed|invalid|cannot|unsuccessful|rejected|not posted/i.test(statusMsg));

      if (isError) {
        await tmPage.logScreenMessages();
        await captureEvidence(page, `HTM ${stage} failed`, { statusMsg, hasError });
        expect(false, `HTM ${stage} failed: ${statusMsg ?? 'validation/exception error'}`).toBe(true);
      }

      if (successPattern && statusMsg) {
        expect(statusMsg, `HTM ${stage} success message not matched. Got: ${statusMsg}`).toMatch(successPattern);
      }
    }

    // ============================================================
    // Phase 1: Add and save an unposted HTM transaction (maker).
    // ============================================================
    console.log('=== Phase 1: Add and save transaction ===');

    ({ homePage } = await loginToFinacle(page, MAKER.username, MAKER.password));

    console.log('Selecting Core Server...');
    await tmPage.selectCoreServer();

    console.log('Searching for HTM...');
    await tmPage.searchTransactionManagement('HTM');
    await page.waitForTimeout(3000);

    console.log('Selecting Add function...');
    await tmPage.selectHtmFunction('A');

    console.log(`Entering Sol id: ${SOL_ID}`);
    await tmPage.enterHtmSolId(String(SOL_ID));

    console.log(`Selecting transaction type/subtype: ${TRAN_TYPE_SUBTYPE}`);
    await tmPage.selectHtmTranTypeSubType(TRAN_TYPE_SUBTYPE);

    console.log('Clicking Go button...');
    await tmPage.clickHtmGo();
    await page.waitForTimeout(5000);

    console.log('Filling part transactions and saving...');
    const savedTransactionId = await tmPage.saveHtmTransfer(STEP);
    expect(savedTransactionId, 'Transaction ID was not generated after Save').toBeTruthy();
    const savedId = savedTransactionId as string;
    console.log(`=== SAVED TRANSACTION ID: ${savedId} ===`);

    await assertHtmSuccess('Save');

    recordTransactionId(savedId);
    updateSharedState((state: any) => {
      state.htmSavedTransactionId = savedId;
    });

    await captureEvidence(page, 'Phase 1: Transaction saved', {
      savedTransactionId: savedId,
      debitCcy,
      creditCcy,
      usePostByPartTransaction,
    });

    console.log('Clicking OK on confirmation...');
    await tmPage.clickHtmOk();

    console.log('Logging out...');
    await homePage.logout();
    await page.waitForTimeout(3000);

    // ============================================================
    // Phase 2: Modify the saved transaction and post (second user).
    // ============================================================
    console.log('=== Phase 2: Modify and post transaction ===');

    ({ homePage } = await loginToFinacle(page, MODIFIER.username, MODIFIER.password));

    console.log('Selecting Core Server...');
    await tmPage.selectCoreServer();

    console.log('Searching for HTM...');
    await tmPage.searchTransactionManagement('HTM');
    await page.waitForTimeout(3000);

    console.log('Selecting Modify function...');
    await tmPage.selectHtmFunction('M');

    console.log(`Entering saved transaction id: ${savedId}`);
    await tmPage.enterHtmTransactionId(savedId);

    console.log('Clicking Go button...');
    await tmPage.clickHtmGo();
    await page.waitForTimeout(5000);

    await assertHtmSuccess('Modify load');

    // Modify Record 1 and update it.
    console.log('Modifying Record 1...');
    await tmPage.setHtmPartTranFields(MODIFY_FIELDS);
    await tmPage.clickHtmAdd();

    // Select and modify Record 2.
    console.log('Selecting Record 2 to modify...');
    await tmPage.selectHtmRecord(2);

    console.log('Modifying Record 2...');
    await tmPage.setHtmPartTranFields(MODIFY_FIELDS);

    if (usePostByPartTransaction) {
      console.log('Clicking Post by Part Transaction button...');
      await tmPage.clickHtmPostByPartTransaction();
    } else {
      console.log('Clicking Post button...');
      await tmPage.clickHtmPost();
    }
    await page.waitForTimeout(5000);

    await assertHtmSuccess('Post', /posted|successfully|completed|authorised|authorized/i);

    const finalTransactionId = await tmPage.getHtmTransactionId();
    expect(finalTransactionId, 'Final transaction ID was not generated after Post').toBeTruthy();
    const finalId = finalTransactionId as string;
    console.log(`=== FINAL TRANSACTION ID: ${finalId} ===`);

    recordTransactionId(finalId);
    updateSharedState((state: any) => {
      state.transactionId = finalId;
      state.htmFinalTransactionId = finalId;
    });

    await captureEvidence(page, 'Phase 2: Transaction modified and posted', {
      savedTransactionId: savedId,
      finalTransactionId: finalId,
      debitCcy,
      creditCcy,
      usePostByPartTransaction,
    });

    console.log('Clicking OK on confirmation...');
    await tmPage.clickHtmOk();

    console.log('Logging out...');
    await homePage.logout();
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
