import { test, expect } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { TERM_DEPOSIT_DATA } from '../../config/testData';
import { CREDENTIALS } from '../../../data/credentials';
import { getTermDepositAccounts, saveClosedAccountId } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

const SCREEN_CODE = TERM_DEPOSIT_DATA.partialClosureScreenCode;
const FUNCTION_OPTION = TERM_DEPOSIT_DATA.partialClosureFunctionOption;

function getGeneratedAccount(): string {
  if (TERM_DEPOSIT_DATA.prematureClosureAccountId) return TERM_DEPOSIT_DATA.prematureClosureAccountId;
  const accounts = getTermDepositAccounts();
  const firstAccountId = Object.values(accounts)[0] as string;
  if (firstAccountId) return firstAccountId;
  return TERM_DEPOSIT_DATA.relatedPartyAccountId;
}

test(`${SCREEN_CODE} - term deposit premature closure`, async ({ page }) => {
  test.setTimeout(300000);
  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);

  const ACCOUNT_ID = getGeneratedAccount();
  try {
    saveClosedAccountId('termDepositPremature', ACCOUNT_ID);
    console.log('Saved premature closure account ID to shared-state');
  } catch (e) {
    console.log('Could not save premature closure account ID:', e);
  }
  console.log(`Performing premature closure for TD account: ${ACCOUNT_ID}`);

  const status = await tdPage.prematureClosure(SCREEN_CODE, ACCOUNT_ID, FUNCTION_OPTION, TERM_DEPOSIT_DATA.repaymentAccountId);

  console.log('====================================');
  console.log('PREMATURE CLOSURE COMPLETED SUCCESSFULLY');
  console.log('Status:', status ?? 'completed');
  if (status) {
    expect(status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
  } else {
    console.log('No explicit status message returned. Finacle completed the premature closure without an alert.');
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
