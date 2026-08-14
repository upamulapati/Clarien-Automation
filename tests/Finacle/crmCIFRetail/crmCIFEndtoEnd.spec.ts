import { test, expect, Page, Dialog } from '@playwright/test';
import { getPrimaryConfig, getVerificationConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { saveCreatedCif } from '../../config/cifStore';
import { CrmRetailEndToEndPage } from '../../pages/CRM/crmRetailEndToEndPage';
import { CrmVerificationPage } from '../../pages/CRM/crmVerificationPage';
import { writeSharedState } from '../../helpers/sharedState';
import { ServicePackPage } from '../../pages/CRM/servicePackPage';

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
    const sp = new ServicePackPage(page, CONFIG, lastDialogMessages);

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

    // SP#6: Minor Details must remain visible after DOB focus
    const minorResult = await sp.verifyMinorDetailsAfterDobFocus(page);
    if (minorResult.dobFieldExists) {
      expect(minorResult.minorFieldVisible, 'SP#6: CustomerMinor field must stay visible after DOB focus').toBe(true);
    }

    // Step 6: Fill Currency Sub-Tab (within General)
    await retailPage.fillCurrencySubTab();

    // Step 7: Fill Contact Tab (Address, Phone, Email)
    await retailPage.fillContactTab();

    // SP#5: Address fields must not contain "undefined"
    const addrResult = await sp.verifyAddressFieldsNotUndefined(page);
    if (addrResult.checked) {
      expect(addrResult.undefinedFields.length, 'SP#5: No address fields should contain undefined').toBe(0);
    }

    // Step 8: Fill ID Document Tab
    await retailPage.fillIdDocumentTab();

    // Step 9: Fill Currency Tab
    await retailPage.fillCurrencyTab();

    // SP#1: CCY auto-populate must not produce "undefined"
    const ccyResult = await sp.verifyCurrencyAutoPopulate(page);
    if (ccyResult.ccyCodeValue) {
      expect(ccyResult.ccyDisplayValue, 'SP#1: CCY display must not be undefined').not.toBe('undefined');
    }

    // Step 10: Fill Demographic Tab
    await retailPage.fillDemographicTab();

    // SP#3: Nationality must display descriptive text
    const natResult = await sp.verifyNationalityDisplayFormat(page);
    if (natResult.codeValue) {
      expect(natResult.hasDisplayText, 'SP#3: Nationality display must be descriptive text').toBe(true);
    }

    // SP#8: Employee Type must retain value after save
    const empResult = await sp.verifyEmployeeNameSaved(page);
    if (empResult.employeeTypeField) {
      expect(empResult.isSaved, 'SP#8: Employee Type must be saved').toBe(true);
    }

    // Step 11: Pre-submit verification
    await retailPage.preSubmitVerification();

    // SP#2: Submit/Save icons must be functional
    const iconResult = await sp.verifyIconsFunctional(page);
    expect(iconResult.submitVisible, 'SP#2: Submit button must be visible').toBe(true);

    // Step 12: Submit form
    await retailPage.submitForm();

    // Step 13: Handle Process Selection popup
    await retailPage.handleProcessSelection();

    // Store CIF ID for approval test and for downstream specs
    sharedCifId = retailPage.cifId;
    if (sharedCifId) {
      writeSharedState({ cifId: sharedCifId });
    }

    // Persist the freshly-created CIF ID so the retail modification specs
    // (separate spec files) can modify this same CIF instead of a hardcoded one.
    saveCreatedCif('retail', sharedCifId);

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
    const sp = new ServicePackPage(page, VERIFY_CONFIG, lastDialogMessages);

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

    // SP#14: Entity Queue Assign page must load properly after Get
    const eqResult = await sp.verifyEntityQueueAssignPageLoad(page);
    expect(eqResult.pageLoaded, 'SP#14: Entity Queue Assign page must load after Get').toBe(true);

    // SP#7: Document expand during verification must not produce JS errors
    const docExpandResult = await sp.verifyDocumentExpandDuringVerification(page);
    if (docExpandResult.expanded) {
      expect(docExpandResult.isPrefDefined, 'SP#7: isPref must not be undefined during doc expand').toBe(true);
    }

  });
});
