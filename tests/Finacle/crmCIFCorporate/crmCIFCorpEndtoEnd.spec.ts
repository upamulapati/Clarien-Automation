import { test, expect, Page, Dialog } from '@playwright/test';
import { getPrimaryConfig, getVerificationConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { CrmCorporateEndToEndPage } from '../../pages/CRM/crmCorporateEndToEndPage';
import { CrmVerificationPage } from '../../pages/CRM/crmVerificationPage';
import { ServicePackPage } from '../../pages/CRM/servicePackPage';
import { writeSharedState } from '../../helpers/sharedState';

let sharedCifId = '';
const CONFIG = getPrimaryConfig();
const VERIFY_CONFIG = getVerificationConfig();

// ==================== FIRST TEST: COMPLETE CIF CORPORATE CREATION ====================
test.describe('CIF Corporate Creation', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let lastDialogMessages: string[] = [];

  test.beforeEach(async ({ page }) => {
    test.setTimeout(CONFIG.timeouts.testTimeout);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, CONFIG);
  });

  test('Complete CIF Corporate Creation Flow', async ({ page }) => {
    const e2ePage = new CrmCorporateEndToEndPage(page, CONFIG, lastDialogMessages);
    const sp = new ServicePackPage(page, CONFIG, lastDialogMessages);

    await e2ePage.selectCrm();
    await e2ePage.waitForCrmLoad();
    await e2ePage.navigateToNewEntity();
    await e2ePage.fillBasicInfo();

    await e2ePage.fillContactTab();

    // SP#5: Address fields must not contain "undefined"
    const addrResult = await sp.verifyAddressFieldsNotUndefined(page);
    if (addrResult.checked) {
      expect(addrResult.undefinedFields.length, 'SP#5: No address fields should contain undefined').toBe(0);
    }

    await e2ePage.fillIdDocumentTab();

    await e2ePage.fillCurrencyTab();

    // SP#1: CCY auto-populate must not produce "undefined"
    const ccyResult = await sp.verifyCurrencyAutoPopulate(page);
    if (ccyResult.ccyCodeValue) {
      expect(ccyResult.ccyDisplayValue, 'SP#1: CCY display must not be undefined').not.toBe('undefined');
    }

    await e2ePage.fillDemographicTab();
    await e2ePage.preSubmitVerification();

    // SP#2: Submit/Save icons must be functional before submit
    const iconResult = await sp.verifyIconsFunctional(page);
    expect(iconResult.submitVisible, 'SP#2: Submit button must be visible').toBe(true);

    sharedCifId = await e2ePage.submitForm();

    await e2ePage.handleProcessSelection();

    // ==================== SUMMARY ====================
    console.log('\n=== Summary of CIF Corporate E2E ===');
    console.log('  \u2713 Basic Info: Organization Name, Short Name, DOI, Constitution, Segment filled');
    console.log('  \u2713 Contact: Mailing address, Phone, Email added');
    console.log('  \u2713 ID Documents: Valid document added');
    console.log('  \u2713 Currency: Valid CCY record added');
    console.log('  \u2713 Demographic: Nationality, Residence Country, Income/Expense filled');
    console.log('  \u2713 Submit: Completed');
    if (sharedCifId) console.log('  \u2713 CIF ID: ' + sharedCifId); else console.log('  \u26a0 CIF ID not captured');
    if (e2ePage.processSaveConfirmed) console.log('  \u2713 Process Selection: Saved'); else console.log('  \u26a0 Process Selection: Not confirmed');
    console.log('=== CIF Corporate E2E completed ===');

    // ==================== HARD ASSERTION: CIF ID MUST BE CAPTURED ====================
    expect(sharedCifId, 'CIF ID must be captured after submission. Check dialog messages and page content for CIF ID.').toBeTruthy();

    // Persist CIF ID to shared state for downstream specs (suspend, undo-suspend)
    if (sharedCifId) {
      writeSharedState({ cifId: sharedCifId });
    }

    await e2ePage.doLogout();
  });
});

// ==================== SECOND TEST: CIF CORPORATE APPROVAL VIA ENTITY QUEUE ====================
test.describe('CIF Corporate Approval Verification', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let lastDialogMessages: string[] = [];

  test.beforeEach(async ({ page }) => {
    test.setTimeout(VERIFY_CONFIG.timeouts.testTimeout);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, VERIFY_CONFIG);
  });

  test('Approve Corporate CIF via Entity Queue', async ({ page }) => {
    const verificationPage = new CrmVerificationPage(page, VERIFY_CONFIG, lastDialogMessages);

    await verificationPage.performVerification({
      cifId: sharedCifId || '',
      screenId: CRM_TEST_DATA.corporate.screenId,
      menuKeywords: CRM_TEST_DATA.corporate.menuKeywords,
      menuFrameName: CRM_TEST_DATA.corporate.menuFrameName,
      popupCloseUrls: CRM_TEST_DATA.corporate.verification.popupCloseUrls,
      approvalLinkStyle: 'corporate',
      searchMenuItem: CRM_TEST_DATA.corporate.verification.searchMenuItem,
      searchCriteria: CRM_TEST_DATA.corporate.verification.searchCriteria,
      statusLabel: 'active',
      screenshotPrefix: 'cif-corporate-e2e-approval',
      summaryTitle: 'CIF Corporate Approval Verification',
      sectionLabel: 'CIF Corporate'
    });

    // Note: SP#14 (Entity Queue page load) and SP#7 (Document expand) are
    // verified internally by performVerification(). They cannot be checked
    // here because performVerification() includes logout at the end.
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
