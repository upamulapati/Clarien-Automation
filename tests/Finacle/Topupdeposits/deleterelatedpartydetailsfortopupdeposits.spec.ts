import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const ACCOUNT_ID = COMMON_DATA.topUpDepositRelatedParty.accountId;

test('HOAACMTU - delete related party details from top-up deposit account', async ({ page }) => {
  test.setTimeout(180000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  console.log(`Deleting related party details for account: ${ACCOUNT_ID}`);

  const statusMessage = await tdPage.deleteRelatedPartyDetails(
    COMMON_DATA.topUpDeposit.screens.modify,
    ACCOUNT_ID
  );

  console.log('====================================');
  console.log('DELETE RELATED PARTY STATUS:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('====================================');

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});
