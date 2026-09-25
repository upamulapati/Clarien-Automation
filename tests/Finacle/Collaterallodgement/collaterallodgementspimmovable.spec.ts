import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';

test.describe('Service Pack - Immovable Property Collateral', () => {
  test('HCLM - lodge and modify immovable property collateral', async ({ page }) => {
    test.setTimeout(300000);
    const spPage = new ServicePackPage(page);
    const result = await spPage.servicePackLodgeAndModifyImmovablePropertyCollateral();
    expect(result.collateralId).toBeTruthy();
    expect(result.modificationStatus).toMatch(/modified successfully/i);
    console.log('Immovable property collateral ID:', result.collateralId);
  expect(result.collateralId).toBeTruthy();
  });

  test('HCLM - verify immovable property collateral', async ({ page }) => {
    test.setTimeout(300000);
    const spPage = new ServicePackPage(page);
    const result = await spPage.servicePackVerifyImmovablePropertyCollateral();
    expect(result.statusMessage).toMatch(/verified successfully/i);
  });

  test('HSCLM - link immovable property collateral to account', async ({ page }) => {
    test.setTimeout(300000);
    const spPage = new ServicePackPage(page);
    const result = await spPage.servicePackLinkImmovablePropertyCollateral();
    expect(result.statusMessage).toMatch(/linked successfully/i);
  });
});
