import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';
import { TERM_DEPOSIT_DATA } from '../../config/testData';

const SCREEN_CODE = TERM_DEPOSIT_DATA.partialClosureScreenCode;
const FUNCTION_OPTION = TERM_DEPOSIT_DATA.partialClosureFunctionOption;
const ACCOUNT_ID = TERM_DEPOSIT_DATA.creditFrozenClosureAccountId;

test(`${SCREEN_CODE} - term deposit credit frozen closure`, async ({ page }) => {
  test.setTimeout(300000);
  const spPage = new ServicePackPage(page);
  const result = await spPage.servicePackCreditFrozenClosure(SCREEN_CODE, ACCOUNT_ID, FUNCTION_OPTION, TERM_DEPOSIT_DATA.repaymentAccountId);
  expect(result.status).toBeTruthy();
  console.log('Credit frozen closure status:', result.status);
  expect(result.status).toBeTruthy();
  expect(result.status).toMatch(/(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i);
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
