import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';
import COMMON_DATA from '../../../data/common-data.json';

const { creditFrozenClosure: { accountId: ACCOUNT_ID }, partialClosure: { screenCode: SCREEN_CODE, functionOption: FUNCTION_OPTION } } = COMMON_DATA.termDeposit;

test(`${SCREEN_CODE} - term deposit credit frozen closure`, async ({ page }) => {
  test.setTimeout(300000);
  const spPage = new ServicePackPage(page);
  const result = await spPage.servicePackCreditFrozenClosure(SCREEN_CODE, ACCOUNT_ID, FUNCTION_OPTION, '7710003367');
  expect(result.status).toBeTruthy();
  console.log('Credit frozen closure status:', result.status);
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
