import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';
import COMMON_DATA from '../../../data/common-data.json';
import { getSharedValue } from '../../helpers/sharedState';

for (const acct of COMMON_DATA.servicePackValidation) {
  test.describe(`Service Pack Verification - ${acct.type}`, () => {
    test.beforeEach(async () => {
      test.setTimeout(300000);
    });

    test(acct.testLabel, async ({ page }) => {
      const spPage = new ServicePackPage(page);
      const verifyAccountId = getSharedValue('accountId') ?? acct.accountId ?? '7500001511';
      const result = await spPage.servicePackSavingsAccountVerification({ ...acct, accountId: verifyAccountId });
      expect(result.statusMessage).toMatch(/verified|successful/i);
      expect(result.accountNumber).toBeTruthy();
      console.log('Service Pack Verification passed. Account number:', result.accountNumber);
  expect(result.accountNumber).toBeTruthy();
    });
  });
}
