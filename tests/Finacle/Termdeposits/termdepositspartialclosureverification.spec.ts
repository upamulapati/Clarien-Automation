import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import {
  getClosedAccountId,
  getTermDepositAccounts,
} from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

const { screenCode: SCREEN_CODE } = COMMON_DATA.termDeposit.partialClosure.verification;

function getClosedAccount(): string {
  const closed = getClosedAccountId('termDepositPartial');
  if (closed) return closed;

  const accounts = getTermDepositAccounts();
  const firstAccountId = Object.values(accounts)[0] as string;
  if (firstAccountId) return firstAccountId;

  return COMMON_DATA.termDepositRelatedParty.accountId;
}

test(`${SCREEN_CODE} - term deposit partial closure verification`, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const ACCOUNT_ID = getClosedAccount();
  const status = await tdPage.verifyClosure(SCREEN_CODE, ACCOUNT_ID);

  console.log('====================================');
  console.log('TD PARTIAL CLOSURE VERIFICATION STATUS:', status ?? 'Closure authorization completed');
  expect(status).toBeTruthy();
  expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log(`Account: ${ACCOUNT_ID}`);
  console.log('====================================');

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});
