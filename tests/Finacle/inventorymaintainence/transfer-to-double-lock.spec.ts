import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { InventoryMaintenancePage } from '../../pages/CoreBanking/InventoryMaintenancePage';
import { CREDENTIALS } from '../../../data/credentials';
import { getApplicationDate } from '../../helpers/common';
import { writeSharedState } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

const FROM_LOCATION_CLASS = 'ZZ';
const FROM_LOCATION_CODE = 'EXT';
const TO_LOCATION_CLASS = 'DL';
const TO_LOCATION_CODE = '002';
const INVENTORY_ITEM = 'local BMD cheque';
const START_NUMBER = '1000';
const END_NUMBER = '1024';

test('HIMC - transfer inventory to double lock', async ({ page }) => {
  test.setTimeout(900000);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page);
  const invPage = new InventoryMaintenancePage(page);

  const today = await getApplicationDate(page);

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

  // 8. Inventory details page - select CHQ/CHQB, start no. and end no.
  await page.waitForTimeout(3000);
  await invPage.selectInventoryDetails(INVENTORY_ITEM);
  await invPage.enterStartNumber(START_NUMBER);
  await invPage.enterEndNumber(END_NUMBER);
  await invPage.enterTransferParticulars('Inventory transfer to double lock');

  // 9. Validate then submit - Transaction id is created.
  await invPage.clickValidate();
  await invPage.clickSubmit();

  let transactionId = await invPage.getTransactionId();
  const status = await invPage.getStatusMessage();
  const pageText = await invPage.getPageText();
  const combined = `${pageText} ${status ?? ''}`.toLowerCase();
  if (!transactionId && (combined.includes('e3992') || combined.includes('unverified record exists'))) {
    console.log('Add blocked by E3992/unverified record; logging out maker and logging in verifier to verify the existing transaction');
    await homePage.logout().catch(() => {});
    await page.waitForTimeout(3000);
    const { homePage: verifyHomePage } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
    const verifyAccountPage = new AccountPage(page);
    const verifyInvPage = new InventoryMaintenancePage(page);
    await verifyAccountPage.selectCoreServer();
    await verifyAccountPage.searchTransactionManagement('HIMC');
    await page.waitForTimeout(3000);
    transactionId = await verifyInvPage.verifyExistingTransaction(today, FROM_LOCATION_CLASS, FROM_LOCATION_CODE, TO_LOCATION_CLASS, TO_LOCATION_CODE);
    await verifyHomePage.logout().catch(() => {});
  }

  console.log(`=== INVENTORY DOUBLE-LOCK TRANSACTION ID: ${transactionId} ===`);
  expect(transactionId, 'Inventory transfer transaction ID must be generated').toMatch(/[A-Z0-9]{2,}/i);

  if (transactionId) {
    writeSharedState({ inventoryDoubleLockId: transactionId, inventoryDoubleLockDate: today });
  }

  await homePage.logout().catch((e: any) => {
    console.log('Final logout failed or session already invalid:', e?.message || e);
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
