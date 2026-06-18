import { Page, FrameLocator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly loginFrame: FrameLocator;

  constructor(page: Page) {
    this.page = page;
    this.loginFrame = page.frameLocator('iframe[name="loginFrame"]');
  }

  // ============ Locators ============
  private get usernameInput() {
    return this.loginFrame.locator('#usertxt');
  }

  private get passwordInput() {
    return this.loginFrame.locator('#passtxt');
  }

  private get loginButton() {
    return this.loginFrame.getByRole('button', { name: 'Login' });
  }

  // ============ Navigation Methods ============
  async goto() {
    await this.page.goto('https://clrnuat.clarienbank.com/fininfra/ui/SSOLogin.jsp');
    await this.page.waitForLoadState('domcontentloaded');
  }

  // ============ Authentication Methods ============
  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async handleAlreadyLoggedInError(password: string) {
    const errorFrame = this.page.frame({ url: /.*errorPage\.jsp.*/ });
    if (errorFrame) {
      await errorFrame.locator('#Submit2').click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(5000);
      await this.passwordInput.fill(password);
      await this.loginButton.click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(10000);
    }
  }
}
