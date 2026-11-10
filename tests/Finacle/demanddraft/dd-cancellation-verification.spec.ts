import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { DemandDraftPage } from '../../pages/CoreBanking/DemandDraftPage';
import { CREDENTIALS } from '../../../data/credentials';
import { getSharedValue } from '../../helpers/sharedState';
import { DEMAND_DRAFT_TEST_DATA } from '../../config/excelTestData';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

const SCENARIOS = (DEMAND_DRAFT_TEST_DATA.demandDraftTestData || []).filter(
  (r: any) =>
    String(r.enabled).toUpperCase() !== 'N' &&
    String(r.function).toLowerCase() === 'post' &&
    String(r.menuOption).toLowerCase() === 'hddc'
);
const scenario = SCENARIOS[0] ?? { data: {} };

test('HDDC - demand draft cancellation verification', async ({ page }) => {
  test.setTimeout(900000);

  const cancellationId = getSharedValue((state: any) => (state as any)[scenario.sharedKey] as string | undefined) ?? '';
  const srlNo = getSharedValue((state: any) => (state as any).demandDraftCancellationSrlNo as string | undefined) ?? '';
  console.log(`[SharedState] DD Cancellation Transaction ID: ${cancellationId}`);
  console.log(`[SharedState] DD Cancellation Srl No: ${srlNo}`);
  expect(cancellationId, 'DD cancellation transaction ID must be available for verification').toMatch(/[A-Z0-9]{2,}/i);
  expect(srlNo, 'DD cancellation serial number must be available for verification').toMatch(/\d+/);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
  const accountPage = new AccountPage(page);
  const ddPage = new DemandDraftPage(page);

  await accountPage.selectCoreServer();
  await accountPage.searchTransactionManagement(scenario.menuOption);
  await page.waitForTimeout(3000);

  await ddPage.selectFunction(scenario.function);
  await ddPage.enterTransactionId(cancellationId);
  await ddPage.enterDemandDraftSrlNo(srlNo);
  await ddPage.clickGo();
  await page.waitForTimeout(3000);

  await ddPage.clickOk();
  await ddPage.clickSubmit();

  const statusMessage = await ddPage.getStatusMessage();
  const pageText = await ddPage.getPageText();
  expect(statusMessage.toLowerCase()).toMatch(/(verified|successfully|posted)/);
  expect(pageText.toLowerCase()).not.toMatch(/fatal|core dump|internal server error|invalid field value|failed/);
  console.log('Status after cancellation verification submit:', statusMessage.substring(0, 200));

  await ddPage.clickAccept();
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
