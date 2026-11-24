import { Page, Dialog } from '@playwright/test';
import { AppConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { CrmEndToEndPage } from './crmEndToEndPage';

export class CrmCorporateEndToEndPage extends CrmEndToEndPage {
  private natInfo = { codeName: '', dispName: '', btnName: '' };

  // Cache for resolved LOV code/display values so they can be restored before submit.
  private lovCache: Record<string, { code: string; display: string }> = {};

  // Known code/display pairs for Corporate lookup fields. Prefer workbook values (cd.*)
  // when available; these fallbacks are used only when the CRM sheet does not contain a code/display column.
  private LOOKUP_FALLBACKS: Record<string, { code: string; display: string }> = {
    'Country of Incorporation': { code: 'BM', display: 'BERMUDA' },
    'Country of Origin': { code: '', display: '' },
    'Region': { code: 'CBBDA', display: 'CLARIEN BANK BERMUDA' }
  };

  constructor(page: Page, config: AppConfig, lastDialogMessages: string[]) {
    super(page, config, lastDialogMessages);
  }

  // Fallback for code/display LOV fields when the lookup popup cannot be used.
  // Sets the hidden code input and visible category (Cat_) input directly.
  private async setLovWithFallback(
    frame: any,
    codeNames: string[],
    displayNames: string[],
    codeValue: string,
    displayValue: string,
    label: string
  ): Promise<void> {
    await this.setLov(frame, codeNames, displayNames, codeValue, displayValue, label);
  }

  private async readLovValue(frame: any, codeName: string): Promise<{ code: string; display: string } | null> {
    return frame.evaluate((name: string) => {
      const codeEl = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
      const catEl = document.querySelector(`input[name="Cat_${name}"]`) as HTMLInputElement;
      if (!codeEl && !catEl) return null;
      return { code: codeEl?.value || '', display: catEl?.value || '' };
    }, codeName).catch(() => null);
  }

  // Split the single Basic Info phone number from the CRM sheet into country/area/local.
  // For Bermuda numbers starting with '441' the country code is 1 and the remainder is area+local.
  private splitBasicInfoPhone(phoneNo: string): { country: string; area: string; local: string } {
    const raw = String(phoneNo || '').trim();
    if (!raw) return { country: '', area: '', local: '' };
    // Bermuda pattern: 441 + 7-digit local (10 digits total)
    if (raw.startsWith('441') && raw.length === 10) {
      return { country: '1', area: '441', local: raw.substring(3) };
    }
    // Generic fallback: 3-digit area + remaining local with country code 1
    if (raw.length > 3) {
      return { country: '1', area: raw.substring(0, 3), local: raw.substring(3) };
    }
    return { country: '', area: '', local: raw };
  }

  // Re-apply critical Corporate country LOV fields using the two-textbox helper so
  // the CRM has time to auto-populate the hidden code and display values.
  private async applyCorporateLovs(frame: any, cd: any): Promise<void> {
    if (!frame) return;

    if (cd.countryOfIncorporation) {
      await this.setTwoTextboxLovByLabel(frame, 'Country of Incorporation', String(cd.countryOfIncorporation)).catch(() => {});
    }
    if (cd.sector) {
      await this.setGenericFieldByLabel(frame, 'Sector', cd.sectorCode ? String(cd.sectorCode) : String(cd.sector), 'select').catch(() => {});
    }
    if (cd.subSector) {
      await this.setGenericFieldByLabel(frame, 'Sub-sector', cd.subSectorCode ? String(cd.subSectorCode) : String(cd.subSector), 'select').catch(() => {});
    }
    if (cd.countryOfOrigin) {
      await this.setTwoTextboxLovByLabel(frame, 'Country of Origin', String(cd.countryOfOrigin)).catch(() => {});
    }

    await this.refreshAccountFrame('after Corporate LOVs');
  }

  // Ensure Corporate Finance code/display LOV pairs are correctly populated before saving.
  protected async postProcessSection(frame: any, sectionName: string, endToEnd: any): Promise<void> {
    if (!frame || sectionName !== 'corporateFinanceData') return;
    const fd = endToEnd?.corporateFinanceData || {};
    const page = this.workingPage;

    if (fd.noOfEmployees) {
      const emp = String(fd.noOfEmployees);
      // The visible integer input and the hidden server input have different names.
      await this.setField(frame, ['2_FinancialBO.numberOf_Employees'], emp, 'No. of Employees visible').catch(() => {});
      await this.setField(frame, ['FinancialBO.numberOf_Employees'], emp, 'No. of Employees hidden').catch(() => {});
    }

    if (fd.ccy) {
      const ccy = String(fd.ccy);
      // CCY is a two-textbox category LOV: write the code into the first input and let the CRM auto-populate the display.
      await this.setField(frame, ['FinancialModBO.crncy_Code', 'FinancialBO.crncy_Code'], ccy, 'CCY code').catch(() => {});
    }

    if (fd.country) {
      const countryCode = fd.countryCode || endToEnd?.corporateData?.countryOfIncorporation || '';
      // Country is a two-textbox category LOV: write the code into the first input and let the CRM auto-populate the display.
      await this.setField(frame, ['FinancialBO.country'], String(countryCode), 'Corporate Finance Country code').catch(() => {});
    }

    await this.dumpFrameHtml(frame, 'corporate-finance-final');
    await this.closeUnexpectedPopups(page);
  }

  // ==================== NAVIGATE TO NEW ENTITY ====================
  async navigateToNewEntity(): Promise<void> {
    console.log('=== Step 2: Navigate to CIF Corporate > New Entity > Customer ===');
    let page = this.workingPage;
    await this.takeScreenshot('Before Navigate to New Entity (Corporate)');

    const functionMainFrame = page.frame({ name: 'Functionmain' });
    if (functionMainFrame) {
      await functionMainFrame.evaluate(() => { const el = document.getElementById('screen2'); if (el) el.click(); });
      console.log('\u2713 Clicked CIF Corporate');
      await page.waitForTimeout(this.timeouts.short);
    }

    await page.waitForTimeout(this.timeouts.medium);
    const corpMenuFrame = page.frame({ name: CRM_TEST_DATA.corporate.menuFrameName });
    if (corpMenuFrame) {
      await corpMenuFrame.evaluate(() => { const el = document.getElementById('view6'); if (el) el.click(); });
      console.log('\u2713 Clicked New Entity (view6)');
      await page.waitForTimeout(this.timeouts.short3);

      const customerPopupPromise = page.context().waitForEvent('page', { timeout: 30000 }).catch(() => null);
      await corpMenuFrame.evaluate(() => { const el = document.getElementById('subview60'); if (el) el.click(); });
      await page.waitForTimeout(this.timeouts.short);
      await corpMenuFrame.evaluate(() => { const el = document.getElementById('subviewspanFor60'); if (el) el.click(); });
      console.log('\u2713 Clicked Customer (subview60)');

      const customerPopup = await customerPopupPromise;
      if (customerPopup) {
        const popupUrl = customerPopup.isClosed() ? '' : customerPopup.url();
        console.log('\u2713 Popup opened: ' + popupUrl);
        if (!customerPopup.isClosed() && (popupUrl.includes('CorpCreateDet') || popupUrl.includes('CorpGeneralMod') || popupUrl.includes('AccountMod_det'))) {
          console.log('\u2713 Customer form opened in new window');
          this.workingPage = customerPopup as Page;
          page = this.workingPage;
          page.on('dialog', async (d: Dialog) => {
            this.lastDialogMessages.push(d.message());
            console.log('\ud83d\udce2 CustomerPage dialog: "' + d.message().substring(0, 150) + '"');
            await d.accept().catch(() => {});
          });
          await page.waitForLoadState('domcontentloaded').catch(() => {});
        } else {
          console.log('  \u2192 Auxiliary popup, keeping original page');
          if (!customerPopup.isClosed()) {
            customerPopup.on('dialog', async (d) => { this.lastDialogMessages.push(d.message()); await d.accept().catch(() => {}); });
          }
        }
      } else { console.log('Customer form loaded in same page'); }
    } else {
      console.log('\u26a0 Corporate menu frame not found');
      for (const f of page.frames()) { try { console.log('  "' + f.name() + '" -> ' + f.url().substring(0, 100)); } catch (_) {} }
    }

    await this.waitForCorporateForm();
  }

  private async waitForCorporateForm(): Promise<void> {
    console.log('=== Step 3: Wait for Corporate Customer form ===');
    const page = this.workingPage;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      // Strategy 1: Find frame with CorporateBO fields (most reliable)
      for (const f of page.frames()) {
        try {
          const hasCorporateFields = await f.evaluate(() => {
            const testNames = ['CorporateBO.corporate_Name', 'CorporateBO.short_Name', 'CorporateBO.keyContact_PersonName'];
            return testNames.some(n => !!document.querySelector(`input[name="${n}"]`));
          }).catch(() => false);
          if (hasCorporateFields) {
            const inputCount = await f.evaluate(() => document.querySelectorAll('input').length).catch(() => 0);
            this.accountFrame = f;
            console.log('\u2713 Found Corporate form frame (by CorporateBO fields): "' + f.name() + '" url=' + f.url().substring(f.url().lastIndexOf('/') + 1).substring(0, 80) + ' inputs=' + inputCount);
            break;
          }
        } catch (_) {}
      }
      if (this.accountFrame) break;
      // Strategy 2: URL-based detection
      for (const f of page.frames()) {
        try {
          const u = f.url();
          if (u.includes('CorpGeneralModDet') || u.includes('CorpCreateDetWizard') || u.includes('CorpMod')) {
            const inputCount = await f.evaluate(() => document.querySelectorAll('input').length).catch(() => 0);
            if (u.includes('CorpGeneralModDet') || inputCount > 50) {
              this.accountFrame = f;
              console.log('\u2713 Found Corporate form frame (by URL): "' + f.name() + '" inputs=' + inputCount);
              break;
            }
          }
        } catch (_) {}
      }
      if (this.accountFrame) break;
      await page.waitForTimeout(3000);
    }
    if (!this.accountFrame) {
      for (const f of page.frames()) {
        try {
          const cnt = await f.evaluate(() => document.querySelectorAll('input').length).catch(() => 0);
          if (cnt > 100 && f.url() !== 'about:blank' && !this.accountFrame) this.accountFrame = f;
        } catch (_) {}
      }
    }
    if (!this.accountFrame) throw new Error('Corporate form frame not found');

    // Hide CoreServer
    try {
      for (const f of page.frames()) {
        try {
          const hidden = await f.evaluate(() => {
            let c = 0;
            document.querySelectorAll('#CoreServer, iframe[name="CoreServer"], [id*="CoreServer"]').forEach(el => {
              const h = el as HTMLElement; h.style.display = 'none'; h.style.pointerEvents = 'none'; h.style.visibility = 'hidden';
              h.style.position = 'absolute'; h.style.left = '-9999px'; h.style.width = '0px'; h.style.height = '0px'; c++;
            }); return c;
          });
          if (hidden > 0) console.log('  Hidden ' + hidden + ' CoreServer element(s)');
        } catch (_) {}
      }
    } catch (_) {}

    // Log form fields
    const fieldInfo = await this.accountFrame.evaluate(() => {
      const inputs: any[] = []; const selects: any[] = [];
      document.querySelectorAll('input').forEach(el => { const inp = el as HTMLInputElement; const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && inp.type !== 'hidden') inputs.push({ name: inp.name, type: inp.type }); });
      document.querySelectorAll('select').forEach(el => { const sel = el as HTMLSelectElement; const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) selects.push({ name: sel.name }); });
      return { allInputs: inputs, allSelects: selects };
    }).catch(() => ({ allInputs: [], allSelects: [] }));
    console.log('Form: ' + fieldInfo.allInputs.length + ' inputs, ' + fieldInfo.allSelects.length + ' selects');
  }

  // ==================== PRIVATE HELPERS ====================
  protected async refreshAccountFrame(label = ''): Promise<void> {
    const page = this.workingPage;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (page.isClosed()) { console.log('  \u26a0 Page is closed, cannot refresh accountFrame' + (label ? ' (' + label + ')' : '')); return; }
        await page.waitForTimeout(1000);
      } catch (e: any) {
        if (e.message?.includes('closed')) { console.log('  \u26a0 Page closed during refresh' + (label ? ' (' + label + ')' : '')); return; }
        throw e;
      }
      // Prefer frame with actual CorporateBO fields
      let candidate: any = null;
      for (const f of page.frames()) {
        try {
          const hasCorporateFields = await f.evaluate(() => {
            const testNames = ['CorporateBO.corporate_Name', 'CorporateBO.short_Name', 'CorporateModBO.segment'];
            return testNames.some(n => !!document.querySelector(`input[name="${n}"], select[name="${n}"]`));
          }).catch(() => false);
          if (hasCorporateFields) { candidate = f; break; }
        } catch (_) {}
      }
      if (!candidate) candidate = page.frames().find(f => { const u = f.url(); return u.includes('CorpGeneralModDet') || u.includes('CorpCreateDetWizard') || u.includes('CorpMod'); });
      if (!candidate) candidate = page.frame({ name: 'formDispFrame' }) || undefined;
      if (candidate) {
        try {
          const cnt = await candidate.evaluate(() => document.querySelectorAll('input').length);
          if (cnt > 3) { this.accountFrame = candidate; console.log('  \u21bb Refreshed accountFrame' + (label ? ' (' + label + ')' : '') + ' inputs=' + cnt); return; }
        } catch (_) {}
      }
    }
    console.log('  \u26a0 Could not refresh accountFrame' + (label ? ' (' + label + ')' : ''));
  }

  private async setLovViaPopup(codeName: string, searchValue: string, label: string): Promise<boolean> {
    const page = this.workingPage;
    const btnName = `btnone_${codeName}`;
    const btnExists = await this.accountFrame.evaluate((name: string) => !!document.querySelector(`input[name="${name}"]`), btnName).catch(() => false);
    if (!btnExists) { console.log('\u26a0 ' + label + ' LOV button not found: ' + btnName); return false; }
    const lovPP = page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null);
    await this.accountFrame.evaluate((name: string) => {
      const el = document.querySelector(`input[name="${name}"]`) as HTMLElement;
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, btnName);
    console.log('  Clicked LOV button for ' + label + '...');
    const lov = await lovPP;
    if (!lov || lov.isClosed()) { console.log('  \u26a0 No LOV popup for ' + label); return false; }
    lov.on('dialog', async (d) => { await d.accept().catch(() => {}); });
    await this.waitForPopupReady(lov, label + ' LOV');
    let searchFilled = false;
    for (const lf of lov.frames()) {
      const inps = await lf.locator('input[type="text"]').all().catch(() => []);
      for (const inp of inps) { if (await inp.isVisible().catch(() => false)) { await inp.fill(searchValue); searchFilled = true; break; } }
      if (searchFilled) { const sub = lf.locator('input[value="Submit"]').first(); if (await sub.isVisible({ timeout: 3000 }).catch(() => false)) await sub.click(); break; }
    }
    if (!lov.isClosed()) await lov.waitForTimeout(2000).catch(() => {});
    let selected = false;
    if (!lov.isClosed()) {
      for (const lf of lov.frames()) {
        try {
          await Promise.race([lf.getByText(searchValue, { exact: true }).first().dblclick({ timeout: 5000 }), lov.waitForEvent('close', { timeout: 10000 })]);
          selected = true; console.log('  \u2713 Selected ' + label + ': "' + searchValue + '"'); break;
        } catch (_) { if (lov.isClosed()) { selected = true; break; } }
      }
    }
    if (!selected && !lov.isClosed()) {
      console.log('  Retrying ' + label + ' with empty search...');
      for (const lf of lov.frames()) {
        const inps = await lf.locator('input[type="text"]').all().catch(() => []);
        for (const inp of inps) { if (await inp.isVisible().catch(() => false)) { await inp.fill(''); break; } }
        const sub = lf.locator('input[value="Submit"]').first();
        if (await sub.isVisible({ timeout: 2000 }).catch(() => false)) await sub.click();
      }
      if (!lov.isClosed()) await lov.waitForTimeout(2000).catch(() => {});
      if (!lov.isClosed()) {
        let allVals: string[] = [];
        for (const lf of lov.frames()) {
          const td = await lf.evaluate(() => Array.from(document.querySelectorAll('td')).map(td => td.textContent?.trim() || '').filter(t => t.length >= 2 && t.length <= 80)).catch(() => []);
          if (td.length > allVals.length) allVals = td;
        }
        const headerWords = ['Code', 'Country', 'City', 'State', 'Location', 'Page', 'of', 'No Records', 'List', 'Value'];
        const dataVals = allVals.filter(v => !headerWords.some(h => v.includes(h)) && v.length >= 2 && v.length <= 40 && !v.match(/^\d+$/) && !v.includes('\n'));
        for (const lf of lov.frames()) {
          try {
            await Promise.race([lf.getByText(searchValue, { exact: true }).first().dblclick({ timeout: 5000 }), lov.waitForEvent('close', { timeout: 10000 })]);
            selected = true; break;
          } catch (_) { if (lov.isClosed()) { selected = true; break; } }
        }
        if (!selected && !lov.isClosed() && dataVals.length > 0) {
          for (const lf of lov.frames()) {
            try {
              await Promise.race([lf.getByText(dataVals[0], { exact: true }).first().dblclick({ timeout: 5000 }), lov.waitForEvent('close', { timeout: 10000 })]);
              selected = true; console.log('  \u2713 Selected first ' + label + ': "' + dataVals[0] + '"'); break;
            } catch (_) { if (lov.isClosed()) { selected = true; break; } }
          }
        }
      }
    }
    await this.safeClosePopup(lov, 5000);
    await page.waitForTimeout(1000);
    return selected;
  }

  // Set Charge Level Code from the workbook value. This is a two-textbox category LOV:
  // the workbook value is entered in the visible input and the CRM auto-populates
  // the hidden code after a short wait; no lookup popup is opened.
  private async setChargeLevelCode(f: any, cd: any): Promise<void> {
    const value = String(cd.chargeLevelCode || '').trim();
    if (!value) return;

    await this.setTwoTextboxLovByLabel(f, 'Charge Level Code', value).catch(() => {});
    console.log(`✓ Charge Level Code handled with workbook value: ${value}`);
  }

  // ==================== FILL BASIC INFO TAB ====================
  async fillBasicInfo(skipSave = false, evidencePrefix = 'Corporate Basic Info'): Promise<void> {
    console.log('\n========== BASIC INFO TAB ==========');
    await this.captureEvidence(`${evidencePrefix} - before`).catch(() => {});
    // Prefer the cached main Customer form frame.
    if (!this.accountFrame && this.mainAccountFrame) this.accountFrame = this.mainAccountFrame;
    // Verify accountFrame has CorporateBO fields — re-detect if not
    const checkFrame = this.mainAccountFrame || this.accountFrame;
    const hasCorporateFields = await checkFrame.evaluate(() => {
      return !!document.querySelector('input[name="CorporateBO.corporate_Name"]');
    }).catch(() => false);
    if (!hasCorporateFields) {
      console.log('  ⚠ accountFrame lacks CorporateBO fields — scanning all frames...');
      const page = this.workingPage;
      for (const f of page.frames()) {
        try {
          const hasFields = await f.evaluate(() => !!document.querySelector('input[name="CorporateBO.corporate_Name"]')).catch(() => false);
          if (hasFields) {
            const cnt = await f.evaluate(() => document.querySelectorAll('input').length).catch(() => 0);
            this.accountFrame = f;
            this.mainAccountFrame = f;
            console.log('  ✓ Re-detected accountFrame: "' + f.name() + '" url=' + f.url().substring(f.url().lastIndexOf('/') + 1).substring(0, 80) + ' inputs=' + cnt);
            break;
          }
        } catch (_) {}
      }
    }
    const f = this.accountFrame;
    const cd = CRM_TEST_DATA.corporate.endToEnd.corporateData;

    // Core identity fields
    await this.setField(f, ['CorporateBO.corporate_Name'], cd.corporateName, 'Corporate Name');
    await this.setField(f, ['CorporateBO.short_Name'], cd.shortName, 'Short Name');
    await this.setField(f, ['CorporateBO.keyContact_PersonName', 'CorporateBO.keyContactPerson'], cd.keyContactPerson, 'Key Contact Person');

    // Basic Info phone from workbook phoneNo split (country/area/local)
    const phone = this.splitBasicInfoPhone(cd.phoneNo);
    if (phone.country) await this.setField(f, ['CorporateBO.phone.cntrycode'], phone.country, 'Phone Country Code');
    if (phone.area) await this.setField(f, ['CorporateBO.phone.areacode'], phone.area, 'Phone Area Code');
    if (phone.local) await this.setField(f, ['CorporateBO.phone.localcode'], phone.local, 'Phone Local Code');

    // Business Type from CRM sheet
    if (cd.businessType) {
      await this.setGenericFieldByLabel(f, 'Business Type', cd.businessType, 'select').catch(() => {});
    }

    await this.setField(f, ['CorporateBO.registration_Number'], cd.registrationNo, 'Registration No');
    await this.setField(f, ['3_CorporateBO.date_Of_Incorporation'], cd.incorporationDate, 'Incorporation Date');
    await this.setField(f, ['3_CorporateBO.date_Of_Commencement'], cd.businessCommencementDate, 'Business Commencement Date');

    // Primary SOL / Service Center
    if (cd.solId) {
      const solSet = await this.setSelect(f, ['CorporateBO.primary_Service_Center', 'CorporateModBO.primary_Service_Center'], cd.solId, 'Primary Service Center');
      if (!solSet) await this.setLov(f, ['CorporateBO.primary_Service_Center'], ['Cat_CorporateBO.primary_Service_Center'], cd.solId, cd.solId, 'Primary Service Center');
    }

    // Segment / Sub-segment: workbook code + display in the two textboxes, no lookup popup.
    if (cd.segment || cd.segmentDisplay) {
      await this.setTwoTextboxLovByLabel(f, 'Corporate Segment', cd.segment || '', cd.segmentDisplay || '').catch(() => {});
    }
    if (cd.subSegment || cd.subSegmentDisplay) {
      await this.setTwoTextboxLovByLabel(f, 'Sub-segment', cd.subSegment || '', cd.subSegmentDisplay || '').catch(() => {});
    }

    await this.setField(f, ['CorporateBO.source_Of_Funds'], cd.fundSource, 'Source of Funds');
    await this.setField(f, ['CorporateBO.taxID'], cd.taxId, 'Tax ID');
    await this.setSelect(f, ['CorporateModBO.entityClass'], cd.entityClass, 'Entity Class');
    await this.setSelect(f, ['CorporateModBO.legalEntity_Type'], cd.legalEntityType, 'Legal Entity Type');
    await this.setSelect(f, ['CorporateModBO.priority'], cd.assignedPriority, 'Priority');

    // Region from CRM sheet
    if (cd.region) {
      await this.setGenericFieldByLabel(f, 'Region', cd.region, 'select').catch(() => {});
    }

    // Principal Place of Operation (only if the CRM sheet provides a value)
    if (cd.principalPlaceOfOperation) {
      await this.setTwoTextboxLovByLabel(f, 'Principal Place of Operation', String(cd.principalPlaceOfOperation)).catch(() => {});
    }

    await this.setField(f, ['CorporateBO.website_Address'], cd.website, 'Website Address');

    // Base CCY
    if (cd.baseCcy) {
      await this.setGenericFieldByLabel(f, 'Base CCY', cd.baseCcy, 'select').catch(() => {});
    }

    // Access Owner Group / Segment / Business Center (correct known typo in CRM sheet)
    let accessOwnerGroup = cd.accessOwnerGroup || '';
    if (accessOwnerGroup.trim().toLowerCase() === 'genral banking') accessOwnerGroup = 'General Banking';
    if (accessOwnerGroup) await this.setGenericFieldByLabel(f, 'Access Owner Group', accessOwnerGroup, 'select');
    if (cd.accessOwnerSegment) await this.setGenericFieldByLabel(f, 'Access Owner Segment', cd.accessOwnerSegment, 'select');
    if (cd.accessOwnerBusinessCenter) await this.setGenericFieldByLabel(f, 'Access Owner Business Center', cd.accessOwnerBusinessCenter, 'text');

    // Relationship Created By and Primary RM
    if (cd.createdBy) await this.setField(f, ['CorporateBO.relationship_CreatedBy', 'CorporateModBO.relationship_CreatedBy'], cd.createdBy, 'Relationship Created By');
    if (cd.primaryRelationshipManagerId) await this.setField(f, ['CorporateBO.PrimaryRMLogin_ID', 'CorporateModBO.PrimaryRMLogin_ID'], cd.primaryRelationshipManagerId, 'Primary RM');

    // Notes (textarea) from workbook
    if (cd.notes) {
      const notesNames = ['CorporateBO.notes', 'CorporateBO.Notes', 'CorporateModBO.notes', 'CorporateModBO.Notes'];
      let notesSet = false;
      for (const nn of notesNames) {
        if (await this.setField(f, [nn], cd.notes, 'Notes')) { notesSet = true; break; }
      }
      if (!notesSet) {
        await f.evaluate((v: string) => {
          const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const ta = document.querySelector('textarea[name="CorporateBO.notes"]') as HTMLTextAreaElement || document.querySelector('textarea[name="CorporateBO.Notes"]') as HTMLTextAreaElement;
          if (ta) { ta.value = v; fire(ta); }
        }, cd.notes).catch(() => {});
      }
    }

    // Remaining workbook values via metadata-driven filler. Protected fields are skipped
    // because they are already managed above or by applyCorporateLovs.
    await this.fillSectionByMeta(f, 'corporateData', cd, CRM_TEST_DATA.corporate.endToEnd._meta, [
      'corporateName', 'shortName', 'keyContactPerson', 'phoneNo', 'businessType',
      'registrationNo', 'incorporationDate', 'businessCommencementDate', 'solId',
      'segment', 'segmentDisplay', 'corporateSegment', 'subSegment', 'subSegmentDisplay', 'fundSource', 'region',
      'taxId', 'entityClass', 'legalEntityType', 'assignedPriority', 'relationshipType',
      'principalPlaceOfOperation', 'website', 'baseCcy', 'baseCcyDisplay',
      'countryOfIncorporation', 'countryOfIncorporationDisplay', 'countryOfOrigin', 'countryOfOriginDisplay',
      'accessOwnerGroup', 'accessOwnerSegment', 'accessOwnerBusinessCenter',
      'createdBy', 'primaryRelationshipManagerId', 'notes', 'sector', 'sectorCode', 'subSector', 'subSectorCode',
      'chargeLevelCode'
    ]).catch(() => {});

    // Re-apply critical lookups so Sector/Sub-sector and Country values are not cleared.
    await this.applyCorporateLovs(f, cd);
    await this.refreshAccountFrame('after apply corporate LOVs');

    // Fallback to ensure key fields that the metadata filler may miss are populated.
    if (cd.averageAnnualIncome) {
      await this.setGenericFieldByLabel(f, 'Average Annual Income', String(cd.averageAnnualIncome), 'number').catch(() => {});
    }
    if (cd.nativeLanguage) {
      await this.setGenericFieldByLabel(f, 'Native Language', cd.nativeLanguage, 'select').catch(() => {});
      await this.setGenericFieldByLabel(f, 'Native Language Code', cd.nativeLanguage, 'select').catch(() => {});
    }
    if (cd.preferredLanguage) {
      await this.setGenericFieldByLabel(f, 'Preferred Language', cd.preferredLanguage, 'select').catch(() => {});
    }
    if (cd.baseCcy) {
      await this.setGenericFieldByLabel(f, 'Base CCY', cd.baseCcy, 'select').catch(() => {});
    }

    // Charge Level Code is LOV-driven and the workbook value may be invalid.
    await this.setChargeLevelCode(f, cd);
    await this.dumpFrameHtml(f, 'basic-info-after-charge');

    // Synchronise hidden native code/display inputs for any <select> values that
    // were populated via label-based helpers, so backend validation sees both code and text.
    await this.syncSelectHiddenFields(f).catch(() => {});

    // Do not click the bottom Save button; instead navigate to the next sub-tab
    // so the application saves via tab navigation and values remain populated.
    await this.dumpFrameHtml(f, 'basic-info-final');
    if (!skipSave) {
      await this.navigateToSectionTab(['Identification Document Details', 'Document', 'ID Document', 'Identification']);
    }
    await this.captureEvidence(`${evidencePrefix} complete`).catch(() => {});
  }

  // ==================== FILL CONTACT TAB ====================
  async fillContactTab(): Promise<void> {
    console.log('\n========== CONTACT TAB ==========');
    await this.captureEvidence('Corporate Contact - before').catch(() => {});
    const page = this.workingPage;
    const ctd = CRM_TEST_DATA.corporate.endToEnd.contactData;
    const addresses = Array.isArray(ctd.addresses) && ctd.addresses.length > 0 ? ctd.addresses : [ctd];
    const phones = Array.isArray(ctd.phones) && ctd.phones.length > 0 ? ctd.phones : [ctd];
    const emails = Array.isArray(ctd.emails) && ctd.emails.length > 0 ? ctd.emails : [ctd];

    await this.refreshAccountFrame('before Contact tab');
    await this.closeUnexpectedPopups(page);
    for (const f of page.frames()) {
      const tab = f.getByText('Contact', { exact: false }).first();
      if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
        const txt = await tab.textContent().catch(() => '');
        if (txt && txt.trim().length < 15 && txt.toLowerCase().includes('contact')) { await tab.click(); console.log('\u2713 Clicked Contact tab'); break; }
      }
    }
    await page.waitForTimeout(this.timeouts.medium);
    for (const f of page.frames()) { const t = f.getByText('Address', { exact: true }).first(); if (await t.isVisible({ timeout: 3000 }).catch(() => false)) { await t.click(); console.log('\u2713 Clicked Address sub-tab'); break; } }
    await page.waitForTimeout(this.timeouts.medium);
    await this.closeUnexpectedPopups(page);

    for (const addr of addresses) { if (addr.addressType || addr.addressLine1) await this.addAddress(addr); }

    // Phone and E-Mail
    for (const f of page.frames()) { const t = f.getByText('Phone and E-Mail', { exact: false }).first(); if (await t.isVisible({ timeout: 5000 }).catch(() => false)) { await t.click(); console.log('\u2713 Clicked Phone and E-Mail sub-tab'); break; } }
    await page.waitForTimeout(this.timeouts.medium);

    let phoneFrame: any = null;
    for (const f of page.frames()) { if (await f.evaluate(() => Array.from(document.querySelectorAll('input, select')).some(el => (el as HTMLInputElement).name.toLowerCase().includes('phone') || (el as HTMLInputElement).name.toLowerCase().includes('country_code'))).catch(() => false)) { phoneFrame = f; break; } }
    if (phoneFrame) {
      // Set preferred types from the CRM sheet before adding phone/email records.
      if (ctd.preferredContactNoType) {
        await this.setSelect(phoneFrame, ['CorporateBO.PhoneEmail.PhoneEmailType'], ctd.preferredContactNoType, 'Preferred Contact No. Type').catch(() => {});
      }
      if (ctd.preferredEmailIdType) {
        await this.setSelect(phoneFrame, ['CorporateBO.PhoneEmail.PhoneEmailType1'], ctd.preferredEmailIdType, 'Preferred E-Mail ID Type').catch(() => {});
      }

      for (const phone of phones) {
        if (phone.phoneType || phone.phoneNumber) await this.addPhoneEmailRecord(phone, 'Phone');
      }
      for (const email of emails) {
        if (email.emailType || email.email) await this.addPhoneEmailRecord(email, 'Email');
      }
      await this.dumpFrameHtml(phoneFrame, 'contact-phone-fields');
    }
    await page.waitForTimeout(this.timeouts.medium);
    await this.dumpFrameHtml(this.accountFrame || page, 'contact-main-before-save');
    await this.fillSectionByMeta(this.accountFrame, 'contactData', CRM_TEST_DATA.corporate.endToEnd.contactData, CRM_TEST_DATA.corporate.endToEnd._meta).catch(() => {});

    // Persist the phone/email records before moving to the next sub-tab.
    const contactSave = await this.findSectionButton(this.accountFrame || page, ['Phone and E-Mail', 'Phone', 'E-Mail', 'Contact'], ['Save', 'Update'])
      || await this.findVisibleButton(this.accountFrame || page, 'Save');
    if (contactSave) {
      try { await contactSave.click(); } catch (e) { console.log('  ⚠ Contact save click skipped: ' + (e as Error).message?.substring(0, 80)); }
      await page.waitForTimeout(this.timeouts.short3).catch(() => {});
      await this.closeUnexpectedPopups(page);
    }

    await this.captureEvidence('Corporate Contact complete');
  }

  private async addPhoneEmailRecord(data: any, type: 'Phone' | 'Email'): Promise<void> {
    const page = this.workingPage;
    let phoneFrame: any = null;
    for (const f of page.frames()) {
      if (await f.evaluate(() => !!document.querySelector('input[name="ADD_PHONE_EMAIL"], input[value="Add Phone and E-mail"]')).catch(() => false)) { phoneFrame = f; break; }
    }
    if (!phoneFrame) { console.log(`⚠ Add Phone and E-mail button not found for ${type}`); return; }
    const addBtn = phoneFrame.locator('input[name="ADD_PHONE_EMAIL"], input[value="Add Phone and E-mail"]').first();
    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) { console.log(`⚠ Add Phone and E-mail button not visible for ${type}`); return; }

    const popupPromise = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
    try { await addBtn.click({ timeout: 10000 }); } catch (_) { await addBtn.evaluate((el: HTMLElement) => el.click()).catch(() => {}); }
    const popup = await popupPromise;
    if (!popup) { console.log(`⚠ No ${type} popup opened`); return; }

    popup.on('dialog', async (d) => { this.lastDialogMessages.push(d.message()); await d.accept().catch(() => {}); });
    await this.waitForPopupReady(popup, `${type} popup`);
    let pt = await this.findPopupTarget(popup);
    await this.captureEvidence(`${type} popup opened`, undefined, popup).catch(() => {});
    await this.dumpFrameHtml(pt, `phone-email-popup-initial-${type.toLowerCase()}`);

    const desiredValue = type === 'Phone' ? 'PHONE' : 'EMAIL';

    // The popup's Phone/Email select submits the form and reloads the popup, so we must wait for the reload.
    const hasModeSelect = await pt.evaluate(() => !!document.querySelector('select[name="CorporateBO.PhoneEmail.PhoneOrEmail"]')).catch(() => false);
    if (hasModeSelect) {
      try {
        const navPromise = popup.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await pt.evaluate((mode: string) => {
          const s = document.querySelector('select[name="CorporateBO.PhoneEmail.PhoneOrEmail"]') as HTMLSelectElement;
          if (s && s.value !== mode) {
            s.disabled = false; s.removeAttribute('readonly'); s.value = mode;
            s.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, desiredValue).catch(() => {});
        await navPromise;
        await popup.waitForTimeout(2000);
        pt = await this.findPopupTarget(popup);
        await this.dumpFrameHtml(pt, `phone-email-popup-reloaded-${type.toLowerCase()}`);
      } catch (e: any) {
        console.log(`⚠ ${type} popup mode selection failed: ${e.message || e}`);
      }
    }

    await this.listVisibleFields(pt, `${type} popup fields after mode selection`).catch(() => []);

    if (type === 'Phone') {
      const phoneTypeSelect = pt.locator('select[name="CorporateBO.PhoneEmail.PhoneEmailType"]').first();
      if (await phoneTypeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await phoneTypeSelect.selectOption({ label: data.phoneType || 'COMMUNICATION PHONE 1' }).catch((e: any) => { console.log(`⚠ Could not select phone type: ${e.message || e}`); });
      }
      await pt.locator('input[name="CorporateBO.PhoneEmail.PhoneNo.cntrycode"]').first().fill(data.countryCode || '').catch(() => {});
      await pt.locator('input[name="CorporateBO.PhoneEmail.PhoneNo.areacode"]').first().fill(data.areaCode || '').catch(() => {});
      await pt.locator('input[name="CorporateBO.PhoneEmail.PhoneNo.localcode"]').first().fill(data.phoneNumber || '').catch(() => {});
      console.log(`✓ Phone values filled: +${data.countryCode || ''} ${data.areaCode || ''} ${data.phoneNumber || ''}`);
    } else {
      const emailTypeSelect = pt.locator('select[name="CorporateBO.PhoneEmail.PhoneEmailType1"]').first();
      if (await emailTypeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await emailTypeSelect.selectOption({ label: data.emailType || 'COMMUNICATION' }).catch((e: any) => { console.log(`⚠ Could not select email type: ${e.message || e}`); });
      }
      await pt.locator('input[name="CorporateBO.PhoneEmail.Email"]').first().fill(data.email || '').catch(() => {});
      console.log(`✓ Email value filled: ${data.email || ''}`);
    }
    await this.captureEvidence(`${type} popup filled`, undefined, popup).catch(() => {});

    await this.captureEvidence(`${type} popup before save`, undefined, popup).catch(() => {});
    const saveBtn = pt.locator('input[type="button"][value="Save"], input[type="submit"][value="Save"], input[name="Save"]').first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      try {
        await Promise.all([
          popup.waitForEvent('close', { timeout: 10000 }).then(() => true).catch(() => false),
          saveBtn.click()
        ]);
      } catch (_) {
        await this.safeClosePopup(popup, 5000);
      }
    } else {
      console.log('⚠ Save button not visible in Phone/Email popup');
      await this.safeClosePopup(popup, 5000);
    }
    await this.captureEvidence(`${type} popup after save`, undefined, popup).catch(() => {});
    await page.waitForTimeout(this.timeouts.short);
    await this.closeUnexpectedPopups(page);
  }

  private async addAddress(addr: any): Promise<void> {
    const page = this.workingPage;
    let addrAdded = false;
    for (const f of page.frames()) {
      let addBtn = await this.findSectionButton(f, ['Address', 'Mailing', 'Contact'], ['Add', 'Add Address', 'Add Address Details', 'Add Mailing Address'])
        || await this.findVisibleButton(f, 'Add Address Details');
      if (addBtn) {
        await this.closeUnexpectedPopups(page);
        const pp = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
        await addBtn.click();
        const addrPopup = await pp;
        if (addrPopup && !addrPopup.isClosed()) {
          addrPopup.on('dialog', async (d) => { this.lastDialogMessages.push(d.message()); await d.accept().catch(() => {}); });
          await this.waitForPopupReady(addrPopup, 'Address popup');
          const at = await this.findPopupTarget(addrPopup);
          await this.captureEvidence('Address popup opened', undefined, addrPopup).catch(() => {});
          // Address Category from workbook (e.g. Mailing)
          await at.evaluate((addressType: string) => {
            const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
            const s = document.querySelector('select[name="CorporateBO.Address.addressCategory"]') as HTMLSelectElement;
            if (s && addressType) { for (const o of Array.from(s.options)) { if (o.text.trim().toUpperCase().includes(addressType.toUpperCase())) { s.value = o.value; fire(s); break; } } }
          }, addr.addressType || 'Mailing').catch(() => {});
          await addrPopup.waitForTimeout(3000).catch(() => {});
          await at.evaluate((data: any) => {
            const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
            const setExact = (name: string, val: string) => { const el = document.querySelector(`input[name="${name}"]`) as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = val; fire(el); } };
            const rawAddr = String(data.addressLine1 || '');
            const m = rawAddr.match(/^(\d+)\b/);
            const streetNo = data.streetNo || data.houseNo || (m ? m[1] : '');
            const streetName = data.streetName || (m ? rawAddr.replace(/^\d+\s*/, '') : rawAddr);
            const houseNo = data.houseNo || streetNo;
            setExact('CorporateBO.Address.street_no', streetNo);
            setExact('CorporateBO.Address.street_name', streetName);
            setExact('CorporateBO.Address.house_no', houseNo);
            setExact('CorporateBO.Address.premise_name', data.premiseName);
            setExact('CorporateBO.Address.building_level', data.buildingLevel);
            setExact('CorporateBO.Address.suburb', data.suburb);
            setExact('CorporateBO.Address.locality_name', data.localityName);
            setExact('CorporateBO.Address.town', data.city);
            setExact('CorporateBO.Address.zip', data.zip);
            setExact('3_CorporateBO.Address.Start_Date', data.startDate);
            setExact('CorporateBO.Address.FreeTextLabel', data.addressLabel);
            setExact('CorporateBO.Address.address_Line1', data.addressLine1);
          }, addr).catch(() => {});
          console.log('  \u2713 Address fields filled');
          await this.captureEvidence('Address popup filled', undefined, addrPopup).catch(() => {});
          if (addr.country) await this.selectAddrLov(addrPopup, at, 'btnone_CorporateBO.Address.country', addr.country, 'Country');
          if (addr.city) await this.selectAddrLov(addrPopup, at, 'btnone_CorporateBO.Address.city', addr.city, 'City');
          if (addr.state) await this.selectAddrLov(addrPopup, at, 'btnone_CorporateBO.Address.state', addr.state, 'State');
          const findAddrSave = async (t: number) => {
            for (const pf of addrPopup.frames()) {
              for (const bv of ['Save', 'OK', 'Submit']) {
                const b = pf.locator(`input[value="${bv}"]`).first();
                if (await b.isVisible({ timeout: t }).catch(() => false)) return b;
              }
            }
            return null;
          };
          let addrSaveBtn = await findAddrSave(3000);
          await this.captureEvidence('Address popup before save', undefined, addrPopup).catch(() => {});
          if (addrSaveBtn) { await addrSaveBtn.click(); console.log('  \u2713 Clicked Save in address popup'); }
          await addrPopup.waitForTimeout(3000).catch(() => {});
          if (!addrPopup.isClosed()) {
            addrSaveBtn = await findAddrSave(2000);
            if (addrSaveBtn) await addrSaveBtn.click();
          }
          try { await addrPopup.waitForEvent('close', { timeout: 5000 }); } catch (_) {}
          await this.safeClosePopup(addrPopup, 5000);
          await this.captureEvidence('Address popup after save', undefined, addrPopup).catch(() => {});
          addrAdded = true; console.log('\u2713 Address added');
        }
        break;
      }
    }
    if (!addrAdded) console.log('\u26a0 Could not add address');
  }

  // ==================== FILL ID DOCUMENT TAB ====================
  async fillIdDocumentTab(): Promise<void> {
    console.log('\n========== ID DOCUMENT TAB ==========');
    await this.captureEvidence('Corporate ID Document - before').catch(() => {});
    const page = this.workingPage;
    const docs = CRM_TEST_DATA.corporate.endToEnd.documents || [];
    await this.closeUnexpectedPopups(page);
    let idDocTabClicked = false;
    for (const tabText of ['Identification Document Details', 'Document', 'ID Document', 'Identification']) {
      if (idDocTabClicked) break;
      for (const f of page.frames()) {
        const t = f.getByText(tabText, { exact: false }).first();
        if (await t.isVisible({ timeout: 3000 }).catch(() => false)) {
          const txt = await t.textContent().catch(() => '');
          if (txt && (txt.toLowerCase().includes('document') || txt.toLowerCase().includes('identification'))) {
            await t.click(); idDocTabClicked = true; console.log('\u2713 Clicked ID Document tab'); break;
          }
        }
      }
    }
    if (!idDocTabClicked) {
      for (const f of page.frames()) {
        const clicked = await f.evaluate(() => {
          for (const tab of document.querySelectorAll('a, span, td, div')) {
            const text = (tab as HTMLElement).innerText?.trim() || '';
            if (text.includes('Document') && text.length < 50 && (tab as HTMLElement).offsetWidth > 0) { (tab as HTMLElement).click(); return text; }
          }
          return '';
        }).catch(() => '');
        if (clicked) { idDocTabClicked = true; break; }
      }
    }
    await page.waitForTimeout(this.timeouts.medium);
    await this.closeUnexpectedPopups(page);

    for (const docData of docs) {
      let idAdded = false;
      for (const f of page.frames()) {
        let addBtn = await this.findSectionButton(f, ['Identification Document', 'ID Document', 'Document'], ['Add', 'Add Document', 'Add Identification Document Details', 'Add ID Document'])
          || await this.findVisibleButton(f, 'Add Identification Document Details');
        if (addBtn) {
          const pp = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
          await addBtn.click();
          const idPopup = await pp;
          if (idPopup) {
            idPopup.on('dialog', async (d) => { this.lastDialogMessages.push(d.message()); await d.accept().catch(() => {}); });
            await this.waitForPopupReady(idPopup, 'ID Document popup');
            const idt = await this.findPopupTarget(idPopup);
            await this.captureEvidence('ID Document popup opened', undefined, idPopup).catch(() => {});
            // Select Document Type
            const docTypeSelect = idt.locator('select[name="EntityDocumentBO.DocTypeCode"]');
            if (await docTypeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
              const docTypeOptions = await this.getSelectOptions(idt, 'select[name="EntityDocumentBO.DocTypeCode"]');
              const targetType = docTypeOptions.find((o: string) => o === docData.documentType) || docTypeOptions.find((o: string) => o.includes(docData.documentType)) || docTypeOptions.find((o: string) => o.includes(docData.documentTypeDesc || ''));
              if (targetType) {
                await docTypeSelect.selectOption({ label: targetType });
                console.log('  \u2713 Set Document Type: ' + targetType);
                await docTypeSelect.evaluate((el: HTMLSelectElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); });
                for (let i = 0; i < 5; i++) {
                  await idPopup.waitForTimeout(2000);
                  const docCodeOpts = await this.getSelectOptions(idt, 'select[name="EntityDocumentBO.DocCode"]');
                  if (docCodeOpts.some((o: string) => o !== '--Select--' && o.length > 0)) break;
                }
              }
            }
            // Select Document Code
            const docCodeSelect = idt.locator('select[name="EntityDocumentBO.DocCode"]');
            if (await docCodeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
              const docCodeOptions = await this.getSelectOptions(idt, 'select[name="EntityDocumentBO.DocCode"]');
              const targetCode = docCodeOptions.find((o: string) => o.includes(docData.documentCode)) || docCodeOptions.find((o: string) => o.includes(docData.documentCodeDescription || ''));
              if (targetCode) {
                await docCodeSelect.selectOption({ label: targetCode });
                console.log('  \u2713 Set Document Code: ' + targetCode);
                await docCodeSelect.evaluate((el: HTMLSelectElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); });
              }
            }
            // Reference Number
            const refInput = idt.locator('input[name="EntityDocumentBO.ReferenceNumber"]');
            if (await refInput.isVisible({ timeout: 2000 }).catch(() => false)) {
              await refInput.fill(docData.uniqueId);
              console.log('  \u2713 Set Reference Number: ' + docData.uniqueId);
            }
            // Issue/Expiry dates
            await idt.evaluate((data: { issueDate: string; expiryDate: string }) => {
              const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
              ['3_EntityDocumentBO.DocIssueDate', 'EntityDocumentBO.DocIssueDate'].forEach(n => {
                const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement;
                if (el) { el.removeAttribute('readonly'); el.value = data.issueDate; fire(el); }
              });
              if (data.expiryDate) {
                ['3_EntityDocumentBO.DocExpiryDate', 'EntityDocumentBO.DocExpiryDate'].forEach(n => {
                  const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement;
                  if (el) { el.removeAttribute('readonly'); el.value = data.expiryDate; fire(el); }
                });
              }
            }, { issueDate: docData.issueDate, expiryDate: docData.expiryDate }).catch(() => {});
            // LOV for Place of Issue and Country of Issue
            if (docData.placeOfIssue) await this.selectDocLovCorp(idPopup, idt, 'btnone_EntityDocumentBO.PlaceOfIssue', docData.placeOfIssue, 'Place of Issue');
            if (docData.countryOfIssue) {
              const countryDisplay = docData.countryOfIssue === 'BM' ? 'BERMUDA' : (docData.countryOfIssueDisplay || docData.countryOfIssue);
              await this.selectDocLovCorp(idPopup, idt, 'btnone_EntityDocumentBO.CountryOfIssue', countryDisplay, 'Country of Issue');
            }
            await this.captureEvidence('ID Document popup filled', undefined, idPopup).catch(() => {});
            // Save
            const findIdSave = async (t: number) => {
              for (const pf of idPopup.frames()) {
                for (const bv of ['Save', 'OK', 'Submit']) {
                  const b = pf.locator(`input[value="${bv}"]`).first();
                  if (await b.isVisible({ timeout: t }).catch(() => false)) return b;
                }
              }
              return null;
            };
            const idDocSaveBtn = await findIdSave(3000);
            await this.captureEvidence('ID Document popup before save', undefined, idPopup).catch(() => {});
            if (idDocSaveBtn) { await idDocSaveBtn.click(); console.log('  \u2713 Clicked Save in ID Document popup'); }
            try { await idPopup.waitForEvent('close', { timeout: 5000 }); } catch (_) {}
            await this.safeClosePopup(idPopup, 5000);
            await this.captureEvidence('ID Document popup after save', undefined, idPopup).catch(() => {});
            idAdded = true; console.log('\u2713 ID Document added');
          }
          break;
        }
      }
      if (!idAdded) console.log('\u26a0 Could not add ID Document');
    }
    await page.waitForTimeout(this.timeouts.short3);
    await this.closeUnexpectedPopups(page);
    await this.captureEvidence('Corporate ID Document complete').catch(() => {});
  }

  private async selectDocLovCorp(idPopup: Page, idt: any, btnName: string, searchValue: string, label: string): Promise<void> {
    if (idPopup.isClosed()) return;
    const btn = idt.locator(`input[name="${btnName}"]`);
    if (!(await btn.isVisible({ timeout: 2000 }).catch(() => false))) return;
    const lovPromise = idPopup.context().waitForEvent('page', { timeout: this.timeouts.long15 }).catch(() => null);
    await btn.evaluate((el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    const lov = await lovPromise;
    if (!lov) return;
    lov.on('dialog', async (d: Dialog) => { await d.accept().catch(() => {}); });
    await this.waitForPopupReady(lov, label + ' LOV');
    if (lov.isClosed()) return;
    const DOC_LOV_HEADERS = new Set(['Location Value', 'Location Code', 'Location List', 'Code', 'No Records to Display', 'Simple Lookup', 'Country Code', 'Country List']);
    const collectDataRows = async (): Promise<Array<{text: string}>> => {
      let best: Array<{text: string}> = [];
      if (lov.isClosed()) return best;
      for (const lf of lov.frames()) {
        const rows = await lf.evaluate(() => {
          const r: Array<{text: string}> = [];
          document.querySelectorAll('table tr').forEach(tr => { const tds = tr.querySelectorAll('td'); if (tds.length < 2) return; const t = tds[0].textContent?.trim() || ''; if (t && t.length >= 2 && t.length <= 50 && !/^Page|^of \d|^\d+$/.test(t)) r.push({ text: t }); });
          return r;
        }).catch(() => []);
        const data = rows.filter(r => !DOC_LOV_HEADERS.has(r.text));
        if (data.length > best.length) best = data;
      }
      return best;
    };
    const trySelect = async (sv: string): Promise<boolean> => {
      if (lov.isClosed() || !sv) return false;
      for (const lf of lov.frames()) {
        const tdCount = await lf.evaluate(() => document.querySelectorAll('td').length).catch(() => 0);
        if (tdCount < 3) continue;
        try { await Promise.race([lf.getByText(sv, { exact: true }).first().dblclick({ timeout: this.timeouts.medium }), lov.waitForEvent('close', { timeout: this.timeouts.long })]); return true; } catch (_) { if (lov.isClosed()) return true; }
        try { await Promise.race([lf.locator('td', { hasText: new RegExp(sv, 'i') }).first().dblclick({ timeout: this.timeouts.medium }), lov.waitForEvent('close', { timeout: this.timeouts.long })]); return true; } catch (_) { if (lov.isClosed()) return true; }
      }
      return false;
    };
    // Fill search
    for (const lf of lov.frames()) { const inps = await lf.locator('input[type="text"]').all().catch(() => []); for (const inp of inps) { if (await inp.isVisible().catch(() => false)) { await inp.fill(searchValue); break; } } const sub = lf.locator('input[value="Submit"]').first(); if (await sub.isVisible({ timeout: 2000 }).catch(() => false)) { await sub.click(); break; } }
    if (!lov.isClosed()) await lov.waitForTimeout(this.timeouts.short).catch(() => {});
    let selected = false;
    const dataRows = await collectDataRows();
    if (dataRows.length > 0) selected = await trySelect(searchValue);
    if (!selected && dataRows.length > 0) selected = await trySelect(dataRows[0].text);
    if (!selected && !lov.isClosed()) {
      for (const lf of lov.frames()) { const inps = await lf.locator('input[type="text"]').all().catch(() => []); for (const inp of inps) { if (await inp.isVisible().catch(() => false)) { await inp.fill(''); break; } } const sub = lf.locator('input[value="Submit"]').first(); if (await sub.isVisible({ timeout: 2000 }).catch(() => false)) { await sub.click(); break; } }
      if (!lov.isClosed()) await lov.waitForTimeout(this.timeouts.short).catch(() => {});
      const allRows = await collectDataRows();
      if (allRows.length > 0) selected = await trySelect(searchValue);
      if (!selected && allRows.length > 0) selected = await trySelect(allRows[0].text);
    }
    try { await lov.waitForEvent('close', { timeout: 5000 }); } catch (_) {}
    await this.safeClosePopup(lov, 5000);
  }

  // ==================== FILL CURRENCY TAB ====================
  async fillCurrencyTab(): Promise<void> {
    console.log('\n========== CURRENCY TAB ==========');
    await this.captureEvidence('Corporate Currency - before').catch(() => {});
    const page = this.workingPage;
    const ccyList = CRM_TEST_DATA.corporate.endToEnd.currencies || [];
    await this.closeUnexpectedPopups(page);
    for (const f of page.frames()) {
      const t = f.getByText('Currency', { exact: false }).first();
      if (await t.isVisible({ timeout: 5000 }).catch(() => false)) {
        const txt = await t.textContent().catch(() => '');
        if (txt && txt.trim().length < 15 && txt.toLowerCase().includes('currency')) { await t.click(); console.log('\u2713 Clicked Currency tab'); break; }
      }
    }
    await page.waitForTimeout(this.timeouts.medium);
    await this.closeUnexpectedPopups(page);

    let ccyAdded = false;
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
      if (!ccyData.ccy) continue;
      if (ccyPopup && ccyPopup.isClosed()) { ccyPopup = null; ccyTarget = null; }
      let ccyAddedThis = false;
      const searchFrames: any[] = [...page.frames()];
      if (ccyPopup && !ccyPopup.isClosed()) {
        searchFrames.unshift(ccyPopup);
        for (const cf of ccyPopup.frames()) { if (!searchFrames.includes(cf)) searchFrames.unshift(cf); }
      }
      for (const f of searchFrames) {
        let addBtn = await this.findSectionButton(f, ['Currency', 'CCY'], ['Add', 'Add Currency', 'Add CCY', 'Add Currency Details'])
          || await this.findSectionButton(f, ['Currency', 'CCY'], ['Add'])
          || await this.findVisibleButton(f, 'Add Currency');
        if (addBtn) {
          const pp = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
          await addBtn.click();
          ccyPopup = (await pp) || ccyPopup;
          if (ccyPopup) {
            ccyPopup.on('dialog', async (d) => { this.lastDialogMessages.push(d.message()); await d.accept().catch(() => {}); });
            await this.waitForPopupReady(ccyPopup, 'Currency popup');
            ccyTarget = await this.findPopupTarget(ccyPopup);
            await this.captureEvidence('Currency popup opened', undefined, ccyPopup).catch(() => {});
            await evalCcy((data: any) => {
              const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
              const setF = (p: string, v: string) => { for (const i of Array.from(document.querySelectorAll('input'))) { if ((i as HTMLInputElement).name.toLowerCase().includes(p) && (i as HTMLInputElement).type !== 'hidden') { (i as HTMLInputElement).removeAttribute('readonly'); (i as HTMLInputElement).value = v; fire(i as HTMLElement); return; } } };
              setF('credit_discount', data.creditDiscountPcnt); setF('debit_discount', data.debitDiscountPcnt);
              setF('withholding_tax_pcnt', data.withholdingTaxPcnt); setF('withholdingtax', data.withholdingTaxPcnt);
              setF('withholding_tax_floor', data.withholdingTaxFloorLimit); setF('floor_limit', data.withholdingTaxFloorLimit);
              setF('preferential_expiry', data.preferentialExpiryDate); setF('expiry_date', data.preferentialExpiryDate);
            }, ccyData).catch(() => {});
            await this.captureEvidence('Currency popup filled', undefined, ccyPopup).catch(() => {});
            // CCY LOV
            for (const pf of ccyPopup.frames()) {
              const lb = pf.locator('input[name*="btn"][name*="CCY"], input[name*="btn"][name*="ccy"]').first();
              if (await lb.isVisible({ timeout: 3000 }).catch(() => false)) {
                const lpp = ccyPopup.context().waitForEvent('page', { timeout: this.timeouts.long15 }).catch(() => null);
                await lb.evaluate((el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).catch(() => {});
                const lovP = await lpp;
                if (lovP && !lovP.isClosed()) {
                  await this.waitForPopupReady(lovP, 'CCY LOV');
                  for (const lf of lovP.frames()) {
                    const si = lf.locator('input[type="text"]').first();
                    if (await si.isVisible({ timeout: 3000 }).catch(() => false)) {
                      await si.fill(ccyData.ccy).catch(() => {});
                      const sub = lf.locator('input[value="Submit"]').first();
                      if (await sub.isVisible({ timeout: 3000 }).catch(() => false)) await sub.click().catch(() => {});
                      await lovP.waitForTimeout(this.timeouts.short).catch(() => {});
                      try { await Promise.race([lf.getByText(ccyData.ccy, { exact: true }).first().dblclick({ timeout: this.timeouts.medium }), lovP.waitForEvent('close', { timeout: this.timeouts.long })]); } catch (_) {}
                      break;
                    }
                  }
                  await this.safeClosePopup(lovP, 5000);
                }
                break;
              }
            }
            const findCcySave = async (t: number) => {
              if (!ccyPopup) return null;
              for (const pf of ccyPopup.frames()) {
                for (const bv of ['Save', 'OK', 'Submit']) {
                  const b = pf.locator(`input[value="${bv}"]`).first();
                  if (await b.isVisible({ timeout: t }).catch(() => false)) return b;
                }
              }
              return null;
            };
            const ccyDlgHandler = async (d: Dialog) => { await d.accept().catch(() => {}); };
            ccyPopup.on('dialog', ccyDlgHandler);
            const ccySaveBtn = await findCcySave(3000);
            await this.captureEvidence('Currency popup before save', undefined, ccyPopup).catch(() => {});
            if (ccySaveBtn) { await ccySaveBtn.click(); console.log('\u2713 Clicked Save in Currency popup'); }
            try { await ccyPopup.waitForEvent('close', { timeout: 5000 }); ccyPopup = null; ccyTarget = null; } catch (_) {}
            try { ccyPopup?.removeListener('dialog', ccyDlgHandler); } catch (_) {}
            await this.captureEvidence('Currency popup after save', undefined, ccyPopup).catch(() => {});
            ccyAdded = true; ccyAddedThis = true; console.log('\u2713 Currency added');
          }
          break;
        }
      }
      if (!ccyAddedThis) { console.log('\u26a0 Could not add Currency'); break; }
    }
    if (!ccyAdded) console.log('\u26a0 Could not add Currency');
    await page.waitForTimeout(this.timeouts.short3);
    await this.closeUnexpectedPopups(page);
    await this.captureEvidence('Corporate Currency complete');
  }

  // ==================== FILL GENERAL TAB AND SUB-TABS ====================
  async fillGeneralTab(): Promise<void> {
    console.log('\n========== GENERAL TAB ==========');
    await this.captureEvidence('Corporate General tab - before').catch(() => {});
    const page = this.workingPage;
    await this.closeUnexpectedPopups(page);
    // Make sure we are on the main Customer form frame before touching the General tab.
    await this.reacquireAccountFrame('before General', undefined, true).catch(() => {});
    await this.navigateToSectionTab(['General', 'General Details']);

    await this.fillBasicInfo();
    await this.fillIdDocumentTab();
    await this.fillContactTab();

    // Group Details and Core Interface Details are explicitly skipped for now because
    // the current CRM workflow does not require them and visiting Core Interface
    // causes serverside validation errors (e.g. FreeCode2Desc invalid).
    // Future Excel columns can be re-enabled here once the exact tab controls are mapped.

    await this.fillCurrencyTab();
    await this.fillGeneralSubTab(['Tax Certification Details', 'Tax Certification'], 'Tax Certification Details');
    await this.fillTaxCertificationSection(CRM_TEST_DATA.corporate.endToEnd.taxCertificationData);
    console.log('\u2713 General tab and sub-tabs processed');
    await this.captureEvidence('Corporate General tab complete');
  }

  private async fillGeneralSubTab(tabLabels: string[], label: string): Promise<void> {
    console.log('\n--- ' + label + ' ---');
    const page = this.workingPage;
    try {
      await this.navigateToSectionTab(tabLabels);
    } catch (e) {
      console.log('  \u26a0 Could not process ' + label + ': ' + (e as Error).message?.substring(0, 100));
    }
    await page.waitForTimeout(this.timeouts.short).catch(() => {});
  }

  // ==================== FILL RELATIONSHIP TAB ====================
  async fillRelationshipTab(): Promise<void> {
    console.log('\n========== RELATIONSHIP TAB ==========');
    await this.captureEvidence('Corporate Relationship - before').catch(() => {});
    const page = this.workingPage;
    const cd = CRM_TEST_DATA.corporate.endToEnd.corporateData;
    await this.closeUnexpectedPopups(page);

    // Reacquire the main Customer form first so the Relationship tab is clicked inside the Customer module.
    await this.reacquireAccountFrame('before Relationship', undefined, true).catch(() => {});
    const relFrame = await this.navigateToSectionTab(['Relationship']);
    // Relationship fields live in the main Corporate form, not in a sub-popup.
    await this.reacquireAccountFrame('Relationship', undefined, true).catch(() => {});
    const f = this.mainAccountFrame || this.accountFrame || relFrame || page;

    // Wait for Relationship section fields to render inside the Customer form frame.
    await page.waitForTimeout(this.timeouts.short3);

    // Helper to fill relationship fields in whichever frame is active (main form or popup).
    const fillRelFields = async (target: any) => {
      if (cd.relationshipType) {
        const relType = String(cd.relationshipType);
        let relSet = await this.setGenericFieldByLabel(target, 'Relationship Type', relType, 'select');
        if (!relSet) {
          relSet = await this.setSelect(target, ['CorporateBO.relationship_Type', 'CorporateModBO.relationship_Type', 'RelationshipBO.relationship_Type', 'CorporateBO.relationshipType'], relType, 'Relationship Type');
        }
        if (!relSet) {
          relSet = await this.setLovByLabel(target, 'Relationship Type', relType, relType);
        }
        if (relSet) {
          console.log('\u2713 Relationship Type = "' + relType + '"');
        } else {
          console.log('\u26a0 Relationship Type not set for "' + relType + '"');
        }
      }
      if (cd.relationshipStartDate) {
        await this.setField(target, ['CorporateBO.relationship_StartDate', '3_CorporateBO.relationship_StartDate'], cd.relationshipStartDate, 'Relationship Start Date');
      }
      if (cd.createdBy) {
        await this.setField(target, ['CorporateBO.relationship_CreatedBy', 'CorporateModBO.relationship_CreatedBy'], cd.createdBy, 'Relationship Created By');
      }
      if (cd.primaryRelationshipManagerId) {
        await this.setField(target, ['CorporateBO.PrimaryRMLogin_ID', 'CorporateModBO.PrimaryRMLogin_ID'], cd.primaryRelationshipManagerId, 'Primary RM');
      }
      if ((cd as any).secondaryRelationshipManagerId) {
        await this.setField(target, ['CorporateBO.SecondaryRMLogin_ID', 'CorporateModBO.SecondaryRMLogin_ID'], (cd as any).secondaryRelationshipManagerId, 'Secondary Relationship Manager');
      }
      if ((cd as any).relationshipLevel) {
        await this.setGenericFieldByLabel(target, 'Relationship Level', (cd as any).relationshipLevel, 'select').catch(() => {});
      }
    };

    // Some Finacle builds require clicking an Add/Update button to open a relationship popup.
    const addRelBtn = await this.findVisibleButton(f, 'Add Relationship') || await this.findButtonByKeywords(f, ['Add Relationship', 'Add Relation', 'Update Relationship']);
    if (addRelBtn) {
      console.log('\u2713 Clicking Add Relationship to open relationship popup');
      const popupPromise = page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null);
      await addRelBtn.click();
      let relPopup = await popupPromise;
      if (!relPopup) {
        // Relationship may open inside the same page as a new frame
        await page.waitForTimeout(this.timeouts.short3);
        for (const fr of page.frames()) {
          const u = fr.url() || '';
          if (u.includes('Relationship') || u.includes('Rel')) { relPopup = fr as any; break; }
        }
      }
      if (relPopup && !(relPopup as any).isClosed()) {
        if (typeof (relPopup as any).waitForLoadState === 'function') await (relPopup as any).waitForLoadState('domcontentloaded').catch(() => {});
        const pf = typeof (relPopup as any).frames === 'function' ? ((relPopup as any).frames().length ? (relPopup as any).frames()[0] : relPopup) : relPopup;
        await this.waitForPopupReady(pf, 'Relationship Details').catch(() => {});
        await fillRelFields(pf || relPopup);
        const saveBtn = await this.findVisibleButton(pf || relPopup, 'Save') || await this.findButtonByKeywords(pf || relPopup, ['Save', 'OK', 'Submit']);
        if (saveBtn) {
          await saveBtn.click();
          console.log('\u2713 Clicked Save in Relationship Details popup');
          await page.waitForTimeout(this.timeouts.short3);
          await this.closeUnexpectedPopups(page);
          if (typeof (relPopup as any).isClosed === 'function' && !(relPopup as any).isClosed()) {
            await (relPopup as any).waitForEvent('close', { timeout: 5000 }).catch(() => {});
            await this.safeClosePopup(relPopup, 3000);
          }
        }
      } else {
        // No popup opened; fill directly in the main form and commit
        await fillRelFields(f);
        await addRelBtn.click();
        await page.waitForTimeout(this.timeouts.short3);
        await this.closeUnexpectedPopups(page);
      }
    } else {
      await fillRelFields(f);
    }

    await page.waitForTimeout(this.timeouts.short3);
    await this.captureEvidence('Corporate Relationship complete');
  }

  // ==================== FILL PREFERENCES TAB ====================
  async fillPreferencesTab(): Promise<void> {
    console.log('\n========== PREFERENCES TAB ==========');
    await this.captureEvidence('Corporate Preferences - before').catch(() => {});
    const page = this.workingPage;
    const cd = CRM_TEST_DATA.corporate.endToEnd.corporateData;
    const dd = CRM_TEST_DATA.corporate.endToEnd.demographicData || {};
    const rbd = CRM_TEST_DATA.corporate.endToEnd.riskBaselData || {};
    await this.closeUnexpectedPopups(page);

    // Reacquire the main Customer form so Preferences sub-tabs are clicked inside the Customer module.
    await this.reacquireAccountFrame('before Preferences', undefined, true).catch(() => {});
    const prefFrame = await this.navigateToSectionTab(['Preferences']);
    await this.reacquireAccountFrame('Preferences', undefined, true).catch(() => {});
    const f = this.mainAccountFrame || this.accountFrame || prefFrame || page;

    // Basic Preference
    await this.navigateToSectionTab(['Basic Preference', 'Basic Preference Details', 'Basic']);
    const basicFrame = this.mainAccountFrame || this.accountFrame || page;
    const preferredChannel = cd.preferredCommunicationChannel || rbd.communicationIndemnity || '';
    if (preferredChannel) {
      await this.setGenericFieldByLabel(basicFrame, 'Preferred Communication Channel', preferredChannel, 'select');
      // Move the preferred channel from Available Channels to Access Channels
      await this.setDualListByLabel(basicFrame, 'Available Channels', preferredChannel, 'Access Channels').catch(() => {});
    }
    await this.fillSectionByMeta(basicFrame, 'demographicData', dd, CRM_TEST_DATA.corporate.endToEnd._meta).catch(() => {});

    // Bank Preference
    await this.navigateToSectionTab(['Bank Preference', 'Bank Preference Details', 'Bank']);
    const bankFrame = this.accountFrame || page;
    if (cd.defaultChannelForAlerts) {
      await this.setGenericFieldByLabel(bankFrame, 'Default Channel for Alerts', cd.defaultChannelForAlerts, 'select');
    }

    // Customer Preference
    await this.navigateToSectionTab(['Customer Preference', 'Customer Preference Details', 'Customer']);
    const custFrame = this.accountFrame || page;
    await this.fillSectionByMeta(custFrame, 'demographicData', dd, CRM_TEST_DATA.corporate.endToEnd._meta).catch(() => {});
    await this.fillSectionByMeta(custFrame, 'psychographicData', CRM_TEST_DATA.corporate.endToEnd.psychographicData, CRM_TEST_DATA.corporate.endToEnd._meta).catch(() => {});

    await page.waitForTimeout(this.timeouts.short3);
    await this.captureEvidence('Corporate Preferences complete');
  }

  // ==================== FILL FINANCIAL TAB ====================
  async fillFinancialTab(): Promise<void> {
    console.log('\n========== FINANCIAL TAB ==========');
    await this.captureEvidence('Corporate Financial - before').catch(() => {});
    const page = this.workingPage;
    await this.closeUnexpectedPopups(page);

    // Reacquire the main Customer form so the Financial tab is clicked inside the Customer module.
    await this.reacquireAccountFrame('before Financial', undefined, true).catch(() => {});
    await this.navigateToSectionTab(['Financial', 'Financial Details']);
    await this.reacquireAccountFrame('Financial', undefined, true).catch(() => {});

    // Corporate Finance and Other Bank Details are driven from the workbook.
    // Defer saving to final Submit so earlier Basic Info values are not overwritten.
    await this.fillAdditionalSections([
      { name: 'corporateFinanceData', tabLabels: ['Basic Info', 'Financial Basic Info', 'Corporate Finance', 'Financial'], skipSave: true },
      { name: 'otherBankData', tabLabels: ['Other Bank Details', 'Other Bank', 'Banking Details'] }
    ], CRM_TEST_DATA.corporate.endToEnd, CRM_TEST_DATA.corporate.endToEnd._meta);
    await this.captureEvidence('Corporate Financial complete');
  }

  // ==================== PRE-SUBMIT VERIFICATION ====================
  async preSubmitVerification(): Promise<void> {
    console.log('\n=== Pre-Submit: Re-verify mandatory fields ===');
    await this.captureEvidence('Corporate Pre-Submit - before').catch(() => {});
    const page = this.workingPage;

    // Reacquire the main Customer form frame and navigate back to Basic Info.
    await this.reacquireAccountFrame('pre-submit', undefined, true).catch(() => {});
    for (const f of page.frames()) {
      if (f !== this.mainAccountFrame && f !== this.accountFrame) continue;
      const t = f.getByText('General Details', { exact: false }).first();
      if (await t.isVisible({ timeout: 3000 }).catch(() => false)) { await t.click(); break; }
    }
    await page.waitForTimeout(this.timeouts.short3);

    // Re-fill every workbook value from Basic Info before final submission.
    await this.fillBasicInfo(true, 'Corporate Pre-Submit - Basic Info');
    await this.reacquireAccountFrame('pre-submit after fillBasicInfo', undefined, true).catch(() => {});
    await this.closeUnexpectedPopups(page);

    console.log('Pre-Submit verification complete');
    await this.captureEvidence('Corporate Pre-Submit complete');
  }

  // ==================== SUBMIT ====================
  async submitForm(): Promise<string> {
    console.log('\n=== TC_CORP_SUBMIT_001: Click Submit ===');
    await this.captureEvidence('Corporate Submit - before').catch(() => {});
    const page = this.workingPage;
    let cifId = '';

    const extractCifId = (msg: string): string => {
      const patterns = [/CIF\s*(?:ID|Id|id)?\s*[:\s-]*(\d{5,})/i, /(?:entity|customer|record)\s*(?:ID|Id|id)?\s*[:\s-]*(\d{5,})/i, /submitted\s+successfully[^\d]*(\d{5,})/i, /(?:created|saved)\s+(?:with|as)?\s*(?:id)?\s*[:\s-]*(\d{5,})/i, /(\d{5,})/];
      for (const p of patterns) { const m = msg.match(p); if (m) return m[1]; }
      return '';
    };

    const submitDialogMsgs: string[] = [];
    const submitDlgHandler = async (dialog: Dialog) => {
      const msg = dialog.message();
      submitDialogMsgs.push(msg);
      this.lastDialogMessages.push(msg);
      console.log('\ud83d\udce2 Submit dialog: "' + msg.substring(0, 250) + '"');
      try { await dialog.accept(); } catch (_) {}
    };
    page.on('dialog', submitDlgHandler);

    let submitClicked = false;
    for (const f of page.frames()) {
      const hasSubmit = await f.evaluate(() => { const btn = document.querySelector('input[value="Submit"]') as HTMLInputElement; if (btn && btn.offsetWidth > 0) { btn.click(); return true; } return false; }).catch(() => false);
      if (hasSubmit) { submitClicked = true; console.log('\u2713 Clicked Submit'); break; }
    }
    if (!submitClicked) {
      const bf = page.frame({ name: 'buttonFrm' });
      if (bf) {
        await bf.evaluate(() => { for (const b of document.querySelectorAll('input[type="submit"], input[type="button"], button')) { if ((b.getAttribute('value') || '').trim() === 'Submit') { (b as HTMLElement).click(); return; } } }).catch(() => {});
        submitClicked = true;
      }
    }
    if (!page.isClosed()) await page.waitForTimeout(this.timeouts.short3).catch(() => {});

    for (const msg of submitDialogMsgs) { const id = extractCifId(msg); if (id && !cifId) { cifId = id; console.log('\u2713 CIF ID from submit dialog: ' + cifId); } }
    try { page.removeListener('dialog', submitDlgHandler); } catch (_) {}

    // Check for validation errors
    let hasValidationErrors = false;
    for (const f of page.frames()) {
      const errors = await f.evaluate(() => {
        const texts: string[] = [];
        document.querySelectorAll('.error, .errMsg, .validationError, [class*="error"], font[color="red"], span[style*="red"]').forEach(el => {
          const t = (el as HTMLElement).innerText?.trim();
          if (t && t.length > 2 && t.length < 300 && !t.toLowerCase().includes('function ')) texts.push(t);
        });
        return [...new Set(texts)];
      }).catch(() => [] as string[]);
      if (errors.length > 0) { console.log('  \u26a0 Validation errors: ' + errors.join(' | ')); hasValidationErrors = true; }
    }
    // Also check dialog messages for validation errors
    for (const msg of submitDialogMsgs) {
      if (/mandatory|required|invalid|error|please provide/i.test(msg) && !/saved successfully/i.test(msg)) {
        console.log('  \u26a0 Submit dialog indicates validation error: "' + msg.substring(0, 150) + '"');
        hasValidationErrors = true;
      }
    }

    // Poll for CIF ID — reduced to 5 attempts; skip if validation errors detected
    const maxPollAttempts = hasValidationErrors ? 2 : 5;
    for (let attempt = 0; attempt < maxPollAttempts && !cifId; attempt++) {
      if (page.isClosed()) break;
      await page.waitForTimeout(2000).catch(() => {});
      for (const msg of this.lastDialogMessages.slice(-15)) {
        const id = extractCifId(msg);
        if (id && !cifId) cifId = id;
      }
      if (cifId) break;
    }

    // Fallback: check page content
    if (!cifId) {
      for (const f of page.frames()) {
        const pc = await f.evaluate(() => { const text = document.body?.innerText || ''; const m = text.match(/CIF\s*(?:ID)?\s*[:\s-]*(\d{5,})/i); return m ? m[1] : ''; }).catch(() => '');
        if (pc) { cifId = pc; break; }
      }
    }
    if (!cifId) {
      for (const p of page.context().pages()) {
        if (p.isClosed()) continue;
        for (const f of p.frames()) {
          const pc = await f.evaluate(() => { const text = document.body?.innerText || ''; const m = text.match(/CIF\s*(?:ID)?\s*[:\s-]*(\d{5,})/i); return m ? m[1] : ''; }).catch(() => '');
          if (pc) { cifId = pc; break; }
        }
        if (cifId) break;
      }
    }

    this._cifId = cifId;
    if (cifId) console.log('\u2713\u2713 CIF ID CAPTURED: ' + cifId);
    else console.log('\u26a0 CIF ID not captured');
    await this.captureEvidence('Corporate after submit', { cifId });
    return cifId;
  }

  // ==================== PROCESS SELECTION ====================
  async handleProcessSelection(): Promise<void> {
    console.log('\n=== TC_CORP_PS_001: Process Selection popup ===');
    await this.captureEvidence('Corporate Process Selection - before').catch(() => {});
    const page = this.workingPage;
    try {
      let psPopup: Page | null = null;
      const allContextPages = page.context().pages();
      for (const p of allContextPages) {
        if (p === page || p.isClosed()) continue;
        try { const url = p.url(); if (url.includes('CIFProcessSelection') || url.includes('ProcessSelection')) { psPopup = p; break; } } catch (_) {}
      }
      if (!psPopup) {
        try { psPopup = await page.waitForEvent('popup', { timeout: this.timeouts.long15 }); } catch (_) {
          for (const p of page.context().pages()) { if (p !== page && !p.isClosed()) { const u = p.url(); if (u.includes('ProcessSelection') || u.includes('CIFProcess')) { psPopup = p; break; } if (!psPopup) psPopup = p; } }
        }
      }

      if (psPopup && !psPopup.isClosed()) {
        psPopup.on('dialog', async (d) => { const msg = d.message(); this.lastDialogMessages.push(msg); console.log('\ud83d\udce2 PS popup dialog: "' + msg.substring(0, 200) + '"'); await d.accept().catch(() => {}); });
        await psPopup.waitForLoadState('domcontentloaded', { timeout: this.timeouts.long15 }).catch(() => {});
        await psPopup.waitForTimeout(this.timeouts.medium);
        await this.captureEvidence('Process Selection popup opened', undefined, psPopup).catch(() => {});

        // Poll for Save button
        let saveReady = false;
        for (let i = 0; i < 10 && !saveReady; i++) {
          for (const f of psPopup.frames()) { const sb = f.locator('input[value*="Save Process Selection"]').first(); if (await sb.isVisible({ timeout: 2000 }).catch(() => false)) { saveReady = true; break; } }
          if (!saveReady) await psPopup.waitForTimeout(this.timeouts.short);
        }

        // Click Save Process Selection
        await this.captureEvidence('Process Selection popup before save', undefined, psPopup).catch(() => {});
        let saveClicked = false;
        for (const f of psPopup.frames()) { const sb = f.locator('input[value*="Save Process Selection"]').first(); if (await sb.isVisible({ timeout: 5000 }).catch(() => false)) { await sb.click(); saveClicked = true; console.log('\u2713 Clicked "Save Process Selection"'); break; } }
        if (!saveClicked) {
          for (const f of psPopup.frames()) {
            const c = await f.evaluate(() => { for (const btn of document.querySelectorAll('input[type="button"], input[type="submit"], button')) { const val = (btn.getAttribute('value') || btn.textContent || '').trim(); if (val.includes('Save Process Selection')) { (btn as HTMLElement).click(); return val; } } return ''; }).catch(() => '');
            if (c) { saveClicked = true; break; }
          }
        }

        // Wait for confirmation
        for (let attempt = 0; attempt < 15 && !this._processSaveConfirmed; attempt++) {
          await page.waitForTimeout(2000);
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

        if (!psPopup.isClosed()) {
          try {
            for (const f of psPopup.frames()) { const closeBtn = f.locator('input[value="Close"]').first(); if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await closeBtn.click(); break; } }
            await psPopup.waitForTimeout(this.timeouts.short).catch(() => {});
            await this.safeClosePopup(psPopup, 5000);
          } catch (_) {}
        }
      } else { console.log('\u26a0 Process Selection popup not found'); }

      if (this._processSaveConfirmed) {
        console.log('\u2713 Process Selection saved and confirmed');
        await this.captureEvidence('Process Selection popup after save', { processSaveConfirmed: this._processSaveConfirmed, cifId: this._cifId }, psPopup).catch(() => {});
      } else {
        console.log('\u26a0 Process Selection confirmation not received');
      }
    } catch (e) { console.log('\u26a0 Process Selection error: ' + (e as Error).message?.substring(0, 200)); }
    await this.captureEvidence('Corporate final state', { cifId: this._cifId, processSaveConfirmed: this._processSaveConfirmed });
  }

}
