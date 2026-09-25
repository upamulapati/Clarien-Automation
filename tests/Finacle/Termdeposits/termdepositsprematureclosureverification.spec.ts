import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { ServicePackPage } from '../../pages/servicepackpage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { getTermDepositAccounts } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Read generated TD account from creation spec
const { screenCode: SCREEN_CODE, functionOption: FUNCTION_OPTION } = COMMON_DATA.termDeposit.partialClosure.verification;

function getGeneratedAccount(): string {
  const accounts = getTermDepositAccounts();
  const firstAccountId = Object.values(accounts)[0] as string;
  if (firstAccountId) return firstAccountId;
  // Fallback to common data if no generated account found
  return COMMON_DATA.termDepositRelatedParty.accountId;
}

test(`${SCREEN_CODE} - term deposit premature closure verification`, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const ACCOUNT_ID = getGeneratedAccount();
  const status = await tdPage.verifyClosure(SCREEN_CODE, ACCOUNT_ID);

  console.log('====================================');
  console.log('CLOSURE VERIFICATION STATUS:', status ?? 'Closure authorization completed');
  expect(status).toBeTruthy();
  expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
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
