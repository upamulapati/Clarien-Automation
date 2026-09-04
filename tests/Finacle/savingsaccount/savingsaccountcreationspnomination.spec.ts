import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';
import COMMON_DATA from '../../../data/common-data.json';

test(COMMON_DATA.servicePackNominationValidation.testLabel, async ({ page }) => {
  test.setTimeout(120000);
  const spPage = new ServicePackPage(page);
  const result = await spPage.servicePackNominationValidation();
  expect(result.accountNumber).toBeTruthy();
  console.log('Service Pack Nomination Validation - Account created:', result.accountNumber);
});
