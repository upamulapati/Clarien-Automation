import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

test(COMMON_DATA.termDepositRelatedParty.testLabel, async ({ page }) => {
  test.setTimeout(180000);
  const data = COMMON_DATA.termDepositRelatedParty;
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const status = await tdPage.addRelatedPartyDetails(
    COMMON_DATA.termDeposit.screens.modify,
    data
  );

  console.log('====================================');
  console.log('RELATED PARTY STATUS:', status ?? 'Success screen appeared');
  expect(status).toBeTruthy();
  expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('====================================');

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});


