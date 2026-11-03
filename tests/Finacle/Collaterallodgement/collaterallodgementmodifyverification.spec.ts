import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { readFirstCollateralRecord } from '../../helpers/sharedState';
import { COLLATERAL_LODGEMENT_DATA } from '../../config/excelTestData';

// Collateral modification verification (HCLM) MUST be performed by a DIFFERENT
// user than the maker who modified the collateral in
// Collaterallodgementmodification.spec.ts.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// Load the selected Excel scenario. The runner injects the FlowConfig-chosen
// instance via STEP_DATA; this also works with a direct Excel fallback.
const scenario = COLLATERAL_LODGEMENT_DATA.collateralLodgementTestData[0]?.data ?? {};

// Collateral to verify. Prefer the record persisted by the previous specs;
// the Excel sheet can also override with an existing id and type.
const latestRecord = readFirstCollateralRecord();
const COLLATERAL_ID = latestRecord?.id ?? scenario.collateralId;
const COLLATERAL_TYPE = latestRecord?.type ?? scenario.collateralType;

let homePage: HomePage;
let collateralPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  // Step 1: Login with a different user (verifier) than the maker.
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  collateralPage = new AccountPage(page);
});

// HCLM - Verify a modified (term deposit) collateral following the manual steps.
test('HCLM - verify modified collateral', async ({ page }) => {
  console.log(`Verifying modified collateral: ${COLLATERAL_ID}`);

  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await collateralPage.selectCoreServer();

  // Step 2: Type menu option "HCLM" in finacle.
  console.log('Searching for HCLM...');
  await collateralPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
  await page.waitForTimeout(3000);

  // Step 3: Function - V-Verify, Type - Deposits, enter the Collateral ID and
  // click the search button so the unverified (modified) record is loaded, Go.
  console.log(`Selecting Function (Verify) and Type (${COLLATERAL_TYPE})...`);
  await collateralPage.selectCollateralDropdown('Verify');
  await collateralPage.selectCollateralDropdown(COLLATERAL_TYPE);

  console.log(`Entering Collateral ID: ${COLLATERAL_ID}...`);
  await collateralPage.setCollateralId(COLLATERAL_ID);

  console.log('Clicking Go button...');
  await collateralPage.clickGo();
  await page.waitForTimeout(3000);

  // Step 4: Submit, then react to any "Visit <tab> information" prompt by
  // opening the requested tab and re-submitting.
  console.log('Clicking Submit button...');
  await collateralPage.submitForm();

  let successText = '';
  let statusMessage: string | null = '';
  const visitedTabs = new Set<string>();

  for (let attempt = 0; attempt < 8; attempt++) {
    // Dismiss any warning/exception popup raised on submit.
    await collateralPage.acceptWarningPopup(2);

    // Surface the on-screen verification message.
    await collateralPage.logScreenMessages();
    statusMessage = await collateralPage.getStatusMessage();
    console.log('Verification status message:', statusMessage);
    successText = statusMessage ?? '';

    const visitPattern = /visit\s+([\w\s]+?)\s+(?:information|tab|details|section)/gi;
    const requestedTabs: string[] = [];
    for (const match of successText.matchAll(visitPattern)) {
      const tab = match[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
      if (!visitedTabs.has(tab.toLowerCase())) {
        requestedTabs.push(tab);
      }
    }
    if (requestedTabs.length > 0) {
      for (const requestedTab of requestedTabs) {
        visitedTabs.add(requestedTab.toLowerCase());
        console.log(`System requested tab: ${requestedTab}. Visiting...`);
        const tabId = requestedTab.toLowerCase().replace(/\s+/g, '');
        await collateralPage.visitLoanTab(requestedTab, tabId);
        await collateralPage.validateHclmTab();
      }

      console.log('Re-submitting after visiting requested tabs...');
      await collateralPage.submitForm();
      continue;
    }
    break;
  }
  if (!/verified successfully/i.test(successText)) {
    for (const frame of page.frames()) {
      const body = (await frame.locator('body').innerText().catch(() => ''))
        .replace(/\s+/g, ' ').trim();
      if (/verified successfully/i.test(body)) {
        successText = body;
        break;
      }
    }
  }
  expect(successText, 'Expected collateral verification success message').toMatch(/verified successfully/i);

  // Finalise on the confirmation screen if an Accept button is present.
  await collateralPage.clickAccept();

  // Logout.
  console.log('Logging out...');
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
