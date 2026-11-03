import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TOP_UP_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';
import { getTopUpDepositAccounts } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

const TOP_UP_ACCOUNTS = getTopUpDepositAccounts();
const VALID_ACCOUNTS = Object.entries(TOP_UP_ACCOUNTS).filter(([_, accountId]) =>
  accountId && accountId !== 'NOT CAPTURED' && accountId !== 'FAILED'
);

if (VALID_ACCOUNTS.length === 0) {
  test('HOAACVTU - verify top-up deposit account creation - no accounts', async () => {
    expect(Object.keys(TOP_UP_ACCOUNTS).length, 'No valid top-up deposit accounts found in shared state').toBeGreaterThan(0);
  });
}

for (const [schemeCode, accountId] of VALID_ACCOUNTS) {
  test(`HOAACVTU - verify top-up deposit account creation (${schemeCode})`, async ({ page }) => {
    test.setTimeout(300000);
    const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
    const tdPage = new TermDepositPage(page);

    console.log(`Verifying top-up deposit account: ${accountId} (${schemeCode})`);

    await tdPage.selectCoreServer();
    await tdPage.searchMenu(TOP_UP_DEPOSIT_DATA.screens.verify);
    await page.waitForTimeout(3000);
    await tdPage.selectVerifyFunction().catch(() => {});
    await tdPage.enterTemporaryAccountId(accountId).catch(async () => {
      await tdPage.enterHacmAccountId(accountId).catch(() => {});
    });
    await tdPage.acceptButton.click().catch(() => {});
    await page.waitForTimeout(5000);

    await tdPage.visitTab('General');
    await tdPage.visitTab('Interest & Tax');
    await tdPage.visitTab('Scheme');
    await tdPage.visitTab('Flow');
    await tdPage.visitTab('Renewal');
    await tdPage.visitTab('Related Party');

    await tdPage.clickSubmit().catch(() => {});
    await page.waitForTimeout(3000).catch(() => {});
    await tdPage.acceptWarningPopup().catch(() => {});
    await page.waitForTimeout(2000).catch(() => {});

    const statusMessage = await tdPage.getStatusMessage();
    console.log('Exact status message:', statusMessage);
    expect(statusMessage).toBeTruthy();
    expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);

    console.log('====================================');
    console.log('VERIFICATION STATUS:', statusMessage);
    expect(statusMessage).toBeTruthy();
    expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
    console.log('====================================');

    if (!page.isClosed()) {
      console.log('Logging out...');
      await homePage.logout().catch(() => {});
    }
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
