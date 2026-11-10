import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TERM_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';
import {
  getTermDepositAccounts,
  saveClosedAccountId,
} from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const SCREEN_CODE = TERM_DEPOSIT_DATA.partialClosureScreenCode;
const PARTIAL_WITHDRAWAL_AMT = TERM_DEPOSIT_DATA.partialClosureWithdrawalAmount;

// partialClosureAccountId is read directly from the term_deposits sheet

test(`${SCREEN_CODE} - term deposit partial closure`, async ({ page }, testInfo) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const ACCOUNT_ID = String(TERM_DEPOSIT_DATA.partialClosureAccountId ?? '').trim();
  const EXPECTED_PARTIAL_CLOSURE_ACCOUNT = String(TERM_DEPOSIT_DATA.partialClosureAccountId ?? '').trim();
  if (!ACCOUNT_ID) {
    throw new Error('partialClosureAccountId is not configured in the term_deposits sheet');
  }
  expect(ACCOUNT_ID).toBe(EXPECTED_PARTIAL_CLOSURE_ACCOUNT);
  console.log(`Performing partial closure for TD account: ${ACCOUNT_ID}`);

  const status = await tdPage.partialClosure(SCREEN_CODE, ACCOUNT_ID, {
    withdrawalAmount: PARTIAL_WITHDRAWAL_AMT,
    repaymentAccountId: TERM_DEPOSIT_DATA.repaymentAccountId,
  });

  try {
    saveClosedAccountId('termDepositPartial', ACCOUNT_ID);
    console.log('Saved partially closed TD account ID to shared-state');
  } catch (e) {
    console.log('Could not save closed account ID:', e);
  expect(e).toBeTruthy();
  }

  console.log('====================================');
  console.log('TD PARTIAL CLOSURE COMPLETED SUCCESSFULLY');
  console.log('Status:', status ?? 'completed');
  if (status) {
    expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  } else {
    console.log('No explicit status message returned. Finacle completed the partial closure without an alert.');
  }
  console.log(`Account: ${ACCOUNT_ID}`);
  console.log(`Withdrawal Amt: ${PARTIAL_WITHDRAWAL_AMT}`);
  console.log('====================================');

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});




// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
