import { expect, Page, test } from '@playwright/test';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';

// Retail loan modification (HACMLA) is performed by the maker user (same maker
// who opened the loans in Retailloancreation.spec.ts).
const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

// New value applied during modification - Loan Period (Months/Days).
const NEW_LOAN_PERIOD_MONTHS = '24';

// Loan accounts to modify. Set to the specific A/c ID(s) requested for this run.
const LOAN_ACCOUNTS: { scheme: string; accountNumber: string }[] = [
  { scheme: 'MODIFIED', accountNumber: '3200000048' },
];

let homePage: HomePage;
let loanPage: AccountPage;

async function getRelatedPartyFieldValue(page: Page, labelText: string): Promise<string> {
  for (const frame of page.frames()) {
    const value = await frame.evaluate((label) => {
      const canonical = (text: string) => text.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const expected = canonical(label);
      const labels = Array.from(document.querySelectorAll('*')).filter(element => canonical(element.textContent || '') === expected);
      for (const labelElement of labels) {
        const cell = labelElement.closest('td, th') || labelElement;
        const candidates = [cell.nextElementSibling, labelElement.nextElementSibling];
        for (const candidate of candidates) {
          if (!candidate) continue;
          const control = candidate.querySelector('input, textarea, select') as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
          if (control) {
            return control instanceof HTMLSelectElement
              ? control.selectedOptions[0]?.text.trim() || control.value.trim()
              : control.value.trim();
          }
          const text = (candidate.textContent || '').replace(/\s+/g, ' ').trim();
          if (text) return text;
        }
        const row = cell.closest('tr');
        const controls = Array.from(row?.querySelectorAll('input, textarea, select') || []) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
        const control = controls.find(element => element.type !== 'hidden');
        if (control) {
          return control instanceof HTMLSelectElement
            ? control.selectedOptions[0]?.text.trim() || control.value.trim()
            : control.value.trim();
        }
      }
      const bodyText = document.body.innerText.replace(/\r/g, '');
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const valueOnFollowingLine = bodyText.match(new RegExp(`${escapedLabel}\\s*\\n\\s*([^\\n]+)`, 'i'));
      return valueOnFollowingLine?.[1].trim() || null;
    }, labelText).catch(() => null);
    if (value !== null) return value;
  }
  throw new Error('Related Party field not found in any frame: ' + labelText);
}
async function selectRelatedPartyAddressType(page: Page, addressType: string): Promise<void> {
  const popup = await loanPage.clickLookupIconByLabel('Address Type');
  if (!popup) throw new Error('Address Type lookup did not open');

  await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  let selected = false;
  const deadline = Date.now() + 10000;
  const escapedAddressType = addressType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  while (!selected && Date.now() < deadline) {
    for (const popupFrame of popup.frames()) {
      const option = popupFrame.getByText(new RegExp(`^\\s*${escapedAddressType}\\s*$`, 'i')).first();
      if (await option.isVisible().catch(() => false)) {
        await option.click({ timeout: 5000 });
        selected = true;
        break;
      }
    }
    if (!selected) await page.waitForTimeout(250);
  }
  if (!selected) throw new Error('Address Type was not found in the lookup: ' + addressType);
  await popup.waitForEvent('close', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
}async function assertLoanDetailsTab(page: Page): Promise<void> {
  const frame = page.frame({ name: 'FINW' });
  if (!frame) throw new Error('FINW frame not found');
  const loanPeriod = frame.locator('#loanPerdMths, #loanPeriodMonths, #loanTermMonths, #tenureMonths').first();
  await expect(loanPeriod, 'Loan Details tab must display the loan-period field').toBeVisible();
}
test.beforeEach(async ({ page }) => {
  // Every recorded account is modified in a single test/session, so budget
  // ~5 min per account to avoid timing out mid-modification.
  test.setTimeout(Math.max(1, LOAN_ACCOUNTS.length) * 300000);
  page.setDefaultTimeout(20000);

  // Step 1: Login to finacle (maker user).
  ({ homePage } = await loginToFinacle(page, USERNAME, PASSWORD));
  loanPage = new AccountPage(page);
});

// HACMLA - Modify every retail loan account created in the latest
// Retailloancreation.spec.ts run. The generated A/c IDs are read at runtime from
// the shared store, so this picks up the accounts created in the same run.
test('HACMLA - modify retail loan accounts', async ({ page }) => {
  const loanAccounts = LOAN_ACCOUNTS;

  console.log(`Modifying ${loanAccounts.length} retail loan account(s):`,
    loanAccounts.map((a) => `${a.scheme}=${a.accountNumber}`).join(', '));

  for (const { scheme, accountNumber } of loanAccounts) {
    await modifyLoanAccount(page, scheme, accountNumber);
  }

  // Logout once after all accounts are modified.
  console.log('Logging out...');
  await homePage.logout();
});

// Runs the HACMLA modification flow for a single loan A/c ID. Does NOT log out.
async function modifyLoanAccount(
  page: import('@playwright/test').Page,
  scheme: string,
  loanAccountNumber: string,
): Promise<void> {
  console.log(`Modifying retail loan account (${scheme}): ${loanAccountNumber}`);

  // Step 1: Select "core server" from the solution drop down.
  console.log('Selecting Core Server...');
  await loanPage.selectCoreServer();

  // Step 2: Type menu option "HACMLA" in finacle.
  console.log('Searching for HACMLA...');
  await loanPage.searchMenu(COMMON_DATA.retailLoans.screens.modifyAndVerify);
  await page.waitForTimeout(3000);

  // Step 3: Function - M - Modify
  console.log('Selecting Modify function...');
  await loanPage.selectFunction('Modify');

  // Step 4: A/c Id - enter the account number to be modified, then Go.
  console.log('Entering loan account ID to modify...');
  await loanPage.enterHacmAccountId(loanAccountNumber);

  console.log('Clicking Go button...');
  await loanPage.clickGo();

  // A Warning & Exception popup may appear after Go; accept it to continue.
  await loanPage.acceptWarningPopup();

  // The modify screen loads the full loan via AJAX, which is slower than the
  // fresh creation form - give it time to render before touching tabs/fields.
  await page.waitForTimeout(5000);

  // Step 5: Loan details tab - modify Loan Period (Months/Days) -> 24.
  // (On the modify screen there is no separate Payment Plan tab / No. of
  // installments field; the loan period lives here on the Loan Details tab.)
  console.log('Visiting Loan details tab...');
  await loanPage.visitLoanTab('Loan Details', 'lasch');
  await loanPage.setLoanPeriodMonths(NEW_LOAN_PERIOD_MONTHS);

  console.log('Visiting Payment Plan tab...');
  await loanPage.visitLoanTab('Payment Plan', 'laparm');
  await loanPage.setNumberOfInstalments(NEW_LOAN_PERIOD_MONTHS);

  // Step 6: A/c interest tab
  console.log('Visiting A/c Interest tab...');
  await loanPage.visitLoanTab('A/C Interest', 'laacctinterest');

  // Step 7: LA Interest tab
  console.log('Visiting LA Interest tab...');
  await loanPage.visitLoanTab('LA Interest', 'laint');

  // Step 8: Payment schedule details tab
  console.log('Visiting Payment Schedule Details tab...');
  await loanPage.visitLoanTab('Payment Schedule', 'lamnt');

  // Step 10: Related party details tab
  console.log('Visiting Related Party details tab...');
  await loanPage.visitLoanTab('Related Party', 'relatedpartydetails');

  const phoneNumberBeforeAddressChange = await getRelatedPartyFieldValue(page, 'Phone No.');
  const emailIdBeforeAddressChange = await getRelatedPartyFieldValue(page, 'Email ID');
  await selectRelatedPartyAddressType(page, 'ACCT');
  await expect.poll(() => getRelatedPartyFieldValue(page, 'Phone No.')).toBe(phoneNumberBeforeAddressChange);
  await expect.poll(() => getRelatedPartyFieldValue(page, 'Email ID')).toBe(emailIdBeforeAddressChange);
  await test.info().attach('related-party-details', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  // Step 11: Fee details tab
  console.log('Visiting Fee details tab...');
  await loanPage.visitLoanTab('Fees', 'lachrg');

  console.log('Visiting Addl. Info details tab...');
  await loanPage.visitLoanTab('Addl. Info', 'additionalinfo');

  // Document tab - visiting is mandatory (else submit is blocked with
  // "Document: Visit document information as it is set as mandatory.").
  console.log('Visiting Document details tab...');
  await loanPage.visitLoanTab('Document', 'documentdetails');

  // Step 12: Submit - the confirmation screen shows the modified A/c ID.
  console.log('Clicking Submit button...');
  await loanPage.submitForm();

  // If a Warning & Exception popup appears, click Accept/OK to continue.
  await loanPage.acceptWarningPopup();

  const modifiedAccountNumber = await loanPage.getGeneratedLoanAccountNumber();
  console.log(`=== MODIFIED LOAN ACCOUNT NUMBER (${scheme}):`, modifiedAccountNumber, '===');

  // Click Accept to finalise the modification. This returns to the HACMLA
  // criteria screen, ready for the next account.
  console.log('Clicking Accept button...');
  await loanPage.clickAccept();

  console.log('Reopening HACMLA in Inquiry mode...');
  await loanPage.searchMenu(COMMON_DATA.retailLoans.screens.modifyAndVerify);
  await page.waitForTimeout(3000);
  await loanPage.selectFunction('Inquire');
  await loanPage.enterHacmAccountId(loanAccountNumber);
  await loanPage.clickGo();
  await loanPage.acceptWarningPopup();
  await page.waitForTimeout(5000);
  await loanPage.visitLoanTab('Loan Details', 'lasch');
  await assertLoanDetailsTab(page);
  await test.info().attach('loan-details-inquiry', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}
