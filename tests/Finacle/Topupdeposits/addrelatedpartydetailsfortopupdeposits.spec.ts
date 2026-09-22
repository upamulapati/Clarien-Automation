import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

test(COMMON_DATA.topUpDepositRelatedParty.testLabel, async ({ page }) => {
  test.setTimeout(180000);
  const data = COMMON_DATA.topUpDepositRelatedParty;
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);
  const statusMessage = await tdPage.addRelatedPartyDetails(COMMON_DATA.topUpDeposit.screens.modify, data);
  console.log('====================================');
  console.log('RELATED PARTY STATUS:', statusMessage);
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
