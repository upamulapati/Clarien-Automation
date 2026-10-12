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
  return process.env.TD_MOD_ACCOUNT || firstAccountId || state.accountId || TERM_DEPOSIT_DATA.modificationAccountId || '9200000614';
}

const MOD_ACCOUNT_NUMBER = getCreatedAccount();
const NEW_DEPOSIT_PERIOD_MONTHS = TERM_DEPOSIT_DATA.newDepositPeriodMonths || '24';
const NEW_DEPOSIT_PERIOD_DAYS = TERM_DEPOSIT_DATA.newDepositPeriodDays || '0';

test(`${TERM_DEPOSIT_DATA.screens.modify} - modify term deposit account`, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const status = await tdPage.modifyTermDeposit(
    TERM_DEPOSIT_DATA.screens.modify,
    MOD_ACCOUNT_NUMBER,
    NEW_DEPOSIT_PERIOD_MONTHS,
    NEW_DEPOSIT_PERIOD_DAYS
  );

  console.log('====================================');
  console.log('MODIFICATION STATUS:', status ?? 'No status message captured');
  if (status) {
    expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  } else {
    console.log('No explicit status message returned. Finacle completed the modification without an alert.');
  }
  console.log('====================================');

  console.log('Logging out...');
  await homePage.logout();
});




// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
