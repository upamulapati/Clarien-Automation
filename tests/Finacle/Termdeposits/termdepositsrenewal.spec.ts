import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const ACCOUNT_ID = '9200000604';
const SCREEN_CODE = 'HTDREN';

test(`${SCREEN_CODE} - term deposit renewal`, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  console.log(`Performing renewal for term deposit account: ${ACCOUNT_ID}`);
  const statusMessage = await tdPage.renewTermDeposit(SCREEN_CODE, ACCOUNT_ID);

  console.log('====================================');
  console.log('TERM DEPOSIT RENEWAL COMPLETED');
  console.log(`Account: ${ACCOUNT_ID}`);
  console.log(`Status: ${statusMessage ?? 'No status captured'}`);

  expect(statusMessage, 'No status message captured for term deposit renewal').toBeTruthy();
  expect(
    statusMessage,
    `Term deposit renewal did not report success. Full message: ${statusMessage}`
  ).toMatch(/successfully/i);

  console.log('====================================');

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});
