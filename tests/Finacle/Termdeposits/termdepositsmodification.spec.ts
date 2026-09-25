import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const MOD_ACCOUNT_NUMBER = process.env.TD_MOD_ACCOUNT || COMMON_DATA.termDeposit.modificationAccountId || '9200000614';
const NEW_DEPOSIT_PERIOD_MONTHS = '24';
const NEW_DEPOSIT_PERIOD_DAYS = '0';

test('HOAAMTD - modify term deposit account', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const status = await tdPage.modifyTermDeposit(
    COMMON_DATA.termDeposit.screens.modify,
    MOD_ACCOUNT_NUMBER,
    NEW_DEPOSIT_PERIOD_MONTHS,
    NEW_DEPOSIT_PERIOD_DAYS
  );

  console.log('====================================');
  console.log('MODIFICATION STATUS:', status ?? 'Success screen appeared');
  expect(status).toBeTruthy();
  expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log('====================================');

  console.log('Logging out...');
  await homePage.logout();
});



