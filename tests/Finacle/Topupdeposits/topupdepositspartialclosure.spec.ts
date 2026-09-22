import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import {
  getTopUpDepositAccounts,
  saveClosedAccountId,
} from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const PARTIAL_WITHDRAWAL_AMT = '500';

function getGeneratedAccount(): string {
  const accounts = getTopUpDepositAccounts();
  const firstValid = Object.values(accounts).find((v) => v && v.length > 0) as string | undefined;
  if (firstValid) return firstValid;
  return COMMON_DATA.topUpDepositRelatedParty.accountId;
}

test('HCAACTU - top-up deposit partial closure', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);
  const accountId = getGeneratedAccount();
  console.log(`Performing partial closure for TU account: ${accountId}`);
  const statusMessage = await tdPage.partialClosure(COMMON_DATA.topUpDeposit.screens.partialClosure, accountId, {
    withdrawalAmount: PARTIAL_WITHDRAWAL_AMT,
    repaymentAccountId: COMMON_DATA.topUpDeposit.repaymentAcctId,
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
