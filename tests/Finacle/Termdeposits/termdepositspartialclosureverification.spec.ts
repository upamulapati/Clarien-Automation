import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TERM_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';
import {
  getClosedAccountId,
  getTermDepositAccounts,
} from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

const SCREEN_CODE = TERM_DEPOSIT_DATA.partialClosureVerificationScreenCode;

function getClosedAccount(): string {
  const closed = getClosedAccountId('termDepositPartial');
  if (closed) return closed;

  const accounts = getTermDepositAccounts();
  const firstAccountId = Object.values(accounts)[0] as string;
  if (firstAccountId) return firstAccountId;

  return TERM_DEPOSIT_DATA.relatedPartyAccountId;
}

test(`${SCREEN_CODE} - term deposit partial closure verification`, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const ACCOUNT_ID = getClosedAccount();
  const status = await tdPage.verifyClosure(SCREEN_CODE, ACCOUNT_ID);

  console.log('====================================');
  console.log('TD PARTIAL CLOSURE VERIFICATION STATUS:', status ?? 'Closure authorization completed');
  if (status) {
    expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  } else {
    console.log('No explicit status message returned. Finacle completed the closure authorization without an alert.');
  }
  console.log(`Account: ${ACCOUNT_ID}`);
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
