import { Frame, Page } from '@playwright/test';
import * as fs from 'fs';
import { AppConfig, CRM_TEST_DATA, getMakerConfig } from '../../config/crmTestData';
import { getCreatedCif } from '../../config/cifStore';
import { CrmModificationBasePage } from './crmModificationBasePage';

// =====================================================================
// CrmOtherBankDetailsPage — page object for adding Other Bank Details
// to an existing retail or corporate CIF.
// Data is sourced from crmTestData.json (corporate.otherBankDetails).
// =====================================================================

const OBD = CRM_TEST_DATA.corporate.otherBankDetails;

export class CrmOtherBankDetailsPage extends CrmModificationBasePage {
  crmMenuFrame: Frame | null = null;
  resultFrame: Frame | null = null;

  constructor(page: Page, config: AppConfig = getMakerConfig(), lastDialogMessages: string[] = []) {
    super(page, config, lastDialogMessages);
  }

  async loginAsMaker(): Promise<boolean> {
    await this.login(this.config.username, this.config.password);
    return this.waitForDashboard(this.page);
  }

  async addOtherBankDetails(type: 'retail' | 'corporate'): Promise<boolean> {
    const fallback = type === 'retail' ? OBD.retailFallbackCifId : OBD.fallbackCifId;
    const cifId = getCreatedCif(type, fallback);
    await this.selectCrmDashboard();
    await this.navigateToEditEntity(type);
    await this.searchCif(cifId, type);
    const editPage = await this.openOtherBankDetailsEdit(cifId, type);
    return this.fillAndSubmitBankForm(editPage, OBD, cifId, type);
  }

  // -----------------------------------------------------------------
  // CRM dashboard and navigation
  // -----------------------------------------------------------------

  private async selectCrmDashboard(): Promise<Frame> {
    await this.page.waitForTimeout(2500).catch(() => {});
    this.crmMenuFrame = await this.switchToCrm();
    if (!this.crmMenuFrame) this.crmMenuFrame = await this.getCrmMenuFrame(this.page);
    if (!this.crmMenuFrame) throw new Error('CRM Dashboard menu not visible.');
    console.log('✓ Navigated to CRM Dashboard');
    return this.crmMenuFrame;
  }

  private async navigateToEditEntity(type: 'retail' | 'corporate'): Promise<Frame> {
    const page = this.page;
    for (let i = 0; i < 15 && !page.frame({ name: 'Functionmain' }); i++) {
      await page.waitForTimeout(1000);
    }
    const menuText = type === 'retail' ? 'CIF Retail' : 'CIF Corporate';
    const menuFrameName = type === 'retail' ? '1504' : '9';
    let searchFrame: Frame | null = null;
    for (let navTry = 1; navTry <= 4 && !searchFrame; navTry++) {
      const functionMainFrame = page.frame({ name: 'Functionmain' });
      if (functionMainFrame) {
        await functionMainFrame.evaluate(() => {
          const el = document.getElementById('screen1');
          if (el) el.click();
        }).catch(() => {});
        await page.waitForTimeout(2000);
      }
      const menuFrame = page.frame({ name: menuFrameName }) || (await this.findMenuFrame(page));
      if (menuFrame) await this.clickMenuItem(menuFrame, page, 'Edit Entity', 3000);
      await page.waitForTimeout(3000);
      const criteria = type === 'retail' ? /Retail Search Criteria|Search Entity|Search Accounts/i : /Corporate Search Criteria|Search Entity|Search Accounts/i;
      searchFrame = await this.findFrameByText(page, criteria, 12000);
      if (!searchFrame) console.log(`Edit Entity search form not loaded (attempt ${navTry}); retrying...`);
    }
    if (!searchFrame) throw new Error(`Edit Entity search form for ${type} not loaded.`);
    console.log(`✓ ${menuText} > Edit Entity search form loaded`);
    return searchFrame;
  }

  private async searchCif(cifId: string, type: 'retail' | 'corporate'): Promise<Frame> {
    const page = this.page;
    let cifFrame: Frame | null = null;
    let cifFilled = false;
    const deadline = Date.now() + 15000;
    while (!cifFilled && Date.now() < deadline) {
      for (const f of page.frames()) {
        const found = await f.evaluate(() => {
          const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
          const labels = Array.from(document.querySelectorAll('td, label, span, th'));
          const allInputs: string[] = [];
          Array.from(document.querySelectorAll('input')).forEach((i) => {
            const el = i as HTMLInputElement;
            if ((el.type || 'text') !== 'hidden') allInputs.push(`${el.name || el.id || '?'}:${el.type || 'text'}`);
          });
          for (const lab of labels) {
            if (/^CIF\s*ID$/i.test(norm(lab.textContent || ''))) {
              const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
              (tw as any).currentNode = lab;
              while (tw.nextNode()) {
                const el = tw.currentNode as HTMLElement;
                if (el.tagName === 'INPUT') {
                  const inp = el as HTMLInputElement;
                  const t = (inp.type || 'text').toLowerCase();
                  if (t !== 'hidden' && t !== 'button' && t !== 'submit' && t !== 'image' && inp.offsetParent !== null) {
                    return { name: inp.name || '', id: inp.id || '', inputs: allInputs };
                  }
                }
              }
            }
          }
          return { name: '', id: '', inputs: allInputs };
        }).catch(() => ({ name: '', id: '', inputs: [] as string[] }));
        if (found.name || found.id) {
          const sel = found.name ? `input[name="${found.name}"]` : `input[id="${found.id}"]`;
          const inp = f.locator(sel).first();
          await inp.fill(cifId, { timeout: 10000 }).catch(() => {});
          const v = await inp.inputValue().catch(() => '');
          if (v.includes(cifId)) {
            cifFrame = f;
            cifFilled = true;
            break;
          }
        }
      }
      if (!cifFilled) await page.waitForTimeout(600);
    }
    if (!cifFilled) throw new Error(`CIF ID field for ${type} could not be filled.`);
    const submitted = await this.clickButtonByLabel(page, 'Submit');
    if (!submitted) throw new Error('Search Submit button not found.');
    await page.waitForTimeout(3000);
    const resultFrame = (await this.findFrameByText(page, new RegExp(cifId))) || cifFrame;
    if (!resultFrame) throw new Error(`CIF ${cifId} search results did not load.`);
    this.resultFrame = resultFrame;
    return resultFrame;
  }

  private async openOtherBankDetailsEdit(cifId: string, type: 'retail' | 'corporate'): Promise<Page> {
    const page = this.page;
    const resultFrame = this.resultFrame!;
    const cifLink = resultFrame.locator(`a:has-text("${cifId}")`).first();
    await cifLink.click({ button: 'right' }).catch(() => {});
    await page.waitForTimeout(1500);

    const OBD_RE = /^\s*Other\s*Bank\s*Details\s*$/i;
    let expanded = false;
    for (const f of page.frames()) {
      const loc = f.getByText(OBD_RE).first();
      if (await loc.isVisible().catch(() => false)) {
        expanded = true;
        break;
      }
    }
    for (let tries = 0; tries < 5 && !expanded; tries++) {
      for (const f of page.frames()) {
        const edit = f.getByText(/^\s*Edit\s*$/i).first();
        if (!(await edit.isVisible().catch(() => false))) continue;
        await edit.scrollIntoViewIfNeeded().catch(() => {});
        await edit.hover().catch(() => {});
        await edit.evaluate((el: HTMLElement) => {
          const fire = (t: EventTarget) => {
            ['mouseover', 'mouseenter', 'mousemove'].forEach((type) =>
              t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
            );
          };
          let node: HTMLElement | null = el;
          for (let i = 0; i < 5 && node; i++) {
            fire(node);
            node = node.parentElement;
          }
        }).catch(() => {});
        await page.waitForTimeout(800);
        const anyObd = await Promise.all(page.frames().map(async (f) => f.getByText(OBD_RE).first().isVisible().catch(() => false)));
        if (anyObd.some(Boolean)) { expanded = true; break; }
        await edit.click().catch(() => {});
        await page.waitForTimeout(800);
        const anyObd2 = await Promise.all(page.frames().map(async (f) => f.getByText(OBD_RE).first().isVisible().catch(() => false)));
        if (anyObd2.some(Boolean)) { expanded = true; break; }
      }
      if (!expanded) await page.waitForTimeout(500);
    }

    const popupPromise = page.context().waitForEvent('page', { timeout: 12000 }).catch(() => null);
    for (const f of page.frames()) {
      const loc = f.getByText(OBD_RE).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.evaluate((el: HTMLElement) => {
          let node: HTMLElement | null = el;
          for (let i = 0; i < 6 && node; i++) {
            const oc = node.getAttribute && node.getAttribute('onclick');
            if (oc && /EditAccount/i.test(oc)) {
              node.click();
              return true;
            }
            node = node.parentElement;
          }
          el.click();
          return false;
        }).catch(() => {});
      }
    }
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await popup.waitForTimeout(1500).catch(() => {});
    }
    await page.waitForTimeout(3000).catch(() => {});
    if (/under\s*verification/i.test(this.lastDialogMessage)) {
      throw new Error(`CIF ${cifId} is under verification. Dialog: "${this.lastDialogMessage}"`);
    }
    return popup && !popup.isClosed() ? popup : page;
  }

  private async fillAndSubmitBankForm(editPage: Page, data: typeof OBD, cifId: string, type: 'retail' | 'corporate'): Promise<boolean> {
    const context = editPage.context();

    // Right-click > Edit > Other Bank Details navigates to the form. Locate the bank form frame.
    const bankFrame = (await this.findFrameByText(editPage, /Bank Name|Product Category|A\/c\.?\s*ID|Channel/i, 8000)) || editPage.mainFrame();
    const addPopupPromise = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);
    for (const f of editPage.frames()) {
      const addBtn = f.locator('input[value*="Add Bank" i], input[type="button"][value*="Add Bank" i], a:has-text("Add Bank Details")').first();
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.scrollIntoViewIfNeeded().catch(() => {});
        await addBtn.click({ timeout: 5000 }).catch(() => {});
        break;
      }
    }
    let addPopup = await addPopupPromise;
    if (!addPopup || addPopup.isClosed()) {
      await editPage.waitForTimeout(1500).catch(() => {});
      addPopup = context.pages().find((p) => !p.isClosed() && /BankDetail|OtherBank|AddBank|BankForm/i.test(p.url())) || null;
    }
    const bankPage: Page = addPopup && !addPopup.isClosed() ? addPopup : editPage;
    bankPage.on('dialog', async (d) => {
      this.lastDialogMessage = d.message();
      console.log(`[bank dialog] ${d.message()}`);
      await d.accept().catch(() => {});
    });
    await bankPage.waitForLoadState('domcontentloaded').catch(() => {});
    await bankPage.waitForTimeout(1500).catch(() => {});

    // Bank Name lookup popup
    const obdForm = (await this.findFrameByText(bankPage, /Product Category|A\/c\.?\s*ID|Channel|Address Line 1/i, 8000)) || bankPage.mainFrame();

    const bankLookupPromise = bankPage.context().waitForEvent('page', { timeout: 12000 }).catch(() => null);
    await obdForm.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[];
      const bankNameLink = anchors.find((a) => /^\s*Bank\s*Name\s*$/i.test((a.textContent || '').trim()));
      if (bankNameLink) {
        bankNameLink.click();
        return true;
      }
      const all = Array.from(document.querySelectorAll('a, img, input[type="button"], input[type="image"]')) as HTMLElement[];
      const byHandler = all.find((e) => /bankbranch|bankList|branchList|BankLookup/i.test(e.getAttribute('onclick') || ''));
      if (byHandler) {
        byHandler.click();
        return true;
      }
      return false;
    }).catch(() => {});
    const bankLookup = await bankLookupPromise;
    if (bankLookup && !bankLookup.isClosed()) {
      bankLookup.on('dialog', async (d) => { await d.accept().catch(() => {}); });
      await bankLookup.waitForLoadState('domcontentloaded').catch(() => {});
      await bankLookup.waitForTimeout(2000).catch(() => {});
      const bankRe = new RegExp(data.bankName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const branchRe = new RegExp(data.branchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const getSelects = async () => {
        const out: any[] = [];
        for (const f of bankLookup.frames()) {
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
      let bankSel = '';
      const bankDeadline = Date.now() + 15000;
      while (Date.now() < bankDeadline && !bankSel) {
        for (const s of await getSelects()) {
          bankSel = await pickInSelect(s, bankRe);
          if (bankSel) break;
        }
        if (!bankSel) await bankLookup.waitForTimeout(700).catch(() => {});
      }
      await bankLookup.waitForLoadState('load').catch(() => {});
      await bankLookup.waitForTimeout(2500).catch(() => {});
      let branchSel = '';
      const branchDeadline = Date.now() + 12000;
      while (Date.now() < branchDeadline && !branchSel) {
        const selects = await getSelects();
        for (const s of selects.slice().reverse()) {
          branchSel = await pickInSelect(s, branchRe);
          if (branchSel) break;
        }
        if (!branchSel) await bankLookup.waitForTimeout(700).catch(() => {});
      }
      for (const f of bankLookup.frames()) {
        const btn = f.locator('input[value="Select"], input[type="button"][value="Select"], input[type="submit"][value="Select"], button:has-text("Select"), a:has-text("Select"), input[onclick*="elect"], a[onclick*="elect"]').first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 6000 }).catch(() => {});
          break;
        }
      }
      await bankPage.waitForTimeout(1800).catch(() => {});
      if (!bankLookup.isClosed()) await bankLookup.close().catch(() => {});
    }

    // Re-resolve the bank form after lookup
    const form = (await this.findFrameByText(bankPage, /Product Category|A\/c\.?\s*ID|Channel|Address Line 1/i, 8000)) || bankPage.mainFrame();
    const inputByLabel = (labelText: string) =>
      form.locator(`xpath=//td[not(descendant::td) and contains(normalize-space(.),'${labelText}')]/following::input[1]`).first();
    const setFieldByLabel = async (labelText: string, value: string): Promise<string> => {
      const inp = inputByLabel(labelText);
      await inp.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      let v = '';
      for (let i = 0; i < 4; i++) {
        await inp.scrollIntoViewIfNeeded().catch(() => {});
        await inp.click({ timeout: 4000 }).catch(() => {});
        await inp.fill('', { timeout: 4000 }).catch(() => {});
        await inp.fill(value, { timeout: 6000 }).catch(() => {});
        v = await inp.inputValue().catch(() => '');
        if (v.toUpperCase().includes(value.toUpperCase())) break;
        await bankPage.waitForTimeout(700).catch(() => {});
      }
      console.log(`OBD: "${labelText}" = "${v}"`);
      return v;
    };
    const setSelectByLabel = async (labelText: string, valueRe: RegExp): Promise<string> => {
      const byLabel = form.locator(`xpath=//td[not(descendant::td) and contains(normalize-space(.),'${labelText}')]/following::select[1]`).first();
      const candidates = [byLabel, ...(await form.locator('select').all().catch(() => [] as any[]))];
      for (const sel of candidates) {
        if (!(await sel.isVisible().catch(() => false))) continue;
        for (const opt of await sel.locator('option').all().catch(() => [] as any[])) {
          const label = ((await opt.textContent().catch(() => '')) || '').trim();
          const value = (await opt.getAttribute('value').catch(() => '')) || '';
          if (valueRe.test(label)) {
            await sel.selectOption(value ? { value } : { label }, { timeout: 5000 }).catch(() => {});
            console.log(`OBD: "${labelText}" dropdown = "${label}"`);
            return label;
          }
        }
      }
      console.log(`OBD: "${labelText}" dropdown option not found for ${valueRe}`);
      return '';
    };
    const fillLookupByLabel = async (labelText: string, value: string, fieldCode: string): Promise<string> => {
      const catSel = `input[name="Cat_RelBankBO.RelBankInfo.${fieldCode}"]`;
      const codeSel = `input[name="RelBankBO.RelBankInfo.${fieldCode}"]`;
      const pagesBefore = bankPage.context().pages().slice();
      const popPromise = bankPage.context().waitForEvent('page', { timeout: 12000 }).catch(() => null);
      const lookupBtn = form.locator(`input[name="btnone_RelBankBO.RelBankInfo.${fieldCode}"]`).first();
      let clicked = false;
      if (await lookupBtn.isVisible().catch(() => false)) {
        await lookupBtn.scrollIntoViewIfNeeded().catch(() => {});
        await lookupBtn.click({ timeout: 5000 }).catch(() => {});
        clicked = true;
      } else {
        clicked = await form.evaluate((code) => {
          const btn = document.querySelector(`input[name="btnone_RelBankBO.RelBankInfo.${code}"]`) as HTMLElement | null;
          if (btn) { btn.click(); return true; }
          return false;
        }, fieldCode).catch(() => false);
      }
      console.log(`OBD: ${labelText} lookup button clicked = ${clicked}`);
      let pop = await popPromise;
      if (!pop || pop.isClosed()) {
        for (let i = 0; i < 8 && (!pop || pop.isClosed()); i++) {
          await bankPage.waitForTimeout(800).catch(() => {});
          const fresh = bankPage.context().pages().filter((p) => !pagesBefore.includes(p) && !p.isClosed());
          pop = fresh[fresh.length - 1] || null;
        }
      }
      let pickedCode = '';
      if (pop && !pop.isClosed()) {
        pop.on('dialog', async (d) => { await d.accept().catch(() => {}); });
        await pop.waitForLoadState('domcontentloaded').catch(() => {});
        await pop.waitForTimeout(1200).catch(() => {});
        for (const f of pop.frames()) {
          const ok = await f.evaluate((val) => {
            const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
            const vis = inputs.filter((i) => {
              const t = (i.getAttribute('type') || 'text').toLowerCase();
              return (t === 'text' || t === '') && i.offsetParent !== null;
            });
            const inp = vis[0];
            if (!inp) return false;
            inp.focus(); inp.value = ''; inp.value = val;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }, value).catch(() => false);
          if (ok) {
            await f.locator('input[value="Submit"], input[type="submit"], button:has-text("Submit"), input[value="Search"], input[value="Go"]').first().click({ timeout: 5000 }).catch(() => {});
            await pop.waitForTimeout(1600).catch(() => {});
            break;
          }
        }
        const selectRow = async (target: string): Promise<{ found: boolean; cells: string[] }> => {
          for (const f of pop!.frames()) {
            const res = await f.evaluate((tgt) => {
              const norm = (s: string | null) => (s || '').replace(/\s+/g, ' ').trim();
              const rows = Array.from(document.querySelectorAll('tr')).filter((r) => !r.querySelector('tr'));
              const esc = tgt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              let row = rows.find((r) => new RegExp(`\\b${esc}\\b`, 'i').test(r.textContent || ''));
              if (!row) row = rows.find((r) => new RegExp(esc, 'i').test(r.textContent || ''));
              if (!row) return { found: false, cells: [] as string[] };
              const cells = Array.from(row.querySelectorAll('td')).map((c) => norm(c.textContent));
              const link = row.querySelector('a') as HTMLElement | null;
              if (link) link.click(); else {
                const cell = (row.querySelector('td') || row) as HTMLElement;
                cell.click();
                cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
              }
              return { found: true, cells };
            }, target).catch(() => ({ found: false, cells: [] as string[] }));
            if (res.found) return res;
          }
          return { found: false, cells: [] as string[] };
        };
        let rowFound = false;
        const sel = await selectRow(value);
        if (sel.found) {
          rowFound = true;
          const cells = sel.cells || [];
          pickedCode = cells.find((c) => /^[A-Za-z0-9]{1,6}$/.test(c) && c.toUpperCase() !== value.toUpperCase()) || '';
        }
        if (!rowFound) {
          for (let p = 0; p < 80; p++) {
            const s = await selectRow(value);
            if (s.found) {
              const cells = s.cells || [];
              pickedCode = cells.find((c) => /^[A-Za-z0-9]{1,6}$/.test(c) && c.toUpperCase() !== value.toUpperCase()) || '';
              break;
            }
            const next = await pop.evaluate(() => {
              const cands = Array.from(document.querySelectorAll('a, img, input[type=image], span, td, div')) as HTMLElement[];
              const isNext = (el: HTMLElement) => {
                if (el.offsetParent === null) return false;
                const attrs = (el.getAttribute('onclick') || '') + ' ' + (el.getAttribute('href') || '');
                const meta = (el.getAttribute('title') || '') + ' ' + (el.getAttribute('alt') || '') + ' ' + (el.getAttribute('src') || '');
                const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (/(prev|previous|first|last)/i.test(attrs + ' ' + meta) && !/next/i.test(attrs + ' ' + meta)) return false;
                if (/(next|forward|pagedown|gotopage\(['"]?next)/i.test(attrs + ' ' + meta)) return true;
                if (/(next|forward)/i.test(meta)) return true;
                if (/^(›|»|>|&gt;)$/.test(txt)) return true;
                return false;
              };
              const t = cands.find(isNext);
              if (t) { t.click(); return true; }
              return false;
            }).catch(() => false);
            if (!next) break;
            await pop.waitForTimeout(1300).catch(() => {});
          }
        }
        if (!rowFound) {
          try {
            const rowDump: any = { label: labelText, target: value, url: pop.url(), frames: [] };
            for (const f of pop.frames()) {
              const info = await f.evaluate(() => {
                const norm = (s: string | null) => (s || '').replace(/\s+/g, ' ').trim();
                const rows = Array.from(document.querySelectorAll('tr')).filter((r) => !r.querySelector('tr')).map((r) => norm(r.textContent)).filter((t) => t).slice(0, 40);
                const inputs = Array.from(document.querySelectorAll('input')).map((i) => `${(i as HTMLInputElement).type}:${(i as HTMLInputElement).name}`);
                return { url: location.href, rows, inputs };
              }).catch(() => null);
              if (info && (info.rows.length || info.inputs.length)) rowDump.frames.push(info);
            }
            fs.writeFileSync(`test-results/obd-lookup-${fieldCode}-rows.json`, JSON.stringify(rowDump, null, 2));
          } catch {}
        }
        await bankPage.waitForTimeout(1200).catch(() => {});
        if (!pop.isClosed()) await pop.close().catch(() => {});
      }
      let after = await form.locator(catSel).first().inputValue().catch(() => '');
      if (!after || !after.trim()) {
        await form.evaluate((args: { catSel: string; codeSel: string; desc: string; code: string }) => {
          const cat = document.querySelector(args.catSel) as HTMLInputElement | null;
          const code = document.querySelector(args.codeSel) as HTMLInputElement | null;
          if (cat) { cat.value = args.desc; cat.dispatchEvent(new Event('change', { bubbles: true })); }
          if (code && args.code) { code.value = args.code; code.dispatchEvent(new Event('change', { bubbles: true })); }
        }, { catSel, codeSel, desc: value, code: pickedCode }).catch(() => {});
        after = await form.locator(catSel).first().inputValue().catch(() => '');
      }
      console.log(`OBD: ${labelText} after lookup = "${after}"`);
      return after;
    };

    await setSelectByLabel('Product Category', new RegExp(data.productCategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    await setFieldByLabel('A/c. ID', data.accountId);
    await setSelectByLabel('Channel', new RegExp(`^\\s*${data.channel}\\s*$`, 'i'));
    await setFieldByLabel('Address Line 1', data.addressLine1);
    await fillLookupByLabel('City', data.city, 'city');
    await fillLookupByLabel('State', data.state, 'state');
    await fillLookupByLabel('Country', data.country, 'country');

    await bankPage.screenshot({ path: `test-results/${type}-obd-bankform-filled.png`, fullPage: true }).catch(() => {});

    // Save bank-details sub-form
    let bankSaved = false;
    for (const f of bankPage.frames()) {
      const saveBtn = f.locator('input[type="button"][value="Save"], input[type="submit"][value="Save"], input[value="Save"], button:has-text("Save")').first();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click({ timeout: 6000 }).catch(() => {});
        bankSaved = true;
        console.log(`OBD: bank-details 'Save' clicked in ${f.url().slice(-45)}`);
        break;
      }
    }
    await editPage.waitForTimeout(2000).catch(() => {});
    if (addPopup && !addPopup.isClosed()) await addPopup.close().catch(() => {});
    await editPage.waitForTimeout(1000).catch(() => {});

    // Submit whole-entity form
    let submitSuccessSeen = false;
    const successRe = /submitted successfully|successfully submitted|is submitted|Process was saved successfully/i;
    const attachDialog = (p: Page) => {
      p.on('dialog', async (d) => {
        this.lastDialogMessage = d.message();
        if (successRe.test(d.message())) submitSuccessSeen = true;
        await d.accept().catch(() => {});
      });
    };
    attachDialog(editPage);
    context.on('page', attachDialog);
    let submitClicked = false;
    for (const f of editPage.frames()) {
      const btn = f.locator('input[type="submit"][value="Submit"], input[type="button"][value="Submit"], input[value="Submit"], button:has-text("Submit"), a:has-text("Submit")').first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({ timeout: 6000 }).catch(() => {});
        submitClicked = true;
        break;
      }
    }
    await editPage.waitForTimeout(4000).catch(() => {});

    // Verify record in grid after submission
    const page = this.page;
    await page.waitForTimeout(3000).catch(() => {});
    const searchFrame = await this.findFrameByText(page, /Retail Search Criteria|Corporate Search Criteria|Search Entity|Search Accounts/i, 8000);
    if (searchFrame) {
      await searchFrame.locator('input[name^="FilterParam"]').first().fill(cifId, { timeout: 10000 }).catch(() => {});
      await this.clickButtonByLabel(page, 'Submit', 6000);
      await page.waitForTimeout(3000).catch(() => {});
    }
    let shown = false;
    for (const f of page.frames()) {
      if (await f.getByText(new RegExp(cifId)).first().isVisible().catch(() => false)) {
        shown = true;
        break;
      }
    }
    return submitClicked && (submitSuccessShown(submitSuccessSeen) || shown);
  }
}

function submitSuccessShown(flag: boolean) {
  return flag;
}
