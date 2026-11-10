import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TERM_DEPOSIT_DATA, TERM_DEPOSIT_INSTANCES } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const INSTANCES = TERM_DEPOSIT_INSTANCES.filter(
  (i: any) => String(i.enabled ?? 'Y').toUpperCase() !== 'N'
);
const TEST_LABEL =
  TERM_DEPOSIT_DATA.testLabel ?? 'HOAACTD - create term deposit accounts for all instances';

test(TEST_LABEL, async ({ page }) => {
  test.setTimeout(INSTANCES.length * 300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);
  const generatedAccounts = await tdPage.createTermDepositsForAllInstances(INSTANCES);
  console.log('====================================');
  console.log('Generated term deposit accounts:', generatedAccounts);
  console.log('====================================');
  expect(generatedAccounts).toBeTruthy();
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
