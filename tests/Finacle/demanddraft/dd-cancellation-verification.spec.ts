import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { DemandDraftPage } from '../../pages/CoreBanking/DemandDraftPage';
import { CREDENTIALS } from '../../../data/credentials';
import { getSharedValue } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

test('HDDC - demand draft cancellation verification', async ({ page }) => {
  test.setTimeout(900000);

  const cancellationId = getSharedValue('demandDraftCancellationId') ?? '';
  console.log(`[SharedState] DD Cancellation Transaction ID: ${cancellationId}`);
  expect(cancellationId, 'DD cancellation transaction ID must be available for verification').toMatch(/[A-Z0-9]{2,}/i);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
  const accountPage = new AccountPage(page);
  const ddPage = new DemandDraftPage(page, lastDialogMessages);

  await accountPage.selectCoreServer();
  await accountPage.searchTransactionManagement('HDDC');
  await page.waitForTimeout(3000);

  await ddPage.selectFunction('Post');
  await ddPage.enterTransactionId(cancellationId);
  await ddPage.clickGo();
  await page.waitForTimeout(3000);

  await ddPage.clickOk();
  await ddPage.clickSubmit();

  const status = await ddPage.getPageText();
  expect(status.toLowerCase()).toContain('verified');
  expect(status.toLowerCase()).not.toMatch(/fatal|core dump|internal server error|invalid field value|failed/);
  console.log('Status after cancellation verification submit:', status.substring(0, 200));

  await ddPage.clickAccept();
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
