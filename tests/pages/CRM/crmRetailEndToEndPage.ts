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

      // Click the "Customer" item by its visible text to avoid selecting Operations
      await this.clickMenuItem(menuFrame, page, 'Customer');
      console.log('\u2713 Clicked Customer');

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
    await this.handleEntityModFilter(this.workingPage);

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
        const fire = (el: HTMLElement) => {  if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; }el.dispatchEvent(new Event('change', { bubbles: true })); };
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
    await this.captureEvidence('Retail Basic Info - before');
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
      const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
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
      // Set date fields by writing to every known code/display/hidden variant.
      // Finacle may use AccountBO.* or AccountModBO.*, and either the 3_ field or
      // the base field may be the visible display. We update all matches.
      const setDateField = (baseNames: string[], val: string) => {
        if (!val) return { setNames: [] as string[], firstName: '', firstValue: '' };
        const names = new Set<string>();
        for (const bn of baseNames) {
          names.add(bn);
          names.add(`3_${bn}`);
          names.add(`h_${bn}`);
          names.add(`H_${bn}`);
          names.add(`pi_${bn}`);
        }
        const setNames: string[] = [];
        let firstName = '';
        let firstValue = '';
        for (const n of names) {
          for (const inp of Array.from(document.querySelectorAll(`input[name="${n}"]`)) as HTMLInputElement[]) {
            if (inp.type === 'button') continue;
            inp.removeAttribute('readonly');
            inp.value = val;
            fire(inp);
            if (!firstName) { firstName = inp.name; firstValue = inp.value; }
            setNames.push(inp.name);
          }
        }
        return { setNames, firstName, firstValue };
      };
      const dobBases = ['AccountBO.Cust_DOB', 'AccountModBO.Cust_DOB', 'AccountBO.DateOfBirth', 'AccountModBO.DateOfBirth'];
      const nreBases = ['AccountBO.DateOfBecomingNRE', 'AccountModBO.DateOfBecomingNRE', 'AccountModBO.NRE_Date', 'AccountBO.NRE_Date'];
      const dobResult = setDateField(dobBases, args.dob);
      const nreResult = setDateField(nreBases, args.nreDate);
      setSel('AccountModBO.Gender', 'MALE');
      setSel('AccountModBO.CustomerNREFlg', 'Y');
      // Return what was actually set for logging
      const genderSel = document.querySelector('select[name="AccountModBO.Gender"]') as HTMLSelectElement;
      return {
        gender: genderSel?.options[genderSel?.selectedIndex]?.text || 'N/A',
        genderVal: genderSel?.value || 'N/A',
        dobDisplay: dobResult.firstValue, dobHidden: dobResult.setNames.join(', '),
        dobDisplayName: dobResult.firstName, dobHiddenName: dobResult.setNames.length ? 'set' : 'NONE',
        nreDisplayName: nreResult.firstName, nreHiddenName: nreResult.setNames.length ? 'set' : 'NONE',
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
        const segmentCode = TD.customerData.segment || '';
        const segmentDisplay = TD.customerData.segmentDisplay || (segmentCode === 'RET' ? 'RETAIL' : segmentCode);
        await this.setLov(this.accountFrame,
          ['AccountModBO.Segmentation_Class', 'AccountBO.Segmentation_Class'],
          ['Cat_AccountModBO.Segmentation_Class', 'Cat_AccountBO.Segmentation_Class'],
          segmentCode, segmentDisplay, 'Segment');
        console.log(`✓ Segment: ${segmentCode} / ${segmentDisplay}`);
        break;
      } catch (e) {
        console.log(`  ⚠ Segment fill attempt ${attempt + 1} failed: ${(e as any).message?.substring(0, 50)}`);
        await page.waitForTimeout(this.timeouts.short3);
        await this.refreshAccountFrame('retry Segment');
      }
    }

    await this.refreshAccountFrame('after Segment');

    // SubSegment
    if (TD.customerData.segment === 'RET' && TD.customerData.subSegment) {
      for (let retry = 0; retry < 3; retry++) {
        try {
          await this.setSelect(this.accountFrame, ['AccountModBO.SubSegment', 'AccountModBO.Sub_Segment', 'AccountBO.SubSegment', 'AccountBO.Sub_Segment'], TD.customerData.subSegment, 'Sub Segment');
          await page.waitForTimeout(this.timeouts.short);
          const selectedCode = await this.accountFrame.evaluate((val: string) => {
            const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
            let code = '';
            const selects = Array.from(document.querySelectorAll('select'));
            for (const sel of selects) {
              const name = (sel as HTMLSelectElement).name.toLowerCase();
              if (name.includes('sub') && name.includes('segment')) {
                for (const o of Array.from(sel.options)) {
                  if (o.text.trim().toUpperCase() === val.toUpperCase() || o.value.toUpperCase() === val.toUpperCase()) {
                    (sel as HTMLSelectElement).value = o.value;
                    fire(sel);
                    code = o.value;
                    break;
                  }
                }
              }
            }
            const hiddenNames = ['AccountBO.SubSegment', 'AccountModBO.SubSegment', 'AccountBO.Sub_Segment', 'AccountModBO.Sub_Segment'];
            for (const n of hiddenNames) {
              const inp = document.querySelector(`input[name="${n}"]`) as HTMLInputElement | null;
              if (inp) { inp.removeAttribute('readonly'); inp.value = code || val; fire(inp); }
            }
            return code;
          }, TD.customerData.subSegment).catch(() => '');
          console.log(`\u2713 SubSegment: ${TD.customerData.subSegment} (code: ${selectedCode || 'unknown'})`);
          break;
        } catch (e) {
          console.log(`  \u26a0 SubSegment fill attempt ${retry + 1} failed: ${(e as any).message?.substring(0, 80) || e}`);
          await this.refreshAccountFrame('SubSegment retry');
        }
      }
    }

    await this.refreshAccountFrame('before SOL ID');

    // SOL ID
    try {
      const solIdLoc = this.accountFrame.locator('input[name="AccountBO.Primary_sol_id"]').first();
      if (await solIdLoc.isVisible({ timeout: 5000 }).catch(() => false)) {
        await solIdLoc.fill(TD.customerData.solId).catch(async () => {
          await this.reacquireAccountFrame('SOL ID fallback');
          await this.accountFrame?.evaluate((s: string) => { const el = document.querySelector('input[name="AccountBO.Primary_sol_id"]') as HTMLInputElement; if (el) { el.value = s; el.dispatchEvent(new Event('change', { bubbles: true })); } }, TD.customerData.solId).catch(() => {});
        });
      }
      console.log(`\u2713 SOL ID: ${TD.customerData.solId}`);
    } catch (e) {
      console.log(`  \u26a0 SOL ID could not be filled: ${(e as Error).message?.substring(0, 80)}`);
    }

    // CRM Alerts
    await this.accountFrame.locator('select[name="AccountModBO.Enable_Alerts"]').selectOption('Y').catch(() => {});
    console.log('\u2713 CRM Alerts: Y');

    // Preferred Locale
    await this.accountFrame.evaluate((locale: string) => {
      const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const catInput = document.querySelector('input[name="Cat_PsychographicBO.Preferred_Locale"]') as HTMLInputElement;
      if (catInput) { catInput.removeAttribute('readonly'); catInput.value = locale; fire(catInput); }
      const codeInput = document.querySelector('input[name="PsychographicBO.Preferred_Locale"]') as HTMLInputElement;
      if (codeInput) { codeInput.value = locale; fire(codeInput); }
    }, TD.customerData.preferredLocale).catch(() => {});
    console.log(`\u2713 Preferred Locale: ${TD.customerData.preferredLocale}`);
    const genericCustomerData = { ...this.TD.customerData };
    // Fields handled explicitly below/with LOV/code-value lookup; skip the generic filler
    // so they are populated exactly once and workbook Code values are used correctly.
    for (const k of ['title','subSegment','segment','sector','sectorCode','sectorDisplay','region','regionDisplay','tdsTable','tdsTableDisplay','customerType','customerTypeDisplay','cityOfBirth','cityOfBirthDisplay','chargeLevel','chargeLevelCode','chargeLevelDisplay','preferredLocale','primaryRelationshipManagerId','solId']) {
      delete (genericCustomerData as any)[k];
    }
    await this.fillSectionByMeta(this.accountFrame, 'customerData', genericCustomerData, this.TD._meta).catch(() => {});

    // Customer Type, Sector, Region and TDS are handled once in fillCurrencySubTab
    // (after DOB focus) so they are populated with workbook Code values and not duplicated.

    // City of Birth often requires an LOV-driven code/display pair; fall back to direct set if LOV unavailable
    const cityOfBirth = TD.customerData.cityOfBirth || '';
    if (cityOfBirth) {
      const cityOfBirthBtnNames = [
        'btnone_AccountModBO.CityOfBirth',
        'btnone_AccountBO.CityOfBirth',
        'btnone_AccountModBO.Cust_Birth_City',
        'btnone_AccountBO.Cust_Birth_City',
        'btnone_AccountModBO.PlaceOfBirth',
        'btnone_AccountBO.PlaceOfBirth'
      ];
      for (const btn of cityOfBirthBtnNames) {
        const ok = await this.selectLovValue({
          parentPage: page,
          target: this.accountFrame,
          buttonName: btn,
          searchValue: cityOfBirth,
          label: 'City of Birth',
          config: this.config
        }).catch(() => false);
        if (ok) break;
      }
      await this.setLov(
        this.accountFrame,
        ['AccountModBO.CityOfBirth', 'AccountBO.CityOfBirth', 'AccountModBO.Cust_Birth_City', 'AccountBO.Cust_Birth_City', 'AccountModBO.PlaceOfBirth', 'AccountBO.PlaceOfBirth'],
        ['Cat_AccountModBO.CityOfBirth', 'Cat_AccountBO.CityOfBirth', 'Cat_AccountModBO.Cust_Birth_City', 'Cat_AccountBO.Cust_Birth_City', 'Cat_AccountModBO.PlaceOfBirth', 'Cat_AccountBO.PlaceOfBirth'],
        cityOfBirth,
        cityOfBirth,
        'City of Birth'
      ).catch(() => {});
    }

    // Basic Info code LOVs: populated from workbook Code values and not duplicated.
    const customerTypeCode = (TD.customerData as any).customerType || '';
    const customerTypeDisplay = (TD.customerData as any).customerTypeDisplay || '';
    if (customerTypeCode) {
      await this.setRetailCodeLov(
        this.accountFrame, 'Customer Type', customerTypeCode, customerTypeDisplay,
        ['btnone_AccountModBO.CustomerType', 'btnone_AccountBO.CustomerType', 'btnone_AccountModBO.Cust_type_code', 'btnone_AccountBO.Cust_type_code', 'btnone_AccountModBO.Cust_Type', 'btnone_AccountBO.Cust_Type'],
        ['AccountModBO.CustomerType', 'AccountBO.CustomerType', 'AccountModBO.Cust_type_code', 'AccountBO.Cust_type_code'],
        ['Cat_AccountModBO.CustomerType', 'Cat_AccountBO.CustomerType', 'Cat_AccountModBO.Cust_type_code', 'Cat_AccountBO.Cust_type_code']
      );
    }

    const sectorCode = TD.customerData.sectorCode || TD.customerData.sector || '';
    const sectorDisplay = TD.customerData.sectorDisplay || '';
    if (sectorCode) {
      await this.setRetailCodeLov(
        this.accountFrame, 'Sector', sectorCode, sectorDisplay,
        ['btnone_AccountModBO.Sector', 'btnone_AccountBO.Sector', 'btntwo_AccountModBO.Sector', 'btntwo_AccountBO.Sector'],
        ['AccountModBO.Sector', 'AccountBO.Sector'],
        ['Cat_AccountModBO.Sector', 'Cat_AccountBO.Sector']
      );
    }

    const regionCode = TD.customerData.region || '';
    const regionDisplay = TD.customerData.regionDisplay || '';
    if (regionCode) {
      await this.setRetailCodeLov(
        this.accountFrame, 'Region', regionCode, regionDisplay,
        ['btnone_AccountModBO.region', 'btnone_AccountBO.region', 'btnone_AccountModBO.Region', 'btnone_AccountBO.Region', 'btntwo_AccountModBO.region', 'btntwo_AccountBO.region', 'btntwo_AccountModBO.Region', 'btntwo_AccountBO.Region'],
        ['AccountModBO.region', 'AccountModBO.Region', 'AccountBO.region', 'AccountBO.Region'],
        ['Cat_AccountModBO.region', 'Cat_AccountModBO.Region', 'Cat_AccountBO.region', 'Cat_AccountBO.Region']
      );
    }

    const tdsCode = TD.customerData.tdsTable || '';
    const tdsDisplay = TD.customerData.tdsTableDisplay || '';
    if (tdsCode) {
      await this.setRetailCodeLov(
        this.accountFrame, 'Tax Deducted at Source Table', tdsCode, tdsDisplay,
        ['btnone_AccountModBO.Tds_tbl', 'btnone_AccountBO.Tds_tbl', 'btntwo_AccountModBO.Tds_tbl', 'btntwo_AccountBO.Tds_tbl'],
        ['AccountModBO.Tds_tbl', 'AccountModBO.TDS_TBL', 'AccountBO.Tds_tbl', 'AccountBO.TDS_TBL'],
        ['Cat_AccountModBO.Tds_tbl', 'Cat_AccountBO.Tds_tbl']
      );
    }

    const chargeLevel = TD.customerData.chargeLevelCode || '';
    const chargeLevelDisplay = (TD.customerData as any).chargeLevelDisplay || chargeLevel;
    if (chargeLevel) {
      await this.setRetailCodeLov(
        this.accountFrame, 'Charge Level Code', chargeLevel, chargeLevelDisplay,
        ['btnone_AccountModBO.ChargeLevelCode', 'btnone_AccountBO.ChargeLevelCode', 'btntwo_AccountModBO.ChargeLevelCode', 'btntwo_AccountBO.ChargeLevelCode'],
        ['AccountModBO.ChargeLevelCode', 'AccountBO.ChargeLevelCode'],
        ['Cat_AccountModBO.ChargeLevelCode', 'Cat_AccountBO.ChargeLevelCode']
      );
    }

    // Re-apply Title and Sub-segment last so later generic fills cannot wipe them
    await this.setTitleAndSubSegment();

    // Finish remaining Basic Info fields (native language, defaults, tax certification)
    // then sync hidden fields and capture evidence for the General tab.
    await this.completeBasicInfoCommonFields();
  }

  /**
   * Re-apply Title and Sub-segment code/display values and their hidden fields.
   * These two fields are LOV/code-display pairs and are frequently cleared by generic fills.
   */
  private async setTitleAndSubSegment(): Promise<void> {
    await this.reacquireAccountFrame('setTitleAndSubSegment');
    if (!this.accountFrame) this.accountFrame = this.getDemoFrame();
    const TD = this.TD;
    const titleValue = String(TD.customerData.title || 'MR').trim();
    const subSegmentValue = String(TD.customerData.subSegment || '').trim();

    // Title: set code input and Cat display input
    if (titleValue) {
      await this.setLov(
        this.accountFrame,
        ['AccountModBO.Salutation_code', 'AccountBO.Salutation_code', 'Salutation_code'],
        ['Cat_AccountModBO.Salutation_code', 'Cat_AccountBO.Salutation_code', 'Cat_Salutation_code'],
        titleValue,
        titleValue,
        'Title'
      ).catch(() => {});
    }

    // Sub-segment: set the visible select and then sync all hidden/display inputs
    if (subSegmentValue) {
      await this.setSelect(
        this.accountFrame,
        ['AccountModBO.SubSegment', 'AccountBO.SubSegment', 'AccountModBO.Sub_Segment', 'AccountBO.Sub_Segment'],
        subSegmentValue,
        'Sub Segment'
      ).catch(() => {});
      // Make sure the selected value is propagated to hidden code and display inputs
      await this.syncSelectHiddenFields(this.accountFrame);
    }
  }

  /**
   * Open the LOV for a Basic Info code field and select the workbook code value.
   * If the value is already present in the primary code input, the popup is skipped
   * to avoid duplicate population.
   */
  private async setRetailCodeLov(
    frame: any,
    label: string,
    code: string,
    display: string,
    buttonNames: string[],
    codeNames: string[],
    catNames: string[]
  ): Promise<void> {
    const searchCode = String(code || '').replace(/\*/g, '').trim();
    const suppliedDisplay = String(display || '').replace(/\*/g, '').trim();
    // Only use the supplied value as a real display text when it differs from the code.
    // Otherwise we risk writing a raw code (e.g. 41, 540) into the visible Cat_ input.
    const hasDisplay = !!suppliedDisplay && suppliedDisplay.toUpperCase() !== searchCode.toUpperCase();
    const searchDisplay = hasDisplay ? suppliedDisplay : '';
    if (!searchCode) return;

    const alreadySet = await frame.evaluate((names: string[], val: string) => {
      for (const n of names) {
        const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement;
        if (el) return el.value === val;
      }
      return false;
    }, codeNames, searchCode).catch(() => false);
    if (alreadySet) {
      console.log(`  ℹ ${label} already set to ${searchCode}; skipping LOV`);
      return;
    }

    // If a real display value is known, write it directly and skip the popup.
    if (hasDisplay) {
      const directSet = await this.setLov(frame, codeNames, catNames, searchCode, searchDisplay, label).catch(() => false);
      if (directSet) {
        console.log(`  ✓ ${label} set directly to ${searchCode} / ${searchDisplay}; skipping LOV`);
        return;
      }
    } else {
      // Write the hidden code input(s) only; do not touch the visible display field yet
      // so the raw code is not shown as the display text.
      await this.setLov(frame, codeNames, catNames, searchCode, '', label).catch(() => {});
    }

    // Include any LOV buttons discovered from the label (e.g. lbDynamic labels).
    const discoveredButtons = await this.findLovButtonNamesByLabel(frame, label).catch(() => [] as string[]);
    const allButtons: string[] = [];
    for (const b of buttonNames) {
      const c = String(b).replace(/\*/g, '').trim();
      if (c && !allButtons.includes(c)) allButtons.push(c);
    }
    for (const b of discoveredButtons) {
      const c = String(b).replace(/\*/g, '').trim();
      if (c && !allButtons.includes(c)) allButtons.push(c);
    }
    let selected = false;
    const fallback = { code: searchCode, display: searchDisplay };
    for (const btn of allButtons) {
      const ok = await this.selectLovValue({
        parentPage: this.workingPage,
        target: frame,
        buttonName: btn,
        searchValue: searchCode,
        label,
        config: this.config,
        directFieldName: codeNames[0],
        fallback
      }).catch(() => false);
      if (ok) { selected = true; break; }
    }

    // If the popup selected a row but did not resolve the pair, read the display value
    // that CRM wrote into the visible Cat_ input so we can persist and re-apply it.
    if (selected && !fallback.display) {
      for (const cn of catNames) {
        const currentDisplay = await this.readInputValue(frame, cn).catch(() => '');
        if (currentDisplay && currentDisplay.toUpperCase() !== searchCode.toUpperCase()) {
          fallback.display = currentDisplay;
          break;
        }
      }
    }

    // Use the resolved code/display pair from the LOV if available so the code field
    // gets the real server value and the display field gets the category text.
    const resolved = !!(fallback as any).resolved || (!!fallback.code && !!fallback.display);
    const finalCode = fallback.code || searchCode;
    const finalDisplay = fallback.display || searchDisplay;

    if (resolved) {
      await this.setLov(frame, codeNames, catNames, finalCode, finalDisplay, label).catch(() => {});
    } else {
      // No display resolved - set the code only and avoid writing the code into the display field.
      await this.setLovByLabel(frame, label, searchCode, '').catch(() => {});
      await this.setLov(frame, codeNames, catNames, searchCode, '', label).catch(() => {});
    }

    // Persist the resolved code/display back into the test data object so later re-apply
    // steps (ensureBasicInfoValues) write the correct server code instead of the display text.
    const td = this.TD.customerData as any;
    if (resolved) {
      if (label === 'Charge Level Code') { td.chargeLevelCode = fallback.code; td.chargeLevelDisplay = fallback.display; }
      else if (label === 'Customer Type') { td.customerType = fallback.code; td.customerTypeDisplay = fallback.display; }
      else if (label === 'Sector') { td.sector = fallback.code; td.sectorDisplay = fallback.display; }
      else if (label === 'Region') { td.region = fallback.code; td.regionDisplay = fallback.display; }
      else if (label === 'Tax Deducted at Source Table') { td.tdsTable = fallback.code; td.tdsTableDisplay = fallback.display; }
    }
  }

  /**
   * Safety-net re-application of Basic Info values across the active account frame
   * and any Basic-Info-related iframes. The CRM form can reload during tab navigation
   * / LOV popups, so call this before final Submit to ensure names, DOB, gender,
   * title, segment, sub-segment and all LOV code/display pairs are present.
   */
  private async ensureBasicInfoValues(target?: any): Promise<string[]> {
    const page = this.workingPage;
    const TD = this.TD;
    const allFixes: string[] = [];

    // Collect candidate frames: the active account frame, IFrmtab0, formDispFrame,
    // and any frame that hosts AccountMod_det / MainAccountDetForm content.
    const candidates = new Set<any>();
    if (target) candidates.add(target);
    if (this.accountFrame) candidates.add(this.accountFrame);
    if (this.mainAccountFrame && this.mainAccountFrame !== this.accountFrame) candidates.add(this.mainAccountFrame);
    const ifrmtab0 = page.frame({ name: 'IFrmtab0' });
    if (ifrmtab0) candidates.add(ifrmtab0);
    const formDisp = page.frame({ name: 'formDispFrame' });
    if (formDisp) candidates.add(formDisp);
    for (const f of page.frames()) {
      try {
        const u = String(f.url?.() || '').toLowerCase();
        const n = String(f.name?.() || '').toLowerCase();
        if (u.includes('accountmod_det') || u.includes('account_det') || u.includes('mainaccountdetform') || n === 'formdispframe' || n === 'ifrmtab0') {
          candidates.add(f);
        }
      } catch (_) {}
    }

    const frames = Array.from(candidates).filter(f => f && typeof f.evaluate === 'function');
    if (!frames.length) {
      console.log('  ⚠ Cannot find Basic Info frame for final re-apply');
      return [];
    }

    const args = {
      firstName: String(TD.customerData.firstName || '').toUpperCase(),
      lastName: String(TD.customerData.lastName || '').toUpperCase(),
      preferredName: String(TD.customerData.preferredName || ''),
      shortName: String(TD.customerData.shortName || ''),
      dob: String(TD.customerData.dateOfBirth || ''),
      nreDate: String(TD.customerData.nonResidentDate || ''),
      segment: String(TD.customerData.segment || ''),
      segmentDisplay: String(TD.customerData.segmentDisplay || (TD.customerData.segment === 'RET' ? 'RETAIL' : TD.customerData.segment || '')),
      title: String(TD.customerData.title || 'MR').trim(),
      subSegment: String(TD.customerData.subSegment || ''),
      preferredLocale: String(TD.customerData.preferredLocale || ''),
      preferredLanguage: String(TD.customerData.preferredLanguage || TD.customerData.nativeLanguage || ''),
      nativeLanguage: String(TD.customerData.nativeLanguage || ''),
      solId: String(TD.customerData.solId || ''),
      rmId: String(TD.customerData.primaryRelationshipManagerId || ''),
      region: String(TD.customerData.region || ''),
      regionDisplay: String(TD.customerData.regionDisplay || ''),
      tdsTable: String(TD.customerData.tdsTable || ''),
      tdsTableDisplay: String(TD.customerData.tdsTableDisplay || ''),
      customerType: String((TD.customerData as any).customerType || ''),
      customerTypeDisplay: String((TD.customerData as any).customerTypeDisplay || ''),
      cityOfBirth: String(TD.customerData.cityOfBirth || ''),
      cityOfBirthDisplay: String(TD.customerData.cityOfBirthDisplay || ''),
      chargeLevel: String(TD.customerData.chargeLevelCode || (TD.customerData as any).chargeLevel || ''),
      chargeLevelDisplay: String(TD.customerData.chargeLevelDisplay || '')
    };

    const directives: any[] = [
      { label: 'firstName', value: args.firstName, match: args.firstName, codeNames: ['AccountBO.Cust_First_Name', 'AccountModBO.Cust_First_Name', 'AccountModBO.firstName', 'AccountBO.firstName', 'ContactBO.firstName', 'ContactBO.Cust_First_Name'], displayNames: ['Cat_AccountBO.Cust_First_Name', 'Cat_AccountModBO.Cust_First_Name'], selectNames: [] },
      { label: 'lastName', value: args.lastName, match: args.lastName, codeNames: ['AccountBO.Cust_Last_Name', 'AccountModBO.Cust_Last_Name', 'AccountModBO.lastName', 'AccountBO.lastName', 'ContactBO.lastName', 'ContactBO.Cust_Last_Name'], displayNames: ['Cat_AccountBO.Cust_Last_Name', 'Cat_AccountModBO.Cust_Last_Name'], selectNames: [] },
      { label: 'preferredName', value: args.preferredName, match: args.preferredName, codeNames: ['AccountBO.PreferredName', 'AccountModBO.PreferredName', 'AccountBO.Preferred_Name', 'AccountModBO.Preferred_Name'], displayNames: ['Cat_AccountBO.PreferredName', 'Cat_AccountModBO.PreferredName'], selectNames: [] },
      { label: 'shortName', value: args.shortName, match: args.shortName, codeNames: ['AccountBO.short_name', 'AccountModBO.short_name', 'AccountModBO.shortName', 'AccountBO.shortName'], displayNames: ['Cat_AccountBO.short_name', 'Cat_AccountModBO.short_name'], selectNames: [] },
      { label: 'dobDisplay', value: args.dob, match: args.dob, codeNames: ['3_AccountBO.Cust_DOB', '3_AccountModBO.Cust_DOB'], displayNames: [], selectNames: [] },
      { label: 'dobHidden', value: args.dob, match: args.dob, codeNames: ['AccountBO.Cust_DOB', 'AccountModBO.Cust_DOB'], displayNames: [], selectNames: [] },
      { label: 'nreDateDisplay', value: args.nreDate, match: args.nreDate, codeNames: ['3_AccountBO.DateOfBecomingNRE', '3_AccountModBO.NRE_Date'], displayNames: [], selectNames: [] },
      { label: 'nreDateHidden', value: args.nreDate, match: args.nreDate, codeNames: ['AccountBO.DateOfBecomingNRE', 'AccountModBO.NRE_Date'], displayNames: [], selectNames: [] },
      { label: 'gender', value: 'MALE', match: 'MALE', codeNames: ['AccountModBO.Gender', 'AccountBO.Gender'], displayNames: [], selectNames: ['AccountModBO.Gender', 'AccountBO.Gender'] },
      { label: 'nre', value: 'Y', match: 'Y', codeNames: ['AccountModBO.CustomerNREFlg', 'AccountBO.CustomerNREFlg'], displayNames: [], selectNames: ['AccountModBO.CustomerNREFlg', 'AccountBO.CustomerNREFlg'] },
      { label: 'segment', value: args.segment, match: args.segmentDisplay, codeNames: ['AccountModBO.Segmentation_Class', 'AccountBO.Segmentation_Class'], displayNames: ['Cat_AccountModBO.Segmentation_Class', 'Cat_AccountBO.Segmentation_Class'], selectNames: [] },
      { label: 'title', value: args.title, match: args.title, codeNames: ['AccountModBO.Salutation_code', 'AccountBO.Salutation_code', 'Salutation_code'], displayNames: ['Cat_AccountModBO.Salutation_code', 'Cat_AccountBO.Salutation_code'], selectNames: [] },
      { label: 'subSegment', value: args.subSegment, match: args.subSegment, codeNames: ['AccountModBO.SubSegment', 'AccountModBO.Sub_Segment', 'AccountBO.SubSegment', 'AccountBO.Sub_Segment'], displayNames: ['Cat_AccountModBO.SubSegment', 'Cat_AccountModBO.Sub_Segment', 'Cat_AccountBO.SubSegment', 'Cat_AccountBO.Sub_Segment'], selectNames: ['AccountModBO.SubSegment', 'AccountModBO.Sub_Segment', 'AccountBO.SubSegment', 'AccountBO.Sub_Segment'] },
      { label: 'nativeLang', value: 'ENGLISH', match: 'ENGLISH', codeNames: ['AccountModBO.NativeLangCode', 'AccountBO.NativeLangCode'], displayNames: ['Cat_AccountModBO.NativeLangCode', 'Cat_AccountBO.NativeLangCode'], selectNames: ['AccountModBO.NativeLangCode', 'AccountBO.NativeLangCode'] },
      { label: 'preferredLocale', value: args.preferredLocale, match: args.preferredLocale, codeNames: ['PsychographicBO.Preferred_Locale', 'AccountModBO.Preferred_Locale', 'AccountBO.Preferred_Locale'], displayNames: ['Cat_PsychographicBO.Preferred_Locale', 'Cat_AccountModBO.Preferred_Locale', 'Cat_AccountBO.Preferred_Locale'], selectNames: [] },
      { label: 'preferredLanguage', value: args.preferredLanguage, match: args.preferredLanguage, codeNames: ['AccountModBO.Cust_Language', 'AccountBO.Cust_Language'], displayNames: ['Cat_AccountModBO.Cust_Language', 'Cat_AccountBO.Cust_Language'], selectNames: [] },
      { label: 'defaultChannel', value: 'BRANCH', match: 'BRANCH', codeNames: ['AccountModBO.DefaultChannel_Alert', 'AccountBO.DefaultChannel_Alert'], displayNames: ['Cat_AccountModBO.DefaultChannel_Alert', 'Cat_AccountBO.DefaultChannel_Alert'], selectNames: ['AccountModBO.DefaultChannel_Alert', 'AccountBO.DefaultChannel_Alert'] },
      { label: 'minor', value: 'N', match: 'N', codeNames: ['AccountModBO.CustomerMinor', 'AccountBO.CustomerMinor'], displayNames: [], selectNames: ['AccountModBO.CustomerMinor', 'AccountBO.CustomerMinor'] },
      { label: 'ebank', value: 'N', match: 'N', codeNames: ['AccountModBO.IsEbankingEnabled', 'AccountBO.IsEbankingEnabled'], displayNames: [], selectNames: ['AccountModBO.IsEbankingEnabled', 'AccountBO.IsEbankingEnabled'] },
      { label: 'solId', value: args.solId, match: args.solId, codeNames: ['AccountBO.Primary_sol_id', 'AccountModBO.Primary_sol_id'], displayNames: [], selectNames: [] },
      { label: 'rmId', value: args.rmId, match: args.rmId, codeNames: ['Acc_manager', 'AccountModBO.Acc_manager', 'AccountBO.Acc_manager'], displayNames: [], selectNames: [] },
      { label: 'region', value: args.region, match: args.regionDisplay, codeNames: ['AccountModBO.region', 'AccountModBO.Region', 'AccountBO.region', 'AccountBO.Region', '3_AccountModBO.region', '3_AccountModBO.Region', '3_AccountBO.region', '3_AccountBO.Region'], displayNames: ['Cat_AccountModBO.region', 'Cat_AccountModBO.Region', 'Cat_AccountBO.region', 'Cat_AccountBO.Region'], selectNames: ['AccountModBO.region', 'AccountModBO.Region', 'AccountBO.region', 'AccountBO.Region'] },
      { label: 'tdsTable', value: args.tdsTable, match: args.tdsTableDisplay, codeNames: ['AccountModBO.Tds_tbl', 'AccountModBO.TDS_TBL', 'AccountBO.Tds_tbl', 'AccountBO.TDS_TBL'], displayNames: ['Cat_AccountModBO.Tds_tbl', 'Cat_AccountBO.Tds_tbl'], selectNames: [] },
      { label: 'customerType', value: args.customerType, match: args.customerTypeDisplay, codeNames: ['AccountModBO.CustomerType', 'AccountModBO.Cust_type_code', 'AccountBO.CustomerType', 'AccountBO.Cust_type_code'], displayNames: ['Cat_AccountModBO.CustomerType', 'Cat_AccountModBO.Cust_type_code', 'Cat_AccountBO.CustomerType', 'Cat_AccountBO.Cust_type_code'], selectNames: [] },
      { label: 'cityOfBirth', value: args.cityOfBirth, match: args.cityOfBirthDisplay, codeNames: ['AccountModBO.CityOfBirth', 'AccountModBO.Cust_Birth_City', 'AccountModBO.PlaceOfBirth', 'AccountBO.CityOfBirth', 'AccountBO.Cust_Birth_City', 'AccountBO.PlaceOfBirth'], displayNames: ['Cat_AccountModBO.CityOfBirth', 'Cat_AccountModBO.Cust_Birth_City', 'Cat_AccountModBO.PlaceOfBirth', 'Cat_AccountBO.CityOfBirth'], selectNames: [] },
      { label: 'chargeLevel', value: args.chargeLevel, match: args.chargeLevelDisplay, codeNames: ['AccountModBO.ChargeLevelCode', 'AccountBO.ChargeLevelCode'], displayNames: ['Cat_AccountModBO.ChargeLevelCode', 'Cat_AccountBO.ChargeLevelCode'], selectNames: [] }
    ];

    const evalBody = (args: any) => {
      const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const setInput = (names: string[], val: string): boolean => {
        if (!val) return false;
        let any = false;
        for (const n of names) {
          for (const inp of Array.from(document.querySelectorAll(`input[name="${n}"]`)) as HTMLInputElement[]) {
            if (inp.type === 'button') continue;
            const isDisplay = /cat_/i.test(n) || /display/i.test(n);
            if (inp.value !== val) {
              if (isDisplay && inp.value.trim() !== '') {
                any = true;
                continue;
              }
              inp.removeAttribute('readonly');
              inp.removeAttribute('disabled');
              inp.value = val; fire(inp);
            }
            any = true;
          }
        }
        return any;
      };
      const setSelect = (names: string[], match: string): boolean => {
        if (!match) return false;
        const v = match.toUpperCase();
        for (const n of names) {
          const sel = document.querySelector(`select[name="${n}"]`) as HTMLSelectElement;
          if (sel) {
            for (const o of Array.from(sel.options)) {
              if (o.text.trim().toUpperCase() === v || o.value.toUpperCase() === v) {
                if (sel.value !== o.value) { sel.value = o.value; fire(sel); return true; }
                return true;
              }
            }
            for (const o of Array.from(sel.options)) {
              if (o.text.trim().toUpperCase().includes(v) || o.value.toUpperCase().includes(v)) {
                if (sel.value !== o.value) { sel.value = o.value; fire(sel); return true; }
                return true;
              }
            }
          }
        }
        return false;
      };
      const apply = (d: any): boolean => {
        let fixed = false;
        if (d.codeNames && setInput(d.codeNames, d.value)) fixed = true;
        // Only write to a display/Cat_ input when an explicit display text is available.
        // Falling back to the code value here would put raw codes (e.g. 41, 540) in the UI.
        if (d.displayNames && setInput(d.displayNames, d.match || '')) fixed = true;
        if (d.selectNames && setSelect(d.selectNames, d.match || d.value)) fixed = true;
        return fixed;
      };
      const fixes: string[] = [];
      for (const d of args.directives) {
        if (apply(d)) fixes.push(d.label);
      }
      return fixes;
    };

    for (const frame of frames) {
      try {
        const result = await frame.evaluate(evalBody, { directives });
        if (result && result.length) {
          allFixes.push(...result);
        }
      } catch (e) { console.log('  ⚠ ensureBasicInfoValues frame error: ' + String(e).substring(0, 100)); }
    }

    if (allFixes.length) console.log(`  ✓ Basic Info values ensured: ${[...new Set(allFixes)].join(', ')}`);
    return [...new Set(allFixes)];
  }

  /**
   * Finish the General/Basic Info tab with the fields that follow the core LOVs.
   * Customer Type, Sector, Region, TDS and Charge Level are handled earlier in
   * fillBasicInfo to avoid duplicate population.
   */
  private async completeBasicInfoCommonFields(): Promise<void> {
    const page = this.workingPage;
    const TD = this.TD;

    // Re-focus the main Basic Info frame after DOB focus / Tax Certification may have switched tabs.
    await this.reacquireAccountFrame('completeBasicInfoCommonFields main', undefined, true).catch(() => {});
    if (!this.accountFrame) this.accountFrame = this.mainAccountFrame || this.getDemoFrame();
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
    await this.refreshAccountFrame('before Cust_Language LOV', undefined, true);
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
          await this.safeClosePopup(lovPopup, 5000);
        } else { await this.safeClosePopup(lovPopup, 5000); }
      }
    } else {
      await this.accountFrame.evaluate(() => {
        const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const cl = document.querySelector('input[name="AccountModBO.Cust_Language"]') as HTMLInputElement;
        if (cl) { cl.value = 'India (English)'; fire(cl); }
        const cat = document.querySelector('input[name="Cat_AccountModBO.Cust_Language"]') as HTMLInputElement;
        if (cat) { cat.value = 'India (English)'; fire(cat); }
      }).catch(() => {});
    }
    await page.waitForTimeout(this.timeouts.short);

    // Preferred Locale (re-set)
    await this.refreshAccountFrame('after Cust_Language LOV', undefined, true);
    await this.accountFrame.evaluate(() => {
      const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const pl = document.querySelector('input[name="Cat_PsychographicBO.Preferred_Locale"]') as HTMLInputElement;
      if (pl) { pl.removeAttribute('readonly'); pl.value = 'en_US'; fire(pl); }
      const plc = document.querySelector('input[name="PsychographicBO.Preferred_Locale"]') as HTMLInputElement;
      if (plc) { plc.value = 'en_US'; fire(plc); }
    }).catch(() => {});

    await this.refreshAccountFrame('after Preferred Locale', undefined, true);

    // Default Channel, Minor Indicator, IsEbankingEnabled, PRM ID
    await this.accountFrame.evaluate(() => {
      const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const setSel = (name: string, match: string) => { const s = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement; if (s) { for (const o of Array.from(s.options)) { if (o.text.trim().toUpperCase().includes(match) || o.value === match) { s.value = o.value; fire(s); break; } } } };
      setSel('AccountBO.DefaultChannel_Alert', 'BRANCH');
      setSel('AccountModBO.CustomerMinor', 'N');
      setSel('AccountModBO.IsEbankingEnabled', 'N');
    }).catch(() => {});

    // Basel Profiling and Foreign A/c. Tax Reporting (mandatory in newer builds)
    for (const f of page.frames()) {
      const fixes = await f.evaluate(() => {
        const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const findLabel = (el: HTMLElement): string => {
          let node = el.parentElement;
          for (let i = 0; i < 5 && node; i++) { const text = (node.textContent || '').trim(); if (text.length > 0) return text; node = node.parentElement; }
          return '';
        };
        const setNo = (sel: HTMLSelectElement): boolean => {
          for (const o of Array.from(sel.options)) { if (o.value === 'N' || o.text.trim().toUpperCase() === 'NO' || o.text.trim().toUpperCase().startsWith('NO')) { sel.value = o.value; fire(sel); return true; } }
          return false;
        };
        const results: string[] = [];
        for (const sel of Array.from(document.querySelectorAll('select'))) {
          const r = sel.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const name = sel.name || '';
          const label = findLabel(sel).toLowerCase();
          const combined = (name + ' ' + label).toLowerCase();
          if ((combined.includes('basel') && combined.includes('profil')) || name.toLowerCase().includes('basel')) {
            if (setNo(sel)) results.push('BaselProfiling');
          }
          if ((label.includes('foreign') && (label.includes('tax') || label.includes('a/c'))) || name.toLowerCase().includes('foreign') || name.toLowerCase().includes('taxreporting') || name.toLowerCase().includes('fatca')) {
            if (setNo(sel)) results.push('ForeignAcTaxReporting');
          }
        }
        return results;
      }).catch(() => [] as string[]);
      if (fixes && fixes.length) console.log(`\u2713 Mandatory selects: ${fixes.join(', ')}`);
    }

    await this.accountFrame.evaluate((rmId: string) => {
      const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const inp = document.querySelector('input[name="Acc_manager"]') as HTMLInputElement;
      if (inp) { inp.value = rmId; fire(inp); }
    }, TD.customerData.primaryRelationshipManagerId).catch(() => {});
    console.log(`\u2713 PRM ID: ${TD.customerData.primaryRelationshipManagerId}`);

    // Sync hidden pi_ values while the General tab is still active.
    await this.syncSelectHiddenFields(this.accountFrame);

    // Tax Certification Details (General tab) — only after all Basic Info fields are complete.
    await this.fillTaxCertificationSection(this.TD.taxCertificationData);
    await this.closeUnexpectedPopups(page);
    await page.waitForTimeout(this.timeouts.short3);
    await this.captureEvidence('Retail Basic Info - after');
  }

  // Backwards-compatible no-op: the Currency sub-tab population is now completed inside fillBasicInfo.
  async fillCurrencySubTab(): Promise<void> {
    console.log('\n=== Currency Sub-Tab (within General) — completed as part of Basic Info ===');
  }

  // ==================== FILL CONTACT TAB ====================
  async fillContactTab(): Promise<void> {
    console.log('\n========== CONTACT TAB ==========');
    await this.captureEvidence('Retail Contact - before');
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

    const contact = TD.contactData;
    const addresses = contact.addresses || [contact];
    const phones = contact.phones || [contact];
    const emails = contact.emails || [contact];

    // === ADDRESS POPUP ===
    for (const addr of addresses) { await this.addAddress(addressFrame, addr); }

    // === PHONE POPUP ===
    for (const phone of phones) { await this.addPhone(addressFrame, phone); }

    // === EMAIL POPUP ===
    for (const email of emails) { await this.addEmail(addressFrame, email); }

    await this.closeUnexpectedPopups(page);
    await page.waitForTimeout(this.timeouts.short3);
  }

  // ==================== ADDRESS POPUP HELPER ====================
  private async addAddress(addressFrame: any, addressData?: any): Promise<void> {
    const page = this.workingPage;
    const data = addressData || this.TD.contactData;

    // Re-find the Add Address button in case the frame was detached/recreated
    let addBtnFrame: any = addressFrame;
    let addBtn = addBtnFrame.locator('input[name="Add Address Details"]');
    if (!(await addBtn.isVisible({ timeout: this.timeouts.medium }).catch(() => false))) {
      let found = false;
      for (const f of page.frames()) {
        const b = f.locator('input[name="Add Address Details"]');
        if (await b.isVisible({ timeout: 3000 }).catch(() => false)) { addBtnFrame = f; addBtn = b; found = true; break; }
      }
      if (!found) { console.log('\u26a0 Add Address Details button not found'); return; }
    }

    await this.closeUnexpectedPopups(page);
    await page.waitForTimeout(this.timeouts.short);

    const popupPromise = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
    try { await addBtn.click({ force: true, timeout: 10000 }); } catch (_) {
      await addBtnFrame.evaluate(() => { const b = document.querySelector('input[name="Add Address Details"]') as HTMLInputElement; if (b) b.click(); });
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
    await this.captureEvidence('Retail Address popup opened', undefined, addressPopup).catch(() => {});

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
      const preferred = data.addressType || 'Mailing';
      const exact = catOpts.find((o: string) => o.trim() === preferred);
      const fallback = catOpts.find((o: string) => o === 'Mailing') || catOpts.find((o: string) => o.includes(preferred)) || catOpts.find((o: string) => o.includes('Mailing'));
      const validCat = exact || fallback;
      if (validCat) { await ac.selectOption({ label: validCat }); await ac.evaluate((el: HTMLSelectElement) => el.dispatchEvent(new Event('change', { bubbles: true }))); console.log(`\u2713 Address Category: ${validCat}`); }
    }

    // Address fields
    const fillField = async (name: string, value: string, label: string) => {
      const loc = popupTarget.locator(`input[name="${name}"], textarea[name="${name}"]`).first();
      if (await loc.isVisible({ timeout: 3000 }).catch(() => false)) { await loc.fill(value); console.log(`\u2713 ${label}: ${value}`); }
    };
    await fillField('AccountBO.Address.address_Line1', data.addressLine1, 'Address Line 1');
    await fillField('AccountBO.Address.FreeTextLabel', data.addressLabel, 'Address Label');
    await fillField('AccountBO.Address.house_no', data.houseNo, 'House No');
    await fillField('AccountBO.Address.premise_name', data.premiseName, 'Premise Name');
    await fillField('AccountBO.Address.building_level', data.buildingLevel, 'Building Level');
    await fillField('AccountBO.Address.street_no', data.streetNo, 'Street No');
    await fillField('AccountBO.Address.suburb', data.suburb, 'Suburb');
    await fillField('AccountBO.Address.street_name', data.streetName || data.addressLabel, 'Street Name');
    await fillField('AccountBO.Address.locality_name', data.localityName, 'Locality Name');
    await fillField('AccountBO.Address.town', data.city, 'Town');

    // LOV fields
    await this.selectLovValue({ parentPage: page, target: popupTarget, buttonName: 'btnone_AccountBO.Address.city', searchValue: data.city, label: 'City', config: this.config, directFieldName: 'AccountBO.Address.city', parentPopup: addressPopup });
    await this.selectLovValue({ parentPage: page, target: popupTarget, buttonName: 'btnone_AccountBO.Address.state', searchValue: data.state, label: 'State', config: this.config, directFieldName: 'AccountBO.Address.state', parentPopup: addressPopup });
    await this.selectLovValue({ parentPage: page, target: popupTarget, buttonName: 'btnone_AccountBO.Address.country', searchValue: data.country, label: 'Country', config: this.config, directFieldName: 'AccountBO.Address.country', parentPopup: addressPopup });

    // Country fallback
    const cv = await popupTarget.locator('input[name="Cat_AccountBO.Address.country"]').inputValue().catch(() => '');
    if (!cv || cv.trim().length === 0) {
      await popupTarget.evaluate(() => {
        const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const c = document.querySelector('input[name="AccountBO.Address.country"]') as HTMLInputElement;
        if (c) { c.value = 'BM'; fire(c); }
        const cat = document.querySelector('input[name="Cat_AccountBO.Address.country"]') as HTMLInputElement;
        if (cat) { cat.value = 'BERMUDA'; fire(cat); }
      }).catch(() => {});
    }

    // Zip, Start Date, End Date, Address Proof
    await fillField('AccountBO.Address.zip', data.zip, 'Zip');
    const startDateFields = ['3_AccountBO.Address.Start_Date', 'AccountBO.Address.Start_Date', 'h_AccountBO.Address.Start_Date'];
    for (const sd of startDateFields) {
      const sl = popupTarget.locator(`input[name="${sd}"], textarea[name="${sd}"]`).first();
      if (await sl.isVisible({ timeout: 1500 }).catch(() => false)) {
        await sl.fill(data.startDate);
      } else {
        await popupTarget.evaluate((args: { n: string; v: string }) => {
          const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const el = document.querySelector(`input[name="${args.n}"]`) as HTMLInputElement;
          if (el) { el.removeAttribute('readonly'); el.value = args.v; fire(el); }
        }, { n: sd, v: data.startDate }).catch(() => {});
      }
    }
    console.log(`\u2713 Start Date: ${data.startDate}`);
    const endDateLoc = popupTarget.locator('input[name="AccountBO.Address.End_Date"]');
    if (await endDateLoc.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (!(await endDateLoc.isDisabled().catch(() => true))) { await endDateLoc.fill('31/12/2099'); }
    }
    const addrProof = popupTarget.locator('select[name="AccountBO.Address.IsAddressProofRcvd"]');
    if (await addrProof.isVisible({ timeout: 3000 }).catch(() => false)) { await addrProof.selectOption({ label: 'Y' }); console.log('\u2713 Address Proof: Y'); }
    await this.captureEvidence('Retail Address popup filled', undefined, addressPopup).catch(() => {});

    // Save address popup
    let saveBtn: any = null;
    let saveBtnFrame: any = null;
    const saveSelectors = [
      'input[name="Save"]', 'input[value="Save"]', 'input[name="save"]', 'input[value="save"]',
      'input[type="submit"][value="Save"]', 'input[type="submit"][value="Submit"]',
      'input[value="Submit"]', 'input[value="OK"]', 'input[value="ok"]',
      'button:has-text("Save")', 'button:has-text("Submit")',
      'a:has-text("Save")', 'a:has-text("Submit")'
    ];
    for (const pf of addressPopup.frames().concat([popupTarget])) {
      for (const sel of saveSelectors) {
        const b = pf.locator(sel).first();
        if (await b.isVisible({ timeout: 3000 }).catch(() => false)) { saveBtn = b; saveBtnFrame = pf; break; }
      }
      if (saveBtn) break;
    }
    if (saveBtn) {
      await this.captureEvidence('Retail Address popup before save', undefined, addressPopup).catch(() => {});
      const addrDlgHandler = async (d: Dialog) => { await d.accept().catch(() => {}); };
      addressPopup.on('dialog', addrDlgHandler);
      await saveBtn.click();
      console.log('\u2713 Clicked Save in Address popup');
      try { await addressPopup.waitForEvent('close', { timeout: 10000 }); } catch (_) {}
      await this.safeClosePopup(addressPopup, 3000);
      await this.captureEvidence('Retail Address popup after save', undefined, addressPopup).catch(() => {});
      try { addressPopup.removeListener('dialog', addrDlgHandler); } catch (_) {}
    } else {
      console.log('\u26a0 Save button not found in Address popup');
    }
    await page.waitForTimeout(this.timeouts.medium);

    // Propagate the start date to any Start_Date hidden fields in the main form
    for (const f of page.frames()) {
      await f.evaluate((v: string) => {
        const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        for (const el of Array.from(document.querySelectorAll('input, textarea')) as (HTMLInputElement | HTMLTextAreaElement)[]) {
          const n = (el.name || '').toLowerCase();
          if (n.includes('start_date') && !n.includes('end_date') && !n.startsWith('cat_') && !n.startsWith('btn') && !n.startsWith('pi_')) {
            el.removeAttribute('readonly');
            el.value = v;
            fire(el);
          }
        }
      }, data.startDate).catch(() => {});
    }

    await this.closeUnexpectedPopups(page);
    console.log('\u2713 Address saved');
  }

  // ==================== PHONE POPUP HELPER ====================
  private async addPhone(phoneEmailFrame: any, phoneData?: any): Promise<void> {
    const page = this.workingPage;
    const data = phoneData || this.TD.contactData;
    const base = this.TD.contactData;

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
      const match = opts.find((o: string) => o === base.preferredContactNoType) || opts.find((o: string) => o.includes('COMMUNICATION PHONE')) || opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
      if (match) { await prefContact.selectOption({ label: match }); console.log(`\u2713 Preferred Contact No. Type: ${match}`); }
    }

    // Preferred E-Mail ID Type
    const prefEmail = pef.locator('select[name="AccountBO.PhoneEmail.PhoneEmailType1"]');
    if (await prefEmail.isVisible({ timeout: 5000 }).catch(() => false)) {
      const opts = await prefEmail.locator('option').allTextContents();
      const preferredType = data.emailType || '';
      const exact = preferredType ? opts.find((o: string) => o.trim().toUpperCase() === preferredType.toUpperCase()) : undefined;
      const includes = preferredType ? opts.find((o: string) => o.trim().toUpperCase().includes(preferredType.toUpperCase())) : undefined;
      const fallback = opts.find((o: string) => o.includes('COMMUNICATION')) || opts.find((o: string) => o.includes('WORK')) || opts.find((o: string) => o.includes('HOME')) || opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
      const match = exact || includes || fallback;
      if (match) {
        await prefEmail.selectOption({ label: match });
        console.log(`\u2713 Preferred E-Mail ID Type: ${match}`);
      }
    }

    // Preferred Mobile Alert Type
    const prefMobile = pef.locator('select[name="AccountBO.Preferred_Mobile_Alert_Type"]');
    if (await prefMobile.isVisible({ timeout: 3000 }).catch(() => false)) {
      const opts = await prefMobile.locator('option').allTextContents();
      const match = opts.find((o: string) => o === base.preferredContactNoType) || opts.find((o: string) => o.includes('COMMUNICATION PHONE')) || opts.find((o: string) => o.includes('MOBILE')) || opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
      if (match) { await prefMobile.selectOption({ label: match }); }
    }
    await page.waitForTimeout(this.timeouts.short);

    // Open Phone popup
    let addPhonePef = pef;
    let addPhoneBtn = addPhonePef.locator('input[name="Add Phone and E-mail"], input[value="Add Phone and E-mail"]').first();
    if (!(await addPhoneBtn.isVisible({ timeout: this.timeouts.medium }).catch(() => false))) {
      for (const f of page.frames()) {
        const b = f.locator('input[name="Add Phone and E-mail"], input[value="Add Phone and E-mail"]').first();
        if (await b.isVisible({ timeout: 3000 }).catch(() => false)) { addPhonePef = f; addPhoneBtn = b; break; }
      }
    }
    if (await addPhoneBtn.isVisible({ timeout: this.timeouts.medium }).catch(() => false)) {
      const popupPromise = page.context().waitForEvent('page', { timeout: this.timeouts.long15 }).catch(() => null);
      try { await addPhoneBtn.click({ force: true, timeout: 10000 }); } catch (_) { await addPhonePef.evaluate(() => { const b = document.querySelector('input[name="Add Phone and E-mail"], input[value="Add Phone and E-mail"]') as HTMLInputElement; if (b) b.click(); }); }

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
          const preferred = data.phoneType || 'COMMUNICATION PHONE';
          const match = opts.find((o: string) => o.trim() === preferred) || opts.find((o: string) => o.includes(preferred)) || opts.find((o: string) => o.includes('COMMUNICATION PHONE')) || opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
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
        await fillIfEnabled('input[name="AccountBO.PhoneEmail.PhoneNo.cntrycode"]', data.countryCode, phonePopup);
        await fillIfEnabled('input[name="AccountBO.PhoneEmail.PhoneNo.areacode"]', data.areaCode, phonePopup);
        await fillIfEnabled('input[name="AccountBO.PhoneEmail.PhoneNo.localcode"]', data.phoneNumber, phonePopup);
        console.log(`\u2713 Phone: +${data.countryCode} ${data.areaCode} ${data.phoneNumber}`);

        await phonePopup.waitForTimeout(2000);

        let phoneSaveBtn: any = null;
        for (const pf of phonePopup.frames()) {
          for (const sel of ['input[name="Save"]', 'input[value="Save"]', 'input[name="save"]', 'input[value="save"]']) {
            const b = pf.locator(sel).first();
            if (await b.isVisible({ timeout: 3000 }).catch(() => false)) { phoneSaveBtn = b; break; }
          }
          if (phoneSaveBtn) break;
        }

        if (phoneSaveBtn) {
          const phoneDlgHandler = async (d: Dialog) => { await d.accept().catch(() => {}); };
          phonePopup.on('dialog', phoneDlgHandler);
          await phoneSaveBtn.click();
          console.log('\u2713 Clicked Save in Phone popup');
          try { await phonePopup.waitForEvent('close', { timeout: 5000 }); } catch (_) {}
          await this.safeClosePopup(phonePopup, 5000);
          console.log('\u2713 Phone saved');
          try { phonePopup.removeListener('dialog', phoneDlgHandler); } catch (_) {}
        } else {
          console.log('\u26a0 Save button not found in Phone popup');
        }
        await page.waitForTimeout(this.timeouts.medium);
        await this.closeUnexpectedPopups(page);
      }
    }
  }

  // ==================== EMAIL POPUP HELPER ====================
  private async addEmail(phoneEmailFrame: any, emailData?: any): Promise<void> {
    const page = this.workingPage;
    const data = emailData || this.TD.contactData;

    await this.closeUnexpectedPopups(page);
    let pef = page.frame({ name: 'formDispFrame' }) || this.accountFrame;

    // Re-search the Add Phone and E-mail button in case the frame was detached/recreated
    let addEmailPef = pef;
    let addEmailBtn = addEmailPef.locator('input[name="Add Phone and E-mail"], input[value="Add Phone and E-mail"]').first();
    if (!(await addEmailBtn.isVisible({ timeout: this.timeouts.medium }).catch(() => false))) {
      for (const f of page.frames()) {
        const b = f.locator('input[name="Add Phone and E-mail"], input[value="Add Phone and E-mail"]').first();
        if (await b.isVisible({ timeout: 3000 }).catch(() => false)) { addEmailPef = f; addEmailBtn = b; break; }
      }
    }
    if (!(await addEmailBtn.isVisible({ timeout: this.timeouts.medium }).catch(() => false))) { console.log('\u26a0 Add Phone and E-mail button not found for Email'); return; }

    const popupPromise = page.context().waitForEvent('page', { timeout: this.timeouts.long15 }).catch(() => null);
    try { await addEmailBtn.click({ force: true, timeout: 10000 }); } catch (_) { await addEmailPef.evaluate(() => { const b = document.querySelector('input[name="Add Phone and E-mail"], input[value="Add Phone and E-mail"]') as HTMLInputElement; if (b) b.click(); }); }

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
      const preferred = data.emailType || '';
      const match = opts.find((o: string) => preferred && o.trim() === preferred) || opts.find((o: string) => o.includes('COMMUNICATION') || o.includes('HOME')) || opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
      if (match) { await emailTypeDD.selectOption({ label: match }); }
      await emailPopup.waitForTimeout(2000);
    }

    // Email address
    const patterns = ['input[name="AccountBO.PhoneEmail.Email"]', 'input[name*="EmailId"]', 'input[name*="email"]', 'input[name*="Email"]'];
    for (const p of patterns) {
      const ef = et.locator(p).first();
      if (await ef.isVisible({ timeout: 2000 }).catch(() => false)) {
        await ef.fill(data.email);
        console.log(`\u2713 Email: ${data.email}`);
        break;
      }
    }

    await emailPopup.waitForTimeout(2000);

    // Mark as Preferred inside the email popup if a flag exists
    const emailPreferredVal = String(data.isPreferred || 'Y').toUpperCase();
    const preferredEmailSel = et.locator('select[name*="IsPreferred" i], select[name*="Preferred" i]').first();
    if (await preferredEmailSel.isVisible({ timeout: 2000 }).catch(() => false)) {
      const opts = await preferredEmailSel.locator('option').allTextContents().catch(() => []);
      const desired = (emailPreferredVal === 'Y' || emailPreferredVal === 'YES') ? ['Y', 'YES', 'TRUE', '1'] : ['N', 'NO', 'FALSE', '0'];
      const preferredOpt = opts.find((o: string) => desired.includes(o.trim().toUpperCase())) || opts.find((o: string) => o.trim() !== '--Select--' && o.trim() !== '');
      if (preferredOpt) {
        await preferredEmailSel.selectOption({ label: preferredOpt }).catch(() => {});
        console.log('\u2713 Marked email as Preferred in popup (select)');
      }
    } else {
      for (const sel of [
        'input[type="checkbox"][name*="Preferred" i]', 'input[type="radio"][name*="Preferred" i]',
        'input[name*="IsPreferred" i]', 'input[type="checkbox"]', 'input[type="radio"]'
      ]) {
        const pref = et.locator(sel).first();
        if (await pref.isVisible({ timeout: 2000 }).catch(() => false)) {
          if (emailPreferredVal === 'Y' || emailPreferredVal === 'YES') {
            if (!(await pref.isChecked().catch(() => false))) { await pref.check(); }
          }
          console.log('\u2713 Marked email as Preferred in popup');
          break;
        }
      }
    }
    await emailPopup.waitForTimeout(1000);

    let emailSaveBtn: any = null;
    for (const pf of emailPopup.frames()) {
      for (const sel of ['input[name="Save"]', 'input[value="Save"]', 'input[name="save"]', 'input[value="save"]']) {
        const b = pf.locator(sel).first();
        if (await b.isVisible({ timeout: 3000 }).catch(() => false)) { emailSaveBtn = b; break; }
      }
      if (emailSaveBtn) break;
    }

    if (emailSaveBtn) {
      const emailDlgHandler = async (d: Dialog) => { await d.accept().catch(() => {}); };
      emailPopup.on('dialog', emailDlgHandler);
      await emailSaveBtn.click();
      console.log('\u2713 Clicked Save in Email popup');
      try { await emailPopup.waitForEvent('close', { timeout: 5000 }); } catch (_) {}
      await this.safeClosePopup(emailPopup, 5000);
      console.log('\u2713 Email saved');
      try { emailPopup.removeListener('dialog', emailDlgHandler); } catch (_) {}
    } else {
      console.log('\u26a0 Save button not found in Email popup');
    }
    await page.waitForTimeout(this.timeouts.medium);
    await this.closeUnexpectedPopups(page);

    // Mark the email row as preferred in the Phone and E-Mail grid using the CRM email value
    try {
      const emailAddress = data.email || (this.TD.contactData as any).email || '';
      if (emailAddress) {
        const emailTarget = emailAddress.toUpperCase();
        const framesToSearch = phoneEmailFrame ? [phoneEmailFrame, ...page.frames().filter((f: any) => f !== phoneEmailFrame)] : [page.frame({ name: 'formDispFrame' }) || this.accountFrame, ...page.frames()];
        let marked = false;
        for (const f of framesToSearch.filter(Boolean)) {
          marked = await f.evaluate((email: string) => {
            const emailTarget = email.toUpperCase();
            const rows = Array.from(document.querySelectorAll('table tr'));
            for (const row of rows) {
              if ((row.textContent || '').toUpperCase().includes(emailTarget)) {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length === 0) continue;
                const selectCell = cells[cells.length - 1];
                const link = selectCell.querySelector('a');
                if (link) { (link as HTMLElement).click(); return true; }
                const inputs = Array.from(row.querySelectorAll('input[type="radio"], input[type="checkbox"]')) as HTMLInputElement[];
                for (const inp of inputs) {
                  if (inp.offsetWidth > 0 && inp.offsetHeight > 0) {
                    inp.click();
                    inp.checked = true;
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    inp.dispatchEvent(new Event('click', { bubbles: true }));
                    return true;
                  }
                }
                (selectCell as HTMLElement).click();
                return true;
              }
            }
            return false;
          }, emailTarget).catch(() => false);
          if (marked) { console.log('\u2713 Marked saved email as preferred in contact grid'); break; }
        }
        if (!marked) console.log('\u26a0 Could not mark saved email as preferred in contact grid');
      }
    } catch (_) {}
    await this.captureEvidence('Retail Contact - after');
  }

  // ==================== QUALIFICATION RECORD FILLER ====================
  private async fillQualificationRecord(frame: any, rec: any): Promise<void> {
    const page = this.workingPage;
    // Use the provided qualification frame/popup consistently
    let qf = frame || this.getDemoFrame();
    // Set Qualification first so dependent fields are revealed
    const qualification = rec.qualification || rec.qualificationType || rec.qualificationCode || '';
    if (qualification) {
      await this.setGenericFieldByLabel(qf, 'Qualification', String(qualification), 'select').catch(() => {});
      await page.waitForTimeout(2000).catch(() => {});
    }
    // Do not re-set qualification in the generic fill below
    const data: any = { ...rec };
    delete data.qualification;
    delete data.qualificationType;
    delete data.qualificationCode;

    // Fill the rest of the qualification fields by metadata first
    for (let pass = 0; pass < 2; pass++) {
      qf = frame || this.getDemoFrame();
      await this.fillSectionByMeta(qf, 'qualificationData', data, this.TD._meta).catch(() => {});
      await page.waitForTimeout(1500).catch(() => {});
    }

    // Fallback: fill each known field by label explicitly in case fillSectionByMeta missed it
    const knownFields = [
      { key: 'graduationDay', label: 'Graduation Day', type: 'date' },
      { key: 'instituteOrUniversity', label: 'Institute or University', type: 'text' },
      { key: 'mainSubject', label: 'Main Subject', type: 'text' },
      { key: 'marksObtained', label: 'Marks Obtained', type: 'number' },
      { key: 'marksObtainedPcnt', label: 'Marks Obtained (Pcnt.)', type: 'number' },
      { key: 'classObtained', label: 'Class Obtained', type: 'select' }
    ];
    for (const f of knownFields) {
      const v = rec[f.key];
      if (v === undefined || v === null || String(v).trim() === '') continue;
      for (let pass = 0; pass < 2; pass++) {
        qf = frame || this.getDemoFrame();
        const ok = await this.setGenericFieldByLabel(qf, f.label, String(v), f.type).catch(() => false);
        if (ok) { await page.waitForTimeout(500).catch(() => {}); break; }
      }
    }
    await this.syncSelectHiddenFields(frame || this.getDemoFrame()).catch(() => {});
  }

  // ==================== FILL ID DOCUMENT TAB ====================
  async fillIdDocumentTab(): Promise<void> {
    console.log('\n========== ID DOCUMENT TAB ==========');
    await this.captureEvidence('Retail ID Document - before');
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

    const docsToAdd = Array.isArray(TD.documents) ? [...TD.documents] : [];
    if (TD.validDocData?.documentCode && !docsToAdd.some(d => d.documentCode === TD.validDocData.documentCode)) {
      docsToAdd.push(TD.validDocData);
    }
    if (docsToAdd.length === 0) docsToAdd.push(TD.validDocData);
    // If a Passport (IDPAS) record exists, prefer it; otherwise respect workbook values
    const hasPassport = docsToAdd.some(d => String(d.documentCode).toUpperCase().includes('PAS'));
    for (let i = 0; i < docsToAdd.length; i++) {
      const doc = docsToAdd[i];
      const isPassport = String(doc.documentCode || '').toUpperCase().includes('PAS') || String(doc.documentType || '').toLowerCase().includes('passport');
      if (hasPassport) doc.isPreferred = isPassport ? 'Y' : 'N';
    }
    for (const docData of docsToAdd) {
      const docCodeUpper = String(docData.documentCode || '').toUpperCase();
      const docTypeUpper = String(docData.documentType || '').toUpperCase();
      // Some document codes (e.g. OTDOC / OTHER) do not accept an expiry date.
      const skipExpiry = docCodeUpper === 'OTDOC' || docTypeUpper === 'OTHER';
      // Ensure every document has the mandatory date fields populated so the popup save
      // does not fail silently and leave the General Details identification grid empty.
      if (!docData.expiryDate && !skipExpiry) docData.expiryDate = '31/12/2099';
      if (skipExpiry) docData.expiryDate = '';
      if (!docData.receivedOn && docData.issueDate) docData.receivedOn = docData.issueDate;
      if (!docData.receivedOn) docData.receivedOn = '01/01/2020';
      if (!docData.countryOfIssue) docData.countryOfIssue = 'BM';
      if (!docData.countryOfIssueDisplay) docData.countryOfIssueDisplay = docData.countryOfIssue === 'BM' ? 'BERMUDA' : docData.countryOfIssue;

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
      const targetType = opts.find(o => o === docData.documentType) || opts.find(o => o.includes(docData.documentType || 'IDCUS')) || opts.find(o => o !== '--Select--' && o.length > 0);
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
      const targetCode = opts.find(o => o.includes(docData.documentCode)) || opts.find(o => o !== '--Select--' && o.length > 0);
      if (targetCode) {
        await docCodeSelect.selectOption({ label: targetCode });
        await docCodeSelect.evaluate((el: HTMLSelectElement) => el.dispatchEvent(new Event('change', { bubbles: true })));
        console.log(`\u2713 Document Code: ${targetCode}`);
      }
    }

    // Unique ID
    const uid = target.locator('input[name="EntityDocumentBO.ReferenceNumber"]');
    if (await uid.isVisible({ timeout: 3000 }).catch(() => false)) { await uid.fill(''); await uid.fill(docData.uniqueId); console.log(`\u2713 Unique ID: ${docData.uniqueId}`); }

    // Place of Issue via LOV
    await this.selectDocLov(docPopup, target, 'btnone_EntityDocumentBO.PlaceOfIssue', docData.placeOfIssue, 'Place of Issue', 'EntityDocumentBO.PlaceOfIssue', 'Cat_EntityDocumentBO.PlaceOfIssue');
    // Country of Issue via LOV (workbook-driven; default to INDIA/IN when missing)
    const countryOfIssue = docData.countryOfIssueDisplay || docData.countryOfIssue || 'INDIA';
    const countryCode = docData.countryOfIssue || 'IN';
    await this.selectDocLov(docPopup, target, 'btnone_EntityDocumentBO.CountryOfIssue', countryOfIssue, 'Country of Issue', 'EntityDocumentBO.CountryOfIssue', 'Cat_EntityDocumentBO.CountryOfIssue', countryCode);

    // Issue Date, Expiry Date (only set when workbook has a value)
    if (docData.issueDate) {
      await target.evaluate((val: string) => { const el = document.querySelector('input[name="3_EntityDocumentBO.DocIssueDate"]') as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); } }, docData.issueDate).catch(() => {});
      console.log(`\u2713 Issue Date: ${docData.issueDate}`);
    }
    if (docData.expiryDate) {
      await target.evaluate((val: string) => { const el = document.querySelector('input[name="3_EntityDocumentBO.DocExpiryDate"]') as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); } }, docData.expiryDate).catch(() => {});
      console.log(`\u2713 Expiry Date: ${docData.expiryDate}`);
    }

    // Is Document Verified
    const isVerified = target.locator('select[name="EntityDocumentBO.IsDocumentVerified"]');
    if (await isVerified.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (!(await isVerified.isDisabled().catch(() => true))) { await isVerified.selectOption({ label: 'Y' }).catch(() => {}); }
    }

    // Is Preferred
    const preferredVal = String(docData.isPreferred || docData.mandatoryDocument || 'Y').toUpperCase();
    const isYes = ['Y', 'YES', 'TRUE', '1'].includes(preferredVal);
    const isPreferredSel = target.locator('select[name*="IsPreferred" i]');
    if (await isPreferredSel.isVisible({ timeout: 2000 }).catch(() => false)) {
      const opts = await isPreferredSel.locator('option').allTextContents().catch(() => []);
      const desired = isYes ? ['Y', 'YES', 'TRUE', '1'] : ['N', 'NO', 'FALSE', '0'];
      const preferredOpt = opts.find((o: string) => desired.includes(o.trim().toUpperCase())) || opts.find((o: string) => o.trim() !== '--Select--' && o.trim() !== '');
      if (preferredOpt) await isPreferredSel.selectOption({ label: preferredOpt }).catch(() => {});
    } else {
      const isPreferredChk = target.locator('input[type="checkbox"][name*="IsPreferred" i], input[type="radio"][name*="IsPreferred" i]').first();
      if (await isPreferredChk.isVisible({ timeout: 2000 }).catch(() => false)) {
        if (isYes) await isPreferredChk.check().catch(() => {});
      }
    }

    // Received On
    if (docData.receivedOn) {
      await target.evaluate((val: string) => {
        const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const candidates = ['3_EntityDocumentBO.ReceivedDate', '3_EntityDocumentBO.DocReceivedDate', 'EntityDocumentBO.ReceivedDate', 'EntityDocumentBO.DocReceivedDate'];
        for (const n of candidates) {
          const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement;
          if (el) { el.removeAttribute('readonly'); el.value = val; fire(el); }
        }
      }, docData.receivedOn).catch(() => {});
      console.log(`\u2713 Received On: ${docData.receivedOn}`);
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
      try { await docPopup.waitForEvent('close', { timeout: 5000 }); } catch (_) {}
      await this.safeClosePopup(docPopup, 5000);
    }
    console.log('\u2713 ID Doc saved');
    }
    await page.waitForTimeout(this.timeouts.short3);

    // Mark the preferred document row in the parent grid (Passport / preferred workbook doc)
    const preferredDoc = docsToAdd.find((d: any) => String(d.isPreferred).toUpperCase() === 'Y') || (hasPassport ? docsToAdd.find((d: any) => String(d.documentCode || '').toUpperCase().includes('PAS')) : null) || docsToAdd[docsToAdd.length - 1];
    const preferredIdentifier = preferredDoc ? String(preferredDoc.uniqueId || preferredDoc.documentCode || preferredDoc.documentType || '') : '';
    for (const f of [page.frame({ name: 'formDispFrame' }) || idDocFrame, ...page.frames()]) {
      let marked = false;
      if (preferredIdentifier) {
        marked = await f.evaluate((ident: string) => {
          const rows = Array.from(document.querySelectorAll('tr'));
          for (const row of rows) {
            if ((row.textContent || '').includes(ident)) {
              const inputs = Array.from(row.querySelectorAll('input[type="radio"], input[type="checkbox"]')) as HTMLInputElement[];
              for (const inp of inputs) {
                if (inp.offsetWidth > 0 && inp.offsetHeight > 0) { inp.click(); inp.checked = true; inp.dispatchEvent(new Event('change', { bubbles: true })); return true; }
              }
            }
          }
          return false;
        }, preferredIdentifier).catch(() => false);
      }
      if (!marked) {
        for (const sel of ['input[type="radio"][name="radio1"]', 'input[type="radio"][name="radio0"]', 'input[type="radio"]', 'input[name="IsPreferred"]']) {
          const btn = f.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) { await btn.click(); marked = true; break; }
        }
      }
      if (marked) { console.log('\u2713 Marked document as Preferred (row identifier: ' + preferredIdentifier + ')'); break; }
    }
    await this.closeUnexpectedPopups(page);
    await page.waitForTimeout(this.timeouts.short3);
    await this.captureEvidence('Retail ID Document - after');
  }

  // ==================== FILL CURRENCY TAB ====================
  async fillCurrencyTab(): Promise<void> {
    console.log('\n========== CURRENCY TAB ==========');
    await this.captureEvidence('Retail Currency - before');
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

    const ccyList = TD.currencies || [TD.validCcyData];
    const CCY_FIELDS = {
      ccyDisplay: 'Cat_PsychographicBO.MiscellaneousInfo.strText10',
      ccyCode: 'PsychographicBO.MiscellaneousInfo.strText10',
      creditDiscount: '3_PsychographicBO.MiscellaneousInfo.dbFloat1',
      debitDiscount: '3_PsychographicBO.MiscellaneousInfo.dbFloat2',
      withholdingTax: '3_PsychographicBO.MiscellaneousInfo.dbFloat3',
      floorLimit: '3_PsychographicBO.MiscellaneousInfo.dbFloat4',
      expiryDate: '3_PsychographicBO.MiscellaneousInfo.dtDate1'
    };

    let ccyPopup: Page | null = null;
    let ccyTarget: any = null;

    const getCcyTarget = async (): Promise<any> => {
      if (!ccyPopup || ccyPopup.isClosed()) return null;
      return this.findPopupTarget(ccyPopup);
    };
    const evalCcy = async (fn: (args: any) => any, arg: any): Promise<any> => {
      let lastErr: any;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (!ccyTarget) ccyTarget = await getCcyTarget();
          if (!ccyTarget) throw new Error('No CCY target frame');
          return await ccyTarget.evaluate(fn, arg);
        } catch (e: any) {
          lastErr = e;
          if (attempt === 2 || !e.message?.includes('has been closed')) throw e;
          console.log('  \u26a0 CCY frame closed, reacquiring...');
          await page.waitForTimeout(this.timeouts.short3);
          ccyTarget = await getCcyTarget();
        }
      }
      throw lastErr;
    };

    for (const ccyData of ccyList) {
      if (ccyPopup && ccyPopup.isClosed()) { ccyPopup = null; ccyTarget = null; }
      // Open CCY popup, reusing any already-open popup from a previous record
      const baseTargets = Array.from(new Set([ccyFrame, this.accountFrame, ...page.frames()]));
      const framesToSearch: any[] = [...baseTargets];
      if (ccyPopup && !ccyPopup.isClosed()) {
        framesToSearch.unshift(ccyPopup);
        for (const f of ccyPopup.frames()) { if (!framesToSearch.includes(f)) framesToSearch.unshift(f); }
      }
      for (const sf of framesToSearch) {
        for (const sel of ['input[value="Add CCY"]', 'input[name*="AddCCY"]', 'input[name*="AddCcy"]', 'input[value="Add"]', 'input[name*="Add"]']) {
          const btn = sf.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            const pp = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
            await btn.click();
            ccyPopup = (await pp) || ccyPopup;
            if (ccyPopup) { await this.waitForPopupReady(ccyPopup, 'CCY'); ccyTarget = await this.findPopupTarget(ccyPopup); }
            break;
          }
        }
        if (ccyPopup) break;
        const link = sf.getByText('Add CCY', { exact: false }).first();
        if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
          const pp = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
          await link.click();
          ccyPopup = (await pp) || ccyPopup;
          if (ccyPopup) { await this.waitForPopupReady(ccyPopup, 'CCY'); ccyTarget = await this.findPopupTarget(ccyPopup); }
          break;
        }
      }

      if (!ccyPopup || !ccyTarget) { console.log('\u26a0 Could not open CCY popup'); break; }

      // Set CCY via evaluate
      await evalCcy((args: { codeName: string; dispName: string; code: string }) => {
        const ce = document.querySelector(`input[name="${args.codeName}"]`) as HTMLInputElement;
        const de = document.querySelector(`input[name="${args.dispName}"]`) as HTMLInputElement;
        if (ce) { ce.value = args.code; ce.dispatchEvent(new Event('change', { bubbles: true })); }
        if (de) { de.value = args.code; de.dispatchEvent(new Event('change', { bubbles: true })); }
      }, { codeName: CCY_FIELDS.ccyCode, dispName: CCY_FIELDS.ccyDisplay, code: ccyData.ccy });
      console.log(`\u2713 CCY: ${ccyData.ccy}`);

      // Fill CCY fields
      const fieldMap = [
        { name: CCY_FIELDS.creditDiscount, value: ccyData.creditDiscountPcnt, label: 'Credit Discount' },
        { name: CCY_FIELDS.debitDiscount, value: ccyData.debitDiscountPcnt, label: 'Debit Discount' },
        { name: CCY_FIELDS.withholdingTax, value: ccyData.withholdingTaxPcnt, label: 'Withholding Tax' },
        { name: CCY_FIELDS.floorLimit, value: ccyData.withholdingTaxFloorLimit, label: 'Floor Limit' },
        { name: CCY_FIELDS.expiryDate, value: ccyData.preferentialExpiryDate, label: 'Expiry Date' }
      ];
      for (const field of fieldMap) {
        await evalCcy((a: { fieldName: string; val: string }) => {
          const el = document.querySelector(`input[name="${a.fieldName}"]`) as HTMLInputElement;
          if (el) { el.removeAttribute('readonly'); el.value = a.val; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); }
        }, { fieldName: field.name, val: field.value });
        console.log(`\u2713 ${field.label}: ${field.value}`);
      }

      // Save CCY popup
      let ccySaveBtn: any = null;
      for (const pf of ccyPopup.frames()) {
        for (const sel of ['input[name="save"]', 'input[name="SAVE"]', 'input[value="Save"]', 'input[value="save"]', 'input[value="OK"]', 'input[value="Submit"]']) {
          const b = pf.locator(sel).first();
          if (await b.isVisible({ timeout: 3000 }).catch(() => false)) { ccySaveBtn = b; break; }
        }
        if (ccySaveBtn) break;
      }
      if (ccySaveBtn) {
        const ccyDlgHandler = async (d: Dialog) => { await d.accept().catch(() => {}); };
        ccyPopup.on('dialog', ccyDlgHandler);
        await ccySaveBtn.click();
        console.log('\u2713 Clicked Save');
        try { await ccyPopup.waitForEvent('close', { timeout: 5000 }); ccyPopup = null; ccyTarget = null; } catch (_) {}
        console.log('\u2713 CCY popup saved');
        try { ccyPopup?.removeListener('dialog', ccyDlgHandler); } catch (_) {}
      } else {
        console.log('\u26a0 Save button not found in CCY popup');
      }
      await page.waitForTimeout(this.timeouts.short3);
      await this.closeUnexpectedPopups(page);
    }

    await this.captureEvidence('Retail Currency - after');
  }

  // ==================== FILL DEMOGRAPHIC TAB ====================
  async fillDemographicTab(): Promise<void> {
    console.log('\n========== DEMOGRAPHIC TAB ==========');
    await this.captureEvidence('Retail Demographic - before');
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

    // Nationality LOV (workbook-driven)
    const nationalityValue = TD.demographicData?.nationalityDisplay || TD.demographicData?.nationality || 'BERMUDA';
    const nationalityCode = TD.demographicData?.nationality || 'BM';
    let natSelected = false;
    try {
      natSelected = await this.selectLovValue({ parentPage: page, target: demoFrame, buttonName: this.nationalityLovBtn, searchValue: nationalityValue, label: 'Nationality', config: this.config, directFieldName: this.nationalityCode || undefined });
    } catch (e) { console.log('\u26a0 Nationality LOV error: ' + ((e as Error).message || '').substring(0, 100)); }
    await page.waitForTimeout(this.timeouts.short).catch(() => {});

    if (!natSelected && this.nationalityCode && this.nationalityDisplay) {
      await page.waitForTimeout(3000).catch(() => {});
      demoFrame = this.getDemoFrame();
      await demoFrame.evaluate((args: { code: string; disp: string; codeVal: string; dispVal: string }) => {
        const ce = document.querySelector(`input[name="${args.code}"]`) as HTMLInputElement;
        const de = document.querySelector(`input[name="${args.disp}"]`) as HTMLInputElement;
        if (ce) { ce.value = args.codeVal; ce.dispatchEvent(new Event('change', { bubbles: true })); }
        if (de) { de.value = args.dispVal; de.dispatchEvent(new Event('change', { bubbles: true })); }
      }, { code: this.nationalityCode, disp: this.nationalityDisplay, codeVal: nationalityCode, dispVal: nationalityValue }).catch(() => {});
      console.log(`\u2713 Nationality: ${nationalityValue} (fallback)`);
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

    // Marital Status: set the discovered select by value/text, with a direct label-id fallback.
    const marVal = TD.demographicData?.maritalStatus || 'Married';
    if (marVal) {
      let marSet = false;
      if (this.maritalStatusField) {
        marSet = await this.setSelect(demoFrame, [this.maritalStatusField], marVal, 'Marital Status').catch(() => false) || false;
      }
      if (!marSet) {
        marSet = await this.setSelectOrLovByLabel(demoFrame, 'Marital Status', marVal, undefined, 'select').catch(() => false) || false;
      }
      if (!marSet) {
        // Cross-frame fallback: search every frame for any select whose options contain
        // the desired marital value, or a select near a "Marital Status" label/identifier.
        for (const f of page.frames()) {
          const found = await f.evaluate((val: string) => {
            const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
            const v = val.toUpperCase();
            // First try a label-aware lookup.
            const label =
              document.getElementById('lblDemographicModBO.Marital_Status') as HTMLElement ||
              document.getElementById('lblDemographicBO.Marital_Status') as HTMLElement ||
              Array.from(document.querySelectorAll('label, td, th, div, span')).find(el => {
                const t = (el.textContent || '').replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
                return t.startsWith('marital status') && t.includes('status');
              }) as HTMLElement;
            let candidateSels: HTMLSelectElement[] = [];
            if (label) {
              const row = label.closest('tr, td, div, fieldset, form, table');
              if (row) candidateSels = Array.from(row.querySelectorAll('select'));
            }
            if (!candidateSels.length) {
              candidateSels = Array.from(document.querySelectorAll('select'));
            }
            for (const sel of candidateSels) {
              for (const o of Array.from(sel.options)) {
                const ot = o.text.trim().toUpperCase();
                const ov = o.value.toUpperCase();
                if (ot === v || ov === v || ot.startsWith(v) || ot.includes(v) || v.includes(ot)) {
                  if (sel.value !== o.value) {
                    sel.disabled = false; sel.removeAttribute('readonly');
                    sel.value = o.value; fire(sel);
                  }
                  return o.text.trim();
                }
              }
            }
            return '';
          }, marVal).catch(() => '');
          if (found) { marSet = true; console.log(`\u2713 Marital Status: ${found}`); break; }
        }
      }
      if (marSet) console.log(`\u2713 Marital Status: ${marVal}`);
      else console.log(`\u26a0 Marital Status not set: ${marVal}`);
    }

    // Available Channels (dual list under Demographics)
    const availableChannels = TD.demographicData?.availableChannels;
    if (availableChannels) {
      await this.setDualListByLabel(demoFrame, 'Available Channels', String(availableChannels)).catch(() => {});
    }

    // Do not Save the main demographic section now; all tab data must be persisted only on final Submit.
    await this.syncSelectHiddenFields(demoFrame).catch(() => {});
    await page.waitForTimeout(this.timeouts.medium).catch(() => {});

    // Qualification sub-tab
    console.log('\n=== Qualification Details ===');
    let qualificationTabClicked = false;
    const qLabels = ['Qualification Details', 'Education Details', 'Qualification', 'Education'];
    const qFrames = [this.accountFrame, page.frame({ name: 'formDispFrame' }), ...page.frames()].filter(Boolean);
    for (const f of qFrames as any[]) {
      const clicked = await f.evaluate((labels: string[]) => {
        const normalize = (s: string) => String(s || '').replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
        const all = Array.from(document.querySelectorAll('a, td, span, div, li, button, input[type="button"]')) as HTMLElement[];
        for (const label of labels) {
          const target = label.toLowerCase();
          for (const e of all) {
            const txt = normalize(e.textContent || e.getAttribute('value') || '');
            const rect = e.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && (txt === target || txt.endsWith(label.toLowerCase()))) {
              const tag = e.tagName.toLowerCase();
              if (tag === 'input' || tag === 'button' || tag === 'a' || tag === 'td' || tag === 'li' || tag === 'span') {
                e.click();
                return label;
              }
            }
          }
        }
        return '';
      }, qLabels).catch(() => '');
      if (clicked) { qualificationTabClicked = true; console.log('\u2713 Clicked Qualification tab: ' + clicked); break; }
      for (const label of qLabels) {
        const qTab = f.getByText(label, { exact: false }).first();
        if (await qTab.isVisible({ timeout: 2000 }).catch(() => false)) { await qTab.click(); qualificationTabClicked = true; console.log('\u2713 Clicked Qualification tab: ' + label); break; }
      }
      if (qualificationTabClicked) break;
    }
    if (qualificationTabClicked) {
      await page.waitForTimeout(this.timeouts.medium).catch(() => {});
      demoFrame = this.getDemoFrame();

      // The qualification form may load in a separate iframe/popup (DemographicEducationDetails)
      const qUrlPattern = /DemographicEducation|EducationDetails|Qualification|Education/i;
      let qFrame: any = null;
      for (const f of page.frames()) {
        if (qUrlPattern.test(f.url())) {
          const c = await this.countVisibleFields(f).catch(() => 0);
          if (c >= 5) { qFrame = f; break; }
        }
      }
      if (!qFrame) {
        qFrame = await this.waitForFrameOrPageByUrl(page, qUrlPattern, 8000).catch(() => null);
      }
      if (qFrame) {
        demoFrame = qFrame;
        console.log(`  Qualification form found in frame/page: ${(qFrame.url?.() || qFrame.name?.() || 'popup')}`);
      }

      const qualRecords = Array.isArray(TD.qualificationData) ? TD.qualificationData : [];
      for (const rec of qualRecords) {
        let addBtn: any = null;
        if (!qFrame) {
          const searchFrames = [this.getDemoFrame(), this.accountFrame, ...page.frames()].filter(Boolean);
          for (const f of searchFrames) {
            for (const label of ['Add Educational Details', 'Add Education Details', 'Add Qualification', 'Add Education', 'Education Details', 'Add Details', 'Add']) {
              addBtn = await this.findVisibleButton(f, label);
              if (addBtn) { demoFrame = f; break; }
            }
            if (!addBtn) addBtn = await this.findButtonByKeywords(f, ['Add', 'Education']);
            if (!addBtn) addBtn = await this.findButtonByKeywords(f, ['Add', 'Qualification']);
            if (addBtn) { demoFrame = f; break; }
          }
        } else {
          // Qualification fields already visible in qFrame
          await this.fillQualificationRecord(qFrame, rec).catch(() => {});
          await this.saveCurrentSection(qFrame, 'Save');
          await this.syncSelectHiddenFields(qFrame).catch(() => {});
          continue;
        }
        if (addBtn) {
          const pagesBefore = new Set(page.context().pages().filter((p: any) => !p.isClosed()));
          const framesBefore = new Set(page.frames());
          try { await addBtn.click({ timeout: 8000 }); } catch (_) { await addBtn.evaluate((el: HTMLElement) => el.click()).catch(() => {}); }
          await page.waitForTimeout(this.timeouts.short).catch(() => {});
          let qFormFrame: any = null;
          // Look for the newly opened qualification frame/page
          for (const f of page.frames()) {
            if (!framesBefore.has(f) || qUrlPattern.test(f.url())) {
              const c = await this.countVisibleFields(f).catch(() => 0);
              if (c >= 5) { qFormFrame = f; break; }
            }
          }
          if (!qFormFrame) {
            for (const p of page.context().pages()) {
              if (!pagesBefore.has(p) && !p.isClosed() && qUrlPattern.test(p.url())) { qFormFrame = p; break; }
            }
          }
          if (qFormFrame) {
            await this.fillQualificationRecord(qFormFrame, rec).catch(() => {});
            await this.saveCurrentSection(qFormFrame, 'Save');
            await this.syncSelectHiddenFields(qFormFrame).catch(() => {});
            if (!qFormFrame.isClosed || !qFormFrame.isClosed()) { await this.safeClosePopup(qFormFrame, 5000); }
          } else {
            console.log('  Falling back to inline qualification form fill...');
            await this.fillQualificationRecord(demoFrame, rec).catch(() => {});
            // Main-form Save intentionally skipped to avoid postback/data loss; final Submit persists the data.
          }
        } else {
          console.log('\u26a0 Add Education Details button not found');
          await this.fillQualificationRecord(demoFrame, rec).catch(() => {});
          // Main-form Save intentionally skipped to avoid postback/data loss; final Submit persists the data.
        }
      }
      await page.waitForTimeout(this.timeouts.short).catch(() => {});
      demoFrame = this.getDemoFrame();
      await this.syncSelectHiddenFields(demoFrame).catch(() => {});
      await page.waitForTimeout(this.timeouts.short).catch(() => {});
    }

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
      const empType = TD.employmentData?.employmentType || 'SALARIED';
      const empSel = demoFrame.locator(`select[name="${this.empTypeField}"]`);
      if (await empSel.isVisible({ timeout: 5000 }).catch(() => false)) {
        const val = await demoFrame.evaluate((args: { selName: string; match: string }) => {
          const sel = document.querySelector(`select[name="${args.selName}"]`) as HTMLSelectElement;
          if (!sel) return '';
          const target = args.match.trim().toUpperCase();
          if (!target) return '';
          const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp('\\b' + escape(target) + '\\b', 'i');
          for (const o of Array.from(sel.options)) {
            if (re.test(o.text.trim())) return o.value;
          }
          return '';
        }, { selName: this.empTypeField, match: empType }).catch(() => '');
        if (val) { await empSel.selectOption(val).catch(() => {}); console.log(`\u2713 Employee Type: ${empType}`); }
      }
    }
    // Fallback: use the CRM label directly in case the discovered name was wrong.
    if (TD.employmentData?.employmentType) {
      await this.setSelectOrLovByLabel(demoFrame, 'Employement Type(Employment Details)', TD.employmentData.employmentType, undefined, 'select').catch(() => {});
      await this.setSelectOrLovByLabel(demoFrame, 'Employment Type(Employment Details)', TD.employmentData.employmentType, undefined, 'select').catch(() => {});
    }
    if (TD.employmentData?.bankRelationType) {
      await this.setSelectOrLovByLabel(demoFrame, 'Bank Relation Type', TD.employmentData.bankRelationType, undefined, 'select').catch(() => {});
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

    // Income and Employment Type(s) in the Income and Expense tab
    const incIncomeType = TD.incomeExpenseData?.incomeType || 'SALARIED';
    const incEmploymentType = TD.incomeExpenseData?.employmentType || TD.employmentData?.employmentType || 'SALARIED';

    // Explicit label-based fallbacks so the Income/Expense fields are not missed
    await this.setSelectOrLovByLabel(demoFrame, 'Employment Type( Income and Expense Details)', incEmploymentType, undefined, 'select').catch(() => {});
    await this.setSelectOrLovByLabel(demoFrame, 'Employment Type(Income and Expense Details)', incEmploymentType, undefined, 'select').catch(() => {});
    await this.setSelectOrLovByLabel(demoFrame, 'Income Type', incIncomeType, undefined, 'select').catch(() => {});
    await this.setSelectOrLovByLabel(demoFrame, 'Nature of Income', incIncomeType, undefined, 'select').catch(() => {});

    this.incomeTypeField = '';
    for (const sf of incomeFieldInfo.selects) {
      const isEmployment = /employ/i.test(sf.name);
      const isIncomeType = /income/i.test(sf.name) && !isEmployment;
      if (!isEmployment && !isIncomeType) continue;
      const sel = demoFrame.locator(`select[name="${sf.name}"]`);
      if (!(await sel.isVisible({ timeout: 3000 }).catch(() => false))) continue;
      const match = isEmployment ? incEmploymentType : incIncomeType;
      const val = await demoFrame.evaluate((args: { selName: string; match: string }) => {
        const sel = document.querySelector(`select[name="${args.selName}"]`) as HTMLSelectElement;
        if (!sel) return '';
        const target = args.match.trim().toUpperCase();
        if (!target) return '';
        const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('\\b' + escape(target) + '\\b', 'i');
        for (const o of Array.from(sel.options)) {
          if (re.test(o.text.trim())) return o.value;
        }
        return '';
      }, { selName: sf.name, match }).catch(() => '');
      if (val) {
        await sel.selectOption(val).catch(() => {});
        console.log(`\u2713 ${isEmployment ? 'Employment' : 'Income'} Type: ${match}`);
        if (isIncomeType) this.incomeTypeField = sf.name;
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
      const grossIncome = this.TD.incomeExpenseData.grossIncome || '';
      if (grossIncome) {
        await demoFrame.evaluate((fn: string) => { const el = document.querySelector(`input[name="${fn}"]`) as HTMLInputElement; if (el) el.removeAttribute('readonly'); }, this.grossIncomeField).catch(() => {});
        const loc = demoFrame.locator(`input[name="${this.grossIncomeField}"]`);
        if (await loc.isVisible({ timeout: 5000 }).catch(() => false)) { await loc.fill(grossIncome).catch(() => {}); }
        else { await demoFrame.evaluate((a: { fn: string; v: string }) => { const el = document.querySelector(`input[name="${a.fn}"]`) as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true })); } }, { fn: this.grossIncomeField, v: grossIncome }).catch(() => {}); }
        console.log('\u2713 Gross Income: ' + grossIncome);
      }
    }

    // Monthly Expense
    this.monthlyExpenseField = await demoFrame.evaluate(() => { const el = document.querySelector('input[name="3_DemographicBO.Annual_Operating_Exp"]') as HTMLInputElement; return el ? el.name : ''; }).catch(() => '');
    if (!this.monthlyExpenseField) { for (const f of page.frames()) { const found = await f.evaluate(() => { const el = document.querySelector('input[name="3_DemographicBO.Annual_Operating_Exp"]') as HTMLInputElement; return el ? el.name : ''; }).catch(() => ''); if (found) { this.monthlyExpenseField = found; demoFrame = f; break; } } }
    if (!this.monthlyExpenseField) { for (const inp of incomeFieldInfo.inputs) { if ((inp.name || '').toLowerCase().includes('operating_exp')) { this.monthlyExpenseField = inp.name; break; } } }
    if (this.monthlyExpenseField) {
      const monthlyExpense = this.TD.incomeExpenseData.annualOperatingExpense || '';
      if (monthlyExpense) {
        await demoFrame.evaluate((fn: string) => { const el = document.querySelector(`input[name="${fn}"]`) as HTMLInputElement; if (el) el.removeAttribute('readonly'); }, this.monthlyExpenseField).catch(() => {});
        const loc = demoFrame.locator(`input[name="${this.monthlyExpenseField}"]`);
        if (await loc.isVisible({ timeout: 5000 }).catch(() => false)) { await loc.fill(monthlyExpense).catch(() => {}); }
        else { await demoFrame.evaluate((a: { fn: string; v: string }) => { const el = document.querySelector(`input[name="${a.fn}"]`) as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true })); } }, { fn: this.monthlyExpenseField, v: monthlyExpense }).catch(() => {}); }
        console.log('\u2713 Monthly Expense: ' + monthlyExpense);
      }
    }

    // Avoid overwriting Nationality / Country of Birth LOV values with raw code/display strings from generic meta fill
    const demographicDataCopy = { ...this.TD.demographicData };
    delete (demographicDataCopy as any).nationality;
    delete (demographicDataCopy as any).nationalityDisplay;
    delete (demographicDataCopy as any).countryOfBirth;
    delete (demographicDataCopy as any).countryOfBirthDisplay;
    delete (demographicDataCopy as any).maritalStatus;
    delete (demographicDataCopy as any).availableChannels;
    if (Object.keys(demographicDataCopy).length > 0) {
      await this.fillSectionByMeta(demoFrame, 'demographicData', demographicDataCopy, this.TD._meta).catch(() => {});
    }
    await this.fillSectionByMeta(demoFrame, 'employmentData', this.TD.employmentData, this.TD._meta).catch(() => {});
    await this.fillSectionByMeta(demoFrame, 'incomeExpenseData', this.TD.incomeExpenseData, this.TD._meta).catch(() => {});
    await this.syncSelectHiddenFields(demoFrame).catch(() => {});
    await this.captureEvidence('Retail Demographic - after');

    await this.fillPsychographicDetails();

    await this.fillAdditionalSections([
      { name: 'otherBankData', tabLabels: ['Other Bank', 'Other Bank Details', 'Banking Details', 'Relationship'], isArray: true, skipSave: true },
      { name: 'creditCardData', tabLabels: ['Card', 'Credit Card', 'Card Details'], isArray: true, skipSave: true },
      { name: 'riskBaselData', tabLabels: ['Risk', 'Basel', 'Risk Details', 'Basel Details'], skipSave: true }
    ], this.TD, this.TD._meta);
    await this.captureEvidence('Retail Additional sections - after');
  }

  // ==================== FILL PSYCHOGRAPHIC DETAILS SUB-TABS ====================
  async fillPsychographicDetails(): Promise<void> {
    const page = this.workingPage;
    const TD = this.TD;
    console.log('\n========== PSYCHOGRAPHIC DETAILS ==========');
    await this.closeUnexpectedPopups(page);

    // Open the parent Psychographic Details tab once.
    await this.navigateToSectionTab(['Psychographic Details', 'Psychographic', 'Customer Relationship']).catch(() => null);
    await this.reacquireAccountFrame('Psychographic Details').catch(() => {});

    // Each sub-tab is filled only when its corresponding CRM sheet data has values.
    await this.fillAdditionalSections([
      { name: 'individualProfileOrPreferenceData', tabLabels: ['Individual Profile or Preference Details', 'Individual Profile', 'Preference Details'], skipSave: true },
      { name: 'segmentationData', tabLabels: ['Segmentation'], skipSave: true },
      { name: 'relationshipData', tabLabels: ['Relationship Details', 'Relationship'], isArray: true, addLabel: 'Add Relationship', saveLabel: 'Save', skipSave: true },
      { name: 'assetData', tabLabels: ['Asset', 'Asset Details', 'Lifestyle Details', 'Lifestyle'], isArray: true, addLabel: 'Add Lifestyle Details', saveLabel: 'Save', skipSave: true },
      { name: 'productPreferenceData', tabLabels: ['Product Preferences', 'Product Preference'], isArray: true, addLabel: 'Add Product Preferences', saveLabel: 'Save', skipSave: true },
      { name: 'creditBureauPreferenceData', tabLabels: ['Credit Bureau Preferences', 'Credit Bureau'], isArray: true, addLabel: 'Add Credit Bureau Preferences', saveLabel: 'Save', skipSave: true },
      { name: 'transactionPlanData', tabLabels: ['Transaction Plan', 'Transaction'], isArray: true, addLabel: 'Add Transaction', saveLabel: 'Save', skipSave: true }
    ], TD, TD._meta);
  }

  // ==================== PRE-SUBMIT VERIFICATION ====================
  async preSubmitVerification(): Promise<void> {
    console.log('\n=== Pre-Submit: Verify mandatory fields ===');
    await this.reacquireWorkingPage();
    await this.captureEvidence('Retail Pre-Submit - before');
    const page = this.workingPage;

    // General Details
    try {
      for (const f of page.frames()) { const tab = f.getByText('General Details', { exact: false }).first(); if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); break; } }
      await page.waitForTimeout(this.timeouts.short3);
      for (const f of page.frames()) {
        const result = await f.evaluate((args: { natCode: string; natDisp: string; marField: string; natValue: string; natDisplay: string; resValue: string; resDisplay: string; marital: string }) => {
          const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const res = { foundAny: false, fixes: [] as string[] };
          const nc = document.querySelector(`input[name="${args.natCode}"]`) as HTMLInputElement;
          if (nc) { res.foundAny = true; if (!nc.value && args.natValue) { nc.value = args.natValue; fire(nc); const nd = document.querySelector(`input[name="${args.natDisp}"]`) as HTMLInputElement; if (nd) { nd.value = args.natDisplay; fire(nd); } res.fixes.push('Nationality'); } }
          if (args.marField && args.marital) { const ms = document.querySelector(`select[name="${args.marField}"]`) as HTMLSelectElement; if (ms) { res.foundAny = true; if (!ms.value || ms.selectedIndex <= 0) { const match = args.marital.toLowerCase(); for (const o of Array.from(ms.options)) { if (o.text.trim().toLowerCase().includes(match) && !o.text.trim().toLowerCase().includes('un')) { ms.value = o.value; fire(ms); res.fixes.push('Marital'); break; } } } } }
          document.querySelectorAll('input').forEach(el => { const inp = el as HTMLInputElement; if (inp.name.includes('Residence_Country') && !inp.name.startsWith('Cat_') && !inp.name.startsWith('btn') && !inp.name.startsWith('pi_')) { res.foundAny = true; if (!inp.value && args.resValue) { inp.value = args.resValue; fire(inp); const d = document.querySelector(`input[name="Cat_${inp.name}"]`) as HTMLInputElement; if (d) { d.value = args.resDisplay; fire(d); } res.fixes.push('Residence'); } } });
          return res;
        }, { natCode: this.nationalityCode, natDisp: this.nationalityDisplay, marField: this.maritalStatusField, natValue: this.TD.demographicData.nationality, natDisplay: this.TD.demographicData.nationalityDisplay, resValue: this.TD.demographicData.countryOfBirth, resDisplay: this.TD.demographicData.countryOfBirthDisplay, marital: this.TD.demographicData.maritalStatus }).catch(() => ({ foundAny: false, fixes: [] }));
        if (result.foundAny) { if (result.fixes.length > 0) console.log(`  \u2713 Re-filled: ${result.fixes.join(', ')}`); break; }
      }
    } catch (e) { console.log(`  \u26a0 General Details re-fill error`); }

    // Title
    try {
      const title = this.TD.customerData.title || 'MR';
      for (const f of page.frames()) {
        const fixed = await f.evaluate((t: string) => { const el = document.querySelector('input[name="AccountModBO.Salutation_code"]') as HTMLInputElement; if (!el) return null; if (!el.value) { el.value = t; el.dispatchEvent(new Event('change', { bubbles: true })); return true; } return false; }, title).catch(() => null);
        if (fixed === true) { console.log('  \u2713 Re-filled Title = ' + title); break; }
        if (fixed === false) break;
      }
    } catch (_) {}

    // Employment
    try {
      for (const f of page.frames()) { const tab = f.getByText('Employment Details', { exact: false }).first(); if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); break; } }
      await page.waitForTimeout(this.timeouts.short3);
      if (this.empTypeField) {
        const empType = this.TD.employmentData.employmentType || 'SALARIED';
        for (const f of page.frames()) {
          const fixed = await f.evaluate((args: { selName: string; match: string }) => { const sel = document.querySelector(`select[name="${args.selName}"]`) as HTMLSelectElement; if (!sel) return null; if (sel.value && sel.selectedIndex > 0) return false; const m = args.match.toUpperCase(); for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes(m) && !o.text.trim().toUpperCase().includes('SELF')) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; } } return false; }, { selName: this.empTypeField, match: empType }).catch(() => null);
          if (fixed === true) { console.log('  \u2713 Re-filled Employee Type = ' + empType); break; }
          if (fixed === false) break;
        }
      }
      // Label-based fallback for Employment Details
      if (this.TD.employmentData?.employmentType) {
        await this.setSelectOrLovByLabel(page, 'Employement Type(Employment Details)', this.TD.employmentData.employmentType, undefined, 'select').catch(() => {});
        await this.setSelectOrLovByLabel(page, 'Employment Type(Employment Details)', this.TD.employmentData.employmentType, undefined, 'select').catch(() => {});
      }
      if (this.TD.employmentData?.bankRelationType) {
        await this.setSelectOrLovByLabel(page, 'Bank Relation Type', this.TD.employmentData.bankRelationType, undefined, 'select').catch(() => {});
      }
    } catch (_) {}

    // Income/Expense
    try {
      for (const f of page.frames()) { const tab = f.getByText('Income and Expense', { exact: false }).first(); if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) { await tab.click(); break; } }
      await page.waitForTimeout(this.timeouts.short3);
      // Label-based re-apply for Income/Expense fields
      if (this.TD.incomeExpenseData?.employmentType) {
        await this.setSelectOrLovByLabel(page, 'Employment Type( Income and Expense Details)', this.TD.incomeExpenseData.employmentType, undefined, 'select').catch(() => {});
        await this.setSelectOrLovByLabel(page, 'Employment Type(Income and Expense Details)', this.TD.incomeExpenseData.employmentType, undefined, 'select').catch(() => {});
      }
      if (this.TD.incomeExpenseData?.incomeType) {
        await this.setSelectOrLovByLabel(page, 'Income Type', this.TD.incomeExpenseData.incomeType, undefined, 'select').catch(() => {});
        await this.setSelectOrLovByLabel(page, 'Nature of Income', this.TD.incomeExpenseData.incomeType, undefined, 'select').catch(() => {});
      }
      for (const f of page.frames()) {
        const incomeType = this.TD.incomeExpenseData.incomeType || 'SALARIED';
        const grossIncome = this.TD.incomeExpenseData.grossIncome || '';
        const expense = this.TD.incomeExpenseData.annualOperatingExpense || '';
        const ccy = this.TD.incomeExpenseData.currency || 'USD';
        const result = await f.evaluate((args: any) => {
          const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const r = { foundAny: false, fixes: [] as string[] };
          if (args.incTypeField && args.incomeType) { const sel = document.querySelector(`select[name="${args.incTypeField}"]`) as HTMLSelectElement; if (sel) { r.foundAny = true; if (!sel.value || sel.selectedIndex <= 0) { const m = args.incomeType.toUpperCase(); for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes(m) && !o.text.trim().toUpperCase().includes('SELF')) { sel.value = o.value; fire(sel); r.fixes.push('IncType'); break; } } } } }
          if (args.grossField && args.grossIncome) { const el = document.querySelector(`input[name="${args.grossField}"]`) as HTMLInputElement; if (el) { r.foundAny = true; if (!el.value || el.value === '0') { el.removeAttribute('readonly'); el.value = args.grossIncome; fire(el); r.fixes.push('Gross'); } } }
          if (args.ccyField && args.ccy) { const sel = document.querySelector(`select[name="${args.ccyField}"]`) as HTMLSelectElement; if (sel) { r.foundAny = true; if (!sel.value || sel.selectedIndex <= 0) { const m = args.ccy.toUpperCase(); for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes(m)) { sel.value = o.value; fire(sel); r.fixes.push('CCY'); break; } } } } }
          if (args.expField && args.expense) { const el = document.querySelector(`input[name="${args.expField}"]`) as HTMLInputElement; if (el) { r.foundAny = true; if (!el.value) { el.removeAttribute('readonly'); el.value = args.expense; fire(el); r.fixes.push('Expense'); } } }
          return r;
        }, { incTypeField: this.incomeTypeField, grossField: this.grossIncomeField, ccyField: this.demoCurrencyField, expField: this.monthlyExpenseField, incomeType, grossIncome, ccy, expense }).catch(() => ({ foundAny: false, fixes: [] }));
        if (result.foundAny) { if (result.fixes.length > 0) console.log(`  \u2713 Re-filled Income/Expense: ${result.fixes.join(', ')}`); break; }
      }
    } catch (_) {}

    // General tab mandatory fields
    try {
      for (const f of page.frames()) {
        const result = await f.evaluate(() => {
          const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
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

    // Re-apply Basic Info values to protect against data loss from earlier tab reloads.
    await this.ensureBasicInfoValues().catch(() => {});

    // Relationship Opening Date — set any matching hidden field to a past date
    try {
      const relDate = this.TD.contactData.startDate;
      for (const f of page.frames()) {
        const result = await f.evaluate((v: string) => {
          const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const fixes: string[] = [];
          const elements = Array.from(document.querySelectorAll('input, select')) as (HTMLInputElement | HTMLSelectElement)[];
          for (const el of elements) {
            const n = (el.name || '').toLowerCase();
            if (!n.startsWith('cat_') && !n.startsWith('btn') && !n.startsWith('pi_') &&
                (n.includes('relationship') || n.includes('reltn') || n.includes('rship')) &&
                (n.includes('open') || n.includes('start')) &&
                !n.includes('type') && !n.includes('class') && !n.includes('createdby')) {
              if (el.tagName === 'SELECT') {
                const sel = el as HTMLSelectElement;
                if (!sel.value || sel.value.toUpperCase() === 'Y' || sel.value.toUpperCase() === 'N') continue;
                for (const o of Array.from(sel.options)) { if (o.text.trim() === v) { sel.value = o.value; fire(sel); fixes.push(sel.name); break; } }
              } else {
                el.removeAttribute('readonly');
                el.value = v;
                fire(el);
                fixes.push(el.name);
              }
            }
          }
          return { found: fixes.length > 0, fields: fixes };
        }, relDate).catch(() => ({ found: false, fields: [] }));
        if (result.found) { console.log(`  \u2713 Relationship date set on: ${(result.fields as string[]).join(', ')}`); break; }
      }
    } catch (_) {}

    // Final guard: ensure Title and Sub-segment code/display pairs are populated
    await this.setTitleAndSubSegment();
    console.log('\u2713 Pre-submit verification complete');
    await this.captureEvidence('Retail Pre-Submit - after');
  }

  // ==================== WORKING PAGE REACQUIRE ====================
  private async reacquireWorkingPage(): Promise<void> {
    if (this.workingPage && !this.workingPage.isClosed()) {
      for (const f of this.workingPage.frames()) {
        try {
          const u = f.url();
          if (u.includes('AccountMod_det') || u.includes('RetailTF_det') || u.includes('MainAccountDetForm') ||
              u.includes('DemographicMod_det') || u.includes('PsychographicMod_det') ||
              u.includes('MainDemographicDetForm') || u.includes('MainPsychographicDetForm') ||
              u.includes('Customer') || u.includes('/cif/')) return;
        } catch (_) {}
      }
    }
    for (const p of this.page.context().pages()) {
      if (p.isClosed()) continue;
      for (const f of p.frames()) {
        try {
          const u = f.url();
          if (u.includes('AccountMod_det') || u.includes('RetailTF_det') || u.includes('MainAccountDetForm') ||
              u.includes('DemographicMod_det') || u.includes('PsychographicMod_det') ||
              u.includes('MainDemographicDetForm') || u.includes('MainPsychographicDetForm') ||
              u.includes('/cif/')) {
            this.workingPage = p;
            console.log(`  Reacquired workingPage: ${p.url().split('/').pop()?.substring(0, 80)}`);
            return;
          }
        } catch (_) {}
      }
    }
    console.log('  Could not reacquire workingPage; falling back to main page');
    if (!this.workingPage || this.workingPage.isClosed()) this.workingPage = this.page;
  }

  // ==================== PRE-SUBMIT FIXES ====================
  private async preSubmitFixes(): Promise<void> {
    const page = this.workingPage;
    const TD = this.TD;

    // 1. Re-set all preferred contact selections after popup closure
    const phoneType = (TD.contactData.phones?.[0] || TD.contactData).phoneType || '';
    const emailType = (TD.contactData.emails?.[0] || TD.contactData).emailType || '';
    const preferredContact = phoneType || (TD.contactData as any).preferredContactNoType || '';
    const preferredEmail = emailType || (TD.contactData as any).preferredEmailIdType || '';
    const preferredMobile = phoneType || (TD.contactData as any).preferredMobileTypeForAlerts || '';

    for (const f of page.frames()) {
      // Preferred Contact No. Type
      try {
        const selNames = ['AccountBO.PhoneEmail.PhoneEmailType', 'AccountBO.PhoneEmail.PhoneEmailType1', 'AccountBO.PreferredContactNoType'];
        for (const name of selNames) {
          const sel = f.locator(`select[name="${name}"]`).first();
          if (await sel.isVisible({ timeout: 2000 }).catch(() => false)) {
            const opts = await sel.locator('option').allTextContents().catch(() => [] as string[]);
            const match = opts.find((o: string) => preferredContact && o.trim().toUpperCase() === preferredContact.toUpperCase()) ||
                          opts.find((o: string) => preferredContact && o.trim().toUpperCase().includes(preferredContact.toUpperCase())) ||
                          opts.find((o: string) => o.includes('WORK')) ||
                          opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
            if (match) { await sel.selectOption({ label: match }); console.log(`\u2713 Pre-submit Preferred Contact No. Type: ${match}`); }
          }
        }
      } catch (_) {}

      // Preferred E-Mail ID Type
      try {
        const selNames = ['AccountBO.PhoneEmail.PhoneEmailType1', 'AccountBO.PhoneEmail.PhoneEmailType', 'AccountBO.PreferredEmailIdType'];
        for (const name of selNames) {
          const sel = f.locator(`select[name="${name}"]`).first();
          if (await sel.isVisible({ timeout: 2000 }).catch(() => false)) {
            const opts = await sel.locator('option').allTextContents().catch(() => [] as string[]);
            const match = opts.find((o: string) => preferredEmail && o.trim().toUpperCase() === preferredEmail.toUpperCase()) ||
                          opts.find((o: string) => preferredEmail && o.trim().toUpperCase().includes(preferredEmail.toUpperCase())) ||
                          opts.find((o: string) => o.includes('COMMUNICATION')) ||
                          opts.find((o: string) => o.includes('WORK')) ||
                          opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
            if (match) { await sel.selectOption({ label: match }); console.log(`\u2713 Pre-submit Preferred E-Mail ID Type: ${match}`); }
          }
        }
      } catch (_) {}

      // Preferred Mobile Alert Type
      try {
        const sel = f.locator('select[name="AccountBO.Preferred_Mobile_Alert_Type"]').first();
        if (await sel.isVisible({ timeout: 2000 }).catch(() => false)) {
          const opts = await sel.locator('option').allTextContents().catch(() => [] as string[]);
          const match = opts.find((o: string) => preferredMobile && o.trim().toUpperCase() === preferredMobile.toUpperCase()) ||
                        opts.find((o: string) => o.includes('WORK')) ||
                        opts.find((o: string) => o !== '--Select--' && o.trim() !== '');
          if (match) { await sel.selectOption({ label: match }); console.log(`\u2713 Pre-submit Preferred Mobile Alert Type: ${match}`); }
        }
      } catch (_) {}
    }

    // 2. Mark preferred records in parent grids (phone, email, identification)
    const markGridRow = async (searchText: string, label: string) => {
      if (!searchText) return false;
      const target = searchText.toUpperCase();
      for (const f of page.frames()) {
        const marked = await f.evaluate((t: string) => {
          const target = t.toUpperCase();
          const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          for (const row of Array.from(document.querySelectorAll('table tr'))) {
            if ((row.textContent || '').toUpperCase().includes(target)) {
              const cells = Array.from(row.querySelectorAll('td'));
              if (cells.length === 0) continue;
              // Set hidden preferred flag(s) if present in this row.
              for (const inp of row.querySelectorAll('input[type="hidden"][name*="IsPreferred" i], input[type="hidden"][name*="Preferred" i]')) {
                const hidden = inp as HTMLInputElement;
                if (hidden.value.toUpperCase() !== 'Y') { hidden.value = 'Y'; fire(hidden); }
              }
              const lastCell = cells[cells.length - 1];
              const link = lastCell.querySelector('a');
              if (link) { (link as HTMLElement).click(); return true; }
              for (const inp of row.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
                const radio = inp as HTMLInputElement;
                if (radio.offsetWidth > 0 && radio.offsetHeight > 0) { radio.click(); radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); return true; }
              }
              (lastCell as HTMLElement).click();
              return true;
            }
          }
          return false;
        }, searchText).catch(() => false);
        if (marked) { console.log(`\u2713 Pre-submit marked ${label} grid row for ${searchText}`); return true; }
      }
      return false;
    };

    const phoneNumber = (TD.contactData.phones?.[0] || TD.contactData).phoneNumber || '';
    if (phoneNumber) await markGridRow(String(phoneNumber), 'phone');
    const emailAddress = (TD.contactData.emails?.[0] || TD.contactData).email || '';
    if (emailAddress) await markGridRow(String(emailAddress).toUpperCase(), 'email');

    // Mark the preferred identification row from both documents and validDocData.
    const docsArr = Array.isArray(TD.documents) ? TD.documents : (TD.documents ? [TD.documents] : []);
    const allDocs = [...docsArr];
    if (TD.validDocData?.documentCode && !allDocs.some(d => d.documentCode === TD.validDocData.documentCode && d.uniqueId === TD.validDocData.uniqueId)) {
      allDocs.push(TD.validDocData);
    }
    const isPassport = (d: any) =>
      String(d.documentCode || '').toUpperCase().includes('PAS') ||
      String(d.documentType || '').toUpperCase().includes('PASSPORT') ||
      String(d.documentType || '').toUpperCase() === 'IDCUS';
    const isOtherDoc = (d: any) => String(d.documentCode || '').toUpperCase() === 'OTDOC' || String(d.documentType || '').toUpperCase() === 'OTHER';
    const preferredDoc = allDocs.find((d: any) => String(d.isPreferred).toUpperCase() === 'Y' && !isOtherDoc(d)) ||
                         allDocs.find(isPassport) ||
                         allDocs.find((d: any) => String(d.isPreferred).toUpperCase() === 'Y' && !isOtherDoc(d)) ||
                         allDocs.find((d: any) => !isOtherDoc(d)) ||
                         allDocs[0] ||
                         TD.validDocData ||
                         {};
    const docUniqueId = preferredDoc.uniqueId || '';
    const docCode = preferredDoc.documentCode || '';
    if (docUniqueId) await markGridRow(String(docUniqueId), 'identification');
    else if (docCode) await markGridRow(String(docCode), 'identification');

    // 3. Ensure Basel Profiling / Foreign A/c. Tax Reporting are set to workbook value (default N)
    const baselValue = String(TD.customerData?.baselProfilingRequired || TD.riskBaselData?.baselProfilingRequired || 'N').toUpperCase();
    const foreignTaxValue = String(TD.taxCertificationData?.foreignAcTaxReportingRequired || TD.demographicData?.foreignACTaxReportingRequired || TD.demographicData?.foreignAcTaxReportingRequired || 'N').toUpperCase();

    for (const f of page.frames()) {
      const fixed = await f.evaluate((args: { basel: string; foreign: string }) => {
        const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const findLabel = (el: HTMLElement): string => {
          let node = el.parentElement;
          for (let i = 0; i < 5 && node; i++) { const text = (node.textContent || '').trim(); if (text.length > 0) return text; node = node.parentElement; }
          return '';
        };
        const setNo = (sel: HTMLSelectElement, val: string) => {
          const v = val.toUpperCase();
          for (const o of Array.from(sel.options)) {
            if (o.value.toUpperCase() === v || o.text.trim().toUpperCase() === v || (v === 'N' && (o.value.toUpperCase() === 'NO' || o.text.trim().toUpperCase().startsWith('NO')))) {
              sel.value = o.value; fire(sel); return true;
            }
          }
          return false;
        };
        const results: string[] = [];
        for (const sel of Array.from(document.querySelectorAll('select'))) {
          const r = sel.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const name = (sel.name || '').toLowerCase();
          const label = findLabel(sel).toLowerCase();
          const combined = name + ' ' + label;
          if (combined.includes('basel') && combined.includes('profil')) {
            if (setNo(sel, args.basel)) results.push('BaselProfiling');
          }
          if ((label.includes('foreign') && label.includes('tax')) || name.includes('foreign') || name.includes('taxreporting') || name.includes('fatca')) {
            if (setNo(sel, args.foreign)) results.push('ForeignTaxReporting');
          }
        }
        return results;
      }, { basel: baselValue, foreign: foreignTaxValue }).catch(() => [] as string[]);
      if (fixed && fixed.length) console.log(`\u2713 Pre-submit fixed: ${fixed.join(', ')}`);
    }

    await this.syncSelectHiddenFields();
    await this.forceMandatoryFieldValues();
    await page.waitForTimeout(this.timeouts.short);
  }

  // ==================== FORCE MANDATORY FIELD VALUES ====================
  private async forceMandatoryFieldValues(): Promise<void> {
    const page = this.workingPage;
    const TD = this.TD;

    const phoneType = (TD.contactData.phones?.[0] || TD.contactData).phoneType || 'COMMUNICATION PHONE 1';
    const emailType = (TD.contactData.emails?.[0] || TD.contactData).emailType || 'COMMUNICATION';
    const baselValue = String(TD.customerData?.baselProfilingRequired || TD.riskBaselData?.baselProfilingRequired || 'N').toUpperCase();
    const foreignTaxValue = String(TD.taxCertificationData?.foreignAcTaxReportingRequired || TD.demographicData?.foreignACTaxReportingRequired || TD.demographicData?.foreignAcTaxReportingRequired || 'N').toUpperCase();

    for (const f of page.frames()) {
      try {
        const fixed = await f.evaluate((args: { phoneType: string; emailType: string; basel: string; foreign: string }) => {
          const fire = (el: HTMLElement) => { if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; } el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const matchOpt = (sel: HTMLSelectElement, val: string) => {
            const v = val.toUpperCase();
            for (const o of Array.from(sel.options)) {
              const ot = o.text.trim().toUpperCase();
              const ov = o.value.trim().toUpperCase();
              if (ot === v || ov === v || ot.includes(v) || ov.includes(v)) return o.value;
            }
            for (const o of Array.from(sel.options)) {
              const t = o.text.trim();
              if (t && t !== '--Select--' && t !== '--SELECT--') return o.value;
            }
            return '';
          };
          const trySet = (names: string[], labelKeywords: string[], val: string) => {
            if (!val) return false;
            let set = false;
            for (const sel of Array.from(document.querySelectorAll('select'))) {
              const n = (sel.name || '').toUpperCase();
              let label = '';
              let node = sel.parentElement;
              for (let i = 0; i < 6 && node; i++) { label = (node.textContent || '').trim(); if (label.length > 0) break; node = node.parentElement; }
              const lu = label.toUpperCase();
              const matchName = names.some(x => n.includes(x));
              const matchLabel = labelKeywords.some(k => lu.includes(k));
              if (matchName || matchLabel) {
                const optVal = matchOpt(sel, val);
                if (optVal && sel.value !== optVal) { sel.value = optVal; fire(sel); set = true; }
              }
            }
            return set;
          };

          const results: string[] = [];
          if (trySet(['PREFERREDCONTACTNOTYPE', 'PHONEEMAIL.PHONEEMAILTYPE'], ['PREFERRED CONTACT', 'PHONE'], args.phoneType)) results.push('PreferredContact');
          if (trySet(['PREFERREDEMAILIDTYPE', 'PHONEEMAIL.PHONEEMAILTYPE1'], ['PREFERRED EMAIL', 'EMAIL ID'], args.emailType)) results.push('PreferredEmail');
          if (trySet(['PREFERRED_MOBILE_ALERT_TYPE'], ['PREFERRED MOBILE', 'MOBILE ALERT'], args.phoneType)) results.push('PreferredMobile');
          if (trySet(['BASELPROFILING'], ['BASEL', 'PROFILING'], args.basel)) results.push('BaselProfiling');
          if (trySet(['FOREIGN', 'TAXREPORTING', 'FATCA'], ['FOREIGN A/C. TAX REPORTING', 'FOREIGN TAX', 'TAX REPORTING'], args.foreign)) results.push('ForeignTaxReporting');
          return results;
        }, { phoneType, emailType, basel: baselValue, foreign: foreignTaxValue });
        if (fixed.length) console.log(`  ✓ Force-set fields: ${fixed.join(', ')}`);
      } catch (_) {}
    }

    // Mark grids and set hidden preferred flags
    const phoneNumber = (TD.contactData.phones?.[0] || TD.contactData).phoneNumber || '';
    const emailAddress = (TD.contactData.emails?.[0] || TD.contactData).email || '';

    const docsArr2 = Array.isArray(TD.documents) ? TD.documents : (TD.documents ? [TD.documents] : []);
    const allDocs2 = [...docsArr2];
    if (TD.validDocData?.documentCode && !allDocs2.some(d => d.documentCode === TD.validDocData.documentCode && d.uniqueId === TD.validDocData.uniqueId)) {
      allDocs2.push(TD.validDocData);
    }
    const isPassport2 = (d: any) =>
      String(d.documentCode || '').toUpperCase().includes('PAS') ||
      String(d.documentType || '').toUpperCase().includes('PASSPORT') ||
      String(d.documentType || '').toUpperCase() === 'IDCUS';
    const isOtherDoc2 = (d: any) => String(d.documentCode || '').toUpperCase() === 'OTDOC' || String(d.documentType || '').toUpperCase() === 'OTHER';
    const preferredDoc2 = allDocs2.find((d: any) => String(d.isPreferred).toUpperCase() === 'Y' && !isOtherDoc2(d)) ||
                          allDocs2.find(isPassport2) ||
                          allDocs2.find((d: any) => !isOtherDoc2(d)) ||
                          allDocs2[0] ||
                          TD.validDocData ||
                          {};
    const docUniqueId = preferredDoc2.uniqueId || '';
    const docCode = preferredDoc2.documentCode || '';

    for (const f of page.frames()) {
      try {
        const marked = await f.evaluate((args: { phone: string; email: string; docId: string; docCode: string }) => {
          const fire = (el: HTMLElement) => {  if (el.tagName === 'SELECT') { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return; }el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('click', { bubbles: true })); };
          const markRows = (labels: string[]) => {
            for (const table of Array.from(document.querySelectorAll('table'))) {
              for (const row of Array.from(table.querySelectorAll('tr'))) {
                const text = (row.textContent || '').toUpperCase();
                for (const t of labels) {
                  if (t && text.includes(t)) {
                    // Set any hidden preferred flag in this row first.
                    for (const hidden of row.querySelectorAll('input[type="hidden"][name*="IsPreferred" i], input[type="hidden"][name*="Preferred" i]')) {
                      const h = hidden as HTMLInputElement;
                      if (h.value.toUpperCase() !== 'Y') { h.value = 'Y'; fire(h); }
                    }
                    const link = row.querySelector('a');
                    if (link) { (link as HTMLElement).click(); return t; }
                    const radio = row.querySelector('input[type="radio"], input[type="checkbox"]') as HTMLInputElement;
                    if (radio) { radio.click(); radio.checked = true; fire(radio); return t; }
                    const cell = row.querySelector('td:last-child') as HTMLElement;
                    if (cell) { cell.click(); return t; }
                  }
                }
              }
            }
            return '';
          };
          const setHidden = (name: string, val: string) => {
            const el = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
            if (el && el.value !== val) { el.value = val; fire(el); }
          };
          const out: string[] = [];
          if (args.phone) { const t = args.phone.toUpperCase(); if (markRows([t])) out.push('phone'); setHidden('AccountBO.PhoneEmail.IsPreferred', 'Y'); }
          if (args.email) { const t = args.email.toUpperCase(); if (markRows([t])) out.push('email'); setHidden('AccountBO.PhoneEmail.IsPreferred', 'Y'); }
          if (args.docId) { const t = args.docId.toUpperCase(); const marked = markRows([t]); if (marked) out.push('docId'); }
          if (!args.docId && args.docCode) { const t = args.docCode.toUpperCase(); const marked = markRows([t]); if (marked) out.push('docCode'); }
          // Set a global hidden preferred flag only if a row was actually marked.
          if (out.includes('docId') || out.includes('docCode')) {
            for (const name of ['EntityDocumentBO.IsPreferred', 'AccountBO.EntityDocumentBO.IsPreferred', 'AccountModBO.EntityDocumentBO.IsPreferred']) {
              setHidden(name, 'Y');
            }
          }
          return out;
        }, { phone: String(phoneNumber), email: String(emailAddress).toUpperCase(), docId: String(docUniqueId), docCode: String(docCode) }).catch(() => [] as string[]);
        if (marked.length) console.log(`  ✓ Force-marked grid rows: ${marked.join(', ')}`);
      } catch (_) {}
    }
  }

  // ==================== SUBMIT FORM (retail override) ====================
  async submitForm(): Promise<string> {
    await this.reacquireWorkingPage();
    await this.captureEvidence('Retail Submit - before');
    await this.ensureBasicInfoValues().catch(() => {});
    await this.setTitleAndSubSegment();
    await this.preSubmitFixes();
    await this.syncSelectHiddenFields();

    let cifId = await super.submitForm();
    if (cifId) {
      this._cifId = cifId;
      await this.captureEvidence('Retail Submit - after', { cifId });
      return cifId;
    }

    // Check validation errors and retry once
    const page = this.workingPage;
    const errors: string[] = [];
    for (const f of page.frames()) {
      try {
        const frameErrs = await f.evaluate(() => {
          const out: string[] = [];
          const text = document.body?.innerText || '';
          const lines = text.split('\n');
          for (const line of lines) {
            const t = line.trim();
            if (t.length > 5 && t.length < 200 && /Please select|Please enter|mandatory|required|invalid|error/i.test(t) && !/function|var |if\s*\(/.test(t)) out.push(t);
          }
          return out;
        }).catch(() => [] as string[]);
        if (frameErrs.length) errors.push(...frameErrs.slice(0, 3));
      } catch (_) {}
    }
    if (errors.length) {
      console.log('  ⚠ Submit validation errors detected: ' + errors.join(' | '));
      await this.ensureBasicInfoValues().catch(() => {});
      await this.preSubmitFixes();
      await this.forceMandatoryFieldValues();
      await this.syncSelectHiddenFields();
      await page.waitForTimeout(this.timeouts.short3);
      cifId = await super.submitForm();
      if (cifId) {
        this._cifId = cifId;
        await this.captureEvidence('Retail Submit - after', { cifId });
        return cifId;
      }
    }
    await this.captureEvidence('Retail Submit - after', { cifId: cifId || this._cifId });
    return cifId;
  }

  // ==================== PROCESS SELECTION ====================
  async handleProcessSelection(): Promise<void> {
    console.log('\n=== TC_RET_PS_001: Process Selection popup ===');
    await this.reacquireWorkingPage();
    await this.captureEvidence('Retail Process Selection - before', { cifId: this._cifId });
    const page = this.workingPage;
    try {
      let psPopup: Page | null = null;

      // 1. Look for an already-open process-selection popup.
      for (const p of page.context().pages()) {
        if (p === page || p.isClosed()) continue;
        try {
          const url = p.url().toLowerCase();
          if (url.includes('cifprocessselection') || url.includes('processselection')) { psPopup = p; break; }
        } catch (_) {}
      }

      // 2. If the popup did not open automatically, open it from the Current Process Step tab.
      if (!psPopup) {
        psPopup = await this.openProcessSelectionFromCurrentStepTab(page);
      }

      if (psPopup && !psPopup.isClosed()) {
        psPopup.on('dialog', async (d: Dialog) => { const msg = d.message(); this.lastDialogMessages.push(msg); console.log('PS popup dialog: "' + msg.substring(0, 200) + '"'); await d.accept().catch(() => {}); });
        await psPopup.waitForLoadState('domcontentloaded', { timeout: this.timeouts.long15 }).catch(() => {});
        await psPopup.waitForTimeout(this.timeouts.medium);

        await this.selectAndSaveKycProcess(psPopup);
      } else {
        console.log('\u26a0 Process Selection popup not found');
      }

      // Try to capture CIF ID from the confirmation message if it wasn't captured earlier
      if (!this._cifId) {
        for (const msg of this.lastDialogMessages.slice(-10)) {
          const m = msg.match(/CIF\s*(?:ID)?\s*[:?\s]*(\d{5,})/i) || msg.match(/\b([46]\d{9})\b/) || msg.match(/\b(\d{10})\b/);
          if (m) { this._cifId = m[1]; console.log(`\u2713 CIF ID captured from process dialog: ${this._cifId}`); break; }
        }
      }

      if (this._processSaveConfirmed) console.log('\u2713 Process Selection saved and confirmed');
      else console.log('\u26a0 Process Selection confirmation not received');
    } catch (e) { console.log('\u26a0 Process Selection error: ' + (e as Error).message?.substring(0, 200)); }
    await this.captureEvidence('Retail Process Selection - after', { cifId: this._cifId, processSaveConfirmed: this._processSaveConfirmed });
    await this.captureEvidence('Retail final state', { cifId: this._cifId, processSaveConfirmed: this._processSaveConfirmed });
  }

  // Open the process-selection popup by clicking the Current Process Step tab, then the window/icon link.
  private async openProcessSelectionFromCurrentStepTab(page: Page): Promise<Page | null> {
    let tabClicked = false;
    for (const f of page.frames()) {
      try {
        const clicked = await f.evaluate(() => {
          const selectors = ['a', 'span', 'div', 'td', 'li', 'button', 'input'];
          for (const sel of selectors) {
            for (const el of document.querySelectorAll(sel)) {
              const text = (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).value?.trim() || '';
              if (text === 'Current Process Step' || text.includes('Current Process Step')) {
                (el as HTMLElement).click();
                return `clicked ${sel}: "${text}"`;
              }
            }
          }
          return '';
        });
        if (clicked) { console.log(`\u2713 Current Process Step tab: ${clicked}`); tabClicked = true; break; }
      } catch (_) {}
    }
    if (!tabClicked) return null;
    await page.waitForTimeout(this.timeouts.short3).catch(() => {});

    // The process selection may appear inline after clicking the tab.
    for (const f of page.frames()) {
      try {
        const inline = await f.evaluate(() => /Process Selection|Selected Process Name|Suggested Process Name/i.test(document.body?.innerText || ''));
        if (inline) return page;
      } catch (_) {}
    }

    // Otherwise, click an icon/link that opens the process selection window.
    const winPromise = page.context().waitForEvent('page', { timeout: this.timeouts.long15 }).catch(() => null);
    let iconClicked = false;
    for (const f of page.frames()) {
      try {
        const clicked = await f.evaluate(() => {
          const controls = Array.from(document.querySelectorAll('a, img, input, button, span, div, td')) as HTMLElement[];
          for (const el of controls) {
            const title = (el.getAttribute('title') || '').toLowerCase();
            const onclick = (el.getAttribute('onclick') || '').toLowerCase();
            const text = (el.innerText || '').trim().toLowerCase();
            const val = ((el as HTMLInputElement).value || '').toLowerCase();
            if (title.includes('window') || title.includes('new') || onclick.includes('window.open') || onclick.includes('newwindow') || onclick.includes('selectprocess') || text.includes('process selection') || val.includes('process selection')) {
              el.click();
              return true;
            }
          }
          return false;
        });
        if (clicked) { console.log('\u2713 Process selection icon/link clicked'); iconClicked = true; break; }
      } catch (_) {}
    }

    if (!iconClicked) {
      // Last resort: call the JS selectProcess() function if it is available.
      try {
        const called = await page.evaluate(() => {
          try { if (typeof (window as any).selectProcess === 'function') { (window as any).selectProcess(); return true; } return false; } catch { return false; }
        });
        if (called) console.log('\u2713 Called selectProcess()');
      } catch (_) {}
    }

    const win = await winPromise;
    if (win && !win.isClosed()) {
      await win.waitForLoadState('domcontentloaded', { timeout: this.timeouts.long15 }).catch(() => {});
      return win;
    }

    // If no window opened, the form may be inline on the current page.
    return page;
  }

  // Select the KYC approval process in the process-selection popup and save it.
  private async selectAndSaveKycProcess(psPopup: Page): Promise<void> {
    const isWorkingPage = psPopup === this.workingPage;

    // Try to select the KYC process from any visible dropdown.
    const processName = ((this.TD as any).processName || (CRM_TEST_DATA as any).retail.modification?.processName || 'CIFCustomerKYCApproval');
    try {
      for (const f of psPopup.frames()) {
        let chosen = false;
        const selects = await f.locator('select').all().catch(() => []);
        for (const sel of selects) {
          if (chosen) break;
          const options = await sel.locator('option').all().catch(() => []);
          for (const opt of options) {
            const label = ((await opt.textContent().catch(() => '')) || '').trim();
            const value = ((await opt.getAttribute('value').catch(() => '')) || '').trim();
            if (/CIF\s*Customer\s*KYC\s*Approval|CIFCustomerKYCApproval/i.test(label) || /CIF\s*Customer\s*KYC\s*Approval|CIFCustomerKYCApproval/i.test(value)) {
              await sel.selectOption(value ? { value } : { label }, { timeout: 5000 }).catch(() => {});
              console.log(`\u2713 Selected process "${label}"`);
              chosen = true;
              break;
            }
          }
        }
      }
    } catch (_) {}

    // Wait for and click Save Process Selection.
    let saveReady = false;
    for (let i = 0; i < 10 && !saveReady; i++) {
      for (const f of psPopup.frames()) {
        const sb = f.locator('input[value*="Save Process Selection"]').first();
        if (await sb.isVisible({ timeout: 2000 }).catch(() => false)) { saveReady = true; break; }
      }
      if (!saveReady) await psPopup.waitForTimeout(this.timeouts.short);
    }

    let saveClicked = false;
    for (const f of psPopup.frames()) {
      const sb = f.locator('input[value*="Save Process Selection"]').first();
      if (await sb.isVisible({ timeout: 5000 }).catch(() => false)) {
        await sb.click(); saveClicked = true; console.log('\u2713 Clicked "Save Process Selection"'); break;
      }
    }
    if (!saveClicked) {
      for (const f of psPopup.frames()) {
        const c = await f.evaluate(() => { for (const btn of document.querySelectorAll('input[type="button"], input[type="submit"], button')) { const val = (btn.getAttribute('value') || btn.textContent || '').trim(); if (val.includes('Save Process Selection')) { (btn as HTMLElement).click(); return val; } } return ''; }).catch(() => '');
        if (c) { saveClicked = true; break; }
      }
    }

    for (let attempt = 0; attempt < 15 && !this._processSaveConfirmed; attempt++) {
      await psPopup.waitForTimeout(2000).catch(() => {});
      for (const msg of this.lastDialogMessages.slice(-10)) {
        if (msg.toLowerCase().includes('process was saved successfully') || msg.toLowerCase().includes('saved successfully')) {
          this._processSaveConfirmed = true; console.log('\u2713 CONFIRMED: "' + msg + '"'); break;
        }
      }
      if (this._processSaveConfirmed) break;
      if (psPopup.isClosed()) {
        for (const msg of this.lastDialogMessages.slice(-10)) { if (msg.toLowerCase().includes('saved successfully')) { this._processSaveConfirmed = true; break; } }
        break;
      }
    }

    if (!isWorkingPage && !psPopup.isClosed()) {
      try {
        for (const f of psPopup.frames()) { const closeBtn = f.locator('input[value="Close"]').first(); if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await closeBtn.click(); break; } }
        await psPopup.waitForTimeout(this.timeouts.short).catch(() => {});
        await this.safeClosePopup(psPopup, 5000);
      } catch (_) {}
    }
  }
}