import { test } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { HomePage } from '../pages/HomePage';
import { CRMPage } from '../pages/CRMPage';
import COMMON_DATA from '../data/common-data.json';
import { CREDENTIALS } from '../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

test('login and navigate to Entity Queue in CRM', async ({ page }) => {
  test.setTimeout(180000);

  // Auto-accept any confirm/alert dialogs
  page.on('dialog', dialog => {
    console.log(`Dialog message: ${dialog.message()}`);
    dialog.accept();
  });

  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);
  const crmPage = new CRMPage(page);

  // Navigate to login page
  await loginPage.goto();

  // Login with credentials
  await loginPage.login(USERNAME, PASSWORD);
  await page.waitForTimeout(5000);

  // Handle "User is already logged in" error if it appears
  await loginPage.handleAlreadyLoggedInError(PASSWORD);

  // Select CRM module from home page
  console.log('Selecting CRM...');
  await homePage.selectCRM();

  // Navigate to CIF Retail
  console.log('Navigating to CIF Retail...');
  await crmPage.navigateToCIFRetail();

  // Navigate to Entity Queue
  console.log('Navigating to Entity Queue...');
  await crmPage.navigateToEntityQueue();

  // Logout from home page
  console.log('Logging out...');
  await homePage.logout();
});
