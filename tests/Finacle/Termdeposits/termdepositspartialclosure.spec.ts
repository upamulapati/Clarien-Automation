import { test } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import {
  getTermDepositAccounts,
  saveClosedAccountId,
} from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const { screenCode: SCREEN_CODE, withdrawalAmount: PARTIAL_WITHDRAWAL_AMT } = COMMON_DATA.termDeposit.partialClosure;

function getGeneratedAccount(): string {
  const accounts = getTermDepositAccounts();
  const firstAccountId = Object.values(accounts)[0] as string;
  if (firstAccountId) return firstAccountId;
  return COMMON_DATA.termDepositRelatedParty.accountId;
}

test(`${SCREEN_CODE} - term deposit partial closure`, async ({ page }, testInfo) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const ACCOUNT_ID = getGeneratedAccount();
  console.log(`Performing partial closure for TD account: ${ACCOUNT_ID}`);

  const status = await tdPage.partialClosure(SCREEN_CODE, ACCOUNT_ID, {
    withdrawalAmount: PARTIAL_WITHDRAWAL_AMT,
    repaymentAccountId: COMMON_DATA.termDeposit.repaymentAccountId,
  });

  try {
    saveClosedAccountId('termDepositPartial', ACCOUNT_ID);
    console.log('Saved partially closed TD account ID to shared-state');
  } catch (e) {
    console.log('Could not save closed account ID:', e);
  }

  console.log('====================================');
  console.log('TD PARTIAL CLOSURE COMPLETED SUCCESSFULLY');
  console.log('Status:', status ?? 'completed');
  console.log(`Account: ${ACCOUNT_ID}`);
  console.log(`Withdrawal Amt: ${PARTIAL_WITHDRAWAL_AMT}`);
  console.log('====================================');

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});



