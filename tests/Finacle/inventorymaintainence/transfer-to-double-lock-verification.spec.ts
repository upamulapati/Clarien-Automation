import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { InventoryMaintenancePage } from '../../pages/CoreBanking/InventoryMaintenancePage';
import { CREDENTIALS } from '../../../data/credentials';
import { getApplicationDate } from '../../helpers/common';
import { getSharedValue } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

test('HIMC - verify transfer to double lock', async ({ page }) => {
  test.setTimeout(900000);

  const transactionId = getSharedValue((state) => state.inventoryDoubleLockId) ?? '';
  console.log(`[SharedState] Inventory Double-Lock Transaction ID: ${transactionId}`);
  expect(transactionId, 'Inventory Double-Lock Transaction ID must be available for verification').toMatch(/[A-Z0-9]{2,}/i);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
  const accountPage = new AccountPage(page);
  const invPage = new InventoryMaintenancePage(page);

  const today = await getApplicationDate(page);

  // 1. Select "core server" from solution drop down.
  await accountPage.selectCoreServer();

  // 2. Type menu option "HIMC" in finacle.
  await accountPage.searchTransactionManagement('HIMC');
  await page.waitForTimeout(3000);

  // 3. Function - Verify, Transaction date - today's date, Transaction id - enter the id, click GO.
  await invPage.selectFunction('Verify');
  await invPage.enterTransactionDate(today);
  await invPage.enterTransactionId(transactionId);
  await invPage.clickGo();
  await page.waitForTimeout(3000);

  // 4. Verify the details and click submit.
  await invPage.clickSubmit();

  const status = await invPage.getStatusMessage();
  const pageText = await invPage.getPageText();
  const resultText = status || pageText;
  console.log(`Status after double-lock verification: ${resultText?.substring(0, 200)}`);
  expect(resultText.toLowerCase()).not.toMatch(/fatal|core dump|internal server error|invalid field value|failed/);

  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
