import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import COMMON_DATA from '../../../data/common-data.json';

// Account freeze/cancel (HAFSM) and SI inquiry (HSIM) are performed by the maker.
const MAKER = CREDENTIALS.credentials;

// Account that has a linked Standing Instruction. Update this in common-data.json
// (siFreezeCancel.accountId) or via the SI_TEST_ACCOUNT_ID environment variable.
const ACCOUNT_ID = process.env.SI_TEST_ACCOUNT_ID
  || (COMMON_DATA as any).siFreezeCancel?.accountId
  || '7710003367';

const FREEZE_CODE = 'Total Freeze';
const FREEZE_REASON_CODE = '31015';

test.describe('HSIM - SI not suspended when account freeze is cancelled before verification', () => {
  test('SI remains unsuspended after a pending freeze is cancelled', async ({ page }) => {
    test.setTimeout(300000);

    const { homePage } = await loginToFinacle(page, MAKER.username, MAKER.password);
    const accountPage = new AccountPage(page);

    await accountPage.selectCoreServer();

    // Step 1: Mark a total freeze on the account linked to the SI.
    console.log(`Marking freeze on Account ID: ${ACCOUNT_ID}`);
    await accountPage.searchMenu('HAFSM');
    await page.waitForTimeout(3000);
    await accountPage.selectFunction('Freeze');
    await accountPage.enterHacmAccountId(ACCOUNT_ID);
    await accountPage.selectFreezeCode(FREEZE_CODE);
    await accountPage.selectFreezeReasonCode(FREEZE_REASON_CODE);
    await accountPage.clickGo();
    await accountPage.selectAccountRowCheckbox();
    await accountPage.submitForm();
    await accountPage.clickOkButton();

    // Step 2: Cancel the unverified freeze before it is authorized.
    // The Finacle function may be called 'Cancel', 'Delete' or 'Reject' - adjust
    // the selectFunction value if the test fails at this step.
    console.log(`Cancelling pending freeze on Account ID: ${ACCOUNT_ID}`);
    await accountPage.searchMenu('HAFSM');
    await page.waitForTimeout(3000);
    await accountPage.selectFunction('Cancel');
    await accountPage.enterHacmAccountId(ACCOUNT_ID);
    await accountPage.clickGo();
    await accountPage.selectAccountRowCheckbox();
    await accountPage.submitForm();
    await accountPage.clickOkButton();

    // Step 3: Open HSTM and check the linked SI is not suspended.
    console.log('Inquiring Standing Instruction in HSTM...');
    await accountPage.searchMenu('HSTM');
    await page.waitForTimeout(3000);
    await accountPage.selectFunction('Inquire');
    await accountPage.enterHacmAccountId(ACCOUNT_ID);
    await accountPage.clickGo();

    const suspendedTill = await accountPage.getHsimSuspendedTillValue();
    const statusMessage = await accountPage.getStatusMessage();

    console.log(`HSIM Suspended Till value: ${suspendedTill ?? '<not set>'}`);
    console.log(`HSIM status message: ${statusMessage ?? '<none>'}`);

    // Defect TOL000000678784: a cancelled pre-verification freeze must not
    // trigger SI suspension, so the Suspended Till / Suspension End Date must
    // not be populated with 31-12-2099 (or any 2099 date).
    if (suspendedTill) {
      expect(suspendedTill).not.toMatch(/31[\/-]12[\/-]2099/);
    }

    if (statusMessage) {
      expect(statusMessage).not.toMatch(/suspended/i);
    }

    await homePage.logout();
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
