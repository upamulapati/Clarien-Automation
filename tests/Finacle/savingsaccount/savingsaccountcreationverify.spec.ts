import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue } from '../../helpers/sharedState';
import COMMON_DATA from '../../../data/common-data.json';

// Data-driven inputs for savings account creation verification.
const SHARED_ACCOUNT_ID = getSharedValue('accountId') as string | undefined;
const envAccount = process.env.FLOW7_CREATION_VERIFY_ACCOUNT;
const envScreen = process.env.FLOW7_CREATION_VERIFY_SCREEN;
const VERIFY_DATA = {
  accountId:
    (envAccount === '__ACCOUNT__' ? SHARED_ACCOUNT_ID : envAccount) ??
    SHARED_ACCOUNT_ID ??
    COMMON_DATA.accountVerification.find(a => a.type === 'savings')?.accountId ??
    '7500001512',
  screenCode: envScreen ?? COMMON_DATA.savingsAccount.screens.verify ?? 'HOAACVSB',
};
console.log(`[Verification] Using Account ID: ${VERIFY_DATA.accountId}, Screen: ${VERIFY_DATA.screenCode}`);

const USERNAME = COMMON_DATA.verifierCredentials.username;
const PASSWORD = COMMON_DATA.verifierCredentials.password;

test.describe('Savings Account Verification', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let homePage: HomePage;
  let savingsAccountPage: AccountPage;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(900000);
    ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
    savingsAccountPage = new AccountPage(page);
  });

  // HOAACVSB - Verify/authorise a savings account opening.
  test(`HOAACVSB - verify savings account creation - ${VERIFY_DATA.accountId}`, async () => {
    const result = await savingsAccountPage.verifySavingsAccountCreation(VERIFY_DATA);
    console.log('Exact verification result:', result);
    expect(result.success, `Expected verification success but got: ${result.message}`).toBe(true);
    expect(result.message).toBeTruthy();
    expect(result.message).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated|New A\/c\.?\s*ID|Account Number|Account No)/i);
    console.log('Verification status message:', result.message);

    // Logout
    console.log('Logging out...');
    await homePage.logout();
  });
});
