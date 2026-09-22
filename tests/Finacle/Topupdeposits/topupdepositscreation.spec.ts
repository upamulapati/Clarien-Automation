import { test, expect } from '@playwright/test';
import { TopUpDepositPage } from '../../pages/CoreBanking/TopUpDepositPage';
import { ServicePackPage } from '../../pages/servicepackpage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const SCHEME_CODES: string[] = COMMON_DATA.topUpDeposit.schemeCodes;

test('HOAACTU - create top-up deposit accounts for all scheme codes', async ({ page }) => {
  test.setTimeout(900000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const topUpPage = new TopUpDepositPage(page);
  const generatedAccounts = await topUpPage.createTopUpDepositsForAllSchemes(
    SCHEME_CODES,
    COMMON_DATA.topUpDeposit
  );
  console.log('====================================');
  console.log('Generated top-up deposit accounts:', generatedAccounts);
  console.log('====================================');
  if (!page.isClosed()) {
    console.log('Running HOAACTU service pack flow-end-date validation...');
    const spPage = new ServicePackPage(page);
    await spPage.servicePackHoaaCTUFlowEndDateValidation();
  }
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
