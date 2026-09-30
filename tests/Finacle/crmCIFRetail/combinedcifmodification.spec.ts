import { test, expect } from "@playwright/test";
import { getPrimaryConfig, CRM_TEST_DATA } from "../../config/crmTestData";
import { getSharedValue } from "../../helpers/sharedState";
import { CrmRetailModificationPage } from "../../pages/CRM/crmRetailModificationPage";
import { CrmOtherBankDetailsPage } from "../../pages/CRM/crmOtherBankDetailsPage";
import { ServicePackPage } from "../../pages/CRM/servicePackPage";
import testData from "./combinedcifmodificationdata.json";

// Combined CIF Modification Maker — address, phone and/or other bank details
// are executed ONLY when the matching section in the JSON test data is populated.
// Empty a section (or set it to {}) to skip that modification.
const CONFIG = getPrimaryConfig();
const MOD = CRM_TEST_DATA.retail.modification;
const SHARED_CIF = getSharedValue((state) => state.cifs?.retail?.cifId);
const CIF_ID = testData.cifId || SHARED_CIF || MOD.fallbackCifId;

function isEmpty(value: any): boolean {
  if (!value) return true;
  if (typeof value !== "object") return true;
  if (Object.keys(value).length === 0) return true;
  return Object.values(value).every(
    (v) => !v || (typeof v === "string" && v.trim() === "")
  );
}

const hasAddress = !isEmpty(testData.address);
const hasPhone = !isEmpty(testData.phone);
const hasOtherBank = !isEmpty(testData.otherBank);

function setAddressEnv(address: any) {
  if (address.type) process.env.ADDR_TYPE = String(address.type);
  if (address.houseNo) process.env.HOUSE_NO = String(address.houseNo);
  if (address.streetNo) process.env.STREET_NO = String(address.streetNo);
  if (address.streetName) process.env.STREET_NAME = String(address.streetName);
  if (address.postalCode) process.env.POSTAL_CODE = String(address.postalCode);
  if (address.state) process.env.STATE = String(address.state);
  if (address.stateCode) process.env.STATE_CODE = String(address.stateCode);
  if (address.city) process.env.CITY = String(address.city);
  if (address.country) process.env.COUNTRY = String(address.country);
  if (address.countryCode) process.env.COUNTRY_CODE = String(address.countryCode);
}

test.describe("CIF Combined Modification Maker", () => {
  let retailMod: CrmRetailModificationPage;
  let obdPage: CrmOtherBankDetailsPage;

  test.afterEach(async () => {
    if (retailMod) await retailMod.cleanupAndLogout().catch(() => {});
    if (obdPage) await obdPage.cleanupAndLogout().catch(() => {});
  });

  test("TC_0XX - Conditional combined CIF modification", async ({ page }) => {
    test.setTimeout(900000);

    retailMod = new CrmRetailModificationPage(page, CONFIG);
    obdPage = new CrmOtherBankDetailsPage(page, CONFIG);

    // ---------- Address and/or Phone (General Details edit) ----------
    if (hasAddress || hasPhone) {
      await retailMod.login(CONFIG.username, CONFIG.password);
      expect(await retailMod.waitForDashboard(page), "Login must succeed and dashboard must load").toBeTruthy();
      await retailMod.selectCrmDashboard();

      await retailMod.navigateToEditEntity();

      const sp = new ServicePackPage(page, CONFIG, []);
      const editFlowResult = await sp.verifyRetailEditEntityFlow(page, "");
      expect(editFlowResult.searchFormLoaded, "Edit Entity search form must load").toBe(true);

      const resultFrame = await retailMod.searchCif(CIF_ID);
      await expect(resultFrame.getByText(new RegExp(CIF_ID)).first()).toBeVisible({ timeout: 10000 });

      await retailMod.openGeneralDetailsEdit(CIF_ID);

      // SP#5: Address fields must not contain "undefined" during edit
      const addrUndef = await sp.verifyAddressFieldsNotUndefined(page);
      if (addrUndef.checked) {
        expect(addrUndef.undefinedFields.length, "SP#5: No address fields should contain undefined").toBe(0);
      }

      if (hasAddress) {
        setAddressEnv(testData.address);
        const addr = await retailMod.deleteMailingAndAddAddress();
        const expectedStreet = testData.address.streetName.toUpperCase();
        const expectedPostal = testData.address.postalCode.toUpperCase();
        expect(addr.streetName.toUpperCase(), `Street Name must contain ${expectedStreet}`).toContain(expectedStreet);
        expect(addr.postalCode.toUpperCase(), `Postal Code must contain ${expectedPostal}`).toContain(expectedPostal);
        console.log("✓ Address deleted and re-added");
      }

      if (hasPhone) {
        const phoneType = testData.phone.type || MOD.phone.type;
        const phoneNo = testData.phone.phoneNo || MOD.phone.phoneNo;
        const phoneVal = await retailMod.modifyPhone(phoneType, phoneNo);
        expect(phoneVal.replace(/\s/g, ""), `${phoneType} Phone No must be ${phoneNo}`).toContain(
          phoneNo.replace(/\s/g, "")
        );
        console.log(`✓ Phone ${phoneType} modified`);
      }

      const submitted = await retailMod.submitGeneralDetails(CIF_ID);
      expect(submitted, "General Details submission must report success").toBeTruthy();

      const shown = await retailMod.verifyRecordInGrid(CIF_ID);
      expect(shown, "Submitted record must display in the Customer Search Results grid").toBeTruthy();
      console.log(`✓ General Details modification submitted for CIF ${CIF_ID}.`);
    }

    // ---------- Other Bank Details ----------
    if (hasOtherBank) {
      const targetOBD = CRM_TEST_DATA.corporate.otherBankDetails;
      for (const [key, value] of Object.entries(testData.otherBank)) {
        if (value && (typeof value !== "string" || value.trim() !== "")) {
          (targetOBD as any)[key] = value;
        }
      }
      targetOBD.retailFallbackCifId = CIF_ID;
      targetOBD.fallbackCifId = CIF_ID;

      const ok = await obdPage.addOtherBankDetails("retail");
      expect(ok, "Other Bank Details should be added and submitted").toBeTruthy();
      console.log("✓ Other Bank Details added");
    }
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
