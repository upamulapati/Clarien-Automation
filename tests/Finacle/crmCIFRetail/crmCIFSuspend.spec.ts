import { test, expect } from '@playwright/test';
import { getPrimaryConfig, getVerificationConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { CrmSuspendPage } from '../../pages/CRM/crmSuspendPage';
import { CrmVerificationPage } from '../../pages/CRM/crmVerificationPage';
import { ServicePackPage } from '../../pages/CRM/servicePackPage';
import { getSharedValue } from '../../helpers/sharedState';

const SHARED_CIF = getSharedValue('cifId');
let sharedCifId = SHARED_CIF || '';
if (SHARED_CIF) console.log(`[SharedState] Using CIF ID from previous run: ${SHARED_CIF}`);

const CONFIG = getPrimaryConfig();

// ===================== TEST SUITE =====================
test.describe('CIF Suspend', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });
  let lastDialogMessages: string[] = [];

  test.beforeEach(async ({ page }) => {
    test.setTimeout(CONFIG.timeouts.testTimeout);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, CONFIG);
  });

  test('Suspend CIF via Operations', async ({ page }) => {
    const suspendPage = new CrmSuspendPage(page, CONFIG, lastDialogMessages);
    const cifId = sharedCifId || CRM_TEST_DATA.retail.suspend.cifIdToSuspend;
    if (!cifId) throw new Error('No CIF ID — set cifIdToSuspend in crmTestData.json');

    // Step 1-2: Select CRM with Admin login and wait for CRM to load
    await suspendPage.selectCrmWithAdmin();
    await suspendPage.waitForCrmLoad();

    // Step 3: Navigate to CIF Retail > Operations > Suspend/Undo Suspension
    await suspendPage.navigateToSuspendForm(CRM_TEST_DATA.retail.screenId, CRM_TEST_DATA.retail.menuFrameName);

    // Step 4: Enter CIF ID and Submit
    const cifFilled = await suspendPage.fillCifId(cifId);
    expect(cifFilled, 'CIF ID must be filled in the suspend form - check that Operations > Suspend/Undo Suspension menu loaded').toBeTruthy();
    const submitClicked = await suspendPage.clickSubmit();
    expect(submitClicked, 'Submit button must be found and clicked').toBe(true);

    // SP#11: CIF must appear in suspend search results after submit
    const sp = new ServicePackPage(page, CONFIG, lastDialogMessages);
    const suspSearchResult = await sp.verifyCifInSuspendSearchResults(page, cifId);
    expect(suspSearchResult.found, `SP#11: CIF ${cifId} must appear in suspend search results`).toBe(true);

    // Step 5: Right-click CIF in Customer Search Results
    await suspendPage.rightClickCifInResults(cifId, 'cif-suspend');

    // Step 6: Select Suspend from context menu
    const popupPromise = suspendPage.registerPopupPromise();
    const suspendClicked = await suspendPage.clickSuspendContextMenu();
    expect(suspendClicked, 'Suspend Customer must be clicked from context menu').toBe(true);
    await page.waitForTimeout(CONFIG.timeouts.medium);

    // Step 7: Handle Suspend popup — fill reasons and save
    const suspendPopup = await suspendPage.waitForOperationPopup(popupPromise, 'Suspend');
    if (suspendPopup && !suspendPopup.isClosed()) {
      await suspendPage.handleSuspendReasons(suspendPopup);
      await suspendPage.saveSuspendPopup(suspendPopup, 'suspend');
    } else {
      expect(suspendPopup, 'Suspend popup must appear after clicking Suspend Customer').toBeTruthy();
    }
    await page.waitForTimeout(CONFIG.timeouts.medium);

    // Step 8: Handle Process Selection popup
    await suspendPage.handleProcessSelectionPopup(page);

    // Store CIF ID and take screenshot
    sharedCifId = cifId;
    await page.screenshot({ path: 'test-results-temp/cif-suspend-final.png' }).catch(() => {});
    expect(suspendPage.hasSavedSuccessfully('suspend'), 'Suspend must be confirmed - expected "Suspend Customer was saved successfully" dialog').toBe(true);

    console.log('✅ CIF Suspend test completed');
    await suspendPage.doLogout();
  });

});

// =====================================================================
// CIF Suspend Verification (using verification user)
// =====================================================================

const VERIFY_CONFIG = getVerificationConfig();

test.describe('CIF Suspend Verification', () => {
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
      cifId: sharedCifId || CRM_TEST_DATA.retail.suspend.cifIdToSuspend,
      screenId: CRM_TEST_DATA.retail.screenId,
      menuKeywords: CRM_TEST_DATA.retail.menuKeywords,
      menuFrameName: CRM_TEST_DATA.retail.menuFrameName,
      popupCloseUrls: CRM_TEST_DATA.retail.verification.popupCloseUrls,
      approvalLinkStyle: 'retail',
      searchMenuItem: CRM_TEST_DATA.retail.verification.searchMenuItem,
      searchCriteria: CRM_TEST_DATA.retail.verification.searchCriteria,
      statusLabel: 'suspended',
      screenshotPrefix: 'cif-suspend',
      summaryTitle: 'CIF Suspend Verification',
      sectionLabel: 'CIF Retail'
    });
  });
});
