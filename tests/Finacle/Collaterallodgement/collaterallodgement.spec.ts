import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { CollateralLodgePage } from '../../pages/CoreBanking/CollateralLodgePage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import { readFirstTermDepositAccount, resetCollateralIds, recordCollateralId } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

let homePage: HomePage;
let collateralPage: CollateralLodgePage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(300000);
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  collateralPage = new CollateralLodgePage(page);
});

test('HCLM - lodge all collateral types sequentially and capture all IDs', async ({ page }) => {
  test.setTimeout(1200000);
  resetCollateralIds();

  const lodgeMethods = [
    'lodgeMutualFundCollateral',
    'lodgeVehicleCollateral',
    'lodgeGuaranteeCollateral',
    'lodgeDepositsCollateral',
    'lodgeImmovablePropertyCollateral',
    'lodgeOthersCollateral',
    'lodgeLifeInsuranceCollateral',
    'lodgeTransactionalAccountsCollateral',
    'lodgeInventoryCollateral',
   
  ] as const;

  const results: any[] = [];

  for (const method of lodgeMethods) {
    console.log(`\n>>> Invoking HCLM: ${method}`);
    const result = await (collateralPage as any)[method]();
    results.push(result);

    if (result.collateralId) {
      console.log(`=== ${result.type} ID: ${result.collateralId} ===`);
      console.log(`Status message: ${result.statusMessage}`);
      recordCollateralId(result.collateralId, result.type);
    } else {
      console.error(`!!! ${result.type} failed: ${result.error}`);
    }
  }

  const records = results.map((r) => ({ type: r.type, collateralId: r.collateralId || null }));

  // Always log the full set of captured IDs at the end, regardless of pass/fail.
  console.log('Captured collateral IDs:', JSON.stringify(records, null, 2));

  // Hard assertion: a type fails only if it threw an error or produced no collateral ID.
  const failures = results.filter((r) => r.error || !r.collateralId);

  const failureDetails = failures.map((f) => ({
    type: f.type,
    collateralId: f.collateralId || null,
    status: f.statusMessage,
    error: f.error || f.statusMessage || 'No success or error message captured',
  }));
  expect(
    failureDetails,
    `One or more collateral lodgements failed: ${JSON.stringify(failureDetails)}`
  ).toEqual([]);

  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
