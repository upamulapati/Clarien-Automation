import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';

test.describe('Service Pack - Collateral Validations', () => {
  test('HCLM - lodge mutual fund collateral with distinctive number validations', async ({ page }) => {
    test.setTimeout(300000);
    const spPage = new ServicePackPage(page);
    const result = await spPage.servicePackLodgeMutualFundCollateral();
    expect(result.collateralId).toBeTruthy();
    console.log('Generated mutual fund collateral ID:', result.collateralId);
  });

  test('HCLM - lodge and modify life insurance collateral', async ({ page }) => {
    test.setTimeout(300000);
    const spPage = new ServicePackPage(page);
    const result = await spPage.servicePackLodgeAndModifyLifeInsuranceCollateral();
    expect(result.collateralId).toBeTruthy();
    expect(result.modificationStatus).toMatch(/modified successfully/i);
  });

  test('HCLM - verify life insurance collateral', async ({ page }) => {
    test.setTimeout(300000);
    const spPage = new ServicePackPage(page);
    const result = await spPage.servicePackVerifyLifeInsuranceCollateral();
    expect(result.statusMessage).toMatch(/verified successfully/i);
  });

  test('HSCLM - link life insurance collateral to account', async ({ page }) => {
    test.setTimeout(300000);
    const spPage = new ServicePackPage(page);
    const result = await spPage.servicePackLinkLifeInsuranceCollateral();
    expect(result.statusMessage).toMatch(/linked successfully/i);
  });
});
