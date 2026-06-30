import { Page, Dialog } from '@playwright/test';
import { AppConfig } from '../../config/crmTestData';

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

  constructor(page: Page, config: AppConfig, lastDialogMessages: string[]) {
    this.page = page;
    this.config = config;
    this.lastDialogMessages = lastDialogMessages;
    this.workingPage = page;
  }

  protected get timeouts() { return this.config.timeouts; }

  // =====================================================================
  // Frame Helpers
  // =====================================================================

  async findPopupTarget(popup: Page): Promise<any> {
    let bestFrame: any = popup;
    let maxFields = 0;
    for (const pf of popup.frames()) {
      const count = await pf.evaluate(() =>
        Array.from(document.querySelectorAll('input, select, textarea')).filter(el => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }).length
      ).catch(() => 0);
      if (count > maxFields) { maxFields = count; bestFrame = pf; }
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
    await new Promise(r => setTimeout(r, 3000));
    let fieldCount = 0;
    let urlShort = '';
    for (let i = 0; i < 15; i++) {
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

  async closeUnexpectedPopups(page: Page, ...expectedPopups: Page[]) {
    const expectedSet = new Set([page, ...expectedPopups.filter(p => p && !p.isClosed())]);
    for (const p of page.context().pages()) {
      if (p.isClosed() || expectedSet.has(p)) continue;
      const url = p.url();
      if (url === 'about:blank') continue;
      if (url.includes('Lookup') || url.includes('LOV') || url.includes('SSOblank')) {
        console.log(`⚠ Closing unexpected popup: ${url.substring(url.lastIndexOf('/') + 1).substring(0, 80)}`);
        p.on('dialog', async (d) => { await d.accept().catch(() => {}); });
        await p.close().catch(() => {});
      }
    }
  }

  // =====================================================================
  // LOV Helpers
  // =====================================================================

  protected async lovFillSearch(popup: Page, value: string, label: string): Promise<boolean> {
    if (popup.isClosed()) return false;
    for (const lf of popup.frames()) {
      const textInputs = await lf.locator('input[type="text"]').all().catch(() => []);
      for (const inp of textInputs) {
        if (await inp.isVisible().catch(() => false)) {
          await inp.fill(value);
          console.log(`  Typed "${value}" in LOV search for ${label}`);
          return true;
        }
      }
    }
    return false;
  }

  protected async lovClickSubmit(popup: Page, label: string, config: AppConfig): Promise<boolean> {
    if (popup.isClosed()) return false;
    for (const lf of popup.frames()) {
      const btn = lf.locator('input[value="Submit"]').first();
      if (await btn.isVisible({ timeout: config.timeouts.short3 }).catch(() => false)) {
        await btn.click();
        console.log(`  ✓ Clicked Submit in LOV for ${label}`);
        return true;
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
      const tdTexts = await lf.evaluate(() => {
        return Array.from(document.querySelectorAll('td')).map(td => td.textContent?.trim() || '');
      }).catch(() => [] as string[]);
      const dataCells = tdTexts.filter(t =>
        t.length >= 2 && t.length <= 50 &&
        !t.includes('Page') && !t.match(/^of \d+$/) && !t.match(/^\d+$/) &&
        !excludes.includes(t)
      );
      if (dataCells.length > values.length) values = dataCells;
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

  async selectLovValue(opts: {
    parentPage: Page; target: any; buttonName: string; searchValue: string;
    label: string; config: AppConfig; directFieldName?: string; parentPopup?: Page;
  }): Promise<boolean> {
    const { parentPage, target, buttonName, searchValue, label, config, directFieldName, parentPopup } = opts;
    const contextPage = parentPopup || parentPage;

    if (parentPopup && parentPopup.isClosed()) {
      console.log(`⚠ Parent popup closed, cannot open LOV for ${label}`);
      return false;
    }

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
    if (!lovBtn) {
      console.log(`⚠ LOV button not found for ${label}: ${buttonName}`);
      return false;
    }

    const isDisabled = await lovBtn.evaluate((el: HTMLInputElement) => el.disabled).catch(() => false);
    if (isDisabled) {
      console.log(`  ⚠ LOV button "${buttonName}" disabled, enabling for ${label}...`);
      await lovBtn.evaluate((el: HTMLInputElement) => { el.disabled = false; });
      await parentPage.waitForTimeout(500);
    }

    const lovPromise = contextPage.context().waitForEvent('page', { timeout: config.timeouts.long15 }).catch(() => null);
    await lovBtn.evaluate((el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    console.log(`  Clicked LOV for ${label}...`);

    const lovPopup = await lovPromise;
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
      if (!lovPopup.isClosed()) await lovPopup.close().catch(() => {});
      if (directFieldName) await this.lovSetDirectValue(target, directFieldName, searchValue, label);
      return false;
    }
    if (lovPopup.isClosed()) { console.log(`  ✓ LOV already closed for ${label}`); return true; }

    // STRATEGY 1: Search with provided value
    let selected = false;
    if (searchValue) {
      await this.lovFillSearch(lovPopup, searchValue, label);
      await this.lovClickSubmit(lovPopup, label, config);
      if (!lovPopup.isClosed()) await lovPopup.waitForTimeout(config.timeouts.short).catch(() => {});
      const values = await this.lovCollectValues(lovPopup);
      console.log(`  ${label} LOV values (search="${searchValue}"): [${values.slice(0, 20).join(', ')}]`);
      if (values.length > 0) selected = await this.lovTrySelect(lovPopup, searchValue, label, config);
    }

    // STRATEGY 2: Empty search (list all values)
    if (!selected && !lovPopup.isClosed()) {
      console.log(`  Retrying ${label} with empty search (all values)...`);
      await this.lovFillSearch(lovPopup, '', label);
      await this.lovClickSubmit(lovPopup, label, config);
      if (!lovPopup.isClosed()) await lovPopup.waitForTimeout(config.timeouts.short).catch(() => {});
      const allValues = await this.lovCollectValues(lovPopup);
      console.log(`  ${label} LOV all values: [${allValues.slice(0, 30).join(', ')}]`);
      if (allValues.length > 0 && searchValue) selected = await this.lovTrySelect(lovPopup, searchValue, label, config);
    }

    if (!selected) console.log(`  ⚠ Could not select value "${searchValue}" for ${label}`);

    if (!lovPopup.isClosed()) {
      await lovPopup.waitForEvent('close', { timeout: config.timeouts.long }).catch(() => {
        if (!lovPopup.isClosed()) lovPopup.close().catch(() => {});
      });
    }
    console.log(`  ✓ LOV closed for ${label}`);

    if (!selected && directFieldName) {
      await this.lovSetDirectValue(target, directFieldName, searchValue, label);
    }

    await this.closeUnexpectedPopups(parentPage, ...(parentPopup ? [parentPopup] : []));
    return selected;
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
          if (el) { el.removeAttribute('readonly'); el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); }
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
        if (el) { el.removeAttribute('readonly'); el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); }
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
        for (const o of Array.from(sel.options)) {
          if (o.text.trim().toUpperCase().includes(a.m.toUpperCase()) || o.value.toUpperCase() === a.m.toUpperCase()) {
            sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return o.text.trim();
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
    let found = false;
    for (const fn of codeNames) {
      const r = await frame.evaluate((a: { f: string; v: string }) => {
        const el = document.querySelector(`input[name="${a.f}"]`) as HTMLInputElement;
        if (el) { el.removeAttribute('readonly'); el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return true; }
        return false;
      }, { f: fn, v: code }).catch(() => false);
      if (r) { found = true; break; }
    }
    for (const fn of catNames) {
      await frame.evaluate((a: { f: string; v: string }) => {
        const el = document.querySelector(`input[name="${a.f}"]`) as HTMLInputElement;
        if (el) { el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }, { f: fn, v: display }).catch(() => {});
    }
    if (found) console.log('✓ ' + label + ' = "' + code + '" / "' + display + '"');
    else console.log('⚠ ' + label + ' LOV field not found');
    return found;
  }

  // =====================================================================
  // Account Frame Management
  // =====================================================================

  protected async reacquireAccountFrame(context: string, urlPatterns?: string[]): Promise<void> {
    const page = this.workingPage;
    const patterns = urlPatterns || ['AccountMod_det', 'Account_det', 'Mod_det'];
    await page.waitForTimeout(this.timeouts.short3);
    let best: any = null;
    let bestCount = 0;
    for (const f of page.frames()) {
      try {
        const url = f.url();
        if (patterns.some(p => url.includes(p))) {
          const count = await f.evaluate(() => Array.from(document.querySelectorAll('input, select')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0);
          if (count > bestCount) { best = f; bestCount = count; }
        }
      } catch (_) {}
    }
    if (best) this.accountFrame = best;
    else {
      const fdf = page.frame({ name: 'formDispFrame' });
      if (fdf) this.accountFrame = fdf;
    }
    if (bestCount > 0) console.log(`  ↻ Re-acquired accountFrame (${context}): ${bestCount} fields`);
  }

  protected async refreshAccountFrame(context: string, urlPatterns?: string[]): Promise<void> {
    await this.workingPage.waitForTimeout(this.timeouts.short);
    await this.reacquireAccountFrame(context, urlPatterns);
  }
}
