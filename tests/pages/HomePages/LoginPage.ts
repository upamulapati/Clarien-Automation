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
  async goto(url?: string) {
    await this.page.goto(url || 'https://clrnuat.clarienbank.com/fininfra/ui/SSOLogin.jsp');
    await this.page.waitForLoadState('domcontentloaded');
  }

  // ============ Authentication Methods ============
  async login(username: string, password: string) {
    // Remove readonly (may be set after session reset) before filling
    await this.usernameInput.evaluate((el: HTMLInputElement) => { el.removeAttribute('readonly'); el.value = ''; }).catch(() => {});
    await this.usernameInput.fill(username);
    await this.passwordInput.evaluate((el: HTMLInputElement) => { el.removeAttribute('readonly'); el.value = ''; }).catch(() => {});
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async handleAlreadyLoggedIn(username: string, password: string) {
    // Check for errorPage.jsp frame (Core Banking "already logged in" error)
    const errorFrame = this.page.frame({ url: /.*errorPage\.jsp.*/ });
    if (errorFrame) {
      console.log('⚠ Already logged in detected (errorPage.jsp), resetting session...');
      await errorFrame.locator('#Submit2').click();
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(5000);
      await this.login(username, password);
      await this.page.waitForTimeout(10000);
      return;
    }

    // Check for "Reset Login" page (GET_RESET_LOGIN_PAGE form)
    const hasResetForm = await this.loginFrame.locator('input[name="CALLTYPE"][value="GET_RESET_LOGIN_PAGE"]').count().catch(() => 0);
    if (hasResetForm > 0) {
      console.log('⚠ Reset Login page detected (user already logged in elsewhere).');
      const submit2 = this.loginFrame.locator('#Submit2');
      if (await submit2.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submit2.click();
        console.log('  ✓ Clicked Login button (#Submit2) to force reset session');
      } else {
        const anySubmit = this.loginFrame.locator('input[type="submit"]').first();
        if (await anySubmit.isVisible({ timeout: 2000 }).catch(() => false)) {
          await anySubmit.click();
          console.log('  ✓ Clicked visible submit button on reset page');
        }
      }
      await this.page.waitForTimeout(8000);

      // After reset, check if we now see appSelect or need to re-login
      const appSelectAfterReset = await this.loginFrame.locator('#appSelect').isVisible({ timeout: 5000 }).catch(() => false);
      if (appSelectAfterReset) {
        console.log('✓ appSelect visible after session reset');
        return;
      }

      // May need to re-login after reset
      const loginAvailable = await this.usernameInput.isVisible({ timeout: 5000 }).catch(() => false);
      if (loginAvailable) {
        console.log('  Re-logging in after session reset...');
        await this.login(username, password);
        await this.page.waitForTimeout(10000);
      }
    }
  }
}
