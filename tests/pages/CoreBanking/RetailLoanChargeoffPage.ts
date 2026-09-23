import { Page } from '@playwright/test';
import { AccountPage } from './AccountPage';

export interface RetailLoanChargeoffData {
  loanAccountNumber: string;
}

export class RetailLoanChargeoffPage extends AccountPage {
  constructor(page: Page) {
    super(page);
  }

  async performChargeoff(data: RetailLoanChargeoffData): Promise<{ message: string | null; transactionId: string | null }> {
    console.log(`Starting HCOLA chargeoff for loan: ${data.loanAccountNumber}`);

    await this.selectCoreServer();
    console.log('Searching for HCOLA menu...');
    await this.searchMenu('HCOLA');
    await this.page.waitForTimeout(3000);

    console.log('Selecting function: Chargeoff');
    await this.selectFunction('Chargeoff');
    await this.page.waitForTimeout(1000);

    console.log(`Entering loan account id: ${data.loanAccountNumber}`);
    const accountFilled = await this.fillByLabel('A/c Id', data.loanAccountNumber);
    if (!accountFilled) {
      await this.enterHacmAccountId(data.loanAccountNumber);
    } else {
      await this.pressTabOnInputByLabel('A/c Id');
    }
    await this.page.waitForTimeout(3000);

    console.log('Selecting chargeoff mode: Full');
    await this.selectChargeoffMode('Full');
    await this.page.waitForTimeout(1000);

    console.log('Selecting reason code: Others / 999');
    await this.selectReasonCode('999', 'Others');
    await this.page.waitForTimeout(1000);

    console.log('Clicking Go to fetch chargeoff details...');
    await this.clickGo();
    await this.page.waitForTimeout(3000);

    console.log('Clicking Accept to load chargeoff details...');
    await this.clickAccept();
    await this.page.waitForTimeout(3000);

    console.log('Clicking Submit to finalize chargeoff...');
    await this.clickSubmit();
    await this.page.waitForTimeout(5000);

    const finwFrame = this.getFinwFrame();
    const pageText = (await finwFrame.locator('body').innerText().catch(() => '')) || '';

    const message = await this.getStatusMessage();
    const successMessage = this.extractSuccessMessage(pageText) || message;
    console.log(`Chargeoff success statement: ${successMessage ?? 'NOT FOUND'}`);

    return { message, transactionId: null };
  }

  async verifyChargeoff(data: RetailLoanChargeoffData): Promise<{ message: string | null; transactionId: string | null }> {
    console.log(`Starting HCOLA chargeoff verification for loan: ${data.loanAccountNumber}`);

    await this.selectCoreServer();
    await this.searchMenu('HCOLA');
    await this.page.waitForTimeout(3000);

    console.log('Selecting function: Verify');
    await this.selectFunction('Verify');
    await this.page.waitForTimeout(1000);

    console.log(`Entering loan account id: ${data.loanAccountNumber}`);
    const accountFilled = await this.fillByLabel('A/c Id', data.loanAccountNumber);
    if (!accountFilled) {
      await this.enterHacmAccountId(data.loanAccountNumber);
    }
    await this.page.waitForTimeout(2000);

    console.log('Clicking Go to load verification details...');
    await this.clickGo();
    await this.page.waitForTimeout(3000);

    console.log('Clicking Accept to proceed with verification...');
    await this.clickAccept();
    await this.page.waitForTimeout(3000);

    console.log('Clicking final Submit to verify chargeoff...');
    await this.clickSubmit();
    await this.page.waitForTimeout(5000);

    const finwFrame = this.getFinwFrame();
    const pageText = (await finwFrame.locator('body').innerText().catch(() => '')) || '';

    const message = await this.getStatusMessage();
    const successMessage = this.extractSuccessMessage(pageText) || message;
    const transactionId = this.extractTransactionId(message) || this.extractTransactionId(pageText);
    console.log(`Chargeoff verification success statement: ${successMessage ?? 'NOT FOUND'}`);
    console.log(`Chargeoff verification transaction ID: ${transactionId ?? 'NOT FOUND'}`);

    return { message: successMessage || message, transactionId };
  }

  private extractSuccessMessage(text: string | null): string | null {
    if (!text) return null;
    const lines = text
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const successRegex = /\b(success|successfully|completed|posted|generated|done|approved|authorised|authorized)\b/i;
    const txnRegex = /\b(transaction|a\/c|charge off|charged off|txn|loan)\b/i;

    for (const line of lines) {
      if (successRegex.test(line) && txnRegex.test(line)) return line;
    }
    for (const line of lines) {
      if (successRegex.test(line)) return line;
    }
    return null;
  }

  private extractTransactionId(text: string | null): string | null {
    if (!text) return null;
    const patterns = [
      /Transaction\s*(?:Id|ID|No|Number|Ref|Reference)\s*[:#]?\s*([A-Z0-9-]{2,30})/i,
      /Txn\s*(?:Id|No|Ref|Reference)\s*[:#]?\s*([A-Z0-9-]{2,30})/i,
      /(?:Reference|Ref)\s*(?:No|Number|Id|ID)\s*[:#]?\s*([A-Z0-9-]{2,30})/i,
    ];
    const lines = text
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const candidate = match[1].trim();
          if (candidate.length >= 2 && candidate.length <= 30) {
            return candidate;
          }
        }
      }
    }
    return null;
  }

  private async pressTabOnInputByLabel(labelText: string): Promise<void> {
    try {
      const finwFrame = this.getFinwFrame();
      const input = finwFrame.locator(':focus').first();
      if (await input.count() > 0) {
        await input.press('Tab').catch(() => {});
      }
    } catch (e) {
      console.log(`Could not press Tab on input for '${labelText}': ${e}`);
    }
  }

  private async selectChargeoffMode(mode: string): Promise<void> {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const modeNorm = normalize(mode);
    const finwFrame = this.getFinwFrame();

    const labels = ['Chargeoff Mode', 'Charge Off Mode', 'Mode'];
    const keywords = [mode];
    for (const label of labels) {
      for (const keyword of keywords) {
        if (await this.selectOptionByLabel(label, keyword)) {
          console.log(`Selected chargeoff mode '${mode}' via label '${label}' keyword '${keyword}'`);
          return;
        }
      }
    }

    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const selects = finwFrame.locator('select:visible, select');
      const count = await selects.count();
      for (let i = 0; i < count; i++) {
        const dd = selects.nth(i);
        if (await dd.isDisabled().catch(() => true)) continue;
        const options: { text: string; value: string }[] = await dd.evaluateAll((els) =>
          Array.from(els).flatMap((s) =>
            Array.from((s as HTMLSelectElement).options).map((o) => ({ text: o.text, value: o.value }))
          )
        );
        const selected = options.find(
          (o) =>
            normalize(o.text).includes(modeNorm) ||
            normalize(o.value) === modeNorm
        );
        if (selected) {
          try {
            await dd.selectOption(selected.value);
          } catch {
            await dd.selectOption({ label: selected.text });
          }
          await this.page.waitForTimeout(1000);
          console.log(`Selected chargeoff mode '${selected.text}' by direct select scan`);
          return;
        }
      }
      await this.page.waitForTimeout(500);
    }

    const radios = finwFrame.locator('input[type="radio"]:visible, input[type="radio"]');
    const rCount = await radios.count();
    for (let i = 0; i < rCount; i++) {
      const radio = radios.nth(i);
      const info = await radio.evaluate((el) => {
        const r = el as HTMLInputElement;
        const id = r.id;
        let labelText = '';
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label) labelText = (label.textContent || '').trim();
        }
        return { value: r.value, labelText, id };
      });
      if (normalize(info.value).includes(modeNorm) || normalize(info.labelText).includes(modeNorm)) {
        await radio.check({ force: true });
        await this.page.waitForTimeout(1000);
        console.log(`Selected chargeoff mode '${mode}' via radio: ${info.labelText || info.value}`);
        return;
      }
    }

    const pageText = (await finwFrame.locator('body').innerText().catch(() => '')) || '';
    if (new RegExp(`Charge\\s*Off\\s*Mode[\\s\\S]{0,200}${mode}`, 'i').test(pageText)) {
      console.log(`Chargeoff mode already displayed as '${mode}'; skipping selection`);
      return;
    }

    console.log(`Could not select chargeoff mode '${mode}'`);
  }

  private async selectReasonCode(code: string, description: string): Promise<void> {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const codeNorm = normalize(code);
    const descNorm = normalize(description);
    const finwFrame = this.getFinwFrame();

    // First try the lookup icon to open the reason-code search popup.
    const popup = await this.clickLookupIconByLabel('Reason Code');
    if (popup) {
      try {
        await popup.waitForTimeout(2000);
        const searchInput = popup.locator('input[type="text"]').first();
        if (await searchInput.count() > 0) {
          await searchInput.fill(code);
          await searchInput.press('Enter').catch(() => {});
          await this.page.waitForTimeout(2000);
        }

        const rows = popup.locator('table tr');
        const rowCount = await rows.count();
        for (let i = 0; i < rowCount; i++) {
          const row = rows.nth(i);
          const raw = await row.textContent().catch(() => '');
          const rowText = normalize(raw ?? '');
          if (rowText.includes(codeNorm) || rowText.includes(descNorm)) {
            const selector = row.locator('a, input[type="button"], button, td:nth-child(1) a');
            if (await selector.count() > 0) {
              await selector.first().click();
              await this.page.waitForTimeout(2000);
              console.log(`Selected reason code '${code} - ${description}' from lookup popup`);
              return;
            }
          }
        }
        if (!popup.isClosed()) await popup.close().catch(() => {});
      } catch (e) {
        console.log(`Reason code lookup popup interaction failed: ${e}`);
      }
    }

    // Fallback: try direct field fill.
    if (await this.fillByLabel('Reason Code', code)) {
      console.log(`Entered reason code '${code}' via label fill`);
      return;
    }

    if (await this.fillByLabel('Reason', code)) {
      console.log(`Entered reason code '${code}' via Reason label fill`);
      return;
    }

    await this.setTextByCandidates(
      ['reasonCode', 'rsnCode', 'chargeoffReason', 'chargeoffReasonCode', 'rsnCd'],
      code,
      'Reason Code'
    );
  }
}
