import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TOP_UP_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;
const ACCOUNT_ID = String(TOP_UP_DEPOSIT_DATA.verificationAccountId ?? '');
console.log(`Verifying top-up deposit account: ${ACCOUNT_ID}`);

if (!ACCOUNT_ID) {
  throw new Error('verificationAccountId is not configured in the topup_deposits sheet');
}

test(`${TOP_UP_DEPOSIT_DATA.screens.verify} - verify top-up deposit account creation`, async ({ page }) => {
  test.setTimeout(300000);

  console.log(`Verifying top-up deposit account: ${ACCOUNT_ID}`);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  console.log('Selecting Core Server...');
  await tdPage.selectCoreServer();
  await page.waitForTimeout(5000);

  console.log(`Searching for ${TOP_UP_DEPOSIT_DATA.screens.verify}...`);
  await tdPage.searchMenu(TOP_UP_DEPOSIT_DATA.screens.verify);
  await page.waitForTimeout(3000);

  console.log('Selecting Verify function...');
  await tdPage.selectVerifyFunction().catch(() => {});

  console.log(`Entering A/c ID: ${ACCOUNT_ID}`);
  await tdPage.enterTemporaryAccountId(ACCOUNT_ID).catch(async () => {
    await tdPage.enterHacmAccountId(ACCOUNT_ID).catch(() => {});
  });

  console.log('Clicking Go...');
  await tdPage.acceptButton.click().catch(() => {});
  await page.waitForTimeout(5000);

  await tdPage.visitTab('General');
  await tdPage.visitTab('Interest & Tax');
  await tdPage.visitTab('Scheme');
  await tdPage.visitTab('Flow');
  await tdPage.visitTab('Renewal');
  await tdPage.visitTab('Related Party');

  console.log('Clicking Submit...');
  await tdPage.clickSubmit().catch(() => {});
  await page.waitForTimeout(4000).catch(() => {});

  if (!page.isClosed()) {
    await tdPage.acceptWarningPopup().catch(() => {});
    await page.waitForTimeout(3000).catch(() => {});
  }

  let statusMessage = await tdPage.getStatusMessage();
  console.log('Post-accept status message:', statusMessage);

  if (!statusMessage || /error\s*details/i.test(statusMessage)) {
    for (const frame of page.frames()) {
      const body = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      const match = body.match(/[^.!?\n]{0,120}(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)[^.!?\n]{0,120}[.!?\n]?/i);
      if (match) {
        statusMessage = match[0].trim();
        console.log('Fallback status from body:', statusMessage);
        break;
      }
    }
  }

  console.log('====================================');
  console.log('TOP-UP DEPOSIT VERIFICATION STATUS:', statusMessage ?? 'No status message captured');
  expect(statusMessage, `Expected a successful verification message, but got: ${statusMessage}`).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('====================================');

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
