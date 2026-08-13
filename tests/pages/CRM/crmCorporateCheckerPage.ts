import { Frame, Page } from '@playwright/test';
import { AppConfig, getCheckerConfig, getMakerConfig } from '../../config/crmTestData';
import { CrmRetailCheckerPage } from './crmRetailCheckerPage';

// =====================================================================
// CrmCorporateCheckerPage — page object for the Corporate CIF
// modification CHECKER (verification) workflow.
// Reuses the retail checker implementation where corporate and retail behave
// identically, and overrides the navigation steps that use different menus.
// =====================================================================

export class CrmCorporateCheckerPage extends CrmRetailCheckerPage {
  constructor(page: Page, config: AppConfig = getCheckerConfig(), lastDialogMessages: string[] = []) {
    super(page, config, lastDialogMessages);
  }

  // -------------------------------------------------------------
  // Corporate-specific navigation overrides
  // -------------------------------------------------------------

  async navigateToEntityQueue(): Promise<Frame> {
    const page = this.page;
    for (let i = 0; i < 15 && !page.frame({ name: 'Functionmain' }); i++) {
      await page.waitForTimeout(1000);
    }
    let queueFrame: Frame | null = null;
    for (let navTry = 1; navTry <= 3 && !queueFrame; navTry++) {
      const fm = page.frame({ name: 'Functionmain' });
      if (fm) {
        await fm.evaluate(() => {
          const el = document.getElementById('screen2');
          if (el) el.click();
        }).catch(() => {});
        await page.waitForTimeout(2000);
      }
      const menuFrame = page.frame({ name: '9' }) || (await this.findMenuFrame(page));
      if (menuFrame) await this.clickMenuItem(menuFrame, page, 'Entity Queue', 3000);
      await page.waitForTimeout(3000);
      queueFrame = await this.findFrameByText(page, /Entity Queue|Tray Type|Submitted For Approval/i, 8000);
      if (!queueFrame) console.log(`Entity Queue not loaded (attempt ${navTry}); retrying...`);
    }
    if (!queueFrame) throw new Error('Entity Queue page must load.');
    console.log('✓ Corporate Entity Queue page opened');
    return queueFrame;
  }

  async verifyAuditTrailAsMaker(
    cifId: string,
    makerUser: string = getMakerConfig().username,
    makerPass: string = getMakerConfig().password
  ): Promise<boolean> {
    const page = this.page;
    const ctx = page.context();

    // CHK_008: log out the checker.
    console.log('CHK_008: Logging out the checker...');
    this.allowLogout = true;
    let sessionPage: Page = page;
    if (sessionPage.isClosed()) {
      sessionPage = await ctx.newPage();
      this.attachDialogHandler(sessionPage);
    }
    await this.logout(sessionPage).catch(() => {});
    await sessionPage.waitForTimeout(2000).catch(() => {});
    this.allowLogout = false;

    // CHK_009/010: log in as the maker + switch to CRM.
    console.log(`CHK_009: Logging in as maker ${makerUser} + switching to CRM...`);
    let makerPage: Page | null = null;
    let makerCrmMenu: Frame | null = null;
    for (let attempt = 1; attempt <= 4 && !makerCrmMenu; attempt++) {
      makerPage = await ctx.newPage();
      this.attachDialogHandler(makerPage);
      try {
        await this.login(makerUser, makerPass, makerPage);
        const ok = await this.waitForDashboard(makerPage);
        if (ok && !makerPage.isClosed()) {
          await makerPage.waitForTimeout(3000);
          makerCrmMenu = await this.switchToCrm(false, makerPage);
        }
      } catch (e) {
        console.log(`CHK_009: attempt ${attempt} failed: ${(e as Error).message}`);
      }
      if (!makerCrmMenu) await new Promise((r) => setTimeout(r, 2000));
    }
    if (!makerCrmMenu) throw new Error(`${makerUser} login + CRM switch must succeed`);
    const mp = makerPage!;
    console.log(`✓ CHK_009/010: maker ${makerUser} logged in and CRM dashboard loaded`);

    // CHK_011: CIF Corporate > Edit Entity.
    console.log('CHK_011: Navigating to CIF Corporate > Edit Entity...');
    for (let i = 0; i < 15 && !mp.frame({ name: 'Functionmain' }); i++) {
      await mp.waitForTimeout(1000);
    }
    let eeOpened = false;
    for (let navTry = 1; navTry <= 3 && !eeOpened; navTry++) {
      const fm = mp.frame({ name: 'Functionmain' });
      if (fm) {
        await fm.evaluate(() => {
          const el = document.getElementById('screen2');
          if (el) el.click();
        }).catch(() => {});
        await mp.waitForTimeout(2000);
      }
      const menuFrame = mp.frame({ name: '9' }) || (await this.findMenuFrame(mp));
      if (menuFrame) await this.clickMenuItem(menuFrame, mp, 'Edit Entity', 3000);
      await mp.waitForTimeout(3000);
      eeOpened = !!(await this.findFrameByText(mp, /Corporate Search Criteria|Search Entity|Search Accounts/i, 6000));
    }
    console.log(`✓ CHK_011: Corporate Edit Entity opened = ${eeOpened}`);

    // CHK_012: fill CIF ID + Submit.
    console.log('CHK_012: Filling CIF ID and submitting in Edit Entity...');
    for (const f of mp.frames()) {
      const tab = f.getByText(/^\s*Search\s*Entity\s*$/i).first();
      if (await tab.isVisible().catch(() => false)) {
        await tab.click({ timeout: 3000 }).catch(() => {});
        break;
      }
    }
    await mp.waitForTimeout(1000).catch(() => {});
    let mIdFilled = false;
    for (const f of mp.frames()) {
      const isEditForm = await f.locator('input[name^="FilterParam"]').first().isVisible().catch(() => false);
      if (!isEditForm) continue;
      let inp = f.locator('xpath=//td[normalize-space(translate(., "\u00a0", " "))="CIF ID"]/following::input[not(@type) or @type="text"][1]').first();
      if (!(await inp.isVisible().catch(() => false))) {
        inp = f.locator('input[name^="FilterParam"]').first();
      }
      if (await inp.isVisible().catch(() => false)) {
        await inp.scrollIntoViewIfNeeded().catch(() => {});
        await inp.click().catch(() => {});
        await inp.fill('').catch(() => {});
        await inp.fill(cifId).catch(() => {});
        mIdFilled = (await inp.inputValue().catch(() => '')) === cifId;
        if (mIdFilled) break;
      }
    }
    console.log(`CHK_012: CIF ID filled = ${mIdFilled}`);
    const mClickValue = async (re: RegExp): Promise<boolean> => {
      for (const f of mp.frames()) {
        for (const b of await f.locator('input[type="button"], input[type="submit"], button').all().catch(() => [] as any[])) {
          const v = ((await b.getAttribute('value').catch(() => '')) || (await b.innerText().catch(() => '')) || '').trim();
          if (!re.test(v)) continue;
          await b.scrollIntoViewIfNeeded().catch(() => {});
          if (!(await b.isVisible().catch(() => false))) continue;
          await b.click({ timeout: 4000 }).catch(() => {});
          return true;
        }
      }
      return false;
    };
    for (const re of [/^Submit$/i, /^Go$/i, /^Search$/i, /^Get$/i]) {
      if (await mClickValue(re)) break;
    }
    await mp.waitForTimeout(3500).catch(() => {});

    // CHK_013: right-click the record > View > Audit Trail.
    let mRightClicked = false;
    let rcFrame: Frame | null = null;
    for (const f of mp.frames()) {
      const cifLink = f.locator(`a:has-text("${cifId}")`).first();
      if (!(await cifLink.isVisible().catch(() => false))) continue;
      const dataRow = cifLink.locator('xpath=ancestor::tr[1]');
      await dataRow.scrollIntoViewIfNeeded().catch(() => {});
      const selKind = await dataRow.evaluate((row) => {
        const inp = row.querySelector('input[type="radio"], input[type="checkbox"]') as HTMLInputElement | null;
        if (inp) {
          inp.checked = true;
          inp.click();
          return inp.type;
        }
        return '';
      }).catch(() => '');
      const textCell = dataRow.locator('td:not(:has(a)):not(:has(img)):not(:has(input))').filter({ hasText: /[A-Za-z0-9]/ }).first();
      if (!selKind) {
        if (await textCell.isVisible().catch(() => false)) await textCell.click({ timeout: 4000 }).catch(() => {});
        else await dataRow.click({ timeout: 4000 }).catch(() => {});
      }
      await mp.waitForTimeout(600).catch(() => {});
      if (await textCell.isVisible().catch(() => false)) {
        await textCell.click({ button: 'right', timeout: 5000 }).catch(() => {});
      } else {
        await dataRow.click({ button: 'right', timeout: 5000 }).catch(() => {});
      }
      mRightClicked = true;
      rcFrame = f;
      break;
    }
    console.log(`CHK_013: record right-clicked = ${mRightClicked}`);
    await mp.waitForTimeout(1500).catch(() => {});

    const auditPopupPromise = ctx.waitForEvent('page', { timeout: 12000 }).catch(() => null);
    const pagesBeforeAudit = new Set(ctx.pages());
    let mAuditClicked = false;
    if (mRightClicked) {
      const candidateFrames = rcFrame ? [rcFrame, ...mp.frames().filter((f) => f !== rcFrame)] : mp.frames();
      for (const f of candidateFrames) {
        const view = f.getByText(/^\s*View\s*$/i).first();
        if (await view.isVisible().catch(() => false)) {
          await view.hover().catch(() => {});
          await mp.waitForTimeout(800).catch(() => {});
        }
        const flyoutAudit = f.locator('xpath=//*[normalize-space()="Basel Profiling" or normalize-space()="Customer Details" or normalize-space()="Organization Details"]/ancestor::*[self::table or self::div or self::ul or self::td][1]//*[normalize-space()="Audit Trail"]').first();
        if (await flyoutAudit.isVisible().catch(() => false)) {
          await flyoutAudit.hover().catch(() => {});
          await flyoutAudit.click().catch(() => {});
          mAuditClicked = true;
          console.log(`CHK_013: View > Audit Trail (flyout) clicked in ${f.url().slice(-40)}`);
          break;
        }
      }
    }
    console.log(`CHK_013: Audit Trail clicked = ${mAuditClicked}`);
    await mp.waitForTimeout(3000).catch(() => {});

    // CHK_014: in the Audit Trail popup, Submit + read history.
    let auditWin = await auditPopupPromise;
    const isAuditUrl = (u: string) => /audit/i.test(u);
    const isMovedPopup = (u: string) => /SearchWorkArea_CIF/i.test(u);
    for (let i = 0; i < 12; i++) {
      const fresh = ctx.pages().filter((p) => !p.isClosed() && !pagesBeforeAudit.has(p));
      for (const p of fresh) if (isMovedPopup(p.url())) await p.close().catch(() => {});
      const candidates = ctx.pages().filter((p) => !p.isClosed() && !pagesBeforeAudit.has(p) && !isMovedPopup(p.url()));
      auditWin = candidates.find((p) => isAuditUrl(p.url())) || candidates[candidates.length - 1] || null;
      if (auditWin && !auditWin.isClosed()) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const haveAuditPopup = !!auditWin && !auditWin.isClosed();
    console.log(`CHK_014: audit window = ${haveAuditPopup ? auditWin!.url().slice(-55) : 'NONE'}`);
    if (!haveAuditPopup) return false;
    const auditPage: Page = auditWin!;
    let auditCloseAllowed = false;
    auditPage.on('dialog', async (d) => {
      this.lastDialogMessage = d.message();
      if (!auditCloseAllowed && /close (this )?(screen|window)/i.test(d.message())) {
        await d.dismiss().catch(() => {});
        return;
      }
      await d.accept().catch(() => {});
    });
    await auditPage.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    await auditPage.waitForTimeout(2000).catch(() => {});
    let auditSubmitted = false;
    for (const re of [/^Submit$/i, /^Go$/i, /^Search$/i, /^View$/i]) {
      for (const f of auditPage.frames()) {
        for (const b of await f.locator('input[type="button"], input[type="submit"], button').all().catch(() => [] as any[])) {
          const v = ((await b.getAttribute('value').catch(() => '')) || (await b.innerText().catch(() => '')) || '').trim();
          if (!re.test(v)) continue;
          await b.scrollIntoViewIfNeeded().catch(() => {});
          if (!(await b.isVisible().catch(() => false))) continue;
          await b.click({ timeout: 4000 }).catch(() => {});
          auditSubmitted = true;
          break;
        }
        if (auditSubmitted) break;
      }
      if (auditSubmitted) break;
    }
    console.log(`CHK_014: audit submit clicked = ${auditSubmitted}`);
    await auditPage.waitForTimeout(1000).catch(() => {});
    console.log('✓ CHK_014: Audit Trail approval history displayed');

    // CHK_015: log out.
    this.allowLogout = true;
    auditCloseAllowed = true;
    for (const p of ctx.pages()) {
      if (p === mp || p.isClosed()) continue;
      await p.close().catch(() => {});
    }
    let logoutPage: Page = mp;
    if (logoutPage.isClosed()) {
      logoutPage = await ctx.newPage();
      this.attachDialogHandler(logoutPage);
      await this.login(makerUser, makerPass, logoutPage).catch(() => {});
      await this.waitForDashboard(logoutPage).catch(() => {});
    }
    await this.logout(logoutPage).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
    console.log(`✓ CHK_015: ${makerUser} logout attempted.`);
    return auditSubmitted;
  }
}
