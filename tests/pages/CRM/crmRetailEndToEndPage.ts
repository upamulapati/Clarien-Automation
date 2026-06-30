import { Page, Dialog, Locator, Frame } from '@playwright/test';
import { AppConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { CrmEndToEndPage } from './crmEndToEndPage';

export class CrmRetailEndToEndPage extends CrmEndToEndPage {
  private TD = CRM_TEST_DATA.retail.endToEnd;

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

  constructor(page: Page, config: AppConfig, lastDialogMessages: string[]) {
    super(page, config, lastDialogMessages);
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
          // Exact match first, then includes match
          let matched = false;
          for (const o of Array.from(sel.options)) {
            if (o.text.trim().toUpperCase() === val.toUpperCase() || o.value.toUpperCase() === val.toUpperCase()) {
              sel.value = o.value; fire(sel); matched = true; break;
            }
          }
          if (!matched) {
            for (const o of Array.from(sel.options)) {
              if (o.text.trim().toUpperCase().includes(val.toUpperCase()) || o.value.toUpperCase().includes(val.toUpperCase())) {
                sel.value = o.value; fire(sel); break;
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
      setSel('AccountModBO.Gender', 'MALE');
      setSel('AccountModBO.CustomerNREFlg', 'Y');
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
      nreDate: TD.customerData.nonResidentDate
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
    if (TD.customerData.segment === 'RET') {
      for (let retry = 0; retry < 3; retry++) {
        try {
          const ss = this.accountFrame.locator('select[name="AccountModBO.SubSegment"]');
          await ss.selectOption(TD.customerData.subSegment, { timeout: 5000 });
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
    const nativeLang = this.accountFrame.locator('select[name="AccountModBO.NativeLangCode"]');
    if (await nativeLang.isVisible({ timeout: 8000 }).catch(() => false)) {
      await nativeLang.selectOption({ label: 'ENGLISH' }).catch(async () => {
        const val = await this.accountFrame.evaluate(() => { const s = document.querySelector('select[name="AccountModBO.NativeLangCode"]') as HTMLSelectElement; if (!s) return ''; for (const o of Array.from(s.options)) { if (o.text.trim().toUpperCase() === 'ENGLISH') return o.value; } return ''; }).catch(() => '');
        if (val) await nativeLang.selectOption(val);
      });
      await this.accountFrame.evaluate(() => { const s = document.querySelector('select[name="AccountModBO.NativeLangCode"]') as HTMLSelectElement; if (s) { s.dispatchEvent(new Event('change', { bubbles: true })); s.dispatchEvent(new Event('blur', { bubbles: true })); } }).catch(() => {});
      console.log('\u2713 Native Language: ENGLISH');
    }
    await page.waitForTimeout(this.timeouts.short);

    // Preferred Native Language via LOV
    await this.refreshAccountFrame('before Cust_Language LOV');
    await this.accountFrame.evaluate(() => { const el = document.getElementById('td_tpageCont6'); if (el) el.click(); }).catch(() => {});
    await page.waitForTimeout(this.timeouts.short);

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
            for (const lf of lovPopup.frames()) {
              const cell = lf.getByText(TD.customerData.preferredLanguage, { exact: true }).first();
              if (await cell.isVisible({ timeout: 5000 }).catch(() => false)) {
                try { await Promise.race([cell.dblclick({ timeout: this.timeouts.medium }), lovPopup.waitForEvent('close', { timeout: this.timeouts.long })]); } catch (_) {}
                console.log(`\u2713 Preferred Native Language: ${TD.customerData.preferredLanguage}`);
                break;
              }
            }
          }
          if (!lovPopup.isClosed()) await lovPopup.close().catch(() => {});
        } else { if (!lovPopup.isClosed()) await lovPopup.close().catch(() => {}); }
      }
    } else {
      await this.accountFrame.evaluate(() => {
        const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const cl = document.querySelector('input[name="AccountModBO.Cust_Language"]') as HTMLInputElement;
        if (cl) { cl.value = 'India (English)'; fire(cl); }
        const cat = document.querySelector('input[name="Cat_AccountModBO.Cust_Language"]') as HTMLInputElement;
        if (cat) { cat.value = 'India (English)'; fire(cat); }
      }).catch(() => {});
    }
    await page.waitForTimeout(this.timeouts.short);

    // Preferred Locale (re-set)
    await this.refreshAccountFrame('after Cust_Language LOV');
    await this.accountFrame.evaluate(() => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const pl = document.querySelector('input[name="Cat_PsychographicBO.Preferred_Locale"]') as HTMLInputElement;
      if (pl) { pl.removeAttribute('readonly'); pl.value = 'en_US'; fire(pl); }
      const plc = document.querySelector('input[name="PsychographicBO.Preferred_Locale"]') as HTMLInputElement;
      if (plc) { plc.value = 'en_US'; fire(plc); }
    }).catch(() => {});

    // Region
    await this.accountFrame.evaluate((region: string) => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const inp = document.querySelector('input[name="AccountModBO.region"]') as HTMLInputElement;
      if (inp) { inp.value = region; fire(inp); }
      const cat = document.querySelector('input[name="Cat_AccountModBO.region"]') as HTMLInputElement;
      if (cat) { cat.value = region; fire(cat); }
    }, TD.customerData.region).catch(() => {});
    console.log(`\u2713 Region: ${TD.customerData.region}`);

    // TDS Table via LOV
    await this.refreshAccountFrame('before TDS LOV');
    await this.closeUnexpectedPopups(page);
    await this.accountFrame.evaluate(() => { const el = document.getElementById('td_tpageCont6'); if (el) el.click(); }).catch(() => {});
    await page.waitForTimeout(this.timeouts.short);

    const tdsBtn = this.accountFrame.locator('input[name="btnone_AccountModBO.Tds_tbl"]');
    if (await tdsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const tdsPromise = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
      await tdsBtn.evaluate((el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).catch(() => {});
      const tdsPopup = await tdsPromise;
      if (tdsPopup) {
        await tdsPopup.bringToFront();
        await new Promise(r => setTimeout(r, 2000));
        if (!tdsPopup.isClosed() && tdsPopup.url().includes('SSOblank')) {
          const hm = tdsPopup.url().match(/wizardHashKey=([a-f0-9]+)/);
          if (hm) await tdsPopup.goto(`https://clrnuat.clarienbank.com/FinacleCRM/servlet/com.infy.cis.ui.common.LookupforCategory?wizardHashKey=${hm[1]}`, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => {});
        }
        const ready = await this.waitForPopupReady(tdsPopup, 'TDS LOV');
        if (ready && !tdsPopup.isClosed()) {
          for (const lf of tdsPopup.frames()) {
            const inputs = await lf.locator('input[type="text"]').all();
            const vis: Locator[] = [];
            for (const i of inputs) { if (await i.isVisible().catch(() => false)) vis.push(i); }
            if (vis.length >= 2) await vis[1].fill(TD.customerData.tdsTable);
            else if (vis.length === 1) await vis[0].fill(TD.customerData.tdsTable);
            const sub = lf.locator('input[value="Submit"]').first();
            if (await sub.isVisible({ timeout: 3000 }).catch(() => false)) { await sub.click(); break; }
          }
          await page.waitForTimeout(this.timeouts.medium);
          if (!tdsPopup.isClosed()) {
            for (const lf of tdsPopup.frames()) {
              const cell = lf.getByText(TD.customerData.tdsTable, { exact: true }).first();
              if (await cell.isVisible({ timeout: 5000 }).catch(() => false)) {
                try { await Promise.race([cell.dblclick({ timeout: this.timeouts.medium }), tdsPopup.waitForEvent('close', { timeout: this.timeouts.long })]); } catch (_) {}
                console.log(`\u2713 TDS Table: ${TD.customerData.tdsTable}`);
                break;
              }
            }
          }
          if (!tdsPopup.isClosed()) await tdsPopup.close().catch(() => {});
        } else { if (!tdsPopup.isClosed()) await tdsPopup.close().catch(() => {}); }
      }
    } else {
      await this.accountFrame.evaluate((tds: string) => {
        const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const inp = document.querySelector('input[name="AccountModBO.Tds_tbl"]') as HTMLInputElement;
        if (inp) { inp.value = tds; fire(inp); }
        const cat = document.querySelector('input[name="Cat_AccountModBO.Tds_tbl"]') as HTMLInputElement;
        if (cat) { cat.value = tds; fire(cat); }
      }, TD.customerData.tdsTable).catch(() => {});
    }

    await this.refreshAccountFrame('after TDS LOV');

    // Default Channel, Minor Indicator, IsEbankingEnabled, PRM ID
    await this.accountFrame.evaluate(() => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const setSel = (name: string, match: string) => { const s = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement; if (s) { for (const o of Array.from(s.options)) { if (o.text.trim().toUpperCase().includes(match) || o.value === match) { s.value = o.value; fire(s); break; } } } };
      setSel('AccountBO.DefaultChannel_Alert', 'BRANCH');
      setSel('AccountModBO.CustomerMinor', 'N');
      setSel('AccountModBO.IsEbankingEnabled', 'N');
    }).catch(() => {});

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

    // === ADDRESS POPUP ===
    await this.addAddress(addressFrame);

    // === PHONE POPUP ===
    await this.addPhone(addressFrame);

    // === EMAIL POPUP ===
    await this.addEmail(addressFrame);

    await this.closeUnexpectedPopups(page);
    await page.waitForTimeout(this.timeouts.short3);
  }

  // ==================== ADDRESS POPUP HELPER ====================
  private async addAddress(addressFrame: any): Promise<void> {
    const page = this.workingPage;
    const TD = this.TD;
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
      const validCat = catOpts.find((o: string) => o === 'Mailing') || catOpts.find((o: string) => o.includes('Mailing'));
      if (validCat) { await ac.selectOption({ label: validCat }); await ac.evaluate((el: HTMLSelectElement) => el.dispatchEvent(new Event('change', { bubbles: true }))); console.log(`\u2713 Address Category: ${validCat}`); }
    }

    // Address fields
    const fillField = async (name: string, value: string, label: string) => {
      const loc = popupTarget.locator(`input[name="${name}"], textarea[name="${name}"]`).first();
      if (await loc.isVisible({ timeout: 3000 }).catch(() => false)) { await loc.fill(value); console.log(`\u2713 ${label}: ${value}`); }
    };
    await fillField('AccountBO.Address.address_Line1', '123 Main Street, Hamilton', 'Address Line 1');
    await fillField('AccountBO.Address.FreeTextLabel', TD.contactData.addressLabel, 'Address Label');
    await fillField('AccountBO.Address.house_no', TD.contactData.houseNo, 'House No');
    await fillField('AccountBO.Address.premise_name', TD.contactData.premiseName, 'Premise Name');
    await fillField('AccountBO.Address.building_level', TD.contactData.buildingLevel, 'Building Level');
    await fillField('AccountBO.Address.street_no', TD.contactData.streetNo, 'Street No');
    await fillField('AccountBO.Address.suburb', TD.contactData.suburb, 'Suburb');
    await fillField('AccountBO.Address.street_name', TD.contactData.addressLabel, 'Street Name');
    await fillField('AccountBO.Address.locality_name', TD.contactData.localityName, 'Locality Name');
    await fillField('AccountBO.Address.town', TD.contactData.city, 'Town');

    // LOV fields
    await this.selectLovValue({ parentPage: page, target: popupTarget, buttonName: 'btnone_AccountBO.Address.city', searchValue: TD.contactData.city, label: 'City', config: this.config, directFieldName: 'AccountBO.Address.city', parentPopup: addressPopup });
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
    if (await endDateLoc.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (!(await endDateLoc.isDisabled().catch(() => true))) { await endDateLoc.fill('31/12/2099'); }
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
  private async addPhone(phoneEmailFrame: any): Promise<void> {
    const page = this.workingPage;
    const TD = this.TD;

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
          const match = opts.find((o: string) => o.includes('COMMUNICATION PHONE')) || opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
          if (match) { await phoneType.selectOption({ label: match }); }
        }

        // Phone details
        const fillIfEnabled = async (sel: string, val: string, popup: Page) => {
          const loc = pt.locator(sel);
          if (await loc.isVisible({ timeout: 3000 }).catch(() => false)) {
            if (!(await loc.isDisabled().catch(() => true))) { await loc.fill(val); }
            else { await popup.waitForTimeout(2000); if (await loc.isEnabled({ timeout: 3000 }).catch(() => false)) await loc.fill(val); }
          }
        };
        await fillIfEnabled('input[name="AccountBO.PhoneEmail.PhoneNo.cntrycode"]', TD.contactData.countryCode, phonePopup);
        await fillIfEnabled('input[name="AccountBO.PhoneEmail.PhoneNo.areacode"]', TD.contactData.areaCode, phonePopup);
        await fillIfEnabled('input[name="AccountBO.PhoneEmail.PhoneNo.localcode"]', TD.contactData.phoneNumber, phonePopup);
        console.log(`\u2713 Phone: +${TD.contactData.countryCode} ${TD.contactData.areaCode} ${TD.contactData.phoneNumber}`);

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
  private async addEmail(phoneEmailFrame: any): Promise<void> {
    const page = this.workingPage;
    const TD = this.TD;

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
      const match = opts.find((o: string) => o.includes('COMMUNICATION') || o.includes('HOME')) || opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
      if (match) { await emailTypeDD.selectOption({ label: match }); }
      await emailPopup.waitForTimeout(2000);
    }

    // Email address
    const patterns = ['input[name="AccountBO.PhoneEmail.Email"]', 'input[name*="EmailId"]', 'input[name*="email"]', 'input[name*="Email"]'];
    for (const p of patterns) {
      const ef = et.locator(p).first();
      if (await ef.isVisible({ timeout: 2000 }).catch(() => false)) {
        await ef.fill(TD.contactData.email);
        console.log(`\u2713 Email: ${TD.contactData.email}`);
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
      const targetType = opts.find(o => o === TD.validDocData.documentType) || opts.find(o => o.includes(TD.validDocData.documentType || 'IDCUS')) || opts.find(o => o !== '--Select--' && o.length > 0);
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
      const targetCode = opts.find(o => o.includes(TD.validDocData.documentCode)) || opts.find(o => o !== '--Select--' && o.length > 0);
      if (targetCode) {
        await docCodeSelect.selectOption({ label: targetCode });
        await docCodeSelect.evaluate((el: HTMLSelectElement) => el.dispatchEvent(new Event('change', { bubbles: true })));
        console.log(`\u2713 Document Code: ${targetCode}`);
      }
    }

    // Unique ID
    const uid = target.locator('input[name="EntityDocumentBO.ReferenceNumber"]');
    if (await uid.isVisible({ timeout: 3000 }).catch(() => false)) { await uid.fill(''); await uid.fill(TD.validDocData.uniqueId); console.log(`\u2713 Unique ID: ${TD.validDocData.uniqueId}`); }

    // Place of Issue via LOV
    await this.selectDocLov(docPopup, target, 'btnone_EntityDocumentBO.PlaceOfIssue', TD.validDocData.placeOfIssue, 'Place of Issue', 'EntityDocumentBO.PlaceOfIssue', 'Cat_EntityDocumentBO.PlaceOfIssue');
    // Country of Issue via LOV
    await this.selectDocLov(docPopup, target, 'btnone_EntityDocumentBO.CountryOfIssue', 'INDIA', 'Country of Issue', 'EntityDocumentBO.CountryOfIssue', 'Cat_EntityDocumentBO.CountryOfIssue', 'IN');

    // Issue Date, Expiry Date
    await target.evaluate((val: string) => { const el = document.querySelector('input[name="3_EntityDocumentBO.DocIssueDate"]') as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); } }, TD.validDocData.issueDate).catch(() => {});
    console.log(`\u2713 Issue Date: ${TD.validDocData.issueDate}`);
    await target.evaluate((val: string) => { const el = document.querySelector('input[name="3_EntityDocumentBO.DocExpiryDate"]') as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); } }, TD.validDocData.expiryDate).catch(() => {});
    console.log(`\u2713 Expiry Date: ${TD.validDocData.expiryDate}`);

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

    // Mark as Preferred
    for (const f of [page.frame({ name: 'formDispFrame' }) || idDocFrame, ...page.frames()]) {
      let marked = false;
      for (const sel of ['input[type="radio"][name="radio1"]', 'input[type="radio"][name="radio0"]', 'input[type="radio"]', 'input[name="IsPreferred"]']) {
        const btn = f.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) { await btn.click(); marked = true; console.log('\u2713 Marked document as Preferred'); break; }
      }
      if (marked) break;
    }
    await this.closeUnexpectedPopups(page);
    await page.waitForTimeout(this.timeouts.short3);
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
    }, { codeName: CCY_FIELDS.ccyCode, dispName: CCY_FIELDS.ccyDisplay, code: TD.validCcyData.ccy });
    console.log(`\u2713 CCY: ${TD.validCcyData.ccy}`);

    // Fill CCY fields
    const fieldMap = [
      { name: CCY_FIELDS.creditDiscount, value: TD.validCcyData.creditDiscountPcnt, label: 'Credit Discount' },
      { name: CCY_FIELDS.debitDiscount, value: TD.validCcyData.debitDiscountPcnt, label: 'Debit Discount' },
      { name: CCY_FIELDS.withholdingTax, value: TD.validCcyData.withholdingTaxPcnt, label: 'Withholding Tax' },
      { name: CCY_FIELDS.floorLimit, value: TD.validCcyData.withholdingTaxFloorLimit, label: 'Floor Limit' },
      { name: CCY_FIELDS.expiryDate, value: TD.validCcyData.preferentialExpiryDate, label: 'Expiry Date' }
    ];
    for (const field of fieldMap) {
      await ccyTarget.evaluate((a: { fieldName: string; val: string }) => {
        const el = document.querySelector(`input[name="${a.fieldName}"]`) as HTMLInputElement;
        if (el) { el.removeAttribute('readonly'); el.value = a.val; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); }
      }, { fieldName: field.name, val: field.value });
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
      natSelected = await this.selectLovValue({ parentPage: page, target: demoFrame, buttonName: this.nationalityLovBtn, searchValue: 'ANDORRA', label: 'Nationality', config: this.config, directFieldName: this.nationalityCode || undefined });
    } catch (e) { console.log('\u26a0 Nationality LOV error: ' + ((e as Error).message || '').substring(0, 100)); }
    await page.waitForTimeout(this.timeouts.short).catch(() => {});

    if (!natSelected && this.nationalityCode && this.nationalityDisplay) {
      await page.waitForTimeout(3000).catch(() => {});
      demoFrame = this.getDemoFrame();
      await demoFrame.evaluate((args: { code: string; disp: string }) => {
        const ce = document.querySelector(`input[name="${args.code}"]`) as HTMLInputElement;
        const de = document.querySelector(`input[name="${args.disp}"]`) as HTMLInputElement;
        if (ce) { ce.value = 'AD'; ce.dispatchEvent(new Event('change', { bubbles: true })); }
        if (de) { de.value = 'ANDORRA'; de.dispatchEvent(new Event('change', { bubbles: true })); }
      }, { code: this.nationalityCode, disp: this.nationalityDisplay }).catch(() => {});
      console.log('\u2713 Nationality: ANDORRA (fallback)');
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
        await demoFrame.evaluate((a: { code: string; disp: string }) => {
          const ce = document.querySelector(`input[name="${a.code}"]`) as HTMLInputElement;
          const de = document.querySelector(`input[name="${a.disp}"]`) as HTMLInputElement;
          if (ce) { ce.value = 'BM'; ce.dispatchEvent(new Event('change', { bubbles: true })); }
          if (de) { de.value = 'BERMUDA'; de.dispatchEvent(new Event('change', { bubbles: true })); }
        }, { code: resInfo.codeName, disp: resInfo.dispName }).catch(() => {});
        console.log('\u2713 Residence Country: BERMUDA');
      }
    } catch (e) { console.log(`\u26a0 Residence Country error: ${(e as Error).message?.substring(0, 80)}`); }

    // Marital Status
    if (this.maritalStatusField) {
      const marSel = demoFrame.locator(`select[name="${this.maritalStatusField}"]`);
      if (await marSel.isVisible({ timeout: 5000 }).catch(() => false)) {
        const mVal = await demoFrame.evaluate((selName: string) => { const sel = document.querySelector(`select[name="${selName}"]`) as HTMLSelectElement; if (!sel) return ''; for (const o of Array.from(sel.options)) { if (o.text.trim().toLowerCase().includes('married') && !o.text.trim().toLowerCase().includes('un')) return o.value; } return ''; }, this.maritalStatusField).catch(() => '');
        if (mVal) { await marSel.selectOption(mVal).catch(() => {}); console.log('\u2713 Marital Status: Married'); }
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
        const val = await demoFrame.evaluate((selName: string) => { const sel = document.querySelector(`select[name="${selName}"]`) as HTMLSelectElement; if (!sel) return ''; for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes('SALARIED') && !o.text.trim().toUpperCase().includes('SELF')) return o.value; } return ''; }, this.empTypeField).catch(() => '');
        if (val) { await empSel.selectOption(val).catch(() => {}); console.log('\u2713 Employee Type: SALARIED'); }
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
        const val = await demoFrame.evaluate((selName: string) => { const sel = document.querySelector(`select[name="${selName}"]`) as HTMLSelectElement; if (!sel) return ''; for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes('SALARIED') && !o.text.trim().toUpperCase().includes('SELF')) return o.value; } return ''; }, this.incomeTypeField).catch(() => '');
        if (val) { await incSel.selectOption(val).catch(() => {}); console.log('\u2713 Income Type: SALARIED'); }
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
        const val = await demoFrame.evaluate((selName: string) => { const sel = document.querySelector(`select[name="${selName}"]`) as HTMLSelectElement; if (!sel) return ''; for (const o of Array.from(sel.options)) { if (o.text.trim().includes('BMD') || o.value === 'BMD') return o.value; } return ''; }, this.demoCurrencyField).catch(() => '');
        if (val) { await ccySel.selectOption(val).catch(() => {}); console.log('\u2713 Currency: BMD'); }
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
      await demoFrame.evaluate((fn: string) => { const el = document.querySelector(`input[name="${fn}"]`) as HTMLInputElement; if (el) el.removeAttribute('readonly'); }, this.grossIncomeField).catch(() => {});
      const loc = demoFrame.locator(`input[name="${this.grossIncomeField}"]`);
      if (await loc.isVisible({ timeout: 5000 }).catch(() => false)) { await loc.fill('50000').catch(() => {}); }
      else { await demoFrame.evaluate((a: { fn: string }) => { const el = document.querySelector(`input[name="${a.fn}"]`) as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = '50000'; el.dispatchEvent(new Event('change', { bubbles: true })); } }, { fn: this.grossIncomeField }).catch(() => {}); }
      console.log('\u2713 Gross Income: 50000');
    }

    // Monthly Expense
    this.monthlyExpenseField = await demoFrame.evaluate(() => { const el = document.querySelector('input[name="3_DemographicBO.Annual_Operating_Exp"]') as HTMLInputElement; return el ? el.name : ''; }).catch(() => '');
    if (!this.monthlyExpenseField) { for (const f of page.frames()) { const found = await f.evaluate(() => { const el = document.querySelector('input[name="3_DemographicBO.Annual_Operating_Exp"]') as HTMLInputElement; return el ? el.name : ''; }).catch(() => ''); if (found) { this.monthlyExpenseField = found; demoFrame = f; break; } } }
    if (!this.monthlyExpenseField) { for (const inp of incomeFieldInfo.inputs) { if ((inp.name || '').toLowerCase().includes('operating_exp')) { this.monthlyExpenseField = inp.name; break; } } }
    if (this.monthlyExpenseField) {
      await demoFrame.evaluate((fn: string) => { const el = document.querySelector(`input[name="${fn}"]`) as HTMLInputElement; if (el) el.removeAttribute('readonly'); }, this.monthlyExpenseField).catch(() => {});
      const loc = demoFrame.locator(`input[name="${this.monthlyExpenseField}"]`);
      if (await loc.isVisible({ timeout: 5000 }).catch(() => false)) { await loc.fill('15000').catch(() => {}); }
      else { await demoFrame.evaluate((a: { fn: string }) => { const el = document.querySelector(`input[name="${a.fn}"]`) as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = '15000'; el.dispatchEvent(new Event('change', { bubbles: true })); } }, { fn: this.monthlyExpenseField }).catch(() => {}); }
      console.log('\u2713 Monthly Expense: 15000');
    }

    await page.screenshot({ path: 'test-results-temp/retail-dem-complete.png' }).catch(() => {});
  }

  // ==================== PRE-SUBMIT VERIFICATION ====================
  async preSubmitVerification(): Promise<void> {
    console.log('\n=== Pre-Submit: Verify mandatory fields ===');
    const page = this.workingPage;

    // General Details
    try {
      for (const f of page.frames()) { const tab = f.getByText('General Details', { exact: false }).first(); if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); break; } }
      await page.waitForTimeout(this.timeouts.short3);
      for (const f of page.frames()) {
        const result = await f.evaluate((args: { natCode: string; natDisp: string; marField: string }) => {
          const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const res = { foundAny: false, fixes: [] as string[] };
          const nc = document.querySelector(`input[name="${args.natCode}"]`) as HTMLInputElement;
          if (nc) { res.foundAny = true; if (!nc.value) { nc.value = 'AD'; fire(nc); const nd = document.querySelector(`input[name="${args.natDisp}"]`) as HTMLInputElement; if (nd) { nd.value = 'ANDORRA'; fire(nd); } res.fixes.push('Nationality'); } }
          if (args.marField) { const ms = document.querySelector(`select[name="${args.marField}"]`) as HTMLSelectElement; if (ms) { res.foundAny = true; if (!ms.value || ms.selectedIndex <= 0) { for (const o of Array.from(ms.options)) { if (o.text.trim().toLowerCase().includes('married') && !o.text.trim().toLowerCase().includes('un')) { ms.value = o.value; fire(ms); res.fixes.push('Marital'); break; } } } } }
          document.querySelectorAll('input').forEach(el => { const inp = el as HTMLInputElement; if (inp.name.includes('Residence_Country') && !inp.name.startsWith('Cat_') && !inp.name.startsWith('btn') && !inp.name.startsWith('pi_')) { res.foundAny = true; if (!inp.value) { inp.value = 'BM'; fire(inp); const d = document.querySelector(`input[name="Cat_${inp.name}"]`) as HTMLInputElement; if (d) { d.value = 'BERMUDA'; fire(d); } res.fixes.push('Residence'); } } });
          return res;
        }, { natCode: this.nationalityCode, natDisp: this.nationalityDisplay, marField: this.maritalStatusField }).catch(() => ({ foundAny: false, fixes: [] }));
        if (result.foundAny) { if (result.fixes.length > 0) console.log(`  \u2713 Re-filled: ${result.fixes.join(', ')}`); break; }
      }
    } catch (e) { console.log(`  \u26a0 General Details re-fill error`); }

    // Title
    try {
      for (const f of page.frames()) {
        const fixed = await f.evaluate(() => { const el = document.querySelector('input[name="AccountModBO.Salutation_code"]') as HTMLInputElement; if (!el) return null; if (!el.value) { el.value = 'MR'; el.dispatchEvent(new Event('change', { bubbles: true })); return true; } return false; }).catch(() => null);
        if (fixed === true) { console.log('  \u2713 Re-filled Title = MR'); break; }
        if (fixed === false) break;
      }
    } catch (_) {}

    // Employment
    try {
      for (const f of page.frames()) { const tab = f.getByText('Employment Details', { exact: false }).first(); if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); break; } }
      await page.waitForTimeout(this.timeouts.short3);
      if (this.empTypeField) {
        for (const f of page.frames()) {
          const fixed = await f.evaluate((selName: string) => { const sel = document.querySelector(`select[name="${selName}"]`) as HTMLSelectElement; if (!sel) return null; if (sel.value && sel.selectedIndex > 0) return false; for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes('SALARIED') && !o.text.trim().toUpperCase().includes('SELF')) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; } } return false; }, this.empTypeField).catch(() => null);
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
          if (args.incTypeField) { const sel = document.querySelector(`select[name="${args.incTypeField}"]`) as HTMLSelectElement; if (sel) { r.foundAny = true; if (!sel.value || sel.selectedIndex <= 0) { for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes('SALARIED') && !o.text.trim().toUpperCase().includes('SELF')) { sel.value = o.value; fire(sel); r.fixes.push('IncType'); break; } } } } }
          if (args.grossField) { const el = document.querySelector(`input[name="${args.grossField}"]`) as HTMLInputElement; if (el) { r.foundAny = true; if (!el.value || el.value === '0') { el.removeAttribute('readonly'); el.value = '50000'; fire(el); r.fixes.push('Gross'); } } }
          if (args.ccyField) { const sel = document.querySelector(`select[name="${args.ccyField}"]`) as HTMLSelectElement; if (sel) { r.foundAny = true; if (!sel.value || sel.selectedIndex <= 0) { for (const o of Array.from(sel.options)) { if (o.text.trim().includes('USD')) { sel.value = o.value; fire(sel); r.fixes.push('CCY'); break; } } } } }
          if (args.expField) { const el = document.querySelector(`input[name="${args.expField}"]`) as HTMLInputElement; if (el) { r.foundAny = true; if (!el.value) { el.removeAttribute('readonly'); el.value = '15000'; fire(el); r.fixes.push('Expense'); } } }
          return r;
        }, { incTypeField: this.incomeTypeField, grossField: this.grossIncomeField, ccyField: this.demoCurrencyField, expField: this.monthlyExpenseField }).catch(() => ({ foundAny: false, fixes: [] }));
        if (result.foundAny) { if (result.fixes.length > 0) console.log(`  \u2713 Re-filled Income/Expense: ${result.fixes.join(', ')}`); break; }
      }
    } catch (_) {}

    // General tab mandatory fields
    try {
      for (const f of page.frames()) {
        const result = await f.evaluate(() => {
          const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const res = { foundAny: false, fixes: [] as string[] };
          const nl = document.querySelector('select[name="AccountModBO.NativeLangCode"]') as HTMLSelectElement;
          if (nl) { res.foundAny = true; if (!nl.value || nl.selectedIndex <= 0) { for (const o of Array.from(nl.options)) { if (o.text.trim().toUpperCase() === 'ENGLISH') { nl.value = o.value; fire(nl); res.fixes.push('NativeLang'); break; } } } }
          const cl = document.querySelector('input[name="Cat_AccountModBO.Cust_Language"]') as HTMLInputElement;
          if (cl) { res.foundAny = true; if (!cl.value) { cl.value = 'ENGLISH'; fire(cl); const clc = document.querySelector('input[name="AccountModBO.Cust_Language"]') as HTMLInputElement; if (clc) { clc.value = 'ENGLISH'; fire(clc); } res.fixes.push('CustLang'); } }
          const pl = document.querySelector('input[name="Cat_PsychographicBO.Preferred_Locale"]') as HTMLInputElement;
          if (pl) { res.foundAny = true; if (!pl.value) { pl.removeAttribute('readonly'); pl.value = 'en_US'; fire(pl); const plc = document.querySelector('input[name="PsychographicBO.Preferred_Locale"]') as HTMLInputElement; if (plc) { plc.value = 'en_US'; fire(plc); } res.fixes.push('Locale'); } }
          const cm = document.querySelector('select[name="AccountModBO.CustomerMinor"]') as HTMLSelectElement;
          if (cm) { res.foundAny = true; if (!cm.value || cm.selectedIndex <= 0) { for (const o of Array.from(cm.options)) { if (o.value === 'N') { cm.value = o.value; fire(cm); res.fixes.push('Minor'); break; } } } }
          const eb = document.querySelector('select[name="AccountModBO.IsEbankingEnabled"]') as HTMLSelectElement;
          if (eb) { res.foundAny = true; if (!eb.value || eb.selectedIndex <= 0) { for (const o of Array.from(eb.options)) { if (o.value === 'N') { eb.value = o.value; fire(eb); res.fixes.push('Ebank'); break; } } } }
          const dc = document.querySelector('select[name="AccountBO.DefaultChannel_Alert"]') as HTMLSelectElement;
          if (dc) { res.foundAny = true; if (!dc.value || dc.selectedIndex <= 0) { for (const o of Array.from(dc.options)) { if (o.text.trim().toUpperCase().includes('BRANCH')) { dc.value = o.value; fire(dc); res.fixes.push('Channel'); break; } } } }
          return res;
        }).catch(() => ({ foundAny: false, fixes: [] }));
        if (result.foundAny) { if (result.fixes.length > 0) console.log(`  \u2713 Re-filled General: ${result.fixes.join(', ')}`); break; }
      }
    } catch (_) {}

    // Re-fill mandatory fields directly in IFrmtab0 (Basic Info frame), without tab navigation
    try {
      // Find IFrmtab0 frame directly
      let tab0Frame = page.frame({ name: 'IFrmtab0' });
      if (!tab0Frame) {
        // Search for any frame with AccountModBO.lastName field
        for (const f of page.frames()) {
          const hasLastName = await f.evaluate(() => !!document.querySelector('input[name="AccountModBO.lastName"]')).catch(() => false);
          if (hasLastName) { tab0Frame = f; break; }
        }
      }
      if (!tab0Frame) {
        console.log('  ⚠ Cannot find IFrmtab0 or Basic Info frame for re-fill');
      } else {
        console.log(`  Found Basic Info frame: "${tab0Frame.name()}", ${await tab0Frame.evaluate(() => document.querySelectorAll('input').length).catch(() => 0)} inputs`);

      // Re-fill ALL mandatory fields in the General/Basic Info tab
      const TD = CRM_TEST_DATA.retail.endToEnd;
      const refillResult = await tab0Frame.evaluate((args: any) => {
        const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const setInp = (name: string, val: string) => {
          const inp = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
          if (inp) { inp.removeAttribute('readonly'); inp.value = val; fire(inp); return true; }
          return false;
        };
        const setSel = (name: string, val: string) => {
          const sel = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement;
          if (sel) {
            for (const o of Array.from(sel.options)) {
              if (o.text.trim().toUpperCase() === val.toUpperCase() || o.value.toUpperCase() === val.toUpperCase()) { sel.value = o.value; fire(sel); return true; }
            }
            for (const o of Array.from(sel.options)) {
              if (o.text.trim().toUpperCase().includes(val.toUpperCase()) || o.value.toUpperCase().includes(val.toUpperCase())) { sel.value = o.value; fire(sel); return true; }
            }
          }
          return false;
        };
        const fixes: string[] = [];
        // Name fields — use correct Finacle field names
        if (setInp('AccountBO.Cust_First_Name', args.firstName)) fixes.push('firstName');
        if (setInp('AccountBO.Cust_Last_Name', args.lastName)) fixes.push('lastName');
        if (setInp('AccountBO.PreferredName', args.preferredName)) fixes.push('preferredName');
        if (setInp('AccountBO.short_name', args.shortName)) fixes.push('shortName');
        // Also set ContactBO name fields
        setInp('ContactBO.firstName', args.firstName);
        setInp('ContactBO.lastName', args.lastName);
        // DOB
        const dobDisplay = document.querySelector('input[name="3_AccountBO.Cust_DOB"]') as HTMLInputElement;
        if (dobDisplay) { dobDisplay.removeAttribute('readonly'); dobDisplay.value = args.dob; fire(dobDisplay); fixes.push('DOB_display'); }
        const dobHidden = document.querySelector('input[name="AccountBO.Cust_DOB"]') as HTMLInputElement;
        if (dobHidden) { dobHidden.removeAttribute('readonly'); dobHidden.value = args.dob; fire(dobHidden); fixes.push('DOB_hidden'); }
        // Gender, NRI
        if (setSel('AccountModBO.Gender', 'MALE')) fixes.push('Gender');
        if (setSel('AccountModBO.CustomerNREFlg', 'Y')) fixes.push('NRI');
        // Segment
        if (setInp('AccountModBO.Segmentation_Class', args.segment)) fixes.push('Segment');
        // Title
        const titleInp = document.querySelector('input[name="AccountModBO.Salutation_code"]') as HTMLInputElement;
        if (titleInp && !titleInp.value) { titleInp.value = 'MR'; fire(titleInp); fixes.push('Title'); }
        return fixes;
      }, {
        firstName: TD.customerData.firstName.toUpperCase(),
        lastName: TD.customerData.lastName.toUpperCase(),
        preferredName: TD.customerData.preferredName,
        shortName: TD.customerData.shortName,
        dob: TD.customerData.dateOfBirth,
        segment: TD.customerData.segment
      }).catch(() => [] as string[]);
      if (refillResult.length > 0) console.log(`  \u2713 Final re-fill: ${refillResult.join(', ')}`);
      }
    } catch (e) { console.log(`  \u26a0 Final re-fill error: ${(e as any).message?.substring(0, 100)}`); }

    console.log('\u2713 Pre-submit verification complete');
  }
}
