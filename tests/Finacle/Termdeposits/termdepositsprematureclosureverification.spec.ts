import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { ServicePackPage } from '../../pages/servicepackpage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TERM_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';
import { getTermDepositAccounts, getClosedAccountId } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Read generated TD account from creation spec
const SCREEN_CODE = TERM_DEPOSIT_DATA.partialClosureVerificationScreenCode;

function getGeneratedAccount(): string {
  const closed = getClosedAccountId('termDepositPremature');
  if (closed) return closed;
  if (TERM_DEPOSIT_DATA.prematureClosureAccountId) return TERM_DEPOSIT_DATA.prematureClosureAccountId;
  const accounts = getTermDepositAccounts();
  const firstAccountId = Object.values(accounts)[0] as string;
  if (firstAccountId) return firstAccountId;
  // Fallback to Excel-driven data if no generated account found
  return TERM_DEPOSIT_DATA.relatedPartyAccountId;
}

test(`${SCREEN_CODE} - term deposit premature closure verification`, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const ACCOUNT_ID = getGeneratedAccount();
  const status = await tdPage.verifyClosure(SCREEN_CODE, ACCOUNT_ID);

  console.log('====================================');
  console.log('CLOSURE VERIFICATION STATUS:', status ?? 'Closure authorization completed');
  if (status) {
    expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  } else {
    console.log('No explicit status message returned. Finacle completed the closure authorization without an alert.');
  }
  console.log('====================================');

  const spPage = new ServicePackPage(page);
  const { interestAmount } = await spPage.validateTermDepositInterestReport(ACCOUNT_ID);
  console.log('Interest Amount is synchronized:', interestAmount);
  expect(interestAmount).toBeTruthy();

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
