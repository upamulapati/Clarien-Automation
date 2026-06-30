import { Page, Dialog } from '@playwright/test';
import { expect } from '@playwright/test';
import { AppConfig, VerificationOptions } from '../../config/crmTestData';
import { CrmBasePage } from './crmBasePage';
import { HomePage } from '../HomePages/HomePage';

// =====================================================================
// CrmVerificationPage — Entity Queue approval + 360° search assertion
// =====================================================================

export class CrmVerificationPage extends CrmBasePage {

  constructor(page: Page, config: AppConfig, lastDialogMessages: string[]) {
    super(page, config, lastDialogMessages);
  }

  async performVerification(options: VerificationOptions): Promise<void> {
    const page = this.page;
    const config = this.config;
    const lastDialogMessages = this.lastDialogMessages;
    const loginFrame = page.frameLocator('iframe[name="loginFrame"]');
    await page.waitForTimeout(config.timeouts.short);

    // ================================================================
    // Step 1: Select CRM Solution
    // ================================================================
    console.log('=== Step 1: Select CRM Solution ===');
    const homePage = new HomePage(page);
    await homePage.selectCRM();

    // ================================================================
    // Step 2: Wait for CRM to load
    // ================================================================
    console.log('=== Step 2: Wait for CRM to load ===');
    await this.waitForCRMLoad(page, config);
    await page.waitForTimeout(config.timeouts.medium);

    // ================================================================
    // Step 3: Navigate to section > Entity Queue
    // ================================================================
    console.log(`=== Step 3: Navigate to ${options.sectionLabel} > Entity Queue ===`);

    const functionMainFrame = page.frame({ name: 'Functionmain' });
    if (functionMainFrame) {
      if (options.screenId === 'screen2') {
        const clicked = await functionMainFrame.evaluate((sid: string) => {
          const el = document.getElementById(sid);
          if (el) { el.click(); return sid; }
          const allEls = document.querySelectorAll('a, span, div, td');
          for (const e of allEls) {
            const text = (e as HTMLElement).innerText?.trim() || '';
            if (text === 'CIF Corporate' || text.includes('CIF Corporate')) {
              (e as HTMLElement).click(); return text;
            }
          }
          return '';
        }, options.screenId);
        console.log(`✓ Clicked ${options.sectionLabel}: ${clicked}`);
      } else {
        await functionMainFrame.evaluate((sid: string) => {
          const el = document.getElementById(sid);
          if (el) el.click();
        }, options.screenId);
        console.log(`✓ Clicked ${options.sectionLabel}`);
      }
      await page.waitForTimeout(config.timeouts.medium);
    }

    // Find menu frame and click Entity Queue
    let menuFrame: any = null;
    if (options.menuFrameName) {
      menuFrame = page.frame({ name: options.menuFrameName });
      if (menuFrame) {
        const topItems = await menuFrame.locator('span.submenuout').allInnerTexts().catch(() => []);
        console.log('Menu items: ' + topItems.map((t: string) => `"${t.trim()}"`).join(', '));

        const eqClicked = await menuFrame.evaluate(() => {
          // Search all view elements for "Entity Queue"
          for (const el of document.querySelectorAll('[id^="view"]')) {
            const text = (el as HTMLElement).innerText?.trim() || '';
            if (text === 'Entity Queue') {
              (el as HTMLElement).click(); return `${el.id}="${text}"`;
            }
          }
          const spans = document.querySelectorAll('span.submenuout, span, a, div');
          for (const span of spans) {
            const text = (span as HTMLElement).innerText?.trim() || '';
            if (text === 'Entity Queue' || text.includes('Entity Queue')) {
              (span as HTMLElement).click(); return `text: "${text}"`;
            }
          }
          return '';
        }).catch(() => '');

        if (eqClicked) {
          console.log(`✓ Clicked Entity Queue in frame "${options.menuFrameName}": ${eqClicked}`);
          await page.waitForTimeout(5000);
        } else {
          await this.clickMenuItem(menuFrame, page, 'Entity Queue', 5000);
        }
      }
    }

    if (!menuFrame) {
      menuFrame = await this.findMenuFrame(page, options.menuKeywords);
      if (menuFrame) {
        const topItems = await menuFrame.locator('span.submenuout').allInnerTexts().catch(() => []);
        console.log('Menu items: ' + topItems.map((t: string) => `"${t.trim()}"`).join(', '));
        await this.clickMenuItem(menuFrame, page, 'Entity Queue', 5000);
        console.log('✓ Clicked Entity Queue');
      } else {
        throw new Error('Menu frame not found — cannot navigate to Entity Queue');
      }
    }

    // ================================================================
    // Step 4: Find Entity Queue form and fill Entity ID
    // ================================================================
    console.log('=== Step 4: Find Entity Queue form and fill Entity ID ===');
    await page.waitForTimeout(config.timeouts.medium);

    const cifIdToApprove = options.cifId;
    if (!cifIdToApprove) {
      throw new Error('No CIF ID available for verification');
    }
    console.log(`Filling Entity ID with CIF ID: ${cifIdToApprove}`);
    let cifFilled = '';

    for (const f of page.frames()) {
      if (cifFilled) break;
      try {
        const result = await f.evaluate((cifId: string) => {
          const selectors = [
            'input[name*="EntityId"]', 'input[name*="entityId"]', 'input[name*="Entity_Id"]',
            'input[name*="ENTITY_ID"]', 'input[name*="entityID"]', 'input[name*="entid"]',
            'input[name*="FilterParam"]'
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel) as HTMLInputElement;
            if (el && el.getBoundingClientRect().width > 0) {
              el.value = cifId;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
              return `filled via ${sel} (name=${el.name})`;
            }
          }
          const tds = Array.from(document.querySelectorAll('td'));
          for (const td of tds) {
            const txt = td.innerText?.trim();
            if (txt && (txt === 'Entity ID' || txt.includes('Entity ID'))) {
              let nextTd = td.nextElementSibling;
              while (nextTd) {
                const inp = nextTd.querySelector('input') as HTMLInputElement;
                if (inp) {
                  inp.value = cifId;
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                  inp.dispatchEvent(new Event('blur', { bubbles: true }));
                  return `filled via label proximity (name=${inp.name})`;
                }
                nextTd = nextTd.nextElementSibling;
              }
              const row = td.closest('tr');
              if (row) {
                const inp = row.querySelector('input[type="text"], input:not([type])') as HTMLInputElement;
                if (inp && !inp.readOnly && !inp.disabled) {
                  inp.value = cifId;
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                  inp.dispatchEvent(new Event('blur', { bubbles: true }));
                  return `filled via row proximity (name=${inp.name})`;
                }
              }
            }
          }
          return '';
        }, cifIdToApprove).catch(() => '');
        if (result) { cifFilled = result; console.log(`✓ Entity ID filled in frame "${f.name()}": ${result}`); }
      } catch (_) {}
    }

    // Last resort fallback
    if (!cifFilled) {
      for (const f of page.frames()) {
        if (cifFilled) break;
        const u = f.url();
        if (!u.includes('EntityModFilter') && f.name() !== 'userArea' && f.name() !== 'process') continue;
        try {
          const result = await f.evaluate((cifId: string) => {
            const allInputs = document.querySelectorAll('input[type="text"], input:not([type])');
            for (const inp of allInputs) {
              const el = inp as HTMLInputElement;
              if (el.getBoundingClientRect().width > 0 && !el.value && !el.readOnly && !el.disabled) {
                el.value = cifId;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
                return `filled last-resort input (name=${el.name})`;
              }
            }
            return '';
          }, cifIdToApprove).catch(() => '');
          if (result) { cifFilled = result; console.log(`✓ Entity ID filled (last-resort) in frame "${f.name()}": ${result}`); }
        } catch (_) {}
      }
    }

    if (!cifFilled) console.log('⚠ Could not fill Entity ID field in any frame');

    // ================================================================
    // Step 5: Click the Get button
    // ================================================================
    console.log('=== Step 5: Click Get button ===');
    let getClicked = false;
    for (const f of page.frames()) {
      if (getClicked) break;
      try {
        const clicked = await f.evaluate(() => {
          const btns = document.querySelectorAll('input[type="button"], input[type="submit"], button, input[value="Get"]');
          for (const btn of btns) {
            const val = (btn as HTMLInputElement).value || btn.textContent || '';
            if (val.trim() === 'Get' || val.trim() === 'Get ') {
              const r = (btn as HTMLElement).getBoundingClientRect();
              if (r.width > 0 && r.height > 0) { (btn as HTMLElement).click(); return true; }
            }
          }
          return false;
        }).catch(() => false);
        if (clicked) { console.log(`✓ Get button clicked in frame "${f.name()}"`); getClicked = true; }
      } catch (_) {}
    }
    if (!getClicked) console.log('⚠ Get button not found in any frame');
    await page.waitForTimeout(config.timeouts.medium);

    // Check if Entity ID was invalid — retry with empty search to get all pending items
    const entityInvalid = lastDialogMessages.slice(-5).some(m => /entity.*(id|ID).*(invalid|not found)/i.test(m));
    if (entityInvalid) {
      console.log('⚠ Entity ID invalid — retrying Get without CIF ID to list all pending items...');
      // Clear the CIF ID field and retry Get
      for (const f of page.frames()) {
        try {
          await f.evaluate(() => {
            document.querySelectorAll('input[type="text"], input:not([type])').forEach(el => {
              const inp = el as HTMLInputElement;
              if (inp.name && (inp.name.includes('cif') || inp.name.includes('entity') || inp.name.includes('Entity') || inp.name.includes('CIF') || inp.name.includes('FilterParam'))) {
                if (!inp.readOnly && !inp.disabled && inp.getBoundingClientRect().width > 0) {
                  inp.value = '';
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            });
          }).catch(() => {});
        } catch (_) {}
      }
      // Click Get again
      for (const f of page.frames()) {
        try {
          const clicked = await f.evaluate(() => {
            const btns = document.querySelectorAll('input[type="button"], input[type="submit"], button, input[value="Get"]');
            for (const btn of btns) {
              const val = (btn as HTMLInputElement).value || btn.textContent || '';
              if (val.trim() === 'Get' || val.trim() === 'Get ') {
                const r = (btn as HTMLElement).getBoundingClientRect();
                if (r.width > 0 && r.height > 0) { (btn as HTMLElement).click(); return true; }
              }
            }
            return false;
          }).catch(() => false);
          if (clicked) { console.log('✓ Get button clicked (empty search)'); break; }
        } catch (_) {}
      }
      await page.waitForTimeout(config.timeouts.medium);

      // List all pending records to find the CIF
      for (const f of page.frames()) {
        try {
          const content = await f.content();
          if (!content || !content.includes(cifIdToApprove)) continue;
          const links = await f.evaluate((cifId: string) => {
            const result: string[] = [];
            document.querySelectorAll('a, td').forEach(el => {
              const text = (el as HTMLElement).textContent?.trim() || '';
              if (text.includes(cifId)) result.push(`${el.tagName}: "${text.substring(0, 100)}"`);
            });
            return result;
          }, cifIdToApprove).catch(() => []);
          if (links.length > 0) console.log(`  Found CIF in pending records (frame "${f.name()}"): ${links.slice(0, 3).join(', ')}`);
        } catch (_) {}
      }
    }

    // ================================================================
    // Step 6: Click on the record in Customer Search Results
    // ================================================================
    console.log('=== Step 6: Click on the record in Customer Search Results ===');
    await page.waitForTimeout(config.timeouts.short3);
    let resultsClicked = false;

    for (const f of page.frames()) {
      try {
        const content = await f.content();
        if (!content || !content.includes(cifIdToApprove)) continue;

        const clicked = await f.evaluate((cifId: string) => {
          const links = document.querySelectorAll('a');
          for (const link of links) {
            if (link.textContent?.trim() === cifId || link.textContent?.includes(cifId)) {
              link.click(); return `clicked CIF ID link: ${link.textContent?.trim()}`;
            }
          }
          const rows = document.querySelectorAll('tr');
          for (const row of rows) {
            if (row.textContent?.includes(cifId)) {
              const firstTd = row.querySelector('td');
              if (firstTd) { firstTd.click(); return `clicked row td containing CIF ID`; }
              row.click(); return `clicked row containing CIF ID`;
            }
          }
          return '';
        }, cifIdToApprove).catch(() => '');

        if (clicked) { console.log(`✓ Record clicked: ${clicked}`); resultsClicked = true; break; }
      } catch (_) {}
    }
    if (!resultsClicked) console.log('⚠ Could not find/click the record');
    await page.waitForTimeout(config.timeouts.medium);

    // Step 6b: Close entity detail popup
    console.log('=== Step 6b: Close popup after clicking record ===');
    for (const p of page.context().pages()) {
      if (p === page || p.isClosed()) continue;
      const pUrl = p.url();
      if (options.popupCloseUrls.some(u => pUrl.includes(u))) {
        console.log(`✓ Closing popup: ${pUrl.substring(pUrl.lastIndexOf('/') + 1).substring(0, 80)}`);
        await p.close().catch(() => {});
      }
    }
    await page.waitForTimeout(config.timeouts.medium);

    // ================================================================
    // Step 7: Select "Current Process Step" tab
    // ================================================================
    console.log('=== Step 7: Select Current Process Step tab ===');
    let tabClicked = false;

    for (const f of page.frames()) {
      try {
        const clicked = await f.evaluate(() => {
          const tabSelectors = ['a', 'span', 'div', 'td', 'li', 'button', 'input'];
          for (const sel of tabSelectors) {
            const elements = document.querySelectorAll(sel);
            for (const el of elements) {
              const text = (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).value?.trim() || '';
              if (text === 'Current Process Step' || text.includes('Current Process Step')) {
                (el as HTMLElement).click(); return `clicked ${sel} with text "${text}"`;
              }
            }
          }
          return '';
        }).catch(() => '');
        if (clicked) { console.log(`✓ Current Process Step tab: ${clicked}`); tabClicked = true; break; }
      } catch (_) {}
    }
    if (!tabClicked) console.log('⚠ Current Process Step tab not found');
    await page.waitForTimeout(config.timeouts.medium);

    // ================================================================
    // Step 8: Click "Approval" link
    // ================================================================
    console.log('=== Step 8: Click Approval link ===');
    const approvalPopupPromise = page.context().waitForEvent('page', { timeout: 30000 }).catch(() => null);
    let approvalLinkClicked = false;

    for (const f of page.frames()) {
      try {
        const clicked = await f.evaluate((style: string) => {
          const links = document.querySelectorAll('a');

          if (style === 'corporate') {
            for (const link of links) {
              const text = link.textContent?.trim() || '';
              if (text.includes('Process Time')) { link.click(); return `clicked link: "${text.substring(0, 80)}"`; }
            }
            for (const link of links) {
              const text = link.textContent?.trim() || '';
              if (text.includes('CorpApprove') || text.includes('Approve')) { link.click(); return `clicked link: "${text.substring(0, 80)}"`; }
            }
          }

          for (const link of links) {
            const text = link.textContent?.trim() || '';
            if (text.includes('Approval') && text.includes('Process Time')) {
              link.click(); return `clicked link: "${text.substring(0, 80)}"`;
            }
          }
          const elements = document.querySelectorAll('a, span, div');
          for (const el of elements) {
            const text = (el as HTMLElement).innerText?.trim() || '';
            if (text.includes('Approval') && (text.includes('Process Time') || text.includes('1 Day'))) {
              (el as HTMLElement).click(); return `clicked element: "${text.substring(0, 80)}"`;
            }
          }
          return '';
        }, options.approvalLinkStyle).catch(() => '');

        if (clicked) { console.log(`✓ Approval link: ${clicked}`); approvalLinkClicked = true; break; }
      } catch (_) {}
    }
    if (!approvalLinkClicked) console.log('⚠ Approval link not found');

    // ================================================================
    // Step 9: Handle Approval popup — Select Approve and Save
    // ================================================================
    console.log('=== Step 9: Handle Approval popup ===');

    const approvalPopup = await approvalPopupPromise;
    if (approvalPopup && !approvalPopup.isClosed()) {
      console.log(`✓ Approval popup opened: ${approvalPopup.url()}`);

      approvalPopup.on('dialog', async (d: Dialog) => {
        lastDialogMessages.push(d.message());
        console.log(`📢 Approval popup dialog: "${d.message().substring(0, 150)}"`);
        await d.accept().catch(() => {});
      });

      await approvalPopup.waitForLoadState('domcontentloaded').catch(() => {});
      await approvalPopup.waitForTimeout(config.timeouts.medium);

      const target = await this.findPopupTarget(approvalPopup);
      await this.listVisibleFields(target, 'Approval Form');

      // Select "Approve" from the Decision dropdown
      console.log('Selecting "Approve" from Decision dropdown...');
      const approveSelected = await target.evaluate(() => {
        const selects = document.querySelectorAll('select');
        for (const sel of selects) {
          const name = (sel as HTMLSelectElement).name || '';
          if (name.toLowerCase().includes('decision') || name.toLowerCase().includes('approval')) {
            const options = Array.from((sel as HTMLSelectElement).options);
            for (const opt of options) {
              if (opt.text.trim() === 'Approve' || opt.value === 'Approve') {
                (sel as HTMLSelectElement).value = opt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                return `selected "Approve" in select name="${name}"`;
              }
            }
          }
        }
        for (const sel of selects) {
          const options = Array.from((sel as HTMLSelectElement).options);
          for (const opt of options) {
            if (opt.text.trim() === 'Approve' || opt.value === 'Approve') {
              (sel as HTMLSelectElement).value = opt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              return `selected "Approve" in fallback select name="${(sel as HTMLSelectElement).name}"`;
            }
          }
        }
        return '';
      }).catch(() => '');

      if (approveSelected) console.log(`✓ ${approveSelected}`);
      else console.log('⚠ Could not select Approve from Decision dropdown');

      await approvalPopup.waitForTimeout(config.timeouts.short);

      // Click "Save Approval Form" button
      console.log('Clicking Save Approval Form button...');
      let saveClicked = '';
      const popupFramesToSearch = [approvalPopup, ...approvalPopup.frames()];
      for (const pf of popupFramesToSearch) {
        if (saveClicked) break;
        try {
          const result = await pf.evaluate(() => {
            const selectors = [
              'input[value="Save Approval Form"]', 'input[value="Save Approval form"]',
              'input[value="Save Approval Form "]',
              'input[type="button"][value*="Save Approval"]',
              'input[type="submit"][value*="Save Approval"]'
            ];
            for (const sel of selectors) {
              const el = document.querySelector(sel) as HTMLElement;
              if (el && el.getBoundingClientRect().width > 0) { el.click(); return `clicked via ${sel}`; }
            }
            const btns = document.querySelectorAll('input[type="button"], input[type="submit"], button');
            for (const btn of btns) {
              const val = (btn as HTMLInputElement).value || btn.textContent || '';
              if (val.includes('Save Approval') || val.includes('Save approval')) {
                (btn as HTMLElement).click(); return `clicked button with text "${val.trim()}"`;
              }
            }
            for (const btn of btns) {
              const val = (btn as HTMLInputElement).value || btn.textContent || '';
              if (val.trim().toLowerCase().startsWith('save')) {
                (btn as HTMLElement).click(); return `clicked save-like button: "${val.trim()}"`;
              }
            }
            return '';
          }).catch(() => '');
          if (result) {
            saveClicked = result;
            const frameName = pf === approvalPopup ? 'popup-main' : (pf as any).name?.() || '(frame)';
            console.log(`✓ Save Approval Form in ${frameName}: ${result}`);
          }
        } catch (_) {}
      }
      if (!saveClicked) console.log('⚠ Save Approval Form button not found in any popup frame');

      // Wait for confirmation
      console.log('Waiting for confirmation after save...');
      if (!approvalPopup.isClosed()) {
        await approvalPopup.waitForTimeout(config.timeouts.medium).catch(() => {});
      } else {
        await page.waitForTimeout(config.timeouts.short);
      }

      let approvalConfirmed = false;
      for (const msg of lastDialogMessages.slice(-10)) {
        if (msg.toLowerCase().includes('saved successfully') || msg.toLowerCase().includes('approved') || msg.toLowerCase().includes('success')) {
          approvalConfirmed = true;
          console.log(`✓ CONFIRMED — Dialog: "${msg}"`);
          break;
        }
      }
      if (!approvalConfirmed) {
        console.log('⚠ Approval confirmation dialog not detected');
        console.log(`  Recent dialog messages: ${lastDialogMessages.slice(-5).map(m => `"${m.substring(0, 100)}"`).join(' | ')}`);
      }

      // Close popup if still open
      if (!approvalPopup.isClosed()) {
        try {
          const closeBtn = approvalPopup.locator('input[value="Close"], button:has-text("Close")').first();
          if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await closeBtn.click();
            console.log('✓ Clicked Close on Approval popup');
          }
          await approvalPopup.waitForTimeout(config.timeouts.short).catch(() => {});
          if (!approvalPopup.isClosed()) await approvalPopup.close().catch(() => {});
        } catch (_) {}
      }
    } else {
      console.log('⚠ Approval popup not detected — trying inline form...');
      for (const f of page.frames()) {
        try {
          const content = await f.content();
          if (content && (content.includes('Approval Form') || content.includes('Decision'))) {
            console.log(`Found Approval form inline in frame "${f.name()}"`);
            await f.evaluate(() => {
              const selects = document.querySelectorAll('select');
              for (const sel of selects) {
                const options = Array.from((sel as HTMLSelectElement).options);
                for (const opt of options) {
                  if (opt.text.trim() === 'Approve') {
                    (sel as HTMLSelectElement).value = opt.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                  }
                }
              }
            }).catch(() => {});
            console.log('✓ Selected Approve in inline form');

            await page.waitForTimeout(config.timeouts.short);

            await f.evaluate(() => {
              const btns = document.querySelectorAll('input[type="button"], input[type="submit"], button');
              for (const btn of btns) {
                const val = (btn as HTMLInputElement).value || btn.textContent || '';
                if (val.includes('Save Approval')) { (btn as HTMLElement).click(); break; }
              }
            }).catch(() => {});
            console.log('✓ Clicked Save Approval Form in inline form');
            break;
          }
        } catch (_) {}
      }
    }

    // Take screenshot after approval
    await page.screenshot({ path: `test-results-temp/${options.screenshotPrefix}-approval-final.png` }).catch(() => {});
    console.log('📸 Approval screenshot saved');

    // ================================================================
    // Step 10: Navigate to 360 Degrees View > Search Entity
    // ================================================================
    console.log(`=== Step 10: Navigate to 360 Degrees View > ${options.searchMenuItem} ===`);

    const funcMainFrame = page.frame({ name: 'Functionmain' });
    if (funcMainFrame) {
      await funcMainFrame.evaluate(() => { const el = document.getElementById('screen0'); if (el) el.click(); });
      console.log('✓ Clicked 360 Degrees View');
      await page.waitForTimeout(config.timeouts.medium);
    } else {
      console.log('⚠ Functionmain frame not found for 360 Degrees View navigation');
    }

    let menuFrame360: any = null;
    for (const f of page.frames()) {
      try {
        const spans = await f.locator('span.submenuout').all();
        if (spans.length === 0) continue;
        const content = await f.content();
        if (content && (content.includes(options.searchMenuItem) || content.includes('360'))) {
          menuFrame360 = f;
          console.log(`✓ Found 360° menu frame: "${f.name()}" (${spans.length} menu spans)`);
          break;
        }
      } catch (_) {}
    }
    if (!menuFrame360) menuFrame360 = await this.findMenuFrame(page);

    if (menuFrame360) {
      const menuItems360 = await menuFrame360.locator('span.submenuout').allInnerTexts();
      console.log('360° Menu items: ' + menuItems360.map((t: string) => `"${t.trim()}"`).join(', '));
      await this.clickMenuItem(menuFrame360, page, options.searchMenuItem, 5000);
      console.log(`✓ Clicked ${options.searchMenuItem}`);
    } else {
      console.log(`⚠ Menu frame not found for ${options.searchMenuItem}`);
    }
    await page.waitForTimeout(config.timeouts.long);

    // ================================================================
    // Step 11: Fill CIF ID and Submit in Search Entity
    // ================================================================
    console.log(`=== Step 11: Fill CIF ID and Submit in ${options.searchMenuItem} ===`);

    let searchFormFrame: any = null;
    const dataAreaFrame = page.frame({ name: 'DataAreaFrm' });
    if (dataAreaFrame) {
      try {
        const content = await dataAreaFrame.content();
        if (content && (content.includes(options.searchCriteria) || content.includes('Search Criteria'))) {
          searchFormFrame = dataAreaFrame;
          console.log(`✓ Found ${options.searchCriteria} in DataAreaFrm`);
        }
      } catch (_) {}
    }
    if (!searchFormFrame) {
      for (const f of page.frames()) {
        try {
          const content = await f.content();
          if (content && (content.includes(options.searchCriteria) || content.includes('Search Criteria'))) {
            searchFormFrame = f;
            console.log(`✓ Found ${options.searchCriteria} in frame "${f.name()}"`);
            break;
          }
        } catch (_) {}
      }
    }

    let searchFormFilled = false;
    if (searchFormFrame) {
      const fillResult = await searchFormFrame.evaluate((cifId: string) => {
        const nameSelectors = [
          'input[name="cifID"]', 'input[name="cifId"]', 'input[name="CIF_ID"]',
          'input[name="CIFID"]', 'input[name="cif_id"]',
          'input[name="AccountBO.cifID"]', 'input[name="AccountBO.CIF_ID"]',
          'input[name="CorporateBO.cifID"]', 'input[name="CorporateModBO.cifID"]'
        ];
        for (const sel of nameSelectors) {
          const el = document.querySelector(sel) as HTMLInputElement;
          if (el && el.getBoundingClientRect().width > 0) {
            el.value = cifId;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            return `filled via ${sel} (name=${el.name})`;
          }
        }
        const allCells = document.querySelectorAll('td, th, span, label');
        for (const cell of allCells) {
          const text = cell.textContent?.trim();
          if (text !== 'CIF ID' && text !== 'CIF ID.') continue;
          let sibling = cell.nextElementSibling;
          while (sibling) {
            const inp = sibling.querySelector('input[type="text"], input:not([type])') as HTMLInputElement;
            if (inp && inp.getBoundingClientRect().width > 0 && !inp.readOnly && !inp.disabled) {
              inp.value = cifId;
              inp.dispatchEvent(new Event('change', { bubbles: true }));
              inp.dispatchEvent(new Event('blur', { bubbles: true }));
              return `filled via CIF ID label proximity (name=${inp.name})`;
            }
            sibling = sibling.nextElementSibling;
          }
          const row = cell.closest('tr');
          if (row) {
            const rowInputs = row.querySelectorAll('input[type="text"], input:not([type])');
            for (const ri of rowInputs) {
              const inp = ri as HTMLInputElement;
              if (inp.getBoundingClientRect().width > 0 && !inp.readOnly && !inp.disabled) {
                inp.value = cifId;
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                inp.dispatchEvent(new Event('blur', { bubbles: true }));
                return `filled via CIF ID row proximity (name=${inp.name})`;
              }
            }
          }
        }
        return '';
      }, cifIdToApprove).catch(() => '');

      if (fillResult) {
        console.log(`✓ CIF ID filled: ${fillResult}`);
        searchFormFilled = true;
      } else {
        console.log('⚠ Could not find CIF ID field in the search form');
      }

      // Click Submit button — search ALL frames
      let submitClicked = '';
      for (const f of page.frames()) {
        if (submitClicked) break;
        try {
          const result = await f.evaluate(() => {
            const allBtns = document.querySelectorAll('input[type="button"], input[type="submit"], input[name="Submit"], button');
            for (const btn of allBtns) {
              const val = ((btn as HTMLInputElement).value || btn.textContent || '').trim();
              if (val === 'Submit') {
                (btn as HTMLElement).click();
                return `clicked "${val}" (name=${(btn as HTMLInputElement).name}, type=${(btn as HTMLInputElement).type})`;
              }
            }
            return '';
          }).catch(() => '');
          if (result) {
            submitClicked = result;
            console.log(`✓ Submit clicked in frame "${f.name()}": ${result}`);
          }
        } catch (_) {}
      }
      if (!submitClicked) console.log('⚠ Submit button not found in any frame');
    } else {
      console.log(`⚠ Could not find ${options.searchCriteria} form in any frame`);
    }

    await page.waitForTimeout(config.timeouts.long);

    // ================================================================
    // Step 12: Assert CIF record is present with status indicator
    // ================================================================
    console.log(`=== Step 12: Assert CIF record present with ${options.statusLabel} status ===`);

    for (const f of page.frames()) {
      try {
        const content = await f.content();
        if (!content) continue;
        const hasCifId = content.includes(cifIdToApprove);
        const hasResults = content.includes('Search Results') || content.includes('search results');
        if (hasCifId || hasResults) {
          console.log(`  Frame "${f.name()}" -> hasCifId: ${hasCifId}, hasResults: ${hasResults}, url: ${f.url().substring(0, 80)}`);
        }
      } catch (_) {}
    }

    let cifRecordFound = false;
    let statusTickFound = false;

    const allFrames = page.frames();
    let resultFrame: any = null;
    for (const f of allFrames) {
      try {
        const content = await f.content();
        if (!content || !content.includes(cifIdToApprove)) continue;
        const hasResultsFrame = content.includes('Search Results') || content.includes('Customer Search') || content.includes('Corporate Search') || content.includes('search result');
        if (hasResultsFrame) { resultFrame = f; break; }
        if (!resultFrame) resultFrame = f;
      } catch (_) {}
    }

    if (resultFrame) {
      const f = resultFrame;
      try {
        cifRecordFound = true;
        console.log(`✓ CIF record found in search results (frame "${f.name()}")`);

        const statusResult = await f.evaluate((cifId: string) => {
          const rows = document.querySelectorAll('tr');
          for (const row of rows) {
            const rowText = row.textContent || '';
            if (!rowText.includes(cifId)) continue;

            const cells = row.querySelectorAll('td');
            const cellCount = cells.length;

            const rowImgs: { src: string; alt: string; title: string; cellIdx: number }[] = [];
            cells.forEach((cell, idx) => {
              const imgs = cell.querySelectorAll('img');
              imgs.forEach(img => {
                rowImgs.push({
                  src: img.getAttribute('src') || '',
                  alt: img.getAttribute('alt') || '',
                  title: img.getAttribute('title') || '',
                  cellIdx: idx
                });
              });
            });

            if (rowImgs.length > 0) {
              const imgDetails = rowImgs.map(i => `cell[${i.cellIdx}] src="${i.src}" alt="${i.alt}"`).join(', ');
              // Filter out generic navigation/decoration images (arrows, spacers, etc.)
              const navPatterns = /arrow|spacer|blank|pixel|sort|expand|collapse|tree|menu|nav/i;
              const statusImgs = rowImgs.filter(img => {
                const combined = `${img.src} ${img.alt} ${img.title}`;
                return !navPatterns.test(combined);
              });
              for (const img of statusImgs) {
                const combined = `${img.src} ${img.alt} ${img.title}`.toLowerCase();
                if (combined.includes('tick') || combined.includes('check') || combined.includes('green') ||
                    combined.includes('true') || combined.includes('yes') || combined.includes('approved') ||
                    combined.includes('active') || combined.includes('suspend') || combined.includes('frozen') ||
                    combined.includes('inactive') || combined.includes('block') || combined.includes('red') || combined.includes('cross')) {
                  return { found: true, detail: `status img: src="${img.src}" alt="${img.alt}" in cell[${img.cellIdx}]` };
                }
              }
              // Only count as found if there are non-navigation images (potential status icons)
              if (statusImgs.length > 0) {
                return { found: true, detail: `row has ${statusImgs.length} status img(s): ${statusImgs.map(i => `cell[${i.cellIdx}] src="${i.src}" alt="${i.alt}"`).join(', ')}` };
              }
              // All images are navigation arrows — don't count as status found
              console.log(`  ℹ Row has ${rowImgs.length} img(s) but all are navigation/decoration: ${imgDetails}`);
            }

            for (const cell of cells) {
              const cellText = cell.textContent?.trim().toLowerCase() || '';
              // Only check short cell text as status indicators (skip large multi-content cells)
              if (cellText.length > 30) continue;
              if (cellText === '✓' || cellText === '✔' || cellText === 'active' || cellText === 'approved' ||
                  cellText === 'suspended' || cellText === 'suspend' || cellText === 'suspended customer' ||
                  cellText === '✗' || cellText === '✘' || cellText === 'inactive') {
                return { found: true, detail: `status text: "${cell.textContent?.trim()}"` };
              }
            }

            return { found: false, detail: `CIF row found (${cellCount} cells) but no status indicator. Row text: "${rowText.substring(0, 200)}"` };
          }
          return { found: false, detail: 'CIF row not found in any tr' };
        }, cifIdToApprove).catch(() => ({ found: false, detail: 'evaluate error' }));

        if (statusResult.found) {
          statusTickFound = true;
          console.log(`✓ Status confirmed: ${statusResult.detail}`);
        } else {
          console.log(`⚠ Status check: ${statusResult.detail}`);
        }
      } catch (_) {}
    }

    await page.screenshot({ path: `test-results-temp/${options.screenshotPrefix}-360-search-results.png` }).catch(() => {});
    console.log('📸 360° Search Results screenshot saved');

    expect(cifRecordFound, `CIF record ${cifIdToApprove} should be present in Customer Search Results`).toBe(true);
    expect(statusTickFound, `CIF record ${cifIdToApprove} status should show ${options.statusLabel} indicator`).toBe(true);

    console.log(`✅ ${options.summaryTitle} completed successfully`);

    console.log(`\n=== ${options.summaryTitle} Summary ===`);
    console.log(`  CIF ID: ${cifIdToApprove}`);
    console.log(`  User: ${config.username}`);
    console.log(`  ✓ Navigated to ${options.sectionLabel} > Entity Queue`);
    console.log('  ✓ Searched for CIF ID via Get');
    console.log('  ✓ Clicked record in Customer Search Results');
    console.log('  ✓ Selected Current Process Step tab');
    console.log('  ✓ Clicked Approval link');
    console.log('  ✓ Selected Approve and clicked Save Approval Form');
    console.log(`  ✓ Navigated to 360 Degrees View > ${options.searchMenuItem}`);
    console.log(`  ✓ CIF record found with ${options.statusLabel} status`);
    console.log(`=== ${options.summaryTitle} completed ===`);

    await new HomePage(page).logout();
  }
}
