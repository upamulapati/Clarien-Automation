import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { InventoryMaintenancePage } from '../../pages/CoreBanking/InventoryMaintenancePage';
import { CREDENTIALS } from '../../../data/credentials';
import { getApplicationDate } from '../../helpers/common';
import { writeSharedState } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';
import { INVENTORY_MAINTENANCE_TEST_DATA } from '../../config/excelTestData';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

const SCENARIOS = INVENTORY_MAINTENANCE_TEST_DATA.inventoryMaintenanceTestData;

test('HIMC - transfer inventory to double lock', async ({ page }) => {
  test.setTimeout(900000);

  const scenario = SCENARIOS.find((s: any) => s.name === 'HIMC - add transfer to double lock');
  if (!scenario) throw new Error('HIMC add transfer to double lock scenario not found in Excel');

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page);
  const invPage = new InventoryMaintenancePage(page);

  const today = await getApplicationDate(page);

  // 1. Select "core server" from solution drop down.
  await accountPage.selectCoreServer();

  // 2. Type menu option "HIMC" in finacle.
  await accountPage.searchTransactionManagement(scenario.menuOption);
  await page.waitForTimeout(3000);

  // 3. Function - Add, Transaction date - today's date, click GO.
  await invPage.selectFunction(scenario.function || 'Add');
  await invPage.enterTransactionDate(today);
  await invPage.clickGo();
  await page.waitForTimeout(3000);

  // 4-5. From Location class and code.
  await invPage.selectFromLocationClass(scenario.data.fromLocationClass);
  await invPage.selectFromLocationCode(scenario.data.fromLocationClass, scenario.data.fromLocationCode);

  // 6-7. To Location class and code.
  await invPage.selectToLocationClass(scenario.data.toLocationClass);
  await invPage.selectToLocationCode(scenario.data.toLocationClass, scenario.data.toLocationCode);

  // 7.5 Accept the location details to proceed to the inventory screen.
  await invPage.clickAccept();

  // 8. Inventory details page - select CHQ/CHQB, inventory alpha, start no. and end no.
  await page.waitForTimeout(3000);
  await invPage.selectInventoryDetails(scenario.data.inventoryItem);
  if (scenario.data.inventoryAlpha) {
    await invPage.enterInventoryAlpha(scenario.data.inventoryAlpha);
  }
  await invPage.enterStartNumber(scenario.data.startNumber);
  await invPage.enterEndNumber(scenario.data.endNumber);
  if (scenario.data.transferParticulars) {
    await invPage.enterTransferParticulars(scenario.data.transferParticulars);
  }

  // 9. Validate then submit - Transaction id is created.
  await invPage.clickValidate();
  await invPage.clickSubmit();

  let transactionId = await invPage.getTransactionId();
  let statusMessage = await invPage.getStatusMessage();
  let pageText = '';
  if (!transactionId) {
    pageText = await invPage.getPageText();
  }
  const combined = `${pageText} ${statusMessage ?? ''}`.toLowerCase();
  if (
    !transactionId &&
    (combined.includes('e3992') || combined.includes('unverified record exists'))
  ) {
    console.log('Add blocked by E3992/unverified record; logging out maker and logging in verifier to verify the existing transaction');
    await homePage.logout().catch(() => {});
    await page.waitForTimeout(3000);
    const { homePage: verifyHomePage } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
    const verifyAccountPage = new AccountPage(page);
    const verifyInvPage = new InventoryMaintenancePage(page);
    await verifyAccountPage.selectCoreServer();
    await verifyAccountPage.searchTransactionManagement(scenario.menuOption);
    await page.waitForTimeout(3000);
    transactionId = await verifyInvPage.verifyExistingTransaction(today, scenario.data.fromLocationClass, scenario.data.fromLocationCode, scenario.data.toLocationClass, scenario.data.toLocationCode);
    statusMessage = await verifyInvPage.getStatusMessage() ?? statusMessage;
    await verifyHomePage.logout().catch(() => {});
  }

  console.log(`=== INVENTORY DOUBLE-LOCK TRANSACTION ID: ${transactionId} ===`);
  expect(statusMessage, 'HIMC submit must show a success or unverified-record message').toBeTruthy();
  expect(statusMessage, 'HIMC submit must show a success or unverified-record message').toMatch(/added\s+successfully|verified\s+successfully|unverified\s+record|e3992/i);
  expect(transactionId, 'Inventory transfer transaction ID must be generated').toBeTruthy();
  expect(transactionId, 'Inventory transfer transaction ID must be generated').toMatch(/[A-Z0-9]{2,}/i);

  if (transactionId) {
    writeSharedState({ [scenario.sharedKey]: transactionId, inventoryDoubleLockDate: today });
  }

  await invPage.clickOk();

  await homePage.logout().catch((e: any) => {
    console.log('Final logout failed or session already invalid:', e?.message || e);
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
