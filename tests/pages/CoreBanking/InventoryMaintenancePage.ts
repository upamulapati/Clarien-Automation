import { Page, Frame, Locator } from '@playwright/test';
import { captureEvidence } from '../../helpers/evidence';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Page object for the Finacle HIMC (Inventory Maintenance) screens.
 *
 * Uses label-based lookups so it survives small Finacle HTML changes. The
 * methods fall back gracefully when a field is not found; assertions live in
 * the spec files.
 */
export class InventoryMaintenancePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ============ Frame Helpers ============
  private getFinwFrame(): Frame {
    const finwFrame = this.page.frame({ name: 'FINW' });
    if (!finwFrame) {
      throw new Error('FINW frame not found!');
    }
    return finwFrame;
  }

  // ============ Generic Label-Based Locator ============
  private async getFieldLocator(label: string, kind: 'input' | 'select', nth = 0, nameHint = ''): Promise<Locator | null> {
    try {
      const finw = this.getFinwFrame();
      const found = await finw.evaluate(
        ({ label, kind, nth, nameHint }) => {
          const normalize = (s?: string) =>
            (s || '')
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
            const tdText = normalize((td as HTMLElement).innerText || '');
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
        console.log(`No option matching '${value}' found for '${label}'. Options: ${JSON.stringify(options)}`);
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

  // ============ Lookup / Search Helpers ============
  private async clickSearchIconForLabel(label: string, nth = 0) {
    try {
      const finw = this.getFinwFrame();
      const clicked = await finw.evaluate(({ label, nth }: { label: string; nth: number }) => {
        const normalize = (s?: string) =>
          (s || '')
            .toLowerCase()
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const tokens = normalize(label)
          .split(' ')
          .filter((t) => t.length > 1);
        const cells = Array.from(document.querySelectorAll('td, th'));
        let seen = 0;
        for (const cell of cells) {
          if (cell.querySelector('td') || cell.querySelector('th')) continue;
          const cellText = normalize(cell.textContent || '');
          if (!tokens.every((tok) => cellText.includes(tok))) continue;
          if (seen < nth) { seen++; continue; }

          // Prefer clickable icons in value cells that come after the label cell.
          let sibling: Element | null = cell.nextElementSibling;
          while (sibling) {
            const clickables = Array.from(sibling.querySelectorAll('img, input[type="image"], a[href^="javascript"], a[href*="Xplode" i], a[onclick*="Xplode" i], a[onclick*="explode" i], a[onclick*="search" i], button, input[type="button"]'));
            for (const el of clickables) {
              const src = ((el as HTMLImageElement).src || '').toLowerCase();
              const alt = ((el as HTMLImageElement).alt || '').toLowerCase();
              const title = (el.getAttribute('title') || '').toLowerCase();
              const cls = (el.className || '').toLowerCase();
              const onclick = (el.getAttribute('onclick') || '').toLowerCase();
              if (/search|explode|xplode|lov|lookup/i.test(src + alt + title + cls + onclick)) {
                (el as HTMLElement).click();
                return true;
              }
            }
            sibling = sibling.nextElementSibling;
          }

          // Fallback: any matching clickable in the whole row.
          const row = cell.closest('tr');
          if (row) {
            const clickables = Array.from(row.querySelectorAll('img, input[type="image"], a[href^="javascript"], a[href*="Xplode" i], a[onclick*="Xplode" i], a[onclick*="explode" i], a[onclick*="search" i], button, input[type="button"]'));
            for (const el of clickables) {
              const src = ((el as HTMLImageElement).src || '').toLowerCase();
              const alt = ((el as HTMLImageElement).alt || '').toLowerCase();
              const title = (el.getAttribute('title') || '').toLowerCase();
              const cls = (el.className || '').toLowerCase();
              const onclick = (el.getAttribute('onclick') || '').toLowerCase();
              if (/search|explode|xplode|lov|lookup/i.test(src + alt + title + cls + onclick)) {
                (el as HTMLElement).click();
                return true;
              }
            }
          }

          // No icon: try clicking the cell itself if it is a link
          if ((cell as HTMLElement).click) (cell as HTMLElement).click();
          return true;
        }
        return false;
      }, { label, nth });
      if (clicked) {
        console.log(`Clicked search icon for '${label}' (nth ${nth})`);
      } else {
        console.log(`Search icon for '${label}' not found`);
      }
      return !!clicked;
    } catch (e) {
      console.log(`Could not click search icon for '${label}': ${e}`);
      return false;
    }
  }

  private async selectInPopup(value: string, filterClass?: string) {
    try {
      let popup: Page | null = null;
      for (let i = 0; i < 20; i++) {
        const popups = this.page.context().pages().filter((p) => p !== this.page && !p.isClosed());
        if (popups.length > 0) { popup = popups[popups.length - 1]; break; }
        await this.page.waitForTimeout(250);
      }
      if (!popup) {
        console.log('No separate popup detected for lookup; trying FINW frame body');
        return await this.selectInFinwFrame(value);
      }

      await popup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await popup.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await popup.waitForTimeout(3000);

      if (filterClass) {
        try {
          await popup.evaluate((args: { cls: string }) => {
            const classEl = document.querySelector('input[name="invt_locn_class"], input#invt_locn_class') as HTMLInputElement | null;
            const codeEl = document.querySelector('input[name="invt_locn_code"], input#invt_locn_code') as HTMLInputElement | null;
            if (classEl) {
              classEl.value = args.cls;
              classEl.dispatchEvent(new Event('input', { bubbles: true }));
              classEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (codeEl) {
              codeEl.value = '';
              codeEl.dispatchEvent(new Event('input', { bubbles: true }));
              codeEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, { cls: filterClass });
          let clicked = false;
          const searchBtn = popup.locator('img#sLnk2, img[alt="Search"], input[type="image"][alt="Search"], input[type="button"][value="Search"]').first();
          if (await searchBtn.count() > 0) {
            await searchBtn.click({ force: true }).catch(() => {});
            clicked = true;
          }
          if (!clicked) {
            clicked = await popup.evaluate(() => {
              const win = window as any;
              if (typeof win.fnSearch === 'function') { win.fnSearch(); return true; }
              const img = document.getElementById('sLnk2') as HTMLElement | null;
              if (img) { img.click(); return true; }
              return false;
            });
          }
          if (clicked) {
            try {
              await popup.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
            } catch {}
            await popup.waitForTimeout(3000);
          }
        } catch (e) {
          console.log(`Could not search code popup by class '${filterClass}': ${e}`);
        }
      }

      let selected = '';
      for (let pageNum = 0; pageNum < 20; pageNum++) {
        selected = await popup.evaluate(async (args: { val: string; filterClass?: string }) => {
          const normalize = (s?: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
          const { val, filterClass } = args;
          const needle = normalize(val);
          const classNeedle = filterClass ? normalize(filterClass) : null;

          const findMatch = () => {
            const cells = Array.from(document.querySelectorAll('td, th')).filter((el) => {
              const text = normalize((el as HTMLElement).textContent || '');
              return text.includes(needle) && text.length > 0;
            });
            for (const cell of cells) {
              const text = normalize((cell as HTMLElement).textContent || '');
              const row = cell.closest('tr, li, div.row, div[role="row"]');
              const rowText = row ? normalize(row.textContent || '') : '';
              if (!classNeedle || rowText.includes(classNeedle)) {
                if (text === needle || text.split(' ').includes(needle)) return cell;
              }
            }
            if (cells.length > 0) return cells[0];

            const rows = Array.from(document.querySelectorAll('tr, li, div.row, div[role="row"]'));
            for (const row of rows) {
              const text = normalize(row.textContent || '');
              if (text.includes(needle) && text.length > 0 && (!classNeedle || text.includes(classNeedle))) {
                return row;
              }
            }
            return null;
          };

          const clickMatch = (row: Element): string => {
            const radio = row.querySelector('input[type="radio"]') as HTMLInputElement | null;
            if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); return 'radio'; }

            const tr = row.closest('tr');
            const rowLink = tr ? (tr.querySelector('a[href*="javascript"], a[href*="#"], a[onclick]') as HTMLElement | null) : null;
            if (rowLink) { rowLink.click(); return 'link-in-row'; }

            (row as HTMLElement).click();
            return 'row';
          };

          const match = findMatch();
          if (match) {
            const method = clickMatch(match);
            return method;
          }
          return '';
        }, { val: value, filterClass });

        if (selected) break;

        const canNext = await popup.evaluate(() => {
          const win = window as any;
          return typeof win.bEnableNext !== 'undefined' ? !!win.bEnableNext : true;
        });
        if (!canNext) break;

        let nextTriggered = false;
        try {
          const nextImg = popup.locator('img#sLnk4, img[alt="Next"], img[hotkeyid="Next"], img[name="Next"]').first();
          if (await nextImg.count() > 0) {
            await nextImg.click({ force: true }).catch(() => {});
            nextTriggered = true;
          }
        } catch (e) {
          nextTriggered = false;
        }
        if (!nextTriggered) {
          try {
            nextTriggered = await popup.evaluate(() => {
              const win = window as any;
              if (typeof win.fnNext === 'function') { win.fnNext(); return true; }
              if (typeof win.fnNextPage === 'function') { win.fnNextPage(); return true; }
              if (typeof win.next === 'function') { win.next(); return true; }
              const nextImg = document.getElementById('sLnk4') as HTMLImageElement | null;
              if (nextImg) { nextImg.click(); return true; }
              return false;
            });
          } catch (e) {
            nextTriggered = true;
          }
        }
        if (!nextTriggered) break;

        try {
          await popup.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
          await popup.waitForTimeout(1000);
        } catch (e) {
          await popup.waitForTimeout(1000);
        }
      }

      if (selected) {
        console.log(`Selected '${value}' in popup (method: ${selected})`);
        try {
          if (!popup.isClosed()) await popup.waitForTimeout(1500);
        } catch (e) {
          // popup may already be closing
        }
      } else {
        console.log(`'${value}' not found in popup`);
        try {
          const staticHtml = await popup.content().catch(() => '');
          const renderedHtml = await popup.evaluate(() => {
            try { return document.documentElement?.outerHTML || ''; } catch { return ''; }
          }).catch(() => '');
          const staticFile = path.join(process.cwd(), 'data', `himc-popup-${value}.html`);
          const renderedFile = path.join(process.cwd(), 'data', `himc-popup-rendered-${value}.html`);
          fs.writeFileSync(staticFile, staticHtml, 'utf-8');
          fs.writeFileSync(renderedFile, renderedHtml, 'utf-8');
          console.log(`Saved popup HTML for '${value}' to ${staticFile} and ${renderedFile} (url: ${popup.url()})`);
        } catch (saveErr) {
          console.log(`Could not save popup debug HTML: ${saveErr}`);
        }
      }
      if (!popup.isClosed()) await popup.close().catch(() => {});
      return !!selected;
    } catch (e) {
      console.log(`Could not select '${value}' in popup: ${e}`);
      return false;
    }
  }

  private async selectInFinwFrame(value: string) {
    try {
      const finw = this.getFinwFrame();
      const selected = await finw.evaluate((val) => {
        const normalize = (s?: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const needle = normalize(val);
        const rows = Array.from(document.querySelectorAll('tr, li, div.row, div[role="row"], span'));
        for (const row of rows) {
          const text = normalize(row.textContent || '');
          if (text.includes(needle)) {
            const radio = row.querySelector('input[type="radio"]') as HTMLInputElement | null;
            if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); return 'radio'; }
            const link = row.querySelector('a') as HTMLElement | null;
            if (link) { link.click(); return 'link'; }
            (row as HTMLElement).click();
            return 'row';
          }
        }
        return '';
      }, value);
      if (selected) {
        console.log(`Selected '${value}' in FINW frame (method: ${selected})`);
        await this.page.waitForTimeout(1000);
      }
      return !!selected;
    } catch (e) {
      console.log(`Could not select '${value}' in FINW frame: ${e}`);
      return false;
    }
  }

  /**
   * Selects a value for the given label by:
   * 1. Using a dropdown if one is in the same row.
   * 2. Filling any input field for the label.
   * 3. Clicking the search/lookup icon and selecting from the popup/list.
   */
  async selectBySearch(label: string, value: string, nth = 0, nameHint = '', filterClass?: string) {
    try {
      const select = await this.getFieldLocator(label, 'select', nth, nameHint);
      if (select) {
        const options = await select.locator('option').allTextContents().catch(() => [] as string[]);
        const normalizedValue = value.toLowerCase().replace(/\s+/g, ' ').trim();
        const match = options.find((o) => o.toLowerCase().replace(/\s+/g, ' ').trim().includes(normalizedValue));
        if (match) {
          const code = match.split('-')[0]?.trim() || match;
          try {
            await select.selectOption({ label: match });
          } catch {
            await select.selectOption(code).catch(() => {});
          }
          await this.page.waitForTimeout(1000);
          console.log(`Selected '${value}' for '${label}' via dropdown`);
          return;
        }
      }

      let clicked = false;
      if (nameHint) {
        const finw = this.getFinwFrame();
        const anchor = finw.locator(`a[href*="${nameHint}"]`).first();
        if (await anchor.count().catch(() => 0) > 0) {
          await anchor.click();
          clicked = true;
        }
      }
      if (!clicked) {
        clicked = await this.clickSearchIconForLabel(label, nth);
      }
      if (clicked) {
        await this.page.waitForTimeout(2000);
        await this.selectInPopup(value, filterClass);
      } else {
        console.log(`Lookup icon/anchor for '${label}' not found`);
      }
    } catch (e) {
      console.log(`Could not select '${value}' for '${label}': ${e}`);
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
          await captureEvidence(this.page, `Function selected: ${match}`, { function: match });
          return;
        }
      }
      console.log(`Function dropdown matching '${value}' not found`);
    } catch (e) {
      console.log(`Could not select function '${value}': ${e}`);
    }
  }

  // ============ HIMC Field Actions ============
  async enterTransactionDate(date: string) {
    // The visible transaction date is usually read-only; try the hidden/actual input first.
    const finw = this.getFinwFrame();
    const candidates = ['tranDate', 'transDate', 'transactionDate', 'txnDate', 'trnDate', 'tran_date', 'trans_date'];
    for (const name of candidates) {
      try {
        const el = finw.locator(`input[name="${name}"]`).first();
        if (await el.count() > 0) {
          await el.fill('');
          await el.fill(date);
          await this.page.waitForTimeout(500);
          const val = await el.inputValue().catch(() => '');
          console.log(`Filled transaction date by name '${name}': '${val}'`);
          return;
        }
      } catch (_) {}
    }
    console.log(`Transaction date is auto-populated; not editable. Expected: ${date}`);
  }

  async clickGo() {
    await this.clickButtonByValue('Go');
    await this.clickButtonByValue('go');
    await this.page.waitForTimeout(2000);
    await captureEvidence(this.page, 'Inventory Go clicked', {});
  }

  async clickAccept() {
    try {
      const finw = this.getFinwFrame();
      const btn = finw.locator(
        'button:has-text("Accept"), input[type="button"][value="Accept" i], ' +
        'input[type="submit"][value="Accept" i], #Accept'
      ).first();
      if (await btn.count() > 0) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        console.log('Clicked Accept button');
      } else {
        console.log('Accept button not found');
      }
    } catch (e) {
      console.log(`Could not click Accept: ${e}`);
    }
    await this.page.waitForTimeout(3000);
    await captureEvidence(this.page, 'Inventory Accept clicked', {});
  }

  async selectFromLocationClass(value: string) {
    await this.selectInvtClass('From', value);
  }

  async selectFromLocationCode(classValue: string, code: string) {
    await this.selectBySearch('From Location code', code, 0, 'invtLocnCodeFrom', classValue);
  }

  async selectToLocationClass(value: string) {
    await this.selectInvtClass('To', value);
  }

  async selectToLocationCode(classValue: string, code: string) {
    await this.selectBySearch('To Location code', code, 0, 'invtLocnCodeTo', classValue);
  }

  private async selectInvtClass(direction: 'From' | 'To', value: string) {
    const finw = this.getFinwFrame();
    let selected = false;
    const slnkId = direction === 'From' ? 'slnk4' : 'slnk6';
    const link = finw.locator(`a#${slnkId}, a[href*="invtLocnClass${direction}"]`).first();
    if (await link.count() > 0) {
      await link.click();
      await this.page.waitForTimeout(2000);
      selected = await this.selectInPopup(value);
    } else {
      await this.clickSearchIconForLabel(`${direction} Location class`, 0);
      selected = await this.selectInPopup(value);
    }

    const input = finw.locator(`input#invtLocnClass${direction}, input[name="invtLocnClass${direction}"]`).first();
    let actualValue = '';
    if (await input.count() > 0) {
      actualValue = (await input.inputValue().catch(() => '')).trim().toUpperCase();
    }
    if (!selected || actualValue !== value.toUpperCase()) {
      if (await input.count() > 0) {
        await input.fill('');
        await input.fill(value);
        await input.blur();
        await input.evaluate((el) => (el as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true })));
        console.log(`Filled ${direction} Location class directly with '${value}' (LOV left it as '${actualValue}')`);
      }
    } else {
      console.log(`Selected ${direction} Location class '${value}' via LOV`);
    }
  }

  private async fillInvtCode(direction: 'From' | 'To', value: string) {
    const label = `${direction} Location code`;
    const input = await this.getFieldLocator(label, 'input', 0, `${direction.toLowerCase()}loccode`);
    if (input) {
      try {
        await input.fill('');
        await input.fill(value);
        await input.press('Tab');
        await this.page.waitForTimeout(2500);
        const after = await input.inputValue().catch(() => '');
        console.log(`Set ${label} to '${after}' and triggered validation`);
      } catch (e) {
        console.log(`Could not set ${label}: ${e}`);
      }
    } else {
      console.log(`Input for ${label} not found; falling back to search`);
      await this.selectBySearch(label, value, 0, `invtLocnCode${direction}`);
    }
  }

  async selectInventoryDetails(value: string) {
    const finw = this.getFinwFrame();
    const searchIcon = finw.locator('a#sLnk3, a[href*="fnShowInvtClassList"], a[href*="fnShowInvtList"]').first();
    if (await searchIcon.count() > 0) {
      await searchIcon.click();
      await this.page.waitForTimeout(2000);
      await this.selectInPopup(value);
    } else {
      console.log('Inventory LOV icon not found; falling back to search');
      await this.selectBySearch('Inventory', value, 0, 'inventory');
    }
  }

  async enterStartNumber(value: string) {
    const finw = this.getFinwFrame();
    const selectors = [
      'input#invtBeginSrlNum',
      'input[name="imc.invtBeginSrlNum"]',
      'input#invtBeginSrlNum_ui',
      'input[name="imc.invtBeginSrlNum_ui"]',
      'input#startNo',
      'input[name="startNo"]',
      'input#startNo_ui',
      'input[name="startNo_ui"]',
      'input#invtStartNo',
      'input[name="invtStartNo"]',
    ];
    for (const sel of selectors) {
      try {
        const el = finw.locator(sel).first();
        if (await el.count() > 0) {
          await el.fill('');
          await el.fill(value);
          await this.page.waitForTimeout(500);
          const after = await el.inputValue().catch(() => '');
          console.log(`Filled start number with selector '${sel}' (after: '${after}')`);
          return;
        }
      } catch (_) {}
    }
    await this.fillByLabel('Start no', value);
    await this.fillByLabel('Start No', value);
    await this.fillByLabel('start no', value);
  }

  async enterEndNumber(value: string) {
    const finw = this.getFinwFrame();
    const selectors = [
      'input#invtEndSrlNum',
      'input[name="imc.invtEndSrlNum"]',
      'input#invtEndSrlNum_ui',
      'input[name="imc.invtEndSrlNum_ui"]',
      'input#endNo',
      'input[name="endNo"]',
      'input#endNo_ui',
      'input[name="endNo_ui"]',
      'input#invtEndNo',
      'input[name="invtEndNo"]',
    ];
    for (const sel of selectors) {
      try {
        const el = finw.locator(sel).first();
        if (await el.count() > 0) {
          await el.fill('');
          await el.fill(value);
          await this.page.waitForTimeout(500);
          const after = await el.inputValue().catch(() => '');
          console.log(`Filled end number with selector '${sel}' (after: '${after}')`);
          return;
        }
      } catch (_) {}
    }
    await this.fillByLabel('End no', value);
    await this.fillByLabel('End No', value);
    await this.fillByLabel('end no', value);
  }

  async enterTransferParticulars(value: string) {
    const finw = this.getFinwFrame();
    const selectors = [
      'input[name="imc.invtXferPartcls"]',
      'input[name="invtXferPartcls"]',
      'input#invtXferPartcls',
    ];
    for (const sel of selectors) {
      try {
        const el = finw.locator(sel).first();
        if (await el.count() > 0) {
          await el.fill('');
          await el.fill(value);
          await this.page.waitForTimeout(300);
          console.log(`Filled transfer particulars with selector '${sel}'`);
          return;
        }
      } catch (_) {}
    }
    await this.fillByLabel('Transfer Particulars', value);
    await this.fillByLabel('Transfer particulars', value);
  }

  async enterTransactionId(transactionId: string) {
    await this.fillByLabel('Transaction id', transactionId);
    await this.fillByLabel('Transaction Id', transactionId);
    await this.fillByLabel('Transaction ID', transactionId);
  }

  async clickSubmit() {
    try {
      const finw = this.getFinwFrame();
      const submit = finw.locator(
        '#Submit, input[type="submit"], input[type="button"][value="Submit" i], ' +
        'input[type="button"][value="SUBMIT" i], button:has-text("Submit"), .submit'
      ).first();
      if (await submit.count() > 0) {
        await submit.scrollIntoViewIfNeeded();
        await submit.click();
        console.log('Clicked submit button');
        await captureEvidence(this.page, 'Inventory submit clicked', {});
        return;
      }
      // Fallback: HIMC uses 'Accept' as the transaction submit on some screens.
      const accept = finw.locator(
        'button:has-text("Accept"), input[type="button"][value="Accept" i], ' +
        'input[type="submit"][value="Accept" i], #Accept'
      ).first();
      if (await accept.count() > 0) {
        await accept.scrollIntoViewIfNeeded();
        await accept.click();
        console.log('Clicked Accept as submit fallback');
        await captureEvidence(this.page, 'Inventory submit (Accept fallback)', {});
        return;
      }
      await this.clickButtonByValue('Submit');
      await this.clickButtonByValue('SUBMIT');
      await this.clickButtonByValue('submit');
    } catch (e) {
      console.log(`Could not click submit: ${e}`);
    }
    await this.page.waitForTimeout(3000);
  }

  async clickValidate() {
    try {
      const finw = this.getFinwFrame();
      const validate = finw.locator('#Validate, input[type="button"][value="Validate" i], input[type="submit"][value="Validate" i], button:has-text("Validate")').first();
      if (await validate.count() > 0) {
        await validate.scrollIntoViewIfNeeded();
        await validate.click();
        console.log('Clicked Validate button');
      } else {
        console.log('Validate button not found; skipping');
      }
    } catch (e) {
      console.log(`Could not click validate: ${e}`);
    }
    await this.page.waitForTimeout(3000);
  }

  // ============ Verification Fallback ============
  async verifyExistingTransaction(
    transactionDate: string,
    fromClass?: string,
    fromCode?: string,
    toClass?: string,
    toCode?: string
  ): Promise<string | null> {
    try {
      // Open Inquire criteria and use the Inventory Transaction. ID search icon
      // to list and select the pending unverified transaction for today.
      await this.selectFunction('Inquire');
      await this.enterTransactionDate(transactionDate);
      await this.page.waitForTimeout(1000);

      const transactionId = await this.searchAndSelectTransactionId(
        transactionDate,
        fromClass,
        fromCode,
        toClass,
        toCode
      );
      if (!transactionId) {
        console.log('Could not find an existing unverified transaction ID to verify');
        return null;
      }

      console.log(`Found existing unverified transaction ID: ${transactionId}`);
      const finw = this.getFinwFrame();
      const text = await this.getPageText();
      const html = await finw.content().catch(() => '');
      fs.writeFileSync(path.join(process.cwd(), 'data', 'himc-inquire-text.txt'), text, 'utf-8');
      fs.writeFileSync(path.join(process.cwd(), 'data', 'himc-inquire-page.html'), html, 'utf-8');

      return await this.verifyByTransactionId(transactionDate, transactionId);
    } catch (e) {
      console.log(`Error in verifyExistingTransaction: ${e}`);
      return null;
    }
  }

  private async searchAndSelectTransactionId(
    transactionDate: string,
    fromClass?: string,
    fromCode?: string,
    toClass?: string,
    toCode?: string
  ): Promise<string | null> {
    try {
      const finw = this.getFinwFrame();
      const searchLink = finw.locator(
        'a#sLnk2, a[href*="HSRITRID"], a[href*="invtTranId"], a[href*="showDynCritSearcher"]'
      ).first();
      if (await searchLink.count() === 0) {
        console.log('Search icon for Inventory Transaction. ID not found');
        return null;
      }

      let popup: Page | null = null;
      [popup] = await Promise.all([
        this.page.waitForEvent('popup', { timeout: 10000 }).catch(() => null as unknown as Page),
        searchLink.click(),
      ]);
      if (!popup) {
        console.log('No popup opened for transaction ID search');
        return null;
      }

      await popup.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
      await popup.waitForTimeout(3000);
      const html = await popup.content().catch(() => '');
      fs.writeFileSync(path.join(process.cwd(), 'data', 'himc-txnid-popup.html'), html, 'utf-8');

      // Fill the criteria fields in the popup.
      if (fromClass) await this.safeFillInPopup(popup, 'invt_locn_class_from', fromClass);
      if (fromCode) await this.safeFillInPopup(popup, 'invt_locn_code_from', fromCode);
      if (toClass) await this.safeFillInPopup(popup, 'invt_locn_class_to', toClass);
      if (toCode) await this.safeFillInPopup(popup, 'invt_locn_code_to', toCode);
      await this.safeFillInPopup(popup, 'from_date_ui', transactionDate);
      await this.safeFillInPopup(popup, 'to_date_ui', transactionDate);
      await this.safeSelectInPopup(popup, 'invt_status', 'E');

      // Submit the criteria to get the results.
      const submit = popup.locator(
        'input#Submit, input[type="button"][value="Submit" i], input[name="Submit"], #Submit'
      ).first();
      if (await submit.count() > 0) {
        await submit.click();
      } else {
        console.log('Submit button not found in transaction ID criteria popup');
      }
      await popup.waitForTimeout(4000);
      const resultHtml = await popup.content().catch(() => '');
      fs.writeFileSync(path.join(process.cwd(), 'data', 'himc-txnid-result.html'), resultHtml, 'utf-8');

      // Try to select the first result row.
      const selected = await popup.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr, li, div.row, div[role="row"]'));
        for (const row of rows) {
          if (row.querySelector('th, thead')) continue;
          const text = (row.textContent || '').trim();
          if (!text || text.length < 2) continue;
          const radio = row.querySelector('input[type="radio"]') as HTMLInputElement | null;
          if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            return 'radio';
          }
          const link = row.querySelector('a[href*="javascript"], a[onclick], a[href^="#"]') as HTMLElement | null;
          if (link) {
            link.click();
            return 'link';
          }
        }
        return '';
      });

      if (!selected) {
        console.log('No selectable row found in transaction ID search popup after criteria');
        return null;
      }

      await popup.waitForTimeout(2000);
      await popup.close().catch(() => {});

      const idInput = finw.locator('input#invtTranId, input[name="imc.invtTranId"], input[name="invtTranId"]').first();
      const val = (await idInput.inputValue().catch(() => '')).trim();
      if (val && val.length > 1) {
        console.log(`Selected transaction ID from search popup: ${val}`);
        return val;
      }
      return null;
    } catch (e) {
      console.log(`Could not search and select transaction ID: ${e}`);
      return null;
    }
  }

  private async safeFillInPopup(popup: Page, idOrName: string, value: string) {
    try {
      const input = popup.locator(`input#${idOrName}, input[name="${idOrName}"]`).first();
      if (await input.count() > 0) {
        await input.fill('');
        await input.fill(value);
        await input.evaluate((el) => (el as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true })));
      }
    } catch (e) {
      console.log(`Could not fill '${idOrName}' in criteria popup: ${e}`);
    }
  }

  private async safeSelectInPopup(popup: Page, idOrName: string, value: string) {
    try {
      const select = popup.locator(`select#${idOrName}, select[name="${idOrName}"]`).first();
      if (await select.count() > 0) {
        await select.selectOption(value);
      }
    } catch (e) {
      console.log(`Could not select '${value}' in criteria popup: ${e}`);
    }
  }

  private async verifyByTransactionId(transactionDate: string, transactionId: string): Promise<string | null> {
    try {
      await this.selectFunction('Verify');
      await this.enterTransactionDate(transactionDate);
      await this.enterTransactionId(transactionId);
      await this.clickGo();
      await this.page.waitForTimeout(3000);
      await this.clickSubmit();
      await this.page.waitForTimeout(5000);

      const verifiedId = await this.getTransactionId();
      const status = await this.getStatusMessage();
      console.log(`After verify submit: verifiedId=${verifiedId}, status=${status?.substring(0, 120)}`);
      return verifiedId || transactionId;
    } catch (e) {
      console.log(`Could not verify transaction ${transactionId}: ${e}`);
      return null;
    }
  }

  // ============ Transaction ID Capture ============
  async getTransactionId(): Promise<string | null> {
    try {
      const finwFrame = this.getFinwFrame();

      // Prefer the dedicated transaction ID input field.
      const idInput = finwFrame.locator(
        'input#invtTranId, input[name="imc.invtTranId"], input[name="invtTranId"]'
      ).first();
      const inputVal = (await idInput.inputValue().catch(() => '')).trim();
      if (inputVal && !/^\d{2}-\d{2}-\d{4}$/.test(inputVal) && !/^Select$/i.test(inputVal)) {
        console.log(`Extracted Inventory Transaction ID from input: ${inputVal}`);
        return inputVal;
      }

      // Fall back to strict ID-like patterns in the page body.
      const body = await finwFrame.locator('body').innerText().catch(() => '');
      const patterns = [
        /\b(Ex\d+)\b/i,
        /\b(S\d{10,})\b/,
        /\b(CB\d+)\b/,
        /\b(I\d{6,})\b/i,
        /\b([A-Z]{2}\d{4,8})\b/,
        /\b(\d{6,})\b/,
      ];
      for (const pat of patterns) {
        const m = body.match(pat);
        if (m && m[1]) {
          const v = m[1].trim();
          if (/^\d{2}-\d{2}-\d{4}$/.test(v) || /^Select$/i.test(v)) continue;
          console.log(`Extracted Inventory Transaction ID from body: ${v}`);
          return v;
        }
      }

      const sample = body.replace(/\s+/g, ' ').substring(0, 2000);
      console.log('Could not extract Inventory Transaction ID. Body text sample:', sample);
      try {
        const html = await finwFrame.content().catch(() => '');
        fs.writeFileSync(path.join(process.cwd(), 'data', 'himc-submit-page.html'), html, 'utf-8');
        fs.writeFileSync(path.join(process.cwd(), 'data', 'himc-submit-text.txt'), sample, 'utf-8');
      } catch {}
      return null;
    } catch (e) {
      console.log(`Error extracting Inventory Transaction ID: ${e}`);
      return null;
    }
  }

  // ============ Verification Helpers ============
  async getPageText(): Promise<string> {
    try {
      const finwFrame = this.getFinwFrame();
      return await finwFrame.locator('body').innerText().catch(() => '');
    } catch (e) {
      console.log(`Could not read page text: ${e}`);
      return '';
    }
  }

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
      ];
      for (const frame of this.page.frames()) {
        for (const sel of candidates) {
          const loc = frame.locator(sel);
          if (await loc.count().catch(() => 0) > 0) {
            const text = (await loc.first().textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();
            if (text) return text;
          }
        }
      }
      return null;
    } catch (e) {
      console.log(`Could not read status message: ${e}`);
      return null;
    }
  }
}
