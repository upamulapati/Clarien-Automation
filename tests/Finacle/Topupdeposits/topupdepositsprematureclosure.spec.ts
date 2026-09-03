import { test } from '@playwright/test';
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

function getGeneratedAccount(): string {
  const accounts = getTopUpDepositAccounts();
  const firstValid = Object.values(accounts).find((v) => v && v.length > 0) as string | undefined;
  if (firstValid) return firstValid;
  return COMMON_DATA.topUpDepositRelatedParty.accountId;
}

test('HCAACTU - top-up deposit premature closure', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);
  const accountId = getGeneratedAccount();
  console.log(`Performing premature closure for TU account: ${accountId}`);
  const statusMessage = await tdPage.prematureClosure(
    COMMON_DATA.topUpDeposit.screens.prematureClosure,
    accountId,
    'Z-close',
    COMMON_DATA.topUpDeposit.repaymentAcctId
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
