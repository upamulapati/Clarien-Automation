import { Page, Dialog } from '@playwright/test';
import { test } from '@playwright/test';
import { AppConfig } from '../../config/crmTestData';
import { captureEvidence } from '../../helpers/evidence';
import * as fs from 'fs';
import * as path from 'path';

// =====================================================================
// CrmBasePage — base class for all CRM page objects.
// Contains all shared CRM helpers.
// =====================================================================

export class CrmBasePage {
  readonly page: Page;
  protected config: AppConfig;
  protected lastDialogMessages: string[];
  protected workingPage: Page;
  protected accountFrame: any = null;
  protected mainAccountFrame: any = null;
  private _lovSubmitScreenshots: Set<string> = new Set();

  constructor(page: Page, config: AppConfig, lastDialogMessages: string[]) {
    this.page = page;
    this.config = config;
    this.lastDialogMessages = lastDialogMessages;
    this.workingPage = page;
  }

  protected get timeouts() { return this.config.timeouts; }

  // Temporary diagnostic helper: writes a frame's HTML to test-results-temp
  // when the DUMP_HTML environment variable is set.
  protected async dumpFrameHtml(frame: any, label: string) {
    try {
      if (!process.env.DUMP_HTML || !frame) return;
      const html = await frame.content();
      const dir = path.resolve('test-results-temp');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `dump-${label}.html`);
      fs.writeFileSync(file, html, 'utf8');
      console.log(`✓ Dumped HTML: ${file}`);
    } catch (_) {}
  }

  // =====================================================================
  // Screenshot Helper
  // =====================================================================
  async takeScreenshot(name: string) {
    try {
      const target = this.workingPage || this.page;
      if (!target || target.isClosed?.()) return;
      const screenshot = await target.screenshot({ fullPage: false });
      await test.info().attach(name, { body: screenshot, contentType: 'image/png' });
      console.log(`Screenshot taken: ${name}`);
    } catch (e) {
      console.log(`Could not take screenshot (${name}): ${e}`);
    }
  }

  protected async captureEvidence(step: string, data?: Record<string, unknown>, page?: Page | null): Promise<void> {
    try {
      const target = page || this.workingPage || this.page;
      if (!target || (target as Page).isClosed?.()) return;
      await captureEvidence(target, step, data);
    } catch (e) {
      console.log(`Could not capture evidence (${step}): ${e}`);
    }
  }

  // =====================================================================
  // Frame Helpers
  // =====================================================================

  async findPopupTarget(popup: Page): Promise<any> {
    let bestFrame: any = popup;
    let maxFields = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await popup.waitForTimeout(2000);
      maxFields = 0;
      bestFrame = popup;
      for (const pf of popup.frames()) {
        const count = await pf.evaluate(() =>
          Array.from(document.querySelectorAll('input, select, textarea')).filter(el => {
            const r = (el as HTMLElement).getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }).length
        ).catch(() => 0);
        if (count > maxFields) { maxFields = count; bestFrame = pf; }
      }
      if (maxFields > 0) break;
    }
    console.log(`Using popup frame with ${maxFields} visible fields`);
    return bestFrame;
  }

  async listVisibleFields(target: any, label: string): Promise<any[]> {
    const fields = await target.evaluate(() =>
      Array.from(document.querySelectorAll('input, select, textarea')).map(el => {
        const inp = el as HTMLInputElement;
        const r = (el as HTMLElement).getBoundingClientRect();
        return { name: inp.name || '', type: inp.type || '', tag: el.tagName, value: inp.value || '', visible: r.width > 0 && r.height > 0 };
      }).filter((f: any) => f.visible)
    ).catch(() => []);
    console.log(`${label} visible fields (${fields.length}):`);
    fields.forEach((f: any) => console.log(`  ${f.tag} name="${f.name}" type="${f.type}" value="${f.value}"`));
    return fields;
  }

  async findMenuFrame(page: Page, menuKeywords?: string[]): Promise<any> {
    const keywords = menuKeywords || ['CIF Retail', 'CIF Corporate', 'New Entity', 'Entity Queue', 'Operations', 'Customer'];
    let menuFrame: any = null;
    for (const frame of page.frames()) {
      try {
        const menuSpans = await frame.locator('span.submenuout').all();
        if (menuSpans.length > 0) {
          const content = await frame.content();
          if (content && keywords.some(kw => content.includes(kw))) {
            menuFrame = frame;
            break;
          }
        }
      } catch (_) {}
    }
    if (!menuFrame) {
      for (const frame of page.frames()) {
        try {
          const s = await frame.locator('span.submenuout').all();
          if (s.length > 0) { menuFrame = frame; break; }
        } catch (_) {}
      }
    }
    if (!menuFrame) {
      const c = page.frame({ name: 'CRMServer' });
      if (c) menuFrame = c;
    }
    return menuFrame;
  }

  async clickMenuItem(menuFrame: any, page: Page, menuText: string, waitTime = 2000) {
    if (!menuFrame) return;
    await page.waitForTimeout(1000);
    const selectors = ['span.submenuout', 'span', 'a', 'div[class*="menu"]', 'td', 'li'];
    for (const selector of selectors) {
      const items = await menuFrame.locator(selector).all();
      for (const item of items) {
        const t = await item.textContent();
        if (t && t.includes(menuText)) {
          const id = await item.getAttribute('id');
          if (id) { await menuFrame.evaluate((i: string) => document.getElementById(i)?.click(), id); }
          else { await item.click({ force: true }); }
          console.log(`✓ Clicked "${menuText}"`);
          await page.waitForTimeout(waitTime);
          return;
        }
      }
    }
    console.log(`⚠ Menu item "${menuText}" not found`);
    await page.waitForTimeout(waitTime);
  }

  async getSelectOptions(target: any, selector: string): Promise<string[]> {
    return target.evaluate((sel: string) => {
      const select = document.querySelector(sel) as HTMLSelectElement;
      if (!select) return [];
      return Array.from(select.options).map(o => o.text.trim());
    }, selector).catch(() => []);
  }

  // =====================================================================
  // CRM Load & Readiness
  // =====================================================================

  async waitForCRMLoad(page: Page, config: AppConfig) {
    let deadline = Date.now() + config.timeouts.crmLoad;
    let recoveryAttempted = false;
    while (Date.now() < deadline) {
      const fc = page.frames().length;
      const hasFM = page.frame({ name: 'Functionmain' }) !== null;
      console.log(`  Frames: ${fc}, Functionmain: ${hasFM}`);
      if (hasFM && fc > 5) { console.log('✓ CRM fully loaded'); return; }
      if (!recoveryAttempted) {
        const crmFrame = page.frames().find(f => f.name() === 'CRMServer' || f.url().includes('PreLoginPage'));
        if (crmFrame && crmFrame.url().includes('PreLoginPage')) {
          console.log('⚠ CRM session expired (PreLoginPage), attempting recovery...');
          recoveryAttempted = true;
          await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
          await page.waitForTimeout(config.timeouts.long);
          try {
            const lf = page.frameLocator('iframe[name="loginFrame"]');
            const appSel = lf.locator('#appSelect');
            if (await appSel.isVisible({ timeout: 5000 }).catch(() => false)) {
              await appSel.selectOption('CRM').catch(() => {});
              console.log('  ✓ Re-selected CRM after recovery');
              await page.waitForTimeout(config.timeouts.long);
              const recoveryPopup = await page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null);
              if (recoveryPopup && !recoveryPopup.isClosed()) {
                await recoveryPopup.waitForLoadState('domcontentloaded').catch(() => {});
                await recoveryPopup.waitForTimeout(1000).catch(() => {});
                const sub = recoveryPopup.locator('input[value="Submit"], input[type="submit"]').first();
                if (await sub.isVisible({ timeout: 5000 }).catch(() => false)) await sub.click();
                await recoveryPopup.waitForEvent('close', { timeout: 15000 }).catch(() => {
                  if (!recoveryPopup.isClosed()) recoveryPopup.close().catch(() => {});
                });
              }
              deadline = Date.now() + 60000;
            }
          } catch (e) {
            console.log(`  ⚠ CRM recovery failed: ${(e as Error).message?.substring(0, 80)}`);
          }
        }
      }
      try {
        await page.waitForTimeout(config.timeouts.short3);
      } catch (e) {
        const msg = (e as Error).message || '';
        if (msg.includes('closed') || msg.includes('destroyed') || msg.includes('Target page')) {
          throw new Error('CRM load failed: page was closed during wait');
        }
        throw e;
      }
    }
    throw new Error('CRM did not load within timeout');
  }

  async ensureCRMReady(page: Page, config: AppConfig) {
    const crmServerFrame = page.frames().find(f => f.name() === 'CRMServer' || f.url().includes('CRMServer'));
    if (crmServerFrame) {
      const crmUrl = crmServerFrame.url();
      if (crmUrl.includes('PreLoginPage')) {
        console.log('⚠ CRM session expired (PreLoginPage detected), waiting for re-initialization...');
        await page.waitForTimeout(config.timeouts.long15);
        const crmUrl2 = page.frames().find(f => f.name() === 'CRMServer')?.url() || '';
        if (crmUrl2.includes('PreLoginPage')) {
          console.log('⚠ CRM session still expired, attempting page reload...');
          await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
          await page.waitForTimeout(config.timeouts.long);
        }
      }
    }
    let fmReady = false;
    for (let i = 0; i < 10; i++) {
      const fm = page.frame({ name: 'Functionmain' });
      if (fm) {
        try { await fm.evaluate(() => document.readyState); fmReady = true; break; } catch (_) {}
      }
      await page.waitForTimeout(config.timeouts.short);
    }
    console.log(fmReady ? '✓ CRM loaded and Functionmain ready' : '⚠ CRM loaded but Functionmain not fully ready');
    return fmReady;
  }

  // =====================================================================
  // Popup Helpers
  // =====================================================================

  async waitForPopupReady(popup: Page, label: string, _timeoutMs = 45000): Promise<boolean> {
    console.log(`  ${label}: waiting for popup ready...`);
    await new Promise(r => setTimeout(r, 1000));
    let fieldCount = 0;
    let urlShort = '';
    for (let i = 0; i < 8; i++) {
      if (popup.isClosed()) { console.log(`  ${label}: popup closed`); return false; }
      const url = popup.url();
      urlShort = url.includes('SSOblank') ? 'SSOblank' : url.substring(url.lastIndexOf('/') + 1).substring(0, 60);
      for (const pf of popup.frames()) {
        try {
          const count = await Promise.race([
            pf.evaluate(() =>
              Array.from(document.querySelectorAll('input, select, textarea, table, a, td')).filter(el => {
                const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0;
              }).length
            ),
            new Promise<number>(resolve => setTimeout(() => resolve(0), 2000))
          ]);
          if (count > fieldCount) fieldCount = count;
        } catch (_) {}
      }
      if (fieldCount > 0) { console.log(`  ${label}: ready (${fieldCount} fields, URL: ${urlShort})`); return true; }
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`  ${label}: timeout waiting for content (URL: ${urlShort})`);
    return false;
  }

  protected async safeClosePopup(popup: Page | null, timeoutMs = 5000): Promise<void> {
    if (!popup || popup.isClosed()) return;
    try {
      await Promise.race([popup.close(), new Promise<void>(resolve => setTimeout(resolve, timeoutMs))]);
    } catch (_) {}
  }

  async closeUnexpectedPopups(page: Page, ...expectedPopups: Page[]) {
    const expectedSet = new Set([page, ...expectedPopups.filter(p => p && !p.isClosed())]);
    for (const p of page.context().pages()) {
      if (p.isClosed() || expectedSet.has(p)) continue;
      const url = p.url();
      if (url === 'about:blank') continue;
      if (url.includes('Lookup') || url.includes('LOV') || url.includes('SSOblank')) {
        console.log(`⚠ Closing unexpected popup: ${url.substring(url.lastIndexOf('/') + 1).substring(0, 80)}`);
        p.on('dialog', async (d) => { await d.accept().catch(() => {}); });
        this.safeClosePopup(p, 5000);
      }
    }
  }

  // =====================================================================
  // LOV Helpers
  // =====================================================================

  protected async lovFillSearch(popup: Page, value: string, label: string, inputIndex = 0): Promise<boolean> {
    if (popup.isClosed()) return false;
    const raw = value === undefined || value === null ? '' : String(value).trim();
    const lower = raw.toLowerCase();
    if (lower === 'undefined' || lower === 'null' || raw.startsWith('[object')) {
      console.log(`  ⚠ Skipping LOV search for ${label}: invalid value "${value}"`);
      return false;
    }
    const safeValue = raw.replace(/\*/g, '').trim();
    for (const lf of popup.frames()) {
      const textInputs = await lf.locator('input[type="text"]').all().catch(() => [] as any[]);
      let visibleIndex = -1;
      for (const inp of textInputs) {
        if (await inp.isVisible().catch(() => false)) {
          visibleIndex++;
          if (visibleIndex === inputIndex) {
            try {
              await inp.fill(safeValue);
            } catch (e) {
              console.log(`  ⚠ Could not type in LOV for ${label}: ${(e as Error).message?.substring(0, 80)}`);
              return false;
            }
            console.log(`  Typed "${safeValue}" in LOV search for ${label} (input ${inputIndex})`);
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Fill a LOV popup search input identified as either the Code or Category (display) field.
   * Clears all visible search inputs first so the value is only submitted in the intended field.
   */
  protected async lovFillSearchByInputHint(popup: Page, value: string, label: string, hint: 'code' | 'category'): Promise<boolean> {
    if (popup.isClosed()) return false;
    const raw = value === undefined || value === null ? '' : String(value).trim();
    if (/^(undefined|null|\[object)/i.test(raw) || !raw) {
      console.log(`  ⚠ Skipping LOV ${hint} search for ${label}: invalid value "${value}"`);
      return false;
    }
    const safeValue = raw.replace(/\*/g, '').trim();
    for (const lf of popup.frames()) {
      const filled = await lf.evaluate((args: { v: string; h: 'code' | 'category' }) => {
        const v = args.v;
        const h = args.h;
        const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
        const candidates: { el: HTMLInputElement; score: number; order: number }[] = [];
        inputs.forEach((el, i) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          const name = (el.getAttribute('name') || '').toUpperCase();
          const id = (el.getAttribute('id') || '').toUpperCase();
          if (/LOWLIMIT|HIGHLIMIT|PAGENO|GOTO|RECNO|RECORD/i.test(name + id)) return;
          const row = el.closest('tr');
          const rowText = row ? (row.innerText || '').toUpperCase() : '';
          let labelFor = '';
          if (el.id) {
            const lbl = document.querySelector(`label[for="${el.id}"]`);
            if (lbl) labelFor = (lbl.textContent || '').toUpperCase();
          }
          const placeholder = (el.getAttribute('placeholder') || '').toUpperCase();
          const title = (el.getAttribute('title') || '').toUpperCase();
          const aria = (el.getAttribute('aria-label') || '').toUpperCase();
          const attrText = `${name} ${id} ${placeholder} ${title} ${aria} ${labelFor}`;
          const all = `${attrText} ${rowText}`;
          let score = 0;
          // Strong preference for the field's own label attributes.
          if (h === 'category') {
            if (attrText.includes('CATEGORY') || attrText.includes('DESCRIPTION') || attrText.includes('DISPLAY') || attrText.includes('VALUE')) score += 25;
            if (attrText.includes('CODE')) score -= 15;
            if (rowText.includes('CATEGORY') || rowText.includes('DESCRIPTION') || rowText.includes('DISPLAY') || rowText.includes('VALUE')) score += 8;
            if (rowText.includes('CODE')) score -= 4;
          } else {
            if (attrText.includes('CODE')) score += 25;
            if (attrText.includes('CATEGORY') || attrText.includes('DESCRIPTION') || attrText.includes('DISPLAY') || attrText.includes('VALUE')) score -= 15;
            if (rowText.includes('CODE')) score += 8;
            if (rowText.includes('CATEGORY') || rowText.includes('DESCRIPTION') || rowText.includes('DISPLAY') || rowText.includes('VALUE')) score -= 4;
          }
          if (score <= -5) return;
          // Slight tie-breaker for leftmost inputs when row text is ambiguous.
          if (score === 0) score = (h === 'code' ? -i : i);
          candidates.push({ el, score, order: i });
        });
        if (candidates.length === 0) return false;
        candidates.forEach(c => {
          c.el.value = '';
          c.el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        candidates.sort((a, b) => (b.score - a.score) || (a.order - b.order));
        const best = candidates[0];
        best.el.value = v;
        best.el.dispatchEvent(new Event('input', { bubbles: true }));
        best.el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, { v: safeValue, h: hint }).catch(() => false);
      if (filled) {
        console.log(`  Typed "${safeValue}" in LOV ${hint} search for ${label}`);
        return true;
      }
    }
    return false;
  }

  protected async lovClickSubmit(popup: Page, label: string, config: AppConfig): Promise<boolean> {
    if (popup.isClosed()) return false;
    const selectors = ['input[value="Submit"]', 'input[value="Search"]', 'input[value="Go"]', 'button[type="submit"]', 'input[type="submit"]'];
    for (const lf of popup.frames()) {
      for (const sel of selectors) {
        const loc = lf.locator(sel).first();
        if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
          try {
            await loc.click();
          } catch (e) {
            if (popup.isClosed()) return false;
            console.log(`  ⚠ Could not click LOV submit for ${label} (${sel}): ${(e as Error).message?.substring(0, 80)}`);
            continue;
          }
          console.log(`  ✓ Clicked submit in LOV for ${label}`);
          if (!this._lovSubmitScreenshots.has(label)) {
            this._lovSubmitScreenshots.add(label);
            await this.takeScreenshot(`LOV Submit - ${label}`).catch(() => {});
          }
          return true;
        }
      }
    }
    return false;
  }

  protected async lovCollectValues(popup: Page, excludeLabels?: string[]): Promise<string[]> {
    let values: string[] = [];
    if (popup.isClosed()) return values;
    const defaultExcludes = ['Location Value', 'Location Code', 'Location List', 'City Code', 'City List',
      'Code', 'Value', 'Country Code', 'Country List', 'State Code', 'State List',
      'Category Code', 'Category Values List', 'Nationality Code', 'Nationality List',
      'Login ID', 'Last Name', 'First Name', 'User ID', 'Simple Lookup',
      'Agent Search Results', 'Title', 'Middle Name', 'Gender',
      'No Records to Display'];
    const excludes = excludeLabels || defaultExcludes;
    for (const lf of popup.frames()) {
      const frameValues = await lf.evaluate((excl: string[]) => {
        const getCellText = (c: Element) => {
          const clone = c.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('script, style').forEach(s => s.remove());
          return (clone.innerText || '').replace(/\s+/g, ' ').trim();
        };
        const isJunkText = (txt: string) => !txt || txt.length > 200 ||
          /Page\s+\d+\s+of\s+\d+|Category Values List|Location List|Nationality List|Agent Search Results|No Records to Display|Simple Lookup/i.test(txt);
        const results: string[] = [];
        for (const table of Array.from(document.querySelectorAll('table'))) {
          const rect = (table as HTMLElement).getBoundingClientRect();
          if (rect.width <= 0) continue;
          for (const row of Array.from(table.querySelectorAll('tr'))) {
            if (row.querySelector('th')) continue;
            const rowText = getCellText(row).toUpperCase();
            if (/PAGE\s+\d+\s+OF\s+\d+/.test(rowText) || /CATEGORY VALUES LIST|LOCATION LIST|NATIONALITY LIST|AGENT SEARCH RESULTS|SIMPLE LOOKUP|NO RECORDS TO DISPLAY/.test(rowText)) continue;
            const cells = Array.from(row.querySelectorAll('td')).filter(c => {
              const txt = getCellText(c);
              return !isJunkText(txt) && txt.length >= 2 && txt.length <= 50 && !excl.includes(txt);
            });
            for (const c of cells) results.push(getCellText(c));
          }
        }
        return results;
      }, excludes).catch(() => [] as string[]);
      if (frameValues.length > values.length) values = frameValues;
    }
    return values;
  }

  protected async lovTrySelect(popup: Page, searchValue: string, label: string, config: AppConfig): Promise<boolean> {
    if (popup.isClosed()) return false;
    for (const lf of popup.frames()) {
      const tdCount = await lf.evaluate(() => document.querySelectorAll('td').length).catch(() => 0);
      if (tdCount < 3) continue;
      try {
        await Promise.race([
          lf.getByText(searchValue, { exact: true }).first().dblclick({ timeout: config.timeouts.medium }),
          popup.waitForEvent('close', { timeout: config.timeouts.long })
        ]);
        console.log(`  ✓ Selected ${label}: "${searchValue}" (exact match)`);
        return true;
      } catch (_) {
        if (popup.isClosed()) { console.log(`  ✓ Selected ${label}: "${searchValue}" (popup closed)`); return true; }
      }
      try {
        await Promise.race([
          lf.locator('td', { hasText: new RegExp(searchValue, 'i') }).first().dblclick({ timeout: config.timeouts.medium }),
          popup.waitForEvent('close', { timeout: config.timeouts.long })
        ]);
        console.log(`  ✓ Selected ${label}: "${searchValue}" (case-insensitive match)`);
        return true;
      } catch (_) {
        if (popup.isClosed()) { console.log(`  ✓ Selected ${label}: "${searchValue}" (popup closed)`); return true; }
      }
    }
    return false;
  }

  protected async lovSelectByCodeOrValue(popup: Page, searchValue: string, label: string, config: AppConfig): Promise<boolean> {
    if (!searchValue || popup.isClosed()) return false;
    const target = String(searchValue).replace(/\*/g, '').trim().toUpperCase();
    if (!target) return false;
    for (const lf of popup.frames()) {
      try {
        const clicked = await lf.evaluate((sv: string) => {
          const t = sv.replace(/\*/g, '').trim().toUpperCase();
          const getCellText = (c: Element) => {
            const clone = c.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('script, style').forEach(s => s.remove());
            return (clone.innerText || '').replace(/\s+/g, ' ').trim();
          };
          const isJunkText = (txt: string) => !txt || txt.length > 200 ||
            /Page\s+\d+\s+of\s+\d+|Category Values List|Location List|Nationality List|Agent Search Results|No Records to Display|Simple Lookup/i.test(txt);
          const isHeaderRow = (row: HTMLTableRowElement) => {
            if (row.querySelector('th')) return true;
            const txt = getCellText(row).toUpperCase();
            if (/PAGE\s+\d+\s+OF\s+\d+/.test(txt)) return true;
            if (/(CATEGORY VALUES LIST|LOCATION LIST|NATIONALITY LIST|AGENT SEARCH RESULTS|SIMPLE LOOKUP|NO RECORDS TO DISPLAY)/.test(txt)) return true;
            return false;
          };
          for (const table of Array.from(document.querySelectorAll('table'))) {
            const rect = (table as HTMLElement).getBoundingClientRect();
            if (rect.width <= 0) continue;
            for (const row of Array.from(table.querySelectorAll('tr'))) {
              if (isHeaderRow(row)) continue;
              const cells = Array.from(row.querySelectorAll('td')).filter(c => {
                const txt = getCellText(c);
                return !isJunkText(txt) && txt.length > 0 && txt.length <= 80;
              });
              if (cells.length === 0) continue;
              let matchCell: HTMLTableCellElement | null = null;
              let matchIdx = -1;
              for (let ci = 0; ci < cells.length; ci++) {
                const txt = getCellText(cells[ci]).toUpperCase();
                if (txt === t || txt.includes(t)) { matchCell = cells[ci] as HTMLTableCellElement; matchIdx = ci; break; }
              }
              if (!matchCell) continue;
              const link = row.querySelector('a');
              if (link) { (link as HTMLElement).click(); return true; }
              const radio = row.querySelector('input[type="radio"], input[type="checkbox"]') as HTMLInputElement | null;
              if (radio) { radio.click(); radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); return true; }
              matchCell.click();
              matchCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
              return true;
            }
          }
          return false;
        }, searchValue);
        if (clicked) {
          await Promise.race([
            popup.waitForEvent('close', { timeout: config.timeouts.long }),
            popup.waitForTimeout(config.timeouts.short3)
          ]).catch(() => {});
          if (popup.isClosed()) {
            console.log(`  ✓ Selected ${label}: "${searchValue}" (Code or Category Value)`);
            return true;
          }
        }
      } catch (_) {}
    }
    return false;
  }

  protected async lovHandleSSOblank(lovPopup: Page, config: AppConfig) {
    await new Promise(r => setTimeout(r, 2000));
    if (!lovPopup.isClosed() && lovPopup.url().includes('SSOblank')) {
      console.log(`  LOV at SSOblank - redirecting to Lookup servlet...`);
      const hashMatch = lovPopup.url().match(/wizardHashKey=([a-f0-9]+)/);
      if (hashMatch) {
        const lookupUrl = `https://clrnuat.clarienbank.com/FinacleCRM/servlet/com.infy.cis.ui.common.LookupforCategory?wizardHashKey=${hashMatch[1]}`;
        try {
          await lovPopup.goto(lookupUrl, { timeout: 15000, waitUntil: 'domcontentloaded' });
          console.log('  ✓ Navigated LOV directly to LookupforCategory');
        } catch (e) {
          console.log(`  ⚠ Direct LOV navigation failed: ${(e as Error).message?.substring(0, 80)}`);
        }
      }
    }
  }

  protected async lovSetDirectValue(target: any, fieldName: string, value: string, label: string) {
    console.log(`  Setting ${label} directly via evaluate as fallback...`);
    await target.evaluate((args: { field: string; val: string }) => {
      const el = document.querySelector(`input[name="${args.field}"]`) as HTMLInputElement;
      if (el) {
        el.removeAttribute('readonly');
        el.value = args.val;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      const catEl = document.querySelector(`input[name="Cat_${args.field}"]`) as HTMLInputElement;
      if (catEl) {
        catEl.value = args.val;
        catEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { field: fieldName, val: value }).catch(() => {});
    console.log(`  ✓ Set ${label} directly: "${value}"`);
  }

  protected async lovFindCodeDisplay(popup: Page, searchValue: string): Promise<{ code: string; display: string } | null> {
    if (!searchValue || popup.isClosed()) return null;
    const searchTarget = String(searchValue).replace(/\*/g, '').trim().toUpperCase();
    if (!searchTarget) return null;
    for (const lf of popup.frames()) {
      try {
        const pair = await lf.evaluate((sv: string) => {
          const t = sv.replace(/\*/g, '').trim().toUpperCase();
          const getCellText = (c: Element) => {
            const clone = c.cloneNode(true) as HTMLElement;
            const scripts = clone.querySelectorAll('script, style');
            scripts.forEach(s => s.remove());
            let txt = clone.innerText || '';
            if (!txt) {
              txt = Array.from(c.childNodes)
                .filter(n => !(n.nodeType === 1 && (['SCRIPT', 'STYLE'].includes((n as any).tagName))))
                .map(n => n.textContent || '').join(' ');
            }
            return txt.replace(/\s+/g, ' ').trim();
          };
          const isJunkText = (txt: string) => !txt || txt.length > 200 ||
            /Page\s+\d+\s+of\s+\d+|Category Values List|Location List|Nationality List|Agent Search Results|No Records to Display|Simple Lookup/i.test(txt);
          const isHeaderRow = (row: HTMLTableRowElement) => {
            if (row.querySelector('th')) return true;
            const txt = getCellText(row).toUpperCase();
            if (/PAGE\s+\d+\s+OF\s+\d+/.test(txt)) return true;
            if (/(CATEGORY VALUES LIST|LOCATION LIST|NATIONALITY LIST|AGENT SEARCH RESULTS|SIMPLE LOOKUP|NO RECORDS TO DISPLAY)/.test(txt)) return true;
            return false;
          };
          for (const table of Array.from(document.querySelectorAll('table'))) {
            const rect = (table as HTMLElement).getBoundingClientRect();
            if (rect.width <= 0) continue;
            let headers: string[] = [];
            const thCells = Array.from(table.querySelectorAll('th'));
            if (thCells.length >= 2) {
              headers = thCells.slice(0, 6).map(getCellText);
            } else {
              const firstRow = table.querySelector('tr');
              if (firstRow) {
                const firstCells = Array.from(firstRow.querySelectorAll('td, th')).slice(0, 6);
                const firstTexts = firstCells.map(getCellText);
                if (firstTexts.some(h => /^(Code|Value|Description|Category|Location|Nationality|Country|State|City)$/i.test(h))) {
                  headers = firstTexts;
                }
              }
            }
            let codeIdx = -1, dispIdx = -1;
            headers.forEach((h, i) => {
              const hu = h.toUpperCase();
              if (hu.includes('CODE') && !hu.includes('VALUE')) codeIdx = i;
              else if ((hu.includes('VALUE') || hu.includes('DESCRIPTION') || hu.includes('CATEGORY') || hu.includes('NATIONALITY') || hu.includes('LOCATION') || hu.includes('COUNTRY') || hu.includes('STATE') || hu.includes('CITY')) && !hu.includes('CODE')) dispIdx = i;
            });
            if (codeIdx === -1 && dispIdx === -1) { codeIdx = 1; dispIdx = 0; }
            if (codeIdx === -1 && headers.length >= 2) {
              // No explicit Code header: assume the first column is the display/category
              // and the last column is the code. This handles headers like 'Category Value' repeated in both columns.
              dispIdx = 0;
              codeIdx = headers.length - 1;
            }

            const rows = Array.from(table.querySelectorAll('tr'));
            for (const row of rows) {
              if (isHeaderRow(row)) continue;
              const cells = Array.from(row.querySelectorAll('td')).filter(c => {
                const txt = getCellText(c);
                return !isJunkText(txt) && txt.length > 0 && txt.length <= 80;
              });
              if (cells.length === 0) continue;
              const matchIdx = cells.findIndex(c => {
                const txt = getCellText(c).toUpperCase();
                return txt === t || txt.includes(t);
              });
              if (matchIdx === -1) continue;
              const safeCodeIdx = codeIdx >= 0 && codeIdx < cells.length ? codeIdx : (cells.length > 1 ? 1 : 0);
              const safeDispIdx = dispIdx >= 0 && dispIdx < cells.length ? dispIdx : 0;
              const code = getCellText(cells[safeCodeIdx]) || getCellText(cells[matchIdx]) || getCellText(cells[1]) || getCellText(cells[0]) || '';
              const display = getCellText(cells[safeDispIdx]) || getCellText(cells[matchIdx]) || getCellText(cells[0]) || '';
              if (!code && !display) continue;
              if (isJunkText(code) || isJunkText(display)) continue;
              if (code.length > 50 || display.length > 80) continue;
              return { code, display };
            }
          }
          return null;
        }, searchValue);
        if (pair && pair.code && pair.display) {
          const junkRegex = /Page\s+\d+\s+of\s+\d+|Category Values List|Location List|Nationality List|Agent Search Results|No Records to Display|Simple Lookup|Category Value|Location Value|Location Code|Country Code|State Code|City Code|Nationality Code|Category Code/i;
          if (!junkRegex.test(pair.code) && !junkRegex.test(pair.display) && pair.code.length <= 50 && pair.display.length <= 80) {
            return pair as { code: string; display: string };
          }
        }
      } catch (_) {}
    }
    return null;
  }

  protected async lovSetDirectCodeDisplay(target: any, fieldName: string, code: string, display: string, label: string) {
    const junkRegex = /Page\s+\d+\s+of\s+\d+|Category Values List|Location List|Nationality List|Agent Search Results|No Records to Display|Simple Lookup|Category Value|Location Value|Location Code|Country Code|State Code|City Code|Nationality Code|Category Code/i;
    if (!code || !display || junkRegex.test(code) || junkRegex.test(display) || code.length > 50 || display.length > 80) {
      console.log(`  ⚠ Skipping direct ${label} set due to invalid code/display pair: code="${code}", display="${display}"`);
      return;
    }
    console.log(`  Setting ${label} directly (code="${code}", display="${display}")...`);
    await target.evaluate((args: { field: string; code: string; display: string }) => {
      const fire = (el: HTMLElement) => {
         if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; }el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      };
      const el = document.querySelector(`input[name="${args.field}"]`) as HTMLInputElement;
      if (el) {
        el.removeAttribute('readonly');
        el.value = args.code;
        fire(el);
      }
      const catEl = document.querySelector(`input[name="Cat_${args.field}"]`) as HTMLInputElement;
      if (catEl) {
        catEl.value = args.display;
        catEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { field: fieldName, code, display }).catch(() => {});
    console.log(`  ✓ Set ${label} directly: code="${code}", display="${display}"`);
  }

  async selectLovValue(opts: {
    parentPage: Page; target: any; buttonName: string; searchValue: string;
    label: string; config: AppConfig; directFieldName?: string; parentPopup?: Page;
    fallback?: { code: string; display: string; resolved?: boolean };
    categoryValueOnly?: boolean;
    codeValueOnly?: boolean;
  }): Promise<boolean> {
    this._lovSubmitScreenshots.clear();
    const { parentPage, target, buttonName, label, config, directFieldName, parentPopup } = opts;
    let searchValue = String(opts.searchValue || '').replace(/\*/g, '').trim();
    if (opts.fallback) {
      opts.fallback.code = String(opts.fallback.code || '').replace(/\*/g, '').trim();
      opts.fallback.display = String(opts.fallback.display || '').replace(/\*/g, '').trim();
    }
    const fallback = opts.fallback;
    const contextPage = parentPopup || parentPage;

    if (parentPopup && parentPopup.isClosed()) {
      console.log(`⚠ Parent popup closed, cannot open LOV for ${label}`);
      return false;
    }

    let lovPopup: any = null;

    if (buttonName) {
      let lovBtn: any = null;
      let lovBtnFrame: any = null;
      const btnOnTarget = target.locator(`input[name="${buttonName}"]`);
      if (await btnOnTarget.isVisible({ timeout: config.timeouts.short3 }).catch(() => false)) {
        lovBtn = btnOnTarget; lovBtnFrame = target;
      } else {
        for (const f of parentPage.frames()) {
          const btn = f.locator(`input[name="${buttonName}"]`);
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) { lovBtn = btn; lovBtnFrame = f; break; }
        }
      }
      // Some LOV buttons exist but are hidden/disabled after a value is already selected.
      // Fall back to the first matching button element regardless of visibility.
      if (!lovBtn) {
        const hiddenFallback = target.locator(`input[name="${buttonName}"]`).first();
        if (await hiddenFallback.count().catch(() => 0) > 0) {
          lovBtn = hiddenFallback; lovBtnFrame = target;
        } else {
          for (const f of parentPage.frames()) {
            const btn = f.locator(`input[name="${buttonName}"]`).first();
            if (await btn.count().catch(() => 0) > 0) { lovBtn = btn; lovBtnFrame = f; break; }
          }
        }
      }

      if (lovBtn) {
        const isDisabled = await lovBtn.evaluate((el: HTMLInputElement) => el.disabled).catch(() => false);
        if (isDisabled) {
          console.log(`  ⚠ LOV button "${buttonName}" disabled, enabling for ${label}...`);
          await lovBtn.evaluate((el: HTMLInputElement) => { el.disabled = false; });
          await parentPage.waitForTimeout(500);
        }

        const lovPromise = contextPage.context().waitForEvent('page', { timeout: config.timeouts.long15 }).catch(() => null);
        await lovBtn.evaluate((el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
        console.log(`  Clicked LOV for ${label}...`);
        lovPopup = await lovPromise;
      }
    }

    if (!lovPopup) {
      console.log(`  ⚠ LOV button not found for ${label}${buttonName ? ': ' + buttonName : ''}, trying lookup icon...`);
      lovPopup = await this.openLovPopupByLabel(target, label, config, parentPage);
    }

    if (!lovPopup) {
      console.log(`⚠ No LOV popup opened for ${label}`);
      if (directFieldName) await this.lovSetDirectValue(target, directFieldName, searchValue, label);
      return false;
    }
    lovPopup.on('dialog', async (d: Dialog) => { console.log(`  📢 LOV dialog: "${d.message().substring(0, 80)}"`); await d.accept().catch(() => {}); });
    await lovPopup.bringToFront().catch(() => {});

    await this.lovHandleSSOblank(lovPopup, config);

    const lovReady = await this.waitForPopupReady(lovPopup, `${label} LOV`);
    if (!lovReady) {
      console.log(`⚠ LOV popup did not load for ${label}`);
      await this.safeClosePopup(lovPopup, 5000);
      if (directFieldName) await this.lovSetDirectValue(target, directFieldName, searchValue, label);
      return false;
    }
    if (lovPopup.isClosed()) { console.log(`  ✓ LOV already closed for ${label}`); return true; }

    // Try each visible search input in turn (supports Code and Category Value search fields)
    let selected = false;
    let cd: { code: string; display: string } | null = null;
    const hint: 'code' | 'category' | undefined = opts.categoryValueOnly ? 'category' : (opts.codeValueOnly ? 'code' : undefined);
    if (searchValue) {
      const maxInputIdx = hint ? 0 : 2;
      if (hint) {
        // Clear all search inputs so the selected Code or Category Value field starts empty.
        await lovPopup.evaluate(() => {
          document.querySelectorAll('input[type="text"]').forEach((el) => {
            const input = el as HTMLInputElement;
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
        }).catch(() => {});
      }
      for (let inputIdx = 0; inputIdx <= maxInputIdx; inputIdx++) {
        if (lovPopup.isClosed()) { selected = true; break; }
        const filled = hint ? await this.lovFillSearchByInputHint(lovPopup, searchValue, label, hint) : await this.lovFillSearch(lovPopup, searchValue, label, inputIdx);
        if (!filled) break; // no more visible search fields
        await this.lovClickSubmit(lovPopup, label, config);
        if (!lovPopup.isClosed()) await lovPopup.waitForTimeout(config.timeouts.short).catch(() => {});
        const values = await this.lovCollectValues(lovPopup);
        console.log(`  ${label} LOV values (search="${searchValue}" input=${inputIdx}): [${values.slice(0, 20).join(', ')}]`);
        if (!cd && !lovPopup.isClosed()) {
          cd = await this.lovFindCodeDisplay(lovPopup, searchValue);
          if (cd && cd.code && cd.display) {
            console.log(`  ℹ ${label} code/display pair from LOV: "${cd.display}" / "${cd.code}"`);
            if (fallback) {
              fallback.code = cd.code;
              fallback.display = cd.display;
              (fallback as any).resolved = true;
            }
          }
        }
        selected = await this.lovSelectByCodeOrValue(lovPopup, searchValue, label, config);
        if (selected || lovPopup.isClosed() || (cd && cd.code && cd.display)) break;
      }
    }

    // Fallback: empty search to list all values, then select by Code or Category Value
    if (!selected && !cd && !lovPopup.isClosed()) {
      console.log(`  Retrying ${label} with empty search (all values)...`);
      await this.lovFillSearch(lovPopup, '', label, 0);
      await this.lovClickSubmit(lovPopup, label, config);
      if (!lovPopup.isClosed()) await lovPopup.waitForTimeout(config.timeouts.short).catch(() => {});
      const allValues = await this.lovCollectValues(lovPopup);
      console.log(`  ${label} LOV all values: [${allValues.slice(0, 30).join(', ')}]`);
      if (searchValue) selected = await this.lovSelectByCodeOrValue(lovPopup, searchValue, label, config);
      if (!cd) {
        cd = await this.lovFindCodeDisplay(lovPopup, searchValue);
        if (cd && cd.code && cd.display) {
          console.log(`  ℹ ${label} code/display pair from LOV (all values): "${cd.display}" / "${cd.code}"`);
          if (fallback) {
            fallback.code = cd.code;
            fallback.display = cd.display;
            (fallback as any).resolved = true;
          }
        }
      }
    }

    if (!selected && !cd) console.log(`  ⚠ Could not select value "${searchValue}" for ${label}`);

    if (!lovPopup.isClosed()) {
      try { await lovPopup.waitForEvent('close', { timeout: config.timeouts.long }); } catch (_) {}
      await this.safeClosePopup(lovPopup, 5000);
    }
    console.log(`  ✓ LOV closed for ${label}`);

    if (directFieldName && (cd?.code || (fallback as any)?.resolved)) {
      const codeToUse = (cd && cd.code) ? cd.code : fallback!.code;
      const displayToUse = (cd && cd.display) ? cd.display : fallback!.display;
      if (codeToUse && displayToUse) {
        await this.lovSetDirectCodeDisplay(target, directFieldName, codeToUse, displayToUse, label);
      }
    } else if (!selected && directFieldName) {
      if (fallback && fallback.code && fallback.display) {
        await this.lovSetDirectCodeDisplay(target, directFieldName, fallback.code, fallback.display, label);
      } else {
        await this.lovSetDirectValue(target, directFieldName, searchValue, label);
      }
    }

    await this.closeUnexpectedPopups(parentPage, ...(parentPopup ? [parentPopup] : []));
    return selected || (!!cd?.code) || (!!directFieldName && !!(fallback as any)?.resolved);
  }

  /**
   * Open the LOV popup for a label and search using the Category Value (display text).
   * Does not write the value into the Code search field. Resolves the code/display pair
   * and writes both back to the parent form.
   */
  protected async setLovByCategoryValue(frame: any, label: string, categoryValue: string, logLabel?: string): Promise<boolean> {
    const v = String(categoryValue || '').trim();
    if (!v) return false;
    const buttons = await this.findLovButtonNamesByLabel(frame, label).catch(() => [] as string[]);
    const candidates = buttons.filter(b => /^btnone_|^btntwo_/i.test(b));
    const targets = candidates.length ? candidates : buttons;
    const fieldNameFromLabel = await this.findFieldNameByLabel(frame, label).catch(() => undefined);
    for (const bn of targets.length ? targets : ['']) {
      const directFieldName = /^btnone_|^btntwo_/i.test(bn) ? bn.replace(/^btnone_|^btntwo_/, '') : fieldNameFromLabel;
      const ok = await this.selectLovValue({
        parentPage: this.workingPage,
        target: frame,
        buttonName: bn,
        searchValue: v,
        label: logLabel || label,
        config: this.config,
        directFieldName,
        fallback: { code: '', display: v },
        categoryValueOnly: true
      }).catch(() => false);
      if (ok) {
        console.log(`✓ ${logLabel || label} set via category LOV: ${v}`);
        return true;
      }
    }
    console.log(`⚠ ${logLabel || label} LOV not set (category value: ${v})`);
    return false;
  }

  /**
   * Open the LOV popup for a label and search using the Code value.
   * Does not write the value into the Category Value search field.
   * Resolves the code/display pair and writes both back to the parent form.
   */
  protected async setLovByCodeValue(frame: any, label: string, codeValue: string, logLabel?: string): Promise<boolean> {
    const v = String(codeValue || '').trim();
    if (!v) return false;
    const buttons = await this.findLovButtonNamesByLabel(frame, label).catch(() => [] as string[]);
    const candidates = buttons.filter(b => /^btnone_|^btntwo_/i.test(b));
    const targets = candidates.length ? candidates : buttons;
    const fieldNameFromLabel = await this.findFieldNameByLabel(frame, label).catch(() => undefined);
    for (const bn of targets.length ? targets : ['']) {
      const directFieldName = /^btnone_|^btntwo_/i.test(bn) ? bn.replace(/^btnone_|^btntwo_/, '') : fieldNameFromLabel;
      const ok = await this.selectLovValue({
        parentPage: this.workingPage,
        target: frame,
        buttonName: bn,
        searchValue: v,
        label: logLabel || label,
        config: this.config,
        directFieldName,
        fallback: { code: v, display: '' },
        codeValueOnly: true
      }).catch(() => false);
      if (ok) {
        console.log(`✓ ${logLabel || label} set via code LOV: ${v}`);
        return true;
      }
    }
    console.log(`⚠ ${logLabel || label} LOV not set (code value: ${v})`);
    return false;
  }

  /**
   * Set a code/display LOV using the provided code or category value.
   * For Country-like fields the CRM sheet usually supplies the Category Value
   * (e.g. 'Bermuda'), so we search by display/category first, then by code,
   * then fall back to the raw CRM value and finally to direct control writes.
   */
  protected async setLovWithFallback(
    frame: any,
    label: string,
    codeValue: string,
    displayValue: string,
    logLabel?: string
  ): Promise<boolean> {
    const code = String(codeValue || '').trim();
    const display = String(displayValue || '').trim();
    if (!code && !display) {
      console.log(`⚠ ${logLabel || label} LOV skipped (no code or display)`);
      return false;
    }

    const used = new Set<string>();

    // 1) Search by Category Value / display first (the typical CRM-sheet value).
    for (const v of [display, code]) {
      if (v && !used.has(v.toUpperCase())) {
        used.add(v.toUpperCase());
        const catOk = await this.setLovByCategoryValue(frame, label, v, logLabel).catch(() => false);
        if (catOk) return true;
      }
    }

    // 2) Search by code.
    for (const v of [code, display]) {
      if (v && !used.has(v.toUpperCase())) {
        used.add(v.toUpperCase());
        const codeOk = await this.setLovByCodeValue(frame, label, v, logLabel).catch(() => false);
        if (codeOk) return true;
      }
    }

    // 3) Direct two-textbox write when both parts are known.
    if (code) {
      const twoOk = await this.setTwoTextboxLovByLabel(frame, label, code, display).catch(() => false);
      if (twoOk) return true;
    }

    // 4) Direct label-based write using both code and display.
    if (code && display) {
      const directOk = await this.setLovByLabel(frame, label, code, display).catch(() => false);
      if (directOk) return true;
    }
    if (code || display) {
      const v = code || display;
      const directOk2 = await this.setLovByLabel(frame, label, v, v).catch(() => false);
      if (directOk2) return true;
    }

    console.log(`⚠ ${logLabel || label} LOV could not be set with fallback`);
    return false;
  }

  // =====================================================================
  // Field Helpers
  // =====================================================================

  protected async setField(frame: any, names: string[], value: string, label: string): Promise<boolean> {
    for (const fn of names) {
      const found = await frame.evaluate((n: string) => !!document.querySelector(`input[name="${n}"]`), fn).catch(() => false);
      if (found) {
        await frame.evaluate((a: { f: string; v: string }) => {
          const el = document.querySelector(`input[name="${a.f}"]`) as HTMLInputElement;
          if (el) { el.disabled = false; el.removeAttribute('readonly'); el.value = a.v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); }
        }, { f: fn, v: value }).catch(() => {});
        console.log('✓ ' + label + ' = "' + value + '" (field: ' + fn + ')');
        return true;
      }
    }
    const fallback = await frame.evaluate((search: string) => {
      const s = search.toLowerCase();
      for (const inp of Array.from(document.querySelectorAll('input'))) {
        const n = (inp as HTMLInputElement).name.toLowerCase();
        if (n.includes(s) && !n.startsWith('cat_') && !n.startsWith('btn') && !n.startsWith('pi_')) return (inp as HTMLInputElement).name;
      }
      return '';
    }, label.toLowerCase().replace(/\s+/g, '_')).catch(() => '');
    if (fallback) {
      await frame.evaluate((a: { f: string; v: string }) => {
        const el = document.querySelector(`input[name="${a.f}"]`) as HTMLInputElement;
        if (el) { el.disabled = false; el.removeAttribute('readonly'); el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); }
      }, { f: fallback, v: value }).catch(() => {});
      console.log('✓ ' + label + ' = "' + value + '" (fallback: ' + fallback + ')');
      return true;
    }
    console.log('⚠ ' + label + ' field not found');
    return false;
  }

  protected async setSelect(frame: any, names: string[], match: string, label: string): Promise<boolean> {
    for (const fn of names) {
      const result = await frame.evaluate((a: { n: string; m: string }) => {
        const sel = document.querySelector(`select[name="${a.n}"]`) as HTMLSelectElement;
        if (!sel) return '';
        sel.disabled = false;
        sel.removeAttribute('readonly');
        for (const o of Array.from(sel.options)) {
          if (o.text.trim().toUpperCase().includes(a.m.toUpperCase()) || o.value.toUpperCase() === a.m.toUpperCase()) {
            sel.value = o.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            sel.dispatchEvent(new Event('blur', { bubbles: true }));
            return o.text.trim();
          }
        }
        return '';
      }, { n: fn, m: match }).catch(() => '');
      if (result) { console.log('✓ ' + label + ' = "' + result + '"'); return true; }
    }
    console.log('⚠ ' + label + ' dropdown not found');
    return false;
  }

  protected async setLov(frame: any, codeNames: string[], catNames: string[], code: string, display: string, label: string): Promise<boolean> {
    const c = String(code || '').replace(/\*/g, '').trim();
    const d = String(display || '').replace(/\*/g, '').trim();
    if (!c && !d) {
      console.log('  ⚠ ' + label + ' LOV skipped (no code or display)');
      return false;
    }

    const fire = (el: HTMLElement) => {
       if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; }el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    };

    // Expand the supplied names to also cover hidden Finacle variants (3_, h_, H_).
    const expand = (names: string[]) => {
      const out = new Set<string>();
      for (const n of names) {
        out.add(n);
        out.add(`3_${n}`);
        out.add(`h_${n}`);
        out.add(`H_${n}`);
      }
      return Array.from(out);
    };

    const allCodeNames = expand(codeNames);
    const allCatNames = expand(catNames);

    let found = false;
    try {
      found = await frame.evaluate((args: { names: string[]; val: string }) => {
        let any = false;
        for (const n of args.names) {
          for (const el of Array.from(document.querySelectorAll(`input[name="${n}"]`)) as HTMLInputElement[]) {
            if (el.type === 'button') continue;
            if (el.value === args.val) { any = true; continue; }
            el.removeAttribute('readonly');
            el.value = args.val;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            any = true;
          }
        }
        return any;
      }, { names: allCodeNames, val: c });
    } catch (_) {}

    if (d) {
      try {
        await frame.evaluate((args: { names: string[]; val: string }) => {
          for (const n of args.names) {
            for (const el of Array.from(document.querySelectorAll(`input[name="${n}"]`)) as HTMLInputElement[]) {
              if (el.type === 'button') continue;
              if (el.value === args.val) continue;
              el.value = args.val;
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }, { names: allCatNames, val: d });
      } catch (_) {}
    }

    if (found) console.log('✓ ' + label + ' = "' + c + '" / "' + d + '"');
    else console.log('⚠ ' + label + ' LOV field not found');
    return found;
  }

  /**
   * Set a code/display LOV pair by label. Discovers the actual control(s) in the
   * same table row as the label text and sets both the hidden code input and the
   * visible Cat_/display input. Useful when exact Finacle field names vary.
   */
  protected async setLovByLabel(frame: any, label: string, code: string, display: string): Promise<boolean> {
    const result = await frame.evaluate((args: { label: string; code: string; display: string }) => {
      const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase();
      const labelNorm = normalize(args.label);
      const fire = (el: HTMLElement) => {
         if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; }el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      };

      // Prefer an actual <label> element; only fall back to containers if no label exists.
      let labelEl: HTMLElement | null = null;
      for (const selector of ['label', 'td, th, div, span, p, legend']) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          const t = normalize((el as HTMLElement).innerText || el.textContent);
          if (t === labelNorm || (t.includes(labelNorm) && t.length < labelNorm.length + 25)) {
            labelEl = el as HTMLElement;
            // If this container contains a child <label> that matches, prefer the child label.
            if (labelEl.tagName.toLowerCase() !== 'label') {
              const childLabel = labelEl.querySelector('label');
              if (childLabel && normalize(childLabel.innerText || childLabel.textContent || '') === labelNorm) {
                labelEl = childLabel as HTMLElement;
              }
            }
            break;
          }
        }
        if (labelEl) break;
      }
      if (!labelEl) return false;

      // Narrow the search to the label's table cell and the next sibling cell. This
      // prevents scoring controls from other fields when a <tr> contains multiple fields.
      const getFieldRoots = (el: HTMLElement): Element[] => {
        const cell = el.closest('td, th') as HTMLElement | null;
        if (cell && cell.parentElement && cell.parentElement.tagName.toLowerCase() === 'tr') {
          const row = cell.parentElement;
          const cells = Array.from(row.children).filter(c => {
            const t = c.tagName.toLowerCase();
            return t === 'td' || t === 'th';
          });
          const idx = cells.indexOf(cell);
          const roots: Element[] = [cell];
          if (idx >= 0 && idx + 1 < cells.length) roots.push(cells[idx + 1]);
          return roots;
        }
        const parent = el.parentElement;
        return parent ? [parent] : [document.body];
      };
      const fieldRoots = getFieldRoots(labelEl);
      const queryInRoots = (selector: string): Element | null => {
        for (const root of fieldRoots) {
          const el = root.querySelector(selector);
          if (el) return el;
        }
        return null;
      };

      let codeSet = false;
      let displaySet = false;

      // Find the most likely code input by matching the label words against control names.
      // Hidden code inputs are valid LOV code fields; their geometry is not usable,
      // so name matching is used instead.  We start in the label's cell(s) and fall back
      // to the whole document if the cell is not a normal table/cell container.
      const labelWords = labelNorm.split(/[^a-z0-9]+/).filter(w => w.length > 2);
      const isRelevantName = (n: string) => {
        const name = n.toLowerCase();
        return n && !name.includes('wizard') && !name.includes('hash') && !name.startsWith('btn') && !name.startsWith('pi_') && !name.includes('search');
      };
      const isCatName = (n: string) => {
        const name = n.toLowerCase();
        return name.startsWith('cat_') || name.startsWith('cat');
      };

      const scoreInput = (inp: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, fallback = false) => {
        const n = (inp.name || '').toLowerCase();
        if (!isRelevantName(n)) return -Infinity;
        const isCat = isCatName(n);
        const stripped = n.replace(/^cat_/i, '').replace(/^3_/i, '').replace(/^h_/i, '').replace(/^pi_/i, '');
        let score = 0;
        for (const w of labelWords) {
          if (stripped.includes(w)) score += 200;
          else if (n.includes(w)) score += 80;
        }
        if (fallback) score -= 500; // cell-local matches are strongly preferred
        // Geometry is only meaningful for visible controls.
        if (inp.type !== 'hidden' && inp.tagName.toLowerCase() !== 'select') {
          const r = inp.getBoundingClientRect();
          const lr = labelEl.getBoundingClientRect();
          const dx = Math.abs((r.left + r.width / 2) - (lr.left + lr.width / 2));
          const dy = Math.abs((r.top + r.height / 2) - (lr.top + lr.height / 2));
          score -= dx / 10 + dy / 5;
        }
        if (isCat) score -= 50; // prefer the code input over its display companion
        if (inp.type === 'hidden') score -= 20; // hidden code is acceptable, but a visible code box is slightly preferred
        if (inp.tagName.toLowerCase() === 'select') score -= 30;
        return score;
      };

      const collectInputs = (root: Element | Document) => Array.from(root.querySelectorAll('input, select, textarea')) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];
      const collectFromRoots = (roots: Element[]) => roots.flatMap(r => collectInputs(r));
      const rowInputs = collectFromRoots(fieldRoots);
      const allInputs = collectInputs(document);
      // Always start in the label's own cell/row; only expand to the whole document
      // if the scoped cells contain no candidate and apply a heavy fallback penalty.
      let inputs = rowInputs.length > 0 ? rowInputs : allInputs;

      let bestCode: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null = null;
      let bestCodeScore = -Infinity;
      let bestCat: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null = null;
      let bestCatScore = -Infinity;

      for (const inp of inputs) {
        if (inp === labelEl) continue;
        const n = (inp.name || '').toLowerCase();
        if (!isRelevantName(n)) continue;
        const score = scoreInput(inp, inputs === allInputs && rowInputs.length > 0);
        if (score === -Infinity) continue;
        if (isCatName(n)) {
          if (score > bestCatScore) { bestCatScore = score; bestCat = inp; }
        } else {
          if (score > bestCodeScore) { bestCodeScore = score; bestCode = inp; }
        }
      }

      // If the scoped cells had no usable controls, try the whole document as a last resort.
      if (!bestCode && !bestCat && rowInputs.length > 0) {
        for (const inp of allInputs) {
          if (inp === labelEl) continue;
          const n = (inp.name || '').toLowerCase();
          if (!isRelevantName(n)) continue;
          const score = scoreInput(inp, true);
          if (score === -Infinity) continue;
          if (isCatName(n)) {
            if (score > bestCatScore) { bestCatScore = score; bestCat = inp; }
          } else {
            if (score > bestCodeScore) { bestCodeScore = score; bestCode = inp; }
          }
        }
      }

      const setValue = (inp: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, val: string) => {
        if ((inp as HTMLInputElement).value === val) return;
        (inp as HTMLInputElement).disabled = false;
        (inp as HTMLInputElement).removeAttribute('readonly');
        if (inp.tagName.toLowerCase() === 'select') {
          const sel = inp as HTMLSelectElement;
          const v = val.toUpperCase();
          for (const o of Array.from(sel.options)) {
            if (o.value.toUpperCase() === v || o.text.trim().toUpperCase() === v) { sel.value = o.value; break; }
          }
        } else {
          (inp as HTMLInputElement).value = val;
        }
        fire(inp as HTMLElement);
      };

      // If we only found a Cat_/display input, derive the hidden code input name and look it up.
      if (!bestCode && bestCat) {
        const catName = bestCat.getAttribute('name') || '';
        const base = catName.replace(/^cat_/i, '');
        const candidate = queryInRoots(`input[name="${base}"], input[name="3_${base}"], input[name="h_${base}"]`) as HTMLInputElement | null;
        if (candidate) bestCode = candidate;
      }

      // If we only found a code input, try to locate its Cat_/display companion.
      if (bestCode && !bestCat) {
        const base = (bestCode.getAttribute('name') || '').replace(/^3_/i, '').replace(/^h_/i, '').replace(/^pi_/i, '');
        if (base) {
          bestCat = queryInRoots(`input[name="cat_${base}" i]`) as HTMLInputElement | null;
        }
      }

      if (!bestCode) return false;

      setValue(bestCode, args.code);
      codeSet = true;
      if (bestCat) { setValue(bestCat, args.display); displaySet = true; }

      return codeSet;
    }, { label, code, display }).catch(() => false);

    if (result) {
      console.log('✓ ' + label + ' LOV by label = "' + code + '" / "' + display + '"');
      return true;
    }
    console.log('⚠ ' + label + ' LOV by label not set');
    return false;
  }

  /**
   * Read-only helper that returns the current code and display values for an LOV
   * field identified by its label. Used to skip re-entry when values are already
   * populated.
   */
  protected async getLovValueByLabel(frame: any, label: string): Promise<{ code: string; display: string } | null> {
    const result = await frame.evaluate((args: { label: string }) => {
      const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase();
      const labelNorm = normalize(args.label);

      let labelEl: HTMLElement | null = null;
      for (const selector of ['label', 'td, th, div, span, p, legend']) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          const t = normalize((el as HTMLElement).innerText || el.textContent);
          if (t === labelNorm || (t.includes(labelNorm) && t.length < labelNorm.length + 25)) {
            labelEl = el as HTMLElement;
            if (labelEl.tagName.toLowerCase() !== 'label') {
              const childLabel = labelEl.querySelector('label');
              if (childLabel && normalize(childLabel.innerText || childLabel.textContent || '') === labelNorm) {
                labelEl = childLabel as HTMLElement;
              }
            }
            break;
          }
        }
        if (labelEl) break;
      }
      if (!labelEl) return null;

      // Narrow the search to the label's table cell and the next sibling cell.
      const getFieldRoots = (el: HTMLElement): Element[] => {
        const cell = el.closest('td, th') as HTMLElement | null;
        if (cell && cell.parentElement && cell.parentElement.tagName.toLowerCase() === 'tr') {
          const row = cell.parentElement;
          const cells = Array.from(row.children).filter(c => {
            const t = c.tagName.toLowerCase();
            return t === 'td' || t === 'th';
          });
          const idx = cells.indexOf(cell);
          const roots: Element[] = [cell];
          if (idx >= 0 && idx + 1 < cells.length) roots.push(cells[idx + 1]);
          return roots;
        }
        const parent = el.parentElement;
        return parent ? [parent] : [document.body];
      };
      const fieldRoots = getFieldRoots(labelEl);
      const queryInRoots = (selector: string): Element | null => {
        for (const root of fieldRoots) {
          const el = root.querySelector(selector);
          if (el) return el;
        }
        return null;
      };

      const labelWords = labelNorm.split(/[^a-z0-9]+/).filter(w => w.length > 2);
      const isRelevantName = (n: string) => {
        const name = n.toLowerCase();
        return n && !name.includes('wizard') && !name.includes('hash') && !name.startsWith('btn') && !name.startsWith('pi_') && !name.includes('search');
      };
      const isCatName = (n: string) => {
        const name = n.toLowerCase();
        return name.startsWith('cat_') || name.startsWith('cat');
      };

      const scoreInput = (inp: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, fallback = false) => {
        const n = (inp.name || '').toLowerCase();
        if (!isRelevantName(n)) return -Infinity;
        const isCat = isCatName(n);
        const stripped = n.replace(/^cat_/i, '').replace(/^3_/i, '').replace(/^h_/i, '').replace(/^pi_/i, '');
        let score = 0;
        for (const w of labelWords) {
          if (stripped.includes(w)) score += 200;
          else if (n.includes(w)) score += 80;
        }
        if (fallback) score -= 500;
        if (inp.type !== 'hidden' && inp.tagName.toLowerCase() !== 'select') {
          const r = inp.getBoundingClientRect();
          const lr = labelEl!.getBoundingClientRect();
          const dx = Math.abs((r.left + r.width / 2) - (lr.left + lr.width / 2));
          const dy = Math.abs((r.top + r.height / 2) - (lr.top + lr.height / 2));
          score -= dx / 10 + dy / 5;
        }
        if (isCat) score -= 50;
        if (inp.type === 'hidden') score -= 20;
        if (inp.tagName.toLowerCase() === 'select') score -= 30;
        return score;
      };

      const collectInputs = (root: Element | Document) => Array.from(root.querySelectorAll('input, select, textarea')) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];
      const collectFromRoots = (roots: Element[]) => roots.flatMap(r => collectInputs(r));
      const rowInputs = collectFromRoots(fieldRoots);
      const allInputs = collectInputs(document);
      let inputs = rowInputs.length > 0 ? rowInputs : allInputs;

      let bestCode: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null = null;
      let bestCodeScore = -Infinity;
      let bestCat: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null = null;
      let bestCatScore = -Infinity;

      for (const inp of inputs) {
        if (inp === labelEl) continue;
        const n = (inp.name || '').toLowerCase();
        if (!isRelevantName(n)) continue;
        const score = scoreInput(inp, inputs === allInputs && rowInputs.length > 0);
        if (score === -Infinity) continue;
        if (isCatName(n)) {
          if (score > bestCatScore) { bestCatScore = score; bestCat = inp; }
        } else {
          if (score > bestCodeScore) { bestCodeScore = score; bestCode = inp; }
        }
      }

      // If the scoped cells had no usable controls, try the whole document as a last resort.
      if (!bestCode && !bestCat && rowInputs.length > 0) {
        for (const inp of allInputs) {
          if (inp === labelEl) continue;
          const n = (inp.name || '').toLowerCase();
          if (!isRelevantName(n)) continue;
          const score = scoreInput(inp, true);
          if (score === -Infinity) continue;
          if (isCatName(n)) {
            if (score > bestCatScore) { bestCatScore = score; bestCat = inp; }
          } else {
            if (score > bestCodeScore) { bestCodeScore = score; bestCode = inp; }
          }
        }
      }

      if (!bestCode && bestCat) {
        const catName = bestCat.getAttribute('name') || '';
        const base = catName.replace(/^cat_/i, '');
        const candidate = queryInRoots(`input[name="${base}"], input[name="3_${base}"], input[name="h_${base}"]`) as HTMLInputElement | null;
        if (candidate) bestCode = candidate;
      }
      if (bestCode && !bestCat) {
        const base = (bestCode.getAttribute('name') || '').replace(/^3_/i, '').replace(/^h_/i, '').replace(/^pi_/i, '');
        if (base) {
          bestCat = queryInRoots(`input[name="cat_${base}" i]`) as HTMLInputElement | null;
        }
      }

      if (!bestCode) return null;
      const code = (bestCode as HTMLInputElement).value || '';
      const display = bestCat ? (bestCat as HTMLInputElement).value || '' : code;
      return { code, display };
    }, { label }).catch(() => null);

    if (result) {
      console.log('  Read LOV value for ' + label + ': code="' + result.code + '", display="' + result.display + '"');
    }
    return result;
  }

  /**
   * Two-textbox LOV: type the workbook code into the first visible input
   * and let the application auto-populate the category value in the second
   * textbox. If the category box remains empty, optionally fill it with the
   * supplied display value. Does NOT open the lookup popup.
   */
  protected async setTwoTextboxLovByLabel(
    frame: any,
    label: string,
    codeValue: string,
    displayValue?: string
  ): Promise<boolean> {
    const code = String(codeValue || '').trim();
    if (!code) return false;
    const display = String(displayValue || '').trim();

    const result = await frame.evaluate((args: { label: string; code: string; display: string }) => {
      const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase();
      const labelNorm = normalize(args.label);

      const isVisible = (c: Element) => {
        if ((c as HTMLInputElement).type && (c as HTMLInputElement).type.toLowerCase() === 'hidden') return false;
        const style = window.getComputedStyle(c);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const r = (c as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };

      const isButtonLike = (c: HTMLElement) => {
        if (c.tagName === 'BUTTON') return true;
        const t = ((c as HTMLInputElement).type || '').toLowerCase();
        return t === 'button' || t === 'submit' || t === 'image' || c.getAttribute('role') === 'button';
      };

      const isCat = (c: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
        const n = (c.name || '').toLowerCase();
        return n.startsWith('cat_') || n.startsWith('cat') || n.includes('category');
      };

      const fire = (el: HTMLElement, events = ['input', 'change', 'blur']) => {
         if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; }for (const ev of events) el.dispatchEvent(new Event(ev, { bubbles: true }));
      };

      let labelEl: HTMLElement | null = null;
      for (const el of Array.from(document.querySelectorAll('label, td, th, div, span, p, legend'))) {
        const rawText = String((el as HTMLElement).innerText || el.textContent || '').replace(/\*+/g, '');
        const t = normalize(rawText);
        if (t === labelNorm || (t.includes(labelNorm) && t.length < labelNorm.length + 25)) {
          labelEl = el as HTMLElement;
          break;
        }
      }
      if (!labelEl) return false;

      // Scope the control search to the label's table cell and the next sibling cell.
      const getFieldRoots = (el: HTMLElement): Element[] => {
        const cell = el.closest('td, th') as HTMLElement | null;
        if (cell && cell.parentElement && cell.parentElement.tagName.toLowerCase() === 'tr') {
          const row = cell.parentElement;
          const cells = Array.from(row.children).filter(c => {
            const t = c.tagName.toLowerCase();
            return t === 'td' || t === 'th';
          });
          const idx = cells.indexOf(cell);
          const roots: Element[] = [cell];
          if (idx >= 0 && idx + 1 < cells.length) roots.push(cells[idx + 1]);
          return roots;
        }
        const parent = el.parentElement;
        return parent ? [parent] : [document.body];
      };
      const fieldRoots = getFieldRoots(labelEl);

      const allControls = fieldRoots.flatMap(r => Array.from(r.querySelectorAll('input, select, textarea')))
        .filter((c: any) => isVisible(c) && !isButtonLike(c as HTMLElement)) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];

      const afterLabel = allControls.filter(c =>
        labelEl!.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING ||
        labelEl!.contains(c)
      );

      if (afterLabel.length === 0) return false;

      let codeInput: HTMLElement | null = null;
      let catInput: HTMLElement | null = null;
      for (const c of afterLabel) {
        if (!codeInput && !isCat(c)) codeInput = c as HTMLElement;
        else if (!catInput && isCat(c)) catInput = c as HTMLElement;
      }
      if (!codeInput) codeInput = afterLabel[0];

      // If there is no Cat_ display field, the second plain input after the code field
      // is treated as the category/display textbox.
      if (!catInput && afterLabel.length > 1) {
        for (const c of afterLabel) {
          if (c !== codeInput && !isCat(c as HTMLInputElement)) { catInput = c as HTMLElement; break; }
        }
      }

      if (codeInput.tagName.toLowerCase() === 'select') {
        const sel = codeInput as HTMLSelectElement;
        const search = args.code || args.display;
        let matched = false;
        for (const o of Array.from(sel.options)) {
          const optText = o.text.replace(/\*/g, '').trim().toUpperCase();
          const optVal = o.value.replace(/\*/g, '').trim().toUpperCase();
          if (optText === search.toUpperCase() || optVal === search.toUpperCase()) {
            sel.value = o.value; matched = true; break;
          }
        }
        if (!matched) {
          for (const o of Array.from(sel.options)) {
            const optText = o.text.replace(/\*/g, '').trim().toUpperCase();
            const optVal = o.value.replace(/\*/g, '').trim().toUpperCase();
            if (optText.includes(search.toUpperCase()) || optVal.includes(search.toUpperCase())) {
              sel.value = o.value; matched = true; break;
            }
          }
        }
        if (matched) {
          sel.disabled = false; sel.removeAttribute('readonly'); fire(sel);
          return true;
        }
        return false;
      }

      const inp = codeInput as HTMLInputElement;
      inp.disabled = false; inp.removeAttribute('readonly');
      if (inp.value !== args.code) {
        inp.value = args.code;
        fire(inp, ['input', 'change', 'blur']);
        if (inp.dispatchEvent) {
          inp.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: args.code.slice(-1) || 'Tab' }));
          inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: args.code.slice(-1) || 'Tab' }));
        }
      }

      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          if (catInput && args.display) {
            const cat = catInput as HTMLInputElement;
            if (!cat.value || cat.value.trim() === '' || cat.value.toUpperCase() === args.code.toUpperCase()) {
              cat.disabled = false; cat.removeAttribute('readonly');
              cat.value = args.display;
              fire(cat, ['input', 'change', 'blur']);
            }
          }
          resolve(true);
        }, 400);
      });
    }, { label, code, display }).catch(() => false);

    if (result) {
      console.log('✓ ' + label + ' (two-textbox) = "' + code + '"' + (display ? ' / "' + display + '"' : ''));
      return true;
    }
    console.log('⚠ ' + label + ' (two-textbox) not set');
    return false;
  }

  /**
   * Generic code-or-category field setter.
   * Tries a plain select/text field first, then a two-textbox LOV, then a popup LOV.
   * The supplied `code` is tried first; if a `display` value is supplied, that is
   * used as a fallback, so workbook values that are either Codes or Categories work.
   */
  protected async setSelectOrLovByLabel(
    frame: any,
    label: string,
    code: string,
    display?: string,
    typeHint: 'auto' | 'select' | 'text' | 'lov' = 'auto',
    lovButtonName?: string
  ): Promise<boolean> {
    let codeVal = String(code || '').replace(/\*/g, '').trim();
    if (!codeVal) return false;
    const displayVal = String(display || codeVal).replace(/\*/g, '').trim();
    const searchValues = [...new Set([codeVal, displayVal])];

    // Y/N workbook values are boolean Yes/No indicators, not LOV codes.
    // Treat them as dropdown/checkbox selections and never open an LOV popup for them.
    const isBooleanValue = ['Y', 'N', 'YES', 'NO', 'TRUE', 'FALSE'].includes(codeVal.toUpperCase());
    if (isBooleanValue && (typeHint === 'auto' || typeHint === 'lov')) typeHint = 'select';

    let any = false;

    if (typeHint === 'auto' || typeHint === 'select' || typeHint === 'text') {
      const preferredType = typeHint === 'auto' ? 'select' : typeHint;
      any = await this.setGenericFieldByLabel(frame, label, codeVal, preferredType).catch(() => false) || any;
    }

    if (typeHint === 'auto' || typeHint === 'lov') {
      any = await this.setTwoTextboxLovByLabel(frame, label, codeVal, displayVal).catch(() => false) || any;

      const candidates: string[] = [];
      if (lovButtonName) candidates.push(lovButtonName);
      const discovered = await this.findLovButtonNamesByLabel(frame, label).catch(() => [] as string[]);
      for (const d of discovered) if (!candidates.includes(d)) candidates.push(d);

      for (const bn of candidates) {
        const directFieldName = bn.startsWith('btnone_') || bn.startsWith('btntwo_')
          ? bn.replace(/^btnone_|^btntwo_/, '')
          : undefined;
        for (const sv of searchValues) {
          any = await this.selectLovValue({
            parentPage: this.workingPage,
            target: frame,
            buttonName: bn,
            searchValue: sv,
            label,
            config: this.config,
            directFieldName,
            fallback: { code: codeVal, display: displayVal }
          }).catch(() => false) || any;
        }
      }
    }

    // Final hidden-field fallback for LOV fields: ensure the code and category inputs are
    // populated, even when the visible control alone was set or the popup did not persist.
    if (typeHint === 'auto' || typeHint === 'lov') {
      const candidates: string[] = [];
      if (lovButtonName) candidates.push(lovButtonName);
      if (typeHint === 'auto' || candidates.length === 0) {
        const discovered = await this.findLovButtonNamesByLabel(frame, label).catch(() => [] as string[]);
        for (const d of discovered) if (!candidates.includes(d)) candidates.push(d);
      }
      for (const bn of candidates) {
        if (!bn.startsWith('btnone_') && !bn.startsWith('btntwo_')) continue;
        const base = bn.replace(/^btnone_|^btntwo_/, '');
        if (!base) continue;
        const suffix = base.includes('.') ? base.split('.').pop()! : base;
        const codeNames = [
          base,
          `3_${base}`,
          `h_${base}`,
          `H_${base}`,
          base.replace(/^AccountBO\./, 'AccountModBO.').replace(/^AccountModBO\./, 'AccountBO.'),
          `AccountModBO.${suffix}`,
          `AccountBO.${suffix}`,
          `3_AccountModBO.${suffix}`,
          `3_AccountBO.${suffix}`,
          `h_AccountModBO.${suffix}`,
          `h_AccountBO.${suffix}`,
          `H_AccountModBO.${suffix}`,
          `H_AccountBO.${suffix}`
        ];
        const catNames = [
          `Cat_${base}`,
          `CAT_${base}`,
          `3_Cat_${base}`,
          `Cat3_${base}`,
          `h_Cat_${base}`,
          `H_Cat_${base}`,
          `Cat_AccountModBO.${suffix}`,
          `Cat_AccountBO.${suffix}`,
          `3_Cat_AccountModBO.${suffix}`,
          `3_Cat_AccountBO.${suffix}`,
          `h_Cat_AccountModBO.${suffix}`,
          `h_Cat_AccountBO.${suffix}`
        ];
        // Preserve any display value already populated by an earlier LOV popup.
        const displayToUse = await this.readInputValue(frame, `Cat_${base}`).catch(() => '')
          || await this.readInputValue(frame, `Cat_AccountModBO.${suffix}`).catch(() => '')
          || displayVal
          || codeVal;
        const set = await this.setLov(frame, [...new Set(codeNames)], [...new Set(catNames)], codeVal, displayToUse, label).catch(() => false);
        any = any || set;
      }
    }

    return any;
  }

  /**
   * Read the current value of a named input inside a frame.
   */
  protected async readInputValue(frame: any, name: string): Promise<string> {
    if (!frame || !name) return '';
    return frame.evaluate((n: string) => {
      const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement;
      return el ? (el.value || '') : '';
    }, name).catch(() => '');
  }

  /**
   * Find the most likely base input name for a visible field label (the non-Cat_ input).
   * Used when no named LOV button exists so the resolved code/display pair can be
   * written directly to the form.
   */
  protected async findFieldNameByLabel(frame: any, label: string): Promise<string | undefined> {
    if (!frame) return undefined;
    return frame.evaluate((args: { label: string }) => {
      const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase();
      const labelNorm = normalize(args.label);
      const labelWords = labelNorm.split(/[^a-z0-9]+/).filter(w => w.length > 2);
      const isFormControl = (name: string) => {
        const n = name.toLowerCase();
        return n && !n.startsWith('btn') && !n.startsWith('pi_') && !n.includes('search') && !n.includes('wizard') && !n.includes('hash');
      };
      const isCatName = (name: string) => {
        const n = name.toLowerCase();
        return n.startsWith('cat_') || n.startsWith('cat');
      };

      // Prefer an exact <label> match; fall back to container text.
      let labelEl: HTMLElement | null = null;
      for (const selector of ['label', 'td, th, div, span, p, legend']) {
        for (const el of Array.from(document.querySelectorAll(selector)) as HTMLElement[]) {
          const t = normalize(el.innerText || el.textContent || '');
          if (t === labelNorm || (t.includes(labelNorm) && t.length < labelNorm.length + 25)) {
            labelEl = el;
            if (labelEl.tagName.toLowerCase() !== 'label') {
              const childLabel = labelEl.querySelector('label');
              if (childLabel && normalize(childLabel.innerText || childLabel.textContent || '') === labelNorm) {
                labelEl = childLabel as HTMLElement;
              }
            }
            break;
          }
        }
        if (labelEl) break;
      }
      if (!labelEl) return undefined;

      const getFieldRoots = (el: HTMLElement): Element[] => {
        const cell = el.closest('td, th') as HTMLElement | null;
        if (cell && cell.parentElement && cell.parentElement.tagName.toLowerCase() === 'tr') {
          const row = cell.parentElement;
          const cells = Array.from(row.children).filter(c => {
            const t = c.tagName.toLowerCase();
            return t === 'td' || t === 'th';
          });
          const idx = cells.indexOf(cell);
          const roots: Element[] = [cell];
          if (idx >= 0 && idx + 1 < cells.length) roots.push(cells[idx + 1]);
          return roots;
        }
        const parent = el.parentElement;
        return parent ? [parent] : [document.body];
      };
      const queryInRoots = (selector: string): Element | null => {
        for (const root of fieldRoots) {
          const el = root.querySelector(selector);
          if (el) return el;
        }
        return document.querySelector(selector);
      };
      const collectFromRoots = (roots: Element[]) => roots.flatMap(r => Array.from(r.querySelectorAll('input, select, textarea')) as HTMLInputElement[]);
      const fieldRoots = getFieldRoots(labelEl);
      const labelRect = labelEl.getBoundingClientRect();

      const inputs = collectFromRoots(fieldRoots);
      let bestCode: HTMLInputElement | null = null;
      let bestCat: HTMLInputElement | null = null;
      let bestScore = -Infinity;

      for (const inp of inputs) {
        if (inp === labelEl) continue;
        const n = inp.getAttribute('name') || '';
        if (!isFormControl(n)) continue;
        if (isCatName(n)) {
          // Track the best matching Cat_/display input separately.
          const stripped = n.replace(/^cat_/i, '').replace(/^3_/i, '').replace(/^h_/i, '').replace(/^pi_/i, '').toLowerCase();
          let score = 0;
          for (const w of labelWords) { if (stripped.includes(w)) score += 100; }
          // Apply geometry only when the Cat_ input is visible; hidden Cat_ inputs are unusual.
          if (inp.type !== 'hidden') {
            const r = inp.getBoundingClientRect();
            const dy = Math.abs((r.top + r.height / 2) - (labelRect.top + labelRect.height / 2));
            const dx = r.left - (labelRect.left + labelRect.width);
            if (dx < -10 || dy > Math.max(labelRect.height, r.height) * 2) continue;
            score -= dx + dy * 2;
          }
          if (!bestCat || score > (bestCat.dataset.score ? Number(bestCat.dataset.score) : -Infinity)) { bestCat = inp; (bestCat as any).dataset.score = String(score); }
          continue;
        }
        const stripped = n.replace(/^3_/i, '').replace(/^h_/i, '').replace(/^pi_/i, '').toLowerCase();
        let score = 0;
        for (const w of labelWords) { if (stripped.includes(w)) score += 200; else if (n.toLowerCase().includes(w)) score += 80; }
        // Hidden code inputs are valid LOV code fields and have no usable geometry, so rely on name matching for them.
        if (inp.type !== 'hidden') {
          const r = inp.getBoundingClientRect();
          const dy = Math.abs((r.top + r.height / 2) - (labelRect.top + labelRect.height / 2));
          const dx = r.left - (labelRect.left + labelRect.width);
          score -= dx / 5 + dy / 2;
          if (dx < -10 || dy > Math.max(labelRect.height, r.height) * 3) continue;
        } else {
          score -= 10; // hidden code inputs are acceptable, just slightly deprioritised vs a visible code box
        }
        if (score > bestScore) { bestScore = score; bestCode = inp; }
      }

      if (!bestCode && bestCat) {
        // If only a Cat_/display input was found, derive the likely code input name.
        const catName = bestCat.getAttribute('name') || '';
        const base = catName.replace(/^cat_/i, '').replace(/^CAT_/i, '');
        const codeCandidate = queryInRoots(`input[name="${base}"], input[name="3_${base}"], input[name="h_${base}"]`) as HTMLInputElement | null;
        if (codeCandidate) bestCode = codeCandidate;
      }

      return bestCode ? (bestCode.getAttribute('name') || undefined) : undefined;
    }, { label }).catch(() => undefined);
  }

  /**
   * Discover LOV popup button names for a field label.
   * Only returns real, visible LOV buttons in the same row/cell as the label and,
   * when an associated code input can be found, the button names derived from it.
   */
  protected async findLovButtonNamesByLabel(frame: any, label: string): Promise<string[]> {
    if (!frame) return [];
    return frame.evaluate((args: { label: string }) => {
      const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase();
      const labelNorm = normalize(args.label);
      const labelWords = labelNorm.split(/[^a-z0-9]+/).filter(w => w.length > 2);
      const results: string[] = [];
      const isVisible = (el: Element) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const isFormControl = (name: string) => {
        const n = name.toLowerCase();
        return n && !n.startsWith('btn') && !n.startsWith('pi_') && !n.includes('search') && !n.includes('wizard') && !n.includes('hash');
      };
      const isCatName = (name: string) => {
        const n = name.toLowerCase();
        return n.startsWith('cat_') || n.startsWith('cat');
      };

      // Prefer an exact <label> match; fall back to containers.
      let labelEl: HTMLElement | null = null;
      for (const selector of ['label', 'td, th, div, span, p, legend']) {
        for (const el of Array.from(document.querySelectorAll(selector)) as HTMLElement[]) {
          const t = normalize(el.innerText || el.textContent || '');
          if (t === labelNorm || (t.includes(labelNorm) && t.length < labelNorm.length + 25)) {
            labelEl = el;
            if (labelEl.tagName.toLowerCase() !== 'label') {
              const childLabel = labelEl.querySelector('label');
              if (childLabel && normalize(childLabel.innerText || childLabel.textContent || '') === labelNorm) {
                labelEl = childLabel as HTMLElement;
              }
            }
            break;
          }
        }
        if (labelEl) break;
      }
      if (!labelEl) return [];

      const getFieldRoots = (el: HTMLElement): Element[] => {
        const cell = el.closest('td, th') as HTMLElement | null;
        if (cell && cell.parentElement && cell.parentElement.tagName.toLowerCase() === 'tr') {
          const row = cell.parentElement;
          const cells = Array.from(row.children).filter(c => {
            const t = c.tagName.toLowerCase();
            return t === 'td' || t === 'th';
          });
          const idx = cells.indexOf(cell);
          const roots: Element[] = [cell];
          if (idx >= 0 && idx + 1 < cells.length) roots.push(cells[idx + 1]);
          return roots;
        }
        const parent = el.parentElement;
        return parent ? [parent] : [document.body];
      };
      const queryInRoots = (selector: string): Element | null => {
        for (const root of fieldRoots) {
          const el = root.querySelector(selector);
          if (el) return el;
        }
        return document.querySelector(selector);
      };
      const collectFromRoots = (roots: Element[]) => roots.flatMap(r => Array.from(r.querySelectorAll('input, select, textarea')) as HTMLInputElement[]);
      const fieldRoots = getFieldRoots(labelEl);

      // Actual visible LOV buttons in the same cell(s)
      const btns = collectFromRoots(fieldRoots).filter(el => {
        const tag = el.tagName.toLowerCase();
        const type = (el as HTMLInputElement).type || '';
        return (tag === 'input' && (type === 'button' || type === 'submit' || type === 'image')) || tag === 'button' || (tag === 'input' && (el as HTMLInputElement).onclick !== null);
      });
      for (const b of btns) {
        if (!isVisible(b)) continue;
        const name = b.getAttribute('name') || '';
        if (name && /^btnone_|^btntwo_|lookup|lov/i.test(name)) results.push(name);
      }

      // Find the code input associated with this label and add its exact LOV button names.
      const labelRect = labelEl.getBoundingClientRect();
      const controls = collectFromRoots(fieldRoots);
      let bestCode: HTMLInputElement | null = null;
      let bestCat: HTMLInputElement | null = null;
      let bestScore = -Infinity;
      for (const inp of controls) {
        if (inp === labelEl) continue;
        const n = inp.getAttribute('name') || '';
        if (!isFormControl(n)) continue;
        if (isCatName(n)) {
          const r = inp.getBoundingClientRect();
          const dy = Math.abs((r.top + r.height / 2) - (labelRect.top + labelRect.height / 2));
          const dx = r.left - (labelRect.left + labelRect.width);
          if (dx < -10 || dy > Math.max(labelRect.height, r.height) * 2) continue;
          const stripped = n.replace(/^cat_/i, '').replace(/^3_/i, '').replace(/^h_/i, '').replace(/^pi_/i, '').toLowerCase();
          let score = -dx - dy * 2;
          for (const w of labelWords) { if (stripped.includes(w)) score += 120; }
          if (!bestCat || score > Number(bestCat.dataset.btnScore || -Infinity)) { bestCat = inp; (bestCat as any).dataset.btnScore = String(score); }
          continue;
        }
        const stripped = n.replace(/^3_/i, '').replace(/^h_/i, '').replace(/^pi_/i, '').toLowerCase();
        let score = 0;
        for (const w of labelWords) { if (stripped.includes(w)) score += 200; else if (n.toLowerCase().includes(w)) score += 80; }
        const r = inp.getBoundingClientRect();
        const dy = Math.abs((r.top + r.height / 2) - (labelRect.top + labelRect.height / 2));
        const dx = r.left - (labelRect.left + labelRect.width);
        score -= dx / 5 + dy / 2;
        if (inp.type === 'hidden') score -= 10;
        if (dx < -10 || dy > Math.max(labelRect.height, r.height) * 3) continue;
        if (score > bestScore) { bestScore = score; bestCode = inp; }
      }
      if (!bestCode && bestCat) {
        const catName = bestCat.getAttribute('name') || '';
        const base = catName.replace(/^cat_/i, '');
        const codeCandidate = queryInRoots(`input[name="${base}"], input[name="3_${base}"], input[name="h_${base}"]`) as HTMLInputElement | null;
        if (codeCandidate) bestCode = codeCandidate;
      }
      if (bestCode) {
        const n = bestCode.getAttribute('name') || '';
        const expected = [`btnone_${n}`, `btntwo_${n}`];
        for (const e of expected) {
          if (queryInRoots(`input[type="button"][name="${e}"]`) ||
              queryInRoots(`input[type="image"][name="${e}"]`) ||
              queryInRoots(`input[name="${e}"]`)) {
            results.push(e);
          }
        }
      }

      return [...new Set(results)];
    }, { label }).catch(() => [] as string[]);
  }

  /**
   * Try to open an LOV popup by clicking the lookup icon next to a field label.
   * Works for anchor, image, input[type="image"] and button icons inside the same row.
   */
  protected async openLovPopupByLabel(frame: any, label: string, config: AppConfig, parentPage: Page): Promise<Page | null> {
    if (!frame) return null;
    const popupPromise = parentPage.context().waitForEvent('page', { timeout: config.timeouts.long15 }).catch(() => null);
    const iconInfo = await frame.evaluate((args: { label: string }) => {
      const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase();
      const labelNorm = normalize(args.label);

      // Prefer an actual <label> element; fall back to container text.
      let labelEl: HTMLElement | null = null;
      for (const selector of ['label', 'td, th, div, span, legend, p']) {
        for (const el of Array.from(document.querySelectorAll(selector)) as HTMLElement[]) {
          const t = normalize(el.innerText || el.textContent || '');
          if (t && (t === labelNorm || (t.length < labelNorm.length + 25 && t.includes(labelNorm)))) {
            labelEl = el;
            if (labelEl.tagName.toLowerCase() !== 'label') {
              const childLabel = labelEl.querySelector('label');
              if (childLabel && normalize(childLabel.innerText || childLabel.textContent || '') === labelNorm) {
                labelEl = childLabel as HTMLElement;
              }
            }
            break;
          }
        }
        if (labelEl) break;
      }
      if (!labelEl) return { ok: false, reason: 'label not found' };

      const isVisible = (el: Element) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.width < 200 && r.height < 200;
      };

      const scoreIcon = (el: HTMLElement, labelRect: DOMRect) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return -Infinity;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const lx = labelRect.left + labelRect.width / 2;
        const ly = labelRect.top + labelRect.height / 2;
        const dx = cx - lx;
        const dy = Math.abs(cy - ly);
        // the icon should be to the right of the label and on the same visual row
        if (dx < -30 || dy > 90) return -Infinity;
        let score = -dx * 2 - dy * 5;
        const tag = el.tagName.toLowerCase();
        const type = ((el as HTMLInputElement).type || '').toLowerCase();
        const onclick = (el.getAttribute('onclick') || '').toLowerCase();
        const href = (el.getAttribute('href') || '').toLowerCase();
        const src = (el.getAttribute('src') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        const alt = (el.getAttribute('alt') || '').toLowerCase();
        if (/lookup|search|openwindow|showrefcode|listofvalue|getlistofvalue/i.test(onclick + ' ' + href + ' ' + title + ' ' + alt)) score += 400;
        if (/search|lookup|lov|icon/i.test(src)) score += 300;
        if (tag === 'input' && (type === 'image' || type === 'button')) score += 150;
        if (tag === 'img' || tag === 'button' || tag === 'a') score += 100;
        if (r.width < 10 || r.height < 10) score -= 200;
        return score;
      };

      const labelRect = labelEl.getBoundingClientRect();

      // LOV icons live in the label's table cell or the next sibling cell. Scope the
      // search to those cells so a field in a multi-field row does not pick up a
      // neighbour's icon.
      const getFieldRoots = (el: HTMLElement): Element[] => {
        const cell = el.closest('td, th') as HTMLElement | null;
        if (cell && cell.parentElement && cell.parentElement.tagName.toLowerCase() === 'tr') {
          const row = cell.parentElement;
          const cells = Array.from(row.children).filter(c => {
            const t = c.tagName.toLowerCase();
            return t === 'td' || t === 'th';
          });
          const idx = cells.indexOf(cell);
          const roots: Element[] = [cell];
          if (idx >= 0 && idx + 1 < cells.length) roots.push(cells[idx + 1]);
          return roots;
        }
        const parent = el.parentElement;
        return parent ? [parent] : [document.body];
      };
      const fieldRoots = getFieldRoots(labelEl);

      let bestIcon: HTMLElement | null = null;
      let bestScore = -Infinity;

      const iconsInRoots = fieldRoots.flatMap(r => Array.from(r.querySelectorAll(
        'input[type="image"], input[type="button"], button, a, img, span[onclick], i[onclick]'
      ))).filter(isVisible) as HTMLElement[];
      for (const el of iconsInRoots) {
        if (el === labelEl || el.contains(labelEl) || labelEl.contains(el)) continue;
        const score = scoreIcon(el, labelRect);
        if (score !== -Infinity && score > bestScore) { bestScore = score; bestIcon = el; }
      }

      // If the icon is not in the label's cell(s), do a narrow whole-frame search limited
      // to the same visual row and the right-hand side of the label.
      if (!bestIcon) {
        for (const el of Array.from(document.querySelectorAll(
          'input[type="image"], input[type="button"], button, a, img, span[onclick], i[onclick]'
        )).filter(isVisible) as HTMLElement[]) {
          if (el === labelEl || el.contains(labelEl) || labelEl.contains(el)) continue;
          const score = scoreIcon(el, labelRect);
          if (score !== -Infinity && score > bestScore) { bestScore = score; bestIcon = el; }
        }
      }

      if (!bestIcon) return { ok: false, reason: 'no lookup icon' };
      const clickable = (bestIcon.closest('a, button') || bestIcon) as HTMLElement;
      clickable.click();
      return { ok: true, tag: bestIcon.tagName, id: bestIcon.id, name: (bestIcon as HTMLInputElement).name || '' };
    }, { label }).catch((err: any) => ({ ok: false, reason: 'evaluate error: ' + (err ? String(err) : '') }));
    if (!iconInfo || !iconInfo.ok) {
      console.log(`  ⚠ Could not click lookup icon for ${label}: ${(iconInfo as any)?.reason || 'unknown'}`);
      return null;
    }
    console.log(`  Clicked lookup icon for ${label} (${iconInfo.tag}${iconInfo.id ? '#' + iconInfo.id : ''})...`);
    const popup = await popupPromise;
    if (!popup) {
      console.log(`  ⚠ No LOV popup opened for ${label} after icon click`);
      return null;
    }
    await popup.bringToFront().catch(() => {});
    return popup;
  }

  // =====================================================================
  // Generic field entry helpers (workbook-driven, no hard-coded values)
  // =====================================================================

  /**
   * For every visible <select>, copy the selected option value and text into
   * the hidden code/display input pairs that Finacle validates on submit.
   */
  protected async syncSelectHiddenFields(target?: any): Promise<void> {
    const frames = target ? [target] : (this.workingPage?.frames?.() || []);
    for (const f of frames) {
      if (!f) continue;
      try {
        const count = await f.evaluate(() => {
          const fire = (el: HTMLElement) => {
             if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; }el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
          };
          let synced = 0;

          const stripPrefix = (name: string): string => {
            return name
              .replace(/^pi_/i, '')
              .replace(/^PI_/i, '')
              .replace(/^h_/i, '')
              .replace(/^H_/i, '')
              .replace(/^3_/i, '')
              .replace(/^cat_/i, '')
              .replace(/^Cat_/i, '')
              .replace(/^CAT_/i, '')
              .replace(/^AccountBO\./i, '')
              .replace(/^AccountModBO\./i, '')
              .replace(/^CorporateBO\./i, '')
              .replace(/^CorporateModBO\./i, '');
          };

          for (const sel of Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]) {
            if (!sel.name) continue;
            const selected = sel.options[sel.selectedIndex];
            if (!selected) continue;
            const code = selected.value.replace(/\*+$/g, '').trim();
            const text = selected.text.replace(/\*+$/g, '').trim();
            if (!code || code === '--Select--') continue;
            sel.disabled = false;
            sel.removeAttribute('readonly');
            if (sel.value !== code) {
              sel.value = code;
              // Avoid firing change/blur on the visible select here; the caller or Playwright's
              // selectOption already dispatches the original event that triggered CRM handlers.
              synced++;
            }

            const rawBase = stripPrefix(sel.name);
            const baseUnderscore = rawBase.replace(/([a-z0-9])([A-Z])/g, '$1_$2');

            const codePrefixes = [
              '',
              'AccountBO.', 'AccountModBO.', 'CorporateBO.', 'CorporateModBO.',
              'h_', 'h_AccountBO.', 'h_AccountModBO.', 'h_CorporateBO.', 'h_CorporateModBO.',
              'H_', 'H_AccountBO.', 'H_AccountModBO.', 'H_CorporateBO.', 'H_CorporateModBO.',
              '3_', '3_AccountBO.', '3_AccountModBO.', '3_CorporateBO.', '3_CorporateModBO.'
            ];

            const displayPrefixes = [
              'Cat_', 'cat_', 'CAT_',
              'Cat_AccountBO.', 'Cat_AccountModBO.', 'Cat_CorporateBO.', 'Cat_CorporateModBO.',
              'CAT_AccountBO.', 'CAT_AccountModBO.', 'CAT_CorporateBO.', 'CAT_CorporateModBO.'
            ];

            const codeNames = new Set<string>();
            const displayNames = new Set<string>();

            for (const p of codePrefixes) {
              codeNames.add(`${p}${rawBase}`);
              codeNames.add(`${p}${baseUnderscore}`);
              if (p) {
                codeNames.add(`${p}${sel.name}`);
                codeNames.add(`${p}${stripPrefix(sel.name)}`);
              }
            }
            codeNames.add(sel.name);

            for (const p of displayPrefixes) {
              displayNames.add(`${p}${rawBase}`);
              displayNames.add(`${p}${baseUnderscore}`);
              displayNames.add(`${p}${sel.name}`);
            }

            const isBoolLike = (v: string) => {
              const s = String(v || '').toUpperCase();
              return ['Y', 'N', 'YES', 'NO', 'TRUE', 'FALSE'].includes(s);
            };

            for (const n of codeNames) {
              const nLower = n.toLowerCase();
              if (nLower.startsWith('pi_') || nLower.startsWith('pi')) continue;
              const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement | null;
              if (el && el.value !== code) {
                const cur = (el.value || '').toString().trim();
                // Protect real codes already written by LOV/text setters from being
                // replaced by a boolean select default (e.g. en_US -> Y).
                if (cur && !isBoolLike(cur) && isBoolLike(code)) continue;
                el.value = code; fire(el); synced++;
              }
            }

            for (const n of displayNames) {
              const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement | null;
              if (el && text && text !== '--Select--' && el.value !== text) {
                const cur = (el.value || '').toString().trim();
                if (cur && !isBoolLike(cur) && isBoolLike(text)) continue;
                el.value = text; fire(el); synced++;
              }
            }

            // pi_ hidden inputs are presence flags (value '1'), not the selected code.
            const piNames = new Set<string>([
              `pi_${sel.name}`, `PI_${sel.name}`,
              `pi_${rawBase}`, `PI_${rawBase}`,
              `pi_${baseUnderscore}`, `PI_${baseUnderscore}`
            ]);
            for (const n of piNames) {
              const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement | null;
              if (el) {
                const cv = (el.value || '').toString().trim();
                if (!cv || cv === '0') {
                  el.value = '1';
                  fire(el);
                  synced++;
                }
              }
            }
          }
          return synced;
        });
        if (count > 0) console.log(`  Synced ${count} hidden code/display fields in frame "${f.name?.() || ''}"`);
      } catch (_) {}
    }
  }

  protected async setGenericFieldByLabel(frame: any, label: string, value: string, typeHint = 'text'): Promise<boolean> {
    const result = await frame.evaluate((args: { label: string; value: string; typeHint: string }) => {
      const labelText = args.label;
      const typeHint = args.typeHint || 'text';
      const wantSelect = typeHint === 'select';
      const wantText = typeHint === 'text' || typeHint === 'number';
      const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase();
      const starTrim = (s: string) => String(s || '').replace(/\*+$/g, '').trim();

      const allTags = ['input', 'select', 'textarea'];
      const preferredTags = wantSelect ? ['select'] : (wantText ? ['input', 'textarea'] : allTags);
      const fallbackTags = wantSelect ? ['input', 'textarea'] : (wantText ? ['select'] : []);

      const visibleIn = (els: Element[]) => els.filter((c) => {
        const inp = c as HTMLInputElement;
        if (inp.type && inp.type.toLowerCase() === 'hidden') return false;
        const style = window.getComputedStyle(c);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const r = (c as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const isVisibleControl = (c: Element) => {
        const inp = c as HTMLInputElement;
        if (inp.type && inp.type.toLowerCase() === 'hidden') return false;
        const style = window.getComputedStyle(c);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const r = (c as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };

      const allVisibleControls = (root: Element | Document): HTMLElement[] => {
        const arr: HTMLElement[] = [];
        const tags = new Set<string>([...preferredTags, ...fallbackTags]);
        for (const tag of tags) {
          for (const c of Array.from(root.querySelectorAll(tag))) {
            if (isVisibleControl(c)) arr.push(c as HTMLElement);
          }
        }
        return arr;
      };

      const labelWords = (labelNorm: string): string[] => {
        const common = ['of', 'in', 'and', 'or', 'for', 'the', 'to', 'a', 'as', 'on', 'at'];
        return labelNorm.split(/[^a-z0-9]+/)
          .filter((w: string) => w.length > 0 && !common.includes(w) && (w.length > 2 || /^(ccy|id|no|rm|tax|pin|dob|po|cc|country|city|state|type|code)$/.test(w)));
      };

      const controlScore = (ctrl: HTMLElement, labelEl: HTMLElement, labelNorm: string): number => {
        const words = labelWords(labelNorm);
        const attrStr = [
          ctrl.getAttribute('name') || '',
          ctrl.id || '',
          ctrl.getAttribute('title') || '',
          ctrl.getAttribute('aria-label') || '',
          (ctrl as any).placeholder || ''
        ].join(' ').toLowerCase();
        const text = String(ctrl.textContent || '').toLowerCase();
        const tag = ctrl.tagName.toLowerCase();
        let match = 0;
        for (const w of words) {
          if (attrStr.includes(w) || text.includes(w)) match += 1200;
        }
        if (attrStr.includes(labelNorm) || text === labelNorm) match += 2500;

        const typeBonus = (wantSelect && tag === 'select') || (wantText && (tag === 'input' || tag === 'textarea')) ? 150 : 0;

        const rC = ctrl.getBoundingClientRect();
        const rL = labelEl.getBoundingClientRect();
        const dx = Math.abs((rC.left + rC.width / 2) - (rL.left + rL.width / 2));
        const dy = Math.abs((rC.top + rC.height / 2) - (rL.top + rL.height / 2));
        const sameRow = dy < Math.max(rL.height, rC.height) * 1.6 ? 600 : 0;

        const docBonus = ((labelEl as any).compareDocumentPosition(ctrl) & Node.DOCUMENT_POSITION_FOLLOWING) ? 50 : -5000;

        return match + typeBonus + sameRow + docBonus - dx / 3 - dy / 2;
      };

      const collectControls = (root: Element | null, list: HTMLElement[]) => {
        if (!root) return;
        const tags = new Set<string>([...preferredTags, ...fallbackTags]);
        for (const tag of tags) {
          for (const c of Array.from(root.querySelectorAll(tag))) {
            if (isVisibleControl(c)) list.push(c as HTMLElement);
          }
        }
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes((root as any).tagName) && isVisibleControl(root)) list.push(root as HTMLElement);
      };

      const getControl = (el: Element): HTMLElement | null => {
        const labelEl = el as HTMLElement;
        const collected: HTMLElement[] = [];
        collectControls(labelEl, collected);
        let sib: Element | null = labelEl.nextElementSibling;
        while (sib) { collectControls(sib, collected); sib = sib.nextElementSibling; }
        const parent = labelEl.parentElement;
        if (parent) {
          if (parent.tagName.toLowerCase() !== 'tr') {
            sib = parent.nextElementSibling;
            while (sib) { collectControls(sib, collected); sib = sib.nextElementSibling; }
          }
          const row = parent.closest('tr');
          if (row) collectControls(row, collected);
        }

        const afterLabel = collected.filter(c => ((labelEl as any).compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
        if (afterLabel.length === 0) return null;
        const labelNorm = normalize(labelText);
        let best: HTMLElement | null = null;
        let bestScore = -Infinity;
        for (const c of afterLabel) {
          const s = controlScore(c, labelEl, labelNorm);
          if (s > bestScore) { bestScore = s; best = c; }
        }
        return best;
      };

      const getControlByTableRow = (text: string): HTMLElement | null => {
        const labelNorm = normalize(text);
        const rows = Array.from(document.querySelectorAll('tr'));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td, th'));
          for (let i = 0; i < cells.length; i++) {
            const cellText = normalize((cells[i] as HTMLElement).innerText || cells[i].textContent);
            if (cellText === labelNorm || cellText.includes(labelNorm)) {
              const c = getControl(cells[i]);
              if (c) return c;
            }
          }
        }
        return null;
      };

      const candidates = Array.from(document.querySelectorAll('label, td, th, div, span')).filter((e: any) => normalize(e.innerText || e.textContent) === normalize(labelText));
      let control: HTMLElement | null = null;
      for (const labelEl of candidates) {
        if ((labelEl as Element).closest && (labelEl as Element).closest('script')) continue;
        control = getControl(labelEl as Element);
        if (control) break;
      }
      if (!control) control = getControlByTableRow(labelText);
      if (!control) return false;

      const tag = control.tagName.toLowerCase();
      const inp = control as HTMLInputElement;
      const rawValue = String(args.value).replace(/\*+$/g, '').trim();

      if (tag === 'select') {
        const sel = control as HTMLSelectElement;
        const v = rawValue;
        let matched = false;
        for (const o of Array.from(sel.options)) {
          const optText = o.text.replace(/\*/g, '').trim().toUpperCase();
          const optVal = o.value.replace(/\*/g, '').trim().toUpperCase();
          if (optText === v.toUpperCase() || optVal === v.toUpperCase()) {
            o.text = starTrim(o.text);
            o.value = starTrim(o.value);
            sel.value = o.value; matched = true; break;
          }
        }
        if (!matched) {
          for (const o of Array.from(sel.options)) {
            const optText = o.text.replace(/\*/g, '').trim().toUpperCase();
            const optVal = o.value.replace(/\*/g, '').trim().toUpperCase();
            if (optText.includes(v.toUpperCase()) || optVal.includes(v.toUpperCase())) {
              o.text = starTrim(o.text);
              o.value = starTrim(o.value);
              sel.value = o.value; matched = true; break;
            }
          }
        }
        if (matched) {
          sel.disabled = false;
          sel.removeAttribute('readonly');
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          sel.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        }
      } else if (tag === 'input' && (inp.type === 'checkbox' || inp.type === 'radio')) {
        const desired = ['Y', 'YES', 'TRUE', '1'].includes(rawValue.toUpperCase());
        if (inp.checked !== desired) { inp.click(); }
        inp.checked = desired;
        inp.disabled = false;
        inp.removeAttribute('readonly');
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } else {
        inp.value = rawValue;
        inp.disabled = false;
        inp.removeAttribute('readonly');
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
        control.dispatchEvent(new Event('blur', { bubbles: true }));

        // Sync any hidden companion input (e.g. h_CorporateBO.no_Of_Employees)
        // so server-side integer validation sees the value we typed.
        if (inp.name) {
          const base = inp.name.replace(/^h_/i, '').replace(/^H_/, '');
          const hiddenNames = [`h_${base}`, `H_${base}`, `${base}_H`, `${base}H`, `h${base}`, `H${base}`];
          for (const hn of hiddenNames) {
            const h = document.querySelector(`input[type="hidden"][name="${hn}"]`) as HTMLInputElement | null;
            if (h && h !== inp && h.value !== rawValue) {
              h.value = rawValue;
              h.dispatchEvent(new Event('input', { bubbles: true }));
              h.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
        return true;
      }
      return false;
    }, { label, value, typeHint }).catch(() => false);

    if (result) {
      console.log('✓ ' + label + ' = "' + value + '"');
      return true;
    }
    return false;
  }

  protected async setCheckboxGroupByLabel(frame: any, label: string, value: string, separator: string = ','): Promise<boolean> {
    const desired = String(value || '').split(separator).map(v => v.trim()).filter(v => v.length > 0);
    if (desired.length === 0) return false;

    const tryInContainer = async (): Promise<boolean> => {
      return frame.evaluate((args: { label: string; values: string[] }) => {
        const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
        const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const labelEl = Array.from(document.querySelectorAll('label, td, th, div, span, legend')).find((e: any) => normalize(e.innerText || e.textContent) === normalize(args.label)) as HTMLElement | null;
        if (!labelEl) return false;
        let container: HTMLElement | Element | null = labelEl.closest('fieldset, tr, td, div, form');
        if (!container) container = labelEl.parentElement;
        if (!container) return false;
        const checks = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
        if (checks.length === 0) return false;

        const getCheckLabel = (c: HTMLInputElement): string => {
          if (c.id) {
            const l = document.querySelector(`label[for="${c.id}"]`);
            if (l) return (l as HTMLElement).innerText || l.textContent || '';
          }
          let p = c.parentElement;
          for (let i = 0; i < 5 && p; i++) {
            if (p.tagName === 'LABEL') return (p as HTMLElement).innerText || p.textContent || '';
            if (p.tagName === 'TD') {
              const next = p.nextElementSibling;
              if (next) return next.textContent || '';
              return p.textContent || '';
            }
            p = p.parentElement;
          }
          return c.value || c.name || c.title || c.getAttribute('aria-label') || '';
        };

        let any = false;
        for (const c of checks) {
          const lbl = normalize(getCheckLabel(c));
          const val = normalize(c.value);
          const name = normalize(c.name);
          const title = normalize(c.title || '');
          const aria = normalize(c.getAttribute('aria-label') || '');
          const matched = args.values.find((v: string) => {
            const re = new RegExp('\\b' + escape(v.toLowerCase()) + '\\b', 'i');
            return re.test(lbl) || re.test(val) || re.test(name) || re.test(title) || re.test(aria);
          });
          if (matched) {
            if (!c.checked) { c.click(); c.checked = true; }
            c.dispatchEvent(new Event('change', { bubbles: true }));
            any = true;
          }
        }
        return any;
      }, { label, values: desired }).catch(() => false);
    };

    const tryInDocument = async (): Promise<boolean> => {
      return frame.evaluate((args: { label: string; values: string[] }) => {
        const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
        const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const getCheckLabel = (c: HTMLInputElement): string => {
          if (c.id) {
            const l = document.querySelector(`label[for="${c.id}"]`);
            if (l) return (l as HTMLElement).innerText || l.textContent || '';
          }
          let p = c.parentElement;
          for (let i = 0; i < 5 && p; i++) {
            if (p.tagName === 'LABEL') return (p as HTMLElement).innerText || p.textContent || '';
            p = p.parentElement;
          }
          return c.value || c.name || c.title || c.getAttribute('aria-label') || '';
        };

        const checks = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
        let any = false;
        for (const c of checks) {
          const lbl = normalize(getCheckLabel(c));
          const val = normalize(c.value);
          const name = normalize(c.name);
          const title = normalize(c.title || '');
          const aria = normalize(c.getAttribute('aria-label') || '');
          const matched = args.values.find((v: string) => {
            const re = new RegExp('\\b' + escape(v.toLowerCase()) + '\\b', 'i');
            return re.test(lbl) || re.test(val) || re.test(name) || re.test(title) || re.test(aria);
          });
          if (matched) {
            if (!c.checked) { c.click(); c.checked = true; }
            c.dispatchEvent(new Event('change', { bubbles: true }));
            any = true;
          }
        }
        return any;
      }, { label, values: desired }).catch(() => false);
    };

    const matched = await tryInContainer() || await tryInDocument();
    if (matched) {
      console.log('\u2713 ' + label + ' = ' + desired.join(', '));
      return true;
    }
    return false;
  }

  protected async setDualListByLabel(frame: any, sourceLabel: string, value: string, targetLabel?: string, separator: string = ','): Promise<boolean> {
    const desired = String(value || '').split(separator).map(v => v.trim()).filter(v => v.length > 0);
    if (desired.length === 0) return false;

    const moved = await frame.evaluate((args: { sourceLabel: string; targetLabel: string; values: string[] }) => {
      const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
      const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const labelLike = (el: Element, text: string) => {
        const txt = normalize(el.textContent);
        return txt === normalize(text) || txt.includes(normalize(text));
      };

      const findLabel = (text: string) => Array.from(document.querySelectorAll('label, td, th, div, span, legend')).find(e => labelLike(e, text)) as HTMLElement | null;

      const findSelects = (labelEl: HTMLElement) => {
        let container: HTMLElement | Element | null = labelEl.closest('fieldset, table, tr, td, div, form');
        if (!container) container = labelEl.parentElement;
        if (!container) container = document.body;
        const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
        return selects.filter(s => s.offsetParent !== null);
      };

      const isMoveRightBtn = (el: HTMLElement) => {
        const attrs = ((el.getAttribute('onclick') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('alt') || '') + ' ' + (el.getAttribute('value') || '')).toLowerCase();
        const text = normalize(el.textContent);
        return /(right|move.*right|add|forward|next|\brgt\b)/i.test(attrs) || /^[\u2192\u25b6\u25b8\u276f\u25ba]?[\s\u00a0]*$/.test(text) || text === '>' || text === '>>' || text === '\u2192';
      };

      const findRightArrow = (container: Element) => {
        const all = Array.from(container.querySelectorAll('input[type="button"], button, a, img, input[type="image"]')) as HTMLElement[];
        const best = all.filter(isMoveRightBtn);
        if (best.length) return best[0];
        for (const cand of all) {
          const txt = normalize(cand.textContent);
          if (txt === '>' || txt === '>>' || txt.includes('add')) return cand;
        }
        return null;
      };

      const sourceLabelEl = findLabel(args.sourceLabel);
      if (!sourceLabelEl) return { ok: false, reason: 'source label not found' };
      const selects = findSelects(sourceLabelEl);
      if (selects.length === 0) return { ok: false, reason: 'no selects' };

      let sourceSel: HTMLSelectElement | null = null;
      let targetSel: HTMLSelectElement | null = null;
      if (selects.length >= 2) {
        sourceSel = selects[0];
        targetSel = selects[1];
      } else {
        sourceSel = selects[0];
        targetSel = selects[0];
      }

      for (const s of selects) {
        const label = findLabel(args.sourceLabel);
        const rect = s.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (!sourceSel) sourceSel = s;
          else if (!targetSel && s !== sourceSel) targetSel = s;
        }
      }
      if (!sourceSel) return { ok: false, reason: 'source select not found' };

      let container: HTMLElement | Element | null = sourceLabelEl.closest('fieldset, table, tr, td, div, form') || sourceLabelEl.parentElement || document.body;
      let arrow = findRightArrow(container);
      if (!arrow) arrow = findRightArrow(document.body);
      if (!arrow) return { ok: false, reason: 'right arrow not found' };

      let any = false;
      const unmatched: string[] = [];
      for (const v of args.values) {
        const re = new RegExp('\\b' + escape(v.toLowerCase()) + '\\b', 'i');
        const opt = Array.from(sourceSel.options).find(o => re.test(normalize(o.text)) || re.test(normalize(o.value)));
        if (!opt) { unmatched.push(v); continue; }
        opt.selected = true;
        any = true;
      }

      if (any) {
        sourceSel.dispatchEvent(new Event('change', { bubbles: true }));
        arrow.click();
      }

      return { ok: any, unmatched, moved: any };
    }, { sourceLabel, targetLabel: targetLabel || 'Access Channels', values: desired }).catch(() => ({ ok: false }));

    if (moved.ok) {
      console.log('\u2713 ' + sourceLabel + ' -> Access Channels: ' + desired.join(', '));
      return true;
    }
    return false;
  }

  protected async findVisibleButton(frame: any, label: string): Promise<any | null> {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const compact = label.replace(/\s+/g, '');
    const locators = [
      frame.locator(`input[name="${label}" i]`).first(),
      frame.locator(`input[name*="${label}" i]`).first(),
      frame.locator(`input[value="${label}" i]`).first(),
      frame.locator(`input[type="button"][value="${label}" i]`).first(),
      frame.locator(`input[value*="${label}" i]`).first(),
      frame.locator(`input[type="button"][value*="${label}" i]`).first(),
      frame.locator(`input[name*="${compact}" i]`).first(),
      frame.locator(`input[value*="${compact}" i]`).first(),
      frame.locator(`button:has-text("${label}")`).first(),
      frame.locator(`a:has-text("${label}")`).first(),
      frame.getByRole('button', { name: new RegExp('^' + esc + '$', 'i') }).first(),
      frame.getByTitle(new RegExp(esc, 'i')).first(),
      frame.getByRole('button', { name: new RegExp(esc, 'i') }).first(),
      frame.getByRole('link', { name: new RegExp(esc, 'i') }).first()
    ];
    for (const loc of locators) {
      if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) return loc;
    }
    return null;
  }

  protected async findButtonByKeywords(frame: any, keywords: string[]): Promise<any | null> {
    if (!frame) return null;
    const kw = keywords.map(k => k.trim()).filter(Boolean);
    if (kw.length === 0) return null;
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"');
    const valueAttrs = kw.map(k => `[value*="${k.replace(/"/g, '\\"')}" i]`).join('');
    const nameAttrs = kw.map(k => `[name*="${k.replace(/"/g, '\\"')}" i]`).join('');
    const titleAttrs = kw.map(k => `[title*="${k.replace(/"/g, '\\"')}" i]`).join('');
    const altAttrs = kw.map(k => `[alt*="${k.replace(/"/g, '\\"')}" i]`).join('');
    const nameRe = new RegExp('^' + kw.map(esc).join('.*') + '$', 'i');
    const textRe = new RegExp(kw.map(k => `(?=.*\\b${esc(k)}\\b)`).join(''), 'i');
    const locators = [
      frame.locator(`input[type="button"]${valueAttrs}`).first(),
      frame.locator(`input[type="submit"]${valueAttrs}`).first(),
      frame.locator(`input[type="button"]${nameAttrs}`).first(),
      frame.locator(`input[type="submit"]${nameAttrs}`).first(),
      frame.locator(`input${nameAttrs}`).first(),
      frame.locator(`button${nameAttrs}`).first(),
      frame.locator(`a${nameAttrs}`).first(),
      frame.locator(`input${titleAttrs}`).first(),
      frame.locator(`input[type="button"]${altAttrs}`).first(),
      frame.getByRole('button', { name: nameRe }).first(),
      frame.getByRole('button', { name: textRe }).first(),
      frame.getByRole('link', { name: textRe }).first()
    ];
    for (const loc of locators) {
      if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) return loc;
    }
    return null;
  }

  /**
   * Find a visible button (input, button, link, role=button) inside a frame whose
   * value/text/title matches one of buttonKeywords, and which is contained inside an
   * element whose text matches one of sectionKeywords. This avoids clicking the wrong
   * generic "Add" / "Save" button in a frame that contains multiple sections.
   */
  protected async findSectionButton(frame: any, sectionKeywords: string[], buttonKeywords: string[]): Promise<any | null> {
    if (!frame || typeof frame.evaluate !== 'function') return null;
    const marker = 'cascade_btn_' + Math.random().toString(36).slice(2, 10);
    const found = await frame.evaluate((args: { sectionKeywords: string[]; buttonKeywords: string[]; marker: string }) => {
      const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sectionRe = new RegExp('\\b(' + args.sectionKeywords.map(escape).join('|') + ')\\b', 'i');
      const buttonRe = new RegExp('^(?:' + args.buttonKeywords.map(escape).join('|') + ')$', 'i');
      const isVisible = (c: HTMLElement) => {
        const style = window.getComputedStyle(c);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const matchesButton = (el: Element) => {
        if (el.tagName === 'INPUT') {
          const inp = el as HTMLInputElement;
          const v = (inp.value || '').trim();
          const n = (inp.name || '').trim();
          const t = (inp.title || '').trim();
          if (buttonRe.test(v) || buttonRe.test(n) || buttonRe.test(t)) return true;
        }
        const txt = ((el as HTMLElement).innerText || el.textContent || (el as HTMLElement).title || '').trim();
        return buttonRe.test(txt);
      };

      // First find a visible section header whose text matches one of the section keywords.
      const sectionSelectors = 'h1,h2,h3,h4,h5,h6,legend,span,div,td,th,label,section';
      const headers = Array.from(document.querySelectorAll(sectionSelectors)) as HTMLElement[];
      for (const header of headers) {
        if (!isVisible(header)) continue;
        const headerText = (header.innerText || header.textContent || '').trim();
        if (!sectionRe.test(headerText)) continue;

        // Look for the button inside the nearest section container (fieldset/table/div/section).
        let container: Element | null = header.closest('fieldset, table, tbody, div, section');
        if (!container) container = header.parentElement;
        if (!container) continue;

        const elements = container.querySelectorAll('input[type="button"], input[type="submit"], button, a, [role="button"]');
        for (const el of Array.from(elements) as HTMLElement[]) {
          if (isVisible(el) && matchesButton(el)) {
            el.setAttribute('data-cascade-marker', args.marker);
            return true;
          }
        }
      }

      // Fallback: search all visible buttons with a bounded ancestor match.
      for (const el of Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], button, a, [role="button"]')) as HTMLElement[]) {
        if (!isVisible(el) || !matchesButton(el)) continue;
        let p: HTMLElement | null = el.parentElement as HTMLElement;
        let depth = 0;
        while (p && p !== document.body && depth < 6) {
          const parentText = (p.innerText || p.textContent || '').trim();
          if (parentText.length < 200 && sectionRe.test(parentText)) {
            el.setAttribute('data-cascade-marker', args.marker);
            return true;
          }
          p = p.parentElement as HTMLElement;
          depth++;
        }
      }
      return false;
    }, { sectionKeywords, buttonKeywords, marker }).catch(() => false);
    if (!found) return null;
    return frame.locator(`[data-cascade-marker="${marker}"]`).first();
  }

  protected async fillSectionByMeta(frame: any, sectionName: string, data: Record<string, any>, meta: any, skipKeys: string[] = []): Promise<boolean> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const fields = meta?.fields?.[sectionName];
    const skipSet = new Set((skipKeys || []).map(k => k.toLowerCase()));
    let any = false;
    // Build a normalized base-key map so code/display companions are treated as one field.
    const baseMap: Record<string, { code: string; display?: string; meta: any; baseKey: string }> = {};
    for (const [key, value] of Object.entries(data)) {
      if (skipSet.has(key.toLowerCase())) continue;
      if (value === undefined || value === null || typeof value === 'object' || String(value).trim() === '') continue;
      const keyLower = key.toLowerCase();
      let base = key;
      let isCode = false;
      let isDisplay = false;
      if (keyLower.endsWith('code') && keyLower.length > 4) { base = key.slice(0, -4); isCode = true; }
      else if (keyLower.endsWith('display') && keyLower.length > 7) { base = key.slice(0, -7); isDisplay = true; }
      const existing = baseMap[base.toLowerCase()];
      if (existing) {
        if (isCode) existing.code = String(value).replace(/\*+$/g, '').trim();
        else if (isDisplay) existing.display = String(value).replace(/\*+$/g, '').trim();
        continue;
      }
      let code = String(value).replace(/\*+$/g, '').trim();
      let display: string | undefined;
      const baseKeyData = data[base];
      if (isCode) {
        const disp = data[`${base}Display`];
        display = (disp && typeof disp === 'string') ? String(disp).replace(/\*+$/g, '').trim() : (baseKeyData && typeof baseKeyData === 'string' ? String(baseKeyData).replace(/\*+$/g, '').trim() : undefined);
      } else if (isDisplay) {
        display = code;
        const codeFromData = data[`${base}Code`];
        code = (codeFromData && typeof codeFromData === 'string') ? String(codeFromData).replace(/\*+$/g, '').trim() : (baseKeyData && typeof baseKeyData === 'string' ? String(baseKeyData).replace(/\*+$/g, '').trim() : display);
      } else {
        const codeFromData = data[`${key}Code`];
        const displayFromData = data[`${key}Display`];
        if (codeFromData && typeof codeFromData === 'string' && String(codeFromData).trim()) code = String(codeFromData).replace(/\*+$/g, '').trim();
        if (displayFromData && typeof displayFromData === 'string' && String(displayFromData).trim()) display = String(displayFromData).replace(/\*+$/g, '').trim();
      }
      const metaKey = Object.keys(fields || {}).find(k => k.toLowerCase() === base.toLowerCase());
      baseMap[base.toLowerCase()] = { code, display, meta: (fields?.[base] || fields?.[metaKey || key] || {}), baseKey: base };
    }

    if (Object.keys(baseMap).length === 0) return false;

    for (const entry of Object.values(baseMap)) {
      const label = entry.meta.label || entry.baseKey;
      const type = entry.meta.type || 'text';
      let typeHint: 'select' | 'text' | 'auto' = 'text';
      if (type === 'select' || type === 'lov') typeHint = 'select';
      else if (type === 'checkbox' || type === 'indicator' || type === 'boolean' || type === 'date') typeHint = 'text';
      else if (type === 'text' || type === 'number') typeHint = 'text';
      else if (/\b(code|sector|region|tds|country|city|state|nationality|language|table|category)\b/i.test(label) || /\b(code|sector|region|tds|country|city|state|nationality|language|table|category)\b/i.test(entry.baseKey)) typeHint = 'auto';
      let ok = false;
      if (entry.baseKey.toLowerCase() === 'hobbies' || /hobbies/i.test(label)) {
        ok = await this.setCheckboxGroupByLabel(frame, label, entry.code);
      } else if (type === 'multiselect' || entry.baseKey.toLowerCase().includes('channels') || /available.*channels|access.*channels/i.test(label)) {
        ok = await this.setDualListByLabel(frame, label, entry.code);
      } else {
        ok = await this.setSelectOrLovByLabel(frame, label, entry.code, entry.display, typeHint);
      }
      if (ok) any = true;
    }
    return any;
  }

  protected async fillArraySectionByMeta(frame: any, sectionName: string, records: any[], meta: any, addLabel = 'Add', saveLabel = 'Save'): Promise<boolean> {
    if (!records || !Array.isArray(records) || records.length === 0) return false;
    let any = false;
    let recordIndex = 0;
    for (const rec of records) {
      const addBtn = await this.findVisibleButton(frame, addLabel);
      if (addBtn) {
        await addBtn.click();
        await frame.waitForTimeout(this.timeouts.short);
      }
      any = await this.fillSectionByMeta(frame, sectionName, rec, meta) || any;
      const saveBtn = await this.findVisibleButton(frame, saveLabel);
      if (saveBtn) {
        await saveBtn.click();
        await frame.waitForTimeout(this.timeouts.short);
      } else {
        const altSave = frame.locator('input[value="Save"]').first();
        if (await altSave.isVisible({ timeout: 2000 }).catch(() => false)) { await altSave.click(); await frame.waitForTimeout(this.timeouts.short); }
      }
      recordIndex++;
    }
    return any;
  }

  protected async waitForFrameOrPageByUrl(page: any, pattern: RegExp, timeout = 15000): Promise<any | null> {
    const matching = (f: any) => { try { return pattern.test(f.url()); } catch { return false; } };
    const existing = (page.frames() || []).find(matching);
    if (existing) return existing;
    const existingPage = (page.context().pages() || []).find((p: any) => !p.isClosed() && matching(p));
    if (existingPage) return existingPage;
    let resolved: any = null;
    let navigated = false;
    const onNav = (f: any) => { if (!resolved && matching(f)) { resolved = f; } };
    const onPage = (p: any) => { if (!resolved && !p.isClosed() && matching(p)) { resolved = p; } };
    try {
      page.on('framenavigated', onNav);
      page.on('popup', onPage);
      const deadline = Date.now() + timeout;
      while (!resolved && Date.now() < deadline) {
        const found = (page.frames() || []).find(matching) || (page.context().pages() || []).find((p: any) => !p.isClosed() && matching(p));
        if (found) { resolved = found; break; }
        await page.waitForTimeout(500).catch(() => {});
      }
    } finally {
      try { page.off('framenavigated', onNav); } catch {}
      try { page.off('popup', onPage); } catch {}
    }
    return resolved;
  }

  // =====================================================================
  // New-section helpers (workbook-driven, generic tab/sub-tab fill)
  // =====================================================================

  protected async navigateToSectionTab(tabLabels: string[]): Promise<any> {
    const page = this.workingPage;
    const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
    const isOverlayFrame = (f: any) => {
      const n = String(f.name?.() || '').toLowerCase();
      const u = String(f.url?.() || '').toLowerCase();
      return n.includes('dataarea') || n.includes('left') || n.includes('lhs') || n.includes('menu') || n.includes('coreserver') || n.includes('functionmain') || n.includes('button') ||
             u.includes('dataarea') || u.includes('leftmenu') || u.includes('coreserver') || u.includes('functionmain') || u.includes('buttonfrm');
    };
    const isJunkText = (txt: string) => !txt || txt.length > 40 || /function|var |if\s*\(/.test(txt);
    const isUsableFrame = (f: any) => f && (typeof f.isDetached !== 'function' || !f.isDetached()) && (typeof f.isClosed !== 'function' || !f.isClosed());

    // Ensure the main Customer form frame is active before we click any tab.
    await this.reacquireAccountFrame('navigateToSectionTab', undefined, true).catch(() => {});

    // Prefer the main Customer form frame when selecting tabs to avoid clicking
    // unrelated menu items (e.g. Relationship Manager Maintenance in the left frame).
    const preferredFrames = [this.mainAccountFrame, this.accountFrame, page.frame({ name: 'formDispFrame' })].filter(isUsableFrame);
    for (const label of tabLabels) {
      for (const pref of preferredFrames) {
        try {
          if (isOverlayFrame(pref)) continue;
          const t = pref.getByText(label, { exact: false }).first();
          if (await t.isVisible({ timeout: 2000 }).catch(() => false)) {
            const text = (await t.textContent().catch(() => '')) || '';
            if (isJunkText(text)) continue;
            try { await t.dispatchEvent('click'); } catch (_) { try { await t.click({ force: true }); } catch { try { await t.evaluate((el: HTMLElement) => el.click()); } catch {} } }
            console.log(`\u2713 Clicked tab in account frame: ${label}`);
            await page.waitForTimeout(this.timeouts.short);
            await this.captureEvidence(`Navigated to ${label}`).catch(() => {});
            return pref;
          }
        } catch (_) {}
      }
    }
    // Fallback: search only inside main Customer form / tab-strip frames.
    // Avoid unrelated menu frames (e.g. Relationship Manager Maintenance).
    const isCustomerFormFrame = (f: any) => {
      const n = String(f.name?.() || '').toLowerCase();
      const u = String(f.url?.() || '').toLowerCase();
      if (n === 'formdispframe') return true;
      if (isOverlayFrame(f)) return false;
      if (u.includes('lookupforcategory') || u.includes('concessionselection') || u.includes('corprelbankdet') || u.includes('processselection') || u.includes('relationshipmaintenance') || u.includes('relationshipmanager') || u.includes('rmmaint')) return false;
      if (u.includes('corpcif') || u.includes('corpcreatedetwizard') || u.includes('corpmod') || u.includes('main') || u.includes('ifrm') || u.includes('wizard') || u.includes('cif')) return true;
      if (u.includes('left') || u.includes('menu') || u.includes('functionmain') || u.includes('dataarea') || u.includes('coreserver') || u.includes('buttonfrm')) return false;
      return false;
    };

    // Additional guard: skip frames that are clearly the Relationship Manager Maintenance
    // menu / search page so the correct Relationship tab in the Customer form is clicked.
    const isRelationshipManagerMaintenance = async (f: any): Promise<boolean> => {
      try {
        const hasRmm = await f.evaluate(() => document.body?.innerText?.toLowerCase().includes('relationship manager maintenance') || false).catch(() => false);
        return hasRmm;
      } catch (_) { return false; }
    };

    for (const label of tabLabels) {
      const target = normalize(label);
      for (const f of page.frames()) {
        if (!isCustomerFormFrame(f)) continue;
        if (await isRelationshipManagerMaintenance(f)) continue;
        const t = f.getByText(label, { exact: false }).first();
        let visible = false;
        try { visible = await t.isVisible({ timeout: 2000 }); } catch (_) { visible = false; }
        if (visible) {
          const text = (await t.textContent().catch(() => '')) || '';
          if (isJunkText(text)) continue;
          try { await t.dispatchEvent('click'); } catch (_) {
            try { await t.click({ force: true }); } catch { try { await t.evaluate((el: HTMLElement) => el.click()); } catch {} }
          }
          await page.waitForTimeout(this.timeouts.short);
          return f;
        }
      }
      for (const f of page.frames()) {
        if (!isCustomerFormFrame(f)) continue;
        if (await isRelationshipManagerMaintenance(f)) continue;
        const clicked = await f.evaluate((lab: string) => {
          const re = new RegExp(lab.split(/\s+/).map((p: string) => `(?=.*${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join(''), 'i');
          const all = Array.from(document.querySelectorAll('a, td, span, div, li, button, input[type="button"]'));
          const el = all.find(e => {
            const h = e as HTMLElement;
            if (h.offsetParent === null) return false;
            const rect = h.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            const txt = (h.innerText || h.getAttribute('value') || h.textContent || '').trim();
            if (!re.test(txt)) return false;
            if (!txt || txt.length > 40 || /function|var |if\s*\(/.test(txt)) return false;
            const style = window.getComputedStyle(h);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return true;
          }) as HTMLElement | undefined;
          if (el) { el.click(); return true; }
          return false;
        }, label).catch(() => false);
        if (clicked) {
          console.log(`\u2713 Clicked tab by DOM: ${label}`);
          await page.waitForTimeout(this.timeouts.short);
          await this.captureEvidence(`Navigated to ${label}`).catch(() => {});
          return f;
        }
      }
    }
    console.log('\u26a0 Could not navigate to any of: ' + tabLabels.join(', '));
    return null;
  }

  protected async saveCurrentSection(frame: any, saveLabel = 'Save'): Promise<boolean> {
    const safeWait = async (f: any) => {
      if (!f) return;
      if (typeof f.isClosed === 'function' && f.isClosed()) return;
      await f.waitForTimeout(this.timeouts.short).catch(() => {});
    };

    const page = this.workingPage;
    const frames = [frame];
    if (page && typeof page.frames === 'function') {
      for (const f of page.frames()) { if (!frames.includes(f)) frames.push(f); }
    }

    for (const f of frames) {
      const saveBtn = await this.findVisibleButton(f, saveLabel);
      if (saveBtn) {
        try { await saveBtn.click({ timeout: 6000 }); console.log('\u2713 Clicked Save'); } catch (e) { console.log('\u26a0 Save click skipped (popup may have closed)'); }
        await safeWait(f);
        return true;
      }
      const alt = f.locator('input[value="Save" i], input[value="Submit" i], input[value="OK" i]').first();
      if (await alt.isVisible({ timeout: 2000 }).catch(() => false)) {
        try { await alt.click({ timeout: 6000 }); console.log('\u2713 Clicked Save (alt)'); } catch (e) { console.log('\u26a0 Alt save click skipped (popup may have closed)'); }
        await safeWait(f);
        return true;
      }
    }
    console.log('\u26a0 Save button "' + saveLabel + '" not found in any frame');
    return false;
  }

  protected async fillOtherBankAndCreditCardTab(endToEnd: any, meta: any): Promise<boolean> {
    const bankRecords = Array.isArray(endToEnd.otherBankData) ? endToEnd.otherBankData : [];
    const cardRecords = Array.isArray(endToEnd.creditCardData) ? endToEnd.creditCardData : [];
    if (bankRecords.length === 0 && cardRecords.length === 0) return false;

    const bankRelationTypeFallback = String(endToEnd.employmentData?.bankRelationType || 'CUSTOMER').trim();
    for (const rec of bankRecords) {
      if (!rec.bankRelationType || String(rec.bankRelationType).trim() === '') rec.bankRelationType = bankRelationTypeFallback;
    }
    const tabLabels = ['Other Bank and Credit Card', 'Other Bank and Credit Card Details', 'Other Bank', 'Credit Card', 'Banking Details'];
    console.log('\n=== Other Bank and Credit Card Details ===');
    await this.navigateToSectionTab(tabLabels);
    await this.reacquireAccountFrame('otherBankCreditCard').catch(() => {});
    const page = this.workingPage;
    let targetFrame = this.accountFrame || page;

    const findAddBankButton = async (frame: any): Promise<any | null> => {
      if (!frame) return null;
      for (const sel of [
        'input[type="button"][value*="Add Bank" i]',
        'input[type="submit"][value*="Add Bank" i]',
        'input[value*="Add Bank" i]',
        'button:has-text("Add Bank")',
        'a:has-text("Add Bank")',
        'input[type="button"][value*="Bank Details" i]',
        'input[value*="Bank Details" i]'
      ]) {
        const b = frame.locator(sel).first();
        if (await b.isVisible({ timeout: 2000 }).catch(() => false)) return b;
      }
      return await this.findButtonByKeywords(frame, ['Add', 'Bank']);
    };
    const findAddCardButton = async (frame: any): Promise<any | null> => {
      if (!frame) return null;
      for (const sel of [
        'input[type="button"][value*="Add Credit" i]',
        'input[type="submit"][value*="Add Credit" i]',
        'input[value*="Add Credit" i]',
        'button:has-text("Add Credit")',
        'a:has-text("Add Credit")',
        'input[type="button"][value*="Credit Card" i]',
        'input[value*="Credit Card" i]'
      ]) {
        const b = frame.locator(sel).first();
        if (await b.isVisible({ timeout: 2000 }).catch(() => false)) return b;
      }
      return await this.findButtonByKeywords(frame, ['Add', 'Credit', 'Card']);
    };

    // Wait for the Other Bank frame to load and reacquire if needed
    for (let i = 0; i < 5; i++) {
      const addBank = await findAddBankButton(targetFrame);
      const addCard = await findAddCardButton(targetFrame);
      if (addBank || addCard) break;
      await this.reacquireAccountFrame('otherBankCreditCard-wait').catch(() => {});
      targetFrame = this.accountFrame || page;
      await page.waitForTimeout(this.timeouts.short).catch(() => {});
    }
    const bankBtn = await findAddBankButton(targetFrame);
    const cardBtn = await findAddCardButton(targetFrame);
    if (!bankBtn && !cardBtn) {
      console.log('\u26a0 Add Bank/Credit Card buttons not found');
      return false;
    }
    for (const rec of bankRecords) {
      const addBtn = await findAddBankButton(targetFrame);
      if (addBtn) {
        await this.clickAddAndFillInPopupOrFrame(addBtn, targetFrame, 'otherBankData', rec, meta, endToEnd);
        await page.waitForTimeout(this.timeouts.short).catch(() => {});
      } else {
        console.log('\u26a0 Add Bank Details button not found for next record');
      }
    }
    for (const rec of cardRecords) {
      const addBtn = await findAddCardButton(targetFrame);
      if (addBtn) {
        await this.clickAddAndFillInPopupOrFrame(addBtn, targetFrame, 'creditCardData', rec, meta);
        await page.waitForTimeout(this.timeouts.short).catch(() => {});
      } else {
        console.log('\u26a0 Add Credit Card Details button not found for next record');
      }
    }
    return true;
  }

  protected async countVisibleFields(target: any): Promise<number> {
    try {
      return await target.evaluate(() =>
        Array.from(document.querySelectorAll('input, select, textarea')).filter(el => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }).length
      );
    } catch (_) { return 0; }
  }

  protected async findPopupFormFrame(popup: any): Promise<any> {
    if (!popup || popup.isClosed()) return null;
    const targets = [popup, ...popup.frames()];
    let best: any = null;
    let bestCount = 0;
    for (const t of targets) {
      const c = await this.countVisibleFields(t).catch(() => 0);
      if (c > bestCount) { bestCount = c; best = t; }
    }
    return best || popup;
  }

  protected async clickAddAndFillInPopupOrFrame(addBtn: any, targetFrame: any, sectionName: string, rec: any, meta: any, endToEnd?: any): Promise<boolean> {
    const page = this.workingPage;
    const context = page.context();
    const pagesBefore = new Set(context.pages().filter(p => !p.isClosed()));
    const beforeCount = await this.countVisibleFields(targetFrame);

    const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
    try {
      await addBtn.click({ timeout: 8000 });
    } catch (_) {
      try { await addBtn.evaluate((el: HTMLElement) => el.click()); } catch (_) {}
    }
    await page.waitForTimeout(this.timeouts.short).catch(() => {});

    let popup: any = await popupPromise;
    if (!popup || popup.isClosed()) {
      const fresh = context.pages().filter(p => !pagesBefore.has(p) && !p.isClosed());
      if (fresh.length) popup = fresh[fresh.length - 1];
    }

    let formFrame: any = null;
    if (popup && !popup.isClosed()) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await popup.waitForTimeout(this.timeouts.short).catch(() => {});
      formFrame = await this.findPopupFormFrame(popup);
    } else {
      // No popup appeared; only proceed if the click actually exposed an inline form
      const afterCount = await this.countVisibleFields(targetFrame);
      if (afterCount > beforeCount) {
        formFrame = targetFrame;
        console.log(`  Inline form detected for ${sectionName} (${afterCount - beforeCount} new fields)`);
      } else {
        console.log(`⚠ No popup or inline form detected for ${sectionName}, skipping fill`);
        return false;
      }
    }

    if (!formFrame) {
      console.log(`⚠ Could not locate a form for ${sectionName}`);
      return false;
    }

    if (sectionName === 'otherBankData' && (rec.bankName || rec.branchName)) {
      await this.fillOtherBankRecord(formFrame, rec, meta, endToEnd).catch(() => {});
    } else if (sectionName === 'creditCardData') {
      await this.fillCreditCardRecord(formFrame, rec, meta).catch(() => {});
    } else {
      await this.fillSectionByMeta(formFrame, sectionName, rec, meta);
    }

    const saved = await this.saveCurrentSection(formFrame, 'Save');
    if (!saved) {
      // Try common alternative save labels before giving up
      for (const label of ['Submit', 'OK', 'Add', 'Update', 'Done', 'Apply']) {
        if (await this.saveCurrentSection(formFrame, label)) break;
      }
    }
    await page.waitForTimeout(this.timeouts.short).catch(() => {});
    if (popup && typeof popup.isClosed === 'function' && !popup.isClosed()) {
      await popup.close().catch(() => {});
    }
    return true;
  }

  protected async fillOtherBankRecord(frame: any, rec: any, meta: any, endToEnd?: any): Promise<void> {
    await this.selectBankBranchInLov(frame, rec.bankName, rec.branchName);
    await this.fillSectionByMeta(frame, 'otherBankData', rec, meta);
    if (rec.bankRelationType) {
      await this.setGenericFieldByLabel(frame, 'Bank Relation Type', rec.bankRelationType, 'select').catch(() => {});
    }
    // The Other Bank Details popup has a mandatory Country LOV (lbDynamic label).
    // Use the record's country/countryCode if present, otherwise fall back to the
    // corporate country of incorporation/finance country so validation passes.
    const countryCode = String(rec.countryCode || '').trim();
    const countryDisplay = String(rec.country || '').trim();
    if (countryDisplay || countryCode) {
      const cd = endToEnd?.corporateData || {};
      const fd = endToEnd?.corporateFinanceData || {};
      const fallbackCode = String(cd.countryOfIncorporation || fd.countryCode || 'BM').trim();
      const fallbackDisplay = String(countryDisplay || fd.country || 'Bermuda').trim();
      const finalCode = countryCode || fallbackCode;
      const finalDisplay = countryDisplay || (countryCode ? '' : fallbackDisplay);
      if (finalCode || finalDisplay) {
        const set = await this.setLovWithFallback(frame, 'Country', finalCode, finalDisplay, 'Other Bank Country').catch(() => false);
        if (set) console.log(`  ✓ Other Bank Country set: ${finalCode} / ${finalDisplay}`);
      }
    }
  }

  protected async fillCreditCardRecord(frame: any, rec: any, meta: any): Promise<void> {
    const setIfFound = async (labels: string[], value: string, typeHint = 'text') => {
      if (!value || !value.trim()) return false;
      for (const label of labels) {
        if (await this.setGenericFieldByLabel(frame, label, value, typeHint).catch(() => false)) return true;
      }
      return false;
    };
    const setHiddenByLabels = async (labels: string[], value: string) => {
      if (!value || !value.trim()) return false;
      const normalized = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase();
      const targetLabels = labels.map(normalized);
      return await frame.evaluate((args: { labels: string[]; value: string }) => {
        const norm = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase();
        const fire = (el: HTMLElement) => {  if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; }el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const rows = Array.from(document.querySelectorAll('tr'));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td, th'));
          for (const cell of cells) {
            if (args.labels.some(l => norm(cell.textContent || '').includes(l))) {
              const inputs = Array.from(row.querySelectorAll('input, select, textarea')) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];
              for (const inp of inputs) {
                if ((inp as HTMLInputElement).type === 'hidden') (inp as HTMLElement).removeAttribute('type');
                inp.removeAttribute('readonly');
                inp.removeAttribute('disabled');
                if (inp.tagName.toLowerCase() === 'select') {
                  const sel = inp as HTMLSelectElement;
                  for (const o of Array.from(sel.options)) {
                    if (o.text.toUpperCase().includes(args.value.toUpperCase()) || o.value.toUpperCase() === args.value.toUpperCase()) {
                      sel.value = o.value; fire(sel); break;
                    }
                  }
                } else {
                  inp.value = args.value; fire(inp as HTMLElement);
                }
              }
              return true;
            }
          }
        }
        return false;
      }, { labels: targetLabels, value }).catch(() => false);
    };

    // Franchise first so Card Type options load
    const franchise = rec.franchise || rec.cardFranchise || '';
    if (franchise && (await setIfFound(['Franchise'], franchise, 'select'))) {
      await this.workingPage.waitForTimeout(1500).catch(() => {});
    }

    const cardType = rec.cardType || rec.type || '';
    await setIfFound(['Card Type', 'Type'], cardType, 'select') || await setHiddenByLabels(['Card Type', 'Type'], cardType);

    const bankName = rec.bankName || rec.issuingBank || '';
    if (!await setIfFound(['Bank Name', 'Issuing Bank', 'Bank'], bankName, 'text')) {
      await setHiddenByLabels(['Bank Name', 'Issuing Bank', 'Bank'], bankName);
    }

    const cardNo = rec.creditCardNo || rec.cardNo || rec.cardNumber || '';
    if (!await setIfFound(['Credit Card No.', 'Credit Card No', 'Card No.', 'Card No', 'Card Number', 'CreditCardNo'], cardNo, 'text')) {
      await setHiddenByLabels(['Credit Card No.', 'Card No.', 'Card Number'], cardNo);
    }

    // Optional credit-card fields if present in the record
    if (rec.validFrom) await setIfFound(['Valid From'], rec.validFrom, 'text');
    if (rec.validTill) await setIfFound(['Valid Till', 'Valid To'], rec.validTill, 'text');
    if (rec.outstandingAmount || rec.outstandingAmt) await setIfFound(['Outstanding Amt.', 'Outstanding Amount'], rec.outstandingAmount || rec.outstandingAmt, 'text');
    if (rec.creditLimit) await setIfFound(['Credit Limit'], rec.creditLimit, 'text');
    if (rec.ccy) await setIfFound(['CCY', 'Currency'], rec.ccy, 'text');
    if (rec.internationallyValid) await setIfFound(['Internationally Valid'], rec.internationallyValid, 'select');

    await this.syncSelectHiddenFields(frame).catch(() => {});
  }

  protected async selectBankBranchInLov(frameOrPage: any, bankName: string, branchName: string): Promise<void> {
    const owningPage = typeof frameOrPage.context === 'function' ? frameOrPage : frameOrPage.page();
    if (!owningPage) return;

    const context = owningPage.context();
    const pagesBefore = new Set(context.pages().filter((p: any) => !p.isClosed()));
    const popupPromise = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);

    let clicked = false;
    for (const f of owningPage.frames()) {
      clicked = await f.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[];
        const bankNameLink = anchors.find((a) => /^\s*Bank\s*Name\s*$/i.test((a.textContent || '').trim()));
        if (bankNameLink) { bankNameLink.click(); return true; }
        const all = Array.from(document.querySelectorAll('a, img, input[type="button"], input[type="image"]')) as HTMLElement[];
        const byHandler = all.find((e) => /bankbranch|bankList|branchList|BankLookup/i.test(e.getAttribute('onclick') || ''));
        if (byHandler) { byHandler.click(); return true; }
        return false;
      }).catch(() => false);
      if (clicked) break;
    }
    if (!clicked) return;

    let lookup: any = await popupPromise;
    if (!lookup || lookup.isClosed()) {
      const fresh = context.pages().filter((p: any) => !pagesBefore.has(p) && !p.isClosed());
      lookup = fresh.length ? fresh[fresh.length - 1] : null;
    }
    if (!lookup || lookup.isClosed()) return;

    await lookup.waitForLoadState('domcontentloaded').catch(() => {});
    await lookup.waitForTimeout(1500).catch(() => {});

    const getSelects = async () => {
      const out: any[] = [];
      for (const f of lookup.frames()) {
        for (const s of await f.locator('select').all().catch(() => [] as any[])) {
          if (await s.isVisible().catch(() => false)) out.push(s);
        }
      }
      return out;
    };

    const pickInSelect = async (sel: any, valueRe: RegExp): Promise<string> => {
      for (const opt of await sel.locator('option').all().catch(() => [] as any[])) {
        const label = ((await opt.textContent().catch(() => '')) || '').trim();
        const value = (await opt.getAttribute('value').catch(() => '')) || '';
        if (label && valueRe.test(label)) {
          await sel.selectOption(value ? { value } : { label }, { timeout: 5000 }).catch(() => {});
          await sel.dispatchEvent('change').catch(() => {});
          return label;
        }
      }
      return '';
    };

    const bankRe = new RegExp(String(bankName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const branchRe = new RegExp(String(branchName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    let bankSel = '';
    const bankDeadline = Date.now() + 15000;
    while (Date.now() < bankDeadline && !bankSel) {
      for (const s of await getSelects()) {
        bankSel = await pickInSelect(s, bankRe);
        if (bankSel) break;
      }
      if (!bankSel) await lookup.waitForTimeout(700).catch(() => {});
    }

    await lookup.waitForTimeout(2000).catch(() => {});

    let branchSel = '';
    const branchDeadline = Date.now() + 12000;
    while (Date.now() < branchDeadline && !branchSel) {
      const selects = await getSelects();
      for (const s of selects.slice().reverse()) {
        branchSel = await pickInSelect(s, branchRe);
        if (branchSel) break;
      }
      if (!branchSel) await lookup.waitForTimeout(700).catch(() => {});
    }

    for (const f of lookup.frames()) {
      const btn = f.locator('input[value="Select"], input[type="button"][value="Select"], input[type="submit"][value="Select"], button:has-text("Select"), a:has-text("Select"), input[onclick*="elect"], a[onclick*="elect"]').first();
      if (await btn.isVisible().catch(() => false)) { await btn.click({ timeout: 6000 }).catch(() => {}); break; }
    }
    await lookup.waitForTimeout(800).catch(() => {});
    if (!lookup.isClosed()) await lookup.close().catch(() => {});
  }

  protected async fillAdditionalSections(sections: { name: string; tabLabels: string[]; isArray?: boolean; addLabel?: string; saveLabel?: string; skipSave?: boolean }[], endToEnd: any, meta: any): Promise<void> {
    const bankCardHandled = new Set<string>();
    let bankCardAttempted = false;
    for (const section of sections) {
      if (section.name === 'otherBankData' || section.name === 'creditCardData') {
        if (bankCardHandled.has(section.name)) continue;
        if (!bankCardAttempted) {
          bankCardAttempted = true;
          const combined = await this.fillOtherBankAndCreditCardTab(endToEnd, meta);
          if (combined) {
            bankCardHandled.add('otherBankData');
            bankCardHandled.add('creditCardData');
            continue;
          }
        }
        bankCardHandled.add(section.name);
      }
      const data = endToEnd[section.name];
      if (!data) continue;
      const hasValues = Array.isArray(data) ? data.some((r: any) => r && Object.values(r).some(v => v !== undefined && v !== null && String(v).trim() !== '')) : (typeof data === 'object' && Object.values(data).some(v => v !== undefined && v !== null && String(v).trim() !== ''));
      if (!hasValues) continue;

      console.log(`\n=== Additional section: ${section.name} ===`);
      await this.captureEvidence(`Before section ${section.name}`).catch(() => {});
      await this.navigateToSectionTab(section.tabLabels);
      await this.reacquireAccountFrame(section.name).catch(() => {});
      const targetFrame = this.accountFrame || this.workingPage;

      if (section.isArray && Array.isArray(data)) {
        await this.fillArraySectionByMeta(targetFrame, section.name, data, meta, section.addLabel, section.saveLabel);
      } else if (typeof data === 'object' && !Array.isArray(data)) {
        await this.fillSectionByMeta(targetFrame, section.name, data, meta);
      }
      if (typeof (this as any).postProcessSection === 'function') {
        await (this as any).postProcessSection(targetFrame, section.name, endToEnd).catch(() => {});
      }
      await this.syncSelectHiddenFields(targetFrame).catch(() => {});
      if (!section.skipSave) {
        await this.saveCurrentSection(targetFrame, section.saveLabel || 'Save');
      } else {
        console.log(`  \u2192 Skipped per-section save for ${section.name}`);
      }
      await this.captureEvidence(`After section ${section.name}`).catch(() => {});
      await this.reacquireAccountFrame(section.name).catch(() => {});
    }
  }

  /**
   * Fill the Tax Certification Details fields in the General tab.
   * Foreign A/c. Tax Reporting Required and Foreign Tax Reporting Status are
   * dropdowns; Foreign Tax Reporting Country is an LOV searched by code.
   */
  protected async fillTaxCertificationSection(data: any): Promise<void> {
    if (!data || typeof data !== 'object') return;
    const required = String(data.foreignAcTaxReportingRequired || data.foreignACTaxReportingRequired || '').trim();
    const status = String(data.foreignTaxReportingStatus || '').trim();
    const country = String(data.foreignTaxReportingCountry || '').trim();
    const countryDisplay = String(data.foreignTaxReportingCountryDisplay || country).trim();
    if (!required && !status && !country) return;

    console.log('\n--- Tax Certification Details ---');
    await this.captureEvidence('Before Tax Certification Details').catch(() => {});
    // Tax Certification may be a sub-tab under General.
    await this.navigateToSectionTab(['Tax Certification Details', 'Tax Certification']).catch(() => null);
    await this.reacquireAccountFrame('Tax Certification').catch(() => {});
    const frame = this.accountFrame || this.workingPage;

    if (required) {
      await this.setSelectOrLovByLabel(frame, 'Foreign A/c. Tax Reporting Required', required, undefined, 'select').catch(() => {});
    }

    // Retail Tax Certification Status is a reason dropdown. Use the workbook value if it is a valid
    // TIN reason, otherwise default to 'NO TIN IS REQUIRED' when reporting is N.
    const isTinReason = (s: string) => /NO TIN|ACCT HLD|COUNTRY\/JURISDICTION|UNABLE TO OBTAIN|REQUIRED/i.test(s);
    let statusToUse = status;
    if (required.toUpperCase() === 'N' && !isTinReason(status)) {
      statusToUse = 'NO TIN IS REQUIRED';
    }
    if (statusToUse) {
      await this.setSelectOrLovByLabel(frame, 'Foreign Tax Reporting Status', statusToUse, undefined, 'select').catch(() => {});
      // Final fallback: only fill a select clearly associated with Foreign Tax Reporting Status.
      await this.setSelectByOptionText(frame, 'NO TIN IS REQUIRED', 'Foreign Tax Reporting Status').catch(() => {});
    }

    if (country) {
      await this.setSelectOrLovByLabel(frame, 'Foreign Tax Reporting Country', country, countryDisplay, 'lov').catch(() => {});
    }
    await this.syncSelectHiddenFields(frame).catch(() => {});
    // Some Retail forms require a Tax Certification reason/sub-category (e.g. NO TIN IS REQUIRED) when reporting is N.
    if (required.toUpperCase() === 'N') {
      await this.setSelectByOptionText(frame, 'NO TIN IS REQUIRED', 'Foreign Tax Reporting Status').catch(() => {});
    }
    await this.captureEvidence('Tax Certification Details complete').catch(() => {});
  }

  /**
   * Select the first visible <select> option whose text contains the supplied keyword.
   * The select is only considered if it is not a Core Interface / Free Code field, and
   * when a scope label is supplied the select (or its label) must contain that label.
   */
  protected async setSelectByOptionText(frame: any, optionText: string, scopeLabel?: string): Promise<boolean> {
    return frame.evaluate((args: { text: string; scope?: string }) => {
      const fire = (el: HTMLElement) => {
         if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; }el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      };
      const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').replace(/[^a-z0-9]/g, '').toLowerCase();
      const t = args.text.trim().toUpperCase();
      const scope = args.scope ? normalize(args.scope) : '';
      const forbidden = ['freecode', 'free code', 'free text', 'coreinterface', 'core interface'];

      for (const sel of Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]) {
        if (sel.disabled) continue;
        const v = String(sel.value || '').toUpperCase();
        if (v && v !== '' && v !== '--SELECT--' && v !== '--Select--') continue;

        const nameId = normalize((sel.name || '') + ' ' + (sel.id || ''));
        const row = (sel.closest('tr, td, div, li, fieldset') as HTMLElement) || sel.parentElement;
        const rowText = normalize(row ? (row.innerText || row.textContent || '') : '');

        // Never touch Core Interface or generic Free Code / Free Text controls.
        if (forbidden.some(f => nameId.includes(f) || rowText.includes(f))) continue;

        // If a scope label was supplied, the select must be clearly associated with it.
        if (scope && !nameId.includes(scope) && !rowText.includes(scope)) continue;

        for (const o of Array.from(sel.options)) {
          const ot = o.text.trim().toUpperCase();
          if (ot.includes(t) || o.value.trim().toUpperCase() === t) {
            sel.value = o.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            sel.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
          }
        }
      }
      return false;
    }, { text: optionText, scope: scopeLabel }).catch(() => false);
  }

  // =====================================================================
  // Account Frame Management
  // =====================================================================

  protected async reacquireAccountFrame(context: string, urlPatterns?: string[], mainOnly = false): Promise<void> {
    const page = this.workingPage;
    const patterns = urlPatterns || ['AccountMod_det', 'Account_det', 'Mod_det', 'CorpGeneralModDet', 'CorpCreateDetWizard', 'CorpMod', 'Wizard'];
    const isOverlayFrame = (f: any) => {
      const n = String(f.name?.() || '').toLowerCase();
      const u = String(f.url?.() || '').toLowerCase();
      return n.includes('dataarea') || n.includes('left') || n.includes('lhs') || n.includes('menu') || n.includes('coreserver') || n.includes('functionmain') || n.includes('button') ||
             u.includes('dataarea') || u.includes('leftmenu') || u.includes('coreserver') || u.includes('functionmain') || u.includes('buttonfrm');
    };
    const countFields = async (f: any) => {
      return f.evaluate(() => Array.from(document.querySelectorAll('input, select')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0);
    };
    const isMainFormFrame = (f: any): boolean => {
      try {
        const u = String(f.url?.() || '').toLowerCase();
        const n = String(f.name?.() || '').toLowerCase();
        if (n === 'formdispframe') return true;
        if (u.includes('lookupforcategory') || u.includes('concessionselection') || u.includes('corprelbankdet') || u.includes('processselection') || u.includes('relationshipmaintenance')) return false;
        if (/corp(general|relationship|pref|fin|create|mod|account|det)/.test(u)) return true;
        if (u.includes('wizard') && (u.includes('corp') || u.includes('account') || u.includes('mod'))) return true;
        return false;
      } catch (_) { return false; }
    };
    const isPopupFrame = (f: any) => {
      const u = String(f.url?.() || '').toLowerCase();
      return u.includes('lookupforcategory') || u.includes('concessionselection') || u.includes('corprelbankdet') || u.includes('processselection') || u.includes('relationshipmaintenance');
    };
    const isKnownMainUrl = (url: string) => {
      const u = url.toLowerCase();
      return u.includes('corpgeneralmoddet') || u.includes('corpcreatedetwizard') || u.includes('corpmod') || u.includes('accountmod_det') || u.includes('account_det') || u.includes('mod_det') || u.includes('wizard');
    };

    // Reuse the cached main form frame if it is still valid.
    if (this.mainAccountFrame) {
      try {
        if (!isOverlayFrame(this.mainAccountFrame) && !this.mainAccountFrame.isDetached?.() && !this.mainAccountFrame.isClosed?.() && isMainFormFrame(this.mainAccountFrame)) {
          this.accountFrame = this.mainAccountFrame;
          if (mainOnly) {
            console.log(`  ↻ Re-used main accountFrame (${context})`);
            return;
          }
        }
      } catch (_) { this.mainAccountFrame = null; }
    }

    // Discover the main Customer form frame.
    let mainFrame: any = null;
    let mainCount = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.waitForTimeout(this.timeouts.short);
      mainFrame = null;
      mainCount = 0;
      for (const f of page.frames()) {
        try {
          if (isOverlayFrame(f) || isPopupFrame(f)) continue;
          const url = f.url();
          if ((isKnownMainUrl(url) || patterns.some(p => url.includes(p)) || f.name?.() === 'formDispFrame') && isMainFormFrame(f)) {
            const count = await countFields(f);
            if (count > mainCount) { mainFrame = f; mainCount = count; }
          }
        } catch (_) {}
      }
      if (mainFrame) break;
    }
    if (!mainFrame) {
      for (const f of page.frames()) {
        try {
          if (isOverlayFrame(f) || isPopupFrame(f)) continue;
          if (isMainFormFrame(f)) {
            const count = await countFields(f);
            if (count > mainCount) { mainFrame = f; mainCount = count; }
          }
        } catch (_) {}
      }
    }

    if (mainFrame) {
      this.mainAccountFrame = mainFrame;
      this.accountFrame = mainFrame;
      console.log(`  ↻ Re-acquired main accountFrame (${context}): ${mainCount} fields`);
      if (mainOnly) return;
    }

    if (mainOnly) {
      console.log(`  ⚠ Could not re-acquire main accountFrame (${context})`);
      return;
    }

    // For sub-sections, find the currently visible active form frame (could be a popup).
    let best: any = mainFrame;
    let bestCount = mainCount;
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.waitForTimeout(this.timeouts.short);
      best = mainFrame;
      bestCount = mainCount;
      for (const f of page.frames()) {
        try {
          if (isOverlayFrame(f) || isPopupFrame(f)) continue;
          const url = f.url().toLowerCase();
          if (url.includes('corp') || url.includes('account') || url.includes('wizard') || url.includes('mod') || url.includes('det') || f.name?.() === 'formDispFrame') {
            const count = await countFields(f);
            if (count > bestCount) { best = f; bestCount = count; }
          }
        } catch (_) {}
      }
      if (best && bestCount > 0) break;
    }

    if (best && best !== mainFrame) {
      this.accountFrame = best;
      console.log(`  ↻ Re-acquired active accountFrame (${context}): ${bestCount} fields`);
    } else if (!best) {
      console.log(`  ⚠ Could not re-acquire accountFrame (${context})`);
    }
  }

  protected async refreshAccountFrame(context: string, urlPatterns?: string[], mainOnly = false): Promise<void> {
    await this.workingPage.waitForTimeout(this.timeouts.short);
    await this.reacquireAccountFrame(context, urlPatterns, mainOnly);
  }
}
