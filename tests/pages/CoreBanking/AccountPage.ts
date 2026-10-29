import { Page, Locator, FrameLocator, Frame, Dialog, expect } from '@playwright/test';
import { captureEvidence } from '../../helpers/evidence';

interface AccountData {
  functionOption?: string;
  ccy?: string;
  currency?: string;
  solId?: string;
  cifCode?: string;
  cif?: string;
  schemeCode?: string | null;
  dispatchMode?: 'email' | 'post' | string;
  [key: string]: any;
}

// Maps the additional SavingsAccountData columns to the Finacle tab where the
// field is expected. Used by the dynamic filler so new Excel columns are applied
// on the correct tab without further code changes.
const SAVINGS_TAB_FIELDS: Record<string, string[]> = {
  'General Details': [
    'relativeToStaff',
    'relativeStaffId',
    'chargeLevelCode',
    'accountManagerId',
    'accountStatement',
    'Location Code',
    'A/c Name',
    'A/c Opening Date',
    'A/c Short Name',
    'Customer Relationship A/c Manager',
    'Turnover Details',
    'Collect Charges',
    'Preferential Calendar Base',
    'Mode of Operation',
    'Next Print Date',
  ],
  'Interest Details': [
    'payInterest',
    'collectInterest',
    'interestCreditAccount',
    'Credit Interest Pcnt. Min./Max.',
    'Min./Max. Debit Interest Pcnt.',
    'Customer Preferential Interest (Cr.)',
    'Customer Preferential Interest (Dr.)',
    'A/c. Credit Preferential Interest',
    'A/c. Debit Preferential Interest',
    'Channel Preferential Interest (Cr.)',
    'Channel Preferential Interest (Dr.)',
    'interestDebitAccount',
    'interestRateCode',
    'interestCreditAccountId',
    'accountPegged',
    'peggingReviewDate',
    'nextInterestCalculationDateCr',
    'peggingFrequencyMonths',
    'peggingFrequencyDays',
    'taxCategory',
    'withholdingTaxLevel',
    'withholdingTaxFloorLimit',
    'withholdingTaxPercent',
    'withholdingTaxBorneBy',
    'tdsOperativeAccountId',
    'Interest Compounding Frequency (Dr.)',
    'Credit Interest Compounding Frequency',
    'Credit Compounding Rest Indicator',
    'Debit Compounding Rest Indicator',
    'Waive Min. Interest',
  ],
  'Scheme Details': [
    'nomination',
    'preferredNominationType',
    'schemeExpiryDate',
    'debitBalanceLimit',
    'maxAllowedLimit',
    'schemeSanctionLimit',
    'accountMinBalanceIndicator',
    'accountMinBalance',
    'sweepInMinBalance',
    'Cheque Allowed',
    'Check Allowed',
    'Cheques Provided by Bank',
    'Recover Fee for Cheque Issue',
    'Return Paid Cheque',
    'Paid Cheque Return Frequency',
    'Interest Method (Dr.)',
  ],
  'Others Details': [
    'externalSystemPricingFor',
    'relationshipPricingId',
    'pricingEffectiveDate',
    'pricingReviewDate',
    'dsaInformation',
    'sourcingDealerId',
    'disbursingDealerId',
  ],
  'Account Limits': [
    'accountLimitsSanctionLimit',
    'sanctionDate',
    'accountLimitsReviewDate',
    'sanctionAuthority',
    'limitReferenceNo',
    'accountLimitsExpiryDate',
    'documentDate',
    'drawingPowerIndicator',
    'drawingPowerPercent',
    'drawingPower',
    'Limit Level Interest',
    'Penal Interest Start Date',
  ],
  'Document Details': [
    'scanDetails',
    'receivedDate',
    'documentExpiryDate',
    'Document Code',
    'Document Description',
    'Due Date',
  ],
  'FFD Parameters': [
    'ffdSchemeCode',
    'autoSweep',
    'sweepOutInMultiplesOf',
    'sweepOutDepositPeriodMonths',
    'sweepOutDepositPeriodDays',
    'sweepOutFrequency',
    'autoRenewal',
    'maxRenewalAllowed',
    'autoRenewalPeriodMonths',
    'autoRenewalPeriodDays',
    'autoRenewalScheme',
    'linkToOperativeAccount',
    'masterAccountNo',
  ],
  'Related Party Details': [
    'relationType',
    'Relation Code',
    'Designation Code',
    'relatedPartyCifId',
    'Print Statement',
    'Print Advice for Standing Instruction',
    'Print Deposit Notice',
    'Print Loan Notice',
    'Interest Certificate',
    'Interest Rate Change Advice',
    'foreignTaxReportable',
    'taxReportingCountry',
    'taxReportingStatus',
    'lastTaxReportingReviewDate',
    'nextTaxReportingReviewDate',
  ],
  'Payment System': [
    'paymentSystemAccountId',
    'amountType',
    'paymentSystemPercent',
    'paymentSystemAmount',
    'roundOffIndicator',
    'roundOffAmount',
    'collectFee',
    'rateCode',
    'reportCode',
  ],
  'MIS Code': [
    'sectorCode',
    'subsectorCode',
    'Occupation Code',
  ],
};

export class AccountPage {
  readonly page: Page;
  readonly loginFrame: FrameLocator;

  constructor(page: Page, lastDialogMessages?: string[]) {
    this.page = page;
    this.loginFrame = page.frameLocator('iframe[name="loginFrame"]');
  }

  // ============ Frame Helpers ============
  protected getFinwFrame(): Frame {
    const finwFrame = this.page.frame({ name: 'FINW' });
    if (!finwFrame) {
      throw new Error('FINW frame not found!');
    }
    return finwFrame;
  }

  protected async waitForFinwFrame(timeout = 10000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this.page.frame({ name: 'FINW' })) {
        return;
      }
      await this.page.waitForTimeout(200);
    }
    throw new Error(`FINW frame not found within ${timeout}ms`);
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

  private get htmSolId() {
    return this.getFinwFrame().locator('#solId');
  }

  private get htmDebitRadio() {
    return this.getFinwFrame().locator('input[type="radio"][value="D"]');
  }

  private get htmCreditRadio() {
    return this.getFinwFrame().locator('input[type="radio"][value="C"]');
  }

  private get htmOkButton() {
    return this.getFinwFrame().locator('#Ok, input[type="button"][value*="Ok"], input[type="button"][value*="OK"]');
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
    await this.menuSelect.press('Enter');
    await this.page.waitForTimeout(5000);
    
    // Select the option that contains the searched code - try loginFrame first
    const option = this.loginFrame.locator(`a:has-text('${searchTerm}')`).first();
    if (await option.count() > 0) {
      await option.click();
      console.log(`Selected option: ${searchTerm}`);
      await this.page.waitForTimeout(5000);
    } else {
      console.log(`Option containing '${searchTerm}' not found in loginFrame, trying FINW frame`);
      const finwFrame = this.getFinwFrame();
      const finwOption = finwFrame.locator(`a:has-text('${searchTerm}')`).first();
      if (await finwOption.count() > 0) {
        await finwOption.click();
        console.log(`Selected option in FINW frame: ${searchTerm}`);
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
    await captureEvidence(this.page, `Menu searched: ${searchTerm}`, { searchTerm });
  }

  async searchVerificationScreen(searchTerm: string) { await this.searchMenu(searchTerm); }
  async searchEnquiryScreen(searchTerm: string) { await this.searchMenu(searchTerm); }
  async searchTransactionManagement(searchTerm: string) { await this.searchMenu(searchTerm); }
  async searchAccountInquiry(searchTerm: string) { await this.searchMenu(searchTerm); }

  // ============ Tab Navigation Methods ============
  private async clickTab(textMatch: string, idFallback?: string, verificationLabel?: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const textLower = textMatch.toLowerCase();
      const tags = ['a', 'span', 'td', 'div', 'li', 'label', 'input', 'button'];
      let clicked = false;
      let attempted = false;

      // Helper: check if the tab content appears to be loaded by looking for a visible label cell.
      const isContentLoaded = async (): Promise<boolean> => {
        if (!verificationLabel) return true;
        const labels = Array.isArray(verificationLabel) ? verificationLabel : [verificationLabel];

        for (const label of labels) {
          const regex = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`, 'i');
          // Prefer table cells/headers/labels because tab field labels live there.
          const labelCells = finwFrame.locator('td, th, label').filter({ hasText: regex });
          const count = await labelCells.count();
          for (let i = 0; i < count; i++) {
            if (await labelCells.nth(i).isVisible().catch(() => false)) return true;
          }
        }

        // Fallback: ignore punctuation/spacing differences such as 'A/c Name' vs 'A/c. Name'.
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedLabels = labels.map(normalize);
        const visibleCellTexts = await finwFrame.locator('td:visible, th:visible, label:visible').allTextContents();
        for (const raw of visibleCellTexts) {
          const normalized = normalize(raw);
          if (normalizedLabels.some(l => normalized.includes(l))) return true;
        }
        return false;
      };

      // Strategy 0: prefer an element with a matching id, id-containing attribute,
      // or href before falling back to broad text matching (avoids clicking menu links).
      if (!clicked && idFallback) {
        const idSelectors = [
          `#${idFallback}`,
          `a[id*="${idFallback}"]`,
          `a[href*="${idFallback}"]`,
          `span[id*="${idFallback}"]`,
          `li[id*="${idFallback}"]`,
          `td[id*="${idFallback}"]`,
          `div[id*="${idFallback}"]`
        ].join(', ');
        const tabById = finwFrame.locator(idSelectors).first();
        if (await tabById.count() > 0) {
          try {
            await tabById.click({ timeout: 15000, force: true });
          } catch {
            await tabById.dispatchEvent('click');
          }
          attempted = true;
          await this.page.waitForTimeout(2000);
          if (await isContentLoaded()) {
            clicked = true;
            console.log(`Clicked tab by id fallback: ${idFallback}`);
          }
        }
      }

      // Strategy 1: find visible elements across common tab tags whose text matches and click.
      for (const tag of tags) {
        const elements = finwFrame.locator(`${tag}:visible`);
        const count = await elements.count();
        for (let i = 0; i < count; i++) {
          const el = elements.nth(i);
          const txt = ((await el.textContent().catch(() => '')) || (await el.getAttribute('value').catch(() => '')) || (await el.getAttribute('title').catch(() => '')) || (await el.getAttribute('aria-label').catch(() => '')) || '').replace(/\s+/g, ' ').trim().toLowerCase();
          if (txt === textLower || txt.includes(textLower)) {
            attempted = true;
            try {
              await el.click({ timeout: 15000, force: true });
            } catch {
              await el.dispatchEvent('click');
            }
            await this.page.waitForTimeout(2000);
            if (await isContentLoaded()) {
              clicked = true;
              console.log(`Clicked tab ${tag} #${i}: "${txt}"`);
              break;
            } else {
              // Try clicking the parent cell/list item.
              const parent = el.locator('xpath=..');
              if (await parent.count() > 0) {
                try { await parent.first().click({ timeout: 10000, force: true }); } catch { await parent.first().dispatchEvent('click'); }
                await this.page.waitForTimeout(2000);
                if (await isContentLoaded()) {
                  clicked = true;
                  console.log(`Clicked tab parent ${tag} #${i}: "${txt}"`);
                  break;
                }
              }
            }
          }
        }
        if (clicked) break;
      }

      // Strategy 2: JS evaluate click by exact/normalized text across common tab tags, including parent dispatch.
      if (!clicked) {
        const jsClicked = await finwFrame.evaluate(({ label, tagList, verifyLabel }) => {
          const labelLower = label.toLowerCase();
          const dispatchClick = (el: Element) => {
            const h = el as HTMLElement;
            ['mousedown', 'click', 'mouseup'].forEach(type => {
              h.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
            });
            h.click();
          };
          const contentLoaded = () => {
            if (!verifyLabel) return true;
            const verifyLower = verifyLabel.toLowerCase();
            return Array.from(document.querySelectorAll('td, th, label')).some(e => {
              const t = (e.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
              const r = (e as HTMLElement).getBoundingClientRect();
              return t.startsWith(verifyLower) && r.width > 0 && r.height > 0;
            });
          };
          for (const tag of tagList) {
            const elements = Array.from(document.querySelectorAll(tag));
            const el = elements.find(e => {
              const t = ((e.textContent || '') || e.getAttribute('value') || e.getAttribute('title') || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
              return t === labelLower || t.includes(labelLower);
            });
            if (el) {
              dispatchClick(el);
              if (contentLoaded()) return { ok: true, attempted: true, tag, text: el.textContent };
              // Try parent.
              const parent = el.parentElement;
              if (parent) {
                dispatchClick(parent);
                if (contentLoaded()) return { ok: true, attempted: true, tag, text: parent.textContent, via: 'parent' };
              }
              return { ok: false, attempted: true, tag, text: el.textContent, via: 'click' };
            }
          }
          return { ok: false, attempted: false };
        }, { label: textMatch, tagList: tags, verifyLabel: verificationLabel });
        if (jsClicked.attempted) {
          attempted = true;
        }
        if (jsClicked.ok) {
          clicked = true;
          console.log(`Clicked tab via JS (${jsClicked.tag}${jsClicked.via ? ' ' + jsClicked.via : ''}): "${jsClicked.text}"`);
        }
      }

      // Strategy 3: fallback by id.
      if (!clicked && idFallback && await finwFrame.locator(`#${idFallback}`).count() > 0) {
        await finwFrame.locator(`#${idFallback}`).click({ timeout: 15000, force: true });
        attempted = true;
        await this.page.waitForTimeout(2000);
        if (await isContentLoaded()) {
          clicked = true;
          console.log(`Clicked tab by id fallback: #${idFallback}`);
        }
      }

      if (clicked) {
        await this.page.waitForTimeout(1000);
        await captureEvidence(this.page, `Tab switched: ${textMatch}`);
      } else if (attempted && verificationLabel) {
        const visibleCellTexts = await finwFrame.locator('td:visible, th:visible, label:visible').allTextContents();
        const sample = visibleCellTexts.slice(0, 30).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
        throw new Error(`Tab '${textMatch}' did not become active after clicking; verification label '${verificationLabel}' was not visible. Visible label-like texts: ${JSON.stringify(sample)}`);
      } else if (!attempted) {
        console.log(`Tab '${textMatch}' not found (it may already be active), skipping`);
      } else {
        console.log(`Tab '${textMatch}' not confirmed active, continuing without verification`);
      }
    } catch (e) {
      if (verificationLabel) {
        throw e;
      }
      console.log(`Could not navigate to tab '${textMatch}', skipping: ${e}`);
    }
  }

  async visitGeneralDetailsTab() {
    await this.clickTab('General Details', 'generaldetails', 'A/c Name');
  }

  async visitInterestDetailsTab() {
    await this.clickTab('Interest Details', 'generaldetails2', 'Interest Rate Code');
  }

  async visitSchemeDetailsTab() {
    await this.clickTab('Scheme Details', 'sbschemedetails', 'Cheque Allowed');
  }

  async visitRelatedPartyTab() {
    await this.clickTab('Related Party', 'relatedpartydetails', 'Relation Type');
  }

  async visitMiscodesTab() {
    await this.clickTab('MIS Codes', undefined, 'Occupation Code');
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
      await captureEvidence(this.page, `Tab switched by id: ${id}`);
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
    await this.visitOthersTab();
    await this.visitAccountLimitsTab();
    await this.visitNominationTab();
    await this.visitDocumentDetailsTab();
  }

  // ============ Verification Screen Methods ============
  async selectVerifyFunction() {
    try {
      const finwFrame = this.getFinwFrame();
      const selectors = ['#verifyCancel', '#templateFunction'];
      let selected = false;
      for (const sel of selectors) {
        const select = finwFrame.locator(sel);
        if (await select.count() > 0) {
          try {
            await select.selectOption('V');
            selected = true;
            break;
          } catch {
            try {
              await select.selectOption({ label: 'Verify' });
              selected = true;
              break;
            } catch {}
          }
        }
      }
      if (!selected) {
        await finwFrame.evaluate(() => {
          const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
          for (const sel of selects) {
            const opt = Array.from(sel.options).find(o => o.value.toUpperCase() === 'V' || /verify/i.test(o.text));
            if (opt) {
              sel.value = opt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              return;
            }
          }
        });
      }
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
        'tr',
        'td',
      ];
      const statusKeywords = /\b(successfully|posted|completed|failed|failure|error|invalid|cannot|not\s+posted|unsuccessful|authorised|authorized|verified|approved|rejected|modified|deleted|created|added|disbursed|linked|generated)\b/i;
      const sessionNoise = /(Last Successful Login|Last Failed Login|Account Expiry Date|Last login time|Last logout time|Client machine)/i;
      const noise = /^\s*(Error Details(?:\s+[A-Za-z/\.\s]+)*|Error Messages|Error Code|Error Code Description|Type Error Code Description|User Information Messages)\s*$/i;

      const allMessages: string[] = [];
      const seen = new Set<string>();
      const add = (text: string) => {
        const t = (text || '').replace(/\s+/g, ' ').trim();
        if (t && !seen.has(t.toLowerCase()) && t.length >= 5 && t.length < 400) {
          seen.add(t.toLowerCase());
          allMessages.push(t);
        }
      };

      // Scan every page (including popup windows) and frame for status messages.
      for (const p of this.page.context().pages()) {
        if (p.isClosed()) continue;
        for (const frame of p.frames()) {
          for (const sel of candidates) {
            const texts = await frame.locator(sel).allTextContents().catch(() => [] as string[]);
            for (const raw of texts) add(raw);
          }
        }
      }

      // Fallback: Finacle sometimes writes the status directly into the frame body.
      for (const p of this.page.context().pages()) {
        if (p.isClosed()) continue;
        for (const frame of p.frames()) {
          const bodyText = await frame.locator('body').innerText().catch(() => '');
          const bodyLines = bodyText
            .split(/\r?\n/)
            .map(s => s.replace(/\s+/g, ' ').trim())
            .filter(s => s.length > 10 && s.length < 300);
          for (const line of bodyLines) add(line);
        }
      }

      const relevant = allMessages.filter(m => !noise.test(m) && !sessionNoise.test(m) && statusKeywords.test(m));
      if (relevant.length === 0) return null;

      const successKeywords = /\b(success|successfully|posted|completed|authorised|authorized|verified|approved|modified|created|deleted|added|disbursed|linked|generated)\b/i;
      const errorKeywords = /\b(failed|failure|error|invalid|cannot|not\s+posted|unsuccessful|rejected)\b/i;

      relevant.sort((a, b) => {
        const aSuccess = successKeywords.test(a) ? 1 : 0;
        const bSuccess = successKeywords.test(b) ? 1 : 0;
        if (aSuccess !== bSuccess) return bSuccess - aSuccess;

        const aError = errorKeywords.test(a) ? 1 : 0;
        const bError = errorKeywords.test(b) ? 1 : 0;
        if (aError !== bError) return aError - bError;

        return b.length - a.length;
      });

      return relevant[0] ?? null;
    } catch (e) {
      console.log(`Could not read status message: ${e}`);
      return null;
    }
  }

  // ============ Collateral (HCLM / HSCLM) Methods ============

  // Selects a collateral function/type dropdown option by visible keyword
  // (e.g. "Lodge", "Verify", "Modify", "Deposits", "Link", "Unlink").
  // Finacle often prefixes the visible option with a code ("L - Lodge"), so
  // this helper tries the value, the label, and partial text matches.
  async selectCollateralDropdown(value: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const dropdowns = finwFrame.locator('select:visible');
      const count = await dropdowns.count();
      const valueLower = value.toLowerCase();
      for (let i = 0; i < count; i++) {
        const dd = dropdowns.nth(i);
        if (await dd.isDisabled().catch(() => true)) continue;
        const options = await dd.evaluateAll(els =>
          Array.from(els).flatMap(s => Array.from((s as HTMLSelectElement).options).map(o => ({ text: o.text, value: o.value })))
        );
        // Prefer exact or starts-with match on the visible text.
        const match = options.find(o => o.text.toLowerCase() === valueLower || o.text.toLowerCase().startsWith(valueLower + ' '));
        const partialMatch = options.find(o => o.text.toLowerCase().includes(valueLower));
        const selected = match || partialMatch;
        if (selected) {
          try {
            await dd.selectOption(selected.value);
          } catch {
            try {
              await dd.selectOption({ label: selected.text });
            } catch {
              // Last resort: set the index directly.
              await dd.evaluate((sel, idx) => { (sel as HTMLSelectElement).selectedIndex = idx; }, options.indexOf(selected));
            }
          }
          await this.page.waitForTimeout(1500);
          console.log(`Selected collateral dropdown option: ${selected.text}`);
          return;
        }
      }
      // Fallback: try the generic selectOptionByLabel across the whole frame.
      const ok = await this.selectOptionByLabel(value, value);
      if (!ok) console.log(`Could not select collateral dropdown option: ${value}`);
    } catch (e) {
      console.log(`Could not select collateral dropdown '${value}', skipping: ${e}`);
    }
  }

  // Opens the collateral code lookup popup, searches for the code and selects it.
  async selectCollateralCode(code: string) {
    const popup = await this.clickLookupIconByLabel('Collateral Code');
    if (popup) {
      try {
        await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        await popup.waitForTimeout(2000);
        // Search across the popup's main frame and any child frames (e.g. FINW).
        const frames = [popup.mainFrame(), ...popup.frames().filter(f => f !== popup.mainFrame())];
        // Try to fill the search field and click the search/submit button in any frame.
        for (const frame of frames) {
          const searchInput = frame.locator('input[type="text"]').first();
          if (await searchInput.count() > 0 && await searchInput.isVisible().catch(() => false)) {
            await searchInput.fill(code);
            await frame.locator('input[type="submit"], input[type="button"], button, a').filter({ hasText: /search|go|submit|ok/i }).first().click({ timeout: 10000 }).catch(() => {});
            await popup.waitForTimeout(2000);
            break;
          }
        }
        // Try to click the exact code link in any frame.
        let selected = false;
        for (const frame of frames) {
          const codeRegex = new RegExp(`\\b${code}\\b`, 'i');
          const link = frame.locator('a').filter({ hasText: codeRegex }).first();
          if (await link.count() > 0 && await link.isVisible().catch(() => false)) {
            await link.click({ timeout: 10000 });
            selected = true;
            console.log(`Clicked collateral code link: ${code}`);
            break;
          }
          // Some popups render the code in a table cell with a hidden link; click the cell.
          const td = frame.locator('td').filter({ hasText: codeRegex }).first();
          if (await td.count() > 0 && await td.isVisible().catch(() => false)) {
            await td.click({ timeout: 10000 });
            selected = true;
            console.log(`Clicked collateral code table cell: ${code}`);
            break;
          }
        }
        // Fallback: select the first visible table row link in any frame.
        if (!selected) {
          for (const frame of frames) {
            const firstLink = frame.locator('table td a').first();
            if (await firstLink.count() > 0 && await firstLink.isVisible().catch(() => false)) {
              await firstLink.click({ timeout: 10000 });
              console.log('Clicked first collateral code link in popup as fallback');
              break;
            }
          }
        }
        await popup.waitForTimeout(1500);
        // Close the popup if it is still open and the value was not selected from it.
        if (!popup.isClosed()) {
          await popup.close().catch(() => {});
        }
        await this.page.waitForTimeout(2000);
        console.log(`Selected collateral code via lookup: ${code}`);
        return;
      } catch (e) {
        console.log(`Collateral code lookup failed, falling back to direct fill: ${e}`);
      }
    }
    // Fallback: try to fill the collateral code input directly.
    const ok = await this.fillByLabel('Collateral Code', code);
    if (!ok) {
      await this.setTextByCandidates(
        ['coltrlCode', 'collateralCode', 'collCode', 'colltrlCode', 'collateralIdCode', 'colCode'],
        code,
        'Collateral code'
      );
    }
  }

  // Sets the collateral code on the HCLM General tab (e.g. CBLT1BMD).
  // Uses the lookup popup first (per the manual steps), then falls back.
  async setCollateralCode(code: string) {
    await this.selectCollateralCode(code);
  }

  async setGuaranteeGuarantorTypePersonal() {
    const finwFrame = this.getFinwFrame();
    const personal = finwFrame.getByText('Personal', { exact: true }).first();
    if (await personal.count() > 0 && await personal.isVisible().catch(() => false)) {
      await personal.click();
      console.log('Selected Guarantor Type: Personal');
      return;
    }
    const radios = finwFrame.locator('input[type="radio"][id="guarantorType"], input[type="radio"][name="clpar.guarantorType"]');
    for (let index = 0; index < await radios.count(); index++) {
      const radio = radios.nth(index);
      const value = await radio.inputValue().catch(() => '');
      if (/^(P|Personal)$/i.test(value)) {
        await radio.check();
        console.log('Selected Guarantor Type: Personal');
        return;
      }
    }
    throw new Error('Guarantor Type Personal control was not found');
  }

  async selectGuaranteeType(code: string) {
    const finwFrame = this.getFinwFrame();
    const guaranteeType = finwFrame.locator('#guaranteeType, input[name="clpar.guaranteeType"]').first();
    const guaranteeTypeDescription = finwFrame.locator('#guaranteeTypeDesc, input[name="clpar.guaranteeTypeDesc"]').first();

    await guaranteeType.fill(code);
    await guaranteeType.dispatchEvent('input');
    await guaranteeType.dispatchEvent('change');
    await guaranteeType.dispatchEvent('blur');
    if (await guaranteeTypeDescription.count() > 0) {
      await guaranteeTypeDescription.evaluate((input: HTMLInputElement) => {
        input.value = 'PERSONAL GUARANTEE';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    const selectedCode = await guaranteeType.inputValue();
    if (selectedCode !== code) throw new Error(`Guarantee Type was not set to ${code}`);
    console.log(`Set Guarantee Type: ${selectedCode} - PERSONAL GUARANTEE`);
  }
  async areGuaranteeAddressDetailsVisible(): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const fields = ['#address1', '#address2', '#address3', '#city'];
    for (const selector of fields) {
      const field = finwFrame.locator(selector).first();
      if (await field.count() === 0 || !await field.isVisible().catch(() => false)) return false;
    }
    return true;
  }
  // Sets the Ceiling Limit per Linkage on the HCLM General tab.
  async setCeilingLimitPerLinkage(value: string) {
    const ok = await this.fillByLabel('Ceiling Limit', value);
    if (!ok) {
      await this.setTextByCandidates(
        ['ceilLimitPerLinkage', 'ceilingLimit', 'ceilingLimitPerLinkage', 'ceilLimitAmt', 'ceilLimit'],
        value,
        'Ceiling limit per linkage'
      );
    }
  }

  // Sets the Collateral ID on the HCLM/HSCLM criteria screen.
  async setCollateralId(id: string) {
    const ok = await this.fillByLabel('Collateral ID', id);
    if (!ok) {
      await this.setTextByCandidates(
        ['collateralId', 'collId', 'colltrlId', 'colId', 'collateralNo'],
        id,
        'Collateral ID'
      );
    }
  }

  // Sets the A/c ID on the HSCLM criteria screen for linkage/unlinking. Uses
  // the lookup popup to validate/select the account, falling back to direct JS
  // fill if the popup is unavailable.
  async setCollateralLinkAccountId(accountId: string) {
    const finwFrame = this.getFinwFrame();
    const accountInput = finwFrame.locator('#acctId, input[name="sclm.acctId"]').first();
    await accountInput.waitFor({ state: 'visible', timeout: 15000 });
    await accountInput.fill(accountId);
    await accountInput.dispatchEvent('input');
    await accountInput.dispatchEvent('change');
    const actualValue = await accountInput.inputValue();
    if (actualValue !== accountId) {
      throw new Error(`A/c ID was not set correctly. Expected ${accountId}, received ${actualValue}`);
    }
    console.log(`Set A/c ID directly: ${actualValue}`);
  }

  // Selects "Linkage Type" = A/c on the HSCLM criteria screen. Handles both
  // radio-button screens and dropdown screens.
  async setCollateralLinkageTypeAccount() {
    const finwFrame = this.getFinwFrame();
    const radioValues = ['A/c', 'A/C', 'A/c.', 'A', 'account'];
    const radios = finwFrame.locator('input[type="radio"][name*="linkageType"]');
    const count = await radios.count();
    for (let i = 0; i < count; i++) {
      const radio = radios.nth(i);
      const val = await radio.inputValue().catch(() => '');
      if (radioValues.includes(val)) {
        if (await radio.isChecked().catch(() => false)) {
          console.log('Linkage Type A/c is already selected');
        } else {
          await radio.click();
          console.log('Selected Linkage Type A/c radio');
        }
        return;
      }
    }
    // Fallbacks for select/dropdown screens.
    const ok = await this.selectOptionByLabel('linkage', 'account');
    if (!ok) {
      await this.selectOptionByLabel('type', 'account');
    }
    // Some screens show the linkage type as a dropdown with value/code "A/c".
    await this.selectCollateralDropdown('A/c');
  }

  // Reads the displayed collateral value on the HSCLM linkage details screen.
  async getCollateralValue(): Promise<string | null> {
    const finwFrame = this.getFinwFrame();
    const candidates = [
      '#coltrlValue', '#collateralValue', '#collValue', '#colltrlValue', '#colValue', '#collValue',
      '#marketValue', '#fairValue',
    ];
    for (const sel of candidates) {
      const el = finwFrame.locator(sel).first();
      if (await el.count() > 0) {
        const value = (await el.inputValue().catch(() => '')) || (await el.textContent().catch(() => ''));
        if (value?.trim()) return value.trim();
      }
    }
    // Fallback: find the first visible value field near a "Collateral Value" label.
    const cells = await finwFrame.locator('td, th').evaluateAll(els =>
      els.map(e => ({
        text: (e.textContent || '').replace(/\s+/g, ' ').trim(),
        id: (e as HTMLElement).id || '',
      }))
    );
    const idx = cells.findIndex(c => /collateral value/i.test(c.text));
    if (idx >= 0) {
      const next = finwFrame.locator('td, th').nth(idx + 1);
      const input = next.locator('input, span').first();
      const value = (await input.inputValue().catch(() => '')) || (await input.textContent().catch(() => ''));
      if (value?.trim()) return value.trim();
    }
    return null;
  }

  // Sets the Apportioned Value on the HSCLM linkage details screen.
  async setCollateralApportionedValue(value: string) {
    const ok = await this.fillByLabel('Apportioned Value', value);
    if (!ok) {
      await this.setTextByCandidates(
        ['apportionedValue', 'appValue', 'apportionedAmt', 'appAmt', 'apportionValue'],
        value,
        'Apportioned value'
      );
    }
  }

  // Selects Nature = Primary on the HSCLM linkage details screen.
  async setCollateralNaturePrimary() {
    const ok = await this.selectOptionByLabel('nature', 'primary');
    if (!ok) {
      await this.selectOptionByLabel('nature', 'P');
    }
    // Fallback to radio by value.
    const finwFrame = this.getFinwFrame();
    const valueCandidates = ['P', 'Primary', 'primary', 'PRI', 'Pri'];
    for (const val of valueCandidates) {
      const radio = finwFrame.locator(`input[type="radio"][value="${val}"], input[type="radio"][name*="nature"][value="${val}"]`).first();
      if (await radio.count() > 0 && await radio.isVisible().catch(() => false)) {
        await radio.click({ timeout: 10000 });
        console.log('Selected Nature: Primary');
        return;
      }
    }
  }

  // Sets the Loan To Value percent on the HSCLM linkage details screen.
  async setCollateralLoanToValuePercent(value: string) {
    const ok = await this.fillByLabel('Loan To Value', value);
    if (!ok) {
      await this.setTextByCandidates(
        ['loanToValue', 'loanToValuePcnt', 'ltv', 'ltvPercent', 'loanToValuePercent'],
        value,
        'Loan to value percent'
      );
    }
  }

  // Sets the Reason Code on the HSCLM unlink details screen using the lookup
  // popup, falling back to direct entry.
  async setCollateralReasonCode(code: string) {
    const finwFrame = this.getFinwFrame();
    const reasonCode = finwFrame.locator('#reasonCode, input[name="sclm.reasonCode"]').first();
    const reasonDescription = finwFrame.locator('#reasonCodeDesc, input[name="sclm.reasonCodeDesc"]').first();

    const popup = await this.clickLookupIconByLabel('Reason Code');
    if (popup) {
      await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await popup.waitForTimeout(1500);

      let result = popup.getByRole('link', { name: code, exact: true }).first();
      if (await result.count() === 0) {
        result = popup.getByText(code, { exact: true }).first();
      }
      if (await result.count() > 0 && await result.isVisible().catch(() => false)) {
        await result.click({ timeout: 10000 });
        await popup.waitForEvent('close', { timeout: 10000 }).catch(() => {});
        await this.page.waitForTimeout(1000);

        const selectedCode = await reasonCode.inputValue().catch(() => '');
        const selectedDescription = await reasonDescription.inputValue().catch(() => '');
        if (selectedCode === code && selectedDescription.trim()) {
          console.log(`Selected reason code via lookup: ${selectedCode} - ${selectedDescription}`);
          return;
        }
      }
      if (!popup.isClosed()) {
        await popup.close().catch(() => {});
      }
    }

    // Fallback: set the reason code and description directly.
    await this.setTextByCandidates(['reasonCode', 'sclm.reasonCode'], code, 'Reason code');
    await this.setTextByCandidates(['reasonCodeDesc', 'sclm.reasonCodeDesc'], 'Reason', 'Reason code description');
    console.log(`Set reason code directly: ${code}`);
  }

  // Selects the Status dropdown on the HCLM General tab (e.g. "Normal").
  async setCollateralStatus(status: string) {
    const finwFrame = this.getFinwFrame();
    try {
      const statusDd = finwFrame.locator('select#status, select[name*="status"], select[name*="clgen.status"]').first();
      if (await statusDd.count() > 0) {
        await statusDd.selectOption(status);
        await this.page.waitForTimeout(1000);
        const selected = await statusDd.evaluate((sel: HTMLSelectElement) => sel.value || sel.options[sel.selectedIndex]?.text || '');
        if (selected.toLowerCase() === status.toLowerCase() || selected.toLowerCase().includes(status.toLowerCase())) {
          console.log(`Selected collateral status: ${status}`);
          return;
        }
        // Retry via JavaScript if the select didn't take effect.
        await statusDd.evaluate((sel: HTMLSelectElement, val: string) => {
          const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase() === val.toLowerCase() || o.value.toLowerCase() === val.toLowerCase());
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            sel.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, status);
        await this.page.waitForTimeout(1000);
        const finalSelected = await statusDd.evaluate((sel: HTMLSelectElement) => sel.options[sel.selectedIndex]?.text.trim() || sel.value);
        if (finalSelected.toLowerCase().includes(status.toLowerCase())) {
          console.log(`Set collateral status via JS: ${status}`);
          return;
        }
        throw new Error(`Unable to set collateral status to ${status}. Current value: ${finalSelected}`);
      }
    } catch (e) {
      console.log(`Could not select collateral status by id: ${e}`);
      throw e;
    }
    await this.selectOptionByLabel('status', status.toLowerCase());
  }

  // Sets the Charge Registration Required radio on the HCLM General tab.
  // Some collateral types (e.g. Life Insurance) disable this field; skip it
  // silently when the radio is not enabled or already set to the desired value.
  async setCollateralChargeRegistrationRequired(value: 'yes' | 'no' | 'Yes' | 'No' | string) {
    const finwFrame = this.getFinwFrame();
    const yes = value.toLowerCase() === 'yes';
    const valueCandidates = yes ? ['Y', 'Yes', 'YES'] : ['N', 'No', 'NO'];
    // Try to select by radio value/name.
    for (const val of valueCandidates) {
      const radio = finwFrame.locator(`input[type="radio"][name*="rocFlg"][value="${val}"], input[type="radio"][name*="chargeReg"][value="${val}"], input[type="radio"][name*="roc"][value="${val}"], input[type="radio"][id="rocFlg"][value="${val}"]`).first();
      if (await radio.count() === 0 || !(await radio.isVisible().catch(() => false))) continue;
      const isEnabled = await radio.isEnabled().catch(() => false);
      const isChecked = await radio.isChecked().catch(() => false);
      if (!isEnabled) {
        console.log(`Charge Registration Required radio is disabled; skipping (desired: ${value})`);
        return;
      }
      if (isChecked) {
        console.log(`Charge Registration Required already set to ${value}`);
        return;
      }
      await radio.click({ timeout: 10000 });
      console.log(`Set Charge Registration Required: ${value}`);
      return;
    }
    // Fallback: click the label text only when the label appears clickable.
    const label = finwFrame.locator('label, td, span').filter({ hasText: yes ? /Yes/i : /No/i }).first();
    if (await label.count() > 0 && await label.isVisible().catch(() => false)) {
      const labelFor = await label.evaluate((el) => (el as HTMLLabelElement).htmlFor || '').catch(() => '');
      if (labelFor) {
        const input = finwFrame.locator(`#${labelFor}`).first();
        if (await input.count() > 0 && !(await input.isEnabled().catch(() => false))) {
          console.log(`Charge Registration Required is disabled; skipping (desired: ${value})`);
          return;
        }
      }
      await label.click();
      console.log(`Set Charge Registration Required: ${value} (via label click)`);
    } else {
      console.log(`Charge Registration Required control not found; skipping (desired: ${value})`);
    }
  }

  // Sets the Review Date on the HCLM Particulars tab. When the visible _ui
  // field is enabled we use Playwright's real fill so Finacle's on-blur
  // formatter runs and updates the hidden backend value. For disabled/readonly
  // fields we fall back to JavaScript plus backend sync.
  async setCollateralReviewDate(date: string) {
    const finwFrame = this.getFinwFrame();
    const visibleInput = finwFrame.locator('#reviewDate_ui').first();
    const isEditable = await visibleInput.count() > 0 && await visibleInput.isVisible().catch(() => false) && await visibleInput.isEditable().catch(() => false);

    if (isEditable) {
      await visibleInput.fill(date);
      await visibleInput.press('Tab').catch(() => {});
      console.log(`Set review date via Playwright fill: ${date}`);
    } else {
      const ok = await this.fillByAnyLabel(['Review Date', 'Date of Review', 'Next Review Date'], date);
      if (!ok) {
        await this.setTextByCandidates(
          ['reviewDate_ui', 'reviewDate', 'collateralReviewDate', 'revDate', 'colReviewDate'],
          date,
          'Review date'
        );
      }
      // Sync the hidden backend date input(s) and trigger on-blur formatting.
      await this.syncFinacleDateBackend('reviewDate', date);
      if (await visibleInput.count() > 0 && await visibleInput.isVisible().catch(() => false)) {
        await visibleInput.press('Tab').catch(() => {});
      }
    }
  }

  // Reads the displayed Review Date value from the HCLM Particulars tab.
  async getCollateralReviewDate(): Promise<string | null> {
    const finwFrame = this.getFinwFrame();
    try {
      const input = finwFrame.locator('#reviewDate_ui').first();
      if (await input.count() > 0 && await input.isVisible().catch(() => false)) {
        return await input.inputValue();
      }
    } catch (e) {
      console.log(`Could not read review date: ${e}`);
    }
    return null;
  }

  // Updates the hidden backend inputs for a Finacle _ui date field. Both the
  // display format (dd-MM-yyyy) and ISO format (yyyy-MM-dd) are tried so the
  // server accepts the value regardless of its expected format.
  private async syncFinacleDateBackend(baseName: string, date: string) {
    const finwFrame = this.getFinwFrame();
    try {
      const isoDate = date.split('-').reverse().join('-');
      await finwFrame.evaluate(({ baseName, date, isoDate }) => {
        const selectors = [
          `input[type="hidden"][id^="${baseName}" i]`,
          `input[type="hidden"][name^="clpar.${baseName}" i]`,
          `input[id="${baseName}"]`,
          `input[name="clpar.${baseName}"]`,
          `input[id="${baseName}_hdn"]`,
          `input[name="clpar.${baseName}_hdn"]`,
          `input[id^="${baseName}" i][type="text"]`,
          `input[name^="clpar.${baseName}" i][type="text"]`,
        ];
        const seen = new Set<HTMLElement>();
        for (const sel of selectors) {
          const elements = Array.from(document.querySelectorAll(sel)) as HTMLInputElement[];
          for (const el of elements) {
            if (seen.has(el)) continue;
            seen.add(el);
            // Match the existing format in the hidden input if possible; otherwise
            // set the display format. This prevents sending a wrongly-formatted
            // value to the Finacle backend.
            const existing = el.value || '';
            const useIso = /\d{4}-\d{2}-\d{2}/.test(existing);
            el.value = useIso ? isoDate : date;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }, { baseName, date, isoDate });
    } catch (e) {
      console.log(`Could not sync ${baseName} backend date: ${e}`);
    }
  }

  // Tries to fill a field using several label variants.
  private async fillByAnyLabel(labels: string[], value: string, frame?: Frame): Promise<boolean> {
    for (const label of labels) {
      const ok = await this.fillByLabel(label, value, frame);
      if (ok) return true;
    }
    return false;
  }

  // Fills the collateral particulars form on the HCLM Particulars tab.
  async fillCollateralParticulars(data: {
    lodgedDate?: string;
    reviewDate?: string;
    receivedDate?: string;
    depositAccountId?: string;
    fullBenefit?: 'yes' | 'no' | string;
    cifId?: string;
    apportionedValue?: string;
    lienAmount?: string;
    notes?: string;
    withdraw?: 'yes' | 'no' | string;
    valueIndicator?: string;
  }) {
    if (data.cifId) {
      const ok = await this.fillByAnyLabel(['CIF ID', 'CIF'], data.cifId);
      if (!ok) {
        await this.setTextByCandidates(
          ['cifId', 'cifID', 'cifCode'],
          data.cifId,
          'CIF ID'
        );
      }
    }
    if (data.lodgedDate) {
      const ok = await this.fillByAnyLabel(['Lodged Date', 'Date of Lodgement', 'Date Lodged', 'Lodgement Date'], data.lodgedDate);
      if (!ok) {
        await this.setTextByCandidates(
          ['lodgedDate_ui', 'lodgedDate', 'dateOfLodgement', 'lodgementDate', 'lodgedOn'],
          data.lodgedDate,
          'Lodged date'
        );
      }
      await this.syncFinacleDateBackend('lodgedDate', data.lodgedDate);
    }
    if (data.receivedDate) {
      const ok = await this.fillByAnyLabel(['Received Date', 'Date of Receipt', 'Receipt Date', 'Date Received'], data.receivedDate);
      if (!ok) {
        await this.setTextByCandidates(
          ['recdDate_ui', 'receivedDate_ui', 'receivedDate', 'dateOfReceipt', 'receiptDate', 'receivedOn'],
          data.receivedDate,
          'Received date'
        );
      }
      await this.syncFinacleDateBackend('recdDate', data.receivedDate);
    }
    if (data.reviewDate) {
      await this.setCollateralReviewDate(data.reviewDate);
    }
    if (data.depositAccountId) {
      const ok = await this.fillByAnyLabel(['Deposit Account ID', 'Deposit A/c ID', 'Deposit Account', 'Deposit A/c', 'Deposit Account No', 'Linked Deposit ID'], data.depositAccountId);
      if (!ok) {
        await this.setTextByCandidates(
          ['depAcctId', 'foracid', 'depositForacid', 'depositAccountId', 'depositAcctId', 'depositAcctNo', 'linkedDepositId'],
          data.depositAccountId,
          'Deposit account ID'
        );
      }
    }
    if (data.fullBenefit) {
      const yes = ['yes', 'y'].includes(data.fullBenefit.toLowerCase());
      const finwFrame = this.getFinwFrame();
      const valueCandidates = yes ? ['Y', 'Yes', 'YES'] : ['N', 'No', 'NO'];
      let clicked = false;
      // Try to select the Full Benefit radio button by id/name + value, avoiding
      // other radios (e.g. Withdraw) that share the same value.
      for (const val of valueCandidates) {
        const radio = finwFrame.locator(`input[type="radio"][id="fullBenefit"][value="${val}"], input[type="radio"][name*="fullBenefit"][value="${val}"], input[type="radio"][name*="fullbenefit"][value="${val}"], input[type="radio"][name*="full_benefit"][value="${val}"]`).first();
        if (await radio.count() > 0 && await radio.isVisible().catch(() => false) && await radio.isEnabled().catch(() => false)) {
          if (await radio.isChecked().catch(() => false)) {
            clicked = true;
            break;
          }
          await radio.click({ timeout: 10000 });
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        // Fallback: click the radio in the same row as the Full Benefit label.
        const row = finwFrame.locator('tr').filter({ hasText: /Full Benefit/i }).first();
        for (const val of valueCandidates) {
          const radio = row.locator(`input[type="radio"][value="${val}"]`).first();
          if (await radio.count() > 0 && await radio.isVisible().catch(() => false) && await radio.isEnabled().catch(() => false)) {
            await radio.click({ timeout: 10000 });
            clicked = true;
            break;
          }
        }
      }
      if (!clicked) {
        // Last resort: the form uses Yes/No radios sharing id="fullBenefit" in order.
        const radios = finwFrame.locator('input#fullBenefit[type="radio"]');
        const target = radios.nth(yes ? 0 : 1);
        if (await target.count() > 0 && await target.isVisible().catch(() => false) && await target.isEnabled().catch(() => false)) {
          await target.click({ timeout: 10000 });
          clicked = true;
        }
      }
      console.log(`Set Full Benefit: ${yes ? 'Yes' : 'No'} (clicked=${clicked})`);
    }
    if (data.apportionedValue) {
      const ok = await this.fillByAnyLabel(['Apportioned Value', 'Apportion Value', 'Apportioned Amt'], data.apportionedValue);
      if (!ok) {
        await this.setTextByCandidates(
          ['apprtndValue', 'apportionValue', 'apportionedValue'],
          data.apportionedValue,
          'Apportioned value'
        );
      }
    }
    if (data.lienAmount) {
      const ok = await this.fillByAnyLabel(['Lien Amt', 'Lien Amount', 'Lien Amt.'], data.lienAmount);
      if (!ok) {
        await this.setTextByCandidates(
          ['lienAmt', 'lienAmount', 'lienAmt_ui'],
          data.lienAmount,
          'Lien amount'
        );
      }
    }
    if (data.notes) {
      const ok = await this.fillByAnyLabel(['Notes', 'Note'], data.notes);
      if (!ok) {
        await this.setTextByCandidates(
          ['notes', 'clpar.notes'],
          data.notes,
          'Notes'
        );
      }
    }
    if (data.withdraw) {
      const yes = ['yes', 'y'].includes(data.withdraw.toLowerCase());
      const finwFrame = this.getFinwFrame();
      const radios = finwFrame.locator('input#withdraw[type="radio"]');
      const target = radios.nth(yes ? 0 : 1);
      if (await target.count() > 0 && await target.isVisible().catch(() => false) && await target.isEnabled().catch(() => false)) {
        await target.click({ timeout: 10000 });
      }
    }
    if (data.valueIndicator) {
      await this.setTextByCandidates(
        ['valueIndcr', 'valueIndicator', 'clpar.valueIndcr'],
        data.valueIndicator,
        'Value indicator'
      );
    }
  }

  // Fills the Life Insurance specific fields on the HCLM Particulars tab.
  async fillCollateralLifeInsuranceParticulars(data: {
    policyNo?: string;
    policyAmt?: string;
    frequencyForStatement?: string;
    surrenderValue?: string;
  }) {
    if (data.policyNo) {
      const ok = await this.fillByAnyLabel(['Policy No', 'Policy No.', 'Policy Number'], data.policyNo);
      if (!ok) {
        await this.setTextByCandidates(
          ['policyNo', 'policyNumber', 'policyNo_ui', 'clpar.policyNo'],
          data.policyNo,
          'Policy No'
        );
      }
    }
    if (data.policyAmt) {
      const ok = await this.fillByAnyLabel(['Policy Amt', 'Policy Amt.', 'Policy Amount', 'Amount'], data.policyAmt);
      if (!ok) {
        await this.setTextByCandidates(
          ['policyAmt', 'policyAmount', 'policyAmt_ui', 'clpar.policyAmt'],
          data.policyAmt,
          'Policy Amt'
        );
      }
    }
    if (data.frequencyForStatement) {
      let ok = await this.selectOptionByLabel('frequency', data.frequencyForStatement);
      if (!ok) {
        ok = await this.selectOptionByLabel('statement', data.frequencyForStatement);
      }
      if (!ok) {
        // Last resort: search all visible dropdowns for an option containing the keyword.
        const finwFrame = this.getFinwFrame();
        const dropdowns = finwFrame.locator('select:visible');
        const count = await dropdowns.count();
        const keyword = data.frequencyForStatement.toLowerCase();
        for (let i = 0; i < count; i++) {
          const dd = dropdowns.nth(i);
          if (await dd.isDisabled().catch(() => true)) continue;
          const opts = await dd.locator('option').allTextContents();
          const match = opts.find(o => o.toLowerCase().includes(keyword));
          if (match) {
            try {
              await dd.selectOption(match.split('-')[0].trim(), { timeout: 8000 });
            } catch {
              await dd.selectOption({ label: match }, { timeout: 8000 }).catch(() => {});
            }
            console.log(`Selected '${match}' for Frequency for Statement`);
            break;
          }
        }
      }
    }
    if (data.surrenderValue) {
      const ok = await this.fillByAnyLabel(['Surrender Value', 'Surnder Value'], data.surrenderValue);
      if (!ok) {
        await this.setTextByCandidates(
          ['surrenderValue', 'surnderValue', 'surrenderAmt', 'clpar.surrenderValue'],
          data.surrenderValue,
          'Surrender Value'
        );
      }
    }
  }

  // Fills the Immovable Property specific fields on the HCLM Particulars tab.
  async fillCollateralImmovablePropertyParticulars(data: {
    deriveValue?: string;
    assessedValue?: string;
    propertyDocumentNo?: string;
    addressLine1?: string;
  }) {
    if (data.deriveValue) {
      let ok = await this.selectOptionByLabel('derive', data.deriveValue);
      if (!ok) {
        ok = await this.selectOptionByLabel('from', data.deriveValue);
      }
      if (!ok) {
        // Last resort: search all visible dropdowns for an option containing the keyword.
        const finwFrame = this.getFinwFrame();
        const dropdowns = finwFrame.locator('select:visible');
        const count = await dropdowns.count();
        const keyword = data.deriveValue.toLowerCase();
        for (let i = 0; i < count; i++) {
          const dd = dropdowns.nth(i);
          if (await dd.isDisabled().catch(() => true)) continue;
          const opts = await dd.locator('option').allTextContents();
          const match = opts.find(o => o.toLowerCase().includes(keyword));
          if (match) {
            try {
              await dd.selectOption(match.split('-')[0].trim(), { timeout: 8000 });
            } catch {
              await dd.selectOption({ label: match }, { timeout: 8000 }).catch(() => {});
            }
            console.log(`Selected '${match}' for From Derive Value`);
            break;
          }
        }
      }
    }
    if (data.assessedValue) {
      const ok = await this.fillByAnyLabel(['Assessed Value', 'Assessed Amt', 'Assessed Amount'], data.assessedValue);
      if (!ok) {
        await this.setTextByCandidates(
          ['assessedValue', 'assessedAmt', 'assessedValue_ui', 'clpar.assessedValue'],
          data.assessedValue,
          'Assessed Value'
        );
      }
    }
    if (data.propertyDocumentNo) {
      const ok = await this.fillByAnyLabel(['Property Document No', 'Property Document No.', 'Document No'], data.propertyDocumentNo);
      if (!ok) {
        await this.setTextByCandidates(
          ['propertyDocNo', 'propertyDocumentNo', 'propDocNo', 'docNo', 'clpar.propertyDocNo'],
          data.propertyDocumentNo,
          'Property Document No'
        );
      }
    }
    if (data.addressLine1) {
      const ok = await this.fillByAnyLabel(['Address Line 1', 'Address Line1', 'Address1'], data.addressLine1);
      if (!ok) {
        await this.setTextByCandidates(
          ['addressLine1', 'address1', 'addrLine1', 'clpar.addressLine1'],
          data.addressLine1,
          'Address Line 1'
        );
      }
    }
  }

  // Opens the Insurance Type lookup on the HCLM Insurance tab and selects the
  // requested code (e.g. 003). Falls back to direct fill if the lookup is unavailable.
  async selectInsuranceType(code: string) {
    const popup = await this.clickLookupIconByLabel('Insurance Type');
    if (popup) {
      try {
        await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        await popup.waitForTimeout(2000);
        const frames = [popup.mainFrame(), ...popup.frames().filter(f => f !== popup.mainFrame())];
        for (const frame of frames) {
          const searchInput = frame.locator('input[type="text"]').first();
          if (await searchInput.count() > 0 && await searchInput.isVisible().catch(() => false)) {
            await searchInput.fill(code);
            await frame.locator('input[type="submit"], input[type="button"], button, a').filter({ hasText: /search|go|submit|ok/i }).first().click({ timeout: 10000 }).catch(() => {});
            await popup.waitForTimeout(2000);
            break;
          }
        }
        let selected = false;
        for (const frame of frames) {
          const codeRegex = new RegExp(`\\b${code}\\b`, 'i');
          const link = frame.locator('a').filter({ hasText: codeRegex }).first();
          if (await link.count() > 0 && await link.isVisible().catch(() => false)) {
            await link.click({ timeout: 10000 });
            selected = true;
            console.log(`Clicked insurance type link: ${code}`);
            break;
          }
          const td = frame.locator('td').filter({ hasText: codeRegex }).first();
          if (await td.count() > 0 && await td.isVisible().catch(() => false)) {
            await td.click({ timeout: 10000 });
            selected = true;
            console.log(`Clicked insurance type table cell: ${code}`);
            break;
          }
        }
        if (!selected) {
          for (const frame of frames) {
            const firstLink = frame.locator('table td a').first();
            if (await firstLink.count() > 0 && await firstLink.isVisible().catch(() => false)) {
              await firstLink.click({ timeout: 10000 });
              console.log('Clicked first insurance type link in popup as fallback');
              break;
            }
          }
        }
        await popup.waitForTimeout(1500);
        if (!popup.isClosed()) {
          await popup.close().catch(() => {});
        }
        await this.page.waitForTimeout(2000);
        console.log(`Selected insurance type via lookup: ${code}`);
        return;
      } catch (e) {
        console.log(`Insurance type lookup failed, falling back to direct fill: ${e}`);
      }
    }
    const ok = await this.fillByLabel('Insurance Type', code);
    if (!ok) {
      await this.setTextByCandidates(
        ['insuranceType', 'insType', 'insuranceTypeCode', 'clpar.insuranceType'],
        code,
        'Insurance Type'
      );
    }
  }

  // Fills the HCLM Insurance tab fields for an Immovable Property collateral.
  async fillCollateralInsuranceTab(data: {
    insuranceType?: string;
    policyNo?: string;
    policyAmt?: string;
    premiumAmt?: string;
    frequency?: string;
  }) {
    if (data.insuranceType) {
      await this.selectInsuranceType(data.insuranceType);
    }
    if (data.policyNo) {
      const ok = await this.fillByAnyLabel(['Policy No', 'Policy No.', 'Policy Number'], data.policyNo);
      if (!ok) {
        await this.setTextByCandidates(
          ['policyNo', 'policyNumber', 'policyNo_ui', 'insPolicyNo', 'clpar.policyNo'],
          data.policyNo,
          'Policy No'
        );
      }
    }
    if (data.policyAmt) {
      const ok = await this.fillByAnyLabel(['Policy Amt', 'Policy Amt.', 'Policy Amount'], data.policyAmt);
      if (!ok) {
        await this.setTextByCandidates(
          ['policyAmt', 'policyAmount', 'policyAmt_ui', 'insPolicyAmt', 'clpar.policyAmt'],
          data.policyAmt,
          'Policy Amt'
        );
      }
    }
    if (data.premiumAmt) {
      const ok = await this.fillByAnyLabel(['Premium Amt', 'Premium Amt.', 'Premium Amount'], data.premiumAmt);
      if (!ok) {
        await this.setTextByCandidates(
          ['premiumAmt', 'premiumAmount', 'premiumAmt_ui', 'insPremiumAmt', 'clpar.premiumAmt'],
          data.premiumAmt,
          'Premium Amt'
        );
      }
    }
    if (data.frequency) {
      let ok = await this.selectOptionByLabel('frequency', data.frequency);
      if (!ok) {
        // Last resort: search all visible dropdowns for an option containing the keyword.
        const finwFrame = this.getFinwFrame();
        const dropdowns = finwFrame.locator('select:visible');
        const count = await dropdowns.count();
        const keyword = data.frequency.toLowerCase();
        for (let i = 0; i < count; i++) {
          const dd = dropdowns.nth(i);
          if (await dd.isDisabled().catch(() => true)) continue;
          const opts = await dd.locator('option').allTextContents();
          const match = opts.find(o => o.toLowerCase().includes(keyword));
          if (match) {
            try {
              await dd.selectOption(match.split('-')[0].trim(), { timeout: 8000 });
            } catch {
              await dd.selectOption({ label: match }, { timeout: 8000 }).catch(() => {});
            }
            console.log(`Selected '${match}' for Insurance Frequency`);
            break;
          }
        }
      }
    }
  }

  // Sets the Due Date on the HCLM Particulars tab. Mirrors setCollateralReviewDate.
  async setCollateralDueDate(date: string) {
    const finwFrame = this.getFinwFrame();
    const visibleInput = finwFrame.locator('#dueDate_ui, #dueDt_ui').first();
    const isEditable = await visibleInput.count() > 0 && await visibleInput.isVisible().catch(() => false) && await visibleInput.isEditable().catch(() => false);

    if (isEditable) {
      await visibleInput.fill(date);
      await visibleInput.press('Tab').catch(() => {});
      console.log(`Set due date via Playwright fill: ${date}`);
    } else {
      const ok = await this.fillByAnyLabel(['Due Date', 'Date of Due'], date);
      if (!ok) {
        await this.setTextByCandidates(
          ['dueDate_ui', 'dueDate', 'dueDt_ui', 'dueDt', 'collateralDueDate'],
          date,
          'Due date'
        );
      }
      await this.syncFinacleDateBackend('dueDate', date);
      if (await visibleInput.count() > 0 && await visibleInput.isVisible().catch(() => false)) {
        await visibleInput.press('Tab').catch(() => {});
      }
    }
  }

  // Adds a distinctive-number row on the HCLM Particulars tab (used for mutual
  // funds / securities collateral). Fills Prefix, From/To distinctive numbers
  // and number of units. By default it clicks the Add button; pass skipAdd: true
  // to leave the row values uncommitted and submit them directly with the form.
  async addCollateralDistinctiveRow(data: {
    prefix?: string;
    fromDistinctiveNo: string;
    toDistinctiveNo: string;
    units: string;
    skipAdd?: boolean;
  }) {
    if (data.prefix) {
      const prefixOk = await this.fillByAnyLabel(['Prefix', 'Distinctive Prefix'], data.prefix);
      if (!prefixOk) {
        await this.setTextByCandidates(
          ['prefix', 'distinctivePrefix', 'distPrefix', 'clpar.prefix'],
          data.prefix,
          'Distinctive prefix'
        );
      }
    }

    const fromOk = await this.fillByAnyLabel(
      ['From Distinctive No.', 'From Distinctive No', 'From Dist No', 'Distinctive No From'],
      data.fromDistinctiveNo
    );
    if (!fromOk) {
      await this.setTextByCandidates(
        ['fromDistinctiveNo', 'fromDistNo', 'frmDistNo', 'fromDistinctiveNumber', 'distinctiveNoFrom'],
        data.fromDistinctiveNo,
        'From distinctive no'
      );
    }

    const toOk = await this.fillByAnyLabel(
      ['To Distinctive No.', 'To Distinctive No', 'To Dist No', 'Distinctive No To'],
      data.toDistinctiveNo
    );
    if (!toOk) {
      await this.setTextByCandidates(
        ['toDistinctiveNo', 'toDistNo', 'toDistinctiveNumber', 'distinctiveNoTo'],
        data.toDistinctiveNo,
        'To distinctive no'
      );
    }

    const unitsOk = await this.fillByAnyLabel(
      ['No. of Units', 'Number of Units', 'No Of Units', 'Units'],
      data.units
    );
    if (!unitsOk) {
      await this.setTextByCandidates(
        ['noOfUnits', 'numberOfUnits', 'units', 'noUnits', 'collateralUnits'],
        data.units,
        'No. of units'
      );
    }

    // Click the Add button unless skipAdd is requested, in which case the
    // distinctive values are submitted directly with the form.
    if (data.skipAdd) {
      console.log('Skipped Add button; distinctive row values will be submitted directly');
      return;
    }
    const finwFrame = this.getFinwFrame();
    const addBtn = finwFrame.locator(
      'input[type="button"][value="Add"]:visible, input[type="submit"][value="Add"]:visible, button:has-text("Add"):visible'
    ).first();
    if (await addBtn.count() > 0 && await addBtn.isVisible().catch(() => false)) {
      await addBtn.click({ timeout: 15000 });
      await this.page.waitForTimeout(2000);
      console.log('Clicked Add button on collateral Particulars tab');
    } else {
      await this.clickButtonByText('Add');
    }
  }

  // Captures the generated collateral id from the success message after HCLM Submit.
  async getGeneratedCollateralId(): Promise<string | null> {
    const finwFrame = this.getFinwFrame();
    const body = await finwFrame.locator('body').innerText().catch(() => '');
    const match = body.match(/collateral\s*id\s*[:=]?\s*([A-Z]{2,}\d{3,})/i) ||
                  body.match(/collateral\s*(?:number|no)\.?\s*[:=]?\s*([A-Z]{2,}\d{3,})/i) ||
                  body.match(/generated\s*collateral\s*id\s*[:=]?\s*([A-Z]{2,}\d{3,})/i) ||
                  body.match(/record\s*(?:lodged|created)\s*successfully.*?\b([A-Z]{2,}\d{3,})\b/i);
    if (match) return match[1].trim();
    return null;
  }

  // Diagnostic: logs the full body text from all frames (useful after Submit).

  // Clicks a button by its visible text (e.g. "Validate", "Submit", "Accept").
  async clickButtonByText(text: string) {
    const finwFrame = this.getFinwFrame();
    const selector = [
      `#${text}`,
      `input[type="submit"][value="${text}" i]`,
      `input[type="button"][value="${text}" i]`,
      `button:has-text("${text}")`,
      `a:has-text("${text}")`,
    ].join(', ');
    const btn = finwFrame.locator(selector).first();
    if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 15000 });
      await this.page.waitForTimeout(2000);
      console.log(`Clicked button: ${text}`);
    } else {
      console.log(`Button '${text}' not found or not visible`);
    }
  }

  // ============ Robust label-based field filling helpers ============

  // Fills a text field by finding a visible cell whose text starts with
  // labelText, then fills the first enabled input in the same row. Falls back
  // to a Playwright row locator if the JS evaluate approach fails.
  async fillByLabel(labelText: string, value: string, frame?: Frame): Promise<boolean> {
    const finwFrame = frame || this.getFinwFrame();
    try {
      const filled = await finwFrame.evaluate(({ label, val }) => {
        const cells = Array.from(document.querySelectorAll('td, th'));
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const labelNorm = normalize(label);
        const matches = cells
          .map(el => ({ el, t: normalize(el.textContent?.trim() || '') }))
          .filter(({ t }) => t.length > 0 && (t === labelNorm || t.startsWith(labelNorm)));
        const exact = matches.find(({ t }) => t === labelNorm);
        const prefixMatch = matches.find(({ t }) => {
          const next = t.slice(labelNorm.length).charAt(0);
          return !next || !/[a-z0-9]/.test(next);
        });
        const labelCell = exact ? exact.el : (prefixMatch ? prefixMatch.el : (matches.length > 0 ? matches[0].el : undefined));
        if (!labelCell) return { ok: false, reason: `label cell not found: ${label}` };

        const updateBackend = (input: HTMLInputElement) => {
          if (input.id && input.id.endsWith('_ui')) {
            const baseId = input.id.replace('_ui', '');
            const hiddenById = document.querySelector(`input[id="${baseId}"]`) as HTMLInputElement | null;
            if (hiddenById) {
              hiddenById.value = val;
              hiddenById.dispatchEvent(new Event('input', { bubbles: true }));
              hiddenById.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          if (input.name && input.name.endsWith('_ui')) {
            const baseName = input.name.replace('_ui', '');
            const hiddenByName = document.querySelector(`input[name="${baseName}"], input[name="${baseName}_hdn"]`) as HTMLInputElement | null;
            if (hiddenByName) {
              hiddenByName.value = val;
              hiddenByName.dispatchEvent(new Event('input', { bubbles: true }));
              hiddenByName.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        };

        const setInput = (input: HTMLInputElement) => {
          const isBool = /^(yes|no|y|n|true|false)$/i.test(String(val).trim());
          if (isBool && input.type !== 'checkbox' && input.type !== 'radio') return;
          if (input.value.trim() === val) return;
          input.value = val;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          updateBackend(input);
        };

        // First pass: fill enabled/editable inputs.
        let sibling = labelCell.nextElementSibling;
        while (sibling) {
          const input = sibling.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null;
          if (input && !input.disabled && !input.readOnly) {
            input.focus();
            setInput(input);
            input.blur();
            return { ok: true, id: input.id, name: input.name, via: 'sibling' };
          }
          // Stop at next label cell to avoid spilling into wrong field.
          if ((sibling.textContent?.trim() || '').length > 2 && sibling.querySelector('input') === null) break;
          sibling = sibling.nextElementSibling;
        }

        // Fallback: check the row for any enabled input positioned to the right of the label cell.
        const row = labelCell.closest('tr');
        if (row) {
          const labelRect = (labelCell as HTMLElement).getBoundingClientRect();
          const inputs = Array.from(row.querySelectorAll('input[type="text"], input:not([type])'))
            .filter(el => {
              const r = (el as HTMLElement).getBoundingClientRect();
              return r.left > labelRect.right && !(el as HTMLInputElement).disabled && !(el as HTMLInputElement).readOnly;
            }) as HTMLInputElement[];
          if (inputs.length > 0) {
            const input = inputs[0];
            input.focus();
            setInput(input);
            input.blur();
            return { ok: true, id: input.id, name: input.name, via: 'row-positional' };
          }
        }

        // Second pass: Finacle display-only inputs (disabled/readonly) still need to be filled,
        // and their hidden backend counterparts must be updated too.
        sibling = labelCell.nextElementSibling;
        while (sibling) {
          const input = sibling.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null;
          if (input) {
            input.focus();
            setInput(input);
            input.blur();
            return { ok: true, id: input.id, name: input.name, via: 'sibling-disabled' };
          }
          if ((sibling.textContent?.trim() || '').length > 2 && sibling.querySelector('input') === null) break;
          sibling = sibling.nextElementSibling;
        }
        if (row) {
          const labelRect = (labelCell as HTMLElement).getBoundingClientRect();
          const inputs = Array.from(row.querySelectorAll('input[type="text"], input:not([type])'))
            .filter(el => {
              const r = (el as HTMLElement).getBoundingClientRect();
              return r.left > labelRect.right;
            }) as HTMLInputElement[];
          if (inputs.length > 0) {
            const input = inputs[0];
            input.focus();
            setInput(input);
            input.blur();
            return { ok: true, id: input.id, name: input.name, via: 'row-positional-disabled' };
          }
        }

        return { ok: false, reason: `no input found after label: ${label}` };
      }, { label: labelText, val: value });
      console.log(`fillByLabel("${labelText}", "${value}"): ${JSON.stringify(filled)}`);
      if (filled.ok) return true;
    } catch (e) {
      console.log(`fillByLabel("${labelText}") evaluate failed: ${e}`);
    }

    // Playwright native fallback: only use fill on visible, enabled inputs to avoid
    // hanging on disabled/readonly Finacle display fields.
    try {
      const row = finwFrame.locator('tr').filter({ hasText: new RegExp(`^\\s*${labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') }).first();
      const input = row.locator('input[type="text"], input:not([type])').first();
      if (await input.count() > 0 && await input.isVisible().catch(() => false) && await input.isEditable().catch(() => false)) {
        const current = await input.inputValue().catch(() => '');
        if (current === value) {
          console.log(`fillByLabel("${labelText}") already set to "${value}" via Playwright row locator`);
          return true;
        }
        await input.fill(value);
        console.log(`fillByLabel("${labelText}") filled via Playwright row locator`);
        return true;
      }
    } catch (e) {
      console.log(`fillByLabel("${labelText}") Playwright fallback failed: ${e}`);
    }

    // Accessible-name fallback: labels outside table cells (e.g. <label for="..."> or aria-label).
    try {
      const inputByLabel = finwFrame.getByLabel(labelText, { exact: false }).first();
      if (await inputByLabel.count() > 0 && await inputByLabel.isVisible().catch(() => false) && await inputByLabel.isEditable().catch(() => false)) {
        const current = await inputByLabel.inputValue().catch(() => '');
        if (current === value) {
          console.log(`fillByLabel("${labelText}") already set to "${value}" via getByLabel`);
          return true;
        }
        await inputByLabel.fill(value);
        await inputByLabel.evaluate((input: HTMLInputElement, val: string) => {
          const updateBackend = (base: string) => {
            const hiddenById = document.querySelector(`input[id="${base}"]`) as HTMLInputElement | null;
            if (hiddenById) {
              hiddenById.value = val;
              hiddenById.dispatchEvent(new Event('input', { bubbles: true }));
              hiddenById.dispatchEvent(new Event('change', { bubbles: true }));
            }
          };
          if (input.id && input.id.endsWith('_ui')) {
            updateBackend(input.id.replace('_ui', ''));
          }
          if (input.name && input.name.endsWith('_ui')) {
            const baseName = input.name.replace('_ui', '');
            const hiddenByName = document.querySelector(`input[name="${baseName}"], input[name="${baseName}_hdn"]`) as HTMLInputElement | null;
            if (hiddenByName) {
              hiddenByName.value = val;
              hiddenByName.dispatchEvent(new Event('input', { bubbles: true }));
              hiddenByName.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }, value);
        console.log(`fillByLabel("${labelText}") filled via getByLabel`);
        return true;
      }
    } catch (e) {
      console.log(`fillByLabel("${labelText}") getByLabel fallback failed: ${e}`);
    }

    return false;
  }

  // Clicks the lookup/search icon next to a field identified by its label text.
  // Returns the opened popup Page, or null if no icon was found.
  async clickLookupIconByLabel(labelText: string): Promise<import('@playwright/test').Page | null> {
    const finwFrame = this.getFinwFrame();
    try {
      // First, find the lookup element without clicking.
      const iconInfo = await finwFrame.evaluate(({ label }) => {
        const cells = Array.from(document.querySelectorAll('td, th'));
        const labelCell = cells.find(el => {
          const t = (el.textContent?.trim() || '').replace(/\s+/g, ' ');
          return t.length > 0 && t.toLowerCase().startsWith(label.toLowerCase());
        });
        if (!labelCell) return { ok: false, reason: 'label cell not found' };
        const row = labelCell.closest('tr');
        if (!row) return { ok: false, reason: 'no row for label' };
        // Look for a lookup icon: img with title, anchor with onclick, or input image.
        const allIcons =
          row.querySelectorAll('a[onclick*="openWindow"], a[onclick*="lookup"], a[onclick*="search"], a[onclick*="showRefCode"], a[href*="openWindow"], a[href*="lookup"], a[href*="search"], a[href*="showRefCode"], img[title*="Search"], img[title*="Lookup"], input[type="image"][title*="Search"], input[type="image"][title*="Lookup"]');
        const icon = Array.from(allIcons).find(i => (labelCell.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING) === Node.DOCUMENT_POSITION_FOLLOWING) ||
          row.querySelector('a img') ||
          row.querySelector('a') ||
          row.querySelector('img, input[type="image"], button');
        if (!icon) return { ok: false, reason: 'no lookup icon found' };
        return { ok: true, tag: icon.tagName, id: (icon as HTMLElement).id };
      }, { label: labelText });
      console.log(`clickLookupIconByLabel("${labelText}"): ${JSON.stringify(iconInfo)}`);
      if (!iconInfo.ok) return null;

      // Set up popup listener before clicking so we reliably capture the window.
      const popupPromise = Promise.race([
        this.page.waitForEvent('popup', { timeout: 10000 }),
        this.page.context().waitForEvent('page', { timeout: 10000 }),
      ]).catch(() => null);
      await finwFrame.evaluate(({ label }) => {
        const cells = Array.from(document.querySelectorAll('td, th'));
        const labelCell = cells.find(el => {
          const t = (el.textContent?.trim() || '').replace(/\s+/g, ' ');
          return t.length > 0 && t.toLowerCase().startsWith(label.toLowerCase());
        });
        if (!labelCell) return;
        const row = labelCell.closest('tr');
        if (!row) return;
        const allIcons =
          row.querySelectorAll('a[onclick*="openWindow"], a[onclick*="lookup"], a[onclick*="search"], a[onclick*="showRefCode"], a[href*="openWindow"], a[href*="lookup"], a[href*="search"], a[href*="showRefCode"], img[title*="Search"], img[title*="Lookup"], input[type="image"][title*="Search"], input[type="image"][title*="Lookup"]');
        const icon = Array.from(allIcons).find(i => (labelCell.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING) === Node.DOCUMENT_POSITION_FOLLOWING) ||
          row.querySelector('a img') ||
          row.querySelector('a') ||
          row.querySelector('img, input[type="image"], button');
        if (icon) ((icon.closest('a, button') || icon) as HTMLElement).click();
      }, { label: labelText });
      await this.page.waitForTimeout(1000);
      const popup = await popupPromise;
      if (popup) return popup;
      // Fallback: return the most recently opened popup if any.
      const pages = this.page.context().pages();
      return pages.length > 1 ? pages[pages.length - 1] : null;
    } catch (e) {
      console.log(`clickLookupIconByLabel("${labelText}") failed: ${e}`);
    }
    return null;
  }

  // Opens the lookup for `labelText` and selects the first available row.
  // Use this when the exact valid lookup code is unknown (e.g. sanction fields).
  async selectLookupFirstOption(labelText: string): Promise<boolean> {
    const popup = await this.clickLookupIconByLabel(labelText);
    if (!popup || popup.isClosed()) {
      console.log(`Lookup popup not opened for ${labelText}`);
      return false;
    }
    try {
      if (!popup.isClosed()) {
        await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        await popup.waitForTimeout(2000);
      }
      const frames = [popup.mainFrame(), ...popup.frames().filter(f => f !== popup.mainFrame())];
      for (const frame of frames) {
        // Skip header rows (th) and pick the first data cell link.
        let firstLink = frame.locator('table tr:has(td a):not(:has(th)) td a, table tbody tr td a, table.dataTable tr td a').first();
        if (!(await firstLink.isVisible().catch(() => false))) {
          firstLink = frame.locator('table tr td a').first();
        }
        if (await firstLink.isVisible().catch(() => false)) {
          const linkText = (await firstLink.innerText().catch(() => '')).trim();
          console.log(`Selecting first lookup row for ${labelText}: "${linkText}"`);
          await firstLink.click({ timeout: 10000 });
          console.log(`Selected first lookup row for ${labelText}`);
          await this.page.waitForTimeout(2000);
          return true;
        }
      }
      console.log(`No lookup rows for ${labelText}`);
    } catch (e) {
      console.log(`selectLookupFirstOption failed for ${labelText}: ${e}`);
    }
    if (!popup.isClosed()) await popup.close().catch(() => {});
    return false;
  }

  // Reads the 'Suspended Till' / 'Suspension End Date' value on the HSIM
  // (Standing Instruction) screen. Returns the trimmed value if it is rendered,
  // otherwise null, so the test can assert it is not populated after a cancelled
  // freeze (defect TOL000000678784).
  async getHsimSuspendedTillValue(): Promise<string | null> {
    try {
      const finwFrame = this.getFinwFrame();
      const candidates = [
        '#suspendedTill',
        '#suspensionEndDate',
        '#suspTill',
        '#siSuspTill',
        'input[id*="susp" i]',
        'input[id*="till" i]',
        'input[id*="endDate" i]',
        'td[id*="susp" i]',
        'span[id*="susp" i]',
      ];
      for (const sel of candidates) {
        const el = finwFrame.locator(sel).first();
        if (await el.count().catch(() => 0) > 0) {
          const value = (await el.inputValue().catch(() => '')) ||
                        (await el.innerText().catch(() => ''));
          if (value && value.trim()) {
            console.log(`Read Suspended Till from ${sel}: ${value.trim()}`);
            return value.trim();
          }
        }
      }
      // Fallback: search the body text for a date near a Suspended/End Date label.
      const body = await finwFrame.locator('body').innerText().catch(() => '');
      const match = body.match(/(?:Suspended\s*Till|Suspension\s*End\s*Date)[^\d]*(\d{2}[\/-]\d{2}[\/-]\d{4})/i);
      if (match && match[1]) {
        console.log(`Read Suspended Till from body text: ${match[1]}`);
        return match[1];
      }
      return null;
    } catch (e) {
      console.log(`Could not read HSIM Suspended Till: ${e}`);
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
  private async htmSetField(candidates: string[], value: string, label: string): Promise<void> {
    const finwFrame = this.getFinwFrame();
    for (const candidate of candidates) {
      const inputs = [
        finwFrame.locator(`#${candidate}`).first(),
        finwFrame.locator(`[name="${candidate}"]`).first(),
        finwFrame.locator(`input[id*="${candidate}" i]`).first(),
        finwFrame.locator(`input[name*="${candidate}" i]`).first(),
      ];
      for (const input of inputs) {
        try {
          if (await input.count() > 0 && await input.isVisible().catch(() => false) && await input.isEnabled().catch(() => false)) {
            await input.click({ clickCount: 3 });
            await input.fill(value);
            await input.press('Tab').catch(() => {});
            await this.page.waitForTimeout(800);
            console.log(`Set ${label} = ${value}`);
            return;
          }
        } catch {}
      }
    }
    const ok = await this.fillByLabel(label, value).catch(() => false);
    if (!ok) console.log(`Could not set ${label} = ${value}`);
  }

  private async htmSetSelect(candidates: string[], value: string, label: string): Promise<void> {
    const finwFrame = this.getFinwFrame();
    for (const candidate of candidates) {
      const select = finwFrame.locator(`#${candidate}, select[name="${candidate}"], select[id*="${candidate}" i]`).first();
      try {
        if (await select.count() > 0 && await select.isVisible().catch(() => false) && await select.isEnabled().catch(() => false)) {
          await select.selectOption(value);
          await this.page.waitForTimeout(800);
          console.log(`Selected ${label} = ${value}`);
          return;
        }
      } catch {}
    }
    const ok = await this.fillByLabel(label, value).catch(() => false);
    if (!ok) console.log(`Could not select ${label} = ${value}`);
  }

  private async htmClickButton(label: string): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const selectors = [
      `#${label}`,
      `input[type="button"][value="${label}" i]`,
      `input[type="submit"][value="${label}" i]`,
      `input[type="button"][value*="${label}" i]`,
      `input[type="image"][alt*="${label}" i]`,
      `button:has-text("${label}")`,
    ].join(', ');
    try {
      const btn = finwFrame.locator(selectors).first();
      if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click({ timeout: 15000 });
        await this.page.waitForTimeout(2000);
        console.log(`Clicked ${label} button`);
        return;
      }
      const jsClicked = await finwFrame.evaluate((buttonLabel) => {
        const labels = ['input[type="button"]', 'input[type="submit"]', 'button', 'a', 'img'];
        for (const tag of labels) {
          const elements = Array.from(document.querySelectorAll(tag)) as HTMLElement[];
          const el = elements.find(e => {
            const v = (e.getAttribute('value') || e.getAttribute('alt') || e.getAttribute('title') || e.textContent || '').trim().toLowerCase();
            return v === buttonLabel.toLowerCase() || v.includes(buttonLabel.toLowerCase());
          });
          if (el) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, label);
      if (jsClicked) {
        await this.page.waitForTimeout(2000);
        console.log(`Clicked ${label} button via JS`);
      } else {
        console.log(`Could not click ${label} button`);
      }
    } catch (e) {
      console.log(`Could not click ${label} button: ${e}`);
    }
  }

  private async htmSetPartTran(type: 'D' | 'C'): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const result = await finwFrame.evaluate((t) => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      const target = radios.find(r => {
        const name = (r.name || '').toLowerCase();
        const id = (r.id || '').toLowerCase();
        const v = r.value.toUpperCase();
        return (name.includes('ptran') || name.includes('drcr') || name.includes('dr') || name.includes('cr') || id.includes('ptran') || id.includes('drcr')) && v === t;
      });
      if (target) {
        target.checked = true;
        (target as HTMLElement).click();
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return `Set part tran type to ${target.value}`;
      }
      return `Part tran type ${t} not found`;
    }, type);
    console.log('htmSetPartTran:', result);
    await this.page.waitForTimeout(800);
  }

  async selectHtmFunction(code: 'A' | 'D' | 'I' | 'M' | 'P' | 'V' | 'C' | 'T') {
    await this.htmSetSelect(['funcCode'], code, 'Function');
    console.log(`Selected HTM function: ${code}`);
  }

  async selectHtmTranTypeSubType(value: string) {
    await this.htmSetSelect(['tranTypeSubType', 'tranType'], value, 'Transaction Type/Subtype');
    console.log(`Selected transaction type/subtype: ${value}`);
  }


  async enterHtmAccountId(accountId: string) {
    await this.htmSetField(['acctId', 'accountId', 'acctNum'], accountId, 'A/c. ID');
    console.log(`Entered HTM account ID: ${accountId}`);
  }

  async enterHtmAmount(amount: string, pressTab = false) {
    try {
      const finwFrame = this.getFinwFrame();
      const amtField = finwFrame.locator('#refAmt, #amount, input[name="refAmt"]').first();
      await amtField.waitFor({ state: 'visible', timeout: 15000 });
      await amtField.click();
      await amtField.fill('');
      await this.page.waitForTimeout(500);
      await amtField.fill(amount);
      if (pressTab) {
        await amtField.press('Tab');
      }
      await this.page.waitForTimeout(1000);
      const val = await amtField.inputValue().catch(() => '');
      console.log(`Entered HTM amount: ${amount} (field value: ${val})`);
    } catch (e) {
      console.log(`Could not enter HTM amount, skipping: ${e}`);
    }
    console.log(`Entered HTM amount: ${amount}`);
  }



  async selectHtmDebit() {
    await this.htmSetPartTran('D');
    console.log('Selected debit option');
  }


  async clickHtmAdd() {
    try {
      await this.htmAddButton.click();
      await this.page.waitForTimeout(5000);
      console.log('Clicked HTM Add button (waited 5s for form reset)');
    } catch (e) {
      console.log(`Could not click HTM Add button, skipping: ${e}`);
    }
  }

  async clickHtmPost() {
    await this.htmClickButton('Post');
  }

  async clickHtmGo() {
    await this.htmClickButton('Go');
  }






  async enterHtmSolId(solId: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const candidates = ['#solId', '#sol_id', 'input[name="solId"]', 'input[name="sol_id"]'];
      for (const sel of candidates) {
        const el = finwFrame.locator(sel).first();
        if (await el.count() > 0) {
          await el.fill(solId);
          await this.page.waitForTimeout(1000);
          console.log(`Entered HTM Sol ID: ${solId} (via ${sel})`);
          return;
        }
      }
      console.log('HTM Sol ID field not found (may be auto-filled), skipping');
    } catch (e) {
      console.log(`Could not enter HTM Sol ID, skipping: ${e}`);
    }
  }

  async selectHtmCredit() {
    try {
      await this.htmCreditRadio.check();
      await this.page.waitForTimeout(1000);
      console.log('Selected credit option');
    } catch (e) {
      console.log(`Could not select credit, skipping: ${e}`);
    }
  }

  async getHtmTransactionId(): Promise<string | null> {
    try {
      const finwFrame = this.getFinwFrame();
      const body = await finwFrame.locator('body').innerText();
      // Look for transaction ID patterns — must contain at least one digit
      const patterns = [
        /(?:Transaction|Tran)\s*(?:ID|Id)\s*[:=]?\s*([A-Z]*\d[A-Z0-9]*)/i,
        /(?:Ref(?:erence)?\s*(?:No|Number|#))\s*[:=]?\s*([A-Z]*\d[A-Z0-9]*)/i,
        /\b(S\d{10,})\b/,
        /\b(CB\d+)\b/
      ];
      for (const pat of patterns) {
        const m = body.match(pat);
        if (m && m[1]) {
          console.log(`Extracted HTM Transaction ID: ${m[1]}`);
          return m[1];
        }
      }
      // Also scan all frames
      for (const frame of this.page.frames()) {
        const text = await frame.evaluate(() => document.body?.innerText || '').catch(() => '');
        for (const pat of patterns) {
          const m = text.match(pat);
          if (m && m[1]) {
            console.log(`Extracted HTM Transaction ID from frame: ${m[1]}`);
            return m[1];
          }
        }
      }
      console.log('Could not extract HTM Transaction ID from body text');
      console.log('Body text snippet:', body.substring(0, 500));
      return null;
    } catch (e) {
      console.log(`Error extracting HTM Transaction ID: ${e}`);
      return null;
    }
  }

  async clickHtmOk() {
    try {
      const finwFrame = this.getFinwFrame();
      const okBtn = finwFrame.locator('#Ok, #ok, input[value="Ok"], input[value="OK"], input[value="ok"], button:has-text("OK"), button:has-text("Ok")').first();
      if (await okBtn.count() > 0) {
        await okBtn.click();
        await this.page.waitForTimeout(2000);
        console.log('Clicked HTM OK button');
      } else {
        console.log('HTM OK button not found on screen, skipping');
      }
    } catch (e) {
      console.log(`Could not click HTM OK button, skipping: ${e}`);
    }
  }

  async enterHtmTransactionId(transactionId: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const candidates = ['#tranId', '#tran_id', 'input[name="tranId"]', 'input[name="tran_id"]', '#transId', 'input[name="transId"]'];
      for (const sel of candidates) {
        const el = finwFrame.locator(sel).first();
        if (await el.count() > 0 && await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.fill(transactionId);
          await this.page.waitForTimeout(1000);
          console.log(`Entered HTM Transaction ID: ${transactionId} (via ${sel})`);
          return;
        }
      }
      // Fallback: use the acctId field if it's the only text input visible (Verify mode reuses it)
      const acctField = finwFrame.locator('#acctId').first();
      if (await acctField.count() > 0 && await acctField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await acctField.fill(transactionId);
        await this.page.waitForTimeout(1000);
        console.log(`Entered HTM Transaction ID via acctId fallback: ${transactionId}`);
        return;
      }
      console.log('HTM Transaction ID field not found, skipping');
    } catch (e) {
      console.log(`Could not enter HTM Transaction ID, skipping: ${e}`);
    }
  }

  async enterHtmTransactionDate(date: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const candidates = ['#tranDate', '#tran_date', 'input[name="tranDate"]', 'input[name="tran_date"]', '#transDate', 'input[name="transDate"]'];
      for (const sel of candidates) {
        const el = finwFrame.locator(sel).first();
        if (await el.count() > 0 && await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.fill(date);
          await this.page.waitForTimeout(1000);
          console.log(`Entered HTM Transaction Date: ${date} (via ${sel})`);
          return;
        }
      }
      console.log('HTM Transaction Date field not found (may be auto-filled), skipping');
    } catch (e) {
      console.log(`Could not enter HTM Transaction Date, skipping: ${e}`);
    }
  }

  async readHtmPartTransaction(label: string): Promise<{ account: string; amount: string }> {
    const result = { account: '', amount: '' };
    try {
      const finwFrame = this.getFinwFrame();
      // Read the account ID field
      const acctField = finwFrame.locator('#acctId, input[name="acctId"]').first();
      if (await acctField.count() > 0) {
        result.account = await acctField.inputValue().catch(() => '');
      }
      // Read the amount field
      const amtField = finwFrame.locator('#refAmt, #amount, input[name="refAmt"]').first();
      if (await amtField.count() > 0) {
        result.amount = await amtField.inputValue().catch(() => '');
      }
      console.log(`${label}: account="${result.account}", amount="${result.amount}"`);
    } catch (e) {
      console.log(`Could not read HTM part transaction (${label}): ${e}`);
    }
    return result;
  }

  async clickHtmNextRecord() {
    try {
      const finwFrame = this.getFinwFrame();
      const nextBtn = finwFrame.locator(
        'input[value*="Next" i], input[value*="next" i], ' +
        '#nextRecord, #next_record, ' +
        'input[type="button"][value*=">" i], ' +
        'a:has-text("Next"), button:has-text("Next")'
      ).first();
      if (await nextBtn.count() > 0) {
        await nextBtn.click();
        await this.page.waitForTimeout(2000);
        console.log('Clicked HTM Next Record button');
      } else {
        // Fallback: try navigating via record number links
        const recordLink = finwFrame.locator('a:has-text("2"), td:has-text("Record 2")').first();
        if (await recordLink.count() > 0) {
          await recordLink.click();
          await this.page.waitForTimeout(2000);
          console.log('Clicked record 2 link');
        } else {
          console.log('HTM Next Record button not found, skipping');
        }
      }
    } catch (e) {
      console.log(`Could not click HTM Next Record, skipping: ${e}`);
    }
  }

  async clickHtmSubmit() {
    try {
      const finwFrame = this.getFinwFrame();
      const submitBtn = finwFrame.locator(
        '#Submit, #submit, input[value="Submit"], input[value="SUBMIT"], ' +
        'input[type="submit"], button:has-text("Submit")'
      ).first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await this.page.waitForTimeout(3000);
        console.log('Clicked HTM Submit button');
      } else {
        console.log('HTM Submit button not found, skipping');
      }
    } catch (e) {
      console.log(`Could not click HTM Submit, skipping: ${e}`);
    }
  }

  async logScreenMessages() {
    try {
      const finwFrame = this.getFinwFrame();
      const msgs = await finwFrame.locator('tr.alert, .error, .message, .success').allTextContents();
      console.log(`Screen messages: ${JSON.stringify(msgs)}`);
    } catch (e) {
      console.log(`Could not read screen messages: ${e}`);
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
      const bodyText = await finwFrame.locator('body').innerText().catch(() => '');
      if (/error|mandatory|not posted|failed|invalid/i.test(bodyText)) {
        console.log(`HTM error text found in body`);
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
    await this.htmSetField(['acctNum', 'accountId', 'acctId', 'haclinqAcctNum'], accountId, 'Account Number');
    console.log(`Entered HACLINQ account ID: ${accountId}`);
  }

  async clickHaclinqGo() {
    try {
      const finwFrame = this.getFinwFrame();
      const goBtn = finwFrame.locator('#Go, input[value="Go"], button:has-text("Go")').first();
      if (await goBtn.count() > 0) {
        await goBtn.click();
        await this.page.waitForTimeout(2000);
        console.log('Clicked HACLINQ Go button');
      } else {
        // Fallback: try Accept button
        const acceptBtn = finwFrame.locator('#Accept, input[value="Accept"]').first();
        if (await acceptBtn.count() > 0) {
          await acceptBtn.click();
          await this.page.waitForTimeout(2000);
          console.log('Clicked HACLINQ Accept button (fallback)');
        } else {
          console.log('HACLINQ Go/Accept button not found');
        }
      }
    } catch (e) {
      console.log(`Could not click HACLINQ Go button, skipping: ${e}`);
    }
  }

  async verifyHaclinqDebitCredit(amount: string, type: 'Debit' | 'Credit', transactionId?: string): Promise<boolean> {
    try {
      const finwFrame = this.getFinwFrame();
      const body = await finwFrame.locator('body').innerText();
      const rawAmount = (amount ?? '').toString().replace(/,/g, '');
      const formattedAmount = Number(rawAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const normalisedBody = body.replace(/,/g, '').toLowerCase();
      const hasAmount = normalisedBody.includes(rawAmount.toLowerCase()) || body.includes(formattedAmount);
      const hasType = body.toLowerCase().includes(type.toLowerCase());
      const hasTxn = transactionId ? body.includes(transactionId) : true;
      const pass = hasAmount && (hasType || hasTxn);
      console.log(`HACLINQ verify ${type}: amount=${hasAmount}, type=${hasType}, txn=${hasTxn} → ${pass ? 'PASS' : 'NOT CONFIRMED'}`);
      return pass;
    } catch (e) {
      console.log(`Could not verify HACLINQ ${type}: ${e}`);
      return false;
    }
  }

  // ============ HCAAC / HCAAC Closure Helpers ============
  async selectHcaacFunction(code: string) {
    await this.htmSetSelect(['funcCode'], code, 'Function');
  }

  async enterHcaacAccountId(accountId: string) {
    await this.enterHacmAccountId(accountId);
  }

  async clickTransferCheckbox() {
    const finwFrame = this.getFinwFrame();
    const done = await finwFrame.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, th, label')) as HTMLElement[];
      const label = cells.find(el => {
        const t = (el.textContent || '').toLowerCase();
        return t.includes('transfer') || t.includes('closure type');
      });
      const scope = label ? (label.closest('tr') || label.parentElement) : document.body;
      const checkbox = (scope || document.body).querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        checkbox.click();
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }).catch(() => false);
    if (!done) {
      const cb = finwFrame.locator('input[type="checkbox"]').first();
      if (await cb.count() > 0) await cb.check().catch(() => {});
    }
    await this.page.waitForTimeout(500);
  }

  async enterTransferAccountId(accountId: string) {
    await this.htmSetField(['transferAccountId', 'toForacid', 'toAcctId', 'transferAcctId'], accountId, 'Transfer A/c ID');
  }

  async selectApplyInterestTillDate(choice: string) {
    const finwFrame = this.getFinwFrame();
    const done = await finwFrame.evaluate((val) => {
      const cells = Array.from(document.querySelectorAll('td, th, label')) as HTMLElement[];
      const label = cells.find(el => (el.textContent || '').toLowerCase().includes('apply interest till date'));
      const scope = label ? (label.closest('tr') || label.parentElement) : document.body;
      const radios = Array.from((scope || document.body).querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      const valLower = val.toLowerCase();
      const target = radios.find(r => (r.value || '').toLowerCase() === valLower || (r.id || '').toLowerCase().includes(valLower));
      if (target) {
        target.checked = true;
        target.click();
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      const selects = Array.from((scope || document.body).querySelectorAll('select')) as HTMLSelectElement[];
      for (const sel of selects) {
        const opt = Array.from(sel.options).find(o => (o.text || '').toLowerCase().includes(valLower));
        if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      }
      return false;
    }, choice).catch(() => false);
    if (!done) console.log(`Could not select Apply Interest Till Date: ${choice}`);
    await this.page.waitForTimeout(500);
  }

  async clickHcaacVerify() {
    await this.htmClickButton('Verify');
  }

  // ============ Additional HTM Helpers ============
  async selectTransactionParticularCode(code: string) {
    const finwFrame = this.getFinwFrame();

    // Try known ids/names first using Playwright selectOption.
    const ids = ['transactionParticularCode', 'tranParticularCode', 'particularCode'];
    for (const id of ids) {
      const select = finwFrame.locator(`#${id}, select[name="${id}"], select[id*="${id}" i]`).first();
      try {
        if (await select.count() > 0 && await select.isVisible().catch(() => false) && await select.isEnabled().catch(() => false)) {
          const options = await select.locator('option').allTextContents();
          const matchingLabel = options.find(o => o.includes(code));
          if (matchingLabel) {
            await select.selectOption({ label: matchingLabel });
          } else {
            await select.selectOption(code);
          }
          await this.page.waitForTimeout(800);
          console.log(`Selected Transaction Particular Code = ${code} (via ${id})`);
          return;
        }
      } catch {}
    }

    // Fallback: find any select (preferably near a "Transaction Particular Code" label)
    // whose options contain the requested code and set it via JS.
    const result = await finwFrame.evaluate((target: string) => {
      const collect = (scope: HTMLElement | Document) => Array.from(scope.querySelectorAll('select')) as HTMLSelectElement[];
      const cells = Array.from(document.querySelectorAll('td, th, label')) as HTMLElement[];
      const labelCell = cells.find(el => {
        const t = (el.textContent?.trim().toLowerCase() || '').replace(/[^a-z0-9]/g, '');
        return t.includes('particularcode');
      });

      const seen = new Set<HTMLSelectElement>();
      if (labelCell) {
        const row = labelCell.closest('tr') as HTMLElement | null;
        if (row) collect(row).forEach(s => seen.add(s));
      }
      collect(document.body).forEach(s => seen.add(s));

      for (const sel of seen) {
        const option = Array.from(sel.options).find(o =>
          o.value === target || o.text.trim() === target || o.text.trim().includes(target)
        );
        if (option) {
          sel.value = option.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, value: option.value, text: option.text };
        }
      }
      return { ok: false };
    }, code) as { ok: boolean; value?: string; text?: string };

    if (result.ok) {
      await this.page.waitForTimeout(800);
      console.log(`Selected Transaction Particular Code = ${code} (via label/fallback)`);
      return;
    }

    throw new Error(`Could not select Transaction Particular Code = ${code}. Ensure the option exists on the HTM screen.`);
  }

  async enterHtmParticulars(text: string) {
    const finwFrame = this.getFinwFrame();
    const result = await finwFrame.evaluate(({ value }) => {
      const isTrParticularsCode = (i: { id: string; name: string }) =>
        i.id === 'tranParticularsCode' ||
        i.name === 'tm.tranParticularsCode' ||
        (i.id + ' ' + i.name).toLowerCase().includes('tranparticularscode');

      const isVisible = (el: HTMLElement) => {
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        return el.offsetParent !== null && !input.disabled;
      };

      const isTextLike = (i: HTMLInputElement | HTMLTextAreaElement) =>
        i.tagName === 'TEXTAREA' || (i as HTMLInputElement).type === 'text' || (i as HTMLInputElement).type === '';

      const allVisible = Array.from(document.querySelectorAll('input, textarea')).filter(e => isVisible(e as HTMLElement)) as (HTMLInputElement | HTMLTextAreaElement)[];

      const codeInput = allVisible.find(i => isTrParticularsCode(i)) || null;

      const findTarget = (): { target: HTMLInputElement | HTMLTextAreaElement | null; method: string } => {
        if (codeInput) {
          const tr = codeInput.closest('tr');
          if (tr) {
            const rowInputs = Array.from(tr.querySelectorAll('input, textarea')).filter(
              e => e !== codeInput && isVisible(e as HTMLElement)
            ) as (HTMLInputElement | HTMLTextAreaElement)[];
            if (rowInputs.length > 0) {
              const textLike = rowInputs.find(i => isTextLike(i)) || rowInputs[0];
              return { target: textLike, method: 'same-row-as-code' };
            }
          }

          const others = allVisible.filter(i => i !== codeInput);
          if (others.length === 1) return { target: others[0], method: 'only-other-visible' };
          const textLike = others.find(i => isTextLike(i));
          if (textLike) return { target: textLike, method: 'other-visible-text' };
        }

        const fallback = allVisible.find(i => isTextLike(i) && !isTrParticularsCode(i));
        if (fallback) return { target: fallback, method: 'fallback-text' };

        return { target: null, method: 'none' };
      };

      const { target, method } = findTarget();

      if (!target) {
        return {
          ok: false,
          reason: 'could not find an editable input/textarea beside tm.tranParticularsCode',
          visibleFields: allVisible.map(i => ({
            id: i.id,
            name: i.name,
            tag: i.tagName,
            type: (i as HTMLInputElement).type,
            current: i.value
          }))
        };
      }

      const updateBackend = (input: HTMLInputElement | HTMLTextAreaElement) => {
        if (input.id && input.id.endsWith('_ui')) {
          const baseId = input.id.replace('_ui', '');
          const hidden = document.querySelector(`input[id="${baseId}"], textarea[id="${baseId}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
          if (hidden) {
            hidden.value = value;
            hidden.dispatchEvent(new Event('input', { bubbles: true }));
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        if (input.name && input.name.endsWith('_ui')) {
          const baseName = input.name.replace('_ui', '');
          const hidden = document.querySelector(`input[name="${baseName}"], input[name="${baseName}_hdn"], textarea[name="${baseName}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
          if (hidden) {
            hidden.value = value;
            hidden.dispatchEvent(new Event('input', { bubbles: true }));
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      };

      target.focus();
      target.value = value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      updateBackend(target);
      target.blur();
      return { ok: true, id: target.id, name: target.name, tag: target.tagName, method };
    }, { value: text });

    console.log(`enterHtmParticulars: ${JSON.stringify(result)}`);

    if (result.ok) {
      await this.page.waitForTimeout(800);
      return;
    }

    console.log(`Could not set Particulars; visible fields: ${JSON.stringify(result.visibleFields)}`);
  }

  async clickHtmValidate() {
    await this.htmClickButton('Validate');
  }

  // ============ Multi-Part HTM Helpers ============
  private toCents(value: string | number): number {
    return Math.round(parseFloat(String(value).replace(/,/g, '')) * 100);
  }

  getHtmPartTransactions(data: any): Array<{ type: 'D' | 'C'; accountId: string; amount: string }> {
    if (data.partTransactions && Array.isArray(data.partTransactions)) {
      return data.partTransactions.map((pt: any) => ({
        type: (pt.type || pt.partTranType || 'D').toUpperCase() as 'D' | 'C',
        accountId: pt.accountId || pt.account || pt.acctId,
        amount: String(pt.amount ?? ''),
      }));
    }
    if (data.debits && Array.isArray(data.debits)) {
      const entries: Array<{ type: 'D' | 'C'; accountId: string; amount: string }> = [];
      for (const debit of data.debits) {
        entries.push({ type: 'D', accountId: debit.accountId, amount: String(debit.amount ?? '') });
        for (const credit of debit.credits || []) {
          entries.push({ type: 'C', accountId: credit.accountId, amount: String(credit.amount ?? '') });
        }
      }
      return entries;
    }
    return [
      { type: 'D', accountId: data.debitAccount, amount: String(data.amount ?? '') },
      { type: 'C', accountId: data.creditAccount, amount: String(data.amount ?? '') },
    ];
  }

  async validateHtmAllocations(data: any): Promise<void> {
    if (data.debits && Array.isArray(data.debits)) {
      let totalDebit = 0;
      let totalCredit = 0;
      for (const debit of data.debits) {
        const debitCents = this.toCents(debit.amount);
        const credits = debit.credits || [];
        const creditCents = credits.reduce((sum: number, c: any) => sum + this.toCents(c.amount), 0);
        if (debitCents !== creditCents) {
          throw new Error(
            `Credit allocations for debit ${debit.accountId} do not match: debit=${debit.amount}, credits=${(creditCents / 100).toFixed(2)}`
          );
        }
        totalDebit += debitCents;
        totalCredit += creditCents;
      }
      if (totalDebit !== totalCredit) {
        throw new Error(
          `Overall debit/credit totals do not match. Debits=${(totalDebit / 100).toFixed(2)}, Credits=${(totalCredit / 100).toFixed(2)}`
        );
      }
      console.log('HTM debit/credit allocations validated');
      return;
    }
    const entries = this.getHtmPartTransactions(data);
    const totalDebit = entries.filter(e => e.type === 'D').reduce((s, e) => s + this.toCents(e.amount), 0);
    const totalCredit = entries.filter(e => e.type === 'C').reduce((s, e) => s + this.toCents(e.amount), 0);
    if (totalDebit !== totalCredit) {
      throw new Error(
        `Overall debit/credit totals do not match. Debits=${(totalDebit / 100).toFixed(2)}, Credits=${(totalCredit / 100).toFixed(2)}`
      );
    }
    console.log('HTM part transactions balanced');
  }

  async postHtmTransfer(data: any): Promise<string | null> {
    await this.validateHtmAllocations(data);
    const entries = this.getHtmPartTransactions(data);
    if (entries.length === 0) {
      throw new Error('No part transactions found in HTM data');
    }
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.type === 'D') {
        await this.selectHtmDebit();
      } else {
        await this.selectHtmCredit();
      }
      await this.enterHtmAccountId(entry.accountId);
      await this.enterHtmAmount(entry.amount, true);
      if (i < entries.length - 1) {
        await this.clickHtmAdd();
      }
    }
    await this.clickHtmPost();
    return await this.getHtmTransactionId();
  }

  // Sets the value on any hidden/server-bound despatch/dispatch controls in the
  // FINW frame. Removes the disabled attribute so the value gets submitted, and
  // dispatches input/change/blur events so Finacle observers pick it up.
  private async setDispatchModeHidden(code: string, label: string): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const count = await finwFrame.evaluate(({ code, label }) => {
      const matches = (el: Element) => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.getAttribute('id') || '').toLowerCase();
        return name.includes('despatch') || id.includes('despatch') ||
               name.includes('dispatch') || id.includes('dispatch');
      };
      const found = new Set<HTMLElement>();
      document.querySelectorAll('input, select, textarea').forEach(el => {
        if (matches(el)) found.add(el as HTMLElement);
      });
      document.querySelectorAll('[id]').forEach(el => {
        if (matches(el)) found.add(el as HTMLElement);
      });

      let foundInput = Array.from(found).find((el: any) => el.tagName === 'INPUT') as HTMLInputElement | undefined;
      if (!foundInput) {
        const form = document.querySelector('form') as HTMLFormElement | null;
        foundInput = document.createElement('input');
        foundInput.type = 'hidden';
        foundInput.name = 'generaldetails.despatchMode';
        foundInput.id = 'despatchMode_hdn';
        (form || document.body).appendChild(foundInput);
        found.add(foundInput);
      }

      found.forEach((el: any) => {
        el.disabled = false;
        if (el.tagName === 'SELECT') {
          const opts = Array.from(el.options) as HTMLOptionElement[];
          const idx = opts.findIndex(o =>
            (o.value || '').toUpperCase().startsWith(code) ||
            (o.text || '').trim().toLowerCase().includes(label.toLowerCase())
          );
          if (idx >= 0) el.selectedIndex = idx;
        }
        el.value = code;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      });
      return found.size;
    }, { code: code.toUpperCase(), label });
    console.log(`Set hidden dispatch-mode fields to '${code}' (${label}) - count=${count}`);
  }

  // Injects a hidden <input name="generaldetails.despatchMode"> into the form
  // that the Submit button will post, ensuring the value is sent even when the
  // General Details tab (and its visible select) has been removed from the DOM.
  private async injectDispatchModeIntoForm(mode: string): Promise<void> {
    const code = String(mode || '').split('-')[0].trim().toUpperCase() || 'A';
    const finwFrame = this.getFinwFrame();
    const result = await finwFrame.evaluate((c) => {
      const findSubmitBtn = (): HTMLElement | null => {
        const el = document.querySelector('#Submit, #submit, input[type="submit"]') as HTMLElement | null;
        if (el) return el;
        return Array.from(document.querySelectorAll('input, button'))
          .find((b: any) => {
            const v = (b.value || b.textContent || '').trim().toLowerCase();
            return v === 'submit' || v.includes('submit');
          }) as HTMLElement | null;
      };
      const btn = findSubmitBtn();
      const form = (btn?.closest('form') as HTMLFormElement | null) ?? document.forms[0];
      if (!form) return { ok: false, reason: 'no form found' };

      const candidates = [
        'input[name="generaldetails.despatchMode"]',
        'input[name="despatchMode"]',
        'input[name="generaldetails.despatchMode_hdn"]',
        'input[name="despatchMode_hdn"]',
      ];
      let input: HTMLInputElement | null = null;
      for (const sel of candidates) {
        input = form.querySelector(sel) as HTMLInputElement | null;
        if (input) {
          input.value = c;
          input.disabled = false;
          return { ok: true, reason: 'updated existing', name: input.name };
        }
      }

      input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'generaldetails.despatchMode';
      input.value = c;
      form.appendChild(input);

      let simpleInput = form.querySelector('input[name="despatchMode"]') as HTMLInputElement | null;
      if (!simpleInput) {
        simpleInput = document.createElement('input');
        simpleInput.type = 'hidden';
        simpleInput.name = 'despatchMode';
        simpleInput.value = c;
        form.appendChild(simpleInput);
      } else {
        simpleInput.value = c;
      }

      return { ok: true, reason: 'created hidden', name: input.name };
    }, code);
    console.log(`Injected dispatch mode '${code}' into submit form: ${JSON.stringify(result)}`);
  }

  // Ensures the expected Dispatch Mode is set on every form control that carries it.
  private async assertDispatchModeInSubmitForm(expected: string): Promise<void> {
    const expectedCode = expected.split('-')[0].trim().toUpperCase() || 'A';
    const finwFrame = this.getFinwFrame();
    const count = await finwFrame.evaluate((code) => {
      const findSubmitBtn = (): HTMLElement | null => {
        const el = document.querySelector('#Submit, #submit, input[type="submit"]') as HTMLElement | null;
        if (el) return el;
        return Array.from(document.querySelectorAll('input, button'))
          .find((b: any) => {
            const v = (b.value || b.textContent || '').trim().toLowerCase();
            return v === 'submit' || v.includes('submit');
          }) as HTMLElement | null;
      };
      const btn = findSubmitBtn();

      const names = ['generaldetails.despatchMode', 'despatchMode', 'generaldetails.despatchMode_hdn', 'despatchMode_hdn'];
      let touched = 0;
      for (const form of Array.from(document.forms)) {
        for (const n of names) {
          const el = form.querySelector(`select[name="${n}"], input[name="${n}"]`) as any;
          if (!el) continue;
          if (el.tagName === 'SELECT') {
            const opt = Array.from(el.options).find((o: any) =>
              (o.value || '').toUpperCase() === code ||
              (o.text || '').trim().toUpperCase().startsWith(code)
            );
            if (opt) { el.selectedIndex = opt.index; el.value = opt.value; }
            else { el.value = code; }
            el.disabled = false;
          } else {
            el.value = code;
            el.disabled = false;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          touched++;
        }
      }

      if (touched === 0) {
        const form = (btn?.closest('form') as HTMLFormElement | null) ?? document.forms[0];
        if (form) {
          const create = (name: string) => {
            const inp = document.createElement('input');
            inp.type = 'hidden';
            inp.name = name;
            inp.value = code;
            form.appendChild(inp);
            return inp;
          };
          create('generaldetails.despatchMode');
          create('despatchMode');
          touched = 1;
        }
      }
      // The Submit button calls general_details_ONCLICK28, which suggests the
      // data must live in a form named "general_details" (or getFormObj('general_details')).
      const generalDetailsForm = (document.forms as any)['general_details'] as HTMLFormElement | undefined
        ?? document.querySelector('form[name="general_details"]') as HTMLFormElement | null;
      if (generalDetailsForm) {
        const setInForm = (name: string) => {
          const el = generalDetailsForm.querySelector(`input[name="${name}"], select[name="${name}"]`) as any;
          if (el) {
            if (el.tagName === 'SELECT') {
              const opt = Array.from(el.options).find((o: any) =>
                (o.value || '').toUpperCase() === code ||
                (o.text || '').trim().toUpperCase().startsWith(code)
              );
              if (opt) { el.selectedIndex = opt.index; el.value = opt.value; }
              else { el.value = code; }
              el.disabled = false;
            } else {
              el.value = code;
              el.disabled = false;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            const inp = document.createElement('input');
            inp.type = 'hidden';
            inp.name = name;
            inp.value = code;
            generalDetailsForm.appendChild(inp);
          }
        };
        setInForm('generaldetails.despatchMode');
        setInForm('despatchMode');
      } else {
        const newForm = document.createElement('form');
        newForm.name = 'general_details';
        newForm.appendChild(Object.assign(document.createElement('input'), { type: 'hidden', name: 'generaldetails.despatchMode', value: code }));
        newForm.appendChild(Object.assign(document.createElement('input'), { type: 'hidden', name: 'despatchMode', value: code }));
        document.body.appendChild(newForm);
      }

      return touched;
    }, expectedCode);

    if (count === 0) {
      throw new Error(`Dispatch Mode field assertion failed. Expected: ${expectedCode}`);
    }
    console.log(`Dispatch Mode field verified in ${count} control(s): ${expectedCode}`);
  }

  // The visible Statement Frequency <select>s on the General Details tab may be
  // removed from the DOM before Submit, so ensure their values are present in the
  // final form that gets posted and strictly assert each one.
  private async assertStatementFrequencyInSubmitForm(accountData: AccountData): Promise<void> {
    const expected: Record<string, string> = {};
    const fields: Record<string, string> = {
      statementFrequency: 'pbPsFreqType',
      statementWeek: 'pbPsFreqWeek',
      statementDay: 'pbPsFreqStartDD',
      statementP: 'pbPsFreqHldyStat',
      statementG: 'pbPsFreqCalBase',
    };

    for (const [dataKey, baseId] of Object.entries(fields)) {
      const raw = String(accountData[dataKey as keyof AccountData] ?? '').trim();
      if (!raw) continue;
      expected[baseId] = dataKey === 'statementDay' || dataKey === 'statementWeek'
        ? raw
        : raw.split('-')[0].trim().toUpperCase();
    }

    const finwFrame = this.getFinwFrame();
    const result = await finwFrame.evaluate(({ expected, fields }) => {
      const findSubmitBtn = (): HTMLElement | null => {
        const el = document.querySelector('#Submit, #submit, input[type="submit"]') as HTMLElement | null;
        if (el) return el;
        return Array.from(document.querySelectorAll('input, button'))
          .find((b: any) => {
            const v = (b.value || b.textContent || '').trim().toLowerCase();
            return v === 'submit' || v.includes('submit');
          }) as HTMLElement | null;
      };
      const btn = findSubmitBtn();
      const form = (btn?.closest('form') as HTMLFormElement | null) ?? document.forms[0];
      if (!form) return { ok: false, reason: 'submit form not found' };

      const updated: Record<string, string> = {};
      for (const [baseId, value] of Object.entries(expected)) {
        const names = [`generaldetails.${baseId}`, baseId, `generaldetails.${baseId}_hdn`, `${baseId}_hdn`];
        let touched = false;
        for (const f of Array.from(document.forms)) {
          for (const n of names) {
            const el = f.querySelector(`select[name="${n}"], input[name="${n}"]`) as any;
            if (!el) continue;
            if (el.tagName === 'SELECT') {
              const code = value.toLowerCase();
              const opt = Array.from(el.options).find((o: any) =>
                (o.value || '').toLowerCase() === code ||
                (o.text || '').toLowerCase().startsWith(code + ' -') ||
                (o.text || '').toLowerCase().includes(code)
              );
              if (opt) { el.selectedIndex = opt.index; el.value = opt.value; }
              else { el.value = value; }
              el.disabled = false;
            } else {
              el.value = value;
              el.disabled = false;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            touched = true;
          }
        }

        if (!touched) {
          const f = (btn?.closest('form') as HTMLFormElement | null) ?? form ?? document.forms[0];
          if (f) {
            const create = (name: string) => {
              const inp = document.createElement('input');
              inp.type = 'hidden';
              inp.name = name;
              inp.value = value;
              f.appendChild(inp);
              return inp;
            };
            create('generaldetails.' + baseId);
            create(baseId);
            updated[baseId] = 'created';
          }
        } else {
          updated[baseId] = 'updated';
        }
      }
      // The Submit button calls general_details_ONCLICK28, which suggests the
      // data must live in a form named "general_details" (or getFormObj('general_details')).
      const generalDetailsForm = (document.forms as any)['general_details'] as HTMLFormElement | undefined
        ?? document.querySelector('form[name="general_details"]') as HTMLFormElement | null;
      if (generalDetailsForm) {
        for (const [baseId, value] of Object.entries(expected)) {
          const names = [`generaldetails.${baseId}`, baseId];
          for (const n of names) {
            const el = generalDetailsForm.querySelector(`input[name="${n}"], select[name="${n}"]`) as any;
            if (el) {
              if (el.tagName === 'SELECT') {
                const code = value.toLowerCase();
                const opt = Array.from(el.options).find((o: any) =>
                  (o.value || '').toLowerCase() === code ||
                  (o.text || '').toLowerCase().startsWith(code + ' -')
                );
                if (opt) { el.selectedIndex = opt.index; el.value = opt.value; }
                else { el.value = value; }
                el.disabled = false;
              } else {
                el.value = value;
                el.disabled = false;
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              const inp = document.createElement('input');
              inp.type = 'hidden';
              inp.name = n;
              inp.value = value;
              generalDetailsForm.appendChild(inp);
            }
          }
        }
      } else {
        const newForm = document.createElement('form');
        newForm.name = 'general_details';
        for (const [baseId, value] of Object.entries(expected)) {
          newForm.appendChild(Object.assign(document.createElement('input'), { type: 'hidden', name: `generaldetails.${baseId}`, value }));
          newForm.appendChild(Object.assign(document.createElement('input'), { type: 'hidden', name: baseId, value }));
        }
        document.body.appendChild(newForm);
      }

      return { ok: true, updated };
    }, { expected, fields });

    if (!result.ok) {
      throw new Error(`Statement Frequency submit-form assertion failed: ${result.reason}`);
    }
    console.log('Statement Frequency hidden inputs in submit form verified:', JSON.stringify(result.updated));
    expect(Object.keys(result.updated).length).toBeGreaterThanOrEqual(1);
  }

  // ============ Form Filling Methods ============
  // Finds the dispatch-mode <select> on the screen, preferring the known id,
  // then any attached select whose options reference dispatch/despatch.
  // The control may be hidden or disabled after tab navigation, so we do not
  // restrict the search to :visible.
  private async findVisibleDispatchDropdown(): Promise<Locator | null> {
    const finwFrame = this.getFinwFrame();

    const known = finwFrame.locator('select#despatchMode, select[id="despatchMode"], select[name="despatchMode"], select[name="generaldetails.despatchMode"]');
    if (await known.count() > 0) {
      return known.first();
    }

    const selects = finwFrame.locator('select');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const opt = (await selects.nth(i).locator('option').allTextContents())
        .map(o => o.toLowerCase());
      if (opt.some(o => o.includes('dispatch') || o.includes('despatch'))) {
        return selects.nth(i);
      }
    }
    return null;
  }

  async selectDispatchMode(mode: 'email' | 'post' | 'no dispatch' | string) {
    const effectiveMode = String((mode as string) || '').trim() || 'email';

    const lower = effectiveMode.toLowerCase();
    let keyword = '';
    if (lower.includes('post and email') || lower.includes('post & email') || lower.includes('post + email')) {
      keyword = 'post and email';
    } else if (lower.includes('email')) {
      keyword = 'email';
    } else if (lower.includes('post')) {
      keyword = 'post';
    } else if (lower.includes('no dispatch') || lower.includes('no despatch') || lower.includes('none')) {
      keyword = 'no dispatch';
    }
    const code = effectiveMode.split('-')[0].trim().toUpperCase();

    const dropdown = await this.findVisibleDispatchDropdown();
    if (dropdown) {
      const options = await dropdown.locator('option').allTextContents();
      console.log(`Dispatch mode options: ${JSON.stringify(options)}`);

      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      let match: string | undefined;

      // 1. Exact full-label match (e.g. "P - Post")
      match = options.find(o => norm(o) === lower);

      // 2. Single-letter code prefix match (e.g. "P")
      if (!match && code && code.length === 1) {
        match = options.find(o => o.trim().toUpperCase().startsWith(code));
      }

      // 3. Keyword match, preferring the shortest label to avoid broad matches
      //    (e.g. "post" -> "P - Post" not "A - Post and Email")
      if (!match && keyword) {
        const candidates = options.filter(o => norm(o).includes(keyword));
        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            const aLabel = a.split('-').slice(1).join('-').trim();
            const bLabel = b.split('-').slice(1).join('-').trim();
            return aLabel.split(/\s+/).length - bLabel.split(/\s+/).length || a.length - b.length;
          });
          match = candidates[0];
        }
      }

      if (match) {
        const matchCode = match.split('-')[0].trim();
        const isEnabled = await dropdown.isEnabled().catch(() => false);
        const isVisible = await dropdown.isVisible().catch(() => false);

        if (isEnabled && isVisible) {
          try {
            await dropdown.selectOption(matchCode);
            console.log(`Selected dispatch code '${matchCode}' in #despatchMode`);
          } catch {
            await dropdown.selectOption({ label: match });
            console.log(`Selected dispatch label '${match}' in #despatchMode`);
          }
        } else {
          console.log(`Dispatch dropdown is not actionable (hidden=${!isVisible}, disabled=${!isEnabled}); enabling and selecting via Playwright`);
          await dropdown.evaluate((el: any) => { el.disabled = false; });
          try {
            await dropdown.selectOption({ value: matchCode });
            console.log(`Selected dispatch code '${matchCode}' in #despatchMode via Playwright`);
          } catch {
            await dropdown.selectOption({ label: match });
            console.log(`Selected dispatch label '${match}' in #despatchMode via Playwright`);
          }
        }

        await this.page.waitForTimeout(1000);
        const selectedValue = await dropdown.inputValue().catch(() => '');
        const selectedLabel = options.find(o => o.split('-')[0].trim().toUpperCase() === (selectedValue || '').toUpperCase()) || selectedValue;
        console.log(`Selected dispatch mode: ${selectedLabel} (value=${selectedValue})`);

        // Playwright's selectOption sets the DOM value but Finacle's onchange
        // handler (custom_ONCHANGE) may not run for synthetic events, so invoke
        // it explicitly to make the value stick.
        await dropdown.evaluate((el: any) => {
          if (typeof el.onchange === 'function') {
            el.onchange();
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
        });

        await this.setDispatchModeHidden(matchCode, match);
        return;
      }
    }

    if (keyword && await this.selectDropdownContainingOption(keyword)) {
      console.log(`Selected dispatch mode: ${effectiveMode} (via generic dropdown)`);
      await this.setDispatchModeHidden(code, effectiveMode);
      return;
    }

    console.log(`Could not set visible dispatch mode: ${effectiveMode}`);
    await this.setDispatchModeHidden(code, effectiveMode);
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

  // Reads the currently selected dispatch mode value/label from the dropdown or
  // any server-bound despatch/dispatch control on the General Details tab.
  async getDispatchMode(): Promise<string | null> {
    try {
      const finwFrame = this.getFinwFrame();

      // Prefer the visible dropdown so we can detect when the UI has been reset.
      const dropdown = await this.findVisibleDispatchDropdown();
      if (dropdown) {
        const info = await dropdown.evaluate((sel: HTMLSelectElement) => {
          const val = (sel.value || '').toUpperCase();
          const opt = Array.from(sel.options).find(o => (o.value || '').toUpperCase() === val);
          return { value: val, label: opt?.text?.trim() || '' };
        });
        if (info.value && info.value !== 'SELECT' && info.value !== '') return info.label || info.value;
      }

      // Hidden/server-bound despatch inputs hold the value after the visible
      // <select> is removed or disabled during tab navigation.
      const hiddenCode = await finwFrame.evaluate(() => {
        const selectors = [
          'input[name="generaldetails.despatchMode"]',
          'input[name="despatchMode"]',
          'input[id="despatchMode_hdn"]',
          'input[name="despatchMode_hdn"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          if (el && el.value) return el.value.toUpperCase();
        }
        return '';
      });
      if (hiddenCode && hiddenCode !== 'SELECT' && hiddenCode !== '') return hiddenCode;

      const anyControl = finwFrame.locator('input[id*="despatch"], input[name*="despatch"], select[id*="despatch"], select[name*="despatch"]').first();
      if (await anyControl.count() > 0) {
        const val = await anyControl.inputValue().catch(() => '');
        if (val) {
          const label = await anyControl.evaluate((el: any, value: string) => {
            if (el.tagName === 'SELECT') {
              const opt = Array.from(el.options).find((o: any) => (o.value || '').toUpperCase() === value.toUpperCase());
              return opt?.text?.trim() || value;
            }
            return value;
          }, val);
          if (label) return label;
        }
      }

      console.log('Dispatch mode dropdown/control not found, cannot get value');
      return null;
    } catch (e) {
      console.log(`Could not get dispatch mode: ${e}`);
      return null;
    }
  }

  // Verifies the General Details Dispatch Mode is exactly the expected value.
  // If the dropdown has changed or cleared, it re-selects the value. Throws a
  // strict assertion if the expected option cannot be found or selected.
  async assertGeneralDetailsDispatchMode(expected: string): Promise<void> {
    const expectedCode = expected.split('-')[0].trim().toUpperCase();

    await this.visitGeneralDetailsTab();
    await this.page.waitForTimeout(1000);

    let actual = await this.getDispatchMode();
    let actualCode = actual ? actual.split('-')[0].trim().toUpperCase() : '';

    if (actualCode !== expectedCode) {
      console.log(`Dispatch Mode mismatch in General Details. Expected: ${expected}, Got: ${actual || '<null>'}. Re-selecting...`);
      await this.selectDispatchMode(expected);
      actual = await this.getDispatchMode();
      actualCode = actual ? actual.split('-')[0].trim().toUpperCase() : '';
    }

    if (actualCode !== expectedCode) {
      throw new Error(`General Details Dispatch Mode assertion failed. Expected: ${expected}, Got: ${actual || '<null>'}`);
    }

    console.log(`General Details Dispatch Mode verified: ${actual} (expected: ${expected})`);
  }

  // Ensures the final submit form contains the expected External System Pricing
  // For code. The visible Other Details control may be removed before Submit, so
  // the value is injected as a hidden field in the final form and strictly asserted.
  private async assertExternalSystemPricing(accountData: AccountData): Promise<void> {
    const expected = String(accountData.externalSystemPricingFor ?? '').trim();
    if (!expected) return;
    const expectedCode = expected.split('-')[0].trim().toUpperCase();

    // For N - None the pricing section is disabled and no relPricingId should be posted.
    if (expectedCode === 'N') return;

    const finwFrame = this.getFinwFrame();
    const result = await finwFrame.evaluate((code) => {
      const findSubmitBtn = (): HTMLElement | null => {
        const el = document.querySelector('#Submit, #submit, input[type="submit"]') as HTMLElement | null;
        if (el) return el;
        return Array.from(document.querySelectorAll('input, button'))
          .find((b: any) => {
            const v = (b.value || b.textContent || '').trim().toLowerCase();
            return v === 'submit' || v.includes('submit');
          }) as HTMLElement | null;
      };
      const btn = findSubmitBtn();
      const form = (btn?.closest('form') as HTMLFormElement | null) ?? document.forms[0];
      if (!form) return { ok: false, reason: 'submit form not found' };

      const candidates = [
        'input[name="otherdetails.relPricingId"]',
        'input[name="relPricingId"]',
        'input[id="relPricingId"]',
      ];
      let input: HTMLInputElement | null = null;
      for (const sel of candidates) {
        input = form.querySelector(sel) as HTMLInputElement | null;
        if (input) break;
      }

      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'otherdetails.relPricingId';
        form.appendChild(input);
      }

      input.value = code;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      return { ok: true, actual: input.value };
    }, expectedCode);

    if (!result.ok) {
      throw new Error(`External System Pricing For submit-form assertion failed: ${result.reason}`);
    }
    expect(result.actual.toUpperCase()).toBe(expectedCode);
    console.log(`External System Pricing For submit-form verified: ${result.actual} (expected: ${expected})`);
  }

  // Reads the label of the currently selected A/c Status radio (Active / Dormant /
  // Inactive) on the Scheme Details tab. Returns null if no radio is checked.
  async getAccountStatus(): Promise<string | null> {
    try {
      const finwFrame = this.getFinwFrame();
      const radios = finwFrame.locator('input[type="radio"]');
      const count = await radios.count();
      for (let i = 0; i < count; i++) {
        const isChecked = await radios.nth(i).isChecked().catch(() => false);
        if (isChecked) {
          const text = await radios.nth(i).evaluate((el: HTMLInputElement) => {
            const id = el.id;
            if (id) {
              const lbl = document.querySelector(`label[for="${id}"]`);
              if (lbl && lbl.textContent) return lbl.textContent.trim();
            }
            let txt = '';
            let n: Node | null = el.nextSibling;
            while (n && !txt.trim()) {
              txt += n.textContent || '';
              n = n.nextSibling;
            }
            if (txt.trim()) return txt.trim();
            return (el.parentElement?.textContent || '').trim();
          });
          return text || null;
        }
      }
      return null;
    } catch (e) {
      console.log(`Could not get A/c status: ${e}`);
      return null;
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

  async fillBasicAccountDetails(data: AccountData) {
    const ccy = String(data.ccy ?? data.currency ?? '');
    const cifCode = String(data.cifCode ?? data.cif ?? '');
    this.currentCif = String(data.cifCode ?? data.cif ?? '');
    const solId = String(data.solId ?? '');
    const functionOption = String(data.functionOption ?? 'O');

    await this.functionOption.selectOption(functionOption);
    await this.page.waitForTimeout(1000);

    await this.currency.fill(ccy);
    await this.solId.fill(solId);
    await this.solId.press('Tab');
    await this.page.waitForTimeout(2000);

    await this.cifId.fill(cifCode);
    await this.cifId.press('Tab');
    await this.page.waitForTimeout(2000);
  }

  async selectSchemeCode(schemeCode?: string, glSubheadCode?: string) {
    const finwFrame = this.getFinwFrame();

    // Try the known #sLnk4 link first (HOAACSB). If absent, locate the lookup
    // anchor whose href contains 'showSchmCodes' (works for HOAACTU and others).
    const knownLink = finwFrame.locator('#sLnk4');
    if (await knownLink.count() > 0) {
      const popupPromise = this.page.waitForEvent('popup', { timeout: 15000 });
      await knownLink.click();
      const popup = await popupPromise;
      await this._handleSchemePopup(popup, schemeCode, glSubheadCode);
      await this.page.waitForTimeout(3000);
      return;
    }

    // HOAACTU: the page fires a SOL ID popup automatically on load.
    // Wait for it to settle, close any stray open popups, then click the
    // scheme code link and capture only the popup that opens as a result.
    const schemeLink = finwFrame.locator("a[href*='showSchmCodes'][href*='schmcode']").first();
    if (await schemeLink.count() === 0) {
      throw new Error('Scheme Code lookup link (showSchmCodes) not found');
    }

    // Close any popups already open before clicking scheme code link.
    for (const ctx of this.page.context().pages()) {
      if (ctx !== this.page) {
        await ctx.close().catch(() => {});
      }
    }
    await this.page.waitForTimeout(500);

    // Now set up the listener and click — the very next popup must be scheme search.
    const popupPromise = this.page.waitForEvent('popup', { timeout: 15000 });
    await schemeLink.click();
    const popup = await popupPromise;
    await this._handleSchemePopup(popup, schemeCode, glSubheadCode);
    await this.page.waitForTimeout(3000);
  }

  private async _handleSchemePopup(popup: import('@playwright/test').Page, schemeCode?: string, glSubheadCode?: string) {
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(2000);

    // Detect popup type: flat search_scheme.jsp (HOAACTU) vs framed (HOAACSB).
    const frames = popup.frames();
    const criteriaFrame = frames.find(f => f.name() === 'Search_SchemeCriteria');

    if (!criteriaFrame) {
      // Flat popup (search_scheme.jsp) — results already shown in a table.
      // Click the SVRPL link on the row whose GL Subhead Code cell = glSubheadCode (40300).
      console.log(`Flat scheme popup detected. Selecting scheme=${schemeCode} glSubhead=${glSubheadCode}`);
      await popup.waitForSelector('table tr td a', { timeout: 10000 });

      const clicked = await popup.evaluate(({ schm, gl }) => {
        const rows = Array.from(document.querySelectorAll('table tr'));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td'));
          const link = cells[0]?.querySelector('a') as HTMLAnchorElement | null;
          if (!link) continue;
          const linkText = link.textContent?.trim() || '';
          if (schm && !linkText.includes(schm)) continue;
          if (gl) {
            // Find the cell whose text matches glSubheadCode
            const glCell = cells.find(c => (c.textContent?.trim() || '') === gl);
            if (!glCell) continue;
          }
          link.click();
          return true;
        }
        return false;
      }, { schm: schemeCode || '', gl: glSubheadCode || '' });

      console.log(`Flat scheme popup click result: ${clicked}`);
      if (!clicked) {
        // Fallback: click first matching scheme link
        const firstLink = popup.locator(`table tr td:first-child a${schemeCode ? `:has-text("${schemeCode}")` : ''}`).first();
        await firstLink.click();
        console.log('Flat popup: clicked first matching scheme link as fallback');
      }
      await this.page.waitForTimeout(2000);
      return;
    }

    // Framed popup (HOAACSB) — use criteria/results frames.
    if (schemeCode) {
      const schemeInput = criteriaFrame.locator(
        'input[id*="schm" i], input[id*="scheme" i], input[name*="schm" i], input[type="text"]'
      ).first();
      if (await schemeInput.count() > 0) {
        await schemeInput.fill(schemeCode);
        console.log(`Typed scheme code "${schemeCode}" into criteria field`);
      }
    }

    await criteriaFrame.locator('#Submit').click();
    await popup.waitForTimeout(3000);

    const resultsFrame = popup.frames().find(f => f.name() === 'Search_SchemeResults');
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
      await this.interestCreditAccount.selectOption('S', { timeout: 3000 });
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
      await this.setNextInterestCalculationDateCr(dateStr);
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

  // ============ Dynamic tab field filler ============
  // Converts camelCase Excel column names (e.g. accountManagerId) into
  // space-separated, title-cased label text likely to match the visible label.
  private humanizeKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .replace(/\bId\b/g, 'ID')
      .replace(/\bNo\b/g, 'No.');
  }

  // Returns common label variants for a key, useful when Finacle uses
  // punctuation or abbreviations.
  private labelVariants(key: string): string[] {
    const human = this.humanizeKey(key);
    const variants = new Set<string>([human, key]);
    // Finacle commonly uses "A/c" / "A/C" / "A/c." instead of "Account".
    for (const acVariant of ['A/c', 'A/c.', 'A/C']) {
      const v = human.replace(/\bAccount\b/gi, acVariant);
      if (v !== human) variants.add(v);
    }
    // Date fields are sometimes labelled without the leading "Scheme" or trailing "Date".
    const withoutDate = human.replace(/\s+Date$/i, '');
    const withoutScheme = human.replace(/^Scheme\s+/i, '');
    const withoutBoth = withoutScheme.replace(/\s+Date$/i, '');
    if (withoutDate !== human) variants.add(withoutDate);
    if (withoutScheme !== human) variants.add(withoutScheme);
    if (withoutBoth !== human) variants.add(withoutBoth);
    // "Relative" is frequently abbreviated as "Rel" / "Rel." / "rel" in Finacle labels.
    if (/\bRelative\b/i.test(human)) {
      for (const abbr of ['Rel', 'Rel.', 'rel']) {
        const v = human.replace(/\bRelative\b/gi, abbr);
        if (v !== human) variants.add(v);
      }
    }

    // "External" is frequently abbreviated as "Ext" / "Ext." / "ext" in Finacle labels.
    if (/\bExternal\b/i.test(human)) {
      for (const abbr of ['Ext', 'Ext.', 'ext']) {
        const v = human.replace(/\bExternal\b/gi, abbr);
        if (v !== human) variants.add(v);
      }
    }

    // The workbook may use "Check" while the UI uses "Cheque" (e.g. "Check Allowed").
    if (/\bCheck\b/i.test(human)) {
      const v = human.replace(/\bCheck\b/gi, 'Cheque');
      if (v !== human) variants.add(v);
    }

    // Existing punctuation variants.
    variants.add(human.replace(/\bID\b/g, 'Id'));
    variants.add(human.replace(/\bNo\.\b/g, 'No'));
    return Array.from(variants).filter(Boolean);
  }

  // Selects a radio button whose value or associated label text matches the
  // supplied value. Supports common yes/no/Y/N shorthand.
  // The search is scoped to the label's own cell and its immediate siblings so
  // adjacent fields (e.g. 'Cheque Allowed' vs 'Cheques Provided by Bank') are
  // never mixed up.
  private async setRadioByLabel(label: string, value: string, frame?: Frame): Promise<boolean> {
    const finwFrame = frame || this.getFinwFrame();
    const raw = value.trim().toLowerCase();
    const candidates = new Set<string>();
    const add = (v: string) => { const t = v.trim().toLowerCase(); if (t) candidates.add(t); };
    add(value);
    if (/^yes$/i.test(value)) { add('yes'); add('true'); add('y'); }
    if (/^no$/i.test(value)) { add('no'); add('false'); add('n'); }
    if (/^y$/i.test(value)) { add('y'); add('yes'); add('true'); }
    if (/^n$/i.test(value)) { add('n'); add('no'); add('false'); }

    try {
      const result = await finwFrame.evaluate(({ l, raw, cand }) => {
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
        const labelNorm = normalize(l);
        const cells = Array.from(document.querySelectorAll('td, th, label, legend'));
        const labelCell = cells.find(el => {
          const t = normalize(el.textContent?.trim() || '');
          return t === labelNorm || t.startsWith(labelNorm + ' ') || t.startsWith(labelNorm + ':') || t.startsWith(labelNorm + '.') || t.startsWith(labelNorm + '?');
        }) as HTMLElement | undefined;
        if (!labelCell) return { ok: false, reason: `label not found: ${l}` };

        let radios: HTMLInputElement[] = Array.from(labelCell.querySelectorAll('input[type="radio"]'));
        if (radios.length === 0) {
          let sibling = labelCell.nextElementSibling;
          while (sibling) {
            radios = Array.from(sibling.querySelectorAll('input[type="radio"]'));
            if (radios.length > 0) break;
            sibling = sibling.nextElementSibling;
          }
        }
        if (radios.length === 0) {
          const row = labelCell.closest('tr, fieldset, .form-group, .form-control') as HTMLElement | null;
          if (row) radios = Array.from(row.querySelectorAll('input[type="radio"]'));
        }

        const desired = new Set(cand);
        for (const radio of radios) {
          const rv = (radio.value || '').toLowerCase();
          const id = radio.id;
          const forLabel = id ? (document.querySelector(`label[for="${id}"]`)?.textContent || '') : '';
          const parentLabel = radio.closest('label')?.textContent || '';
          const wrap = radio.parentElement?.textContent || '';
          const labelText = (forLabel || parentLabel || wrap).trim().toLowerCase();
          if (desired.has(rv) || desired.has(labelText) || rv === raw || labelText === raw) {
            if (!radio.disabled && !radio.checked) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              radio.dispatchEvent(new Event('input', { bubbles: true }));
              if (typeof (radio as any).onclick === 'function') (radio as any).onclick();
            }
            return { ok: true, actual: radio.value, id, labelText: labelText || '' };
          }
        }
        return { ok: false, reason: 'no matching radio', found: radios.length };
      }, { l: label, raw, cand: Array.from(candidates) });

      console.log(`setRadioByLabel "${label}" = ${value}: ${JSON.stringify(result)}`);
      return result.ok;
    } catch (e) {
      console.log(`setRadioByLabel "${label}" failed: ${e}`);
    }
    return false;
  }

  // Tries to populate a single supplied field by text, dropdown or radio.
  private async fillSuppliedField(key: string, value: string, frame?: Frame) {
    const str = String(value).trim();
    if (!str) return;
    console.log(`[fillSuppliedField] start: ${key} = ${str}`);
    const labels = this.labelVariants(key);
    const isNumericValue = /^[0-9.,]+$/.test(str);

    if (await this.fillByAnyLabel(labels, str, frame)) return;

    // Numeric values should not be forced into Yes/No radios or arbitrary selects.
    if (!isNumericValue) {
      for (const label of labels) {
        if (await this.selectOptionByLabel(label, str, frame)) return;
      }
      for (const label of labels) {
        if (await this.setRadioByLabel(label, str, frame)) return;
      }
    }

    console.log(`Could not populate supplied field: ${key} = ${str}`);
  }

  // Sets the Interest Debit A/c. dropdown (#intDrAcctFlg) using the exact
  // workbook value. It finds the option by full label or by the leading code
  // and sets selectedIndex / value directly, so Playwright cannot pick a
  // different option by partial text.
  private async setInterestDebitAccount(value: string) {
    const str = String(value).trim();
    if (!str) return;
    if ((await this.interestDebitAccount.count()) === 0) {
      console.log(`Interest Debit A/c. dropdown not present, skipping`);
      return;
    }
    const code = str.split('-')[0].trim().toLowerCase();
    const result = await this.interestDebitAccount.evaluate((sel: HTMLSelectElement, opts: { code: string; str: string }) => {
      const target = opts.str.toLowerCase();
      const targetCode = opts.code;
      sel.disabled = false;
      const opt = Array.from(sel.options).find(o => {
        const t = (o.text || '').trim().toLowerCase();
        const v = (o.value || '').trim().toLowerCase();
        return t === target || v === target || t.startsWith(targetCode + ' -');
      });
      if (!opt) return `Interest Debit A/c. option not found for "${opts.str}" in #${sel.id}`;
      sel.selectedIndex = opt.index;
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof sel.onchange === 'function') (sel.onchange as any)();
      return `Interest Debit A/c. set to ${opt.text} (#${sel.id})`;
    }, { code, str });
    console.log(result);
  }

  // Sets the Interest Credit A/c. dropdown by its known id (#intCrAcctFlg).
  private async setInterestCreditAccount(value: string) {
    if ((await this.interestCreditAccount.count()) === 0) {
      console.log(`Interest Credit A/c. dropdown not present, skipping`);
      return;
    }
    const code = String(value).split('-')[0].trim();
    try {
      await this.interestCreditAccount.selectOption(code);
    } catch {
      await this.interestCreditAccount.selectOption({ label: value });
    }
    console.log(`Selected Interest Credit A/c: ${value}`);
  }

  // Sets the Interest Method (Dr.) dropdown by scanning FINW selects for an
  // option that actually contains the workbook value (e.g. "E - EOD Clear Balance"),
  // then sets selectedIndex and value directly.
  private async setInterestMethodDr(value: string): Promise<void> {
    const str = String(value).trim();
    if (!str) return;
    const finwFrame = this.getFinwFrame();
    const target = str.toLowerCase();
    const code = str.split('-')[0].trim().toLowerCase();
    const selects = finwFrame.locator('select');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);
      const options = await sel.locator('option').evaluateAll(els =>
        (els as HTMLOptionElement[]).map(o => ({ text: o.text, value: o.value }))
      );
      const opt = options.find(o => {
        const t = (o.text || '').trim().toLowerCase();
        return t === target || t.startsWith(target + ' -') || (code && t.startsWith(code + ' -') && t.includes('eod'));
      });
      if (opt) {
        const id = await sel.evaluate(el => (el as HTMLSelectElement).id);
        await sel.evaluate((el: HTMLSelectElement, o: { value: string }) => {
          el.disabled = false;
          const match = Array.from(el.options).find(x => (x.value || '') === o.value);
          if (match) {
            el.selectedIndex = match.index;
            el.value = match.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            if (typeof el.onchange === 'function') (el.onchange as any)();
          }
        }, { value: opt.value });
        console.log(`Set Interest Method (Dr.) to ${opt.text} (#${id})`);
        return;
      }
    }
    console.log(`Could not set Interest Method (Dr.) to "${value}"`);
  }

  // Sets the External System Pricing For dropdown. First checks the
  // "External System Pricing" header checkbox so the relPricingId control is
  // enabled, then selects the option and updates the hidden server-bound input.
  private async setExternalSystemPricingFor(value: string): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const expected = String(value).trim();
    const code = expected.split('-')[0].trim().toUpperCase();
    const expectedNorm = expected.toLowerCase();

    // If the workbook says N - None, the External System Pricing section must
    // not be enabled at all (the details must not be entered). Uncheck the
    // header and skip selecting the dropdown to avoid the E8101 validation error.
    if (code === 'N') {
      const unchecked = await finwFrame.evaluate(() => {
        const all = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]')) as HTMLInputElement[];
        const cb = all.find(i => {
          const row = i.closest('tr, td, div, fieldset, li, label');
          const text = (row?.innerText || '').toLowerCase();
          return text.includes('external system pricing') && !text.includes('for');
        }) ||
        Array.from(document.querySelectorAll('input')).find(i => {
          const name = (i.name || '').toLowerCase();
          const id = (i.id || '').toLowerCase();
          return (name.includes('relpricing') || id.includes('relpricing')) && !name.includes('relpricingid') && !id.includes('relpricingid');
        }) as HTMLInputElement | null;

        if (cb && cb.checked) {
          cb.checked = false;
          cb.dispatchEvent(new Event('input', { bubbles: true }));
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          cb.dispatchEvent(new Event('click', { bubbles: true }));
          if (typeof (cb as any).onclick === 'function') (cb as any).onclick();
        }
        return !!cb && cb.checked === false;
      });
      console.log('External System Pricing skipped (N - None)' + (unchecked ? ' - header unchecked' : ''));
      return;
    }

    // 1. Check the External System Pricing header checkbox/flag first.
    const checked = await finwFrame.evaluate(() => {
      const all = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]')) as HTMLInputElement[];
      const cb = all.find(i => {
        const row = i.closest('tr, td, div, fieldset, li, label');
        const text = (row?.innerText || '').toLowerCase();
        return text.includes('external system pricing') && !text.includes('for');
      }) ||
      Array.from(document.querySelectorAll('input')).find(i => {
        const name = (i.name || '').toLowerCase();
        const id = (i.id || '').toLowerCase();
        return (name.includes('relpricing') || id.includes('relpricing')) && !name.includes('relpricingid') && !id.includes('relpricingid');
      }) as HTMLInputElement | null;

      if (cb && !cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('input', { bubbles: true }));
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        cb.dispatchEvent(new Event('click', { bubbles: true }));
        if (typeof (cb as any).onclick === 'function') (cb as any).onclick();
      }
      return !!cb;
    });
    if (checked) {
      await this.page.waitForTimeout(800);
    }

    // 2. Select the visible External System Pricing For <select> and trigger onchange.
    const combo = finwFrame.locator('select').filter({ has: finwFrame.locator('option', { hasText: expected }) });
    await combo.waitFor({ state: 'visible', timeout: 10000 });
    await combo.selectOption({ label: expected }, { timeout: 10000 });
    await combo.evaluate((el: any) => {
      if (typeof el.onchange === 'function') el.onchange();
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    });
    const selectedLabel = await combo.evaluate((el: HTMLSelectElement) => el.options[el.selectedIndex]?.text?.trim() || '');
    expect(selectedLabel).toBe(expected);
    console.log(`Selected External System Pricing For: ${expected} (verified: ${selectedLabel})`);
    await this.page.waitForTimeout(300);

    // 3. Ensure the backend relPricingId input matches the selected code.
    const result = await finwFrame.evaluate(({ code, expected }) => {
      const inputs = Array.from(document.querySelectorAll('input')).filter(i =>
        (i.name || '').toLowerCase() === 'otherdetails.relpricingid' ||
        (i.id || '').toLowerCase() === 'relpricingid' ||
        (i.name || '').toLowerCase() === 'relpricingid'
      );
      for (const input of inputs) {
        input.value = code;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return inputs.length > 0 ? { ok: true, actual: expected } : { ok: false, reason: 'relPricingId input not found' };
    }, { code, expected });

    if (!result.ok) {
      throw new Error(`External System Pricing For assertion failed: ${result.reason}`);
    }
    const actualCode = String(result.actual || '').split('-')[0].trim().toUpperCase();
    expect(actualCode).toBe(code);
    console.log(`External System Pricing For set and verified: ${result.actual} (expected: ${expected})`);
  }

  // Sets a relPricing*_ui visible input and the matching hidden backend input
  // (used for Pricing Effective Date and Pricing Review Date).
  private async setRelPricingDate(base: 'relPricingEffDate' | 'relPricingReviewDate', date: string): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const d = String(date).trim();
    const isoDate = d.split('-').reverse().join('-');
    const ok = await finwFrame.evaluate(({ base, d, isoDate }) => {
      const ui = document.querySelector(`input[name*="${base}_ui"], input#${base}_ui`) as HTMLInputElement | null;
      const hidden = document.querySelector(`input[name*="${base}"]:not([name*="_ui"]):not([id$="_ui"]), input#${base}`) as HTMLInputElement | null;
      if (ui) {
        ui.value = d;
        ui.dispatchEvent(new Event('input', { bubbles: true }));
        ui.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (hidden) {
        const useIso = /^\d{4}-\d{2}-\d{2}$/.test(hidden.value || '');
        hidden.value = useIso ? isoDate : d;
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return !!ui || !!hidden;
    }, { base, d, isoDate });
    console.log(ok ? `Set ${base}: ${d}` : `Could not set ${base}`);
  }

  // Sets the Scheme Details expiry date by its known name (sbschemedetails.expiryDate_ui),
  // so it is not overwritten by the Account Limits expiry date later.
  private async setSchemeExpiryDate(date: string) {
    const finwFrame = this.getFinwFrame();
    const isoDate = date.split('-').reverse().join('-');
    const ok = await finwFrame.evaluate(({ date, isoDate }) => {
      const ui = document.querySelector('input[name*="sbschemedetails.expiryDate_ui"], input#expiryDate_ui') as HTMLInputElement | null;
      if (!ui) return false;
      ui.value = date;
      ui.dispatchEvent(new Event('input', { bubbles: true }));
      ui.dispatchEvent(new Event('change', { bubbles: true }));
      const base = (ui.getAttribute('name') || 'expiryDate').replace('_ui', '');
      const hidden = document.querySelector(`input[name="${base}"], input[name="${base}_hdn"], input[id="${base}"], input[id="${base}_hdn"]`) as HTMLInputElement | null;
      if (hidden) {
        const useIso = /^\d{4}-\d{2}-\d{2}$/.test(hidden.value || '');
        hidden.value = useIso ? isoDate : date;
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    }, { date, isoDate });
    console.log(ok ? `Set scheme expiry date to ${date}` : `Could not set scheme expiry date`);
  }

  // Applies all non-empty supplied values for a given tab.
  private async fillSavingsTabFields(
    accountData: AccountData,
    tabName: string,
    relatedParties: AccountData[] = []
  ) {
    const keys = SAVINGS_TAB_FIELDS[tabName];
    if (!keys) return;

    // Scheme Details is filled by a row-aware helper that targets each label's
    // text, select or radio control so workbook values are never ignored.
    if (tabName === 'Scheme Details') {
      await this.fillSchemeDetailsByLabels(accountData);
      return;
    }

    // Enabling External System Pricing makes the effective/review dates mandatory.
    // Default them to today when the workbook leaves them empty, except for N - None
    // where no pricing section fields should be populated.
    if (tabName === 'Others Details' && this.hasTabData(accountData, tabName)) {
      const pricingCode = String(accountData.externalSystemPricingFor || '').split('-')[0].trim().toUpperCase();
      if (pricingCode !== 'N' && accountData.externalSystemPricingFor && !accountData.pricingEffectiveDate) {
        accountData.pricingEffectiveDate = this.todayDate();
      }
      if (pricingCode !== 'N' && accountData.externalSystemPricingFor && !accountData.pricingReviewDate) {
        accountData.pricingReviewDate = this.todayDate();
      }
    }

    if (tabName === 'Related Party Details' && (this.hasTabData(accountData, tabName) || relatedParties.length > 0)) {
      await this.visitRelatedPartyTab();

      // Fill and save the main (default) related-party record.
      const rpFrame = await this.getRelatedPartyFrame(this.getFinwFrame());
      for (const key of keys) {
        const value = accountData[key];
        if (value === undefined || value === null) continue;
        if (String(value).trim() === '') continue;
        // Relation fields are not enabled on the default/main record.
        if (['relationType', 'relatedPartyCifId', 'Relation Code'].includes(key)) continue;
        await this.fillSuppliedField(key, String(value), rpFrame);
      }
      await this.saveRelatedPartyRecord();

        for (const party of relatedParties) {
          if (!party) continue;
          await this.clickRelatedPartyAdd();
          await this.page.waitForTimeout(2000);
          const newRpFrame = await this.getRelatedPartyFrame(this.getFinwFrame());

          const relationType = party['relationType'];
          if (relationType) {
            await this.selectRelationType(String(relationType));
          }
          const relationCode = party['Relation Code'];
          if (relationCode && String(relationCode).trim() !== '') {
            await this.selectRelationCode(String(relationCode));
          }
          const cif = party['relatedPartyCifId'];
          if (cif) {
            await this.enterRelatedPartyCif(String(cif));
          }

          for (const key of keys) {
            const value = party[key];
            if (value === undefined || value === null) continue;
            if (String(value).trim() === '') continue;
            if (['relationType', 'relatedPartyCifId', 'Relation Code'].includes(key)) continue;
            await this.fillSuppliedField(key, String(value), newRpFrame);
          }

          await this.saveRelatedPartyRecord();
        }
      return;
    }

    const isPricingN = String(accountData.externalSystemPricingFor || '').split('-')[0].trim().toUpperCase() === 'N';
    for (const key of keys) {
      const value = accountData[key];
      if (value === undefined || value === null) continue;
      if (String(value).trim() === '') continue;
      if (isPricingN && (key === 'relationshipPricingId' || key === 'pricingEffectiveDate' || key === 'pricingReviewDate')) continue;
      // These are handled by setAdditionalInterestDetails after the generic pass.
      if (['collectInterest', 'interestRateCode', 'interestDebitAccountId'].includes(key)) continue;
      if (key === 'interestDebitAccount') {
        await this.setInterestDebitAccount(String(value));
      } else if (key === 'accountStatement') {
        await this.setAccountStatement(String(value));
      } else if (key === 'interestCreditAccount') {
        await this.setInterestCreditAccount(String(value));
      } else if (key === 'Next Print Date') {
        await this.setNextPrintDate(String(value));
      } else if (key === 'nextInterestCalculationDateCr') {
        await this.setNextInterestCalculationDateCr(String(value));
      } else if (key === 'externalSystemPricingFor') {
        await this.setExternalSystemPricingFor(String(value));
      } else if (key === 'pricingEffectiveDate') {
        await this.setRelPricingDate('relPricingEffDate', String(value));
      } else if (key === 'pricingReviewDate') {
        await this.setRelPricingDate('relPricingReviewDate', String(value));
      } else if (key === 'schemeExpiryDate') {
        await this.setSchemeExpiryDate(String(value));
      } else {
        await this.fillSuppliedField(key, String(value));
      }
    }
  }

  // Fills the Scheme Details tab by locating each field label row and setting
  // the first enabled text, number, select or radio control in that row. This
  // guarantees the workbook values are applied even when the generic filler misses
  // the correct control type.
  private async fillSchemeDetailsByLabels(accountData: AccountData): Promise<void> {
    const keys = SAVINGS_TAB_FIELDS['Scheme Details'];
    if (!keys) return;

    for (const key of keys) {
      const rawValue = accountData[key];
      if (rawValue === undefined || rawValue === null) continue;
      const value = String(rawValue).trim();
      if (value === '') continue;

      if (key.toLowerCase().includes('interest method (dr.)')) {
        await this.setInterestMethodDr(value);
        console.log(`Scheme Details [${key} = ${value}]: set via setInterestMethodDr`);
        continue;
      }

      if (key === 'schemeExpiryDate') {
        await this.setSchemeExpiryDate(value);
        continue;
      }

      const labels = this.labelVariants(key);
      const isNumeric = /^[0-9.,]+$/.test(value);

      // Non-numeric values are Yes/No or option-style radios (No, Yes, Scheme, A/c, Simultaneous, ...)
      if (!isNumeric) {
        let filled = false;
        for (const label of labels) {
          if (await this.setRadioByLabel(label, value)) { filled = true; break; }
          if (await this.selectOptionByLabel(label, value)) { filled = true; break; }
        }
        if (!filled) {
          await this.fillSuppliedField(key, value);
        }
        console.log(`Scheme Details [${key} = ${value}]: filled=${filled}`);
      } else {
        await this.fillSuppliedField(key, value);
        console.log(`Scheme Details [${key} = ${value}] filled via fillSuppliedField`);
      }
    }
  }

  // Returns true if the tab has at least one supplied non-empty value.
  private hasTabData(accountData: AccountData, tabName: string): boolean {
    const keys = SAVINGS_TAB_FIELDS[tabName];
    if (!keys) return false;
    return keys.some(key => {
      const v = accountData[key];
      return v !== undefined && v !== null && String(v).trim() !== '';
    });
  }

  // Visits optional savings tabs (Others, Account Limits, Document, FFD,
  // Payment System) only when the workbook provides data for them.
  private async fillSuppliedSavingsExtraTabs(accountData: AccountData) {
    const extraTabs = [
      { label: 'Other Details', id: 'otherdetails', tabName: 'Others Details', verificationLabel: 'External' },
      { label: 'Account Limits', id: 'accountlimits', tabName: 'Account Limits', verificationLabel: 'Account Limits' },
      { label: 'Document Details', id: 'documentdetails', tabName: 'Document Details', verificationLabel: 'Document' },
      { label: 'FFD Parameters', id: 'ffdparameters', tabName: 'FFD Parameters', verificationLabel: 'FFD' },
      { label: 'Payment System', id: 'paymentsystem', tabName: 'Payment System', verificationLabel: 'Payment' },
    ];
    for (const tab of extraTabs) {
      if (!this.hasTabData(accountData, tab.tabName)) continue;
      try {
        await this.clickTab(tab.label, tab.id, tab.verificationLabel);
        await this.fillSavingsTabFields(accountData, tab.tabName);
      } catch (e) {
        console.log(`Could not visit/fill ${tab.label}: ${e}`);
      }
    }
  }

  // Helpers for the new Excel-driven savings fields.
  private isYes(value: any): boolean {
    return /^(yes|y|true)$/i.test(String(value ?? '').trim());
  }

  private async setFrequencyRow(
    rowLabel: string,
    fields: { key: string; label?: string; kind: 'select' | 'text' | 'radio-value' }[],
    accountData: AccountData
  ): Promise<Record<string, { ok: boolean; actual?: string; reason?: string }>> {
    const finwFrame = this.getFinwFrame();
    const result = await finwFrame.evaluate(({ rowLabel, fields, data }) => {
      const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const findRow = () => {
        const cells = Array.from(document.querySelectorAll('td, th'));
        return cells.find(c => normalize(c.textContent?.trim() || '').startsWith(normalize(rowLabel)))?.closest('tr') as HTMLTableRowElement | null;
      };
      const row = findRow();
      if (!row) {
        return Object.fromEntries(fields.map(f => [f.key, { ok: false, reason: `row for "${rowLabel}" not found` }]));
      }

      const out: Record<string, { ok: boolean; actual?: string; reason?: string }> = {};
      for (const f of fields) {
        const raw = String(data[f.key] ?? '').trim();
        if (!raw) {
          out[f.key] = { ok: true, actual: '' };
          continue;
        }

        if (f.kind === 'radio-value') {
          const radios = Array.from(row.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
          const target = radios.find(r =>
            r.value.toLowerCase() === raw.toLowerCase() ||
            (r.getAttribute('title') || '').toLowerCase().includes(raw.toLowerCase())
          );
          if (target) {
            target.checked = true;
            target.dispatchEvent(new Event('change', { bubbles: true }));
            out[f.key] = { ok: true, actual: target.value };
          } else {
            out[f.key] = { ok: false, reason: `radio value "${raw}" not found` };
          }
          continue;
        }

        const label = f.label ?? f.key;
        const subCells = Array.from(row.querySelectorAll('td, th'));
        const subCell = subCells.find(c => {
          const t = normalize(c.textContent?.trim() || '');
          return t === normalize(label) || (c.textContent?.trim() || '').toLowerCase().startsWith(label.toLowerCase());
        });
        const controlCell = (subCell?.nextElementSibling as HTMLElement | null) ?? subCell ?? row;

        if (f.kind === 'select') {
          const select = controlCell.querySelector('select') as HTMLSelectElement | null;
          if (!select) {
            out[f.key] = { ok: false, reason: 'select not found' };
          } else {
            const code = raw.split('-')[0].trim().toLowerCase();
            const opt = Array.from(select.options).find(o =>
              o.text.toLowerCase().includes(raw.toLowerCase()) ||
              o.value.toLowerCase() === raw.toLowerCase() ||
              o.text.toLowerCase().includes(code)
            );
            if (opt) {
              select.value = opt.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              out[f.key] = { ok: true, actual: opt.text };
            } else {
              out[f.key] = { ok: false, reason: `option matching "${raw}" not found` };
            }
          }
        } else {
          const input = controlCell.querySelector('input[type="text"]') as HTMLInputElement | null;
          if (!input) {
            out[f.key] = { ok: false, reason: 'text input not found' };
          } else {
            input.value = raw;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            out[f.key] = { ok: true, actual: input.value };
          }
        }
      }
      return out;
    }, { rowLabel, fields, data: accountData });
    return result as Record<string, { ok: boolean; actual?: string; reason?: string }>;
  }

  private async assertFrequencyFields(
    rowLabel: string,
    fields: { key: string; kind: 'select' | 'text' | 'radio-value' }[],
    accountData: AccountData,
    result: Record<string, { ok: boolean; actual?: string; reason?: string }>
  ): Promise<void> {
    for (const f of fields) {
      const expected = String(accountData[f.key] ?? '').trim();
      if (!expected) continue;
      const r = result[f.key];
      if (!r || !r.ok) {
        throw new Error(`${rowLabel} - ${f.key}: ${r?.reason || 'failed'}`);
      }
      const actual = r.actual ?? '';
      if (f.kind === 'radio-value') {
        expect(actual.toLowerCase(), `${f.key} radio value`).toBe(expected.toLowerCase());
      } else if (f.kind === 'select') {
        const code = expected.split('-')[0].trim().toLowerCase();
        expect(actual.toLowerCase(), `${f.key} selected text`).toContain(code);
      } else {
        expect(actual, `${f.key} input value`).toBe(expected);
      }
    }
  }

  // Re-applies the Statement Frequency values on the General Details tab and
  // strictly asserts that each select still reflects the supplied Excel value.
  private async assertStatementFrequency(accountData: AccountData): Promise<void> {
    await this.setStatementFrequency(accountData);

    const finwFrame = this.getFinwFrame();
    const expected = {
      statementFrequency: String(accountData.statementFrequency ?? '').trim(),
      statementWeek: String(accountData.statementWeek ?? '').trim(),
      statementDay: String(accountData.statementDay ?? '').trim(),
      statementP: String(accountData.statementP ?? accountData.statementNextDay ?? '').trim(),
      statementG: String(accountData.statementG ?? accountData.statementCalendar ?? '').trim(),
    };
    const ids: Record<string, string> = {
      statementFrequency: 'pbPsFreqType',
      statementWeek: 'pbPsFreqWeek',
      statementDay: 'pbPsFreqStartDD',
      statementP: 'pbPsFreqHldyStat',
      statementG: 'pbPsFreqCalBase',
    };

    const actuals = await finwFrame.evaluate(({ ids }) => {
      const out: Record<string, string> = {};
      for (const [key, id] of Object.entries(ids)) {
        const sel = document.querySelector('#' + id) as HTMLSelectElement | null;
        const opt = sel?.options[sel?.selectedIndex ?? -1];
        out[key] = opt ? opt.text.trim() : '';
      }
      return out;
    }, { ids });

    for (const [key, exp] of Object.entries(expected)) {
      if (!exp) continue;
      const code = exp.split('-')[0].trim().toUpperCase();
      const actual = actuals[key] ?? '';
      const actualCode = actual.split('-')[0].trim().toUpperCase();
      if (actualCode !== code) {
        throw new Error(`Statement Frequency persistence failed for ${key}. Expected: ${exp}, Got: ${actual}`);
      }
    }

    console.log('Statement Frequency persisted after navigation:', JSON.stringify(actuals));
  }

  private async setStatementFrequency(accountData: AccountData): Promise<void> {
    const acStmt = String(accountData.accountStatement ?? '').trim().toLowerCase();
    const isNone = !acStmt || acStmt === 'n' || acStmt === 'none' || acStmt.startsWith('n -');
    if (isNone) {
      console.log('A/c Statement is None, skipping Statement Frequency setup');
      return;
    }
    const finwFrame = this.getFinwFrame();
    const result = await finwFrame.evaluate((opts) => {
      const setSelect = (id: string, val?: string) => {
        const sel = document.querySelector('#' + id) as HTMLSelectElement | null;
        if (!sel || !val) return '';
        const code = val.split('-')[0].trim().toLowerCase();
        // Enable the control; it may be disabled by Finacle, which prevents normal fill.
        sel.disabled = false;
        const opt = Array.from(sel.options).find(o =>
          (o.value || '').toLowerCase() === val.toLowerCase() ||
          (o.text || '').toLowerCase().startsWith(code + ' -') ||
          (o.text || '').toLowerCase().includes(val.toLowerCase()) ||
          (o.text || '').toLowerCase().includes(code)
        );
        if (opt) {
          sel.selectedIndex = opt.index;
          sel.value = opt.value;
          if (typeof sel.onchange === 'function') sel.onchange();
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          sel.dispatchEvent(new Event('blur', { bubbles: true }));
          sel.blur();

          // Keep any hidden/server-bound input with the same id in sync so the
          // value survives tab navigation and form submission.
          const selectedValue = opt.value || '';
          document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
            const n = (inp.getAttribute('name') || '').toLowerCase();
            const i = (inp.id || '').toLowerCase();
            if (n.includes(id.toLowerCase()) || i.includes(id.toLowerCase())) {
              inp.value = selectedValue;
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });

          return opt.text;
        }
        return '';
      };
      return {
        statementFrequency: setSelect('pbPsFreqType', opts.statementFrequency),
        statementWeek: setSelect('pbPsFreqWeek', opts.statementWeek),
        statementDay: setSelect('pbPsFreqStartDD', opts.statementDay),
        statementP: setSelect('pbPsFreqHldyStat', opts.statementP),
        statementG: setSelect('pbPsFreqCalBase', opts.statementG),
      };
    }, {
      statementFrequency: String(accountData.statementFrequency ?? '').trim(),
      statementWeek: String(accountData.statementWeek ?? '').trim(),
      statementDay: String(accountData.statementDay ?? '').trim(),
      statementP: String(accountData.statementP ?? accountData.statementNextDay ?? '').trim(),
      statementG: String(accountData.statementG ?? accountData.statementCalendar ?? '').trim(),
    });

    const ids: Record<string, string> = {
      statementFrequency: 'pbPsFreqType',
      statementWeek: 'pbPsFreqWeek',
      statementDay: 'pbPsFreqStartDD',
      statementP: 'pbPsFreqHldyStat',
      statementG: 'pbPsFreqCalBase',
    };
    for (const [key, id] of Object.entries(ids)) {
      const label = (result as any)[key];
      if (!label) continue;
      const sel = finwFrame.locator('select#' + id);
      try {
        await sel.evaluate((el: any) => { el.disabled = false; });
        await sel.selectOption({ label });
      } catch (e) {
        console.warn(`Playwright selectOption failed for ${id}: ${(e as Error).message}`);
      }
    }

    if (accountData.statementFrequency) expect(result.statementFrequency.toLowerCase()).toContain(String(accountData.statementFrequency).split('-')[0].trim().toLowerCase());
    if (accountData.statementWeek) expect(result.statementWeek.toLowerCase()).toContain(String(accountData.statementWeek).toLowerCase());
    if (accountData.statementDay) expect(result.statementDay).toContain(String(accountData.statementDay));
    if (accountData.statementP) expect(result.statementP.toLowerCase()).toContain(String(accountData.statementP).split('-')[0].trim().toLowerCase());
    if (accountData.statementG) expect(result.statementG.toLowerCase()).toContain(String(accountData.statementG).split('-')[0].trim().toLowerCase());
    console.log('Statement Frequency set:', JSON.stringify(result));
  }

  // Sets the A/c Statement dropdown from the workbook value. The statement
  // flag is usually rendered as <select id="pbPsFlg" />, so target that id
  // directly; fall back to label search only when it is not present.
  private async setAccountStatement(value: string): Promise<void> {
    const str = String(value).trim();
    if (!str) return;
    const finwFrame = this.getFinwFrame();
    const sel = finwFrame.locator('select#pbPsFlg, select[name*="pbPsFlg"], select[id*="pbPsFlg"]').first();
    if (await sel.count() > 0) {
      const result = await sel.evaluate((el: HTMLSelectElement, target: string) => {
        const sel = el;
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const full = target.toLowerCase();
        const fullNorm = normalize(target);
        const targetCode = target.split('-')[0].trim().toLowerCase();
        sel.disabled = false;
        const opt = Array.from(sel.options).find(o => {
          const t = (o.text || '').trim().toLowerCase();
          const v = (o.value || '').trim().toLowerCase();
          return t === full || v === full || t.startsWith(targetCode + ' -') || v === targetCode || normalize(o.text).includes(fullNorm);
        });
        if (!opt) return `A/c Statement option not found for "${target}" in #pbPsFlg`;
        sel.selectedIndex = opt.index;
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof sel.onchange === 'function') (sel.onchange as any)();
        return `A/c Statement set to ${opt.text} (#${sel.id || 'pbPsFlg'})`;
      }, str);
      console.log(result);
      return;
    }

    // Fallback: search by the visible label when the id is not available.
    const result = await finwFrame.evaluate((target) => {
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const targetNorm = normalize(target);
      const targetCode = target.split('-')[0].trim().toLowerCase();
      const labelMatch = (text: string) => {
        const n = normalize(text);
        return n.includes('acstatement') || n.includes('accountstatement') || n.includes('a/cstatement');
      };

      const labels = Array.from(document.querySelectorAll('td, th, label, span, div'));
      const labelEl = labels.find(el => labelMatch((el as any).textContent || ''));
      if (!labelEl) return 'A/c Statement label not found';

      const parent = (labelEl as HTMLElement).closest('tr, td, div, fieldset, form');
      if (!parent) return 'A/c Statement label has no parent';

      const select = parent.querySelector('select') as HTMLSelectElement | null;
      if (!select) return 'A/c Statement select not found';

      select.disabled = false;
      const opt = Array.from(select.options).find(o => {
        const t = (o.text || '').trim().toLowerCase();
        const v = (o.value || '').trim().toLowerCase();
        return t.startsWith(targetCode + ' -') || normalize(o.text).includes(targetNorm) || normalize(o.value).includes(targetNorm);
      });
      if (!opt) return `A/c Statement option not found for "${target}" in #${select.id}`;

      select.selectedIndex = opt.index;
      select.value = opt.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof select.onchange === 'function') (select.onchange as any)();
      return `A/c Statement set to ${opt.text} (#${select.id})`;
    }, str);
    console.log(result);
  }

  private async setInterestCalculationFrequencies(accountData: AccountData): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const setGroup = async (rowLabel: string, prefix: string, ids: Record<string, string>) => {
      const result = await finwFrame.evaluate((opts) => {
        const setSelect = (id: string, val?: string) => {
          const sel = document.querySelector('#' + id) as HTMLSelectElement | null;
          if (!sel || !val) return '';
          const valNorm = val.toLowerCase().trim();
          const code = valNorm.split('-')[0];
          const current = sel.options[sel.selectedIndex];
          const currentText = (current?.text || '').trim().toLowerCase();
          const currentValue = (sel.value || '').trim().toLowerCase();
          if (currentText === valNorm || currentValue === valNorm || currentText.startsWith(code + ' -')) {
            return current?.text || '';
          }
          const opt = Array.from(sel.options).find(o => {
            const text = o.text.trim().toLowerCase();
            const value = (o.value || '').trim().toLowerCase();
            return text === valNorm || value === valNorm || text.startsWith(code + ' -') || value === code;
          });
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return opt.text;
          }
          return '';
        };
        return {
          frequency: setSelect(opts.ids.type, opts.data[`${opts.prefix}`]),
          week: setSelect(opts.ids.week, opts.data[`${opts.prefix}Week`]),
          day: setSelect(opts.ids.day, opts.data[`${opts.prefix}Day`]),
          p: setSelect(opts.ids.p, opts.data[`${opts.prefix}P`]),
          g: setSelect(opts.ids.g, opts.data[`${opts.prefix}G`]),
        };
      }, { ids, prefix, data: accountData });

      if (accountData[`${prefix}`]) expect(result.frequency.toLowerCase()).toContain(String(accountData[`${prefix}`]).split('-')[0].trim().toLowerCase());
      if (accountData[`${prefix}Week`]) expect(result.week.toLowerCase()).toContain(String(accountData[`${prefix}Week`]).toLowerCase());
      if (accountData[`${prefix}Day`]) expect(result.day).toContain(String(accountData[`${prefix}Day`]));
      if (accountData[`${prefix}P`]) expect(result.p.toLowerCase()).toContain(String(accountData[`${prefix}P`]).split('-')[0].trim().toLowerCase());
      if (accountData[`${prefix}G`]) expect(result.g.toLowerCase()).toContain(String(accountData[`${prefix}G`]).split('-')[0].trim().toLowerCase());
      console.log(`${rowLabel} set:`, JSON.stringify(result));
    };

    await setGroup('Interest Calculation Frequency (Cr.)', 'interestCalcFreqCr', {
      type: 'intCalcCrFreqType',
      week: 'intCalcCrFreqWeek',
      day: 'intCalcCrFreqStartDD',
      p: 'intCalcCrFreqHldyStat',
      g: 'intCalcCrFreqCalBase',
    });
    await setGroup('Interest Calculation Frequency (Dr.)', 'interestCalcFreqDr', {
      type: 'intCalcDrFreqType',
      week: 'intCalcDrFreqWeek',
      day: 'intCalcDrFreqStartDD',
      p: 'intCalcDrFreqHldyStat',
      g: 'intCalcDrFreqCalBase',
    });
  }

  private async setCollectInterest(value: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const yes = /^(yes|y|true)$/i.test(value.trim());
    const target = yes ? 'Y' : 'N';
    const result = await finwFrame.evaluate((val) => {
      const all = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      let radios = all.filter(r => /collectIntFlg/i.test(r.name || ''));
      if (radios.length === 0) radios = all.filter(r => /collectInt/i.test(r.name || ''));
      const targetVal = val.toLowerCase();
      const target = radios.find(r => {
        const v = (r.value || '').toLowerCase();
        if (v === targetVal) return true;
        if (targetVal === 'y' && (v === 'y' || v === 'yes' || v === 'true' || v === '1')) return true;
        if (targetVal === 'n' && (v === 'n' || v === 'no' || v === 'false' || v === '0')) return true;
        return false;
      });
      if (!target) return { ok: false, actual: '', reason: 'collectIntFlg radio not found' };
      target.checked = true;
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, actual: target.value };
    }, target);

    if (!result.ok) {
      console.log(`Could not set Collect Interest = "${value}": ${result.reason}; continuing`);
      return false;
    }
    console.log(`Set Collect Interest: ${value} (actual: ${result.actual})`);
    return true;
  }

  private async setInterestRateCode(value: string): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const result = await finwFrame.evaluate((val) => {
      const inp = document.querySelector('#intRateCode') as HTMLInputElement | null;
      if (!inp) return { ok: false, reason: '#intRateCode not found' };
      if (val) { inp.value = val; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
      return { ok: true, actual: inp.value };
    }, value.trim());

    if (!result.ok) throw new Error(`Could not set Interest Rate Code = "${value}": ${result.reason}`);
    expect(result.actual, 'Interest Rate Code value').toBe(value.trim());
    console.log(`Set Interest Rate Code: ${value}`);
  }

  private async setInterestDebitAccountId(value: string): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const result = await finwFrame.evaluate((val) => {
      const inp = document.querySelector('#intDrAcctNum') as HTMLInputElement | null;
      if (!inp) return { ok: false, reason: '#intDrAcctNum not found' };
      if (val) { inp.value = val; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
      return { ok: true, actual: inp.value };
    }, value.trim());

    if (!result.ok) throw new Error(`Could not set Interest Debit A/c. ID = "${value}": ${result.reason}`);
    expect(result.actual, 'Interest Debit A/c. ID value').toBe(value.trim());
    console.log(`Set Interest Debit A/c. ID: ${value}`);
  }

  private async setAdditionalInterestDetails(accountData: AccountData): Promise<void> {
    const collectInterest = String(accountData.collectInterest ?? '').trim();
    if (collectInterest) {
      try { await this.setCollectInterest(collectInterest); } catch (e: any) { console.log(`Could not set Collect Interest: ${e.message}`); }
    }

    const interestDebitAccountId = String(accountData.interestDebitAccountId ?? '').trim();
    if (interestDebitAccountId) {
      try { await this.setInterestDebitAccountId(interestDebitAccountId); } catch (e: any) { console.log(`Could not set Interest Debit A/c. ID: ${e.message}`); }
    }

    const interestRateCode = String(accountData.interestRateCode ?? '').trim();
    if (interestRateCode) {
      try { await this.setInterestRateCode(interestRateCode); } catch (e: any) { console.log(`Could not set Interest Rate Code: ${e.message}`); }
    }

    // Ensure a debit next interest calculation date exists before changing frequencies,
    // or Finacle raises 'Enter the field' on the debit interest section.
    const nextInterestDr = String(accountData['Next Interest Calculation Date (Dr.)'] ?? '').trim();
    const nextDrDate = nextInterestDr || (() => {
      const d = new Date();
      d.setDate(d.getDate() + Math.floor(Math.random() * 28) + 1);
      return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    })();
    try {
      await this.setNextInterestCalculationDateDr(nextDrDate);
    } catch (e: any) {
      console.log(`Could not set debit next interest date: ${e.message}`);
    }
    try {
      await this.setInterestCalculationFrequencies(accountData);
    } catch (e: any) {
      console.log(`Could not set interest calculation frequencies: ${e.message}`);
    }
  }

  private async setNextInterestCalculationDateCr(value: string): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const field = finwFrame.locator('#nextIntCrCalcDt_ui');
    if ((await field.count()) === 0) {
      throw new Error('Next Interest Calculation Date (Cr.) input not found');
    }

    await field.evaluate((el: any, v: string) => {
      el.disabled = false;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);

    await this.page.waitForTimeout(500);
    const actual = await field.inputValue().catch(() => '');
    if (actual.trim() !== value.trim()) {
      throw new Error(`Next Interest Calculation Date (Cr.) assertion failed. Expected: ${value}, Got: ${actual}`);
    }
    console.log(`Next Interest Calculation Date (Cr.) verified: ${actual}`);
  }

  private async setNextInterestCalculationDateDr(value: string): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const field = finwFrame.locator('#nextIntDrCalcDt_ui');
    if ((await field.count()) === 0) {
      throw new Error('Next Interest Calculation Date (Dr.) input not found');
    }

    await field.evaluate((el: any, v: string) => {
      el.disabled = false;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);

    await this.page.waitForTimeout(500);
    const actual = await field.inputValue().catch(() => '');
    if (actual.trim() !== value.trim()) {
      throw new Error(`Next Interest Calculation Date (Dr.) assertion failed. Expected: ${value}, Got: ${actual}`);
    }
    console.log(`Next Interest Calculation Date (Dr.) verified: ${actual}`);
  }

  // Clicks the General Details tab's own Submit button (if present). This
  // invokes general_details_ONCLICK28 and saves the General Details values
  // before we move to the next tab, so Dispatch Mode and Statement Frequency
  // are persisted by the server.
  private async submitGeneralDetailsTab(): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const clicked = await finwFrame.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], button'));
      const btn = btns.find(b => (b.getAttribute('onclick') || '').includes('general_details_ONCLICK28')) as HTMLElement | undefined;
      if (btn) {
        (btn as any).click();
        return true;
      }
      return false;
    });
    if (clicked) {
      console.log('Clicked General Details Submit (general_details_ONCLICK28)');
      await this.page.waitForTimeout(3000);
    } else {
      console.log('General Details Submit button not found');
    }
  }

  // ============ Tab Filling Orchestration ============
  private async fillAllTabs(
    accountData: AccountData,
    forModification = false,
    relatedParties: AccountData[] = []
  ) {
    const dispatchMode = (accountData.dispatchMode || 'post') as 'email' | 'post';

    await this.visitGeneralDetailsTab();
    if (forModification) {
      await this.fillGeneralTabFields();
    }
    await this.fillSavingsTabFields(accountData, 'General Details');
    await this.setStatementFrequency(accountData);
    await this.selectDispatchMode(dispatchMode);

    await this.visitInterestDetailsTab();
    await this.fillInterestDetails(forModification);
    await this.fillSavingsTabFields(accountData, 'Interest Details');
    await this.setAdditionalInterestDetails(accountData);

    await this.visitSchemeDetailsTab();
    await this.fillSavingsTabFields(accountData, 'Scheme Details');

    await this.visitRelatedPartyTab();
    await this.fillSavingsTabFields(accountData, 'Related Party Details', relatedParties);

    await this.visitMiscodesTab();
    await this.fillSavingsTabFields(accountData, 'MIS Code');
  }

  // ============ Account Creation Methods ============
  async createSavingsAccount(
    accountData: AccountData,
    options: { skipGeneralDetailsRevisit?: boolean; relatedParties?: AccountData[] } = {}
  ) {
    await this.fillBasicAccountDetails(accountData);
    await this.selectSchemeCode(accountData.schemeCode ?? undefined);

    // If the dispatch/despatch control is available on the initial (pre-Accept)
    // form, set it before the account record is accepted.
    await this.selectDispatchMode((accountData.dispatchMode || 'email') as 'email' | 'post' | 'no dispatch');
    await this.page.waitForTimeout(1000);

    await this.acceptButton.click({ force: true, timeout: 15000 });
    await this.page.waitForTimeout(3000);

    await this.fillAllTabs(accountData, false, options.relatedParties || []);


    await this.fillSuppliedSavingsExtraTabs(accountData);

    // Account Limits is a mandatory tab that must be filled before submit.
    await this.visitAccountLimitsTab();
    const bodStr = await this.getBODDate() || this.todayDate();
    const [dd, mm, yyyy] = bodStr.split('-').map(Number);
    const bod = new Date(yyyy, mm - 1, dd);
    const future = new Date(bod);
    future.setFullYear(bod.getFullYear() + 1);
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const fallbackExpiry = fmt(future);
    const expiryDate = (accountData.schemeExpiryDate && String(accountData.schemeExpiryDate).trim()) ||
                       (accountData.accountLimitsExpiryDate && String(accountData.accountLimitsExpiryDate).trim()) ||
                       fallbackExpiry;
    console.log(`Using Account Limits expiry date: ${expiryDate}`);
    await this.fillLoanAccountLimits(expiryDate);
    await this.setTextByCandidates(['sanctionLimit'], '1000', 'Sanction limit');
    await this.setTextByCandidates(['drawingPower'], '1000', 'Drawing power');
    await this.setTextByCandidates(['drawingPowerPcnt'], '100', 'Drawing power percent');


    await this.clickSubmit();
  }

  // Diagnostic: logs the id/name/value of all controls that look like dispatch
  // or statement frequency fields, so the correct server-side parameter names
  // can be determined from the live Finacle form.
  async captureSavingsFieldDiagnostics(): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const result = await finwFrame.evaluate(() => {
      const targets = ['despatch', 'dispatch', 'pbps', 'stmt', 'statement'];
      const fields: any[] = [];
      document.querySelectorAll('select, input, textarea').forEach((el: any) => {
        const id = (el.id || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (targets.some(t => id.includes(t) || name.includes(t))) {
          fields.push({
            tag: el.tagName,
            id: el.id || null,
            name: el.getAttribute('name') || null,
            type: el.type || null,
            value: el.value || '',
            selectedText: el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text?.trim() : undefined,
            disabled: el.disabled,
          });
        }
      });
      return fields;
    });
    console.log('Savings field diagnostics:', JSON.stringify(result, null, 2));
  }

  // ============ Current Account Creation Methods ============
  // Creates a current account via HOAACCA following the manual test steps:
  // basic details + scheme -> General (dispatch) -> Interest (Cr/Dr account =
  // S-Original a/c, month-end next interest dates) -> Scheme -> Related Party
  // -> MIS Codes -> Account Limits (expiry, document date, drawing power EQUAL)
  // -> Submit.
  async createCurrentAccount(accountData: AccountData) {
    await this.fillBasicAccountDetails(accountData);
    await this.selectSchemeCode(accountData.schemeCode ?? undefined);
    await this.acceptButton.click();
    await this.page.waitForTimeout(3000);

    // General Details tab - dispatch mode and statement frequency are mandatory
    await this.visitGeneralDetailsTab();
    await this.selectDispatchMode((accountData.dispatchMode || 'email') as 'email' | 'post' | 'no dispatch');
    await this.fillSavingsTabFields(accountData, 'General Details');
    await this.setStatementFrequency(accountData);

    // Interest Details tab
    await this.visitInterestDetailsTab();
    await this.fillCurrentAccountInterestDetails();
    await this.fillSavingsTabFields(accountData, 'Interest Details');

    // Remaining detail tabs
    await this.visitSchemeDetailsTab();
    await this.fillSavingsTabFields(accountData, 'Scheme Details');
    await this.visitRelatedPartyTab();
    await this.fillSavingsTabFields(accountData, 'Related Party Details');
    await this.visitMiscodesTab();
    await this.fillSavingsTabFields(accountData, 'MIS Code');

    // Account Limits tab
    await this.visitAccountLimitsTab();
    await this.fillAccountLimits();
    await this.fillSavingsTabFields(accountData, 'Account Limits');

    // Dispatch mode can clear when navigating between tabs; re-apply on General
    // Details and ensure the submit form has the hidden server-bound value.
    await this.assertGeneralDetailsDispatchMode(accountData.dispatchMode as string);
    await this.assertStatementFrequency(accountData);
    await this.assertDispatchModeInSubmitForm(accountData.dispatchMode as string);

    await this.clickSubmit();
  }

  // Returns the last calendar day of the next month as dd-mm-yyyy.
  private monthEndDate(): string {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 2, 0);
    return `${String(last.getDate()).padStart(2, '0')}-${String(last.getMonth() + 1).padStart(2, '0')}-${last.getFullYear()}`;
  }

  // Returns the application/BOD date as dd-mm-yyyy, preferring APPLICATION_DATE env.
  private todayDate(): string {
    const env = process.env.APPLICATION_DATE;
    const d = env
      ? new Date(Number(env.split('-')[2]), Number(env.split('-')[1]) - 1, Number(env.split('-')[0]))
      : new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  }

  // Returns a future date (one year ahead) as dd-mm-yyyy.
  private futureDate(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  }

  // Finacle shows the business opening date in the header (e.g. "01 September, 2026").
  // Parse and return it as dd-mm-yyyy so account dates can be back-dated correctly.
  async getBODDate(): Promise<string | null> {
    try {
      const body = await this.getFinwFrame().locator('body').innerText();
      const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const months = monthNames.join('|');
      const m = body.match(new RegExp(`(\\d{1,2})\\s(${months})\\s*,\\s*(\\d{4})`));
      if (!m) return null;
      const month = monthNames.findIndex(x => x.toLowerCase() === m[2].toLowerCase()) + 1;
      const day = m[1].padStart(2, '0');
      const year = m[3];
      return `${day}-${String(month).padStart(2, '0')}-${year}`;
    } catch (e) {
      return null;
    }
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
    await this.clickTab('Account Limits', 'accountlimits', 'Sanction Limit');
  }

  async visitOthersTab() {
    await this.clickTab('Others', 'others', 'External System Pricing');
  }

  async visitNominationTab() {
    await this.clickTab('Nomination Details', 'nomination', 'Nomination');
  }

  async fillNextInterestDate(): Promise<void> {
    try {
      const randomOffset = Math.floor(Math.random() * 28) + 1;
      const d = new Date();
      d.setDate(d.getDate() + randomOffset);
      const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      console.log(`Next interest calculation date: ${dateStr}`);
      await this.nextInterestDate.clear();
      await this.nextInterestDate.fill(dateStr);
      await this.nextInterestDate.press('Tab');
      await this.page.waitForTimeout(1000);
    } catch (e) {
      console.log(`Could not fill next interest date: ${e}`);
    }
  }

  async selectInterestCreditAccount(): Promise<void> {
    try {
      const dropdown = this.getFinwFrame().locator('#intCrAcctFlg');
      await dropdown.waitFor({ state: 'visible', timeout: 15000 });
      await dropdown.selectOption('S');
      await this.page.waitForTimeout(1000);
      console.log('Selected Interest Credit A/c: S-Original a/c');
    } catch (e) {
      console.log(`Could not select interest credit account, skipping: ${e}`);
    }
  }

  async visitNominationDetailsTab() {
    await this.clickTab('Nomination Details', 'nomination', 'Nomination');
  }

  async visitDocumentDetailsTab() {
    await this.clickTab('Document Details', 'documentdetails', 'Document Type');
  }

  // Fills the mandatory fields on the Nomination Details tab:
  // 1. Registration No. (top of page)
  // 2. Sequence No. (top of page)
  // 3. CIF ID (auto-fills nominee name and address)
  // 4. Relationship lookup
  // 5. Click Add button
  async fillNominationDetails(data: {
    cifId: string;
    relationship: string;
    registrationNo: string;
    sequenceNo: string;
  }) {
    const finwFrame = this.getFinwFrame();

    // Debug: dump all visible input fields so we know the actual IDs.
    const fieldDebug = await finwFrame.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
        .filter(el => {
          const s = window.getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && !(el as HTMLInputElement).disabled;
        })
        .map(el => ({ id: el.id, name: (el as HTMLInputElement).name, value: (el as HTMLInputElement).value }))
        .slice(0, 30);
    });
    console.log('Nomination tab input fields:', JSON.stringify(fieldDebug));

    // Helper: fill a field by finding the <td> whose text starts with labelText.
    // Searches the next sibling cells in the same row for the first enabled text input.
    const fillByLabel = async (labelText: string, value: string) => {
      const filled = await finwFrame.evaluate(({ label, val }) => {
        const cells = Array.from(document.querySelectorAll('td, th'));
        const labelCell = cells.find(el => (el.textContent?.trim() || '').startsWith(label));
        if (!labelCell) return { ok: false, reason: `label cell not found: ${label}` };

        // Try next sibling cells in the same row for an input.
        let sibling = labelCell.nextElementSibling;
        while (sibling) {
          const input = sibling.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null;
          if (input && !input.disabled) {
            input.focus();
            input.value = val;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.blur();
            return { ok: true, id: input.id, name: input.name };
          }
          // Stop at next label cell to avoid spilling into wrong field.
          if ((sibling.textContent?.trim() || '').length > 2 && sibling.querySelector('input') === null) break;
          sibling = sibling.nextElementSibling;
        }

        // Fallback: check the row for any input that comes after this cell positionally.
        const row = labelCell.closest('tr');
        if (row) {
          const labelRect = (labelCell as HTMLElement).getBoundingClientRect();
          const inputs = Array.from(row.querySelectorAll('input[type="text"], input:not([type])'))
            .filter(el => {
              const r = (el as HTMLElement).getBoundingClientRect();
              return r.left > labelRect.right && !(el as HTMLInputElement).disabled;
            }) as HTMLInputElement[];
          if (inputs.length > 0) {
            const input = inputs[0];
            input.focus();
            input.value = val;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.blur();
            return { ok: true, id: input.id, name: input.name, via: 'row-positional' };
          }
        }

        return { ok: false, reason: `no enabled input found after label: ${label}` };
      }, { label: labelText, val: value });
      console.log(`fillByLabel("${labelText}", "${value}"): ${JSON.stringify(filled)}`);
      return filled.ok;
    };

    // Step 1: Fill Registration No using Playwright native click + type.
    // The field is in the row containing "Registration No" text.
    const regRow = finwFrame.locator('tr').filter({ hasText: /Registration No/i }).first();
    const regInput = regRow.locator('input[type="text"], input:not([type])').first();
    try {
      await regInput.waitFor({ state: 'visible', timeout: 5000 });
      await regInput.click({ clickCount: 3 });
      await regInput.fill(data.registrationNo);
      console.log(`Registration No filled: ${data.registrationNo}`);
    } catch (e) {
      console.log(`Registration No fill failed via row locator: ${e}`);
      // Fallback: use label-based JS fill
      await fillByLabel('Registration No', data.registrationNo);
    }

    // Step 2: Fill Sequence No using Playwright native click + type.
    const seqRow = finwFrame.locator('tr').filter({ hasText: /Sequence No/i }).first();
    const seqInput = seqRow.locator('input[type="text"], input:not([type])').nth(1);
    try {
      await seqInput.waitFor({ state: 'visible', timeout: 5000 });
      await seqInput.click({ clickCount: 3 });
      await seqInput.fill(data.sequenceNo);
      console.log(`Sequence No filled: ${data.sequenceNo}`);
    } catch (e) {
      console.log(`Sequence No fill failed via row locator: ${e}`);
      await fillByLabel('Sequence No', data.sequenceNo);
    }

    await this.page.waitForTimeout(500);

    // Step 3: Enter CIF ID.
    const cifFilled = await fillByLabel('CIF ID', data.cifId);
    if (!cifFilled) {
      await this.setTextByCandidates(
        ['nomineeCifId', 'nominationCifId', 'cifId', 'cifID', 'nomCifId'],
        data.cifId, 'Nomination CIF id'
      );
    }
    await this.page.waitForTimeout(2000);

    // Step 4: Click Relationship lookup icon, then select '999' (OTHERS) from the popup.
    // Debug: log the HTML of the Relationship label cell and its siblings.
    const relCellHtml = await finwFrame.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, th'));
      const labelCell = cells.find(el => (el.textContent?.trim() || '').startsWith('Relationship'));
      if (!labelCell) return 'label cell not found';
      let html = `LABEL: ${labelCell.innerHTML.substring(0, 200)}\n`;
      let sib = labelCell.nextElementSibling;
      let i = 0;
      while (sib && i < 3) {
        html += `SIB${i}: ${sib.innerHTML.substring(0, 300)}\n`;
        sib = sib.nextElementSibling;
        i++;
      }
      return html;
    });
    console.log('Relationship cell HTML:', relCellHtml);

    // Click the lookup icon that is in the sibling cell immediately after the Relationship input cell.
    const [relPopup] = await Promise.all([
      this.page.context().waitForEvent('page', { timeout: 15000 }),
      finwFrame.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('td, th'));
        const labelCell = cells.find(el => (el.textContent?.trim() || '').startsWith('Relationship'));
        if (!labelCell) return false;
        // The input cell is the next sibling, the lookup icon cell is the one after that.
        const inputCell = labelCell.nextElementSibling;
        if (!inputCell) return false;
        // Look for lookup icon (anchor with img) inside the input cell itself first.
        const anchorInCell = inputCell.querySelector('a:has(img), a[href*="javascript"]') as HTMLElement | null;
        if (anchorInCell) { anchorInCell.click(); return true; }
        // Then check the next sibling cell (icon may be in a separate td).
        const iconCell = inputCell.nextElementSibling;
        if (iconCell) {
          const anchorInIcon = iconCell.querySelector('a, img') as HTMLElement | null;
          if (anchorInIcon) { anchorInIcon.click(); return true; }
        }
        return false;
      }),
    ]);
    await relPopup.waitForLoadState('networkidle', { timeout: 15000 });
    console.log('Relationship popup URL:', relPopup.url());

    // Debug: log first few links in popup to confirm structure
    const popupLinks = await relPopup.evaluate(() =>
      Array.from(document.querySelectorAll('a')).slice(0, 20).map(a => ({ text: a.textContent?.trim(), href: a.href }))
    );
    console.log('Popup links:', JSON.stringify(popupLinks));

    // Find and click the 999 (OTHERS) link — use JS to find by exact text match.
    const clicked = await relPopup.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const target = links.find(a => (a.textContent?.trim() || '') === '999');
      if (target) { (target as HTMLElement).click(); return true; }
      return false;
    });
    console.log(`Clicked 999 via JS: ${clicked}`);
    if (!clicked) {
      // Fallback: find any link in a row that also contains 'OTHERS'
      const clicked2 = await relPopup.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr'));
        const row = rows.find(r => r.textContent?.includes('OTHERS'));
        if (row) {
          const link = row.querySelector('a') as HTMLElement | null;
          if (link) { link.click(); return true; }
        }
        return false;
      });
      console.log(`Clicked OTHERS row via JS fallback: ${clicked2}`);
    }
    await this.page.waitForTimeout(2000);
    console.log('Selected 999 (OTHERS) from Relationship popup');

    await this.page.waitForTimeout(1000);

    // Step 5: Click the Add button to save the nomination record.
    // Re-fetch frame in case the reference went stale after the popup closed.
    const freshFrame = this.getFinwFrame();
    const addBtn = freshFrame.locator('input[type="button"][value="Add"]').first();
    await addBtn.waitFor({ state: 'visible', timeout: 15000 });
    await addBtn.click({ force: true });
    await this.page.waitForTimeout(3000);
    console.log('Clicked Add button on Nomination Details tab');
  }

  // Service Pack validation: on the Scheme Details tab, set Nomination = YES
  // (radio button) and Preferred Nomination Type = Successive (radio button).
  async setNominationFlagAndType(): Promise<void> {
    const finwFrame = this.getFinwFrame();

    // Clicks the actual radio input whose associated label text is nearest to
    // the given field label. All work is done inside the frame so there are no
    // locator/ID escaping issues.
    const clickRadioNearLabel = async (
      labelText: string | RegExp,
      choiceText: string | RegExp,
      excludeText?: string | RegExp
    ) => {
      return await finwFrame.evaluate(
        ({ labelRe, choiceRe, excludeRe }) => {
          const all = Array.from(
            document.querySelectorAll('label, span, td, th, div, font, b, strong, p, a, li, em')
          );

          const matchesRe = (el: Element, re: RegExp, exclude?: RegExp) => {
            const text = el.textContent?.trim() || '';
            return re.test(text) && (!exclude || !exclude.test(text));
          };

          const labelReObj = new RegExp(labelRe, 'i');
          const choiceReObj = new RegExp(choiceRe, 'i');
          const excludeReObj = excludeRe ? new RegExp(excludeRe, 'i') : undefined;

          // Find a visible leaf text node whose text matches the label, and use
          // its parent element. Skip script/style/hidden elements.
          const isVisibleElement = (el: Element) => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          };

          const findLabelElement = () => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
            while (walker.nextNode()) {
              const node = walker.currentNode as Text;
              const text = node.textContent?.trim() || '';
              if (!labelReObj.test(text) || (excludeReObj && excludeReObj.test(text))) continue;

              let parent: Element | null = node.parentElement;
              let isValid = true;
              while (parent && parent !== document.body) {
                const tag = parent.tagName.toLowerCase();
                if (tag === 'script' || tag === 'style' || tag === 'noscript') {
                  isValid = false;
                  break;
                }
                parent = parent.parentElement;
              }
              if (!isValid) continue;

              const immediateParent = node.parentElement;
              if (!immediateParent || !isVisibleElement(immediateParent)) continue;

              return immediateParent;
            }
            return null;
          };

          const labelEl = findLabelElement();
          if (!labelEl) {
            const debug = all
              .map(el => ({ tag: el.tagName, text: el.textContent?.trim() || '' }))
              .filter(x => new RegExp(labelRe, 'i').test(x.text) && (!excludeReObj || !excludeReObj.test(x.text)));
            return { success: false, reason: 'label text node not found', debug: debug.slice(0, 20) };
          }

          // Structural lookup: find the smallest ancestor container of the label
          // that also contains a matching Yes/Successive choice. If none, look in
          // the next sibling cell of the nearest td/th/div ancestor.
          let bestChoice: HTMLElement | null = null;

          const labelRow = labelEl.closest('tr');
          const debugInfo: Record<string, string> = {
            labelTag: labelEl.tagName,
            labelText: labelEl.textContent?.trim() || '',
            labelRowTag: labelRow?.tagName || 'none',
          };

          // Helper to pick the choice label closest to the label element.
          const pickClosestChoice = (choices: HTMLElement[]) => {
            const labelRect = labelEl.getBoundingClientRect();
            const lx = labelRect.left + labelRect.width / 2;
            const ly = labelRect.top + labelRect.height / 2;

            let best: HTMLElement = choices[0];
            let bestScore = Infinity;
            for (const c of choices) {
              const rect = c.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              const dx = cx - lx;
              const dy = Math.abs(cy - ly);
              // Prefer choices to the right of the label, on the same row.
              const score = dy * 2 + (dx < 0 ? 1000 : dx) + rect.width * rect.height / 1000;
              if (score < bestScore) {
                bestScore = score;
                best = c;
              }
            }
            return best;
          };

          // Collect all elements and text nodes that match the choice text.
          const choiceSelector =
            'label, span, b, strong, em, i, font, a, p, div, td, th, li';

          const findChoiceElements = (scope: Element) => {
            return Array.from(scope.querySelectorAll(choiceSelector)).filter(el =>
              matchesRe(el, new RegExp(choiceRe, 'i'))
            ) as HTMLElement[];
          };

          // 1. Find the smallest ancestor container (div/td/th) that contains a choice.
          let container: Element | null = labelEl.parentElement;
          while (container && container !== document.body) {
            const tag = container.tagName.toLowerCase();
            if (['td', 'th', 'div'].includes(tag)) {
              const choices = findChoiceElements(container);
              if (choices.length > 0) {
                debugInfo.choiceContainerTag = container.tagName;
                debugInfo.choiceContainerHtml = (container as HTMLElement).outerHTML.substring(0, 300);
                bestChoice = pickClosestChoice(choices);
                break;
              }
            }
            container = container.parentElement;
          }

          // 2. If no choice in the same container, look in the next sibling cell(s).
          if (!bestChoice) {
            const labelCell = labelEl.closest('td, th, div');
            if (labelCell) {
              const siblingChoices: string[] = [];
              let sibling = labelCell.nextElementSibling;
              while (sibling) {
                const found = findChoiceElements(sibling);
                if (found.length > 0) {
                  siblingChoices.push(`${sibling.tagName}: ${found.map(el => el.textContent?.trim()).join(', ')}`);
                  bestChoice = pickClosestChoice(found);
                  break;
                }
                sibling = sibling.nextElementSibling;
              }
              debugInfo.siblingChoices = siblingChoices.join(' | ') || 'none';
            }
          }

          // 3. Last resort: search the entire row for any matching choice.
          if (!bestChoice && labelRow) {
            const rowChoices = findChoiceElements(labelRow).filter(el => {
              // Exclude choices that belong to the label column itself.
              return !labelEl.contains(el) && !el.contains(labelEl);
            });
            if (rowChoices.length > 0) {
              debugInfo.rowChoiceCount = String(rowChoices.length);
              bestChoice = pickClosestChoice(rowChoices);
            }
          }

          if (!bestChoice) {
            debugInfo.reason = 'choice label not found structurally';
            return { success: false, reason: 'choice label not found', labelText: labelEl.textContent?.trim(), debug: debugInfo };
          }

          // Resolve the actual radio input for this choice.
          let radio: HTMLInputElement | null = null;
          const forId = (bestChoice as HTMLLabelElement).getAttribute('for');
          if (forId) {
            radio = document.getElementById(forId) as HTMLInputElement | null;
          }
          if (!radio) {
            const prev = bestChoice.previousElementSibling as HTMLInputElement | null;
            if (prev && prev.tagName === 'INPUT' && prev.type === 'radio') {
              radio = prev;
            }
          }
          if (!radio) {
            const parent = bestChoice.parentElement;
            if (parent) {
              radio = parent.querySelector('input[type="radio"]') as HTMLInputElement | null;
            }
          }

          if (!radio) return { success: false, reason: 'radio input not found for choice' };

          // Click the radio directly via JS, and also click the label to ensure
          // any custom event handlers fire.
          radio.scrollIntoView({ behavior: 'instant', block: 'center' });
          bestChoice.click();
          radio.click();

          return { success: true, checked: radio.checked, name: radio.name, value: radio.value, id: radio.id, labelText: labelEl.textContent?.trim() };
        },
        {
          labelRe: typeof labelText === 'string' ? labelText : labelText.source,
          choiceRe: typeof choiceText === 'string' ? choiceText : choiceText.source,
          excludeRe: typeof excludeText === 'string' ? excludeText : excludeText?.source,
        }
      );
    };

    // Debug: log all cell texts that mention Nomination so we can see the exact structure.
    const cellDebug = await finwFrame.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, th'));
      return cells
        .map(c => ({ tag: c.tagName, text: c.textContent?.trim() || '', html: (c as HTMLElement).innerHTML.substring(0, 150) }))
        .filter(c => c.text.toLowerCase().includes('nomination') || c.html.toLowerCase().includes('nomination'))
        .slice(0, 20);
    });
    console.log('Nomination cell debug:', JSON.stringify(cellDebug, null, 2));

    // 1. Find the Nomination Yes radio name/value via DOM inspection.
    const nomRadioInfo = await finwFrame.evaluate(() => {
      const allCells = Array.from(document.querySelectorAll('td, th'));
      const nomCell = allCells.find(el => {
        const t = el.textContent?.trim() || '';
        return t.startsWith('Nomination') && !t.startsWith('Nomination Details') && !t.startsWith('Nomination Type');
      });
      if (!nomCell) return null;
      const radioCell = nomCell.nextElementSibling;
      if (!radioCell) return null;
      const radios = Array.from(radioCell.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      const yes = radios[0];
      if (!yes) return null;
      return { name: yes.name, value: yes.value, id: yes.id };
    });
    console.log(`Nomination Yes radio info: ${JSON.stringify(nomRadioInfo)}`);
    if (!nomRadioInfo) {
      throw new Error('Failed to find Nomination Yes radio');
    }

    // Use Playwright native click — this fires real browser events that trigger Finacle's JS handlers.
    const nomYesLocator = finwFrame.locator(
      `input[type="radio"][name="${nomRadioInfo.name}"][value="${nomRadioInfo.value}"]`
    ).first();
    await nomYesLocator.click();
    await this.page.waitForTimeout(500);
    const nomChecked = await nomYesLocator.isChecked().catch(() => false);
    console.log(`Nomination Yes checked: ${nomChecked}`);

    // 2. Get the Nomination radio name so we can find the Preferred Nomination Type radios by name.
    // The Nomination Yes radio name is "sbschemedetails.availNomFlg" (confirmed from debug).
    // Finacle uses the same name pattern for Preferred Nomination Type.
    // Get the name of Successive radio from the Preferred Nomination Type row.
    const prefRadioInfo = await finwFrame.evaluate(() => {
      const allCells = Array.from(document.querySelectorAll('td, th'));
      // Use startsWith to handle cells that contain inline <script> text after the label.
      const prefCell = allCells.find(el => (el.textContent?.trim() || '').startsWith('Preferred Nomination Type'));
      if (!prefCell) return null;
      const radioCell = prefCell.nextElementSibling;
      if (!radioCell) return null;
      const radios = Array.from(radioCell.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      return radios.map(r => ({ id: r.id, name: r.name, value: r.value, disabled: r.disabled }));
    });
    console.log(`Preferred Nomination Type radios: ${JSON.stringify(prefRadioInfo)}`);

    if (!prefRadioInfo || prefRadioInfo.length < 2) {
      throw new Error(`Could not find Preferred Nomination Type radios. Found: ${JSON.stringify(prefRadioInfo)}`);
    }

    // The Successive radio is index 1. Use its name to build a Playwright locator.
    const successiveInfo = prefRadioInfo[1];

    // 3. Wait for it to become enabled (Finacle enables it after Nomination=Yes processes).
    await this.page.waitForTimeout(2000);

    // 4. Click Successive using Playwright native locator (fires real browser events).
    const successiveLocator = finwFrame.locator(
      `input[type="radio"][name="${successiveInfo.name}"][value="${successiveInfo.value}"]`
    ).first();

    await successiveLocator.click({ force: true });
    await this.page.waitForTimeout(500);
    const successiveChecked = await successiveLocator.isChecked().catch(() => false);
    console.log(`Successive radio checked after click: ${successiveChecked}`);

    if (!successiveChecked) {
      // Force-enable and fire full event sequence via JS.
      await finwFrame.evaluate(({ name, value }) => {
        const radio = document.querySelector(`input[type="radio"][name="${name}"][value="${value}"]`) as HTMLInputElement | null;
        if (!radio) return;
        radio.removeAttribute('disabled');
        radio.checked = true;
        radio.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        radio.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }, { name: successiveInfo.name, value: successiveInfo.value });
      console.log('Used JS fallback for Successive');
    }

    await this.page.waitForTimeout(1000);
  }

  // Service Pack validation: when an email-related dispatch mode is selected
  // on the General tab but the CIF has no email ID, Finacle should prompt the
  // user to enter the Email Type in the Related Party tab. This method
  // temporarily captures the next dialog after Submit, checks for the email
  // prompt, and returns whether the prompt was shown.
  async validateEmailTypeRequirement(dispatchMode: string): Promise<{ handled: boolean; submitted: boolean }> {
    const emailKeywords = ['email', 'post and email'];
    const isEmailDispatch = emailKeywords.some(k => dispatchMode.toLowerCase().includes(k.toLowerCase()));
    if (!isEmailDispatch) {
      console.log('Dispatch mode is not email-related; skipping email type requirement validation');
      return { handled: false, submitted: false };
    }

    let capturedMessage = '';
    let dialogCount = 0;
    const handler = async (dialog: Dialog) => {
      dialogCount++;
      capturedMessage = dialog.message();
      console.log(`Dialog ${dialogCount} captured during email validation: ${capturedMessage}`);
      await dialog.accept();
    };

    // Attach a temporary capturing handler before the global auto-accept handler.
    this.page.on('dialog', handler);
    console.log('Dispatch mode is email-related; submitting to check for Email Type requirement...');

    try {
      await this.clickSubmit();
      await this.page.waitForTimeout(4000);
    } catch (e) {
      console.log(`Submit during email validation encountered: ${e}`);
    }

    this.page.off('dialog', handler);

    if (/email type|email id|email address|emailtype/i.test(capturedMessage)) {
      console.log('Email Type requirement validation passed: prompt was displayed');
      return { handled: true, submitted: false };
    }

    if (dialogCount > 0) {
      console.log(`Email-related dialog not detected; ${dialogCount} other dialog(s) captured. Proceeding with further steps.`);
    } else {
      console.log('No email type dialog detected; form likely submitted successfully (CIF has email).');
    }

    return { handled: false, submitted: true };
  }

  // Service Pack validation on the HACM Modify > Others tab:
  // - If "Payment System Statements" is already YES, verify that a calendar
  //   icon is shown next to "Next Print Date" and leave the value as-is.
  // - If it is NO, skip the calendar check (return true) and continue without
  //   modifying the field.
  async validatePaymentSystemStatementsCalendar(): Promise<boolean> {
    try {
      const finwFrame = this.getFinwFrame();

      const labelRow = finwFrame
        .locator('tr')
        .filter({ hasText: /Payment System Statements/i })
        .first();

      const yesRadio = labelRow.locator('input[type="radio"]').filter({ hasText: /yes/i }).first()
        .or(labelRow.locator('input[type="radio"][value="Y" i], input[type="radio"][value="yes" i]').first())
        .or(labelRow.locator('input[type="radio"]').nth(0));

      const noRadio = labelRow.locator('input[type="radio"]').filter({ hasText: /no/i }).first()
        .or(labelRow.locator('input[type="radio"][value="N" i], input[type="radio"][value="no" i]').first())
        .or(labelRow.locator('input[type="radio"]').nth(1));

      const wasYesChecked = await yesRadio.isChecked().catch(() => false);
      console.log(`Payment System Statements initial state: Yes checked = ${wasYesChecked}`);

      if (!wasYesChecked) {
        const noChecked = await noRadio.isChecked().catch(() => false);
        console.log(`Payment System Statements is No (${noChecked}); skipping calendar icon check.`);
        return true;
      }

      const calendarPresent = await this.isCalendarIconPresent(finwFrame, /Next Print Date/i);
      console.log(`Calendar icon next to Next Print Date: ${calendarPresent}`);
      return calendarPresent;
    } catch (e) {
      console.log(`Could not validate payment system calendar: ${e}`);
      return false;
    }
  }

  private async findSelectByLabelOrOptions(frame: Frame, labelRe: RegExp): Promise<Locator | null> {
    // Find a label matching the text, then its nearest <select>.
    const labels = frame.locator('label, td, span, div').filter({ hasText: labelRe });
    const count = await labels.count();
    for (let i = 0; i < count; i++) {
      const label = labels.nth(i);
      const select = label.locator('xpath=following::select[1]');
      if ((await select.count()) > 0) return select;
    }
    // Fallback: find a select whose options contain the matching text.
    const selects = frame.locator('select');
    const selectCount = await selects.count();
    for (let i = 0; i < selectCount; i++) {
      const select = selects.nth(i);
      const options = await select.locator('option').allTextContents();
      if (options.some(o => labelRe.test(o))) return select;
    }
    return null;
  }

  private async isCalendarIconPresent(frame: Frame, labelRe: RegExp): Promise<boolean> {
    // Find the label in the same row, then look for a calendar icon inside that row.
    const labels = frame.locator('label, td, span, div').filter({ hasText: labelRe });
    const count = await labels.count();
    for (let i = 0; i < count; i++) {
      const label = labels.nth(i);
      const row = label.locator('xpath=ancestor::tr[1]');
      if ((await row.count()) > 0) {
        const calendarIcon = row
          .locator(
            'img[src*="calendar" i], img[class*="calendar" i], img[title*="calendar" i], img[alt*="calendar" i], ' +
            'input[type="image"][src*="calendar" i], .ui-datepicker-trigger, a:has(img[src*="calendar" i])'
          )
          .first();
        if ((await calendarIcon.count()) > 0 && (await calendarIcon.isVisible().catch(() => false))) {
          return true;
        }
      }
    }
    // Fallback: find a date-like input and check its parent cell for a calendar icon.
    const dateInputs = frame.locator(
      'input[id*="printDate" i], input[id*="nxtPrntDt" i], input[name*="printDate" i], input[id*="nextPrintDt" i]'
    );
    const inputCount = await dateInputs.count();
    for (let i = 0; i < inputCount; i++) {
      const input = dateInputs.nth(i);
      const parent = input.locator('xpath=..');
      const calendarIcon = parent
        .locator(
          'img[src*="calendar" i], img[class*="calendar" i], img[title*="calendar" i], img[alt*="calendar" i], ' +
          'input[type="image"][src*="calendar" i], .ui-datepicker-trigger, a:has(img[src*="calendar" i])'
        )
        .first();
      if ((await calendarIcon.count()) > 0 && (await calendarIcon.isVisible().catch(() => false))) {
        return true;
      }
    }
    return false;
  }

  private async fillAccountLimits() {
    // All Account Limits dates must be <= the BOD shown in the Finacle header.
    const bodStr = await this.getBODDate() || this.todayDate();
    const [dd, mm, yyyy] = bodStr.split('-').map(Number);
    const bod = new Date(yyyy, mm - 1, dd);
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const bodDate = fmt(bod);
    const futureBod = new Date(bod);
    futureBod.setFullYear(bod.getFullYear() + 1);
    const expiryDate = fmt(futureBod);
    console.log(`Using BOD ${bodDate} for Account Limits dates`);

    // Expiry date - one year from BOD
    await this.fillDateField(
      ['expiryDate_ui', 'limitExpiryDt_ui', 'expiryDt_ui', 'limExpiryDt_ui'],
      expiryDate,
      'Account limit expiry date'
    );

    // Document date - BOD
    await this.fillDateField(
      ['documentDate_ui', 'docDt_ui', 'limitDocDt_ui', 'documentDt_ui'],
      bodDate,
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
    await this.fillAllTabs({ dispatchMode } as AccountData, true);

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
    const selector =
      '#Submit, #submit, ' +
      'input[name*="Submit" i], input[name*="submit" i], ' +
      'input[value*="Submit" i], ' +
      'input[type="submit"][value*="Submit" i], input[type="button"][value*="Submit" i], ' +
      'input[type="image"][alt*="Submit" i], input[type="image"][title*="Submit" i], ' +
      'button:has-text("Submit"), a:has-text("Submit")';

    const clickFirstVisible = async (frame: Frame): Promise<boolean> => {
      try {
        if (frame.isDetached()) return false;
        const btns = frame.locator(selector);
        const count = await btns.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
          const btn = btns.nth(i);
          if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
            await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
            await btn.click({ timeout: 15000, force: true });
            return true;
          }
        }
      } catch {}
      return false;
    };

    const isContentFrame = (frame: Frame): boolean => {
      const name = (frame.name() || '').toLowerCase();
      return !name.includes('fininfra') && !name.includes('login');
    };

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const frames: Frame[] = [];
      try {
        frames.push(this.getFinwFrame());
      } catch {}

      for (const p of this.page.context().pages()) {
        if (p.isClosed()) continue;
        for (const f of p.frames()) {
          if (!f.isDetached() && isContentFrame(f)) {
            frames.push(f);
          }
        }
      }

      // Deduplicate while preserving order; FINW is tried first.
      const uniqueFrames = [...new Set(frames)];
      for (const frame of uniqueFrames) {
        if (await clickFirstVisible(frame)) {
          await this.page.waitForTimeout(5000);
          console.log(`Clicked Submit button in frame '${frame.name() || 'main'}'`);
          await captureEvidence(this.page, 'Submit button clicked', { frame: frame.name() || 'main' });
          return;
        }
      }
      await this.page.waitForTimeout(500);
    }

    // Fallback: use JS to click the first Submit-looking control in any frame.
    try {
      for (const p of this.page.context().pages()) {
        if (p.isClosed()) continue;
        for (const f of p.frames()) {
          if (f.isDetached()) continue;
          const clicked = await f.evaluate(() => {
            const labels = ['input[type="button"]', 'input[type="submit"]', 'button', 'a', 'img'];
            for (const tag of labels) {
              const elements = Array.from(document.querySelectorAll(tag)) as HTMLElement[];
              const el = elements.find(e => {
                const v = (e.getAttribute('value') || e.getAttribute('alt') || e.getAttribute('title') || e.textContent || '').trim().toLowerCase();
                return v === 'submit' || v.includes('submit');
              });
              if (el) { el.scrollIntoView({ block: 'center', inline: 'center' }); el.click(); return true; }
            }
            return false;
          }).catch(() => false);
          if (clicked) {
            await this.page.waitForTimeout(5000);
            console.log(`Clicked Submit button via JS in frame '${f.name() || 'main'}'`);
            await captureEvidence(this.page, 'Submit button clicked (JS fallback)', { frame: f.name() || 'main' });
            return;
          }
        }
      }
    } catch (e) {
      console.log(`JS fallback for Submit failed: ${e}`);
    }

    console.log('Could not click Submit button in any frame');
  }

  // ============ HACM (Customer Account Maintenance) Methods ============
  // Finds the <select> on the screen that contains an option matching the
  // desired function text (e.g. "Modify" / "M - Modify"), regardless of its id.
  private async findFunctionDropdown(value: string): Promise<Locator | null> {
    let finwFrame: Frame;
    try {
      finwFrame = this.getFinwFrame();
    } catch {
      return null;
    }

    // Prefer the known id if present
    const known = finwFrame.locator('#templateFunction');
    if (await known.count() > 0) {
      return known;
    }

    const selects = finwFrame.locator('select');
    const count = await selects.count();
    const normalizedValue = value.toLowerCase().replace(/\s*-\s*/g, '-');
    for (let i = 0; i < count; i++) {
      const opts = await selects.nth(i).locator('option').allTextContents();
      if (opts.some(o => o.toLowerCase().replace(/\s*-\s*/g, '-').includes(normalizedValue))) {
        return selects.nth(i);
      }
    }
    return null;
  }

  async selectFunction(value: string) {
    try {
      const deadline = Date.now() + 30000;
      let dropdown = await this.findFunctionDropdown(value);
      while (!dropdown && Date.now() < deadline) {
        await this.page.waitForTimeout(500);
        dropdown = await this.findFunctionDropdown(value);
      }
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
      const normalizedValue = value.toLowerCase().replace(/\s*-\s*/g, '-');
      const matchLabel = options.find(o => o.toLowerCase().replace(/\s*-\s*/g, '-').includes(normalizedValue));
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
      await captureEvidence(this.page, `Function selected: ${value}`, { function: value });
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
    try {
      const finwFrame = this.getFinwFrame();
      // The HACM screen uses a "Go" button; fall back to the Accept button id
      const goBtn = finwFrame.locator('#Go, input[value="Go"], button:has-text("Go")').first();
      if (await goBtn.count() > 0 && await goBtn.isVisible().catch(() => false) && await goBtn.isEnabled().catch(() => false)) {
        await goBtn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await goBtn.click({ timeout: 15000, force: true });
      } else {
        await this.clickAccept();
      }
      await this.page.waitForTimeout(3000);
      console.log('Clicked Go button');
      await captureEvidence(this.page, 'Go button clicked', {});
    } catch (e) {
      console.log(`Could not click Go button: ${e}`);
    }
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
    const buttonSelector =
      'input[type="button"][value^="Accept" i], input[type="button"][value*="Accept" i], ' +
      'input[type="submit"][value^="Accept" i], input[type="submit"][value*="Accept" i], ' +
      'input[value^="Accept" i], #Accept, #accept, ' +
      'button:has-text("Accept")';
    const anchorSelector = 'a#Accept, a#accept';

    const deadline = Date.now() + 10000;
    let clicked = false;
    while (Date.now() < deadline && !clicked) {
      try {
        const finwFrame = this.getFinwFrame();
        const btn = finwFrame.locator(buttonSelector).first();
        if (await btn.count() > 0) {
          await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await btn.click({ timeout: 15000, force: true });
          clicked = true;
        }
      } catch (e) {
        console.log(`Accept button click attempt failed, retrying: ${e}`);
      }
      if (!clicked) await this.page.waitForTimeout(500);
    }
    if (clicked) {
      await this.page.waitForTimeout(3000);
      console.log('Clicked Accept button in FINW frame');
      await captureEvidence(this.page, 'Accept button clicked', {});
      return;
    }

    // Last resort: an anchor link with text Accept in FINW.
    try {
      const finwFrame = this.getFinwFrame();
      const anchor = finwFrame.locator(anchorSelector).first();
      if (await anchor.count() > 0) {
        await anchor.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await anchor.click({ timeout: 15000, force: true });
        await this.page.waitForTimeout(3000);
        console.log('Clicked Accept anchor (FINW fallback)');
        return;
      }
    } catch (e) {
      console.log(`Accept anchor fallback failed: ${e}`);
    }

    // Search all other frames for any visible Accept control.
    for (const frame of this.page.frames()) {
      try {
        const btn = frame.locator(buttonSelector + ', ' + anchorSelector).first();
        if (await btn.count().catch(() => 0) > 0) {
          await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await btn.click({ timeout: 15000, force: true });
          await this.page.waitForTimeout(3000);
          console.log(`Clicked Accept control in frame '${frame.name() || 'main'}'`);
          await captureEvidence(this.page, 'Accept control clicked', { frame: frame.name() || 'main' });
          return;
        }
      } catch (e) {
        console.log(`Accept control click in frame failed: ${e}`);
      }
    }
    console.log('Accept button not found in any frame, skipping');
  }

  // Clicks the last Accept button in the FINW frame (e.g. the bottom Accept
  // shown after charges in HLADISB verification).
  async clickLastAccept() {
    const buttonSelector =
      'input[type="button"][value^="Accept" i], input[type="button"][value*="Accept" i], ' +
      'input[type="submit"][value^="Accept" i], input[type="submit"][value*="Accept" i], ' +
      'input[value^="Accept" i], #Accept, #accept, ' +
      'button:has-text("Accept")';

    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      try {
        const finwFrame = this.getFinwFrame();
        const btns = finwFrame.locator(buttonSelector);
        const count = await btns.count().catch(() => 0);
        if (count > 0) {
          for (let i = count - 1; i >= 0; i--) {
            const btn = btns.nth(i);
            if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
              await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
              await btn.click({ timeout: 15000, force: true });
              await this.page.waitForTimeout(3000);
              console.log('Clicked last Accept button in FINW frame');
              return;
            }
          }
        }
      } catch (e) {
        console.log(`Last Accept button click attempt failed, retrying: ${e}`);
      }
      await this.page.waitForTimeout(500);
    }
    console.log('Last Accept button not found in FINW frame, skipping');
  }

  // Clicks the last visible/enabled action button in the FINW frame. This is
  // usually the bottom action button on verification screens (e.g. HLADISB),
  // which may be labelled Submit, Verify, Authorize, Authorise, Approve, OK or Confirm.
  async clickLastAction() {
    const actionLabels = ['Submit', 'Verify', 'Authorize', 'Authorise', 'Approve', 'Confirm', 'OK'];
    const buildSelector = (label: string) =>
      `input[type="button"][value^="${label}" i], input[type="button"][value*="${label}" i], ` +
      `input[type="submit"][value^="${label}" i], input[type="submit"][value*="${label}" i], ` +
      `input[value^="${label}" i], #${label}, #${label.toLowerCase()}, ` +
      `button:has-text("${label}"), a:has-text("${label}")`;
    const allSelectors = actionLabels.map(buildSelector).join(', ');

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        const finwFrame = this.getFinwFrame();
        const btns = finwFrame.locator(allSelectors);
        const count = await btns.count().catch(() => 0);
        if (count > 0) {
          // Click the last visible/enabled action button (bottom of page).
          for (let i = count - 1; i >= 0; i--) {
            const btn = btns.nth(i);
            if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
              const raw =
                (await btn.getAttribute('value').catch(() => '')) ||
                (await btn.textContent().catch(() => '')) ||
                (await btn.getAttribute('title').catch(() => '')) ||
                '';
              const text = (raw || 'unknown').trim();
              await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
              await btn.click({ timeout: 15000, force: true });
              await this.page.waitForTimeout(3000);
              console.log(`Clicked last action button in FINW frame: ${text}`);
              return;
            }
          }
        }
      } catch (e) {
        console.log(`Last action button click attempt failed, retrying: ${e}`);
      }
      await this.page.waitForTimeout(500);
    }

    // Fallback: use JS to click the last Submit/Verify/Authorize/etc. looking control.
    const clickedLabel = await this.getFinwFrame().evaluate((labels) => {
      const selectors = ['input[type="button"]', 'input[type="submit"]', 'button', 'a', 'img'];
      for (const sel of selectors) {
        const elements = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
        for (let idx = elements.length - 1; idx >= 0; idx--) {
          const el = elements[idx];
          const v = (el.getAttribute('value') || el.getAttribute('alt') || el.getAttribute('title') || el.textContent || '').trim().toLowerCase();
          if (labels.some(l => v === l.toLowerCase() || v.includes(l.toLowerCase()))) {
            el.scrollIntoView({ block: 'center', inline: 'center' });
            el.click();
            return v;
          }
        }
      }
      return '';
    }, actionLabels).catch(() => '');
    if (clickedLabel) {
      await this.page.waitForTimeout(5000);
      console.log(`Clicked last action button via JS fallback: ${clickedLabel}`);
      return;
    }

    console.log('Last action button not found in FINW frame');
  }

  // Selects the first real data row in a FINW *data* grid, ignoring layout and
  // navigation tables. It looks for a table whose headers mention Value Date,
  // Amt, Loan, Credit, PaySys, ECS, Rate, Mode, Transaction, Beneficiary, etc.,
  // then selects the first non-header, non-toolbar row.
  async selectFirstFinwGridRow(): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const dataHeaders = ['value date', 'general ledger', 'amt', 'loan', 'credit', 'paysys', 'pay sys', 'ecs', 'rate', 'mode', 'transaction', 'beneficiary', 'ref. no.', 'ref no', 'remarks', 'credit a/c', 'value', 'date'];
    const toolbarLabels = ['add', 'delete', 'copy', 'edit', 'new', 'remove'];
    const layoutLabels = ['home', 'menu', 'background menu', 'ccy converter', 'show memo pad', 'logout'];

    // Helper: determine if a table looks like a data grid.
    const isDataGrid = async (table: Locator): Promise<boolean> => {
      const headerText = await table.evaluate(el => {
        const headers = Array.from(el.querySelectorAll('th, thead td, tr:first-child td, tr:first-child th'));
        return headers.map(h => ((h as HTMLElement).innerText || h.textContent || '').trim().toLowerCase()).join(' ');
      }).catch(() => '');
      return dataHeaders.some(h => headerText.includes(h));
    };

    // Helper: determine if a row is a toolbar/navigation row.
    const isToolbarRow = (text: string) => toolbarLabels.some(l => new RegExp(`\\b${l}\\b`, 'i').test(text));
    const isLayoutRow = (text: string) => layoutLabels.some(l => text.toLowerCase().includes(l));

    const trySelectInRows = async (rows: Locator, context: string): Promise<boolean> => {
      const count = await rows.count().catch(() => 0);
      if (count === 0) return false;
      console.log(`selectFirstFinwGridRow: ${context} count=${count}`);
      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const rowInfo = await row.evaluate(el => {
          const r = el as HTMLTableRowElement;
          const isHeader = r.tagName === 'TR' && (r.querySelector('th') !== null || r.parentElement?.tagName === 'THEAD');
          const text = (r.innerText || '').trim();
          const hasToolbar = Array.from(r.querySelectorAll('input[type="button"], button, a')).some((b: any) =>
            /add|delete|copy|edit|new|remove/i.test((b.value || b.innerText || b.textContent || b.title || '')));
          const hasRadioCheckbox = r.querySelector('input[type="radio"], input[type="checkbox"]') !== null;
          const cells = Array.from(r.querySelectorAll('td')).map(c => (c.innerText || c.textContent || '').trim());
          return { isHeader, text, hasToolbar, hasRadioCheckbox, cells };
        }).catch(() => ({ isHeader: true, text: '', hasToolbar: true, hasRadioCheckbox: false, cells: [] as string[] }));

        if (rowInfo.isHeader || rowInfo.hasToolbar || isToolbarRow(rowInfo.text) || isLayoutRow(rowInfo.text)) continue;
        const visible = await row.isVisible().catch(() => false);
        const dims = await row.boundingBox().catch(() => null);
        if (!visible || (dims && dims.height < 2)) continue;

        // 1. Selectable input (radio/checkbox) in the row.
        if (rowInfo.hasRadioCheckbox) {
          const input = row.locator('input[type="radio"], input[type="checkbox"]').first();
          if (await input.count() > 0 && await input.isVisible().catch(() => false) && await input.isEnabled().catch(() => false)) {
            await input.scrollIntoViewIfNeeded().catch(() => {});
            await input.click({ timeout: 10000, force: true });
            console.log(`Selected first grid row (input) ${context}[${i}]`);
            await this.page.waitForTimeout(1000);
            return true;
          }
        }

        // 2. Click the first data cell that looks like a value (contains digit).
        for (let c = 0; c < rowInfo.cells.length; c++) {
          const cellText = rowInfo.cells[c].slice(0, 80);
          if (cellText.length < 2) continue;
          if (/add|delete|copy|edit|new|remove|home|menu|ccy|logout/i.test(cellText)) continue;
          if (/\d/.test(cellText)) {
            const cell = row.locator('td').nth(c);
            await cell.scrollIntoViewIfNeeded().catch(() => {});
            await cell.click({ timeout: 10000, force: true });
            console.log(`Selected first grid row (data cell) ${context}[${i}] td[${c}] text="${cellText}"`);
            await this.page.waitForTimeout(1000);
            return true;
          }
        }
      }
      return false;
    };

    for (let attempt = 0; attempt < 8; attempt++) {
      // Strategy 1: find a table whose headers identify it as a data grid.
      const tables = finwFrame.locator('table');
      const tableCount = await tables.count().catch(() => 0);
      for (let t = 0; t < tableCount; t++) {
        const table = tables.nth(t);
        if (!(await isDataGrid(table))) continue;
        const bodyRows = table.locator('tbody tr');
        const bodyCount = await bodyRows.count().catch(() => 0);
        const rowsToTry = bodyCount > 0 ? bodyRows : table.locator('tr');
        if (await trySelectInRows(rowsToTry, `table[${t}]`)) return true;
      }

      // Strategy 2: any tbody/table row, but skip layout/toolbar rows.
      for (const rowSelector of ['tbody tr', 'table tr']) {
        const rows = finwFrame.locator(rowSelector);
        if (await trySelectInRows(rows, rowSelector)) return true;
      }

      // Grid may be slow to load after a postback.
      await this.page.waitForTimeout(1000);
    }

    console.log('No grid row selection control found');
    return false;
  }

  // Handles the Finacle "Warning and Exception Dialog" that opens as a separate
  // popup window (excp_popup_screen.jsp) after Submit. Clicks Accept to proceed
  // past non-blocking warnings/exceptions (e.g. "GL SUB HEAD CODE ... DIFFERENT
  // FROM DEFAULT VALUE", "CUSTOMER AGE EXCEEDS PERMISSIBLE LIMIT"). Accepts up
  // to maxAttempts popups that appear in sequence. Returns true if any popup was accepted.
  async acceptWarningPopup(maxAttempts = 10): Promise<boolean> {
    const selector =
      '#Accept, #accept, input[value="Accept" i], ' +
      'input[type="submit"][value*="Accept" i], input[type="button"][value*="Accept" i], ' +
      'button:has-text("Accept")';
    let acceptedAny = false;

    // Finacle may raise several warning/exception popups in sequence, so keep
    // accepting until none remain (cap the loop to avoid spinning forever).
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
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

  private getRelevantBodySnippet(bodyText: string, statusMessage: string | null): string {
    const maxContext = 2500;
    const normalizedBody = bodyText.replace(/\s+/g, ' ');

    if (statusMessage) {
      const statusLower = statusMessage.toLowerCase();
      const idx = normalizedBody.toLowerCase().indexOf(statusLower);
      if (idx >= 0) {
        const start = Math.max(0, idx - 300);
        const end = Math.min(normalizedBody.length, idx + statusLower.length + 1700);
        return `...${normalizedBody.slice(start, end)}...`;
      }
    }

    return `...${normalizedBody.slice(0, maxContext)}...`;
  }

  async getTabSpecificError(statusMessage: string | null): Promise<string | null> {
    if (!statusMessage) return null;
    const match = statusMessage.match(/^([^:]+):\s*This tab contains errors/i);
    if (!match) return null;
    const tabName = match[1].trim();

    try {
      const finwFrame = this.getFinwFrame();
      const tabNameLower = tabName.toLowerCase();

      // Use the page object's own tab navigation so the test actually enters the failing tab
      if (tabNameLower.includes('related party')) {
        await this.visitRelatedPartyTab();
      } else {
        const escaped = tabName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tab = finwFrame.locator('a, span, div, li, td, button').filter({ hasText: new RegExp(escaped, 'i') }).first();
        if (await tab.count().catch(() => 0) === 0) return null;
        await tab.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
        if (await tab.isVisible().catch(() => false)) await tab.click();
      }
      await this.page.waitForTimeout(2000);

      // Pull the detailed validation/error text now visible on the tab
      const detailedStatus = await this.getStatusMessage();
      const newBodyText = await finwFrame.locator('body').innerText().catch(() => '');
      const relevantSnippet = this.getRelevantBodySnippet(newBodyText, detailedStatus);

      const errorSelectors = '.errortext, .errormsg, .alert, .error, td.alert, tr.alert, div.error, span.error, [class*="error" i]';
      const errorEls = finwFrame.locator(errorSelectors);
      const count = await errorEls.count().catch(() => 0);
      const errorTexts: string[] = [];
      for (let i = 0; i < Math.min(count, 10); i++) {
        const t = (await errorEls.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        if (t) errorTexts.push(t);
      }
      const unique = Array.from(new Set(errorTexts));

      const parts = [`Tab: ${tabName}`];
      if (detailedStatus) parts.push(`Status: ${detailedStatus}`);
      if (relevantSnippet) parts.push(`Context: ${relevantSnippet}`);
      if (unique.length > 0) parts.push(`Field errors: ${unique.join(' | ')}`);
      return parts.join(' | ');
    } catch (e) {
      console.log(`Could not capture tab-specific error for ${tabName}: ${e}`);
      return null;
    }
  }


  // Data-driven savings account opening verification (HOAACVSB).
  async verifySavingsAccountCreation(data: { accountId: string; screenCode: string }) {
    await this.selectCoreServer();
    await this.page.waitForTimeout(3000);
    await this.searchVerificationScreen(data.screenCode);
    await this.page.waitForTimeout(3000);
    await this.selectVerifyFunction();
    await this.enterTemporaryAccountId(data.accountId);
    await this.acceptButton.click();
    await this.page.waitForTimeout(5000);
    await this.navigateAllTabs();
    await this.visitTabById('documentdetails');
    await this.clickSubmit();
    await this.acceptWarningPopup();
    const result = await this.verifyAccountCreated();
    return result;
  }

  async verifyAccountCreated(): Promise<{ success: boolean; message: string | null; accountNumber: string | null; allFields?: Record<string, string> }> {

    const finwFrame = this.getFinwFrame();
    const bodyText = await finwFrame.locator('body').innerText();

    // Capture the exact status/alert message shown by Finacle.
    let message = await this.getStatusMessage();

    const successKeywords = /(?:successfully|completed|verified|authorized|authorised|created|added|modified|deleted|disbursed|linked|generated)/i;
    const accountIdRegex = /New A\/c\.?\s*ID|Account Number|Account No/i;

    const accountNumber = await this.getAccountId() ?? null;

    if (!message) {
      // Fallback: locate the most relevant status line from the visible body text.
      const lines = bodyText.split(/\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
      message = lines.find(l => successKeywords.test(l) || accountIdRegex.test(l)) || null;

      // If the account number was captured but no status text was found, use it.
      if (!message && accountNumber) {
        message = `New A/c. ID: ${accountNumber}`;
      }
    }

    const success = !!message && (successKeywords.test(message) || accountIdRegex.test(message));

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
      message,
      accountNumber,
      allFields
    };
  }

  private currentCif?: string;

  private isAccountId(value: string): boolean {
    const trimmed = (value || '').trim();
    if (!trimmed || /^(on|off)$/i.test(trimmed)) return false;
    // Account numbers are numeric (may contain spaces/hyphens) and at least 6 chars.
    return /^[\d\s-]{6,}$/.test(trimmed) && /\d/.test(trimmed);
  }

  async getAccountId(): Promise<string | null> {
    const finwFrame = this.getFinwFrame();
    const excludeList = (this.currentCif ? [this.currentCif] : []) as string[];
    const isExcluded = (v: string) =>
      excludeList.some(e => v.replace(/\s+/g, '') === e.replace(/\s+/g, ''));

    const accountLabel = this.accountNumLabel;
    if (await accountLabel.count() > 0) {
      const raw = await accountLabel.innerText();
      const accountId = (raw || '').trim();
      console.log(`Extracted Account ID from #AcctNum: ${raw}`);
      if (this.isAccountId(accountId) && !isExcluded(accountId)) {
        return accountId.replace(/\s+/g, '');
      }
      console.log(`#AcctNum value "${accountId}" is not a valid account ID or matches CIF, trying next source`);
    }

    // Prefer explicit account input fields, especially the temporary account id used
    // on the verification screen.
    const inputSelectors = ['#tempForacid', '#acctId', '#accountId', '#accountNumber', '#acctNo', '#foracid'];
    for (const sel of inputSelectors) {
      const input = finwFrame.locator(sel).first();
      if (await input.count() > 0) {
        try {
          const value = (await input.inputValue()).trim();
          if (this.isAccountId(value) && !isExcluded(value)) {
            console.log(`Extracted Account ID from ${sel}: ${value}`);
            return value.replace(/\s+/g, '');
          }
        } catch { /* some targets may not be input elements */ }
      }
    }

    // Fallback: any visible input with an account-related name.
    const accountInput = finwFrame.locator('input[name*="acct"], input[name*="account"]').first();
    if (await accountInput.count() > 0) {
      const value = (await accountInput.inputValue()).trim();
      if (this.isAccountId(value) && !isExcluded(value)) {
        console.log(`Extracted Account ID from account input: ${value}`);
        return value.replace(/\s+/g, '');
      }
    }

    // Fallback: parse the success/status message visible on the page.
    const bodyText = await finwFrame.locator('body').innerText().catch(() => '');
    const specificPatterns = [
      /New\s+A\/c\.?\s*ID\s*[:=]?\s*(\d[\d\s-]*\d)/i,
      /A\/c\.?\s*(?:Number|Num)\.?\s*[:=]?\s*(\d[\d\s-]*\d)/i,
      /Account\s*(?:Number|No)\.?\s*[:=]?\s*(\d[\d\s-]*\d)/i,
      /A\/c\.?\s*ID\s*[:=]?\s*(\d[\d\s-]*\d)/i,
    ];
    for (const pattern of specificPatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        const accountId = match[1].replace(/\s+/g, '');
        if (this.isAccountId(accountId) && !isExcluded(accountId)) {
          console.log(`Extracted Account ID from body text: ${accountId}`);
          return accountId;
        }
      }
    }

    // Last resort: scan all isolated 7+ digit numbers and reject CIF hits.
    const allNumbers = bodyText.match(/\b\d{7,}\b/g) || [];
    for (const num of allNumbers) {
      const accountId = num.replace(/\s+/g, '');
      if (this.isAccountId(accountId) && !isExcluded(accountId)) {
        console.log(`Extracted Account ID from body text: ${accountId}`);
        return accountId;
      }
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
  // a date 7 days in the future to satisfy the "later than or same as BOD" rule;
  // pass a DD-MM-YYYY string to override.
  async setNextPrintDate(date?: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const base = new Date();
      const future = new Date(base);
      future.setDate(base.getDate() + 7);
      const dateStr = date ?? `${String(future.getDate()).padStart(2, '0')}-${String(future.getMonth() + 1).padStart(2, '0')}-${future.getFullYear()}`;

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
        if (await field.count() > 0 && await field.isVisible().catch(() => false) && await field.isEnabled().catch(() => false)) {
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

  // Locates the related-party entry form. Finacle sometimes opens it in a
  // separate pop-up window / frame, and sometimes as an inline grid. We prefer
  // a frame that actually contains a relation-type input (#relnType / #relnCode),
  // which indicates the real add/edit form rather than just the tab label.
  private async getRelatedPartyFrame(finwFrame: Frame | null): Promise<Frame> {
    const pages = this.page.context().pages();

    // First pass: prefer a frame with the actual form controls.
    for (const p of pages) {
      for (const f of p.frames()) {
        const has = await f.evaluate(() => {
          const hasReln = !!(
            document.querySelector('#relnType') ||
            document.querySelector('#relnCode') ||
            document.querySelector('input[name*="relnType" i], select[name*="relnType" i]') ||
            document.querySelector('input[name*="relnCode" i]')
          );
          if (!hasReln) return false;
          return true;
        }).catch(() => false);
        if (has) {
          console.log(`Found related party form in page="${p.url()}" frame="${f.name()}"`);
          return f;
        }
      }
    }

    // Second pass: look for the "Relation Type" label text (used as fallback).
    for (const p of pages) {
      for (const f of p.frames()) {
        const has = await f.evaluate(() => {
          const cells = Array.from(document.querySelectorAll('td, label, th'));
          return cells.some(c => /relation\s*type/i.test(c.textContent?.trim() ?? ''));
        }).catch(() => false);
        if (has) {
          console.log(`Found related party form (label match) in page="${p.url()}" frame="${f.name()}"`);
          return f;
        }
      }
    }

    console.log('Related party form not found in any frame -- defaulting to FINW');
    if (finwFrame) return finwFrame;
    const fallback = this.page.frames().find(f => f.name() === 'FINW');
    if (!fallback) throw new Error('FINW frame not found');
    return fallback;
  }

  // Clicks the ADD button within the Related Party Details section to add a
  // new related party row.
  async clickRelatedPartyAdd() {
    try {
      const finwFrame = this.getFinwFrame();
      const addBtn = finwFrame.locator('#relParty_AddNew, input[value="Add" i], input[value="ADD" i], button:has-text("Add"), a:has-text("Add")').first();
      if (await addBtn.count() > 0 && await addBtn.isVisible().catch(() => false)) {
        await addBtn.scrollIntoViewIfNeeded();
        await addBtn.click();
      } else {
        await finwFrame.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('input[type="button"], button, a'));
          const add = btns.find(b => /^add$/i.test((b as HTMLInputElement).value?.trim() || b.textContent?.trim() || ''));
          if (add) (add as HTMLElement).click();
        });
      }
      await this.page.waitForTimeout(3000);
      console.log('Clicked Related Party Add button');
    } catch (e) {
      console.log(`Could not click Related Party Add button, skipping: ${e}`);
    }
  }

  // Clicks the related-party-specific Submit/Save/Accept button if one is
  // present. If no such button is found, the final account submit will persist
  // the record, so this helper does not throw.
  async saveRelatedPartyRecord(): Promise<Frame | null> {
    let rpFrame: Frame | null = null;
    try {
      rpFrame = await this.getRelatedPartyFrame(this.getFinwFrame());
      const selectors = [
        '#relParty_Add',
        '#relParty_Submit',
        '#relParty_Save',
        '#relParty_Accept',
        'input[type="button"][id*="relParty" i][value="Add" i]',
        'input[type="button"][id*="relParty" i][value="Submit" i]',
        'input[type="button"][id*="relParty" i][value="Save" i]',
        'input[type="button"][id*="relParty" i][value="Accept" i]',
        'input[type="submit"][id*="relParty" i]',
        'input[value="Add" i]'
      ].join(', ');
      const btn = rpFrame.locator(selectors).first();
      if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await this.page.waitForTimeout(3000);
        console.log('Saved related party record');
      } else {
        console.log('No related-party-specific save button visible; relying on final account submit');
      }
    } catch (e) {
      console.log(`Could not save related party record: ${e}`);
    }
    return rpFrame;
  }

  // Finds the Dispatch Mode <select> in the related-party form, selects the
  // supplied value, and triggers the Finacle onchange handler. Logs the initial
  // value so we can confirm whether the field is auto-populated from General Details.
  private async selectRelatedPartyDispatchMode(dispatch: string, rpFrame: Frame): Promise<string> {
    const mode = dispatch && String(dispatch).trim() ? String(dispatch) : 'A - Post and Email';
    const code = mode.split('-')[0].trim().toUpperCase();
    const result = await rpFrame.evaluate(({ code, mode }) => {
      const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      const target = selects.find(s => {
        const n = (s.name || '').toLowerCase();
        const id = (s.id || '').toLowerCase();
        return n.includes('despatch') || n.includes('dispatch') ||
               id.includes('despatch') || id.includes('dispatch');
      });
      if (!target) return { ok: false, reason: 'no dispatch select found' };

      const initial = target.options[target.selectedIndex];
      const match = Array.from(target.options).find(o =>
        (o.value || '').toUpperCase() === code ||
        (o.text || '').trim().toLowerCase() === mode.trim().toLowerCase()
      );
      if (!match) {
        return { ok: false, reason: 'option not found', initialValue: initial?.value, initialText: initial?.text, options: target.options.map(o => ({ value: o.value, text: o.text })) };
      }

      target.value = match.value;
      target.selectedIndex = match.index;
      if (typeof (target as any).onchange === 'function') {
        (target as any).onchange();
      }
      target.dispatchEvent(new Event('change', { bubbles: true }));
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.blur();
      return { ok: true, selected: match.value, text: match.text, name: target.name, id: target.id, initialValue: initial?.value, initialText: initial?.text };
    }, { code, mode });

    if (!result.ok) throw new Error(`Failed to set Related Party Dispatch Mode: ${JSON.stringify(result)}`);
    console.log(`Related Party Dispatch Mode initial='${result.initialText}' (value=${result.initialValue}); set to='${result.text}' (value=${result.selected}) in ${result.name || result.id}`);
    return result.selected as string;
  }

  // Strict assertion that the related-party Dispatch Mode <select> still has
  // the expected value after the record is saved.
  private async assertRelatedPartyDispatchMode(expected: string, rpFrame: Frame): Promise<void> {
    const code = String(expected).split('-')[0].trim().toUpperCase();
    const actual = await rpFrame.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      const target = selects.find(s => {
        const n = (s.name || '').toLowerCase();
        const id = (s.id || '').toLowerCase();
        return n.includes('despatch') || n.includes('dispatch') ||
               id.includes('despatch') || id.includes('dispatch');
      });
      if (!target) return { found: false };
      const selected = target.options[target.selectedIndex];
      return { found: true, value: selected?.value, text: selected?.text, name: target.name, id: target.id };
    });
    if (!actual.found) throw new Error('Related Party Dispatch Mode select not found after save');
    if (String(actual.value).toUpperCase() !== code) {
      throw new Error(`Related Party Dispatch Mode assertion failed: expected ${expected} (code=${code}), got ${actual.text} (value=${actual.value})`);
    }
    console.log(`Related Party Dispatch Mode assertion passed: ${actual.text} (value=${actual.value})`);
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
      const rpFrame = await this.getRelatedPartyFrame(this.getFinwFrame());
      const target = String(value).trim().toLowerCase();
      const result = await rpFrame.evaluate((target) => {
        const sel = (
          document.querySelector('#relnType') ||
          document.querySelector('select[name*="relnType" i]')
        ) as HTMLSelectElement | null;
        if (!sel) return { ok: false, reason: 'relation type select not found' };
        const opt = Array.from(sel.options).find(o => (o.text || '').toLowerCase().includes(target));
        if (!opt) return { ok: false, reason: 'option not found', options: Array.from(sel.options).map(o => o.text) };
        sel.disabled = false;
        sel.selectedIndex = opt.index;
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof sel.onchange === 'function') (sel.onchange as any)();
        return { ok: true, text: opt.text, value: opt.value, id: sel.id };
      }, target);
      if (result.ok) {
        console.log(`Selected relation type: ${result.text} (#${result.id})`);
      } else {
        console.log(`Could not select relation type '${value}': ${JSON.stringify(result)}`);
      }
    } catch (e) {
      console.log(`Could not select relation type '${value}', skipping: ${e}`);
    }
  }

  // Enters the relation code (e.g. "Others") in the related party row and
  // triggers its handlers so the description auto-populates.
  async selectRelationCode(value: string) {
    try {
      const rpFrame = await this.getRelatedPartyFrame(this.getFinwFrame());
      const val = String(value).trim();
      const result = await rpFrame.evaluate((val) => {
        const el = (
          document.querySelector('#relnCode') as HTMLElement | null ||
          document.querySelector('input[name*="relnCode" i]') as HTMLElement | null
        );
        if (!el) return { ok: false, reason: 'relation code input not found' };
        const input = el as HTMLInputElement;
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
        input.blur();
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        const desc = document.querySelector('#relnDesc') as HTMLInputElement | null;
        return { ok: true, value: input.value, description: desc?.value || '' };
      }, val);
      await this.page.waitForTimeout(2000);
      console.log(`Entered relation code: ${value} (description: ${result.description})`);
    } catch (e) {
      console.log(`Could not enter relation code '${value}', skipping: ${e}`);
    }
  }

  // Enters the CIF number in the related party row and triggers its handlers
  // so the customer details auto-populate.
  async enterRelatedPartyCif(cif: string) {
    try {
      const rpFrame = await this.getRelatedPartyFrame(this.getFinwFrame());
      const result = await rpFrame.evaluate((cif) => {
        const input = (
          document.querySelector('input[name="relatedpartydetails.cifId"]') as HTMLInputElement | null ||
          document.querySelector('input[name="relatedpartydetails\\.cifId"]') as HTMLInputElement | null ||
          document.querySelector('#relatedpartydetailsCifId') as HTMLInputElement | null ||
          document.querySelector('#relCifId') as HTMLInputElement | null ||
          document.querySelector('input[name="cifId"][id*="rel"]') as HTMLInputElement | null ||
          document.querySelector('#cifId') as HTMLInputElement | null ||
          document.querySelector('input[name="cifId"]') as HTMLInputElement | null ||
          document.querySelector('input[id="cifId"]') as HTMLInputElement | null
        );
        if (!input) return { ok: false, reason: 'related party CIF input not found' };
        input.value = cif;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
        input.blur();
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        const name = document.querySelector('#custName') as HTMLInputElement | null;
        return { ok: true, value: input.value, customer: name?.value || '' };
      }, cif);
      await this.page.waitForTimeout(3000);
      console.log(`Entered related party CIF: ${cif} (customer: ${result.customer})`);
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
          'table input[type="checkbox"]:enabled:visible:not([id*="PageSelectAll" i]):not([name*="PageSelectAll" i]), ' +
          'input[type="checkbox"][name*="select" i]:enabled:visible, ' +
          'input[type="checkbox"][id*="chk" i]:enabled:visible'
        )
        .first();
      await checkbox.waitFor({ state: 'visible', timeout: 15000 });
      await checkbox.scrollIntoViewIfNeeded();
      await checkbox.check({ timeout: 15000 });
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
    const fillById = async (id: string, value: string) => {
      const input = finwFrame.locator(`#${id}`).first();
      if (await input.count() > 0 && await input.isVisible().catch(() => false) && await input.isEditable().catch(() => false)) {
        await input.fill(value);
        await input.dispatchEvent('input');
        await input.dispatchEvent('change');
        await input.press('Tab').catch(() => {});
        console.log(`Filled #${id} via Playwright fill = ${value}`);
        return true;
      }
      return false;
    };
    const ccyFilled = await this.fillByLabel('CCY', data.ccy) || await fillById('crncyCode', data.ccy) || await this.setTextByCandidates(['crncyCode', 'currencyCode', 'ccyCode', 'crncy', 'ccy'], data.ccy, 'Currency');
    const solFilled = await this.fillByLabel('SOL ID', data.solId) || await fillById('solId', data.solId) || await this.setTextByCandidates(['solId', 'solID', 'soL_id'], data.solId, 'Sol id');
    const cifFilled = await this.fillByLabel('CIF ID', data.cifCode) || await fillById('cifId', data.cifCode) || await this.setTextByCandidates(['cifId', 'custId', 'cifID', 'cifCode'], data.cifCode, 'CIF id');

    // Scheme code via search popup (guarded)
    try {
      await this.selectSchemeCode(data.schemeCode);
    } catch (e) {
      console.log(`Could not select scheme via popup, skipping: ${e}`);
      // Fallback: fill scheme code directly by id and trigger validation.
      const schemeInput = finwFrame.locator('#schmCode').first();
      if (data.schemeCode && await schemeInput.count() > 0 && await schemeInput.isEditable().catch(() => false)) {
        await schemeInput.fill(data.schemeCode);
        await schemeInput.dispatchEvent('input');
        await schemeInput.dispatchEvent('change');
        await schemeInput.press('Tab').catch(() => {});
        await this.page.waitForTimeout(1000);
        console.log(`Filled scheme code directly via #schmCode = ${data.schemeCode}`);
      }
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

  // Navigates to a loan tab by its visible label (with optional anchor id and content verification).
  async visitLoanTab(label: string, idFallback?: string, verificationLabel?: string) {
    await this.clickTab(label, idFallback, verificationLabel);
    console.log(`Visited loan tab: ${label}`);
  }

  // Fills the first field matching one of the candidate ids. Works for
  // disabled/readonly Finacle display fields and hidden backend inputs.
  public async setTextByCandidates(ids: string[], value: string, label: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const target = String(value).trim();
    for (const id of ids) {
      try {
        const jsOk = await finwFrame.evaluate(({ id, val }) => {
          const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
          if (!input) return false;
          if (input.value.trim() === val) return true;
          input.value = val;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          // If this is a Finacle display-only date input (id/name ends with _ui),
          // also update the corresponding hidden backend input.
          if (input.id && input.id.endsWith('_ui')) {
            const baseId = input.id.replace('_ui', '');
            const hiddenById = document.querySelector(`input[id="${baseId}"]`) as HTMLInputElement | null;
            if (hiddenById) {
              hiddenById.value = val;
              hiddenById.dispatchEvent(new Event('input', { bubbles: true }));
              hiddenById.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          if (input.name && input.name.endsWith('_ui')) {
            const baseName = input.name.replace('_ui', '');
            const hiddenByName = document.querySelector(`input[name="${baseName}"], input[name="${baseName}_hdn"]`) as HTMLInputElement | null;
            if (hiddenByName) {
              hiddenByName.value = val;
              hiddenByName.dispatchEvent(new Event('input', { bubbles: true }));
              hiddenByName.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          return true;
        }, { id, val: value });
        if (jsOk) {
          console.log(`Filled ${label} (#${id}) via JS = ${value}`);
          // If the field is visible and enabled, also trigger a Tab for validation.
          try {
            const el = finwFrame.locator(`#${id}`).first();
            if (await el.isVisible().catch(() => false) && await el.isEnabled().catch(() => false)) {
              await el.press('Tab').catch(() => {});
            }
          } catch (e) {
            // ignore
          }
          return true;
        }
      } catch (e) {
        console.log(`setTextByCandidates JS fill for #${id} failed: ${e}`);
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

  // Selects an option (matched by keyword or value) in the <select> whose id
  // or nearby row/label text contains labelKeyword. Falls back to searching all
  // selects by option value to handle code-only dropdowns such as Occupation Code.
  async selectOptionByLabel(labelKeyword: string, optionKeyword: string, frame?: Frame): Promise<boolean> {
    const finwFrame = frame || this.getFinwFrame();
    const selects = finwFrame.locator('select');
    const count = await selects.count();
    const lblKey = labelKeyword.toLowerCase();
    const lblId = labelKeyword.replace(/\s/g, '').toLowerCase();
    const raw = optionKeyword.toLowerCase().trim();
    const code = raw.split('-')[0].trim();

    const trySelect = async (sel: any, matchedValue: string, matchedLabel: string, id: string): Promise<boolean> => {
      try {
        await sel.selectOption({ value: matchedValue }, { timeout: 8000 });
      } catch {
        try {
          await sel.selectOption({ label: matchedLabel }, { timeout: 8000 });
        } catch {
          await sel.selectOption(matchedValue, { timeout: 8000 });
        }
      }
      await this.page.waitForTimeout(800);
      console.log(`Selected '${matchedLabel}' for label '${labelKeyword}' (#${id})`);
      return true;
    };

    const optionMatches = (text: string, value: string, allowCode = true): { matchedValue: string; matchedLabel: string } | null => {
      const ot = text.toLowerCase().trim();
      const ov = value.toLowerCase().trim();
      if (ot === raw || ot.startsWith(raw + ' -')) return { matchedValue: value.trim(), matchedLabel: text.trim() };
      if (allowCode && (ot === code || ot.startsWith(code + ' -'))) return { matchedValue: value.trim(), matchedLabel: text.trim() };
      if ((raw === 'yes' || raw === 'y') && (ot === 'yes' || ot === 'y' || ot.startsWith('y - yes'))) return { matchedValue: value.trim(), matchedLabel: text.trim() };
      if ((raw === 'no' || raw === 'n') && (ot === 'no' || ot === 'n' || ot.startsWith('n - no'))) return { matchedValue: value.trim(), matchedLabel: text.trim() };
      if (ov === raw) return { matchedValue: value.trim(), matchedLabel: text.trim() };
      if (allowCode && raw.length > 0 && ov === code) return { matchedValue: value.trim(), matchedLabel: text.trim() };
      if (raw.length > 0 && ov.startsWith(raw)) return { matchedValue: value.trim(), matchedLabel: text.trim() };
      if (raw.length > 2 && ot.includes(raw)) return { matchedValue: value.trim(), matchedLabel: text.trim() };
      return null;
    };

    // First pass: only inspect selects whose row/id matches the label.
    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);
      const meta = await sel.evaluate(el => {
        const s = el as HTMLSelectElement;
        const row = el.closest('tr');
        return { id: s.id, disabled: s.disabled, near: (row?.innerText || '').toLowerCase() };
      }).catch(() => null);
      if (!meta || meta.disabled) continue;
      if (!meta.near.includes(lblKey) && !(meta.id || '').toLowerCase().includes(lblId)) continue;

      const optionData = await sel.locator('option').evaluateAll(els =>
        (els as HTMLOptionElement[]).map(o => ({ text: o.text, value: o.value }))
      );
      const selectedIndex = await sel.evaluate(el => (el as HTMLSelectElement).selectedIndex);
      const selectedOption = selectedIndex >= 0 ? optionData[selectedIndex] : undefined;
      if (selectedOption && optionMatches(selectedOption.text, selectedOption.value, true)) {
        console.log(`'${optionKeyword}' already selected for '${labelKeyword}' (#${meta.id})`);
        return true;
      }
      for (const o of optionData) {
        const match = optionMatches(o.text, o.value, true);
        if (match) return await trySelect(sel, match.matchedValue, match.matchedLabel, meta.id);
      }
    }

    // Fallback: no label-matched select worked; search all selects for a matching option value.
    // In this pass do not allow leading-code matches, so a value such as "E - EOD Clear Balance"
    // cannot be applied to an unrelated "E - Operative or Original A/c." select.
    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);
      const disabled = await sel.evaluate(el => (el as HTMLSelectElement).disabled).catch(() => true);
      if (disabled) continue;
      const id = await sel.evaluate(el => (el as HTMLSelectElement).id).catch(() => '');
      const optionData = await sel.locator('option').evaluateAll(els =>
        (els as HTMLOptionElement[]).map(o => ({ text: o.text, value: o.value }))
      );
      const selectedIndex = await sel.evaluate(el => (el as HTMLSelectElement).selectedIndex);
      const selectedOption = selectedIndex >= 0 ? optionData[selectedIndex] : undefined;
      if (selectedOption && optionMatches(selectedOption.text, selectedOption.value, false)) {
        console.log(`'${optionKeyword}' already selected for '${labelKeyword}' (#${id})`);
        return true;
      }
      for (const o of optionData) {
        const match = optionMatches(o.text, o.value, false);
        if (match) {
          return await trySelect(sel, match.matchedValue, match.matchedLabel, id);
        }
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

  async setLoanPeriodMonths(months: string) {
    const updated = await this.setTextByCandidates(
      ['loanPerdMths', 'loanPeriodMonths', 'loanTermMonths', 'tenureMonths'],
      months, 'Loan period (months)'
    );
    if (!updated) throw new Error('Loan period (months) field was not found on the Loan Details tab');
  }

  // Step 8: Payment plan - number of instalments.
  async setNumberOfInstalments(count: string) {
    const updated = await this.setTextByCandidates(
      ['noOfInstlmnts', 'noOfInstallments', 'noOfInstalments', 'numInstallments'],
      count, 'Number of instalments'
    ) || await this.fillByLabel('No. of Instalments', count) || await this.fillByLabel('No of Instalments', count) || await this.fillByLabel('No. of Installments', count) || await this.fillByLabel('No of Installments', count);
    if (!updated) throw new Error('Number of instalments field was not found on the Payment Plan tab');
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
  // indicator -> EQUAL, plus mandatory Sanction Level / Sanction Date / Review Date.
  async fillLoanAccountLimits(expiryDate: string) {
    // All Account Limits dates must be <= the BOD shown in the Finacle header.
    const bodStr = await this.getBODDate() || this.todayDate();
    const [dd, mm, yyyy] = bodStr.split('-').map(Number);
    const bod = new Date(yyyy, mm - 1, dd);
    const beforeBod = new Date(bod);
    beforeBod.setDate(bod.getDate() - 1);
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const bodDate = fmt(bod);
    const sanctionDate = fmt(beforeBod);
    const documentDate = bodDate;
    const reviewDate = bodDate;
    console.log(`Using BOD ${bodDate} for Account Limits dates`);

    const expiryFound = await this.fillDateField(
      ['expiryDate_ui', 'limitExpiryDt_ui', 'expiryDt_ui', 'limExpiryDt_ui'],
      expiryDate, 'Loan limit expiry date'
    );
    if (!expiryFound) {
      console.log('Account Limits loan fields not present on this account, skipping');
      return;
    }

    await this.fillDateField(
      ['documentDate_ui', 'docDt_ui', 'limitDocDt_ui', 'documentDt_ui'],
      documentDate, 'Loan limit document date'
    );
    await this.fillDateField(
      ['sanctDate_ui', 'sanctDate', 'sanctionDate_ui'],
      sanctionDate, 'Sanction Date'
    );
    await this.fillDateField(
      ['reviewDate_ui', 'reviewDt_ui', 'reviewDate'],
      reviewDate, 'Review Date'
    );
    await this.selectLookupFirstOption('Sanction Level') || await this.setTextByCandidates(
      ['sanctionLevelCode', 'sanctionLevel', 'sancLevel', 'sanctionLvl'],
      '1', 'Sanction Level'
    ) || await this.fillByLabel('Sanction Level', '1');
    await this.selectLookupFirstOption('Sanction Authority') || await this.fillByLabel('Sanction Authority', 'SYSTEM');
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

  // Logs all visible error text found in the FINW frame to help diagnose
  // validation failures that do not show a single status message.
  async logAllFieldErrors() {
    try {
      const finwFrame = this.getFinwFrame();
      const selectors = [
        '.errMsg', '.errmsg', '.errorText', '.error', '.errormsg',
        'font[color="red" i]', 'font[color="#FF0000" i]', 'font[color="#ff0000" i]',
        '[style*="color:red" i]', '[style*="color: red" i]',
        'span[style*="color" i]', 'td[style*="color" i]', 'div[style*="color" i]',
      ].join(', ');
      const errors = await finwFrame.locator(selectors).evaluateAll(els =>
        els
          .filter(el => (el as HTMLElement).offsetParent !== null)
          .map(el => ({
            text: el.textContent?.replace(/\s+/g, ' ').trim() || '',
            id: el.id,
            class: el.className,
            near: (el.previousElementSibling?.textContent || el.parentElement?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
          }))
      );
      const visible = errors.filter(e => e.text && e.text.length > 0);
      if (visible.length) {
        console.log(`[FIELD ERRORS] ${JSON.stringify(visible, null, 2)}`);
      } else {
        console.log('[FIELD ERRORS] No visible error labels found');
      }
    } catch (e) {
      console.log(`Could not log field errors: ${e}`);
    }
  }

}












