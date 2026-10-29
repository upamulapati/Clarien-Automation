import { test, expect } from '@playwright/test';
import { TopUpDepositPage } from '../../pages/CoreBanking/TopUpDepositPage';
import { ServicePackPage } from '../../pages/servicepackpage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { saveTopUpDepositAccounts } from '../../helpers/sharedState';
import { TOP_UP_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const SCHEME_CODES: string[] = TOP_UP_DEPOSIT_DATA.schemeCodes as string[];

test('HOAACTU - create top-up deposit accounts for all scheme codes', async ({ page }) => {
  test.setTimeout(900000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const topUpPage = new TopUpDepositPage(page);
  const generatedAccounts = await topUpPage.createTopUpDepositsForAllSchemes(
    SCHEME_CODES,
    TOP_UP_DEPOSIT_DATA
  );
  console.log('====================================');
  console.log('Generated top-up deposit accounts:', generatedAccounts);
  saveTopUpDepositAccounts(generatedAccounts);
  expect(generatedAccounts).toBeTruthy();
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
