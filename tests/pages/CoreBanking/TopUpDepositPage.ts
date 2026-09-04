import { Frame, Page } from '@playwright/test';
import { saveTopUpDepositAccounts } from '../../helpers/sharedState';
import { TermDepositPage } from './TermDepositPage';

export class TopUpDepositPage extends TermDepositPage {
  constructor(page: Page) {
    super(page);
  }

  async createTopUpDepositsForAllSchemes(
    schemeCodes: string[],
    data: any
  ): Promise<Record<string, string>> {
    const generatedAccounts: Record<string, string> = {};
    for (const schemeCode of schemeCodes) {
      const acct = { ...data, schemeCode };
      try {
        const accountId = await this.createTopUpDeposit(schemeCode, acct);
        generatedAccounts[schemeCode] = accountId ?? 'NOT CAPTURED';
      } catch (err) {
        console.log(`===== SCHEME ${schemeCode} FAILED =====`);
        console.log('Error:', err instanceof Error ? err.message : String(err));
        generatedAccounts[schemeCode] = 'FAILED';
        if (this.page.isClosed()) {
          console.log('Main page is closed — stopping remaining schemes.');
          break;
        }
        await this.page.waitForTimeout(5000).catch(() => {});
      }
    }

    saveTopUpDepositAccounts(generatedAccounts);
    this.printSummary(generatedAccounts);
    return generatedAccounts;
  }

  async createTopUpDeposit(schemeCode: string, data: any): Promise<string | null> {
    console.log(`\n===== Creating top-up deposit: ${schemeCode} =====`);
    await this.selectCoreServer();
    await this.searchMenu(data.screens.create);
    await this.page.waitForTimeout(5000);

    await this.waitForHeaderInputs();
    const finwFrame = this.getFrame();

    // Fill header fields
    await finwFrame.locator('#cifId').fill(data.cifCode);
    await finwFrame.locator('#cifId').press('Tab');
    await this.page.waitForTimeout(2000);
    console.log(`CIF ID filled: ${data.cifCode}`);

    await this.topUpCloseExtraPopups();

    await finwFrame.locator('#schmCode, input[name="schmCode"]').first().fill(schemeCode);
    await finwFrame.locator('#schmCode, input[name="schmCode"]').first().press('Tab');
    await this.page.waitForTimeout(1000);
    console.log(`Scheme Code filled: ${schemeCode}`);

    await this.topUpClickGoButton(finwFrame);
    console.log('Clicked Go button');

    // General Details
    await this.topUpVisitTab(finwFrame, 'General Details');
    await this.topUpSetModeOfOperation(finwFrame, data.modeOfOperation);
    await this.setAccountStatement(finwFrame);
    await this.setDispatchMode(finwFrame, data.dispatchMode);
    await this.setStatementFrequency(finwFrame, data);
    await this.setCalendar(finwFrame, 'Gregorian');
    await this.topUpClickValidate(finwFrame);

    // Interest & Tax
    await this.topUpVisitTab(finwFrame, 'Interest & Tax');
    await this.setIntRateCode(finwFrame, 'TDACR');
    await this.topUpClickValidate(finwFrame);
    await this.keepAlive();

    // Scheme Details
    await this.topUpVisitTab(finwFrame, 'Scheme');
    await this.waitForFrameInput('#depAmt', 'Scheme tab');

    await this.fillField('#depAmt', data.initialDepositAmt);
    await this.fillField('#fixedInstallmentAmt', data.instalmentAmt);
    await this.fillField('#depPerdMths', data.depositPeriodMonths, 500);
    await this.fillField('#depPerdDays', '0');
    await this.fillField('#repayAcct', data.repaymentAcctId, 1000);
    await this.keepAlive();

    await this.topUpSetNominationNo(finwFrame);
    await this.topUpClickValidate(finwFrame);

    // Flow and Renewal
    await this.topUpVisitTab(finwFrame, 'Flow');
    await this.topUpVisitTab(finwFrame, 'Renewal');
    await this.topUpSetAutoClosureNo(finwFrame);
    await this.topUpSetAutoRenewalUnlimited(finwFrame);
    await this.topUpClickValidate(finwFrame);

    // Related Party and Submit
    await this.topUpVisitTab(finwFrame, 'Related Party');
    await this.topUpClickSubmit(finwFrame);

    await this.page.waitForTimeout(4000).catch(() => {});
    await this.acceptWarningPopup().catch(() => {});
    await this.page.waitForTimeout(2000).catch(() => {});

    const result = await this.scanForResult();
    this.topUpCloseExtraPopups();
    await this.page.waitForTimeout(1000).catch(() => {});

    console.log('====================================');
    console.log(`SCHEME: ${schemeCode}`);
    console.log('GENERATED ACCOUNT ID:', result.accountId ?? 'NOT CAPTURED');
    console.log('CREATION STATUS:', result.status ?? 'No status captured');
    console.log('====================================');

    if (!this.page.isClosed()) {
      await this.page.locator('a:has-text("Menu")').first().click({ timeout: 5000 }).catch(() => {});
      await this.page.waitForTimeout(2000);
    }

    return result.accountId;
  }

  private getFrame(): Frame {
    const finwFrame = this.page.frame({ name: 'FINW' });
    if (!finwFrame) throw new Error('FINW frame not found');
    return finwFrame;
  }

  private async waitForHeaderInputs() {
    for (let i = 0; i < 20; i++) {
      const finwFrame = this.page.frame({ name: 'FINW' });
      if (finwFrame && !finwFrame.isDetached() && await finwFrame.locator('#cifId').count().catch(() => 0) > 0) {
        return;
      }
      await this.page.waitForTimeout(1000);
    }
    throw new Error('FINW #cifId never became ready');
  }

  private async waitForFrameInput(inputId: string, label: string): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      const finwFrame = this.page.frame({ name: 'FINW' });
      if (finwFrame && !finwFrame.isDetached() && await finwFrame.locator(inputId).count().catch(() => 0) > 0) {
        return true;
      }
      await this.page.waitForTimeout(1000);
    }
    console.log(`${label} not found — ${inputId} not present`);
    return false;
  }

  private async topUpCloseExtraPopups() {
    for (const p of this.page.context().pages()) {
      if (p !== this.page) await p.close().catch(() => {});
    }
  }

  private async topUpClickGoButton(finwFrame: Frame) {
    const btn = finwFrame.locator('button:has-text("Go"), input[value="Go" i], input[type="button"][value="Go" i]').first();
    if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
      await btn.click();
    } else {
      await finwFrame.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('input, button'));
        const go = btns.find(b => (b as HTMLInputElement).value?.toLowerCase() === 'go');
        if (go) (go as HTMLElement).click();
      });
    }
    await this.page.waitForTimeout(4000);
  }

  private async topUpClickValidate(finwFrame: Frame) {
    const btn = finwFrame.locator(
      'input[type="button"][value="Validate" i], input[type="submit"][value="Validate" i], button:has-text("Validate")'
    ).first();
    if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
      await btn.click();
    } else {
      await finwFrame.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('input, button'));
        const val = btns.find(b => (b as HTMLInputElement).value?.toLowerCase().includes('validate'));
        if (val) (val as HTMLElement).click();
      });
    }
    await this.page.waitForTimeout(2000);
    console.log('Clicked Validate');
  }

  private async topUpClickSubmit(finwFrame: Frame) {
    const btn = finwFrame.locator('#Submit, input[value="Submit" i], input[type="submit"][value="Submit" i], button:has-text("Submit")').first();
    if (await btn.count().catch(() => 0) > 0) {
      await btn.click().catch(() => {});
      console.log('Clicked Submit button');
    }
  }

  private async topUpVisitTab(finwFrame: Frame, label: string) {
    const tab = finwFrame.locator(`a:has-text("${label}")`).first();
    if (await tab.count() > 0) {
      await tab.click();
      await this.page.waitForTimeout(2500);
      console.log(`Navigated to tab: ${label}`);
    } else {
      console.log(`Tab '${label}' not found — may already be active`);
    }
  }

  private async fillField(selector: string, value: string, waitMs = 800) {
    const finwFrame = this.getFrame();
    const loc = finwFrame.locator(selector);
    await loc.click({ clickCount: 3 });
    await loc.type(value);
    await loc.press('Tab');
    await this.page.waitForTimeout(waitMs);
  }

  private async topUpSetModeOfOperation(finwFrame: Frame, value: string) {
    await finwFrame.evaluate(({ val }) => {
      const cells = Array.from(document.querySelectorAll('td'));
      const lbl = cells.find(c => (c.textContent?.trim() || '').startsWith('Mode of Operation'));
      if (!lbl) return;
      let sib = lbl.nextElementSibling;
      while (sib) {
        const inp = sib.querySelector('input[type="text"], input:not([type="hidden"])') as HTMLInputElement | null;
        if (inp && !inp.disabled) {
          inp.focus();
          inp.value = val;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        sib = sib.nextElementSibling;
      }
    }, { val: value });
    await this.page.keyboard.press('Tab');
    await this.page.waitForTimeout(1000);
    console.log(`Mode of Operation set to: ${value}`);
  }

  private async setAccountStatement(finwFrame: Frame) {
    await finwFrame.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td'));
      const lbl = cells.find(c => (c.textContent?.trim() || '').startsWith('A/c. Statement'));
      const sel = (lbl?.nextElementSibling?.querySelector('select') ?? document.querySelector('select[id*="acctStmt"], select[id*="acStmt"]')) as HTMLSelectElement | null;
      if (!sel) return;
      const opt = Array.from(sel.options).find(o => /statement/i.test(o.text) && !/no stmt/i.test(o.text));
      if (opt) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    console.log('A/c Statement set to Statement');
  }

  private async setDispatchMode(finwFrame: Frame, value: string) {
    const result = await finwFrame.evaluate((val) => {
      const allSels = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      const target = val.toLowerCase().replace(/\s+/g, ' ').trim();
      for (const sel of allSels) {
        const opt = Array.from(sel.options).find(o => o.text.toLowerCase().replace(/\s+/g, ' ').includes(target));
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return `Selected "${opt.text}" in select id="${sel.id}"`;
        }
      }
      return `Dispatch Mode option not found for "${val}"`;
    }, value);
    console.log('Dispatch Mode result:', result);
  }

  private async setStatementFrequency(finwFrame: Frame, data: any) {
    await finwFrame.evaluate((opts) => {
      const cells = Array.from(document.querySelectorAll('td'));
      const lbl = cells.find(c => (c.textContent?.trim() || '') === 'Statement Frequency');
      if (!lbl) return;
      const row = lbl.closest('tr');
      if (!row) return;
      const sels = Array.from(row.querySelectorAll('select')) as HTMLSelectElement[];
      if (sels[0]) {
        const opt = Array.from(sels[0].options).find(o => o.text.toLowerCase().includes(opts.frequency.toLowerCase()));
        if (opt) { sels[0].value = opt.value; sels[0].dispatchEvent(new Event('change', { bubbles: true })); }
      }
      if (sels[1]) {
        const opt = Array.from(sels[1].options).find(o => o.text.toLowerCase().includes(opts.week.toLowerCase()));
        if (opt) { sels[1].value = opt.value; sels[1].dispatchEvent(new Event('change', { bubbles: true })); }
      }
      if (sels[2]) {
        const opt = Array.from(sels[2].options).find(o => new RegExp(opts.nextDay, 'i').test(o.text));
        if (opt) { sels[2].value = opt.value; sels[2].dispatchEvent(new Event('change', { bubbles: true })); }
      }
      const inp = row.querySelector('input[type="text"]') as HTMLInputElement | null;
      if (inp) { inp.value = opts.day; inp.dispatchEvent(new Event('change', { bubbles: true })); }
    }, { frequency: data.statementFrequency, week: data.statementWeek, nextDay: data.statementNextDay, day: data.statementDay });
    console.log('Statement Frequency set');
  }

  private async setCalendar(finwFrame: Frame, value: string) {
    await finwFrame.evaluate((val) => {
      const sels = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      for (const sel of sels) {
        const opt = Array.from(sel.options).find(o => o.text.toLowerCase().includes(val.toLowerCase()));
        if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); break; }
      }
    }, value);
    await this.page.waitForTimeout(500);
    console.log(`Calendar set to: ${value}`);
  }

  private async setIntRateCode(finwFrame: Frame, value: string) {
    const locator = finwFrame.locator('td').filter({ hasText: /^Int\. Rate Code$/ }).first()
      .locator('xpath=following-sibling::td[1]//input[@type="text"]');
    if (await locator.count() > 0) {
      await locator.click({ clickCount: 3 });
      await locator.fill(value);
      await locator.press('Tab');
      console.log(`Int. Rate Code set to: ${value}`);
    } else {
      const inputId = await finwFrame.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('td'));
        const lbl = cells.find(c => (c.textContent?.trim() || '') === 'Int. Rate Code');
        if (!lbl) return '';
        const inp = lbl.nextElementSibling?.querySelector('input[type="text"]') as HTMLInputElement | null;
        return inp?.id || inp?.name || '';
      });
      if (inputId) {
        const inp = finwFrame.locator(`#${inputId}, [name="${inputId}"]`).first();
        await inp.click({ clickCount: 3 });
        await inp.fill(value);
        await inp.press('Tab');
        console.log(`Int. Rate Code set via id: ${inputId}`);
      } else {
        console.log('Int. Rate Code input not found');
      }
    }
    await this.page.waitForTimeout(1500);
  }

  private async topUpSetNominationNo(finwFrame: Frame) {
    const result = await finwFrame.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      const nomNo = radios.find(r => /nomin/i.test(r.name) && (r.value === 'N' || r.value === 'No' || r.value === 'false'));
      if (nomNo) {
        nomNo.click();
        nomNo.dispatchEvent(new Event('change', { bubbles: true }));
        return `Nomination No clicked: id=${nomNo.id}`;
      }
      const tds = Array.from(document.querySelectorAll('td'));
      const nomTd = tds.find(td => td.textContent?.trim() === 'Nomination');
      if (!nomTd) return 'Nomination td not found';
      const row = nomTd.closest('tr');
      const rowRadios = Array.from(row?.querySelectorAll('input[type="radio"]') || []) as HTMLInputElement[];
      if (rowRadios.length < 2) return `row has only ${rowRadios.length} radios`;
      const noR = rowRadios.find(r => r.value === 'N' || r.value === 'No') ?? rowRadios[1];
      noR.click();
      noR.dispatchEvent(new Event('change', { bubbles: true }));
      return `Nomination No fallback clicked: id=${noR.id}`;
    });
    console.log('Nomination result:', result);
    await this.page.waitForTimeout(300);
  }

  private async topUpSetAutoClosureNo(finwFrame: Frame) {
    await finwFrame.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, th'));
      const label = cells.find(c => (c.textContent?.trim() || '').startsWith('Auto Closure'));
      if (!label) return;
      const radios = Array.from(label.nextElementSibling?.querySelectorAll('input[type="radio"]') || []) as HTMLInputElement[];
      const noRadio = radios.find(r => r.value === 'N' || r.value === 'No') || radios[1];
      if (noRadio) {
        noRadio.checked = true;
        noRadio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        noRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    console.log('Auto Closure set to No');
  }

  private async topUpSetAutoRenewalUnlimited(finwFrame: Frame) {
    await finwFrame.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, th'));
      const label = cells.find(c => (c.textContent?.trim() || '').startsWith('Auto Renewal'));
      if (!label) return;
      const nextCell = label.nextElementSibling;
      const sel = nextCell?.querySelector('select') as HTMLSelectElement | null;
      if (sel) {
        const opt = Array.from(sel.options).find(o => /unlimited/i.test(o.text));
        if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
      }
      const radios = Array.from(nextCell?.querySelectorAll('input[type="radio"]') || []) as HTMLInputElement[];
      const unlimitedRadio = radios.find(r => /unlimited/i.test(r.value) || r.value === 'U');
      if (unlimitedRadio) {
        unlimitedRadio.checked = true;
        unlimitedRadio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        unlimitedRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    console.log('Auto Renewal set to Unlimited');
  }

  private async scanForResult(): Promise<{ accountId: string | null; status: string | null }> {
    let accountId: string | null = null;
    let status: string | null = null;

    for (const p of this.page.context().pages()) {
      if (p.isClosed()) continue;
      for (const frame of p.frames()) {
        const result = await frame.evaluate(() => {
          const body = document.body?.innerText ?? '';
          const idMatch = body.match(/(?:New A\/c\.?\s*ID|A\/c\.?\s*Id|Account\s*(?:No|Number|ID)[^:]*)[:\s]+(\d{9,12})/i)
            ?? body.match(/\b(9[23]\d{8})\b/);
          const msgSelectors = [
            '#pageMsg', '#statusMsg', 'tr.alert td', 'td.alert',
            'td.successtext', 'td.errortext', '.successtext', '.errortext',
            'font[color="green"]', 'font[color="red"]', 'font[color="#006600"]',
            'span[id*="msg" i]', 'div[id*="msg" i]',
          ];
          let msg: string | null = null;
          for (const sel of msgSelectors) {
            const el = document.querySelector(sel);
            const t = el?.textContent?.replace(/\s+/g, ' ').trim();
            if (t && t.length > 3) { msg = t; break; }
          }
          if (!msg) {
            const match = body.match(/([^\n.]*(?:successfully|opened successfully|authoris|verified|error|failed)[^\n]*)/i);
            if (match) msg = match[1].replace(/\s+/g, ' ').trim();
          }
          return { accountId: idMatch ? idMatch[1] : null, status: msg };
        }).catch(() => ({ accountId: null as string | null, status: null as string | null }));
        if (result.accountId && !accountId) accountId = result.accountId;
        if (result.status && !status) status = result.status;
        if (accountId && status) break;
      }
      if (accountId && status) break;
    }

    return { accountId, status };
  }

  private async keepAlive() {
    await this.page.evaluate(() =>
      fetch(window.location.href, { method: 'HEAD', credentials: 'include' }).catch(() => {})
    ).catch(() => {});
  }

  private printSummary(accounts: Record<string, string>) {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║       TOP-UP DEPOSIT — GENERATED ACCOUNT IDs      ║');
    console.log('╠══════════════════════════════════════════════════╣');
    for (const [scheme, acId] of Object.entries(accounts)) {
      console.log(`║  Scheme: ${scheme.padEnd(8)}  A/c ID: ${acId.padEnd(15)} ║`);
    }
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  }

  public async servicePackFlowEndDateValidation(schemeCode: string, data: any): Promise<{ flowEndDateModified: boolean; message: string; screenshot: Buffer }> {
    console.log(`\n===== Service Pack Flow End Date validation: ${schemeCode} =====`);
    await this.selectCoreServer();
    await this.searchMenu(data.screens?.create ?? 'HOAACTU');
    await this.page.waitForTimeout(5000);

    await this.waitForHeaderInputs();
    const finwFrame = this.getFrame();

    await finwFrame.locator('#cifId').fill(data.cifCode);
    await finwFrame.locator('#cifId').press('Tab');
    await this.page.waitForTimeout(2000);
    await this.topUpCloseExtraPopups();

    await finwFrame.locator('#schmCode, input[name="schmCode"]').first().fill(schemeCode);
    await finwFrame.locator('#schmCode, input[name="schmCode"]').first().press('Tab');
    await this.page.waitForTimeout(1000);
    await this.topUpClickGoButton(finwFrame);

    // General Details
    await this.topUpVisitTab(finwFrame, 'General Details');
    await this.topUpSetModeOfOperation(finwFrame, data.modeOfOperation);
    await this.setAccountStatement(finwFrame);
    await this.setDispatchMode(finwFrame, data.dispatchMode);
    await this.setStatementFrequency(finwFrame, data);
    await this.setCalendar(finwFrame, 'Gregorian');
    await this.topUpClickValidate(finwFrame);

    // Scheme Details
    await this.topUpVisitTab(finwFrame, 'Scheme');
    await this.waitForFrameInput('#depAmt', 'Scheme tab');

    await this.fillField('#depAmt', data.initialDepositAmt);
    await this.fillField('#fixedInstallmentAmt', data.instalmentAmt);
    await this.fillField('#depPerdMths', data.depositPeriodMonths, 500);
    await this.fillField('#depPerdDays', '0');
    await this.fillField('#repayAcct', data.repaymentAcctId, 1000);
    await this.keepAlive();
    await this.topUpSetNominationNo(finwFrame);
    await this.topUpClickValidate(finwFrame);
    await this.page.waitForTimeout(2000);

    const maturityDate = await finwFrame.evaluate(() => {
      const text = document.body?.innerText || '';
      const match = text.match(/Maturity Date[\s:]*([\d\-/.]+)/i);
      return match ? match[1].trim() : '';
    });
    console.log(`Maturity Date from Scheme tab: ${maturityDate}`);

    // Flow Details - capture NI/INSTALLMENT INFLOW end date and compare with maturity
    await this.topUpVisitTab(finwFrame, 'Flow');
    await this.page.waitForTimeout(2000);

    const niEndDate = await finwFrame.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr, div[role="row"]'));
      const niRow = rows.find(row => {
        const text = (row.textContent?.trim() || '').toUpperCase();
        return text.includes('INSTALLMENT INFLOW') || (text.includes('NI') && text.includes('INFLOW'));
      });
      if (!niRow) return '';
      const dates = Array.from(((niRow as HTMLElement).innerText || '').matchAll(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/g)).map((m: RegExpMatchArray) => m[1]);
      return dates.length > 0 ? dates[dates.length - 1] : '';
    });
    console.log(`NI / INSTALLMENT INFLOW End Date from Flow tab: ${niEndDate}`);

    const normalizeDate = (d: string) => d.replace(/[^0-9]/g, '');
    const flowEndDateModified = !!maturityDate && !!niEndDate && normalizeDate(niEndDate) === normalizeDate(maturityDate);
    const message = flowEndDateModified ? 'Flow end date was modified' : 'Flow end date was not modified';
    console.log(message);

    const screenshot = await this.page.screenshot({ fullPage: true });

    return { flowEndDateModified, message, screenshot };
  }
}
