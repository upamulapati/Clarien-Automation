import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TOP_UP_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';
import {
  getClosedAccountId,
  getTopUpDepositAccounts,
} from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.secondCredentials.username;
const PASSWORD = CREDENTIALS.secondCredentials.password;

function getClosedAccount(): string {
  const closed = getClosedAccountId('topUpDeposit');
  if (closed) return closed;

  if (TOP_UP_DEPOSIT_DATA.prematureClosureAccountId) return TOP_UP_DEPOSIT_DATA.prematureClosureAccountId as string;

  const accounts = getTopUpDepositAccounts();
  const firstValid = Object.values(accounts).find((v) => v && v.length > 0) as string | undefined;
  if (firstValid) return firstValid;

  return TOP_UP_DEPOSIT_DATA.relatedPartyAccountId as string;
}

test('HCAACVTU - top-up deposit premature closure verification', async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);
  const accountId = getClosedAccount();
  console.log(`Verifying premature closure for TU account: ${accountId}`);
  const statusMessage = await tdPage.verifyClosure(TOP_UP_DEPOSIT_DATA.screens.prematureClosureVerify, accountId);
  console.log('====================================');
  console.log('TU PREMATURE CLOSURE VERIFICATION STATUS:', statusMessage ?? 'Closure authorization completed');
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  console.log(`Account: ${accountId}`);
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
