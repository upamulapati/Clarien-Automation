import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;
const ACCOUNT_ID = '9200000670';
const SCREEN_CODE = 'HTDREN';

test(`${SCREEN_CODE} - term deposit renewal verification`, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  console.log(`Verifying renewal for term deposit account: ${ACCOUNT_ID}`);
  const statusMessage = await tdPage.verifyTermDepositRenewal(SCREEN_CODE, ACCOUNT_ID);

  console.log('====================================');
  console.log('TERM DEPOSIT RENEWAL VERIFICATION COMPLETED');
  console.log(`Account: ${ACCOUNT_ID}`);
  console.log(`Status: ${statusMessage ?? 'No status captured'}`);

  expect(
    statusMessage,
    'No status message captured for term deposit renewal verification'
  ).toBeTruthy();
  expect(
    statusMessage,
    `Term deposit renewal verification did not report success. Full message: ${statusMessage}`
  ).toMatch(/successfully|verified|authorized|completed/i);

  console.log('====================================');

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});
