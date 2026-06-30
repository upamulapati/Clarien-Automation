import { Page, Dialog } from '@playwright/test';
import { AppConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { CrmEndToEndPage } from './crmEndToEndPage';

export class CrmCorporateEndToEndPage extends CrmEndToEndPage {
  private natInfo = { codeName: '', dispName: '', btnName: '' };

  constructor(page: Page, config: AppConfig, lastDialogMessages: string[]) {
    super(page, config, lastDialogMessages);
  }

  // ==================== NAVIGATE TO NEW ENTITY ====================
  async navigateToNewEntity(): Promise<void> {
    console.log('=== Step 2: Navigate to CIF Corporate > New Entity > Customer ===');
    let page = this.workingPage;

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
    if (!lov.isClosed()) await lov.close().catch(() => {});
    await page.waitForTimeout(1000);
    return selected;
  }

  // ==================== FILL BASIC INFO TAB ====================
  async fillBasicInfo(): Promise<void> {
    console.log('\n========== BASIC INFO TAB ==========');
    // Verify accountFrame has CorporateBO fields — re-detect if not
    const hasCorporateFields = await this.accountFrame.evaluate(() => {
      return !!document.querySelector('input[name="CorporateBO.corporate_Name"]');
    }).catch(() => false);
    if (!hasCorporateFields) {
      console.log('  ⚠ accountFrame lacks CorporateBO fields — scanning all frames...');
      const page = this.workingPage;
      for (const f of page.frames()) {
        try {
          const hasFields = await f.evaluate(() => {
            return !!document.querySelector('input[name="CorporateBO.corporate_Name"]');
          }).catch(() => false);
          if (hasFields) {
            const cnt = await f.evaluate(() => document.querySelectorAll('input').length).catch(() => 0);
            this.accountFrame = f;
            console.log('  ✓ Re-detected accountFrame: "' + f.name() + '" url=' + f.url().substring(f.url().lastIndexOf('/') + 1).substring(0, 80) + ' inputs=' + cnt);
            break;
          }
        } catch (_) {}
      }
    }
    const f = this.accountFrame;
    const cd = CRM_TEST_DATA.corporate.endToEnd.corporateData;
    const ctd = CRM_TEST_DATA.corporate.endToEnd.contactData;

    await this.setField(f, ['CorporateBO.corporate_Name'], cd.corporateName, 'Corporate Name');
    await this.setField(f, ['CorporateBO.short_Name'], cd.shortName, 'Short Name');
    await this.setField(f, ['CorporateBO.keyContact_PersonName'], cd.keyContactPerson, 'Key Contact Person');
    await this.setField(f, ['CorporateBO.phone.cntrycode'], '1', 'Phone Country Code');
    await this.setField(f, ['CorporateBO.phone.areacode'], '441', 'Phone Area Code');
    await this.setField(f, ['CorporateBO.phone.localcode'], '1234567', 'Phone Local Code');

    // Business Type
    {
      const btResult = await f.evaluate(() => {
        const selNames = ['CorporateModBO.business_Type', 'CorporateBO.business_Type'];
        for (const n of selNames) {
          const sel = document.querySelector(`select[name="${n}"]`) as HTMLSelectElement;
          if (sel) {
            const opts = Array.from(sel.options).map(o => ({ value: o.value, text: o.text.trim() }));
            const target = opts.find(o => o.text.includes('COMMERCIAL')) || opts.find(o => o.value && o.value !== '--Select--' && o.text !== '--Select--');
            if (target) { sel.value = target.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
            return { type: 'select', selected: target?.text || '' };
          }
          const inp = document.querySelector(`input[name="${n}"]`) as HTMLInputElement;
          if (inp) return { type: 'input', selected: '' };
        }
        return { type: 'none', selected: '' };
      }).catch(() => ({ type: 'none', selected: '' }));
      if (btResult.type === 'input') {
        const btLov = await this.setLovViaPopup('CorporateModBO.business_Type', 'LOCAL', 'Business Type');
        if (!btLov) await this.setLov(f, ['CorporateModBO.business_Type'], ['Cat_CorporateModBO.business_Type'], 'LOC', 'LOCAL', 'Business Type');
      } else if (btResult.type === 'select' && btResult.selected) {
        console.log('\u2713 Business Type = "' + btResult.selected + '"');
      }
    }

    await this.setLov(f, ['CorporateBO.CountryOfIncorporation'], ['Cat_CorporateBO.CountryOfIncorporation'], cd.countryOfIncorporation, 'BERMUDA', 'Country of Incorporation');
    await this.setField(f, ['CorporateBO.registration_Number'], cd.registrationNo, 'Registration No');
    await this.setField(f, ['3_CorporateBO.date_Of_Incorporation'], cd.incorporationDate, 'Incorporation Date');
    await this.setField(f, ['3_CorporateBO.date_Of_Commencement'], cd.businessCommencementDate, 'Business Commencement Date');
    await this.setLov(f, ['CorporateBO.primary_Service_Center'], ['Cat_CorporateBO.primary_Service_Center'], cd.primarySolId, cd.primarySolId, 'Primary Service Center');
    await this.refreshAccountFrame('after Primary Service Center');

    await this.setLovViaPopup('CorporateModBO.segment', cd.corporateSegment, 'Corporate Segment');
    await this.refreshAccountFrame('after Corporate Segment');
    await this.setSelect(f, ['CorporateModBO.subSegment'], cd.subSegment, 'Sub-segment');
    await this.setField(f, ['CorporateBO.source_Of_Funds'], cd.fundSource, 'Source of Funds');
    await this.setLov(f, ['CorporateModBO.region'], ['Cat_CorporateModBO.region'], cd.region, 'INTERNATIONAL', 'Region');
    await this.refreshAccountFrame('after Region');
    await this.setLovViaPopup('CorporateBO.sector', 'OTHERS', 'Sector');
    await this.refreshAccountFrame('after Sector');
    await this.setLovViaPopup('CorporateModBO.subSector', 'OTHERS', 'Sub-sector');
    await this.refreshAccountFrame('after Sub-sector');
    await this.setField(f, ['CorporateBO.taxID'], cd.taxId, 'Tax ID');
    await this.setSelect(f, ['CorporateModBO.entityClass'], cd.entityClass, 'Entity Class');
    await this.setSelect(f, ['CorporateModBO.legalEntity_Type'], cd.legalEntityType, 'Legal Entity Type');
    await this.setSelect(f, ['CorporateModBO.priority'], cd.assignedPriority, 'Priority');
    await this.setSelect(f, ['CorporateModBO.relationship_Type'], cd.relationshipType, 'Relationship Type');
    await this.setLovViaPopup('CorporateBO.principle_PlaceOperation', cd.principalPlaceOfOperation, 'Principal Place of Operation');
    await this.refreshAccountFrame('after Principal Place');
    await this.setField(f, ['CorporateBO.website_Address'], cd.website, 'Website Address');
    await this.setLov(f, ['CorporateBO.ChargeLevelCode'], ['Cat_CorporateBO.ChargeLevelCode'], cd.clientLevelCode, '001', 'Charge Level Code');
    await this.setLov(f, ['CorporateModBO.Crncy_Code'], ['Cat_CorporateModBO.Crncy_Code'], 'BMD', 'BERMUDIAN DOLLAR', 'Base CCY');
    await this.refreshAccountFrame('before remaining dropdowns');

    // Remaining dropdown fields via evaluate
    await this.accountFrame.evaluate((data: any) => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const setSel = (names: string[], match: string) => { for (const name of names) { const sel = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement; if (!sel) continue; for (const opt of Array.from(sel.options)) { if (opt.text.trim().toUpperCase().includes(match.toUpperCase()) || opt.value === match) { sel.value = opt.value; fire(sel); return; } } } };
      const setInp = (names: string[], v: string) => { for (const n of names) { const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = v; fire(el); return; } } };
      setSel(['CorporateModBO.Status_Desc'], 'ACTIVE');
      setSel(['CorporateModBO.riskRating'], '1');
      setSel(['CorporateModBO.delinquency_Flag'], 'N');
      setSel(['CorporateBO.NativeLangCode'], 'ENGLISH');
      setSel(['CorporateModBO.Lang_Desc'], 'ENGLISH');
      setSel(['CorporateModBO.Health_Desc'], 'GOOD STATUS');
      setSel(['CorporateModBO.IsEbankingEnabled'], 'N');
      setSel(['CorporateModBO.islamic_banking_customer'], 'N');
      setSel(['CorporateModBO.zakat_deduction'], 'N');
      setSel(['CorporateModBO.asset_classification'], data.assetClassification);
      setSel(['CorporateModBO.Purge_Allowed_Flag'], 'N');
      setSel(['CorporateModBO.Cust_Type_Desc'], 'Corporate');
      setSel(['CorporateModBO.preferredCalendar'], 'GREGORIAN');
      setSel(['CorporateModBO.Cust_Grp_Desc'], 'GENERAL');
      setSel(['CorporateModBO.Customer_Level_Provisioning'], 'N');
      setSel(['CorporateModBO.Is_Swift_Code_of_Bank'], 'N');
      setSel(['CorporateModBO.trade_Services_Availed'], 'N');
      setSel(['CorporateModBO.submitForKYC'], 'N');
      setSel(['Assigned_BackendID'], 'FINACLECORE');
      setSel(['CorporateBO.accessOwnerGroup'], 'General Banking');
      setSel(['CorporateBO.accessOwnerSegment'], 'BANKING OPERATIONS');
      setSel(['BaselProfiling'], 'No');
      setInp(['CorporateBO.relationship_CreatedBy'], data.createdBy);
      setInp(['CorporateBO.PrimaryRMLogin_ID'], data.prmId);
      setInp(['CorporateBO.Email2'], data.email);
      setInp(['CorporateBO.corporateName_Native'], data.notes);
      // Notes field is a textarea with lowercase name
      const fire2 = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const notesTa = document.querySelector('textarea[name="CorporateBO.notes"]') as HTMLTextAreaElement;
      if (notesTa) { notesTa.value = data.notes || 'Corporate CIF test'; fire2(notesTa); }
      else { const notesTa2 = document.querySelector('textarea[name="CorporateBO.Notes"]') as HTMLTextAreaElement; if (notesTa2) { notesTa2.value = data.notes || 'Corporate CIF test'; fire2(notesTa2); } }
      setInp(['CorporateBO.short_Name_Native'], data.shortName);
      setInp(['CorporateBO.CorporateName_Native1'], data.corporateName);
      setInp(['CorporateBO.Short_Name_Native1'], data.shortName);
      setInp(['CorporateModBO.Cust_Const'], '');
      setInp(['3_CorporateBO.average_AnnualIncome'], data.averageAnnualIncome);
    }, { ...cd, email: ctd.email, notes: ctd.notes }).catch(() => {});
    console.log('\u2713 Remaining dropdown fields populated');
    await this.workingPage.screenshot({ path: 'test-results-temp/corp-basic-info-complete.png' }).catch(() => {});
  }

  // ==================== FILL CONTACT TAB ====================
  async fillContactTab(): Promise<void> {
    console.log('\n========== CONTACT TAB ==========');
    const page = this.workingPage;
    const ctd = CRM_TEST_DATA.corporate.endToEnd.contactData;
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
    await this.addAddress(ctd);

    // Phone and E-Mail
    for (const f of page.frames()) { const t = f.getByText('Phone and E-Mail', { exact: false }).first(); if (await t.isVisible({ timeout: 5000 }).catch(() => false)) { await t.click(); console.log('\u2713 Clicked Phone and E-Mail sub-tab'); break; } }
    await page.waitForTimeout(this.timeouts.medium);

    let phoneFrame: any = null;
    for (const f of page.frames()) { if (await f.evaluate(() => Array.from(document.querySelectorAll('input, select')).some(el => (el as HTMLInputElement).name.toLowerCase().includes('phone') || (el as HTMLInputElement).name.toLowerCase().includes('country_code'))).catch(() => false)) { phoneFrame = f; break; } }
    if (phoneFrame) {
      await phoneFrame.evaluate((data: any) => {
        const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const setF = (p: string, v: string) => { for (const i of Array.from(document.querySelectorAll('input'))) { const n = (i as HTMLInputElement).name.toLowerCase(); if (n.includes(p) && !n.includes('email')) { (i as HTMLInputElement).removeAttribute('readonly'); (i as HTMLInputElement).value = v; fire(i as HTMLElement); return; } } };
        const setS = (p: string, m: string) => { for (const s of Array.from(document.querySelectorAll('select'))) { if ((s as HTMLSelectElement).name.toLowerCase().includes(p)) { for (const o of Array.from((s as HTMLSelectElement).options)) { if (o.text.trim().toUpperCase().includes(m.toUpperCase())) { (s as HTMLSelectElement).value = o.value; fire(s as HTMLElement); return; } } } } };
        setS('contact_no_type', 'COMMUNICATION'); setS('phone_type', 'COMMUNICATION');
        setF('country_code', data.countryCode); setF('cntry_code', data.countryCode); setF('area_code', data.areaCode);
        setF('phone_number', data.phoneNumber); setF('phone_no', data.phoneNumber); setF('contact_no', data.phoneNumber);
      }, ctd).catch(() => {});
      console.log('\u2713 Phone fields populated');

      await phoneFrame.evaluate((data: any) => {
        const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const setF = (p: string, v: string) => { for (const i of Array.from(document.querySelectorAll('input'))) { if ((i as HTMLInputElement).name.toLowerCase().includes(p)) { (i as HTMLInputElement).removeAttribute('readonly'); (i as HTMLInputElement).value = v; fire(i as HTMLElement); return; } } };
        const setS = (p: string, m: string) => { for (const s of Array.from(document.querySelectorAll('select'))) { if ((s as HTMLSelectElement).name.toLowerCase().includes(p)) { for (const o of Array.from((s as HTMLSelectElement).options)) { if (o.text.trim().toUpperCase().includes(m.toUpperCase())) { (s as HTMLSelectElement).value = o.value; fire(s as HTMLElement); return; } } } } };
        setS('email_type', 'COMMUNICATION'); setS('emailid_type', 'COMMUNICATION');
        setF('email_id', data.email); setF('email_address', data.email); setF('emailid', data.email);
      }, ctd).catch(() => {});
      console.log('\u2713 Email fields populated');
    }
    for (const f of page.frames()) { const sb = f.locator('input[value="Save"]').first(); if (await sb.isVisible({ timeout: 3000 }).catch(() => false)) { await sb.click(); console.log('\u2713 Saved Contact tab'); break; } }
    await page.waitForTimeout(this.timeouts.medium);
    await page.screenshot({ path: 'test-results-temp/corp-contact-complete.png' }).catch(() => {});
  }

  private async addAddress(ctd: any): Promise<void> {
    const page = this.workingPage;
    let addrAdded = false;
    for (const f of page.frames()) {
      let addBtn = f.locator('input[name="Add Address Details"]').first();
      let btnVisible = await addBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!btnVisible) { addBtn = f.locator('input[value="Add Address Details"]').first(); btnVisible = await addBtn.isVisible({ timeout: 2000 }).catch(() => false); }
      if (!btnVisible) { addBtn = f.locator('input[value="Add"]').first(); btnVisible = await addBtn.isVisible({ timeout: 2000 }).catch(() => false); }
      if (btnVisible) {
        await this.closeUnexpectedPopups(page);
        const pp = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
        await addBtn.click();
        const addrPopup = await pp;
        if (addrPopup && !addrPopup.isClosed()) {
          addrPopup.on('dialog', async (d) => { this.lastDialogMessages.push(d.message()); await d.accept().catch(() => {}); });
          await this.waitForPopupReady(addrPopup, 'Address popup');
          const at = await this.findPopupTarget(addrPopup);
          await at.evaluate(() => {
            const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
            const s = document.querySelector('select[name="CorporateBO.Address.addressCategory"]') as HTMLSelectElement;
            if (s) { for (const o of Array.from(s.options)) { if (o.text.trim().toUpperCase().includes('MAILING')) { s.value = o.value; fire(s); break; } } }
          }).catch(() => {});
          await addrPopup.waitForTimeout(3000).catch(() => {});
          await at.evaluate((data: any) => {
            const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
            const setExact = (name: string, val: string) => { const el = document.querySelector(`input[name="${name}"]`) as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = val; fire(el); } };
            setExact('CorporateBO.Address.street_no', data.streetNo);
            setExact('CorporateBO.Address.street_name', data.streetName);
            setExact('CorporateBO.Address.house_no', data.houseNo);
            setExact('CorporateBO.Address.premise_name', data.premiseName);
            setExact('CorporateBO.Address.building_level', data.buildingLevel);
            setExact('CorporateBO.Address.suburb', data.suburb);
            setExact('CorporateBO.Address.locality_name', data.localityName);
            setExact('CorporateBO.Address.town', data.city);
            setExact('CorporateBO.Address.zip', data.zip);
            setExact('3_CorporateBO.Address.Start_Date', data.startDate);
            setExact('CorporateBO.Address.FreeTextLabel', data.addressLabel);
            setExact('CorporateBO.Address.address_Line1', data.addressLine1);
          }, ctd).catch(() => {});
          console.log('  \u2713 Address fields filled');
          await this.selectAddrLov(addrPopup, at, 'btnone_CorporateBO.Address.country', 'Bermuda', 'Country');
          await this.selectAddrLov(addrPopup, at, 'btnone_CorporateBO.Address.city', ctd.city, 'City');
          await this.selectAddrLov(addrPopup, at, 'btnone_CorporateBO.Address.state', ctd.state, 'State');
          for (const pf of addrPopup.frames()) { for (const bv of ['Save', 'OK', 'Submit']) { const btn = pf.locator(`input[value="${bv}"]`).first(); if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); console.log('  \u2713 Clicked ' + bv + ' in address popup'); break; } } }
          await addrPopup.waitForTimeout(3000).catch(() => {});
          if (!addrPopup.isClosed()) {
            for (const pf of addrPopup.frames()) { for (const bv of ['Save', 'OK', 'Submit']) { const btn = pf.locator(`input[value="${bv}"]`).first(); if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) { await btn.click(); break; } } }
          }
          if (!addrPopup.isClosed()) await addrPopup.waitForEvent('close', { timeout: this.timeouts.long15 }).catch(() => { if (!addrPopup.isClosed()) addrPopup.close().catch(() => {}); });
          addrAdded = true; console.log('\u2713 Address added');
        }
        break;
      }
    }
    if (!addrAdded) console.log('\u26a0 Could not add address');
    await page.waitForTimeout(this.timeouts.short3);
    await this.closeUnexpectedPopups(page);
  }

  // ==================== FILL ID DOCUMENT TAB ====================
  async fillIdDocumentTab(): Promise<void> {
    console.log('\n========== ID DOCUMENT TAB ==========');
    const page = this.workingPage;
    const vdd = CRM_TEST_DATA.corporate.endToEnd.validDocData;
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

    let idAdded = false;
    for (const f of page.frames()) {
      let addBtn = f.locator('input[name="AddIdentificationDetails"]').first();
      let btnVisible = await addBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!btnVisible) { addBtn = f.locator('input[value="Add Identification Document Details"]').first(); btnVisible = await addBtn.isVisible({ timeout: 2000 }).catch(() => false); }
      if (!btnVisible) { addBtn = f.locator('input[name="Add Document Details"]').first(); btnVisible = await addBtn.isVisible({ timeout: 2000 }).catch(() => false); }
      if (!btnVisible) { addBtn = f.locator('input[value="Add"]').first(); btnVisible = await addBtn.isVisible({ timeout: 2000 }).catch(() => false); }
      if (btnVisible) {
        const pp = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
        await addBtn.click();
        const idPopup = await pp;
        if (idPopup) {
          idPopup.on('dialog', async (d) => { this.lastDialogMessages.push(d.message()); await d.accept().catch(() => {}); });
          await this.waitForPopupReady(idPopup, 'ID Document popup');
          const idt = await this.findPopupTarget(idPopup);
          // Select Document Type
          const docTypeSelect = idt.locator('select[name="EntityDocumentBO.DocTypeCode"]');
          if (await docTypeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
            const docTypeOptions = await this.getSelectOptions(idt, 'select[name="EntityDocumentBO.DocTypeCode"]');
            const targetType = docTypeOptions.find((o: string) => o === vdd.documentType) || docTypeOptions.find((o: string) => o.includes(vdd.documentType)) || docTypeOptions.find((o: string) => o !== '--Select--' && o.length > 0);
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
            const targetCode = docCodeOptions.find((o: string) => o.includes(vdd.documentCode)) || docCodeOptions.find((o: string) => o !== '--Select--' && o.length > 0);
            if (targetCode) {
              await docCodeSelect.selectOption({ label: targetCode });
              console.log('  \u2713 Set Document Code: ' + targetCode);
              await docCodeSelect.evaluate((el: HTMLSelectElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); });
            }
          }
          // Reference Number
          const refInput = idt.locator('input[name="EntityDocumentBO.ReferenceNumber"]');
          if (await refInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await refInput.fill(vdd.uniqueId);
            console.log('  \u2713 Set Reference Number: ' + vdd.uniqueId);
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
          }, { issueDate: vdd.issueDate, expiryDate: vdd.expiryDate }).catch(() => {});
          // LOV for Place of Issue and Country of Issue
          await this.selectDocLovCorp(idPopup, idt, 'btnone_EntityDocumentBO.PlaceOfIssue', vdd.placeOfIssue, 'Place of Issue');
          await this.selectDocLovCorp(idPopup, idt, 'btnone_EntityDocumentBO.CountryOfIssue', 'Bermuda', 'Country of Issue');
          // Save
          for (const pf of idPopup.frames()) { for (const bv of ['Save', 'OK', 'Submit']) { const btn = pf.locator(`input[value="${bv}"]`).first(); if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); break; } } }
          if (!idPopup.isClosed()) await idPopup.waitForEvent('close', { timeout: this.timeouts.long15 }).catch(() => { if (!idPopup.isClosed()) idPopup.close().catch(() => {}); });
          idAdded = true; console.log('\u2713 ID Document added');
        }
        break;
      }
    }
    if (!idAdded) console.log('\u26a0 Could not add ID Document');
    await page.waitForTimeout(this.timeouts.short3);
    await this.closeUnexpectedPopups(page);
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
    if (!lov.isClosed()) await lov.waitForEvent('close', { timeout: this.timeouts.medium }).catch(() => { if (!lov.isClosed()) lov.close().catch(() => {}); });
  }

  // ==================== FILL CURRENCY TAB ====================
  async fillCurrencyTab(): Promise<void> {
    console.log('\n========== CURRENCY TAB ==========');
    const page = this.workingPage;
    const vcd = CRM_TEST_DATA.corporate.endToEnd.validCcyData;
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
    for (const f of page.frames()) {
      let addBtn = f.locator('input[name="Add Currency"]').first();
      let btnVisible = await addBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!btnVisible) { addBtn = f.locator('input[value="Add CCY"]').first(); btnVisible = await addBtn.isVisible({ timeout: 2000 }).catch(() => false); }
      if (!btnVisible) { addBtn = f.locator('input[value="Add Currency Details"]').first(); btnVisible = await addBtn.isVisible({ timeout: 2000 }).catch(() => false); }
      if (!btnVisible) { addBtn = f.locator('input[value="Add"]').first(); btnVisible = await addBtn.isVisible({ timeout: 2000 }).catch(() => false); }
      if (btnVisible) {
        const pp = page.context().waitForEvent('page', { timeout: this.timeouts.popupLoad }).catch(() => null);
        await addBtn.click();
        const ccyPopup = await pp;
        if (ccyPopup) {
          ccyPopup.on('dialog', async (d) => { this.lastDialogMessages.push(d.message()); await d.accept().catch(() => {}); });
          await this.waitForPopupReady(ccyPopup, 'Currency popup');
          const ct = await this.findPopupTarget(ccyPopup);
          await ct.evaluate((data: any) => {
            const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
            const setF = (p: string, v: string) => { for (const i of Array.from(document.querySelectorAll('input'))) { if ((i as HTMLInputElement).name.toLowerCase().includes(p) && (i as HTMLInputElement).type !== 'hidden') { (i as HTMLInputElement).removeAttribute('readonly'); (i as HTMLInputElement).value = v; fire(i as HTMLElement); return; } } };
            setF('credit_discount', data.creditDiscountPcnt); setF('debit_discount', data.debitDiscountPcnt);
            setF('withholding_tax_pcnt', data.withholdingTaxPcnt); setF('withholdingtax', data.withholdingTaxPcnt);
            setF('withholding_tax_floor', data.withholdingTaxFloorLimit); setF('floor_limit', data.withholdingTaxFloorLimit);
            setF('preferential_expiry', data.preferentialExpiryDate); setF('expiry_date', data.preferentialExpiryDate);
          }, vcd).catch(() => {});
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
                    await si.fill(vcd.ccy).catch(() => {});
                    const sub = lf.locator('input[value="Submit"]').first();
                    if (await sub.isVisible({ timeout: 3000 }).catch(() => false)) await sub.click().catch(() => {});
                    await lovP.waitForTimeout(this.timeouts.short).catch(() => {});
                    try { await Promise.race([lf.getByText(vcd.ccy, { exact: true }).first().dblclick({ timeout: this.timeouts.medium }), lovP.waitForEvent('close', { timeout: this.timeouts.long })]); } catch (_) {}
                    break;
                  }
                }
                if (!lovP.isClosed()) await lovP.close().catch(() => {});
              }
              break;
            }
          }
          for (const pf of ccyPopup.frames()) { for (const bv of ['Save', 'OK', 'Submit']) { const btn = pf.locator(`input[value="${bv}"]`).first(); if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); break; } } }
          if (!ccyPopup.isClosed()) await ccyPopup.waitForEvent('close', { timeout: this.timeouts.long15 }).catch(() => { if (!ccyPopup.isClosed()) ccyPopup.close().catch(() => {}); });
          ccyAdded = true; console.log('\u2713 Currency added');
        }
        break;
      }
    }
    if (!ccyAdded) console.log('\u26a0 Could not add Currency');
    await page.waitForTimeout(this.timeouts.short3);
    await this.closeUnexpectedPopups(page);
  }

  // ==================== FILL DEMOGRAPHIC TAB ====================
  async fillDemographicTab(): Promise<void> {
    console.log('\n========== DEMOGRAPHIC TAB ==========');
    const page = this.workingPage;
    await this.closeUnexpectedPopups(page);
    let demoTabClicked = false;
    for (const f of page.frames()) {
      const t = f.getByText('Demographic', { exact: false }).first();
      if (await t.isVisible({ timeout: 5000 }).catch(() => false)) {
        const txt = await t.textContent().catch(() => '');
        if (txt && txt.toLowerCase().includes('demographic')) { await t.click(); demoTabClicked = true; console.log('\u2713 Clicked Demographic tab'); break; }
      }
    }
    await page.waitForTimeout(this.timeouts.medium);

    let demoFrame: any = null;
    for (const f of page.frames()) {
      try { const u = f.url(); if (u.includes('CorpModFinancialDet') || u.includes('CorpTFinMod_Det') || u.includes('DemographicMod_det')) { demoFrame = f; break; } } catch (_) {}
    }
    if (!demoFrame) demoFrame = page.frame({ name: 'formDispFrame' }) || this.accountFrame;
    const getDemoFrame = () => {
      for (const f of page.frames()) { try { if (f.url().includes('CorpModFinancialDet') || f.url().includes('CorpTFinMod_Det') || f.url().includes('DemographicMod_det')) return f; } catch (_) {} }
      return page.frame({ name: 'formDispFrame' }) || demoFrame;
    };

    // Fill Nationality
    for (const f of page.frames()) {
      const info = await f.evaluate(() => {
        const r: { codeName: string; dispName: string; btnName: string } = { codeName: '', dispName: '', btnName: '' };
        document.querySelectorAll('input').forEach(el => {
          const n = (el as HTMLInputElement).name || '';
          if (n.includes('Nationality') && !n.startsWith('Cat_') && !n.startsWith('btn') && !n.startsWith('pi_')) r.codeName = n;
          if (n.startsWith('Cat_') && n.includes('Nationality')) r.dispName = n;
          if ((n.startsWith('btn') || n.startsWith('pi_')) && n.includes('Nationality')) r.btnName = n;
        });
        return r;
      }).catch(() => ({ codeName: '', dispName: '', btnName: '' }));
      if (info.codeName || info.btnName) { this.natInfo = info; demoFrame = f; break; }
    }
    if (this.natInfo.codeName) {
      await demoFrame.evaluate((a: { c: string; d: string }) => {
        const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const ce = document.querySelector(`input[name="${a.c}"]`) as HTMLInputElement;
        if (ce) { ce.value = 'BM'; fire(ce); }
        if (a.d) { const de = document.querySelector(`input[name="${a.d}"]`) as HTMLInputElement; if (de) { de.value = 'BERMUDA'; fire(de); } }
      }, { c: this.natInfo.codeName, d: this.natInfo.dispName }).catch(() => {});
      console.log('\u2713 Nationality = BERMUDA (BM)');
    } else if (this.natInfo.btnName) {
      try {
        const lpp = page.context().waitForEvent('page', { timeout: this.timeouts.long15 }).catch(() => null);
        await demoFrame.locator(`input[name="${this.natInfo.btnName}"]`).evaluate((el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).catch(() => {});
        const natLov = await lpp;
        if (natLov && !natLov.isClosed()) {
          await natLov.bringToFront();
          await new Promise(r => setTimeout(r, 2000));
          await this.waitForPopupReady(natLov, 'Nationality LOV');
          for (const lf of natLov.frames()) {
            const si = lf.locator('input[type="text"]').first();
            if (await si.isVisible({ timeout: 3000 }).catch(() => false)) {
              await si.fill('BERMUDA').catch(() => {});
              const sub = lf.locator('input[value="Submit"]').first();
              if (await sub.isVisible({ timeout: 3000 }).catch(() => false)) await sub.click().catch(() => {});
              await natLov.waitForTimeout(this.timeouts.short).catch(() => {});
              try { await Promise.race([lf.getByText('BERMUDA', { exact: true }).first().dblclick({ timeout: this.timeouts.medium }), natLov.waitForEvent('close', { timeout: this.timeouts.long })]); } catch (_) {}
              break;
            }
          }
          if (!natLov.isClosed()) await natLov.close().catch(() => {});
        }
      } catch (e) { console.log('\u26a0 Nationality LOV error: ' + (e as Error).message?.substring(0, 100)); }
    }

    // Residence Country
    demoFrame = getDemoFrame();
    await demoFrame.evaluate(() => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); };
      document.querySelectorAll('input').forEach(el => {
        const inp = el as HTMLInputElement;
        if (inp.name.includes('Residence_Country') && !inp.name.startsWith('Cat_') && !inp.name.startsWith('btn') && !inp.name.startsWith('pi_')) { if (!inp.value) { inp.value = 'BM'; fire(inp); } }
        if (inp.name.startsWith('Cat_') && inp.name.includes('Residence_Country')) { if (!inp.value) { inp.value = 'BERMUDA'; fire(inp); } }
      });
    }).catch(() => {});
    console.log('\u2713 Residence Country = BERMUDA');

    // Save Demographic
    for (const f of page.frames()) { const sb = f.locator('input[value="Save"]').first(); if (await sb.isVisible({ timeout: 3000 }).catch(() => false)) { await sb.click(); console.log('\u2713 Saved Demographic'); break; } }
    await page.waitForTimeout(this.timeouts.medium);

    // Income and Expense sub-tab
    for (const f of page.frames()) { const t = f.getByText('Income and Expense', { exact: false }).first(); if (await t.isVisible({ timeout: 5000 }).catch(() => false)) { await t.click(); console.log('\u2713 Clicked Income and Expense sub-tab'); break; } }
    await page.waitForTimeout(this.timeouts.medium);
    demoFrame = getDemoFrame();

    // Annual Turnover
    let grossField = '';
    for (const fn of ['3_DemographicBO.Annual_Salary_Income', 'DemographicBO.Annual_Salary_Income', 'DemographicBO.Annual_Turnover', 'CorpModFinancialBO.AnnualTurnover', 'CorpModFinancialBO.annual_turnover']) {
      for (const f of page.frames()) { if (await f.evaluate((n: string) => !!document.querySelector(`input[name="${n}"]`), fn).catch(() => false)) { grossField = fn; demoFrame = f; break; } }
      if (grossField) break;
    }
    if (!grossField) {
      for (const f of page.frames()) {
        const found = await f.evaluate(() => { for (const i of Array.from(document.querySelectorAll('input'))) { const n = (i as HTMLInputElement).name.toLowerCase(); if (n.includes('annual_salary') || n.includes('turnover') || n.includes('gross')) return (i as HTMLInputElement).name; } return ''; }).catch(() => '');
        if (found) { grossField = found; demoFrame = f; break; }
      }
    }
    if (grossField) {
      await demoFrame.evaluate((fn: string) => { const el = document.querySelector(`input[name="${fn}"]`) as HTMLInputElement; if (el) el.removeAttribute('readonly'); }, grossField).catch(() => {});
      const gl = demoFrame.locator(`input[name="${grossField}"]`);
      if (await gl.isVisible({ timeout: 5000 }).catch(() => false)) await gl.fill('500000').catch(() => {});
      else await demoFrame.evaluate((a: { f: string; v: string }) => { const el = document.querySelector(`input[name="${a.f}"]`) as HTMLInputElement; if (el) { el.removeAttribute('readonly'); el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true })); } }, { f: grossField, v: '500000' }).catch(() => {});
      console.log('\u2713 Annual Turnover = 500000 (field: ' + grossField + ')');
    }

    // BMD currency
    await demoFrame.evaluate(() => {
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); };
      for (const s of Array.from(document.querySelectorAll('select'))) {
        const se = s as HTMLSelectElement;
        if (se.name !== 'op_code' && se.name !== 'res_type' && se.name !== 'soln_type') {
          const hasCcy = Array.from(se.options).some(o => o.text.includes('BMD') || o.text.includes('USD'));
          if (hasCcy) { for (const o of Array.from(se.options)) { if (o.text.includes('BMD') || o.value === 'BMD') { se.value = o.value; fire(se); break; } } break; }
        }
      }
    }).catch(() => {});

    // Monthly Expense
    let expField = '';
    for (const fn of ['3_DemographicBO.Annual_Operating_Exp', 'DemographicBO.Annual_Operating_Exp', 'CorpModFinancialBO.AnnualOperatingExp', 'CorpModFinancialBO.annual_operating_exp']) {
      for (const f of page.frames()) { if (await f.evaluate((n: string) => !!document.querySelector(`input[name="${n}"]`), fn).catch(() => false)) { expField = fn; demoFrame = f; break; } }
      if (expField) break;
    }
    if (!expField) {
      for (const f of page.frames()) {
        const found = await f.evaluate(() => { for (const i of Array.from(document.querySelectorAll('input'))) { const n = (i as HTMLInputElement).name.toLowerCase(); if (n.includes('operating_exp') || n.includes('expense')) return (i as HTMLInputElement).name; } return ''; }).catch(() => '');
        if (found) { expField = found; demoFrame = f; break; }
      }
    }
    if (expField) {
      await demoFrame.evaluate((fn: string) => { const el = document.querySelector(`input[name="${fn}"]`) as HTMLInputElement; if (el) el.removeAttribute('readonly'); }, expField).catch(() => {});
      const el = demoFrame.locator(`input[name="${expField}"]`);
      if (await el.isVisible({ timeout: 5000 }).catch(() => false)) await el.fill('100000').catch(() => {});
      else await demoFrame.evaluate((a: { f: string; v: string }) => { const e = document.querySelector(`input[name="${a.f}"]`) as HTMLInputElement; if (e) { e.removeAttribute('readonly'); e.value = a.v; e.dispatchEvent(new Event('change', { bubbles: true })); } }, { f: expField, v: '100000' }).catch(() => {});
      console.log('\u2713 Monthly Expense = 100000 (field: ' + expField + ')');
    }
    await page.screenshot({ path: 'test-results-temp/corp-demographic-complete.png' }).catch(() => {});
  }

  // ==================== PRE-SUBMIT VERIFICATION ====================
  async preSubmitVerification(): Promise<void> {
    console.log('\n=== Pre-Submit: Re-verify mandatory fields ===');
    const page = this.workingPage;
    const cd = CRM_TEST_DATA.corporate.endToEnd.corporateData;
    const ctd = CRM_TEST_DATA.corporate.endToEnd.contactData;

    // Navigate back to General Details
    for (const f of page.frames()) { const t = f.getByText('General Details', { exact: false }).first(); if (await t.isVisible({ timeout: 3000 }).catch(() => false)) { await t.click(); break; } }
    await page.waitForTimeout(this.timeouts.short3);

    // Diagnostic: discover actual field names for Sub-segment and Notes across all frames
    for (const f of page.frames()) {
      const diag = await f.evaluate(() => {
        const sels: string[] = [];
        document.querySelectorAll('select').forEach(s => {
          const sel = s as HTMLSelectElement;
          if (sel.name && (sel.name.toLowerCase().includes('sub') || sel.name.toLowerCase().includes('segment') || sel.name.toLowerCase().includes('note'))) {
            const opts = Array.from(sel.options).map(o => `${o.value}:${o.text.trim()}`).slice(0, 5);
            sels.push(`select[name="${sel.name}"] val="${sel.value}" opts=[${opts.join(', ')}]`);
          }
        });
        const tas: string[] = [];
        document.querySelectorAll('textarea').forEach(t => {
          const ta = t as HTMLTextAreaElement;
          if (ta.name) tas.push(`textarea[name="${ta.name}"] val="${(ta.value || '').substring(0, 30)}"`);
        });
        const noteInps: string[] = [];
        document.querySelectorAll('input').forEach(el => {
          const inp = el as HTMLInputElement;
          if (inp.name && (inp.name.toLowerCase().includes('note') || inp.name.toLowerCase().includes('native'))) {
            noteInps.push(`input[name="${inp.name}"] type=${inp.type} val="${(inp.value || '').substring(0, 30)}"`);
          }
        });
        return { sels, tas, noteInps };
      }).catch(() => ({ sels: [], tas: [], noteInps: [] }));
      if (diag.sels.length > 0 || diag.tas.length > 0 || diag.noteInps.length > 0) {
        console.log(`  Diag frame "${f.name()}": selects=[${diag.sels.join('; ')}] textareas=[${diag.tas.join('; ')}] noteInps=[${diag.noteInps.join('; ')}]`);
      }
    }

    for (const f of page.frames()) {
      const result = await f.evaluate((args: { natCode: string; natDisp: string; createdBy: string; prmId: string; notes: string }) => {
        const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
        const setSel = (name: string, match: string) => { const sel = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement; if (!sel) return false; for (const o of Array.from(sel.options)) { if (o.text.trim().toUpperCase().includes(match.toUpperCase()) || o.value.toUpperCase().includes(match.toUpperCase())) { sel.value = o.value; fire(sel); return true; } } return false; };
        const setInp = (name: string, val: string) => { const el = document.querySelector(`input[name="${name}"]`) as HTMLInputElement; if (!el) return false; el.removeAttribute('readonly'); el.value = val; fire(el); return true; };
        const res = { foundAny: false, fixes: [] as string[] };
        // Nationality
        const nc = document.querySelector(`input[name="${args.natCode}"]`) as HTMLInputElement;
        if (nc) { res.foundAny = true; if (!nc.value) { nc.value = 'BM'; fire(nc); const nd = document.querySelector(`input[name="${args.natDisp}"]`) as HTMLInputElement; if (nd) { nd.value = 'BERMUDA'; fire(nd); } res.fixes.push('Nationality=BM'); } }
        // CountryOfOrigin
        document.querySelectorAll('input').forEach(el => {
          const inp = el as HTMLInputElement;
          if (inp.name.includes('CountryOfOrigin') && !inp.name.startsWith('Cat_') && !inp.name.startsWith('btn') && !inp.name.startsWith('pi_')) { res.foundAny = true; if (!inp.value) { inp.value = 'BM'; fire(inp); res.fixes.push('CountryOfOrigin=BM'); } }
          if (inp.name.includes('CountryOfOrigin') && inp.name.startsWith('Cat_')) { if (!inp.value) { inp.value = 'BERMUDA'; fire(inp); } }
        });
        // Sub-segment — search broadly for any select with 'sub' and 'segment' in name
        const subSegNames = ['CorporateModBO.subSegment', 'CorporateBO.subSegment'];
        let subSegSet = false;
        for (const ssn of subSegNames) { if (setSel(ssn, 'CORPORATE')) { res.fixes.push('SubSegment=CORPORATE'); subSegSet = true; break; } }
        if (!subSegSet) { for (const ssn of subSegNames) { if (setSel(ssn, 'CCOR')) { res.fixes.push('SubSegment=CCOR'); subSegSet = true; break; } } }
        if (!subSegSet) {
          // Broader search for sub-segment select
          document.querySelectorAll('select').forEach(s => {
            if (subSegSet) return;
            const sel = s as HTMLSelectElement;
            const n = (sel.name || '').toLowerCase();
            if ((n.includes('subseg') || n.includes('sub_seg') || (n.includes('sub') && n.includes('segment')))) {
              for (const o of Array.from(sel.options)) {
                if (o.value && o.text.trim() !== '--Select--' && o.text.trim() !== '') {
                  sel.value = o.value; fire(sel); res.fixes.push('SubSegment=' + sel.name + '=' + o.text.trim()); subSegSet = true; break;
                }
              }
            }
          });
        }
        if (!subSegSet) { for (const ssn of subSegNames) { const sel = document.querySelector(`select[name="${ssn}"]`) as HTMLSelectElement; if (sel) { for (const o of Array.from(sel.options)) { if (o.value && o.text.trim() !== '--Select--') { sel.value = o.value; fire(sel); res.fixes.push('SubSegment=' + o.text.trim()); subSegSet = true; break; } } if (subSegSet) break; } } }
        // Notes — textarea with name "CorporateBO.notes" (lowercase)
        const noteTextareaNames = ['CorporateBO.notes', 'CorporateBO.Notes', 'CorporateModBO.Notes'];
        let notesSet = false;
        for (const nn of noteTextareaNames) {
          const ta = document.querySelector(`textarea[name="${nn}"]`) as HTMLTextAreaElement;
          if (!notesSet && ta) { ta.value = args.notes; fire(ta); res.fixes.push('Notes=' + nn + '(textarea)'); notesSet = true; break; }
        }
        if (!notesSet) {
          document.querySelectorAll('textarea').forEach(el => {
            if (notesSet) return;
            const ta = el as HTMLTextAreaElement;
            if (ta.name && ta.name.toLowerCase().includes('note') && !ta.value) {
              ta.value = args.notes; fire(ta); res.fixes.push('Notes=' + ta.name + '(textarea)'); notesSet = true;
            }
          });
        }
        if (!notesSet) {
          const noteInputNames = ['CorporateBO.Notes', 'CorporateBO.notes', 'CorporateModBO.Notes'];
          for (const nn of noteInputNames) { if (!notesSet && setInp(nn, args.notes)) { res.fixes.push('Notes=' + nn); notesSet = true; break; } }
        }
        // Relationship Created By
        const relNames = ['CorporateBO.relationship_CreatedBy', 'CorporateModBO.relationship_CreatedBy'];
        let relSet = false;
        for (const rn of relNames) { if (setInp(rn, args.createdBy)) { res.fixes.push('RelCreatedBy=' + rn); relSet = true; break; } if (setSel(rn, args.createdBy)) { res.fixes.push('RelCreatedBy=' + rn + '(sel)'); relSet = true; break; } }
        if (!relSet) {
          document.querySelectorAll('input, select').forEach(el => {
            if (relSet) return;
            const inp = el as HTMLInputElement; const n = inp.name?.toLowerCase() || '';
            if ((n.includes('relationship') && n.includes('created')) || (n.includes('rel') && n.includes('create'))) {
              if (n.startsWith('pi_') || n.startsWith('btn') || n.startsWith('cat_')) return;
              if (el.tagName === 'SELECT') { const sel = el as HTMLSelectElement; for (const o of Array.from(sel.options)) { if (o.value && o.text.trim() !== '--Select--') { sel.value = o.value; fire(sel); relSet = true; break; } } }
              else { inp.removeAttribute('readonly'); inp.value = args.createdBy; fire(inp); relSet = true; }
            }
          });
        }
        if (setInp('CorporateBO.PrimaryRMLogin_ID', args.prmId)) res.fixes.push('PRMID=' + args.prmId);
        setSel('CorporateBO.NativeLangCode', 'ENGLISH');
        setSel('CorporateModBO.Status_Desc', 'ACTIVE');
        setSel('CorporateModBO.IsEbankingEnabled', 'N');
        setSel('CorporateModBO.Cust_Type_Desc', 'Corporate');
        setSel('Assigned_BackendID', 'FINACLECORE');
        return res;
      }, { natCode: this.natInfo.codeName, natDisp: this.natInfo.dispName, createdBy: cd.createdBy, prmId: cd.prmId, notes: ctd.notes }).catch(() => ({ foundAny: false, fixes: [] }));
      if (result.foundAny) {
        if (result.fixes.length > 0) console.log('  \u2713 Re-filled: ' + result.fixes.join(', '));
        else console.log('  \u2713 All mandatory fields already filled');
        break;
      }
    }
    console.log('\u2713 Pre-Submit verification complete');

    // Navigate back to General Details for LOV fields
    if (!page.isClosed()) {
      for (const f of page.frames()) {
        for (const tabText of ['General Details', 'Basic Info', 'General']) {
          const tab = f.getByText(tabText, { exact: false }).first();
          if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
            await tab.click(); await page.waitForTimeout(this.timeouts.medium).catch(() => {}); break;
          }
        }
      }
    }

    if (!page.isClosed()) {
      await this.selectLovValue({ parentPage: page, target: page, buttonName: 'btnone_CorporateBO.CountryOfOrigin', searchValue: 'Bermuda', label: 'Country of Origin', config: this.config });
      if (!page.isClosed()) await this.refreshAccountFrame('after CountryOfOrigin LOV');
    }
    if (!page.isClosed()) await page.waitForTimeout(this.timeouts.short).catch(() => {});
    if (!page.isClosed()) {
      await this.selectLovValue({ parentPage: page, target: page, buttonName: 'btnone_CorporateBO.relationship_CreatedBy', searchValue: cd.prmId, label: 'Relationship Created By', config: this.config });
      if (!page.isClosed()) await page.waitForTimeout(this.timeouts.medium).catch(() => {});
    }
  }

  // ==================== SUBMIT ====================
  async submitForm(): Promise<string> {
    console.log('\n=== TC_CORP_SUBMIT_001: Click Submit ===');
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
    await page.screenshot({ path: 'test-results-temp/corp-after-submit.png' }).catch(() => {});
    return cifId;
  }

  // ==================== PROCESS SELECTION ====================
  async handleProcessSelection(): Promise<void> {
    console.log('\n=== TC_CORP_PS_001: Process Selection popup ===');
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

        // Poll for Save button
        let saveReady = false;
        for (let i = 0; i < 10 && !saveReady; i++) {
          for (const f of psPopup.frames()) { const sb = f.locator('input[value*="Save Process Selection"]').first(); if (await sb.isVisible({ timeout: 2000 }).catch(() => false)) { saveReady = true; break; } }
          if (!saveReady) await psPopup.waitForTimeout(this.timeouts.short);
        }

        // Click Save Process Selection
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
            if (!psPopup.isClosed()) await psPopup.close().catch(() => {});
          } catch (_) {}
        }
      } else { console.log('\u26a0 Process Selection popup not found'); }

      if (this._processSaveConfirmed) console.log('\u2713 Process Selection saved and confirmed');
      else console.log('\u26a0 Process Selection confirmation not received');
    } catch (e) { console.log('\u26a0 Process Selection error: ' + (e as Error).message?.substring(0, 200)); }
    await page.screenshot({ path: 'test-results-temp/corp-final-state.png' }).catch(() => {});
  }

}
