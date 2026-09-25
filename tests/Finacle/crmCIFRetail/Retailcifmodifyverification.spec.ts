import { test, expect } from "@playwright/test";
import { CRM_TEST_DATA } from "../../config/crmTestData";
import { getCreatedCif } from "../../config/cifStore";
import { CrmRetailCheckerPage } from "../../pages/CRM/crmRetailCheckerPage";
import COMMON_DATA from "../../../data/common-data.json";

// CIF Modification Checker / verification (Page Object Model).
// Approves the pending modification (submitted by the maker) as the checker
// (verifier), then re-logs in as the maker (FINACLETEST13) and views the
// Audit Trail to confirm the approval history. Operates on the CIF used / saved
// by the flow (falls back to the hardcoded CIF with a log).
const CHECKER = {
  baseUrl: CRM_TEST_DATA.common.baseUrl,
  username: COMMON_DATA.verifierCredentials.username,
  password: COMMON_DATA.verifierCredentials.password,
  timeouts: CRM_TEST_DATA.common.timeouts,
};
const MAKER = {
  baseUrl: CRM_TEST_DATA.common.baseUrl,
  username: COMMON_DATA.thirdCredentials.username,
  password: COMMON_DATA.thirdCredentials.password,
  timeouts: CRM_TEST_DATA.common.timeouts,
};
const MOD = CRM_TEST_DATA.retail.modification;
const CIF_ID = getCreatedCif('retail', MOD.fallbackCifId);
console.log(`[CIF Modify Verification] Using CIF ID: ${CIF_ID}`);

test.describe("CIF Modification Checker", () => {
  let checker: CrmRetailCheckerPage;

  test.afterEach(async () => {
    // Best-effort logout to release the session.
    if (checker) {
      checker.allowLogout = true;
      await checker.logout().catch(() => {});
    }
  });

  test("Approve (verify) pending CIF modification as FINACLETEST05", async ({ page }) => {
    test.setTimeout(900000);
    checker = new CrmRetailCheckerPage(page, CHECKER);
    // The checker manages its own dialogs (must NOT auto-accept logout mid-flow).
    checker.attachDialogHandler(page);

    // CHK_001: Login as the checker
    console.log(`CHK_001: Logging in as ${CHECKER.username} (verification)...`);
    await checker.login(CHECKER.username, CHECKER.password);
    expect(await checker.waitForDashboard(page), `${CHECKER.username} login must succeed`).toBeTruthy();
    console.log(`✓ CHK_001: ${CHECKER.username} logged in`);

    // CHK_002: Switch to CRM (no auto-accept dialog handler — checker owns dialogs)
    console.log("CHK_002: Switching solution to CRM...");
    await page.waitForTimeout(3000);
    const crmMenuFrame = await checker.switchToCrm(false);
    expect(crmMenuFrame, "CRM Dashboard menu must be visible").not.toBeNull();
    console.log("✓ CHK_002: CRM dashboard loaded");

    // CHK_003: Navigate CIF Retail > Entity Queue
    console.log("CHK_003: Navigating to CIF Retail > Entity Queue...");
    await checker.navigateToEntityQueue();

    // CHK_004-007: Locate the pending record and approve it (multi-step).
    const result = await checker.approvePendingModification(CIF_ID);
    if (result.pendingRecordExists) {
      expect(
        result.approveSelected && result.committed,
        "Approve must be selected in the decision dropdown and the decision saved"
      ).toBeTruthy();
      console.log(`✓ CHK_007: CIF ${CIF_ID} approved (entity verified) by ${CHECKER.username}`);
    } else {
      console.log(`CHK_007: No pending record for ${CIF_ID} (already approved); proceeding to Audit Trail.`);
    }

    // CHK_008-015: Log out checker, log in as maker, view Audit Trail history.
    const auditShown = await checker.verifyAuditTrailAsMaker(CIF_ID, MAKER.username, MAKER.password);
    expect(auditShown, "Audit Trail approval history must be displayed via View > Audit Trail").toBeTruthy();
    console.log(`✓ CIF Modification Checker flow completed for CIF ${CIF_ID}.`);
  });
});
