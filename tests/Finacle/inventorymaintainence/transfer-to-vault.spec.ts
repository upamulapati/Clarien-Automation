import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { InventoryMaintenancePage } from '../../pages/CoreBanking/InventoryMaintenancePage';
import { CREDENTIALS } from '../../../data/credentials';
import { todayDDMMYYYY } from '../../helpers/common';
import { writeSharedState } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

const FROM_LOCATION_CLASS = 'DL';
const FROM_LOCATION_CODE = '002';
const TO_LOCATION_CLASS = 'VT';
const TO_LOCATION_CODE = '003';
const INVENTORY_ITEM = 'local BMD cheque';
const START_NUMBER = '126';
const END_NUMBER = '150';

test('HIMC - transfer inventory to vault', async ({ page }) => {
  test.setTimeout(900000);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page);
  const invPage = new InventoryMaintenancePage(page);

  const today = todayDDMMYYYY();

  // 1. Select "core server" from solution drop down.
  await accountPage.selectCoreServer();

  // 2. Type menu option "HIMC" in finacle.
  await accountPage.searchTransactionManagement('HIMC');
  await page.waitForTimeout(3000);

  // 3. Function - Add, Transaction date - today's date, click GO.
  await invPage.selectFunction('Add');
  await invPage.enterTransactionDate(today);
  await invPage.clickGo();
  await page.waitForTimeout(3000);

  // 4-5. From Location class and code.
  await invPage.selectFromLocationClass(FROM_LOCATION_CLASS);
  await invPage.selectFromLocationCode(FROM_LOCATION_CLASS, FROM_LOCATION_CODE);

  // 6-7. To Location class and code.
  await invPage.selectToLocationClass(TO_LOCATION_CLASS);
  await invPage.selectToLocationCode(TO_LOCATION_CLASS, TO_LOCATION_CODE);

  // 7.5 Accept the location details to proceed to the inventory screen.
  await invPage.clickAccept();

  // 8. Inventory details page - select CHQ/CHQB, start no. and end no. are displayed.
  await page.waitForTimeout(3000);
  await invPage.selectInventoryDetails(INVENTORY_ITEM);
  await invPage.enterStartNumber(START_NUMBER);
  await invPage.enterEndNumber(END_NUMBER);

  // 9. Click submit - Transaction id is created.
  await invPage.clickSubmit();

  const transactionId = await invPage.getTransactionId();
  console.log(`=== INVENTORY VAULT TRANSACTION ID: ${transactionId} ===`);
  expect(transactionId, 'Inventory vault transfer transaction ID must be generated').toMatch(/[A-Z0-9]{2,}/i);

  if (transactionId) {
    writeSharedState({ inventoryVaultId: transactionId, inventoryVaultDate: today });
  }

  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
