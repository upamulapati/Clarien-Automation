import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { DemandDraftPage } from '../../pages/CoreBanking/DemandDraftPage';
import { CREDENTIALS } from '../../../data/credentials';
import { getSharedValue, updateSharedState } from '../../helpers/sharedState';
import { DEMAND_DRAFT_TEST_DATA } from '../../config/excelTestData';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

const SCENARIOS = (DEMAND_DRAFT_TEST_DATA.demandDraftTestData || []).filter(
  (r: any) =>
    String(r.enabled).toUpperCase() !== 'N' &&
    String(r.function).toLowerCase() === 'post' &&
    String(r.menuOption).toLowerCase() === 'hddmi'
);
const scenario = SCENARIOS[0] ?? { data: {} };

test('HDDMI - demand draft verification', async ({ page }) => {
  test.setTimeout(900000);

  const transactionId = getSharedValue((state: any) => (state as any)[scenario.sharedKey] as string | undefined) ?? '';
  console.log(`[SharedState] Demand Draft Transaction ID: ${transactionId}`);
  expect(transactionId, 'Demand Draft Transaction ID must be available for verification').toMatch(/[A-Z0-9]{2,}/i);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
  const accountPage = new AccountPage(page);
  const ddPage = new DemandDraftPage(page);

  await accountPage.selectCoreServer();
  await accountPage.searchTransactionManagement(scenario.menuOption);
  await page.waitForTimeout(3000);

  await ddPage.selectFunction(scenario.function);
  await ddPage.enterTransactionId(transactionId);
  await ddPage.clickGo();
  await page.waitForTimeout(3000);

  const ddSrlNo = await ddPage.getDemandDraftSrlNo();
  console.log(`=== DD VERIFICATION SRL NO: ${ddSrlNo} ===`);
  expect(ddSrlNo, 'Demand Draft Serial No. must be available during verification').toMatch(/\d+/);
  updateSharedState((state: any) => { state.demandDraftSrlNo = ddSrlNo; });

  await ddPage.clickFeeDetails();
  await ddPage.clickOk();

  await ddPage.clickSubmit();

  const statusMessage = await ddPage.getStatusMessage();
  const pageText = await ddPage.getPageText();
  expect(statusMessage.toLowerCase()).toMatch(/(verified|posted|successfully)/);
  expect(pageText.toLowerCase()).not.toMatch(/fatal|core dump|internal server error|invalid field value|failed/);
  console.log('Status after verification submit:', statusMessage.substring(0, 200));

  await ddPage.clickAccept();
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
