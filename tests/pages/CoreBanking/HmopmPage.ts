import { Page } from '@playwright/test';
import * as fs from 'fs';
import { AccountPage } from './AccountPage';

/**
 * HMOPM (Modify Office Parameters / Menu Option Maintenance) page wrapper.
 * Provides strict, label-based helpers to modify a Menu Option ID.
 */
export class HmopmPage extends AccountPage {
  constructor(page: Page) {
    super(page);
  }

  async getBodyText(): Promise<string> {
    try {
      const finwFrame = this.getFinwFrame();
      return (await finwFrame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }

  /** Dumps the FINW frame HTML for offline diagnosis. */
  async dumpFinwHtml(filename: string): Promise<void> {
    try {
      const finwFrame = this.getFinwFrame();
      const html = await finwFrame.locator('html').innerHTML().catch(() => '');
      fs.writeFileSync(filename, html, 'utf8');
      console.log(`Dumped FINW HTML to ${filename}`);
    } catch (e) {
      console.log(`Failed to dump FINW HTML: ${e}`);
    }
  }

  /**
   * Generic label-based setter for HMOPM fields. It finds the nearest label,
   * then sets the corresponding radio, select or text input.
   */
  private async setFieldByLabel(label: string, value: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const result = await finwFrame.evaluate(
      ({ labelText, fieldValue }) => {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const target = norm(labelText);
        const valueLower = fieldValue.toLowerCase();

        const all = Array.from(document.querySelectorAll('td, th, label, span, div, li'));
        const labelEl = all.find((el) => {
          const t = norm((el.textContent || '').trim());
          return t === target || t.startsWith(target) || t.startsWith(target + '*') || t.startsWith(target + ':');
        }) as HTMLElement | undefined;

        if (!labelEl) return { ok: false, reason: 'label not found' };

        const container =
          labelEl.closest('tr') ||
          labelEl.closest('td') ||
          labelEl.closest('div') ||
          labelEl.parentElement;
        if (!container) return { ok: false, reason: 'no container' };

        // 1. Radio group in the same container
        const radios = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
        if (radios.length > 0) {
          const map = { yes: ['yes', 'y'], no: ['no', 'n'], y: ['y', 'yes'], n: ['n', 'no'] };
          const candidates = (map as Record<string, string[]>)[valueLower] || [valueLower];
          const match =
            radios.find((r) => candidates.includes(r.value.toLowerCase())) ||
            radios.find((r) => {
              const radioLabel =
                (r.labels && r.labels[0] && r.labels[0].textContent) ||
                (r.nextElementSibling && r.nextElementSibling.textContent) ||
                (r.previousElementSibling && r.previousElementSibling.textContent) ||
                '';
              return candidates.includes(radioLabel.trim().toLowerCase());
            });
          if (match) {
            match.checked = true;
            match.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            match.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, type: 'radio', value: match.value };
          }
          return { ok: false, reason: 'radio not matched' };
        }

        // 2. Select in the same container
        const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
        for (const s of selects) {
          const opt = Array.from(s.options).find(
            (o) =>
              o.value.toLowerCase() === valueLower ||
              o.text.toLowerCase().trim() === valueLower ||
              o.text.toLowerCase().trim().includes(valueLower)
          );
          if (opt) {
            s.value = opt.value;
            s.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, type: 'select', value: opt.value };
          }
        }

        // 3. Text/number input in the same container
        const inputs = Array.from(
          container.querySelectorAll('input[type="text"], input[type="number"], input:not([type]), textarea')
        ) as (HTMLInputElement | HTMLTextAreaElement)[];
        const input = inputs.find((i) => !(i as HTMLInputElement).disabled && !(i as HTMLInputElement).readOnly) || inputs[0];
        if (input) {
          input.value = fieldValue;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
          return { ok: true, type: input.tagName.toLowerCase() };
        }

        return { ok: false, reason: 'no editable control found' };
      },
      { labelText: label, fieldValue: value }
    );

    console.log(`setFieldByLabel("${label}", "${value}"): ${JSON.stringify(result)}`);
    return result.ok;
  }

  /**
   * Fills the first input found in a table column whose header text matches the
   * given header. Set mustBeEmpty to true to target a blank row (useful when a
   * new row is added to a grid).
   */
  private async setFirstGridInputByHeader(
    header: string,
    value: string,
    mustBeEmpty = false
  ): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const ok = await finwFrame.evaluate(
      ({ headerText, fieldValue, onlyEmpty }) => {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const target = norm(headerText);

        const tables = Array.from(document.querySelectorAll('table'));
        for (const table of tables) {
          const headerCells = Array.from(table.querySelectorAll('th, td'));
          for (const cell of headerCells) {
            if (norm((cell as HTMLElement).textContent || '').trim() !== target) continue;
            const colIdx = (cell as HTMLTableCellElement).cellIndex;

            const inputs = Array.from(
              table.querySelectorAll('input[type="text"], input[type="number"], input:not([type])')
            ) as HTMLInputElement[];
            const matches = inputs.filter((input) => {
              const td = input.closest('td') as HTMLTableCellElement | null;
              if (!td) return false;
              if (td.cellIndex !== colIdx) return false;
              return !onlyEmpty || input.value.trim() === '';
            });

            if (matches.length > 0) {
              const targetInput = matches[0];
              targetInput.value = fieldValue;
              targetInput.dispatchEvent(new Event('input', { bubbles: true }));
              targetInput.dispatchEvent(new Event('change', { bubbles: true }));
              targetInput.blur();
              return true;
            }
          }
        }
        return false;
      },
      { headerText: header, fieldValue: value, onlyEmpty: mustBeEmpty }
    );

    console.log(`setFirstGridInputByHeader("${header}", "${value}", empty=${mustBeEmpty}): ${ok}`);
    return ok;
  }

  /** Enters the Menu Option ID on the HMOPM criteria screen. */
  async enterMenuOptionId(id: string): Promise<boolean> {
    const byId = await this.setTextByCandidates(
      ['menuOptionId', 'menuOptId', 'mnuOptId', 'mnuOptionId', 'menuId', 'optId'],
      id,
      'Menu Option ID'
    );
    if (byId) return true;

    const byLabel =
      (await this.fillByLabel('Menu Option ID', id)) ||
      (await this.fillByLabel('Menu Option Id', id)) ||
      (await this.fillByLabel('Menu Option', id)) ||
      (await this.fillByLabel('Menu ID', id)) ||
      (await this.fillByLabel('Menu', id));
    return byLabel;
  }

  /** Selects the General tab and sets Log Operation Menu = Yes and DB Status = Y. */
  async visitGeneralTab(): Promise<void> {
    await this.visitTab('General');
  }

  async setLogOperationMenu(value: 'Yes' | 'No'): Promise<boolean> {
    return (
      (await this.setFieldByLabel('Log Operation on Menu', value)) ||
      (await this.setFieldByLabel('Log Operation', value)) ||
      (await this.setFieldByLabel('Log Operation Menu', value))
    );
  }

  async setDbStatus(value: 'Y' | 'N' | 'Yes' | 'No'): Promise<boolean> {
    const v = value === 'Yes' ? 'Y' : value === 'No' ? 'N' : value;
    return (
      (await this.setTextByCandidates(
        ['dbStatus', 'databaseStatus', 'mopmgenDbStatus'],
        v,
        'DB Status'
      )) ||
      (await this.fillByLabel('DB Status', v))
    );
  }

  /** Navigates to the Work Class tab and sets Work Class Power Low. */
  async visitWorkClassTab(): Promise<void> {
    await this.visitTab('Work Class');
  }

  /**
   * Opens the work class reference lookup for the first Low row and selects the
   * first code from the popup. This is more reliable than hard-coding a work
   * class code that may not be defined in the environment.
   */
  private async selectFirstWorkClassLowCode(): Promise<string | null> {
    try {
      const finwFrame = this.getFinwFrame();
      const [popup] = await Promise.all([
        this.page.waitForEvent('popup', { timeout: 15000 }),
        finwFrame.evaluate(() => {
          const inputs = document.getElementsByName('mopmwrk.arrWrkClsLowCode') as unknown as HTMLCollectionOf<HTMLInputElement>;
          const descs = document.getElementsByName('mopmwrk.arrWrkClsLowDesc') as unknown as HTMLCollectionOf<HTMLInputElement>;
          if (inputs.length === 0 || !window || !(window as any).showRefCode) return false;
          (window as any).showRefCode(inputs[0], '29', 'N', 'F', descs[0] || null);
          return true;
        }),
      ]);
      await popup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await this.page.waitForTimeout(3000);
      const url = popup.url();
      const popupBody = await popup.locator('body').innerText().catch(() => '');
      console.log(`Work class popup URL: ${url}`);
      console.log(`Work class popup body (preview): ${popupBody.replace(/\s+/g, ' ').trim().slice(0, 400)}`);
      const firstLink = popup.locator('table a, a[href*="select"], a').first();
      if ((await firstLink.count()) === 0) {
        const html = await popup.locator('html').innerHTML().catch(() => '');
        fs.writeFileSync('data/hmopm-workclass-popup.html', html, 'utf8');
        console.log('Dumped work class popup HTML to data/hmopm-workclass-popup.html');
        await popup.close().catch(() => {});
        return null;
      }
      const code = await firstLink.innerText().catch(() => '');
      if (code) await firstLink.click();
      await this.page.waitForTimeout(2000);
      return code;
    } catch (e) {
      console.log(`Work class reference lookup failed: ${e}`);
      return null;
    }
  }

  async setWorkClassPowerLow(value: string): Promise<boolean> {
    const refCode = await this.selectFirstWorkClassLowCode();
    if (refCode) {
      console.log(`setWorkClassPowerLow selected reference code: ${refCode}`);
      return true;
    }
    return (
      (await this.setFirstGridInputByHeader('Low', value)) ||
      (await this.setFirstGridInputByHeader('Work Class Power Low', value)) ||
      (await this.setTextByCandidates(
        ['workClassPowerLow', 'workClassPwrLow', 'wcPwrLow', 'wcPowerLow', 'workClassLow'],
        value,
        'Work Class Power Low'
      ))
    );
  }

  /** Navigates to the Parent Menu tab and adds a new parent menu id. */
  async visitParentMenuTab(): Promise<void> {
    await this.visitTab('Parent Menu');
  }

  async addParentMenuId(menuId: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();

    // If the menu id is already in the parent menu grid, no need to add again.
    const alreadyPresent = await finwFrame.evaluate(({ id }) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])')) as HTMLInputElement[];
      return inputs.some((i) => i.value.trim().toUpperCase() === id.toUpperCase());
    }, { id: menuId });

    if (alreadyPresent) {
      console.log(`Parent Menu ID ${menuId} already present, skipping add`);
      return true;
    }

    // If the screen requires clicking an Add button to reveal the entry row, do it first.
    const addBtn = finwFrame
      .locator(
        'input[value="Add" i], input[type="button"][value="Add"], button:has-text("Add"), a:has-text("Add")'
      )
      .first();
    if ((await addBtn.count()) > 0 && (await addBtn.isVisible().catch(() => false))) {
      await addBtn.click({ timeout: 15000, force: true });
      await this.page.waitForTimeout(2000);
    }

    return (
      (await this.setFirstGridInputByHeader('Menu ID', menuId, true)) ||
      (await this.setFirstGridInputByHeader('Menu Id', menuId, true)) ||
      (await this.setFirstGridInputByHeader('Parent Menu ID', menuId, true)) ||
      (await this.setFieldByLabel('Parent Menu ID', menuId)) ||
      (await this.setFieldByLabel('Menu ID', menuId)) ||
      (await this.setTextByCandidates(
        ['parentMenuId', 'prntMenuId', 'prntMnuId', 'parentMnuId', 'menuId', 'mnuId'],
        menuId,
        'Parent Menu ID'
      ))
    );
  }

  /** Confirms the expected menu option id is present on the page (for assertions). */
  async isMenuOptionIdDisplayed(expected: string): Promise<boolean> {
    const text = await this.getBodyText();
    return text.toLowerCase().includes(expected.toLowerCase());
  }
}
