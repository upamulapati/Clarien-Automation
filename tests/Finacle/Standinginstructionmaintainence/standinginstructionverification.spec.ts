import { test, expect } from '@playwright/test';
import { STANDING_INSTRUCTION_TEST_DATA } from '../../config/excelTestData';
import { getSharedValue } from '../../helpers/sharedState';
import { HomePage } from '../../pages/HomePages/HomePage';
import { SavingsBankAccountPage } from '../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

// Standing instruction verification (HSSIM, Function = V) MUST be performed by a
// DIFFERENT user than the maker who added the SI in standinginstructionsaddition.spec.ts.
const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

const SCENARIOS = STANDING_INSTRUCTION_TEST_DATA.standingInstructionTestData;
const scenario = SCENARIOS.find((s: any) => String(s.function).toLowerCase().includes('verify')) ?? SCENARIOS[0] ?? { data: {} };
const data = scenario.data ?? {};

let homePage: HomePage;
let siPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(20000);

  // Step 1: Login to finacle with the verifying user (different from the maker).
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  siPage = new SavingsBankAccountPage(page);
});

// HSSIM - Verify/authorise a standing instruction added by the maker.
test('HSSIM - verify standing instruction', async ({ page }) => {
  const siSerialNumber = data.siSerialNumber || getSharedValue<string>((state: any) => (state as any)[(scenario as any).sharedKey] as string | undefined) || '';
  console.log(`Verifying standing instruction: ${siSerialNumber}`);

  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await siPage.selectCoreServer();

  // Step 2: Type menu option "HSSIM" in finacle.
  console.log('Searching for HSSIM...');
  await siPage.searchMenu(scenario.menuOption || 'HSSIM');
  await page.waitForTimeout(3000);

  // Step 3: Function - V - Verify.
  console.log('Selecting Function (Verify)...');
  await siPage.selectSiDropdown(scenario.function || 'Verify');

  // Step 4: Standing instruction serial number - enter the generated SI number.
  console.log('Entering standing instruction serial number...');
  await siPage.setSiText(
    ['siSrlNo', 'srlNo', 'siSerialNo', 'serialNo', 'siSrlNum'],
    siSerialNumber, 'SI serial number'
  );

  // Click Go to load the standing instruction into the verification screen.
  console.log('Clicking Go button...');
  await siPage.clickGo();
  await page.waitForTimeout(3000);

  // Step 5: Check the Header details.
  console.log('Visiting Header details tab...');
  await siPage.visitLoanTab('Header', 'header');
  await siPage.logVisibleFields('HSSIM Verify - Header details');

  // Step 6: Click on Instruction details and check.
  console.log('Visiting Instruction details tab...');
  await siPage.visitLoanTab('Instruction', 'instruction');
  await siPage.logVisibleFields('HSSIM Verify - Instruction details');

  // After reviewing the Instruction details, switch back to the Header details
  // tab before submitting.
  console.log('Switching back to Header details tab...');
  await siPage.visitLoanTab('Header', 'header');

  // Step 7: Click Submit - standing instruction is verified successfully.
  console.log('Clicking Submit button...');
  await siPage.submitForm();
  await siPage.acceptWarningPopup();
  await siPage.logScreenMessages();

  const statusMessage = await siPage.getStatusMessage();
  console.log('Exact status message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('SI verification status message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);

  // Step 8: Click Accept to return to the main page.
  console.log('Clicking Accept button...');
  await siPage.clickAccept();

  // Logout from the session.
  console.log('Logging out...');
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
