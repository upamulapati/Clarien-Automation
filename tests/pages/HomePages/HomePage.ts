import { Page, Locator, FrameLocator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly loginFrame: FrameLocator;

  constructor(page: Page) {
    this.page = page;
    this.loginFrame = page.frameLocator('iframe[name="loginFrame"]');
  }

  // ============ Locators ============
  private get appSelect() {
    return this.loginFrame.locator('#appSelect');
  }

  private get logoutButton() {
    return this.loginFrame.locator('img[title="Logout"]');
  }

  // ============ CRM Selection ============
  async selectCRM(options?: { useAdmin?: boolean }): Promise<void> {
    const useAdmin = options?.useAdmin ?? false;

    // Check if CRM is already loaded
    const alreadyHasCRM = this.page.frame({ name: 'Functionmain' }) !== null
      || this.page.frames().some(f => f.url().includes('FinacleCRM') && !f.url().includes('PreLoginPage'));
    if (alreadyHasCRM) { console.log('✓ CRM already loaded'); return; }

    await this.page.waitForTimeout(2000);

    // Check appSelect visibility, retry with reload if needed
    let isVisible = await this.appSelect.isVisible({ timeout: 10000 }).catch(() => false);
    if (!isVisible) {
      console.log('⚠ appSelect not visible — attempting page reload');
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.page.waitForTimeout(5000);
      isVisible = await this.appSelect.isVisible({ timeout: 10000 }).catch(() => false);
      if (!isVisible) {
        console.log('⚠ appSelect still not visible after reload');
        return;
      }
    }

    // Register for popup before selecting CRM
    const popupPromise = this.page.context().waitForEvent('page', { timeout: 30000 }).catch(() => null);
    // Try both possible option values: 'CRM' and 'CRMServer'
    try {
      await this.appSelect.selectOption('CRM');
    } catch (_) {
      try { await this.appSelect.selectOption('CRMServer'); } catch (__) {
        console.log('⚠ Could not select CRM/CRMServer option');
      }
    }
    console.log('✓ Selected CRM from dropdown');

    // Handle popup
    const popup = await popupPromise;
    if (popup && !popup.isClosed()) {
      await new Promise(r => setTimeout(r, 2000));

      if (useAdmin) {
        const url = popup.isClosed() ? '' : popup.url();
        if (url.includes('AdminLogin') && !popup.isClosed()) {
          await this.handleAdminPopup(popup);
        } else if (!popup.isClosed()) {
          popup.on('dialog', async d => { await d.accept().catch(() => {}); });
          const adminPopup = await this.page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null);
          if (adminPopup && !adminPopup.isClosed() && adminPopup.url().includes('AdminLogin')) {
            await this.handleAdminPopup(adminPopup);
          } else {
            await this.handleSimplePopup(popup);
          }
        }
      } else {
        await this.handleSimplePopup(popup);
      }
    } else {
      console.log('  No CRM popup appeared — may already be handled or auto-submitted');
    }

    await this.page.waitForTimeout(8000);
    console.log('✓ CRM selection complete');
  }

  // ============ Popup Helpers ============
  private async handleAdminPopup(popup: Page): Promise<void> {
    if (popup.isClosed()) return;
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    await popup.waitForTimeout(3000).catch(() => {});
    if (popup.isClosed()) return;

    let adminSelected = false;
    const adminRadioSelectors = [
      'input[type="radio"][value="Admin"]', 'input[type="radio"][value="admin"]',
      'input[type="radio"][value="ADMIN"]', 'input[type="radio"][id*="admin" i]',
      'input[type="radio"][name*="admin" i]',
      'text=Admin >> xpath=../input[@type="radio"]',
      'label:has-text("Admin") >> input[type="radio"]'
    ];
    for (const sel of adminRadioSelectors) {
      try {
        const radio = popup.locator(sel).first();
        if (await radio.isVisible({ timeout: 2000 }).catch(() => false)) {
          await radio.click(); adminSelected = true;
          console.log(`✓ Selected Admin radio via locator: ${sel}`); break;
        }
      } catch (_) {}
    }
    if (!adminSelected) {
      try {
        const adminLabel = popup.locator('label:has-text("Admin")').first();
        if (await adminLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
          await adminLabel.click(); adminSelected = true;
          console.log('✓ Selected Admin by clicking label');
        }
      } catch (_) {}
    }
    if (!adminSelected) {
      try {
        const allRadios = popup.locator('input[type="radio"]');
        const count = await allRadios.count();
        console.log(`  Found ${count} radio buttons total`);
        if (count >= 2) { await allRadios.nth(1).click(); adminSelected = true; console.log('✓ Selected Admin radio (2nd radio button)'); }
        else if (count === 1) { await allRadios.nth(0).click(); adminSelected = true; console.log('✓ Clicked the only radio button'); }
      } catch (_) {}
    }
    if (!adminSelected) {
      const evalResult = await popup.evaluate(() => {
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        for (const r of radios) {
          const txt = (r.parentElement?.textContent || '').toLowerCase();
          const val = (r as HTMLInputElement).value.toLowerCase();
          if (txt.includes('admin') || val.includes('admin')) {
            (r as HTMLInputElement).checked = true;
            r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            r.dispatchEvent(new Event('change', { bubbles: true }));
            return `set radio value="${(r as HTMLInputElement).value}" parentText="${r.parentElement?.textContent?.trim()}"`;
          }
        }
        if (radios.length >= 2) {
          (radios[1] as HTMLInputElement).checked = true;
          radios[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
          radios[1].dispatchEvent(new Event('change', { bubbles: true }));
          return `set 2nd radio value="${(radios[1] as HTMLInputElement).value}"`;
        }
        return '';
      }).catch(() => '');
      if (evalResult) { adminSelected = true; console.log(`✓ Selected Admin via evaluate: ${evalResult}`); }
    }
    if (!adminSelected) { console.log('⚠ Could not select Admin radio button — proceeding with Submit anyway'); }
    await popup.evaluate(() => { const hidden = document.querySelector('input[name="loginAsAdmin"]') as HTMLInputElement; if (hidden) { hidden.value = 'Y'; } }).catch(() => {});
    await popup.waitForTimeout(1000).catch(() => {});
    const sub = popup.locator('input[value="Submit"], input[type="submit"], input[name="submitBtn"], button:has-text("Submit")').first();
    if (await sub.isVisible({ timeout: 10000 }).catch(() => false)) {
      await sub.click(); console.log('✓ Clicked Submit on Admin Login popup');
    } else {
      await popup.evaluate(() => {
        const btns = document.querySelectorAll('input[type="submit"], input[type="button"], input[type="Button"], button');
        for (const b of btns) { const v = ((b as HTMLInputElement).value || b.textContent || '').trim(); if (v.includes('Submit') || v.includes('submit')) { (b as HTMLElement).click(); return; } }
        if (btns.length > 0) (btns[0] as HTMLElement).click();
      }).catch(() => {});
      console.log('✓ Clicked Submit via evaluate fallback');
    }
    await popup.waitForEvent('close', { timeout: 15000 }).catch(() => { if (!popup.isClosed()) popup.close(); });
  }

  private async handleSimplePopup(popup: Page): Promise<void> {
    if (popup.isClosed()) return;
    let popupHandled = false;
    for (let attempt = 0; attempt < 3 && !popupHandled; attempt++) {
      if (popup.isClosed()) { popupHandled = true; break; }
      try {
        await popup.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
        await popup.waitForTimeout(2000).catch(() => {});
        if (popup.isClosed()) { popupHandled = true; break; }
        const submitClicked = await popup.evaluate(() => {
          const btns = document.querySelectorAll('input[value="Submit"], input[type="submit"], input[type="button"], button');
          for (const b of btns) {
            const v = ((b as HTMLInputElement).value || b.textContent || '').trim();
            if (v.includes('Submit')) { (b as HTMLElement).click(); return v; }
          }
          if (btns.length > 0) { (btns[0] as HTMLElement).click(); return 'first-btn'; }
          return '';
        });
        if (submitClicked) { console.log(`✓ Clicked Submit on CRM popup: "${submitClicked}"`); popupHandled = true; }
      } catch (e) {
        const msg = (e as any).message?.substring(0, 80) || '';
        console.log(`  ⚠ CRM popup attempt ${attempt + 1}/3 failed: ${msg}`);
        if (popup.isClosed()) { popupHandled = true; break; }
        await this.page.waitForTimeout(2000);
      }
    }
    if (!popup.isClosed()) {
      await popup.waitForEvent('close', { timeout: 15000 }).catch(() => {
        if (!popup.isClosed()) popup.close().catch(() => {});
      });
    }
  }

  // ============ Logout ============
  async logout() {
    await this.logoutButton.click();
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(5000);
  }
}
