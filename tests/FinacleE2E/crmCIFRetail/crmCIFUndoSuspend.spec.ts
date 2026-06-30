import { test, expect } from '@playwright/test';
import { getPrimaryConfig, getVerificationConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { CrmSuspendPage } from '../../pages/CRM/crmSuspendPage';
import { CrmVerificationPage } from '../../pages/CRM/crmVerificationPage';

let sharedCifId = '';

const CONFIG = getPrimaryConfig();
const VERIFY_CONFIG = getVerificationConfig();

// ===================== TEST SUITE =====================
test.describe('CIF Undo Suspend', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });
  let lastDialogMessages: string[] = [];


  test.beforeEach(async ({ page }) => {
    test.setTimeout(CONFIG.timeouts.testTimeout);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, CONFIG);
  });

  test('Undo Suspend CIF via Operations', async ({ page }) => {
    const suspendPage = new CrmSuspendPage(page, CONFIG, lastDialogMessages);
    const cifId = CRM_TEST_DATA.retail.undoSuspend.cifIdToUndoSuspend || sharedCifId;
    if (!cifId) throw new Error('No CIF ID - set cifIdToUndoSuspend in crmTestData.json');

    // Step 1-2: Select CRM with Admin login and wait for CRM to load
    await suspendPage.selectCrmWithAdmin();
    await suspendPage.waitForCrmLoad();

    // Step 3: Navigate to CIF Retail > Operations > Suspend/Undo Suspension
    await suspendPage.navigateToSuspendForm(CRM_TEST_DATA.retail.screenId, CRM_TEST_DATA.retail.menuFrameName);

    // Step 4: Enter CIF ID and Submit
    const cifFilled = await suspendPage.fillCifId(cifId);
    expect(cifFilled, 'CIF ID must be filled in the undo suspend form - check that Operations > Suspend/Undo Suspension menu loaded').toBeTruthy();
    const submitClicked = await suspendPage.clickSubmit();
    expect(submitClicked, 'Submit button must be found and clicked').toBe(true);

    // Step 5: Right-click CIF in Customer Search Results
    await suspendPage.rightClickCifInResults(cifId, 'cif-undo-suspend');
    await suspendPage.retryRightClickIfNeeded(cifId);

    // Step 6: Select Undo Suspend from context menu
    const popupPromise = suspendPage.registerPopupPromise();
    const undoSuspendClicked = await suspendPage.clickUndoSuspendContextMenu();
    expect(undoSuspendClicked, 'Undo Suspension must be clicked from context menu').toBe(true);
    await page.waitForTimeout(CONFIG.timeouts.medium);

    // Step 7: Handle Undo Suspend popup — fill reasons and save
    const undoSuspendPopup = await suspendPage.waitForOperationPopup(popupPromise, 'Undo Suspend');
    if (undoSuspendPopup && !undoSuspendPopup.isClosed()) {
      await suspendPage.handleUndoSuspendReasons(undoSuspendPopup);
      await suspendPage.saveSuspendPopup(undoSuspendPopup, 'undo');
    } else {
      expect(undoSuspendPopup, 'Undo Suspend popup must appear after clicking Undo Suspension').toBeTruthy();
    }
    await page.waitForTimeout(CONFIG.timeouts.medium);

    // Step 8: Handle Process Selection popup
    await suspendPage.handleProcessSelectionPopup(page);

    // Store CIF ID and take screenshot
    sharedCifId = cifId;
    await page.screenshot({ path: 'test-results-temp/cif-undo-suspend-final.png' }).catch(() => {});
    expect(suspendPage.hasSavedSuccessfully('suspend'), 'Undo Suspend must be confirmed - expected "saved successfully" dialog').toBe(true);

    console.log('✅ CIF Undo Suspend test completed');
    await suspendPage.doLogout();
  });

});

// =====================================================================
// CIF Undo Suspend Verification (using finacletest01)
// =====================================================================

test.describe('CIF Undo Suspend Verification', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let lastDialogMessages: string[] = [];

  test.beforeEach(async ({ page }) => {
    test.setTimeout(VERIFY_CONFIG.timeouts.testTimeout);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, VERIFY_CONFIG);
  });

  test('Approve CIF Undo Suspend via Entity Queue', async ({ page }) => {
    const verificationPage = new CrmVerificationPage(page, VERIFY_CONFIG, lastDialogMessages);
    await verificationPage.performVerification({
      cifId: sharedCifId || CRM_TEST_DATA.retail.undoSuspend.cifIdToUndoSuspend,
      screenId: CRM_TEST_DATA.retail.screenId,
      menuKeywords: CRM_TEST_DATA.retail.menuKeywords,
      menuFrameName: CRM_TEST_DATA.retail.menuFrameName,
      popupCloseUrls: CRM_TEST_DATA.retail.verification.popupCloseUrls,
      approvalLinkStyle: 'retail',
      searchMenuItem: CRM_TEST_DATA.retail.verification.searchMenuItem,
      searchCriteria: CRM_TEST_DATA.retail.verification.searchCriteria,
      statusLabel: 'active',
      screenshotPrefix: 'cif-undo-suspend',
      summaryTitle: 'CIF Undo Suspend Verification',
      sectionLabel: 'CIF Retail'
    });
  });
});
