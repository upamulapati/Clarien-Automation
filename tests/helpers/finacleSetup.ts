import { Page } from '@playwright/test';
import { LoginPage } from '../pages/HomePages/LoginPage';
import { HomePage } from '../pages/HomePages/HomePage';
import { setupDialogHandlers } from '../config/crmSetup';
import { captureEvidence } from './evidence';

// Performs the common Finacle login flow used by every spec: auto-accepts
// dialogs, navigates to the login page, signs in and clears the "already
// logged in" prompt if it appears. Returns the shared page objects.
//
// The login is retried up to 3 times and each attempt verifies that the
// #appSelect dropdown becomes visible (the reliable indicator that Finacle
// has accepted the credentials and loaded its main shell).
export async function loginToFinacle(
  page: Page,
  username: string,
  password: string
): Promise<{ loginPage: LoginPage; homePage: HomePage }> {
  setupDialogHandlers(page);

  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);
  const lf = page.frameLocator('iframe[name="loginFrame"]');

  for (let attempt = 0; attempt < 3; attempt++) {
    await loginPage.goto();
    await loginPage.login(username, password);
    await page.waitForTimeout(10000);

    // Check if appSelect is visible (normal login success)
    const appSelectVisible = await lf.locator('#appSelect').isVisible({ timeout: 5000 }).catch(() => false);
    if (appSelectVisible) {
      console.log('✓ appSelect visible after login');
      await captureEvidence(page, 'Login complete', { username, source: 'login' });
      return { loginPage, homePage };
    }

    // Handle "already logged in" scenarios (Reset Login page, errorPage.jsp)
    await loginPage.handleAlreadyLoggedIn(username, password);

    // Check appSelect again after handling
    const appSelectAfter = await lf.locator('#appSelect').isVisible({ timeout: 10000 }).catch(() => false);
    if (appSelectAfter) {
      console.log('✓ appSelect visible after session reset');
      await captureEvidence(page, 'Login complete (session reset)', { username, source: 'session-reset' });
      return { loginPage, homePage };
    }

    console.log(`⚠ appSelect not visible after login (attempt ${attempt + 1}/3)`);
    if (attempt < 2) await page.waitForTimeout(3000);
  }

  console.log('⚠ Login failed after all attempts — proceeding anyway');
  return { loginPage, homePage };
}
