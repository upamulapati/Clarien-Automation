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

const SCREEN_CODE = TOP_UP_DEPOSIT_DATA.screens.prematureClosure;
const REPAYMENT_ACCOUNT_ID = TOP_UP_DEPOSIT_DATA.repaymentAcctId;

function getGeneratedAccount(): string {
  if (TOP_UP_DEPOSIT_DATA.prematureClosureAccountId) return TOP_UP_DEPOSIT_DATA.prematureClosureAccountId as string;

  const accounts = getTopUpDepositAccounts();
  const firstValid = Object.values(accounts).find((v) => v && v.length > 0) as string | undefined;
  if (firstValid) return firstValid;
  return TOP_UP_DEPOSIT_DATA.relatedPartyAccountId as string;
}

test('HCAACTU - top-up deposit premature closure', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);
  const accountId = getGeneratedAccount();
  console.log(`Performing premature closure for TU account: ${accountId}`);
  const statusMessage = await tdPage.prematureClosure(
    SCREEN_CODE,
    accountId,
    'Z-close',
    REPAYMENT_ACCOUNT_ID
  );
  saveClosedAccountId('topUpDeposit', accountId);
  console.log(`Saved closed TU account ID to shared-state`);
  console.log('====================================');
  console.log('TU PREMATURE CLOSURE COMPLETED SUCCESSFULLY');
  console.log(`Account: ${accountId}`);
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
