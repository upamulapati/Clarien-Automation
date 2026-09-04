import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { DemandDraftPage } from '../../pages/CoreBanking/DemandDraftPage';
import { CREDENTIALS } from '../../../data/credentials';
import { DD_DATA, todayDDMMYYYY } from '../../helpers/common';
import { writeSharedState } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

test('HDDMI - demand draft issuance', async ({ page }) => {
  test.setTimeout(900000);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page);
  const ddPage = new DemandDraftPage(page, lastDialogMessages);

  const today = todayDDMMYYYY();

  await accountPage.selectCoreServer();
  await accountPage.searchTransactionManagement('HDDMI');
  await page.waitForTimeout(3000);

  await ddPage.selectFunction('Add');
  await ddPage.enterIssueDate(today);
  await ddPage.enterValueDate(today);
  await ddPage.selectDemandDraftAccountByCurrency(DD_DATA.demandDraftCurrency, DD_DATA.demandDraftAccount);
  await ddPage.selectTransactionType(DD_DATA.transactionType);
  await ddPage.enterPurchaserAccountId(DD_DATA.purchaserAccount, DD_DATA.purchaserAccountType);
  await ddPage.clickPurchaserGo();
  await page.waitForTimeout(3000);
  await ddPage.clickSubmit();
  await page.waitForTimeout(3000);

  await ddPage.enterDemandDraftAmount(DD_DATA.amount);
  await ddPage.enterPayee(DD_DATA.payee);
  await ddPage.clickSubmit();
  await page.waitForTimeout(3000);

  const transactionId = await ddPage.getTransactionId();
  console.log(`=== DEMAND DRAFT TRANSACTION ID: ${transactionId} ===`);
  expect(transactionId, 'DD Transaction ID must be generated').toMatch(/[A-Z0-9]{2,}/i);

  if (transactionId) {
    writeSharedState({ demandDraftId: transactionId, demandDraftIssueDate: today });
  }

  await homePage.logout();
});
