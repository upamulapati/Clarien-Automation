import { test } from '@playwright/test';
import { LoginPage } from '../../../pages/LoginPage';
import { HomePage } from '../../../pages/HomePage';
import { SavingsBankAccountPage } from '../../../pages/SavingsBankAccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';

const USERNAME = COMMON_DATA.credentials.username;
const PASSWORD = COMMON_DATA.credentials.password;
const SECOND_USERNAME = COMMON_DATA.secondCredentials.username;
const SECOND_PASSWORD = COMMON_DATA.secondCredentials.password;

// Current account opening (HOAACCA) and verification (HOAACVCA) menu options.
const CURRENT_ACCOUNT_MENU = 'HOAACCA';
const CURRENT_ACCOUNT_VERIFY_MENU = 'HOAACVCA';

// Current account scheme codes under test.
const CURRENT_ACCOUNT_SCHEMES = COMMON_DATA.currentAccountSchemes;

let loginPage: LoginPage;
let homePage: HomePage;
let currentAccountPage: SavingsBankAccountPage;

test.beforeEach(async ({ page }) => {
  test.setTimeout(120000);

  // Login with the maker credentials
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  currentAccountPage = new SavingsBankAccountPage(page);

  // Select Core Server from solution drop down
  console.log('Selecting Core Server...');
  await currentAccountPage.selectCoreServer();

  // Type menu option HOAACCA in Finacle
  console.log(`Searching for ${CURRENT_ACCOUNT_MENU}...`);
  await currentAccountPage.searchMenu(CURRENT_ACCOUNT_MENU);
});

// Data-driven: open a current account (HOAACCA) for each scheme code, then
// capture the generated account number for verification purposes.
for (const schemeCode of CURRENT_ACCOUNT_SCHEMES) {
  test(`open current account - scheme ${schemeCode}`, async ({ page }) => {
    test.setTimeout(300000);

    // Function- Open, Currency- BMD, Sol id 100, CIF Id and scheme code, Go;
    // visit General/Interest/Scheme/Related Party/MIS/Account Limits tabs;
    // submit to generate the account number.
    console.log(`Creating current account with scheme ${schemeCode}...`);
    await currentAccountPage.createCurrentAccount({
      ...COMMON_DATA.currentAccountData,
      schemeCode,
      dispatchMode: COMMON_DATA.currentAccountData.dispatchMode as 'email' | 'post',
    });

    const result = await currentAccountPage.verifyAccountCreated();
    console.log(`Account created for scheme ${schemeCode}:`, result.message);
    const accountId = result.accountNumber;
    if (!accountId) {
      throw new Error(`Failed to capture account ID for scheme ${schemeCode}`);
    }
    // Note the generated account number for verification purposes.
    console.log(`Captured Account ID (scheme ${schemeCode}): ${accountId}`);

    // Logout the maker
    console.log('Logging out...');
    await homePage.logout();
    await page.waitForTimeout(5000);

    // Login with the verifying user (different from the maker)
    console.log('Logging in with second user for verification...');
    loginPage = new LoginPage(page);
    homePage = new HomePage(page);
    currentAccountPage = new SavingsBankAccountPage(page);

    await loginPage.goto();
    await loginPage.login(SECOND_USERNAME, SECOND_PASSWORD);
    await page.waitForTimeout(5000);
    await loginPage.handleAlreadyLoggedInError(SECOND_PASSWORD);

    console.log('Selecting Core Server...');
    await currentAccountPage.selectCoreServer();
    await page.waitForTimeout(5000);

    // Search the verification screen and select the verify option
    console.log(`Searching for ${CURRENT_ACCOUNT_VERIFY_MENU} (verification screen)...`);
    await currentAccountPage.searchVerificationScreen(CURRENT_ACCOUNT_VERIFY_MENU);
    await page.waitForTimeout(3000);

    console.log('Selecting verify function option...');
    await currentAccountPage.selectVerifyFunction();

    console.log('Entering temporary account ID...');
    await currentAccountPage.enterTemporaryAccountId(accountId);

    console.log('Clicking Go button...');
    await currentAccountPage.acceptButton.click();
    await page.waitForTimeout(5000);

    console.log('Navigating through all tabs...');
    await currentAccountPage.navigateAllTabs();

    console.log('Clicking Submit button...');
    await currentAccountPage.clickSubmit();

    console.log('Logging out...');
    await homePage.logout();
  });
}
