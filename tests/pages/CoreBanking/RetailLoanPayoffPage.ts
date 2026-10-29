import { Page } from '@playwright/test';
import { AccountPage } from './AccountPage';
import { getApplicationDate } from '../../helpers/common';

export interface PayoffCreationData {
  loanAccountNumber: string;
  payoffValueDate?: string;
  transactionType: string;
  collectRefundAccountId: string;
  reasonCode?: string;
}

export interface PayoffVerificationData {
  loanAccountNumber: string;
  transactionType: string;
  collectRefundAccountId?: string;
  reasonCode?: string;
}

export interface PayoffInquiryData {
  loanAccountNumber: string;
  transactionType?: string;
  collectRefundAccountId?: string;
}

export class RetailLoanPayoffPage extends AccountPage {
  constructor(page: Page) {
    super(page);
  }

  private today(): string {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  private extractTransactionId(text: string | null): string | null {
    if (!text) return null;
    const match = text.match(/(?:Transaction\s*(?:Id|No|#)?|Tran\s*Id|Transaction\s*Ref)\s*[:\s]*([A-Z0-9]*\d[A-Z0-9]{2,})/i)
      ?? text.match(/\b([A-Z]{2,}\d{2,})\b/);
    return match ? match[1] : null;
  }

  private async selectReasonCode(code: string): Promise<void> {
    const popup = await this.clickLookupIconByLabel('Reason Code');
    if (!popup) {
      console.log('Reason Code lookup popup did not open, trying direct fill');
      await this.fillByLabel('Reason Code', code);
      return;
    }
    try {
      await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      let result = popup.getByText(code, { exact: true }).first();
      if ((await result.count() === 0) || !await result.isVisible().catch(() => false)) {
        result = popup.locator('text=' + code).first();
      }
      if ((await result.count() === 0) || !await result.isVisible().catch(() => false)) {
        console.log(`Reason code ${code} not found in lookup results; closing popup and trying direct fill`);
        await popup.close().catch(() => {});
        await this.fillByLabel('Reason Code', code);
        return;
      }
      await result.click({ timeout: 10000 });
      await popup.waitForEvent('close', { timeout: 10000 }).catch(() => {});
      await this.page.waitForTimeout(1000);
      console.log(`Selected reason code: ${code}`);
    } catch (e) {
      console.log(`Reason code lookup selection failed: ${e}`);
      await popup.close().catch(() => {});
      await this.fillByLabel('Reason Code', code);
    }
  }

  private async readAndLogAmounts(): Promise<void> {
    const finwFrame = this.page.frame({ name: 'FINW' });
    const text = (await finwFrame?.evaluate(() => document.body?.innerText || '')) ?? '';
    const fields = ['Net Payoff Amt', 'Pending Principal', 'Interest', 'Fees', 'Charges'];
    const values: Record<string, string> = {};
    for (const field of fields) {
      const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${escaped}\\s*[:\-]?\\s*([0-9,./]+)`, 'i');
      const match = text.match(regex);
      values[field] = match ? match[1].trim() : 'not found';
    }
    console.log('Payoff amounts/details:', values);
  }

  async createPayoff(data: PayoffCreationData): Promise<{ transactionId: string | null; message: string | null; screenshot: Buffer }> {
    console.log(`Starting HPAYOFF payoff creation for loan: ${data.loanAccountNumber}`);

    await this.selectCoreServer();
    await this.searchMenu('HPAYOFF');
    await this.page.waitForTimeout(3000);

    console.log('Selecting Payoff function...');
    await this.selectFunction('Payoff');
    await this.page.waitForTimeout(3000);

    const payoffDate = data.payoffValueDate || await getApplicationDate(this.page);
    await this.fillByLabel('Payoff Value Date', payoffDate);

    const accountFilled = await this.fillByLabel('A/c Id', data.loanAccountNumber);
    if (!accountFilled) {
      await this.enterHacmAccountId(data.loanAccountNumber);
    }

    await this.selectOptionByLabel('Transaction Type', data.transactionType);
    await this.fillByLabel('Collect/Refund A/c Id', data.collectRefundAccountId);

    if (data.reasonCode) {
      await this.selectReasonCode(data.reasonCode);
    }

    console.log('Clicking Go...');
    await this.clickGo();

    console.log('Navigating to Loan Fees Assessment, Collection and Refund Details tab...');
    await this.visitLoanTab('Loan Fees');

    console.log('Clicking Accept...');
    await this.clickAccept();

    console.log('Navigating to Loan Payoff Process tab...');
    await this.visitLoanTab('Payoff Process');

    console.log('Validating payoff amounts...');
    await this.readAndLogAmounts();

    const finwFrame = this.getFinwFrame();

    console.log('Clicking Create Transaction...');
    await this.clickButtonByText('Create Transaction');
    let status = await this.getStatusMessage();
    let pageText = (await finwFrame.locator('body').innerText().catch(() => '')) || '';
    let transactionId = this.extractTransactionId(status) || this.extractTransactionId(pageText);
    console.log(`Post-create status: ${status}`);

    console.log('Clicking Submit...');
    await this.clickButtonByText('Submit');
    await this.acceptWarningPopup();
    const submitStatus = await this.getStatusMessage();
    pageText = (await finwFrame.locator('body').innerText().catch(() => '')) || '';
    if (!transactionId) transactionId = this.extractTransactionId(submitStatus) || this.extractTransactionId(pageText);
    console.log(`Post-submit status: ${submitStatus}`);

    const screenshot = await this.page.screenshot({ fullPage: true });
    console.log(`Payoff creation transaction ID: ${transactionId}`);
    return { transactionId, message: submitStatus || status, screenshot };
  }

  async verifyPayoff(data: PayoffVerificationData): Promise<{ transactionId: string | null; message: string | null; screenshot: Buffer; loanAccountNumber: string }> {
    console.log(`Starting HPAYOFF payoff verification for loan: ${data.loanAccountNumber}`);

    await this.selectCoreServer();
    await this.searchMenu('HPAYOFF');
    await this.page.waitForTimeout(3000);

    console.log('Selecting Verify function...');
    await this.selectFunction('Verify');
    await this.page.waitForTimeout(3000);

    const accountFilled = await this.fillByLabel('A/c Id', data.loanAccountNumber);
    if (!accountFilled) {
      await this.enterHacmAccountId(data.loanAccountNumber);
    }

    const transactionType = data.transactionType || 'T/CI-Transfer Customer Induced';
    await this.selectOptionByLabel('Transaction Type', transactionType);

    console.log('Clicking Go...');
    await this.clickGo();

    console.log('Navigating to Loans Fee Assessment, Collection and Refund Details tab...');
    await this.visitLoanTab('Loan Fees');

    console.log('Clicking Accept...');
    await this.clickAccept();

    console.log('Navigating to Loan Payoff Process tab...');
    await this.visitLoanTab('Payoff Process');

    console.log('Validating payoff details...');
    await this.readAndLogAmounts();

    const finwFrame = this.getFinwFrame();

    console.log('Clicking Create Transaction...');
    await this.clickButtonByText('Create Transaction');
    let status = await this.getStatusMessage();
    let pageText = (await finwFrame.locator('body').innerText().catch(() => '')) || '';
    let transactionId = this.extractTransactionId(status) || this.extractTransactionId(pageText);
    console.log(`Post-create status: ${status}`);

    console.log('Clicking Submit...');
    await this.clickButtonByText('Submit');
    await this.acceptWarningPopup();
    const submitStatus = await this.getStatusMessage();
    pageText = (await finwFrame.locator('body').innerText().catch(() => '')) || '';
    if (!transactionId) transactionId = this.extractTransactionId(submitStatus) || this.extractTransactionId(pageText);

    const transactionDateMatch = pageText.match(/Transaction Date\s*[:-]?\s*(\d{2}-\d{2}-\d{4})/i);
    const transactionDate = transactionDateMatch ? transactionDateMatch[1] : null;
    let finalMessage: string | null = null;
    if (transactionId) {
      finalMessage = `Transaction ID: ${transactionId}` + (transactionDate ? `, Transaction Date: ${transactionDate}` : '');
    } else {
      finalMessage = submitStatus || status;
    }
    console.log(`Post-submit status: ${submitStatus}`);

    const screenshot = await this.page.screenshot({ fullPage: true });
    console.log(`Payoff verification transaction ID: ${transactionId}`);
    return { transactionId, message: finalMessage, screenshot, loanAccountNumber: data.loanAccountNumber };
  }

  async inquiryPayoff(data: PayoffInquiryData): Promise<{ reasonCode: string | null; screenshot: Buffer }> {
    console.log(`Starting HPAYOFF payoff inquiry for loan: ${data.loanAccountNumber}`);

    await this.selectCoreServer();
    await this.searchMenu('HPAYOFF');
    await this.page.waitForTimeout(3000);

    console.log('Selecting Inquiry of Pay Off function...');
    await this.selectFunction('Inquiry of Pay Off');
    await this.page.waitForTimeout(3000);

    const accountFilled = await this.fillByLabel('A/c Id', data.loanAccountNumber);
    if (!accountFilled) {
      await this.enterHacmAccountId(data.loanAccountNumber);
    }
    await this.page.waitForTimeout(3000);

    const transactionType = data.transactionType || 'T/CI-Transfer Customer Induced';
    await this.selectOptionByLabel('Transaction Type', transactionType);

    console.log('Clicking Go...');
    await this.clickGo();

    console.log('Clicking Accept on the inquiry screen...');
    await this.clickAccept();
    await this.page.waitForTimeout(3000);

    const finwFrame = this.getFinwFrame();
    const screenshot = await this.page.screenshot({ fullPage: true });

    const reasonCodeValue = await finwFrame.evaluate(() => {
      const cells = Array.from(document.querySelectorAll<HTMLElement>('td, th'));
      for (const cell of cells) {
        if ((cell.textContent || '').trim().toLowerCase().includes('reason code')) {
          const row = cell.closest('tr');
          if (row) {
            const input = row.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null;
            if (input) return input.value.trim();
          }
        }
      }
      const fallback = document.querySelector('input[id*="reason" i], input[name*="reason" i]') as HTMLInputElement | null;
      return fallback ? fallback.value.trim() : '';
    });

    if (reasonCodeValue) {
      console.log(`Captured payoff inquiry reason code: ${reasonCodeValue}`);
    } else {
      console.log('Payoff inquiry reason code not captured');
    }

    console.log('Clicking Cancel button...');
    await this.clickButtonByText('Cancel');
    await this.page.waitForTimeout(3000);

    return { reasonCode: reasonCodeValue || null, screenshot };
  }
}
