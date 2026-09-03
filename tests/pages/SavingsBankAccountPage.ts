import { Frame, Page } from '@playwright/test';
import { AccountPage } from './CoreBanking/AccountPage';

export class SavingsBankAccountPage extends AccountPage {
  constructor(page: Page) {
    super(page);
  }

  private getSiFinwFrame(): Frame {
    const finwFrame = this.page.frame({ name: 'FINW' });
    if (!finwFrame) throw new Error('FINW frame not found');
    return finwFrame;
  }

  async selectSiDropdown(option: string): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    const optionLower = option.toLowerCase();
    const selects = finwFrame.locator('select:visible');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const dd = selects.nth(i);
      if (await dd.isDisabled().catch(() => true)) continue;
      const options = await dd.evaluateAll(els =>
        Array.from(els).flatMap(s => Array.from((s as HTMLSelectElement).options).map(o => ({ text: o.text, value: o.value })))
      );
      const match = options.find(o =>
        o.text.toLowerCase() === optionLower ||
        o.text.toLowerCase().startsWith(optionLower + ' ') ||
        o.text.toLowerCase().includes(optionLower)
      );
      if (match) {
        await dd.selectOption(match.value).catch(() => dd.evaluate((s, text) => {
          const sel = s as HTMLSelectElement;
          const opt = Array.from(sel.options).find(o => o.text.toLowerCase().includes(text.toLowerCase()));
          if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        }, option));
        await this.page.waitForTimeout(1500);
        console.log(`Selected SI dropdown option: ${match.text}`);
        return;
      }
    }
    console.log(`Could not select SI dropdown option: ${option}`);
  }

  async setSiText(candidates: string[], value: string, label: string): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    for (const id of candidates) {
      const locators = [
        finwFrame.locator(`#${id}`).first(),
        finwFrame.locator(`[name="${id}"]`).first(),
        finwFrame.locator(`input[id*="${id}" i]`).first(),
        finwFrame.locator(`input[name*="${id}" i]`).first(),
      ];
      for (const loc of locators) {
        try {
          if (await loc.count() > 0 && await loc.isVisible().catch(() => false) && await loc.isEnabled().catch(() => false)) {
            await loc.click({ clickCount: 3 });
            await loc.fill(value);
            await loc.press('Tab').catch(() => {});
            await this.page.waitForTimeout(800);
            console.log(`Set ${label} (${id}) = ${value}`);
            return;
          }
        } catch {}
      }
    }
    // Last resort: set by label text
    const ok = await this.fillByLabel(label, value).catch(() => false);
    if (!ok) console.log(`Could not set ${label} = ${value}`);
  }

  async selectSiOptionById(id: string, text: string): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    const locators = [
      finwFrame.locator(`#${id}`).first(),
      finwFrame.locator(`[name="${id}"]`).first(),
      finwFrame.locator(`select[id*="${id}" i]`).first(),
      finwFrame.locator(`select[name*="${id}" i]`).first(),
    ];
    const textLower = text.toLowerCase();
    for (const loc of locators) {
      try {
        if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
          const options = await loc.evaluateAll(els =>
            Array.from(els).flatMap(s => Array.from((s as HTMLSelectElement).options).map(o => ({ text: o.text, value: o.value })))
          );
          const match = options.find(o =>
            o.text.toLowerCase() === textLower ||
            o.text.toLowerCase().startsWith(textLower + ' ') ||
            o.text.toLowerCase().includes(textLower)
          );
          if (match) {
            await loc.selectOption(match.value).catch(() => loc.evaluate((s, val) => {
              const sel = s as HTMLSelectElement;
              sel.value = val;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }, match.value));
            await this.page.waitForTimeout(1000);
            console.log(`Selected ${id} option: ${match.text}`);
            return;
          }
        }
      } catch {}
    }
    console.log(`Could not select ${id} = ${text}`);
  }

  async fillSiDate(candidates: string[], value: string, label: string): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    for (const id of candidates) {
      const locators = [
        finwFrame.locator(`#${id}`).first(),
        finwFrame.locator(`[name="${id}"]`).first(),
        finwFrame.locator(`input[id*="${id}" i]`).first(),
        finwFrame.locator(`input[name*="${id}" i]`).first(),
      ];
      for (const loc of locators) {
        try {
          if (await loc.count() > 0 && await loc.isVisible().catch(() => false) && await loc.isEnabled().catch(() => false)) {
            const inputId = await loc.evaluate(el => (el as HTMLElement).id || (el as HTMLElement).getAttribute('name') || '');
            await loc.click({ clickCount: 3 });
            await loc.fill(value);
            await loc.press('Tab').catch(() => {});
            await this.page.waitForTimeout(800);
            // Update any hidden backend date field.
            await finwFrame.evaluate(({ baseId, val }) => {
              const hidden = document.querySelector(`input[id="${baseId}"], input[name="${baseId}"]`);
              if (hidden) {
                (hidden as HTMLInputElement).value = val;
                hidden.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, { baseId: inputId.replace('_ui', ''), val: value });
            console.log(`Set ${label} date (${inputId}) = ${value}`);
            return;
          }
        } catch {}
      }
    }
    console.log(`Could not set ${label} date = ${value}`);
  }

  async setSiType(type: 'customer' | 'bank' | string): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    const typeLower = type.toLowerCase();
    const result = await finwFrame.evaluate((val) => {
      const valFirst = val[0] || val;
      const mapped = val === 'customer' ? 'c' : val === 'bank' ? 'b' : val;
      const allRadios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      // 1. Direct value match on any siType-named radio.
      const siRadios = allRadios.filter(r =>
        (r.name || '').toLowerCase().includes('sitype') ||
        (r.id || '').toLowerCase().includes('sitype')
      );
      let target = siRadios.find(r => {
        const v = r.value.toLowerCase();
        return v === val || v === mapped || v.startsWith(valFirst);
      });
      if (target) {
        target.checked = true;
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return `Selected siType by value ${target.value}`;
      }
      // 2. Match by an individual label associated with the radio.
      const labels = Array.from(document.querySelectorAll('label')) as HTMLLabelElement[];
      const label = labels.find(l => {
        const t = (l.textContent || '').toLowerCase().trim();
        return t === val || t.startsWith(val) || t.includes(val) || t.includes(mapped);
      });
      if (label) {
        let radio = label.control as HTMLInputElement | null;
        if (!radio && label.htmlFor) radio = document.getElementById(label.htmlFor) as HTMLInputElement | null;
        if (!radio) radio = label.querySelector('input[type="radio"]') as HTMLInputElement | null;
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          return `Selected siType by label ${radio.value}`;
        }
      }
      // 3. Fallback: any radio with matching value or title.
      const fallback = allRadios.find(r =>
        r.value.toLowerCase() === val ||
        r.value.toLowerCase() === mapped ||
        (r.getAttribute('title') || '').toLowerCase().includes(val) ||
        (r.nextElementSibling?.textContent || '').toLowerCase().trim() === val ||
        (r.nextElementSibling?.textContent || '').toLowerCase().trim().startsWith(val)
      );
      if (fallback) {
        fallback.checked = true;
        fallback.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        fallback.dispatchEvent(new Event('change', { bubbles: true }));
        return `Selected type fallback ${fallback.value}`;
      }
      return 'SI type radio not found';
    }, typeLower);
    console.log('setSiType:', result);
    await this.page.waitForTimeout(500);
  }

  async setSiFlag(flag: string, value: 'yes' | 'no' | string): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    const flagLower = flag.toLowerCase();
    const valueLower = value.toLowerCase();

    const knownFlags: Record<string, string> = {
      'holiday': 'validateCrncyHoliday',
      'validate ccy holiday': 'validateCrncyHoliday',
      'autopost': 'autoPost',
      'auto post': 'autoPost',
      'carry forward': 'carryFrwdIfFailed',
      'carryfrwdiffailed': 'carryFrwdIfFailed',
      'autosuspend': 'AutoSuspFlg',
      'auto suspend': 'AutoSuspFlg',
      'resume after suspension': 'ResAfterSusp',
      'del if not posted': 'delIfNotPosted',
      'collect charges': 'collModChrgInd',
      'collect charges for modification': 'collModChrgInd',
      'collect fees': 'mCollectChrg',
      'create memo pad entry': 'mMemoPadReqd',
      'memo pad': 'mMemoPadReqd',
    };

    const result = await finwFrame.evaluate(({ flagKey, val, known }) => {
      const valLower = val.toLowerCase();
      const mapped = valLower === 'yes' ? 'y' : valLower === 'no' ? 'n' : valLower;

      // 1. Try to match by known radio group name (most reliable).
      const knownName = known[flagKey];
      if (knownName) {
        const group = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
        const candidates = group.filter(r =>
          (r.name || '').toLowerCase() === knownName.toLowerCase() ||
          (r.id || '').toLowerCase() === knownName.toLowerCase() ||
          (r.name || '').toLowerCase().includes(knownName.toLowerCase()) ||
          (r.id || '').toLowerCase().includes(knownName.toLowerCase())
        );
        let target = candidates.find(r =>
          r.value.toLowerCase() === valLower ||
          r.value.toLowerCase() === mapped
        );
        // Match by label text if value doesn't help.
        if (!target) {
          target = candidates.find(r => {
            const label = (r.nextElementSibling?.textContent || '').toLowerCase().trim();
            return label === valLower || label.startsWith(valLower);
          });
        }
        if (target) {
          target.checked = true;
          target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return `Set ${target.name} (id=${target.id}) to ${target.value}`;
        }
      }

      // 2. Fallback: search label text and use the radios in the same row.
      const labels = Array.from(document.querySelectorAll('td, th, label')) as HTMLElement[];
      const label = labels.find(l => (l.textContent || '').toLowerCase().includes(flagKey));
      if (label) {
        const row = label.closest('tr');
        const radios = Array.from((row || document).querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
        let target = radios.find(r =>
          r.value.toLowerCase() === valLower ||
          r.value.toLowerCase() === mapped ||
          (r.nextElementSibling?.textContent || '').toLowerCase().trim() === valLower ||
          (r.nextElementSibling?.textContent || '').toLowerCase().startsWith(valLower)
        );
        if (target) {
          target.checked = true;
          target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return `Set ${flagKey} flag to ${val}`;
        }
      }
      return `Flag ${flagKey} not found`;
    }, { flagKey: flagLower, val: valueLower, known: knownFlags });
    console.log('setSiFlag:', result);
    await this.page.waitForTimeout(500);
  }

  async setSiPartTranType(type: 'debit' | 'credit' | string): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    const result = await finwFrame.evaluate((val) => {
      const wanted = val === 'debit' ? 'D' : val === 'credit' ? 'C' : val.toUpperCase();
      const allRadios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      const target = allRadios.find(r => {
        const name = (r.name || '').toLowerCase();
        const v = r.value.toUpperCase();
        return name.includes('ptrantype') && v === wanted;
      });
      if (target) {
        target.checked = true;
        target.click();
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return `Set part-tran type ${target.value} (name=${target.name}, id=${target.id})`;
      }
      return `Part-tran type ${val} not set`;
    }, type.toLowerCase());
    console.log('setSiPartTranType:', result);
    await this.page.waitForTimeout(800);
  }

  async setSiAmount(value: string): Promise<void> {
    return this.setSiText(['mAmount','issim.mAmount','amount','amt','siAmt','partTranAmount'], value, 'Amt.');
  }

  async setSiCurrency(value: string): Promise<void> {
    return this.setSiText(['mRefCrncy','refCrncy','mAcctCrncy','ccy','crncyCode','currencyCode','acctCrncy'], value, 'CCY');
  }

  async setSiCollectFees(value: 'yes' | 'no' | string): Promise<void> {
    return this.setSiFlag('collect fees', value);
  }

  async visitSiInstructionDetails(): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    const result = await finwFrame.evaluate(() => {
      const tags = ['a', 'span', 'td', 'div', 'li', 'label'];
      for (const tag of tags) {
        const elements = Array.from(document.querySelectorAll(tag)) as HTMLElement[];
        const el = elements.find(e => (e.textContent || '').toLowerCase().includes('instruction details'));
        if (el) {
          const clickable = el.closest('td, li, [onclick], a') as HTMLElement || el;
          ['mousedown', 'click', 'mouseup'].forEach(type => {
            clickable.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
          });
          clickable.click();
          // Also click the inner anchor if present.
          const inner = clickable.querySelector('a');
          if (inner) {
            inner.click();
            ['mousedown', 'click', 'mouseup'].forEach(type => {
              inner.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
            });
          }
          return `Clicked Instruction Details tab via <${clickable.tagName}> text=${clickable.textContent?.trim().slice(0, 40)}`;
        }
      }
      return 'Instruction Details tab not found';
    });
    console.log('visitSiInstructionDetails:', result);
    await this.page.waitForTimeout(2000);
  }

  async logSiFreqState(): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    const state = await finwFrame.locator('select:visible').evaluateAll(els =>
      (els as HTMLSelectElement[]).map(s => ({
        id: s.id,
        name: s.name,
        value: s.value,
        selectedText: s.options[s.selectedIndex]?.text || ''
      }))
    );
    console.log('[SI FREQ STATE]', JSON.stringify(state));
  }

  async logSiPartTranState(): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    const state = await finwFrame.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr')).map(tr => ({
        text: tr.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) || '',
        inputs: Array.from(tr.querySelectorAll('input, select')).map((e) => ({
          id: (e as HTMLInputElement).id,
          name: (e as HTMLInputElement).name,
          value: (e as HTMLInputElement).value,
          type: (e as HTMLInputElement).type,
        })),
      }));
      return rows.filter(r => r.text.toLowerCase().includes('debit') || r.text.toLowerCase().includes('credit') || r.text.toLowerCase().includes('amount'));
    });
    console.log('[SI PART-TRAN STATE]', JSON.stringify(state));
  }

  async logSiButtons(): Promise<void> {
    const all: any[] = [];
    for (const frame of this.page.frames()) {
      try {
        const info = await frame.evaluate(() => {
          const re = /(?<![a-z])add(?![a-z])/i;
          const list = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], input[type="image"], button, a, [onclick], [role="button"], img, span, div, td')) as HTMLElement[];
          return list
            .filter(el => {
              if (el.closest('script, style, noscript')) return false;
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return false;
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden') return false;
              const attrs = [
                el.id,
                (el as HTMLInputElement).name,
                (el as HTMLInputElement).value,
                el.getAttribute('value'),
                el.getAttribute('alt'),
                el.getAttribute('title'),
                el.getAttribute('aria-label'),
                el.getAttribute('src'),
                el.getAttribute('onclick'),
                el.className,
                el.textContent
              ].join(' ').toLowerCase();
              return re.test(attrs);
            })
            .map(el => ({
              tag: el.tagName,
              id: el.id,
              name: (el as HTMLInputElement).name,
              value: (el as HTMLInputElement).value,
              type: (el as HTMLInputElement).type,
              alt: el.getAttribute('alt'),
              title: el.getAttribute('title'),
              src: el.getAttribute('src'),
              onclick: el.getAttribute('onclick'),
              className: el.className,
              text: (el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || '')
            }));
        });
        all.push(...info);
      } catch (e) { /* ignore cross-origin / detached frames */ }
    }
    console.log('[SI ADD-BUTTON CANDIDATES]', JSON.stringify(all));
  }

  async clickSiAddPartTran(): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    const add = finwFrame.locator('#subsim_AddNew, input[name="subsim_AddNew"], input[type="button"][value="Add"]').first();
    try {
      if (await add.count() > 0 && await add.isVisible().catch(() => false)) {
        await add.click({ timeout: 15000 });
        console.log('clickSiAddPartTran: Clicked #subsim_AddNew');
        await this.page.waitForTimeout(2000);
        return;
      }
    } catch (e) { console.log('clickSiAddPartTran direct locator failed:', e); }

    // Fallback: search all frames for any visible Add control.
    for (const frame of this.page.frames()) {
      try {
        const result = await frame.evaluate(() => {
          const re = /(?<![a-z])add(?![a-z])/i;
          const list = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], input[type="image"], button, a, [onclick], [role="button"], img, span, div, td')) as HTMLElement[];
          const el = list.find(e => {
            if (e.closest('script, style, noscript')) return false;
            const rect = e.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            const style = window.getComputedStyle(e);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const attrs = [
              e.id,
              (e as HTMLInputElement).name,
              (e as HTMLInputElement).value,
              e.getAttribute('value'),
              e.getAttribute('alt'),
              e.getAttribute('title'),
              e.getAttribute('aria-label'),
              e.getAttribute('src'),
              e.getAttribute('onclick'),
              e.className,
              e.textContent
            ].join(' ').toLowerCase();
            return re.test(attrs);
          });
          if (el) {
            el.click();
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return `Clicked Add part-tran via <${el.tagName}> id=${el.id} class=${el.className} src=${el.getAttribute('src')}`;
          }
          return null;
        });
        if (result) {
          console.log('clickSiAddPartTran:', result);
          await this.page.waitForTimeout(2000);
          return;
        }
      } catch (e) { /* ignore cross-origin / detached frames */ }
    }
    console.log('clickSiAddPartTran: Add part-tran button not found in any frame');
  }

  async removeSiRequiredValidation(): Promise<void> {
    const finwFrame = this.getSiFinwFrame();
    const result = await finwFrame.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea')) as HTMLElement[];
      let count = 0;
      inputs.forEach(el => {
        const input = el as HTMLInputElement;
        if (input.hasAttribute('required')) { input.removeAttribute('required'); count++; }
        if (el.getAttribute('aria-required') === 'true') { el.removeAttribute('aria-required'); count++; }
      });
      return `Removed required from ${count} element(s)`;
    });
    console.log('removeSiRequiredValidation:', result);
    await this.page.waitForTimeout(500);
  }

  async getGeneratedSiNumber(): Promise<string | null> {
    // First try the status/alert text, which usually contains the success phrase.
    const status = await this.getStatusMessage();
    const statusMatch = status?.match(/\b(NU\d{3,})\b/);
    if (statusMatch) return statusMatch[1].trim();

    // Fall back to scanning page text, but only accept an SI number that
    // appears near an "added"/"successfully" message to avoid matching existing
    // inquiry rows.
    for (const p of this.page.context().pages()) {
      if (p.isClosed()) continue;
      for (const frame of p.frames()) {
        const body = await frame.locator('body').innerText().catch(() => '');
        const text = body.replace(/\s+/g, ' ');
        const addedContext = /(?:added|created|generated|successfully)/i.test(text);
        if (!addedContext) continue;
        const match = text.match(/Standing\s+Instruction#?\s*([A-Z]{2,}\d{3,})/i) ||
                      text.match(/SI\s*(?:Serial|Number|No|#)?\s*[:=]?\s*([A-Z]{2,}\d{3,})/i) ||
                      text.match(/\b(NU\d{3,})\b/);
        if (match) return match[1].trim();
      }
    }
    return null;
  }

}
