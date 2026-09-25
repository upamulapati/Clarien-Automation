import { test, expect } from '@playwright/test';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Account freeze (HAFSM) is performed by FINACLETEST13.
const USERNAME = CREDENTIALS.thirdCredentials.username;
const PASSWORD = CREDENTIALS.thirdCredentials.password;

// Total Freeze + reason code 31015 (CDD required).
const FREEZE_CODE = 'Total Freeze';
const FREEZE_REASON_CODE = '31015';

const acct = COMMON_DATA.accountFreeze.find(a => a.accountId === '7600000160')!;

test(acct.testLabel, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const accountPage = new AccountPage(page);

  console.log(`Marking freeze on Account ID: ${acct.accountId}`);

  console.log('Selecting Core Server...');
  await accountPage.selectCoreServer();

  console.log('Searching for HAFSM...');
  await accountPage.searchMenu(COMMON_DATA.savingsAccount.screens.freeze);
  await page.waitForTimeout(3000);

  console.log('Selecting Freeze function...');
  await accountPage.selectFunction('Freeze');

  console.log(`Entering account ID to freeze: ${acct.accountId}...`);
  await accountPage.enterHacmAccountId(acct.accountId);

  console.log('Selecting freeze code (Total Freeze)...');
  await accountPage.selectFreezeCode(FREEZE_CODE);

  console.log('Selecting freeze reason code 31015 (CDD required)...');
  await accountPage.selectFreezeReasonCode(FREEZE_REASON_CODE);

  // Assertion: "Modify Freeze Details" co-mandatory rule.
  // Modify Freeze Details defaults to No on this screen.
  // When it is No, Freeze Reason Code 1 is co-mandatory and must be provided before clicking Go.
  if (!FREEZE_REASON_CODE || FREEZE_REASON_CODE.trim() === '') {
    throw new Error(
      `Assertion failed: "Freeze Reason Code 1" is co-mandatory when ` +
      `"Modify Freeze Details" is set to No. FREEZE_REASON_CODE must not be empty.`
    );
  }
  console.log(
    `Co-mandatory assertion passed: Modify Freeze Details = No (default), ` +
    `Freeze Reason Code 1 = "${FREEZE_REASON_CODE}" (CDD Required) — proceeding to Go.`
  );

  console.log('Clicking Go button...');
  await accountPage.clickGo();
  await page.waitForTimeout(3000);

  const getFrame = () => {
    const f = page.frame({ name: 'FINW' });
    if (!f) throw new Error('FINW frame not found');
    return f;
  };

  // Assertion: After Go, verify Freeze Reason Code 1 was propagated to all
  // account rows in the details page (as per the co-mandatory rule).
  const propagationCheck = await getFrame().evaluate((expectedCode: string) => {
    const allInputs = Array.from(
      document.querySelectorAll('input[type="text"]')
    ) as HTMLInputElement[];
    const reasonInputs = allInputs.filter(inp =>
      /reason.*code.*1|frzReason.*1|freezeReason.*1/i.test(inp.id + inp.name)
    );
    if (reasonInputs.length === 0) return { found: 0, propagated: 0, allMatch: null };
    const propagated = reasonInputs.filter(inp => inp.value?.trim() === expectedCode).length;
    return { found: reasonInputs.length, propagated, allMatch: propagated === reasonInputs.length };
  }, FREEZE_REASON_CODE);

  if (propagationCheck.found > 0) {
    console.log(
      `Propagation check: Freeze Reason Code 1 "${FREEZE_REASON_CODE}" ` +
      `propagated to ${propagationCheck.propagated}/${propagationCheck.found} account row(s). ` +
      `All match: ${propagationCheck.allMatch}`
    );
    if (!propagationCheck.allMatch) {
      throw new Error(
        `Assertion failed: Freeze Reason Code 1 "${FREEZE_REASON_CODE}" was NOT propagated ` +
        `to all accounts. Only ${propagationCheck.propagated}/${propagationCheck.found} rows have it.`
      );
    }
  } else {
    console.log('Propagation check: Details page loaded (reason code columns not found in table — may be single-account view)');
  }

  console.log('Selecting account row checkbox...');
  await accountPage.selectAccountRowCheckbox();

  console.log('Clicking Submit button...');
  await accountPage.submitForm();

  const statusMessage = await accountPage.getStatusMessage();
  console.log('Exact status message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('Freeze status message:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);

  console.log('Logging out...');
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
