import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { CollateralLodgePage } from '../../pages/CoreBanking/CollateralLodgePage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import { COLLATERAL_LODGEMENT_DATA } from '../../config/excelTestData';
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

  const results: any[] = [];

  // Derive the page method from the collateral type so adding new types in
  // the workbook does not require a hard-coded map.
  function getLodgeMethod(type: string): string | undefined {
    const pascal = String(type)
      .split(/[\s-]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
    const method = `lodge${pascal}Collateral`;
    return typeof (collateralPage as any)[method] === 'function' ? method : undefined;
  }

  const scenarios = COLLATERAL_LODGEMENT_DATA.collateralLodgementTestData.filter(
    (r) => r.flowName === 'collaterallodgement' && String(r.enabled).toUpperCase() !== 'N'
  );

  for (const scenario of scenarios) {
    const type = scenario.data?.collateralType || scenario.name;
    const method = getLodgeMethod(type);
    if (!method) {
      console.log(`No lodge method for collateral type '${type}' — skipping`);
      continue;
    }
    collateralPage.setScenarioData(scenario.data ?? {});
    console.log(`\n>>> Invoking HCLM: ${method} (scenario: ${scenario.name ?? 'defaults'})`);
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

  // Strict success message assertion for every processed collateral row.
  for (const r of results) {
    expect(r.statusMessage, `Expected a success message for ${r.type}`).toMatch(/(record lodged|successfully)/i);
  }

  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
