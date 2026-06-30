import { test, expect } from '@playwright/test';
import { getPrimaryConfig, getVerificationConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { login, setupDialogHandlers } from '../../config/crmSetup';
import { CrmSuspendPage } from '../../pages/CRM/crmSuspendPage';
import { CrmVerificationPage } from '../../pages/CRM/crmVerificationPage';

let sharedCifId = '';

const CONFIG = getPrimaryConfig();
const VERIFY_CONFIG = getVerificationConfig();

// ===================== TEST SUITE =====================
test.describe('CIF Corporate Undo Suspend', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });
  let lastDialogMessages: string[] = [];

  test.beforeEach(async ({ page }) => {
    test.setTimeout(CONFIG.timeouts.testTimeout);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, CONFIG);
  });

  test('Undo Suspend CIF via Operations', async ({ page }) => {
    const suspendPage = new CrmSuspendPage(page, CONFIG, lastDialogMessages);
    const cifId = CRM_TEST_DATA.corporate.undoSuspend.cifIdToUndoSuspend || sharedCifId;
    if (!cifId) throw new Error('No CIF ID — set cifIdToUndoSuspend in crmTestData.json');

    // Step 1-2: Select CRM with Admin login and wait for CRM to load
    await suspendPage.selectCrmWithAdmin();
    await suspendPage.waitForCrmLoad();

    // Step 3: Navigate to CIF Corporate > Operations > Suspend/Undo Suspension
    await suspendPage.navigateToSuspendForm(CRM_TEST_DATA.corporate.screenId, CRM_TEST_DATA.corporate.menuFrameName);

    // Step 4: Enter CIF ID and Submit
    const cifFilled = await suspendPage.fillCifId(cifId);
    expect(cifFilled, 'CIF ID must be filled in the undo suspend form - check that Operations > Suspend/Undo Suspension menu loaded').toBeTruthy();
    const submitClicked = await suspendPage.clickSubmit();
    expect(submitClicked, 'Submit button must be found and clicked').toBe(true);

    // Step 5: Right-click CIF in Customer Search Results
    await suspendPage.rightClickCifInResults(cifId, 'cif-corporate-undo-suspend');
    await suspendPage.retryRightClickIfNeeded(cifId);

    // Step 6: Select Undo Suspend from context menu
    let popupPromise = suspendPage.registerPopupPromise();
    const undoSuspendClicked = await suspendPage.clickUndoSuspendContextMenu();
    expect(undoSuspendClicked, 'Undo Suspension must be clicked from context menu').toBe(true);
    await page.waitForTimeout(CONFIG.timeouts.medium);

    // Step 7: Handle Undo Suspend popup — fill reasons and save
    let undoSuspendPopup = await suspendPage.waitForOperationPopup(popupPromise, 'Undo Suspend');

    // If entity is under verification, approve it first, then retry
    if (!undoSuspendPopup || undoSuspendPopup.isClosed()) {
      const blockingMsg = suspendPage.getBlockingDialogMessage();
      if (blockingMsg && /under verification/i.test(blockingMsg)) {
        console.log(`⚠ Entity blocked: "${blockingMsg}" — attempting verification approval first...`);
        await suspendPage.doLogout();
        await page.waitForTimeout(CONFIG.timeouts.medium);

        const verifyDialogs: string[] = [];
        setupDialogHandlers(page, verifyDialogs);
        await login(page, VERIFY_CONFIG);
        const verificationPage = new CrmVerificationPage(page, VERIFY_CONFIG, verifyDialogs);
        try {
          await verificationPage.performVerification({
            cifId: cifId,
            screenId: CRM_TEST_DATA.corporate.screenId,
            menuKeywords: CRM_TEST_DATA.corporate.menuKeywords,
            menuFrameName: CRM_TEST_DATA.corporate.menuFrameName,
            popupCloseUrls: CRM_TEST_DATA.corporate.verification.popupCloseUrls,
            approvalLinkStyle: 'corporate',
            searchMenuItem: CRM_TEST_DATA.corporate.verification.searchMenuItem,
            searchCriteria: CRM_TEST_DATA.corporate.verification.searchCriteria,
            statusLabel: 'suspended',
            screenshotPrefix: 'cif-corporate-undo-suspend-pre-clear',
            summaryTitle: 'CIF Corporate Pre-UndoSuspend Verification Clearance',
            sectionLabel: 'CIF Corporate'
          });
        } catch (verifyErr) {
          console.log(`⚠ Pre-clear verification attempt completed with error: ${(verifyErr as Error).message?.substring(0, 150)}`);
        }
        console.log('✓ Pre-clear verification attempt done — retrying undo suspend...');

        lastDialogMessages.length = 0;
        setupDialogHandlers(page, lastDialogMessages);
        await login(page, CONFIG);
        const retryPage = new CrmSuspendPage(page, CONFIG, lastDialogMessages);
        await retryPage.selectCrmWithAdmin();
        await retryPage.waitForCrmLoad();
        await retryPage.navigateToSuspendForm(CRM_TEST_DATA.corporate.screenId, CRM_TEST_DATA.corporate.menuFrameName);
        const cifFilled2 = await retryPage.fillCifId(cifId);
        expect(cifFilled2, 'CIF ID must be filled on retry').toBeTruthy();
        await retryPage.clickSubmit();
        await retryPage.rightClickCifInResults(cifId, 'cif-corporate-undo-suspend-retry');
        await retryPage.retryRightClickIfNeeded(cifId);
        popupPromise = retryPage.registerPopupPromise();
        await retryPage.clickUndoSuspendContextMenu();
        await page.waitForTimeout(CONFIG.timeouts.medium);
        undoSuspendPopup = await retryPage.waitForOperationPopup(popupPromise, 'Undo Suspend');

        if (undoSuspendPopup && !undoSuspendPopup.isClosed()) {
          await retryPage.handleUndoSuspendReasons(undoSuspendPopup);
          await retryPage.saveSuspendPopup(undoSuspendPopup, 'undo');
        } else {
          const retryBlockMsg = retryPage.getBlockingDialogMessage();
          expect(undoSuspendPopup, `Undo Suspend popup must appear on retry. Blocking: ${retryBlockMsg || 'unknown'}`).toBeTruthy();
        }
        await page.waitForTimeout(CONFIG.timeouts.medium);
        await retryPage.handleProcessSelectionPopup(page);
        sharedCifId = cifId;
        await page.screenshot({ path: 'test-results-temp/cif-corporate-undo-suspend-final.png' }).catch(() => {});
        expect(retryPage.hasSavedSuccessfully('suspend'), 'Undo Suspend must be confirmed on retry').toBe(true);
        console.log('✅ CIF Corporate Undo Suspend test completed (after clearing verification)');
        await retryPage.doLogout();
        return;
      }
    }

    if (undoSuspendPopup && !undoSuspendPopup.isClosed()) {
      await suspendPage.handleUndoSuspendReasons(undoSuspendPopup);
      await suspendPage.saveSuspendPopup(undoSuspendPopup, 'undo');
    } else {
      const blockingMsg = suspendPage.getBlockingDialogMessage();
      expect(undoSuspendPopup, `Undo Suspend popup must appear after clicking Undo Suspension. Blocking dialog: ${blockingMsg || 'none'}`).toBeTruthy();
    }
    await page.waitForTimeout(CONFIG.timeouts.medium);

    // Step 8: Handle Process Selection popup
    await suspendPage.handleProcessSelectionPopup(page);

    // Store CIF ID and take screenshot
    sharedCifId = cifId;
    await page.screenshot({ path: 'test-results-temp/cif-corporate-undo-suspend-final.png' }).catch(() => {});
    expect(suspendPage.hasSavedSuccessfully('suspend'), 'Undo Suspend must be confirmed - expected "saved successfully" dialog').toBe(true);

    console.log('✅ CIF Corporate Undo Suspend test completed');
    await suspendPage.doLogout();
  });

});

// =====================================================================
// CIF Corporate Undo Suspend Verification (using finacletest01)
// =====================================================================

test.describe('CIF Corporate Undo Suspend Verification', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  let lastDialogMessages: string[] = [];

  test.beforeEach(async ({ page }) => {
    test.setTimeout(VERIFY_CONFIG.timeouts.testTimeout);
    setupDialogHandlers(page, lastDialogMessages);
    await login(page, VERIFY_CONFIG);
  });

  test('Approve Corporate CIF Undo Suspend via Entity Queue', async ({ page }) => {
    const verificationPage = new CrmVerificationPage(page, VERIFY_CONFIG, lastDialogMessages);
    await verificationPage.performVerification({
      cifId: sharedCifId || CRM_TEST_DATA.corporate.undoSuspend.cifIdToUndoSuspend,
      screenId: CRM_TEST_DATA.corporate.screenId,
      menuKeywords: CRM_TEST_DATA.corporate.menuKeywords,
      menuFrameName: CRM_TEST_DATA.corporate.menuFrameName,
      popupCloseUrls: CRM_TEST_DATA.corporate.verification.popupCloseUrls,
      approvalLinkStyle: 'corporate',
      searchMenuItem: CRM_TEST_DATA.corporate.verification.searchMenuItem,
      searchCriteria: CRM_TEST_DATA.corporate.verification.searchCriteria,
      statusLabel: 'active',
      screenshotPrefix: 'cif-corporate-undo-suspend',
      summaryTitle: 'CIF Corporate Undo Suspend Verification',
      sectionLabel: 'CIF Corporate'
    });
  });
});