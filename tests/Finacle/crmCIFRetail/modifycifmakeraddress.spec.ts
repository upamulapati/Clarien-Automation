import { test, expect } from "@playwright/test";
import { getPrimaryConfig, CRM_TEST_DATA } from "../../config/crmTestData";
import { getSharedValue } from "../../helpers/sharedState";
import { CrmRetailModificationPage } from "../../pages/CRM/crmRetailModificationPage";
import { ServicePackPage } from "../../pages/CRM/servicePackPage";

// CIF Modification Maker — Address (Page Object Model).
// Deletes the Mailing address and adds a new address on the CIF created +
// persisted by the retail E2E flow (falls back to the hardcoded CIF with a log).
const CONFIG = getPrimaryConfig();
const MOD = CRM_TEST_DATA.retail.modification;
const SHARED_CIF = getSharedValue((state) => state.cifs?.retail?.cifId);
const CIF_ID = SHARED_CIF ?? MOD.fallbackCifId;
if (SHARED_CIF) console.log(`[SharedState] Using CIF ID from previous run: ${SHARED_CIF}`);

test.describe("CIF Modification Maker - Address", () => {
  let retailMod: CrmRetailModificationPage;

  test.afterEach(async () => {
    if (retailMod) await retailMod.cleanupAndLogout().catch(() => {});
  });

  test("TC_009 - Delete Mailing address and add a new address", async ({ page }) => {
    test.setTimeout(900000);
    retailMod = new CrmRetailModificationPage(page, CONFIG);

    // Login + switch to CRM
    await retailMod.login(CONFIG.username, CONFIG.password);
    expect(await retailMod.waitForDashboard(page), "Login must succeed and dashboard must load").toBeTruthy();
    await retailMod.selectCrmDashboard();

    // CIF Retail > Edit Entity, search the CIF
    const sp = new ServicePackPage(page, CONFIG, []);
    await retailMod.navigateToEditEntity();

    // SP#13: Edit Entity search form must load
    const editFlowResult = await sp.verifyRetailEditEntityFlow(page, '');
    expect(editFlowResult.searchFormLoaded, 'SP#13: Edit Entity search form must load').toBe(true);

    const resultFrame = await retailMod.searchCif(CIF_ID || MOD.fallbackCifId);
    await expect(resultFrame.getByText(new RegExp(CIF_ID || MOD.fallbackCifId)).first()).toBeVisible({ timeout: 10000 });

    // Open General Details edit window
    await retailMod.openGeneralDetailsEdit(CIF_ID || MOD.fallbackCifId);

    // SP#5: Address fields must not contain "undefined" during edit
    const addrUndef = await sp.verifyAddressFieldsNotUndefined(page);
    if (addrUndef.checked) {
      expect(addrUndef.undefinedFields.length, 'SP#5: No address fields should contain undefined').toBe(0);
    }

    // TC_009: Delete the Mailing address + add a new address
    const addr = await retailMod.deleteMailingAndAddAddress();
    const expectedStreet = (process.env.STREET_NAME || MOD.address.streetName).toUpperCase();
    const expectedPostal = (process.env.POSTAL_CODE || MOD.address.postalCode).toUpperCase();
    expect(addr.streetName.toUpperCase(), `Street Name must be ${expectedStreet}`).toContain(expectedStreet);
    expect(addr.postalCode.toUpperCase(), `Postal Code must be ${expectedPostal}`).toContain(expectedPostal);
    console.log("✓ TC_009: Mailing deleted + new address added");

    // Submit + Process Selection
    const submitted = await retailMod.submitGeneralDetails(CIF_ID || MOD.fallbackCifId);
    expect(submitted, "Submission must report success").toBeTruthy();

    // Record must display in the grid after submitting
    const shown = await retailMod.verifyRecordInGrid(CIF_ID || MOD.fallbackCifId);
    expect(shown, "Submitted record must display in the Customer Search Results grid").toBeTruthy();
    console.log(`✓ Address modification submitted and record shown in grid for CIF ${CIF_ID}.`);
  });
});
