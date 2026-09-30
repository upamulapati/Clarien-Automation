import { test, expect } from '@playwright/test';
import { getPrimaryConfig } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { getSharedValue } from '../../helpers/sharedState';
import FLOW7_DATA from '../../../data/flow7.json';

const CONFIG = getPrimaryConfig();

// Existing savings account number to which the related party will be added.
const SHARED_ACCOUNT_ID = getSharedValue((state) => state.accountId);
const ACCOUNT_ID = SHARED_ACCOUNT_ID ?? '7500001476';
if (SHARED_ACCOUNT_ID) console.log(`[SharedState] Using Account ID from previous run: ${SHARED_ACCOUNT_ID}`);

// CIF of the customer(s) to add as related parties (joint holders).
const JOINT_HOLDERS = (FLOW7_DATA.jointHolders ?? ['0002012248']) as string[];

test.describe('Add Related Party to Savings Account (HACM)', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let lastDialogMessages: string[] = [];

  for (const RELATED_PARTY_CIF of JOINT_HOLDERS) {
    test(`HACM - add related party to savings account (${RELATED_PARTY_CIF})`, async ({ page }) => {
      test.setTimeout(900000);
      setupDialogHandlers(page, lastDialogMessages);
      await login(page, CONFIG);

      const homePage = new HomePage(page);
      const savingsAccountPage = new AccountPage(page);

      console.log(`Using existing Account ID: ${ACCOUNT_ID}`);

      // Step 1: Select "Core Server" and open HACM
      console.log('Selecting Core Server...');
      await savingsAccountPage.selectCoreServer();

      console.log('Searching for HACM...');
      await savingsAccountPage.searchMenu('HACM');
      await page.waitForTimeout(3000);

      // Step 2: Function - Modify
      console.log('Selecting Modify function...');
      await savingsAccountPage.selectFunction('Modify');

      // Step 3: Enter the existing account number and Go
      console.log('Entering account ID to modify...');
      await savingsAccountPage.enterHacmAccountId(ACCOUNT_ID);

      console.log('Clicking Go button...');
      await savingsAccountPage.clickGo();

      // Step 4: Set Next Print Date on the General Details tab
      console.log('Visiting General Details tab...');
      await savingsAccountPage.visitTabById('acmogd');

      console.log('Setting next print date...');
      await savingsAccountPage.setNextPrintDate();

      // Step 5: Visit Related Party Details and add a new row
      console.log('Visiting Related Party Details tab...');
      await savingsAccountPage.visitTabById('relatedpartydetails');

      console.log('Clicking Add for related party...');
      await savingsAccountPage.clickRelatedPartyAdd();

      // Step 6: Fill the related party details
      console.log('Selecting relation type: Joint Holder...');
      await savingsAccountPage.selectRelationType('Joint Holder');

      console.log('Selecting relation code: 999...');
      await savingsAccountPage.selectRelationCode('999');

      console.log('Entering related party CIF...');
      await savingsAccountPage.enterRelatedPartyCif(RELATED_PARTY_CIF);

      // Step 7: Submit and verify
      console.log('Clicking Submit button...');
      await savingsAccountPage.submitForm();

      const modifyResult = await savingsAccountPage.verifyAccountCreated();
      expect(modifyResult.success, `Expected success but got: ${modifyResult.message}`).toBe(true);
      console.log('Modification Result:', modifyResult.message);
      console.log('Account Number:', modifyResult.accountNumber);

      await homePage.logout();
    });
  }
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
