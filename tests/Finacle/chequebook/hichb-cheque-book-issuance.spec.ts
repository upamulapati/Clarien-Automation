import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { HichbPage } from '../../pages/CoreBanking/HichbPage';
import { CREDENTIALS } from '../../../data/credentials';
import { setupDialogHandlers } from '../../config/crmSetup';
import { captureEvidence } from '../../helpers/evidence';

const CALL_ID = '240';
const SERIAL_ID = 'INC000001253857';
const SP = 'SP32.4';
const MAKER_MENU = 'HICHBA';
const VERIFIER_MENU = 'HICHBA';

// Test data - update these with the valid Finacle values for the target env.
const ACCOUNT_ID = '4600000111';
const ISSUE_DATE = '01/09/2026';
const NO_OF_LEAVES = '50';
const LEAVES_PER_BOOK = '50';
const CHEQUE_ALPHA = 'A';
const BEGIN_CHEQUE_NO = '1001';
const ACKNOWLEDGEMENT_OBTAINED = 'Yes';

function logStep(step: string, details?: Record<string, unknown>) {
  const payload = details ? ` | ${JSON.stringify(details)}` : '';
  console.log(`[CALL ID: ${CALL_ID}] [SERIAL ID: ${SERIAL_ID}] [SP: ${SP}] ${step}${payload}`);
}

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

test('HICHB / HICHBA - Cheque Book Issuance and Verification (Call 240 / Serial INC000001253857)', async ({ page }) => {
  test.setTimeout(900000);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  // --------------------------------------------------
  // Maker: issue cheque book
  // --------------------------------------------------
  logStep('Logging in to Finacle core server as maker');
  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const hichbPage = new HichbPage(page);

  logStep('Step 1: Select Core Server');
  await hichbPage.selectCoreServer();
  await captureEvidence(page, 'Step 1: Core server selected', { callId: CALL_ID, serialId: SERIAL_ID, sp: SP });

  logStep('Step 2: Invoke HICHBA menu', { menu: MAKER_MENU });
  await hichbPage.searchMenu(MAKER_MENU);
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 2: HICHB menu invoked', { callId: CALL_ID, serialId: SERIAL_ID, menu: MAKER_MENU });

  logStep('Step 2.5: Cancel any existing unverified cheque book record');
  const cleaned = await hichbPage.cancelUnverifiedChequeBookRecord(ACCOUNT_ID);
  if (cleaned) {
    logStep('Pre-issue cleanup: an existing unverified record was cancelled');
  } else {
    logStep('Pre-issue cleanup: no unverified record found or cancellation not possible');
  }

  logStep('Step 3: Select Function as Issue');
  await hichbPage.selectFunction('Issue');
  await page.waitForTimeout(2000);
  await captureEvidence(page, 'Step 3: Issue function selected', { callId: CALL_ID, serialId: SERIAL_ID });

  logStep('Step 4: Enter cheque book issue details', {
    accountId: ACCOUNT_ID,
    issueDate: ISSUE_DATE,
    noOfLeaves: NO_OF_LEAVES,
    chequeAlpha: CHEQUE_ALPHA,
    beginChequeNo: BEGIN_CHEQUE_NO,
    acknowledgementObtained: ACKNOWLEDGEMENT_OBTAINED,
  });

  const accountFilled = await hichbPage.enterHichbAccountId(ACCOUNT_ID);
  expect(accountFilled, 'A/c. ID must be filled on the HICHBA issue screen').toBe(true);

  const issueDateFilled = await hichbPage.enterIssueDate(ISSUE_DATE);
  expect(issueDateFilled, 'Issue date must be filled on the HICHBA issue screen').toBe(true);

  const ackSelected = await hichbPage.selectAcknowledgementObtained(ACKNOWLEDGEMENT_OBTAINED);
  expect(ackSelected, `Acknowledgement obtained must be selected as ${ACKNOWLEDGEMENT_OBTAINED}`).toBe(true);

  const chequeAlphaFilled = await hichbPage.enterChequeAlpha(CHEQUE_ALPHA);
  expect(chequeAlphaFilled, `Cheque alpha must be filled as ${CHEQUE_ALPHA}`).toBe(true);

  const beginChequeFilled = await hichbPage.enterBeginChequeAlpha(BEGIN_CHEQUE_NO);
  expect(beginChequeFilled, 'Begin cheque no. must be filled on the HICHBA issue screen').toBe(true);

  const leavesFilled = await hichbPage.enterNoOfChequeLeaves(NO_OF_LEAVES);
  expect(leavesFilled, 'No. of cheque leaves must be filled on the HICHBA issue screen').toBe(true);

  const leavesPerBookFilled = await hichbPage.enterLeavesPerBook(LEAVES_PER_BOOK);
  expect(leavesPerBookFilled, 'Leaves per book must be filled on the HICHBA issue screen').toBe(true);

  await captureEvidence(page, 'Step 4: Cheque book issue details entered', {
    callId: CALL_ID,
    serialId: SERIAL_ID,
    accountId: ACCOUNT_ID,
    issueDate: ISSUE_DATE,
    noOfLeaves: NO_OF_LEAVES,
    leavesPerBook: LEAVES_PER_BOOK,
    chequeAlpha: CHEQUE_ALPHA,
    beginChequeNo: BEGIN_CHEQUE_NO,
    acknowledgementObtained: ACKNOWLEDGEMENT_OBTAINED,
  });

  logStep('Step 5: Load issue summary, set MICR charge and submit');
  await hichbPage.clickGo();
  await page.waitForTimeout(5000);
  const micrSelected = await hichbPage.selectCollectMicrCharge('No');
  if (micrSelected) {
    logStep('Collect MICR charge selected as No');
  } else {
    logStep('Collect MICR charge option not present on the summary; proceeding without it');
  }
  await hichbPage.clickSubmit();
  await page.waitForTimeout(5000);

  const submitBody = await hichbPage.getBodyText();
  const makerStatus = await hichbPage.getStatusMessage();
  logStep('Post-submit body preview', { preview: submitBody.slice(0, 500) });
  logStep('Post-submit status message', { status: makerStatus });
  logStep('Post-submit dialog messages', { messages: lastDialogMessages });
  await hichbPage.logScreenMessages();
  await hichbPage.clickOkButton();

  const combinedIssueText = [submitBody, makerStatus ?? '', ...lastDialogMessages].join(' ').toLowerCase();
  expect(await hichbPage.hasFatalOrCoreError(), 'HICHBA issue submission must not show fatal/core error').toBe(false);
  expect(
    combinedIssueText,
    'HICHBA issue submission must report success'
  ).toMatch(/success|completed|cheque book issued|record saved|transaction successful/);

  logStep('Maker status message', { message: makerStatus });
  await captureEvidence(page, 'Step 5: Cheque book issue submitted', {
    callId: CALL_ID,
    serialId: SERIAL_ID,
    accountId: ACCOUNT_ID,
    status: makerStatus,
  });

  logStep('Maker steps complete - logging out');
  await homePage.logout();
  await page.waitForTimeout(5000);

  // --------------------------------------------------
  // Verifier: verify cheque book issuance
  // --------------------------------------------------
  logStep('Step 7: Login as verifier and invoke HICHBA');
  const { homePage: verifierHome } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);

  const verifyPage = new HichbPage(page);
  await verifyPage.selectCoreServer();
  await verifyPage.searchMenu(VERIFIER_MENU);
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 7: HICHBA menu invoked (verifier)', { callId: CALL_ID, serialId: SERIAL_ID, menu: VERIFIER_MENU });

  logStep('Step 8: Select Function as Verify');
  await verifyPage.selectFunction('Verify');
  await page.waitForTimeout(2000);
  await captureEvidence(page, 'Step 8: Verify function selected', { callId: CALL_ID, serialId: SERIAL_ID });

  logStep('Step 9: Enter A/c ID and click Go', { accountId: ACCOUNT_ID });
  const verifyAccountFilled = await verifyPage.enterHichbAccountId(ACCOUNT_ID);
  expect(verifyAccountFilled, 'A/c ID must be filled on the HICHBA verify screen').toBe(true);
  await verifyPage.clickGo();
  await page.waitForTimeout(3000);

  const verifyBody = await verifyPage.getBodyText();
  logStep('Post-Go verify body preview', { preview: verifyBody.slice(0, 500) });
  expect(await verifyPage.hasFatalOrCoreError(), 'HICHBA verify screen must not show fatal/core error').toBe(false);
  expect(verifyBody, `A/c ID ${ACCOUNT_ID} must be displayed on the HICHBA verify screen`).toContain(ACCOUNT_ID);
  await captureEvidence(page, 'Step 9: HICHBA verify details loaded', { callId: CALL_ID, serialId: SERIAL_ID, accountId: ACCOUNT_ID });

  logStep('Step 10: Submit verification');
  await verifyPage.clickSubmit();
  await page.waitForTimeout(5000);

  await verifyPage.logScreenMessages();
  const postVerifyBody = await verifyPage.getBodyText();
  const verifyStatus = await verifyPage.getStatusMessage();
  logStep('Post-verify body preview', { preview: postVerifyBody.slice(0, 500) });
  logStep('Post-verify status message', { status: verifyStatus });
  const combinedVerifyText = [postVerifyBody, verifyStatus ?? ''].join(' ').toLowerCase();
  expect(await verifyPage.hasFatalOrCoreError(), 'HICHBA verification must not show fatal/core error').toBe(false);
  expect(combinedVerifyText, 'HICHBA verification must report success').toMatch(/success|completed|cheque book issued|record saved|transaction successful/);

  logStep('Verifier status message', { message: verifyStatus });
  await verifyPage.clickOkButton();
  await captureEvidence(page, 'Step 10: Cheque book verification submitted', {
    callId: CALL_ID,
    serialId: SERIAL_ID,
    accountId: ACCOUNT_ID,
    status: verifyStatus,
  });

  logStep('Verification complete - logging out');
  await verifierHome.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
