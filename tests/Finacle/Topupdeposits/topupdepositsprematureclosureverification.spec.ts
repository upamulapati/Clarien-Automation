import { test } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import {
  getClosedAccountId,
  getTopUpDepositAccounts,
} from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

function getClosedAccount(): string {
  const closed = getClosedAccountId('topUpDeposit');
  if (closed) return closed;

  const accounts = getTopUpDepositAccounts();
  const firstValid = Object.values(accounts).find((v) => v && v.length > 0) as string | undefined;
  if (firstValid) return firstValid;

  return COMMON_DATA.topUpDepositRelatedParty.accountId;
}

test('HCAACVTU - top-up deposit premature closure verification', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);
  const accountId = getClosedAccount();
  console.log(`Verifying premature closure for TU account: ${accountId}`);
  const statusMessage = await tdPage.verifyClosure(COMMON_DATA.topUpDeposit.screens.prematureClosureVerify, accountId);
  console.log('====================================');
  console.log('TU PREMATURE CLOSURE VERIFICATION STATUS:', statusMessage ?? 'Closure authorization completed');
  console.log(`Account: ${accountId}`);
  console.log('====================================');
  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});
