import { test, expect, Page, Dialog } from '@playwright/test';
import { getPrimaryConfig, getVerificationConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { CrmRetailEndToEndPage } from '../../pages/CRM/crmRetailEndToEndPage';
import { CrmVerificationPage } from '../../pages/CRM/crmVerificationPage';

// Shared variable to pass CIF ID from creation test to approval test
let sharedCifId = '';

const CONFIG = getPrimaryConfig();
const VERIFY_CONFIG = getVerificationConfig();

test.describe('Simple CIF Creation', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let lastDialogMessages: string[] = [];

  test.beforeEach(async ({ page }) => {
    test.setTimeout(900000);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, CONFIG);
  });

  test('Complete CIF Creation Flow', async ({ page }) => {
    const retailPage = new CrmRetailEndToEndPage(page, CONFIG, lastDialogMessages);

    // Step 1: Select CRM solution
    await retailPage.selectCrm();

    // Step 2: Wait for CRM to load
    await retailPage.waitForCrmLoad();

    // Step 3: Navigate to CIF Retail > New Entity > Customer
    await retailPage.navigateToNewEntity();

    // Step 4: Wait for Customer form to load
    await retailPage.waitForCustomerForm();

    // Step 5: Fill Basic Info (General Tab)
    await retailPage.fillBasicInfo();

    // Step 6: Fill Currency Sub-Tab (within General)
    await retailPage.fillCurrencySubTab();

    // Step 7: Fill Contact Tab (Address, Phone, Email)
    await retailPage.fillContactTab();

    // Step 8: Fill ID Document Tab
    await retailPage.fillIdDocumentTab();

    // Step 9: Fill Currency Tab
    await retailPage.fillCurrencyTab();

    // Step 10: Fill Demographic Tab
    await retailPage.fillDemographicTab();

    // Step 11: Pre-submit verification
    await retailPage.preSubmitVerification();

    // Step 12: Submit form
    await retailPage.submitForm();

    // Step 13: Handle Process Selection popup
    await retailPage.handleProcessSelection();

    // Store CIF ID for approval test
    sharedCifId = retailPage.cifId;

    // Summary
    console.log('\n=== Summary of E2E Happy Path ===');
    console.log('  \u2713 Basic Info: Name, DOB, Gender, Title, Language filled');
    console.log('  \u2713 Contact: Mailing address, Phone, Email added');
    console.log('  \u2713 ID Documents: Valid document added via LOV');
    console.log('  \u2713 Currency: Valid CCY record added');
    console.log('  \u2713 Demographic: Nationality, Marital Status, Employment, Income/Expense filled');
    console.log('  \u2713 Submit: Single submit via submitForm()');
    if (sharedCifId) console.log(`  \u2713 CIF ID: ${sharedCifId}`);
    else console.log('  \u26a0 CIF ID not captured');
    if (retailPage.processSaveConfirmed) console.log('  \u2713 Process Selection: Saved and confirmed');
    else console.log('  \u26a0 Process Selection: Save confirmation not received');
    console.log('=== E2E Happy Path completed ===');

    // Logout
    await retailPage.doLogout();
  });
});

// =====================================================================
// CIF Approval Verification via Entity Queue
// =====================================================================

test.describe('CIF Approval Verification', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let lastDialogMessages: string[] = [];

  test.beforeEach(async ({ page }) => {
    test.setTimeout(VERIFY_CONFIG.timeouts.testTimeout);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, VERIFY_CONFIG);
  });

  test('Approve CIF via Entity Queue', async ({ page }) => {
    const verificationPage = new CrmVerificationPage(page, VERIFY_CONFIG, lastDialogMessages);
    await verificationPage.performVerification({
      cifId: sharedCifId || '',
      screenId: CRM_TEST_DATA.retail.screenId,
      menuKeywords: CRM_TEST_DATA.retail.menuKeywords,
      menuFrameName: CRM_TEST_DATA.retail.menuFrameName,
      popupCloseUrls: CRM_TEST_DATA.retail.verification.popupCloseUrls,
      approvalLinkStyle: 'retail',
      searchMenuItem: CRM_TEST_DATA.retail.verification.searchMenuItem,
      searchCriteria: CRM_TEST_DATA.retail.verification.searchCriteria,
      statusLabel: 'active',
      screenshotPrefix: 'cif-e2e-approval',
      summaryTitle: 'CIF Approval Verification',
      sectionLabel: 'CIF Retail'
    });
  });
});
