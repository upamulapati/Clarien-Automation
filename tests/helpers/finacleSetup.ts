import { Page } from '@playwright/test';
import { LoginPage } from '../pages/HomePages/LoginPage';
import { HomePage } from '../pages/HomePages/HomePage';
import { setupDialogHandlers } from '../config/crmSetup';

// Performs the common Finacle login flow used by every spec: auto-accepts
// dialogs, navigates to the login page, signs in and clears the "already
// logged in" prompt if it appears. Returns the shared page objects.
export async function loginToFinacle(
  page: Page,
  username: string,
  password: string
): Promise<{ loginPage: LoginPage; homePage: HomePage }> {
  setupDialogHandlers(page);

  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);

  await loginPage.goto();
  await loginPage.login(username, password);
  await page.waitForTimeout(5000);
  await loginPage.handleAlreadyLoggedIn(username, password);

  return { loginPage, homePage };
}
