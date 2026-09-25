import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const ACCOUNT_ID = COMMON_DATA.termDepositRelatedParty.accountId;

test('HOAACMTD - delete related party details from term deposit account', async ({ page }) => {
  test.setTimeout(180000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const status = await tdPage.deleteRelatedPartyDetails(
    COMMON_DATA.termDeposit.screens.modify,
    ACCOUNT_ID
  );

  console.log('====================================');
  console.log('DELETE RELATED PARTY STATUS:', status ?? 'Success screen appeared');
  expect(status).toBeTruthy();
  expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
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
