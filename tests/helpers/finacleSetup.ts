import { Page } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';

// Attaches a handler that auto-accepts every confirm/alert dialog and logs it.
export function autoAcceptDialogs(page: Page): void {
  page.on('dialog', dialog => {
    console.log(`Dialog message: ${dialog.message()}`);
    dialog.accept();
  });
}

// Performs the common Finacle login flow used by every spec: auto-accepts
// dialogs, navigates to the login page, signs in and clears the "already
// logged in" prompt if it appears. Returns the shared page objects.
export async function loginToFinacle(
  page: Page,
  username: string,
  password: string
): Promise<{ loginPage: LoginPage; homePage: HomePage }> {
  autoAcceptDialogs(page);

  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);

  await loginPage.goto();
  await loginPage.login(username, password);
  await page.waitForTimeout(5000);
  await loginPage.handleAlreadyLoggedInError(password);

  return { loginPage, homePage };
}
