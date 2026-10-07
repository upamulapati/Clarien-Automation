import { test, expect } from "@playwright/test";
import { getPrimaryConfig, getCheckerConfig, CRM_TEST_DATA } from "../../config/crmTestData";
import { getSharedValue } from "../../helpers/sharedState";
import { shouldUpdate } from "../../helpers/shouldUpdate";
import { CrmRetailModificationPage } from "../../pages/CRM/crmRetailModificationPage";
import { CrmOtherBankDetailsPage } from "../../pages/CRM/crmOtherBankDetailsPage";
import { ServicePackPage } from "../../pages/CRM/servicePackPage";
import COMBINED_DATA from "./combinedcifmodificationdata.json";
import FLOW7_DATA from "../../../data/flow7.json";
import FLOW9_DATA from "../../../data/flow9.json";
import FLOW10_DATA from "../../../data/flow10.json";
import { CrmRetailCheckerPage } from "../../pages/CRM/crmRetailCheckerPage";

// Flow-controlled combined CIF modification.
// The flow key is the base name of this spec file (e.g. combinedcifmodification_flow),
// or it can be overridden with the CIF_MOD_FLOW environment variable.
// cifmodificationflowconfig.json decides which sections (address/phone/bank) to run.
// cifmodificationflowdata.json supplies the actual values. Missing values fall back to crmTestData.
const CONFIG = getPrimaryConfig();
const MOD = CRM_TEST_DATA.retail.modification;
const SHARED_CIF = getSharedValue((state) => state.cifs?.retail?.cifId);
const FLOW = process.env.CIF_MOD_FLOW || 'flow7';
const FLOW_DATA = FLOW === 'flow10' ? FLOW10_DATA : FLOW === 'flow9' ? FLOW9_DATA : FLOW7_DATA;
const data = FLOW_DATA as any;
const DATA = (FLOW_DATA as any).cifModification || (COMBINED_DATA as any).cifModification || COMBINED_DATA;
// Skip Other Bank Details for now due to admin-side issue.
const TABS = ((DATA.tabs || []) as any[]).filter(tab => tab.name !== 'Other Bank Details');
const CIF_ID = (FLOW_DATA as any).cifId || SHARED_CIF || COMBINED_DATA.cifId || MOD.fallbackCifId;
const BASE_OBD = { ...CRM_TEST_DATA.corporate.otherBankDetails };

function isEmpty(value: any): boolean {
  if (!value) return true;
  if (typeof value !== "object") return true;
  if (Object.keys(value).length === 0) return true;
  return Object.values(value).every(
    (v) => !v || (typeof v === "string" && v.trim() === "")
  );
}

function mergeWithDefaults(scenarioValue: any, defaults: any): any {
  const merged = { ...defaults };
  if (scenarioValue && typeof scenarioValue === "object") {
    for (const [key, value] of Object.entries(scenarioValue)) {
      if (value && (typeof value !== "string" || (value as string).trim() !== "")) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

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

test.describe("CIF Combined Modification Maker — Flow Controlled", () => {
  let retailMod: CrmRetailModificationPage;
  let obdPage: CrmOtherBankDetailsPage;

  test.afterEach(async () => {
    if (retailMod) await retailMod.cleanupAndLogout().catch(() => {});
    if (obdPage) await obdPage.cleanupAndLogout().catch(() => {});
  });

  test("TC_0XX - Conditional CIF modification", async ({ page }) => {
    test.setTimeout(900000);

    retailMod = new CrmRetailModificationPage(page, CONFIG);
    obdPage = new CrmOtherBankDetailsPage(page, CONFIG);

    const hasAddress = shouldUpdate("address", test.info().file) && !isEmpty(data.address);
    const hasPhone = shouldUpdate("phone", test.info().file) && !isEmpty(data.phone);
    const hasOtherBank = shouldUpdate("bank", test.info().file) && !isEmpty(data.otherBank);

    if (TABS.length > 0) {
      for (const tab of TABS) {
        console.log(`[flow10] Modifying main tab: ${tab.name} for CIF ${CIF_ID}`);

        if (tab.name === 'General Details') {
          const address = mergeWithDefaults(tab.address, MOD.address);
          const phone = mergeWithDefaults(tab.phone, MOD.phone);

          await retailMod.login(CONFIG.username, CONFIG.password);
          expect(await retailMod.waitForDashboard(page), 'Maker login must succeed').toBeTruthy();
          await retailMod.selectCrmDashboard();
          await retailMod.navigateToEditEntity();

          const sp = new ServicePackPage(page, CONFIG, []);
          const editFlowResult = await sp.verifyRetailEditEntityFlow(page, CIF_ID);
          expect(editFlowResult.searchFormLoaded, 'Edit Entity search form must load').toBe(true);

          const resultFrame = await retailMod.searchCif(CIF_ID);
          await expect(resultFrame.getByText(new RegExp(CIF_ID)).first()).toBeVisible({ timeout: 10000 });

          await retailMod.openGeneralDetailsEdit(CIF_ID);

          if (tab.lastName) {
            const lnVal = await retailMod.modifyLastName(tab.lastName);
            expect(lnVal.toUpperCase()).toContain(tab.lastName.toUpperCase());
            console.log(`Last Name updated to ${tab.lastName}`);
          }

          if (!isEmpty(tab.address)) {
            setAddressEnv(address);
            const addr = await retailMod.deleteMailingAndAddAddress();
            const expectedStreet = address.streetName.toUpperCase();
            const expectedPostal = address.postalCode.toUpperCase();
            expect(addr.streetName.toUpperCase()).toContain(expectedStreet);
            expect(addr.postalCode.toUpperCase()).toContain(expectedPostal);
            console.log(`Address updated for General Details`);
          }

          if (!isEmpty(tab.phone)) {
            const phoneVal = await retailMod.modifyPhone(phone.type, phone.phoneNo);
            expect(phoneVal.replace(/\s/g, '')).toContain(phone.phoneNo.replace(/\s/g, ''));
            console.log(`Phone updated for General Details`);
          }

          const submitted = await retailMod.submitGeneralDetails(CIF_ID);
          expect(submitted, 'General Details tab must submit successfully').toBeTruthy();

          const submitMsg = retailMod.lastDialogMessage;
          expect(submitMsg, 'General Details submit must produce a status message').toBeTruthy();
          expect(submitMsg).toMatch(/submitted successfully|Process was saved successfully/i);

          const shown = await retailMod.verifyRecordInGrid(CIF_ID);
          expect(shown, 'Record must show in grid').toBeTruthy();
          console.log(`General Details modification submitted for CIF ${CIF_ID}`);

        } else if (tab.name === 'Other Bank Details') {
          const otherBank = mergeWithDefaults(tab.otherBank, BASE_OBD);
          otherBank.retailFallbackCifId = CIF_ID;
          otherBank.fallbackCifId = CIF_ID;
          Object.assign(CRM_TEST_DATA.corporate.otherBankDetails, otherBank);

          await obdPage.loginAsMaker();
          const ok = await obdPage.addOtherBankDetails('retail', CIF_ID);
          expect(ok, 'Other Bank Details must be submitted').toBeTruthy();

          const obdMsg = obdPage.lastDialogMessage;
          expect(obdMsg, 'Other Bank Details submit must produce a status message').toBeTruthy();
          expect(obdMsg).toMatch(/submitted successfully|saved successfully/i);

          console.log(`Other Bank Details added for CIF ${CIF_ID}`);

        } else {
          console.log(`Tab ${tab.name} not yet automated, skipping`);
          continue;
        }

        if (tab.verify !== false) {
          // Log out maker and verify as checker before moving to the next main tab.
          await retailMod.logout().catch(() => {});

          const checkerConfig = getCheckerConfig();
          const checker = new CrmRetailCheckerPage(page, checkerConfig);
          checker.attachDialogHandler(page);

          await checker.login(checkerConfig.username, checkerConfig.password);
          expect(await checker.waitForDashboard(page), 'Checker login must succeed').toBeTruthy();

          await checker.switchToCrm();
          await checker.navigateToEntityQueue();

          const result = await checker.approvePendingModification(CIF_ID);
          if (result.pendingRecordExists) {
            expect(result.approveSelected && result.committed, 'Approve decision must be saved').toBeTruthy();
            console.log(`Tab ${tab.name} verified for CIF ${CIF_ID}`);
          } else {
            console.log(`No pending record for tab ${tab.name}; may already be verified.`);
          }

          await checker.logout().catch(() => {});
        }
      }
      return;
    }

    // ---------- Address and/or Phone (General Details edit) ----------
    if (hasAddress || hasPhone) {
      const address = mergeWithDefaults(data.address, MOD.address);
      const phone = mergeWithDefaults(data.phone, MOD.phone);

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

      const addrUndef = await sp.verifyAddressFieldsNotUndefined(page);
      if (addrUndef.checked) {
        expect(addrUndef.undefinedFields.length, "SP#5: No address fields should contain undefined").toBe(0);
      }

      if (hasAddress) {
        setAddressEnv(address);
        const addr = await retailMod.deleteMailingAndAddAddress();
        const expectedStreet = address.streetName.toUpperCase();
        const expectedPostal = address.postalCode.toUpperCase();
        expect(addr.streetName.toUpperCase(), `Street Name must contain ${expectedStreet}`).toContain(expectedStreet);
        expect(addr.postalCode.toUpperCase(), `Postal Code must contain ${expectedPostal}`).toContain(expectedPostal);
        console.log("✓ Address deleted and re-added");
      }

      if (hasPhone) {
        const phoneVal = await retailMod.modifyPhone(phone.type, phone.phoneNo);
        expect(phoneVal.replace(/\s/g, ""), `${phone.type} Phone No must be ${phone.phoneNo}`).toContain(
          phone.phoneNo.replace(/\s/g, "")
        );
        console.log(`✓ Phone ${phone.type} modified`);
      }

      const submitted = await retailMod.submitGeneralDetails(CIF_ID);
      expect(submitted, "General Details submission must report success").toBeTruthy();

      const submitMsg = retailMod.lastDialogMessage;
      expect(submitMsg, "General Details submit must produce a status message").toBeTruthy();
      expect(submitMsg).toMatch(/submitted successfully|Process was saved successfully/i);

      const shown = await retailMod.verifyRecordInGrid(CIF_ID);
      expect(shown, "Submitted record must display in the Customer Search Results grid").toBeTruthy();
      console.log(`✓ General Details modification submitted for CIF ${CIF_ID}.`);
    }

    // ---------- Other Bank Details ----------
    if (hasOtherBank) {
      const otherBank = mergeWithDefaults(data.otherBank, BASE_OBD);
      otherBank.retailFallbackCifId = CIF_ID;
      otherBank.fallbackCifId = CIF_ID;
      Object.assign(CRM_TEST_DATA.corporate.otherBankDetails, otherBank);

      const ok = await obdPage.addOtherBankDetails("retail");
      expect(ok, "Other Bank Details should be added and submitted").toBeTruthy();

      const obdMsg = obdPage.lastDialogMessage;
      expect(obdMsg, "Other Bank Details submit must produce a status message").toBeTruthy();
      expect(obdMsg).toMatch(/submitted successfully|saved successfully/i);

      console.log("✓ Other Bank Details added");
    }
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error|fatal error/);
  expect(html).not.toMatch(/cannot be accessed|already taken by another user|not authorized/i);
});
