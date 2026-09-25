import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';

const ACCOUNT_ID = '7500001472';
const TRANSFER_ACCOUNT_ID = '100BMD1003000';

test('SP - savings account closure and verification', async ({ page }) => {
  test.setTimeout(900000);

  const spPage = new ServicePackPage(page);
  const result = await spPage.servicePackSavingsAccountClosure(ACCOUNT_ID, TRANSFER_ACCOUNT_ID);

  console.log('Savings account closure and verification result:', result);

  // Hard assertions: the service-pack method already throws on any error,
  // but these ensure the returned status strings are clearly successful.
  expect(result.closureStatus).toMatch(/closed\s*successfully/i);
  expect(result.verificationStatus).toMatch(/(?:closed|verified)\s*successfully/i);
});
