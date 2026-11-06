import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { DemandDraftPage } from '../../pages/CoreBanking/DemandDraftPage';
import { CREDENTIALS } from '../../../data/credentials';
import { getApplicationDate } from '../../helpers/common';
import { DEMAND_DRAFT_TEST_DATA } from '../../config/excelTestData';
import { updateSharedState } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

const SCENARIOS = (DEMAND_DRAFT_TEST_DATA.demandDraftTestData || []).filter(
  (r: any) => String(r.enabled).toUpperCase() !== 'N' && String(r.function).toLowerCase() === 'add'
);
const scenario = SCENARIOS[0] ?? { data: {} };

test('HDDMI - demand draft issuance', async ({ page }) => {
  test.setTimeout(900000);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page);
  const ddPage = new DemandDraftPage(page);

  const today = await getApplicationDate(page);

  await accountPage.selectCoreServer();
  await accountPage.searchTransactionManagement(scenario.menuOption);
  await page.waitForTimeout(3000);

  await ddPage.selectFunction(scenario.function);
  await ddPage.enterIssueDate(today);
  await ddPage.enterValueDate(today);
  await ddPage.selectDemandDraftAccountByCurrency(scenario.data.demandDraftCurrency, scenario.data.demandDraftAccount);
  await ddPage.selectTransactionType(scenario.data.transactionType);
  await ddPage.enterPurchaserAccountId(scenario.data.purchaserAccount, scenario.data.purchaserAccountType);
  await ddPage.clickPurchaserGo();
  await page.waitForTimeout(3000);
  await ddPage.clickSubmit();
  await page.waitForTimeout(3000);

  await ddPage.enterDemandDraftAmount(scenario.data.amount);
  await ddPage.enterPayee(scenario.data.payee);
  await ddPage.clickSubmit();
  await page.waitForTimeout(3000);

  const transactionId = await ddPage.getTransactionId();
  const statusMessage = await ddPage.getStatusMessage();
  console.log(`=== DEMAND DRAFT TRANSACTION ID: ${transactionId} ===`);
  console.log(`=== DEMAND DRAFT STATUS: ${statusMessage} ===`);
  expect(transactionId, 'DD Transaction ID must be generated').toMatch(/[A-Z0-9]{2,}/i);
  expect(statusMessage, 'DD issuance must show a success message').toMatch(/(added|successfully|completed)/i);
  expect(statusMessage.toLowerCase()).not.toMatch(/fatal|core dump|internal server error|invalid field value|failed/);

  if (transactionId && scenario.sharedKey) {
    updateSharedState((state: any) => { state[scenario.sharedKey] = transactionId; state.demandDraftIssueDate = today; });
  }

  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
