import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { DemandDraftPage } from '../../pages/CoreBanking/DemandDraftPage';
import { CREDENTIALS } from '../../../data/credentials';
import { DD_DATA, todayDDMMYYYY } from '../../helpers/common';
import { getSharedValue, writeSharedState } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

test('HDDC - demand draft cancellation', async ({ page }) => {
  test.setTimeout(900000);

  const originalTransactionId = getSharedValue((state) => state.demandDraftId) ?? '';
  expect(originalTransactionId, 'Original DD transaction ID must be available for cancellation').toMatch(/[A-Z0-9]{2,}/i);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page);
  const ddPage = new DemandDraftPage(page);

  const issueDate = getSharedValue((state) => (state as any).demandDraftIssueDate) ?? todayDDMMYYYY();

  await accountPage.selectCoreServer();
  await accountPage.searchTransactionManagement('HDDC');
  await page.waitForTimeout(3000);

  await ddPage.selectFunction('Cancel');
  await ddPage.enterTransactionId(originalTransactionId);
  await ddPage.enterIssueDate(issueDate);
  await ddPage.selectTransactionType(DD_DATA.transactionType);

  await ddPage.clickGo();
  await page.waitForTimeout(3000);

  await ddPage.clickSubmit();

  const cancellationId = await ddPage.getTransactionId();
  console.log(`=== DD CANCELLATION TRANSACTION ID: ${cancellationId} ===`);
  expect(cancellationId, 'DD cancellation transaction ID must be generated').toMatch(/[A-Z0-9]{2,}/i);

  if (cancellationId) {
    const { updateSharedState } = require('../../helpers/sharedState');
    updateSharedState((state: any) => { state.demandDraftCancellationId = cancellationId; });
  }

  await homePage.logout();
});
