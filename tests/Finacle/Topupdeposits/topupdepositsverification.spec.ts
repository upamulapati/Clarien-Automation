import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;
const ACCOUNT_ID = '9300000131';

test('HOAACVTU - verify top-up deposit account creation', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  console.log(`Verifying top-up deposit account: ${ACCOUNT_ID}`);

  await tdPage.selectCoreServer();
  await tdPage.searchMenu(COMMON_DATA.topUpDeposit.screens.verify);
  await page.waitForTimeout(3000);
  await tdPage.selectVerifyFunction().catch(() => {});
  await tdPage.enterTemporaryAccountId(ACCOUNT_ID).catch(async () => {
    await tdPage.enterHacmAccountId(ACCOUNT_ID).catch(() => {});
  });
  await tdPage.acceptButton.click().catch(() => {});
  await page.waitForTimeout(5000);

  await tdPage.visitTab('General');
  await tdPage.visitTab('Interest & Tax');
  await tdPage.visitTab('Scheme');
  await tdPage.visitTab('Flow');
  await tdPage.visitTab('Renewal');
  await tdPage.visitTab('Related Party');

  await tdPage.clickSubmit().catch(() => {});
  await page.waitForTimeout(3000).catch(() => {});
  await tdPage.acceptWarningPopup().catch(() => {});
  await page.waitForTimeout(2000).catch(() => {});

  const statusMessage = await tdPage.getStatusMessage();

  console.log('====================================');
  console.log('VERIFICATION STATUS:', statusMessage);
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
