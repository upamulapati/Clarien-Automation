import { Page } from '@playwright/test';
import { AccountPage } from './AccountPage';

export interface RetailLoanChargeoffRecoveryData {
  loanAccountNumber: string;
  transactionType?: string;
  recoveryAmount?: string;
  sourceAccountId?: string;
  valueDate?: string;
}

export class RetailLoanChargeoffRecoveryPage extends AccountPage {
  constructor(page: Page) {
    super(page);
  }

  async performRecovery(data: RetailLoanChargeoffRecoveryData): Promise<{ message: string | null; transactionId: string | null }> {
    console.log(`Starting HRACO chargeoff recovery for loan: ${data.loanAccountNumber}`);

    await this.selectCoreServer();
    console.log('Searching for HRACO menu...');
    await this.searchMenu('HRACO');
    await this.page.waitForTimeout(3000);

    console.log('Selecting Collection function...');
    await this.selectFunction('Collection');
    await this.page.waitForTimeout(1000);

    console.log(`Entering loan account id: ${data.loanAccountNumber}`);
    const accountFilled = await this.fillByLabel('A/c Id', data.loanAccountNumber);
    if (!accountFilled) {
      await this.enterHacmAccountId(data.loanAccountNumber);
    } else {
      await this.pressTabOnInputByLabel('A/c Id');
    }
    await this.page.waitForTimeout(3000);

    const transactionType = data.transactionType ?? 'Transfer';
    console.log(`Selecting transaction type: ${transactionType}`);
    const txSelected =
      (await this.selectRadioByLabel('Transaction Type', transactionType)) ||
      (await this.selectOptionByLabel('Transaction Type', transactionType));
    if (!txSelected) {
      console.log(`Could not select transaction type '${transactionType}' via radio or dropdown`);
    }

    const recoveryAmount = data.recoveryAmount ?? '1000';
    console.log(`Entering recovery amount: ${recoveryAmount}`);
    const amountFilled =
      (await this.fillByLabel('Recovery Amount', recoveryAmount)) ||
      (await this.fillByLabel('Recovery Amt', recoveryAmount)) ||
      (await this.fillByLabel('Amount', recoveryAmount));
    if (!amountFilled) {
      await this.setTextByCandidates(
        ['recoveryAmt', 'recoveryAmount', 'recAmt', 'amount'],
        recoveryAmount,
        'Recovery Amount'
      );
      await this.pressTabOnInputByLabel('Recovery Amount');
    }
    await this.page.waitForTimeout(1000);

    if (transactionType.toLowerCase().includes('transfer')) {
      const sourceAccountId = data.sourceAccountId ?? '7710003367';
      console.log(`Entering source account id: ${sourceAccountId}`);
      const sourceFilled =
        (await this.fillByLabel('Source A/c Id', sourceAccountId)) ||
        (await this.fillByLabel('Source A/c. ID', sourceAccountId)) ||
        (await this.fillByLabel('Source A/c. Id', sourceAccountId)) ||
        (await this.fillByLabel('Source Account Id', sourceAccountId));
      if (!sourceFilled) {
        await this.setTextByCandidates(
          ['sourceAccountId', 'sourceAcctId', 'fromAccountId', 'sourceACId'],
          sourceAccountId,
          'Source A/c Id'
        );
      }
      await this.pressTabOnInputByLabel('Source A/c Id');
      await this.page.waitForTimeout(1000);
    }

    const valueDate = data.valueDate ?? this.today();
    console.log(`Entering value date: ${valueDate}`);
    const dateFilled =
      (await this.fillByLabel('Value Date', valueDate)) ||
      (await this.fillByLabel('Value Dt', valueDate));
    if (!dateFilled) {
      await this.setTextByCandidates(
        ['valueDate_ui', 'valueDate', 'txtValueDate', 'valDate'],
        valueDate,
        'Value Date'
      );
      await this.pressTabOnInputByLabel('Value Date');
    }
    await this.page.waitForTimeout(1000);

    console.log('Clicking Go to fetch recovery details...');
    await this.clickGo();
    await this.acceptWarningPopup();

    console.log('Clicking Accept to load recovery details...');
    await this.clickAccept();
    await this.page.waitForTimeout(3000);

    console.log('Clicking Submit to finalize recovery...');
    await this.clickSubmit();
    await this.page.waitForTimeout(5000);

    const finwFrame = this.getFinwFrame();
    const pageText = (await finwFrame.locator('body').innerText().catch(() => '')) || '';

    const message = await this.getStatusMessage();
    const successMessage = this.extractSuccessMessage(pageText) || message;
    const transactionId =
      this.extractTransactionId(message) ||
      this.extractTransactionId(pageText) ||
      this.extractTransactionId(successMessage);

    console.log(`Chargeoff recovery success statement: ${successMessage ?? 'NOT FOUND'}`);
    console.log(`Chargeoff recovery transaction ID: ${transactionId ?? 'NOT FOUND'}`);

    return { message: successMessage || message, transactionId };
  }

  async verifyRecovery(data: RetailLoanChargeoffRecoveryData): Promise<{ message: string | null; transactionId: string | null }> {
    console.log(`Starting HROCA chargeoff recovery verification for loan: ${data.loanAccountNumber}`);

    await this.selectCoreServer();
    console.log('Searching for HROCA menu...');
    await this.searchMenu('HROCA');
    await this.page.waitForTimeout(3000);

    console.log('Selecting Verify function...');
    await this.selectFunction('Verify');
    await this.page.waitForTimeout(1000);

    console.log(`Entering loan account id: ${data.loanAccountNumber}`);
    const accountFilled = await this.fillByLabel('A/c Id', data.loanAccountNumber);
    if (!accountFilled) {
      await this.enterHacmAccountId(data.loanAccountNumber);
    } else {
      await this.pressTabOnInputByLabel('A/c Id');
    }
    await this.page.waitForTimeout(3000);

    console.log('Clicking Go to load verification details...');
    await this.clickGo();
    await this.acceptWarningPopup();

    console.log('Clicking Accept to proceed with verification...');
    await this.clickAccept();
    await this.page.waitForTimeout(3000);

    console.log('Clicking final Submit to verify recovery...');
    await this.clickSubmit();
    await this.page.waitForTimeout(5000);

    const finwFrame = this.getFinwFrame();
    const pageText = (await finwFrame.locator('body').innerText().catch(() => '')) || '';

    const message = await this.getStatusMessage();
    const successMessage = this.extractSuccessMessage(pageText) || message;
    const transactionId =
      this.extractTransactionId(message) ||
      this.extractTransactionId(pageText) ||
      this.extractTransactionId(successMessage);

    console.log(`Chargeoff recovery verification success statement: ${successMessage ?? 'NOT FOUND'}`);
    console.log(`Chargeoff recovery verification transaction ID: ${transactionId ?? 'NOT FOUND'}`);

    return { message: successMessage || message, transactionId };
  }

  private today(): string {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  private extractSuccessMessage(text: string | null): string | null {
    if (!text) return null;
    const lines = text
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const successRegex = /\b(success|successfully|completed|posted|generated|done|approved|authorised|authorized)\b/i;
    const txnRegex = /\b(transaction|a\/c|recovery|collection|txn|loan|charge)\b/i;

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
    const finwFrame = this.getFinwFrame();
    try {
      const inputId = await finwFrame.evaluate(({ label }) => {
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const labelNorm = normalize(label);
        const cells = Array.from(document.querySelectorAll('td, th'));
        const labelCell = cells.find((el) => normalize(el.textContent?.trim() || '').startsWith(labelNorm));
        if (!labelCell) return null;

        let sibling = labelCell.nextElementSibling;
        while (sibling) {
          const input = sibling.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null;
          if (input && input.id) return input.id;
          sibling = sibling.nextElementSibling;
        }

        const row = labelCell.closest('tr');
        if (row) {
          const inputs = Array.from(row.querySelectorAll('input[type="text"], input:not([type])')) as HTMLInputElement[];
          const first = inputs.find((i) => i.id);
          if (first) return first.id;
        }
        return null;
      }, { label: labelText });

      if (inputId) {
        const input = finwFrame.locator(`#${inputId}`).first();
        if ((await input.count()) > 0 && (await input.isVisible().catch(() => false))) {
          await input.focus().catch(() => {});
          await input.press('Tab').catch(() => {});
          console.log(`Pressed Tab on input #${inputId} for label '${labelText}'`);
          return;
        }
      }
    } catch (e) {
      console.log(`pressTabOnInputByLabel failed: ${e}`);
    }

    const active = finwFrame.locator(':focus').first();
    if ((await active.count()) > 0) {
      await active.press('Tab').catch(() => {});
    }
  }

  private async selectRadioByLabel(labelKeyword: string, optionKeyword: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const optionValue = optionKeyword.toLowerCase();
    try {
      const found = await finwFrame.evaluate(
        ({ label, option }) => {
          const normalize = (s: string) => s.toLowerCase().replace(/[*:.]/g, '').replace(/\s+/g, '');
          const labelNorm = normalize(label);

          const getRadioLabel = (radio: HTMLInputElement): string => {
            if (radio.labels && radio.labels.length > 0 && radio.labels[0].textContent) {
              return radio.labels[0].textContent.trim();
            }
            if (radio.id) {
              const lbl = document.querySelector(`label[for="${radio.id}"]`);
              if (lbl && lbl.textContent) return lbl.textContent.trim();
            }
            const parent = radio.parentNode as HTMLElement | null;
            if (parent) {
              const children = Array.from(parent.childNodes);
              const idx = children.indexOf(radio as any);
              for (let i = idx + 1; i < children.length; i++) {
                const node = children[i];
                if (node.nodeType === Node.TEXT_NODE) {
                  const text = node.textContent?.trim();
                  if (text) return text;
                } else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).textContent) {
                  const text = (node as Element).textContent?.trim();
                  if (text) return text;
                }
              }
            }
            return '';
          };

          const cells = Array.from(document.querySelectorAll('td, label, th, div, span, legend')) as HTMLElement[];
          const labelCell = cells.find((el) => normalize(el.textContent?.trim() || '').startsWith(labelNorm));
          if (!labelCell) return { ok: false };

          const container = labelCell.closest('tr') || labelCell.closest('div') || labelCell.parentElement;
          if (!container) return { ok: false };

          const radios = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
          for (const radio of radios) {
            const optionLabel = getRadioLabel(radio).toLowerCase();
            if (optionLabel.startsWith(option) || optionLabel.includes(option)) {
              radio.checked = true;
              radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              return { ok: true, value: radio.value };
            }
            if (radio.value.toLowerCase() === option || radio.value.toLowerCase().startsWith(option)) {
              radio.checked = true;
              radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              return { ok: true, value: radio.value };
            }
          }
          return { ok: false };
        },
        { label: labelKeyword, option: optionValue }
      );

      if (found.ok) {
        console.log(`Selected radio '${optionKeyword}' for label '${labelKeyword}' (value=${found.value})`);
        await this.page.waitForTimeout(1000);
        return true;
      }
    } catch (e) {
      console.log(`selectRadioByLabel for '${labelKeyword}' failed: ${e}`);
    }

    console.log(`Could not select radio '${optionKeyword}' for label '${labelKeyword}'`);
    return false;
  }
}
