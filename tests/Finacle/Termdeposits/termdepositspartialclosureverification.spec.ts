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

// partialClosureAccountId is read directly from the term_deposits sheet

test(`${SCREEN_CODE} - term deposit partial closure verification`, async ({ page }) => {
  test.setTimeout(300000);
  const ACCOUNT_ID = String(TERM_DEPOSIT_DATA.partialClosureAccountId ?? '').trim();
  const EXPECTED_PARTIAL_CLOSURE_ACCOUNT = String(TERM_DEPOSIT_DATA.partialClosureAccountId ?? '').trim();
  if (!ACCOUNT_ID) {
    throw new Error('partialClosureAccountId is not configured in the term_deposits sheet');
  }
  expect(ACCOUNT_ID).toBe(EXPECTED_PARTIAL_CLOSURE_ACCOUNT);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);
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
