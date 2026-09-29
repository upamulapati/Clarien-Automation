import { Page } from '@playwright/test';
import { AccountPage } from './AccountPage';
import { captureEvidence } from '../../helpers/evidence';

export class CashTransactionPage {
  readonly page: Page;
  readonly accountPage: AccountPage;

  constructor(page: Page) {
    this.page = page;
    this.accountPage = new AccountPage(page);
  }

  private getFinwFrame() {
    const finwFrame = this.page.frame({ name: 'FINW' });
    if (!finwFrame) {
      throw new Error('FINW frame not found');
    }
    return finwFrame;
  }

  // ===== Navigation =====
  async selectCoreServer(): Promise<void> {
    await this.accountPage.selectCoreServer();
  }

  async searchMenu(menuCode: string): Promise<void> {
    await this.accountPage.searchMenu(menuCode);
  }

  async invokeCashMenu(menuCode: 'HCASHDEP' | 'HCASHWD'): Promise<void> {
    await this.selectCoreServer();
    await this.searchMenu(menuCode);
    await this.page.waitForTimeout(3000);
  }

  // ===== Header fields =====
  async selectFunction(code: 'A' | 'V'): Promise<void> {
    await this.accountPage.selectHtmFunction(code);
  }

  async selectTranTypeSubType(value: string): Promise<void> {
    await this.accountPage.selectHtmTranTypeSubType(value);
  }

  async clickGo(): Promise<void> {
    await this.accountPage.clickHtmGo();
  }

  // ===== Part transaction entry =====
  async selectCurrency(ccy: string): Promise<void> {
    await this.setSelectByCandidates(['crncyCode', 'currencyCode', 'ccyCode', 'ccy'], ccy, 'Currency');
  }

  async selectPartTranType(type: 'C' | 'D'): Promise<void> {
    if (type === 'C') {
      await this.accountPage.selectHtmCredit();
    } else {
      await this.accountPage.selectHtmDebit();
    }
  }

  async enterAccountId(accountId: string): Promise<void> {
    await this.accountPage.enterHtmAccountId(accountId);
  }

  async enterAmount(amount: string, pressTab = true): Promise<void> {
    await this.accountPage.enterHtmAmount(amount, pressTab);
  }

  async selectListAllPartTransaction(): Promise<void> {
    const finwFrame = this.getFinwFrame();
    try {
      const found = await finwFrame.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('td, th, label')) as HTMLElement[];
        const el = labels.find((l) =>
          (l.textContent || '').toLowerCase().includes('list all part transaction')
        );
        if (el) {
          const input = (el.closest('tr') || el).querySelector(
            'input[type="checkbox"], input[type="radio"], select'
          ) as HTMLElement | null;
          if (input) {
            if ((input as HTMLInputElement).type === 'checkbox' && !(input as HTMLInputElement).checked) {
              (input as HTMLInputElement).click();
            }
            (input as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!found) {
        const select = finwFrame.locator('select:visible').first();
        if (await select.count() > 0) {
          const options = await select.evaluateAll((selects) =>
            Array.from(selects).flatMap((s) =>
              Array.from((s as HTMLSelectElement).options).map((o) => ({ text: o.text, value: o.value }))
            )
          );
          const match = options.find((o) =>
            o.text.toLowerCase().includes('list all part transaction')
          );
          if (match) {
            await select.selectOption(match.value);
          }
        }
      }
    } catch (e) {
      console.log(`Could not select "List all part transaction": ${e}`);
    }
    await this.page.waitForTimeout(800);
  }

  // ===== Denomination popup =====
  async clickDenomination(): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const selectors = [
      '#Denomination',
      'input[type="button"][value="Denomination" i]',
      'input[type="button"][value*="Denomination" i]',
      'input[type="submit"][value*="Denomination" i]',
      'button:has-text("Denomination")',
      'a:has-text("Denomination")',
    ].join(', ');
    try {
      const btn = finwFrame.locator(selectors).first();
      if ((await btn.count() > 0) && (await btn.isVisible().catch(() => false))) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        console.log('Clicked Denomination button');
        await this.page.waitForTimeout(3000);
        await captureEvidence(this.page, 'Denomination popup opened', {});
      } else {
        console.log('Denomination button not found on screen');
      }
    } catch (e) {
      console.log(`Could not click Denomination: ${e}`);
    }
  }

  async fillDenomination(amount: string, denominationValue?: string): Promise<void> {
    const finwFrame = this.getFinwFrame();

    const amountNum = parseFloat(amount);
    if (!amountNum) {
      throw new Error(`Amount ${amount} is not a valid number`);
    }
    if (denominationValue) {
      const denomNum = parseFloat(denominationValue);
      if (!denomNum || amountNum % denomNum !== 0) {
        throw new Error(`Amount ${amount} is not an exact multiple of denomination ${denominationValue}`);
      }
    }

    try {
      const result = await finwFrame.evaluate(async ({ amountNum, targetDenomination }) => {
        const doc = document;

        const norm = (s: string) =>
          s
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');

        const tables = Array.from(doc.querySelectorAll('table')) as HTMLTableElement[];
        let qtyInput: HTMLInputElement | null = null;
        let matchedDenom = '';

        const getDenominationTable = () => {
          for (const table of tables) {
            const text = (table.innerText || '').toLowerCase();
            if (!text.includes('denomination') || !text.includes('notes') || !text.includes('coins')) {
              continue;
            }
            const rows = Array.from(table.querySelectorAll('tr'));
            const headerRow = rows.find((r) =>
              Array.from(r.querySelectorAll('th, td')).some((c) =>
                (c as HTMLElement).innerText.toLowerCase().includes('denomination')
              )
            );
            if (!headerRow) continue;
            const headers = Array.from(headerRow.querySelectorAll('th, td')).map((c) =>
              norm((c as HTMLElement).innerText)
            );
            const denomIdx = headers.findIndex((h) => h.includes('denomination'));
            const notesIdx = headers.findIndex((h) => h.includes('notes') && h.includes('coins'));
            if (denomIdx === -1 || notesIdx === -1) continue;
            return { rows, denomIdx, notesIdx };
          }
          return null;
        };

        const tableInfo = getDenominationTable();
        if (!tableInfo) {
          return { filled: false, matchedDenom, netAmt: null, cashReceived: null };
        }
        const { rows, denomIdx, notesIdx } = tableInfo;

        let value = targetDenomination;
        if (!value) {
          const candidates: number[] = [];
          for (let i = 1; i < rows.length; i++) {
            const cells = Array.from(rows[i].querySelectorAll('th, td'));
            if (cells.length <= denomIdx) continue;
            const text = (cells[denomIdx] as HTMLElement).innerText;
            const m = text.match(/\d+\.\d{2}/);
            if (m) {
              const d = parseFloat(m[0]);
              if (d > 0) {
                const q = amountNum / d;
                if (Math.abs(q - Math.round(q)) < 1e-6) candidates.push(d);
              }
            }
          }
          if (candidates.length === 0) {
            return { filled: false, matchedDenom, netAmt: null, cashReceived: null };
          }
          const best = candidates.sort((a, b) => b - a)[0];
          value = best.toFixed(2);
        }
        const qty = Math.round(amountNum / parseFloat(value)).toString();

        const target = value.replace(/\.00$/, '');
        const targetLo = value.toLowerCase();
        const targetIntLo = target.toLowerCase();

        for (let i = 1; i < rows.length; i++) {
          const cells = Array.from(rows[i].querySelectorAll('th, td'));
          if (cells.length <= Math.max(denomIdx, notesIdx)) continue;

          const denomCellText = (cells[denomIdx] as HTMLElement).innerText
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          const isMatch =
            denomCellText === targetLo ||
            denomCellText === targetIntLo ||
            denomCellText.includes(targetLo) ||
            denomCellText.includes(targetIntLo);

          if (isMatch) {
            const notesCell = cells[notesIdx] as HTMLElement;
            const inputs = Array.from(notesCell.querySelectorAll('input:not([disabled])')) as HTMLInputElement[];
            const visibleInputs = inputs.filter((el) => el.offsetParent !== null && el.type !== 'hidden');

            if (visibleInputs.length > 0) {
              // Prefer the count input, avoiding LowLimit / HighLimit / Returned fields
              qtyInput =
                visibleInputs.find(
                  (el) =>
                    /count|notes|coins|denomcount/i.test((el.name || '') + (el.id || '')) &&
                    !/limit|returned|ret/i.test((el.name || '') + (el.id || ''))
                ) ||
                visibleInputs.find(
                  (el) => !/limit|returned|value/i.test((el.name || '') + (el.id || ''))
                ) ||
                visibleInputs[0];
              matchedDenom = denomCellText;
              break;
            }
          }
        }

        if (!qtyInput) {
          // Fallback: find the row containing the value and fill its first enabled visible input
          for (const table of tables) {
            const rows = Array.from(table.querySelectorAll('tr'));
            for (const row of rows) {
              const cells = Array.from(row.querySelectorAll('td, th'));
              const hasDenom = cells.some((c) => {
                const t = (c as HTMLElement).innerText.toLowerCase();
                return t === targetLo || t === targetIntLo || t.includes(targetLo) || t.includes(targetIntLo);
              });
              if (hasDenom) {
                const inputs = Array.from(row.querySelectorAll('input:not([disabled])')) as HTMLInputElement[];
                const visibleInputs = inputs.filter((el) => el.offsetParent !== null && el.type !== 'hidden');
                if (visibleInputs.length > 0) {
                  qtyInput = visibleInputs[0];
                  break;
                }
              }
            }
            if (qtyInput) break;
          }
        }

        if (qtyInput) {
          qtyInput.value = qty;
          qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
          qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
          qtyInput.dispatchEvent(new Event('blur', { bubbles: true }));
          qtyInput.blur();

          return {
            filled: true,
            inputName: qtyInput.name,
            inputId: qtyInput.id,
            matchedDenom,
            denomination: value,
            qty,
          };
        }

        return { filled: false, matchedDenom, netAmt: null, cashReceived: null };
      }, { amountNum, targetDenomination: denominationValue || '' });

      console.log(`Denomination fill result: ${JSON.stringify(result)}`);

      if (!result.filled) {
        throw new Error(`Could not fill denomination for amount ${amount}`);
      }

      await this.page.waitForTimeout(3000);

      const netAmt = await this.getDenominationFieldValue('Net Amt', amount);
      const cashReceived = await this.getDenominationFieldValue('Total Cash Received', amount);

      if (netAmt === null) {
        throw new Error('Net Amt. field not found on denomination screen');
      }
      if (cashReceived === null) {
        throw new Error('Total Cash Received field not found on denomination screen');
      }
      const net = parseFloat(netAmt);
      if (net.toFixed(2) !== amountNum.toFixed(2)) {
        throw new Error(`Net Amt. ${netAmt} does not match entered amount ${amount}`);
      }
      const cash = parseFloat(cashReceived);
      if (cash.toFixed(2) !== amountNum.toFixed(2)) {
        throw new Error(`Total Cash Received ${cashReceived} does not match entered amount ${amount}`);
      }
    } catch (e) {
      console.log(`Could not fill denomination: ${e}`);
      throw e;
    }
    await this.page.waitForTimeout(1000);
  }

  async getDenominationFieldValue(label: string, amount: string): Promise<string | null> {
    const finwFrame = this.getFinwFrame();
    const amountNum = parseFloat(amount);
    const labelRe = new RegExp(
      label.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\D*([\d,]+\.?\d*)',
      'i'
    );
    const allRows = await finwFrame.locator('tr').filter({ hasText: new RegExp(label, 'i') }).all();

    for (const row of allRows) {
      const inputs = await row.locator('input').all();
      for (const input of inputs) {
        const value = await input.inputValue();
        const v = parseFloat(value);
        if (!isNaN(v) && v.toFixed(2) === amountNum.toFixed(2)) {
          return value;
        }
      }
      const text = await row.textContent() || '';
      const m = text.match(labelRe);
      if (m) return m[1].replace(/,/g, '');
    }
    return null;
  }

  // ===== Post / OK / Verify actions =====
  async clickOk(): Promise<void> {
    await this.accountPage.clickHtmOk();
  }

  async clickPost(): Promise<void> {
    await this.accountPage.clickHtmPost();
  }

  async clickSubmit(): Promise<void> {
    await this.accountPage.clickHtmSubmit();
  }

  async clickVerifyOkOrSubmit(): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const okBtn = finwFrame
      .locator(
        '#Ok, #ok, input[value="Ok" i], input[value="OK" i], input[value="ok" i], button:has-text("Ok")'
      )
      .first();
    if ((await okBtn.count() > 0) && (await okBtn.isVisible().catch(() => false))) {
      await okBtn.scrollIntoViewIfNeeded();
      await okBtn.click();
      console.log('Clicked verification OK');
    } else {
      await this.clickSubmit();
    }
    await this.page.waitForTimeout(3000);
  }

  async enterTransactionId(transactionId: string): Promise<void> {
    await this.accountPage.enterHtmTransactionId(transactionId);
  }

  // ===== Status / error helpers =====
  async getStatusMessage(): Promise<string | null> {
    return this.accountPage.getStatusMessage();
  }

  async checkError(): Promise<boolean> {
    return this.accountPage.checkHtmError();
  }

  async logScreenMessages(): Promise<void> {
    await this.accountPage.logScreenMessages();
  }

  async getExactErrorMessage(): Promise<string | null> {
    const status = await this.getStatusMessage();
    const errorRegex = /\b(error|fail|failed|invalid|not posted|cannot|mandatory|rejected|unauthorised|unauthorized)\b/i;
    if (status && errorRegex.test(status)) {
      return status;
    }

    try {
      const body = await this.getFinwFrame().locator('body').innerText();
      const lines = body
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 10 && errorRegex.test(s));
      if (lines.length > 0) {
        return lines[0];
      }
    } catch {
      // ignore
    }

    return null;
  }

  async assertNoError(label: string): Promise<string | null> {
    const error = await this.getExactErrorMessage();
    if (error) {
      throw new Error(`Error during ${label}: ${error}`);
    }
    return this.getStatusMessage();
  }

  async getTransactionId(): Promise<string | null> {
    return this.accountPage.getHtmTransactionId();
  }

  // ===== Helpers =====
  private async setSelectByCandidates(
    candidates: string[],
    value: string,
    label: string
  ): Promise<void> {
    const finwFrame = this.getFinwFrame();
    for (const candidate of candidates) {
      const select = finwFrame
        .locator(`#${candidate}, select[name="${candidate}"], select[id*="${candidate}" i]`)
        .first();
      try {
        if (
          (await select.count() > 0) &&
          (await select.isVisible().catch(() => false)) &&
          (await select.isEnabled().catch(() => false))
        ) {
          await select.selectOption(value);
          await this.page.waitForTimeout(800);
          console.log(`Selected ${label} = ${value}`);
          return;
        }
      } catch {}
    }
    console.log(`Could not select ${label} = ${value}`);
  }
}
