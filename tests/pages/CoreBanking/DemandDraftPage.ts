import { Page, Locator, Frame } from '@playwright/test';

/**
 * Page object for the Finacle HDDMI (Demand Draft) screens.
 *
 * The methods are label-based so they survive small Finacle HTML id changes.
 * If a field cannot be found by label, the method logs a warning and returns
 * gracefully; assertions live in the spec files.
 */
export class DemandDraftPage {
  readonly page: Page;
  private lastDialogMessages: string[];

  constructor(page: Page, lastDialogMessages?: string[]) {
    this.page = page;
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

  // ============ Row-Based Helpers (Finacle uses heavily nested tables) ============
  private async fillByRowLabel(label: string, value: string, nth = 0) {
    try {
      const finw = this.getFinwFrame();
      const rows = finw.locator('tr, td, th').filter({ hasText: new RegExp(label, 'i') });
      const row = rows.nth(nth);
      if (await row.count().catch(() => 0) === 0) {
        console.log(`Row '${label}' not found`);
        return;
      }
      const input = row.locator('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="submit"]):not([disabled]), textarea:not([disabled])').first();
      if (await input.count().catch(() => 0) > 0) {
        await input.scrollIntoViewIfNeeded();
        await input.fill('');
        await input.fill(value);
        await this.page.waitForTimeout(500);
        const valueAfter = await input.inputValue().catch(() => 'n/a');
        console.log(`Row filled '${label}' with '${value}' (value after: '${valueAfter}')`);
      } else {
        console.log(`No enabled input in row '${label}'`);
      }
    } catch (e) {
      console.log(`Could not row fill '${label}': ${e}`);
    }
  }

  private async selectByRowLabel(label: string, value: string, nth = 0) {
    try {
      const finw = this.getFinwFrame();
      const rows = finw.locator('tr, td, th').filter({ hasText: new RegExp(label, 'i') });
      const row = rows.nth(nth);
      if (await row.count().catch(() => 0) === 0) {
        console.log(`Row '${label}' not found`);
        return;
      }
      const select = row.locator('select:not([disabled])').first();
      if (await select.count().catch(() => 0) === 0) {
        console.log(`No enabled select in row '${label}'`);
        return;
      }
      const options = await select.locator('option').allTextContents().catch(() => [] as string[]);
      const normalizeMatch = (s: string) => s.toLowerCase().replace(/[\s\-/]+/g, '');
      const needle = normalizeMatch(value);
      const match = options.find((o) => normalizeMatch(o).includes(needle));
      if (!match) {
        console.log(`No option matching '${value}' in row '${label}'`);
        return;
      }
      const code = match.split('-')[0]?.trim() || match;
      try {
        await select.selectOption({ label: match });
      } catch {
        await select.selectOption(code);
      }
      await this.page.waitForTimeout(1000);
      console.log(`Row selected '${label}' -> '${match}' (code: ${code})`);
    } catch (e) {
      console.log(`Could not row select '${label}': ${e}`);
    }
  }

  // ============ Generic Label-Based Helpers ============
  private async getFieldLocator(label: string, kind: 'input' | 'select', nth = 0, nameHint = ''): Promise<Locator | null> {
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
          const labelEls = Array.from(document.querySelectorAll('td, th'));
          const hint = nameHint.toLowerCase().trim();
          let seen = 0;
          for (const td of labelEls) {
            if (td.querySelector('td') || td.querySelector('th')) continue;
            const tdText = normalize(td.innerText || '');
            if (!tokens.every((tok) => tdText.includes(tok))) continue;
            const row = td.closest('tr') as HTMLTableRowElement | null;
            const cells = row ? Array.from(row.cells) : [];
            const idx = cells.indexOf(td as any);
            const valueCells = idx >= 0 ? cells.slice(idx + 1) : [];
            const roots = valueCells.length > 0 ? [...valueCells, td] : [td];
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

  private async fillByLabel(label: string, value: string, nth = 0, nameHint = '') {
    try {
      const input = await this.getFieldLocator(label, 'input', nth, nameHint);
      if (!input) {
        console.log(`No enabled input found for label '${label}'`);
        return;
      }
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
        if (optValue === needle || normalizedText.includes(needle)) {
          matchedValue = rawValue;
          found = true;
          break;
        }
      }
      if (!found) {
        const options = await optionLocator.allTextContents().catch(() => [] as string[]);
        const values = await optionLocator.evaluateAll((els: any[]) => els.map((e: any) => e.getAttribute('value') || '')).catch(() => [] as string[]);
        console.log(`No option matching '${value}' found for '${label}'. Options: ${JSON.stringify(options.map((t, i) => ({ text: t, value: values[i] })))}`);
        return;
      }
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

  // ============ Header / Function ============
  async selectFunction(value: string) {
    try {
      const finw = this.getFinwFrame();
      const selects = finw.locator('select');
      const count = await selects.count();
      for (let i = 0; i < count; i++) {
        const sel = selects.nth(i);
        const options = await sel.locator('option').allTextContents().catch(() => [] as string[]);
        const match = options.find((o) => o.toLowerCase().includes(value.toLowerCase()));
        if (match) {
          const code = match.split('-')[0]?.trim() || match;
          try {
            await sel.selectOption(code);
          } catch {
            await sel.selectOption({ label: match });
          }
          await this.page.waitForTimeout(1000);
          console.log(`Selected function: ${match}`);
          return;
        }
      }
      console.log(`Function dropdown matching '${value}' not found`);
    } catch (e) {
      console.log(`Could not select function '${value}': ${e}`);
    }
  }

  // ============ Issuance Details ============
  async enterIssueDate(date: string) {
    await this.fillByLabel('Issue date', date);
    await this.fillByLabel('Issue Date', date);
  }

  async enterValueDate(date: string) {
    await this.fillByLabel('Value date', date);
    await this.fillByLabel('Value Date', date);
  }

  /**
   * Selects the Demand Draft account through the CCY lookup popup.
   * Clicks the lookup icon next to Demand Draft a/c id, fills CCY in the popup,
   * clicks Submit, then selects the requested account from the list.
   */
  async selectDemandDraftAccountByCurrency(currency: string, accountId: string) {
    const finw = this.getFinwFrame();

    // 1) Click the lookup icon next to the Demand Draft a/c id input.
    const popupPromise = this.page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
    const opened = await finw.evaluate(() => {
      const input = document.querySelector('input[name="ddmi.ddAcctId"], input#ddAcctId') as HTMLInputElement | null;
      if (!input) return false;
      const cell = input.closest('td, th');
      if (!cell) return false;
      const row = cell.closest('tr');
      if (!row) return false;
      // Click the lookup icon next to the DD a/c id input (search_icon / explode / list anchors).
      const icon = row.querySelector('img[src*="search_icon" i], img[alt*="search" i], img[src*="explode" i], img[alt*="explode" i], a[href*="Xplode" i], a[href*="explode" i], a[href*="search_accountId" i], a[onclick*="Xplode" i], a[onclick*="explode" i]') as HTMLElement | null;
      if (icon) { icon.click(); return true; }
      return false;
    });

    const popup = await popupPromise;
    if (!opened || !popup) {
      console.log('Demand Draft lookup popup did not open');
      return;
    }
    let targetFrame: any = popup.mainFrame();
    try {
      await targetFrame.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    } catch {}
    await this.page.waitForTimeout(2000);
    for (const f of popup.frames()) {
      const hasInput = await f.evaluate(() => document.querySelectorAll('input, select, textarea').length > 0).catch(() => false);
      if (hasInput) { targetFrame = f; break; }
    }
    console.log(`Demand Draft lookup using frame: ${targetFrame.url().substring(targetFrame.url().lastIndexOf('/') + 1).substring(0, 80)}`);

    // 2) Fill the CCY field in the popup.
    const ccyResult = await targetFrame.evaluate((ccy) => {
      let input = document.querySelector('input[name="AcctCurrency"], input#AcctCurrency') as HTMLInputElement | HTMLSelectElement | null;
      if (!input) input = document.querySelector('input[name="consCrncy"], input#consCrncy, input[name="CCY" i], input#CCY, input[name="ccy" i], input#ccy, input[name*="ccy" i], input[id*="ccy" i], select[name="CCY" i], select#CCY, select[name="ccy" i], select#ccy, select[name*="ccy" i], select[id*="ccy" i]') as HTMLInputElement | HTMLSelectElement | null;
      if (input) {
        if (input.tagName === 'SELECT') {
          (input as HTMLSelectElement).value = ccy;
        } else {
          input.value = ccy;
          input.focus();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.blur();
          input.dispatchEvent(new Event('blur', { bubbles: true }));
        }
        return { found: true, tag: input.tagName, name: input.getAttribute('name'), id: input.id };
      }
      const allFields = Array.from(document.querySelectorAll('input, select')).map((el: any) => ({ tag: el.tagName, name: el.getAttribute('name') || '', id: el.id || '', placeholder: el.getAttribute('placeholder') || '', text: el.parentElement?.innerText?.substring(0, 60) || '' }));
      return { found: false, fields: allFields };
    }, currency);
    if (!ccyResult.found) {
      console.log('CCY field not found in Demand Draft lookup popup. Fields:', JSON.stringify(ccyResult.fields));
    } else {
      console.log(`Filled CCY with ${currency} (${ccyResult.tag} name=${ccyResult.name} id=${ccyResult.id})`);
    }

    // 3) Click the Submit/Go button in the popup.
    await targetFrame.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button, a[href^="javascript"]'));
      const btn = buttons.find((el: any) => {
        const text = (el.getAttribute('value') || el.textContent || '').toLowerCase();
        return /submit|go|search|ok/i.test(text);
      }) as HTMLElement | undefined;
      if (btn) btn.click();
    });
    await this.page.waitForTimeout(3000);
    await targetFrame.waitForURL(/search_accountId\.jsp/, { timeout: 15000 }).catch(() => {});
    await targetFrame.waitForFunction(() => document.body.innerText.includes('A/c. ID') || document.querySelectorAll('tr, li, tbody, table').length > 0, { timeout: 15000 }).catch(() => {});

    // Re-discover the results frame in case it navigated and was detached.
    for (const f of popup.frames()) {
      if (f.url().includes('search_accountId') && !f.url().includes('criteria')) { targetFrame = f; break; }
    }
    console.log(`DD lookup results frame: ${targetFrame.url().substring(targetFrame.url().lastIndexOf('/') + 1).substring(0, 80)}`);
    await targetFrame.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(3000);

    // Find the actual sub-frame that contains the account number in the list.
    let listFrame: any = null;
    for (const f of popup.frames()) {
      const hasAcct = await f.evaluate((acct) => document.body.innerText.includes(acct), accountId).catch(() => false);
      if (hasAcct) { listFrame = f; break; }
    }
    if (!listFrame) listFrame = targetFrame;
    targetFrame = listFrame;
    console.log(`DD lookup list frame: ${targetFrame.url().substring(targetFrame.url().lastIndexOf('/') + 1).substring(0, 80)}`);
    await targetFrame.waitForFunction((acct) => document.body.innerText.includes(acct), accountId, { timeout: 15000 }).catch(() => {});

    // 4) Select the requested account from the list.
    const selected = await targetFrame.evaluate((acctId) => {
      const rows = Array.from(document.querySelectorAll('tr, li'));
      for (const row of rows) {
        if (row.innerText.includes(acctId)) {
          const radio = row.querySelector('input[type="radio"]') as HTMLInputElement | null;
          const link = row.querySelector('a[href*="javascript"], a') as HTMLElement | null;
          if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); return true; }
          if (link) { link.click(); return true; }
          (row as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, accountId);
    if (selected) {
      console.log(`Selected account ${accountId} from Demand Draft lookup list`);
    } else {
      console.log(`Account ${accountId} not found in Demand Draft lookup list`);
    }

    await this.page.waitForTimeout(2000);
    if (!popup.isClosed()) {
      await popup.close().catch(() => {});
    }
  }

  async selectTransactionType(type: string) {
    const finw = this.getFinwFrame();
    const lower = type.toLowerCase();
    let selectedValue = 'TCI';
    if (lower.includes('cash')) selectedValue = 'C';
    else if (lower.includes('bank') || lower.includes('bank induced')) selectedValue = 'TBI';
    else if (lower.includes('customer') || lower.includes('customer induced')) selectedValue = 'TCI';

    const radio = finw.locator(`input[type="radio"][name="ddmi.purType"][value="${selectedValue}"]`).first();
    if (await radio.count().catch(() => 0) > 0) {
      await radio.click({ force: true }).catch(() => {});
      await finw.evaluate((val: string) => {
        const el = document.querySelector(`input[type="radio"][name="ddmi.purType"][value="${val}"]`) as HTMLInputElement | null;
        if (el) {
          el.checked = true;
          el.dispatchEvent(new Event('click', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, selectedValue).catch(() => {});
      await this.page.waitForTimeout(1000);
      console.log(`Selected Transaction Type value ${selectedValue}: ${type}`);
    } else {
      // Cancellation/post screens expose Transaction Type as a dropdown with simple C / T option values
      const dropdownValue = lower.includes('cash') ? 'C' : 'T';
      const txnTypeSelect =
        (await this.getFieldLocator('Transaction type', 'select')) ??
        (await this.getFieldLocator('Transaction Type', 'select'));
      if (txnTypeSelect) {
        await txnTypeSelect.selectOption({ value: dropdownValue }).catch(async () => {
          await txnTypeSelect.selectOption({ label: dropdownValue === 'C' ? 'C - Cash' : 'T - Transfer' }).catch(() => {});
        });
        await this.page.waitForTimeout(1000);
        console.log(`Selected Transaction Type dropdown value ${dropdownValue}: ${type}`);
      } else {
        await this.selectByRowLabel('Transaction type', type);
        await this.selectByRowLabel('Transaction Type', type);
        await this.selectByLabel('Transaction type', type);
        await this.selectByLabel('Transaction Type', type);
      }
    }
  }

  async selectPurchaserAccountType(type: string) {
    await this.selectByRowLabel('Purchaser A/c. ID', type, 0);
  }

  async enterPurchaserAccountId(accountId: string, _type?: string) {
    const finw = this.getFinwFrame();
    await finw.evaluate((acctId) => {
      const input = document.querySelector('input[name="ddmi.purAcctId"], input#purAcctId') as HTMLInputElement | null;
      if (input) {
        input.value = acctId;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, accountId);
    await this.page.waitForTimeout(1000);
    console.log(`Set Purchaser A/c. ID to '${accountId}'`);
  }

  async clickPurchaserGo() {
    const clicked = await this.getFinwFrame().evaluate((label) => {
      const normalize = (s?: string) => (s || '').toLowerCase().replace(/&nbsp;/g, ' ').replace(/setmandatory\([^)]+\)/g, '').replace(/\*/g, '').trim();
      const labelNorm = normalize(label);
      const iconHint = 'search_icon';
      const allCells = Array.from(document.querySelectorAll('td, th'));
      let labelCell: Element | null = null;
      for (const cell of allCells) {
        if (cell.querySelector('input, select, textarea')) continue;
        const cellText = normalize(cell.textContent || '');
        if (cellText === labelNorm || (cellText.length <= labelNorm.length + 5 && cellText.includes(labelNorm))) {
          labelCell = cell;
          break;
        }
      }
      if (!labelCell) return false;
      const cells: Element[] = [];
      let next: Element | null = labelCell;
      while (next && cells.length < 6) { cells.push(next); next = next.nextElementSibling; }
      const valueCell = cells[1] || null;
      if (valueCell) {
        const input = valueCell.querySelector('input[type="text"], input') as HTMLInputElement | null;
        if (input) {
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
          const onchange = (input as any).onchange;
          if (typeof onchange === 'function') onchange.call(input);
          const onblur = (input as any).onblur;
          if (typeof onblur === 'function') onblur.call(input);
        }
      }
      for (const cell of cells) {
        const clickables = Array.from(cell.querySelectorAll('img, input[type=\"image\"], a[href^=\"javascript\"], button, input[type=\"button\"]'));
        for (const el of clickables) {
          const src = ((el as HTMLImageElement | HTMLInputElement).src || '').toLowerCase();
          const alt = ((el as HTMLImageElement).alt || '').toLowerCase();
          const title = (el.getAttribute('title') || '').toLowerCase();
          const value = ((el as HTMLInputElement).value || '').toLowerCase();
          const onclick = (el.getAttribute('onclick') || '').toLowerCase();
          const cls = (el.className || '').toLowerCase();
          if (/line|help|calendar|date|picker|close|reset|clear|logout|signature/i.test(src + alt + title + cls + onclick)) continue;
          if (src.includes(iconHint) || alt.includes(iconHint) || title.includes(iconHint)) {
            (el as HTMLElement).click();
            return true;
          }
        }
      }
      return false;
    }, 'Purchaser A/c. ID');
    if (clicked) {
      console.log('Clicked Purchaser A/c. ID Go/search icon via DOM');
    } else {
      console.log('No Purchaser A/c. ID Go/search icon found, clicking bottom Go');
      const finw = this.getFinwFrame();
      const bottomGo = finw.locator('input[type="button"][value="Go"], input[type="submit"][value="Go"], button:has-text("Go")').last();
      if (await bottomGo.count().catch(() => 0) > 0) await bottomGo.click();
    }
    await this.page.waitForTimeout(3000);
  }

  async enterDemandDraftAmount(amount: string) {
    await this.fillByRowLabel('Demand Draft Amt', amount, 0);
    await this.fillByLabel('Demand draft amt', amount);
    await this.fillByLabel('Demand Draft Amount', amount);
    await this.fillByLabel('DD amount', amount);
  }

  async enterPayee(name: string) {
    await this.fillByRowLabel('Payee', name, 0);
    await this.fillByLabel('Payee', name);
  }

  // ============ Action Buttons ============

  private async acceptExceptionPopup(timeout = 10000): Promise<void> {
    const start = Date.now();
    const clicked = new Set<Page>();
    while (Date.now() - start < timeout) {
      for (const popup of this.page.context().pages()) {
        if (popup.url().includes('excp_popup_screen') && !popup.isClosed() && !clicked.has(popup)) {
          try {
            await popup.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
            const accept = popup.locator('input#accept, input[type="button"][value="Accept" i], input[type="submit"][value="Accept" i], button:has-text("Accept")').first();
            if ((await accept.count().catch(() => 0)) > 0) {
              await accept.click().catch(() => {});
              clicked.add(popup);
              console.log('Accepted exception popup');
              await popup.waitForEvent('close', { timeout: 15000 }).catch(() => {});
            }
          } catch {}
        }
      }
      await this.page.waitForTimeout(500);
    }
    if (clicked.size > 0) {
      await this.page.waitForTimeout(2000);
    }
  }

  async clickFeeDetails() {
    await this.clickButtonByValue('Fee details');
    await this.clickButtonByValue('Fee Details');
    await this.clickButtonById('feeDetails');
  }

  async clickAccept() {
    await this.clickButtonByValue('Accept');
    await this.clickButtonById('Accept');
  }

  async logAllFieldLabels() {
    const finw = this.getFinwFrame();
    await finw.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td.textlabel, td.textlabel1, th.textlabel, th.textlabel1'));
      const rows = cells.map((td, i) => {
        const label = td.innerText.replace(/\s+/g, ' ').replace(/setMandatory\([^)]*\)/gi, '').trim();
        const valueCell = td.nextElementSibling;
        const input = valueCell ? valueCell.querySelector('input:not([type="hidden"]), select, textarea') as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) | null : null;
        return {
          i,
          label,
          tag: input?.tagName || 'none',
          name: input?.getAttribute('name') || '',
          id: input?.getAttribute('id') || '',
          max: (input as HTMLInputElement)?.maxLength ?? '-',
          value: input?.value || ''
        };
      });
      console.log('=== ALL FIELD LABELS ===');
      rows.forEach((r) => console.log(JSON.stringify(r)));
    });
  }

  async clickSubmit() {
    const finw = this.getFinwFrame();
    // Prefer explicit action buttons (Submit/Cancel/Delete/Post) over a generic Go
    const actionBtn = finw.locator(
      'input[type="button"][value="Submit" i], input[type="submit"][value="Submit" i], ' +
      'input[type="button"][value="Cancel" i], input[type="submit"][value="Cancel" i], ' +
      'input[type="button"][value="Delete" i], input[type="submit"][value="Delete" i], ' +
      'input[type="button"][value="Post" i], input[type="submit"][value="Post" i], ' +
      '#Submit, #Cancel, #Delete, #Post, ' +
      'button:has-text("Submit"), button:has-text("Cancel"), button:has-text("Delete"), button:has-text("Post")'
    ).first();
    if (await actionBtn.count().catch(() => 0) > 0) {
      await actionBtn.click();
      console.log('Clicked action submit button');
    } else {
      const goBtn = finw.locator('input[type="button"][value="Go"], input[type="submit"][value="Go"], button:has-text("Go")').last();
      if (await goBtn.count().catch(() => 0) > 0) {
        await goBtn.click();
        console.log('Clicked bottom Go (submit)');
      } else {
        await this.clickButtonById('Submit');
        await this.clickButtonByValue('Submit');
        await this.clickButtonByValue('Go');
      }
    }
    await this.acceptExceptionPopup(10000);
    await this.page.waitForTimeout(3000);
  }

  async clickOk() {
    await this.clickButtonByValue('Ok');
    await this.clickButtonByValue('OK');
    await this.clickButtonById('Ok');
  }

  async clickGo() {
    // Try the Go button that comes after the Transaction Id input in the DOM
    const txnInput = await this.getFieldLocator('Transaction id', 'input').catch(() => null);
    const clickedNextTo = await (txnInput?.evaluate((el: HTMLElement) => {
      const goSelector = 'input[type="button"][value="Go" i], input[type="submit"][value="Go" i], input[type="image"][alt*="Go" i], input[type="image"][title*="Go" i], button';
      const allGo = Array.from(document.querySelectorAll(goSelector));
      const firstAfter = allGo.find((go) => (el.compareDocumentPosition(go) & Node.DOCUMENT_POSITION_FOLLOWING)) as HTMLElement | undefined;
      if (firstAfter) { firstAfter.click(); return true; }
      return false;
    }) ?? Promise.resolve(false));
    if (!clickedNextTo) {
      await this.clickButtonById('Go');
      await this.clickButtonByValue('Go');
    } else {
      console.log('Clicked Go after Transaction Id input');
      await this.page.waitForTimeout(1000);
    }
    await this.acceptExceptionPopup(10000);
  }

  // ============ Transaction ID Capture ============
  async enterTransactionId(transactionId: string) {
    await this.fillByLabel('Transaction id', transactionId);
    await this.fillByLabel('Transaction Id', transactionId);
    await this.fillByLabel('Transaction ID', transactionId);
  }

  async getTransactionId(): Promise<string | null> {
    const messages = this.lastDialogMessages;
    const patterns = [
      /(?:transaction|txn|tran)\s*(?:id|#|ref|number)?\s*[:=]?\s*([A-Z]{1,3}\d{2,})/i,
      /(?:transaction|txn|tran)\s*(?:id|#|ref|number)?\s*[:=]?\s*([A-Z]\d{3,})/i,
      /\b(CB\d{2,})\b/i,
      /\b(S\d{10,})\b/,
      /\b(\d{8,})\b/,
    ];

    // 1) Dialog messages first
    for (const msg of messages) {
      for (const pat of patterns) {
        const m = msg.match(pat);
        if (m && m[1]) {
          console.log(`Extracted DD Transaction ID from dialog: ${m[1]}`);
          return m[1];
        }
      }
    }

    // 2) FINW frame body
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
      'input[name="tranId"]',
      '#tranId',
      'input[name="transactionId"]',
      'input[name="txnId"]',
      '#transactionId',
      '#txnId',
      'input[id="transactionId"]',
      'input[id="txnId"]',
      '[name*="transactionId" i]',
      '[id*="transactionId" i]',
    ];
    for (const sel of candidates) {
      const el = finwFrame.locator(sel).first();
      if (await el.count().catch(() => 0) > 0) {
        const val = (await el.inputValue().catch(() => '')).trim();
        if (val) {
          console.log(`Extracted DD Transaction ID from field ${sel}: ${val}`);
          return val;
        }
      }
    }

    // 3) Scan all frames for transaction id patterns
    for (const frame of this.page.frames()) {
      const text = await frame.evaluate(() => document.body?.innerText || '').catch(() => '');
      for (const pat of patterns) {
        const m = text.match(pat);
        if (m && m[1]) {
          console.log(`Extracted DD Transaction ID from frame '${frame.name() || 'main'}': ${m[1]}`);
          return m[1];
        }
      }
    }

    console.log('Could not extract DD Transaction ID');
    return null;
  }

  async logFieldIcons() {
    const info = await this.getFinwFrame().evaluate(() => {
      return Array.from(document.querySelectorAll('tr'))
        .map((tr) => {
          const tds = Array.from(tr.querySelectorAll('td, th'));
          const first = tds[0] as HTMLElement | undefined;
          const second = tds[1] as HTMLElement | undefined;
          const label = [first, second].map((c) => (c ? (c.textContent || '').trim() : '')).join(' | ');
          const icons = Array.from(tr.querySelectorAll('img, input[type="image"], a[href^="javascript"], button, input[type="button"]'))
            .slice(0, 4)
            .map((el) => {
              const tag = el.tagName;
              const src = ((el as HTMLImageElement | HTMLInputElement).src || '').split('/').pop() || '';
              const alt = ((el as HTMLImageElement).alt || '');
              const title = el.getAttribute('title') || '';
              const value = ((el as HTMLInputElement).value || '');
              const onclick = (el.getAttribute('onclick') || '').slice(0, 60);
              return { tag, src, alt, title, value, onclick };
            });
          return { label, icons };
        })
        .filter((r) => /demand draft|purchaser|transaction type/i.test(r.label));
    });
    console.log('FIELD ICONS:', JSON.stringify(info, null, 2));
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
