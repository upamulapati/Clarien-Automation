import { test, expect } from '@playwright/test';
import { TopUpDepositPage } from '../../pages/CoreBanking/TopUpDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const ACCOUNT_ID = '9200000593';

test('HTDREN - top-up deposit renewal', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const topUpPage = new TopUpDepositPage(page);
  console.log(`Performing renewal for top-up deposit account: ${ACCOUNT_ID}`);
  const statusMessage = await topUpPage.renewTopUpDeposit('HTDREN', ACCOUNT_ID);
  console.log('====================================');
  console.log('TOP-UP DEPOSIT RENEWAL COMPLETED');
  console.log(`Account: ${ACCOUNT_ID}`);
  console.log(`Status: ${statusMessage ?? 'No status captured'}`);
  if (!statusMessage) {
    throw new Error('No status message captured for top-up deposit renewal');
  }
  expect(statusMessage).toMatch(/successfully/i);
  console.log('====================================');
  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});
