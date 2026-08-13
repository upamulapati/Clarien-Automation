import { test } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { getTermDepositAccounts } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

function loadAccounts(): Record<string, string> {
  const accounts = getTermDepositAccounts();
  const entries = Object.entries(accounts);
  if (entries.length > 0) return accounts;
  const fallback = COMMON_DATA.termDeposit.verificationAccountId;
  return fallback ? { FALLBACK: fallback } : {};
}

test(`${COMMON_DATA.termDeposit.screens.verify} - verify term deposit accounts`, async ({ page }) => {
  const accounts = loadAccounts();
  const entries = Object.entries(accounts);
  if (entries.length === 0) {
    console.log('No term deposit accounts to verify — run termdepositscreation.spec.ts first');
    return;
  }

  test.setTimeout(entries.length * 300000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  console.log(`Verifying ${entries.length} term deposit account(s):`, entries.map(([s, id]) => `${s}=${id}`).join(', '));

  console.log('Selecting Core Server...');
  await tdPage.selectCoreServer();
  await page.waitForTimeout(5000);

  for (const [scheme, accountId] of entries) {
    console.log(`\n===== Verifying ${scheme}: ${accountId} =====`);

    console.log(`Searching for ${COMMON_DATA.termDeposit.screens.verify}...`);
    await tdPage.searchMenu(COMMON_DATA.termDeposit.screens.verify);
    await page.waitForTimeout(3000);

    console.log('Selecting Verify function...');
    await tdPage.selectVerifyFunction().catch(() => {});

    console.log(`Entering A/c ID: ${accountId}`);
    await tdPage.enterTemporaryAccountId(accountId).catch(async () => {
      await tdPage.enterHacmAccountId(accountId).catch(() => {});
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
    console.log(`VERIFICATION STATUS (${scheme} / ${accountId}):`, statusMessage);
    console.log('====================================');

    if (page.isClosed()) break;
  }

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});
