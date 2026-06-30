import { Page, Dialog } from '@playwright/test';
import { AppConfig } from '../../config/crmTestData';
import { CrmBasePage } from './crmBasePage';
import { HomePage } from '../HomePages/HomePage';

export class CrmSuspendPage extends CrmBasePage {
  constructor(page: Page, config: AppConfig, lastDialogMessages: string[]) {
    super(page, config, lastDialogMessages);
  }

  async selectCrmWithAdmin(): Promise<void> {
    console.log('=== Step 1: Select CRM with Admin login ===');
    const homePage = new HomePage(this.page);
    await homePage.selectCRM({ useAdmin: true });
  }

  async waitForCrmLoad(): Promise<void> {
    console.log('=== Step 2: Wait for CRM to load ===');
    await this.waitForCRMLoad(this.page, this.config);
    await this.workingPage.waitForTimeout(this.timeouts.medium);
  }

  async navigateToSuspendForm(screenId: string, menuFrameName?: string): Promise<void> {
    console.log('=== Step 3: Navigate to Operations > Suspend/Undo Suspension ===');
    const fm = this.page.frame({ name: 'Functionmain' });
    if (fm) {
      await fm.evaluate((sid: string) => document.getElementById(sid)?.click(), screenId);
      const label = screenId === 'screen1' ? 'CIF Retail' : 'CIF Corporate';
      console.log(`✓ Clicked ${label}`);
      await this.page.waitForTimeout(this.timeouts.medium);
    }

    // Use specific menu frame if provided (e.g. "1504" for retail, "9" for corporate)
    let mf = menuFrameName ? this.page.frame({ name: menuFrameName }) : null;
    if (!mf) mf = await this.findMenuFrame(this.workingPage);

    if (mf) {
      console.log(`Using menu frame: "${mf.name()}"`);

      // Strategy 1: Click by element ID (Finacle menu items work even when CSS-hidden)
      // Known IDs from CIF Retail (frame 1504): view5=Operations, subview53=Suspend/Undo Suspension
      // Known IDs from CIF Corporate (frame 9): view5=Operations, subview53=Suspend/Undo Suspension (verify)
      const operationsClicked = await mf.evaluate(() => {
        // Find "Operations" by text first, then try known IDs
        for (const el of document.querySelectorAll('[id^="view"]')) {
          const text = (el as HTMLElement).innerText?.trim() || '';
          if (text === 'Operations') { (el as HTMLElement).click(); return `${el.id}="${text}"`; }
        }
        return '';
      }).catch(() => '');

      if (operationsClicked) {
        console.log(`✓ Clicked Operations: ${operationsClicked}`);
        await this.page.waitForTimeout(this.timeouts.short);
      } else {
        console.log('⚠ "Operations" not found by ID, trying text search...');
        await this.clickMenuItem(mf, this.workingPage, 'Operations', 3000);
      }

      // Click Suspend/Undo Suspension
      const suspendClicked = await mf.evaluate(() => {
        for (const el of document.querySelectorAll('[id^="subview"]')) {
          const text = (el as HTMLElement).innerText?.trim() || '';
          if (text.includes('Suspend') && text.includes('Undo')) {
            (el as HTMLElement).click(); return `${el.id}="${text}"`;
          }
        }
        // Also try span triggers
        for (const el of document.querySelectorAll('[id^="subviewspanFor"]')) {
          const text = (el as HTMLElement).innerText?.trim() || '';
          if (text.includes('Suspend') && text.includes('Undo')) {
            (el as HTMLElement).click(); return `${el.id}="${text}"`;
          }
        }
        return '';
      }).catch(() => '');

      if (suspendClicked) {
        console.log(`✓ Clicked Suspend/Undo Suspension: ${suspendClicked}`);
      } else {
        console.log('⚠ "Suspend/Undo Suspension" not found by ID, trying text search...');
        // Fallback: log available items and try text search
        const items = await mf.evaluate(() => {
          const result: string[] = [];
          document.querySelectorAll('[id^="view"], [id^="subview"]').forEach(el => {
            const text = (el as HTMLElement).innerText?.trim() || '';
            if (text && text.length < 50) result.push(`${el.id}="${text}"`);
          });
          return result;
        }).catch(() => []);
        console.log(`Menu items: ${items.join(', ')}`);
        await this.clickMenuItem(mf, this.workingPage, 'Suspend/Undo Suspension', 5000);
      }
    } else {
      console.log('⚠ Menu frame not found for suspend navigation');
    }
    await this.page.waitForTimeout(this.timeouts.long);
  }

  async fillCifId(cifId: string): Promise<string> {
    console.log('=== Step 4: Enter CIF ID and Submit ===');
    console.log(`CIF ID: ${cifId}`);
    const skipFrames = ['loginFrame', 'Fininfra', 'menutree', 'Functionmain', 'FINW'];
    let cifFilled = '';

    for (let attempt = 0; attempt < 5; attempt++) {
      if (cifFilled) break;
      if (attempt > 0) { console.log(`  Retry ${attempt}/4 - waiting 5s...`); await this.page.waitForTimeout(this.timeouts.medium); }

      for (const f of this.page.frames()) {
        if (cifFilled) break;
        if (skipFrames.includes(f.name())) continue;
        try {
          const result = await f.evaluate((id: string) => {
            const sels = ['input[name*="cifID"]','input[name*="cifId"]','input[name*="CIF_ID"]','input[name*="EntityId"]','input[name*="entityId"]','input[name="FilterParam1"]','input[name*="FilterParam"]','input[name*="filterParam"]','input[name*="entity_id"]'];
            for (const s of sels) { const el = document.querySelector(s) as HTMLInputElement; if (el && el.getBoundingClientRect().width > 0) { el.value = id; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return `filled via ${s}`; } }
            return '';
          }, cifId).catch(() => '');
          if (result) { cifFilled = result; console.log(`✓ CIF ID filled: ${result} (frame: "${f.name()}")`); }
        } catch (_) {}
      }

      if (!cifFilled) {
        for (const f of this.page.frames()) {
          if (cifFilled) break;
          if (skipFrames.includes(f.name())) continue;
          try {
            const result = await f.evaluate((id: string) => {
              const tds = document.querySelectorAll('td');
              for (const td of tds) { const txt = td.innerText?.trim(); if (txt && (txt.includes('CIF ID') || txt.includes('Entity ID') || txt.includes('CIF Id'))) { const row = td.closest('tr'); if (row) { const inp = row.querySelector('input[type="text"], input:not([type])') as HTMLInputElement; if (inp && !inp.readOnly && !inp.disabled && inp.getBoundingClientRect().width > 0) { inp.value = id; inp.dispatchEvent(new Event('change', { bubbles: true })); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('blur', { bubbles: true })); return `filled via label "${txt}"`; } } } }
              return '';
            }, cifId).catch(() => '');
            if (result) { cifFilled = result; console.log(`✓ CIF ID filled: ${result} (frame: "${f.name()}")`); }
          } catch (_) {}
        }
      }
    }

    if (!cifFilled) {
      console.log('⚠ Could not fill CIF ID in any frame — dumping all frame URLs and names:');
      for (const f of this.page.frames()) { console.log(`  Frame: name="${f.name()}", url="${f.url().substring(0, 120)}"`); }
    }
    return cifFilled;
  }

  async clickSubmit(): Promise<boolean> {
    let submitClicked = false;
    for (const f of this.page.frames()) {
      try {
        const clicked = await f.evaluate(() => { const btns = document.querySelectorAll('input[type="button"], input[type="submit"], button'); for (const b of btns) { if (((b as HTMLInputElement).value || b.textContent || '').trim() === 'Submit') { (b as HTMLElement).click(); return true; } } return false; }).catch(() => false);
        if (clicked) { submitClicked = true; console.log('✓ Submit clicked'); break; }
      } catch (_) {}
    }
    if (!submitClicked) console.log('⚠ Submit button not found in any frame');
    await this.page.waitForTimeout(this.timeouts.long);
    return submitClicked;
  }

  async rightClickCifInResults(cifId: string, screenshotPrefix: string): Promise<void> {
    console.log('=== Step 5: Right-click CIF in Customer Search Results ===');
    await this.page.screenshot({ path: `test-results-temp/${screenshotPrefix}-before-rightclick.png` }).catch(() => {});

    for (const f of this.page.frames()) {
      try {
        const content = await f.content();
        if (!content || !content.includes(cifId)) continue;
        console.log(`  Found CIF ID in frame "${f.name()}"`);

        const rowClicked = await f.evaluate((id: string) => {
          const allTds = document.querySelectorAll('td');
          let cifTd: HTMLTableCellElement | null = null;
          for (const td of allTds) { if (td.textContent?.trim() === id) { cifTd = td as HTMLTableCellElement; break; } }
          if (!cifTd) return '';
          const tr = cifTd.closest('tr');
          if (!tr) return '';
          const siblings = Array.from(tr.cells || tr.querySelectorAll(':scope > td'));
          for (const sib of siblings) {
            if (sib === cifTd) continue;
            if (!sib.querySelector('a') && !sib.querySelector('input') && sib.textContent?.trim()) {
              (sib as HTMLElement).click();
              return sib.textContent?.trim()?.substring(0, 40) || 'empty';
            }
          }
          return '';
        }, cifId).catch(() => '');

        if (rowClicked) { console.log(`✓ Clicked non-link cell "${rowClicked}" to select row`); }
        else { console.log('  ⚠ No non-link sibling cell found, proceeding with right-click only'); }

        await this.page.waitForTimeout(1000);

        const rightClicked = await f.evaluate((id: string) => {
          const allTds = document.querySelectorAll('td');
          for (const td of allTds) { if (td.textContent?.trim() === id) { td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })); return true; } }
          return false;
        }, cifId).catch(() => false);

        if (rightClicked) { console.log('✓ Right-clicked CIF cell'); break; }
      } catch (_) {}
    }

    await this.page.waitForTimeout(this.timeouts.medium);
    await this.page.screenshot({ path: `test-results-temp/${screenshotPrefix}-after-rightclick.png` }).catch(() => {});
    console.log('📸 Screenshots saved (before & after right-click)');
  }

  async retryRightClickIfNeeded(cifId: string): Promise<void> {
    const resultAreaForCheck = this.page.frame({ name: 'ResultArea' });
    if (resultAreaForCheck) {
      const menuVisible = await resultAreaForCheck.evaluate(() => document.querySelectorAll('div.menuitems').length).catch(() => 0);
      console.log(`  Context menu items visible after right-click: ${menuVisible}`);
      if (menuVisible === 0) {
        console.log('  Retrying right-click...');
        await this.page.waitForTimeout(this.timeouts.short);
        for (const f of this.page.frames()) {
          try {
            const retried = await f.evaluate((id: string) => {
              const allTds = document.querySelectorAll('td');
              for (const td of allTds) { if (td.textContent?.trim() === id) { td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })); return true; } }
              return false;
            }, cifId).catch(() => false);
            if (retried) { console.log('✓ Right-click retried'); break; }
          } catch (_) {}
        }
        await this.page.waitForTimeout(this.timeouts.short3);
      }
    }
  }

  async clickSuspendContextMenu(): Promise<boolean> {
    console.log('=== Step 6: Select Suspend from context menu ===');
    let suspendClicked = false;

    const resultAreaFrame = this.page.frame({ name: 'ResultArea' });
    if (resultAreaFrame) {
      try {
        const clicked = await resultAreaFrame.evaluate(() => {
          const menuItems = document.querySelectorAll('div.menuitems');
          for (const item of menuItems) { const text = (item as HTMLElement).innerText?.trim(); if (text === 'Suspend Customer') { (item as HTMLElement).click(); return `clicked DIV.menuitems: "${text}"`; } }
          for (const sel of ['div','a','span','td']) { for (const el of document.querySelectorAll(sel)) { const t = (el as HTMLElement).innerText?.trim(); if (t === 'Suspend Customer') { (el as HTMLElement).click(); return `clicked ${sel}: "${t}"`; } } }
          return '';
        }).catch(() => '');
        if (clicked) { suspendClicked = true; console.log(`✓ ${clicked} in ResultArea frame`); }
      } catch (_) {}
    }

    if (!suspendClicked) {
      for (const f of this.page.frames()) {
        if (suspendClicked) break;
        try {
          const clicked = await f.evaluate(() => {
            for (const sel of ['div.menuitems','div','a','span','td','li','menuitem']) { for (const el of document.querySelectorAll(sel)) { const t = (el as HTMLElement).innerText?.trim(); if (t === 'Suspend Customer') { (el as HTMLElement).click(); return `${sel}: "${t}"`; } } }
            for (const sel of ['div.menuitems','div','a','span','td','li','menuitem']) { for (const el of document.querySelectorAll(sel)) { const t = (el as HTMLElement).innerText?.trim(); if (t === 'Suspend') { (el as HTMLElement).click(); return `${sel}: "${t}"`; } } }
            return '';
          }).catch(() => '');
          if (clicked) { suspendClicked = true; console.log(`✓ Clicked Suspend in frame "${f.name()}": ${clicked}`); }
        } catch (_) {}
      }
    }

    if (!suspendClicked) console.log('⚠ Suspend Customer not found in any frame');
    return suspendClicked;
  }

  async clickUndoSuspendContextMenu(): Promise<boolean> {
    console.log('=== Step 6: Select Undo Suspend from context menu ===');
    let undoSuspendClicked = false;

    const resultAreaFrame = this.page.frame({ name: 'ResultArea' });
    if (resultAreaFrame) {
      try {
        const menuItemTexts = await resultAreaFrame.evaluate(() => {
          return Array.from(document.querySelectorAll('div.menuitems')).map(i => (i as HTMLElement).innerText?.trim()).filter(Boolean);
        }).catch(() => []);
        if (menuItemTexts.length > 0) console.log(`  Context menu items in ResultArea: ${menuItemTexts.map(t => `"${t}"`).join(', ')}`);

        const clicked = await resultAreaFrame.evaluate(() => {
          const isMatch = (text: string) => { const t = text.toLowerCase(); return t === 'undo suspension' || t === 'undo suspend' || t === 'undo suspend customer' || t === 'undo suspension customer' || (t.includes('undo') && t.includes('suspend')); };
          const menuItems = document.querySelectorAll('div.menuitems');
          for (const item of menuItems) { const text = (item as HTMLElement).innerText?.trim(); if (text && isMatch(text)) { (item as HTMLElement).click(); return `clicked DIV.menuitems: "${text}"`; } }
          for (const sel of ['div','a','span','td']) { for (const el of document.querySelectorAll(sel)) { const t = (el as HTMLElement).innerText?.trim(); if (t && isMatch(t)) { (el as HTMLElement).click(); return `clicked ${sel}: "${t}"`; } } }
          return '';
        }).catch(() => '');
        if (clicked) { undoSuspendClicked = true; console.log(`✓ ${clicked} in ResultArea frame`); }
      } catch (_) {}
    }

    if (!undoSuspendClicked) {
      for (const f of this.page.frames()) {
        if (undoSuspendClicked) break;
        try {
          const clicked = await f.evaluate(() => {
            const isMatch = (text: string) => { const t = text.toLowerCase(); return t === 'undo suspension' || t === 'undo suspend' || t === 'undo suspend customer' || t === 'undo suspension customer' || (t.includes('undo') && t.includes('suspend')); };
            for (const sel of ['div.menuitems','div','a','span','td','li','menuitem']) { for (const el of document.querySelectorAll(sel)) { const t = (el as HTMLElement).innerText?.trim(); if (t && isMatch(t)) { (el as HTMLElement).click(); return `${sel}: "${t}"`; } } }
            return '';
          }).catch(() => '');
          if (clicked) { undoSuspendClicked = true; console.log(`✓ Clicked Undo Suspend in frame "${f.name()}": ${clicked}`); }
        } catch (_) {}
      }
    }

    if (!undoSuspendClicked) {
      console.log('⚠ Undo Suspend option not found in any frame');
      for (const f of this.page.frames()) {
        try {
          const items = await f.evaluate(() => Array.from(document.querySelectorAll('div.menuitems')).map(i => (i as HTMLElement).innerText?.trim()).filter(Boolean)).catch(() => []);
          if (items.length > 0) console.log(`  Menu items in frame "${f.name()}": ${items.map(t => `"${t}"`).join(', ')}`);
        } catch (_) {}
      }
    }
    return undoSuspendClicked;
  }

  registerPopupPromise(): Promise<Page | null> {
    return this.page.context().waitForEvent('page', { timeout: 30000 }).catch(() => null);
  }

  async waitForOperationPopup(popupPromise: Promise<Page | null>, label: string): Promise<Page | null> {
    console.log(`=== Step 7: Handle ${label} popup ===`);
    let popup: Page | null = await popupPromise;
    if (popup && popup.isClosed()) popup = null;
    if (popup) console.log(`  ${label} popup from promise: ${popup.url().substring(popup.url().lastIndexOf('/') + 1).substring(0, 100)}`);

    if (!popup) {
      for (const p of this.page.context().pages()) {
        if (p !== this.page && !p.isClosed()) {
          const u = p.url();
          console.log(`  Checking page: ${u.substring(u.lastIndexOf('/') + 1).substring(0, 100)}`);
          if (u.includes('Suspend') || u.includes('suspend') || u.includes('SSOblank') || u.includes('AccountDet') || u.includes('AccountMod')) { popup = p; break; }
        }
      }
    }

    if (!popup) {
      console.log(`  Waiting for ${label.toLowerCase()} popup...`);
      try { popup = await this.page.waitForEvent('popup', { timeout: this.timeouts.long15 }); } catch (_) {
        for (const p of this.page.context().pages()) { if (p !== this.page && !p.isClosed()) { popup = p; break; } }
      }
    }

    if (popup) console.log(`  ${label} popup URL: ${popup.url().substring(0, 150)}`);
    return popup;
  }

  async handleSuspendReasons(popup: Page): Promise<void> {
    popup.on('dialog', async (d: Dialog) => { this.lastDialogMessages.push(d.message()); console.log(`📢 Suspend dialog: "${d.message().substring(0, 150)}"`); await d.accept().catch(() => {}); });
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    await popup.waitForTimeout(this.timeouts.medium);
    const target = await this.findPopupTarget(popup);
    await this.listVisibleFields(target, 'Suspend Form');

    console.log('=== Moving items from Available to Selected reasons ===');
    const popupFrames = [popup, ...popup.frames()];
    let reasonsHandled = false;
    for (const pf of popupFrames) {
      try {
        const selectInfo = await pf.evaluate(() => {
          const avail = document.querySelector('select[name="AVAILABLE_REJECT_REASON"]') as HTMLSelectElement;
          const selected = document.querySelector('select[name="REJECT_REASON"]') as HTMLSelectElement;
          if (!avail && !selected) return null;
          return {
            availOptions: avail ? Array.from(avail.options).map(o => ({ text: o.text?.substring(0, 50), value: o.value, selected: o.selected })) : [],
            selectedOptions: selected ? Array.from(selected.options).map(o => ({ text: o.text?.substring(0, 50), value: o.value, selected: o.selected })) : [],
            availSize: avail?.size || 0, availMultiple: avail?.multiple || false,
            selectedSize: selected?.size || 0, selectedMultiple: selected?.multiple || false,
          };
        }).catch(() => null);

        if (!selectInfo) continue;
        console.log(`  Available reasons (${selectInfo.availOptions.length} options, size=${selectInfo.availSize}, multiple=${selectInfo.availMultiple}):`);
        selectInfo.availOptions.forEach((o: any, i: number) => console.log(`    [${i}] "${o.text}" (value="${o.value}", selected=${o.selected})`));
        console.log(`  Selected reasons (${selectInfo.selectedOptions.length} options):`);
        selectInfo.selectedOptions.forEach((o: any, i: number) => console.log(`    [${i}] "${o.text}" (value="${o.value}")`));

        if (selectInfo.availOptions.length === 0) { console.log('  ⚠ No available reasons to move'); reasonsHandled = true; break; }

        const itemsToMove = Math.min(3, selectInfo.availOptions.length);
        for (let moveIdx = 0; moveIdx < itemsToMove; moveIdx++) {
          await pf.evaluate(() => { const avail = document.querySelector('select[name="AVAILABLE_REJECT_REASON"]') as HTMLSelectElement; if (avail && avail.options.length > 0) { avail.selectedIndex = 0; avail.options[0].selected = true; avail.dispatchEvent(new Event('change', { bubbles: true })); avail.focus(); } }).catch(() => {});
          await popup.waitForTimeout(500);
          const moved = await pf.evaluate(() => { const buttons = document.querySelectorAll('input[type="button"], button'); for (const b of buttons) { const v = ((b as HTMLInputElement).value || b.textContent || '').trim(); if (v === '>>' || v === '>') { (b as HTMLElement).click(); return v; } } return ''; }).catch(() => '');
          if (moved) console.log(`  ✓ Moved item ${moveIdx + 1}/${itemsToMove} (clicked "${moved}")`);
          await popup.waitForTimeout(500);
        }

        const afterMove = await pf.evaluate(() => { const selected = document.querySelector('select[name="REJECT_REASON"]') as HTMLSelectElement; return selected ? Array.from(selected.options).map(o => o.text?.substring(0, 50)) : []; }).catch(() => []);
        console.log(`  After move: ${afterMove.length} items in Selected reasons: ${JSON.stringify(afterMove)}`);

        if (afterMove.length > 1) {
          await pf.evaluate(() => { const selected = document.querySelector('select[name="REJECT_REASON"]') as HTMLSelectElement; if (selected && selected.options.length > 0) { selected.selectedIndex = 0; selected.options[0].selected = true; selected.dispatchEvent(new Event('change', { bubbles: true })); selected.focus(); } }).catch(() => {});
          await popup.waitForTimeout(500);
          const removed = await pf.evaluate(() => { const buttons = document.querySelectorAll('input[type="button"], button'); for (const b of buttons) { const v = ((b as HTMLInputElement).value || b.textContent || '').trim(); if (v === '<<' || v === '<') { (b as HTMLElement).click(); return v; } } return ''; }).catch(() => '');
          if (removed) console.log(`  ✓ Removed one item from Selected reasons (clicked "${removed}")`);
          await popup.waitForTimeout(500);
        }

        reasonsHandled = true;
        break;
      } catch (_) {}
    }
    if (!reasonsHandled) console.log('⚠ Could not find reason select boxes in any frame');
  }

  async handleUndoSuspendReasons(popup: Page): Promise<void> {
    popup.on('dialog', async (d: Dialog) => { this.lastDialogMessages.push(d.message()); console.log(`📢 Undo Suspend dialog: "${d.message().substring(0, 150)}"`); await d.accept().catch(() => {}); });
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    await popup.waitForTimeout(this.timeouts.medium);
    const target = await this.findPopupTarget(popup);
    await this.listVisibleFields(target, 'Undo Suspend Form');

    console.log('=== Selecting reasons for Undo Suspension ===');
    const popupFrames = [popup, ...popup.frames()];
    let reasonsHandled = false;
    for (const pf of popupFrames) {
      try {
        const selectInfo = await pf.evaluate(() => {
          const avail = document.querySelector('select[name="AVAILABLE_REJECT_REASON"]') as HTMLSelectElement;
          const selected = document.querySelector('select[name="REJECT_REASON"]') as HTMLSelectElement;
          if (!avail && !selected) return null;
          return {
            availOptions: avail ? Array.from(avail.options).map(o => ({ text: o.text?.substring(0, 50), value: o.value, selected: o.selected })) : [],
            selectedOptions: selected ? Array.from(selected.options).map(o => ({ text: o.text?.substring(0, 50), value: o.value, selected: o.selected })) : [],
            availSize: avail?.size || 0, availMultiple: avail?.multiple || false,
            selectedSize: selected?.size || 0, selectedMultiple: selected?.multiple || false,
          };
        }).catch(() => null);

        if (!selectInfo) continue;
        console.log(`  Available reasons (${selectInfo.availOptions.length} options):`);
        selectInfo.availOptions.forEach((o: any, i: number) => console.log(`    [${i}] "${o.text}" (value="${o.value}")`));
        console.log(`  Selected reasons (${selectInfo.selectedOptions.length} options):`);
        selectInfo.selectedOptions.forEach((o: any, i: number) => console.log(`    [${i}] "${o.text}" (value="${o.value}")`));

        if (selectInfo.availOptions.length === 0 && selectInfo.selectedOptions.length > 0) { console.log('  ✓ Reasons already in Selected, no action needed'); reasonsHandled = true; break; }
        if (selectInfo.availOptions.length === 0 && selectInfo.selectedOptions.length === 0) { console.log('  ⚠ No reasons available in either list'); reasonsHandled = true; break; }

        const itemsToMove = Math.min(3, selectInfo.availOptions.length);
        for (let moveIdx = 0; moveIdx < itemsToMove; moveIdx++) {
          await pf.evaluate(() => { const avail = document.querySelector('select[name="AVAILABLE_REJECT_REASON"]') as HTMLSelectElement; if (avail && avail.options.length > 0) { avail.selectedIndex = 0; avail.options[0].selected = true; avail.dispatchEvent(new Event('change', { bubbles: true })); avail.focus(); } }).catch(() => {});
          await popup.waitForTimeout(500);
          const moved = await pf.evaluate(() => { const buttons = document.querySelectorAll('input[type="button"], button'); for (const b of buttons) { const v = ((b as HTMLInputElement).value || b.textContent || '').trim(); if (v === '>>' || v === '>') { (b as HTMLElement).click(); return v; } } return ''; }).catch(() => '');
          if (moved) console.log(`  ✓ Moved reason ${moveIdx + 1}/${itemsToMove} to Selected (clicked "${moved}")`);
          await popup.waitForTimeout(500);
        }

        const afterMove = await pf.evaluate(() => { const selected = document.querySelector('select[name="REJECT_REASON"]') as HTMLSelectElement; return selected ? Array.from(selected.options).map(o => o.text?.substring(0, 50)) : []; }).catch(() => []);
        console.log(`  After move: ${afterMove.length} items in Selected reasons: ${JSON.stringify(afterMove)}`);

        if (afterMove.length === 0) throw new Error('No reasons were selected for undo suspension — cannot save without reasons');

        if (afterMove.length > 1) {
          await pf.evaluate(() => { const selected = document.querySelector('select[name="REJECT_REASON"]') as HTMLSelectElement; if (selected && selected.options.length > 0) { selected.selectedIndex = 0; selected.options[0].selected = true; selected.dispatchEvent(new Event('change', { bubbles: true })); selected.focus(); } }).catch(() => {});
          await popup.waitForTimeout(500);
          const removed = await pf.evaluate(() => { const buttons = document.querySelectorAll('input[type="button"], button'); for (const b of buttons) { const v = ((b as HTMLInputElement).value || b.textContent || '').trim(); if (v === '<<' || v === '<') { (b as HTMLElement).click(); return v; } } return ''; }).catch(() => '');
          if (removed) console.log(`  ✓ Removed one item from Selected reasons (clicked "${removed}")`);
          await popup.waitForTimeout(500);
        }

        const finalCheck = await pf.evaluate(() => { const selected = document.querySelector('select[name="REJECT_REASON"]') as HTMLSelectElement; return selected ? selected.options.length : 0; }).catch(() => 0);
        console.log(`  Final: ${finalCheck} reason(s) selected for undo suspension`);

        reasonsHandled = true;
        break;
      } catch (_) {}
    }
    if (!reasonsHandled) console.log('⚠ Could not find reason select boxes in any frame');
  }

  async saveSuspendPopup(popup: Page, mode: 'suspend' | 'undo'): Promise<void> {
    await popup.waitForTimeout(this.timeouts.short);
    const label = mode === 'suspend' ? 'Save Suspended Customer' : 'Save Undo Suspended Customer';
    console.log(`=== Clicking ${label} ===`);
    const popupFrames = [popup, ...popup.frames()];
    for (const pf of popupFrames) {
      try {
        const clicked = await pf.evaluate((m: string) => {
          for (const b of document.querySelectorAll('input[type="button"], input[type="submit"], button')) {
            const v = ((b as HTMLInputElement).value || b.textContent || '').trim();
            if (m === 'suspend' && v.includes('Save') && v.toLowerCase().includes('suspend')) { (b as HTMLElement).click(); return v; }
            if (m === 'undo' && v.includes('Save') && (v.toLowerCase().includes('undo') || v.toLowerCase().includes('suspend'))) { (b as HTMLElement).click(); return v; }
          }
          for (const b of document.querySelectorAll('input[type="button"], input[type="submit"], button')) {
            const v = ((b as HTMLInputElement).value || b.textContent || '').trim();
            if (v.toLowerCase().startsWith('save')) { (b as HTMLElement).click(); return v; }
          }
          return '';
        }, mode).catch(() => '');
        if (clicked) { console.log(`✓ Clicked "${clicked}"`); break; }
      } catch (_) {}
    }

    console.log('Waiting for confirmation...');
    for (let i = 0; i < 10; i++) {
      await this.page.waitForTimeout(2000);
      for (const msg of this.lastDialogMessages.slice(-10)) {
        if (msg.toLowerCase().includes('saved successfully') || msg.toLowerCase().includes('suspended') || msg.toLowerCase().includes('undo') || msg.toLowerCase().includes('success')) {
          console.log(`✓ CONFIRMED: "${msg}"`); break;
        }
      }
      if (popup.isClosed()) break;
    }

    if (!popup.isClosed()) { try { await popup.close().catch(() => {}); } catch (_) {} }
  }

  async handleProcessSelectionPopup(mainPage: Page): Promise<void> {
    console.log('=== Step 8: Handle Process Selection popup ===');
    let psPopup: Page | null = null;
    for (const p of mainPage.context().pages()) { if (p !== mainPage && !p.isClosed() && (p.url().includes('ProcessSelection') || p.url().includes('CIFProcessSelection'))) { psPopup = p; break; } }
    if (!psPopup) { try { psPopup = await mainPage.waitForEvent('popup', { timeout: this.timeouts.long15 }); } catch (_) { for (const p of mainPage.context().pages()) { if (p !== mainPage && !p.isClosed()) { psPopup = p; break; } } } }

    if (psPopup && !psPopup.isClosed()) {
      await psPopup.waitForLoadState('domcontentloaded', { timeout: this.timeouts.long15 }).catch(() => {});
      await psPopup.waitForTimeout(this.timeouts.medium);

      for (let a = 0; a < 10; a++) {
        let found = false;
        for (const f of psPopup.frames()) { if (await f.locator('input[value*="Save Process Selection"]').first().isVisible({ timeout: 2000 }).catch(() => false)) { found = true; break; } }
        if (found) break;
        await psPopup.waitForTimeout(this.timeouts.short);
      }

      for (const f of psPopup.frames()) {
        const btn = f.locator('input[value*="Save Process Selection"]').first();
        if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); console.log('✓ Clicked Save Process Selection'); break; }
      }

      for (let i = 0; i < 15; i++) {
        await mainPage.waitForTimeout(2000);
        const confirmed = this.lastDialogMessages.slice(-10).some(m => m.toLowerCase().includes('process was saved successfully') || m.toLowerCase().includes('saved successfully'));
        if (confirmed) { console.log('✓ Process Selection confirmed'); break; }
        if (psPopup.isClosed()) break;
      }

      if (!psPopup.isClosed()) { try { for (const f of psPopup.frames()) { const c = f.locator('input[value="Close"]').first(); if (await c.isVisible({ timeout: 3000 }).catch(() => false)) { await c.click(); break; } } if (!psPopup.isClosed()) await psPopup.close().catch(() => {}); } catch (_) {} }
    }
  }

  hasSavedSuccessfully(keyword: string): boolean {
    return this.lastDialogMessages.some(m => {
      const lower = m.toLowerCase();
      // Match keyword OR common variations (e.g. "suspend" matches "suspension", "suspended")
      const hasKeyword = lower.includes(keyword) || lower.includes(keyword.replace(/e?d$/, ''));
      return hasKeyword && lower.includes('saved successfully');
    });
  }

  getBlockingDialogMessage(): string | null {
    const blockingPatterns = [
      /entity is under verification/i,
      /under verification/i,
      /pending verification/i,
      /cannot be suspended/i,
      /already suspended/i,
      /entity is locked/i,
      /entity is being processed/i,
    ];
    for (const msg of this.lastDialogMessages.slice(-10)) {
      for (const pattern of blockingPatterns) {
        if (pattern.test(msg)) return msg;
      }
    }
    return null;
  }

  async doLogout(): Promise<void> {
    await new HomePage(this.workingPage).logout();
  }
}
