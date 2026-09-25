import { Page, Locator, FrameLocator, Frame } from '@playwright/test';
import { captureEvidence } from '../../helpers/evidence';

import * as fs from 'fs';



/**

 * Page object for the Finacle HPORDM (Payment Order) screens.

 *

 * The methods are built around table-row labels so they survive small

 * Finacle HTML id changes. If a field cannot be found by label, the method

 * logs a warning and returns gracefully; assertions live in the spec files.

 */

export class PaymentOrderPage {

  readonly page: Page;

  readonly loginFrame: FrameLocator;

  private lastDialogMessages: string[];



  constructor(page: Page, lastDialogMessages?: string[]) {

    this.page = page;

    this.loginFrame = page.frameLocator('iframe[name="loginFrame"]');

    this.lastDialogMessages = lastDialogMessages || [];

  }



  // ============ Frame Helpers ============

  private getFinwFrame(): Frame {

    const finwFrame = this.page.frame({ name: 'FINW' });

    if (!finwFrame) {

      throw new Error('FINW frame not found!');

    }

    return finwFrame;

  }



  // ============ Generic Label-Based Helpers ============

  private rowForText(text: string): Locator {

    return this.getFinwFrame()

      .locator('tr:visible')

      .filter({ hasText: new RegExp(text, 'i') })

      .first();

  }



  private rowsForText(text: string): Locator {

    return this.getFinwFrame()

      .locator('tr')

      .filter({ hasText: new RegExp(text, 'i') });

  }



  private async getFieldLocator(

    label: string,

    kind: 'input' | 'select',

    nth = 0,

    nameHint = ''

  ): Promise<Locator | null> {

    try {

      const finw = this.getFinwFrame();

      const found = await finw.evaluate(

        ({ label, kind, nth, nameHint }) => {

          const normalize = (s: string) =>

            s

              .toLowerCase()

              .replace(/[*.\\/]+/g, ' ')

              .replace(/\s+/g, ' ')

              .trim();

          const tokens = normalize(label)

            .split(' ')

            .filter((t) => t.length > 1);

          const tds = Array.from(document.querySelectorAll('td'));

          const hint = nameHint.toLowerCase().trim();

          let seen = 0;

          for (const td of tds) {

            if (td.querySelector('td')) continue;

            const tdText = normalize(td.innerText || '');

            if (!tokens.every((tok) => tdText.includes(tok))) continue;

            const valueCell = td.nextElementSibling as HTMLElement | null;

            const roots = valueCell ? [valueCell, td] : [td];

            const candidates: { el: any; score: number }[] = [];

            for (const root of roots) {

              const selector =

                kind === 'select'

                  ? 'select:not([disabled])'

                  : 'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="submit"]):not([disabled]), textarea:not([disabled])';

              root.querySelectorAll(selector).forEach((rawEl: any) => {

                const el = rawEl as any;

                const name = (el.name || '').toLowerCase();

                const id = (el.id || '').toLowerCase();

                const attr = `${name} ${id}`;

                const meta = `${(el.getAttribute('title') || '')} ${(el.placeholder || '')} ${(el.getAttribute('aria-label') || '')}`.toLowerCase();

                let score = 1;

                if (hint && (attr.includes(hint) || meta.includes(hint))) score += 100;

                tokens.forEach((tok) => {

                  if (attr.includes(tok) || meta.includes(tok)) score += 10;

                });

                candidates.push({ el: { tag: el.tagName.toLowerCase(), id: el.id, name: el.name }, score });

              });

            }

            if (candidates.length === 0) continue;

            if (seen === nth) {

              candidates.sort((a, b) => b.score - a.score);

              return candidates[0].el;

            }

            seen++;

          }

          return null;

        },

        { label, kind, nth, nameHint }

      );

      if (!found) return null;

      if (found.name) {

        return this.getFinwFrame().locator(`${found.tag}[name="${found.name}"]`).first();

      }

      if (found.id) {

        return this.getFinwFrame().locator(`[id="${found.id}"]`).first();

      }

      return null;

    } catch (e) {

      console.log(`Could not locate field '${label}': ${e}`);

      return null;

    }

  }



  private async fillByName(name: string, value: string) {

    try {

      const finw = this.getFinwFrame();

      const locator = finw.locator(`input[name="${name}"]:not([disabled])`).first();

      if ((await locator.count().catch(() => 0)) === 0) {

        console.log(`No enabled input found for name '${name}'`);

        return;

      }

      await locator.scrollIntoViewIfNeeded();

      await locator.fill('');

      await locator.fill(value);

      await this.page.waitForTimeout(500);

      const valueAfter = await locator.inputValue().catch(() => 'n/a');

      console.log(`Filled input[name="${name}"] with '${value}' (value after: '${valueAfter}')`);

    } catch (e) {

      console.log(`Could not fill input[name="${name}"]: ${e}`);

    }

  }



  private async fillByLabel(label: string, value: string, nth = 0, nameHint = '') {

    try {

      const input = await this.getFieldLocator(label, 'input', nth, nameHint);

      if (!input) {

        console.log(`No enabled input found for label '${label}'`);

        return;

      }

      const inputInfo = await input.evaluate((el: any) => ({ id: el.id, name: el.name, tag: el.tagName, type: el.type, disabled: el.disabled, readOnly: el.readOnly })).catch(() => ({}));

      console.log(`Resolved input for '${label}': ${JSON.stringify(inputInfo)}`);

      await input.scrollIntoViewIfNeeded();

      await input.fill('');

      await input.fill(value);

      await this.page.waitForTimeout(500);

      const valueAfter = await input.inputValue().catch(() => 'n/a');

      console.log(`Filled '${label}' with '${value}' (value after: '${valueAfter}')`);

    } catch (e) {

      console.log(`Could not fill '${label}': ${e}`);

    }

  }



  private async selectByLabel(label: string, value: string, nth = 0, nameHint = '') {

    try {

      const select = await this.getFieldLocator(label, 'select', nth, nameHint);

      if (!select) {

        console.log(`Select label '${label}' not found — skipping`);

        return;

      }

      const selectInfo = await select.evaluate((el: any) => ({ id: el.id, name: el.name, tag: el.tagName, disabled: el.disabled, onchange: el.getAttribute('onchange'), outer: el.outerHTML.slice(0, 200) })).catch(() => ({}));

      console.log(`Resolved select for '${label}': ${JSON.stringify(selectInfo)}`);

      const optionLocator = select.locator('option');

      const optionCount = await optionLocator.count().catch(() => 0);

      let matchedValue = '';

      let found = false;

      const needle = value.toLowerCase();

      for (let i = 0; i < optionCount; i++) {

        const opt = optionLocator.nth(i);

        const rawText = (await opt.textContent().catch(() => ''))?.trim() ?? '';

        const rawValue = (await opt.getAttribute('value').catch(() => ''))?.trim() ?? '';

        const normalizedText = rawText.toLowerCase().replace(/\s+/g, ' ').trim();

        const optValue = rawValue.toLowerCase();

        if (optValue === needle || normalizedText === needle) {

          matchedValue = rawValue;

          found = true;

          break;

        }

      }

      if (!found) {

        console.log(`No option matching '${value}' found for '${label}'`);

        return;

      }

      const options = await optionLocator.allTextContents();

      console.log(`Options for '${label}': ${JSON.stringify(options)}`);

      await select.selectOption({ value: matchedValue });

      await this.page.waitForTimeout(1000);

      console.log(`Selected '${value}' for '${label}' (option value: ${matchedValue})`);

    } catch (e) {

      console.log(`Could not select '${value}' for '${label}': ${e}`);

    }

  }



  private async clickButtonByValue(value: string) {

    try {

      const finwFrame = this.getFinwFrame();

      const selector =

        `input[type="button"][value="${value}"], ` +

        `input[type="submit"][value="${value}"], ` +

        `input[type="button"][value*="${value}"], ` +

        `button:has-text("${value}")`;

      const btn = finwFrame.locator(selector).first();

      if (await btn.count().catch(() => 0) > 0) {

        await btn.scrollIntoViewIfNeeded();

        await btn.click();

        await this.page.waitForTimeout(2000);

        console.log(`Clicked button: ${value}`);

      } else {

        console.log(`Button '${value}' not found`);

      }

    } catch (e) {

      console.log(`Could not click button '${value}': ${e}`);

    }

  }



  private async clickButtonById(id: string) {

    try {

      const finwFrame = this.getFinwFrame();

      const btn = finwFrame.locator(`#${id}`).first();

      if (await btn.count().catch(() => 0) > 0) {

        await btn.scrollIntoViewIfNeeded();

        await btn.click();

        await this.page.waitForTimeout(2000);

        console.log(`Clicked #${id} button`);

      } else {

        console.log(`Button #${id} not found`);

      }

    } catch (e) {

      console.log(`Could not click #${id}: ${e}`);

    }

  }



  // ============ HPORDM Header Actions ============

  async selectPaymentProduct(product: string) {

    await this.selectByLabel('Payment product', product);

  }



  async clickProductGo() {

    await this.clickButtonByValue('Go');
    await this.page.waitForTimeout(3000);
    await captureEvidence(this.page, 'Payment product Go clicked', {});

  }



  // ============ Remittance Details ============

  async enterDebitAccount(accountId: string) {

    await this.fillByLabel('Debit a/c', accountId);

  }



  async enterRequestedExecutionDate(date: string) {

    await this.fillByLabel('Requested execution date', date);

  }



  async selectRemittanceCcy(ccy: string) {

    // Try dropdown first, then fall back to a text field

    await this.selectByLabel('Remittance CCY', ccy, 0, 'crncy');

    await this.fillByLabel('Remittance CCY', ccy, 0, 'crncy');

  }



  async enterRemittanceAmount(amount: string) {

    await this.fillByLabel('Remittance AMT', amount, 0, 'amt');

  }



  async enterDebitValueDate(date: string) {

    await this.fillByLabel('Debit value date', date);

  }



  async enterChargingAccount(accountId: string) {

    await this.fillByLabel('Charging a/c', accountId);

  }



  async enterDebitExecutionDate(date: string) {

    await this.fillByLabel('Debit execution date', date);

  }



  async enterCreditExecutionDate(date: string) {

    await this.fillByLabel('Credit execution date', date);

  }



  async enterCreditValueDate(date: string) {

    await this.fillByLabel('Credit value date', date);

  }



  // ============ Beneficiary Details ============

  async selectBeneficiaryAddressType(type: string) {

    await this.selectByLabel('Address type', type, 0, 'benef');

    await this.page.waitForTimeout(3000);

  }



  async enterBeneficiaryAccountId(accountId: string) {

    await this.fillByName('pordm.benefPartyAcct', accountId);

  }



  async enterBeneficiaryName(name: string) {

    await this.fillByLabel('Name', name, 0, 'benef');

  }



  async enterBeneficiaryAddress(address: string) {

    await this.fillByLabel('Address', address, 0, 'benef');

  }



  async enterBeneficiaryCountry(country: string) {

    await this.fillByName('pordm.benefPartyCntryCode', country);

  }



  async enterBeneficiaryBic(bic: string) {

    const finw = this.getFinwFrame();

    const locator = finw.locator('input[name="pordm.benefPartyBic"]').first();

    await locator.fill(bic);

    await locator.blur(); // Use Playwright's native blur to trigger auto-population

    await this.page.waitForTimeout(3000); // Wait for auto-population

  }



  async enterBeneficiaryBankCode(code: string) {

    await this.fillByName('pordm.benefPartyBankCode', code);

  }



  async enterBeneficiaryBranchCode(code: string) {

    await this.fillByName('pordm.benefPartyBranchCode', code);

  }



  // ============ Account With Institution ============

  async selectInstitutionAddressType(type: string) {

    const awiFields = await this.getFinwFrame().evaluate(() =>

      Array.from(document.querySelectorAll('input, select'))

        .filter((el: any) => (el.name || '').toLowerCase().includes('awi'))

        .map((el: any) => ({ name: el.name, id: el.id, label: (el.closest('td') as any)?.innerText?.slice(0, 80) }))

    ).catch(() => []);

    console.log('AWI fields:', JSON.stringify(awiFields));

    await this.selectByLabel('Address type', type, 1, 'awi');

    await this.page.waitForTimeout(3000);

  }



  async enterBic(bic: string) {

    const finw = this.getFinwFrame();

    const locator = finw.locator('input[name="pordm.awiBic"]').first();

    await locator.fill(bic);

    await locator.blur(); // Use Playwright's native blur to trigger auto-population

    await this.page.waitForTimeout(3000); // Wait for auto-population

  }



  async enterBankCode(code: string) {

    await this.fillByName('pordm.awiBankCode', code);

  }



  async enterBranchCode(code: string) {

    await this.fillByName('pordm.awiBranchCode', code);

  }



  async enterCountry(country: string) {

    await this.fillByName('pordm.awiCntryCode', country);

  }



  // ============ Credit / Charge Details ============

  async selectPaymentMethod(method: string) {

    // Try dropdown first, then fall back to a text field

    await this.selectByLabel('Method of payment', method, 0, 'pmtMtd');

    await this.fillByLabel('Method of payment', method, 0, 'pmtMtd');

  }



  async selectRateCodeIfPresent(rateCode: string) {

    if (!rateCode) return;

    for (const label of ['FX Rate', 'Rate Code', 'Exchange Rate', 'Rate']) {

      await this.selectByLabel(label, rateCode);

      await this.fillByLabel(label, rateCode);

    }

  }



  async selectSettlementMode(mode: string) {

    await this.selectByLabel('Settlement Mode', mode);

  }



  async enterOurCorrespondentBic(bic: string) {

    await this.fillByLabel('Our Correspondent BIC', bic);

  }



  async enterOurCorrespondentBranchCode(code: string) {

    await this.fillByLabel('Our Correspondent Branch code', code);

  }



  async enterOurCorrespondentBankCode(code: string) {

    await this.fillByLabel('Our Correspondent bank', code);

  }



  async clickFetchCharges() {

    try {

      const finw = this.getFinwFrame();



      // ACH (and other scenarios) render a known 'Fetch' button for the payment system id.

      const fetchBtn = finw.locator('#fetchPaysysId').first();

      if (await fetchBtn.count().catch(() => 0) > 0) {

        await finw.evaluate(() => {

          const el = document.getElementById('fetchPaysysId') as HTMLInputElement | null;

          if (el) el.click();

        });

        console.log('Clicked #fetchPaysysId fetch button');

        await this.page.waitForTimeout(2000);

        return;

      }



      // Fallback: scan for any fetch-related button in the FINW frame

      const allButtons = await finw.evaluate(() =>

        Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], input[type="image"], button'))

          .map((el: any) => ({ id: el.id, name: el.name, value: el.value, text: el.innerText, alt: el.alt, title: el.title, type: el.type, outer: el.outerHTML.slice(0, 200) }))

      );

      console.log('All buttons on page:', JSON.stringify(allButtons.slice(0, 20))); // First 20 buttons



      const fetchBtns = allButtons.filter((b: any) =>

        ['value', 'text', 'alt', 'title', 'name'].some((k) =>

          (b[k] || '').toLowerCase().includes('fetch')

        )

      );

      console.log('Fetch buttons found:', JSON.stringify(fetchBtns));



      if (fetchBtns.length > 0) {

        const btn = fetchBtns[0];

        const selector = btn.id

          ? `#${btn.id}`

          : btn.name

            ? `input[name="${btn.name}"]`

            : btn.alt

              ? `input[type="image"][alt="${btn.alt}"]`

              : 'button';

        await finw.locator(selector).first().scrollIntoViewIfNeeded();

        await finw.locator(selector).first().click({ force: true });

        console.log(`Clicked Fetch button: ${JSON.stringify(btn)}`);

        await this.page.waitForTimeout(2000);

      } else {

        console.log('No Fetch button found on page');

      }

    } catch (e) {

      console.log('Could not click Fetch charges:', e);

    }

  }



  async selectChargeOption(option: string) {

    await this.selectByLabel('Charge option', option);

    await this.selectByLabel('Charge details', option);

  }



  async clickViewCharges() {

    const debug = await this.getFinwFrame().evaluate(() => {

      const objForm: any = (window as any).objForm;

      const chrg = objForm?.chrgEventId;

      const settle = objForm?.settlementMode;

      const waive = objForm?.waiverCharges;

      return {

        chrgEventId: chrg ? { id: chrg.id, name: chrg.name, value: chrg.value, visible: !!chrg.offsetParent } : null,

        settlementMode: settle ? { value: settle.value, text: settle.options?.[settle.selectedIndex]?.text } : null,

        waiveCharges: waive ? { length: waive.length, checked0: waive[0]?.checked, checked1: waive[1]?.checked } : null,

      };

    }).catch((e) => ({ error: String(e) }));

    console.log(`DEBUG charge state: ${JSON.stringify(debug)}`);

    await this.clickButtonByValue('View charges');

    await this.clickButtonByValue('View Charges');

  }



  async clickChargeSubmit() {

    // First visible Submit on the page is usually inside the charge/credit details section

    await this.clickButtonByValue('Submit');
    await this.page.waitForTimeout(3000);
    await captureEvidence(this.page, 'Payment order charge submit', {});

  }



  private async prepareForSubmit() {

    await this.getFinwFrame().evaluate(() => {

      const objForm: any = (window as any).objForm;

      (window as any).isPageVisited = 'Y';

      (window as any).prevRemitAmt = objForm?.remitAmt?.value || '';

      (window as any).prevRemitCrncy = objForm?.remitCrncy?.value || '';

      (window as any).prevChargeOption = objForm?.chargeOption?.value || '';

      (window as any).prevChrgEventId = objForm?.chrgEventId?.value || '';

      (window as any).prevRoutedPaysysId = objForm?.routedPaysysId?.value || '';

      (window as any).prevDrAcct = objForm?.drAcct?.value || '';

      (window as any).prevReqExecutionDate = objForm?.reqExecutionDate?.value || '';

      (window as any).prevCrExecutionDate = objForm?.crExecutionDate?.value || '';



      const getRadio = (name: string) => {

        const radios = objForm?.[name];

        if (!radios) return '';

        for (const r of radios) {

          if (r.checked) return r.value;

        }

        return '';

      };

      (window as any).prevNetCharges = getRadio('netCharges');

      (window as any).prevRepairCharges = getRadio('repairCharges');

    }).catch(() => {});

  }



  async syncRemittanceValues(data: any, businessDate: string) {

    const after = await this.getFinwFrame().evaluate((args) => {

      const { data, businessDate } = args as { data: any; businessDate: string };

      const orderTypeSel = document.querySelector('select[name="pordm.orderType"]') as any;

      if (!orderTypeSel) {

        console.log('syncRemittanceValues warning: pordm.orderType not found. href=', location.href, 'body=', document.body?.innerText?.slice(0, 300));

      }

      const f = (orderTypeSel?.form as any) || document.forms[0] as any;

      const set = (n: string, v: string) => {

        const matches = f.querySelectorAll(`select[name="${n}"], input[name="${n}"], textarea[name="${n}"]`) as any;

        matches.forEach((el: any) => {

          el.value = v;

          el.disabled = false;

          el.readOnly = false;

        });

      };

      set('pordm.orderType', data.paymentProduct === 'customer transfer' ? 'CT' : data.paymentProduct);

      set('pordm.drAcct', data.debitAccount);

      set('pordm.chrgAcct', data.debitAccount);

      set('pordm.reqExecutionDate', businessDate);

      set('pordm.reqExecutionDate_ui', businessDate);

      set('pordm.drValueDate', businessDate);

      set('pordm.drValueDate_ui', businessDate);

      set('pordm.drExecutionDate', businessDate);

      set('pordm.drExecutionDate_ui', businessDate);

      set('pordm.crExecutionDate', businessDate);

      set('pordm.crExecutionDate_ui', businessDate);

      set('pordm.crValueDate', businessDate);

      set('pordm.crValueDate_ui', businessDate);

      set('pordm.remitCrncy', data.ccy);

      set('pordm.remitAmt', data.amount);

      set('pordm.routedPaysysId', data.paymentMethod);

      if (data.settlementMode) {

        set('pordm.settlementMode', data.settlementMode);

      }

      set('pordm.chargeOption', data.chargeOption);

      set('pordm.benefPartyBankCode', data.beneficiaryBankCode || '');

      set('pordm.benefPartyBranchCode', data.beneficiaryBranchCode || '');

      set('pordm.benefPartyBic', data.beneficiaryBic || '');

      set('pordm.benefPartyAcct', data.beneficiaryAccountId || '');

      set('pordm.benefCifId', '');

      set('pordm.benefPartyName', data.beneficiaryName || '');

      set('pordm.benefPartyAddress1', data.beneficiaryAddress || '');

      set('pordm.benefPartyCntryCode', data.country);

      set('pordm.benefPartyAddrInd', data.beneficiaryAddressType);

      set('pordm.awiAddrInd', data.institutionAddressType);

      set('pordm.awiBic', data.bic || '');

      set('pordm.awiBankCode', data.institutionAddressType === 'F' ? data.bankCode : '');

      set('pordm.awiBranchCode', data.institutionAddressType === 'F' ? data.branchCode : '');

      set('pordm.awiCntryCode', data.country);

      if (data.ourCorrespondentBic) {

        set('pordm.ourCorrespBic', data.ourCorrespondentBic);

        set('pordm.ourCorrespBankCode', data.ourCorrespondentBankCode || '');

        set('pordm.ourCorrespBranchCode', data.ourCorrespondentBranchCode || '');

      }

      try {

        const setRadio = (n: string, v: string) => {

          const radios = f.elements[n] as any;

          if (!radios) return;

          for (const r of radios) { if (r.value === v) { r.checked = true; } }

        };

        setRadio('netCharges', 'N');

        setRadio('repairCharges', 'N');

      } catch (e) {}

      const getVal = (n: string) => {

        const el = f.querySelector(`select[name="${n}"], input[name="${n}"], textarea[name="${n}"]`) as any;

        return el ? el.value : null;

      };

      return {

        orderType: getVal('pordm.orderType'),

        settlementMode: getVal('pordm.settlementMode'),

        drAcct: getVal('pordm.drAcct'),

        chrgAcct: getVal('pordm.chrgAcct'),

        remitCrncy: getVal('pordm.remitCrncy'),

        remitAmt: getVal('pordm.remitAmt'),

        instructedAmt: getVal('pordm.instructedAmt'),

        routedPaysysId: getVal('pordm.routedPaysysId'),

        chargeOption: getVal('pordm.chargeOption'),

        benefPartyAddrInd: getVal('pordm.benefPartyAddrInd'),

        benefPartyBic: getVal('pordm.benefPartyBic'),

        benefPartyBankCode: getVal('pordm.benefPartyBankCode'),

        benefPartyBranchCode: getVal('pordm.benefPartyBranchCode'),

        benefPartyAcct: getVal('pordm.benefPartyAcct'),

        awiAddrInd: getVal('pordm.awiAddrInd'),

        awiBic: getVal('pordm.awiBic'),

        awiBankCode: getVal('pordm.awiBankCode'),

        awiBranchCode: getVal('pordm.awiBranchCode'),

        interInstnAddrInd: getVal('pordm.interInstnAddrInd'),

        recvrCorrespAddrInd: getVal('pordm.recvrCorrespAddrInd'),

        ourCorrespBankCode: getVal('pordm.ourCorrespBankCode'),

      };

    }, { data, businessDate });

    console.log('After sync:', JSON.stringify(after));

  }



  async clickMainSubmit() {

    await this.prepareForSubmit();

    const smDebug = await this.getFinwFrame().evaluate(() => {

      const sm = (window as any).objForm?.settlementMode;

      if (!sm) return { missing: true };

      return { value: sm.value, options: Array.from(sm.options).map((o: any) => ({ value: o.value, text: o.text })) };

    }).catch(() => ({}));

    console.log(`Settlement Mode: ${JSON.stringify(smDebug)}`);

    await this.clickButtonById('Submit');
    await this.page.waitForTimeout(3000);
    await captureEvidence(this.page, 'Payment order main submit', { settlementMode: smDebug });

  }



  async dumpFinwHtml(filename: string) {

    try {

      const html = await this.getFinwFrame().content();

      fs.writeFileSync(filename, html, 'utf8');

      console.log(`Dumped FINW HTML to ${filename}`);

    } catch (e) {

      console.log(`Failed to dump FINW HTML to ${filename}:`, e);

    }

  }



  async clickReimbursementDetailsTab() {

    try {

      await this.prepareForSubmit();

      const tabInfo = await this.getFinwFrame().evaluate(() => {

        const a = document.querySelector('a#reimb') as any;

        return a ? { id: a.id, onclick: a.getAttribute('onclick'), text: a.innerText } : null;

      }).catch(() => null);

      console.log('Reimbursement tab info:', JSON.stringify(tabInfo));

      await this.getFinwFrame().evaluate(() => { (window as any).getStatus('N', 'reimb'); }).catch(() => {});

      await this.getFinwFrame().waitForLoadState('networkidle').catch(() => {});

      await this.page.waitForTimeout(2000);

      try {

        const html = await this.getFinwFrame().content();

        fs.writeFileSync('debug-reimbursement-tab.html', html, 'utf8');

        console.log('Dumped Reimbursement tab HTML to debug-reimbursement-tab.html');

      } catch (e) { console.log('Failed to dump reimbursement HTML:', e); }

      console.log('Loaded Reimbursement Details tab');

    } catch (e) {

      console.log('Could not load Reimbursement Details tab:', e);

    }

  }



  async submitReimbursementDetails() {

    try {

      await this.prepareForSubmit();

      const paymentTab = await this.getFinwFrame().evaluate(() => {

        const a = Array.from(document.querySelectorAll('#sTab a')).find((el: any) => (el.innerText || '').toLowerCase().includes('payment order')) as any;

        return a ? { id: a.id, onclick: a.getAttribute('onclick'), text: a.innerText } : null;

      }).catch(() => null);

      console.log('Payment Order tab info:', JSON.stringify(paymentTab));

      const tabId = paymentTab?.id || 'pordm';

      await this.getFinwFrame().evaluate((id) => { (window as any).getStatus('N', id); }, tabId).catch(() => {});

      await this.getFinwFrame().waitForLoadState('networkidle').catch(() => {});

      await this.page.waitForTimeout(2000);

      console.log('Returned to Payment Order tab');

    } catch (e) {

      console.log('Could not return to Payment Order tab:', e);

    }

  }



  // ============ Result Capture ============

  async getPaymentOrderId(lastDialogMessages?: string[]): Promise<string | null> {

    const messages = lastDialogMessages || this.lastDialogMessages;

    const patterns = [

      /(?:Payment\s*Order\s*(?:Id|ID|Ref|#)?)\s*[:=]?\s*(\d{10,})/i,

      /(?:Order\s*(?:Id|ID|Ref|#)?)\s*[:=]?\s*(\d{10,})/i,

      /\b(\d{12})\b/,

      /\b(\d{10,})\b/,

    ];



    // 1) Dialog messages first

    for (const msg of messages) {

      for (const pat of patterns) {

        const m = msg.match(pat);

        if (m && m[1]) {

          console.log(`Extracted Payment Order ID from dialog: ${m[1]}`);

          return m[1];

        }

      }

    }



    // 2) Known field ids

    const finwFrame = this.getFinwFrame();

    const candidates = [

      '#pmtOrdId',

      '#paymentOrderId',

      '#payOrderId',

      '#pymtOrdId',

      '#ordId',

      '#pmtOrderId',

      'input[name="paymentOrderId"]',

      'input[name="pmtOrdId"]',

    ];

    for (const sel of candidates) {

      const el = finwFrame.locator(sel).first();

      if (await el.count().catch(() => 0) > 0) {

        const val = (await el.inputValue().catch(() => '')).trim();

        if (val && /\d{6,}/.test(val)) {

          console.log(`Extracted Payment Order ID from field ${sel}: ${val}`);

          return val;

        }

      }

    }



    // 3) Scan all frames for a 10+ digit reference

    for (const frame of this.page.frames()) {

      const text = await frame.evaluate(() => document.body?.innerText || '').catch(() => '');

      for (const pat of patterns) {

        const m = text.match(pat);

        if (m && m[1]) {

          console.log(`Extracted Payment Order ID from frame '${frame.name() || 'main'}': ${m[1]}`);

          return m[1];

        }

      }

    }



    console.log('Could not extract Payment Order ID');

    return null;

  }



  // ============ Verification Actions ============

  async enterPaymentOrderId(id: string) {

    await this.fillByLabel('Payment order id', id);

    await this.fillByLabel('Payment order ID', id);

  }



  async clickGo() {

    await this.clickButtonByValue('Go');

    await this.clickButtonById('Go');
    await this.page.waitForTimeout(3000);
    await captureEvidence(this.page, 'Payment order Go clicked', {});

  }




  async getPageText(): Promise<string> {

    try {

      const finwFrame = this.getFinwFrame();

      return await finwFrame.locator('body').innerText().catch(() => '');

    } catch (e) {

      console.log(`Could not read page text: ${e}`);

      return '';

    }

  }

}

