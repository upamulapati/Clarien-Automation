import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { DemandDraftPage } from '../../pages/CoreBanking/DemandDraftPage';
import { CREDENTIALS } from '../../../data/credentials';
import { getSharedValue } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

test('HDDMI - demand draft verification', async ({ page }) => {
  test.setTimeout(900000);

  const transactionId = getSharedValue('demandDraftId') ?? '';
  console.log(`[SharedState] Demand Draft Transaction ID: ${transactionId}`);
  expect(transactionId, 'Demand Draft Transaction ID must be available for verification').toMatch(/[A-Z0-9]{2,}/i);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
  const accountPage = new AccountPage(page);
  const ddPage = new DemandDraftPage(page, lastDialogMessages);

  await accountPage.selectCoreServer();
  await accountPage.searchTransactionManagement('HDDMI');
  await page.waitForTimeout(3000);

  await ddPage.selectFunction('Post');
  await ddPage.enterTransactionId(transactionId);
  await ddPage.clickGo();
  await page.waitForTimeout(3000);

  await ddPage.clickFeeDetails();
  await ddPage.clickOk();

  await ddPage.clickSubmit();

  const status = await ddPage.getPageText();
  expect(status.toLowerCase()).toContain('verified');
  expect(status.toLowerCase()).not.toMatch(/fatal|core dump|internal server error|invalid field value|failed/);
  console.log('Status after verification submit:', status.substring(0, 200));

  await ddPage.clickAccept();
  await homePage.logout();
});
