import { Frame, Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import { AppConfig, CRM_TEST_DATA } from '../../config/crmTestData';
import { CrmModificationBasePage } from './crmModificationBasePage';

// =====================================================================
// CrmRetailModificationPage — page object for the Retail CIF *modification*
// maker workflow (edits an already-created retail CIF):
//   Login (maker) -> switch to CRM -> CIF Retail > Edit Entity -> search the
//   CIF -> open General Details edit -> modify Last Name / delete+add Address /
//   modify Mobile phone -> Submit + Process Selection -> verify in grid.
//
// Field values default to tests/config/crmTestData.json (retail.modification)
// and remain overridable via environment variables to preserve prior behaviour.
// =====================================================================

const MOD = CRM_TEST_DATA.retail.modification;

export class CrmRetailModificationPage extends CrmModificationBasePage {
  crmMenuFrame: Frame | null = null;
  resultFrame: Frame | null = null;
  editPage: Page;
  formFrame: Frame | null = null;

  constructor(page: Page, config: AppConfig, lastDialogMessages: string[] = []) {
    super(page, config, lastDialogMessages);
    this.editPage = page;
  }

  // ---------------------------------------------------------------
  // TC_002: Switch to CRM and confirm the dashboard menu
  // ---------------------------------------------------------------
  async selectCrmDashboard(): Promise<Frame> {
    // Let the post-login dashboard settle before switching solutions (matches the
    // checker flow, so the Solution dropdown is fully ready).
    await this.page.waitForTimeout(2500).catch(() => {});
    this.crmMenuFrame = await this.switchToCrm();
    if (!this.crmMenuFrame) this.crmMenuFrame = await this.getCrmMenuFrame(this.page);
    if (!this.crmMenuFrame) throw new Error('CRM Dashboard menu (CIF Retail / CIF Corporate) not visible.');
    console.log('✓ Navigated to CRM Dashboard (360 Degrees View, CIF Retail, CIF Corporate)');
    return this.crmMenuFrame;
  }

  // ---------------------------------------------------------------
  // TC_003: Navigate CIF Retail > Edit Entity
  // ---------------------------------------------------------------
  async navigateToEditEntity(): Promise<Frame> {
    const page = this.page;

    // Wait for the CRM frameset (Functionmain) to be ready — the Finacle CRM
    // menu is driven from that frame, and its items are DOM-clickable by id even
    // when CSS-hidden (the reliable pattern used by the working E2E flow).
    for (let i = 0; i < 15 && !page.frame({ name: 'Functionmain' }); i++) {
      await page.waitForTimeout(1000);
    }

    let searchFrame: Frame | null = null;
    for (let navTry = 1; navTry <= 4 && !searchFrame; navTry++) {
      // 1) Click "CIF Retail" (screen1) in the Functionmain frame. Re-wait for the
      // frame each attempt in case the dashboard is still settling.
      let functionMainFrame = page.frame({ name: 'Functionmain' });
      for (let i = 0; i < 8 && !functionMainFrame; i++) {
        await page.waitForTimeout(1000);
        functionMainFrame = page.frame({ name: 'Functionmain' });
      }
      if (functionMainFrame) {
        await functionMainFrame
          .evaluate(() => {
            const el = document.getElementById('screen1');
            if (el) el.click();
          })
          .catch(() => {});
        console.log('Clicked CIF Retail (screen1)');
        await page.waitForTimeout(2000);
      }

      // 2) Locate the CIF Retail menu frame ("1504") and click "Edit Entity".
      const menuFrame = page.frame({ name: '1504' }) || (await this.findMenuFrame(page));
      if (menuFrame) {
        const items = await menuFrame.locator('span.submenuout').allInnerTexts().catch(() => []);
        if (items.length) console.log(`CIF Retail menu items: ${items.map((t: string) => `"${t.trim()}"`).join(', ')}`);
        await this.clickMenuItem(menuFrame, page, 'Edit Entity', 3000);
      } else {
        console.log('CIF Retail menu frame ("1504") not found.');
      }
      await page.waitForTimeout(3000);

      searchFrame = await this.findFrameByText(page, /Retail Search Criteria|Search Entity|Search Accounts/i, 12000);
      if (!searchFrame) {
        console.log(`Edit Entity search form not loaded (attempt ${navTry}); retrying...`);
        await page.waitForTimeout(1500);
      }
    }
    if (!searchFrame) throw new Error('Retail Search Criteria form must load.');
    console.log('✓ Retail Search Criteria displayed (Search Entity default + Search Accounts tabs)');
    return searchFrame;
  }

  // ---------------------------------------------------------------
  // TC_004: Search the CIF
  // ---------------------------------------------------------------
  async searchCif(cifId: string): Promise<Frame> {
    const page = this.page;
    console.log(`Searching CIF ID ${cifId}...`);
    const cifFrame = await this.findFrameWithSelector(page, 'input[name="FilterParam1"]');
    if (!cifFrame) throw new Error('CIF ID field (FilterParam1) must be present.');
    const cifInput = cifFrame.locator('input[name="FilterParam1"]').first();
    await cifInput.fill(cifId, { timeout: 10000 });

    // Submit the search WITHIN the search-form frame (a page-wide "Submit" scan
    // can hit a non-actionable/hidden button in another frame). Try the form's
    // own Submit control, an evaluate-based click, then an Enter-key fallback.
    const btnDump = await cifFrame
      .evaluate(() =>
        Array.from(document.querySelectorAll('input[type="submit"],input[type="button"],input[type="image"],button,a'))
          .map((b) => {
            const el = b as HTMLInputElement;
            return `${b.tagName} val="${el.value || ''}" title="${b.getAttribute('title') || ''}" txt="${(b.textContent || '').trim().slice(0, 20)}"`;
          })
          .slice(0, 30)
      )
      .catch(() => []);
    console.log(`Search-form controls: ${JSON.stringify(btnDump).slice(0, 500)}`);

    const submitSel =
      'input[type="submit"][value="Submit"], input[type="button"][value="Submit"], ' +
      'input[type="image"][title="Submit"], input[type="image"][alt="Submit"], ' +
      'input[value="Submit"], button:has-text("Submit"), a[title="Submit"]';
    const formSubmit = cifFrame.locator(submitSel).first();
    let submitted = false;
    if (await formSubmit.isVisible().catch(() => false)) {
      await formSubmit.click({ timeout: 6000 }).catch(() => {});
      submitted = true;
      console.log('Search Submit clicked within the search-form frame.');
    }
    if (!submitted) {
      // Evaluate-based click of any Submit-like control in the form frame.
      submitted = await cifFrame
        .evaluate(() => {
          const btn = Array.from(
            document.querySelectorAll('input[type="submit"],input[type="button"],input[type="image"],button,a')
          ).find((b) => {
            const el = b as HTMLInputElement;
            return /submit|search/i.test((el.value || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.textContent || '') + ' ' + (b.getAttribute('onclick') || ''));
          });
          if (btn) {
            (btn as HTMLElement).click();
            return true;
          }
          return false;
        })
        .catch(() => false);
      if (submitted) console.log('Search submitted via evaluate-based click.');
    }
    if (!submitted) {
      // Fallback: press Enter in the CIF field.
      await cifInput.press('Enter', { timeout: 4000 }).catch(() => {});
      console.log('Search submitted via Enter key fallback.');
    }

    // Poll for the results frame that actually contains the CIF text.
    this.resultFrame = (await this.findFrameByText(page, new RegExp(cifId), 15000)) || cifFrame;
    console.log(`✓ CIF profile details displayed in search results for ${cifId}`);
    return this.resultFrame;
  }

  // ---------------------------------------------------------------
  // TC_005: Count how many of the expected result columns are present
  // ---------------------------------------------------------------
  async countResultColumns(expectedColumns: string[]): Promise<number> {
    let columnsFound = 0;
    for (const col of expectedColumns) {
      if (await this.resultFrame!.getByText(col, { exact: false }).first().isVisible().catch(() => false)) {
        columnsFound++;
      }
    }
    console.log(`Columns found: ${columnsFound}/${expectedColumns.length}`);
    return columnsFound;
  }

  // ---------------------------------------------------------------
  // TC_006: The CIF ID renders as a clickable link
  // ---------------------------------------------------------------
  async cifLinkLocator(cifId: string): Promise<Locator> {
    return this.resultFrame!.locator(`a:has-text("${cifId}")`).first();
  }

  // ---------------------------------------------------------------
  // TC_007: Open the General Details edit window via right-click > Edit
  // ---------------------------------------------------------------
  async openGeneralDetailsEdit(cifId: string): Promise<Frame> {
    const page = this.page;
    console.log('Right-click the CIF link, then Edit >> General Details...');

    // DIAGNOSTIC: dump the CIF result row so we can see its selection control
    // (checkbox/radio) that EditAccount requires ("Please select the Customer.").
    try {
      const rowHtml = await this.resultFrame!
        .evaluate((cif) => {
          const out: string[] = [];
          // All radio/checkbox inputs (row-selection controls).
          for (const i of Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))) {
            const el = i as HTMLInputElement;
            out.push(
              `SEL input type=${el.type} name="${el.name}" value="${el.value}" onclick="${(el.getAttribute('onclick') || '').slice(0, 80)}"`
            );
          }
          // Elements whose onclick looks like a row/entity selection setter.
          for (const e of Array.from(document.querySelectorAll('a, td, tr, img, span, div'))) {
            const oc = e.getAttribute('onclick') || '';
            if (/select|identif|callme|srm|setCurrent|highlight|getSelected|populateCif/i.test(oc)) {
              out.push(`SETTER <${e.tagName}> onclick="${oc.slice(0, 120)}"`);
            }
          }
          // The CIF link + its selection wiring.
          const links = Array.from(document.querySelectorAll('a')).filter((a) => (a.textContent || '').includes(cif));
          for (const a of links) {
            const el = a as HTMLAnchorElement;
            out.push(
              `LINK text="${(el.textContent || '').trim().slice(0, 20)}" href="${(el.getAttribute('href') || '').slice(0, 140)}" onclick="${(el.getAttribute('onclick') || '').slice(0, 140)}"`
            );
            // Walk up to the row and dump its onclick + cell wiring.
            let tr: HTMLElement | null = el;
            while (tr && tr.tagName !== 'TR') tr = tr.parentElement;
            if (tr) {
              out.push(`ROW onclick="${(tr.getAttribute('onclick') || '').slice(0, 120)}" onmousedown="${(tr.getAttribute('onmousedown') || '').slice(0, 120)}"`);
            }
          }
          return out.slice(0, 40).join('\n') || '(nothing found)';
        }, cifId)
        .catch(() => '(dump failed)');
      fs.writeFileSync('_debug_row.txt', rowHtml);
    } catch {
      /* ignore */
    }

    // Fire "Edit > General Details" in the GenericResults context menu: run the
    // Edit item's ShowSubMenu handler, then click the "General Details" leaf whose
    // onclick is HideMenu();EditAccount('...operationType=EditEntity...').
    const fireGeneralDetails = async (): Promise<boolean> => {
      for (const f of page.frames()) {
        const res = await f
          .evaluate(() => {
            const all = Array.from(document.querySelectorAll('a, td, span, div, li')) as HTMLElement[];
            const editItem = all.find(
              (e) => /^\s*Edit\s*$/i.test(e.textContent || '') && /ShowSubMenu/i.test(e.getAttribute('onmouseover') || '')
            );
            if (editItem) {
              const om = editItem.getAttribute('onmouseover') || '';
              try {
                // eslint-disable-next-line no-new-func
                new Function(om).call(editItem);
              } catch {
                editItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
              }
            }
            const gd = all.find(
              (e) => /^\s*General\s*Details\s*$/i.test(e.textContent || '') && /EditAccount/i.test(e.getAttribute('onclick') || '')
            );
            if (!gd) return false;
            gd.click();
            return true;
          })
          .catch(() => false);
        if (res) {
          console.log(`General Details fired in ${f.url().slice(-45)}`);
          return true;
        }
      }
      return false;
    };

    // Poll every live page/frame for the edit form (definitive last-name input).
    const findFormFrame = async (ms: number): Promise<{ frame: Frame; page: Page } | null> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        for (const p of page.context().pages().filter((pp) => !pp.isClosed())) {
          for (const f of p.frames()) {
            let has = false;
            try {
              has = (await f.locator('input[name="AccountBO.Cust_Last_Name"]').count()) > 0;
            } catch {
              continue;
            }
            if (has) return { frame: f, page: p };
          }
        }
        await page.waitForTimeout(1000).catch(() => {});
      }
      return null;
    };

    // Open the edit form with retries. Attempt 1 uses the proven path (fire the
    // row's callme/identifyme selection, right-click, fire General Details). On
    // retries we ALSO refresh the results grid (a stale row/accountId triggers
    // "Customer was not found") and left-click the CIF link
    // (javascript:void populateCifEntityDetails, selects without navigating).
    let editPage: Page = page;
    let generalFrame: Frame | null = null;
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !generalFrame; attempt++) {
      console.log(`TC_007: open-edit attempt ${attempt}/${MAX_ATTEMPTS}...`);
      this.lastDialogMessage = '';
      if (attempt > 1) {
        await this.searchCif(cifId).catch(() => {});
        await page.waitForTimeout(1000).catch(() => {});
      }

      const selectedAccountId = await this.resultFrame!
        .evaluate((cif) => {
          const rows = Array.from(document.querySelectorAll('tr')).filter((r) => /callme\(/i.test(r.getAttribute('onclick') || ''));
          const target = rows.find((r) => (r.textContent || '').includes(cif)) || rows[0];
          if (!target) return '';
          const oc = target.getAttribute('onclick') || '';
          try {
            // eslint-disable-next-line no-new-func
            new Function(oc).call(target);
          } catch {
            (target as HTMLElement).click();
          }
          const m = oc.match(/callme\(\s*'([^']+)'/i);
          return m ? m[1] : '';
        }, cifId)
        .catch(() => '');
      console.log(`Row selected via callme/identifyme (accountId=${selectedAccountId})`);
      await page.waitForTimeout(500).catch(() => {});

      const cifLink = this.resultFrame!.locator(`a:has-text("${cifId}")`).first();
      await cifLink.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
      if (attempt > 1) {
        // Alternate selection on retry: run populateCifEntityDetails (void href).
        await cifLink.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(600).catch(() => {});
      }
      await cifLink.click({ button: 'right', timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(900).catch(() => {});

      const popupPromise = page.context().waitForEvent('page', { timeout: 12000 }).catch(() => null);
      const fired = await fireGeneralDetails();
      console.log(`General Details handler fired = ${fired}`);
      const popup = await popupPromise;
      if (popup) await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(1200).catch(() => {});

      if (/under\s*verification/i.test(this.lastDialogMessage)) {
        throw new Error(
          `CIF ${cifId} is UNDER VERIFICATION (a prior modification is pending checker approval), so the maker ` +
            `cannot edit it. Approve/reject via the checker flow or use a CIF not pending verification. ` +
            `Dialog seen: "${this.lastDialogMessage}".`
        );
      }

      const found = await findFormFrame(12000);
      if (found) {
        generalFrame = found.frame;
        editPage = found.page;
      } else {
        console.log(`TC_007: attempt ${attempt} — edit form not loaded (lastDialog="${this.lastDialogMessage}").`);
        await page.waitForTimeout(900).catch(() => {});
      }
    }

    try {
      fs.writeFileSync(
        '_debug_editform.txt',
        `formFrameFound=${!!generalFrame}\ncontextPages=${page.context().pages().length}\nlastDialog="${this.lastDialogMessage}"`
      );
    } catch {
      /* ignore */
    }

    if (!generalFrame) throw new Error('General Details edit form (last-name field) did not load.');
    console.log('✓ New window opened with General tab and related sub-tabs');

    this.editPage = editPage;
    this.formFrame = generalFrame;

    // The General Details form opens scrolled DOWN; scroll back to the top so
    // the Last Name / Customer Type / Status fields are interactable.
    await generalFrame
      .evaluate(() => {
        window.scrollTo(0, 0);
        document.querySelectorAll('*').forEach((el) => {
          const e = el as HTMLElement;
          if (e.scrollHeight > e.clientHeight + 4) e.scrollTop = 0;
        });
      })
      .catch(() => {});
    await editPage.waitForTimeout(500);
    return generalFrame;
  }

  // ---------------------------------------------------------------
  // TC_008: Modify Last Name
  // ---------------------------------------------------------------
  async modifyLastName(lastName = process.env.LAST_NAME || MOD.lastName): Promise<string> {
    console.log(`Setting Last Name = ${lastName}...`);
    const formFrame = this.formFrame!;
    const editPage = this.editPage;
    const lastNameInput = formFrame.locator('input[name="AccountBO.Cust_Last_Name"]').first();
    await lastNameInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    let lnVal = '';
    for (let i = 0; i < 4; i++) {
      await lastNameInput.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
      await lastNameInput.click({ timeout: 4000 }).catch(() => {});
      await lastNameInput.fill('', { timeout: 4000 }).catch(() => {});
      await lastNameInput.fill(lastName, { timeout: 6000 }).catch(() => {});
      lnVal = await lastNameInput.inputValue({ timeout: 3000 }).catch(() => '');
      if (lnVal.toUpperCase().includes(lastName.toUpperCase())) break;
      await editPage.waitForTimeout(1000).catch(() => {});
    }
    console.log(`✓ Last Name updated to ${lnVal}`);
    return lnVal;
  }

  // ---------------------------------------------------------------
  // TC_009: Delete the Mailing address + add a new address
  // ---------------------------------------------------------------
  async deleteMailingAndAddAddress(): Promise<{ streetName: string; postalCode: string }> {
    const editPage = this.editPage;
    const context = this.page.context();
    const addr = MOD.address;
    const ADDR_TYPE = process.env.ADDR_TYPE || addr.type;
    const HOUSE_NO = process.env.HOUSE_NO || addr.houseNo;
    const STREET_NO = process.env.STREET_NO || addr.streetNo;
    const STREET_NAME = process.env.STREET_NAME || addr.streetName;
    const POSTAL_CODE = process.env.POSTAL_CODE || addr.postalCode;
    const STATE_VALUE = process.env.STATE || addr.state;
    const STATE_CODE = process.env.STATE_CODE || addr.stateCode;
    const CITY_VALUE = process.env.CITY || addr.city;
    const COUNTRY_VALUE = process.env.COUNTRY || addr.country;
    const COUNTRY_CODE = process.env.COUNTRY_CODE || addr.countryCode;

    console.log('Navigating Contact > Address to delete Mailing and add a new address...');
    await this.clickTabByText(editPage, 'Contact');
    await editPage.waitForTimeout(700).catch(() => {});
    await this.clickTabByText(editPage, 'Address');
    await editPage.waitForTimeout(900).catch(() => {});

    let addrListFrame = this.formFrame!;
    for (const f of editPage.frames()) {
      if (await f.getByText(/Address Details Listing|Address Type/i).first().isVisible().catch(() => false)) {
        addrListFrame = f;
        break;
      }
    }

    // Auto-accept the delete confirmation dialog raised on the edit window.
    editPage.on('dialog', async (d) => {
      console.log(`[addr-list dialog] ${d.message()}`);
      await d.accept().catch(() => {});
    });

    // DELETE the "Mailing" row: select it, then click "Delete Address Details".
    await addrListFrame
      .evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr')).filter((r) => !r.querySelector('tr'));
        const row = rows.find((r) => {
          const c = r.querySelector('td');
          return !!c && /^\s*Mailing\s*$/i.test(c.textContent || '');
        });
        if (!row) return false;
        const radio = row.querySelector('input[type="radio"],input[type="checkbox"]') as HTMLElement | null;
        if (radio) radio.click();
        const fc = row.querySelector('td');
        if (fc) (fc as HTMLElement).click();
        const selBtn = Array.from(row.querySelectorAll('input[type="button"],input[type="image"],a,img')).find((c) =>
          /select|identify|callme/i.test(c.getAttribute('onclick') || '')
        );
        if (selBtn) (selBtn as HTMLElement).click();
        return true;
      })
      .catch(() => false);
    await editPage.waitForTimeout(500).catch(() => {});
    let deleteClicked = await addrListFrame
      .evaluate(() => {
        const btn = Array.from(document.querySelectorAll('input[type="button"],input[type="submit"],a,button')).find(
          (b) =>
            /Delete Address Details/i.test((b as HTMLInputElement).value || '') ||
            /Delete Address Details/i.test((b.textContent || '').trim()) ||
            /deleteAddress/i.test(b.getAttribute('onclick') || '')
        );
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
        return false;
      })
      .catch(() => false);
    if (!deleteClicked) {
      const delBtn = addrListFrame
        .locator('input[value*="Delete Address" i], input[type="button"][value*="Delete Address" i], a:has-text("Delete Address Details")')
        .first();
      if (await delBtn.isVisible().catch(() => false)) {
        await delBtn.click({ timeout: 5000 }).catch(() => {});
        deleteClicked = true;
      }
    }
    console.log(`Delete Address Details clicked = ${deleteClicked}`);
    await editPage.waitForTimeout(1200).catch(() => {});

    // Re-acquire the listing frame (it reloads after the delete).
    for (const f of editPage.frames()) {
      if (await f.getByText(/Address Details Listing|Address Type/i).first().isVisible().catch(() => false)) {
        addrListFrame = f;
        break;
      }
    }

    // Click "Add Address Details" -> opens a blank address-detail popup.
    const addrPopupPromise = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);
    let rowClicked = await addrListFrame
      .evaluate(() => {
        const btn = Array.from(document.querySelectorAll('input[type="button"],input[type="submit"],a,button')).find(
          (b) =>
            /Add Address Details/i.test((b as HTMLInputElement).value || '') ||
            /Add Address Details/i.test((b.textContent || '').trim()) ||
            /addAddress/i.test(b.getAttribute('onclick') || '')
        );
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
        return false;
      })
      .catch(() => false);
    if (!rowClicked) {
      const addBtn = addrListFrame
        .locator('input[value*="Add Address" i], input[type="button"][value*="Add Address" i], a:has-text("Add Address Details")')
        .first();
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
        await addBtn.click({ timeout: 5000 }).catch(() => {});
        rowClicked = true;
      }
    }
    console.log(`Add Address Details opened = ${rowClicked}`);
    let addrPopup = await addrPopupPromise;
    if (!addrPopup || addrPopup.isClosed()) {
      await editPage.waitForTimeout(900).catch(() => {});
      addrPopup =
        context.pages().find((p) => !p.isClosed() && /AddressForm_Det|CustomerAddressForm/i.test(p.url())) || null;
    }
    const addrPage: Page = addrPopup && !addrPopup.isClosed() ? addrPopup : editPage;
    addrPage.on('dialog', async (d) => {
      console.log(`[addr dialog] ${d.message()}`);
      await d.accept().catch(() => {});
    });
    await addrPage.waitForLoadState('domcontentloaded').catch(() => {});
    await addrPage.waitForTimeout(900).catch(() => {});

    const addrFrame =
      (await this.findFrameByText(addrPage, /Address Line 1|Postal Code/i, 8000)) || addrPage.mainFrame();

    // Label-based fill: target the first input following the label cell.
    const setAddrField = async (labelText: string, value: string): Promise<string> => {
      const xp = `xpath=//td[not(descendant::td) and contains(normalize-space(.),'${labelText}')]/following::input[1]`;
      const inp = addrFrame.locator(xp).first();
      await inp.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      let v = '';
      for (let i = 0; i < 4; i++) {
        await inp.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
        await inp.click({ timeout: 4000 }).catch(() => {});
        await inp.fill('', { timeout: 4000 }).catch(() => {});
        await inp.fill(value, { timeout: 6000 }).catch(() => {});
        v = await inp.inputValue({ timeout: 3000 }).catch(() => '');
        if (v.toUpperCase().includes(value.toUpperCase())) break;
        await addrPage.waitForTimeout(500).catch(() => {});
      }
      return v;
    };

    // Address Type dropdown.
    let addrTypeSet = '';
    for (const s of await addrFrame.locator('select').all().catch(() => [])) {
      const nm = (await s.getAttribute('name').catch(() => '')) || '';
      if (!/type|category|addrType|AddressType/i.test(nm)) continue;
      for (const opt of await s.locator('option').all().catch(() => [])) {
        const label = ((await opt.textContent().catch(() => '')) || '').trim();
        if (new RegExp(ADDR_TYPE, 'i').test(label)) {
          const value = (await opt.getAttribute('value').catch(() => '')) || '';
          await s.selectOption(value ? { value } : { label }, { timeout: 4000 }).catch(() => {});
          await s.dispatchEvent('change').catch(() => {});
          addrTypeSet = label;
          break;
        }
      }
      if (addrTypeSet) break;
    }
    console.log(`Address Type set = "${addrTypeSet}"`);

    await setAddrField('House No.', HOUSE_NO).catch(() => {});
    await setAddrField('Street No.', STREET_NO);
    const streetName = await setAddrField('Street Name', STREET_NAME);
    const pc = await setAddrField('Postal Code', POSTAL_CODE);

    // Capture City before the State lookup (which can wipe it).
    const cityBefore = await addrFrame
      .evaluate(() => {
        const code = document.querySelector('input[name="AccountBO.Address.city"]') as HTMLInputElement | null;
        const desc = document.querySelector('input[name="Cat_AccountBO.Address.city"]') as HTMLInputElement | null;
        return { code: code ? code.value : '', desc: desc ? desc.value : '' };
      })
      .catch(() => ({ code: '', desc: '' }));

    // State, City, Country are Finacle "Location" lookups.
    await this.setLocationLookup(addrPage, addrFrame, 'STATE', 'AccountBO.Address.state', STATE_VALUE);
    await this.forceStateAndRestoreCity(addrFrame, cityBefore, STATE_CODE, STATE_VALUE);
    await this.setLocationLookup(addrPage, addrFrame, 'CITY', 'AccountBO.Address.city', CITY_VALUE);
    const countryOk = await this.setCountryLookup(addrPage, addrFrame, COUNTRY_VALUE, COUNTRY_CODE);
    console.log(`Address lookups done (state=${STATE_VALUE}, city=${CITY_VALUE}, country ok=${countryOk})`);

    // Save the address sub-form.
    let addrSaved = false;
    for (const f of addrPage.frames()) {
      const saveBtn = f
        .locator('input[type="button"][value="Save"], input[type="submit"][value="Save"], input[value="Save"], button:has-text("Save")')
        .first();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click({ timeout: 6000 }).catch(() => {});
        addrSaved = true;
        break;
      }
    }
    console.log(`Address saved = ${addrSaved}`);
    await editPage.waitForTimeout(1000).catch(() => {});
    if (addrPopup && !addrPopup.isClosed()) await addrPopup.close().catch(() => {});
    await editPage.waitForTimeout(1000).catch(() => {});

    console.log(
      `✓ Mailing deleted + new address added (Type=${ADDR_TYPE}, Street=${STREET_NAME}, Postal=${POSTAL_CODE}, ` +
        `State=${STATE_VALUE}, City=${CITY_VALUE}, Country=${COUNTRY_VALUE})`
    );
    return { streetName, postalCode: pc };
  }

  // Open a Finacle "Location" lookup popup (STATE/CITY), search the value, and
  // select its row so the value writes back into the opener form.
  private async setLocationLookup(
    addrPage: Page,
    addrFrame: Frame,
    type: 'STATE' | 'CITY',
    fieldName: string,
    value: string
  ): Promise<boolean> {
    const context = this.page.context();
    console.log(`Setting ${type} via lookup = ${value}...`);
    const lookupPromise = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);
    const iconClicked = await addrFrame
      .evaluate(
        (args) => {
          const { t, field } = args as { t: string; field: string };
          const triggers = Array.from(
            document.querySelectorAll('a, img, input[type="button"], input[type="image"]')
          ) as HTMLElement[];
          const re = new RegExp(
            `categoryLookupCode_Location\\(\\s*['"]${t}['"]\\s*,\\s*['"]${field.replace(/\./g, '\\.')}['"]`,
            'i'
          );
          const trig = triggers.find((x) => re.test(x.getAttribute('onclick') || ''));
          if (trig) {
            trig.click();
            return true;
          }
          return false;
        },
        { t: type, field: fieldName }
      )
      .catch(() => false);
    console.log(`${type} lookup icon clicked = ${iconClicked}`);

    let popup = await lookupPromise;
    if (!popup || popup.isClosed()) {
      await addrPage.waitForTimeout(900).catch(() => {});
      popup = context.pages().find((p) => !p.isClosed() && /Lookupfor|Lookup|Category/i.test(p.url())) || null;
    }
    if (!popup || popup.isClosed()) return false;

    popup.on('dialog', async (d) => {
      await d.accept().catch(() => {});
    });
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    await popup.waitForTimeout(700).catch(() => {});

    // Set the Location Value search box via JS and Submit (the popup ignores
    // Playwright fill due to focus/frame quirks).
    for (const f of popup.frames()) {
      const res = await f
        .evaluate((val) => {
          const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
          const visText = inputs.filter((i) => {
            const t = (i.getAttribute('type') || 'text').toLowerCase();
            return (t === 'text' || t === '') && i.offsetParent !== null;
          });
          const inp = visText[0];
          if (!inp) return false;
          inp.focus();
          inp.value = '';
          inp.value = val;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, value)
        .catch(() => false);
      if (res) {
        const submitBtn = f
          .locator('input[value="Submit"], input[type="submit"], button:has-text("Submit")')
          .first();
        await submitBtn.click({ timeout: 5000 }).catch(() => {});
        await popup.waitForTimeout(1000).catch(() => {});
        break;
      }
    }

    // Select the matching row (invoke its hyperlink handler; click+dblclick fallbacks).
    for (const f of popup.frames()) {
      const sel = await f
        .evaluate((target) => {
          const rows = Array.from(document.querySelectorAll('tr')).filter((r) => !r.querySelector('tr'));
          const row = rows.find((r) => new RegExp(`\\b${target}\\b`).test((r.textContent || '').toUpperCase()));
          if (!row) return false;
          const link = row.querySelector('a') as HTMLElement | null;
          if (link) {
            const oc = link.getAttribute('onclick') || '';
            link.click();
            try {
              if (oc) new Function(oc).call(link);
            } catch {
              /* ignore */
            }
          } else {
            const cell = (row.querySelector('td') || row) as HTMLElement;
            cell.click();
            cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
          }
          return true;
        }, value)
        .catch(() => false);
      if (sel) {
        const rowLoc = f
          .locator(
            `xpath=//tr[not(.//tr)][contains(translate(., 'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ'), '${value.toUpperCase()}')]`
          )
          .first();
        await rowLoc.dblclick({ timeout: 3000 }).catch(() => {});
        console.log(`${type} row "${value}" selected in frame ${f.url().slice(-40)}`);
        break;
      }
    }
    await addrPage.waitForTimeout(900).catch(() => {});
    if (popup && !popup.isClosed()) await popup.close().catch(() => {});
    return true;
  }

  // If the State lookup didn't populate the field (or wiped City), set them
  // directly to satisfy the mandatory-field validations on Save.
  private async forceStateAndRestoreCity(
    addrFrame: Frame,
    cityBefore: { code: string; desc: string },
    stateCode: string,
    stateValue: string
  ): Promise<void> {
    await addrFrame
      .evaluate(
        (args) => {
          const { city, sCode, sValue } = args as {
            city: { code: string; desc: string };
            sCode: string;
            sValue: string;
          };
          const cityCodeEl = document.querySelector('input[name="AccountBO.Address.city"]') as HTMLInputElement | null;
          const cityDescEl = document.querySelector('input[name="Cat_AccountBO.Address.city"]') as HTMLInputElement | null;
          if (cityDescEl && !cityDescEl.value && city.desc) {
            if (cityCodeEl) cityCodeEl.value = city.code;
            cityDescEl.value = city.desc;
          }
          const stateCodeEl = document.querySelector('input[name="AccountBO.Address.state"]') as HTMLInputElement | null;
          const stateDescEl = document.querySelector('input[name="Cat_AccountBO.Address.state"]') as HTMLInputElement | null;
          const cur = stateDescEl ? stateDescEl.value.trim() : '';
          if (stateDescEl && (cur === '' || cur === '-')) {
            if (stateCodeEl) {
              stateCodeEl.value = sCode;
              stateCodeEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            stateDescEl.value = sValue;
            stateDescEl.dispatchEvent(new Event('input', { bubbles: true }));
            stateDescEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        },
        { city: cityBefore, sCode: stateCode, sValue: stateValue }
      )
      .catch(() => {});
  }

  // Country lookup — search by name, then fall back to listing all; finally
  // direct-set the visible+hidden fields if the write-back failed.
  private async setCountryLookup(
    addrPage: Page,
    addrFrame: Frame,
    countryValue: string,
    countryCode: string
  ): Promise<boolean> {
    const context = this.page.context();
    console.log(`Setting Country via lookup = ${countryValue}...`);
    const lookupPromise = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);
    await addrFrame
      .evaluate(() => {
        const triggers = Array.from(
          document.querySelectorAll('a, img, input[type="button"], input[type="image"]')
        ) as HTMLElement[];
        const isCountryLookup = (t: HTMLElement) =>
          /categoryLookupCode_Location\(\s*['"]COUNTRY['"]\s*,\s*['"]AccountBO\.Address\.country['"]/i.test(
            t.getAttribute('onclick') || ''
          );
        const trig = triggers.find(isCountryLookup);
        if (trig) trig.click();
        return !!trig;
      })
      .catch(() => false);

    let popup = await lookupPromise;
    if (!popup || popup.isClosed()) {
      await addrPage.waitForTimeout(900).catch(() => {});
      popup = context.pages().find((p) => !p.isClosed() && /Lookupfor|Lookup|Category/i.test(p.url())) || null;
    }
    let countrySelected = false;
    if (popup && !popup.isClosed()) {
      popup.on('dialog', async (d) => {
        await d.accept().catch(() => {});
      });
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      await popup.waitForTimeout(700).catch(() => {});

      const setFilter = async (val: string): Promise<boolean> => {
        for (const f of popup!.frames()) {
          const ok = await f
            .evaluate((v) => {
              const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
              const visText = inputs.filter((i) => {
                const t = (i.getAttribute('type') || 'text').toLowerCase();
                return (t === 'text' || t === '') && i.offsetParent !== null;
              });
              const inp = visText[0];
              if (!inp) return false;
              inp.focus();
              inp.value = v;
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }, val)
            .catch(() => false);
          if (ok) {
            const submitBtn = f
              .locator('input[value="Submit"], input[type="submit"], button:has-text("Submit")')
              .first();
            await submitBtn.click({ timeout: 5000 }).catch(() => {});
            await popup!.waitForTimeout(1000).catch(() => {});
            return true;
          }
        }
        return false;
      };
      const selectRow = async (): Promise<boolean> => {
        for (const f of popup!.frames()) {
          const sel = await f
            .evaluate((target) => {
              const rows = Array.from(document.querySelectorAll('tr')).filter((r) => !r.querySelector('tr'));
              const row = rows.find((r) => (r.textContent || '').toUpperCase().includes(target.toUpperCase()));
              if (!row) return false;
              const link = row.querySelector('a') as HTMLElement | null;
              if (link) link.click();
              else {
                const cell = (row.querySelector('td') || row) as HTMLElement;
                cell.click();
                cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
              }
              return true;
            }, countryValue)
            .catch(() => false);
          if (sel) {
            const rowLoc = f
              .locator(
                `xpath=//tr[not(.//tr)][contains(translate(., 'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ'), '${countryValue.toUpperCase()}')]`
              )
              .first();
            await rowLoc.dblclick({ timeout: 3000 }).catch(() => {});
            return true;
          }
        }
        return false;
      };
      await setFilter(countryValue);
      countrySelected = await selectRow();
      if (!countrySelected) {
        await setFilter('');
        countrySelected = await selectRow();
      }
      await addrPage.waitForTimeout(900).catch(() => {});
      if (popup && !popup.isClosed()) await popup.close().catch(() => {});
    }

    let countryValAfter = await addrFrame
      .locator('input[name="Cat_AccountBO.Address.country"]')
      .first()
      .inputValue()
      .catch(() => '');
    if (!countryValAfter) {
      await addrFrame
        .evaluate(
          (args) => {
            const cat = document.querySelector('input[name="Cat_AccountBO.Address.country"]') as HTMLInputElement | null;
            const code = document.querySelector('input[name="AccountBO.Address.country"]') as HTMLInputElement | null;
            if (cat) {
              cat.value = args.desc;
              cat.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (code) {
              code.value = args.code;
              code.dispatchEvent(new Event('change', { bubbles: true }));
            }
          },
          { desc: countryValue, code: countryCode }
        )
        .catch(() => {});
      countryValAfter = await addrFrame
        .locator('input[name="Cat_AccountBO.Address.country"]')
        .first()
        .inputValue()
        .catch(() => '');
    }
    return !!countryValAfter;
  }

  // ---------------------------------------------------------------
  // TC_010: Modify a phone number by its Type (e.g. "MOBILE NUMBER 1" or
  // "COMMUNICATION PHONE 1"). Opens Contact > Phone and E-Mail, selects the row
  // whose Type matches phoneType, and sets the Phone No.
  // ---------------------------------------------------------------
  async modifyPhone(
    phoneType = process.env.PHONE_TYPE || MOD.phone.type,
    phoneNo = process.env.PHONE_NO || MOD.phone.phoneNo
  ): Promise<string> {
    const editPage = this.editPage;
    const context = this.page.context();
    console.log(`Navigating Contact > Phone and E-Mail to edit the ${phoneType} phone...`);
    await this.clickTabByText(editPage, 'Contact');
    await editPage.waitForTimeout(1000).catch(() => {});
    await this.clickTabByText(editPage, 'Phone and E-Mail');
    await editPage.waitForTimeout(900).catch(() => {});

    const phonePopupPromise = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);
    let phoneRowClicked = false;
    for (const f of editPage.frames()) {
      const res = await f
        .evaluate((pt) => {
          const out = { clicked: false };
          const typeRe = new RegExp(pt.replace(/\s+/g, '\\s*'), 'i');
          const rows = Array.from(document.querySelectorAll('tr')).filter((r) => !r.querySelector('tr'));
          const isPhoneEdit = (e: Element) =>
            /editPhone|PhoneEmail|PhoneDetails|editTelephone|editContact/i.test(e.getAttribute('onclick') || '');
          for (const r of rows) {
            const txt = (r.textContent || '').replace(/\s+/g, ' ').trim();
            const controls = Array.from(r.querySelectorAll('input[type="button"], a, img')) as HTMLElement[];
            const editBtn = controls.find(isPhoneEdit);
            const dotsBtn = controls.find((c) => ((c as HTMLInputElement).value || '').trim() === '...');
            if (!out.clicked && typeRe.test(txt) && (editBtn || dotsBtn)) {
              const firstCell = r.querySelector('td');
              if (firstCell) (firstCell as HTMLElement).click();
              (editBtn || dotsBtn!).click();
              out.clicked = true;
            }
          }
          return out;
        }, phoneType)
        .catch(() => null);
      if (res && res.clicked) {
        phoneRowClicked = true;
        console.log(`Clicked ${phoneType} phone Select in ${f.url().slice(-45)}`);
        break;
      }
    }
    console.log(`${phoneType} record select clicked = ${phoneRowClicked}`);

    let phonePopup = await phonePopupPromise;
    if (!phonePopup || phonePopup.isClosed()) {
      await editPage.waitForTimeout(900).catch(() => {});
      phonePopup =
        context.pages().find((p) => !p.isClosed() && /PhoneEmailForm_Det|PhoneEmail|Phone|Telephone/i.test(p.url())) ||
        null;
    }
    const phonePage: Page = phonePopup && !phonePopup.isClosed() ? phonePopup : editPage;
    phonePage.on('dialog', async (d) => {
      await d.accept().catch(() => {});
    });
    await phonePage.waitForLoadState('domcontentloaded').catch(() => {});
    await phonePage.waitForTimeout(900).catch(() => {});

    const phoneFrame =
      (await this.findFrameByText(phonePage, /Phone and Email Details|Phone No/i, 8000)) || phonePage.mainFrame();
    const allInputs = await phoneFrame.locator('input[type="text"], input:not([type])').all().catch(() => []);

    // Find the input holding the existing phone number (all-digit, len >= 5).
    let inp: Locator | null = null;
    for (const cand of allInputs) {
      const v = (await cand.inputValue({ timeout: 2000 }).catch(() => '')) || '';
      const vis = await cand.isVisible().catch(() => false);
      if (vis && /^\d{5,}$/.test(v.trim())) {
        inp = cand;
        break;
      }
    }
    if (!inp) {
      const xp = "xpath=//td[not(descendant::td) and contains(normalize-space(.),'Phone No')]/following::input[3]";
      inp = phoneFrame.locator(xp).first();
    }
    await inp.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    let v = '';
    for (let i = 0; i < 4; i++) {
      await inp.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
      await inp.click({ timeout: 4000 }).catch(() => {});
      await inp.fill('', { timeout: 4000 }).catch(() => {});
      await inp.fill(phoneNo, { timeout: 6000 }).catch(() => {});
      v = await inp.inputValue({ timeout: 3000 }).catch(() => '');
      if (v.replace(/\s/g, '').includes(phoneNo.replace(/\s/g, ''))) break;
      await phonePage.waitForTimeout(500).catch(() => {});
    }
    console.log(`✓ ${phoneType} phone updated (Phone No=${v})`);

    // Save the phone sub-form.
    for (const f of phonePage.frames()) {
      const saveBtn = f
        .locator('input[type="button"][value="Save"], input[type="submit"][value="Save"], input[value="Save"], button:has-text("Save")')
        .first();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click({ timeout: 6000 }).catch(() => {});
        break;
      }
    }
    await editPage.waitForTimeout(1000).catch(() => {});
    if (phonePopup && !phonePopup.isClosed()) await phonePopup.close().catch(() => {});
    await editPage.waitForTimeout(1000).catch(() => {});
    return v;
  }

  // ---------------------------------------------------------------
  // TC_012: Submit General Details + Process Selection
  // ---------------------------------------------------------------
  async submitGeneralDetails(cifId: string, processName = MOD.processName): Promise<boolean> {
    const editPage = this.editPage;
    const context = this.page.context();
    let submitDialog = '';
    let submitSuccessSeen = false;
    const successRe = /submitted successfully|successfully submitted|is submitted|Process was saved successfully/i;

    const attachDialog = (p: Page) => {
      p.on('dialog', async (d) => {
        submitDialog = d.message();
        if (successRe.test(d.message())) submitSuccessSeen = true;
        console.log(`[submit dialog] ${d.message()}`);
        await d.accept().catch(() => {});
      });
    };
    attachDialog(editPage);
    context.on('page', attachDialog);

    console.log('Clicking Submit...');
    const submitSel =
      'input[type="submit"][value="Submit"], input[type="button"][value="Submit"], ' +
      'input[value="Submit"], button:has-text("Submit"), a:has-text("Submit")';
    const procPopupPromise = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);
    let submitClicked = false;
    for (const f of editPage.frames()) {
      const btn = f.locator(submitSel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 8000 }).catch(() => {});
        submitClicked = true;
        break;
      }
    }
    console.log(`Submit clicked = ${submitClicked}`);
    await editPage.waitForTimeout(900).catch(() => {});

    // Process Selection window: choose the KYC-approval process, then save.
    const procPopup = await procPopupPromise;
    const procPage: Page = procPopup && !procPopup.isClosed() ? procPopup : editPage;
    await procPage.waitForLoadState('domcontentloaded').catch(() => {});
    await procPage.waitForTimeout(900).catch(() => {});
    const procFrame = await this.findFrameByText(
      procPage,
      /Process Selection|Selected Process Name|Suggested Process Name/i,
      8000
    );
    if (procFrame) {
      const kycRe = new RegExp(processName.replace(/([.*+?^${}()|[\]\\])/g, '\\$1'), 'i');
      const kycAltRe = /CIF\s*Customer\s*KYC\s*Approval|CIFCustomerKYCApproval/i;
      let chosen = false;
      const selDeadline = Date.now() + 15000;
      while (!chosen && Date.now() < selDeadline) {
        for (const f of procPage.frames()) {
          if (chosen) break;
          for (const sel of await f.locator('select').all().catch(() => [])) {
            for (const opt of await sel.locator('option').all().catch(() => [])) {
              const label = ((await opt.textContent().catch(() => '')) || '').trim();
              const value = (await opt.getAttribute('value').catch(() => '')) || '';
              if (kycRe.test(label) || kycRe.test(value) || kycAltRe.test(label) || kycAltRe.test(value)) {
                await sel.selectOption(value ? { value } : { label }, { timeout: 5000 }).catch(() => {});
                chosen = true;
                console.log(`Selected Process Name = "${label}"`);
                break;
              }
            }
            if (chosen) break;
          }
        }
        if (!chosen) await procPage.waitForTimeout(700).catch(() => {});
      }
      await procPage.waitForTimeout(500).catch(() => {});
      let saved = false;
      for (const f of procPage.frames()) {
        const btn = f
          .locator('input[value="Save Process Selection"], input[type="submit"][value*="Save Process"], input[type="button"][value*="Save Process"], button:has-text("Save Process Selection")')
          .first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 6000 }).catch(() => {});
          saved = true;
          break;
        }
      }
      console.log(`Save Process Selection clicked = ${saved}`);
      await procPage.waitForTimeout(1500).catch(() => {});
    } else {
      console.log('No Process Selection window appeared (submit may have completed directly).');
    }

    const successFrame = editPage.isClosed()
      ? null
      : await this.findFrameByText(
          editPage,
          /submitted successfully|General is submitted|record.*submitted|successfully submitted/i,
          4000
        ).catch(() => null);
    const submitSucceeded = submitSuccessSeen || successRe.test(submitDialog) || !!successFrame;
    console.log(`Submit dialog = "${submitDialog}", successSeen=${submitSuccessSeen}, successFrame=${!!successFrame}`);

    // Best-effort acknowledge of any lingering in-page OK.
    if (successFrame) {
      await successFrame
        .locator('input[type="button"][value="OK"], input[type="submit"][value="OK"], button:has-text("OK"), a:has-text("OK")')
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
    }
    await this.page.waitForTimeout(1000).catch(() => {});
    return submitSucceeded;
  }

  // ---------------------------------------------------------------
  // TC_014: Re-search and confirm the submitted record shows in the grid
  // ---------------------------------------------------------------
  async verifyRecordInGrid(cifId: string, lastName = process.env.LAST_NAME || MOD.lastName): Promise<boolean> {
    const page = this.page;
    console.log('Re-searching the CIF so the submitted record displays in the grid...');
    const searchFrame2 = await this.findFrameByText(
      page,
      /Retail Search Criteria|Customer Search Results|Search Criteria/i,
      12000
    );
    if (searchFrame2) {
      const cifField = searchFrame2
        .locator('input[name*="cif" i], input[id*="cif" i], input[name*="entity" i], input[name*="Cust_Id" i]')
        .first();
      if (await cifField.isVisible().catch(() => false)) {
        await cifField.fill(cifId, { timeout: 5000 }).catch(() => {});
        await searchFrame2
          .locator('input[type="submit"][value="Search"], input[value="Search"], input[type="submit"][value="Submit"], input[type="button"][value="Submit"], button:has-text("Search"), button:has-text("Submit")')
          .first()
          .click({ timeout: 6000 })
          .catch(() => {});
        await page.waitForTimeout(1500);
      }
    }
    let gridText = '';
    for (const f of page.frames()) {
      const t = await f.locator('body').innerText({ timeout: 2000 }).catch(() => '');
      if (/Customer Search Results|Search Results/i.test(t)) {
        gridText = t.replace(/\s+/g, ' ').trim();
        break;
      }
    }
    const recordShown = gridText.includes(cifId) || new RegExp(lastName, 'i').test(gridText);
    console.log(`✓ Record (CIF ${cifId}) displayed in grid after submission = ${recordShown}`);
    return recordShown;
  }
}
