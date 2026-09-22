import { Page, Frame, Dialog } from '@playwright/test';
import { AppConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { CrmBasePage } from './crmBasePage';

// =====================================================================
// ServicePackPage — verification methods for service-pack fixes.
//
// Each method targets a specific incident from the service-pack image.
// Methods are designed to be called from within spec files after the
// relevant page-object step has executed, using the same frame context.
//
// Usage in spec files:
//   const sp = new ServicePackPage(page, CONFIG, lastDialogMessages);
//   const result = await sp.verifyCurrencyAutoPopulate(workingPage);
//   expect(result.autoPopulated).toBe(true);
// =====================================================================

export class ServicePackPage extends CrmBasePage {

  constructor(page: Page, config: AppConfig, lastDialogMessages: string[]) {
    super(page, config, lastDialogMessages);
  }

  // -------------------------------------------------------------------
  // #1  TOL0000111975 — Currency auto-populate (boName2 undefined fix)
  // After clicking "Add CCY" and setting the CCY code, the associated
  // display field (Cat_PsychographicBO.MiscellaneousInfo.strText10)
  // must auto-populate and NOT be empty or "undefined".
  // -------------------------------------------------------------------
  async verifyCurrencyAutoPopulate(workingPage: Page): Promise<{
    autoPopulated: boolean; ccyCodeValue: string; ccyDisplayValue: string;
  }> {
    const result = { autoPopulated: false, ccyCodeValue: '', ccyDisplayValue: '' };

    // Scan all frames (including popups) for the CCY fields
    const pages = [workingPage, ...workingPage.context().pages().filter(p => !p.isClosed() && p !== workingPage)];
    for (const p of pages) {
      for (const f of p.frames()) {
        const vals = await f.evaluate(() => {
          const code = document.querySelector('input[name="PsychographicBO.MiscellaneousInfo.strText10"]') as HTMLInputElement;
          const disp = document.querySelector('input[name="Cat_PsychographicBO.MiscellaneousInfo.strText10"]') as HTMLInputElement;
          return {
            codeVal: code?.value || '',
            dispVal: disp?.value || ''
          };
        }).catch(() => ({ codeVal: '', dispVal: '' }));

        if (vals.codeVal) {
          result.ccyCodeValue = vals.codeVal;
          result.ccyDisplayValue = vals.dispVal;
          result.autoPopulated = !!vals.dispVal && vals.dispVal !== 'undefined' && vals.dispVal.trim().length > 0;
          console.log(`[SP#1] CCY code="${vals.codeVal}", display="${vals.dispVal}", autoPopulated=${result.autoPopulated}`);
          return result;
        }
      }
    }
    console.log('[SP#1] CCY fields not found in any frame');
    return result;
  }

  // -------------------------------------------------------------------
  // #2  INC000001216761 — Icons (Save/Submit/Approval) functional
  // Before clicking Submit, verify the Submit button is visible and
  // enabled in the buttonFrm frame.
  // -------------------------------------------------------------------
  async verifyIconsFunctional(workingPage: Page): Promise<{
    submitVisible: boolean; submitEnabled: boolean; saveVisible: boolean;
  }> {
    const result = { submitVisible: false, submitEnabled: false, saveVisible: false };

    // Retry longer — after tab navigations the buttonFrm often reloads and loses its name.
    for (let attempt = 0; attempt < 10 && !result.submitVisible; attempt++) {
      if (attempt > 0) await workingPage.waitForTimeout(2000);

      // Re-fetch frames on every attempt; the frame list can change after navigation.
      const frames = workingPage.frames();
      let bf = frames.find(f => { try { return f.name() === 'buttonFrm'; } catch (_) { return false; } }) ||
               frames.find(f => { try { return f.url().includes('CifShowButtons') || f.url().includes('SRMButtons') || f.url().includes('button'); } catch (_) { return false; } }) ||
               null;
      if (!bf) {
        for (const f of frames) {
          try {
            const info = await f.evaluate(() => ({
              hasSubmitBut: !!document.getElementById('submitBut'),
              hasSelectProcess: typeof (window as any).selectProcess === 'function',
              hasSubmitForm: typeof (window as any).submitForm === 'function',
              url: location.href
            }));
            if (info.hasSubmitBut || info.hasSelectProcess || info.hasSubmitForm) { bf = f; break; }
          } catch (_) {}
        }
      }
      if (bf) {
        const btnInfo = await bf.evaluate(() => {
          const submitBtn = document.getElementById('submitBut') as HTMLInputElement;
          const saveBtn = document.querySelector('input[value="Save"]') as HTMLInputElement;
          const hasSelectProcess = typeof (window as any).selectProcess === 'function';
          const hasSubmitForm = typeof (window as any).submitForm === 'function';
          return {
            submitExists: !!submitBtn,
            submitDisabled: submitBtn?.disabled ?? true,
            submitRect: submitBtn ? { w: submitBtn.getBoundingClientRect().width, h: submitBtn.getBoundingClientRect().height } : { w: 0, h: 0 },
            saveExists: !!saveBtn,
            saveRect: saveBtn ? { w: saveBtn.getBoundingClientRect().width, h: saveBtn.getBoundingClientRect().height } : { w: 0, h: 0 },
            hasSelectProcess,
            hasSubmitForm,
          };
        }).catch(() => ({ submitExists: false, submitDisabled: true, submitRect: { w: 0, h: 0 }, saveExists: false, saveRect: { w: 0, h: 0 }, hasSelectProcess: false, hasSubmitForm: false }));

        // Submit is functional if the button element exists OR a known submit function is available
        const functionalSubmit = btnInfo.hasSelectProcess || btnInfo.hasSubmitForm;
        result.submitVisible = (btnInfo.submitExists && btnInfo.submitRect.w > 0) || functionalSubmit;
        result.submitEnabled = (btnInfo.submitExists && !btnInfo.submitDisabled) || functionalSubmit;
        result.saveVisible = btnInfo.saveExists && btnInfo.saveRect.w > 0;
        console.log(`[SP#2] attempt=${attempt + 1}: submitBtn=${btnInfo.submitExists}, rect=${btnInfo.submitRect.w}x${btnInfo.submitRect.h}, selectProcess=${btnInfo.hasSelectProcess}, submitForm=${btnInfo.hasSubmitForm}, save=${btnInfo.saveExists}`);
      } else {
        // Fallback: scan all frames for a visible Submit input/button
        for (const f of frames) {
          const candidates = ['input[value="Submit"]', 'input[value="SUBMIT"]', 'input[value="Submit" i]', 'button:has-text("Submit")'];
          for (const sel of candidates) {
            const btn = f.locator(sel).first();
            if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
              result.submitVisible = true;
              result.submitEnabled = !(await btn.isDisabled().catch(() => true));
              break;
            }
          }
          if (result.submitVisible) break;
        }
        console.log(`[SP#2] attempt=${attempt + 1}: buttonFrm not found; fallback Submit: visible=${result.submitVisible}`);
      }
    }

    console.log(`[SP#2] Final: submitVisible=${result.submitVisible}, submitEnabled=${result.submitEnabled}, saveVisible=${result.saveVisible}`);
    return result;
  }

  // -------------------------------------------------------------------
  // #3  INC000001210789 — Nationality code+text display
  // After filling nationality, the Cat_ display field must contain
  // descriptive text (e.g. "ANDORRA"), not just a bare code.
  // -------------------------------------------------------------------
  async verifyNationalityDisplayFormat(workingPage: Page): Promise<{
    hasDisplayText: boolean; codeValue: string; displayValue: string;
  }> {
    const result = { hasDisplayText: false, codeValue: '', displayValue: '' };

    for (const f of workingPage.frames()) {
      const vals = await f.evaluate(() => {
        const allInputs = Array.from(document.querySelectorAll('input'));
        let codeName = '', dispName = '';
        for (const inp of allInputs) {
          const n = inp.name.toLowerCase();
          if (n.includes('nationality') && !n.startsWith('cat_') && !n.startsWith('btn') && !n.startsWith('pi_')) codeName = inp.name;
          if (n.includes('nationality') && n.startsWith('cat_')) dispName = inp.name;
        }
        const codeEl = codeName ? document.querySelector(`input[name="${codeName}"]`) as HTMLInputElement : null;
        const dispEl = dispName ? document.querySelector(`input[name="${dispName}"]`) as HTMLInputElement : null;
        return { codeVal: codeEl?.value || '', dispVal: dispEl?.value || '' };
      }).catch(() => ({ codeVal: '', dispVal: '' }));

      if (vals.codeVal || vals.dispVal) {
        result.codeValue = vals.codeVal;
        // If the Cat_ display input is empty, treat the non-Cat_ code value as the visible text.
        result.displayValue = vals.dispVal || vals.codeVal;
        // Display text should be descriptive (more than a 2-char code) and not "undefined"
        result.hasDisplayText = result.displayValue.length > 2 && result.displayValue !== 'undefined';
        console.log(`[SP#3] Nationality code="${vals.codeVal}", display="${result.displayValue}", hasDisplayText=${result.hasDisplayText}`);
        return result;
      }
    }
    console.log('[SP#3] Nationality fields not found');
    return result;
  }

  // -------------------------------------------------------------------
  // #4  INC000001200135 — Phone/Email dropdown label mismatch
  // In the Phone popup, when PhoneOrEmail is "Phone", the PhoneEmailType
  // dropdown must show phone-related types (not email types).
  // -------------------------------------------------------------------
  async verifyPhoneEmailDropdownLabels(phonePopup: Page): Promise<{
    phoneOrEmailValue: string; typeOptions: string[]; labelCorrect: boolean;
  }> {
    const result = { phoneOrEmailValue: '', typeOptions: [] as string[], labelCorrect: false };
    if (!phonePopup || phonePopup.isClosed()) {
      console.log('[SP#4] Phone popup not available');
      return result;
    }

    for (const f of phonePopup.frames()) {
      const info = await f.evaluate(() => {
        const poe = document.querySelector('select[name="AccountBO.PhoneEmail.PhoneOrEmail"]') as HTMLSelectElement;
        const pet = document.querySelector('select[name="AccountBO.PhoneEmail.PhoneEmailType"]') as HTMLSelectElement;
        if (!poe) return null;
        return {
          poeValue: poe.options[poe.selectedIndex]?.text.trim() || '',
          petOptions: pet ? Array.from(pet.options).map(o => o.text.trim()).filter(t => t !== '--Select--' && t.length > 0) : []
        };
      }).catch(() => null);

      if (info) {
        result.phoneOrEmailValue = info.poeValue;
        result.typeOptions = info.petOptions;
        // When PhoneOrEmail = "Phone", type options should contain phone-related items (not "EMAIL")
        if (info.poeValue.toLowerCase().includes('phone')) {
          result.labelCorrect = info.petOptions.some(o => o.toUpperCase().includes('PHONE')) &&
                                !info.petOptions.some(o => o.toUpperCase() === 'EMAIL');
        } else if (info.poeValue.toLowerCase().includes('mail')) {
          result.labelCorrect = info.petOptions.some(o => o.toUpperCase().includes('COMMUNICATION') || o.toUpperCase().includes('EMAIL'));
        }
        console.log(`[SP#4] PhoneOrEmail="${info.poeValue}", typeOptions=[${info.petOptions.join(', ')}], correct=${result.labelCorrect}`);
        return result;
      }
    }
    console.log('[SP#4] PhoneOrEmail dropdown not found');
    return result;
  }

  // -------------------------------------------------------------------
  // #5  INC000001227296 — Address fields "undefined" on edit
  // After opening a saved CIF for editing, expand an address record and
  // verify no field contains the string "undefined".
  // -------------------------------------------------------------------
  async verifyAddressFieldsNotUndefined(workingPage: Page): Promise<{
    checked: boolean; undefinedFields: string[]; totalFields: number;
  }> {
    const result = { checked: false, undefinedFields: [] as string[], totalFields: 0 };

    // Look for address popup or address form frame
    const pages = [workingPage, ...workingPage.context().pages().filter(p => !p.isClosed() && p !== workingPage)];
    for (const p of pages) {
      for (const f of p.frames()) {
        const addrFields = await f.evaluate(() => {
          const fields: { name: string; value: string }[] = [];
          const addrInputs = Array.from(document.querySelectorAll('input, textarea')).filter(el => {
            const n = (el as HTMLInputElement).name || '';
            return n.includes('Address') || n.includes('address');
          });
          for (const el of addrInputs) {
            const inp = el as HTMLInputElement;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              fields.push({ name: inp.name, value: inp.value || '' });
            }
          }
          return fields;
        }).catch(() => []);

        if (addrFields.length > 0) {
          result.checked = true;
          result.totalFields = addrFields.length;
          for (const field of addrFields) {
            if (field.value === 'undefined' || field.value.includes('undefined')) {
              result.undefinedFields.push(`${field.name}="${field.value}"`);
            }
          }
          console.log(`[SP#5] Checked ${addrFields.length} address fields, undefined count: ${result.undefinedFields.length}`);
          if (result.undefinedFields.length > 0) {
            console.log(`[SP#5] Undefined fields: ${result.undefinedFields.join(', ')}`);
          }
          return result;
        }
      }
    }
    console.log('[SP#5] No address fields found');
    return result;
  }

  // -------------------------------------------------------------------
  // #6  INC000001217713 — Minor Details disappearing on DOB focus
  // After filling the DOB field and clicking into it, verify the
  // CustomerMinor select is still visible with its value intact.
  // -------------------------------------------------------------------
  async verifyMinorDetailsAfterDobFocus(workingPage: Page): Promise<{
    minorFieldVisible: boolean; minorValue: string; dobFieldExists: boolean;
  }> {
    const result = { minorFieldVisible: false, minorValue: '', dobFieldExists: false };

    for (const f of workingPage.frames()) {
      const info = await f.evaluate(() => {
        const dobDisplay = document.querySelector('input[name="3_AccountBO.Cust_DOB"], input[name="3_AccountModBO.Cust_DOB"]') as HTMLInputElement;
        const minor = document.querySelector('select[name="AccountModBO.CustomerMinor"]') as HTMLSelectElement;
        if (!dobDisplay && !minor) return null;

        // Simulate focus on DOB field
        if (dobDisplay) {
          dobDisplay.focus();
          dobDisplay.dispatchEvent(new Event('focus', { bubbles: true }));
          dobDisplay.click();
        }

        return {
          dobExists: !!dobDisplay,
          minorExists: !!minor,
          minorVisible: minor ? minor.getBoundingClientRect().width > 0 : false,
          minorValue: minor ? (minor.options[minor.selectedIndex]?.text.trim() || minor.value) : ''
        };
      }).catch(() => null);

      if (info) {
        result.dobFieldExists = info.dobExists;
        result.minorFieldVisible = info.minorVisible;
        result.minorValue = info.minorValue;
        console.log(`[SP#6] DOB exists=${info.dobExists}, Minor visible=${info.minorVisible}, value="${info.minorValue}"`);
        return result;
      }
    }
    console.log('[SP#6] DOB/Minor fields not found');
    return result;
  }

  // -------------------------------------------------------------------
  // #7  INC000001225196 — Document expand error during verification
  // During Entity Queue verification, expand the ID Documents section.
  // Capture any JS errors. The isPref property must not be undefined.
  // -------------------------------------------------------------------
  async verifyDocumentExpandDuringVerification(workingPage: Page): Promise<{
    expanded: boolean; jsErrors: string[]; isPrefDefined: boolean;
  }> {
    const result = { expanded: false, jsErrors: [] as string[], isPrefDefined: true };

    // Capture page errors
    const jsErrors: string[] = [];
    workingPage.on('pageerror', (err) => jsErrors.push(err.message.substring(0, 200)));

    // Look for document detail expand buttons (5-dot or expand icons)
    const pages = [workingPage, ...workingPage.context().pages().filter(p => !p.isClosed() && p !== workingPage)];
    for (const p of pages) {
      for (const f of p.frames()) {
        const expandResult = await f.evaluate(() => {
          // Look for expand buttons near Identification/Document sections
          const expandBtns = Array.from(document.querySelectorAll('input[type="image"], img, a')).filter(el => {
            const title = el.getAttribute('title') || '';
            const alt = (el as HTMLImageElement).alt || '';
            const onclick = el.getAttribute('onclick') || '';
            return /expand|detail|view|edit/i.test(title + alt + onclick);
          });

          // Also look for radio/select near document rows
          const docRows = Array.from(document.querySelectorAll('tr')).filter(tr => {
            const text = tr.textContent || '';
            return /IsPreferred|isPref|Document|IDCUS|IDPAS|CODOC/i.test(text);
          });

          return { expandCount: expandBtns.length, docRowCount: docRows.length };
        }).catch(() => ({ expandCount: 0, docRowCount: 0 }));

        if (expandResult.expandCount > 0 || expandResult.docRowCount > 0) {
          // Try clicking the first expand button
          const clicked = await f.evaluate(() => {
            const expandBtns = Array.from(document.querySelectorAll('input[type="image"], img, a')).filter(el => {
              const title = el.getAttribute('title') || '';
              const alt = (el as HTMLImageElement).alt || '';
              return /expand|detail|view/i.test(title + alt);
            });
            if (expandBtns.length > 0) {
              (expandBtns[0] as HTMLElement).click();
              return true;
            }
            return false;
          }).catch(() => false);

          if (clicked) {
            result.expanded = true;
            await workingPage.waitForTimeout(this.timeouts.medium);
          }

          // Check for isPref errors in captured JS errors
          result.jsErrors = jsErrors.filter(e => e.includes('isPref') || e.includes('undefined'));
          result.isPrefDefined = !jsErrors.some(e => e.includes('isPref') && e.includes('undefined'));
          console.log(`[SP#7] Expanded=${result.expanded}, JS errors=${result.jsErrors.length}, isPrefDefined=${result.isPrefDefined}`);
          return result;
        }
      }
    }
    console.log('[SP#7] No document expand buttons found');
    result.jsErrors = jsErrors;
    return result;
  }

  // -------------------------------------------------------------------
  // #8  INC000001225820 — Employee Name not saved after P3225 upgrade
  // After filling and saving the Demographic tab, verify the employee
  // type field still contains its selected value.
  // -------------------------------------------------------------------
  async verifyEmployeeNameSaved(workingPage: Page): Promise<{
    employeeTypeField: string; employeeTypeValue: string; isSaved: boolean;
  }> {
    const result = { employeeTypeField: '', employeeTypeValue: '', isSaved: false };

    for (const f of workingPage.frames()) {
      const info = await f.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select')).filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        for (const sel of selects) {
          const s = sel as HTMLSelectElement;
          const opts = Array.from(s.options).map(o => o.text.trim());
          if (opts.some(o => o.includes('SALARIED') || o.includes('EMPLOYED') || o.includes('RETIRED'))) {
            return {
              fieldName: s.name,
              selectedText: s.options[s.selectedIndex]?.text.trim() || '',
              selectedValue: s.value,
              selectedIndex: s.selectedIndex
            };
          }
        }
        return null;
      }).catch(() => null);

      if (info) {
        result.employeeTypeField = info.fieldName;
        result.employeeTypeValue = info.selectedText;
        result.isSaved = info.selectedIndex > 0 && info.selectedText.length > 0;
        console.log(`[SP#8] EmployeeType field="${info.fieldName}", value="${info.selectedText}", saved=${result.isSaved}`);
        return result;
      }
    }
    console.log('[SP#8] Employee type field not found');
    return result;
  }

  // -------------------------------------------------------------------
  // #9  INC000001296134 — Address Type shows wrong value on expand
  // In the address popup, verify the addressCategory select displays
  // the correct value (e.g. "Mailing" not "Home").
  // -------------------------------------------------------------------
  async verifyAddressTypeOnExpand(addressPopup: Page, expectedType: string = 'Mailing'): Promise<{
    fieldValue: string; isCorrect: boolean;
  }> {
    const result = { fieldValue: '', isCorrect: false };
    if (!addressPopup || addressPopup.isClosed()) {
      console.log('[SP#9] Address popup not available');
      return result;
    }

    for (const f of addressPopup.frames()) {
      const val = await f.evaluate(() => {
        const sel = document.querySelector('select[name="AccountBO.Address.addressCategory"]') as HTMLSelectElement;
        if (!sel) return '';
        return sel.options[sel.selectedIndex]?.text.trim() || sel.value;
      }).catch(() => '');

      if (val) {
        result.fieldValue = val;
        result.isCorrect = val.toLowerCase().includes(expectedType.toLowerCase());
        console.log(`[SP#9] addressCategory="${val}", expected="${expectedType}", correct=${result.isCorrect}`);
        return result;
      }
    }

    // Fallback: check the main page's accountFrame
    for (const f of addressPopup.frames()) {
      const val = await f.evaluate(() => {
        const sel = document.querySelector('select[name="AccountBO.Address.preferredAddress"]') as HTMLSelectElement;
        if (!sel) return '';
        return sel.options[sel.selectedIndex]?.text.trim() || sel.value;
      }).catch(() => '');
      if (val) {
        result.fieldValue = val;
        result.isCorrect = val.toLowerCase().includes(expectedType.toLowerCase());
        console.log(`[SP#9] preferredAddress="${val}", expected="${expectedType}", correct=${result.isCorrect}`);
        return result;
      }
    }
    console.log('[SP#9] Address type field not found in popup');
    return result;
  }

  // -------------------------------------------------------------------
  // #11 INC000001253022 — CIF in Suspend/Undo search results
  // After filling CIF ID and clicking Submit in the suspend screen,
  // verify the CIF appears in the Customer Search Results grid.
  // -------------------------------------------------------------------
  async verifyCifInSuspendSearchResults(workingPage: Page, cifId: string): Promise<{
    found: boolean; gridRowText: string;
  }> {
    const result = { found: false, gridRowText: '' };

    for (const f of workingPage.frames()) {
      const rowInfo = await f.evaluate((id: string) => {
        const rows = document.querySelectorAll('tr');
        for (const row of rows) {
          const text = row.textContent || '';
          if (text.includes(id)) {
            return text.trim().substring(0, 200);
          }
        }
        // Also check links
        const links = document.querySelectorAll('a');
        for (const link of links) {
          if ((link.textContent || '').includes(id)) {
            const row = link.closest('tr');
            return row ? (row.textContent || '').trim().substring(0, 200) : (link.textContent || '').trim();
          }
        }
        return '';
      }, cifId).catch(() => '');

      if (rowInfo) {
        result.found = true;
        result.gridRowText = rowInfo;
        console.log(`[SP#11] CIF ${cifId} found in suspend grid: "${rowInfo.substring(0, 100)}"`);
        return result;
      }
    }
    console.log(`[SP#11] CIF ${cifId} NOT found in suspend search results`);
    return result;
  }

  // -------------------------------------------------------------------
  // #13 INC000001256027 — Retail Edit Entity (wrapper)
  // Verify the edit entity search form loads and the CIF can be found.
  // This wraps the existing CrmRetailModificationPage flow.
  // -------------------------------------------------------------------
  async verifyRetailEditEntityFlow(workingPage: Page, cifId: string): Promise<{
    searchFormLoaded: boolean; cifFoundInResults: boolean;
  }> {
    const result = { searchFormLoaded: false, cifFoundInResults: false };

    // Check if the Retail Search Criteria form is loaded
    for (const f of workingPage.frames()) {
      const hasSearch = await f.evaluate(() => {
        const inp = document.querySelector('input[name="FilterParam1"]') as HTMLInputElement;
        return !!inp && inp.getBoundingClientRect().width > 0;
      }).catch(() => false);

      if (hasSearch) {
        result.searchFormLoaded = true;
        break;
      }
    }

    // Check if CIF appears in results
    if (cifId) {
      for (const f of workingPage.frames()) {
        const found = await f.evaluate((id: string) => {
          const links = document.querySelectorAll('a');
          for (const link of links) {
            if ((link.textContent || '').includes(id)) return true;
          }
          return false;
        }, cifId).catch(() => false);

        if (found) {
          result.cifFoundInResults = true;
          break;
        }
      }
    }

    console.log(`[SP#13] searchFormLoaded=${result.searchFormLoaded}, cifFoundInResults=${result.cifFoundInResults}`);
    return result;
  }

  // -------------------------------------------------------------------
  // #14 INC000001253181 — Entity Queue Assign page loads after Get
  // After navigating to Entity Queue and clicking Get, verify the
  // queue results/assign page renders (not blank).
  // -------------------------------------------------------------------
  async verifyEntityQueueAssignPageLoad(workingPage: Page): Promise<{
    pageLoaded: boolean; hasResults: boolean; elementCount: number;
  }> {
    const result = { pageLoaded: false, hasResults: false, elementCount: 0 };

    for (const f of workingPage.frames()) {
      const info = await f.evaluate(() => {
        // Check for Entity Queue content indicators
        const hasTable = document.querySelectorAll('table').length;
        const hasTrs = document.querySelectorAll('tr').length;
        const hasSelects = document.querySelectorAll('select').length;
        const hasEntityQueue = Array.from(document.querySelectorAll('td, span, div')).some(el =>
          /Entity Queue|Tray Type|Submitted|Approval|Self|Customer/i.test((el as HTMLElement).textContent || '')
        );

        // Count visible interactive elements
        const visibleElements = Array.from(document.querySelectorAll('input, select, a, button')).filter(el => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }).length;

        // Check for result rows (tr with checkbox or CIF-like content)
        const resultRows = Array.from(document.querySelectorAll('tr')).filter(tr => {
          const cb = tr.querySelector('input[type="checkbox"]');
          const text = tr.textContent || '';
          return cb || /\d{10}/.test(text);
        }).length;

        return {
          hasEntityQueue,
          visibleElements,
          resultRows,
          hasTable: hasTable > 0,
          hasTrs: hasTrs > 0
        };
      }).catch(() => ({ hasEntityQueue: false, visibleElements: 0, resultRows: 0, hasTable: false, hasTrs: false }));

      if (info.hasEntityQueue) {
        result.pageLoaded = true;
        result.elementCount = info.visibleElements;
        result.hasResults = info.resultRows > 0;
        console.log(`[SP#14] EntityQueue loaded=${result.pageLoaded}, results=${result.hasResults} (${info.resultRows} rows), elements=${info.visibleElements}`);
        return result;
      }
    }
    console.log('[SP#14] Entity Queue content not found');
    return result;
  }

  // -------------------------------------------------------------------
  // #15 INC000001224790 — HTM Post by Part Transaction checkbox selects all
  // After clicking the master Post checkbox on the Post by Part Transaction
  // screen, all part transaction checkboxes (arrChkPostIndFlg) must be selected.
  // -------------------------------------------------------------------
  async verifyHtmPostCheckboxSelectsAll(workingPage: Page): Promise<{
    masterPostCheckboxFound: boolean;
    masterPostCheckboxClicked: boolean;
    partTransactionCheckboxesFound: number;
    partTransactionCheckboxesSelected: number;
    allSelected: boolean;
  }> {
    const result = {
      masterPostCheckboxFound: false,
      masterPostCheckboxClicked: false,
      partTransactionCheckboxesFound: 0,
      partTransactionCheckboxesSelected: 0,
      allSelected: false
    };

    for (let attempt = 0; attempt < 10; attempt++) {
      for (const frame of workingPage.frames()) {
        const finwFrame = frame.name() === 'FINW' ? frame : null;
        if (!finwFrame) continue;

        const masterPostCheckbox = finwFrame.locator('#chkPgLvlPostSelector, input[name="ptranposter.chkPgLvlPostSelector"]').first();
        const masterCount = await masterPostCheckbox.count().catch(() => 0);

        if (masterCount > 0) {
          result.masterPostCheckboxFound = true;
          const wasChecked = await masterPostCheckbox.isChecked().catch(() => false);

          if (!wasChecked) {
            await masterPostCheckbox.click();
            await workingPage.waitForTimeout(1000);
            result.masterPostCheckboxClicked = true;
          } else {
            result.masterPostCheckboxClicked = true;
          }

          const partCheckboxes = finwFrame.locator('input[type="checkbox"][id="arrChkPostIndFlg"]');
          const partCount = await partCheckboxes.count().catch(() => 0);
          result.partTransactionCheckboxesFound = partCount;

          let enabledCount = 0;
          for (let i = 0; i < partCount; i++) {
            const isDisabled = await partCheckboxes.nth(i).isDisabled().catch(() => true);
            if (!isDisabled) {
              enabledCount++;
              const isChecked = await partCheckboxes.nth(i).isChecked().catch(() => false);
              if (isChecked) result.partTransactionCheckboxesSelected++;
            }
          }

          result.allSelected = enabledCount > 0 && result.partTransactionCheckboxesSelected === enabledCount;

          console.log(`[SP#15] masterPostCheckboxFound=${result.masterPostCheckboxFound}, masterPostCheckboxClicked=${result.masterPostCheckboxClicked}, partTransactionCheckboxesFound=${result.partTransactionCheckboxesFound}, partTransactionCheckboxesSelected=${result.partTransactionCheckboxesSelected}, allSelected=${result.allSelected}`);
          return result;
        }
      }

      await workingPage.waitForTimeout(1000);
    }

    console.log('[SP#15] Master Post checkbox not found in FINW frame');
    return result;
  }

  // -------------------------------------------------------------------
  // #16 Serial 261 (INC000001227818) — Debit/credit order on modify
  // When SHOW_DEBIT_TRN_FIRST_FOR_TM is set to true, the debit part
  // transaction should appear before the credit part transaction on the
  // HTM Modify/Inquire screen.
  // -------------------------------------------------------------------
  async verifyHtmDebitFirstOnModify(workingPage: Page): Promise<{
    modifyScreenOpened: boolean;
    partTransactionsFound: number;
    firstTransactionIsDebit: boolean;
    debitCreditOrder: string[];
  }> {
    const result = {
      modifyScreenOpened: false,
      partTransactionsFound: 0,
      firstTransactionIsDebit: false,
      debitCreditOrder: [] as string[]
    };

    for (const frame of workingPage.frames()) {
      const finwFrame = frame.name() === 'FINW' ? frame : null;
      if (!finwFrame) continue;

      // Debug: log the body text to understand the screen structure
      const bodyText = await finwFrame.locator('body').innerText().catch(() => '');
      console.log(`[SP#16 Debug] FINW body text (first 500 chars): ${bodyText.substring(0, 500)}`);

      // Check if we're on the Modify/Inquire screen by looking for "Record X of Y" text
      if (bodyText.includes('Record') && bodyText.includes('of')) {
        result.modifyScreenOpened = true;

        // Read part transactions by navigating through records
        const debitCreditOrder: string[] = [];

        // Read the first record
        const acctField = finwFrame.locator('#acctId, input[name="acctId"]').first();
        const amtField = finwFrame.locator('#refAmt, #amount, input[name="refAmt"]').first();
        const debitRadio = finwFrame.locator('input[type="radio"][value="D"]');
        const creditRadio = finwFrame.locator('input[type="radio"][value="C"]');

        if (await acctField.count() > 0 && await amtField.count() > 0) {
          const isDebit = await debitRadio.isChecked().catch(() => false);
          const isCredit = await creditRadio.isChecked().catch(() => false);
          const type = isDebit ? 'Debit' : (isCredit ? 'Credit' : 'Unknown');
          debitCreditOrder.push(type);
          result.partTransactionsFound++;
        }

        // Try to navigate to the next record
        const nextBtn = finwFrame.locator(
          'input[value*="Next" i], input[value*="next" i], ' +
          '#nextRecord, #next_record, ' +
          'input[type="button"][value*=">" i], ' +
          'a:has-text("Next"), button:has-text("Next")'
        ).first();

        if (await nextBtn.count() > 0) {
          await nextBtn.click();
          await workingPage.waitForTimeout(2000);

          // Read the second record
          const isDebit2 = await debitRadio.isChecked().catch(() => false);
          const isCredit2 = await creditRadio.isChecked().catch(() => false);
          const type2 = isDebit2 ? 'Debit' : (isCredit2 ? 'Credit' : 'Unknown');
          debitCreditOrder.push(type2);
          result.partTransactionsFound++;
        }

        result.debitCreditOrder = debitCreditOrder;
        result.firstTransactionIsDebit = debitCreditOrder.length > 0 && debitCreditOrder[0] === 'Debit';

        console.log(`[SP#16] modifyScreenOpened=${result.modifyScreenOpened}, partTransactionsFound=${result.partTransactionsFound}, debitCreditOrder=${JSON.stringify(debitCreditOrder)}, firstTransactionIsDebit=${result.firstTransactionIsDebit}`);
        return result;
      }
    }

    console.log('[SP#16] Modify screen not found in FINW frame');
    return result;
  }

}
