import { test, expect, Page } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { SavingsBankAccountPage } from '../../pages/SavingsBankAccountPage';
import { CREDENTIALS } from '../../../data/credentials';
import { setupDialogHandlers } from '../../config/crmSetup';
import { captureEvidence } from '../../helpers/evidence';

const CALL_ID = '153';
const SERIAL_ID = 'TOL000000760831';
const SP = 'SP_30.1';
const HSIM_MENU = process.env.HSIM_MENU ?? 'HSIM';

const SOL_ID = process.env.SI_SOL_ID ?? '100';
const CURRENCY = process.env.SI_CURRENCY ?? 'BMD';
const AMOUNT = process.env.SI_AMOUNT ?? '1000';
const DEBIT_ACCOUNT = process.env.SI_DEBIT_ACCOUNT ?? '4600000111';
const CREDIT_ACCOUNT = process.env.SI_CREDIT_ACCOUNT ?? '7500001468';
const MODIFICATION_NOTES = 'SP_30.1 regression note - part tran modification';

function logStep(step: string, details?: Record<string, unknown>) {
  const payload = details ? ` | ${JSON.stringify(details)}` : '';
  console.log(`[CALL ID: ${CALL_ID}] [SERIAL ID: ${SERIAL_ID}] [SP: ${SP}] ${step}${payload}`);
}

function futureDate(days = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

async function getFinwBodyText(page: Page): Promise<string> {
  const finw = page.frame({ name: 'FINW' });
  if (!finw) return '';
  return (await finw.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
}

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

test('HSIM - SI part transaction modification and subsequent verification must succeed (Call 153 / Serial TOL000000760831)', async ({ page }) => {
  test.setTimeout(900000);
  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  // --------------------------------------------------
  // Maker: add a new standing instruction
  // --------------------------------------------------
  logStep('Maker login to Finacle core server');
  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const siPage = new SavingsBankAccountPage(page);

  logStep('Step 1: Select Core Server');
  await siPage.selectCoreServer();
  await captureEvidence(page, 'Step 1: Core server selected', { callId: CALL_ID, serialId: SERIAL_ID, sp: SP });

  logStep('Step 2: Invoke HSIM menu', { menu: HSIM_MENU });
  await siPage.searchMenu(HSIM_MENU);
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 2: HSIM menu invoked', { callId: CALL_ID, serialId: SERIAL_ID, menu: HSIM_MENU });

  logStep('Step 3: Select Function as Add and click Go');
  await siPage.selectFunction('Add');
  await siPage.clickGo();
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 3: Add function selected', { callId: CALL_ID, serialId: SERIAL_ID });

  logStep('Step 4: Fill Header Details');
  await siPage.visitTab('Header');
  await siPage.setSiType('bank');
  await siPage.setSiText(['solID', 'solId', 'soleId'], SOL_ID, 'Sol Id');
  await siPage.selectSiOptionById('siFreqType', 'Monthly');
  await siPage.selectSiOptionById('siFreqStartDD', '01');
  await siPage.selectSiOptionById('siFreqHldyStat', 'S - Skip');
  await siPage.selectSiOptionById('siFreqCalBase', 'Gregorian');
  await siPage.selectSiDropdown('Before Change');
  await siPage.fillSiDate(
    ['nextExecDate_ui', 'nextExecnDate_ui', 'nextExecutionDate_ui', 'startDate_ui'],
    futureDate(7),
    'Next execution date'
  );
  await siPage.setSiFlag('validate ccy holiday', 'Yes');
  await siPage.setSiFlag('autopost', 'Yes');
  await siPage.setSiFlag('carry forward', 'Yes');
  await captureEvidence(page, 'Step 4: Header details filled', { callId: CALL_ID, serialId: SERIAL_ID });

  logStep('Step 5: Open Subinstruction Details tab');
  await siPage.visitTab('Subinstruction Details');
  await page.waitForTimeout(3000);

  // Debit part transaction
  logStep('Step 5.1: Add debit part transaction', { account: DEBIT_ACCOUNT, amount: AMOUNT, ccy: CURRENCY });
  const finw = page.frame({ name: 'FINW' })!;
  await finw.locator('a').filter({ hasText: 'Click here' }).first().click();
  await page.waitForTimeout(3000);
  await siPage.selectSiDropdown('Fixed');
  await siPage.setSiPartTranType('debit');
  await siPage.setSiCurrency(CURRENCY);
  await siPage.setSiAmount(AMOUNT);
  await finw.evaluate(() => {
    const el = document.getElementById('mVarAcctId') as HTMLInputElement | null;
    if (el) {
      el.removeAttribute('disabled');
      el.removeAttribute('readonly');
      el.style.display = '';
    }
  });
  await finw.locator('#mVarAcctId').fill(DEBIT_ACCOUNT);
  await finw.locator('#mVarAcctId').press('Tab');
  await page.waitForTimeout(2000);
  await siPage.clickButtonByText('Validate');
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 5.1: Debit part transaction validated', { callId: CALL_ID, serialId: SERIAL_ID, account: DEBIT_ACCOUNT });

  // Credit part transaction
  logStep('Step 5.2: Add credit part transaction', { account: CREDIT_ACCOUNT, amount: AMOUNT, ccy: CURRENCY });
  await siPage.clickSiAddPartTran();
  await page.waitForTimeout(3000);
  await siPage.selectSiDropdown('Fixed');
  await siPage.setSiPartTranType('credit');
  await siPage.setSiCurrency(CURRENCY);
  await siPage.setSiAmount(AMOUNT);
  await finw.evaluate(() => {
    const el = document.getElementById('mVarAcctId') as HTMLInputElement | null;
    if (el) {
      el.removeAttribute('disabled');
      el.removeAttribute('readonly');
      el.style.display = '';
    }
  });
  await finw.locator('#mVarAcctId').fill(CREDIT_ACCOUNT);
  await finw.locator('#mVarAcctId').press('Tab');
  await page.waitForTimeout(2000);
  await siPage.clickButtonByText('Validate');
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 5.2: Credit part transaction validated', { callId: CALL_ID, serialId: SERIAL_ID, account: CREDIT_ACCOUNT });

  logStep('Step 6: Validate both part transactions are shown in the Sub Instruction List');
  await siPage.visitTab('Sub Instruction List');
  await page.waitForTimeout(2000);
  const subListBody = await getFinwBodyText(page);
  expect(subListBody, 'Debit account must be listed in the Sub Instruction List').toContain(DEBIT_ACCOUNT);
  expect(subListBody, 'Credit account must be listed in the Sub Instruction List').toContain(CREDIT_ACCOUNT);
  expect(subListBody, 'Amount must be listed in the Sub Instruction List').toContain(AMOUNT);
  await captureEvidence(page, 'Step 6: Sub Instruction List validated', { callId: CALL_ID, serialId: SERIAL_ID });

  logStep('Step 7: Remove required validation, Validate and Submit');
  await siPage.removeSiRequiredValidation();
  await siPage.clickButtonByText('Validate');
  await page.waitForTimeout(3000);
  await siPage.logScreenMessages();
  await siPage.clickButtonByText('Submit');
  await siPage.acceptWarningPopup();
  await page.waitForTimeout(5000);
  await siPage.logScreenMessages();

  const addStatus = await siPage.getStatusMessage();
  const generatedSiNumber = await siPage.getGeneratedSiNumber();
  logStep('SI creation status', { status: addStatus, siNumber: generatedSiNumber });
  expect(generatedSiNumber, 'A new SI number must be generated after submit').toBeTruthy();
  expect(addStatus?.toLowerCase() ?? '', 'SI addition must report success').toMatch(/added|success|created/);
  await siPage.clickAccept();
  await captureEvidence(page, 'Step 7: SI submitted', { callId: CALL_ID, serialId: SERIAL_ID, siNumber: generatedSiNumber });

  logStep('Maker steps complete - logging out');
  await homePage.logout();
  await page.waitForTimeout(5000);

  // --------------------------------------------------
  // Verifier: verify the newly added SI
  // --------------------------------------------------
  logStep('Step 8: Login as verifier and invoke HSIM');
  const { homePage: verifierHome } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
  const verifyPage = new SavingsBankAccountPage(page);

  await verifyPage.selectCoreServer();
  await verifyPage.searchMenu(HSIM_MENU);
  await page.waitForTimeout(3000);
  await captureEvidence(page, 'Step 8: HSIM invoked (verifier)', { callId: CALL_ID, serialId: SERIAL_ID, menu: HSIM_MENU });

  logStep('Step 9: Select Verify function, enter SI number and click Go');
  await verifyPage.selectFunction('Verify');
  await verifyPage.setSiText(['siSrlNo', 'srlNo', 'siSerialNo', 'serialNo', 'siSrlNum'], generatedSiNumber!, 'SI serial number');
  await verifyPage.clickGo();
  await page.waitForTimeout(3000);

  logStep('Step 10: Navigate all verification screens');
  await verifyPage.visitTab('Header');
  await captureEvidence(page, 'Step 10: Verify Header tab', { callId: CALL_ID, serialId: SERIAL_ID, siNumber: generatedSiNumber });
  await verifyPage.visitTab('Instruction Details');
  await captureEvidence(page, 'Step 10: Verify Instruction Details tab', { callId: CALL_ID, serialId: SERIAL_ID, siNumber: generatedSiNumber });
  await verifyPage.visitTab('Header');

  logStep('Step 11: Submit verification');
  await verifyPage.submitForm();
  await verifyPage.acceptWarningPopup();
  await page.waitForTimeout(5000);
  await verifyPage.logScreenMessages();

  const verifyStatus = await verifyPage.getStatusMessage();
  const verifyBody = await getFinwBodyText(page);
  logStep('Verifier status', { status: verifyStatus });
  expect(verifyBody.toLowerCase(), 'First verification must not show Nothing to Verify').not.toContain('nothing to verify');
  expect(verifyStatus?.toLowerCase() ?? '', 'First verification must report success').toMatch(/verified|success/);
  await verifyPage.clickAccept();
  await captureEvidence(page, 'Step 11: SI verified', { callId: CALL_ID, serialId: SERIAL_ID, siNumber: generatedSiNumber, status: verifyStatus });

  logStep('Verifier steps complete - logging out');
  await verifierHome.logout();
  await page.waitForTimeout(5000);

  // --------------------------------------------------
  // Maker: modify the verified SI
  // --------------------------------------------------
  logStep('Step 12: Login as maker to modify the SI');
  const { homePage: makerHome2 } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const modifyPage = new SavingsBankAccountPage(page);

  await modifyPage.selectCoreServer();
  await modifyPage.searchMenu(HSIM_MENU);
  await page.waitForTimeout(3000);

  logStep('Step 13: Select Modify function, enter SI number and click Go');
  await modifyPage.selectFunction('Modify');
  await modifyPage.setSiText(['siSrlNo', 'srlNo', 'siSerialNo', 'serialNo', 'siSrlNum'], generatedSiNumber!, 'SI serial number');
  await modifyPage.clickGo();
  await page.waitForTimeout(3000);

  logStep('Step 14: Modify part tran details by adding notes');
  await modifyPage.visitTab('Header');
  await modifyPage.setSiText(['notes', 'note', 'remarks', 'comments', 'siNotes', 'mNote'], MODIFICATION_NOTES, 'Notes');
  await captureEvidence(page, 'Step 14: Modification notes entered', { callId: CALL_ID, serialId: SERIAL_ID, siNumber: generatedSiNumber, notes: MODIFICATION_NOTES });

  logStep('Step 15: Navigate all modification screens and submit');
  await modifyPage.visitTab('Instruction Details');
  await captureEvidence(page, 'Step 15: Modify Instruction Details tab', { callId: CALL_ID, serialId: SERIAL_ID, siNumber: generatedSiNumber });
  await modifyPage.visitTab('Header');
  await modifyPage.submitForm();
  await modifyPage.acceptWarningPopup();
  await page.waitForTimeout(5000);
  await modifyPage.logScreenMessages();

  const modifyStatus = await modifyPage.getStatusMessage();
  const modifyBody = await getFinwBodyText(page);
  logStep('Modification status', { status: modifyStatus });
  expect(modifyBody.toLowerCase(), 'Modification must not show Nothing to cancel / Nothing to Verify').not.toMatch(/nothing to cancel|nothing to verify/);
  expect(modifyStatus?.toLowerCase() ?? '', 'SI modification must report success').toMatch(/modified|success/);
  await modifyPage.clickAccept();
  await captureEvidence(page, 'Step 15: SI modified', { callId: CALL_ID, serialId: SERIAL_ID, siNumber: generatedSiNumber, status: modifyStatus });

  logStep('Maker modification complete - logging out');
  await makerHome2.logout();
  await page.waitForTimeout(5000);

  // --------------------------------------------------
  // Verifier: verify the modified SI
  // --------------------------------------------------
  logStep('Step 16: Login as verifier to re-verify the modified SI');
  const { homePage: verifierHome2 } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
  const reverifyPage = new SavingsBankAccountPage(page);

  await reverifyPage.selectCoreServer();
  await reverifyPage.searchMenu(HSIM_MENU);
  await page.waitForTimeout(3000);

  logStep('Step 17: Select Verify, enter the same SI number and click Go');
  await reverifyPage.selectFunction('Verify');
  await reverifyPage.setSiText(['siSrlNo', 'srlNo', 'siSerialNo', 'serialNo', 'siSrlNum'], generatedSiNumber!, 'SI serial number');
  await reverifyPage.clickGo();
  await page.waitForTimeout(3000);

  logStep('Step 18: Navigate all re-verification screens and submit');
  await reverifyPage.visitTab('Header');
  await captureEvidence(page, 'Step 18: Re-verify Header tab', { callId: CALL_ID, serialId: SERIAL_ID, siNumber: generatedSiNumber });
  await reverifyPage.visitTab('Instruction Details');
  await captureEvidence(page, 'Step 18: Re-verify Instruction Details tab', { callId: CALL_ID, serialId: SERIAL_ID, siNumber: generatedSiNumber });
  await reverifyPage.visitTab('Header');
  await reverifyPage.submitForm();
  await reverifyPage.acceptWarningPopup();
  await page.waitForTimeout(5000);
  await reverifyPage.logScreenMessages();

  const reverifyStatus = await reverifyPage.getStatusMessage();
  const reverifyBody = await getFinwBodyText(page);
  logStep('Re-verification status', { status: reverifyStatus });
  expect(reverifyBody.toLowerCase(), 'Re-verification must not show Nothing to Verify').not.toContain('nothing to verify');
  expect(reverifyStatus?.toLowerCase() ?? '', 'Re-verification must report success').toMatch(/verified|success/);
  await reverifyPage.clickAccept();
  await captureEvidence(page, 'Step 18: Modified SI re-verified', { callId: CALL_ID, serialId: SERIAL_ID, siNumber: generatedSiNumber, status: reverifyStatus });

  logStep('Verifier re-verification complete - logging out');
  await verifierHome2.logout();

  logStep('Test completed successfully', { siNumber: generatedSiNumber });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
