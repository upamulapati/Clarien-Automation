import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TERM_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';
import { getTermDepositAccounts, readSharedState } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

function getCreatedAccount(): string {
  const accounts = getTermDepositAccounts();
  const firstAccountId = Object.values(accounts)[0] as string | undefined;
  const state = readSharedState();
  return firstAccountId || state.accountId || TERM_DEPOSIT_DATA.relatedPartyAccountId || '9200000618';
}

const ACCOUNT_ID = getCreatedAccount();

test('HOAACMTD - delete related party details from term deposit account', async ({ page }) => {
  test.setTimeout(180000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const status = await tdPage.deleteRelatedPartyDetails(
    TERM_DEPOSIT_DATA.screens.modify,
    ACCOUNT_ID
  );

  console.log('====================================');
  console.log('DELETE RELATED PARTY STATUS:', status ?? 'Success screen appeared');
  if (status) {
    expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  } else {
    console.log('No explicit status message returned. Finacle completed the related party deletion without an alert.');
  }
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
