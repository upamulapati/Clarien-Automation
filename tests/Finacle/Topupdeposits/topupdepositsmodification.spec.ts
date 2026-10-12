import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TOP_UP_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

test(TOP_UP_DEPOSIT_DATA.modificationTestLabel as string, async ({ page }) => {
  test.setTimeout(180000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const statusMessage = await tdPage.modifyTermDeposit(
    TOP_UP_DEPOSIT_DATA.screens.modify,
    TOP_UP_DEPOSIT_DATA.modificationAccountId,
    TOP_UP_DEPOSIT_DATA.newDepositPeriodMonths,
    TOP_UP_DEPOSIT_DATA.newDepositPeriodDays
  );

  console.log('====================================');
  console.log('MODIFICATION STATUS:', statusMessage);
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
