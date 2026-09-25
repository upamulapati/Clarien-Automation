import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { HpspPage } from '../../pages/CoreBanking/HpspPage';
import { CREDENTIALS } from '../../../data/credentials';
import { setupDialogHandlers } from '../../config/crmSetup';
import { captureEvidence } from '../../helpers/evidence';

const CALL_ID = '19';
const SERIAL_ID = 'TOL000000217273';
const SP = 'SP_30.1';

const ACCOUNT_ID = '6000197087';
const from = new Date();
from.setDate(1);
const FROM_DATE = `${String(from.getDate()).padStart(2, '0')}-${String(from.getMonth() + 1).padStart(2, '0')}-${from.getFullYear()}`;
const TO_DATE = FROM_DATE;

function logStep(step: string, details?: Record<string, unknown>) {
  const payload = details ? ` | ${JSON.stringify(details)}` : '';
  console.log(`[CALL ID: ${CALL_ID}] [SERIAL ID: ${SERIAL_ID}] [SP: ${SP}] ${step}${payload}`);
}

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

test('HPSP / HPR - Statement not generated when Account Statement is None (Call 19 / Serial TOL000000217273)', async ({ page }) => {
  test.setTimeout(900000);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  // --------------------------------------------------
  // Maker: modify HACM to set statement fields
  // --------------------------------------------------
  logStep('Logging in to Finacle core server as maker');
  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const hpspPage = new HpspPage(page);

  logStep('Step 1: Select Core Server');
  await hpspPage.selectCoreServer();
  await captureEvidence(page, 'Step 1: Core server selected', { callId: CALL_ID, serialId: SERIAL_ID, sp: SP });

  logStep('Step 2: Invoke HACM menu');
  await hpspPage.searchMenu('HACM');
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 2: HACM menu invoked', { callId: CALL_ID, serialId: SERIAL_ID, menu: 'HACM' });

  logStep('Step 3: Select Modify function');
  await hpspPage.selectFunction('Modify');
  await page.waitForTimeout(2000);
  await captureEvidence(page, 'Step 3: Modify function selected', { callId: CALL_ID, serialId: SERIAL_ID });

  logStep('Step 4: Enter account ID and click Go', { accountId: ACCOUNT_ID });
  await hpspPage.enterHacmAccountId(ACCOUNT_ID);
  await hpspPage.clickGo();
  await page.waitForTimeout(3000);

  const modifyBody = await hpspPage.getBodyText();
  const modifyStatus = await hpspPage.getStatusMessage();
  logStep('Post-Go modify body preview', { preview: modifyBody.slice(0, 500), status: modifyStatus });
  expect(await hpspPage.hasFatalOrCoreError(), 'HACM modify screen must not show fatal/core error').toBe(false);
  expect(modifyBody, `Account ID ${ACCOUNT_ID} must be displayed on the HACM modify screen`).toContain(ACCOUNT_ID);
  await captureEvidence(page, 'Step 4: HACM modify account loaded', { callId: CALL_ID, serialId: SERIAL_ID, accountId: ACCOUNT_ID });

  logStep('Step 5: General tab - set Print account statement to None');
  await hpspPage.visitGeneralDetailsTab();
  const printStatementSet = await hpspPage.selectPrintAccountStatement('None');
  expect(printStatementSet, 'Print account statement must be set to None').toBe(true);
  await page.waitForTimeout(1000);
  await captureEvidence(page, 'Step 5: Print account statement set to None', { callId: CALL_ID, serialId: SERIAL_ID, accountId: ACCOUNT_ID });

  logStep('Step 6: Related party tab - set Print statement flag to Y');
  await hpspPage.visitRelatedPartyTab();
  const printFlagSet = await hpspPage.selectRelatedPartyPrintStatementFlag('Y');
  expect(printFlagSet, 'Related party Print statement flag must be set to Y').toBe(true);
  await page.waitForTimeout(1000);
  await captureEvidence(page, 'Step 6: Related party print statement flag set to Y', { callId: CALL_ID, serialId: SERIAL_ID, accountId: ACCOUNT_ID });

  logStep('Step 7: Submit HACM modification');
  await hpspPage.clickSubmit();
  await page.waitForTimeout(5000);

  const postModifyBody = await hpspPage.getBodyText();
  const postModifyStatus = await hpspPage.getStatusMessage();
  logStep('Post-submit modify status', { status: postModifyStatus, preview: postModifyBody.slice(0, 500) });
  expect(await hpspPage.hasFatalOrCoreError(), 'HACM modification must not show fatal/core error').toBe(false);
  const combinedModifyText = [postModifyBody, postModifyStatus ?? '', ...lastDialogMessages].join(' ').toLowerCase();
  expect(combinedModifyText, 'HACM modification must report success').toMatch(/success|modified|completed|account.*verified|record.*saved/);
  await captureEvidence(page, 'Step 7: HACM modification submitted', { callId: CALL_ID, serialId: SERIAL_ID, accountId: ACCOUNT_ID, status: postModifyStatus });

  logStep('Maker steps complete - logging out');
  await homePage.logout();
  await page.waitForTimeout(5000);

  // --------------------------------------------------
  // Verifier: verify HACM modification
  // --------------------------------------------------
  logStep('Step 8: Login as verifier and invoke HACM');
  const { homePage: verifierHome } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);

  const verifyPage = new HpspPage(page);
  await verifyPage.selectCoreServer();
  await verifyPage.searchMenu('HACM');
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 8: HACM menu invoked (verifier)', { callId: CALL_ID, serialId: SERIAL_ID, menu: 'HACM' });

  logStep('Step 9: Select Verify function and load account');
  await verifyPage.selectFunction('Verify');
  await page.waitForTimeout(2000);
  await verifyPage.enterHacmAccountId(ACCOUNT_ID);
  await verifyPage.clickGo();
  await page.waitForTimeout(3000);

  const verifyBody = await verifyPage.getBodyText();
  expect(await verifyPage.hasFatalOrCoreError(), 'HACM verify screen must not show fatal/core error').toBe(false);
  expect(verifyBody, `Account ID ${ACCOUNT_ID} must be displayed on the HACM verify screen`).toContain(ACCOUNT_ID);
  await captureEvidence(page, 'Step 9: HACM verify account loaded', { callId: CALL_ID, serialId: SERIAL_ID, accountId: ACCOUNT_ID });

  logStep('Step 10: Navigate through all tabs and submit verification');
  const verifyTabs = ['General Details', 'Interest & Tax', 'Scheme', 'Related Party', 'MIS Codes', 'Addl. Info'];
  for (const tab of verifyTabs) {
    try {
      await verifyPage.visitTab(tab);
      await page.waitForTimeout(2000);
      logStep(`Visited verification tab: ${tab}`);
      await captureEvidence(page, `Verify tab: ${tab}`, { callId: CALL_ID, serialId: SERIAL_ID, tab });
    } catch (e) {
      logStep(`Could not visit tab ${tab}`, { error: String(e) });
    }
  }
  await verifyPage.clickSubmit();
  await page.waitForTimeout(5000);

  const postVerifyBody = await verifyPage.getBodyText();
  const postVerifyStatus = await verifyPage.getStatusMessage();
  logStep('Post-verify status', { status: postVerifyStatus, preview: postVerifyBody.slice(0, 500) });
  expect(await verifyPage.hasFatalOrCoreError(), 'HACM verification must not show fatal/core error').toBe(false);
  const combinedVerifyText = [postVerifyBody, postVerifyStatus ?? '', ...lastDialogMessages].join(' ').toLowerCase();
  expect(combinedVerifyText, 'HACM verification must report success').toMatch(/success|verified|completed|record.*saved|transaction.*successful/);
  await captureEvidence(page, 'Step 10: HACM verification submitted', { callId: CALL_ID, serialId: SERIAL_ID, accountId: ACCOUNT_ID, status: postVerifyStatus });

  // --------------------------------------------------
  // HPSP: try to generate statement
  // --------------------------------------------------
  logStep('Step 11: Invoke HPSP menu');
  await verifyPage.searchMenu('HPSP');
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 11: HPSP menu invoked', { callId: CALL_ID, serialId: SERIAL_ID, menu: 'HPSP' });

  logStep('Step 12: Enter HPSP criteria', { from: FROM_DATE, to: TO_DATE, accountId: ACCOUNT_ID });
  const fromFilled = await verifyPage.enterHpspFromAccount(ACCOUNT_ID);
  expect(fromFilled, 'From A/c ID must be filled on the HPSP screen').toBe(true);

  const toFilled = await verifyPage.enterHpspToAccount(ACCOUNT_ID);
  expect(toFilled, 'To A/c ID must be filled on the HPSP screen').toBe(true);

  const fromDateFilled = await verifyPage.enterHpspFromDate(FROM_DATE);
  expect(fromDateFilled, `From date must be filled on the HPSP screen (${FROM_DATE})`).toBe(true);

  const toDateFilled = await verifyPage.enterHpspToDate(TO_DATE);
  expect(toDateFilled, `To date must be filled on the HPSP screen (${TO_DATE})`).toBe(true);

  await captureEvidence(page, 'Step 12: HPSP criteria entered', { callId: CALL_ID, serialId: SERIAL_ID, accountId: ACCOUNT_ID, fromDate: FROM_DATE, toDate: TO_DATE });

  logStep('Step 13: Click HPSP Go and verify batch job invoked');
  await verifyPage.clickHpspGo();
  await page.waitForTimeout(5000);

  const hpspBody = await verifyPage.getBodyText();
  const hpspStatus = await verifyPage.getStatusMessage();
  logStep('Post-HPSP status', { status: hpspStatus, preview: hpspBody.slice(0, 500) });
  expect(await verifyPage.hasFatalOrCoreError(), 'HPSP submission must not show fatal/core error').toBe(false);
  const combinedHpspText = [hpspBody, hpspStatus ?? '', ...lastDialogMessages].join(' ').toLowerCase();
  expect(combinedHpspText, 'HPSP must report that the batch job was invoked successfully').toMatch(/batch.*job.*invoked|success|completed|submitted/);
  await captureEvidence(page, 'Step 13: HPSP batch job invoked', { callId: CALL_ID, serialId: SERIAL_ID, accountId: ACCOUNT_ID, status: hpspStatus });

  // --------------------------------------------------
  // HPR: confirm no statement was generated
  // --------------------------------------------------
  logStep('Step 14: Invoke HPR menu');
  await verifyPage.searchMenu('HPR');
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 14: HPR menu invoked', { callId: CALL_ID, serialId: SERIAL_ID, menu: 'HPR' });

  logStep('Step 15: Click HPR Go and assert no accounts were fetched');
  await verifyPage.clickHprGo();
  await page.waitForTimeout(5000);

  const hprBody = await verifyPage.getHprBodyText();
  const hprNoAccounts = await verifyPage.isNoAccountsFetchedErrorDisplayed();
  logStep('Post-HPR body preview', { preview: hprBody.slice(0, 500), noAccountsError: hprNoAccounts });

  const dialogContainsNoAccounts = lastDialogMessages.some(m => {
    const low = m.toLowerCase();
    return low.includes('no accounts') || low.includes('no records') || low.includes('no data') || low.includes('not found');
  });
  expect(
    hprNoAccounts || dialogContainsNoAccounts,
    'HPR must show "No accounts were fetched" error because statement generation is disabled'
  ).toBe(true);
  expect(await verifyPage.hasFatalOrCoreError(), 'HPR must not show fatal/core error').toBe(false);
  await captureEvidence(page, 'Step 15: HPR no accounts fetched validated', { callId: CALL_ID, serialId: SERIAL_ID, accountId: ACCOUNT_ID, hprBody: hprBody.slice(0, 300) });

  logStep('Test complete - logging out');
  await verifierHome.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
