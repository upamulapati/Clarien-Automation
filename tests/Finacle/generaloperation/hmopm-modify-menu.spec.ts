import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { HmopmPage } from '../../pages/CoreBanking/HmopmPage';
import { CREDENTIALS } from '../../../data/credentials';
import { setupDialogHandlers } from '../../config/crmSetup';
import { captureEvidence } from '../../helpers/evidence';

const CALL_ID = '260';
const SERIAL_ID = 'INC000001254986';
const SP = 'SP32.4';
const MENU_OPTION_ID = 'HACLINQ';
const PARENT_MENU_ID = 'BGMMU';
const LOG_OPERATION = 'Yes';
const DB_STATUS = 'Y';
const WORK_CLASS_POWER_LOW = '999';

function logStep(step: string, details?: Record<string, unknown>) {
  const payload = details ? ` | ${JSON.stringify(details)}` : '';
  console.log(`[CALL ID: ${CALL_ID}] [SERIAL ID: ${SERIAL_ID}] [SP: ${SP}] ${step}${payload}`);
}

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

test('HMOPM - Modify HACLINQ (Call 260 / Serial INC000001254986) and verify', async ({ page }) => {
  test.setTimeout(900000);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  // --------------------------------------------------
  // Maker steps
  // --------------------------------------------------
  logStep('Logging in to Finacle core server as maker');
  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const hmopmPage = new HmopmPage(page);

  logStep('Step 1: Select Core Server');
  await hmopmPage.selectCoreServer();
  await captureEvidence(page, 'Step 1: Core server selected', { callId: CALL_ID, serialId: SERIAL_ID, sp: SP });

  logStep('Step 2: Invoke HMOPM menu');
  await hmopmPage.searchMenu('HMOPM');
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 2: HMOPM menu invoked', { callId: CALL_ID, serialId: SERIAL_ID });

  logStep('Step 3: Select function Modify and enter Menu Option ID', { menuOptionId: MENU_OPTION_ID });
  await hmopmPage.selectFunction('Modify');
  const menuEntered = await hmopmPage.enterMenuOptionId(MENU_OPTION_ID);
  expect(menuEntered, 'Menu Option ID field must be present and filled with HACLINQ').toBe(true);
  await page.waitForTimeout(1000);
  await captureEvidence(page, 'Step 3: Modify criteria entered', { callId: CALL_ID, serialId: SERIAL_ID, menuOptionId: MENU_OPTION_ID });

  logStep('Step 4: Click Go');
  await hmopmPage.clickGo();
  await page.waitForTimeout(3000);

  // Confirm the modify screen loaded for the expected menu option.
  const isMenuLoaded = await hmopmPage.isMenuOptionIdDisplayed(MENU_OPTION_ID);
  expect(isMenuLoaded, 'HACLINQ must be loaded on the modify screen').toBe(true);
  await captureEvidence(page, 'Step 4: Modify screen loaded', { callId: CALL_ID, serialId: SERIAL_ID, menuOptionId: MENU_OPTION_ID });

  logStep('Step 5: General tab - set Log operation menu and DB status', {
    logOperation: LOG_OPERATION,
    dbStatus: DB_STATUS,
  });
  await hmopmPage.visitGeneralTab();
  const logOpSet = await hmopmPage.setLogOperationMenu(LOG_OPERATION as 'Yes' | 'No');
  expect(logOpSet, 'Log Operation Menu must be set to Yes').toBe(true);
  const dbSet = await hmopmPage.setDbStatus(DB_STATUS as 'Y' | 'N');
  expect(dbSet, 'DB Status must be set to Y').toBe(true);
  await captureEvidence(page, 'Step 5: General tab updated', { callId: CALL_ID, serialId: SERIAL_ID, logOperation: LOG_OPERATION, dbStatus: DB_STATUS });

  logStep('Step 6: Work Class tab - set Work class power low', { value: WORK_CLASS_POWER_LOW });
  await hmopmPage.visitWorkClassTab();
  const wcSet = await hmopmPage.setWorkClassPowerLow(WORK_CLASS_POWER_LOW);
  expect(wcSet, `Work Class Power Low must be set to ${WORK_CLASS_POWER_LOW}`).toBe(true);
  await captureEvidence(page, 'Step 6: Work Class tab updated', { callId: CALL_ID, serialId: SERIAL_ID, workClassPowerLow: WORK_CLASS_POWER_LOW });

  logStep('Step 7: Parent Menu tab - add Parent Menu ID', { parentMenuId: PARENT_MENU_ID });
  await hmopmPage.visitParentMenuTab();
  const parentSet = await hmopmPage.addParentMenuId(PARENT_MENU_ID);
  expect(parentSet, 'Parent Menu ID must be added as BGMMU').toBe(true);
  await captureEvidence(page, 'Step 7: Parent Menu tab updated', { callId: CALL_ID, serialId: SERIAL_ID, parentMenuId: PARENT_MENU_ID });

  logStep('Step 8: Submit the modification');
  await hmopmPage.submitForm();
  await page.waitForTimeout(5000);
  await captureEvidence(page, 'Step 8: Submit clicked', { callId: CALL_ID, serialId: SERIAL_ID });

  await hmopmPage.logScreenMessages();
  const modifyBody = await hmopmPage.getBodyText();
  logStep('Post-submit body preview', { preview: modifyBody.slice(0, 500) });
  expect(modifyBody.toLowerCase(), 'Modification must complete without fatal/core error').not.toMatch(/fatal|core dump|internal server error/);
  expect(modifyBody.toLowerCase(), 'HACLINQ must be reported as modified successfully').toContain('modified successfully');

  const makerStatus = await hmopmPage.getStatusMessage();
  logStep('Maker status message', { message: makerStatus });
  await hmopmPage.clickOkButton();
  await captureEvidence(page, 'Step 8: Modification submitted', { callId: CALL_ID, serialId: SERIAL_ID, status: makerStatus });

  logStep('Maker steps complete - logging out');
  await homePage.logout();
  await page.waitForTimeout(5000);

  // --------------------------------------------------
  // Verifier steps
  // --------------------------------------------------
  logStep('Step 9: Login as verifier and verify the transaction');
  const { homePage: verifierHome } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);

  logStep('Step 9a: Invoke HMOPM menu as verifier');
  const verifyPage = new HmopmPage(page);
  await verifyPage.selectCoreServer();
  await verifyPage.searchMenu('HMOPM');
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 9a: HMOPM menu invoked (verifier)', { callId: CALL_ID, serialId: SERIAL_ID });

  logStep('Step 9b: Select Verify and enter Menu Option ID', { menuOptionId: MENU_OPTION_ID });
  await verifyPage.selectFunction('Verify');
  const verifyMenuEntered = await verifyPage.enterMenuOptionId(MENU_OPTION_ID);
  expect(verifyMenuEntered, 'Verifier must be able to enter HACLINQ').toBe(true);
  await captureEvidence(page, 'Step 9b: Verify criteria entered', { callId: CALL_ID, serialId: SERIAL_ID, menuOptionId: MENU_OPTION_ID });

  logStep('Step 9c: Click Go to load the verification screen');
  await verifyPage.clickGo();
  await page.waitForTimeout(3000);

  const verifyLoaded = await verifyPage.isMenuOptionIdDisplayed(MENU_OPTION_ID);
  expect(verifyLoaded, 'HACLINQ must be loaded for verification').toBe(true);
  await captureEvidence(page, 'Step 9c: Verify screen loaded', { callId: CALL_ID, serialId: SERIAL_ID, menuOptionId: MENU_OPTION_ID });

  logStep('Step 9c: Review modified tabs (Work Class and Parent Menu)');
  await verifyPage.visitWorkClassTab();
  await verifyPage.visitParentMenuTab();
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 9c: All modified tabs reviewed', { callId: CALL_ID, serialId: SERIAL_ID });

  logStep('Step 9d: Submit verification');
  await verifyPage.submitForm();
  await page.waitForTimeout(5000);

  const verifyBody = await verifyPage.getBodyText();
  logStep('Post-verify body preview', { preview: verifyBody.slice(0, 300) });
  expect(verifyBody.toLowerCase(), 'Verification must complete without fatal/core error').not.toMatch(/fatal|core dump|internal server error/);
  expect(verifyBody.toLowerCase(), 'HACLINQ must be reported as verified successfully').toContain('verified successfully');

  const verifyStatus = await verifyPage.getStatusMessage();
  logStep('Verifier status message', { message: verifyStatus });
  await verifyPage.clickOkButton();
  await captureEvidence(page, 'Step 9d: Verification submitted', { callId: CALL_ID, serialId: SERIAL_ID, status: verifyStatus });

  logStep('Verification complete - logging out');
  await verifierHome.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
