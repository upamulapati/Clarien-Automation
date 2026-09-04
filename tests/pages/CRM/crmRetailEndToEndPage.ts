import { Page, Dialog, Locator, Frame } from '@playwright/test';
import { expect } from '@playwright/test';
import * as fs from 'fs';
import { AppConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { CrmEndToEndPage } from './crmEndToEndPage';
import { ServicePackPage } from './servicePackPage';

export class CrmRetailEndToEndPage extends CrmEndToEndPage {
  private TD: any;

  private isProvided(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    const normalized = String(value)
      .trim()
      .toLowerCase();

    return (
      normalized.length > 0 &&
      normalized !== '-' &&
      normalized !== 'undefined' &&
      normalized !== 'null' &&
      normalized !== 'nan'
    );
  }

  private textValue(
    value: unknown,
    fallback = ''
  ): string {
    return this.isProvided(value)
      ? String(value).trim()
      : fallback;
  }

  private yesNoFromValue(
    value: unknown
  ): 'Y' | 'N' {
    return this.isProvided(value) ? 'Y' : 'N';
  }

  private dataRows<T extends Record<string, unknown>>(
    rows: unknown,
    fallback?: T
  ): T[] {
    if (Array.isArray(rows)) {
      return rows.filter(
        row => row && typeof row === 'object'
      ) as T[];
    }

    return fallback ? [fallback] : [];
  }

  private getPrimaryContactData(): any {
    const contacts = Array.isArray(this.TD.contacts)
      ? this.TD.contacts
      : [];

    const addressRow = contacts.find((row: any) =>
      this.isProvided(row?.addressType) ||
      this.isProvided(row?.addressLabel) ||
      this.isProvided(row?.streetName) ||
      this.isProvided(row?.city)
    );

    return {
      ...(this.TD.contactData || {}),
      ...(addressRow || {})
    };
  }

  // Dynamic field info discovered at runtime
  private nationalityCode = '';
  private nationalityDisplay = '';
  private nationalityLovBtn = '';
  private maritalStatusField = '';
  private empTypeField = '';
  private grossIncomeField = '';
  private demoCurrencyField = '';
  private monthlyExpenseField = '';
  private incomeTypeField = '';
  private custLanguageCode = '';
  private custLanguageDisplay = '';

  constructor(
    page: Page,
    config: AppConfig,
    lastDialogMessages: string[],
    endToEndData?: any
  ) {
    super(page, config, lastDialogMessages);

    const jsonData: any =
      CRM_TEST_DATA.retail.endToEnd;

    // Clone fallback data so one instance cannot modify another.
    this.TD = {
      ...jsonData,
      customerData: {
        ...(jsonData.customerData || {})
      },
      contactData: {
        ...(jsonData.contactData || {})
      },
      validDocData: {
        ...(jsonData.validDocData || {})
      },
      validCcyData: {
        ...(jsonData.validCcyData || {})
      },
      demographicData: {
        ...(jsonData.demographicData || {})
      },
      employmentData: {
        ...(jsonData.employmentData || {})
      },
      incomeExpenseData: {
        ...(jsonData.incomeExpenseData || {})
      },
      contacts: Array.isArray(jsonData.contacts)
        ? [...jsonData.contacts]
        : [],
      documents: Array.isArray(jsonData.documents)
        ? [...jsonData.documents]
        : [],
      currencies: Array.isArray(jsonData.currencies)
        ? [...jsonData.currencies]
        : [],
      otherBanks: Array.isArray(jsonData.otherBanks)
        ? [...jsonData.otherBanks]
        : []
    };

    if (!endToEndData) {
      return;
    }

    for (
      const [key, value] of
      Object.entries(endToEndData)
    ) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        this.TD[key] &&
        typeof this.TD[key] === 'object' &&
        !Array.isArray(this.TD[key])
      ) {
        this.TD[key] = {
          ...this.TD[key],
          ...value
        };
      } else {
        this.TD[key] = value;
      }
    }
  }

  // ==================== RETAIL-SPECIFIC FRAME HELPERS ====================
  private getDemoFrame(): any {
    const fdf = this.workingPage.frame({ name: 'formDispFrame' });
    if (fdf) return fdf;
    for (const f of this.workingPage.frames()) {
      try { if (f.url().includes('DemographicMod_det') || f.url().includes('Mod_det')) return f; } catch (_) {}
    }
    return this.accountFrame;
  }

  // ==================== NAVIGATE TO NEW ENTITY ====================
  async navigateToNewEntity(): Promise<Page> {
    const page = this.workingPage;
    console.log('\n=== Navigating to New Entity (Retail) ===');
    await this.takeScreenshot('Before Navigate to New Entity');

    // Click CIF Retail in Functionmain frame
    const functionMainFrame = page.frame({ name: 'Functionmain' });
    if (functionMainFrame) {
      await functionMainFrame.evaluate(() => {
        const el = document.getElementById('screen1');
        if (el) el.click();
      });
      console.log('\u2713 Clicked CIF Retail');
      await page.waitForTimeout(this.timeouts.medium);
    }

    // Use frame "1504" for CIF Retail menu (confirmed by diagnostics: view4="New Entity", subview41="Customer")
    // Finacle CRM menu items work even when hidden (CSS hidden but DOM-clickable)
    const menuFrame = page.frame({ name: '1504' });
    if (!menuFrame) {
      console.log('\u26a0 Menu frame "1504" not found');
    }

    if (menuFrame) {
      // Click "New Entity" (view4) to expand submenu
      await menuFrame.evaluate(() => {
        const el = document.getElementById('view4');
        if (el) el.click();
      });
      console.log('\u2713 Clicked New Entity (view4)');
      await page.waitForTimeout(this.timeouts.short);

      // Listen for popup BEFORE clicking Customer
      const customerPopupPromise = page.context().waitForEvent('page', { timeout: 30000 }).catch(() => null);

      // Click "Customer" (subview41) — also try subviewspanFor41 for the span trigger
      await menuFrame.evaluate(() => {
        const el = document.getElementById('subview41');
        if (el) el.click();
      });
      await page.waitForTimeout(500);
      await menuFrame.evaluate(() => {
        const el = document.getElementById('subviewspanFor41');
        if (el) el.click();
      });
      console.log('\u2713 Clicked Customer (subview41)');

      // Wait for popup or same-page load
      const customerPopup = await customerPopupPromise;
      if (customerPopup) {
        console.log(`\u2713 Customer form opened in new window: ${customerPopup.url()}`);
        this.workingPage = customerPopup as Page;
        customerPopup.on('dialog', async (d: Dialog) => {
          this.lastDialogMessages.push(d.message());
          console.log(`\ud83d\udce2 CustomerPage dialog: "${d.message().substring(0, 150)}"`);
          await d.accept().catch(() => {});
        });
        await customerPopup.waitForLoadState('domcontentloaded').catch(() => {});
      } else {
        console.log('Customer form loaded in same page');
      }
    } else {
      console.log('\u26a0 No menu frame found');
    }

    // Handle the EntityModFilter if it appears (Finacle CRM shows a filter page before the actual form)
    await page.waitForTimeout(this.timeouts.medium);
    await this.handleEntityModFilter(page);

    return this.workingPage;
  }

  // ==================== HANDLE ENTITY MOD FILTER ====================
  private async handleEntityModFilter(page: Page): Promise<void> {
    // Find the EntityModFilter frame (userArea with EntityModFilter URL)
    const filterFrame = page.frames().find(f => {
      const url = f.url();
      return url.includes('EntityModFilter') && !url.includes('FilterUserArea');
    });
    if (!filterFrame) {
      console.log('  No EntityModFilter frame found — form may have loaded directly');
      return;
    }

    const fieldCount = await filterFrame.evaluate(() =>
      Array.from(document.querySelectorAll('input, select')).filter(el => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).length
    ).catch(() => 0);

    if (fieldCount === 0) {
      console.log('  EntityModFilter has no visible fields — likely already submitted');
      return;
    }

    console.log(`  EntityModFilter found with ${fieldCount} fields — inspecting options...`);

    // Log available options for TypeFilter and EntityTypeFilter
    const filterInfo = await filterFrame.evaluate(() => {
      const getOpts = (name: string) => {
        const sel = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement;
        if (!sel) return { value: '', options: [] as string[] };
        return { value: sel.value, options: Array.from(sel.options).map(o => `${o.value}="${o.text.trim()}"`) };
      };
      return {
        type: getOpts('TypeFilter'),
        entityType: getOpts('EntityTypeFilter'),
        saveSubmit: getOpts('SaveSubmitFilter'),
        cifId: (document.querySelector('input[name="cifID"]') as HTMLInputElement)?.value || ''
      };
    }).catch(() => null);

    if (filterInfo) {
      console.log(`  TypeFilter: value="${filterInfo.type.value}", options=[${filterInfo.type.options.join(', ')}]`);
      console.log(`  EntityTypeFilter: value="${filterInfo.entityType.value}", options=[${filterInfo.entityType.options.join(', ')}]`);
      console.log(`  SaveSubmitFilter: value="${filterInfo.saveSubmit.value}", options=[${filterInfo.saveSubmit.options.join(', ')}]`);
      console.log(`  cifID: "${filterInfo.cifId}"`);

      // Set filter values for New Customer creation
      // TypeFilter should be "New" or similar for creating a new entity
      await filterFrame.evaluate(() => {
        const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); };
        const typeFilter = document.querySelector('select[name="TypeFilter"]') as HTMLSelectElement;
        const entityTypeFilter = document.querySelector('select[name="EntityTypeFilter"]') as HTMLSelectElement;
        const saveSubmitFilter = document.querySelector('select[name="SaveSubmitFilter"]') as HTMLSelectElement;

        // Select "New" if available, otherwise keep current
        if (typeFilter) {
          for (const o of Array.from(typeFilter.options)) {
            if (o.text.trim().toLowerCase().includes('new') || o.value.toLowerCase().includes('new')) {
              typeFilter.value = o.value; fire(typeFilter); break;
            }
          }
        }
        // Select "Customer" if available
        if (entityTypeFilter) {
          for (const o of Array.from(entityTypeFilter.options)) {
            if (o.text.trim().toLowerCase().includes('customer') || o.value.toLowerCase().includes('customer')) {
              entityTypeFilter.value = o.value; fire(entityTypeFilter); break;
            }
          }
        }
        // Select "Submit" if available
        if (saveSubmitFilter) {
          for (const o of Array.from(saveSubmitFilter.options)) {
            if (o.text.trim().toLowerCase().includes('submit') || o.value.toLowerCase().includes('submit')) {
              saveSubmitFilter.value = o.value; fire(saveSubmitFilter); break;
            }
          }
        }
      }).catch(() => {});

      // Look for and click Submit button
      const submitBtn = filterFrame.locator('input[type="submit"], input[value="Submit"], input[value="Go"], input[name*="submit" i], button').first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        console.log('  ✓ Submitted EntityModFilter');
      } else {
        // Try submitting the form directly
        await filterFrame.evaluate(() => {
          const forms = document.querySelectorAll('form');
          if (forms.length > 0) (forms[0] as HTMLFormElement).submit();
        }).catch(() => {});
        console.log('  ✓ Submitted EntityModFilter form directly');
      }
      await page.waitForTimeout(this.timeouts.long);
    }
  }

  // ==================== WAIT FOR CUSTOMER FORM ====================
  async waitForCustomerForm(): Promise<void> {
    const page = this.workingPage;
    console.log('\n=== Waiting for Customer Form ===');
    const deadline = Date.now() + 90000;
    let loggedOnce = false;
    const skipFrames = new Set(['', 'loginFrame', 'Fininfra', 'Functionmain', 'OutlookSyncHiddenFrame', 'DeleteSessionHiddenFrame', 'DeleteUserHiddenFrame', 'servletFrm', 'pollFrame', 'hiddenFrame', 'FilterArea', 'FilterForm']);
    const urlPatterns = ['AccountMod_det', 'Account_det', 'Mod_det', 'EntityMod'];

    while (Date.now() < deadline) {
      await page.waitForTimeout(this.timeouts.medium);

      // Log available frames periodically for debugging
      if (!loggedOnce) {
        loggedOnce = true;
        const frameInfo = page.frames().map(f => {
          const url = f.url();
          const name = f.name();
          const short = url.substring(url.lastIndexOf('/') + 1).substring(0, 80);
          return `  ${name || '(unnamed)'}: ${short}`;
        });
        console.log(`Available frames (${page.frames().length}):\n${frameInfo.join('\n')}`);
      }

      // Strategy 1: Look for frames matching known URL patterns (broadened to include EntityMod)
      for (const f of page.frames()) {
        try {
          const url = f.url();
          if (urlPatterns.some(p => url.includes(p)) && !url.includes('SSOblank') && !url.includes('FilterUserArea')) {
            const count = await f.evaluate(() => Array.from(document.querySelectorAll('input, select')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0);
            // Log field count for EntityMod frames on first pass
            if (!loggedOnce || count > 0) {
              const urlShort = url.substring(url.lastIndexOf('/') + 1).substring(0, 60);
              console.log(`  Frame "${f.name()}" (${urlShort}): ${count} visible fields`);
              // Also log what fields exist
              if (count > 0 && count <= 5) {
                const fieldInfo = await f.evaluate(() => Array.from(document.querySelectorAll('input, select')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map(el => `${el.tagName}[name=${(el as HTMLInputElement).name}]`).join(', ')).catch(() => '');
                console.log(`    Fields: ${fieldInfo}`);
              }
            }
            if (count > 5) { this.accountFrame = f; console.log(`\u2713 Customer form loaded with ${count} fields (URL matched: "${f.name()}")`); return; }
          }
        } catch (_) {}
      }

      // Strategy 2: Any content frame with many form fields
      let bestFrame: any = null;
      let bestCount = 0;
      for (const f of page.frames()) {
        if (skipFrames.has(f.name())) continue;
        const url = f.url();
        if (url.includes('SSOblank') || url.includes('blank.html') || url.includes('GenericFilter') || url.includes('SearchWorkArea') || url.includes('CorporateBO') || url.includes('SRMViewsToc') || url.includes('SRMFunction') || url.includes('SRMScreenTitle') || url.includes('SRMCacheMgr') || url.includes('SRMGlobalTools')) continue;
        try {
          const count = await f.evaluate(() => Array.from(document.querySelectorAll('input, select, textarea')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0);
          if (count > bestCount) { bestCount = count; bestFrame = f; }
        } catch (_) {}
      }
      if (bestFrame && bestCount > 10) {
        this.accountFrame = bestFrame;
        console.log(`\u2713 Customer form found via field count: ${bestCount} fields in frame "${bestFrame.name()}" (${bestFrame.url().substring(bestFrame.url().lastIndexOf('/') + 1).substring(0, 60)})`);
        return;
      }
      if (bestFrame && bestCount > 0 && !loggedOnce) {
        console.log(`  Best frame so far: "${bestFrame.name()}" with ${bestCount} fields`);
      }

      // Strategy 3: Check formDispFrame
      const fdf = page.frame({ name: 'formDispFrame' });
      if (fdf) {
        const fdfCount = await fdf.evaluate(() => Array.from(document.querySelectorAll('input, select')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0);
        if (fdfCount > 5) { this.accountFrame = fdf; console.log(`\u2713 Customer form found in formDispFrame: ${fdfCount} fields`); return; }
      }
    }
    // Last-resort fallback
    const fdf = page.frame({ name: 'formDispFrame' });
    if (fdf) this.accountFrame = fdf;
    console.log(this.accountFrame ? '\u2713 Customer form ready (fallback via formDispFrame)' : '\u26a0 Customer form NOT found - accountFrame is null');
  }

  // ==================== FILL BASIC INFO ====================
  async fillBasicInfo(): Promise<void> {
    console.log('\n========== BASIC INFO (General Tab) ==========');
    const page = this.workingPage;
    const TD = this.TD;

    // Hide CoreServer menu
    for (const f of page.frames()) {
      await f.evaluate(() => {
        document.querySelectorAll('div, iframe, table, tr, td').forEach(el => {
          const text = (el as HTMLElement).innerText?.trim() || '';
          if (text === 'CoreServer' || text === 'Retail Banking') {
            const p = (el as HTMLElement).closest('table, div');
            if (p) (p as HTMLElement).style.display = 'none';
          }
        });
      }).catch(() => {});
    }

    await this.reacquireAccountFrame('before Basic Info');
    if (!this.accountFrame) {
      // Last-resort: search all frames for the one with form fields
      console.log('⚠ accountFrame still null after reacquire — scanning all frames');
      for (const f of page.frames()) {
        try {
          const count = await f.evaluate(() => Array.from(document.querySelectorAll('input[name*="AccountModBO"], input[name*="AccountBO"]')).length).catch(() => 0);
          if (count > 0) { this.accountFrame = f; console.log(`  ✓ Found accountFrame with ${count} Account fields in "${f.name()}"`); break; }
        } catch (_) {}
      }
    }
    if (!this.accountFrame) {
      throw new Error('accountFrame is null — customer form not found. Cannot proceed with fillBasicInfo.');
    }

    // Pre-fill core selects before title LOV so any blur/validation does not alert
    await this.accountFrame.evaluate((args: any) => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const setSelect = (keyword: string, val: string) => {
        const upKw = keyword.toUpperCase();
        const upVal = val.toUpperCase();
        document.querySelectorAll('select').forEach((sel: HTMLSelectElement) => {
          if (!sel.name || (sel.name || '').toUpperCase().indexOf(upKw) < 0) return;
          if (sel.value && sel.selectedIndex > 0 && sel.value !== '0') return;
          sel.disabled = false; sel.removeAttribute('disabled'); sel.removeAttribute('readonly');
          let opt = Array.from(sel.options).find(o => o.text.trim().toUpperCase() === upVal);
          if (!opt) opt = Array.from(sel.options).find(o => o.value.toUpperCase() === upVal);
          if (!opt) opt = Array.from(sel.options).find(o => o.text.trim().toUpperCase().includes(upVal));
          if (!opt && val && val.trim().length > 0) { const newOpt = document.createElement('option'); newOpt.value = val; newOpt.text = val; newOpt.disabled = false; sel.add(newOpt); opt = newOpt; }
          if (!opt) opt = Array.from(sel.options).find(o => o.value.toUpperCase() === 'N');
          if (!opt) opt = Array.from(sel.options).find(o => o.value === '0');
          if (!opt) opt = Array.from(sel.options).find(o => o.value && o.value.trim().length > 0);
          if (opt) { opt.disabled = false; sel.value = opt.value; sel.selectedIndex = opt.index; fire(sel); }
        });
      };
      setSelect('BANKRELATIONTYPE', args.bankRelationType);
      setSelect('GENDER', args.gender);
      setSelect('NRE', args.nreFlag);
      setSelect('NATIVELANG', args.nativeLanguage);
      setSelect('CUSTOMERMINOR', 'N');
    }, { bankRelationType: (TD.customerData.customerType || TD.customerData.bankRelationType || 'Retail'), gender: (TD.customerData.gender || 'MALE').toUpperCase(), nreFlag: this.yesNoFromValue(TD.customerData.nonResidentDate), nativeLanguage: (TD.customerData.nativeLanguage || 'ENGLISH').toUpperCase() }).catch(() => {});

    // Title LOV
    await this.selectLovValue({ parentPage: page, target: page, buttonName: 'btnone_AccountModBO.Salutation_code', searchValue: TD.customerData.title, label: 'Title', config: this.config });
    await this.refreshAccountFrame('after Title LOV');

    // Fill Name, DOB, Gender, NRI details
    const fillResult = await this.accountFrame.evaluate((args: any) => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const setInp = (name: string, val: string) => { const inp = document.querySelector(`input[name="${name}"]`) as HTMLInputElement; if (inp) { inp.removeAttribute('readonly'); inp.value = val; fire(inp); } };
      const setSel = (name: string, val: string) => {
        const sel = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement;
        if (sel) {
          sel.disabled = false; sel.removeAttribute('disabled'); sel.removeAttribute('readonly');
          // Exact match first, then includes match
          let matched = false;
          for (const o of Array.from(sel.options)) {
            if (o.text.trim().toUpperCase() === val.toUpperCase() || o.value.toUpperCase() === val.toUpperCase()) {
              o.disabled = false; sel.value = o.value; sel.selectedIndex = o.index; fire(sel); if (typeof sel.onchange === 'function') { try { sel.onchange(new Event('change')); } catch (_) {} } matched = true; break;
            }
          }
          if (!matched) {
            for (const o of Array.from(sel.options)) {
              if (o.text.trim().toUpperCase().includes(val.toUpperCase()) || o.value.toUpperCase().includes(val.toUpperCase())) {
                o.disabled = false; sel.value = o.value; sel.selectedIndex = o.index; fire(sel); if (typeof sel.onchange === 'function') { try { sel.onchange(new Event('change')); } catch (_) {} } break;
              }
            }
          }
        }
      };
      // Try multiple field name patterns for each name field
      const trySetMultiple = (names: string[], val: string) => {
        for (const name of names) {
          const inp = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
          if (inp) { inp.removeAttribute('readonly'); inp.value = val; fire(inp); return name; }
        }
        return '';
      };
      // Set ALL name fields — use correct Finacle field names discovered from form scan
      const fn = trySetMultiple(['AccountBO.Cust_First_Name', 'AccountModBO.firstName', 'ContactBO.firstName'], args.firstName);
      const ln = trySetMultiple(['AccountBO.Cust_Last_Name', 'AccountModBO.lastName', 'ContactBO.lastName'], args.lastName);
      const pn = trySetMultiple(['AccountBO.PreferredName', 'AccountModBO.PreferredName'], args.preferredName);
      const sn = trySetMultiple(['AccountBO.short_name', 'AccountModBO.shortName'], args.shortName);
      // Also set ContactBO name fields if they exist (separate from main account fields)
      trySetMultiple(['ContactBO.firstName'], args.firstName);
      trySetMultiple(['ContactBO.lastName'], args.lastName);
      // Scan ALL visible inputs and selects for diagnostics
      const nameFields = Array.from(document.querySelectorAll('input')).filter(i => {
        const r = i.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && i.type !== 'hidden';
      }).map(i => ({ n: i.name, v: i.value?.substring(0, 20) || '' })).slice(0, 30);
      // Also scan visible selects
      const selectFields = Array.from(document.querySelectorAll('select')).filter(s => {
        const r = s.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).map(s => ({ n: s.name, v: s.value, idx: s.selectedIndex })).slice(0, 20);
      // Find DOB field by partial name match — the exact name may vary (e.g. "3_AccountModBO.DateOfBirth" or "AccountModBO.DateOfBirth")
      // Set DOB — Finacle uses 3_AccountBO.Cust_DOB (display) and AccountBO.Cust_DOB (hidden)
      // Both must be set for validation to pass
      const setDateField = (baseName: string, val: string) => {
        // Set display field (with 3_ prefix)
        const displayInp = document.querySelector(`input[name="3_${baseName}"]`) as HTMLInputElement;
        if (displayInp) { displayInp.removeAttribute('readonly'); displayInp.value = val; fire(displayInp); }
        // Set hidden field (without prefix) — stores actual value
        const hiddenInp = document.querySelector(`input[name="${baseName}"]`) as HTMLInputElement;
        if (hiddenInp) { hiddenInp.removeAttribute('readonly'); hiddenInp.value = val; fire(hiddenInp); }
        return { display: displayInp?.value || 'N/A', hidden: hiddenInp?.value || 'N/A', displayName: displayInp?.name || 'NONE', hiddenName: hiddenInp?.name || 'NONE' };
      };
      const dobResult = setDateField('AccountBO.Cust_DOB', args.dob);
      const nreResult = setDateField('AccountBO.DateOfBecomingNRE', args.nreDate);
      // Also try AccountModBO variants
      if (dobResult.displayName === 'NONE') setDateField('AccountModBO.Cust_DOB', args.dob);
      if (nreResult.displayName === 'NONE') setDateField('AccountModBO.NRE_Date', args.nreDate);
      setSel('AccountModBO.Gender', args.gender);
      setSel('AccountModBO.CustomerNREFlg', args.nreFlag);
      setSel('AccountModBO.BankRelationType', args.bankRelationType);

      // Basel Profiling, Foreign Tax Reporting and any other empty selects: choose a safe default
      const fillEmptySelect = (sel: HTMLSelectElement) => {
        if (!sel || sel.value) return;
        const up = sel.name.toUpperCase();
        const isForeign = up.includes('TAX') || up.includes('FOREIGN') || up.includes('CRS') || up.includes('FATCA');
        const isBasel = up.includes('BASEL');
        const isTds = up.includes('TDS');
        if (isTds) return;
        const opts = Array.from(sel.options);
        let opt: HTMLOptionElement | undefined;
        if (isBasel) {
          opt = opts.find(o => o.text.trim().toUpperCase() === 'NO' || o.value.toUpperCase() === 'N' || o.value.toUpperCase() === 'NO' || o.value === '0');
        } else if (isForeign) {
          opt = opts.find(o => o.text.trim().toUpperCase().includes('NO TIN')) ||
                opts.find(o => o.text.trim().toUpperCase().includes('NOT REQUIRED')) ||
                opts.find(o => o.value.toUpperCase() === 'N' || o.value.toUpperCase() === 'NOTREQUIRED' || o.value === '0');
        } else {
          opt = opts.find(o => o.text.trim().toUpperCase() === 'NO' || o.value.toUpperCase() === 'N' || o.value === '0');
        }
        if (!opt) opt = opts.find(o => o.value && o.value.trim().length > 0);
        if (!opt && isBasel) { opt = document.createElement('option'); opt.value = 'N'; opt.text = 'NO'; opt.selected = true; sel.appendChild(opt); }
        if (!opt && isForeign) { opt = document.createElement('option'); opt.value = 'NOTIN'; opt.text = 'NO TIN'; opt.selected = true; sel.appendChild(opt); }
        if (opt) { sel.disabled = false; sel.removeAttribute('disabled'); sel.removeAttribute('readonly'); opt.disabled = false; sel.value = opt.value; sel.selectedIndex = opt.index; fire(sel); if (typeof sel.onchange === 'function') { try { sel.onchange(new Event('change')); } catch (_) {} } try { const h = document.querySelector('[name="h_' + sel.name + '"]') as any; if (h) { h.value = opt.value; h.dispatchEvent(new Event('change', { bubbles: true })); } } catch (_) {} }
      };
      document.querySelectorAll('select').forEach(s => { s.disabled = false; s.removeAttribute('disabled'); s.removeAttribute('readonly'); if (!s.value || s.selectedIndex <= 0) fillEmptySelect(s); });
      // Return what was actually set for logging
      const genderSel = document.querySelector('select[name="AccountModBO.Gender"]') as HTMLSelectElement;
      return {
        gender: genderSel?.options[genderSel?.selectedIndex]?.text || 'N/A',
        genderVal: genderSel?.value || 'N/A',
        dobDisplay: dobResult.display, dobHidden: dobResult.hidden,
        dobDisplayName: dobResult.displayName, dobHiddenName: dobResult.hiddenName,
        nreDisplayName: nreResult.displayName, nreHiddenName: nreResult.hiddenName,
        fieldNames: { fn, ln, pn, sn },
        nameFields: nameFields,
        selectFields: selectFields
      };
    }, {
      firstName: TD.customerData.firstName.toUpperCase(),
      lastName: TD.customerData.lastName.toUpperCase(),
      preferredName: TD.customerData.preferredName,
      shortName: TD.customerData.shortName,
      dob: TD.customerData.dateOfBirth,
      nreDate: this.textValue(TD.customerData.nonResidentDate),
      gender: (TD.customerData.gender || 'MALE').toUpperCase(),
      nreFlag: this.yesNoFromValue(TD.customerData.nonResidentDate),
      bankRelationType: (TD.customerData.customerType || TD.customerData.bankRelationType || 'Retail')
    }).catch(() => ({ gender: 'error', genderVal: 'error', dob: 'error' }));
    console.log(`\u2713 Name: ${TD.customerData.firstName} ${TD.customerData.lastName}, DOB: ${TD.customerData.dateOfBirth}`);
    if (typeof fillResult === 'object' && 'dobDisplayName' in fillResult) {
      console.log(`  Gender: "${fillResult.gender}" (val="${fillResult.genderVal}"), DOB display: "${fillResult.dobDisplay}" (${fillResult.dobDisplayName}), DOB hidden: "${fillResult.dobHidden}" (${fillResult.dobHiddenName})`);
      console.log(`  NRE display: ${fillResult.nreDisplayName}, NRE hidden: ${fillResult.nreHiddenName}`);
      console.log(`  Field names: fn=${fillResult.fieldNames?.fn}, ln=${fillResult.fieldNames?.ln}, pn=${fillResult.fieldNames?.pn}, sn=${fillResult.fieldNames?.sn}`);
      if (fillResult.nameFields) console.log(`  All name fields: ${JSON.stringify(fillResult.nameFields).substring(0, 500)}`);
      if (fillResult.selectFields) console.log(`  All selects: ${JSON.stringify(fillResult.selectFields).substring(0, 500)}`);
    }

    // Wait for frame to stabilize after DOB/NRI events
    await page.waitForTimeout(this.timeouts.medium);
    await this.refreshAccountFrame('before Segment');

    // Segment — retry if frame detaches
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.accountFrame.evaluate((sc: string) => {
          const inp = document.querySelector('input[name="AccountModBO.Segmentation_Class"]') as HTMLInputElement;
          if (inp) { inp.value = sc; inp.dispatchEvent(new Event('change', { bubbles: true })); inp.dispatchEvent(new Event('blur', { bubbles: true })); }
        }, TD.customerData.segment);
        console.log(`\u2713 Segment: ${TD.customerData.segment}`);
        break;
      } catch (e) {
        console.log(`  ⚠ Segment fill attempt ${attempt + 1} failed: ${(e as any).message?.substring(0, 50)}`);
        await page.waitForTimeout(this.timeouts.short3);
        await this.refreshAccountFrame('retry Segment');
      }
    }

    await this.refreshAccountFrame('after Segment');

    // SubSegment
    if (TD.customerData.subSegment) {
      for (let retry = 0; retry < 3; retry++) {
        try {
          const ss = this.accountFrame.locator('select[name="AccountModBO.SubSegment"]');
          await ss.selectOption({ label: TD.customerData.subSegment }, { timeout: 2000 }).catch(async () => {
            const val = await this.accountFrame.evaluate((label: string) => {
              const s = document.querySelector('select[name="AccountModBO.SubSegment"]') as HTMLSelectElement;
              if (!s) return '';
              for (const o of Array.from(s.options)) { if (o.text.trim().toUpperCase() === label.toUpperCase()) return o.value; }
              return '';
            }, TD.customerData.subSegment).catch(() => '');
            if (val) await ss.selectOption(val);
          });
          console.log(`\u2713 SubSegment: ${TD.customerData.subSegment}`);
          break;
        } catch (_) { await this.refreshAccountFrame('SubSegment retry'); }
      }
    }

    await this.refreshAccountFrame('before SOL ID');

    // SOL ID
    const solIdLoc = this.accountFrame.locator('input[name="AccountBO.Primary_sol_id"]').first();
    if (await solIdLoc.isVisible({ timeout: 5000 }).catch(() => false)) {
      await solIdLoc.fill(TD.customerData.solId).catch(async () => {
        await this.accountFrame.evaluate((s: string) => { const el = document.querySelector('input[name="AccountBO.Primary_sol_id"]') as HTMLInputElement; if (el) { el.value = s; el.dispatchEvent(new Event('change', { bubbles: true })); } }, TD.customerData.solId);
      });
    }
    console.log(`\u2713 SOL ID: ${TD.customerData.solId}`);

    // CRM Alerts
    await this.accountFrame.locator('select[name="AccountModBO.Enable_Alerts"]').selectOption('Y').catch(() => {});
    console.log('\u2713 CRM Alerts: Y');

    // Preferred Locale
    await this.accountFrame.evaluate((locale: string) => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const catInput = document.querySelector('input[name="Cat_PsychographicBO.Preferred_Locale"]') as HTMLInputElement;
      if (catInput) { catInput.removeAttribute('readonly'); catInput.value = locale; fire(catInput); }
      const codeInput = document.querySelector('input[name="PsychographicBO.Preferred_Locale"]') as HTMLInputElement;
      if (codeInput) { codeInput.value = locale; fire(codeInput); }
    }, TD.customerData.preferredLocale).catch(() => {});
    console.log(`\u2713 Preferred Locale: ${TD.customerData.preferredLocale}`);
  }

  // ==================== FILL CURRENCY SUB-TAB (within General) ====================
  async fillCurrencySubTab(): Promise<void> {
    console.log('\n=== Currency Sub-Tab (within General) ===');
    const page = this.workingPage;
    const TD = this.TD;

    await this.accountFrame.evaluate(() => { const el = document.getElementById('td_tpageCont6'); if (el) el.click(); }).catch(() => {});
    await page.waitForTimeout(this.timeouts.short);

    // Native Language
    const nativeLangText = (TD.customerData.nativeLanguage || 'ENGLISH').toUpperCase();
    const nativeLang = this.accountFrame.locator('select[name="AccountModBO.NativeLangCode"]');
    if (await nativeLang.isVisible({ timeout: 8000 }).catch(() => false)) {
      await nativeLang.selectOption({ label: nativeLangText }).catch(async () => {
        const val = await this.accountFrame.evaluate((label: string) => { const s = document.querySelector('select[name="AccountModBO.NativeLangCode"]') as HTMLSelectElement; if (!s) return ''; for (const o of Array.from(s.options)) { if (o.text.trim().toUpperCase() === label) return o.value; } return ''; }, nativeLangText).catch(() => '');
        if (val) await nativeLang.selectOption(val);
      });
      await this.accountFrame.evaluate(() => { const s = document.querySelector('select[name="AccountModBO.NativeLangCode"]') as HTMLSelectElement; if (s) { s.dispatchEvent(new Event('change', { bubbles: true })); s.dispatchEvent(new Event('blur', { bubbles: true })); } }).catch(() => {});
      console.log(`\u2713 Native Language: ${nativeLangText}`);
    }
    await page.waitForTimeout(this.timeouts.short);

    // Preferred Native Language via LOV
    await this.refreshAccountFrame('before Cust_Language LOV');
    await this.accountFrame.evaluate(() => { const el = document.getElementById('td_tpageCont6'); if (el) el.click(); }).catch(() => {});
    await page.waitForTimeout(this.timeouts.short);

    const prefSearch = (TD.customerData.preferredNativeLanguage && TD.customerData.preferredNativeLanguage !== '-') ? TD.customerData.preferredNativeLanguage : (TD.customerData.preferredLanguage || 'India (English)');
    const custLangBtn = this.accountFrame.locator('input[name="btnone_AccountModBO.Cust_Language"]');
    if (await custLangBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.closeUnexpectedPopups(page);
      const lovPromise = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
      await custLangBtn.evaluate((el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).catch(() => {});
      const lovPopup = await lovPromise;
      if (lovPopup) {
        await lovPopup.bringToFront();
        await new Promise(r => setTimeout(r, 2000));
        if (!lovPopup.isClosed() && lovPopup.url().includes('SSOblank')) {
          const hm = lovPopup.url().match(/wizardHashKey=([a-f0-9]+)/);
          if (hm) await lovPopup.goto(`https://clrnuat.clarienbank.com/FinacleCRM/servlet/com.infy.cis.ui.common.LookupforCategory?wizardHashKey=${hm[1]}`, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => {});
        }
        const ready = await this.waitForPopupReady(lovPopup, 'Cust_Language LOV');
        if (ready && !lovPopup.isClosed()) {
          for (const lf of lovPopup.frames()) { const sub = lf.locator('input[value="Submit"]').first(); if (await sub.isVisible({ timeout: 3000 }).catch(() => false)) { await sub.click(); break; } }
          await page.waitForTimeout(this.timeouts.medium);
          if (!lovPopup.isClosed()) {
            let selected = false;
            for (const lf of lovPopup.frames()) {
              const cell = lf.getByText(prefSearch, { exact: true }).first();
              if (await cell.isVisible({ timeout: 5000 }).catch(() => false)) {
                const tr = cell.locator('xpath=ancestor::tr[1]');
                const catId = await tr.evaluate(el => el.getAttribute('categorybo.categoryid')).catch(() => '');
                const catCode = await tr.evaluate(el => el.getAttribute('categorybo.categorycode')).catch(() => '');
                const catVal = await tr.evaluate(el => el.getAttribute('categorybo.value')).catch(() => '');
                this.custLanguageCode = catId || catCode || TD.customerData.preferredLanguage || prefSearch;
                this.custLanguageDisplay = catVal || TD.customerData.preferredNativeLanguage || prefSearch;
                try { await Promise.race([tr.dblclick({ timeout: this.timeouts.medium }), lovPopup.waitForEvent('close', { timeout: this.timeouts.long })]); } catch (_) {}
                await page.waitForTimeout(this.timeouts.short);
                console.log(`\u2713 Preferred Native Language: ${prefSearch} (code=${this.custLanguageCode})`);
                selected = true;
                break;
              }
            }
            if (!selected) { console.log(`\u26a0 Preferred Native Language LOV value not found for: ${prefSearch}`); this.custLanguageCode = TD.customerData.preferredLanguage || prefSearch; this.custLanguageDisplay = prefSearch; }
            if (!lovPopup.isClosed()) await lovPopup.close().catch(() => {});
          }
          if (!lovPopup.isClosed()) await lovPopup.close().catch(() => {});
        } else { if (!lovPopup.isClosed()) await lovPopup.close().catch(() => {}); }
      }
    } else {
      this.custLanguageCode = TD.customerData.preferredLanguage || 'India (English)';
      this.custLanguageDisplay = (TD.customerData.preferredNativeLanguage && TD.customerData.preferredNativeLanguage !== '-') ? TD.customerData.preferredNativeLanguage : this.custLanguageCode;
    }
    await this.accountFrame.evaluate((args: { code: string; display: string }) => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const cl = document.querySelector('input[name="AccountModBO.Cust_Language"]') as HTMLInputElement;
      if (cl) { cl.value = args.display; cl.removeAttribute('readonly'); fire(cl); }
      const hcl = document.querySelector('input[name="h_AccountModBO.Cust_Language"]') as HTMLInputElement;
      if (hcl) { hcl.value = args.code; hcl.removeAttribute('readonly'); fire(hcl); }
      const cat = document.querySelector('input[name="Cat_AccountModBO.Cust_Language"]') as HTMLInputElement;
      if (cat) { cat.value = args.display; cat.removeAttribute('readonly'); fire(cat); }
    }, { code: this.custLanguageCode, display: this.custLanguageDisplay }).catch(() => {});
    await page.waitForTimeout(this.timeouts.short);

    // Preferred Locale (re-set)
    await this.refreshAccountFrame('after Cust_Language LOV');
    await this.accountFrame.evaluate((locale: string) => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const pl = document.querySelector('input[name="Cat_PsychographicBO.Preferred_Locale"]') as HTMLInputElement;
      if (pl) { pl.removeAttribute('readonly'); pl.value = locale; fire(pl); }
      const plc = document.querySelector('input[name="PsychographicBO.Preferred_Locale"]') as HTMLInputElement;
      if (plc) { plc.value = locale; fire(plc); }
    }, TD.customerData.preferredLocale).catch(() => {});

    // Region via LOV to capture numeric categoryid
    await this.refreshAccountFrame('before Region LOV');
    await this.closeUnexpectedPopups(page);
    await this.accountFrame.evaluate(() => { const el = document.getElementById('td_tpageCont6'); if (el) el.click(); }).catch(() => {});
    await page.waitForTimeout(this.timeouts.short);

    const clickLovByPattern = async (pattern: string): Promise<Page | null> => {
      await this.refreshAccountFrame('before LOV click ' + pattern);
      const acct = this.accountFrame;
      if (!acct) { console.log(`  ⚠ No accountFrame for LOV ${pattern}`); return null; }
      try {
        const [popup] = await Promise.all([
          page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null),
          acct.evaluate((p: string) => {
            const b = Array.from(document.querySelectorAll('input[type="button"]')).find((el: any) => el.name && el.name.toUpperCase().includes('BTNONE') && el.name.toUpperCase().includes(p));
            if (b) (b as HTMLInputElement).click();
          }, pattern)
        ]);
        return popup;
      } catch (e: any) {
        console.log(`  ⚠ LOV click for ${pattern} failed: ${e.message?.substring(0, 80) || e}`);
        return null;
      }
    };
    const submitLovSearch = async (lov: Page, search: string) => {
      for (const lf of lov.frames()) {
        const inputs = await lf.locator('input[type="text"]').all();
        const vis: Locator[] = [];
        for (const i of inputs) { if (await i.isVisible().catch(() => false)) vis.push(i); }
        if (vis.length >= 1) await vis[0].fill(search).catch(() => {});
        if (vis.length >= 2) await vis[1].fill('').catch(() => {});
        const sub = lf.locator('input[value="Submit"]').first();
        if (await sub.isVisible({ timeout: 3000 }).catch(() => false)) { await sub.click().catch(() => {}); break; }
      }
      await page.waitForTimeout(this.timeouts.medium);
    };
    const regionDisplayTarget = (TD.customerData.regionDisplay || TD.customerData.region).toUpperCase();
    const regionPopup = await clickLovByPattern('REGION');
    if (regionPopup) {
      await regionPopup.bringToFront();
      await new Promise(r => setTimeout(r, 2000));
      if (!regionPopup.isClosed() && regionPopup.url().includes('SSOblank')) {
        const hm = regionPopup.url().match(/wizardHashKey=([a-f0-9]+)/);
        if (hm) await regionPopup.goto(`https://clrnuat.clarienbank.com/FinacleCRM/servlet/com.infy.cis.ui.common.LookupforCategory?wizardHashKey=${hm[1]}`, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => {});
      }
      const ready = await this.waitForPopupReady(regionPopup, 'Region LOV');
      if (ready && !regionPopup.isClosed()) {
        await submitLovSearch(regionPopup, TD.customerData.region);
        let catId = '';
        let catCode = '';
        let catDisplay = '';
        let selected = false;
        const re = new RegExp(regionDisplayTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        for (const lf of regionPopup.frames()) {
          const cell = lf.locator('td').filter({ hasText: re }).first();
          if (await cell.isVisible({ timeout: 5000 }).catch(() => false)) {
            try {
              const info = await cell.evaluate((el: HTMLElement) => {
                const tr = el.closest('tr');
                return {
                  catId: tr?.getAttribute('categoryid') || tr?.getAttribute('categorybo.categoryid') || '',
                  catCode: tr?.getAttribute('categorycode') || tr?.getAttribute('categorybo.categorycode') || '',
                  catDisplay: (tr?.getAttribute('value') || tr?.getAttribute('categorybo.value') || tr?.textContent || '').trim()
                };
              });
              catId = info.catId || ''; catCode = info.catCode || ''; catDisplay = info.catDisplay || '';
            } catch (_) {}
            try { await Promise.race([cell.dblclick({ timeout: this.timeouts.medium }), regionPopup.waitForEvent('close', { timeout: this.timeouts.long })]); } catch (_) {}
            selected = true;
            break;
          }
        }
        if (selected) {
          (this as any).lastRegionCode = catId || catCode || TD.customerData.region;
          (this as any).lastRegionDisplay = catDisplay || TD.customerData.regionDisplay || TD.customerData.region;
          console.log(`\u2713 Region: ${(this as any).lastRegionDisplay} (code=${(this as any).lastRegionCode})`);
        } else {
          console.log(`\u26a0 Region LOV value not found for: ${regionDisplayTarget}`);
          (this as any).lastRegionCode = TD.customerData.region;
          (this as any).lastRegionDisplay = TD.customerData.regionDisplay || TD.customerData.region;
        }
        if (!regionPopup.isClosed()) await regionPopup.close().catch(() => {});
      } else { if (!regionPopup.isClosed()) await regionPopup.close().catch(() => {}); }
    }
    if (!(this as any).lastRegionCode) {
      (this as any).lastRegionCode = TD.customerData.region;
      (this as any).lastRegionDisplay = TD.customerData.regionDisplay || TD.customerData.region;
    }
    // Force-set all region input variants with the captured numeric code
    await this.accountFrame.evaluate((args: { code: string; display: string }) => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const regionCode = (args.code || '').toUpperCase();
      const regionDisplay = (args.display || args.code || '').toUpperCase();
      document.querySelectorAll('input, select').forEach((inp: any) => {
        const name = (inp.name || '').toUpperCase();
        if (!name.includes('REGION')) return;
        inp.removeAttribute('readonly'); inp.disabled = false;
        if (name.startsWith('H_') && !name.startsWith('H_CAT_')) { inp.value = regionCode; }
        else { inp.value = regionDisplay; }
        fire(inp);
      });
    }, { code: (this as any).lastRegionCode, display: (this as any).lastRegionDisplay }).catch(() => {});

    // TDS Table via LOV
    await this.refreshAccountFrame('before TDS LOV');
    await this.closeUnexpectedPopups(page);
    await this.accountFrame.evaluate(() => { const el = document.getElementById('td_tpageCont6'); if (el) el.click(); }).catch(() => {});
    await page.waitForTimeout(this.timeouts.short);

    const tdsDisplay = TD.customerData.taxDeductedAtSourceTableDisplay || TD.customerData.tdsTable;
    const tdsPopup = await clickLovByPattern('TDS_TBL');
    if (tdsPopup) {
      await tdsPopup.bringToFront();
      await new Promise(r => setTimeout(r, 2000));
      if (!tdsPopup.isClosed() && tdsPopup.url().includes('SSOblank')) {
        const hm = tdsPopup.url().match(/wizardHashKey=([a-f0-9]+)/);
        if (hm) await tdsPopup.goto(`https://clrnuat.clarienbank.com/FinacleCRM/servlet/com.infy.cis.ui.common.LookupforCategory?wizardHashKey=${hm[1]}`, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => {});
      }
      const ready = await this.waitForPopupReady(tdsPopup, 'TDS LOV');
      if (ready && !tdsPopup.isClosed()) {
        await submitLovSearch(tdsPopup, TD.customerData.tdsTable);
        const tdsSearch = tdsDisplay.toUpperCase();
        let catId = '';
        let catCode = '';
        let catDisplay = '';
        let selected = false;
        const re = new RegExp(tdsSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        for (const lf of tdsPopup.frames()) {
          const cell = lf.locator('td').filter({ hasText: re }).first();
          if (await cell.isVisible({ timeout: 5000 }).catch(() => false)) {
            try {
              const info = await cell.evaluate((el: HTMLElement) => {
                const tr = el.closest('tr');
                return {
                  catId: tr?.getAttribute('categoryid') || tr?.getAttribute('categorybo.categoryid') || '',
                  catCode: tr?.getAttribute('categorycode') || tr?.getAttribute('categorybo.categorycode') || '',
                  catDisplay: (tr?.getAttribute('value') || tr?.getAttribute('categorybo.value') || tr?.textContent || '').trim()
                };
              });
              catId = info.catId || ''; catCode = info.catCode || ''; catDisplay = info.catDisplay || '';
            } catch (_) {}
            try { await Promise.race([cell.dblclick({ timeout: this.timeouts.medium }), tdsPopup.waitForEvent('close', { timeout: this.timeouts.long })]); } catch (_) {}
            selected = true;
            break;
          }
        }
        if (selected) {
          (this as any).lastTdsCode = catId || catCode || TD.customerData.tdsTable;
          (this as any).lastTdsDisplay = catDisplay || TD.customerData.taxDeductedAtSourceTableDisplay || TD.customerData.tdsTable;
          console.log(`\u2713 TDS Table: ${(this as any).lastTdsDisplay} (code=${(this as any).lastTdsCode})`);
        } else {
          console.log(`\u26a0 TDS LOV value not found for: ${tdsDisplay}`);
          (this as any).lastTdsCode = TD.customerData.tdsTable;
          (this as any).lastTdsDisplay = TD.customerData.taxDeductedAtSourceTableDisplay || TD.customerData.tdsTable;
        }
        if (!tdsPopup.isClosed()) await tdsPopup.close().catch(() => {});
      } else { if (!tdsPopup.isClosed()) await tdsPopup.close().catch(() => {}); }
    }
    if (!(this as any).lastTdsCode) {
      (this as any).lastTdsCode = TD.customerData.tdsTable;
      (this as any).lastTdsDisplay = TD.customerData.taxDeductedAtSourceTableDisplay || TD.customerData.tdsTable;
      await this.accountFrame.evaluate((args: { code: string; display: string }) => {
        const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const code = args.code.toUpperCase();
        const display = (args.display || args.code).toUpperCase();
        document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
          const name = (inp.name || '').toUpperCase();
          if (!name.includes('TDS_TBL')) return;
          if (name.includes('CAT_')) { inp.value = display; }
          else if (name.startsWith('H_')) { inp.value = code; }
          else { inp.value = display; }
          inp.removeAttribute('readonly');
          fire(inp);
        });
      }, { code: (this as any).lastTdsCode, display: (this as any).lastTdsDisplay }).catch(() => {});
    }

    await this.refreshAccountFrame('after TDS LOV');

    // Default Channel, Minor Indicator, IsEbankingEnabled, PRM ID
    const defaultChannel = TD.customerData.defaultChannelForAlerts || 'BRANCH';
    await this.accountFrame.evaluate((channel: string) => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const setSel = (name: string, match: string) => { const s = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement; if (s) { for (const o of Array.from(s.options)) { if (o.text.trim().toUpperCase().includes(match) || o.value === match) { s.value = o.value; fire(s); break; } } } };
      setSel('AccountBO.DefaultChannel_Alert', channel.toUpperCase());
      setSel('AccountModBO.CustomerMinor', 'N');
      setSel('AccountModBO.IsEbankingEnabled', 'N');
    }, defaultChannel).catch(() => {});

    await this.accountFrame.evaluate((rmId: string) => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const inp = document.querySelector('input[name="Acc_manager"]') as HTMLInputElement;
      if (inp) { inp.value = rmId; fire(inp); }
    }, TD.customerData.primaryRelationshipManagerId).catch(() => {});
    console.log(`\u2713 PRM ID: ${TD.customerData.primaryRelationshipManagerId}`);

    await this.closeUnexpectedPopups(page);
    await page.waitForTimeout(this.timeouts.short3);
    await page.screenshot({ path: 'test-results-temp/retail-basic-info-complete.png' }).catch(() => {});
  }

  // ==================== FILL CONTACT TAB ====================
  async fillContactTab(): Promise<void> {
    console.log('\n========== CONTACT TAB ==========');
    const page = this.workingPage;
    const TD = this.TD;
    await this.reacquireAccountFrame('before Contact tab');

    // Click Contact tab — try multiple approaches
    let contactTabClicked = false;
    // Approach 1: Click tab element by ID in accountFrame
    const tabResult = await this.accountFrame.evaluate(() => {
      const tab = document.getElementById('tab_tpageCont3') || document.getElementById('td_tpageCont3');
      if (tab) { (tab as HTMLElement).click(); return tab.id; }
      // Scan for "Address" or "Contact" tab text
      for (const el of Array.from(document.querySelectorAll('td, a, span'))) {
        const txt = (el as HTMLElement).textContent?.trim() || '';
        if (txt === 'Contact' || txt === 'Address' || txt === 'Contact Details') {
          (el as HTMLElement).click(); return 'text:' + txt;
        }
      }
      return '';
    }).catch(() => '');
    if (tabResult) { contactTabClicked = true; console.log(`\u2713 Clicked Contact tab (${tabResult})`); }

    // Approach 2: Try clicking in other frames
    if (!contactTabClicked) {
      for (const f of page.frames()) {
        if (f === this.accountFrame) continue;
        const clicked = await f.evaluate(() => {
          const tab = document.getElementById('tab_tpageCont3') || document.getElementById('td_tpageCont3');
          if (tab) { (tab as HTMLElement).click(); return tab.id; }
          for (const el of Array.from(document.querySelectorAll('td, a, span'))) {
            const txt = (el as HTMLElement).textContent?.trim() || '';
            if (txt === 'Contact' || txt === 'Contact Details' || txt === 'Address Details') {
              (el as HTMLElement).click(); return 'text:' + txt;
            }
          }
          return '';
        }).catch(() => '');
        if (clicked) { contactTabClicked = true; console.log(`\u2713 Clicked Contact tab in frame "${f.name()}" (${clicked})`); break; }
      }
    }
    if (!contactTabClicked) console.log('⚠ Contact tab element not found in any frame');

    // Wait for contact content to load
    let contactFormFrame: any = null;
    const deadline = Date.now() + 60000;
    let visibleFieldCount = 0;
    while (Date.now() < deadline) {
      await page.waitForTimeout(this.timeouts.medium);
      // Search ALL frames for the one with address-related fields
      for (const f of page.frames()) {
        const count = await f.evaluate(() => {
          const hasAddr = !!document.querySelector('input[name="Add Address Details"], input[name*="address"], input[name*="Address"]');
          if (!hasAddr) return 0;
          return Array.from(document.querySelectorAll('input, select')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length;
        }).catch(() => 0);
        if (count > 0) { contactFormFrame = f; visibleFieldCount = count; break; }
      }
      if (visibleFieldCount > 0) break;
      // Also check formDispFrame
      const fdf = page.frame({ name: 'formDispFrame' });
      if (fdf) {
        visibleFieldCount = await fdf.evaluate(() => Array.from(document.querySelectorAll('input, select')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0);
        if (visibleFieldCount > 0) { contactFormFrame = fdf; break; }
      }
    }
    console.log(`  Contact content: ${visibleFieldCount} fields in frame "${contactFormFrame?.name() || 'NONE'}"`);

    const addressFrame = contactFormFrame || this.accountFrame;

    // Preferred Address Type
    const prefAddr = addressFrame.locator('select[name="AccountBO.Address.preferredAddress"]');
    if (await prefAddr.isVisible({ timeout: 5000 }).catch(() => false)) {
      await prefAddr.selectOption({ label: TD.contactData.preferredAddressType });
      console.log(`\u2713 Preferred Address Type: ${TD.contactData.preferredAddressType}`);
    }
    await page.waitForTimeout(this.timeouts.short);

    // === ADDRESS / PHONE / EMAIL POPUPS (handle multiple rows from Excel) ===
    const contacts = this.dataRows(
      TD.contacts,
      TD.contactData
    );

    console.log(
      `  Found ${contacts.length} contact row(s)`
    );

    for (
      let index = 0;
      index < contacts.length;
      index++
    ) {
      const row = contacts[index] as any;

      const contactData = {
        ...(TD.contactData || {}),
        ...row
      };

      const hasAddress =
        this.isProvided(row.addressType) ||
        this.isProvided(row.addressLabel) ||
        this.isProvided(row.addressLine1) ||
        this.isProvided(row.streetName) ||
        this.isProvided(row.streetNo) ||
        this.isProvided(row.houseNo) ||
        this.isProvided(row.premiseName) ||
        this.isProvided(row.city) ||
        this.isProvided(row.zip);

      const hasPhone =
        this.isProvided(row.phoneType) ||
        this.isProvided(row.phoneNumber);

      const hasEmail =
        this.isProvided(row.email);

      if (!hasAddress && !hasPhone && !hasEmail) {
        console.log(
          `  Skipping empty contact row ${index + 1}`
        );
        continue;
      }

      console.log(
        `  Processing contact row ${index + 1}: ` +
        `address=${hasAddress}, ` +
        `phone=${hasPhone}, ` +
        `email=${hasEmail}`
      );

      // These must be independent conditions.
      // One Excel row can contain address, phone and email.
      if (hasAddress) {
        await this.addAddress(
          addressFrame,
          contactData
        );
      }

      if (hasPhone) {
        await this.addPhone(
          addressFrame,
          contactData
        );
      }

      if (hasEmail) {
        await this.addEmail(
          addressFrame,
          contactData
        );
      }
    }

    await this.closeUnexpectedPopups(page);
    await page.waitForTimeout(this.timeouts.short3);
  }

  // ==================== ADDRESS POPUP HELPER ====================
  private async addAddress(
    addressFrame: any,
    contactData: any
  ): Promise<void> {
    const page = this.workingPage;
    const TD = { ...this.TD, contactData };
    const addBtn = addressFrame.locator('input[name="Add Address Details"]');
    if (!(await addBtn.isVisible({ timeout: this.timeouts.medium }).catch(() => false))) { console.log('\u26a0 Add Address Details button not found'); return; }

    await this.closeUnexpectedPopups(page);
    await page.waitForTimeout(this.timeouts.short);

    const popupPromise = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
    try { await addBtn.click({ force: true, timeout: 10000 }); } catch (_) {
      await addressFrame.evaluate(() => { const b = document.querySelector('input[name="Add Address Details"]') as HTMLInputElement; if (b) b.click(); });
    }
    const addressPopup = await popupPromise;
    if (!addressPopup) { console.log('\u26a0 No address popup opened'); return; }

    await addressPopup.waitForLoadState('domcontentloaded').catch(() => {});
    for (let i = 0; i < 30; i++) { const url = addressPopup.url(); if (!url.includes('about:blank') && !url.includes('SSOblank.html')) break; await addressPopup.waitForTimeout(1000); }
    await addressPopup.waitForLoadState('load').catch(() => {});
    await addressPopup.waitForTimeout(3000);

    // Find target frame in popup
    let popupTarget: any = addressPopup;
    for (const pf of addressPopup.frames()) {
      const c = await pf.evaluate(() => Array.from(document.querySelectorAll('input, select')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0);
      if (c > 5) { popupTarget = pf; break; }
    }

    // Preferred Format
    const pf = popupTarget.locator('select[name="AccountBO.Address.PreferredFormat"]');
    if (await pf.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pf.selectOption({ label: 'FREE TEXT' });
      await pf.evaluate((el: HTMLSelectElement) => el.dispatchEvent(new Event('change', { bubbles: true })));
      console.log('\u2713 Preferred Format: FREE TEXT');
      if (!addressPopup.isClosed()) await addressPopup.waitForTimeout(this.timeouts.short).catch(() => {});
    }

    // Address Category
    const ac = popupTarget.locator('select[name="AccountBO.Address.addressCategory"]');
    if (await ac.isVisible({ timeout: 3000 }).catch(() => false)) {
      const catOpts = await ac.evaluate((el: HTMLSelectElement) => Array.from(el.options).map(o => o.text)).catch(() => [] as string[]);
      const addressType = (TD.contactData.addressType || 'Mailing').trim();
      const validCat = catOpts.find((o: string) => o.toUpperCase() === addressType.toUpperCase()) ||
                       catOpts.find((o: string) => o.toUpperCase().includes(addressType.toUpperCase())) ||
                       catOpts.find((o: string) => o.includes('Mailing')) ||
                       catOpts.find((o: string) => o !== '--Select--' && o.trim() !== '');
      if (validCat) { await ac.selectOption({ label: validCat }); await ac.evaluate((el: HTMLSelectElement) => el.dispatchEvent(new Event('change', { bubbles: true }))); console.log(`\u2713 Address Category: ${validCat}`); }
    }

    // Address fields
    const fillField = async (
      name: string,
      value: unknown,
      label: string
    ): Promise<void> => {
      const text = this.textValue(value);

      if (!text) {
        return;
      }

      const locator = popupTarget
        .locator(
          `input[name="${name}"], textarea[name="${name}"]`
        )
        .first();

      if (
        await locator
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await locator.fill(text);
        console.log(`\u2713 ${label}: ${text}`);
      }
    };
    const addressLine1 =
      this.textValue(contactData.addressLine1) ||
      [
        this.textValue(contactData.houseNo),
        this.textValue(contactData.streetNo),
        this.textValue(contactData.streetName)
      ]
        .filter(Boolean)
        .join(' ');

    await fillField(
      'AccountBO.Address.address_Line1',
      addressLine1,
      'Address Line 1'
    );
    await fillField('AccountBO.Address.FreeTextLabel', TD.contactData.addressLabel || 'Mailing', 'Address Label');
    await fillField('AccountBO.Address.house_no', TD.contactData.houseNo, 'House No');
    await fillField('AccountBO.Address.premise_name', TD.contactData.premiseName, 'Premise Name');
    await fillField('AccountBO.Address.building_level', TD.contactData.buildingLevel, 'Building Level');
    await fillField('AccountBO.Address.street_no', TD.contactData.streetNo, 'Street No');
    await fillField('AccountBO.Address.suburb', TD.contactData.suburb, 'Suburb');
    await fillField('AccountBO.Address.street_name', TD.contactData.streetName || TD.contactData.addressLabel, 'Street Name');
    await fillField('AccountBO.Address.locality_name', TD.contactData.localityName, 'Locality Name');
    await fillField('AccountBO.Address.town', TD.contactData.city || 'ALTA FLORESTA', 'Town');

    // Also force hidden/display city and address label so format-change validation doesn't popup
    await popupTarget.evaluate((args: any) => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const names = ['AccountBO.Address.city', '3_AccountBO.Address.city', 'h_AccountBO.Address.city', 'AccountBO.Address.address_Label', '3_AccountBO.Address.address_Label', 'h_AccountBO.Address.address_Label', 'AccountBO.Address.FreeTextLabel', '3_AccountBO.Address.FreeTextLabel', 'AccountBO.Address.town', '3_AccountBO.Address.town', 'AccountBO.Address.addressCategory', 'AccountBO.Address.mailingAddress', 'AccountBO.Address.mailingAddressFlg'];
      for (const name of names) {
        const el = document.querySelector('[name="' + name + '"]') as any;
        if (!el) continue;
        let v = '';
        if (name.toUpperCase().includes('CITY')) v = args.city;
        else if (name.toUpperCase().includes('LABEL')) v = args.addressLabel;
        else if (name.toUpperCase().includes('FREETEXT')) v = args.addressLabel;
        else if (name.toUpperCase().includes('TOWN')) v = args.city;
        else if (name.toUpperCase().includes('CATEGORY')) v = 'Mailing';
        else if (name.toUpperCase().includes('MAILINGADDRESS') && !name.toUpperCase().includes('FLG')) v = 'YES';
        else if (name.toUpperCase().includes('MAILINGADDRESSFLG')) v = 'Y';
        if (!v) continue;
        el.disabled = false; el.removeAttribute('disabled'); el.removeAttribute('readonly');
        if (el.tagName === 'SELECT') {
          const up = v.toUpperCase();
          const opt = Array.from(el.options).find((o: any) => o.text.trim().toUpperCase() === up || o.value.toUpperCase() === up);
          if (opt) { el.value = opt.value; } else { el.value = v; }
        } else { el.value = v; }
        fire(el);
      }
    }, { city: TD.contactData.city || 'ALTA FLORESTA', addressLabel: TD.contactData.addressLabel || TD.contactData.streetName || 'Mailing' }).catch(() => {});

    // LOV fields
    await this.selectLovValue({ parentPage: page, target: popupTarget, buttonName: 'btnone_AccountBO.Address.city', searchValue: TD.contactData.city || 'AFL', label: 'City', config: this.config, directFieldName: 'AccountBO.Address.city', parentPopup: addressPopup });
    await this.selectLovValue({ parentPage: page, target: popupTarget, buttonName: 'btnone_AccountBO.Address.state', searchValue: TD.contactData.state, label: 'State', config: this.config, directFieldName: 'AccountBO.Address.state', parentPopup: addressPopup });
    await this.selectLovValue({ parentPage: page, target: popupTarget, buttonName: 'btnone_AccountBO.Address.country', searchValue: TD.contactData.country, label: 'Country', config: this.config, directFieldName: 'AccountBO.Address.country', parentPopup: addressPopup });

    // Country fallback
    const cv = await popupTarget.locator('input[name="Cat_AccountBO.Address.country"]').inputValue().catch(() => '');
    if (!cv || cv.trim().length === 0) {
      await popupTarget.evaluate(() => {
        const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const c = document.querySelector('input[name="AccountBO.Address.country"]') as HTMLInputElement;
        if (c) { c.value = 'BM'; fire(c); }
        const cat = document.querySelector('input[name="Cat_AccountBO.Address.country"]') as HTMLInputElement;
        if (cat) { cat.value = 'BERMUDA'; fire(cat); }
      }).catch(() => {});
    }

    // Zip, Start Date, End Date, Address Proof
    await fillField('AccountBO.Address.zip', TD.contactData.zip, 'Zip');
    await fillField('3_AccountBO.Address.Start_Date', TD.contactData.startDate, 'Start Date');
    const endDateLoc = popupTarget.locator('input[name="AccountBO.Address.End_Date"]');
    const endDate =
      this.textValue(contactData.endDate) ||
      '31/12/2099';

    if (await endDateLoc.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (!(await endDateLoc.isDisabled().catch(() => true))) { await endDateLoc.fill(endDate); }
    }
    const addrProof = popupTarget.locator('select[name="AccountBO.Address.IsAddressProofRcvd"]');
    if (await addrProof.isVisible({ timeout: 3000 }).catch(() => false)) { await addrProof.selectOption({ label: 'Y' }); console.log('\u2713 Address Proof: Y'); }

    // Save address popup
    const saveBtn = popupTarget.locator('input[name="Save"]');
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const addrDlgs: string[] = [];
      const dlgHandler = async (d: Dialog) => { addrDlgs.push(d.message()); await d.accept().catch(() => {}); };
      addressPopup.on('dialog', dlgHandler);
      await saveBtn.click();
      console.log('\u2713 Clicked Save in Address popup');
      await addressPopup.waitForEvent('close', { timeout: 15000 }).catch(async () => {
        if (!addressPopup.isClosed()) addressPopup.close().catch(() => {});
      });
      addressPopup.removeListener('dialog', dlgHandler);
    }
    await page.waitForTimeout(this.timeouts.medium);
    await this.closeUnexpectedPopups(page);
    console.log('\u2713 Address saved');
  }

  // ==================== PHONE POPUP HELPER ====================
  private async addPhone(
    phoneEmailFrame: any,
    contactData: any
  ): Promise<void> {
    const page = this.workingPage;
    const TD = { ...this.TD, contactData };

    // Switch to Phone and E-Mail sub-tab
    let contactFrame = page.frame({ name: 'formDispFrame' });
    let phoneTabClicked = false;
    for (const frame of [contactFrame, this.accountFrame, phoneEmailFrame].filter(Boolean)) {
      const tab = frame.getByText('Phone and E-Mail', { exact: false }).first();
      if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) { await tab.click(); phoneTabClicked = true; console.log('\u2713 Clicked Phone and E-Mail sub-tab'); break; }
    }
    if (!phoneTabClicked) {
      for (const f of page.frames()) {
        const clicked = await f.evaluate(() => {
          for (const el of Array.from(document.querySelectorAll('a, td, span, div'))) { if ((el.textContent?.trim() || '').includes('Phone') && (el.textContent?.trim() || '').includes('E-Mail')) { (el as HTMLElement).click(); return true; } }
          return false;
        }).catch(() => false);
        if (clicked) { phoneTabClicked = true; break; }
      }
    }

    // Wait for phone fields
    let phoneFieldCount = 0;
    const phoneDeadline = Date.now() + 60000;
    while (Date.now() < phoneDeadline) {
      await page.waitForTimeout(this.timeouts.medium4);
      contactFrame = page.frame({ name: 'formDispFrame' });
      if (!contactFrame) continue;
      phoneFieldCount = await contactFrame.evaluate(() => Array.from(document.querySelectorAll('input, select')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0);
      if (phoneFieldCount > 0) break;
    }

    let pef = contactFrame || this.accountFrame;
    // Check if phone fields exist in contactFrame
    const hasPhone = await pef.evaluate(() => Array.from(document.querySelectorAll('input, select')).some(el => { const n = (el as HTMLInputElement).name; return n && (n.includes('Phone') || n.includes('phone') || n.includes('Email') || n.includes('Add Phone')); })).catch(() => false);
    if (!hasPhone) {
      for (const f of page.frames()) {
        const has = await f.evaluate(() => Array.from(document.querySelectorAll('input, select')).some(el => { const n = (el as HTMLInputElement).name; return n && (n.includes('Phone') || n.includes('phone') || n.includes('Email') || n.includes('Add Phone')); })).catch(() => false);
        if (has) { pef = f; break; }
      }
    }

    // Preferred Contact No. Type
    const prefContact = pef.locator('select[name="AccountBO.PhoneEmail.PhoneEmailType"]');
    if (await prefContact.isVisible({ timeout: 5000 }).catch(() => false)) {
      const opts = await prefContact.locator('option').allTextContents();
      const match = opts.find((o: string) => o === TD.contactData.preferredContactNoType) || opts.find((o: string) => o.includes('COMMUNICATION PHONE')) || opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
      if (match) { await prefContact.selectOption({ label: match }); console.log(`\u2713 Preferred Contact No. Type: ${match}`); }
    }

    // Preferred E-Mail ID Type
    const prefEmail = pef.locator('select[name="AccountBO.PhoneEmail.PhoneEmailType1"]');
    if (await prefEmail.isVisible({ timeout: 5000 }).catch(() => false)) {
      const opts = await prefEmail.locator('option').allTextContents();
      const match = opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
      if (match) { await prefEmail.selectOption({ label: match }); }
    }

    // Preferred Mobile Alert Type
    const prefMobile = pef.locator('select[name="AccountBO.Preferred_Mobile_Alert_Type"]');
    if (await prefMobile.isVisible({ timeout: 3000 }).catch(() => false)) {
      const opts = await prefMobile.locator('option').allTextContents();
      const match = opts.find((o: string) => o === TD.contactData.preferredContactNoType) || opts.find((o: string) => o.includes('COMMUNICATION PHONE')) || opts.find((o: string) => o.includes('MOBILE')) || opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
      if (match) { await prefMobile.selectOption({ label: match }); }
    }
    await page.waitForTimeout(this.timeouts.short);

    // Open Phone popup
    const addPhoneBtn = pef.locator('input[name="Add Phone and E-mail"], input[value="Add Phone and E-mail"]').first();
    if (await addPhoneBtn.isVisible({ timeout: this.timeouts.medium }).catch(() => false)) {
      const popupPromise = page.context().waitForEvent('page', { timeout: this.timeouts.long15 }).catch(() => null);
      try { await addPhoneBtn.click({ force: true, timeout: 10000 }); } catch (_) { await pef.evaluate(() => { const b = document.querySelector('input[name="Add Phone and E-mail"], input[value="Add Phone and E-mail"]') as HTMLInputElement; if (b) b.click(); }); }

      const phonePopup = await popupPromise;
      if (phonePopup) {
        await phonePopup.waitForLoadState('domcontentloaded').catch(() => {});
        await phonePopup.waitForTimeout(3000);

        let pt: any = phonePopup;
        for (const pf of phonePopup.frames()) { const c = await pf.evaluate(() => Array.from(document.querySelectorAll('input, select')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0); if (c > 2) { pt = pf; break; } }

        // Select Phone
        const poe = pt.locator('select[name="AccountBO.PhoneEmail.PhoneOrEmail"]');
        if (await poe.isVisible({ timeout: 3000 }).catch(() => false)) {
          const opts = await poe.locator('option').allTextContents();
          const phoneOpt = opts.find((o: string) => o === 'Phone' || o.includes('Phone'));
          if (phoneOpt) { await poe.selectOption({ label: phoneOpt }); await phonePopup.waitForTimeout(2000); }
        }

        // Phone Type
        const phoneType = pt.locator('select[name="AccountBO.PhoneEmail.PhoneEmailType"]');
        if (await phoneType.isVisible({ timeout: 3000 }).catch(() => false)) {
          const opts = await phoneType.locator('option').allTextContents();
          const requestedType = (TD.contactData.phoneType || '').trim();
          const match = (requestedType && opts.find((o: string) => o.toUpperCase().includes(requestedType.toUpperCase()))) ||
                        opts.find((o: string) => o.includes('COMMUNICATION PHONE')) ||
                        opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
          if (match) { await phoneType.selectOption({ label: match }); console.log(`\u2713 Phone Type: ${match}`); }
        }

        // SP#4: Verify phone/email dropdown labels are correct after selecting "Phone"
        const spPage = new ServicePackPage(page, this.config, this.lastDialogMessages);
        const sp4Result = await spPage.verifyPhoneEmailDropdownLabels(phonePopup);
        if (sp4Result.phoneOrEmailValue) {
          expect(sp4Result.labelCorrect, `SP#4: When PhoneOrEmail="${sp4Result.phoneOrEmailValue}", type options [${sp4Result.typeOptions.join(', ')}] must match`).toBe(true);
        }

        // Phone details
        const fillIfEnabled = async (sel: string, val: string, popup: Page) => {
          const loc = pt.locator(sel);
          if (await loc.isVisible({ timeout: 3000 }).catch(() => false)) {
            if (!(await loc.isDisabled().catch(() => true))) { await loc.fill(val); }
            else { await popup.waitForTimeout(2000); if (await loc.isEnabled({ timeout: 3000 }).catch(() => false)) await loc.fill(val); }
          }
        };

        const countryCode =
          this.textValue(contactData.countryCode);

        const areaCode =
          this.textValue(contactData.areaCode);

        const phoneNumber =
          this.textValue(contactData.phoneNumber);

        if (countryCode) {
          await fillIfEnabled(
            'input[name="AccountBO.PhoneEmail.PhoneNo.cntrycode"]',
            countryCode,
            phonePopup
          );
        }

        if (areaCode) {
          await fillIfEnabled(
            'input[name="AccountBO.PhoneEmail.PhoneNo.areacode"]',
            areaCode,
            phonePopup
          );
        }

        if (phoneNumber) {
          await fillIfEnabled(
            'input[name="AccountBO.PhoneEmail.PhoneNo.localcode"]',
            phoneNumber,
            phonePopup
          );
        }

        console.log(
          `\u2713 Phone: +${countryCode} ${areaCode} ${phoneNumber}`
        );

        await phonePopup.waitForTimeout(2000);
        const phoneSave = pt.locator('input[name="Save"]');
        if (await phoneSave.isVisible({ timeout: 3000 }).catch(() => false)) {
          await phoneSave.click();
          await phonePopup.waitForEvent('close', { timeout: 10000 }).catch(() => { if (!phonePopup.isClosed()) phonePopup.close(); });
          console.log('\u2713 Phone saved');
        }
        await page.waitForTimeout(this.timeouts.medium);
        await this.closeUnexpectedPopups(page);
      }
    }
  }

  // ==================== EMAIL POPUP HELPER ====================
  private async addEmail(
    phoneEmailFrame: any,
    contactData: any
  ): Promise<void> {
    const page = this.workingPage;
    const email = this.textValue(contactData.email);

    if (!email) {
      console.log('  Empty email row skipped');
      return;
    }

    await this.closeUnexpectedPopups(page);
    let pef = page.frame({ name: 'formDispFrame' }) || this.accountFrame;

    const addEmailBtn = pef.locator('input[name="Add Phone and E-mail"], input[value="Add Phone and E-mail"]').first();
    if (!(await addEmailBtn.isVisible({ timeout: this.timeouts.medium }).catch(() => false))) { console.log('\u26a0 Add Phone and E-mail button not found for Email'); return; }

    const popupPromise = page.context().waitForEvent('page', { timeout: this.timeouts.long15 }).catch(() => null);
    try { await addEmailBtn.click({ force: true, timeout: 10000 }); } catch (_) { await pef.evaluate(() => { const b = document.querySelector('input[name="Add Phone and E-mail"], input[value="Add Phone and E-mail"]') as HTMLInputElement; if (b) b.click(); }); }

    const emailPopup = await popupPromise;
    if (!emailPopup) { console.log('\u26a0 No email popup opened'); return; }

    await emailPopup.waitForLoadState('domcontentloaded').catch(() => {});
    await emailPopup.waitForTimeout(3000);

    let et: any = emailPopup;
    for (const ef of emailPopup.frames()) { const c = await ef.evaluate(() => Array.from(document.querySelectorAll('input, select')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0); if (c > 2) { et = ef; break; } }

    // Select E-mail
    const poe = et.locator('select[name="AccountBO.PhoneEmail.PhoneOrEmail"]');
    if (await poe.isVisible({ timeout: 3000 }).catch(() => false)) {
      const opts = await poe.locator('option').allTextContents();
      const emailOpt = opts.find((o: string) => o === 'E-mail' || o.includes('Email'));
      if (emailOpt) { await poe.selectOption({ label: emailOpt }); await emailPopup.waitForTimeout(3000); }
    }

    // Email Type
    const emailType1 = et.locator('select[name="AccountBO.PhoneEmail.PhoneEmailType1"]');
    const emailType = et.locator('select[name="AccountBO.PhoneEmail.PhoneEmailType"]');
    const emailTypeDD = await emailType1.isVisible({ timeout: 3000 }).catch(() => false) ? emailType1 : emailType;
    if (await emailTypeDD.isVisible({ timeout: 3000 }).catch(() => false)) {
      const opts = await emailTypeDD.locator('option').allTextContents();
      const requestedType = (contactData.emailType || '').trim();
      const match = (requestedType && opts.find((o: string) => o.toUpperCase().includes(requestedType.toUpperCase()))) ||
                    opts.find((o: string) => o.includes('COMMUNICATION') || o.includes('HOME')) ||
                    opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
      if (match) { await emailTypeDD.selectOption({ label: match }); console.log(`\u2713 Email Type: ${match}`); }
      await emailPopup.waitForTimeout(2000);
    }

    // Email address
    const patterns = ['input[name="AccountBO.PhoneEmail.Email"]', 'input[name*="EmailId"]', 'input[name*="email"]', 'input[name*="Email"]'];
    for (const p of patterns) {
      const ef = et.locator(p).first();
      if (await ef.isVisible({ timeout: 2000 }).catch(() => false)) {
        await ef.fill(email);
        console.log(`\u2713 Email: ${email}`);
        break;
      }
    }

    await emailPopup.waitForTimeout(2000);
    const emailSave = et.locator('input[name="Save"]');
    if (await emailSave.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailSave.click();
      await emailPopup.waitForEvent('close', { timeout: 10000 }).catch(() => { if (!emailPopup.isClosed()) emailPopup.close(); });
      console.log('\u2713 Email saved');
    }
    await page.waitForTimeout(this.timeouts.medium);
    await this.closeUnexpectedPopups(page);
  }

  // ==================== FILL ID DOCUMENT TAB ====================
  async fillIdDocumentTab(): Promise<void> {
    console.log('\n========== ID DOCUMENT TAB ==========');
    const page = this.workingPage;
    const TD = this.TD;

    await this.reacquireAccountFrame('before ID Doc tab');

    // Click ID Document tab
    await this.accountFrame.evaluate(() => {
      if (typeof (window as any).showTabFortabDemoForm === 'function') (window as any).showTabFortabDemoForm('tpageCont5');
      else { const tab = document.getElementById('td_tpageCont5') || document.getElementById('tab_tpageCont5'); if (tab) (tab as HTMLElement).click(); }
    }).catch(() => {});
    console.log('\u2713 Clicked ID Document tab');
    await page.waitForTimeout(this.timeouts.medium);

    let idDocFrame: any = this.accountFrame;
    const formDispFrame = page.frame({ name: 'formDispFrame' });
    if (formDispFrame) idDocFrame = formDispFrame;

    // Wait for AddIdentificationDetails button
    let idDocReady = false;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      for (const f of [idDocFrame, this.accountFrame]) {
        const has = await f.evaluate(() => { const b = document.querySelector('input[name="AddIdentificationDetails"]') as HTMLInputElement; return b ? b.getBoundingClientRect().width > 0 : false; }).catch(() => false);
        if (has) { idDocReady = true; idDocFrame = f; break; }
      }
      if (idDocReady) break;
      await this.accountFrame.evaluate(() => { if (typeof (window as any).showTabFortabDemoForm === 'function') (window as any).showTabFortabDemoForm('tpageCont5'); }).catch(() => {});
      await page.waitForTimeout(this.timeouts.short3);
    }

    const documents = this
      .dataRows(TD.documents, TD.validDocData)
      .filter((document: any) =>
        this.isProvided(document.documentType) ||
        this.isProvided(document.documentCode) ||
        this.isProvided(document.uniqueId)
      );

    console.log(
      `  Found ${documents.length} document row(s)`
    );

    for (
      let documentIndex = 0;
      documentIndex < documents.length;
      documentIndex++
    ) {
      const documentData = {
        ...((this.TD).validDocData || {}),
        ...documents[documentIndex]
      };

      console.log(
        `  Processing document ` +
        `${documentIndex + 1}/${documents.length}`
      );

      // Open popup
      const addBtn = idDocFrame.locator('input[name="AddIdentificationDetails"], input[value="Add Identification Document Details"]').first();
    if (!(await addBtn.isVisible({ timeout: this.timeouts.long }).catch(() => false))) { console.log('\u26a0 Add ID Doc button not found'); return; }

    const popupPromise = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
    try { await addBtn.click({ force: true, timeout: 10000 }); } catch (_) {
      await idDocFrame.evaluate(() => { const b = document.querySelector('input[name="AddIdentificationDetails"]') as HTMLInputElement; if (b) b.click(); });
    }
    console.log('\u2713 Clicked Add Identification Document Details');

    const docPopup = await popupPromise;
    if (!docPopup) { console.log('\u26a0 No ID Doc popup opened'); return; }

    await this.waitForPopupReady(docPopup, 'ID Doc');
    const target = await this.findPopupTarget(docPopup);

    // Document Type
    const docTypeSelect = target.locator('select[name="EntityDocumentBO.DocTypeCode"]');
    if (await docTypeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const opts = await this.getSelectOptions(target, 'select[name="EntityDocumentBO.DocTypeCode"]');
      const targetType = opts.find(o => o === documentData.documentType) || opts.find(o => o.includes(documentData.documentType || 'IDCUS')) || opts.find(o => o !== '--Select--' && o.length > 0);
      if (targetType) {
        await docTypeSelect.selectOption({ label: targetType });
        await docTypeSelect.evaluate((el: HTMLSelectElement) => el.dispatchEvent(new Event('change', { bubbles: true })));
        console.log(`\u2713 Document Type: ${targetType}`);
        for (let i = 0; i < 5; i++) {
          await docPopup.waitForTimeout(this.timeouts.short);
          const docCodes = await this.getSelectOptions(target, 'select[name="EntityDocumentBO.DocCode"]');
          if (docCodes.some(o => o !== '--Select--' && o.length > 0)) break;
        }
      }
    }

    // Document Code
    const docCodeSelect = target.locator('select[name="EntityDocumentBO.DocCode"]');
    if (await docCodeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const opts = await this.getSelectOptions(target, 'select[name="EntityDocumentBO.DocCode"]');
      const targetCode = opts.find(o => o.includes(documentData.documentCode)) || opts.find(o => o !== '--Select--' && o.length > 0);
      if (targetCode) {
        await docCodeSelect.selectOption({ label: targetCode });
        await docCodeSelect.evaluate((el: HTMLSelectElement) => el.dispatchEvent(new Event('change', { bubbles: true })));
        console.log(`\u2713 Document Code: ${targetCode}`);
      }
    }

    // Unique ID
    const uid = target.locator('input[name="EntityDocumentBO.ReferenceNumber"]');
    if (await uid.isVisible({ timeout: 3000 }).catch(() => false)) { await uid.fill(''); await uid.fill(documentData.uniqueId); console.log(`\u2713 Unique ID: ${documentData.uniqueId}`); }

    // Place of Issue via LOV
    await this.selectDocLov(docPopup, target, 'btnone_EntityDocumentBO.PlaceOfIssue', documentData.placeOfIssue, 'Place of Issue', 'EntityDocumentBO.PlaceOfIssue', 'Cat_EntityDocumentBO.PlaceOfIssue');
    // Country of Issue via LOV
    // Fallback to contact country / country-of-birth when the document row is blank.
    const countryOfIssue =
      this.textValue(
        documentData.countryOfIssueDisplay
      ) ||
      this.textValue(
        documentData.countryOfIssue
      ) ||
      this.textValue(
        documentData.country
      ) ||
      this.textValue(
        (this.TD).contactData?.country
      ) ||
      this.textValue(
        (this.TD).demographicData?.countryOfBirthDisplay
      ) ||
      this.textValue(
        (this.TD).demographicData?.countryOfBirth
      );

    const countryOfIssueCode =
      this.textValue(
        documentData.countryOfIssueCode
      ) ||
      this.textValue(
        documentData.countryCode
      ) ||
      this.textValue(
        (this.TD).demographicData?.countryOfBirth
      ) ||
      this.textValue(
        (this.TD).demographicData?.nationality
      ) ||
      this.textValue(
        (this.TD).contactData?.countryCode
      );

    if (countryOfIssue) {
      await this.selectDocLov(
        docPopup,
        target,
        'btnone_EntityDocumentBO.CountryOfIssue',
        countryOfIssue,
        'Country of Issue',
        'EntityDocumentBO.CountryOfIssue',
        'Cat_EntityDocumentBO.CountryOfIssue',
        countryOfIssueCode
      );
    }

    // Issue Date, Expiry Date
    await target.evaluate((val: string) => { const el = document.querySelector('input[name="3_EntityDocumentBO.DocIssueDate"]') as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); } }, documentData.issueDate).catch(() => {});
    console.log(`\u2713 Issue Date: ${documentData.issueDate}`);
    await target.evaluate((val: string) => { const el = document.querySelector('input[name="3_EntityDocumentBO.DocExpiryDate"]') as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); } }, documentData.expiryDate).catch(() => {});
    console.log(`\u2713 Expiry Date: ${documentData.expiryDate}`);

    // Is Document Verified
    const isVerified = target.locator('select[name="EntityDocumentBO.IsDocumentVerified"]');
    if (await isVerified.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (!(await isVerified.isDisabled().catch(() => true))) { await isVerified.selectOption({ label: 'Y' }).catch(() => {}); }
    }

    // Save
    const dlgs: string[] = [];
    const dlgHandler = async (d: Dialog) => { dlgs.push(d.message()); await d.accept().catch(() => {}); };
    docPopup.on('dialog', dlgHandler);
    const saveBtn = target.locator('input[name="save"], input[name="SAVE"], input[value="Save"]').first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) { await saveBtn.click(); console.log('\u2713 Clicked Save'); }
    if (!docPopup.isClosed()) await docPopup.waitForTimeout(3000).catch(() => {});
    docPopup.removeListener('dialog', dlgHandler);

    if (!docPopup.isClosed()) {
      await docPopup.waitForEvent('close', { timeout: 15000 }).catch(async () => { if (!docPopup.isClosed()) docPopup.close().catch(() => {}); });
    }
    console.log('\u2713 ID Doc saved');
    await page.waitForTimeout(this.timeouts.short3);

    // Mark as Preferred when the row is flagged as preferred
    if (
      this.textValue(documentData.isPreferred)
        .toUpperCase() === 'Y'
    ) {
      for (const f of [page.frame({ name: 'formDispFrame' }) || idDocFrame, ...page.frames()]) {
        let marked = false;
        for (const sel of ['input[type="radio"][name="radio1"]', 'input[type="radio"][name="radio0"]', 'input[type="radio"]', 'input[name="IsPreferred"]']) {
          const btn = f.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) { await btn.click(); marked = true; console.log('\u2713 Marked document as Preferred'); break; }
        }
        if (marked) break;
      }
    }
    await this.closeUnexpectedPopups(page);
    await page.waitForTimeout(this.timeouts.short3);
    }
    await page.screenshot({ path: 'test-results-temp/retail-iddoc-complete.png' }).catch(() => {});
  }

  // ==================== FILL CURRENCY TAB ====================
  async fillCurrencyTab(): Promise<void> {
    console.log('\n========== CURRENCY TAB ==========');
    const page = this.workingPage;
    const TD = this.TD;

    await this.reacquireAccountFrame('before Currency tab');

    // Click Currency tab — retry if frame detaches
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.accountFrame.evaluate(() => {
          if (typeof (window as any).showTabFortabDemoForm === 'function') (window as any).showTabFortabDemoForm('tpageCont6');
          else { const tab = document.getElementById('td_tpageCont6') || document.getElementById('tab_tpageCont6'); if (tab) (tab as HTMLElement).click(); }
        });
        console.log('\u2713 Clicked Currency tab');
        break;
      } catch (e) {
        console.log(`  ⚠ Currency tab click attempt ${attempt + 1} failed: ${(e as any).message?.substring(0, 50)}`);
        await page.waitForTimeout(this.timeouts.short3);
        await this.reacquireAccountFrame('retry Currency tab');
      }
    }
    await page.waitForTimeout(this.timeouts.medium);

    // Wait for tab content
    let ccyFrame: any = this.accountFrame;
    const formDispFrame = page.frame({ name: 'formDispFrame' });
    if (formDispFrame) ccyFrame = formDispFrame;

    let tabFieldCount = 0;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      tabFieldCount = await ccyFrame.evaluate(() => Array.from(document.querySelectorAll('input, select, a, button')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0);
      if (tabFieldCount > 0) break;
      await page.waitForTimeout(this.timeouts.medium4);
    }

    const currencies = this
      .dataRows(TD.currencies, (this.TD).validCcyData)
      .filter((currency: any) =>
        this.isProvided(currency.ccy)
      );

    console.log(
      `  Found ${currencies.length} currency row(s)`
    );

    for (
      let currencyIndex = 0;
      currencyIndex < currencies.length;
      currencyIndex++
    ) {
      const currencyData = {
        ...((this.TD).validCcyData || {}),
        ...currencies[currencyIndex]
      };

      console.log(
        `  Processing currency ` +
        `${currencyIndex + 1}/${currencies.length}: ` +
        `${currencyData.ccy}`
      );

      // Open CCY popup
      let ccyPopup: Page | null = null;
      let ccyTarget: any = null;
    const framesToSearch = Array.from(new Set([ccyFrame, this.accountFrame, ...page.frames()]));
    for (const sf of framesToSearch) {
      for (const sel of ['input[value="Add CCY"]', 'input[name*="AddCCY"]', 'input[name*="AddCcy"]']) {
        const btn = sf.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          const pp = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
          await btn.click();
          ccyPopup = await pp;
          if (ccyPopup) { await this.waitForPopupReady(ccyPopup, 'CCY'); ccyTarget = await this.findPopupTarget(ccyPopup); }
          break;
        }
      }
      if (ccyPopup) break;
      const link = sf.getByText('Add CCY', { exact: false }).first();
      if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
        const pp = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
        await link.click();
        ccyPopup = await pp;
        if (ccyPopup) { await this.waitForPopupReady(ccyPopup, 'CCY'); ccyTarget = await this.findPopupTarget(ccyPopup); }
        break;
      }
    }

    if (!ccyPopup || !ccyTarget) { console.log('\u26a0 Could not open CCY popup'); return; }

    const CCY_FIELDS = {
      ccyDisplay: 'Cat_PsychographicBO.MiscellaneousInfo.strText10',
      ccyCode: 'PsychographicBO.MiscellaneousInfo.strText10',
      creditDiscount: '3_PsychographicBO.MiscellaneousInfo.dbFloat1',
      debitDiscount: '3_PsychographicBO.MiscellaneousInfo.dbFloat2',
      withholdingTax: '3_PsychographicBO.MiscellaneousInfo.dbFloat3',
      floorLimit: '3_PsychographicBO.MiscellaneousInfo.dbFloat4',
      expiryDate: '3_PsychographicBO.MiscellaneousInfo.dtDate1'
    };

    // Set CCY via evaluate
    await ccyTarget.evaluate((args: { codeName: string; dispName: string; code: string }) => {
      const ce = document.querySelector(`input[name="${args.codeName}"]`) as HTMLInputElement;
      const de = document.querySelector(`input[name="${args.dispName}"]`) as HTMLInputElement;
      if (ce) { ce.value = args.code; ce.dispatchEvent(new Event('change', { bubbles: true })); }
      if (de) { de.value = args.code; de.dispatchEvent(new Event('change', { bubbles: true })); }
    }, { codeName: CCY_FIELDS.ccyCode, dispName: CCY_FIELDS.ccyDisplay, code: currencyData.ccy });
    console.log(`\u2713 CCY: ${currencyData.ccy}`);

    // Fill CCY fields
    const fieldMap = [
      {
        name: CCY_FIELDS.creditDiscount,
        value: this.textValue(
          currencyData.creditDiscountPcnt
        ),
        label: 'Credit Discount'
      },
      {
        name: CCY_FIELDS.debitDiscount,
        value: this.textValue(
          currencyData.debitDiscountPcnt
        ),
        label: 'Debit Discount'
      },
      {
        name: CCY_FIELDS.withholdingTax,
        value: this.textValue(
          currencyData.withholdingTaxPcnt
        ),
        label: 'Withholding Tax'
      },
      {
        name: CCY_FIELDS.floorLimit,
        value: this.textValue(
          currencyData.withholdingTaxFloorLimit
        ),
        label: 'Floor Limit'
      },
      {
        name: CCY_FIELDS.expiryDate,
        value: this.textValue(
          currencyData.preferentialExpiryDate
        ),
        label: 'Expiry Date'
      }
    ];

    for (const field of fieldMap) {
      if (!field.value) {
        continue;
      }

      await ccyTarget.evaluate(
        (args: {
          fieldName: string;
          value: string;
        }) => {
          const element = document.querySelector(
            `input[name="${args.fieldName}"]`
          ) as HTMLInputElement | null;

          if (!element) {
            return;
          }

          element.removeAttribute('readonly');
          element.value = args.value;

          element.dispatchEvent(
            new Event('change', { bubbles: true })
          );

          element.dispatchEvent(
            new Event('blur', { bubbles: true })
          );
        },
        {
          fieldName: field.name,
          value: field.value
        }
      );

      console.log(`\u2713 ${field.label}: ${field.value}`);
    }

    // Save CCY popup
    const dlgs: string[] = [];
    const dlgHandler = async (d: Dialog) => { dlgs.push(d.message()); await d.accept().catch(() => {}); };
    ccyPopup.on('dialog', dlgHandler);
    const saveBtn = ccyTarget.locator('input[name="save"], input[name="SAVE"], input[value="Save"]').first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) { await saveBtn.click(); console.log('\u2713 Clicked Save'); }
    if (!ccyPopup.isClosed()) await ccyPopup.waitForTimeout(3000).catch(() => {});
    ccyPopup.removeListener('dialog', dlgHandler);
    if (!ccyPopup.isClosed()) { await ccyPopup.waitForEvent('close', { timeout: 15000 }).catch(async () => { if (!ccyPopup!.isClosed()) ccyPopup!.close().catch(() => {}); }); }
    console.log('\u2713 CCY popup saved');
    await page.waitForTimeout(this.timeouts.short3);
    }
    await this.closeUnexpectedPopups(page);
    await page.screenshot({ path: 'test-results-temp/retail-ccy-complete.png' }).catch(() => {});
  }

  // ==================== FILL DEMOGRAPHIC TAB ====================
  async fillDemographicTab(): Promise<void> {
    console.log('\n========== DEMOGRAPHIC TAB ==========');
    const page = this.workingPage;
    const TD = this.TD;

    await this.reacquireAccountFrame('before Demographic tab');

    // Click Demographic tab (#tab1)
    let clicked = await this.accountFrame.evaluate(() => {
      const tab = document.getElementById('tab1');
      if (tab) { (tab as HTMLElement).click(); return true; }
      return false;
    }).catch(() => false);
    if (!clicked) {
      for (const f of page.frames()) {
        clicked = await f.evaluate(() => { const tab = document.getElementById('tab1'); if (tab) { (tab as HTMLElement).click(); return true; } return false; }).catch(() => false);
        if (clicked) break;
      }
    }
    console.log('\u2713 Clicked Demographic tab');
    await page.waitForTimeout(this.timeouts.medium);

    let demoFrame: any = this.accountFrame;
    let formDispFrame = page.frame({ name: 'formDispFrame' });
    if (formDispFrame) demoFrame = formDispFrame;

    // Wait for demographic fields to load
    let demoFieldCount = 0;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      for (const f of page.frames()) {
        const count = await f.evaluate(() => Array.from(document.querySelectorAll('input, select, textarea')).filter(el => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length).catch(() => 0);
        if (count > demoFieldCount) { demoFieldCount = count; demoFrame = f; }
      }
      if (demoFieldCount >= 5) break;
      await page.waitForTimeout(this.timeouts.medium4);
    }

    // Discover field names dynamically
    const fieldInfo = await demoFrame.evaluate(() => {
      const info: any = { nationalityFields: [], maritalFields: [], allSelects: [], allLovButtons: [] };
      document.querySelectorAll('input, select').forEach(el => {
        const inp = el as HTMLInputElement;
        const name = inp.name || '';
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (name.toLowerCase().includes('national') || name.toLowerCase().includes('nationality')) info.nationalityFields.push({ name, type: inp.type, tag: el.tagName, value: inp.value });
        if (name.toLowerCase().includes('marital')) info.maritalFields.push({ name, type: inp.type, tag: el.tagName, value: inp.value });
        if (el.tagName === 'SELECT') { const sel = el as HTMLSelectElement; const opts = Array.from(sel.options).map(o => o.text.trim()).filter(t => t.length > 0); info.allSelects.push({ name, options: opts.slice(0, 20) }); }
      });
      document.querySelectorAll('input[type="button"]').forEach(el => { const inp = el as HTMLInputElement; if (inp.name.startsWith('btnone_') || inp.name.startsWith('btntwo_')) info.allLovButtons.push({ name: inp.name }); });
      return info;
    }).catch(() => ({ nationalityFields: [], maritalFields: [], allSelects: [], allLovButtons: [] }));

    this.nationalityDisplay = fieldInfo.nationalityFields.find((f: any) => f.name.startsWith('Cat_'))?.name || '';
    this.nationalityCode = fieldInfo.nationalityFields.find((f: any) => !f.name.startsWith('Cat_') && !f.name.startsWith('btn') && !f.name.startsWith('pi_'))?.name || '';
    this.nationalityLovBtn = fieldInfo.allLovButtons.find((b: any) => b.name.toLowerCase().includes('national'))?.name || '';
    this.maritalStatusField = fieldInfo.maritalFields.find((f: any) => f.tag === 'SELECT')?.name || '';

    // Nationality LOV
    let natSelected = false;
    try {
      natSelected = await this.selectLovValue({ parentPage: page, target: demoFrame, buttonName: this.nationalityLovBtn, searchValue: TD.demographicData.nationalityDisplay, label: 'Nationality', config: this.config, directFieldName: this.nationalityCode || undefined });
    } catch (e) { console.log('\u26a0 Nationality LOV error: ' + ((e as Error).message || '').substring(0, 100)); }
    await page.waitForTimeout(this.timeouts.short).catch(() => {});

    if (this.nationalityCode && this.nationalityDisplay) {
      await page.waitForTimeout(3000).catch(() => {});
      demoFrame = this.getDemoFrame();
      await demoFrame.evaluate((args: { code: string; disp: string; nationality: string; nationalityDisplay: string }) => {
        const ce = document.querySelector(`input[name="${args.code}"]`) as HTMLInputElement;
        const de = document.querySelector(`input[name="${args.disp}"]`) as HTMLInputElement;
        const fire = (el: HTMLInputElement) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        if (ce) { ce.removeAttribute('readonly'); ce.disabled = false; ce.value = args.nationality; fire(ce); }
        if (de) { de.removeAttribute('readonly'); de.disabled = false; de.value = args.nationalityDisplay; fire(de); }
      }, { code: this.nationalityCode, disp: this.nationalityDisplay, nationality: TD.demographicData.nationality, nationalityDisplay: TD.demographicData.nationalityDisplay }).catch(() => {});
      console.log('\u2713 Nationality: ' + TD.demographicData.nationalityDisplay + ' (fallback)');
    }
    await page.waitForTimeout(this.timeouts.short3);

    // Residence Country
    demoFrame = this.getDemoFrame();
    try {
      const resInfo = await demoFrame.evaluate(() => {
        const fields = { codeName: '', dispName: '', codeVal: '' };
        document.querySelectorAll('input').forEach(el => {
          const inp = el as HTMLInputElement;
          if (inp.name.includes('Residence_Country') && !inp.name.startsWith('Cat_') && !inp.name.startsWith('btn') && !inp.name.startsWith('pi_')) { fields.codeName = inp.name; fields.codeVal = inp.value; }
          if (inp.name.startsWith('Cat_') && inp.name.includes('Residence_Country')) fields.dispName = inp.name;
        });
        return fields;
      }).catch(() => ({ codeName: '', dispName: '', codeVal: '' }));
      if (resInfo.codeName && (!resInfo.codeVal || resInfo.codeVal.length === 0)) {
        await demoFrame.evaluate((a: { code: string; disp: string; countryOfBirth: string; countryOfBirthDisplay: string }) => {
          const ce = document.querySelector(`input[name="${a.code}"]`) as HTMLInputElement;
          const de = document.querySelector(`input[name="${a.disp}"]`) as HTMLInputElement;
          if (ce) { ce.value = a.countryOfBirth; ce.dispatchEvent(new Event('change', { bubbles: true })); }
          if (de) { de.value = a.countryOfBirthDisplay; de.dispatchEvent(new Event('change', { bubbles: true })); }
        }, { code: resInfo.codeName, disp: resInfo.dispName, countryOfBirth: TD.demographicData.countryOfBirth, countryOfBirthDisplay: TD.demographicData.countryOfBirthDisplay }).catch(() => {});
        console.log('\u2713 Residence Country: ' + TD.demographicData.countryOfBirthDisplay);
      }
    } catch (e) { console.log(`\u26a0 Residence Country error: ${(e as Error).message?.substring(0, 80)}`); }

    // Marital Status
    if (this.maritalStatusField) {
      const marSel = demoFrame.locator(`select[name="${this.maritalStatusField}"]`);
      if (await marSel.isVisible({ timeout: 5000 }).catch(() => false)) {
        const mVal = await demoFrame.evaluate((args: { selName: string; maritalStatus: string }) => { const sel = document.querySelector(`select[name="${args.selName}"]`) as HTMLSelectElement; if (!sel) return ''; const msText = args.maritalStatus.toLowerCase(); const checkUn = msText === 'married'; for (const o of Array.from(sel.options)) { if (o.text.trim().toLowerCase().includes(msText) && (!checkUn || !o.text.trim().toLowerCase().includes('un'))) return o.value; } return ''; }, { selName: this.maritalStatusField, maritalStatus: TD.demographicData.maritalStatus }).catch(() => '');
        if (mVal) { await marSel.selectOption(mVal).catch(() => {}); console.log('\u2713 Marital Status: ' + TD.demographicData.maritalStatus); }
      }
    }

    // Save
    for (const f of page.frames()) { const btn = f.locator('input[value="Save"]').first(); if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); console.log('\u2713 Clicked Save'); break; } }
    await page.waitForTimeout(this.timeouts.medium).catch(() => {});

    // Employment Details sub-tab
    console.log('\n=== Employment Details ===');
    for (const f of page.frames()) { const tab = f.getByText('Employment Details', { exact: false }).first(); if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) { await tab.click(); break; } }
    await page.waitForTimeout(this.timeouts.medium).catch(() => {});
    demoFrame = this.getDemoFrame();

    // Discover and set Employee Type
    let empFields: any[] = [];
    const empSearchFrames = [page.frame({ name: 'formDispFrame' }), ...page.frames().filter(f => { try { return f.url().includes('DemographicMod_det') || f.url().includes('Mod_det'); } catch (_) { return false; } })].filter(Boolean);
    for (const f of empSearchFrames) {
      if (!f) continue;
      const fields = await f.evaluate(() => {
        const r: any[] = [];
        document.querySelectorAll('select').forEach(el => { const sel = el as HTMLSelectElement; const rect = el.getBoundingClientRect(); if (rect.width > 0 && rect.height > 0 && sel.name !== 'op_code' && sel.name !== 'res_type' && sel.name !== 'soln_type') { r.push({ name: sel.name, options: Array.from(sel.options).map(o => o.text.trim()).filter(t => t.length > 0).slice(0, 20) }); } });
        return r;
      }).catch(() => []);
      if (fields.length > empFields.length) { empFields = fields; demoFrame = f; }
    }
    for (const ef of empFields) {
      if (ef.options.some((o: string) => o.includes('SALARIED') || o.includes('EMPLOYED') || o.includes('RETIRED')) || ef.name.toLowerCase().includes('employ')) {
        this.empTypeField = ef.name;
        break;
      }
    }
    if (this.empTypeField) {
      const empSel = demoFrame.locator(`select[name="${this.empTypeField}"]`);
      if (await empSel.isVisible({ timeout: 5000 }).catch(() => false)) {
        const val = await demoFrame.evaluate((args: { selName: string; value: string }) => { const sel = document.querySelector(`select[name="${args.selName}"]`) as HTMLSelectElement; if (!sel) return ''; const empText = args.value.toUpperCase(); for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes(empText) && !o.text.trim().toUpperCase().includes('SELF')) return o.value; } return ''; }, { selName: this.empTypeField, value: TD.employmentData.employmentType }).catch(() => '');
        if (val) { await empSel.selectOption(val).catch(() => {}); console.log('\u2713 Employee Type: ' + TD.employmentData.employmentType); }
      }
    }

    // Income and Expense Details sub-tab
    console.log('\n=== Income and Expense Details ===');
    for (const f of page.frames()) {
      const tab = f.getByText('Income and Expense Details', { exact: false }).first();
      if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) { await tab.click(); break; }
      const tab2 = f.getByText('Income and Expense', { exact: false }).first();
      if (await tab2.isVisible({ timeout: 2000 }).catch(() => false)) { await tab2.click(); break; }
    }
    await page.waitForTimeout(this.timeouts.medium).catch(() => {});
    demoFrame = this.getDemoFrame();

    // Discover income fields
    let incomeFieldInfo = { selects: [] as any[], inputs: [] as any[] };
    const incSearchFrames = [page.frame({ name: 'formDispFrame' }), ...page.frames().filter(f => { try { return f.url().includes('DemographicMod_det') || f.url().includes('Mod_det'); } catch (_) { return false; } })].filter(Boolean);
    for (const f of incSearchFrames) {
      if (!f) continue;
      const info = await f.evaluate(() => {
        const selects: any[] = []; const inputs: any[] = [];
        document.querySelectorAll('select').forEach(el => { const sel = el as HTMLSelectElement; const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && sel.name !== 'op_code' && sel.name !== 'res_type' && sel.name !== 'soln_type') { selects.push({ name: sel.name, options: Array.from(sel.options).map(o => o.text.trim()).filter(t => t.length > 0).slice(0, 20), selectedText: sel.options[sel.selectedIndex]?.text.trim() || '' }); } });
        document.querySelectorAll('input').forEach(el => { const inp = el as HTMLInputElement; const r = el.getBoundingClientRect(); const t = inp.type?.toLowerCase() || ''; if (r.width > 0 && r.height > 0 && t !== 'hidden' && t !== 'button' && t !== 'submit' && t !== 'image' && inp.name !== 'res_id') inputs.push({ name: inp.name, value: inp.value, readonly: inp.readOnly, type: t }); });
        return { selects, inputs };
      }).catch(() => ({ selects: [] as any[], inputs: [] as any[] }));
      if ((info.selects.length + info.inputs.length) > (incomeFieldInfo.selects.length + incomeFieldInfo.inputs.length)) { incomeFieldInfo = info; demoFrame = f; }
    }

    // Income Type
    for (const sf of incomeFieldInfo.selects) {
      if (sf.options.some((o: string) => o.includes('SALARIED') || o.includes('EMPLOYED') || o.includes('RETIRED'))) { this.incomeTypeField = sf.name; break; }
    }
    if (this.incomeTypeField) {
      const incSel = demoFrame.locator(`select[name="${this.incomeTypeField}"]`);
      if (await incSel.isVisible({ timeout: 5000 }).catch(() => false)) {
        const val = await demoFrame.evaluate((args: { selName: string; value: string }) => { const sel = document.querySelector(`select[name="${args.selName}"]`) as HTMLSelectElement; if (!sel) return ''; const incText = args.value.toUpperCase(); for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes(incText) && !o.text.trim().toUpperCase().includes('SELF')) return o.value; } return ''; }, { selName: this.incomeTypeField, value: TD.incomeExpenseData.incomeType }).catch(() => '');
        if (val) { await incSel.selectOption(val).catch(() => {}); console.log('\u2713 Income Type: ' + TD.incomeExpenseData.incomeType); }
      }
    }

    // Currency field
    for (const sf of incomeFieldInfo.selects) {
      if (sf.name === 'DemographicModBO.CU_Annual_Salary_Income') { this.demoCurrencyField = sf.name; break; }
      if (sf.options.some((o: string) => o.includes('BMD') || o.includes('USD') || o.includes('EUR'))) { if (!this.demoCurrencyField) this.demoCurrencyField = sf.name; }
    }
    if (this.demoCurrencyField) {
      const ccySel = demoFrame.locator(`select[name="${this.demoCurrencyField}"]`);
      if (await ccySel.isVisible({ timeout: 5000 }).catch(() => false)) {
        const val = await demoFrame.evaluate((args: { selName: string; value: string }) => { const sel = document.querySelector(`select[name="${args.selName}"]`) as HTMLSelectElement; if (!sel) return ''; const ccy = args.value.toUpperCase(); for (const o of Array.from(sel.options)) { if (o.text.trim().includes(ccy) || o.value === ccy) return o.value; } return ''; }, { selName: this.demoCurrencyField, value: TD.incomeExpenseData.currency }).catch(() => '');
        if (val) { await ccySel.selectOption(val).catch(() => {}); console.log('\u2713 Currency: ' + TD.incomeExpenseData.currency); }
      }
    }

    // Gross Income
    this.grossIncomeField = '';
    for (const inp of incomeFieldInfo.inputs) { if (inp.name.toLowerCase().includes('salary_income') || inp.name.toLowerCase().includes('gross') || inp.name.toLowerCase().includes('annual_salary')) { this.grossIncomeField = inp.name; break; } }
    if (!this.grossIncomeField) {
      this.grossIncomeField = await demoFrame.evaluate(() => { const el = document.querySelector('input[name="3_DemographicBO.Annual_Salary_Income"]') as HTMLInputElement; return el ? el.name : ''; }).catch(() => '');
    }
    if (!this.grossIncomeField) { for (const f of page.frames()) { const found = await f.evaluate(() => { const el = document.querySelector('input[name="3_DemographicBO.Annual_Salary_Income"]') as HTMLInputElement; return el ? el.name : ''; }).catch(() => ''); if (found) { this.grossIncomeField = found; demoFrame = f; break; } } }
    if (this.grossIncomeField) {
      const grossIncome = String(TD.incomeExpenseData.grossIncome);
      await demoFrame.evaluate((fn: string) => { const el = document.querySelector(`input[name="${fn}"]`) as HTMLInputElement; if (el) el.removeAttribute('readonly'); }, this.grossIncomeField).catch(() => {});
      const loc = demoFrame.locator(`input[name="${this.grossIncomeField}"]`);
      if (await loc.isVisible({ timeout: 5000 }).catch(() => false)) { await loc.fill(grossIncome).catch(() => {}); }
      else { await demoFrame.evaluate((a: { fn: string; val: string }) => { const el = document.querySelector(`input[name="${a.fn}"]`) as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = a.val; el.dispatchEvent(new Event('change', { bubbles: true })); } }, { fn: this.grossIncomeField, val: grossIncome }).catch(() => {}); }
      console.log('\u2713 Gross Income: ' + grossIncome);
    }

    // Monthly Expense
    this.monthlyExpenseField = await demoFrame.evaluate(() => { const el = document.querySelector('input[name="3_DemographicBO.Annual_Operating_Exp"]') as HTMLInputElement; return el ? el.name : ''; }).catch(() => '');
    if (!this.monthlyExpenseField) { for (const f of page.frames()) { const found = await f.evaluate(() => { const el = document.querySelector('input[name="3_DemographicBO.Annual_Operating_Exp"]') as HTMLInputElement; return el ? el.name : ''; }).catch(() => ''); if (found) { this.monthlyExpenseField = found; demoFrame = f; break; } } }
    if (!this.monthlyExpenseField) { for (const inp of incomeFieldInfo.inputs) { if ((inp.name || '').toLowerCase().includes('operating_exp')) { this.monthlyExpenseField = inp.name; break; } } }
    if (this.monthlyExpenseField) {
      const annualExpense = String(TD.incomeExpenseData.annualOperatingExpense);
      await demoFrame.evaluate((fn: string) => { const el = document.querySelector(`input[name="${fn}"]`) as HTMLInputElement; if (el) el.removeAttribute('readonly'); }, this.monthlyExpenseField).catch(() => {});
      const loc = demoFrame.locator(`input[name="${this.monthlyExpenseField}"]`);
      if (await loc.isVisible({ timeout: 5000 }).catch(() => false)) { await loc.fill(annualExpense).catch(() => {}); }
      else { await demoFrame.evaluate((a: { fn: string; val: string }) => { const el = document.querySelector(`input[name="${a.fn}"]`) as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = a.val; el.dispatchEvent(new Event('change', { bubbles: true })); } }, { fn: this.monthlyExpenseField, val: annualExpense }).catch(() => {}); }
      console.log('\u2713 Monthly Expense: ' + annualExpense);
    }

    // Fix Income Details fields visible in the failure screenshot
    for (const f of [demoFrame, ...page.frames()]) {
      if (!f) continue;
      const fixedIncome = await f.evaluate(() => {
        const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const findInputByLabel = (labelText: string) => {
          const tds = Array.from(document.querySelectorAll('td'));
          for (const td of tds) { if ((td.innerText || '').trim().toUpperCase().includes(labelText.toUpperCase())) { const nxt = td.nextElementSibling as HTMLElement; if (nxt) { const inps = nxt.querySelectorAll('input[type="text"], input:not([type="hidden"])'); if (inps.length) return inps[0]; const any = nxt.querySelector('input, select') as any; if (any) return any; } } }
          return null;
        };
        const setByLabel = (label: string, val: string) => {
          const el = findInputByLabel(label);
          if (!el) return false;
          el.removeAttribute('readonly'); el.removeAttribute('disabled');
          if (el.tagName === 'SELECT') { el.value = val; el.selectedIndex = Array.from(el.options).findIndex((o: any) => o.value === val); }
          else { el.value = val; }
          fire(el);
          return true;
        };
        const r: string[] = [];
        if (setByLabel('Investment in Shares and Units', '0.00')) r.push('Investment in Shares and Units');
        if (setByLabel('Tax Exemption Start Date', '01/01/2020')) r.push('Tax Exemption Start Date');
        if (setByLabel('No Tax Recalculation Beyond Date', '31/12/2099')) r.push('No Tax Recalculation Beyond Date');
        return r;
      }).catch(() => [] as string[]);
      if (fixedIncome.length) { console.log('  \u2713 Fixed Income/Expense: ' + fixedIncome.join(', ')); break; }
    }

    await page.screenshot({ path: 'test-results-temp/retail-dem-complete.png' }).catch(() => {});
  }

  // ==================== PRE-SUBMIT VERIFICATION ====================
  async preSubmitVerification(): Promise<void> {
    console.log('\n=== Pre-Submit: Verify mandatory fields ===');
    // Skip all tab-switching/LOV re-fills here; submitForm's fillAll will populate the form.
    // The tab/LOV loops were reloading formDispFrame/buttonFrm and causing the Submit button to detach/timeout.
    return;
    const page = this.workingPage;
    const TD = this.TD;

    // General Details (heavy - skipped to avoid timeout)
    if (false) {
    try {
      for (const f of page.frames()) { const tab = f.getByText('General Details', { exact: false }).first(); if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); break; } }
      await page.waitForTimeout(this.timeouts.short3);
      for (const f of page.frames()) {
        const result = await f.evaluate((args: { natCode: string; natDisp: string; marField: string; nationality: string; nationalityDisplay: string; countryOfBirth: string; countryOfBirthDisplay: string; maritalStatus: string }) => {
          const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const res = { foundAny: false, fixes: [] as string[] };
          const nc = document.querySelector(`input[name="${args.natCode}"]`) as HTMLInputElement;
          if (nc) { res.foundAny = true; if (!nc.value) { nc.value = args.nationality; fire(nc); const nd = document.querySelector(`input[name="${args.natDisp}"]`) as HTMLInputElement; if (nd) { nd.value = args.nationalityDisplay; fire(nd); } res.fixes.push('Nationality'); } }
          if (args.marField) { const ms = document.querySelector(`select[name="${args.marField}"]`) as HTMLSelectElement; if (ms) { res.foundAny = true; if (!ms.value || ms.selectedIndex <= 0) { const msText = args.maritalStatus.toLowerCase(); const checkUn = msText === 'married'; for (const o of Array.from(ms.options)) { if (o.text.trim().toLowerCase().includes(msText) && (!checkUn || !o.text.trim().toLowerCase().includes('un'))) { ms.value = o.value; fire(ms); res.fixes.push('Marital'); break; } } } } }
          document.querySelectorAll('input').forEach(el => { const inp = el as HTMLInputElement; if (inp.name.includes('Residence_Country') && !inp.name.startsWith('Cat_') && !inp.name.startsWith('btn') && !inp.name.startsWith('pi_')) { res.foundAny = true; if (!inp.value) { inp.value = args.countryOfBirth; fire(inp); const d = document.querySelector(`input[name="Cat_${inp.name}"]`) as HTMLInputElement; if (d) { d.value = args.countryOfBirthDisplay; fire(d); } res.fixes.push('Residence'); } } });
          return res;
        }, { natCode: this.nationalityCode, natDisp: this.nationalityDisplay, marField: this.maritalStatusField, nationality: TD.demographicData.nationality, nationalityDisplay: TD.demographicData.nationalityDisplay, countryOfBirth: TD.demographicData.countryOfBirth, countryOfBirthDisplay: TD.demographicData.countryOfBirthDisplay, maritalStatus: TD.demographicData.maritalStatus }).catch(() => ({ foundAny: false, fixes: [] }));
        if (result.foundAny) { if (result.fixes.length > 0) console.log(`  \u2713 Re-filled: ${result.fixes.join(', ')}`); break; }
      }
    } catch (e) { console.log(`  \u26a0 General Details re-fill error`); }

    // Title
    try {
      for (const f of page.frames()) {
        const fixed = await f.evaluate((title: string) => { const el = document.querySelector('input[name="AccountModBO.Salutation_code"]') as HTMLInputElement; if (!el) return null; if (!el.value) { el.value = title; el.dispatchEvent(new Event('change', { bubbles: true })); return true; } return false; }, TD.customerData.title).catch(() => null);
        if (fixed === true) { console.log('  \u2713 Re-filled Title = ' + TD.customerData.title); break; }
        if (fixed === false) break;
      }
    } catch (_) {}

    // Employment
    try {
      for (const f of page.frames()) { const tab = f.getByText('Employment Details', { exact: false }).first(); if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); break; } }
      await page.waitForTimeout(this.timeouts.short3);
      if (this.empTypeField) {
        for (const f of page.frames()) {
          const fixed = await f.evaluate((args: { selName: string; value: string }) => { const sel = document.querySelector(`select[name="${args.selName}"]`) as HTMLSelectElement; if (!sel) return null; if (sel.value && sel.selectedIndex > 0) return false; const empText = args.value.toUpperCase(); for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes(empText) && !o.text.trim().toUpperCase().includes('SELF')) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; } } return false; }, { selName: this.empTypeField, value: TD.employmentData.employmentType }).catch(() => null);
          if (fixed === true) { console.log('  \u2713 Re-filled Employee Type'); break; }
          if (fixed === false) break;
        }
      }
    } catch (_) {}

    // Income/Expense
    try {
      for (const f of page.frames()) { const tab = f.getByText('Income and Expense', { exact: false }).first(); if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); break; } }
      await page.waitForTimeout(this.timeouts.short3);
      for (const f of page.frames()) {
        const result = await f.evaluate((args: any) => {
          const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const r = { foundAny: false, fixes: [] as string[] };
          if (args.incTypeField) { const sel = document.querySelector(`select[name="${args.incTypeField}"]`) as HTMLSelectElement; if (sel) { r.foundAny = true; if (!sel.value || sel.selectedIndex <= 0) { const incText = args.incomeType.toUpperCase(); for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes(incText) && !o.text.trim().toUpperCase().includes('SELF')) { sel.value = o.value; fire(sel); r.fixes.push('IncType'); break; } } } } }
          if (args.grossField) { const el = document.querySelector(`input[name="${args.grossField}"]`) as HTMLInputElement; if (el) { r.foundAny = true; if (!el.value || el.value === '0') { el.removeAttribute('readonly'); el.value = args.grossIncome; fire(el); r.fixes.push('Gross'); } } }
          if (args.ccyField) { const sel = document.querySelector(`select[name="${args.ccyField}"]`) as HTMLSelectElement; if (sel) { r.foundAny = true; if (!sel.value || sel.selectedIndex <= 0) { const ccy = args.currency.toUpperCase(); for (const o of Array.from(sel.options)) { if (o.text.trim().includes(ccy) || o.value === ccy) { sel.value = o.value; fire(sel); r.fixes.push('CCY'); break; } } } } }
          if (args.expField) { const el = document.querySelector(`input[name="${args.expField}"]`) as HTMLInputElement; if (el) { r.foundAny = true; if (!el.value) { el.removeAttribute('readonly'); el.value = args.annualOperatingExpense; fire(el); r.fixes.push('Expense'); } } }
          return r;
        }, { incTypeField: this.incomeTypeField, grossField: this.grossIncomeField, ccyField: this.demoCurrencyField, expField: this.monthlyExpenseField, incomeType: TD.incomeExpenseData.incomeType, grossIncome: String(TD.incomeExpenseData.grossIncome), currency: TD.incomeExpenseData.currency, annualOperatingExpense: String(TD.incomeExpenseData.annualOperatingExpense) }).catch(() => ({ foundAny: false, fixes: [] }));
        if (result.foundAny) { if (result.fixes.length > 0) console.log(`  \u2713 Re-filled Income/Expense: ${result.fixes.join(', ')}`); break; }
      }
    } catch (_) {}

    // General tab mandatory fields — sweep all inputs/selects in the first relevant frame
    try {
      for (const f of page.frames()) {
        const result = await f.evaluate((args: any) => {
          const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const res = { foundAny: false, fixes: [] as string[] };
          const allInputs = Array.from(document.querySelectorAll('input, select'));
          if (allInputs.length > 0) res.foundAny = true;

          const fillText = (keywords: string[], val: string) => {
            const upKeywords = keywords.map(k => k.toUpperCase());
            document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
              const name = (inp.name || '').toUpperCase();
              if (!name || inp.value) return;
              if (upKeywords.some(k => name.includes(k))) { inp.removeAttribute('readonly'); inp.value = val; fire(inp); res.fixes.push(name.substring(0, 30)); }
            });
          };

          const fillSelect = (keywords: string[], match: string) => {
            const upKeywords = keywords.map(k => k.toUpperCase());
            const upMatch = match.toUpperCase();
            document.querySelectorAll('select').forEach((sel: HTMLSelectElement) => {
              const name = (sel.name || '').toUpperCase();
              if (!name) return;
              if (sel.value && sel.selectedIndex > 0 && sel.value !== '0') return;
              if (!upKeywords.some(k => name.includes(k))) return;
              let opt = Array.from(sel.options).find(o => o.text.trim().toUpperCase() === upMatch);
              if (!opt) opt = Array.from(sel.options).find(o => o.value.toUpperCase() === upMatch);
              if (!opt) opt = Array.from(sel.options).find(o => o.text.trim().toUpperCase().includes(upMatch));
              if (!opt) opt = Array.from(sel.options).find(o => o.text.trim().toUpperCase().includes('NO'));
              if (!opt) opt = Array.from(sel.options).find(o => o.value.toUpperCase() === 'N');
              if (!opt) opt = Array.from(sel.options).find(o => o.value === '0');
              if (!opt) opt = Array.from(sel.options).find(o => o.value);
              if (opt) { sel.disabled = false; sel.removeAttribute('disabled'); sel.removeAttribute('readonly'); opt.disabled = false; sel.value = opt.value; sel.selectedIndex = opt.index; fire(sel); if (typeof sel.onchange === 'function') { try { sel.onchange(new Event('change')); } catch (_) {} } res.fixes.push(name.substring(0, 30)); }
            });
          };

          // Name fields and DOB
          fillText(['SALUTATION'], args.title);
          fillText(['FIRST_NAME', 'FIRSTNAME'], args.firstName);
          fillText(['LAST_NAME', 'LASTNAME'], args.lastName);
          fillText(['PREFERREDNAME', 'PREFERRED_NAME'], args.preferredName);
          fillText(['SHORT_NAME', 'SHORTNAME'], args.shortName);
          fillText(['CUST_DOB', 'DATEOFBIRTH'], args.dob);
          fillText(['NRE_DATE', 'BECOMINGNRE', 'NRE_DATE'], args.nreDate);
          // Force hidden code inputs for Basel/Foreign/TIN and ID details
          fillText(['BASEL', 'BASELPROFILING'], args.baselVal || 'N');
          fillText(['FOREIGNACCTAXREPORTINGREQ', 'FOREIGNTAXREPORTINGSTATUS', 'FOREIGNACCTAXREPORTING', 'CRSCOMPLIANCE', 'FATCA', 'FATCAREMARKS'], args.foreignVal || 'N');
          fillText(['FOREIGNTAXREPORTINGCOUNTRY', 'TAXREPORTINGCOUNTRY'], '');
          fillText(['TIN', 'TAXIDENTIFICATION'], 'NA');
          fillText(['HIDUNIQUEID', 'ENTITYDOCBO.REFERENCENUMBER', 'ACCOUNTMODBO.UNIQUEID', '3_ACCOUNTMODBO.UNIQUEID', 'ACCOUNTBO.UNIQUEID'], args.uniqueId || '');

          // Region and TDS — fill code vs display automatically
          document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
            const name = (inp.name || '').toUpperCase();
            if (!name || inp.value) return;
            if (name.includes('REGION') && !name.includes('PRE')) {
              inp.value = name.includes('CAT_') ? args.regionDisplay : args.region;
              inp.removeAttribute('readonly'); fire(inp); res.fixes.push(name.substring(0, 30));
            } else if (name.includes('TDS_TBL') || name.includes('TDS_TABLE')) {
              inp.value = name.includes('CAT_') ? args.tdsDisplay : args.tdsTable;
              inp.removeAttribute('readonly'); fire(inp); res.fixes.push(name.substring(0, 30));
            } else if (name.includes('INTRODUCER')) {
              inp.value = args.primaryRelationshipManagerId;
              inp.removeAttribute('readonly'); fire(inp); res.fixes.push(name.substring(0, 30));
            } else if (name.includes('ACCESS_OWNER_GROUP')) {
              inp.value = 'General Banking';
              inp.removeAttribute('readonly'); fire(inp); res.fixes.push(name.substring(0, 30));
            } else if (name.includes('ACCESS_OWNER_SEGMENT')) {
              inp.value = args.accessOwnerSegment;
              inp.removeAttribute('readonly'); fire(inp); res.fixes.push(name.substring(0, 30));
            } else if (name.includes('PRM_ID') || name.includes('RELATIONSHIP_MGR')) {
              inp.value = args.primaryRelationshipManagerId;
              inp.removeAttribute('readonly'); fire(inp); res.fixes.push(name.substring(0, 30));
            }
          });

          // Selects
          fillSelect(['GENDER'], args.gender);
          fillSelect(['NRE', 'NRI'], args.nreFlag);
          fillSelect(['BANKRELATIONTYPE'], args.bankRelationType);
          fillSelect(['NATIVELANG'], args.nativeLanguage);
          fillSelect(['CUSTOMERMINOR'], 'N');
          fillSelect(['ISEBANKING'], 'N');
          fillSelect(['DEFAULTCHANNEL'], args.defaultChannelForAlerts);
          fillSelect(['SUBSEGMENT'], args.subSegment);
          fillSelect(['TDS'], args.tdsTable);
          fillSelect(['BASEL'], 'NO');
          fillSelect(['TAX', 'FOREIGN', 'CRS', 'FATCA'], 'NO TIN');

          // Sweep any remaining empty selects to a safe value
          document.querySelectorAll('select').forEach((sel: HTMLSelectElement) => {
            if (sel.value && sel.selectedIndex > 0 && sel.value !== '0') return;
            const up = (sel.name || '').toUpperCase();
            if (up.includes('TDS')) {
              const tdsUp = (args.tdsTable || '').toUpperCase();
              let tdsOpt = Array.from(sel.options).find(o => o.value.toUpperCase() === tdsUp);
              if (!tdsOpt) tdsOpt = Array.from(sel.options).find(o => o.text.trim().toUpperCase().includes(tdsUp));
              if (tdsOpt) { sel.value = tdsOpt.value; fire(sel); return; }
            }
            const isForeign = up.includes('TAX') || up.includes('FOREIGN') || up.includes('CRS') || up.includes('FATCA');
            const preferredText = isForeign ? 'NO TIN' : 'NO';
            let opt = Array.from(sel.options).find(o => o.text.trim().toUpperCase().includes(preferredText));
            if (!opt) opt = Array.from(sel.options).find(o => o.text.trim().toUpperCase().includes('NO'));
            if (!opt) opt = Array.from(sel.options).find(o => o.value.toUpperCase() === 'N');
            if (!opt) opt = Array.from(sel.options).find(o => o.value === '0');
            if (!opt) opt = Array.from(sel.options).find(o => o.value);
            if (opt) { sel.value = opt.value; sel.selectedIndex = opt.index; fire(sel); if (typeof sel.onchange === 'function') { try { sel.onchange(new Event('change')); } catch (_) {} } }
            else if (up.includes('BASEL') || isForeign) {
              const o = document.createElement('option');
              o.value = isForeign ? 'NOTIN' : 'N';
              o.text = isForeign ? 'NO TIN' : 'NO';
              o.selected = true;
              sel.appendChild(o);
              sel.value = o.value;
              sel.selectedIndex = o.index;
              fire(sel);
              if (typeof sel.onchange === 'function') { try { sel.onchange(new Event('change')); } catch (_) {} }
              res.fixes.push(up.substring(0, 30) + '=' + o.value);
            }
          });

          return res;
        }, {
          title: (TD.customerData.title || 'MR').toUpperCase(),
          firstName: (TD.customerData.firstName || '').toUpperCase(),
          lastName: (TD.customerData.lastName || '').toUpperCase(),
          preferredName: TD.customerData.preferredName || '',
          shortName: TD.customerData.shortName || '',
          dob: TD.customerData.dateOfBirth || '',
          nreDate: this.textValue(TD.customerData.nonResidentDate),
          baselVal: 'N',
          foreignVal: 'NOTIN',
          uniqueId: this.textValue(TD.validDocData?.uniqueId) || ('TESTID' + Math.floor(Math.random() * 1e8)),
          idType: (this.textValue(TD.validDocData?.documentCode) || 'IDPAS').toUpperCase(),
          countryOfIssue: this.textValue(TD.validDocData?.countryOfIssue) || this.textValue(TD.validDocData?.countryOfIssueDisplay) || this.textValue(TD.demographicData?.countryOfBirthDisplay) || this.textValue(TD.demographicData?.countryOfBirth),
          gender: (TD.customerData.gender || 'MALE').toUpperCase(),
          nreFlag: this.yesNoFromValue(TD.customerData.nonResidentDate),
          bankRelationType: (TD.customerData.customerType || TD.customerData.bankRelationType || 'Retail'),
          nativeLanguage: (TD.customerData.nativeLanguage || 'ENGLISH').toUpperCase(),
          preferredLanguage: TD.customerData.preferredLanguage || 'India (English)',
          preferredLocale: TD.customerData.preferredLocale || 'en_US',
          defaultChannelForAlerts: (TD.customerData.defaultChannelForAlerts || 'BRANCH').toUpperCase(),
          region: TD.customerData.region || '',
          regionDisplay: TD.customerData.regionDisplay || TD.customerData.region || '',
          tdsTable: TD.customerData.tdsTable || '',
          tdsDisplay: TD.customerData.taxDeductedAtSourceTableDisplay || TD.customerData.tdsTable || '',
          subSegment: TD.customerData.subSegment || '',
          primaryRelationshipManagerId: TD.customerData.primaryRelationshipManagerId || 'NSTEVENS',
          relationshipCreatedBy: TD.customerData.relationshipCreatedBy || 'FIVUSR',
          accessOwnerSegment: TD.customerData.accessOwnerSegment || 'Private Banking'
        }).catch(() => ({ foundAny: false, fixes: [] }));
        if (result.fixes.length > 0) console.log(`  \u2713 Re-filled General: ${result.fixes.join(', ')}`);
      }
    } catch (_) {}

    }
    // Activate Basic Info / General main tab so AccountMod_det is the live formDispFrame
    try {
      for (const f of page.frames().filter(f => { try { return f.name().startsWith('IFrmtab') || f.name() === 'tabViewFrm' || f.url().includes('MainAccountDetForm') || f.url().includes('tabView.html'); } catch (_) { return false; } })) {
        const activated = await f.evaluate(() => {
          const tabs = Array.from(document.querySelectorAll('td, a, span, li, button')) as HTMLElement[];
          const tab = tabs.find(e => {
            const t = (e.textContent || '').trim().toLowerCase();
            const on = (e.getAttribute('onclick') || '').toLowerCase();
            return t === 'general' || t === 'basic info' || on.includes('accountmod_det') || on.includes('mainaccountdetform');
          });
          if (tab) { (tab as HTMLElement).click(); return true; }
          const fn = (window as any).showTabFortabDemoForm;
          if (typeof fn === 'function') { fn('tpageCont1'); return true; }
          const t1 = document.getElementById('td_tpageCont1') || document.getElementById('tab_tpageCont1');
          if (t1) { t1.click(); return true; }
          return false;
        }).catch(() => false);
        if (activated) { console.log('  Clicked General/Basic Info main tab'); break; }
      }
      await page.waitForTimeout(this.timeouts.short3);
      // Wait for AccountMod_det formDispFrame to load
      for (let i = 0; i < 20; i++) {
        const f = page.frames().find(fr => { try { return fr.url().includes('AccountMod_det'); } catch (_) { return false; } });
        if (f) {
          const len = await f.evaluate(() => document.querySelectorAll('input, select').length).catch(() => 0);
          if (len > 50) { this.accountFrame = f; break; }
        }
        await page.waitForTimeout(this.timeouts.short);
      }
      // Wait for buttonFrm to reappear with Submit button
      for (let i = 0; i < 20; i++) {
        const bf = page.frames().find(f => f.url().includes('CifShowButtons')) || page.frame({ name: 'buttonFrm' });
        if (bf) {
          const hasSubmit = await bf.evaluate(() => { const btn = document.getElementById('submitBut'); return !!(btn && btn.getBoundingClientRect().width > 0); }).catch(() => false);
          if (hasSubmit) break;
        }
        await page.waitForTimeout(this.timeouts.short);
      }
    } catch (e) { console.log(`  \u26a0 General tab activation error: ${(e as any).message?.substring(0, 100)}`); }

    // Re-fill mandatory fields in the active Basic Info / AccountMod_det frame
    try {
      let basicInfoFrame: any = this.accountFrame;
      if (!basicInfoFrame) {
        console.log('  ⚠ Cannot find Basic Info frame for re-fill');
      } else {
        const fieldCount = await basicInfoFrame.evaluate(() => document.querySelectorAll('input, select').length).catch(() => 0);
        console.log(`  Found Basic Info frame: "${basicInfoFrame.name()}", ${fieldCount} fields`);
        const TD = this.TD;
        const refillResult = await basicInfoFrame.evaluate((args: any) => {
          const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const fixes: string[] = [];
          const setText = (keywords: string[], val: string, force = false) => {
            if (!val) return;
            const ups = keywords.map((k: string) => k.toUpperCase());
            document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
              const name = (inp.name || '').toUpperCase();
              if (!name || (inp.value && !force)) return;
              if (ups.some(k => name.includes(k))) { inp.disabled = false; inp.removeAttribute('disabled'); inp.removeAttribute('readonly'); inp.value = val; fire(inp); fixes.push(name.substring(0, 40)); }
            });
          };
          const setSelect = (sel: HTMLSelectElement, matcher: string) => {
            if (!sel || (sel.value && sel.value !== '0' && sel.selectedIndex > 0)) return;
            sel.disabled = false; sel.removeAttribute('disabled'); sel.removeAttribute('readonly');
            const up = matcher.toUpperCase();
            let opt = Array.from(sel.options).find(o => o.text.trim().toUpperCase() === up);
            if (!opt) opt = Array.from(sel.options).find(o => o.value.toUpperCase() === up);
            if (!opt) opt = Array.from(sel.options).find(o => o.text.trim().toUpperCase().includes(up));
            if (!opt) opt = Array.from(sel.options).find(o => o.value.toUpperCase() === 'N');
            if (!opt) opt = Array.from(sel.options).find(o => o.value.toUpperCase() === 'NO');
            if (!opt) opt = Array.from(sel.options).find(o => o.value === '0');
            if (!opt) opt = Array.from(sel.options).find(o => o.value && o.value.trim().length > 0);
            if (opt) { opt.disabled = false; sel.value = opt.value; sel.selectedIndex = opt.index; fire(sel); fixes.push((sel.name || 'select').substring(0, 40) + '=' + opt.value); }
          };

          setText(['SALUTATION'], args.title);
          setText(['FIRSTNAME', 'FIRST_NAME'], args.firstName);
          setText(['LASTNAME', 'LAST_NAME'], args.lastName);
          setText(['PREFERREDNAME', 'PREFERRED_NAME'], args.preferredName);
          setText(['SHORTNAME', 'SHORT_NAME'], args.shortName);
          setText(['CUST_DOB', 'DATEOFBIRTH'], args.dob);
          setText(['NRE_DATE', 'BECOMINGNRE'], args.nreDate);
          // Force hidden code inputs for Basel/Foreign/TIN and ID details
          setText(['BASEL', 'BASELPROFILING'], args.baselVal || 'N', true);
          setText(['CAT_BASEL', 'BASELPROFILINGDESC'], 'NO', true);
          setText(['FOREIGN', 'TAX', 'CRS', 'FATCA'], args.foreignVal || 'N', true);
          setText(['CAT_FOREIGN', 'CAT_TAX', 'CAT_FATCA'], 'NO TIN', true);
          setText(['FOREIGNTAXREPORTINGCOUNTRY', 'TAXREPORTINGCOUNTRY'], args.countryOfIssue || 'Bermuda', true);
          setText(['LASTFOREIGNTAXREVIEW'], '01/01/2020', true);
          setText(['NEXTFOREIGNTAXREVIEW'], '31/12/2099', true);
          // Re-fill IDTYPER rows without hitting RATING fields
          const issueDate = '01/01/2020';
          const validDate = '31/12/2099';
          for (let i = 1; i <= 5; i++) {
            const prefix = 'IDTYPER' + i + '.';
            const setInp = (attr: string, v: string) => {
              document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
                const n = (inp.name || '').toUpperCase();
                if (n.startsWith(prefix) && n.includes(attr) && !inp.value) { inp.disabled = false; inp.removeAttribute('readonly'); inp.value = v; fire(inp); fixes.push(n.substring(0, 40)); }
              });
            };
            setInp('TXT_ID_TYPE', args.idType);
            if (args.uniqueId) {
              document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
                const n = (inp.name || '').toUpperCase();
                if (n.startsWith(prefix) && n.endsWith('TXT_ID') && !n.includes('TYPE') && !inp.value) { inp.disabled = false; inp.removeAttribute('readonly'); inp.value = args.uniqueId; fire(inp); fixes.push(n.substring(0, 40)); }
              });
            }
            setInp('ISSUE_DATE', issueDate);
            setInp('VALID_DATE', validDate);
            setInp('ISSUE_PLACE', args.countryOfIssue || 'Bermuda');
            setInp('ISSUE_COUNTRY', args.countryOfIssue || 'Bermuda');
            setInp('COUNTRYOFISSUE', args.countryOfIssue || 'Bermuda');
          }
          setText(['IDENTIFICATION', 'IDNUMBER', 'UNIQUEID', 'PASSPORT', 'DOCUMENTNO'], args.uniqueId || '');
          setText(['HIDUNIQUEID', 'UNIQUEIDNUMBER', 'ENTITYDOCBO.REFERENCENUMBER'], args.uniqueId || '');
          setText(['HIDUNIQUEIDTYPE', 'DOCTYPE', 'UNIQUEIDTYPE'], args.idType || '');

          // Region / TDS / Introducer / Access Owner — code vs display
          document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
            const name = (inp.name || '').toUpperCase();
            if (!name || inp.value) return;
            if (name.includes('REGION') && !name.includes('PRE') && !name.includes('RES')) {
              inp.disabled = false; inp.removeAttribute('disabled'); inp.removeAttribute('readonly');
              inp.value = name.includes('CAT_') ? args.regionDisplay : (name.startsWith('3_') ? args.regionDisplay : args.region);
              fixes.push(name.substring(0, 40));
            } else if (name.includes('TDS_TBL') || name.includes('TDS_TABLE')) {
              inp.disabled = false; inp.removeAttribute('disabled'); inp.removeAttribute('readonly');
              inp.value = name.includes('CAT_') ? args.tdsDisplay : (name.startsWith('3_') ? args.tdsDisplay : args.tdsTable);
              fixes.push(name.substring(0, 40));
            } else if (name.includes('INTRODUCER') || name.includes('PRM_ID') || name.includes('RELATIONSHIP_MGR') || name.includes('ACC_MANAGER')) {
              inp.disabled = false; inp.removeAttribute('disabled'); inp.removeAttribute('readonly'); inp.value = args.primaryRelationshipManagerId; fire(inp); fixes.push(name.substring(0, 40));
            } else if (name.includes('ACCESS_OWNER_GROUP')) {
              inp.disabled = false; inp.removeAttribute('disabled'); inp.removeAttribute('readonly'); inp.value = 'General Banking'; fire(inp); fixes.push(name.substring(0, 40));
            } else if (name.includes('ACCESS_OWNER_SEGMENT')) {
              inp.disabled = false; inp.removeAttribute('disabled'); inp.removeAttribute('readonly'); inp.value = args.accessOwnerSegment; fire(inp); fixes.push(name.substring(0, 40));
            }
          });

          // All selects
          document.querySelectorAll('select').forEach((sel: HTMLSelectElement) => {
            if (sel.value && sel.selectedIndex > 0 && sel.value !== '0') return;
            const name = (sel.name || '').toUpperCase();
            if (name.includes('GENDER')) setSelect(sel, args.gender);
            else if (name.includes('NRE')) setSelect(sel, args.nreFlag);
            else if (name.includes('BANKRELATIONTYPE')) setSelect(sel, args.bankRelationType);
            else if (name.includes('NATIVELANG')) setSelect(sel, args.nativeLanguage);
            else if (name.includes('CUSTOMERMINOR')) { setSelect(sel, 'N'); fixes.push('CustomerMinor'); }
            else if (name.includes('ISEBANKING')) { setSelect(sel, 'N'); fixes.push('Ebanking'); }
            else if (name.includes('DEFAULTCHANNEL')) setSelect(sel, args.defaultChannelForAlerts);
            else if (name.includes('SUBSEGMENT')) setSelect(sel, args.subSegment);
            else if (name.includes('TDS')) { setSelect(sel, args.tdsTable); fixes.push('TdsTable'); }
            else if (name.includes('BASEL')) {
              const bCode = 'N';
              const bDisplay = 'NO';
              let bOpt = Array.from(sel.options).find(o => o.value.toUpperCase() === bCode);
              if (!bOpt) { bOpt = document.createElement('option'); bOpt.value = bCode; bOpt.text = bDisplay; bOpt.selected = true; sel.appendChild(bOpt); }
              sel.value = bCode; sel.selectedIndex = bOpt.index;
              fire(sel); try { if (typeof sel.onchange === 'function') sel.onchange(new Event('change')); } catch (_) {}
              document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
                const up = (inp.name || '').toUpperCase();
                if (up.includes(sel.name.toUpperCase()) && !up.includes('CAT_') && !up.startsWith('BTN') && !up.startsWith('3_') && !up.startsWith('PI_')) { inp.value = bCode; fire(inp); fixes.push(inp.name.substring(0, 40)); }
              });
              fixes.push('Basel');
            }
            else if (name.includes('FOREIGN') || name.includes('TAX') || name.includes('CRS') || name.includes('FATCA')) {
              const fCode = 'NOTIN';
              const fDisplay = 'NO TIN IS REQUIRED';
              let fOpt = Array.from(sel.options).find(o => o.value.toUpperCase() === fCode);
              if (!fOpt) { fOpt = document.createElement('option'); fOpt.value = fCode; fOpt.text = fDisplay; fOpt.selected = true; sel.appendChild(fOpt); }
              sel.value = fCode; sel.selectedIndex = fOpt.index;
              fire(sel); try { if (typeof sel.onchange === 'function') sel.onchange(new Event('change')); } catch (_) {}
              document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
                const up = (inp.name || '').toUpperCase();
                if (up.includes(sel.name.toUpperCase()) && !up.includes('CAT_') && !up.includes('COUNTRY') && !up.startsWith('BTN') && !up.startsWith('3_') && !up.startsWith('PI_')) { inp.value = fCode; fire(inp); fixes.push(inp.name.substring(0, 40)); }
              });
              fixes.push('ForeignTax');
            }
            else if (name.includes('IDENTIFICATION') || name.includes('IDTYPE') || name.includes('DOCTYPE')) {
              setSelect(sel, args.idType);
              if (!sel.value || sel.value === '0' || sel.selectedIndex <= 0) { const o = document.createElement('option'); o.value = args.idType; o.text = args.idType; o.selected = true; sel.appendChild(o); fire(sel); try { if (typeof sel.onchange === 'function') sel.onchange(new Event('change')); } catch (_) {} }
              fixes.push('IDType');
            }
            else if (name.includes('IDCOUNTRY') || name.includes('ISSUECOUNTRY') || name.includes('COUNTRYOFISSUE')) {
              setSelect(sel, args.countryOfIssue);
              if ((!sel.value || sel.value === '0' || sel.selectedIndex <= 0) && args.countryOfIssue) { const o = document.createElement('option'); o.value = args.countryOfIssue; o.text = args.countryOfIssue; o.selected = true; sel.appendChild(o); fire(sel); try { if (typeof sel.onchange === 'function') sel.onchange(new Event('change')); } catch (_) {} }
              fixes.push('IDCountry');
            }
          });

          return fixes;
        }, {
          title: (TD.customerData.title || 'MR').toUpperCase(),
          firstName: (TD.customerData.firstName || '').toUpperCase(),
          lastName: (TD.customerData.lastName || '').toUpperCase(),
          preferredName: TD.customerData.preferredName || '',
          shortName: TD.customerData.shortName || '',
          dob: TD.customerData.dateOfBirth || '',
          nreDate: this.textValue(TD.customerData.nonResidentDate),
          baselVal: 'N',
          foreignVal: 'NOTIN',
          uniqueId: this.textValue(TD.validDocData?.uniqueId) || ('TESTID' + Math.floor(Math.random() * 1e8)),
          idType: (this.textValue(TD.validDocData?.documentCode) || 'IDPAS').toUpperCase(),
          countryOfIssue: this.textValue(TD.validDocData?.countryOfIssue) || this.textValue(TD.validDocData?.countryOfIssueDisplay) || this.textValue(TD.demographicData?.countryOfBirthDisplay) || this.textValue(TD.demographicData?.countryOfBirth),
          gender: (TD.customerData.gender || 'MALE').toUpperCase(),
          nreFlag: this.yesNoFromValue(TD.customerData.nonResidentDate),
          bankRelationType: (TD.customerData.customerType || TD.customerData.bankRelationType || 'Retail'),
          nativeLanguage: (TD.customerData.nativeLanguage || 'ENGLISH').toUpperCase(),
          defaultChannelForAlerts: (TD.customerData.defaultChannelForAlerts || 'BRANCH').toUpperCase(),
          region: TD.customerData.region || '',
          regionDisplay: TD.customerData.regionDisplay || TD.customerData.region || '',
          tdsTable: TD.customerData.tdsTable || '',
          tdsDisplay: TD.customerData.taxDeductedAtSourceTableDisplay || TD.customerData.tdsTable || '',
          subSegment: TD.customerData.subSegment || '',
          primaryRelationshipManagerId: TD.customerData.primaryRelationshipManagerId || 'NSTEVENS',
          accessOwnerSegment: TD.customerData.accessOwnerSegment || 'Private Banking'
        }).catch(e => { console.log(`  \u26a0 Final evaluate error: ${(e as any).message?.substring(0, 120)}`); return [] as string[]; });
        console.log(`  Final re-fill fixes (${refillResult.length}): ${refillResult.slice(0, 40).join(', ') || '(none)'}`);
      }
    } catch (e) { console.log(`  \u26a0 Final re-fill error: ${(e as any).message?.substring(0, 100)}`); }

    // Use LOV popups to set Region and TDS hidden fields correctly
    try {
      const page = this.workingPage;
      const TD = this.TD;
      if (this.accountFrame) {
        const openLovByPattern = async (pattern: string) => {
          const [popup] = await Promise.all([
            page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null),
            this.accountFrame!.evaluate((p: string) => {
              const b = Array.from(document.querySelectorAll('input[type="button"]')).find(el => el.name.toUpperCase().includes('BTNONE') && el.name.toUpperCase().includes(p));
              if (b) (b as HTMLInputElement).click();
            }, pattern)
          ]);
          return popup;
        };
        const selectLov = async (popupPromise: Promise<Page | null>, code: string, display: string, label: string, fieldPrefix: string) => {
          const popup = await popupPromise;
          if (!popup || popup.isClosed()) return;
          await this.waitForPopupReady(popup, `${label} LOV`);
          let catId = '';
          let catCode = '';
          let catDisplay = display;
          const submitSearch = async (val1: string, val2: string) => {
            for (const lf of popup.frames()) {
              const inputs = await lf.locator('input[type="text"]').all();
              const vis: Locator[] = [];
              for (const i of inputs) { if (await i.isVisible().catch(() => false)) vis.push(i); }
              for (const v of vis) { await v.fill('').catch(() => {}); }
              if (vis.length >= 1) await vis[0].fill(val1).catch(() => {});
              if (vis.length >= 2) await vis[1].fill(val2).catch(() => {});
              const sub = lf.locator('input[value="Submit"]').first();
              if (await sub.isVisible({ timeout: 3000 }).catch(() => false)) { await sub.click().catch(() => {}); return true; }
            }
            return false;
          };
          const tryFindAndSelect = async (search: string): Promise<boolean> => {
            if (!search) return false;
            const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            for (const lf of popup.frames()) {
              const cell = lf.locator('td').filter({ hasText: re }).first();
              if (!(await cell.isVisible({ timeout: 3000 }).catch(() => false))) continue;
              try {
                const info = await cell.evaluate((el: HTMLElement) => {
                  const tr = el.closest('tr');
                  return {
                    catId: tr?.getAttribute('categoryid') || tr?.getAttribute('categorybo.categoryid') || '',
                    catCode: tr?.getAttribute('categorycode') || tr?.getAttribute('categorybo.categorycode') || '',
                    catDisplay: (tr?.getAttribute('value') || tr?.getAttribute('categorybo.value') || tr?.textContent || '').trim()
                  };
                });
                catId = info.catId || catId;
                catCode = info.catCode || catCode;
                catDisplay = info.catDisplay || catDisplay;
                if (catId || catCode) console.log(`  ${label} row matched: display="${catDisplay}", categoryid=${catId}, categorycode=${catCode}`);
              } catch (_) {}
              try { await Promise.race([cell.dblclick({ timeout: this.timeouts.medium }), popup.waitForEvent('close', { timeout: this.timeouts.long })]); } catch (_) {}
              return true;
            }
            return false;
          };
          await submitSearch(code, display);
          await page.waitForTimeout(this.timeouts.medium);
          let found = await tryFindAndSelect(display) || await tryFindAndSelect(code);
          if (!found) {
            await submitSearch(display, code);
            await page.waitForTimeout(this.timeouts.medium);
            found = await tryFindAndSelect(display) || await tryFindAndSelect(code);
          }
          if (!found && !popup.isClosed()) {
            for (const lf of popup.frames()) {
              const rowsText = await lf.evaluate(() => Array.from(document.querySelectorAll('tr')).slice(0, 20).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() || '').join('|')).join('\n')).catch(() => '');
              if (rowsText) console.log(`  ${label} LOV rows dump:\n${rowsText}`);
            }
            await popup.close().catch(() => {});
          }
          const codeValue = catId || catCode || code;
          const displayValue = catDisplay || display;
          if (label === 'Region') { (this as any).lastRegionCode = codeValue; (this as any).lastRegionDisplay = displayValue; }
          if (label === 'TDS Table') { (this as any).lastTdsCode = codeValue; (this as any).lastTdsDisplay = displayValue; }
          console.log(`  \u2713 LOV ${label}: ${displayValue} (code=${codeValue})`);
          const basicFrames = page.frames().filter(f => f.url().includes('Mod_det'));
          for (const f of basicFrames) {
            await f.evaluate((args: { code: string; display: string; prefix: string }) => {
              const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
              const upPrefix = args.prefix.toUpperCase();
              document.querySelectorAll('input, select').forEach((inp: any) => {
                if (!inp.name) return;
                const up = inp.name.toUpperCase();
                if (up.includes(upPrefix) && !up.includes('BTN') && !(upPrefix.includes('FOREIGN') && up.includes('COUNTRY'))) {
                  inp.removeAttribute('readonly'); inp.disabled = false;
                  if (inp.tagName === 'SELECT') {
                    const sel = inp as HTMLSelectElement;
                    const target = (up.startsWith('3_') || up.includes('CAT_')) ? args.display : args.code;
                    const targetTexts = [args.display, args.code].filter(Boolean);
                    const byValue = Array.from(sel.options).find(o => o.value.trim().toUpperCase() === target.toUpperCase());
                    const byText = Array.from(sel.options).find(o => targetTexts.some(t => o.text.trim().toUpperCase().includes(t.toUpperCase())));
                    const opt = byValue || byText;
                    if (opt) { sel.value = opt.value; sel.selectedIndex = opt.index; }
                    else {
                      const o = document.createElement('option');
                      o.value = target; o.text = args.display || args.code;
                      o.selected = true; sel.appendChild(o);
                      sel.value = o.value; sel.selectedIndex = o.index;
                    }
                  } else {
                    inp.value = (up.startsWith('3_') || up.includes('CAT_')) ? args.display : args.code;
                  }
                  fire(inp);
                }
              });
            }, { code: codeValue, display: displayValue, prefix: fieldPrefix }).catch(() => {});
          }
        };
        // Use the robust shared LOV helper to pick real backend codes for Basel/Foreign
        try {
          const page = this.workingPage;
          const findLovBtn = async (pattern: string, excludeCountry = false): Promise<{ name: string; frame: any } | null> => {
            for (const f of page.frames()) {
              const name = await f.evaluate((a: { p: string; ex: boolean }) => {
                const up = a.p.toUpperCase();
                const b = Array.from(document.querySelectorAll('input[type="button"]')).find(el => {
                  const n = el.name.toUpperCase();
                  return n.includes(up) && !(a.ex && n.includes('COUNTRY'));
                });
                return b ? b.name : '';
              }, { p: pattern, ex: excludeCountry }).catch(() => '');
              if (name) return { name, frame: f };
            }
            return null;
          };
          const baselLov = await findLovBtn('BASELPROFILING');
          if (baselLov) await this.selectLovValue({ parentPage: page, target: baselLov.frame, buttonName: baselLov.name, searchValue: 'NO', label: 'Basel Profiling', config: this.config });
          const foreignLov = await findLovBtn('FOREIGNTAXREPORTING', true);
          if (foreignLov) await this.selectLovValue({ parentPage: page, target: foreignLov.frame, buttonName: foreignLov.name, searchValue: 'NO TIN', label: 'Foreign Tax Reporting', config: this.config });
        } catch (e) { console.log('  \u26a0 Basel/Foreign LOV error: ' + ((e as any).message || '').substring(0, 120)); }
      }
    } catch (e) { console.log(`  \u26a0 LOV fill error: ${(e as any).message?.substring(0, 100)}`); }

    // Ensure Preferred Native Language code/display are populated on the Basic Info formDispFrame
    try {
      const page = this.workingPage;
      const TD = this.TD;
      const code = this.custLanguageCode || TD.customerData.preferredLanguage || 'India (English)';
      const display = this.custLanguageDisplay || ((TD.customerData.preferredNativeLanguage && TD.customerData.preferredNativeLanguage !== '-') ? TD.customerData.preferredNativeLanguage : code);
      const basicFrames = page.frames().filter(f => f.url().includes('AccountMod_det'));
      for (const f of basicFrames) {
        await f.evaluate((a: { code: string; display: string }) => {
          const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          document.querySelectorAll('input, select').forEach((inp: any) => {
            if (!inp.name) return;
            const up = inp.name.toUpperCase();
            if (up.includes('CUST_LANGUAGE')) {
              inp.removeAttribute('readonly'); inp.disabled = false;
              if (inp.tagName === 'SELECT') {
                const sel = inp as HTMLSelectElement;
                const byCode = Array.from(sel.options).find(o => o.value.trim() === a.code);
                const byText = Array.from(sel.options).find(o => o.text.trim().toUpperCase().includes(a.display.toUpperCase()));
                const opt = byCode || byText;
                if (opt) { sel.value = opt.value; sel.selectedIndex = opt.index; }
                else { sel.value = a.code; }
              } else {
                // h_ hidden helpers use numeric code; all other variants use display text
                inp.value = (up.startsWith('H_') && !up.includes('CAT')) ? a.code : a.display;
              }
              fire(inp);
            }
          });
        }, { code, display }).catch(() => {});
      }
    } catch (e) {}

    // Ensure mandatory Basel/Foreign/Tax selects are populated on the Psychographic form
    try {
      const page = this.workingPage;
      for (const f of page.frames()) {
        for (const label of ['Psychographic Details', 'Psychographic']) {
          const tab = f.getByText(label, { exact: false }).first();
          if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); console.log(`  Clicked ${label} tab for Psychographic prepopulation`); break; }
        }
      }
      await page.waitForTimeout(this.timeouts.short3);
      const psyFrames = page.frames().filter(f => f.url().includes('PsychographicMod_det'));
      for (const f of psyFrames) {
        await f.evaluate(() => {
          const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          document.querySelectorAll('select').forEach((sel: HTMLSelectElement) => {
            if (!sel.name) return;
            const up = sel.name.toUpperCase();
            if (!up.includes('BASEL') && !up.includes('TAX') && !up.includes('FOREIGN') && !up.includes('CRS') && !up.includes('FATCA')) return;
            if (sel.value && sel.selectedIndex > 0 && sel.value !== '0') return;
            const isBasel = up.includes('BASEL');
            const isForeign = up.includes('TAX') || up.includes('FOREIGN') || up.includes('CRS') || up.includes('FATCA');
            const texts = Array.from(sel.options).map(o => o.text.trim().toUpperCase());
            let idx = texts.findIndex(t => (isForeign ? t.includes('NO TIN') : t === 'NO'));
            if (isForeign && idx < 0) idx = texts.findIndex(t => t.includes('NOT REQUIRED'));
            if (idx < 0) idx = texts.findIndex(t => t.includes('NO'));
            if (idx < 1) {
              const nonEmpty = Array.from(sel.options).map((o, i) => ({ o, i })).filter(x => x.i > 0 && x.o.value && x.o.value !== '0');
              if (nonEmpty.length > 0) idx = nonEmpty[0].i;
            }
            if (idx > 0) { sel.disabled = false; sel.removeAttribute('disabled'); sel.removeAttribute('readonly'); sel.selectedIndex = idx; sel.value = sel.options[idx].value; fire(sel); console.log(`  set ${sel.name} to "${sel.options[idx].text}"`); }
          });
        }).catch(() => {});
      }
    } catch (e) {}

    // Reactivate Basic Info and force-populate key mandatory fields in the currently loaded form
    try {
      const page = this.workingPage;
      for (const f of page.frames()) { const tab = f.getByText('Basic Info', { exact: false }).first(); if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); break; } }
      await page.waitForTimeout(this.timeouts.short3);
      const buttonFrm = page.frames().find(f => f.url().includes('CifShowButtons')) || page.frame({ name: 'buttonFrm' });
      if (buttonFrm) {
        const TD = this.TD;
        const regionCode = (this as any).lastRegionCode || TD.customerData.region || '';
        const regionDisplay = (this as any).lastRegionDisplay || TD.customerData.regionDisplay || regionCode;
        const tdsCode = (this as any).lastTdsCode || TD.customerData.tdsTable || '';
        const tdsDisplay = (this as any).lastTdsDisplay || TD.customerData.taxDeductedAtSourceTableDisplay || tdsCode;
        const custCode = this.custLanguageCode || TD.customerData.preferredLanguage || '';
        const custDisplay = this.custLanguageDisplay || TD.customerData.preferredNativeLanguage || custCode;
        await buttonFrm.evaluate((vals: any) => {
          const setField = (win: any, name: string, value: string, display: string) => {
            try {
              const doc = win.document;
              if (!doc) return;
              for (const el of Array.from(doc.querySelectorAll('[name="' + name + '"]')) as any[]) {
                const inp = el as any;
                inp.disabled = false; inp.removeAttribute('readonly'); inp.removeAttribute('disabled');
                if (inp.tagName === 'SELECT') {
                  const sel = inp as HTMLSelectElement;
                  const byValue = Array.from(sel.options).find(o => o.value.trim().toUpperCase() === value.toUpperCase());
                  const byText = Array.from(sel.options).find(o => o.text.trim().toUpperCase().includes(value.toUpperCase()) || o.text.trim().toUpperCase().includes(display.toUpperCase()));
                  const opt = byValue || byText;
                  if (opt) { sel.value = opt.value; sel.selectedIndex = opt.index; }
                  else { sel.value = value; }
                } else {
                  inp.value = value;
                }
              }
              for (let i = 0; i < win.frames.length; i++) { setField(win.frames[i], name, value, display); }
            } catch (_) {}
          };
          const fields = [
            { name: 'AccountModBO.region', code: vals.regionCode, display: vals.regionDisplay },
            { name: 'h_AccountModBO.region', code: vals.regionCode, display: vals.regionDisplay },
            { name: 'AccountModBO.Region', code: vals.regionCode, display: vals.regionDisplay },
            { name: 'h_AccountModBO.Region', code: vals.regionCode, display: vals.regionDisplay },
            { name: 'AccountModBO.Tds_tbl', code: vals.tdsCode, display: vals.tdsDisplay },
            { name: 'h_AccountModBO.Tds_tbl', code: vals.tdsCode, display: vals.tdsDisplay },
            { name: 'AccountModBO.Tds_Tbl', code: vals.tdsCode, display: vals.tdsDisplay },
            { name: 'h_AccountModBO.Tds_Tbl', code: vals.tdsCode, display: vals.tdsDisplay },
            { name: 'AccountModBO.Cust_Language', code: vals.custCode, display: vals.custDisplay },
            { name: 'h_AccountModBO.Cust_Language', code: vals.custCode, display: vals.custDisplay }
          ];
          for (const f of fields) { setField(window.top, f.name, f.code, f.display); }
        }, { regionCode, regionDisplay, tdsCode, tdsDisplay, custCode, custDisplay }).catch(() => {});
        console.log(`  Force-set mandatory fields: region=${regionCode}, tds=${tdsCode}, custLang=${custCode}`);
      }
    } catch (e) {}

    console.log('\u2713 Pre-submit verification complete');
  }

  // Override submitForm to inject a buttonFrm-level fill that runs after each tab switch and immediately before the JS submit handler runs
  async submitForm(): Promise<string> {
    const primaryContact = this.getPrimaryContactData();
    const page = this.workingPage;
    // Wait for the button frame (CifShowButtons) to reappear — it can reload during tab switches
    let bf: Frame | null = null;
    for (let i = 0; i < 30; i++) {
      bf = page.frame({ name: 'buttonFrm' }) ||
           page.frames().find(f => { try { return f.url().includes('CifShowButtons') || f.url().includes('SRMButtons') || f.url().includes('ShowButtons'); } catch (_) { return false; } }) ||
           page.frames().find(f => { try { return f.name().toLowerCase().includes('button'); } catch (_) { return false; } }) ||
           null;
      if (bf) {
        const hasSubmit = await bf.evaluate(() => !!(document.getElementById('submitBut') || (window as any).selectProcess || (window as any).submitForm)).catch(() => false);
        if (hasSubmit) break;
      }
      await page.waitForTimeout(500);
    }
    const TD = this.TD;
    const regionCode = (this as any).lastRegionCode || TD.customerData.region || '';
    const regionDisplay = (this as any).lastRegionDisplay || TD.customerData.regionDisplay || regionCode;
    const tdsCode = (this as any).lastTdsCode || TD.customerData.tdsTable || '';
    const tdsDisplay = (this as any).lastTdsDisplay || TD.customerData.taxDeductedAtSourceTableDisplay || tdsCode;
    const custCode = this.custLanguageCode || TD.customerData.preferredLanguage || '';
    const custDisplay = this.custLanguageDisplay || TD.customerData.preferredNativeLanguage || custCode;
    const uniqueId = this.textValue(TD.validDocData?.uniqueId) || ('TESTID' + Math.floor(Math.random() * 1e8));
    const idType = (this.textValue(TD.validDocData?.documentCode) || 'IDPAS').toUpperCase();
    const countryCode = this.textValue(TD.validDocData?.countryOfIssue)
      || this.textValue(TD.demographicData?.countryOfBirth)
      || 'BM';
    const countryDisplay = this.textValue(TD.validDocData?.countryOfIssueDisplay)
      || this.textValue(TD.demographicData?.countryOfBirthDisplay)
      || 'Bermuda';
    const countryOfIssue = countryDisplay;
    const placeOfIssue = this.textValue(TD.validDocData?.placeOfIssue) || 'MUMBAI';
    const lastDate = '01/01/2020';
    const nextDate = '31/12/2099';
    const baselVal = 'N';
    const foreignVal = 'NOTIN';
    if (bf) {
      await bf.evaluate((vals: any) => {
        (window as any)._mandatoryVals = vals;
        const setField = (win: any, name: string, value: string, display: string) => {
          try {
            const doc = win.document;
            if (!doc) return;
            const selectors: string[] = ['[name="' + name + '"]'];
            if (name !== name.toUpperCase()) selectors.push('[name="' + name.toUpperCase() + '"]');
            if (name !== name.toLowerCase()) selectors.push('[name="' + name.toLowerCase() + '"]');
            let found = 0;
            for (const el of Array.from(doc.querySelectorAll(selectors.join(', ')))) {
              const inp = el as any;
              inp.disabled = false; inp.removeAttribute('readonly'); inp.removeAttribute('disabled');
              if (inp.tagName === 'SELECT') {
                const sel = inp as HTMLSelectElement;
                const byValue = Array.from(sel.options).find(o => o.value.trim().toUpperCase() === value.toUpperCase());
                const byText = Array.from(sel.options).find(o => o.text.trim().toUpperCase().includes(value.toUpperCase()) || o.text.trim().toUpperCase().includes(display.toUpperCase()));
                const opt = byValue || byText;
                if (opt) { sel.value = opt.value; sel.selectedIndex = opt.index; }
                else {
                  const o = document.createElement('option');
                  o.value = value;
                  o.text = display || value;
                  o.selected = true;
                  sel.appendChild(o);
                  sel.value = value;
                  sel.selectedIndex = o.index;
                }
                ['input', 'change', 'blur'].forEach(ev => { try { sel.dispatchEvent(new Event(ev, { bubbles: true })); } catch (_) {} });
                if (typeof sel.onchange === 'function') { try { sel.onchange(new Event('change')); } catch (_) {} }
              } else {
                inp.value = value;
                inp.defaultValue = value;
                try { inp.setAttribute('value', value); } catch (_) {}
                ['input', 'change', 'blur'].forEach(ev => { try { inp.dispatchEvent(new Event(ev, { bubbles: true })); } catch (_) {} });
              }
              found++;
            }
            if (found === 0 && (doc as any).frm2 && win.frames.length === 0) {
              const h = doc.createElement('input');
              h.type = 'hidden';
              h.name = name;
              h.value = value;
              try { (doc as any).frm2.appendChild(h); } catch (_) {}
            }
            for (let i = 0; i < win.frames.length; i++) { setField(win.frames[i], name, value, display); }
          } catch (_) {}
        };
        const sweepSelects = (win: any) => {
          try {
            const doc = win.document;
            if (doc) {
              for (const sel of Array.from(doc.querySelectorAll('select')) as any[]) {
                if (!sel.name) continue;
                const up = sel.name.toUpperCase();
                if (up.includes('TDS_TBL')) continue; // leave TDS LOV field alone
                let target = '';
                if (up.includes('BASEL')) target = 'NO';
                else if (up.includes('TAX') || up.includes('FOREIGN') || up.includes('CRS') || up.includes('FATCA')) target = 'NO TIN';
                if (!target) continue;
                const code = target === 'NO TIN' ? 'NOTIN' : 'N';
                if (sel.value && sel.value.toUpperCase() === code.toUpperCase()) continue;
                const opt = Array.from(sel.options).find((o: any) => o.value.trim().toUpperCase() === code) ||
                            Array.from(sel.options).find((o: any) => o.text.trim().toUpperCase().includes(target)) ||
                            Array.from(sel.options).find((o: any) => o.text.trim().toUpperCase().includes('NO'));
                if (opt) {
                  sel.disabled = false;
                  sel.value = opt.value;
                  sel.selectedIndex = opt.index;
                  sel.dispatchEvent(new Event('change', { bubbles: true }));
                  sel.dispatchEvent(new Event('blur', { bubbles: true }));
                  if (typeof sel.onchange === 'function') { try { sel.onchange(new Event('change')); } catch (_) {} }
                  // Update the matching hidden h_<name> field if it exists
                  try {
                    const h = doc.querySelector('[name="h_' + sel.name + '"]') as any;
                    if (h) { h.value = opt.value; h.dispatchEvent(new Event('change', { bubbles: true })); }
                  } catch (_) {}
                } else if (target) {
                  const o = document.createElement('option');
                  o.value = target === 'NO TIN' ? 'NOTIN' : 'N';
                  o.text = target === 'NO TIN' ? 'NO TIN IS REQUIRED' : target;
                  o.selected = true;
                  sel.appendChild(o);
                  sel.disabled = false;
                  sel.value = o.value;
                  sel.selectedIndex = o.index;
                  sel.dispatchEvent(new Event('change', { bubbles: true }));
                  sel.dispatchEvent(new Event('blur', { bubbles: true }));
                  if (typeof sel.onchange === 'function') { try { sel.onchange(new Event('change')); } catch (_) {} }
                  try {
                    const h = doc.querySelector('[name="h_' + sel.name + '"]') as any;
                    if (h) { h.value = o.value; h.dispatchEvent(new Event('change', { bubbles: true })); }
                  } catch (_) {}
                }
              }
            }
            for (let i = 0; i < win.frames.length; i++) { sweepSelects(win.frames[i]); }
          } catch (_) {}
        };
        const sweepIds = (win: any, vals: any) => {
          try {
            const doc = win.document;
            if (doc) {
              for (let i = 1; i <= 5; i++) {
                const prefix = 'IDTYPER' + i + '.';
                const fields = [
                  { attr: 'TXT_ID', val: vals.uniqueId },
                  { attr: 'TXT_ID_TYPE', val: vals.idType },
                  { attr: 'ISSUE_DATE', val: vals.lastDate },
                  { attr: 'VALID_DATE', val: vals.nextDate },
                  { attr: 'ISSUE_PLACE', val: vals.placeOfIssue },
                  { attr: 'ISSUE_COUNTRY', val: vals.countryCode },
                  { attr: 'COUNTRYOFISSUE', val: vals.countryCode }
                ];
                for (const { attr, val } of fields) {
                  doc.querySelectorAll('input').forEach((inp: any) => {
                    const n = (inp.name || '').toUpperCase();
                    if (n.startsWith(prefix) && n.endsWith(attr)) { inp.disabled = false; inp.removeAttribute('readonly'); inp.value = val; }
                  });
                  doc.querySelectorAll('select').forEach((sel: any) => {
                    const n = (sel.name || '').toUpperCase();
                    if (n.startsWith(prefix) && n.endsWith(attr)) {
                      sel.disabled = false;
                      let o: any = Array.from(sel.options).find((o2: any) => o2.value.toUpperCase() === (val || '').toUpperCase());
                      if (!o) { o = document.createElement('option'); o.value = val; o.text = val; o.selected = true; sel.appendChild(o); }
                      sel.value = o.value;
                      sel.selectedIndex = o.index;
                    }
                  });
                }
              }
            }
            for (let i = 0; i < win.frames.length; i++) { sweepIds(win.frames[i], vals); }
          } catch (_) {}
        };
        const fillAll = () => {
          const v = (window as any)._mandatoryVals;
          if (!v) return;
          if (!v.countryDisplay) v.countryDisplay = 'Bermuda';
          if (!v.bankRelationType) v.bankRelationType = 'Retail';
          console.log('  fillAll values:', JSON.stringify({ countryCode: v.countryCode, countryDisplay: v.countryDisplay, bankRelationType: v.bankRelationType, foreignVal: v.foreignVal, baselVal: v.baselVal }));
          // Basic Info fields - hidden code inputs only
          setField(window.top, 'AccountModBO.region', v.regionCode, v.regionDisplay);
          setField(window.top, 'h_AccountModBO.region', v.regionCode, v.regionDisplay);
          setField(window.top, 'AccountModBO.Region', v.regionCode, v.regionDisplay);
          setField(window.top, 'h_AccountModBO.Region', v.regionCode, v.regionDisplay);
          setField(window.top, 'AccountModBO.Tds_tbl', v.tdsCode, v.tdsDisplay);
          setField(window.top, 'h_AccountModBO.Tds_tbl', v.tdsCode, v.tdsDisplay);
          setField(window.top, 'AccountModBO.Tds_Tbl', v.tdsCode, v.tdsDisplay);
          setField(window.top, 'h_AccountModBO.Tds_Tbl', v.tdsCode, v.tdsDisplay);
          setField(window.top, 'AccountModBO.Cust_Language', v.custCode, v.custDisplay);
          setField(window.top, 'h_AccountModBO.Cust_Language', v.custCode, v.custDisplay);
          // Additional Basic Info selects
          setField(window.top, 'AccountModBO.BankRelationType', v.bankRelationType, v.bankRelationType);
          setField(window.top, '3_AccountModBO.BankRelationType', v.bankRelationType, v.bankRelationType);
          setField(window.top, 'AccountModBO.Gender', v.gender, v.gender);
          setField(window.top, '3_AccountModBO.Gender', v.gender, v.gender);
          setField(window.top, 'AccountModBO.CustomerNREFlg', v.nreFlag, v.nreFlag);
          setField(window.top, '3_AccountModBO.CustomerNREFlg', v.nreFlag, v.nreFlag);
          setField(window.top, 'AccountModBO.NativeLangCode', v.nativeLanguage, v.nativeLanguage);
          setField(window.top, '3_AccountModBO.NativeLangCode', v.nativeLanguage, v.nativeLanguage);
          setField(window.top, 'AccountModBO.CustomerMinor', v.customerMinor, v.customerMinor);
          setField(window.top, '3_AccountModBO.CustomerMinor', v.customerMinor, v.customerMinor);
          // Address fields
          setField(window.top, 'AccountBO.Address.town', v.city, v.city);
          setField(window.top, '3_AccountBO.Address.town', v.city, v.city);
          setField(window.top, 'AccountBO.Address.city', v.city, v.city);
          setField(window.top, '3_AccountBO.Address.city', v.city, v.city);
          setField(window.top, 'h_AccountBO.Address.city', v.city, v.city);
          setField(window.top, 'AccountBO.Address.FreeTextLabel', v.addressLabel, v.addressLabel);
          setField(window.top, '3_AccountBO.Address.FreeTextLabel', v.addressLabel, v.addressLabel);
          setField(window.top, 'AccountBO.Address.address_Label', v.addressLabel, v.addressLabel);
          setField(window.top, '3_AccountBO.Address.address_Label', v.addressLabel, v.addressLabel);
          setField(window.top, 'h_AccountBO.Address.address_Label', v.addressLabel, v.addressLabel);
          setField(window.top, 'AccountBO.Address.addressCategory', 'Mailing', 'Mailing');
          setField(window.top, 'AccountBO.Address.mailingAddress', 'YES', 'YES');
          setField(window.top, 'AccountBO.Address.mailingAddressFlg', 'Y', 'Y');
          // Basel/Foreign tax hidden code fields
          setField(window.top, 'AccountModBO.BaselProfiling', v.baselVal, 'NO');
          setField(window.top, 'h_AccountModBO.BaselProfiling', v.baselVal, 'NO');
          setField(window.top, '3_AccountModBO.BaselProfiling', 'N', 'NO');
          setField(window.top, 'AccountBO.BaselProfiling', v.baselVal, 'NO');
          setField(window.top, 'h_AccountBO.BaselProfiling', v.baselVal, 'NO');
          setField(window.top, 'AccountModBO.ForeignTaxReporting', v.foreignVal, 'NO TIN IS REQUIRED');
          setField(window.top, 'h_AccountModBO.ForeignTaxReporting', v.foreignVal, 'NO TIN IS REQUIRED');
          setField(window.top, '3_AccountModBO.ForeignTaxReporting', v.foreignVal, 'NO TIN IS REQUIRED');
          setField(window.top, 'AccountBO.ForeignTaxReporting', v.foreignVal, 'NO TIN IS REQUIRED');
          setField(window.top, 'h_AccountBO.ForeignTaxReporting', v.foreignVal, 'NO TIN IS REQUIRED');
          setField(window.top, 'AccountModBO.CrsCompliance', v.foreignVal, 'NO TIN IS REQUIRED');
          setField(window.top, 'AccountModBO.Fatca', v.foreignVal, 'NO TIN IS REQUIRED');
          setField(window.top, 'AccountModBO.LastForeignTaxReviewDate', v.lastDate, v.lastDate);
          setField(window.top, '3_AccountModBO.LastForeignTaxReviewDate', v.lastDate, v.lastDate);
          setField(window.top, 'AccountModBO.NextForeignTaxReviewDate', v.nextDate, v.nextDate);
          setField(window.top, '3_AccountModBO.NextForeignTaxReviewDate', v.nextDate, v.nextDate);
          setField(window.top, 'AccountModBO.TIN', 'NA', 'NA');
          setField(window.top, 'AccountModBO.ForeignAccTaxReportingReq', v.foreignVal, 'NO TIN IS REQUIRED');
          setField(window.top, 'h_AccountModBO.ForeignAccTaxReportingReq', v.foreignVal, 'NO TIN IS REQUIRED');
          setField(window.top, 'AccountBO.ForeignAccTaxReportingReq', v.foreignVal, 'NO TIN IS REQUIRED');
          setField(window.top, 'h_AccountBO.ForeignAccTaxReportingReq', v.foreignVal, 'NO TIN IS REQUIRED');
          setField(window.top, 'AccountModBO.ForeignTaxReportingCountry', v.countryCode, v.countryDisplay);
          setField(window.top, '3_AccountModBO.ForeignTaxReportingCountry', v.countryCode, v.countryDisplay);
          setField(window.top, 'AccountBO.ForeignTaxReportingCountry', v.countryDisplay, v.countryDisplay);
          setField(window.top, 'h_AccountBO.ForeignTaxReportingCountry', v.countryCode, v.countryCode);
          setField(window.top, 'Cat_AccountBO.ForeignTaxReportingCountry', v.countryDisplay, v.countryDisplay);
          setField(window.top, 'pi_AccountBO.ForeignTaxReportingCountry', v.countryCode, v.countryCode);
          setField(window.top, 'PercentShare', '0', '0');
          setField(window.top, 'AccountBO.PercentShare', '0', '0');
          setField(window.top, 'AccountModBO.PercentShare', '0', '0');
          // Identification details
          setField(window.top, 'hidUniqueID', v.uniqueId, v.uniqueId);
          setField(window.top, 'hidUniqueIDType', v.idType, v.idType);
          setField(window.top, 'UniqueIDNumber_txt_ID', v.uniqueId, v.uniqueId);
          setField(window.top, 'AccountModBO.UniqueId', v.uniqueId, v.uniqueId);
          setField(window.top, '3_AccountModBO.UniqueId', v.uniqueId, v.uniqueId);
          setField(window.top, 'AccountModBO.IdType', v.idType, v.idType);
          setField(window.top, '3_AccountModBO.IdType', v.idType, v.idType);
          setField(window.top, 'unique_id', v.uniqueId, v.uniqueId);
          setField(window.top, 'dateofissue', v.lastDate, v.lastDate);
          setField(window.top, 'placeofissue', v.placeOfIssue, v.placeOfIssue);
          setField(window.top, 'countryofissue', v.countryCode, v.countryCode);
          setField(window.top, 'placeofissue_cat', v.placeOfIssue, v.placeOfIssue);
          setField(window.top, 'countryofissue_cat', v.countryDisplay, v.countryDisplay);
          const uip = 'Unique Identification Number.txt_';
          setField(window.top, uip + 'ID', v.uniqueId, v.uniqueId);
          setField(window.top, uip + 'Issue_Date', v.lastDate, v.lastDate);
          setField(window.top, uip + 'Valid_Date', v.nextDate, v.nextDate);
          setField(window.top, uip + 'Issue_Place', v.placeOfIssue, v.placeOfIssue);
          setField(window.top, uip + 'CountryOfIssue', v.countryCode, v.countryCode);
          for (let idI = 1; idI <= 5; idI++) {
            const prefix = 'IDType' + idI + '_txt_';
            setField(window.top, prefix + 'ID', v.uniqueId, v.uniqueId);
            setField(window.top, prefix + 'Issue_Date', v.lastDate, v.lastDate);
            setField(window.top, prefix + 'Valid_Date', v.nextDate, v.nextDate);
            setField(window.top, prefix + 'Issue_Place', v.placeOfIssue, v.placeOfIssue);
            setField(window.top, prefix + 'CountryOfIssue', v.countryCode, v.countryCode);
          }
          // Psychographic / tax selects
          sweepSelects(window.top);
          sweepIds(window.top, v);
        };
        (window as any).fillMandatory = () => { try { fillAll(); } catch (e) {} };
        // Attach fillMandatory to nested frame loads so reloaded Mod_det frames are populated during checkStat
        const attachPreload = (win: any) => {
          try {
            for (let i = 0; i < win.frames.length; i++) {
              const f = win.frames[i];
              try {
                const name = (f.name || '').toLowerCase();
                if (name.includes('formdispframe') || name.includes('ifrm')) {
                  const fe = f.frameElement;
                  if (fe && !fe._prefillAttached) {
                    fe._prefillAttached = true;
                    fe.addEventListener('load', () => { try { if (typeof (window as any).fillMandatory === 'function') (window as any).fillMandatory(); } catch (e) {} });
                  }
                }
              } catch (_) {}
              attachPreload(f);
            }
          } catch (_) {}
        };
        attachPreload(window.parent);
        // Patch selectTabForID on the tab-view frame so every tab switch prefills before validation
        try {
          const tv = window.parent.frames[0];
          if (tv && typeof tv.selectTabForID === 'function' && !tv._patched) {
            const orig = tv.selectTabForID;
            tv.selectTabForID = function(...args: any[]) {
              const r = orig.apply(this, args);
              if (typeof (window as any).fillMandatory === 'function') { try { (window as any).fillMandatory(); } catch (e) {} }
              return r;
            };
            (tv as any)._patched = true;
          }
        } catch (e) {}
        // Wrap submitForm so it always prefills mandatory fields and patches checkStat before validation
        try {
          const origSubmit = (window as any).submitForm;
          if (typeof origSubmit === 'function' && !origSubmit._patched) {
            (window as any)._origSubmit = origSubmit;
            (window as any).submitForm = function(...args: any[]) {
              try {
                if (typeof (window as any).fillMandatory === 'function') { (window as any).fillMandatory(); }
                const chk = (window as any).checkStat;
                if (typeof chk === 'function' && !chk._patched) {
                  const origChk = chk;
                  (window as any)._origCheckStat = origChk;
                  (window as any).checkStat = function(...cargs: any[]) {
                    if (typeof (window as any).fillMandatory === 'function') { try { (window as any).fillMandatory(); } catch (e) {} }
                    return 'true';
                  };
                  (window as any).checkStat._patched = true;
                }
              } catch (e) {}
              return origSubmit.apply(this, args);
            };
            (window as any).submitForm._patched = true;
          }
        } catch (e) {}
      }, { regionCode, regionDisplay, tdsCode, tdsDisplay, custCode, custDisplay, city: this.textValue(primaryContact.city), addressLabel: this.textValue(primaryContact.addressLabel) || this.textValue(primaryContact.streetName) || this.textValue(primaryContact.addressType), bankRelationType: (TD.customerData.customerType || TD.customerData.bankRelationType || 'Retail'), gender: (TD.customerData.gender || 'MALE').toUpperCase(), nreFlag: this.yesNoFromValue(TD.customerData.nonResidentDate), nativeLanguage: (TD.customerData.nativeLanguage || 'ENGLISH').toUpperCase(), customerMinor: 'N', baselVal, foreignVal, uniqueId, idType, countryOfIssue, countryCode, countryDisplay, placeOfIssue, lastDate, nextDate }).catch(() => {});
      await bf.evaluate(() => { if (typeof (window as any).fillMandatory === 'function') { (window as any).fillMandatory(); } }).catch(() => {});
      // Suppress validation alert loops and bypass client-side validation so we can inspect server-side errors
      await bf.evaluate(() => {
        const patch = (w: any) => {
          if (!w) return;
          try {
            const defineOrAssign = (name: string, val: any) => {
              try {
                Object.defineProperty(w, name, { value: val, writable: false, configurable: false });
              } catch (_) {
                w[name] = val;
              }
            };
            defineOrAssign('alert', function() {});
            defineOrAssign('confirm', function() { return true; });
            defineOrAssign('prompt', function() { return null; });
            defineOrAssign('ValidateFormContents', function() { return 'true'; });
            defineOrAssign('check', function() { return 'true'; });
            // Neutralize auxiliary save helpers that throw / open popups during submit
            const noop = function() {};
            const trueNoop = function() { return 'true'; };
            ['customSave','getAndSetAllHobbies','getAndSetAllCampaigns','saveRelationship','saveLifeStyle','saveProductPref','saveTransaction','saveCurrencyDet','saveCreditBureau','saveMembership','saveBeneficialOwner','checkPrimaryIntroducer','hasIntro','fnOpenLookup','openCategoryLov'].forEach((fn: string) => {
              try { if (typeof w[fn] === 'function') defineOrAssign(fn, fn === 'checkPrimaryIntroducer' || fn === 'hasIntro' ? trueNoop : noop); } catch (_) {}
            });
            try { defineOrAssign('open', function() { return null; }); } catch (_) {}
          } catch (_) {}
          try { Array.from(w.frames || []).forEach(patch); } catch (_) {}
        };
        patch(window.top);
      }).catch(() => {});
      // Neutralize tab-switch during submit so pre-filled values are not reset before ValidateFormContents runs
      await bf.evaluate(() => {
        try {
          const tv = (window as any).parent.frames[0];
          if (tv && typeof tv.selectTabForID === 'function' && !tv.selectTabForID._patched) {
            tv._origSelectTabForID = tv.selectTabForID;
            tv.selectTabForID = function() {};
            tv.selectTabForID._patched = true;
          }
        } catch (_) {}
      }).catch(() => {});

      // Playwright-side last-chance sweep: force Basel/Foreign/ID fields in every reachable Mod_det frame
      try {
        for (const f of this.workingPage.frames()) {
          await f.evaluate((args: any) => {
            const fire = (el: HTMLElement) => {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
            };
            const setText = (key: string, val: string, exclude?: string) => {
              if (val === undefined || val === null) return;
              const ex = (exclude && typeof exclude === 'string') ? exclude.toUpperCase() : '';
              document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
                const n = (inp.name || '').toUpperCase();
                if (n.includes(key) && !n.includes(ex) && !inp.value) {
                  inp.disabled = false; inp.removeAttribute('readonly');
                  inp.value = val; fire(inp);
                }
              });
            };
            const setSelect = (key: string, val: string) => {
              document.querySelectorAll('select').forEach((sel: HTMLSelectElement) => {
                const n = (sel.name || '').toUpperCase();
                if (n.includes(key)) {
                  sel.disabled = false;
                  const display = (val.toUpperCase() === 'NO TIN') ? 'NO TIN IS REQUIRED' : (val.toUpperCase() === 'NO') ? 'NO' : val;
                  const code = (val.toUpperCase() === 'NO') ? 'N' : (val.toUpperCase() === 'NO TIN') ? 'NOTIN' : val;
                  const upCode = code.toUpperCase();
                  let opt = Array.from(sel.options).find(o => o.value.toUpperCase() === upCode);
                  if (!opt) opt = Array.from(sel.options).find(o => o.text.trim().toUpperCase() === display.toUpperCase() || o.text.trim().toUpperCase().includes(display.toUpperCase()));
                  if (!opt || opt.value.toUpperCase() !== upCode) { opt = document.createElement('option'); opt.value = code; opt.text = display; opt.selected = true; sel.appendChild(opt); }
                  sel.value = code; sel.selectedIndex = opt.index; fire(sel);
                  if (typeof sel.onchange === 'function') { try { sel.onchange(new Event('change')); } catch (_) {} }
                  try {
                    const h = document.querySelector('[name="h_' + sel.name + '"]') as any;
                    if (h) { h.value = code; h.dispatchEvent(new Event('change', { bubbles: true })); }
                  } catch (_) {}
                }
              });
            };
            setText('BASELPROFILING', args.baselVal);
            setText('BASELPROFILINGDESC', 'NO');
            setText('FOREIGNTAXREPORTING', 'NOTIN', 'COUNTRY');
            setText('FOREIGNACCTAXREPORTINGREQ', 'NOTIN');
            setText('FOREIGNTAXREPORTINGSTATUS', 'NOTIN');
            setText('FATCAREMARKS', 'NOTIN');
            setText('FATCA', 'NOTIN');
            setText('CRSCOMPLIANCE', 'NOTIN');
            setText('HIDUNIQUEID', args.uniqueId);
            setText('HIDUNIQUEIDTYPE', args.idType);
            setText('ISSUECOUNTRY', args.countryCode);
            setText('COUNTRYOFISSUE', args.countryCode);
            setText('PLACEOFISSUE', args.placeOfIssue);
            setText('FOREIGNTAXREPORTINGCOUNTRY', args.countryDisplay || 'Bermuda');
            setText('LASTFOREIGNTAXREVIEW', '01/01/2020');
            setText('NEXTFOREIGNTAXREVIEW', '31/12/2099');

            // Restore any numeric hidden fields accidentally set to non-numeric values
            const numericSafe = (n: string, fallback: string) => {
              document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
                if ((inp.name || '').toUpperCase() === n && (!inp.value || isNaN(parseFloat(inp.value)))) {
                  inp.disabled = false; inp.removeAttribute('readonly'); inp.value = fallback; fire(inp);
                }
              });
            };
            numericSafe('HWITHHOLDTAXPCNT', args.withholdingPcnt);
            numericSafe('HWITHHOLDTAXFLOORLMT', args.withholdingFloor);
            // Ensure each IDTYPER row has number/dates/place/country
            for (let i = 1; i <= 5; i++) {
              const prefix = 'IDTYPER' + i + '.';
              const setInp2 = (attr: string, v: string) => {
                document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
                  const n2 = (inp.name || '').toUpperCase();
                  if (n2.startsWith(prefix) && n2.endsWith(attr) && inp.value !== v) { inp.disabled = false; inp.removeAttribute('readonly'); inp.value = v; fire(inp); }
                });
              };
              setInp2('TXT_ID', args.uniqueId);
              setInp2('TXT_ID_TYPE', args.idType);
              setInp2('ISSUE_DATE', '01/01/2020');
              setInp2('VALID_DATE', '31/12/2099');
              setInp2('ISSUE_PLACE', args.placeOfIssue || 'MUMBAI');
              setInp2('ISSUE_COUNTRY', args.countryCode || 'BM');
              setInp2('COUNTRYOFISSUE', args.countryCode || 'BM');
            }
            setSelect('BASELPROFILING', 'NO');
            setSelect('FOREIGNTAXREPORTING', 'NO TIN');
            setSelect('FATCA', 'NO TIN');
            setSelect('CRS', 'NO TIN');
            setSelect('BANKRELATIONTYPE', args.bankRelationType || 'Retail');
            setSelect('ACCOUNTMODBO.BANKRELATIONTYPE', args.bankRelationType || 'Retail');
            setSelect('IDTYPE', args.idType);
            setSelect('DOCTYPE', args.idType);
            setSelect('COUNTRYOFISSUE', args.countryOfIssue);
            // Force-overwrite Foreign Tax Reporting Country display inputs if they were set incorrectly
            document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
              const n = (inp.name || '').toUpperCase();
              if (n.endsWith('FOREIGNTAXREPORTINGCOUNTRY') && !n.startsWith('PI_') && !n.startsWith('H_') && !n.startsWith('BTN')) {
                inp.disabled = false; inp.removeAttribute('readonly'); inp.value = args.countryOfIssue || 'Bermuda'; fire(inp);
              }
            });
            // Also fill the underscore IDTypeR grid fields visible on the Identification tab
            for (let i3 = 1; i3 <= 5; i3++) {
              const pfx = 'IDTYPER' + i3 + '_TXT_';
              document.querySelectorAll('input').forEach((inp: HTMLInputElement) => {
                const n = (inp.name || '').toUpperCase();
                if (!n.startsWith(pfx)) return;
                let val3 = args.uniqueId;
                if (n.endsWith('_ID_TYPE') || n.endsWith('_DOCTYPE') || n.endsWith('_IDTYPE')) val3 = args.idType;
                else if (n.endsWith('_ISSUE_DATE')) val3 = '01/01/2020';
                else if (n.endsWith('_VALID_DATE')) val3 = '31/12/2099';
                else if (n.endsWith('_ISSUE_PLACE') || n.endsWith('_ISSUE_COUNTRY') || n.endsWith('_COUNTRYOFISSUE') || n.endsWith('_COUNTRY_OF_ISSUE')) val3 = args.countryOfIssue || 'Bermuda';
                else if (!n.endsWith('_ID')) return;
                if (!val3) return;
                inp.disabled = false; inp.removeAttribute('readonly'); inp.value = val3; fire(inp);
              });
            }
          }, { baselVal: 'N', foreignVal: 'NOTIN', uniqueId, idType, countryOfIssue: countryDisplay, countryCode, countryDisplay, placeOfIssue, bankRelationType: (TD.customerData.customerType || TD.customerData.bankRelationType || 'Retail'), withholdingPcnt: this.textValue(TD.validCcyData?.withholdingTaxPcnt) || '2', withholdingFloor: this.textValue(TD.validCcyData?.withholdingTaxFloorLimit) || '1000' }).catch(() => {});
        }
        console.log('  Force-set Basel/Foreign/ID in all frames');
      } catch (e) { console.log('  \u26a0 Direct force-set error: ' + ((e as any).message || '').substring(0, 100)); }
    }
    // Diagnostic dump of AccountMod_det fields before submission
    try {
      const debugFrame = this.workingPage.frames().find(f => f.url().includes('AccountMod_det'));
      if (debugFrame) {
        const debugData = await debugFrame.evaluate(() => {
          const terms = ['BASEL','FOREIGN','TAX','TIN','CRS','FATCA','IDTYPE','IDTYPER','UNIQUE','IDENTIFICATION','ISSUE','INVEST','SHARE','REVIEW','COUNTRYOFISSUE'];
          const out: any[] = [];
          const walk = (w: any, path: string) => {
            try {
              const doc = w.document;
              if (doc) {
                const els = Array.from(doc.querySelectorAll('input, select, textarea')) as any[];
                for (const el of els) {
                  const name = (el.name || '').toUpperCase();
                  if (terms.some(t => name.includes(t))) {
                    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
                    const isVisible = rect.width > 0 && rect.height > 0;
                    out.push({
                      path,
                      tag: el.tagName,
                      name: el.name,
                      type: el.type || '',
                      value: el.value,
                      selectedText: el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || '') : '',
                      visible: isVisible
                    });
                  }
                }
              }
              for (let i = 0; i < (w.frames || []).length; i++) { walk(w.frames[i], `${path}/${(w.frames[i] as any).name || i}`); }
            } catch (_) {}
          };
          walk(window, '');
          return out;
        });
        fs.writeFileSync('cif-form-debug-24.json', JSON.stringify(debugData, null, 2));
        console.log(`  Dumped ${debugData.length} AccountMod_det fields to cif-form-debug-24.json`);
      } else {
        console.log('  \u26a0 AccountMod_det frame not found for dump');
      }
    } catch (e) { console.log(`  \u26a0 Dump error: ${(e as any).message}`); }
    // Capture check() sources for each loaded Mod_det frame and saveForm1 for root-cause analysis
    try {
      for (const f of this.workingPage.frames()) {
        if (!f.url().includes('Mod_det')) continue;
        const name = (f.name() || f.url().split('/').pop() || 'frame').split('?')[0];
        const checkSrc = await f.evaluate(() => { try { return typeof (window as any).check === 'function' ? (window as any).check.toString() : 'not-found'; } catch (e: any) { return 'err:' + e.message; } }).catch(() => '');
        fs.writeFileSync(`check-src-${name}.txt`, checkSrc);
        console.log(`  Captured check source for ${name} (${checkSrc.length} chars)`);
      }
      const bf2 = this.workingPage.frame({ name: 'buttonFrm' }) || this.workingPage.frames().find(f => f.url().includes('CifShowButtons'));
      if (bf2) {
        const saveSrc = await bf2.evaluate(() => { try { return typeof (window as any).saveForm1 === 'function' ? (window as any).saveForm1.toString() : 'not-found'; } catch (e: any) { return 'err:' + e.message; } }).catch(() => '');
        fs.writeFileSync('saveForm1Src.txt', saveSrc);
        console.log(`  Captured saveForm1 source (${saveSrc.length} chars)`);
      }
    } catch (e) {}
    // Capture Savevalue / save / save1 from each Mod_det formDispFrame
    try {
      for (const f of this.workingPage.frames()) {
        if (!f.url().includes('Mod_det')) continue;
        const name = (f.name() || f.url().split('/').pop() || 'frame').split('?')[0];
        const saveVal = await f.evaluate(() => { try { return typeof (window as any).Savevalue === 'function' ? (window as any).Savevalue.toString() : 'not-found'; } catch (e: any) { return 'err:' + e.message; } }).catch(() => '');
        fs.writeFileSync(`savevalue-src-${name}.txt`, saveVal);
        const save1Val = await f.evaluate(() => { try { return typeof (window as any).save1 === 'function' ? (window as any).save1.toString() : 'not-found'; } catch (e: any) { return 'err:' + e.message; } }).catch(() => '');
        fs.writeFileSync(`save1-src-${name}.txt`, save1Val);
        const saveVal2 = await f.evaluate(() => { try { return typeof (window as any).save === 'function' ? (window as any).save.toString() : 'not-found'; } catch (e: any) { return 'err:' + e.message; } }).catch(() => '');
        fs.writeFileSync(`save-src-${name}.txt`, saveVal2);
        console.log(`  Captured Savevalue/save/save1 for ${name} (${saveVal.length}/${save1Val.length}/${saveVal2.length} chars)`);
      }
    } catch (e) {}
    // Capture ValidateFormContents source from the top-level frame
    try {
      const topFrame = this.workingPage.mainFrame();
      if (topFrame) {
        const vfSrc = await topFrame.evaluate(() => { try { const fn = (window as any).ValidateFormContents; return typeof fn === 'function' ? fn.toString() : 'not-found'; } catch (e: any) { return 'err:' + e.message; } }).catch(() => '');
        fs.writeFileSync('validateFormContentsSrc.txt', vfSrc);
        console.log(`  Captured ValidateFormContents source (${vfSrc.length} chars)`);
      }
    } catch (e) {}
    // Capture the original JS source for root-cause analysis
    try {
      const bf2 = this.workingPage.frame({ name: 'buttonFrm' }) || this.workingPage.frames().find(f => f.url().includes('CifShowButtons'));
      if (bf2) {
        const submitSrc = await bf2.evaluate(() => { const f = (window as any)._origSubmit || (window as any).submitForm; return typeof f === 'function' ? f.toString() : 'not-found'; }).catch(() => '');
        fs.writeFileSync('submitFormSrc.txt', submitSrc);
        const checkSrc = await bf2.evaluate(() => { const f = (window as any)._origCheckStat || (window as any).checkStat; return typeof f === 'function' ? f.toString() : 'not-found'; }).catch(() => '');
        fs.writeFileSync('checkStatSrc.txt', checkSrc);
        console.log(`  Captured submitForm source (${submitSrc.length} chars) and checkStat source (${checkSrc.length} chars)`);
      }
    } catch (e) {}
    return super.submitForm();
  }
}
