import { test } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;
const ACCOUNT_ID = COMMON_DATA.topUpDepositRelatedParty.accountId;

test('HOAACVTU - verify related party details for top-up deposit account', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  console.log(`Verifying related party details for account: ${ACCOUNT_ID}`);

  const statusMessage = await tdPage.verifyRelatedPartyDetails(
    COMMON_DATA.topUpDeposit.screens.verify,
    ACCOUNT_ID
  );

  console.log('====================================');
  console.log('RELATED PARTY VERIFICATION STATUS:', statusMessage);
  console.log('====================================');

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});
