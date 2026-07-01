import { test, expect } from "@playwright/test";
import { getMakerConfig, CRM_TEST_DATA } from "../../config/crmTestData";
import { getCreatedCif } from "../../config/cifStore";
import { CrmRetailModificationPage } from "../../pages/CRM/crmRetailModificationPage";

// CIF Modification Maker — Address (Page Object Model).
// Deletes the Mailing address and adds a new address on the CIF created +
// persisted by the retail E2E flow (falls back to the hardcoded CIF with a log).
const MAKER = getMakerConfig();
const MOD = CRM_TEST_DATA.retail.modification;
const CIF_ID = getCreatedCif("retail", MOD.fallbackCifId);

test.describe("CIF Modification Maker - Address", () => {
  let retailMod: CrmRetailModificationPage;

  test.afterEach(async () => {
    if (retailMod) await retailMod.cleanupAndLogout().catch(() => {});
  });

  test("TC_009 - Delete Mailing address and add a new address", async ({ page }) => {
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

    // TC_009: Delete the Mailing address + add a new address
    const addr = await retailMod.deleteMailingAndAddAddress();
    const expectedStreet = (process.env.STREET_NAME || MOD.address.streetName).toUpperCase();
    const expectedPostal = (process.env.POSTAL_CODE || MOD.address.postalCode).toUpperCase();
    expect(addr.streetName.toUpperCase(), `Street Name must be ${expectedStreet}`).toContain(expectedStreet);
    expect(addr.postalCode.toUpperCase(), `Postal Code must be ${expectedPostal}`).toContain(expectedPostal);
    console.log("✓ TC_009: Mailing deleted + new address added");

    // Submit + Process Selection
    const submitted = await retailMod.submitGeneralDetails(CIF_ID);
    expect(submitted, "Submission must report success").toBeTruthy();

    // Record must display in the grid after submitting
    const shown = await retailMod.verifyRecordInGrid(CIF_ID);
    expect(shown, "Submitted record must display in the Customer Search Results grid").toBeTruthy();
    console.log(`✓ Address modification submitted and record shown in grid for CIF ${CIF_ID}.`);
  });
});
