import { Page, Locator, FrameLocator, Frame } from '@playwright/test';

interface AccountData {
  functionOption: string;
  ccy: string;
  solId: string;
  cifCode: string;
  schemeCode?: string;
  dispatchMode?: 'email' | 'post';
}

export class SavingsBankAccountPage {
  readonly page: Page;
  readonly loginFrame: FrameLocator;

  constructor(page: Page) {
    this.page = page;
    this.loginFrame = page.frameLocator('iframe[name="loginFrame"]');
  }

  // ============ Frame Helpers ============
  private getFinwFrame(): Frame {
    const finwFrame = this.page.frame({ name: 'FINW' });
    if (!finwFrame) {
      throw new Error('FINW frame not found!');
    }
    return finwFrame;
  }

  // ============ Login Frame Locators ============
  private get appSelect() {
    return this.loginFrame.locator('#appSelect');
  }

  private get menuSelect() {
    return this.loginFrame.locator('#menuSelect');
  }

  // ============ FINW Frame Locators ============
  private get functionOption() {
    return this.getFinwFrame().locator('#templateFunction');
  }

  private get verifyCancel() {
    return this.getFinwFrame().locator('#verifyCancel');
  }

  private get currency() {
    return this.getFinwFrame().locator('#crncyCode');
  }

  private get solId() {
    return this.getFinwFrame().locator('#solId');
  }

  private get cifId() {
    return this.getFinwFrame().locator('#cifId');
  }

  private get schemeCodeLink() {
    return this.getFinwFrame().locator('#sLnk4');
  }

  get acceptButton() {
    return this.getFinwFrame().locator('#Accept');
  }

  private get dispatchMode() {
    return this.getFinwFrame().locator('#despatchMode');
  }

  private get interestCreditAccount() {
    return this.getFinwFrame().locator('#intCrAcctFlg');
  }

  private get interestDebitAccount() {
    return this.getFinwFrame().locator('#intDrAcctFlg');
  }

  private get nextInterestDate() {
    return this.getFinwFrame().locator('#nextIntCrCalcDt_ui');
  }

  private get nextInterestDebitDate() {
    return this.getFinwFrame().locator('#nextIntDrCalcDt_ui');
  }

  private get submitButton() {
    return this.getFinwFrame().locator('#Submit');
  }

  private get confirmButton() {
    return this.getFinwFrame().locator('#Confirm, #confirm, input[value="Confirm"], button:has-text("Confirm")').first();
  }

  private get accountNumLabel() {
    return this.getFinwFrame().locator('#AcctNum');
  }

  private get tempForacid() {
    return this.getFinwFrame().locator('#tempForacid');
  }

  private get enquiryAcctNo() {
    return this.getFinwFrame().locator('#acctNo');
  }

  // ============ HTM (Transaction Management) Locators ============
  private get htmFunctionCode() {
    return this.getFinwFrame().locator('#funcCode');
  }

  private get htmTranTypeSubType() {
    return this.getFinwFrame().locator('#tranTypeSubType');
  }

  private get htmAcctId() {
    return this.getFinwFrame().locator('#acctId');
  }

  private get htmAmount() {
    return this.getFinwFrame().locator('#refAmt');
  }

  private get htmDebitRadio() {
    return this.getFinwFrame().locator('input[type="radio"][value="D"]');
  }

  private get htmAddButton() {
    return this.getFinwFrame().locator('input[type="button"][value*="Add"]');
  }

  private get htmPostButton() {
    return this.getFinwFrame().locator('#Post');
  }

  private get htmGoButton() {
    return this.getFinwFrame().locator('#Go');
  }

  // ============ HACLINQ (Account Inquiry) Locators ============
  private get haclinqAcctNum() {
    return this.getFinwFrame().locator('#acctNum');
  }

  private get haclinqGoButton() {
    return this.getFinwFrame().locator('#Go');
  }

  // ============ Navigation Methods ============
  async selectCoreServer() {
    await this.appSelect.selectOption('CoreServer');
    await this.page.waitForTimeout(3000);
  }

  async searchMenu(searchTerm: string) {
    await this.page.waitForTimeout(3000);
    await this.menuSelect.fill(searchTerm);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(2000);
    
    // Select the option that contains the searched code - try loginFrame first
    const option = this.loginFrame.locator(`a:has-text('${searchTerm}')`).first();
    if (await option.count() > 0) {
      await option.click();
      console.log(`Selected option: ${searchTerm}`);
      await this.page.waitForTimeout(3000);
    } else {
      console.log(`Option containing '${searchTerm}' not found in loginFrame, trying FINW frame`);
      // Try FINW frame as fallback
      const finwFrame = this.getFinwFrame();
      const finwOption = finwFrame.locator(`a:has-text('${searchTerm}')`).first();
      if (await finwOption.count() > 0) {
        await finwOption.click();
        console.log(`Selected option in FINW frame: ${searchTerm}`);
        await this.page.waitForTimeout(3000);
      } else {
        console.log(`Option containing '${searchTerm}' not found in any frame`);
      }
    }
  }

  async searchVerificationScreen(searchTerm: string) {
    await this.page.waitForTimeout(3000);
    await this.menuSelect.fill(searchTerm);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(2000);
    
    const option = this.loginFrame.locator(`a:has-text('${searchTerm}')`).first();
    if (await option.count() > 0) {
      await option.click();
      console.log(`Selected verification option: ${searchTerm}`);
      await this.page.waitForTimeout(5000);
    } else {
      console.log(`Option containing '${searchTerm}' not found in loginFrame, trying FINW frame`);
      const finwFrame = this.getFinwFrame();
      const finwOption = finwFrame.locator(`a:has-text('${searchTerm}')`).first();
      if (await finwOption.count() > 0) {
        await finwOption.click();
        console.log(`Selected verification option in FINW frame: ${searchTerm}`);
        await this.page.waitForTimeout(5000);
      } else {
        console.log(`Option containing '${searchTerm}' not found in any frame`);
      }
    }

    // Wait for FINW frame to be available after navigation
    await this.page.waitForTimeout(3000);
    try {
      this.getFinwFrame();
      console.log('FINW frame is available');
    } catch (e) {
      console.log('FINW frame not available after navigation:', e);
    }
  }

  async searchEnquiryScreen(searchTerm: string) {
    await this.page.waitForTimeout(3000);
    await this.menuSelect.fill(searchTerm);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(2000);
    
    const option = this.loginFrame.locator(`a:has-text('${searchTerm}')`).first();
    if (await option.count() > 0) {
      await option.click();
      console.log(`Selected enquiry option: ${searchTerm}`);
      await this.page.waitForTimeout(5000);
    } else {
      console.log(`Option containing '${searchTerm}' not found in loginFrame, trying FINW frame`);
      const finwFrame = this.getFinwFrame();
      const finwOption = finwFrame.locator(`a:has-text('${searchTerm}')`).first();
      if (await finwOption.count() > 0) {
        await finwOption.click();
        console.log(`Selected enquiry option in FINW frame: ${searchTerm}`);
        await this.page.waitForTimeout(5000);
      } else {
        console.log(`Option containing '${searchTerm}' not found in any frame`);
      }
    }

    // Wait for FINW frame to be available after navigation
    await this.page.waitForTimeout(3000);
    try {
      this.getFinwFrame();
      console.log('FINW frame is available');
    } catch (e) {
      console.log('FINW frame not available after navigation:', e);
    }
  }

  async searchTransactionManagement(searchTerm: string) {
    await this.page.waitForTimeout(3000);
    await this.menuSelect.fill(searchTerm);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(2000);
    
    const option = this.loginFrame.locator(`a:has-text('${searchTerm}')`).first();
    if (await option.count() > 0) {
      await option.click();
      console.log(`Selected transaction management option: ${searchTerm}`);
      await this.page.waitForTimeout(5000);
    } else {
      console.log(`Option containing '${searchTerm}' not found in loginFrame, trying FINW frame`);
      const finwFrame = this.getFinwFrame();
      const finwOption = finwFrame.locator(`a:has-text('${searchTerm}')`).first();
      if (await finwOption.count() > 0) {
        await finwOption.click();
        console.log(`Selected transaction management option in FINW frame: ${searchTerm}`);
        await this.page.waitForTimeout(5000);
      } else {
        console.log(`Option containing '${searchTerm}' not found in any frame`);
      }
    }

    // Wait for FINW frame to be available after navigation
    await this.page.waitForTimeout(3000);
    try {
      this.getFinwFrame();
      console.log('FINW frame is available');
    } catch (e) {
      console.log('FINW frame not available after navigation:', e);
    }
  }

  async searchAccountInquiry(searchTerm: string) {
    await this.page.waitForTimeout(3000);
    await this.menuSelect.fill(searchTerm);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(2000);
    
    const option = this.loginFrame.locator(`a:has-text('${searchTerm}')`).first();
    if (await option.count() > 0) {
      await option.click();
      console.log(`Selected account inquiry option: ${searchTerm}`);
      await this.page.waitForTimeout(5000);
    } else {
      console.log(`Option containing '${searchTerm}' not found in loginFrame, trying FINW frame`);
      const finwFrame = this.getFinwFrame();
      const finwOption = finwFrame.locator(`a:has-text('${searchTerm}')`).first();
      if (await finwOption.count() > 0) {
        await finwOption.click();
        console.log(`Selected account inquiry option in FINW frame: ${searchTerm}`);
        await this.page.waitForTimeout(5000);
      } else {
        console.log(`Option containing '${searchTerm}' not found in any frame`);
      }
    }

    // Wait for FINW frame to be available after navigation
    await this.page.waitForTimeout(3000);
    try {
      this.getFinwFrame();
      console.log('FINW frame is available');
    } catch (e) {
      console.log('FINW frame not available after navigation:', e);
    }
  }

  // ============ Tab Navigation Methods ============
  private async clickTab(textMatch: string, idFallback?: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const byText = finwFrame.locator(`a:has-text("${textMatch}")`).first();
      if (await byText.count() > 0) {
        await byText.click({ timeout: 15000 });
      } else if (idFallback && await finwFrame.locator(`#${idFallback}`).count() > 0) {
        await finwFrame.locator(`#${idFallback}`).click({ timeout: 15000 });
      } else {
        console.log(`Tab '${textMatch}' not found (it may already be active), skipping`);
      }
      await this.page.waitForTimeout(2500);
    } catch (e) {
      console.log(`Could not navigate to tab '${textMatch}', skipping: ${e}`);
    }
  }

  async visitGeneralDetailsTab() {
    await this.clickTab('General Details', 'generaldetails');
  }

  async visitInterestDetailsTab() {
    await this.clickTab('Interest Details', 'generaldetails2');
  }

  async visitSchemeDetailsTab() {
    await this.clickTab('Scheme Details', 'sbschemedetails');
  }

  async visitRelatedPartyTab() {
    await this.clickTab('Related Party', 'relatedpartydetails');
  }

  async visitMiscodesTab() {
    await this.clickTab('MIS Codes', 'miscodes');
  }

  async visitAdditionalInfoTab() {
    await this.clickTab('Additional Info', 'additionalinfo');
  }

  // Generic tab navigation by the exact visible label (used by the HACM
  // verify screen, whose tab labels differ from the creation screen).
  async visitTab(label: string) {
    await this.clickTab(label);
  }

  // Navigates to a tab by its anchor id (e.g. 'acmogd', 'relatedpartydetails').
  async visitTabById(id: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const tab = finwFrame.locator(`#${id}`).first();
      await tab.waitFor({ state: 'visible', timeout: 15000 });
      await tab.click();
      await this.page.waitForTimeout(2500);
      console.log(`Navigated to tab #${id}`);
    } catch (e) {
      console.log(`Could not navigate to tab #${id}, skipping: ${e}`);
    }
  }

  async navigateAllTabs() {
    await this.visitGeneralDetailsTab();
    await this.visitInterestDetailsTab();
    await this.visitSchemeDetailsTab();
    await this.visitRelatedPartyTab();
    await this.visitMiscodesTab();
  }

  // ============ Verification Screen Methods ============
  async selectVerifyFunction() {
    try {
      await this.verifyCancel.selectOption('V');
      await this.page.waitForTimeout(1000);
      console.log('Selected verify function option');
    } catch (e) {
      console.log(`Could not select verify function, skipping: ${e}`);
    }
  }

  async enterTemporaryAccountId(accountId: string) {
    try {
      await this.tempForacid.fill(accountId);
      await this.tempForacid.press('Tab');
      await this.page.waitForTimeout(2000);
      console.log(`Entered temporary account ID: ${accountId}`);
    } catch (e) {
      console.log(`Could not enter temporary account ID, skipping: ${e}`);
    }
  }

  async enterEnquiryAccountId(accountId: string) {
    try {
      await this.enquiryAcctNo.fill(accountId);
      await this.enquiryAcctNo.press('Tab');
      await this.page.waitForTimeout(2000);
      console.log(`Entered enquiry account ID: ${accountId}`);
    } catch (e) {
      console.log(`Could not enter enquiry account ID, skipping: ${e}`);
    }
  }

  // Reads the Finacle status/alert message shown after an action (e.g. after
  // submitting a verification). Returns the trimmed message text, or null.
  async getStatusMessage(): Promise<string | null> {
    try {
      const candidates = [
        'tr.alert',
        'td.alert',
        '#pageMsg',
        '.errortext',
        '.message',
        'span[id*="msg" i]',
        'div[id*="msg" i]',
      ];
      // Scan every frame: the message may render outside the FINW frame.
      for (const frame of this.page.frames()) {
        for (const sel of candidates) {
          const loc = frame.locator(sel);
          if (await loc.count().catch(() => 0) > 0) {
            const text = (await loc.first().textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();
            if (text) {
              return text;
            }
          }
        }
      }
      return null;
    } catch (e) {
      console.log(`Could not read status message: ${e}`);
      return null;
    }
  }

  async checkAuthorizationError(): Promise<boolean> {
    try {
      const finwFrame = this.getFinwFrame();
      const alertRow = finwFrame.locator('tr.alert');
      if (await alertRow.count() > 0) {
        const alertText = await alertRow.textContent();
        console.log(`Alert message found: ${alertText}`);
        if (alertText && alertText.includes('The account creation is not yet authorized')) {
          console.log('Authorization error detected: Account creation is not yet authorized');
          return true;
        }
      }
      return false;
    } catch (e) {
      console.log(`Could not check for authorization error: ${e}`);
      return false;
    }
  }

  // ============ HTM (Transaction Management) Methods ============
  async selectHtmFunction(code: 'A' | 'D' | 'I' | 'M' | 'P' | 'V' | 'C' | 'T') {
    try {
      await this.htmFunctionCode.selectOption(code);
      await this.page.waitForTimeout(1000);
      console.log(`Selected HTM function: ${code}`);
    } catch (e) {
      console.log(`Could not select HTM function, skipping: ${e}`);
    }
  }

  async selectHtmTranTypeSubType(value: string) {
    try {
      await this.htmTranTypeSubType.selectOption(value);
      await this.page.waitForTimeout(1000);
      console.log(`Selected transaction type/subtype: ${value}`);
    } catch (e) {
      console.log(`Could not select transaction type/subtype, skipping: ${e}`);
    }
  }

  async enterHtmAccountId(accountId: string) {
    try {
      await this.htmAcctId.first().fill(accountId);
      await this.page.waitForTimeout(1000);
      console.log(`Entered HTM account ID: ${accountId}`);
    } catch (e) {
      console.log(`Could not enter HTM account ID, skipping: ${e}`);
    }
  }

  async enterHtmAmount(amount: string, pressTab = false) {
    try {
      await this.htmAmount.first().fill(amount);
      if (pressTab) {
        await this.htmAmount.first().press('Tab');
      }
      await this.page.waitForTimeout(1000);
      console.log(`Entered HTM amount: ${amount}`);
    } catch (e) {
      console.log(`Could not enter HTM amount, skipping: ${e}`);
    }
  }

  async selectHtmDebit() {
    try {
      await this.htmDebitRadio.check();
      await this.page.waitForTimeout(1000);
      console.log('Selected debit option');
    } catch (e) {
      console.log(`Could not select debit option, skipping: ${e}`);
    }
  }

  async clickHtmAdd() {
    try {
      await this.htmAddButton.click();
      await this.page.waitForTimeout(2000);
      console.log('Clicked HTM Add button');
    } catch (e) {
      console.log(`Could not click HTM Add button, skipping: ${e}`);
    }
  }

  async clickHtmPost() {
    try {
      await this.htmPostButton.click();
      await this.page.waitForTimeout(2000);
      console.log('Clicked HTM Post button');
    } catch (e) {
      console.log(`Could not click HTM Post button, skipping: ${e}`);
    }
  }

  async clickHtmGo() {
    try {
      await this.htmGoButton.click();
      await this.page.waitForTimeout(2000);
      console.log('Clicked HTM Go button');
    } catch (e) {
      console.log(`Could not click HTM Go button, skipping: ${e}`);
    }
  }

  async checkHtmError(): Promise<boolean> {
    try {
      const finwFrame = this.getFinwFrame();
      const alertRow = finwFrame.locator('tr.alert');
      if (await alertRow.count() > 0) {
        const alertText = await alertRow.textContent();
        console.log(`HTM alert message found: ${alertText}`);
        return true;
      }
      return false;
    } catch (e) {
      console.log(`Could not check for HTM error: ${e}`);
      return false;
    }
  }

  // ============ HACLINQ (Account Inquiry) Methods ============
  async enterHaclinqAccountId(accountId: string) {
    try {
      await this.haclinqAcctNum.fill(accountId);
      await this.page.waitForTimeout(1000);
      console.log(`Entered HACLINQ account ID: ${accountId}`);
    } catch (e) {
      console.log(`Could not enter HACLINQ account ID, skipping: ${e}`);
    }
  }

  async clickHaclinqGo() {
    try {
      await this.haclinqGoButton.click();
      await this.page.waitForTimeout(2000);
      console.log('Clicked HACLINQ Go button');
    } catch (e) {
      console.log(`Could not click HACLINQ Go button, skipping: ${e}`);
    }
  }

  // ============ Form Filling Methods ============
  // Finds the dispatch-mode <select> on the screen, preferring the known id,
  // then any select whose options reference dispatch/despatch.
  private async findDispatchDropdown(): Promise<Locator | null> {
    const finwFrame = this.getFinwFrame();

    const known = finwFrame.locator('#despatchMode');
    if (await known.count() > 0) {
      return known;
    }

    const selects = finwFrame.locator('select');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const opts = (await selects.nth(i).locator('option').allTextContents())
        .map(o => o.toLowerCase());
      if (opts.some(o => o.includes('dispatch') || o.includes('despatch'))) {
        return selects.nth(i);
      }
    }
    return null;
  }

  async selectDispatchMode(mode: 'email' | 'post' | 'no dispatch') {
    try {
      const dropdown = await this.findDispatchDropdown();
      if (!dropdown) {
        console.log('Dispatch mode dropdown not found, skipping');
        return;
      }
      await dropdown.waitFor({ state: 'visible', timeout: 15000 });

      // Log available options for diagnostics
      const options = await dropdown.locator('option').allTextContents();
      console.log(`Dispatch mode options: ${JSON.stringify(options)}`);

      // Keyword to match within the option label for the desired mode
      const keyword = mode === 'email' ? 'email'
        : mode === 'post' ? 'post'
        : 'no dispatch';

      // Try matching by label keyword (handles "No Dispatch" / "No Despatch"),
      // then fall back to known short values.
      const match = options.find(o => {
        const lower = o.toLowerCase();
        if (mode === 'no dispatch') {
          return lower.includes('no dispatch') || lower.includes('no despatch');
        }
        return lower.includes(keyword);
      });

      if (match) {
        await dropdown.selectOption({ label: match });
      } else {
        const fallback = mode === 'email' ? 'E' : mode === 'post' ? 'A' : 'N';
        await dropdown.selectOption(fallback);
      }
      await this.page.waitForTimeout(1000);
      console.log(`Selected dispatch mode: ${mode}`);
    } catch (e) {
      console.log(`Could not set dispatch mode, skipping: ${e}`);
    }
  }

  // Sets the "A/c Status" radio button (Active / Dormant / Inactive) on the
  // Scheme tab of the HACM screen. The radios carry no stable id, so the
  // matching radio is found by the label text that sits next to it (matched
  // with word boundaries so "Active" does not match inside "Inactive").
  async selectAccountStatus(status: 'active' | 'dormant' | 'inactive') {
    try {
      const finwFrame = this.getFinwFrame();
      const radios = finwFrame.locator('input[type="radio"]');
      await radios.first().waitFor({ state: 'attached', timeout: 15000 });

      const index = await radios.evaluateAll((els, target) => {
        const re = new RegExp(`\\b${target}\\b`, 'i');
        const textFor = (el: Element): string => {
          // Prefer a <label for=id>, then the text immediately after the radio,
          // finally the enclosing cell text.
          const id = (el as HTMLInputElement).id;
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`);
            if (lbl && lbl.textContent) return lbl.textContent;
          }
          let txt = '';
          let n: Node | null = el.nextSibling;
          while (n && !txt.trim()) {
            txt += n.textContent || '';
            n = n.nextSibling;
          }
          if (txt.trim()) return txt;
          return (el.parentElement?.textContent || '');
        };
        for (let i = 0; i < els.length; i++) {
          if (re.test(textFor(els[i]))) return i;
        }
        return -1;
      }, status);

      if (index < 0) {
        console.log(`A/c status radio for '${status}' not found, skipping`);
        return;
      }

      await radios.nth(index).check();
      await this.page.waitForTimeout(1000);
      console.log(`Selected A/c status: ${status}`);
    } catch (e) {
      console.log(`Could not set A/c status, skipping: ${e}`);
    }
  }

  private async fillGeneralTabFields() {
    const finwFrame = this.getFinwFrame();
    
    // Generate random integer between 900000 (9 lakhs) and 1000000 (1 million)
    const randomValue = () => Math.floor(Math.random() * (1000000 - 900000 + 1)) + 900000;
    
    // Exception limit fields:
    // cashXpnLimitDr = Cash Debit Limit Exception
    // clgXpnLimitDr  = Clearing Exception Limit (Dr.)
    // xferXpnLimitDr = Transfer Exception Limit (Dr.)
    // cashXpnLimitCr = Cash Credit Limit Exception
    // clgXpnLimitCr  = Clearing Exception Limit (Cr.)
    const fieldIds = [
      'cashXpnLimitDr',
      'clgXpnLimitDr',
      'xferXpnLimitDr',
      'cashXpnLimitCr',
      'clgXpnLimitCr'
    ];
    
    for (const fieldId of fieldIds) {
      try {
        const field = finwFrame.locator(`#${fieldId}`);
        if (await field.count() > 0) {
          await field.clear();
          await field.fill(String(randomValue()));
          await field.press('Tab');
          await this.page.waitForTimeout(500);
          console.log(`Filled field: ${fieldId}`);
        }
      } catch (e) {
        console.log(`Could not fill field ${fieldId}, skipping: ${e}`);
      }
    }
  }

  private async fillBasicAccountDetails(data: AccountData) {
    await this.functionOption.selectOption(data.functionOption);
    await this.page.waitForTimeout(1000);
    
    await this.currency.fill(data.ccy);
    await this.solId.fill(data.solId);
    await this.solId.press('Tab');
    await this.page.waitForTimeout(2000);
    
    await this.cifId.fill(data.cifCode);
    await this.cifId.press('Tab');
    await this.page.waitForTimeout(2000);
  }

  private async selectSchemeCode(schemeCode?: string) {
    const popupPromise = this.page.waitForEvent('popup', { timeout: 15000 });
    await this.schemeCodeLink.click();
    
    const popup = await popupPromise;
    await popup.waitForTimeout(3000);

    const criteriaFrame = popup.frame({ name: 'Search_SchemeCriteria' });
    if (!criteriaFrame) {
      throw new Error('Search_SchemeCriteria frame not found in popup!');
    }
    await criteriaFrame.locator('#Submit').click();
    await popup.waitForTimeout(3000);

    const resultsFrame = popup.frame({ name: 'Search_SchemeResults' });
    if (!resultsFrame) {
      throw new Error('Search_SchemeResults frame not found in popup!');
    }

    if (schemeCode) {
      const schemeLink = resultsFrame.locator(`table tr td:first-child a:has-text('${schemeCode}')`).first();
      const count = await schemeLink.count();
      if (count === 0) {
        console.log(`Scheme code ${schemeCode} not found in grid, falling back to random selection`);
        await this.selectRandomScheme(resultsFrame);
      } else {
        await schemeLink.click();
        console.log(`Selecting specific scheme: ${schemeCode}`);
      }
    } else {
      await this.selectRandomScheme(resultsFrame);
    }
    await this.page.waitForTimeout(3000);
  }

  private async selectRandomScheme(resultsFrame: Frame) {
    // Wait for grid to be populated
    await this.page.waitForTimeout(3000);
    const firstColumnLinks = await resultsFrame.locator('table tr td:first-child a').all();
    if (firstColumnLinks.length === 0) {
      throw new Error('No scheme options available in the grid!');
    }
    const randomIndex = Math.floor(Math.random() * firstColumnLinks.length);
    console.log(`Selecting random scheme option ${randomIndex + 1} of ${firstColumnLinks.length}`);
    await firstColumnLinks[randomIndex].click();
  }

  private async fillInterestDetails(forModification = false) {
    const finwFrame = this.getFinwFrame();
    
    try {
      await this.interestCreditAccount.selectOption('S');
      await this.page.waitForTimeout(1000);
    } catch (e) {
      console.log(`Could not set interest credit account, skipping: ${e}`);
    }

    try {
      const randomOffset = Math.floor(Math.random() * 28) + 1;
      const randomDate = new Date();
      randomDate.setDate(randomDate.getDate() + randomOffset);
      const dateStr = `${String(randomDate.getDate()).padStart(2, '0')}-${String(randomDate.getMonth() + 1).padStart(2, '0')}-${randomDate.getFullYear()}`;
      console.log(`Next interest calculation date: ${dateStr}`);
      await this.nextInterestDate.clear();
      await this.nextInterestDate.fill(dateStr);
      await this.nextInterestDate.press('Tab');
      await this.page.waitForTimeout(1000);
    } catch (e) {
      console.log(`Could not fill next interest date, skipping: ${e}`);
    }

    if (!forModification) return;

    // Modification-only: Credit Interest Pcnt. Min./Max. (two extra fields)
    // Min < Max rule: min is 1-2, max is always min+1 or min+2
    const minCr = Math.floor(Math.random() * 2) + 1;
    const maxCr = minCr + Math.floor(Math.random() * 2) + 1;
    console.log(`Credit Interest Pcnt: min=${minCr}, max=${maxCr}`);

    for (const [fieldId, value] of [['minIntPcntCr', minCr], ['maxIntPcntCr', maxCr]] as [string, number][]) {
      try {
        const field = finwFrame.locator(`#${fieldId}`);
        if (await field.count() > 0) {
          await field.clear();
          await field.fill(String(value));
          await field.press('Tab');
          await this.page.waitForTimeout(500);
          console.log(`Filled interest field: ${fieldId} = ${value}`);
        }
      } catch (e) {
        console.log(`Could not fill interest field ${fieldId}, skipping: ${e}`);
      }
    }
  }

  // ============ Tab Filling Orchestration ============
  private async fillAllTabs(dispatchMode: 'email' | 'post' = 'post', forModification = false) {
    await this.visitGeneralDetailsTab();
    await this.selectDispatchMode(dispatchMode);
    if (forModification) {
      await this.fillGeneralTabFields();
    }
    
    await this.visitInterestDetailsTab();
    await this.fillInterestDetails(forModification);
    
    await this.visitSchemeDetailsTab();
    await this.visitRelatedPartyTab();
    await this.visitMiscodesTab();
  }

  // ============ Account Creation Methods ============
  async createSavingsAccount(accountData: AccountData) {
    await this.fillBasicAccountDetails(accountData);
    await this.selectSchemeCode(accountData.schemeCode);
    await this.acceptButton.click();
    await this.page.waitForTimeout(3000);

    const dispatchMode = accountData.dispatchMode || 'post';
    await this.fillAllTabs(dispatchMode, false);
    await this.clickSubmit();
  }

  // ============ Current Account Creation Methods ============
  // Creates a current account via HOAACCA following the manual test steps:
  // basic details + scheme -> General (dispatch) -> Interest (Cr/Dr account =
  // S-Original a/c, month-end next interest dates) -> Scheme -> Related Party
  // -> MIS Codes -> Account Limits (expiry, document date, drawing power EQUAL)
  // -> Submit.
  async createCurrentAccount(accountData: AccountData) {
    await this.fillBasicAccountDetails(accountData);
    await this.selectSchemeCode(accountData.schemeCode);
    await this.acceptButton.click();
    await this.page.waitForTimeout(3000);

    // General Details tab - dispatch mode is mandatory
    await this.visitGeneralDetailsTab();
    await this.selectDispatchMode(accountData.dispatchMode || 'email');

    // Interest Details tab
    await this.visitInterestDetailsTab();
    await this.fillCurrentAccountInterestDetails();

    // Remaining detail tabs
    await this.visitSchemeDetailsTab();
    await this.visitRelatedPartyTab();
    await this.visitMiscodesTab();

    // Account Limits tab
    await this.visitAccountLimitsTab();
    await this.fillAccountLimits();

    await this.clickSubmit();
  }

  // Returns the last calendar day of the current month as dd-mm-yyyy.
  private monthEndDate(): string {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${String(last.getDate()).padStart(2, '0')}-${String(last.getMonth() + 1).padStart(2, '0')}-${last.getFullYear()}`;
  }

  // Returns today's date as dd-mm-yyyy.
  private todayDate(): string {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  }

  // Returns a future date (one year ahead) as dd-mm-yyyy.
  private futureDate(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  }

  // Finds the first <select> whose options contain the given keyword and
  // selects that option (by leading code, then by label). Returns true on
  // success. Used for fields whose ids are not known up-front (e.g. drawing
  // power indicator "EQUAL").
  private async selectDropdownContainingOption(keyword: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const selects = finwFrame.locator('select');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const select = selects.nth(i);
      // Skip disabled/hidden selects so we don't hang on locked fields that
      // happen to contain the keyword (e.g. "adjustAdvRent" on some schemes).
      if (!(await select.isEnabled().catch(() => false)) || !(await select.isVisible().catch(() => false))) {
        continue;
      }
      const opts = await select.locator('option').allTextContents();
      const match = opts.find(o => o.toLowerCase().includes(keyword.toLowerCase()));
      if (match) {
        try {
          await select.selectOption(match.split('-')[0].trim(), { timeout: 5000 });
        } catch {
          await select.selectOption({ label: match }, { timeout: 5000 }).catch(() => {});
        }
        console.log(`Selected option '${match}' (keyword '${keyword}')`);
        return true;
      }
    }
    console.log(`No enabled dropdown option matching '${keyword}' found`);
    return false;
  }

  // Fills a date field by trying each candidate id in order. Logs the visible
  // date-like input ids if none of the candidates are present, to aid in
  // identifying the correct selector.
  private async fillDateField(candidateIds: string[], value: string, label: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    for (const id of candidateIds) {
      const field = finwFrame.locator(`#${id}`);
      if (await field.count() > 0 && await field.first().isVisible().catch(() => false)) {
        await field.first().clear();
        await field.first().fill(value);
        await field.first().press('Tab');
        await this.page.waitForTimeout(1000);
        console.log(`Filled ${label} (#${id}): ${value}`);
        return true;
      }
    }
    const ids = await finwFrame.locator('input[id*="Dt"], input[id*="Date"]').evaluateAll(
      els => els.map(e => (e as HTMLElement).id).filter(Boolean)
    ).catch(() => [] as string[]);
    console.log(`Could not fill ${label}; available date input ids: ${JSON.stringify(ids)}`);
    return false;
  }

  private async fillCurrentAccountInterestDetails() {
    // Interest credit a/c -> S-Original a/c
    try {
      await this.interestCreditAccount.selectOption('S');
      await this.page.waitForTimeout(1000);
      console.log('Set interest credit account to S-Original a/c');
    } catch (e) {
      console.log(`Could not set interest credit account, skipping: ${e}`);
    }

    // Interest debit a/c -> S-Original a/c
    try {
      if (await this.interestDebitAccount.count() > 0) {
        await this.interestDebitAccount.selectOption('S');
        await this.page.waitForTimeout(1000);
        console.log('Set interest debit account to S-Original a/c');
      } else {
        await this.selectDropdownContainingOption('Original');
      }
    } catch (e) {
      console.log(`Could not set interest debit account, skipping: ${e}`);
    }

    // Next interest calculation dates (Cr and Dr) -> month-end date
    const monthEnd = this.monthEndDate();
    await this.fillDateField(['nextIntCrCalcDt_ui', 'nextIntCalcDt_ui'], monthEnd, 'Next interest calc date (Cr)');
    await this.fillDateField(['nextIntDrCalcDt_ui'], monthEnd, 'Next interest calc date (Dr)');
  }

  async visitAccountLimitsTab() {
    await this.clickTab('Account Limits', 'accountlimits');
  }

  private async fillAccountLimits() {
    // Expiry date - any future date
    await this.fillDateField(
      ['expiryDate_ui', 'limitExpiryDt_ui', 'expiryDt_ui', 'limExpiryDt_ui'],
      this.futureDate(),
      'Account limit expiry date'
    );

    // Document date - date of account opening (today)
    await this.fillDateField(
      ['documentDate_ui', 'docDt_ui', 'limitDocDt_ui', 'documentDt_ui'],
      this.todayDate(),
      'Account limit document date'
    );

    // Drawing power indicator -> EQUAL
    const finwFrame = this.getFinwFrame();
    const dpById = finwFrame.locator('#drawingPowerInd, #dpInd, #drawPowerInd').first();
    try {
      if (await dpById.count() > 0) {
        const options = await dpById.locator('option').allTextContents();
        const match = options.find(o => o.toLowerCase().includes('equal'));
        if (match) {
          await dpById.selectOption(match.split('-')[0].trim());
        } else {
          await this.selectDropdownContainingOption('EQUAL');
        }
      } else {
        await this.selectDropdownContainingOption('EQUAL');
      }
      await this.page.waitForTimeout(1000);
      console.log('Set drawing power indicator to EQUAL');
    } catch (e) {
      console.log(`Could not set drawing power indicator, skipping: ${e}`);
    }
  }

  // ============ Account Modification Methods ============
  async modifySavingsAccount(dispatchMode: 'email' | 'post' = 'post') {
    // Click Go (Accept) to load the account into the modification screen
    await this.acceptButton.click();
    await this.page.waitForTimeout(3000);

    // Fill all tabs including limit and interest pcnt fields (modification only)
    await this.fillAllTabs(dispatchMode, true);

    // Submit the modifications
    await this.clickSubmit();

    // Confirm the modifications if a confirm button is shown
    if (await this.confirmButton.count() > 0) {
      await this.confirmButton.click();
      console.log('Clicked Confirm button');
      await this.page.waitForTimeout(5000);
    } else {
      console.log('No Confirm button found, skipping confirmation');
    }
  }

  async saveSavingsAccount() {
    await this.acceptButton.click();
    await this.page.waitForTimeout(3000);
  }

  async clickSubmit() {
    const selector = '#Submit, input[type="submit"][value="Submit" i], input[type="button"][value="Submit" i], button:has-text("Submit")';
    try {
      const finwFrame = this.getFinwFrame();
      const submitBtn = finwFrame.locator(selector).first();
      await submitBtn.waitFor({ state: 'visible', timeout: 15000 });
      await submitBtn.scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(1000);
      await submitBtn.click();
      await this.page.waitForTimeout(5000);
      console.log('Clicked Submit button');
      return;
    } catch (e) {
      console.log(`Submit not found in FINW frame, searching all frames: ${e}`);
    }

    // Fallback: the Submit button may live in a different frame.
    for (const frame of this.page.frames()) {
      const btn = frame.locator(selector).first();
      if (await btn.count().catch(() => 0) > 0 && await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await this.page.waitForTimeout(5000);
        console.log(`Clicked Submit button in frame '${frame.name() || 'main'}'`);
        return;
      }
    }
    console.log('Could not click Submit button in any frame');
  }

  // ============ HACM (Customer Account Maintenance) Methods ============
  // Finds the <select> on the screen that contains an option matching the
  // desired function text (e.g. "Modify" / "M - Modify"), regardless of its id.
  private async findFunctionDropdown(value: string): Promise<Locator | null> {
    const finwFrame = this.getFinwFrame();

    // Prefer the known id if present
    const known = finwFrame.locator('#templateFunction');
    if (await known.count() > 0) {
      return known;
    }

    const selects = finwFrame.locator('select');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const opts = await selects.nth(i).locator('option').allTextContents();
      if (opts.some(o => o.toLowerCase().includes(value.toLowerCase()))) {
        return selects.nth(i);
      }
    }
    return null;
  }

  async selectFunction(value: string) {
    try {
      const dropdown = await this.findFunctionDropdown(value);
      if (!dropdown) {
        console.log(`Function dropdown not found for '${value}', skipping`);
        return;
      }
      await dropdown.waitFor({ state: 'visible', timeout: 15000 });

      // Log available options for diagnostics
      const options = await dropdown.locator('option').allTextContents();
      console.log(`Function dropdown options: ${JSON.stringify(options)}`);

      // Find the option whose visible text matches the desired function
      // e.g. value "Modify" matches "M - Modify". Then select by its leading
      // code value ("M"), which is the most reliable for native <select>.
      const matchLabel = options.find(o => o.toLowerCase().includes(value.toLowerCase()));
      if (matchLabel) {
        const code = matchLabel.split('-')[0].trim();
        try {
          await dropdown.selectOption(code);
        } catch {
          await dropdown.selectOption({ label: matchLabel });
        }
      } else {
        await dropdown.selectOption(value);
      }
      await this.page.waitForTimeout(1000);
      console.log(`Selected function: ${value}`);
    } catch (e) {
      console.log(`Could not select function '${value}', skipping: ${e}`);
    }
  }

  // Enters the account id on the HACM screen. Tries known field ids, then
  // falls back to the first visible text input on the form.
  async enterHacmAccountId(accountId: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const candidates = ['#tempForacid', '#acctId', '#acctNum', '#acctNo', '#foracid'];
      for (const sel of candidates) {
        const field = finwFrame.locator(sel);
        if (await field.count() > 0 && await field.first().isVisible().catch(() => false)) {
          await field.first().fill(accountId);
          await field.first().press('Tab');
          await this.page.waitForTimeout(2000);
          console.log(`Entered HACM account ID in ${sel}: ${accountId}`);
          return;
        }
      }
      // Fallback: first visible text input
      const textInput = finwFrame.locator('input[type="text"]:visible').first();
      await textInput.fill(accountId);
      await textInput.press('Tab');
      await this.page.waitForTimeout(2000);
      console.log(`Entered HACM account ID in first visible text input: ${accountId}`);
    } catch (e) {
      console.log(`Could not enter HACM account ID, skipping: ${e}`);
    }
  }

  async clickGo() {
    const finwFrame = this.getFinwFrame();
    // The HACM screen uses a "Go" button; fall back to the Accept button id
    const goBtn = finwFrame.locator('#Go, input[value="Go"], button:has-text("Go")').first();
    if (await goBtn.count() > 0) {
      await goBtn.click();
    } else {
      await this.acceptButton.click();
    }
    await this.page.waitForTimeout(3000);
    console.log('Clicked Go button');
  }

  // Loads an existing current account in HACM inquiry mode and reads its
  // scheme code from the Scheme tab, so a replica account can be created with
  // the same scheme. Returns the scheme code, or undefined if it cannot be
  // read (candidate field ids are logged for diagnostics).
  async getAccountSchemeCode(accountId: string): Promise<string | undefined> {
    await this.selectFunction('Inquiry');
    await this.enterHacmAccountId(accountId);
    await this.clickGo();

    await this.visitTab('Scheme');
    await this.page.waitForTimeout(2000);

    const finwFrame = this.getFinwFrame();
    const candidates = [
      '#schmCode',
      '#schemeCode',
      '#schmCode_ui',
      'input[id*="schm" i]',
      'input[id*="scheme" i]',
    ];
    for (const sel of candidates) {
      const el = finwFrame.locator(sel).first();
      if (await el.count() > 0) {
        const value = (await el.inputValue().catch(() => ''))
          || (await el.innerText().catch(() => ''));
        if (value && value.trim()) {
          console.log(`Read source account scheme code from ${sel}: ${value.trim()}`);
          return value.trim();
        }
      }
    }

    const ids = await finwFrame
      .locator('input[id*="schm" i], input[id*="scheme" i]')
      .evaluateAll(els => els.map(e => (e as HTMLElement).id).filter(Boolean))
      .catch(() => [] as string[]);
    console.log(`Could not read scheme code; candidate scheme input ids: ${JSON.stringify(ids)}`);
    return undefined;
  }

  async submitForm() {
    await this.clickSubmit();
  }

  // Clicks the OK button on the confirmation shown after submitting.
  async clickOkButton() {
    try {
      const finwFrame = this.getFinwFrame();
      const okBtn = finwFrame
        .locator('#OK, #Ok, #ok, input[value="OK"], input[value="Ok"], button:has-text("OK")')
        .first();
      if (await okBtn.count() > 0) {
        await okBtn.click({ timeout: 15000 });
        console.log('Clicked OK button');
        await this.page.waitForTimeout(3000);
      } else {
        console.log('OK button not found, skipping');
      }
    } catch (e) {
      console.log(`Could not click OK button, skipping: ${e}`);
    }
  }

  // Clicks the Accept button shown after the loan A/c ID is generated to
  // finalise creation. Searches all frames in case it renders outside FINW.
  async clickAccept() {
    const selector =
      '#Accept, #accept, input[value="Accept" i], ' +
      'input[type="submit"][value*="Accept" i], input[type="button"][value*="Accept" i], ' +
      'button:has-text("Accept"), a:has-text("Accept")';
    try {
      const finwFrame = this.getFinwFrame();
      const btn = finwFrame.locator(selector).first();
      if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click({ timeout: 15000 });
        await this.page.waitForTimeout(3000);
        console.log('Clicked Accept button');
        return;
      }
    } catch (e) {
      console.log(`Accept not found in FINW frame, searching all frames: ${e}`);
    }
    for (const frame of this.page.frames()) {
      const btn = frame.locator(selector).first();
      if (await btn.count().catch(() => 0) > 0 && await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click({ timeout: 15000 }).catch(() => {});
        await this.page.waitForTimeout(3000);
        console.log(`Clicked Accept button in frame '${frame.name() || 'main'}'`);
        return;
      }
    }
    console.log('Accept button not found in any frame, skipping');
  }

  // Handles the Finacle "Warning and Exception Dialog" that opens as a separate
  // popup window (excp_popup_screen.jsp) after Submit. Clicks Accept to proceed
  // past non-blocking warnings/exceptions (e.g. "GL SUB HEAD CODE ... DIFFERENT
  // FROM DEFAULT VALUE", "CUSTOMER AGE EXCEEDS PERMISSIBLE LIMIT"). Accepts every
  // popup that appears in sequence. Returns true if any popup was accepted.
  async acceptWarningPopup(): Promise<boolean> {
    const selector =
      '#Accept, #accept, input[value="Accept" i], ' +
      'input[type="submit"][value*="Accept" i], input[type="button"][value*="Accept" i], ' +
      'button:has-text("Accept")';
    let acceptedAny = false;

    // Finacle may raise several warning/exception popups in sequence, so keep
    // accepting until none remain (cap the loop to avoid spinning forever).
    for (let attempt = 0; attempt < 10; attempt++) {
      await this.page.waitForTimeout(1500);
      let acceptedThisRound = false;

      for (const p of this.page.context().pages()) {
        if (p === this.page || p.isClosed()) continue;
        const url = p.url();
        const title = (await p.title().catch(() => '')) || '';
        if (/excp_popup|excp_|warning|exception/i.test(url) || /warning|exception/i.test(title)) {
          const btn = p.locator(selector).first();
          if (await btn.count().catch(() => 0) > 0) {
            const desc = (await p.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200);
            console.log(`Warning/Exception popup detected: ${desc}`);
            await btn.click({ timeout: 15000 }).catch(() => {});
            await this.page.waitForTimeout(2000);
            console.log('Clicked Accept on warning/exception popup');
            acceptedAny = true;
            acceptedThisRound = true;
            break;
          }
        }
      }

      if (!acceptedThisRound) break;
    }

    return acceptedAny;
  }

  // ============ Verification Methods ============
  async verifyAccountCreated(): Promise<{ success: boolean; message?: string; accountNumber?: string; allFields?: Record<string, string> }> {
    const finwFrame = this.getFinwFrame();
    const bodyText = await finwFrame.locator('body').innerText();
    
    const success = bodyText.includes('New A/c. ID')
      || bodyText.includes('modified successfully')
      || bodyText.includes('Account Number')
      || bodyText.includes('successfully')
      || bodyText.includes('generated');
    
    const accountNumber = await this.getAccountId() ?? undefined;
    
    // Capture all visible input and label fields
    const allFields: Record<string, string> = {};
    try {
      const inputs = finwFrame.locator('input[type="text"], input[type="hidden"], label, span, td');
      const count = await inputs.count();
      for (let i = 0; i < Math.min(count, 50); i++) {
        const element = inputs.nth(i);
        const text = await element.textContent();
        const id = await element.getAttribute('id');
        const name = await element.getAttribute('name');
        if (text && text.trim()) {
          const key = id || name || `field_${i}`;
          allFields[key] = text.trim();
        }
      }
    } catch (e) {
      console.log('Could not capture all fields:', e);
    }
    
    return {
      success,
      message: success ? 'Operation completed successfully' : 'Operation failed',
      accountNumber,
      allFields
    };
  }

  async getAccountId(): Promise<string | null> {
    const finwFrame = this.getFinwFrame();
    const accountLabel = this.accountNumLabel;
    if (await accountLabel.count() > 0) {
      const accountId = await accountLabel.innerText();
      console.log(`Extracted Account ID from #AcctNum: ${accountId}`);
      return accountId;
    }
    const accountInput = finwFrame.locator('#acctId, #accountId, #accountNumber, input[name*="acct"], input[name*="account"]').first();
    if (await accountInput.count() > 0) {
      return await accountInput.inputValue();
    }
    return null;
  }

  async enterAccountId(accountId: string) {
    const accountInput = this.tempForacid;
    if (await accountInput.count() > 0) {
      await accountInput.fill(accountId);
      await accountInput.press('Tab');
      console.log(`Entered Account ID in tempForacid: ${accountId}`);
    } else {
      console.log('tempForacid input field not found on modification screen');
    }
  }

  // ============ HACM Related Party Methods ============
  // Sets the Next Print Date field on the General Details tab. Defaults to
  // today's date; pass a DD-MM-YYYY string to use a specific (e.g. future) date.
  async setNextPrintDate(date?: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const today = new Date();
      const dateStr = date ?? `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

      const candidates = [
        '#nextPrntDate_ui',
        '#nextPrintDt_ui',
        '#nextPrintCalcDt_ui',
        '#nextStmtDt_ui',
        'input[id*="rntDate" i]',
        'input[id*="rintDate" i]'
      ];
      for (const sel of candidates) {
        const field = finwFrame.locator(sel).first();
        if (await field.count() > 0 && await field.isVisible().catch(() => false)) {
          await field.clear();
          await field.fill(dateStr);
          await field.press('Tab');
          await this.page.waitForTimeout(1000);
          console.log(`Set next print date in ${sel}: ${dateStr}`);
          return;
        }
      }
      console.log('Next print date field not found, skipping');
    } catch (e) {
      console.log(`Could not set next print date, skipping: ${e}`);
    }
  }

  // Clicks the ADD button within the Related Party Details section to add a
  // new related party row.
  async clickRelatedPartyAdd() {
    try {
      const finwFrame = this.getFinwFrame();
      const addBtn = finwFrame.locator('#relParty_AddNew');
      await addBtn.waitFor({ state: 'visible', timeout: 15000 });
      await addBtn.scrollIntoViewIfNeeded();
      await addBtn.click();
      await this.page.waitForTimeout(2500);
      console.log('Clicked Related Party Add button');
    } catch (e) {
      console.log(`Could not click Related Party Add button, skipping: ${e}`);
    }
  }

  // Navigates the multi-record Related Party section to the Nth record (1-based)
  // using the record navigator arrows shown as "Record X of Y".
  async goToRelatedPartyRecord(recordNumber: number) {
    try {
      const finwFrame = this.getFinwFrame();
      const nextRec = finwFrame.locator('#relParty_NextRec');
      if (await nextRec.count() === 0) {
        console.log('Related party record navigator (#relParty_NextRec) not found, skipping');
        return;
      }
      for (let i = 1; i < recordNumber; i++) {
        await nextRec.scrollIntoViewIfNeeded();
        await nextRec.click();
        await this.page.waitForTimeout(2000);
        console.log(`Advanced to related party record ${i + 1}`);
      }
    } catch (e) {
      console.log(`Could not navigate related party records, skipping: ${e}`);
    }
  }

  // Marks the currently displayed related party record for deletion by ticking
  // the "Record" DEL checkbox (above the language preference field).
  async markRelatedPartyRecordForDeletion() {
    try {
      const finwFrame = this.getFinwFrame();
      const box = finwFrame.locator('#chkdelFlg, input[name="relatedpartydetails.chkdelFlg"]').first();
      await box.waitFor({ state: 'visible', timeout: 15000 });
      await box.scrollIntoViewIfNeeded();
      await box.check();
      await this.page.waitForTimeout(1000);
      console.log('Marked related party record for deletion (chkdelFlg)');
    } catch (e) {
      console.log(`Could not mark related party record for deletion, skipping: ${e}`);
    }
  }

  // Returns whether the current related party record's DEL checkbox is ticked
  // (used during verification to confirm the record is pending deletion).
  async isRelatedPartyMarkedForDeletion(): Promise<boolean> {
    try {
      const finwFrame = this.getFinwFrame();
      const box = finwFrame.locator('#chkdelFlg, input[name="relatedpartydetails.chkdelFlg"]').first();
      await box.waitFor({ state: 'visible', timeout: 15000 });
      const checked = await box.isChecked();
      console.log(`Related party DEL checkbox checked: ${checked}`);
      return checked;
    } catch (e) {
      console.log(`Could not read related party DEL checkbox, skipping: ${e}`);
      return false;
    }
  }

  // Selects the relation type (e.g. "Joint Holder") in the related party row.
  async selectRelationType(value: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const dropdown = finwFrame.locator('#relnType');
      await dropdown.waitFor({ state: 'visible', timeout: 15000 });
      const options = await dropdown.locator('option').allTextContents();
      const match = options.find(o => o.toLowerCase().includes(value.toLowerCase()));
      if (match) {
        const code = match.split('-')[0].trim();
        try {
          await dropdown.selectOption(code);
        } catch {
          await dropdown.selectOption({ label: match });
        }
        await this.page.waitForTimeout(1500);
        console.log(`Selected relation type: ${match}`);
      } else {
        console.log(`Relation type '${value}' not found in options ${JSON.stringify(options)}`);
      }
    } catch (e) {
      console.log(`Could not select relation type '${value}', skipping: ${e}`);
    }
  }

  // Enters the relation code (e.g. "Others") in the related party row and
  // presses Tab so the description auto-populates.
  async selectRelationCode(value: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const field = finwFrame.locator('#relnCode');
      await field.waitFor({ state: 'visible', timeout: 15000 });
      await field.clear();
      await field.fill(value);
      await field.press('Tab');
      await this.page.waitForTimeout(2000);
      const desc = await finwFrame.locator('#relnDesc').inputValue().catch(() => '');
      console.log(`Entered relation code: ${value} (description: ${desc})`);
    } catch (e) {
      console.log(`Could not enter relation code '${value}', skipping: ${e}`);
    }
  }

  // Enters the CIF number in the related party row and presses Tab so the
  // customer details auto-populate.
  async enterRelatedPartyCif(cif: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const field = finwFrame.locator('input[name="relatedpartydetails.cifId"], #cifId').last();
      await field.waitFor({ state: 'visible', timeout: 15000 });
      await field.fill(cif);
      await field.press('Tab');
      await this.page.waitForTimeout(3000);
      const name = await finwFrame.locator('#custName').inputValue().catch(() => '');
      console.log(`Entered related party CIF: ${cif} (customer: ${name})`);
    } catch (e) {
      console.log(`Could not enter related party CIF, skipping: ${e}`);
    }
  }

  // ============ HAFSM (Account Freeze / Stop Maintenance) Methods ============
  // Selects the Freeze Code (e.g. "Total Freeze"). On HAFSM this is a set of
  // radio buttons named "afsm.freezeCode" (T-Total, D-Debit, C-Credit); on
  // other screens it may be a <select>. Both are handled.
  async selectFreezeCode(value: string) {
    try {
      const finwFrame = this.getFinwFrame();

      // Map the human label to the Finacle freeze-code value.
      const lower = value.toLowerCase();
      const targetValue = lower.includes('total') ? 'T'
        : lower.includes('debit') ? 'D'
        : lower.includes('credit') ? 'C'
        : value;

      // 1) Radio-button group (HAFSM).
      const radio = finwFrame
        .locator(`input[type="radio"][name*="freezeCode" i][value="${targetValue}"], input[type="radio"]#freezeCode[value="${targetValue}"]`)
        .first();
      if (await radio.count() > 0) {
        await radio.check();
        await this.page.waitForTimeout(1500);
        console.log(`Selected freeze code radio: ${value} (value=${targetValue})`);
        return;
      }

      // 2) <select> dropdown fallback.
      let dropdown: Locator | null = null;
      const selectCandidates = ['#freezeCode', '#frzCode', '#freezeType', '#acctFreezeCode', 'select[id*="freeze" i]', 'select[id*="frz" i]'];
      for (const sel of selectCandidates) {
        const loc = finwFrame.locator(sel).first();
        if (await loc.count() > 0 && (await loc.evaluate(el => el.tagName).catch(() => '')) === 'SELECT') {
          dropdown = loc;
          break;
        }
      }
      if (!dropdown) {
        const selects = finwFrame.locator('select');
        const count = await selects.count();
        for (let i = 0; i < count; i++) {
          const opts = await selects.nth(i).locator('option').allTextContents();
          if (opts.some(o => o.toLowerCase().includes(lower))) {
            dropdown = selects.nth(i);
            break;
          }
        }
      }
      if (!dropdown) {
        console.log(`Freeze code field not found for '${value}', skipping`);
        return;
      }
      const options = await dropdown.locator('option').allTextContents();
      console.log(`Freeze code options: ${JSON.stringify(options)}`);
      const match = options.find(o => o.toLowerCase().includes(lower));
      if (match) {
        const code = match.split('-')[0].trim();
        try {
          await dropdown.selectOption(code);
        } catch {
          await dropdown.selectOption({ label: match });
        }
      } else {
        await dropdown.selectOption(targetValue);
      }
      await this.page.waitForTimeout(1500);
      console.log(`Selected freeze code: ${value}`);
    } catch (e) {
      console.log(`Could not select freeze code '${value}', skipping: ${e}`);
    }
  }

  // Sets Freeze Reason Code 1 (e.g. "31015 - CDD required"). Tries to type the
  // code directly into the reason field (the description resolves on Tab); if
  // no input field is found, opens the search-list popup and picks the row that
  // contains the code.
  async selectFreezeReasonCode(code: string) {
    const finwFrame = this.getFinwFrame();

    // 1) Try typing the code directly into a reason-code input.
    const inputCandidates = [
      '#freezeReasonCode',
      '#frzReasonCode',
      '#freezeRsnCode1',
      '#frzReasonCode1',
      '#freezeReasonCode1',
      'input[id*="reason" i]',
      'input[id*="rsn" i]',
    ];
    for (const sel of inputCandidates) {
      const field = finwFrame.locator(sel).first();
      if (await field.count() > 0 && await field.isVisible().catch(() => false)) {
        await field.clear();
        await field.fill(code);
        await field.press('Tab');
        await this.page.waitForTimeout(2000);
        console.log(`Entered freeze reason code in ${sel}: ${code}`);
        return;
      }
    }

    // 2) Fall back to a search-list popup (hyperlink/picker next to the field).
    try {
      const searchLink = finwFrame
        .locator('a[id*="rsn" i], a[id*="reason" i], a[id*="freeze" i], img[title*="Search" i]')
        .first();
      if (await searchLink.count() > 0) {
        const popupPromise = this.page.waitForEvent('popup', { timeout: 15000 });
        await searchLink.click();
        const popup = await popupPromise;
        await popup.waitForTimeout(3000);
        const row = popup.locator(`table tr:has-text("${code}") a, table tr td a:has-text("${code}")`).first();
        if (await row.count() > 0) {
          await row.click();
          await this.page.waitForTimeout(2000);
          console.log(`Selected freeze reason code from search list: ${code}`);
          return;
        }
        console.log(`Freeze reason code ${code} not found in search popup`);
        await popup.close().catch(() => {});
      }
    } catch (e) {
      console.log(`Freeze reason code search-list flow failed: ${e}`);
    }

    const ids = await finwFrame
      .locator('input')
      .evaluateAll(els => els.map(e => (e as HTMLElement).id).filter(Boolean))
      .catch(() => [] as string[]);
    console.log(`Could not set freeze reason code; available input ids: ${JSON.stringify(ids)}`);
  }

  // After clicking Go, the matched account is shown in a results grid. Ticks
  // the checkbox beside the account id row.
  async selectAccountRowCheckbox() {
    try {
      const finwFrame = this.getFinwFrame();
      const checkbox = finwFrame
        .locator(
          'table input[type="checkbox"]:visible, ' +
          'input[type="checkbox"][name*="select" i]:visible, ' +
          'input[type="checkbox"][id*="chk" i]:visible'
        )
        .first();
      await checkbox.waitFor({ state: 'visible', timeout: 15000 });
      await checkbox.scrollIntoViewIfNeeded();
      await checkbox.check();
      await this.page.waitForTimeout(1000);
      console.log('Selected account row checkbox');
    } catch (e) {
      console.log(`Could not select account row checkbox, skipping: ${e}`);
    }
  }

  // ============ Retail Loan (HOAACLA) Methods ============

  // Diagnostic helper: logs id/name/type and nearby label text of every visible
  // input and select in the FINW frame. Used to identify unknown loan field
  // selectors from a test run so they can be locked in afterwards.
  async logVisibleFields(context: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const fields = await finwFrame.locator('input:visible, select:visible, textarea:visible').evaluateAll(els =>
        els.map(el => {
          const e = el as HTMLInputElement;
          const tag = el.tagName.toLowerCase();
          const type = (e.type || '').toLowerCase();
          const row = el.closest('tr');
          const near = (row?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50);
          const opts = tag === 'select'
            ? Array.from((el as unknown as HTMLSelectElement).options).map(o => o.text.trim()).slice(0, 8)
            : [];
          return { tag, id: (e.id || '').trim(), name: e.name, type, near, opts };
        })
          .filter(f => f.id || f.name)
          // Drop tab-anchor checkboxes and non-data controls so the real
          // loan input fields surface in the log.
          .filter(f => !['checkbox', 'hidden', 'button', 'submit', 'image', 'reset'].includes(f.type))
          .filter(f => !/^chk/i.test(f.id))
      );
      console.log(`[FIELDS @ ${context}] ${JSON.stringify(fields)}`);
    } catch (e) {
      console.log(`Could not log fields @ ${context}: ${e}`);
    }
  }

  // Diagnostic: maps each loan tab toggle (the chk* checkboxes) to its visible
  // caption so the real tab anchors/labels can be identified.
  async logLoanTabs() {
    try {
      const finwFrame = this.getFinwFrame();
      const tabs = await finwFrame.locator('a').evaluateAll(els =>
        els.map(el => {
          const a = el as HTMLAnchorElement;
          return {
            id: a.id || '',
            cls: (a.className || '').slice(0, 25),
            txt: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 25),
            onclick: (a.getAttribute('onclick') || '').slice(0, 45),
          };
        }).filter(t => (t.id && t.id.length > 1) || (t.txt && t.txt.length > 1))
      );
      console.log(`[TABS] ${JSON.stringify(tabs)}`);
    } catch (e) {
      console.log(`Could not log loan tabs: ${e}`);
    }
  }

  // Loan header: Function (Open) + currency + sol id + CIF + scheme code, then
  // clicks Accept (Go) to open the loan detail tabs. Resilient + diagnostic so
  // unknown HOAACLA header field ids are surfaced rather than hanging.
  async openLoanHeader(data: { functionOption?: string; ccy: string; solId: string; cifCode: string; schemeCode?: string }) {
    await this.logVisibleFields('Loan header (initial)');
    const finwFrame = this.getFinwFrame();

    // Function -> Open (O)
    const fn = finwFrame.locator('#templateFunction');
    if (await fn.count() > 0) {
      await fn.selectOption(data.functionOption ?? 'O').catch(() => this.selectOptionByLabel('function', 'open'));
    } else {
      await this.selectOptionByLabel('function', 'open');
    }
    await this.page.waitForTimeout(1000);

    // Currency / Sol id / CIF id
    await this.setTextByCandidates(['crncyCode', 'currencyCode', 'ccyCode', 'crncy'], data.ccy, 'Currency');
    await this.setTextByCandidates(['solId', 'solID', 'soL_id'], data.solId, 'Sol id');
    await this.setTextByCandidates(['cifId', 'custId', 'cifID'], data.cifCode, 'CIF id');

    // Scheme code via search popup (guarded)
    try {
      await this.selectSchemeCode(data.schemeCode);
    } catch (e) {
      console.log(`Could not select scheme via popup, skipping: ${e}`);
    }

    // Accept / Go
    const accept = finwFrame.locator('#Accept, #Go, input[value="Go" i], input[value="Accept" i]').first();
    if (await accept.count() > 0) {
      await accept.click({ timeout: 15000 }).catch(e => console.log(`Could not click Accept/Go: ${e}`));
    } else {
      console.log('Accept/Go button not found on loan header');
    }
    await this.page.waitForTimeout(4000);
    console.log('Loan header submitted (Accept/Go clicked)');
  }

  // Navigates to a loan tab by its visible label (with optional anchor id).
  async visitLoanTab(label: string, idFallback?: string) {
    await this.clickTab(label, idFallback);
    console.log(`Visited loan tab: ${label}`);
  }

  // Fills the first visible field matching one of the candidate ids. Returns
  // true on success, logs the attempted ids otherwise.
  private async setTextByCandidates(ids: string[], value: string, label: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    for (const id of ids) {
      const el = finwFrame.locator(`#${id}`).first();
      if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
        await el.clear().catch(() => {});
        await el.fill(value);
        await el.press('Tab');
        await this.page.waitForTimeout(800);
        console.log(`Filled ${label} (#${id}) = ${value}`);
        return true;
      }
    }
    console.log(`Could not fill ${label}; tried ids ${JSON.stringify(ids)}`);
    return false;
  }

  // Clears the first visible field matching one of the candidate ids.
  private async clearTextByCandidates(ids: string[], label: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    for (const id of ids) {
      const el = finwFrame.locator(`#${id}`).first();
      if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
        await el.clear();
        await el.press('Tab');
        await this.page.waitForTimeout(500);
        console.log(`Cleared ${label} (#${id})`);
        return true;
      }
    }
    console.log(`Could not clear ${label}; tried ids ${JSON.stringify(ids)}`);
    return false;
  }

  // Selects an option (matched by keyword) in the <select> whose id or nearby
  // row/label text contains labelKeyword. Skips disabled selects to avoid the
  // action waiting until timeout on a read-only field.
  async selectOptionByLabel(labelKeyword: string, optionKeyword: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const selects = finwFrame.locator('select');
    const count = await selects.count();
    const lblKey = labelKeyword.toLowerCase();
    const lblId = labelKeyword.replace(/\s/g, '').toLowerCase();
    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);
      const meta = await sel.evaluate(el => {
        const s = el as HTMLSelectElement;
        const row = el.closest('tr');
        return { id: s.id, disabled: s.disabled, near: (row?.innerText || '').toLowerCase() };
      }).catch(() => null);
      if (!meta || meta.disabled) continue;
      if (!meta.near.includes(lblKey) && !(meta.id || '').toLowerCase().includes(lblId)) continue;

      const opts = await sel.locator('option').allTextContents();
      const match = opts.find(o => o.toLowerCase().includes(optionKeyword.toLowerCase()));
      if (match) {
        try {
          await sel.selectOption(match.split('-')[0].trim(), { timeout: 8000 });
        } catch {
          await sel.selectOption({ label: match }, { timeout: 8000 });
        }
        await this.page.waitForTimeout(800);
        console.log(`Selected '${match}' for label '${labelKeyword}' (#${meta.id})`);
        return true;
      }
    }
    console.log(`Could not select '${optionKeyword}' for label '${labelKeyword}'`);
    return false;
  }

  // Selects an option (by exact visible label, with a value fallback) in the
  // <select> with the given id. Skips silently when the select is missing or
  // disabled so the run never hangs on a read-only/scheme-locked field.
  private async selectByIdSafe(id: string, optionLabel: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const el = finwFrame.locator(`#${id}`).first();
    if (await el.count() === 0) {
      console.log(`Select #${id} not found, skipping`);
      return false;
    }
    if (await el.isDisabled().catch(() => true)) {
      console.log(`Select #${id} is disabled, skipping`);
      return false;
    }
    try {
      await el.selectOption({ label: optionLabel }, { timeout: 8000 });
      console.log(`Selected '${optionLabel}' in #${id}`);
      return true;
    } catch {
      try {
        await el.selectOption(optionLabel, { timeout: 4000 });
        console.log(`Selected '${optionLabel}' (by value) in #${id}`);
        return true;
      } catch (e) {
        console.log(`Could not select '${optionLabel}' in #${id}: ${e}`);
        return false;
      }
    }
  }

  // Step 4: General details - A/c statement (mandatory) -> None.
  async setLoanAccountStatementNone() {
    const ok = await this.selectOptionByLabel('statement', 'none');
    if (!ok) {
      await this.setTextByCandidates(['stmtFreq', 'acctStmtFreq'], 'N', 'A/c statement');
    }
  }

  // Step 5: Loan details - loan amount, loan period (months), operative a/c id.
  async fillLoanDetails(data: { loanAmount: string; loanPeriodMonths: string; operativeAccountId: string }) {
    await this.setTextByCandidates(
      ['loanAmt', 'sancLimAmt', 'santnAmt', 'loanLimitAmt', 'limitAmt'],
      data.loanAmount, 'Loan amount'
    );
    await this.setTextByCandidates(
      ['loanPerdMths', 'loanPeriodMonths', 'loanTermMonths', 'tenureMonths'],
      data.loanPeriodMonths, 'Loan period (months)'
    );
    // Loan period - days: keep blank
    await this.clearTextByCandidates(
      ['loanPerdDays', 'loanPeriodDays', 'loanTermDays', 'tenureDays'],
      'Loan period (days)'
    );
    await this.setTextByCandidates(
      ['operacct', 'operativeAcctId', 'operAcctId', 'opAcctId', 'repayAcctId'],
      data.operativeAccountId, 'Operative a/c id'
    );
  }

  // Step 8: Payment plan - number of instalments.
  async setNumberOfInstalments(count: string) {
    await this.setTextByCandidates(
      ['noOfInstlmnts', 'noOfInstallments', 'noOfInstalments', 'numInstallments'],
      count, 'Number of instalments'
    );
  }

  // Steps 9-11: Payment plan - Holiday period configuration.
  //  9: Normal holiday period -> blank; Interest during holiday period -> None.
  // 10: Interest frequency during holiday period -> Select; date -> Date.
  // 11: Holiday status -> Holiday; calendar -> Select.
  // All holiday-period dropdowns use the hol*/hldy* ids. Disabled selects
  // (locked by certain schemes) are skipped to avoid hangs.
  async configureLoanHolidayPeriod() {
    // Step 9
    await this.clearTextByCandidates(['hldyPerdMths'], 'Normal holiday period');
    await this.selectByIdSafe('hldyPerdIntFlg', 'N-None');
    // Step 10
    await this.selectByIdSafe('holFreqType', 'Select');
    await this.selectByIdSafe('holFreqStartDate', 'Date');
    // Step 11
    await this.selectByIdSafe('holHldyStatus', 'Holiday');
    await this.selectByIdSafe('holFreqCalBase', 'Select');
  }

  // Step 12: Payment schedule - click amortization schedule then OK.
  async generateAmortizationSchedule() {
    const finwFrame = this.getFinwFrame();
    const btn = finwFrame.locator(
      '#amortizationSchedule, input[value*="Amortization" i], input[value*="Amortisation" i], a:has-text("Amortization"), a:has-text("Amortisation"), button:has-text("Amortization")'
    ).first();
    if (await btn.count() > 0) {
      await btn.click({ timeout: 15000 });
      await this.page.waitForTimeout(3000);
      console.log('Clicked Amortization schedule');
    } else {
      console.log('Amortization schedule button not found');
    }
    await this.clickOkButton();
  }

  // Step 13: Account limits - expiry date, document date (today), drawing power
  // indicator -> EQUAL. Reuses the shared limit helpers.
  async fillLoanAccountLimits(expiryDate: string) {
    await this.fillDateField(
      ['expiryDate_ui', 'limitExpiryDt_ui', 'expiryDt_ui', 'limExpiryDt_ui'],
      expiryDate, 'Loan limit expiry date'
    );
    await this.fillDateField(
      ['documentDate_ui', 'docDt_ui', 'limitDocDt_ui', 'documentDt_ui'],
      this.todayDate(), 'Loan limit document date'
    );
    await this.selectDropdownContainingOption('EQUAL');
  }

  // Diagnostic: after Submit, dump every frame's alert/validation/message text
  // plus a screenshot so we can see why the loan account was not generated.
  async dumpAfterSubmit(label = 'after-submit') {
    await this.page.waitForTimeout(2000);
    try {
      await this.page.screenshot({ path: `${label}.png`, fullPage: true });
      console.log(`Saved screenshot ${label}.png`);
    } catch (e) {
      console.log(`Could not screenshot: ${e}`);
    }
    for (const frame of this.page.frames()) {
      const msgs = await frame.locator(
        'tr.alert, td.alert, #pageMsg, .errortext, .message, .error, ' +
        'span[id*="msg" i], div[id*="msg" i], font[color], li'
      ).evaluateAll(els =>
        els.map(e => (e.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(t => t.length > 0 && t.length < 300)
      ).catch(() => [] as string[]);
      const unique = [...new Set(msgs)].filter(t => /error|mandatory|required|invalid|success|created|account|must|enter|select/i.test(t));
      if (unique.length) {
        console.log(`[MSGS @ frame '${frame.name() || 'main'}'] ${JSON.stringify(unique)}`);
      }
    }
  }

  // Step 16: returns the generated loan account number (after submit).
  // Finacle reports the new account inside a confirmation message rather than
  // a form field, so scan every frame for that message and pull the number.
  async getGeneratedLoanAccountNumber(): Promise<string | null> {
    await this.page.waitForTimeout(2000);

    // 1) The confirmation screen shows "New A/c. ID: <number>". Scan each
    //    frame's text for that pattern and return the account number.
    for (const frame of this.page.frames()) {
      const body = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      const m = body.match(/A\/c\.?\s*ID[:\s]+(\d{6,})/i);
      if (m) {
        console.log(`Extracted loan account number from confirmation: ${m[1]}`);
        return m[1];
      }
    }

    // 2) Fall back to explicit success/confirmation message elements.
    for (const frame of this.page.frames()) {
      const msg = frame.locator(
        'tr.alert, td.alert, #pageMsg, .errortext, .message, ' +
        'span[id*="msg" i], div[id*="msg" i], font'
      );
      const count = await msg.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const text = (await msg.nth(i).textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim() || '';
        if (/success|created|opened|account/i.test(text)) {
          console.log(`Loan confirmation (frame '${frame.name() || 'main'}'): ${text}`);
          const num = text.match(/\b\d{8,}\b/);
          if (num) {
            console.log(`Extracted loan account number from message: ${num[0]}`);
            return num[0];
          }
        }
      }
    }

    // 2) Fall back to the populated account-number field on the screen.
    for (const frame of this.page.frames()) {
      const input = frame.locator(
        '#AcctNum, #acctId, #foracid, #accountId, #accountNumber, ' +
        'input[name*="acct" i], input[id*="foracid" i]'
      ).first();
      if (await input.count().catch(() => 0) > 0) {
        const val = ((await input.inputValue().catch(() => '')) ||
          (await input.textContent().catch(() => '')) || '').trim();
        if (/\d{8,}/.test(val)) {
          console.log(`Extracted loan account number from field: ${val}`);
          return val;
        }
      }
    }

    console.log('Loan account number not found - submit may have failed validation');
    return null;
  }

  // Reads the freeze details shown in the HAFSM grid for verification. Returns
  // the text of the row containing the given account id (A/c ID, Freeze Code,
  // Reason Code, ...). When no account id is given, returns the first data row.
  async getFreezeDetails(accountId?: string): Promise<string | null> {
    try {
      await this.page.waitForTimeout(1500);
      for (const frame of this.page.frames()) {
        const row = accountId
          ? frame.locator('tr', { hasText: accountId }).first()
          : frame.locator('table tr').filter({ has: frame.locator('input[type="checkbox"]') }).first();
        if (await row.count().catch(() => 0) === 0) continue;
        const text = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        if (text) {
          console.log(`Freeze row (frame '${frame.name() || 'main'}'): ${text}`);
          return text;
        }
      }
      console.log('Freeze details row not found');
      return null;
    } catch (e) {
      console.log(`Could not read freeze details, skipping: ${e}`);
      return null;
    }
  }
}
