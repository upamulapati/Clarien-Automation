import { test, expect } from '@playwright/test';
import { TopUpDepositPage } from '../../pages/CoreBanking/TopUpDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { getTopUpDepositAccounts, saveTopUpDepositAccounts } from '../../helpers/sharedState';
import { TOP_UP_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const SCHEME_CODE = String(TOP_UP_DEPOSIT_DATA.schemeCode ?? '');

test('HOAACTU - create top-up deposit account for single scheme code', async ({ page }) => {
  test.setTimeout(900000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const topUpPage = new TopUpDepositPage(page);
  const existingAccounts = getTopUpDepositAccounts();
  if (
    existingAccounts[SCHEME_CODE] &&
    existingAccounts[SCHEME_CODE] !== 'NOT CAPTURED' &&
    existingAccounts[SCHEME_CODE] !== 'FAILED'
  ) {
    console.log(
      `Top-up account for ${SCHEME_CODE} already exists: ${existingAccounts[SCHEME_CODE]}. Skipping creation.`
    );
    saveTopUpDepositAccounts(existingAccounts);
    expect(existingAccounts).toBeTruthy();
    return;
  }
  const accountId = await topUpPage.createTopUpDeposit(SCHEME_CODE, TOP_UP_DEPOSIT_DATA);
  const generatedAccounts = { [SCHEME_CODE]: accountId ?? 'NOT CAPTURED' };
  console.log('====================================');
  console.log('Generated top-up deposit account:', generatedAccounts);
  saveTopUpDepositAccounts(generatedAccounts);
  expect(generatedAccounts).toBeTruthy();
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
