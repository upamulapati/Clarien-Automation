import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TOP_UP_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;
const ACCOUNT_ID = TOP_UP_DEPOSIT_DATA.relatedPartyAccountId || '9200000632';

test('HOAACVTU - verify related party details for top-up deposit account', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  console.log(`Verifying related party details for account: ${ACCOUNT_ID}`);

  const statusMessage = await tdPage.verifyRelatedPartyDetails(
    TOP_UP_DEPOSIT_DATA.screens.verify,
    ACCOUNT_ID
  );

  console.log('====================================');
  console.log('RELATED PARTY VERIFICATION STATUS:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
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
