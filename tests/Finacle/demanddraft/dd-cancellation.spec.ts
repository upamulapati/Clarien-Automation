import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { DemandDraftPage } from '../../pages/CoreBanking/DemandDraftPage';
import { CREDENTIALS } from '../../../data/credentials';
import { getApplicationDate } from '../../helpers/common';
import { DEMAND_DRAFT_TEST_DATA } from '../../config/excelTestData';
import { getSharedValue, updateSharedState } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

const SCENARIOS = (DEMAND_DRAFT_TEST_DATA.demandDraftTestData || []).filter(
  (r: any) => String(r.enabled).toUpperCase() !== 'N' && String(r.function).toLowerCase() === 'cancel'
);
const scenario = SCENARIOS[0] ?? { data: {} };

test('HDDC - demand draft cancellation', async ({ page }) => {
  test.setTimeout(900000);

  const originalTransactionId = getSharedValue((state) => state.demandDraftId) ?? '';
  expect(originalTransactionId, 'Original DD transaction ID must be available for cancellation').toMatch(/[A-Z0-9]{2,}/i);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page);
  const ddPage = new DemandDraftPage(page);

  const issueDate = getSharedValue((state) => (state as any).demandDraftIssueDate) ?? await getApplicationDate(page);
  const ddSrlNoInput = getSharedValue((state: any) => (state as any).demandDraftSrlNo as string | undefined) ?? '';
  console.log(`[SharedState] Original DD Srl No: ${ddSrlNoInput}`);
  expect(ddSrlNoInput, 'Original DD Srl No. must be available for cancellation').toMatch(/\d+/);

  await accountPage.selectCoreServer();
  await accountPage.searchTransactionManagement(scenario.menuOption);
  await page.waitForTimeout(3000);

  await ddPage.selectFunction(scenario.function);
  await ddPage.enterTransactionId(originalTransactionId);
  await ddPage.enterDemandDraftSrlNo(ddSrlNoInput);
  await page.waitForTimeout(500);

  const ddSrlNo = await ddPage.getDemandDraftSrlNo();
  console.log(`=== DD CANCELLATION SRL NO: ${ddSrlNo} ===`);
  expect(ddSrlNo, 'Demand Draft Serial No. must be captured before Go').toMatch(/\d+/);

  await ddPage.enterIssueDate(issueDate);
  await ddPage.selectTransactionType(scenario.data.transactionType);

  await ddPage.clickGo();
  await page.waitForTimeout(3000);

  await ddPage.clickSubmit();

  const statusMessage = await ddPage.getStatusMessage();
  const pageText = await ddPage.getPageText();
  const txns = Array.from(pageText.matchAll(/\b(CB\d{2,})\b/gi)).map(m => m[1]);
  const statusMatch = statusMessage.match(/(?:transaction|txn)\s*(?:id|#|ref)?\s*[:=]?\s*([A-Z]{1,3}\d{2,})/i)
    ?? statusMessage.match(/\b(CB\d{2,})\b/i)
    ?? statusMessage.match(/\b(S\d{10,})\b/);
  const newTxn = txns.find(t => t !== originalTransactionId);
  const cancellationId = newTxn ?? (statusMatch ? statusMatch[1] : (await ddPage.getTransactionId() ?? ''));
  console.log(`=== DD CANCELLATION TRANSACTION ID: ${cancellationId} ===`);
  console.log(`=== DD CANCELLATION STATUS: ${statusMessage} ===`);
  console.log('Page text after cancellation:', pageText.substring(0, 400));
  expect(cancellationId, 'DD cancellation transaction ID must be generated').toMatch(/[A-Z0-9]{2,}/i);
  expect(cancellationId, 'DD cancellation transaction ID must not be the original issuance ID').not.toBe(originalTransactionId);
  expect(statusMessage, 'DD cancellation must show a success message').toMatch(/(cancelled|successfully|completed)/i);
  expect(pageText.toLowerCase()).not.toMatch(/fatal|core dump|internal server error|invalid field value|failed/);

  if (cancellationId && ddSrlNo && scenario.sharedKey) {
    updateSharedState((state: any) => { state[scenario.sharedKey] = cancellationId; state.demandDraftCancellationSrlNo = ddSrlNo; });
  }

  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
