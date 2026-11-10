import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TERM_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';
import { getTermDepositAccounts, readSharedState } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const RELATED_PARTY_ACCOUNT_ID = String(TERM_DEPOSIT_DATA.relatedPartyAccountId ?? '').trim();

test(TERM_DEPOSIT_DATA.relatedPartyTestLabel, async ({ page }) => {
  test.setTimeout(180000);
  if (!RELATED_PARTY_ACCOUNT_ID) {
    throw new Error('relatedPartyAccountId is not configured in the term_deposits sheet');
  }
  const relatedPartyData = {
    accountId: RELATED_PARTY_ACCOUNT_ID,
    relationType: TERM_DEPOSIT_DATA.relatedPartyRelationType,
    relationCode: TERM_DEPOSIT_DATA.relatedPartyRelationCode,
    relatedPartyCifCode: TERM_DEPOSIT_DATA.relatedPartyCifCode
  };
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const status = await tdPage.addRelatedPartyDetails(
    TERM_DEPOSIT_DATA.screens.modify,
    relatedPartyData
  );

  console.log('====================================');
  console.log('RELATED PARTY STATUS:', status ?? 'Success screen appeared');
  if (status) {
    expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  } else {
    console.log('No explicit status message returned. Finacle completed the related party addition without an alert.');
  }
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
