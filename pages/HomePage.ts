import { Page, Locator, FrameLocator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly loginFrame: FrameLocator;

  constructor(page: Page) {
    this.page = page;
    this.loginFrame = page.frameLocator('iframe[name="loginFrame"]');
  }

  // ============ Locators ============
  private get appSelect() {
    return this.loginFrame.locator('#appSelect');
  }

  private get logoutButton() {
    return this.loginFrame.locator('img[title="Logout"]');
  }

  // ============ Navigation Methods ============
  async selectCRM() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000);

    const crmPopupPromise = this.page.waitForEvent('popup', { timeout: 30000 });
    await this.appSelect.selectOption('CRMServer');

    const crmPopup = await crmPopupPromise;
    await crmPopup.waitForLoadState('networkidle');
    await crmPopup.getByRole('button', { name: 'Submit' }).click();

    await this.page.waitForTimeout(8000);
  }

  async logout() {
    await this.logoutButton.click();
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(5000);
  }
}
