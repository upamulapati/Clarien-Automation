import { test, expect } from "@playwright/test";
import { CRM_TEST_DATA } from "../../config/crmTestData";
import { getCreatedCif } from "../../config/cifStore";
import { CrmRetailModificationPage } from "../../pages/CRM/crmRetailModificationPage";
import COMMON_DATA from "../../../data/common-data.json";
import FLOW9_DATA from "../../../data/flow9.json";
import FLOW10_DATA from "../../../data/flow10.json";

// CIF Modification Maker workflow (Retail), converted to the Page Object Model.
// The CIF ID is the one created by the retail end-to-end flow (crmCIFEndtoEnd);
// if no E2E run has produced one, it falls back to the hardcoded CIF with a log.
const MAKER = {
  baseUrl: CRM_TEST_DATA.common.baseUrl,
  username: COMMON_DATA.thirdCredentials.username,
  password: COMMON_DATA.thirdCredentials.password,
  timeouts: CRM_TEST_DATA.common.timeouts,
};
const MOD = CRM_TEST_DATA.retail.modification;
const IS_FLOW9 = process.env.CIF_MOD_FLOW === 'flow9';
const IS_FLOW10 = process.env.CIF_MOD_FLOW === 'flow10';
const FLOW9_CIF_ID = process.env.FLOW9_CIF_ID ?? (IS_FLOW9 ? (FLOW9_DATA as any).cifId : undefined);
const FLOW10_CIF_ID = IS_FLOW10 ? (FLOW10_DATA as any).cifId : undefined;
if (IS_FLOW9 && !FLOW9_CIF_ID) throw new Error('Flow 9 requires a CIF ID in flow9.json or FLOW9_CIF_ID env.');
if (IS_FLOW10 && !FLOW10_CIF_ID) throw new Error('Flow 10 requires a CIF ID in flow10.json.');
const CIF_ID = FLOW10_CIF_ID ?? FLOW9_CIF_ID ?? getCreatedCif("retail", MOD.fallbackCifId);

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

test.describe("CIF Modification Maker Test Suite", () => {
  let retailMod: CrmRetailModificationPage;

  test.afterEach(async () => {
    // Best-effort: close any open edit window (releases the edit lock) + logout.
    if (retailMod) await retailMod.cleanupAndLogout().catch(() => {});
  });

  test("Complete CIF modification maker workflow", async ({ page }) => {
    // This is a long, multi-step workflow (many popups + Finacle lookups);
    // allow up to 15 minutes.
    test.setTimeout(900000);
    retailMod = new CrmRetailModificationPage(page, MAKER);

    // TC_001: Login (maker)
    console.log("TC_001: Login as maker...");
    await retailMod.login(MAKER.username, MAKER.password);
    const loggedIn = await retailMod.waitForDashboard(page);
    expect(loggedIn, "Login must succeed and dashboard must load").toBeTruthy();
    console.log("✓ TC_001: Maker user logged in (dashboard loaded)");

    // TC_002: Switch solution CoreServer -> CRM
    console.log("TC_002: Switching solution to CRM...");
    const crmMenuFrame = await retailMod.selectCrmDashboard();
    await expect(
      crmMenuFrame
        .getByText(/CIF\s*Retail/i)
        .or(crmMenuFrame.getByText(/CIF\s*Corporate/i))
        .or(crmMenuFrame.getByText(/360\s*Degree/i))
        .first()
    ).toBeVisible({ timeout: 10000 });
    console.log("✓ TC_002: CRM Dashboard loaded");

    // TC_003: Navigate CIF Retail > Edit Entity
    console.log("TC_003: Navigating to CIF Retail > Edit Entity...");
    await retailMod.navigateToEditEntity();
    console.log("✓ TC_003: Retail Search Criteria displayed");

    // TC_004: Search the CIF
    console.log(`TC_004: Searching CIF ID ${CIF_ID}...`);
    const resultFrame = await retailMod.searchCif(CIF_ID);
    await expect(resultFrame.getByText(new RegExp(CIF_ID)).first()).toBeVisible({ timeout: 10000 });
    console.log("✓ TC_004: CIF profile displayed in search results");

    // TC_005: Search-result columns
    console.log("TC_005: Verifying search result columns...");
    await retailMod.countResultColumns(MOD.expectedColumns);
    console.log("✓ TC_005: Search result columns verified");

    // TC_006: CIF ID renders as a clickable link
    console.log("TC_006: Verifying clickable links...");
    await expect((await retailMod.cifLinkLocator(CIF_ID))).toBeVisible({ timeout: 5000 });
    console.log("✓ TC_006: CIF ID displayed as a clickable link");

    // TC_007: Open Edit window via right-click > Edit > General Details
    console.log("TC_007: Opening General Details edit window...");
    const generalFrame = await retailMod.openGeneralDetailsEdit(CIF_ID);
    expect(generalFrame, "General Details window must open").not.toBeNull();
    console.log("✓ TC_007: General Details edit window opened");

    // TC_008: Modify Last Name
    console.log("TC_008: Modifying Last Name...");
    const lastName = (process.env.FLOW9_LAST_NAME ?? (IS_FLOW9 ? (FLOW9_DATA as any).lastName : (IS_FLOW10 ? (FLOW10_DATA as any).lastName : (process.env.LAST_NAME ?? MOD.lastName)))) as string;
    if ((IS_FLOW9 || IS_FLOW10) && !lastName) throw new Error('Flow requires lastName in data file or env.');
    const lnVal = await retailMod.modifyLastName(lastName);
    expect(lnVal.toUpperCase(), `Last Name must be ${lastName}`).toContain(lastName.toUpperCase());
    console.log(`✓ TC_008: Last Name updated to ${lastName}`);

    // TC_009: Delete Mailing address + add a new address
    console.log("TC_009: Deleting Mailing address and adding a new one...");
    const addressSource = IS_FLOW9 ? (FLOW9_DATA as any).address : (IS_FLOW10 ? (FLOW10_DATA as any).address : MOD.address);
    if ((IS_FLOW9 || IS_FLOW10) && !addressSource) throw new Error('Flow requires address in data file.');
    setAddressEnv(addressSource);
    const addrResult = await retailMod.deleteMailingAndAddAddress();
    const expectedStreet = (addressSource.streetName).toUpperCase();
    const expectedPostal = (addressSource.postalCode).toUpperCase();
    expect(addrResult.streetName.toUpperCase(), "Street Name must be set").toContain(expectedStreet);
    expect(addrResult.postalCode.toUpperCase(), "Postal Code must be set").toContain(expectedPostal);
    console.log("✓ TC_009: Mailing deleted + new address added");

    // TC_010: Modify the MOBILE NUMBER 1 phone number
    console.log("TC_010: Modifying MOBILE NUMBER 1 phone...");
    const phoneNo = (process.env.FLOW9_PHONE_NO ?? (IS_FLOW9 ? (FLOW9_DATA as any).phone.phoneNo : (IS_FLOW10 ? (FLOW10_DATA as any).phone.phoneNo : (process.env.PHONE_NO ?? MOD.phone.phoneNo)))) as string;
    if ((IS_FLOW9 || IS_FLOW10) && !phoneNo) throw new Error('Flow requires phone.phoneNo in data file or env.');
    const phoneVal = await retailMod.modifyPhone(MOD.phone.type, phoneNo);
    expect(phoneVal.replace(/\s/g, ""), `MOBILE NUMBER 1 Phone No must be ${phoneNo}`).toContain(
      phoneNo.replace(/\s/g, "")
    );
    console.log("✓ TC_010: MOBILE NUMBER 1 phone updated");

    

    // TC_012: Submit General Details + Process Selection
    console.log("TC_012: Submitting General Details...");
    const submitted = await retailMod.submitGeneralDetails(CIF_ID);
    expect(submitted, "Submission must report success").toBeTruthy();
    console.log("✓ TC_012 / TC_013: Submitted and acknowledged");

    // TC_014: Record must display in the grid after submitting
    console.log("TC_014: Verifying the submitted record shows in the grid...");
    const recordShown = await retailMod.verifyRecordInGrid(CIF_ID, lastName);
    expect(recordShown, "Submitted record must display in the Customer Search Results grid").toBeTruthy();
    console.log(`✓ TC_014: Record (CIF ${CIF_ID}) displayed in the grid.`);
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
