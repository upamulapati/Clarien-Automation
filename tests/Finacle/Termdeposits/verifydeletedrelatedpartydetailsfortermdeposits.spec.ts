import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TERM_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';
import { getTermDepositAccounts, readSharedState } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

function getCreatedAccount(): string {
  const accounts = getTermDepositAccounts();
  const firstAccountId = Object.values(accounts)[0] as string | undefined;
  const state = readSharedState();
  return firstAccountId || state.accountId || TERM_DEPOSIT_DATA.relatedPartyAccountId || '9200000618';
}

const ACCOUNT_ID = getCreatedAccount();

test('HOAACVTD - verify deleted related party details for term deposit account', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const status = await tdPage.verifyDeletedRelatedPartyDetails(
    TERM_DEPOSIT_DATA.screens.verify,
    ACCOUNT_ID
  );

  console.log('====================================');
  console.log('DELETE VERIFICATION STATUS:', status);
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
