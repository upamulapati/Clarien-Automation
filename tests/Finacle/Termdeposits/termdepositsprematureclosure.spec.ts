import { test } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { getTermDepositAccounts } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const { screenCode: SCREEN_CODE, functionOption: FUNCTION_OPTION } = COMMON_DATA.termDeposit.partialClosure;

function getGeneratedAccount(): string {
  const accounts = getTermDepositAccounts();
  const firstAccountId = Object.values(accounts)[0] as string;
  if (firstAccountId) return firstAccountId;
  return COMMON_DATA.termDepositRelatedParty.accountId;
}

test(`${SCREEN_CODE} - term deposit premature closure`, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const ACCOUNT_ID = getGeneratedAccount();
  console.log(`Performing premature closure for TD account: ${ACCOUNT_ID}`);

  const status = await tdPage.prematureClosure(SCREEN_CODE, ACCOUNT_ID, FUNCTION_OPTION, COMMON_DATA.termDeposit.repaymentAccountId);

  console.log('====================================');
  console.log('PREMATURE CLOSURE COMPLETED SUCCESSFULLY');
  console.log('Status:', status ?? 'completed');
  console.log('====================================');

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});