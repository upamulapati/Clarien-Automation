import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TOP_UP_DEPOSIT_DATA } from '../../config/testData';
import { getTopUpDepositAccounts, readSharedState } from '../../helpers/sharedState';
import { CREDENTIALS } from '../../../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

function getCreatedAccount(): string {
  const accounts = getTopUpDepositAccounts();
  const firstAccountId = Object.values(accounts)[0] as string | undefined;
  const state = readSharedState();
  return firstAccountId || state.accountId || TOP_UP_DEPOSIT_DATA.relatedPartyAccountId || '9200000632';
}

test(TOP_UP_DEPOSIT_DATA.relatedPartyTestLabel as string, async ({ page }) => {
  test.setTimeout(180000);
  const accountId = getCreatedAccount();
  const data = {
    accountId,
    relationType: TOP_UP_DEPOSIT_DATA.relatedPartyRelationType,
    relationCode: TOP_UP_DEPOSIT_DATA.relatedPartyRelationCode,
    relatedPartyCifCode: TOP_UP_DEPOSIT_DATA.relatedPartyCifCode
  };
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);
  const statusMessage = await tdPage.addRelatedPartyDetails(TOP_UP_DEPOSIT_DATA.screens.modify, data);
  console.log('====================================');
  console.log('RELATED PARTY STATUS:', statusMessage);
  expect(statusMessage).toBeTruthy();
  expect(statusMessage).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
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
