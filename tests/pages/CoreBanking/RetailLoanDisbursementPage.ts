import { Page } from '@playwright/test';
import { AccountPage } from './AccountPage';

export interface RetailLoanDisbursementData {
  loanAccountNumber: string;
  transactionType?: string;
  modeOfDisbursement?: string;
  disbursementAmount?: string;
  partial?: boolean;
  functionOption?: string;
}

export class RetailLoanDisbursementPage extends AccountPage {
  constructor(page: Page) {
    super(page);
  }

  private async selectTransactionTypeRadio(type: string) {
    const finwFrame = this.getFinwFrame();
    const typeLower = type.toLowerCase();

    // 1. Try Playwright's getByLabel (associated <label for> or aria-label).
    const labelLoc = finwFrame.getByLabel(type, { exact: false }).or(finwFrame.getByLabel(type.charAt(0).toUpperCase() + type.slice(1), { exact: false })).locator('input[type="radio"]').first();
    if (await labelLoc.count() > 0) {
      await labelLoc.check({ timeout: 10000 });
      console.log(`Selected transaction type via getByLabel: ${type}`);
      return;
    }

    // 2. Click the visible label text directly (avoids stale/ambiguous cell text).
    const labelByText = finwFrame.locator('label, span, td, div').filter({ hasText: new RegExp(`^\\s*${type}\\s*$`, 'i') }).first();
    if (await labelByText.count() > 0 && await labelByText.isVisible().catch(() => false)) {
      await labelByText.click({ timeout: 10000 });
      console.log(`Selected transaction type by clicking label: ${type}`);
      return;
    }

    // 3. Select by the radio's value (e.g. T for transfer).
    const radio = finwFrame.locator('input[type="radio"][value="T" i], input[type="radio"][value="Transfer" i]').first();
    if (await radio.count() > 0) {
      await radio.check({ timeout: 10000 });
      console.log(`Selected transaction type by value: ${type}`);
      return;
    }

    // 4. Last resort: DOM evaluate, matching exact label/value only.
    const selected = await finwFrame.evaluate((t) => {
      const tLower = t.toLowerCase();
      const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      for (const r of radios) {
        if (r.disabled) continue;
        const label = r.id ? (document.querySelector(`label[for="${r.id}"]`) as HTMLElement | null) : null;
        const labelText = label ? (label.innerText || '').trim() : (r.closest('label') as HTMLElement | null)?.innerText?.trim() || '';
        const valueText = (r.value || '').trim().toLowerCase();
        if (labelText.toLowerCase() === tLower || valueText === tLower || (tLower === 'transfer' && (valueText === 't' || valueText.startsWith('t')))) {
          r.checked = true;
          r.dispatchEvent(new Event('change', { bubbles: true }));
          r.dispatchEvent(new Event('click', { bubbles: true }));
          return { id: r.id, name: r.name, value: r.value, label: labelText };
        }
      }
      return null;
    }, type);

    if (selected) {
      console.log(`Selected transaction type radio: ${JSON.stringify(selected)}`);
      return;
    }

    const dropdownSelected = await this.selectOptionByLabel('Transaction Type', type);
    if (dropdownSelected) {
      console.log(`Selected transaction type dropdown: ${type}`);
      return;
    }

    console.log(`Could not select transaction type: ${type}`);
  }

  private async selectModeOfDisbursement(mode: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const modeLower = mode.toLowerCase();

    // 1. Native <select> (visible or hidden) whose options contain the mode.
    const selects = finwFrame.locator('select');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);
      const options = await sel.evaluate((el) =>
        Array.from((el as HTMLSelectElement).options).map((o, idx) => ({ index: idx, text: o.text, value: o.value }))
      );
      const normalize = (s: string) => s.toLowerCase().replace(/[\s.]/g, '');
      const modeNorm = normalize(mode);
      const option = options.find(o => normalize(o.text).includes(modeNorm) || o.text.toLowerCase().includes(modeLower));
      if (option) {
        try {
          await sel.selectOption({ label: option.text }, { timeout: 8000 });
        } catch {
          try {
            await sel.selectOption({ index: option.index }, { timeout: 8000 });
          } catch {
            await sel.evaluate((el, idx) => { (el as HTMLSelectElement).selectedIndex = idx; }, option.index);
          }
        }
        await sel.dispatchEvent('change');
        await this.page.waitForTimeout(1000);
        console.log(`Selected mode of disbursement '${option.text}' (#${await sel.getAttribute('id') || 'select'} value=${option.value})`);
        return true;
      }
    }

    // 2. Custom dropdown: click the field labelled 'Mode of Disbursement', then click the option.
    const row = finwFrame.locator('tr, div, li').filter({ hasText: /Mode of Disbursement/i }).first();
    const field = row.locator('input[type="text"], input:not([type]), select, button, div, span').first();
    if (await field.count() > 0 && await field.isVisible().catch(() => false)) {
      await field.click({ timeout: 10000 });
      await this.page.waitForTimeout(800);
      const option = finwFrame.locator('li, div, span, a').filter({ hasText: /A\/C\.?\s+Transfer/i }).first();
      if (await option.count() > 0 && await option.isVisible().catch(() => false)) {
        await option.click({ timeout: 10000 });
        await this.page.waitForTimeout(1000);
        console.log('Selected a/c transfer from custom dropdown');
        return true;
      }
    }

    return false;
  }

  private async clickGoButton() {
    const finwFrame = this.getFinwFrame();
    const selectors = [
      'input[type="button"][value="Go" i]',
      'input[type="submit"][value="Go" i]',
      '#Go',
      'button:has-text("Go")'
    ];
    for (const sel of selectors) {
      const loc = finwFrame.locator(sel).first();
      if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
        await loc.scrollIntoViewIfNeeded();
        await loc.click({ timeout: 10000 });
        console.log(`Clicked Go button (${sel})`);
        return;
      }
    }
    console.log('Go button not found or not visible');
    await this.dumpFinwElements('clickGoButton');
  }

  private async clickAddForDisbursementDetails() {
    const finwFrame = this.getFinwFrame();
    const selectors = [
      '#laDisbDet_AddNew',
      'input[type="button"][value="Add" i]',
      'input[type="submit"][value="Add" i]',
      'button:has-text("Add")'
    ];
    for (const sel of selectors) {
      const loc = finwFrame.locator(sel).first();
      if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
        await loc.scrollIntoViewIfNeeded();
        await loc.click({ timeout: 10000 });
        console.log(`Clicked Add for disbursement details (${sel})`);
        return;
      }
    }
    console.log('Add button for disbursement details not found or not visible');
  }

  private async handleAccountValidationPopup() {
    try {
      const deadline = Date.now() + 10000;
      let popup: import('@playwright/test').Page | null = null;
      while (Date.now() < deadline) {
        for (const p of this.page.context().pages()) {
          if (p === this.page || p.isClosed()) continue;
          if (/VALACCTID|foracid|acctid|accountid|ladisb|validation/i.test(p.url())) { popup = p; break; }
        }
        if (popup) break;
        await this.page.waitForTimeout(500);
      }
      if (!popup || popup.isClosed()) return;

      const bodyText = (await popup.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 300);
      if (popup.isClosed()) return;

      let buttons: any[] = [];
      try {
        buttons = await popup.locator('input[type="button"], input[type="submit"], button, a').evaluateAll((els: any[]) =>
          els.filter(e => e.id || e.name || (e.value || '').toString().trim() || (e.innerText || e.textContent || '').toString().trim())
            .map(e => ({ tag: e.tagName, id: e.id, name: e.name, type: e.type || '', value: (e.value || '').toString().trim().slice(0, 50), text: (e.innerText || e.textContent || '').toString().trim().slice(0, 50) }))
        );
      } catch {
        // Popup may have closed while reading buttons.
      }
      console.log(`Account validation popup body: ${bodyText}`);
      console.log(`Account validation popup buttons: ${JSON.stringify(buttons)}`);

      if (popup.isClosed()) return;

      const cancelSel = 'input[type="button"][value*="Cancel" i], input[type="submit"][value*="Cancel" i], #Cancel, #cancel, button:has-text("Cancel"), a:has-text("Cancel"), input[type="button"][value*="Close" i], input[type="submit"][value*="Close" i], #Close, #close, button:has-text("Close"), a:has-text("Close")';
      const cancel = popup.locator(cancelSel).first();
      if (await cancel.count() > 0 && await cancel.isVisible().catch(() => false)) {
        await cancel.click({ timeout: 10000 }).catch(() => {});
        console.log('Clicked Cancel/Close on account validation popup');
      } else {
        await popup.close().catch(() => {});
        console.log('Closed account validation popup');
      }
      await this.page.waitForTimeout(3000);
    } catch (e) {
      console.log(`handleAccountValidationPopup encountered an issue: ${e}`);
    }
  }

  private async dumpFinwElements(context: string) {
    try {
      const finwFrame = this.getFinwFrame();
      const elements = await finwFrame.evaluate(() => {
        const out: any[] = [];
        const tags = ['input', 'button', 'select', 'a', 'img', 'textarea'];
        tags.forEach(tag => {
          document.querySelectorAll(tag).forEach((el: any) => {
            const value = (el.value || '').toString().slice(0, 80);
            const text = (el.innerText || el.textContent || '').toString().slice(0, 80).trim();
            if (el.id || el.name || value || text) {
              out.push({
                tag: el.tagName.toLowerCase(),
                id: el.id || '',
                name: el.name || '',
                type: el.type || '',
                value,
                text,
                title: el.title || '',
                src: el.src || ''
              });
            }
          });
        });
        return out;
      });
      console.log(`--- FINW elements dump [${context}] (count: ${elements.length}) ---`);
      for (const el of elements.slice(0, 60)) {
        console.log(JSON.stringify(el));
      }
      console.log('--- end dump ---');
    } catch (e) {
      console.log(`Could not dump FINW elements: ${e}`);
    }
  }

  private async handleSanctionLimitDialog() {
    const acceptSelector = 'input[type="button"][value*="Accept" i], input[type="submit"][value*="Accept" i], #Accept, #accept, a:has-text("Accept")';
    // Accept any already-open popup that looks like a sanction/disbursed limit warning.
    for (const p of this.page.context().pages()) {
      if (p === this.page || p.isClosed()) continue;
      const text = (await p.locator('body').innerText().catch(() => '')).toLowerCase();
      if (text.includes('sanction') || text.includes('disbursed amount') || text.includes('exceeds')) {
        const accept = p.locator(acceptSelector).first();
        if (await accept.count() > 0 && await accept.isVisible().catch(() => false)) {
          await accept.click({ timeout: 10000 });
          console.log('Accepted existing sanction-limit popup');
          await this.page.waitForTimeout(1500);
        }
      }
    }
    // Also wait briefly for a popup that may open right now.
    const popup = await this.page.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
    if (popup && !popup.isClosed()) {
      const text = (await popup.locator('body').innerText().catch(() => '')).toLowerCase();
      if (text.includes('sanction') || text.includes('disbursed amount') || text.includes('exceeds')) {
        const accept = popup.locator(acceptSelector).first();
        if (await accept.count() > 0 && await accept.isVisible().catch(() => false)) {
          await accept.click({ timeout: 10000 });
          console.log('Accepted sanction-limit popup');
        }
      }
      await this.page.waitForTimeout(1500);
    }
  }

  private async waitForAccountFetchPopup() {
    try {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        let fetchPopup: import('@playwright/test').Page | null = null;
        for (const p of this.page.context().pages()) {
          if (p === this.page || p.isClosed()) continue;
          if (/LOANACCTFETCH|LOANACCT|loanacct|loan_account/i.test(p.url())) { fetchPopup = p; break; }
        }
        if (!fetchPopup) {
          console.log('No loan account fetch popup found/open');
          return;
        }
        if (fetchPopup.isClosed()) {
          console.log('Loan account fetch popup already closed');
          return;
        }
        console.log(`Waiting for loan account fetch popup to close: ${fetchPopup.url().slice(-70)}`);
        try {
          await fetchPopup.waitForEvent('close', { timeout: 5000 });
          console.log('Loan account fetch popup closed');
          await this.page.waitForTimeout(1500);
          return;
        } catch {
          // still open, continue polling
        }
        await this.page.waitForTimeout(500);
      }
      console.log('Timeout waiting for loan account fetch popup; attempting force-close');
      for (const p of this.page.context().pages()) {
        if (p === this.page || p.isClosed()) continue;
        if (/LOANACCTFETCH|LOANACCT|loanacct|loan_account/i.test(p.url())) {
          await p.close().catch(() => {});
          console.log('Force-closed loan account fetch popup');
        }
      }
      await this.page.waitForTimeout(1500);
    } catch (e) {
      console.log(`waitForAccountFetchPopup encountered an issue: ${e}`);
    }
  }

  private async getDisbursementAmount(): Promise<string | null> {
    const finwFrame = this.getFinwFrame();
    const labels = ['Disbursement Amt.', 'Disbursement Amt', 'Disbursement Amount'];
    const candidateIds = ['disbAmt', 'disbursementAmt', 'disbursementAmount', 'disbAmount', 'disb_amt', 'laDisbAmt', 'reqDisbAmt', 'disbursedAmt', 'ladisb.disbAmt'];
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      for (const label of labels) {
        const value = await this.getValueByAmountLabel(label);
        if (value) {
          const num = parseFloat(value.replace(/,/g, ''));
          if (!isNaN(num) && num > 0) return value;
        }
      }
      const byId = await finwFrame.evaluate((ids) => {
        for (const id of ids) {
          const el = document.getElementById(id) as HTMLInputElement | null || document.querySelector(`input[name*="${id}" i]`) as HTMLInputElement | null;
          if (el?.value) return el.value.trim();
        }
        return null;
      }, candidateIds).catch(() => null);
      if (byId) {
        const num = parseFloat(byId.replace(/,/g, ''));
        if (!isNaN(num) && num > 0) return byId;
      }
      await this.page.waitForTimeout(500);
    }
    return null;
  }

  private async getValueByAmountLabel(labelText: string): Promise<string | null> {
    const finwFrame = this.getFinwFrame();
    const value = await finwFrame.evaluate(({ label }) => {
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const labelLower = normalize(label);
      const cells = Array.from(document.querySelectorAll<HTMLElement>('td, th, label, div, span, p'));
      const labelCell = cells.find(el => {
        const t = normalize(el.textContent || '');
        return t.startsWith(labelLower);
      });
      if (!labelCell) return null;
      let containingCell: HTMLElement | null = labelCell;
      while (containingCell && containingCell.tagName !== 'TD' && containingCell.tagName !== 'TH' && containingCell.tagName !== 'BODY') {
        containingCell = containingCell.parentElement as HTMLElement | null;
      }
      let valueCell: HTMLElement | null = null;
      if (containingCell && (containingCell.tagName === 'TD' || containingCell.tagName === 'TH')) {
        valueCell = containingCell.nextElementSibling as HTMLElement | null;
        if (!valueCell) {
          const row = containingCell.closest('tr');
          if (row) {
            const children = Array.from(row.children) as HTMLElement[];
            const idx = children.indexOf(containingCell);
            if (idx >= 0 && children.length > idx + 1) valueCell = children[idx + 1];
          }
        }
      }
      if (valueCell) {
        const input = valueCell.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null;
        if (input) return (input.value || '').trim();
        return (valueCell.innerText || valueCell.textContent || '').trim();
      }
      const forAttr = labelCell.getAttribute('for');
      if (forAttr) {
        const el = document.getElementById(forAttr) as HTMLInputElement | null;
        if (el) return (el.value || '').trim();
      }
      let sibling = labelCell.nextElementSibling;
      while (sibling) {
        const input = sibling.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null;
        if (input) return (input.value || '').trim();
        const siblingText = (sibling.textContent?.trim() || '') || (sibling as HTMLElement).innerText?.trim();
        if (siblingText) return siblingText;
        sibling = sibling.nextElementSibling;
      }
      return null;
    }, { label: labelText }).catch(() => null);
    return value ?? null;
  }

  async createDisbursement(data: RetailLoanDisbursementData): Promise<{ message: string | null; screenshot: Buffer }> {
    console.log(`Starting HLADISB disbursement creation for loan: ${data.loanAccountNumber}`);

    await this.selectCoreServer();
    await this.searchMenu('HLADISB');
    await this.page.waitForTimeout(3000);

    const selectedFunction = data.functionOption ?? 'Disbursement';
    console.log(`Selecting ${selectedFunction} function...`);
    await this.selectFunction(selectedFunction);
    await this.page.waitForTimeout(2000);

    console.log('Entering loan account id...');
    const accountFilled = await this.fillByLabel('A/c Id', data.loanAccountNumber);
    if (!accountFilled) {
      await this.enterHacmAccountId(data.loanAccountNumber);
    }

    console.log('Handling account validation popup...');
    await this.handleAccountValidationPopup();
    await this.waitForAccountFetchPopup();

    let disbursementAmount: string | undefined = data.disbursementAmount;
    if (data.partial && !disbursementAmount) {
      console.log('Reading auto-populated disbursement amount for partial disbursement...');
      const fullAmount = await this.getDisbursementAmount();
      if (fullAmount) {
        const numeric = parseFloat(fullAmount.replace(/,/g, ''));
        if (!isNaN(numeric)) {
          disbursementAmount = (numeric / 2).toFixed(2);
          console.log(`Auto Disbursement Amt: ${fullAmount} -> partial half: ${disbursementAmount}`);
        } else {
          throw new Error(`Could not parse auto-populated Disbursement Amount: ${fullAmount}`);
        }
      } else {
        throw new Error('Auto-populated Disbursement Amount not found for partial disbursement');
      }
    }

    const transactionType = data.transactionType ?? 'Transfer';
    console.log(`Selecting transaction type: ${transactionType}`);
    await this.selectTransactionTypeRadio(transactionType);

    if (disbursementAmount) {
      console.log(`Clearing and entering disbursement amount: ${disbursementAmount}`);
      const amountLabels = ['Disbursement Amt.', 'Disbursement Amt', 'Disbursement Amount'];
      let amountFilled = false;
      for (const label of amountLabels) {
        amountFilled = await this.fillByLabel(label, disbursementAmount);
        if (amountFilled) break;
      }
      if (!amountFilled) {
        console.error('Could not fill Disbursement Amt. by label; trying direct row fallback');
        const finwFrame = this.getFinwFrame();
        const row = finwFrame.locator('tr').filter({ hasText: /(?<!Partial\s)Disbursement\s*Amt/i }).first();
        const input = row.locator('input[type="text"], input:not([type])').first();
        if (await input.count() > 0 && await input.isEditable().catch(() => false)) {
          await input.fill(disbursementAmount);
          await input.blur();
          amountFilled = true;
        }
      }
      if (!amountFilled) {
        throw new Error(`Could not set Disbursement Amount to ${disbursementAmount}`);
      }
      await this.page.waitForTimeout(500);
    }

    await this.handleSanctionLimitDialog();

    console.log('Clicking Accept...');
    await this.clickAccept();
    await this.page.waitForTimeout(4000);

    console.log('Clicking Go...');
    await this.clickGoButton();
    await this.page.waitForTimeout(3000);

    console.log('Clicking Accept on charges...');
    await this.clickAccept();
    await this.page.waitForTimeout(3000);

    const mode = data.modeOfDisbursement ?? 'a/c transfer';
    console.log(`Selecting mode of disbursement: ${mode}`);
    const modeSelected = await this.selectModeOfDisbursement(mode);
    if (!modeSelected) {
      console.log('Mode of disbursement not selected; dumping FINW controls');
      await this.dumpFinwElements('selectModeOfDisbursement');
    }

    console.log('Clicking Accept before submit...');
    await this.clickAccept();
    await this.page.waitForTimeout(2000);

    console.log('Clicking Submit...');
    await this.clickSubmit();
    await this.acceptWarningPopup();

    let message = await this.getStatusMessage();
    if (!message) {
      for (const frame of this.page.frames()) {
        const bodyText = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        const successMatch = bodyText.match(/[^.!?]*(?:done|completed|submitted|disbursed|verified|created|added)\s+successfully[^.!?]*(?:[.!?]|$)/i)
          || bodyText.match(/[^.!?]*\bsuccessful(?:ly)?\b[^.!?]*(?:[.!?]|$)/i);
        if (successMatch) {
          message = successMatch[0].trim();
          break;
        }
      }
    }
    const screenshot = await this.page.screenshot({ fullPage: true });
    console.log(`Disbursement creation message: ${message}`);
    return { message, screenshot };
  }

  async verifyDisbursement(data: RetailLoanDisbursementData): Promise<{ message: string | null; screenshot: Buffer; transactionId: string | null; transactionDate: string | null }> {
    console.log(`Starting HLADISB disbursement verification for loan: ${data.loanAccountNumber}`);

    // 1. Login is handled by the calling spec with a different user.
    await this.selectCoreServer();

    // 2. Type menu option "HLADISB".
    console.log('Searching for HLADISB menu...');
    await this.searchMenu('HLADISB');
    await this.page.waitForTimeout(3000);

    // 3. Transaction type -- Select transfer.
    const transactionType = data.transactionType ?? 'Transfer';
    console.log(`Selecting transaction type: ${transactionType}`);
    await this.selectTransactionTypeRadio(transactionType);
    await this.page.waitForTimeout(1000);

    // 3. Function - V-Verify.
    console.log('Selecting Verify function...');
    await this.selectFunction('Verify');
    await this.page.waitForTimeout(2000);

    // 4. Enter loan a/c id, click Accept.
    console.log(`Entering loan account id: ${data.loanAccountNumber}`);
    const accountFilled = await this.fillByLabel('A/c Id', data.loanAccountNumber);
    if (!accountFilled) {
      await this.enterHacmAccountId(data.loanAccountNumber);
    } else {
      // Trigger the account-validation lookup.
      await this.enterHacmAccountId(data.loanAccountNumber);
    }

    console.log('Clicking Accept...');
    await this.clickAccept();
    await this.page.waitForTimeout(4000);

    // 5. Click go, click accept.
    console.log('Clicking Go...');
    await this.clickGo();
    await this.page.waitForTimeout(3000);

    console.log('Clicking Accept...');
    await this.clickAccept();
    await this.page.waitForTimeout(3000);

    // 6. Click accept, click submit.
    console.log('Clicking Accept...');
    await this.clickAccept();
    await this.page.waitForTimeout(3000);

    console.log('Clicking Submit...');
    await this.clickSubmit();
    await this.acceptWarningPopup();

    // 7. Capture the disbursement done successfully message.
    const message = await this.getStatusMessage();
    const screenshot = await this.page.screenshot({ fullPage: true });
    console.log(`Disbursement verification message: ${message}`);

    const finwFrame = this.getFinwFrame();
    const pageText = await finwFrame.locator('body').innerText().catch(() => '') || '';
    const transactionId = this.extractTransactionId(message) || this.extractTransactionId(pageText);
    const transactionDate = this.extractTransactionDate(message) || this.extractTransactionDate(pageText) || this.collateralToday();

    console.log('Captured transaction ID:', transactionId ?? 'NOT CAPTURED');
    console.log('Captured transaction date:', transactionDate ?? 'NOT CAPTURED');

    return { message, screenshot, transactionId, transactionDate };
  }

  private extractTransactionId(text: string | null): string | null {
    if (!text) return null;
    const match = text.match(/(?:Transaction\s*(?:Id|No|#)?|Tran\s*Id|Transaction\s*Ref)\s*[:\s]*([A-Z0-9]{4,})/i)
      ?? text.match(/\b([A-Z]{2,}\d{2,})\b/);
    return match ? match[1] : null;
  }

  private extractTransactionDate(text: string | null): string | null {
    if (!text) return null;
    const match = text.match(/(?:Transaction\s*Date|Tran\s*Date|Txn\s*Date)\s*[:\s]*(\d{2}-\d{2}-\d{4})/i)
      ?? text.match(/\b(\d{2}-\d{2}-\d{4})\b/);
    return match ? match[1] : null;
  }
}
