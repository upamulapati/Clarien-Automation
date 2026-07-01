import { test, expect } from "@playwright/test";
import { getMakerConfig, CRM_TEST_DATA } from "../../config/crmTestData";
import { getCreatedCif } from "../../config/cifStore";
import { CrmRetailModificationPage } from "../../pages/CRM/crmRetailModificationPage";

// CIF Modification Maker — Phone (Page Object Model).
// Updates the COMMUNICATION PHONE 1 number on the CIF created + persisted by the
// retail E2E flow (falls back to the hardcoded CIF with a log).
const MAKER = getMakerConfig();
const MOD = CRM_TEST_DATA.retail.modification;
const CIF_ID = getCreatedCif("retail", MOD.fallbackCifId);

const PHONE_TYPE = process.env.PHONE_TYPE || "COMMUNICATION PHONE 1";
const PHONE_NO = process.env.PHONE_NO || "5555555555";

test.describe("CIF Modification Maker - Phone", () => {
  let retailMod: CrmRetailModificationPage;

  test.afterEach(async () => {
    if (retailMod) await retailMod.cleanupAndLogout().catch(() => {});
  });

  test("TC_010 - Modify COMMUNICATION PHONE 1 phone", async ({ page }) => {
    test.setTimeout(900000);
    retailMod = new CrmRetailModificationPage(page, MAKER);

    // Login (maker) + switch to CRM
    await retailMod.login(MAKER.username, MAKER.password);
    expect(await retailMod.waitForDashboard(page), "Login must succeed and dashboard must load").toBeTruthy();
    await retailMod.selectCrmDashboard();

    // CIF Retail > Edit Entity, search the CIF
    await retailMod.navigateToEditEntity();
    const resultFrame = await retailMod.searchCif(CIF_ID);
    await expect(resultFrame.getByText(new RegExp(CIF_ID)).first()).toBeVisible({ timeout: 10000 });

    // Open General Details edit window
    await retailMod.openGeneralDetailsEdit(CIF_ID);

    // TC_010: Modify the COMMUNICATION PHONE 1 number
    const phoneVal = await retailMod.modifyPhone(PHONE_TYPE, PHONE_NO);
    expect(phoneVal.replace(/\s/g, ""), `${PHONE_TYPE} Phone No must be ${PHONE_NO}`).toContain(
      PHONE_NO.replace(/\s/g, "")
    );
    console.log(`✓ TC_010: ${PHONE_TYPE} phone updated`);

    // Submit + Process Selection
    const submitted = await retailMod.submitGeneralDetails(CIF_ID);
    expect(submitted, "Submission must report success").toBeTruthy();

    // Record must display in the grid after submitting
    const shown = await retailMod.verifyRecordInGrid(CIF_ID);
    expect(shown, "Submitted record must display in the Customer Search Results grid").toBeTruthy();
    console.log(`✓ Phone modification submitted and record shown in grid for CIF ${CIF_ID}.`);
  });
});
