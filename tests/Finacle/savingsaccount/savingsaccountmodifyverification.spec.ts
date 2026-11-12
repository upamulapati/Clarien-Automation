import { test, expect } from '@playwright/test';
import { getVerificationConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue } from '../../helpers/sharedState';
import { SAVINGS_MODIFY_VERIFY_DATA } from '../../config/excelTestData';
import COMMON_DATA from '../../../data/common-data.json';

const VERIFY_CONFIG = getVerificationConfig();

const sharedAccounts = (getSharedValue('savingsAccounts') ?? {}) as Record<string, string>;
const verifyDataByInstance = new Map<string, any>();
for (const acct of SAVINGS_MODIFY_VERIFY_DATA) {
  const acctData = acct.data ?? acct;
  const key = String(acctData.instance ?? '');
  if (key) verifyDataByInstance.set(key, acctData);
}

const instances = Object.keys(sharedAccounts).length > 0
  ? Object.keys(sharedAccounts)
  : Array.from(verifyDataByInstance.keys());

test.beforeEach(async () => {
  test.setTimeout(300000);
});

for (const instance of instances) {
  const acctData = verifyDataByInstance.get(instance) ?? { instance };
  const rawAccountId = sharedAccounts[instance] ?? acctData.accountId;
  const testLabel = typeof acctData.testLabel === 'string' ? acctData.testLabel.trim() : '';
  const accountIdForTitle = rawAccountId ? String(rawAccountId).trim() : 'from-shared-state';
  const testTitle = testLabel || `Savings Account Modification Verification - Instance ${instance} - ${accountIdForTitle}`;
  test(testTitle, async ({ page }) => {
    if (!accountIdForTitle || accountIdForTitle === 'from-shared-state') {
      throw new Error(`No accountId to verify for instance ${instance}`);
    }
    const verifyAccountId = accountIdForTitle;
    console.log(`[Verify] Using Account ID: ${verifyAccountId}`);

    const lastDialogMessages: string[] = [];
    setupDialogHandlers(page, lastDialogMessages);

    await login(page, VERIFY_CONFIG);

    const homePage = new HomePage(page);
    const accountPage = new AccountPage(page);

    console.log('Selecting Core Server...');
    await accountPage.selectCoreServer();
    await page.waitForTimeout(3000);

    console.log(`Searching for ${COMMON_DATA.savingsAccount.screens.modifyAndVerify}...`);
    await accountPage.searchMenu(COMMON_DATA.savingsAccount.screens.modifyAndVerify);
    await page.waitForTimeout(3000);

    console.log('Selecting Verify function...');
    await accountPage.selectFunction('Verify');

    console.log('Entering account ID...');
    await accountPage.enterHacmAccountId(verifyAccountId);

    console.log('Clicking Go button...');
    await accountPage.clickGo();
    await page.waitForTimeout(5000);

    console.log('Visiting all HACM verification tabs...');
    for (const tab of ['General', 'Interest & Tax', 'Related Party', 'MIS Codes', 'Scheme', 'Addl. Info.']) {
      await accountPage.visitTab(tab);
    }

    console.log('Visiting Document details tab...');
    await accountPage.visitTabById('documentdetails');

    console.log('Clicking Submit button...');
    await accountPage.submitForm();

    console.log('Capturing verification result...');
    const result = await accountPage.verifyAccountCreated();
    console.log('Verification status message:', result.message);
    console.log('Verified Account ID:', result.accountNumber);

    await accountPage.clickOkButton();

    const verifiedAccountId = result.accountNumber || verifyAccountId;
    expect(result.success, `Expected successful verification but got: ${result.message}`).toBe(true);
    expect(result.message).toMatch(/verified|successful|modified|completed/i);
    expect(verifiedAccountId).toBeTruthy();

    console.log('Logging out...');
    await homePage.logout();
  });
}

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
