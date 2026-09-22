import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';

test.describe('Service Pack - Government Guarantee Collateral', () => {
  test('HCLM - lodge government guarantee collateral', async ({ page }) => {
    test.setTimeout(300000);
    const spPage = new ServicePackPage(page);
    const result = await spPage.servicePackLodgeGovernmentGuaranteeCollateral();
    expect(result.collateralId).toBeTruthy();
    expect(result.guarantorFilled).toBe(true);
    expect(result.collateralValueFilled).toBe(true);
    console.log('Generated guarantee collateral ID:', result.collateralId);
  });

  test('HCLM - verify government guarantee and confirm address details', async ({ page }) => {
    test.setTimeout(300000);
    const spPage = new ServicePackPage(page);
    const result = await spPage.servicePackVerifyGovernmentGuaranteeCollateral();
    expect(result.statusMessage).toMatch(/verified successfully/i);
    expect(result.addressDetailsVisible).toBeTruthy();
    console.log('Guarantee address details visible:', result.addressDetailsVisible);
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
