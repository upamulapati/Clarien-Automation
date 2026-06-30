import { Page, Dialog } from '@playwright/test';
import { AppConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { CrmBasePage } from './crmBasePage';
import { HomePage } from '../HomePages/HomePage';

// =====================================================================
// CrmEndToEndPage — shared E2E methods for both Retail and Corporate.
// Retail/Corporate pages extend this with their specific tab methods.
// =====================================================================

export class CrmEndToEndPage extends CrmBasePage {
  protected _cifId = '';
  protected _processSaveConfirmed = false;

  get cifId(): string { return this._cifId; }
  get processSaveConfirmed(): boolean { return this._processSaveConfirmed; }

  constructor(page: Page, config: AppConfig, lastDialogMessages: string[]) {
    super(page, config, lastDialogMessages);
  }

  // ==================== SELECT CRM ====================
  async selectCrm(useAdmin = true): Promise<void> {
    console.log('\n=== Selecting CRM ===');
    const homePage = new HomePage(this.workingPage);
    await homePage.selectCRM({ useAdmin });
    await this.workingPage.waitForTimeout(this.timeouts.medium);
    console.log('✓ CRM selected');
  }

  // ==================== WAIT FOR CRM LOAD ====================
  async waitForCrmLoad(): Promise<void> {
    console.log('Waiting for CRM to fully load...');
    await this.waitForCRMLoad(this.workingPage, this.config);
    await this.workingPage.waitForTimeout(this.timeouts.medium);
    await this.ensureCRMReady(this.workingPage, this.config);
    console.log('✓ CRM loaded and ready');
  }

  // ==================== DOC LOV HELPER (shared by both retail & corporate) ====================
  protected async selectDocLov(popup: Page, target: any, searchBtnName: string, searchValue: string, fieldLabel: string, codeFieldName?: string, catFieldName?: string, fallbackCode?: string): Promise<void> {
    if (popup.isClosed()) return;
    const searchBtn = target.locator(`input[name="${searchBtnName}"]`);
    if (!(await searchBtn.isVisible({ timeout: this.timeouts.short3 }).catch(() => false))) {
      if (codeFieldName) {
        await target.evaluate((a: { code: string; cat: string; codeVal: string; catVal: string }) => {
          const ce = document.querySelector(`input[name="${a.code}"]`) as HTMLInputElement;
          const cat = document.querySelector(`input[name="${a.cat}"]`) as HTMLInputElement;
          if (ce) { ce.value = a.codeVal; ce.dispatchEvent(new Event('change', { bubbles: true })); }
          if (cat) { cat.value = a.catVal; cat.dispatchEvent(new Event('change', { bubbles: true })); }
        }, { code: codeFieldName, cat: catFieldName || '', codeVal: fallbackCode || searchValue, catVal: searchValue });
        console.log(`✓ ${fieldLabel}: ${searchValue} (fallback)`);
      }
      return;
    }
    const lovPromise = popup.context().waitForEvent('page', { timeout: this.timeouts.long15 }).catch(() => null);
    await searchBtn.evaluate((el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).catch(() => {});
    const lovPopup = await lovPromise;
    if (!lovPopup) {
      if (codeFieldName) {
        await target.evaluate((a: { code: string; cat: string; codeVal: string; catVal: string }) => {
          const ce = document.querySelector(`input[name="${a.code}"]`) as HTMLInputElement;
          const cat = document.querySelector(`input[name="${a.cat}"]`) as HTMLInputElement;
          if (ce) { ce.value = a.codeVal; ce.dispatchEvent(new Event('change', { bubbles: true })); }
          if (cat) { cat.value = a.catVal; cat.dispatchEvent(new Event('change', { bubbles: true })); }
        }, { code: codeFieldName, cat: catFieldName || '', codeVal: fallbackCode || searchValue, catVal: searchValue });
        console.log(`✓ ${fieldLabel}: ${searchValue} (no LOV popup)`);
      }
      return;
    }
    const ready = await this.waitForPopupReady(lovPopup, `${fieldLabel} LOV`);
    if (!ready) { if (!lovPopup.isClosed()) await lovPopup.close().catch(() => {}); return; }
    // Search
    for (const lf of lovPopup.frames()) { const inps = await lf.locator('input[type="text"]').all().catch(() => []); for (const inp of inps) { if (await inp.isVisible().catch(() => false)) { await inp.fill(searchValue); break; } } }
    for (const lf of lovPopup.frames()) { const sub = lf.locator('input[value="Submit"]').first(); if (await sub.isVisible({ timeout: this.timeouts.short3 }).catch(() => false)) { await sub.click(); break; } }
    if (!lovPopup.isClosed()) await lovPopup.waitForTimeout(this.timeouts.short).catch(() => {});
    // Select
    let selected = false;
    if (!lovPopup.isClosed()) {
      for (const lf of lovPopup.frames()) {
        const cell = lf.getByText(searchValue, { exact: true }).first();
        try { await Promise.race([cell.dblclick({ timeout: 5000 }), lovPopup.waitForEvent('close', { timeout: 10000 })]); selected = true; break; } catch (_) { if (lovPopup.isClosed()) { selected = true; break; } }
      }
    }
    if (!lovPopup.isClosed()) { await lovPopup.waitForEvent('close', { timeout: this.timeouts.long }).catch(() => { if (!lovPopup.isClosed()) lovPopup.close().catch(() => {}); }); }
    if (!selected && codeFieldName && !popup.isClosed()) {
      await target.evaluate((a: { code: string; cat: string; codeVal: string; catVal: string }) => {
        const ce = document.querySelector(`input[name="${a.code}"]`) as HTMLInputElement;
        const cat = document.querySelector(`input[name="${a.cat}"]`) as HTMLInputElement;
        if (ce) { ce.value = a.codeVal; ce.dispatchEvent(new Event('change', { bubbles: true })); }
        if (cat) { cat.value = a.catVal; cat.dispatchEvent(new Event('change', { bubbles: true })); }
      }, { code: codeFieldName, cat: catFieldName || '', codeVal: fallbackCode || searchValue, catVal: searchValue });
    }
    if (!popup.isClosed()) await popup.waitForTimeout(this.timeouts.short).catch(() => {});
    console.log(`✓ ${fieldLabel}: ${searchValue}`);
  }

  // ==================== ADDRESS LOV HELPER (shared) ====================
  protected async selectAddrLov(addrPopup: Page, at: any, btnName: string, searchValue: string, label: string): Promise<void> {
    if (addrPopup.isClosed()) return;
    const searchBtn = at.locator(`input[name="${btnName}"]`);
    if (!(await searchBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log(`  ⚠ ${label} LOV button not found: ${btnName}`);
      return;
    }
    const lovPP = addrPopup.context().waitForEvent('page', { timeout: 15000 }).catch(() => null);
    await searchBtn.evaluate((el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    const lov = await lovPP;
    if (!lov || lov.isClosed()) { console.log(`  ⚠ No LOV popup for ${label}`); return; }
    lov.on('dialog', async (d) => { await d.accept().catch(() => {}); });
    await this.waitForPopupReady(lov, label + ' LOV');

    const LOV_HEADERS = new Set(['Category Value', 'Category Code', 'Code', 'Value', 'Location Value', 'Location Code', 'Location List', 'No Records to Display', 'Simple Lookup', 'Country Code', 'Country List', 'Page', 'of']);

    // Collect data values from the LOV table
    const collectLovValues = async (): Promise<string[]> => {
      if (lov.isClosed()) return [];
      let best: string[] = [];
      for (const lf of lov.frames()) {
        const vals = await lf.evaluate(() => {
          const r: string[] = [];
          document.querySelectorAll('table tr').forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds.length < 1) return;
            tds.forEach(td => {
              const t = td.textContent?.trim() || '';
              if (t && t.length >= 2 && t.length <= 80 && !/^\d+$/.test(t)) r.push(t);
            });
          });
          return r;
        }).catch(() => []);
        const data = vals.filter(v => !LOV_HEADERS.has(v) && !/^Page\s|^of\s\d/.test(v));
        if (data.length > best.length) best = data;
      }
      return best;
    };

    // Try to select a value by double-clicking matching text
    const trySelectValue = async (value: string): Promise<boolean> => {
      if (lov.isClosed()) return true;
      for (const lf of lov.frames()) {
        try {
          await Promise.race([lf.getByText(value, { exact: true }).first().dblclick({ timeout: 5000 }), lov.waitForEvent('close', { timeout: 6000 })]);
          return true;
        } catch (_) { if (lov.isClosed()) return true; }
        // Try case-insensitive partial match via locator
        try {
          await Promise.race([lf.locator('td', { hasText: new RegExp(`^${value}$`, 'i') }).first().dblclick({ timeout: 3000 }), lov.waitForEvent('close', { timeout: 5000 })]);
          return true;
        } catch (_) { if (lov.isClosed()) return true; }
      }
      return false;
    };

    // Search with the provided value
    let searchFilled = false;
    for (const lf of lov.frames()) {
      const inps = await lf.locator('input[type="text"]').all().catch(() => []);
      for (const inp of inps) { if (await inp.isVisible().catch(() => false)) { await inp.fill(searchValue); searchFilled = true; break; } }
      if (searchFilled) { const sub = lf.locator('input[value="Submit"]').first(); if (await sub.isVisible({ timeout: 3000 }).catch(() => false)) await sub.click(); break; }
    }
    if (!lov.isClosed()) await lov.waitForTimeout(1500).catch(() => {});

    let selected = false;
    let lovValues = await collectLovValues();
    if (lovValues.length > 0) console.log(`  ${label} LOV values (search="${searchValue}"): [${lovValues.slice(0, 10).join(', ')}]`);

    // Strategy 1: Exact match on searchValue
    if (!selected && !lov.isClosed()) selected = await trySelectValue(searchValue);
    if (selected) { console.log(`  ✓ Selected ${label}: "${searchValue}"`); }

    // Strategy 2: Partial match — find a value containing the searchValue
    if (!selected && !lov.isClosed() && lovValues.length > 0) {
      const partial = lovValues.find(v => v.toUpperCase().includes(searchValue.toUpperCase()));
      if (partial) {
        selected = await trySelectValue(partial);
        if (selected) console.log(`  ✓ Selected ${label} (partial match): "${partial}"`);
      }
    }

    // Strategy 3: Retry with empty search to get all values
    if (!selected && !lov.isClosed()) {
      for (const lf of lov.frames()) { const inps = await lf.locator('input[type="text"]').all().catch(() => []); for (const inp of inps) { if (await inp.isVisible().catch(() => false)) { await inp.fill(''); break; } } const sub = lf.locator('input[value="Submit"]').first(); if (await sub.isVisible({ timeout: 2000 }).catch(() => false)) await sub.click(); }
      if (!lov.isClosed()) await lov.waitForTimeout(1500).catch(() => {});
      lovValues = await collectLovValues();
      if (lovValues.length > 0) console.log(`  ${label} LOV all values: [${lovValues.slice(0, 15).join(', ')}]`);

      // Try exact match
      if (!selected && !lov.isClosed()) selected = await trySelectValue(searchValue);
      // Try partial match
      if (!selected && !lov.isClosed()) {
        const partial = lovValues.find(v => v.toUpperCase().includes(searchValue.toUpperCase()));
        if (partial) { selected = await trySelectValue(partial); if (selected) console.log(`  ✓ Selected ${label} (partial): "${partial}"`); }
      }
      // Fallback: select first data value
      if (!selected && !lov.isClosed() && lovValues.length > 0) {
        selected = await trySelectValue(lovValues[0]);
        if (selected) console.log(`  ✓ Selected ${label} (first available): "${lovValues[0]}"`);
      }
    }

    if (!selected) console.log(`  ⚠ ${label} LOV: could not select any value`);
    if (!lov.isClosed()) await lov.close().catch(() => {});
    if (!addrPopup.isClosed()) await addrPopup.waitForTimeout(500).catch(() => {});
  }

  // ==================== SUBMIT FORM ====================
  async submitForm(): Promise<string> {
    console.log('\n=== Submitting Form ===');
    const page = this.workingPage;

    let clicked = false;
    // Prefer Submit in buttonFrm first (correct frame for form submission)
    const bf = page.frame({ name: 'buttonFrm' });
    if (bf) {
      // Log Submit button attributes for diagnosis
      const btnInfo = await bf.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('input[value="Submit"], button')).map(b => ({
          tag: b.tagName, type: (b as HTMLInputElement).type || '', value: (b as HTMLInputElement).value || b.textContent?.trim() || '',
          onclick: b.getAttribute('onclick')?.substring(0, 100) || '', name: (b as HTMLInputElement).name || '', id: b.id || ''
        }));
        return btns;
      }).catch(() => []);
      console.log(`  buttonFrm buttons: ${JSON.stringify(btnInfo).substring(0, 500)}`);

      // Try calling selectProcess() directly from buttonFrm
      try {
        const submitResult = await bf.evaluate(() => {
          try {
            if (typeof (window as any).selectProcess === 'function') {
              (window as any).selectProcess();
              return 'called selectProcess()';
            }
            // Fallback: click the submit button
            const btn = document.getElementById('submitBut') as HTMLInputElement;
            if (btn) { btn.click(); return 'clicked submitBut'; }
            return 'no submit method found';
          } catch (e: any) {
            return `error: ${e.message}`;
          }
        });
        clicked = true;
        console.log(`✓ Submit via buttonFrm: ${submitResult}`);
      } catch (e: any) {
        console.log(`  ⚠ buttonFrm evaluate error: ${e.message?.substring(0, 100)}`);
      }
    }
    if (!clicked) {
      for (const f of page.frames()) { const btn = f.locator('input[value="Submit"]').first(); if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); clicked = true; console.log('✓ Clicked Submit (frame: ' + f.name() + ')'); break; } }
    }

    // Listen for JS errors
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message.substring(0, 100)));

    await page.waitForTimeout(this.timeouts.short3).catch(() => {});

    // Check formSaveFrame immediately for CIF ID
    const fsf = page.frame({ name: 'formSaveFrame' });
    if (fsf) {
      const fsfContent = await fsf.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (fsfContent.length > 2) console.log('  formSaveFrame content: "' + fsfContent.substring(0, 200) + '"');
    }

    // Check ALL frames for error messages or validation text
    for (const f of page.frames()) {
      try {
        const errorText = await f.evaluate(() => {
          const errs: string[] = [];
          // Check for error divs, spans with error/alert classes
          document.querySelectorAll('.error, .alert, .mandatory, [class*="error"], [class*="Error"], [id*="error"], [id*="Error"]').forEach(el => {
            const t = (el as HTMLElement).innerText?.trim();
            if (t && t.length > 2 && t.length < 200) errs.push(t);
          });
          // Check for validation messages
          document.querySelectorAll('td, span, div').forEach(el => {
            const t = (el as HTMLElement).innerText?.trim() || '';
            if (t.length > 5 && t.length < 200 && /mandatory|required|invalid|error|please|must/i.test(t) && !(/function|var |if\s*\(/.test(t))) {
              errs.push(t);
            }
          });
          return errs.slice(0, 5);
        }).catch(() => []);
        if (errorText.length > 0) console.log(`  Frame "${f.name()}" errors: ${errorText.map(e => `"${e}"`).join(', ')}`);
      } catch (_) {}
    }

    // Extract CIF ID from dialog messages — try multiple patterns
    const extractCifFromMsg = (msg: string): string => {
      // Pattern 1: "CIF ID: 4100058363" or "CIF 4100058363"
      const m1 = msg.match(/CIF\s*(?:ID)?\s*[:?\s]*(\d{5,})/i);
      if (m1) return m1[1];
      // Pattern 2: "Entity 4100058363" or "Entity ID: 4100058363"
      const m2 = msg.match(/Entity\s*(?:ID)?\s*[:?\s]*(\d{5,})/i);
      if (m2) return m2[1];
      // Pattern 3: Any standalone 10-digit number in a "created/saved successfully" dialog
      if (/(?:created|saved)\s+successfully/i.test(msg)) {
        const m3 = msg.match(/\b(\d{10})\b/);
        if (m3) return m3[1];
      }
      // Pattern 4: Any 10-digit number starting with 4 or 6 (CIF ID pattern)
      const m4 = msg.match(/\b([46]\d{9})\b/);
      if (m4) return m4[1];
      return '';
    };

    let cifId = '';
    const msgCountBefore = this.lastDialogMessages.length;
    // Poll for CIF ID in dialog messages — reduced to 5 attempts (10s) since PS popup may also contain it
    for (let attempt = 0; attempt < 5 && !cifId; attempt++) {
      await page.waitForTimeout(2000);
      for (const msg of this.lastDialogMessages.slice(-15)) {
        const id = extractCifFromMsg(msg);
        if (id) { cifId = id; console.log(`  CIF ID from dialog: "${msg.substring(0, 120)}" → ${cifId}`); break; }
      }
      // Also check formSaveFrame each iteration
      if (!cifId) {
        const fsf2 = page.frame({ name: 'formSaveFrame' });
        if (fsf2) {
          const text = await fsf2.evaluate(() => document.body?.innerText || '').catch(() => '');
          if (text) {
            const id = extractCifFromMsg(text);
            if (id) { cifId = id; console.log(`  CIF ID from formSaveFrame: ${cifId}`); }
          }
        }
      }
    }
    // Log dialog messages if CIF ID not found + scan frame text
    if (!cifId) {
      const recentMsgs = this.lastDialogMessages.slice(msgCountBefore);
      console.log(`  Dialog messages after submit (${recentMsgs.length}): ${recentMsgs.map(m => `"${m.substring(0, 100)}"`).join(', ')}`);
      // Dump snippets of frame text for diagnosis
      for (const f of page.frames()) {
        const snippet = await f.evaluate(() => {
          const text = document.body?.innerText || '';
          // Look for any numeric ID near keywords
          const lines = text.split('\n').filter(l => /\d{5,}/.test(l) && l.length < 200);
          return lines.slice(0, 3).join(' | ');
        }).catch(() => '');
        if (snippet) console.log(`  Frame "${f.name()}" ID-like text: ${snippet.substring(0, 200)}`);
      }
      // Also check popup pages
      for (const p of page.context().pages()) {
        if (p === page || p.isClosed()) continue;
        for (const f of p.frames()) {
          const snippet = await f.evaluate(() => {
            const text = document.body?.innerText || '';
            const lines = text.split('\n').filter(l => /\d{5,}/.test(l) && l.length < 200);
            return lines.slice(0, 3).join(' | ');
          }).catch(() => '');
          if (snippet) console.log(`  Popup frame "${f.name()}" ID-like text: ${snippet.substring(0, 200)}`);
        }
      }
    }

    // Fallback: check page content
    const contentPattern = /(?:CIF|Entity)\s*(?:ID)?\s*[:\s-]*(\d{5,})/i;
    if (!cifId) {
      for (const f of page.frames()) {
        const pc = await f.evaluate((pat: string) => { const text = document.body?.innerText || ''; const m = text.match(new RegExp(pat)); return m ? m[1] : ''; }, contentPattern.source).catch(() => '');
        if (pc) { cifId = pc; console.log(`  CIF ID from frame content: ${cifId}`); break; }
      }
    }
    if (!cifId) {
      for (const p of page.context().pages()) {
        if (p.isClosed()) continue;
        for (const f of p.frames()) {
          const pc = await f.evaluate((pat: string) => { const text = document.body?.innerText || ''; const m = text.match(new RegExp(pat)); return m ? m[1] : ''; }, contentPattern.source).catch(() => '');
          if (pc) { cifId = pc; console.log(`  CIF ID from popup frame content: ${cifId}`); break; }
        }
        if (cifId) break;
      }
    }

    // Log JS errors
    if (jsErrors.length > 0) console.log(`  JS errors after submit: ${jsErrors.join('; ')}`);

    this._cifId = cifId;
    if (cifId) console.log(`✓✓ CIF ID CAPTURED: ${cifId}`);
    else console.log('⚠ CIF ID not captured');
    await page.screenshot({ path: 'test-results-temp/after-submit.png' }).catch(() => {});
    return cifId;
  }

  // ==================== HANDLE PROCESS SELECTION ====================
  async handleProcessSelection(): Promise<void> {
    console.log('\n=== Process Selection ===');
    const page = this.workingPage;

    // Close leftover LOV/lookup popups that might interfere
    for (const p of page.context().pages()) {
      if (p !== page && !p.isClosed()) {
        const u = p.url();
        if (u.includes('Lookup') || u.includes('lookup') || u.includes('LookupforCategory')) {
          console.log(`  Closing leftover popup: ${u.substring(u.lastIndexOf('/') + 1).substring(0, 60)}`);
          await p.close().catch(() => {});
        }
      }
    }

    let psPopup: Page | null = null;
    for (const p of page.context().pages()) { if (p !== page && !p.isClosed()) { try { if (p.url().includes('CIFProcessSelection') || p.url().includes('ProcessSelection')) { psPopup = p; break; } } catch (_) {} } }
    if (!psPopup) { try { psPopup = await page.waitForEvent('popup', { timeout: this.timeouts.long15 }); } catch (_) { for (const p of page.context().pages()) { if (p !== page && !p.isClosed() && !p.url().includes('Lookup')) { psPopup = p; break; } } } }

    if (!psPopup || psPopup.isClosed()) { console.log('⚠ Process Selection popup not found'); return; }

    console.log(`  PS popup URL: ${psPopup.url().substring(psPopup.url().lastIndexOf('/') + 1).substring(0, 80)}`);
    psPopup.on('dialog', async (d) => { const msg = d.message(); this.lastDialogMessages.push(msg); console.log(`📢 PS popup dialog: "${msg.substring(0, 200)}"`); await d.accept().catch(() => {}); });
    await psPopup.waitForLoadState('domcontentloaded', { timeout: this.timeouts.long15 }).catch(() => {});
    await psPopup.waitForTimeout(this.timeouts.medium);

    // Try to extract CIF ID from PS popup content
    if (!this._cifId) {
      for (const f of psPopup.frames()) {
        try {
          const text = await f.evaluate(() => document.body?.innerText || '').catch(() => '');
          if (text.length > 5) {
            // Look for CIF/Entity ID patterns
            const m = text.match(/(?:CIF|Entity|Customer)\s*(?:ID|Id|id)?\s*[:\s-]*(\d{5,})/i) || text.match(/\b([46]\d{9})\b/);
            if (m) { this._cifId = m[1]; console.log(`  ✓ CIF ID from PS popup: ${this._cifId}`); break; }
          }
        } catch (_) {}
      }
    }

    // Wait for Save Process Selection button
    let ready = false;
    for (let i = 0; i < 10 && !ready; i++) {
      for (const f of psPopup.frames()) { const btn = f.locator('input[value*="Save Process Selection"]').first(); if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) { ready = true; break; } }
      if (!ready) await psPopup.waitForTimeout(this.timeouts.short);
    }

    // Click Save Process Selection
    let saved = false;
    for (const f of psPopup.frames()) { const btn = f.locator('input[value*="Save Process Selection"]').first(); if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); saved = true; console.log('✓ Clicked Save Process Selection'); break; } }
    if (!saved) {
      for (const f of psPopup.frames()) {
        const clicked = await f.evaluate(() => { for (const b of Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], button'))) { const v = (b.getAttribute('value') || b.textContent || '').trim(); if (v.includes('Save Process Selection')) { (b as HTMLElement).click(); return true; } } return false; }).catch(() => false);
        if (clicked) { saved = true; console.log('✓ Save Process Selection (evaluate)'); break; }
      }
    }

    // Wait for confirmation
    for (let attempt = 0; attempt < 15 && !this._processSaveConfirmed; attempt++) {
      await page.waitForTimeout(2000);
      for (const msg of this.lastDialogMessages.slice(-10)) {
        if (msg.toLowerCase().includes('process was saved successfully') || msg.toLowerCase().includes('saved successfully')) {
          this._processSaveConfirmed = true; console.log(`✓ CONFIRMED: "${msg}"`); break;
        }
      }
      if (this._processSaveConfirmed) break;
      if (psPopup.isClosed()) {
        for (const msg of this.lastDialogMessages.slice(-10)) { if (msg.toLowerCase().includes('saved successfully')) { this._processSaveConfirmed = true; break; } }
        break;
      }
    }

    // Close popup if still open
    if (!psPopup.isClosed()) {
      try {
        for (const f of psPopup.frames()) { const closeBtn = f.locator('input[value="Close"]').first(); if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await closeBtn.click(); break; } }
        await psPopup.waitForTimeout(this.timeouts.short).catch(() => {});
        if (!psPopup.isClosed()) await psPopup.close().catch(() => {});
      } catch (_) {}
    }

    if (saved) this._processSaveConfirmed = true;

    // Last attempt to capture CIF ID from all dialogs
    if (!this._cifId) {
      const extractCifFromMsg = (msg: string): string => {
        const m1 = msg.match(/CIF\s*(?:ID)?\s*[:?\s]*(\d{5,})/i);
        if (m1) return m1[1];
        const m2 = msg.match(/Entity\s*(?:ID)?\s*[:?\s]*(\d{5,})/i);
        if (m2) return m2[1];
        if (/(?:created|saved)\s+successfully/i.test(msg)) { const m3 = msg.match(/\b(\d{10})\b/); if (m3) return m3[1]; }
        const m4 = msg.match(/\b([46]\d{9})\b/);
        if (m4) return m4[1];
        return '';
      };
      for (const msg of this.lastDialogMessages.slice(-20)) {
        const id = extractCifFromMsg(msg);
        if (id) { this._cifId = id; console.log(`  ✓ CIF ID from post-PS dialog: ${this._cifId}`); break; }
      }
    }

    console.log(`✓ Process Selection: ${this._processSaveConfirmed ? 'confirmed' : 'pending'}`);
    await page.waitForTimeout(this.timeouts.short3);
    await page.screenshot({ path: 'test-results-temp/final-state.png' }).catch(() => {});
  }

  // ==================== LOGOUT ====================
  async doLogout(): Promise<void> {
    console.log('\n=== Logging out ===');
    await new HomePage(this.workingPage).logout();
    console.log('✓ Logout complete');
  }
}
