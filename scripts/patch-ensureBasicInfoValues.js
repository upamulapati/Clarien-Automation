const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'tests', 'pages', 'CRM', 'crmRetailEndToEndPage.ts');
let content = fs.readFileSync(filePath, 'utf8');

const newMethod = `  /**
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
      regionDisplay: String(TD.customerData.regionDisplay || TD.customerData.region || ''),
      tdsTable: String(TD.customerData.tdsTable || ''),
      tdsTableDisplay: String(TD.customerData.tdsTableDisplay || TD.customerData.tdsTable || ''),
      customerType: String((TD.customerData as any).customerType || ''),
      customerTypeDisplay: String((TD.customerData as any).customerTypeDisplay || (TD.customerData as any).customerType || ''),
      cityOfBirth: String(TD.customerData.cityOfBirth || ''),
      cityOfBirthDisplay: String(TD.customerData.cityOfBirthDisplay || TD.customerData.cityOfBirth || ''),
      chargeLevel: String(TD.customerData.chargeLevelCode || (TD.customerData as any).chargeLevel || ''),
      chargeLevelDisplay: String(TD.customerData.chargeLevelDisplay || TD.customerData.chargeLevelCode || (TD.customerData as any).chargeLevel || '')
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
      const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
      const setInput = (names: string[], val: string): boolean => {
        if (!val) return false;
        for (const n of names) {
          const inp = document.querySelector(\`input[name="\${n}"]\`) as HTMLInputElement;
          if (inp) {
            inp.removeAttribute('readonly');
            inp.removeAttribute('disabled');
            if (inp.value !== val) { inp.value = val; fire(inp); }
            return true;
          }
        }
        return false;
      };
      const setSelect = (names: string[], match: string): boolean => {
        if (!match) return false;
        const v = match.toUpperCase();
        for (const n of names) {
          const sel = document.querySelector(\`select[name="\${n}"]\`) as HTMLSelectElement;
          if (sel) {
            for (const o of Array.from(sel.options)) {
              if (o.text.trim().toUpperCase() === v || o.value.toUpperCase() === v) {
                if (sel.value !== o.value) { sel.value = o.value; fire(sel); }
                return true;
              }
            }
            for (const o of Array.from(sel.options)) {
              if (o.text.trim().toUpperCase().includes(v) || o.value.toUpperCase().includes(v)) {
                if (sel.value !== o.value) { sel.value = o.value; fire(sel); }
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
        if (d.displayNames && setInput(d.displayNames, d.match || d.value)) fixed = true;
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

    if (allFixes.length) console.log(\`  ✓ Basic Info values ensured: \${[...new Set(allFixes)].join(', ')}\`);
    return [...new Set(allFixes)];
  }

  // ==================== FILL CURRENCY SUB-TAB (within General) ====================`;

const regex = /(  private async ensureBasicInfoValues[\s\S]*?)(?=  \/\/ ==================== FILL CURRENCY SUB-TAB \(within General\) ====================)/;
if (!regex.test(content)) {
  console.error('Could not find ensureBasicInfoValues method');
  process.exit(1);
}

content = content.replace(regex, newMethod);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Patched ensureBasicInfoValues');
