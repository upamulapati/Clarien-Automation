import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TERM_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';
import { getTermDepositAccounts, readSharedState } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const ACCOUNT_ID = String(process.env.TD_DELETE_ACCOUNT_ID || TERM_DEPOSIT_DATA.relatedPartyAccountId || '');

test('HOAACMTD - delete related party details from term deposit account', async ({ page }) => {
  test.setTimeout(180000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  console.log(`Deleting related party details for account: ${ACCOUNT_ID}`);

  const statusMessage = await tdPage.deleteRelatedPartyDetails(
    TERM_DEPOSIT_DATA.screens.modify,
    ACCOUNT_ID
  );

  console.log('====================================');
  console.log('DELETE RELATED PARTY STATUS:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated|accepted|warning)/i);
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
