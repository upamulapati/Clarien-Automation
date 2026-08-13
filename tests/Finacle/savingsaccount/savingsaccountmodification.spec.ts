import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';
import COMMON_DATA from '../../../data/common-data.json';

for (const acct of COMMON_DATA.servicePackValidation) {
  test.describe(`Service Pack Validation - ${acct.type}`, () => {
    test.beforeEach(async () => {
      test.setTimeout(300000);
    });

    test(acct.testLabel, async ({ page }) => {
      const spPage = new ServicePackPage(page);
      const result = await spPage.servicePackPaymentSystemStatementsValidation(acct);
      if (result.handled) {
        console.log('Email type requirement handled for dispatch mode:', acct.dispatchMode);
        return;
      }
      if (result.submitted) {
        expect(result.accountNumber).toBeTruthy();
        return;
      }
      expect(result.calendarPresent).toBe(true);
      expect(result.accountNumber).toBeTruthy();
      console.log('Service Pack validation passed. Account number:', result.accountNumber);
    });
  });
}
