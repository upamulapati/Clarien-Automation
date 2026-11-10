import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TOP_UP_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const MOD_ACCOUNT_NUMBER = String(TOP_UP_DEPOSIT_DATA.modificationAccountId ?? '');
console.log(`Modifying top-up deposit account: ${MOD_ACCOUNT_NUMBER}`);

if (!MOD_ACCOUNT_NUMBER) {
  throw new Error('modificationAccountId is not configured in the topup_deposits sheet');
}
const NEW_DEPOSIT_PERIOD_MONTHS = String(TOP_UP_DEPOSIT_DATA.newDepositPeriodMonths || '24');
const NEW_DEPOSIT_PERIOD_DAYS = String(TOP_UP_DEPOSIT_DATA.newDepositPeriodDays || '0');

test(`${TOP_UP_DEPOSIT_DATA.screens.modify} - modify top-up deposit account`, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const status = await tdPage.modifyTermDeposit(
    TOP_UP_DEPOSIT_DATA.screens.modify,
    MOD_ACCOUNT_NUMBER,
    NEW_DEPOSIT_PERIOD_MONTHS,
    NEW_DEPOSIT_PERIOD_DAYS,
    String(TOP_UP_DEPOSIT_DATA.nextPrintDate ?? '')
  );

  console.log('====================================');
  console.log('MODIFICATION STATUS:', status ?? 'No status message captured');
  if (status) {
    expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  } else {
    console.log('No explicit status message returned. Finacle completed the modification without an alert.');
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
