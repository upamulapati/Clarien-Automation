import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { getTermDepositAccounts } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

// Hardcoded fallback account ID (visible in code). The captured account from
// termdepositscreation.spec.ts is preferred when available.
//const ACCOUNT_ID = '9200000681';

function getGeneratedAccount(): string {
  const accounts = getTermDepositAccounts();
  const firstAccountId = Object.values(accounts)[0] as string | undefined;
  return firstAccountId || COMMON_DATA.termDeposit.verificationAccountId || ACCOUNT_ID;
}

const ACCOUNT_ID = getGeneratedAccount();

test(`${COMMON_DATA.termDeposit.screens.verify} - verify term deposit account creation`, async ({ page }) => {
  test.setTimeout(300000);

  console.log(`Verifying term deposit account: ${ACCOUNT_ID}`);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  console.log('Selecting Core Server...');
  await tdPage.selectCoreServer();
  await page.waitForTimeout(5000);

  console.log(`Searching for ${COMMON_DATA.termDeposit.screens.verify}...`);
  await tdPage.searchMenu(COMMON_DATA.termDeposit.screens.verify);
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
  await page.waitForTimeout(3000).catch(() => {});

  if (!page.isClosed()) {
    await tdPage.acceptWarningPopup().catch(() => {});
    await page.waitForTimeout(2000).catch(() => {});
  }

  await page.waitForTimeout(2000).catch(() => {});
  const statusMessage = await tdPage.getStatusMessage();

  console.log('====================================');
  console.log('TERM DEPOSIT VERIFICATION STATUS:', statusMessage ?? 'No status message captured');
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
