import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TOP_UP_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';
import {
  getTopUpDepositAccounts,
  saveClosedAccountId,
} from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const SCREEN_CODE = TOP_UP_DEPOSIT_DATA.screens.partialClosure;
const PARTIAL_WITHDRAWAL_AMT = TOP_UP_DEPOSIT_DATA.partialClosureWithdrawalAmount;
const REPAYMENT_ACCOUNT_ID = TOP_UP_DEPOSIT_DATA.repaymentAcctId;

function getGeneratedAccount(): string {
  if (TOP_UP_DEPOSIT_DATA.partialClosureAccountId) return TOP_UP_DEPOSIT_DATA.partialClosureAccountId as string;
  const accounts = getTopUpDepositAccounts();
  const firstValid = Object.values(accounts).find((v) => v && v.length > 0) as string | undefined;
  if (firstValid) return firstValid;
  return TOP_UP_DEPOSIT_DATA.relatedPartyAccountId as string;
}

test('HCAACTU - top-up deposit partial closure', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);
  const accountId = getGeneratedAccount();
  console.log(`Performing partial closure for TU account: ${accountId}`);
  const statusMessage = await tdPage.partialClosure(SCREEN_CODE, accountId, {
    withdrawalAmount: PARTIAL_WITHDRAWAL_AMT,
    repaymentAccountId: REPAYMENT_ACCOUNT_ID,
  });
  saveClosedAccountId('topUpDepositPartial', accountId);
  console.log(`Saved partially closed TU account ID to shared-state`);
  console.log('====================================');
  console.log('TU PARTIAL CLOSURE COMPLETED SUCCESSFULLY');
  console.log(`Account: ${accountId}`);
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
