import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { readCollateralRecords } from '../../helpers/sharedState';

// Collateral verification (HCLM) must be performed by a DIFFERENT user than the
// maker who lodged the collateral in collaterallodgment.spec.ts.
const USERNAME = CREDENTIALS.verifierCredentials.username;
const PASSWORD = CREDENTIALS.verifierCredentials.password;

// The IDs and types come from sharedState only.
const records = readCollateralRecords();

// The type labels used during verification sometimes differ from those captured at lodge.
function mapDropdownType(type: string): string {
  const typeMap: Record<string, string> = {
    'Transactional Accounts': 'Transaction accounts',
  };
  return typeMap[type] || type;
}

let homePage: HomePage;
let collateralPage: AccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  // Step 1: Login with a different user (verifier) than the maker.
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  collateralPage = new AccountPage(page);
});

// HCLM - Verify/authorise all lodged collaterals sequentially.
test('HCLM - verify all lodged collaterals sequentially', async ({ page }) => {
  test.setTimeout(1200000);

  if (records.length === 0) {
    throw new Error('No collateral records found. Run collaterallodgement.spec.ts first to populate data/shared-state.json.');
  }

  const verificationResults: { type: string; id: string; message: string }[] = [];

  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await collateralPage.selectCoreServer();

  for (const record of records) {
    console.log(`\n>>> Verifying ${record.type} collateral ID: ${record.id}`);

    // Step 2: Type menu option "HCLM" in finacle.
    await collateralPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
    await page.waitForTimeout(3000);

    // Step 3: Function - V-Verify, Type - <collateral type>, enter the Collateral ID and Go.
    await collateralPage.selectCollateralDropdown('Verify');
    await collateralPage.selectCollateralDropdown(mapDropdownType(record.type));
    await collateralPage.logVisibleFields(`HCLM Verify criteria screen - ${record.type}`);
    await collateralPage.setCollateralId(record.id);
    await collateralPage.clickGo();
    await page.waitForTimeout(3000);

    // Step 4: Verify General and Particulars tabs.
    await collateralPage.visitLoanTab('General', 'general');
    await collateralPage.visitLoanTab('Particulars', 'particulars');

    // Step 5: Submit, then react to any "Visit <tab> information" prompt by
    // opening the requested tab and re-submitting. Different collateral types
    // require different tabs (e.g. Vehicle -> Insurance, Inventory -> Net Value).
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
  // statusMessage may be a "Visit <tab>" prompt; do not assert success here.
  // Final success assertion is applied after the retry loop completes.
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
    expect(successText, `Expected ${record.type} (${record.id}) verification to succeed. Last status: ${statusMessage || '(none)'}`).toMatch(/verified successfully/i);
    verificationResults.push({ type: record.type, id: record.id, message: successText });

    // Finalise on the confirmation screen if an Accept button is present.
    await collateralPage.clickAccept();
    await page.waitForTimeout(2000);
  }

  console.log('All collaterals verified:', records);
  console.log('Verification messages:', verificationResults);

  const allVerified = verificationResults.every(r => /verified successfully/i.test(r.message));
  expect(allVerified, `Not all collaterals verified: ${JSON.stringify(verificationResults, null, 2)}`).toBe(true);
  expect(verificationResults.length).toEqual(records.length);

  // Logout.
  console.log('Logging out...');
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
