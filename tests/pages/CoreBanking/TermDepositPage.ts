import { expect, Frame, Locator, Page } from '@playwright/test';
import { AccountPage } from './AccountPage';

export class TermDepositPage extends AccountPage {
  constructor(page: Page) {
    super(page);
  }

  async createTermDeposit(schemeCode: string, depositAmount: string, data: any): Promise<string | null> {
    console.log(`\n===== Creating term deposit: ${schemeCode} / ${depositAmount} =====`);
    await this.searchMenu(data.screens.create);
    await this.page.waitForTimeout(3000);
    await this.openLoanHeader({ ccy: data.ccy, solId: data.solId, cifCode: data.cifCode, schemeCode });
    await this.page.waitForTimeout(3000);
    await this.setGlSubHeadCode(data.glSubHeadCode);
    await this.acceptWarningPopup().catch(() => {});
    await this.closeExtraPopups();
    await this.visitTab('General');
    await this.setModeOfOperation(data.modeOfOperation);
    await this.setDispatchModePost();
    await this.visitTab('Interest & Tax');
    if (data.operativeSbAccount) {
      await this.fillByLabel('Interest Credit A/c ID', data.operativeSbAccount).catch(() => {});
    }
    await this.clickValidate();
    await this.visitTab('Scheme');
    await this.setDepositAmount(depositAmount);
    await this.setDepositPeriodMonths(data.depositPeriodMonths);
    await this.setTextByIds(['depPerdDays'], '0');
    if (data.operativeSbAccount) {
      await this.fillByLabel('Repayment A/c ID', data.operativeSbAccount).catch(() =>
        this.setTextByIds(['repayAcct', 'repayAcc'], data.operativeSbAccount)
      );
    }
    await this.setNominationNo();
    await this.clickValidate();
    await this.visitTab('Flow');
    await this.page.waitForTimeout(1000);
    await this.visitTab('Renewal');
    await this.setAutoClosureNo();
    await this.setAutoRenewalUnlimited();
    await this.visitTab('Related Party');
    await this.page.waitForTimeout(1000);
    await this.submitForm();
    await this.acceptWarningPopup().catch(() => {});
    const accountId = await this.captureGeneratedAccountId();
    await this.clickAccept();
    return accountId;
  }

  private getTdFrame(): Frame | null {
    return this.page.frame({ name: 'FINW' });
  }

  private async closeExtraPopups() {
    for (const p of this.page.context().pages()) {
      if (p !== this.page) await p.close().catch(() => {});
    }
  }

  protected async setTextByIds(ids: string[], value: string): Promise<boolean> {
    const frame = this.getTdFrame();
    if (!frame) return false;
    for (const id of ids) {
      try {
        const ok = await frame.evaluate(({ id: t, val }) => {
          const input = document.getElementById(t) as HTMLInputElement | null;
          if (!input || input.readOnly || input.disabled) return false;
          input.focus();
          input.value = val;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.blur();
          return true;
        }, { id, val: value });
        if (ok) {
          console.log(`Filled #${id} = ${value}`);
          await this.page.waitForTimeout(300);
          return true;
        }
      } catch {}
    }
    return false;
  }

  private async setGlSubHeadCode(glCode: string) {
    const frame = this.getTdFrame();
    if (!frame) return;
    await frame.evaluate((code) => {
      const ids = ['glSubHeadCode', 'glSubHdCode', 'glSubhead', 'glSubHd'];
      for (const id of ids) {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el && !el.readOnly && !el.disabled) {
          el.value = code;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    }, glCode).catch(() => {});
  }

  private async clickValidate() {
    const selector = 'input[type="button"][value="Validate" i], input[type="submit"][value="Validate" i], button:has-text("Validate")';
    const frames = [this.getTdFrame(), ...this.page.frames()].filter((f): f is Frame => !!f);
    for (const frame of frames) {
      const btn = frame.locator(selector).first();
      if (await btn.count().catch(() => 0) > 0 && await btn.isVisible().catch(() => false)) {
        await btn.click();
        await this.page.waitForTimeout(2000);
        console.log('Clicked Validate');
        return;
      }
    }
    console.log('Validate button not found');
  }

  private async setModeOfOperation(value: string) {
    const frame = this.getTdFrame();
    if (!frame) return;
    await frame.evaluate(({ val }) => {
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
  }

  private async setDispatchModePost() {
    const frame = this.getTdFrame();
    if (!frame) return;
    await frame.evaluate(() => {
      const sels = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      for (const sel of sels) {
        const postOpt = Array.from(sel.options).find(o =>
          o.text.trim() === 'P - Post' || /^post$/i.test(o.text.trim()) || /\bpost\b/i.test(o.text)
        );
        if (postOpt) {
          sel.value = postOpt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    });
    await this.page.waitForTimeout(500);
  }

  private async setDepositAmount(value: string) {
    const ok = await this.fillByLabel('Deposit Amount', value).catch(() => false);
    if (ok) return;
    await this.setTextByIds(['depAmt', 'depositAmt', 'depositAmount', 'tdDepAmt'], value);
    await this.page.waitForTimeout(800);
  }

  private async setDepositPeriodMonths(value: string) {
    const ok = await this.fillByLabel('Deposit Period Months', value).catch(() => false);
    if (ok) return;
    await this.setTextByIds(['depPerdMths', 'depPeriodMths', 'depositPeriodMonths', 'depPrdMth'], value);
    await this.page.waitForTimeout(500);
  }

  protected async setRenewalPeriod(months: string, days: string): Promise<void> {
    const frame = this.getTdFrame();
    if (!frame) return;
    const ok = await frame.evaluate(({ m, d }) => {
      const isTextLike = (i: HTMLInputElement) => {
        if (i.disabled || i.readOnly) return false;
        const t = (i.type || '').toLowerCase();
        return !['checkbox', 'radio', 'submit', 'button', 'image', 'hidden', 'file', 'reset'].includes(t);
      };

      const dayIds = [
        'renewalPeriodDay', 'renewalPeriodDays', 'renewPrdDay', 'renewPrdDays',
        'renewalPrdDays', 'prdDays',
      ];
      let dayInput: HTMLInputElement | null = null;
      for (const id of dayIds) {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el && isTextLike(el)) { dayInput = el; break; }
      }
      // If not found by id, search by id/name substring
      if (!dayInput) {
        const all = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
        dayInput = all.find((i) => isTextLike(i) && (dayIds.some((id) => i.id.toLowerCase().includes(id.toLowerCase())) || dayIds.some((id) => (i.getAttribute('name') || '').toLowerCase().includes(id.toLowerCase())))) || null;
      }
      if (!dayInput) return { ok: false, reason: 'day input not found' };

      // Find the month input: the text-like input on the same row immediately to the left of the day input
      const dayRect = dayInput.getBoundingClientRect();
      const dayCenterY = (dayRect.top + dayRect.bottom) / 2;
      const all = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      const monthInput = all
        .filter((i) => i !== dayInput && isTextLike(i))
        .filter((i) => {
          const r = i.getBoundingClientRect();
          return Math.abs((r.top + r.bottom) / 2 - dayCenterY) < 25 && r.right <= dayRect.left + 5;
        })
        .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];

      if (!monthInput) return { ok: false, reason: 'month input not found' };

      const setInput = (input: HTMLInputElement, val: string) => {
        input.focus();
        input.value = val;
        input.setSelectionRange(val.length, val.length);
        input.dispatchEvent(new Event('focus', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: val, bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keypress', { key: val, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: val, bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
      };

      setInput(monthInput, m);
      setInput(dayInput, d);

      return {
        ok: true,
        ids: [monthInput.id, dayInput.id],
        names: [monthInput.getAttribute('name') || '', dayInput.getAttribute('name') || ''],
        lefts: [monthInput.getBoundingClientRect().left, dayInput.getBoundingClientRect().left],
      };
    }, { m: months, d: days }).catch((e) => ({ ok: false, reason: String(e) }));
    if (ok && ok.ok) {
      const fields = [
        { id: ok.ids[0], name: ok.names[0], val: months },
        { id: ok.ids[1], name: ok.names[1], val: days },
      ];
      for (const f of fields) {
        const attr = f.id || f.name;
        if (!attr) continue;
        const sel = `[id="${attr}"], [name="${attr}"]`;
        await frame.locator(sel).first().fill(f.val, { force: true }).catch(() => {});
      }
      console.log(`Set renewal period: ${months} months, ${days} days (ids=${ok.ids}, names=${ok.names}, lefts=${ok.lefts})`);
      return;
    }
    console.log('Renewal period fill failed:', ok);
    await this.setTextByIds(['renewalPeriodMnth', 'renewalPeriodMonths', 'renewPrdMnth', 'renewPrdMths', 'renewalPrdMnth', 'prdMonths'], months);
    await this.setTextByIds(['renewalPeriodDay', 'renewalPeriodDays', 'renewPrdDay', 'renewPrdDays', 'renewalPrdDays', 'prdDays'], days);
    await this.page.waitForTimeout(500);
  }

  protected async selectPrintRenewalConfirmation(choice: string): Promise<void> {
    const frame = this.getTdFrame();
    if (!frame) return;
    const result = await frame.evaluate((val) => {
      const valLower = val.toLowerCase();
      const all = Array.from(document.querySelectorAll('td, label, th')) as HTMLElement[];
      const label = all.find((el) => (el.textContent || '').toLowerCase().includes('print renewal confirmation'));
      const scope = label ? (label.closest('tr') || label.parentElement) : document.body;
      const radios = Array.from((scope || document.body).querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      let target: HTMLInputElement | undefined;
      let labelToClick: HTMLElement | undefined;
      for (const radio of radios) {
        if (radio.disabled) continue;
        const valueMatch = radio.value?.toLowerCase() === valLower || radio.id?.toLowerCase().includes(valLower);
        let labelText = '';
        if (radio.id) {
          const labelEl = scope?.querySelector(`label[for='${radio.id}']`) as HTMLElement | null;
          if (labelEl) {
            labelText = labelEl.textContent?.toLowerCase() || '';
            labelToClick = labelEl;
          }
        }
        if (!labelText && radio.parentElement) {
          labelText = radio.parentElement.textContent?.toLowerCase() || '';
          labelToClick = radio.parentElement;
        }
        if (valueMatch || labelText.includes(valLower)) {
          target = radio;
          if (!labelToClick && radio.parentElement) labelToClick = radio.parentElement;
          break;
        }
      }
      if (target && labelToClick) {
        labelToClick.scrollIntoView();
        labelToClick.click();
        return { ok: true, value: target.value, id: target.id, clicked: 'label' };
      }
      if (target) {
        target.scrollIntoView();
        target.click();
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, value: target.value, id: target.id, clicked: 'radio' };
      }
      return { ok: false };
    }, choice.toLowerCase()).catch((e) => ({ ok: false, error: String(e) }));
    if (result && result.ok) {
      console.log(`Selected Print Renewal Confirmation: ${choice} (id=${result.id}, value=${result.value}, clicked=${result.clicked})`);
      return;
    }
    console.log('Print Renewal Confirmation label/radio match failed, trying text click fallback');
    const labelLocator = frame.locator('label, span').filter({ hasText: new RegExp(choice, 'i') }).first();
    if (await labelLocator.count() > 0 && await labelLocator.isVisible().catch(() => false)) {
      await labelLocator.click().catch(() => {});
    } else {
      await frame.locator('input[type="radio"][value="I"], input[type="radio"][value="Immediate"], input[type="radio"][id*="immediate" i]').first().check().catch(() => {});
    }
    console.log(`Print Renewal Confirmation ${choice} fallback attempted`);
    await this.page.waitForTimeout(500);
  }

  private async setNominationNo() {
    const frame = this.getTdFrame();
    if (!frame) return;
    const result = await frame.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      const nomNo = radios.find(r => /nomin/i.test(r.name) && (r.value === 'N' || r.value === 'No' || r.value === 'false'));
      if (nomNo) {
        nomNo.click();
        nomNo.dispatchEvent(new Event('change', { bubbles: true }));
        return 'radio-found';
      }
      const tds = Array.from(document.querySelectorAll('td'));
      const nomTd = tds.find(td => td.textContent?.trim() === 'Nomination');
      if (!nomTd) return 'nomination-cell-not-found';
      const row = nomTd.closest('tr');
      const rowRadios = Array.from(row?.querySelectorAll('input[type="radio"]') || []) as HTMLInputElement[];
      if (rowRadios.length < 2) return 'not-enough-radios';
      const noR = rowRadios.find(r => r.value === 'N' || r.value === 'No') ?? rowRadios[1];
      noR.click();
      noR.dispatchEvent(new Event('change', { bubbles: true }));
      return 'row-radio';
    });
    console.log('Nomination result:', result);
    await this.page.waitForTimeout(300);
  }

  private async setAutoClosureNo() {
    const frame = this.getTdFrame();
    if (!frame) return;
    await frame.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, th'));
      const label = cells.find(c => (c.textContent?.trim() || '').startsWith('Auto Closure'));
      if (!label) return;
      const row = label.closest('tr');
      const radios = Array.from(row?.querySelectorAll('input[type="radio"]') || []) as HTMLInputElement[];
      const noRadio = radios.find(r => /^(No|N|0|false)$/i.test(r.value.trim()));
      if (noRadio) {
        noRadio.click();
        noRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await this.page.waitForTimeout(300);
  }

  private async setAutoRenewalUnlimited() {
    const frame = this.getTdFrame();
    if (!frame) return;
    await frame.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, th'));
      const label = cells.find(c => (c.textContent?.trim() || '').startsWith('Auto Renewal'));
      if (!label) return;
      const row = label.closest('tr');
      const radios = Array.from(row?.querySelectorAll('input[type="radio"]') || []) as HTMLInputElement[];
      const unlimited = radios.find(r => /unlimited/i.test(r.value) || /\bunltd\b/i.test(r.value));
      if (unlimited) {
        unlimited.click();
        unlimited.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await this.page.waitForTimeout(300);
  }

  private async captureGeneratedAccountId(): Promise<string | null> {
    for (const frame of this.page.frames()) {
      const text = await frame.locator('body').innerText().catch(() => '');
      const patterns = [
        /Term\s+Deposit.*?(?:Account\s+ID|A\/c\s*ID|Foracid|A\/c\.?\s*No\.?)\s*[:\-]?\s*([A-Z]{2,}\d{3,}|\d{8,15})/i,
        /(?:New\s+A\/c\.?\s*ID|Account\s+(?:ID|Number|No\.?)|A\/c\s*ID)\s*[:\-]?\s*([A-Z]{2,}\d{3,}|\d{8,15})/i,
        /created\s+successfully\s+(?:with|for)\s+(?:account\s+id|A\/c\s*ID|foracid)\s*[:=]?\s*([A-Z]{2,}\d{3,}|\d{8,15})/i,
        /\b([A-Z]{2}\d{6,})\b/,
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const id = match[1].trim();
          console.log(`Captured account ID: ${id}`);
          return id;
        }
      }
    }
    console.log('Could not capture generated account ID');
    return null;
  }

  async modifyTermDeposit(screenCode: string, accountId: string, newMonths: string, newDays: string): Promise<string | null> {
    console.log(`\n===== Modifying term deposit: ${accountId} =====`);
    await this.searchMenu(screenCode);
    await this.page.waitForTimeout(3000);

    const finwFrame = this.getTdFrame();
    if (finwFrame) {
      await finwFrame.evaluate(() => {
        const sels = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
        for (const sel of sels) {
          const opt = Array.from(sel.options).find(o => o.value === 'M' || /modify/i.test(o.text));
          if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
        }
      });
      await this.page.waitForTimeout(500);
    }

    await this.setTextByIds(['acctId', 'acid', 'acId', 'accountId'], accountId);
    await this.page.waitForTimeout(2000);
    await this.closeExtraPopups();
    await this.clickGoButton();
    await this.page.waitForTimeout(4000);

    await this.visitTab('Scheme');
    await this.setTextByIds(['depPerdMths'], newMonths);
    await this.setTextByIds(['depPerdDays'], newDays);
    await this.page.waitForTimeout(800);

    await this.visitTab('Flow');
    await this.page.waitForTimeout(1000);

    await this.submitForm();
    await this.page.waitForTimeout(3000);

    const stillOnForm = await finwFrame?.locator('input[value="Submit" i], button:has-text("Submit")').count().catch(() => 0) ?? 0;
    if (stillOnForm > 0) {
      await this.submitForm();
      await this.page.waitForTimeout(4000);
    }

    const statusMessage = await this.getStatusMessage();
    await this.acceptWarningPopup().catch(() => {});
    return statusMessage;
  }

  private async clickGoButton() {
    const selector = 'button:has-text("Go"), input[value="Go" i], input[type="button"][value="Go" i], input[type="submit"][value="Go" i]';
    const finwFrame = this.getTdFrame();
    if (finwFrame) {
      const btn = finwFrame.locator(selector).first();
      if (await btn.count().catch(() => 0) > 0 && await btn.isVisible().catch(() => false)) {
        await btn.click();
        return;
      }
    }
    for (const frame of this.page.frames()) {
      const btn = frame.locator(selector).first();
      if (await btn.count().catch(() => 0) > 0 && await btn.isVisible().catch(() => false)) {
        await btn.click();
        return;
      }
    }
  }

  async verifyRelatedPartyDetails(screenCode: string, accountId: string): Promise<string | null> {
    console.log(`\n===== Verifying related party details for ${accountId} =====`);
    await this.selectCoreServer();
    await this.searchMenu(screenCode);
    await this.page.waitForTimeout(3000);
    await this.selectVerifyFunction().catch(() => {});
    await this.enterTemporaryAccountId(accountId).catch(async () => {
      await this.enterHacmAccountId(accountId).catch(() => {});
    });
    await this.acceptButton.click().catch(() => {});
    await this.page.waitForTimeout(5000);

    await this.visitTab('General');
    await this.visitTab('Scheme');
    await this.visitTab('Interest & Tax');
    await this.visitTab('Related Party');
    await this.clickRelatedPartyNextRecord();
    const relatedPartyInfo = await this.getRelatedPartyInfo();
    console.log('Related Party record position:', relatedPartyInfo);

    await this.visitTab('MIS Codes');
    await this.visitTab('Others');
    await this.visitTab('Renewal&Closure');

    await this.clickSubmit().catch(() => {});
    await this.page.waitForTimeout(4000);
    await this.acceptWarningPopup().catch(() => {});
    await this.page.waitForTimeout(2000);
    return this.getStatusMessage();
  }

  private async clickRelatedPartyNextRecord() {
    const finwFrame = this.getTdFrame();
    if (!finwFrame) return;
    const nextRecordBtn = finwFrame.locator(
      'input[value=">"], input[value="Next"], a:has-text(">"), ' +
      'img[src*="next" i], img[alt*="next" i], input[name*="next" i]'
    ).first();
    if (await nextRecordBtn.count() > 0) {
      await nextRecordBtn.click();
      await this.page.waitForTimeout(2000);
      return;
    }
    const clicked = await finwFrame.evaluate(() => {
      const all = Array.from(document.querySelectorAll('input, a, img, span'));
      const next = all.find(el => {
        const v = (el as HTMLInputElement).value ?? el.getAttribute('title') ?? el.getAttribute('alt') ?? el.textContent ?? '';
        return v.trim() === '>';
      });
      if (next) { (next as HTMLElement).click(); return true; }
      return false;
    });
    await this.page.waitForTimeout(2000);
    console.log(clicked ? 'Clicked next record via evaluate' : 'Next record element not found');
  }

  private async getRelatedPartyInfo(): Promise<string> {
    const finwFrame = this.getTdFrame();
    if (!finwFrame) return 'FINW frame not found';
    return await finwFrame.evaluate(() => {
      const body = document.body?.innerText ?? '';
      const match = body.match(/Record\s*(\d+)\s*of\s*(\d+)/i);
      if (match) return `Record ${match[1]} of ${match[2]}`;
      const cifEl = document.querySelector('#customerId') as HTMLInputElement | null;
      return cifEl ? `customerId=${cifEl.value}` : 'Record info not found';
    }).catch(() => 'Could not read record info');
  }

  async verifyDeletedRelatedPartyDetails(screenCode: string, accountId: string): Promise<string | null> {
    console.log(`\n===== Verifying deleted related party for ${accountId} =====`);
    await this.selectCoreServer();
    await this.searchMenu(screenCode);
    await this.page.waitForTimeout(3000);
    await this.selectVerifyFunction().catch(() => {});
    await this.enterTemporaryAccountId(accountId).catch(async () => {
      await this.enterHacmAccountId(accountId).catch(() => {});
    });
    await this.acceptButton.click().catch(() => {});
    await this.page.waitForTimeout(5000);

    await this.visitTab('Related Party');
    await this.clickRelatedPartyNextRecord();
    const delStatus = await this.getDelCheckboxStatus();
    console.log('DEL checkbox verification:', delStatus);

    await this.visitTab('Scheme');
    await this.visitTab('Interest & Tax');
    await this.visitTab('MIS Codes');
    await this.visitTab('Others');
    await this.visitTab('Renewal&Closure');

    await this.clickSubmit().catch(() => {});
    await this.page.waitForTimeout(4000);
    await this.acceptWarningPopup().catch(() => {});
    await this.page.waitForTimeout(2000);
    return this.getStatusMessage();
  }

  private async getDelCheckboxStatus(): Promise<string> {
    const finwFrame = this.getTdFrame();
    if (!finwFrame) return 'FINW frame not found';
    return await finwFrame.evaluate(() => {
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
      const delBox = checkboxes.find(cb =>
        /del(ete)?/i.test(cb.id) || /del(ete)?/i.test(cb.name) || cb.closest('td')?.previousElementSibling?.textContent?.trim() === 'DEL'
      );
      if (delBox) return `DEL checkbox found -- checked=${delBox.checked} (id="${delBox.id}" name="${delBox.name}")`;
      const info = checkboxes.map(cb => `id=${cb.id} name=${cb.name} checked=${cb.checked}`).join(', ');
      return `DEL checkbox not found. All checkboxes: ${info || 'none'}`;
    }).catch(() => 'Could not read DEL checkbox status');
  }

  async deleteRelatedPartyDetails(screenCode: string, accountId: string): Promise<string | null> {
    console.log(`\n===== Deleting related party for ${accountId} =====`);
    await this.selectCoreServer();
    await this.searchMenu(screenCode);
    await this.page.waitForTimeout(3000);

    const finwFrame = this.getTdFrame();
    if (finwFrame) {
      await finwFrame.evaluate(() => {
        const sels = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
        for (const sel of sels) {
          const opt = Array.from(sel.options).find(o => o.value === 'M' || /modify/i.test(o.text));
          if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
        }
      });
      await this.page.waitForTimeout(500);
    }

    await this.setTextByIds(['acctId', 'acid', 'acId', 'accountId'], accountId);
    await this.page.waitForTimeout(2000);
    await this.closeExtraPopups();
    await this.clickGoButton();
    await this.page.waitForTimeout(4000);

    await this.visitTab('Related Party');
    await this.clickRelatedPartyNextRecord();

    const delStatus = await this.setDelCheckboxChecked();
    console.log('DEL checkbox result:', delStatus);

    await this.visitTab('Scheme');
    await this.visitTab('Flow');
    await this.page.waitForTimeout(1000);

    await this.submitForm();
    await this.page.waitForTimeout(3000);

    const stillOnForm = await finwFrame?.locator('input[value="Submit" i], button:has-text("Submit")').count().catch(() => 0) ?? 0;
    if (stillOnForm > 0) {
      await this.submitForm();
      await this.page.waitForTimeout(4000);
    }

    const statusMessage = await this.getStatusMessage();
    await this.acceptWarningPopup().catch(() => {});
    return statusMessage;
  }

  private async setDelCheckboxChecked(): Promise<string> {
    const finwFrame = this.getTdFrame();
    if (!finwFrame) return 'FINW frame not found';
    return await finwFrame.evaluate(() => {
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
      const delBox = checkboxes.find(cb =>
        /del(ete)?/i.test(cb.id) || /del(ete)?/i.test(cb.name) || cb.closest('td')?.previousElementSibling?.textContent?.trim() === 'DEL'
      );
      if (delBox) {
        if (!delBox.checked) {
          delBox.checked = true;
          delBox.dispatchEvent(new Event('change', { bubbles: true }));
          delBox.dispatchEvent(new Event('click', { bubbles: true }));
        }
        return `DEL checkbox checked (id="${delBox.id}" name="${delBox.name}")`;
      }
      const info = checkboxes.map(cb => `id=${cb.id} name=${cb.name} checked=${cb.checked}`).join(', ');
      return `DEL checkbox not found. All checkboxes: ${info || 'none'}`;
    }).catch(() => 'Could not read DEL checkbox status');
  }

  async addRelatedPartyDetails(screenCode: string, data: any): Promise<string | null> {
    console.log(`\n===== Adding related party to ${data.accountId} =====`);
    await this.selectCoreServer();
    await this.searchMenu(screenCode);
    await this.page.waitForTimeout(3000);

    const finwFrame = this.getTdFrame();
    if (finwFrame) {
      await finwFrame.evaluate(() => {
        const sels = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
        for (const sel of sels) {
          const opt = Array.from(sel.options).find(o => o.value === 'M' || /modify/i.test(o.text));
          if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
        }
      });
      await this.page.waitForTimeout(500);
    }

    await this.setTextByIds(['acctId', 'acid', 'acId', 'accountId'], data.accountId);
    await this.page.waitForTimeout(2000);
    await this.closeExtraPopups();
    await this.clickGoButton();
    await this.page.waitForTimeout(4000);

    await this.visitTab('General');
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
    console.log(`Setting Next Print Date to: ${todayStr}`);
    const dateSet = await finwFrame?.evaluate((dateVal) => {
      const knownIds = ['nextPrintDate_ui', 'nextPrintDate', 'nxtPrtDt', 'nxtPrtDt_ui', 'stmtNxtPrtDt_ui'];
      for (const id of knownIds) {
        const inp = document.getElementById(id) as HTMLInputElement | null;
        if (inp && !inp.readOnly && !inp.disabled) {
          inp.focus(); inp.value = dateVal;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.blur();
          return `Set via id="${id}" to ${dateVal}`;
        }
      }
      const cells = Array.from(document.querySelectorAll('td'));
      const lbl = cells.find(c => /next\s*print\s*date/i.test(c.textContent?.trim() ?? ''));
      if (!lbl) {
        const allInps = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
        return `Label not found. Text inputs: ${allInps.map(i => `id=${i.id} ro=${i.readOnly}`).join(', ')}`;
      }
      let sib = lbl.nextElementSibling;
      while (sib) {
        const inp = sib.querySelector('input[type="text"]') as HTMLInputElement | null;
        if (inp && !inp.disabled && !inp.readOnly) {
          inp.focus(); inp.value = dateVal;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.blur();
          return `Set via label scan (id=${inp.id}) to ${dateVal}`;
        }
        sib = sib.nextElementSibling;
      }
      return 'Next Print Date input not found after label';
    }, todayStr).catch(() => 'Could not set Next Print Date');
    console.log('Next Print Date result:', dateSet);
    await this.page.keyboard.press('Tab');
    await this.page.waitForTimeout(1000);

    await this.visitTab('Scheme');
    await this.visitTab('Related Party');

    const addBtn = finwFrame?.locator('input[value="Add"], input[value="ADD"], button:has-text("Add")').first();
    if (addBtn && await addBtn.count() > 0) {
      await addBtn.click();
      await this.page.waitForTimeout(3000);
      console.log('Clicked ADD button');
    } else {
      await finwFrame?.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('input[type="button"], button'));
        const add = btns.find(b => /^add$/i.test((b as HTMLInputElement).value?.trim() || b.textContent?.trim() || ''));
        if (add) (add as HTMLElement).click();
      });
      await this.page.waitForTimeout(3000);
      console.log('Clicked ADD via evaluate fallback');
    }

    const rpFrame = await this.findRelatedPartyFrame(finwFrame);
    console.log(`Using frame: "${rpFrame.name()}" for related party fields`);

    console.log(`Setting Relation Type to: ${data.relationType}`);
    const relationTypeSet = await rpFrame.evaluate((val) => {
      const allSels = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      for (const sel of allSels) {
        const opt = Array.from(sel.options).find(o =>
          o.text.toLowerCase().includes(val.toLowerCase()) || o.value.toLowerCase() === 'j'
        );
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return `Selected "${opt.text}" (value=${opt.value}) in select id="${sel.id}"`;
        }
      }
      return `No matching option found for "${val}"`;
    }, data.relationType).catch(() => 'Could not set relation type');
    console.log('Relation Type result:', relationTypeSet);
    await this.page.waitForTimeout(1000);

    const relnCodeEl = rpFrame.locator('#relnCode');
    if (await relnCodeEl.count() > 0) {
      await relnCodeEl.click({ clickCount: 3 });
      await relnCodeEl.fill(data.relationCode);
      await relnCodeEl.press('Tab');
      await this.page.waitForTimeout(2000);
      console.log(`Relation Code set to: ${data.relationCode}`);
    } else {
      console.log('WARNING: #relnCode not found');
    }

    console.log(`Entering CIF ID: ${data.relatedPartyCifCode}`);
    const cifFieldHandle = await rpFrame.evaluateHandle(() => {
      const ids = ['customerId', 'cifId', 'cifNo', 'cif', 'relatedCifId', 'relCifId', 'partyCifId'];
      for (const id of ids) {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el && !el.disabled && !el.readOnly) return el;
      }
      const tds = Array.from(document.querySelectorAll('td'));
      const lbl = tds.find(td => /^cif\s*id$/i.test(td.textContent?.trim() ?? ''));
      if (lbl) {
        let sib = lbl.nextElementSibling;
        while (sib) {
          const inp = sib.querySelector('input[type="text"]') as HTMLInputElement | null;
          if (inp && !inp.disabled && !inp.readOnly) return inp;
          sib = sib.nextElementSibling;
        }
      }
      return null;
    });
    const cifEl = cifFieldHandle.asElement();
    if (cifEl) {
      await cifEl.click({ clickCount: 3 } as any);
      await this.page.waitForTimeout(300);
      await cifEl.type(data.relatedPartyCifCode);
      await cifEl.press('Tab');
      await this.page.waitForTimeout(4000);
      console.log(`CIF ID entered: ${data.relatedPartyCifCode} -- auto-population triggered`);
    } else {
      const inputInfo = await rpFrame.evaluate(() =>
        Array.from(document.querySelectorAll('input[type="text"]'))
          .map((i: any) => `id=${i.id} name=${i.name} val="${i.value}" ro=${i.readOnly}`)
          .join(' | ')
      );
      console.log(`WARNING: CIF ID field not found. Inputs: ${inputInfo}`);
    }

    await this.visitTab('Flow');
    await this.page.waitForTimeout(1000);

    await this.submitForm();
    await this.page.waitForTimeout(3000);

    const stillOnForm = await finwFrame?.locator('input[value="Submit" i], button:has-text("Submit")').count().catch(() => 0) ?? 0;
    if (stillOnForm > 0) {
      await this.submitForm();
      await this.page.waitForTimeout(4000);
    }

    const statusMessage = await this.getStatusMessage();
    await this.acceptWarningPopup().catch(() => {});
    return statusMessage;
  }

  private async findRelatedPartyFrame(finwFrame: Frame | null): Promise<Frame> {
    const pages = this.page.context().pages();
    for (const p of pages) {
      for (const f of p.frames()) {
        const has = await f.evaluate(() => {
          const cells = Array.from(document.querySelectorAll('td, label, th'));
          return cells.some(c => /relation\s*type/i.test(c.textContent?.trim() ?? ''));
        }).catch(() => false);
        if (has) {
          console.log(`Found related party form in page="${p.url()}" frame="${f.name()}"`);
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

  async verifyClosure(screenCode: string, accountId: string): Promise<string | null> {
    console.log(`\n===== Verifying closure for ${accountId} =====`);
    await this.selectCoreServer();
    await this.searchMenu(screenCode);
    await this.page.waitForTimeout(3000);
    await this.selectVerifyFunction().catch(() => {});
    await this.setTextByIds(['tempForacid', 'acctId', 'acid', 'acId', 'accountId'], accountId);
    await this.page.waitForTimeout(2000);
    await this.closeExtraPopups();

    if (await this.acceptButton.count() > 0 && await this.acceptButton.isVisible().catch(() => false)) {
      await this.acceptButton.click();
    } else {
      await this.clickGoButton();
    }
    await this.page.waitForTimeout(5000);

    await this.visitTab('A/c. Information');
    await this.visitTab('Closure Details');
    await this.visitTab('Closure Exceptions');

    const finwFrame = this.getTdFrame();
    if (finwFrame) {
      const alreadyAuthorized = await finwFrame.evaluate(() => {
        const body = document.body?.innerText?.toLowerCase() || '';
        const phrases = ['the account is already authorized', 'already verified', 'no record found for authorization', 'no transactions pending for authorization'];
        return phrases.some(p => body.includes(p));
      }).catch(() => false);

      if (alreadyAuthorized) {
        console.log('Detected already-authorized state');
      } else {
        await finwFrame.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await this.page.waitForTimeout(1000);

        const authorizeBtn = finwFrame.locator('input[value="Authorize" i], input[type="button"][value="Authorize" i], input[type="submit"][value="Authorize" i], button:has-text("Authorize"), a:has-text("Authorize"), #Authorize').first();
        const submitBtn = finwFrame.locator('#Submit, input[value="Submit" i], input[type="button"][value="Submit" i], input[type="submit"][value="Submit" i], button:has-text("Submit"), a:has-text("Submit")').first();
        const verifyBtn = finwFrame.locator('input[value="Verify" i], input[type="button"][value="Verify" i], button:has-text("Verify"), a:has-text("Verify"), #Verify').first();

        let action: Locator | null = null;
        let actionName = '';
        if (await authorizeBtn.count() > 0 && await authorizeBtn.isEnabled().catch(() => false)) {
          action = authorizeBtn; actionName = 'Authorize';
        } else if (await submitBtn.count() > 0 && await submitBtn.isEnabled().catch(() => false)) {
          action = submitBtn; actionName = 'Submit';
        } else if (await verifyBtn.count() > 0 && await verifyBtn.isEnabled().catch(() => false)) {
          action = verifyBtn; actionName = 'Verify';
        }

        if (action) {
          console.log(`Clicking ${actionName} to authorize closure...`);
          await action.click();
          await this.page.waitForTimeout(3000);
        }
      }
    }

    await this.acceptWarningPopup().catch(() => {});
    await this.page.waitForTimeout(2000);
    await this.acceptWarningPopup().catch(() => {});
    await this.page.waitForTimeout(2000);

    const finw = this.getTdFrame();
    if (finw) {
      const okBtn = finw.locator('#OK, input[value="OK" i], input[type="button"][value="OK" i], button:has-text("OK"), a:has-text("OK")').first();
      let clicked = false;
      for (let i = 0; i < 20; i++) {
        if (await okBtn.count() > 0 && await okBtn.isVisible().catch(() => false)) {
          await okBtn.click();
          clicked = true;
          console.log('Clicked OK on authorization success screen');
          break;
        }
        await this.page.waitForTimeout(500);
      }
      if (!clicked) console.log('Authorization success screen/OK not detected');
    }

    await this.page.waitForTimeout(2000);
    return this.getStatusMessage();
  }

  async partialClosure(screenCode: string, accountId: string, data: { withdrawalAmount: string; repaymentAccountId: string }): Promise<string | null> {
    return this.performClosure({
      screenCode,
      accountId,
      valueTarget: 'Z',
      textTarget: 'z.?close',
      withdrawalAmount: data.withdrawalAmount,
      repaymentAccountId: data.repaymentAccountId,
    });
  }

  async prematureClosure(screenCode: string, accountId: string, functionOption: string, repaymentAccountId: string): Promise<string | null> {
    const [valueTarget, ...textParts] = functionOption.split('-');
    const textTarget = textParts.join('-');
    return this.performClosure({
      screenCode,
      accountId,
      valueTarget,
      textTarget: textTarget || functionOption,
      repaymentAccountId,
    });
  }

  async creditFrozenClosure(screenCode: string, accountId: string, functionOption: string, repaymentAccountId: string): Promise<string | null> {
    return this.performClosure({
      screenCode,
      accountId,
      textTarget: functionOption,
      repaymentAccountId,
      throwIfNotClosed: true,
    });
  }

  private async performClosure(config: {
    screenCode: string;
    accountId: string;
    valueTarget?: string;
    textTarget?: string;
    withdrawalAmount?: string;
    repaymentAccountId: string;
    throwIfNotClosed?: boolean;
  }): Promise<string | null> {
    const { screenCode, accountId, valueTarget = '', textTarget = '', withdrawalAmount, repaymentAccountId, throwIfNotClosed } = config;
    console.log(`\n===== Closure: ${screenCode} for ${accountId} =====`);
    await this.selectCoreServer();
    await this.searchMenu(screenCode);
    await this.page.waitForTimeout(3000);

    const finwFrame = this.getTdFrame();
    if (!finwFrame) throw new Error('FINW frame not found');

    console.log(`Selecting function ${valueTarget || textTarget}...`);
    await finwFrame.evaluate(({ value, text }) => {
      const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      for (const sel of selects) {
        const opt = Array.from(sel.options).find(o =>
          (value && o.value.toUpperCase() === value.toUpperCase()) ||
          (text && new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(o.text))
        );
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    }, { value: valueTarget, text: textTarget });
    await this.page.waitForTimeout(1000);

    console.log(`Entering account id: ${accountId}`);
    await this.setTextByIds(['acctId', 'acid', 'acId', 'accountId', 'tempForacid'], accountId);
    await this.page.waitForTimeout(2000);

    if (withdrawalAmount) {
      console.log(`Setting withdrawal amount: ${withdrawalAmount}`);
      const wdRow = finwFrame.locator('tr:has-text("Withdrawal Amt")');
      const wdInput = wdRow.locator('input[type="text"]').last();
      if (await wdInput.count() > 0) {
        await wdInput.waitFor({ state: 'visible', timeout: 10000 });
        await wdInput.click({ clickCount: 3 });
        await wdInput.fill(withdrawalAmount);
        await wdInput.press('Tab');
      }
      await this.page.waitForTimeout(1000);
    }

    await this.closeExtraPopups();
    await this.clickGoButton();
    await this.page.waitForTimeout(5000);

    console.log('Validating Account Information tab...');
    const accountInfoText = await finwFrame.locator('body').innerText().catch(() => '');
    const warningMatch = accountInfoText.match(/preclosure.*deposit.*account.*occurred/i);
    console.log('Warning message:', warningMatch ? warningMatch[0] : 'not found');
    expect(accountInfoText, 'Deposit Amount field is visible').toMatch(/deposit\s*amt\.?\s*BMD\s*[\d,.]+/i);
    expect(accountInfoText, 'Maturity Value field is visible').toMatch(/maturity\s*value\s*BMD\s*[\d,.]+/i);

    const depositMatch = accountInfoText.match(/Deposit\s*Amt\.?\s*[\:\-]?\s*BMD\s*([\d,\.]+)/i);
    const maturityMatch = accountInfoText.match(/Maturity\s*Value\s*[\:\-]?\s*BMD\s*([\d,\.]+)/i);
    console.log('Deposit details:', { depositAmt: depositMatch ? depositMatch[1] : 'not found', maturityValue: maturityMatch ? maturityMatch[1] : 'not found' });

    await this.clickInquiryLink(finwFrame, 'Int. Flow Inquiry');
    await this.clickInquiryLink(finwFrame, 'Part Closure');

    console.log('Navigating to Closure Details tab...');
    await this.clickTabByText(finwFrame, 'closure details');
    await this.page.waitForTimeout(3000);

    console.log('Setting Close Mode to Repayment A/c. Only...');
    await finwFrame.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      for (const sel of selects) {
        const opt = Array.from(sel.options).find(o => /repayment/i.test(o.text));
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    });
    await this.page.waitForTimeout(1000);

    console.log(`Entering Repayment A/c ID: ${repaymentAccountId}`);
    const repayRow = finwFrame.locator('tr:has-text("Repayment A/c. ID")').first();
    const repayInput = repayRow.locator('input[type="text"]').first();
    if (await repayInput.count() > 0) {
      await repayInput.click({ clickCount: 3 });
      await repayInput.fill(repaymentAccountId);
      await repayInput.press('Tab');
      console.log(`Repayment A/c ID entered: ${await repayInput.inputValue().catch(() => 'unknown')}`);
    } else {
      console.log('Repayment A/c ID input not found');
    }
    await this.page.waitForTimeout(1500);

    console.log('Setting Collect Penal Interest to Yes...');
    await finwFrame.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      for (const radio of radios) {
        const val = radio.value.toLowerCase();
        const name = radio.name.toLowerCase();
        if ((val === 'y' || val === 'yes') && name.includes('penal')) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    });
    await this.page.waitForTimeout(1000);

    console.log('Clicking Validate...');
    const validateBtn = finwFrame.locator('input[value*="Validate" i], button:has-text("Validate")').first();
    if (await validateBtn.count() > 0 && await validateBtn.isVisible().catch(() => false)) {
      await validateBtn.click();
    } else {
      await finwFrame.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('input, button'));
        const valBtn = btns.find(b => (b as HTMLInputElement).value?.toLowerCase().includes('validate'));
        if (valBtn) (valBtn as HTMLElement).click();
      });
    }
    await this.page.waitForTimeout(3000);

    console.log('Navigating to Closure Exceptions tab...');
    await this.clickTabByText(finwFrame, 'closure exceptions');
    await this.waitForClosureExceptionsLoaded(finwFrame);

    await this.setClosureReason002(finwFrame);

    console.log('Clicking Submit...');
    await this.clickSubmit();
    await this.page.waitForTimeout(4000);
    await this.acceptWarningPopup().catch(() => {});
    await this.page.waitForTimeout(2000);
    await this.acceptWarningPopup().catch(() => {});
    await this.page.waitForTimeout(2000);

    const success = await this.waitForClosureSuccessAndClickOK(finwFrame);
    if (!success && throwIfNotClosed) {
      throw new Error(`Account ${accountId} was NOT closed successfully.`);
    }
    await this.page.waitForTimeout(2000);

    return this.getStatusMessage();
  }

  private async clickInquiryLink(finwFrame: Frame, linkText: string) {
    console.log(`Clicking ${linkText} link...`);
    await finwFrame.evaluate((text) => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(a => a.textContent?.toLowerCase().includes(text.toLowerCase()));
      if (link) (link as HTMLElement).click();
    }, linkText);

    let waited = 0;
    let found = false;
    while (!found && waited < 10000) {
      const bodyText = await finwFrame.evaluate(() => document.body?.innerText?.toLowerCase() || '');
      if (bodyText.includes('interest transactions') || bodyText.includes('part/preclosure') || bodyText.includes('no records were fetched')) {
        found = true;
        console.log(`${linkText} inquiry screen loaded`);
        break;
      }
      await this.page.waitForTimeout(500);
      waited += 500;
    }

    if (!found) {
      console.log(`${linkText} inquiry screen did not load`);
      return;
    }

    const okClicked = await finwFrame.evaluate(() => {
      const selectors = ['input[type="button"]', 'input[type="submit"]', 'button', 'a', 'img'];
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        const ok = els.find((el: any) => {
          const val = (el.value || '').toLowerCase();
          const txt = (el.textContent || '').trim().toLowerCase();
          const title = (el.title || '').toLowerCase();
          const alt = (el.getAttribute('alt') || '').toLowerCase();
          return val === 'ok' || txt === 'ok' || title === 'ok' || alt === 'ok';
        });
        if (ok) {
          (ok as HTMLElement).click();
          return `Clicked OK (${sel})`;
        }
      }
      return 'OK not found';
    });
    console.log(`${linkText}: ${okClicked}`);

    let returned = false;
    let returnWait = 0;
    while (!returned && returnWait < 10000) {
      const bodyText = await finwFrame.evaluate(() => document.body?.innerText?.toLowerCase() || '');
      if (bodyText.includes('account closure') || bodyText.includes('closure details') || bodyText.includes('preclosure')) {
        returned = true;
        console.log(`Returned to Account Closure screen after ${linkText}`);
        break;
      }
      await this.page.waitForTimeout(500);
      returnWait += 500;
    }
    if (!returned) console.log(`Did not detect return to Account Closure screen after ${linkText}`);
    await this.page.waitForTimeout(1500);
  }

  private async clickTabByText(finwFrame: Frame, label: string) {
    await finwFrame.evaluate((text) => {
      const tabs = Array.from(document.querySelectorAll('a'));
      const tab = tabs.find(a => a.textContent?.toLowerCase().includes(text.toLowerCase()));
      if (tab) (tab as HTMLElement).click();
    }, label);
  }

  private async waitForClosureExceptionsLoaded(finwFrame: Frame) {
    let loaded = false;
    let wait = 0;
    while (!loaded && wait < 10000) {
      const bodyText = await finwFrame.evaluate(() => document.body?.innerText?.toLowerCase() || '');
      if (bodyText.includes('closure reason code')) {
        loaded = true;
        console.log('Closure Exceptions tab loaded');
        break;
      }
      await this.page.waitForTimeout(500);
      wait += 500;
    }
    await this.page.waitForTimeout(1000);
  }

  private async setClosureReason002(finwFrame: Frame) {
    console.log('Setting Closure Reason Code to 002 customer requested...');
    const reasonRow = finwFrame.locator('tr:has-text("Closure Reason Code")').first();
    const clickableIcons = reasonRow.locator('img, a, input[type="image"]');
    const iconCount = await clickableIcons.count();
    console.log(`Found ${iconCount} clickable icons in Closure Reason Code row`);

    let reasonPage: Page | null = null;
    let clickedIconIndex = -1;

    for (let i = 0; i < iconCount; i++) {
      const icon = clickableIcons.nth(i);
      const tagName = await icon.evaluate(el => el.tagName.toLowerCase()).catch(() => 'unknown');
      const src = (tagName === 'img' || tagName === 'input') ? await icon.getAttribute('src').catch(() => '') : '';
      const onclick = (tagName === 'a' || tagName === 'input') ? await icon.getAttribute('onclick').catch(() => '') : '';
      console.log(`Trying icon ${i}: ${tagName}, src=${src}, onclick=${onclick}`);

      const pagePromise = this.page.context().waitForEvent('page', { timeout: 6000 }).catch(() => null);
      await icon.click();
      await this.page.waitForTimeout(1500);
      const popup = await pagePromise;

      if (popup) {
        const url = popup.url().toLowerCase();
        console.log(`Icon ${i} opened popup: ${url}`);
        if (url.includes('help') || url.includes('hint')) {
          await popup.close().catch(() => {});
          console.log(`Icon ${i} was help popup, trying next`);
        } else if (url.includes('lookup') || url.includes('search') || url.includes('lov') || url.includes('reason') || url.includes('code')) {
          reasonPage = popup;
          clickedIconIndex = i;
          console.log(`Icon ${i} opened lookup popup`);
          break;
        } else {
          reasonPage = popup;
          clickedIconIndex = i;
          console.log(`Icon ${i} opened unknown popup, treating as lookup`);
          break;
        }
      } else {
        const bodyText = await finwFrame.evaluate(() => document.body?.innerText?.toLowerCase() || '');
        if (bodyText.includes('002') && (bodyText.includes('customer requested') || bodyText.includes('reason code'))) {
          clickedIconIndex = i;
          console.log(`Icon ${i} opened lookup in FINW frame`);
          break;
        }
      }
    }

    if (clickedIconIndex === -1) {
      console.log('Could not find Closure Reason Code lookup icon');
    }

    let popupFound = clickedIconIndex !== -1;
    if (!reasonPage) {
      let lookupWait = 0;
      while (!popupFound && lookupWait < 8000) {
        const bodyText = await finwFrame.evaluate(() => document.body?.innerText?.toLowerCase() || '');
        if (bodyText.includes('002') && (bodyText.includes('customer requested') || bodyText.includes('reason code') || bodyText.includes('lookup'))) {
          popupFound = true;
          console.log('Reason code lookup loaded in FINW frame');
          break;
        }
        await this.page.waitForTimeout(500);
        lookupWait += 500;
      }
    } else {
      popupFound = true;
      console.log('Reason code lookup opened as new page');
    }

    if (!popupFound) {
      console.log('Reason code lookup popup not detected');
    } else if (reasonPage) {
      await reasonPage.waitForTimeout(2000);
      const result = await this.selectReason002(reasonPage);
      console.log(result);
      await reasonPage.waitForTimeout(2000);
      await reasonPage.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], button'));
        const ok = btns.find(b => (b as HTMLInputElement).value?.toLowerCase() === 'ok' || b.textContent?.toLowerCase().includes('ok'));
        if (ok) (ok as HTMLElement).click();
      });
      await reasonPage.waitForTimeout(2000);
      await reasonPage.close().catch(() => {});
      console.log('Selected reason code 002 from new page popup');
    } else {
      const result = await this.selectReason002(finwFrame);
      console.log(result);
      console.log('Selected reason code 002 from FINW frame popup');
      let returned = false;
      let returnWait = 0;
      while (!returned && returnWait < 8000) {
        const bodyText = await finwFrame.evaluate(() => document.body?.innerText?.toLowerCase() || '');
        if (bodyText.includes('submit') && bodyText.includes('closure exceptions')) {
          returned = true;
          console.log('Returned to Closure Exceptions screen');
          break;
        }
        await this.page.waitForTimeout(500);
        returnWait += 500;
      }
    }

    await this.page.waitForTimeout(2000);
    const reasonCodeValue = await finwFrame.evaluate(() => {
      const input = document.querySelector('input[name*="reason" i], input[id*="reason" i]') as HTMLInputElement;
      return input?.value?.trim() || 'not populated';
    });
    console.log(`Closure Reason Code field value: ${reasonCodeValue}`);

    if (!reasonCodeValue || reasonCodeValue === 'not populated' || !reasonCodeValue.includes('002')) {
      console.log('Falling back to direct entry of Closure Reason Code 002...');
      const reasonInputRow = finwFrame.locator('tr:has-text("Closure Reason Code")').first();
      const reasonInputDirect = reasonInputRow.locator('input[type="text"]').first();
      if (await reasonInputDirect.count() > 0) {
        await reasonInputDirect.click({ clickCount: 3 });
        await reasonInputDirect.fill('002');
        await reasonInputDirect.press('Tab');
        await this.page.waitForTimeout(2000);
      }
    }

    const finalReasonCodeValue = await finwFrame.evaluate(() => {
      const input = document.querySelector('input[name*="reason" i], input[id*="reason" i]') as HTMLInputElement;
      return input?.value?.trim() || 'not populated';
    });
    console.log(`Closure Reason Code field final value: ${finalReasonCodeValue}`);
    if (!finalReasonCodeValue || finalReasonCodeValue === 'not populated' || !finalReasonCodeValue.includes('002')) {
      throw new Error(`Closure Reason Code not populated with 002. Current value: ${finalReasonCodeValue}`);
    }
  }

  private async selectReason002(target: Frame | Page): Promise<string> {
    return await target.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const reason002 = allElements.find(el => {
        const text = (el.textContent || '').trim();
        return text === '002' || /002\s*[-â€“]\s*customer requested/i.test(text) || text === 'customer requested';
      });
      if (!reason002) return 'Reason 002 element not found';
      let toClick: HTMLElement | null = reason002 as HTMLElement;
      while (toClick && toClick !== document.body) {
        const tag = toClick.tagName.toLowerCase();
        if (tag === 'a' || tag === 'button' || tag === 'input' || tag === 'tr' || tag === 'td') break;
        toClick = toClick.parentElement;
      }
      if (!toClick || toClick === document.body) {
        const row = reason002.closest('tr');
        toClick = (row?.querySelector('input[type="radio"]') as HTMLElement) ||
                  (row?.querySelector('a') as HTMLElement) ||
                  (row as HTMLElement);
      }
      if (toClick) {
        toClick.click();
        return `Clicked reason 002 element (${toClick.tagName})`;
      }
      return 'Could not find clickable element for reason 002';
    });
  }

  private async waitForClosureSuccessAndClickOK(finwFrame: Frame): Promise<boolean> {
    console.log('Waiting for account closure success screen...');
    let successWait = 0;
    let successHandled = false;
    while (!successHandled && successWait < 10000) {
      const bodyText = await finwFrame.evaluate(() => document.body?.innerText?.toLowerCase() || '');
      if (bodyText.includes('account closed successfully') || bodyText.includes('account number closed successfully')) {
        console.log('Account closed successfully message detected');
        const okBtn = finwFrame.locator('#OK, input[value="OK" i], input[type="button"][value="OK" i], button:has-text("OK"), a:has-text("OK")').first();
        if (await okBtn.count() > 0 && await okBtn.isVisible().catch(() => false)) {
          await okBtn.click();
          console.log('Clicked OK on account closure success screen');
        } else {
          await finwFrame.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('input, button, a'));
            const ok = btns.find(b => (b as HTMLInputElement).value?.toLowerCase() === 'ok' || b.textContent?.trim().toLowerCase() === 'ok');
            if (ok) (ok as HTMLElement).click();
          });
        }
        successHandled = true;
        break;
      }
      await this.page.waitForTimeout(500);
      successWait += 500;
    }
    if (!successHandled) console.log('Account closure success screen not detected');
    return successHandled;
  }

  async renewTermDeposit(
    screenCode: string,
    accountId: string,
    renewalDetails?: { renewalPeriodMonths: string; renewalPeriodDays: string; printRenewalConfirmation: string }
  ): Promise<string | null> {
    console.log(`\n===== Renewing term deposit: ${accountId} =====`);
    await this.selectCoreServer();
    await this.searchMenu(screenCode);
    await this.page.waitForTimeout(3000);

    const finwFrame = this.getTdFrame();
    if (!finwFrame) throw new Error('FINW frame not found');

    console.log('Selecting Renewal function...');
    await this.selectFunction('Renewal');
    await this.page.waitForTimeout(1000);

    console.log(`Entering A/c ID: ${accountId}`);
    await this.setTextByIds(['acctId', 'acid', 'acId', 'accountId', 'tempForacid', 'foracid'], accountId);
    await this.page.waitForTimeout(2000);

    await this.closeExtraPopups();
    await this.clickGoButton();
    await this.page.waitForTimeout(6000);

    console.log('Visiting Term Deposits Renewal tab...');
    await this.visitTab('Term Deposits Renewal').catch(() => this.visitTab('Renewal').catch(() => {}));
    await this.page.waitForTimeout(3000);

    console.log('Filling default required options...');
    await this.fillDefaultRequiredOptions();

    if (renewalDetails) {
      console.log(`Setting renewal period: ${renewalDetails.renewalPeriodMonths}/${renewalDetails.renewalPeriodDays}, confirmation: ${renewalDetails.printRenewalConfirmation}`);
      await this.setRenewalPeriod(renewalDetails.renewalPeriodMonths, renewalDetails.renewalPeriodDays);
      await this.selectPrintRenewalConfirmation(renewalDetails.printRenewalConfirmation);
      await this.page.waitForTimeout(1000);
    }

    console.log('Clicking Validate...');
    await this.forceClickLastButtonByValue('Validate');
    await this.page.waitForTimeout(3000);

    console.log('Clicking Submit...');
    await this.forceClickLastButtonByValue('Submit');
    await this.page.waitForTimeout(5000);

    await this.acceptWarningPopup().catch(() => {});
    await this.page.waitForTimeout(3000);

    return this.getStatusMessage();
  }

  async verifyTermDepositRenewal(screenCode: string, accountId: string): Promise<string | null> {
    console.log(`\n===== Verifying term deposit renewal: ${accountId} =====`);
    await this.selectCoreServer();
    await this.searchMenu(screenCode);
    await this.page.waitForTimeout(3000);

    console.log('Selecting Verify function...');
    await this.selectVerifyFunction().catch(() => {});
    await this.page.waitForTimeout(3000);

    console.log(`Entering A/c ID: ${accountId}`);
    const entered = await this.setTextByIds(['tempForacid', 'acctId', 'acid', 'acId', 'accountId', 'foracid'], accountId);
    if (!entered) {
      await this.enterHacmAccountId(accountId).catch(() => {});
    }
    await this.page.waitForTimeout(2000);

    try {
      if (await this.acceptButton.count().catch(() => 0) > 0) {
        await this.acceptButton.click();
      } else {
        await this.clickGoButton().catch(() => {});
      }
    } catch {
      await this.clickGoButton().catch(() => {});
    }
    await this.page.waitForTimeout(5000);

    await this.visitTab('General').catch(() => {});
    await this.visitTab('Renewal').catch(() => {});

    console.log('Clicking Submit...');
    await this.clickSubmit().catch(() => {});
    await this.page.waitForTimeout(3000);

    await this.acceptWarningPopup().catch(() => {});
    await this.page.waitForTimeout(2000);

    return this.getStatusMessage();
  }

  protected async fillDefaultRequiredOptions(): Promise<void> {
    const finwFrame = this.getTdFrame();
    if (!finwFrame) return;
    await finwFrame.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      selects.forEach((sel) => {
        if (sel.disabled) return;
        const selectedText = sel.options[sel.selectedIndex]?.text?.trim() || '';
        const selectedValue = sel.options[sel.selectedIndex]?.value?.trim() || '';
        const isPlaceholder =
          selectedText.toLowerCase() === 'select' ||
          selectedValue.toLowerCase() === 'select' ||
          selectedValue === '';
        if (isPlaceholder) {
          const real = Array.from(sel.options).slice(1).find((o) => o.value && o.value.trim() !== '' && !/select/i.test(o.text.trim()));
          if (real) {
            sel.value = real.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });

      const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      const groups: Record<string, HTMLInputElement[]> = {};
      radios.forEach((r) => {
        if (r.disabled) return;
        const name = r.name || r.id || 'unknown';
        if (!groups[name]) groups[name] = [];
        groups[name].push(r);
      });
      Object.values(groups).forEach((group) => {
        if (!group.some((r) => r.checked)) {
          const first = group.find((r) => !r.disabled);
          if (first) {
            first.checked = true;
            first.click();
            first.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
    });
    await this.page.waitForTimeout(800);
    console.log('Default required options filled');
  }

  private async forceClickLastButtonByValue(value: string): Promise<void> {
    const finwFrame = this.getTdFrame();
    if (!finwFrame) {
      console.log(`FINW frame not available; cannot click ${value}`);
      return;
    }
    const clicked = await finwFrame.evaluate((val) => {
      const valueLower = val.toLowerCase();
      const all = Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], button')) as HTMLElement[];
      const matches = all.filter((el) => {
        const input = el as HTMLInputElement;
        return (input.value?.trim().toLowerCase() === valueLower) || (el.textContent?.trim().toLowerCase() === valueLower);
      });
      const visible = matches.filter((el) => !(el as HTMLInputElement).disabled);
      const target = visible[visible.length - 1] || matches[matches.length - 1];
      if (target) {
        target.scrollIntoView();
        target.click();
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      }
      return false;
    }, value);
    if (clicked) {
      console.log(`Force-clicked last ${value} button`);
    } else {
      console.log(`${value} button not found for force-click`);
    }
    await this.page.waitForTimeout(2000);
  }
}
