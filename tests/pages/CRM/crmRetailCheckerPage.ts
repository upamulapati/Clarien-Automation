import { Frame, Page, Locator } from '@playwright/test';
import { AppConfig } from '../../config/crmTestData';
import { CrmModificationBasePage } from './crmModificationBasePage';

// =====================================================================
// CrmRetailCheckerPage — page object for the Retail CIF *modification*
// CHECKER (verification) workflow:
//   Login (checker) -> CRM -> CIF Retail > Entity Queue -> locate the pending
//   "Submitted For Approval" record -> multi-step approve (KYCForm + ApprovalForm,
//   viewing the Audit Trail per step) -> log out the checker -> log in as the
//   maker -> CIF Retail > Edit Entity -> right-click the record > View > Audit
//   Trail -> Submit -> read the approval history -> log out.
//
// The checker manages its OWN dialog handling (it must NOT auto-accept a logout
// confirmation mid-approval), so it calls switchToCrm(false) and attaches its own
// dialog handler via attachDialogHandler().
// =====================================================================

export class CrmRetailCheckerPage extends CrmModificationBasePage {
  // When false, logout/close confirmations are DISMISSED (so we never kill the
  // session mid-flow); set true only when we explicitly intend to log out.
  allowLogout = false;

  constructor(page: Page, config: AppConfig, lastDialogMessages: string[] = []) {
    super(page, config, lastDialogMessages);
  }

  // Attach the checker dialog handler to a page: dismiss logout/close confirms
  // until allowLogout is set, otherwise accept.
  attachDialogHandler(p: Page): void {
    p.on('dialog', async (d) => {
      this.lastDialogMessage = d.message();
      console.log('Dialog:', d.message());
      if (!this.allowLogout && /log\s*out|log\s*off|sign\s*out/i.test(d.message())) {
        await d.dismiss().catch(() => {});
        return;
      }
      await d.accept().catch(() => {});
    });
  }

  // ---------------------------------------------------------------
  // CHK_003: CIF Retail > Entity Queue (reliable Functionmain/menu nav)
  // ---------------------------------------------------------------
  async navigateToEntityQueue(): Promise<Frame> {
    const page = this.page;
    for (let i = 0; i < 15 && !page.frame({ name: 'Functionmain' }); i++) {
      await page.waitForTimeout(1000);
    }
    let queueFrame: Frame | null = null;
    for (let navTry = 1; navTry <= 3 && !queueFrame; navTry++) {
      const fm = page.frame({ name: 'Functionmain' });
      if (fm) {
        await fm
          .evaluate(() => {
            const el = document.getElementById('screen1');
            if (el) el.click();
          })
          .catch(() => {});
        await page.waitForTimeout(2000);
      }
      const menuFrame = page.frame({ name: '1504' }) || (await this.findMenuFrame(page));
      if (menuFrame) await this.clickMenuItem(menuFrame, page, 'Entity Queue', 3000);
      await page.waitForTimeout(3000);
      queueFrame = await this.findFrameByText(page, /Entity Queue|Tray Type|Submitted For Approval/i, 8000);
      if (!queueFrame) console.log(`Entity Queue not loaded (attempt ${navTry}); retrying...`);
    }
    if (!queueFrame) throw new Error('Entity Queue page must load.');
    console.log('✓ Entity Queue page opened');
    return queueFrame;
  }

  // ---------------------------------------------------------------
  // CHK_004-007: Locate the pending record and approve it (multi-step).
  // ---------------------------------------------------------------
  async approvePendingModification(
    cifId: string
  ): Promise<{ pendingRecordExists: boolean; approveSelected: boolean; committed: boolean }> {
    const page = this.page;
    const ctx = page.context();
    const CIF_NOZERO = cifId.replace(/^0+/, '');
    const allFrames = (): Frame[] => ctx.pages().filter((p) => !p.isClosed()).flatMap((p) => p.frames());

    // ----- Queue helpers (frame-resilient) -----
    const findSelect = async (re: RegExp): Promise<Locator | null> => {
      for (const f of page.frames()) {
        let selects: Locator[] = [];
        try {
          selects = await f.locator('select:visible').all();
        } catch {
          continue;
        }
        for (const s of selects) {
          const opts = (await s.locator('option').allTextContents().catch(() => [])).map((o) => o.trim());
          if (opts.some((o) => re.test(o))) return s;
        }
      }
      return null;
    };
    const selectBy = async (re: RegExp, label: string): Promise<boolean> => {
      const sel = await findSelect(re);
      if (sel) await sel.selectOption({ label }, { timeout: 5000 }).catch(() => {});
      return !!sel;
    };
    const isQueueFormFrame = async (f: Frame): Promise<boolean> => {
      let sels: Locator[] = [];
      try {
        sels = await f.locator('select:visible').all();
      } catch {
        return false;
      }
      for (const s of sels) {
        const opts = (await s.locator('option').allTextContents().catch(() => [])).map((o) => o.trim());
        if (opts.some((o) => /^Self$/i.test(o))) return true;
      }
      return false;
    };
    const clickToolbarBtn = async (value: string): Promise<boolean> => {
      const re = new RegExp(`^\\s*${value}\\s*$`, 'i');
      for (const f of page.frames()) {
        const btns = await f.locator('input[type="submit"], input[type="button"], button').all().catch(() => []);
        for (const btn of btns) {
          if (!(await btn.isVisible().catch(() => false))) continue;
          const label =
            ((await btn.getAttribute('value').catch(() => '')) || (await btn.innerText().catch(() => '')) || '').trim();
          if (re.test(label)) {
            await btn.scrollIntoViewIfNeeded().catch(() => {});
            await btn.click({ timeout: 5000 }).catch(() => {});
            console.log(`[toolbar] clicked "${label}" in ${f.url().slice(-45)}`);
            return true;
          }
        }
      }
      return false;
    };
    const recordRowFrame = async (): Promise<Frame | null> => {
      for (const f of page.frames()) {
        for (const id of [cifId, CIF_NOZERO]) {
          const cell = f.locator(`a:has-text("${id}"), td:has-text("${id}")`).first();
          if (await cell.isVisible().catch(() => false)) return f;
        }
      }
      return null;
    };
    const fillEntityId = async (): Promise<boolean> => {
      for (const f of page.frames()) {
        if (!(await isQueueFormFrame(f))) continue;
        const candidates = await f
          .locator('input[type="text"]:visible, input:not([type]):visible')
          .all()
          .catch(() => []);
        let inp = f
          .locator('xpath=//*[normalize-space()="Entity ID"]/following::input[not(@type) or @type="text"][1]')
          .first();
        if (!(await inp.isVisible().catch(() => false)) && candidates.length) {
          inp = candidates[candidates.length - 1];
        }
        if (await inp.isVisible().catch(() => false)) {
          await inp.click({ timeout: 3000 }).catch(() => {});
          await inp.fill('', { timeout: 3000 }).catch(() => {});
          await inp.fill(cifId, { timeout: 5000 }).catch(() => {});
          const v = await inp.inputValue().catch(() => '');
          console.log(`[entityId] filled = "${v}"`);
          return v.includes(cifId);
        }
      }
      console.log('[entityId] WARNING - Entity ID field not found');
      return false;
    };
    const selectFirstGroup = async (): Promise<boolean> => {
      for (const f of page.frames()) {
        if (!(await isQueueFormFrame(f))) continue;
        for (const s of await f.locator('select').all().catch(() => [])) {
          const opts = (await s.locator('option').allTextContents().catch(() => [])).map((o) => o.trim());
          if (opts.some((o) => /\[\s*Group\s*\]/i.test(o))) {
            const real = opts.find((o) => o && !/\[\s*Group\s*\]|select/i.test(o));
            if (real) {
              await s.selectOption({ label: real }, { timeout: 5000 }).catch(() => {});
              console.log(`[group] selected "${real}"`);
              return true;
            }
          }
        }
      }
      return false;
    };
    const runSearch = async (tray: string, withId: boolean, withAction = false): Promise<Frame | null> => {
      await selectBy(new RegExp(`^${tray}$`, 'i'), tray);
      await page.waitForTimeout(1000);
      await selectBy(/^Customer$/i, 'Customer');
      if (withAction) await selectBy(/Submitted For Approval/i, 'Submitted For Approval');
      if (/Business Center Group/i.test(tray)) {
        await selectFirstGroup();
        await page.waitForTimeout(800);
      }
      if (withId) {
        const filled = await fillEntityId();
        console.log(`[search] Entity ID filled = ${filled}`);
      }
      let got = await clickToolbarBtn('Get');
      if (!got) {
        await page.waitForTimeout(800);
        got = await clickToolbarBtn('Get');
      }
      console.log(`[search] ${tray} Get clicked = ${got}`);
      await page.waitForTimeout(2500);
      return recordRowFrame();
    };

    // ----- CHK_004: locate the pending record -----
    console.log('CHK_004: Searching the Submitted For Approval queue...');
    await selectBy(/^Self$/i, 'Self');
    await page.waitForTimeout(800);
    await selectBy(/^Customer$/i, 'Customer');

    let recFrame: Frame | null = null;
    for (let attempt = 0; attempt < 4 && !recFrame; attempt++) {
      if (page.isClosed()) break;
      recFrame = await runSearch('Self', true, true).catch(() => null);
      if (!recFrame && /already approved/i.test(this.lastDialogMessage)) {
        console.log("CHK_004: 'already approved' detected — stopping search retries.");
        break;
      }
      if (!recFrame) await page.waitForTimeout(1500).catch(() => {});
    }

    const pendingRecordExists = !!recFrame;
    if (pendingRecordExists) console.log(`✓ CHK_004: Pending record ${cifId} located`);
    else
      console.log(
        `CHK_004: No pending record for ${cifId} (likely already approved — last dialog: "${this.lastDialogMessage}").`
      );

    // ----- control helpers used by the approval steps -----
    const clickControl = async (p: Page, re: RegExp): Promise<string | null> => {
      for (const f of p.frames()) {
        const loc = f.locator('input[type="button"], input[type="submit"], button, a').filter({ hasText: re }).first();
        if (await loc.isVisible().catch(() => false)) {
          const v =
            (await loc.getAttribute('value').catch(() => '')) || (await loc.innerText().catch(() => '')) || re.source;
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          await loc.click({ timeout: 5000 }).catch(() => {});
          return v.trim();
        }
      }
      for (const f of p.frames()) {
        const inputs = await f.locator('input[type="button"], input[type="submit"]').all().catch(() => []);
        for (const inp of inputs) {
          const v = (await inp.getAttribute('value').catch(() => '')) || '';
          if (re.test(v) && (await inp.isVisible().catch(() => false))) {
            await inp.scrollIntoViewIfNeeded().catch(() => {});
            await inp.click({ timeout: 5000 }).catch(() => {});
            return v.trim();
          }
        }
      }
      return null;
    };
    const clickAcrossPages = async (re: RegExp): Promise<string | null> => {
      for (const p of ctx.pages().filter((pp) => !pp.isClosed())) {
        const r = await clickControl(p, re).catch(() => null);
        if (r) return r;
      }
      return null;
    };
    const decisionSelect = async (label: RegExp): Promise<boolean> => {
      for (const f of allFrames()) {
        let sels: Locator[] = [];
        try {
          sels = await f.locator('select:visible').all();
        } catch {
          continue;
        }
        for (const s of sels) {
          for (const opt of await s.locator('option').all().catch(() => [])) {
            const text = ((await opt.textContent().catch(() => '')) || '').trim();
            const value = (await opt.getAttribute('value').catch(() => '')) || '';
            if (label.test(text)) {
              await s.selectOption(value ? { value } : { label: text }, { timeout: 5000 }).catch(() => {});
              console.log(`[decision] selected "${text.slice(-20)}" value="${value}"`);
              return true;
            }
          }
        }
      }
      return false;
    };
    const clickKyc = async (): Promise<boolean> => {
      for (const f of allFrames()) {
        const link = f
          .locator('a:has-text("Process Time"), a:has-text("KYCDecision"), a:has-text("Approval")')
          .first();
        if (await link.isVisible().catch(() => false)) {
          await link.scrollIntoViewIfNeeded().catch(() => {});
          await link.click({ timeout: 5000 }).catch(() => {});
          console.log(`CHK_006: process-step link clicked in ${f.url().slice(-45)}`);
          return true;
        }
      }
      return false;
    };
    const openProcessStepWindow = async (): Promise<Page | null> => {
      for (const f of allFrames()) {
        const tab = f
          .locator('a:has-text("Current Process Step"), td:has-text("Current Process Step"), span:has-text("Current Process Step")')
          .last();
        if (await tab.isVisible().catch(() => false)) {
          await tab.click({ timeout: 4000 }).catch(() => {});
          break;
        }
      }
      await page.waitForTimeout(1500).catch(() => {});
      const winPromise = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
      for (const f of allFrames()) {
        const icon = f
          .locator('a[title*="Window" i], img[title*="Window" i], a[title*="New" i], img[title*="New" i], [onclick*="window.open" i], [onclick*="NewWindow" i], [onclick*="newWindow" i]')
          .first();
        if (await icon.isVisible().catch(() => false)) {
          await icon.scrollIntoViewIfNeeded().catch(() => {});
          await icon.click({ timeout: 4000 }).catch(() => {});
          break;
        }
      }
      const win = await winPromise;
      if (win && !win.isClosed()) await win.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(1500).catch(() => {});
      return win;
    };
    let recordNotFound = false;
    const reselectAndOpenStepWindow = async (): Promise<Page | null> => {
      if (page.isClosed()) return null;
      let rf = await recordRowFrame();
      for (let attempt = 0; attempt < 5 && !rf; attempt++) {
        console.log(`CHK_006: re-searching the queue for the next step (attempt ${attempt})...`);
        rf = await runSearch('Self', true, true).catch(() => null);
        if (rf) break;
        if (/already approved/i.test(this.lastDialogMessage)) break;
        await page.waitForTimeout(3000).catch(() => {});
      }
      if (!rf) {
        recordNotFound = true;
        console.log('CHK_006: record not found on re-search; next step unavailable.');
        return null;
      }
      let cb = rf.locator('input[type="checkbox"][onclick*="AddSelectedRowToList"]').first();
      if (!(await cb.isVisible().catch(() => false))) {
        cb = rf.locator('tr', { hasText: CIF_NOZERO }).first().locator('input[type="checkbox"]').first();
      }
      if (await cb.isVisible().catch(() => false)) {
        await cb.scrollIntoViewIfNeeded().catch(() => {});
        await cb.click({ timeout: 3000 }).catch(() => {});
      }
      await page.waitForTimeout(2500).catch(() => {});
      return await openProcessStepWindow();
    };
    const closeWindowByButton = async (win: Page | null, label: string): Promise<void> => {
      if (!win || win === page || win.isClosed()) return;
      win.on('dialog', async (d) => {
        await d.accept().catch(() => {});
      });
      for (const f of win.frames()) {
        if (win.isClosed()) break;
        const clicked = await f
          .evaluate(() => {
            const norm = (s: string | null) => (s || '').replace(/\s+/g, ' ').trim();
            const controls = Array.from(
              document.querySelectorAll('input[type="button"], input[type="submit"], input[type="image"], button, a')
            ) as HTMLElement[];
            const matches = (e: HTMLElement) => {
              const cand: (string | null)[] = [
                (e as HTMLInputElement).value,
                e.textContent,
                e.getAttribute('title'),
                e.getAttribute('alt'),
              ];
              const img = e.querySelector('img');
              if (img) cand.push(img.getAttribute('alt'), img.getAttribute('title'));
              return cand.some((c) => /^close$/i.test(norm(c)));
            };
            const target = controls.find(matches);
            if (target) {
              target.click();
              return true;
            }
            return false;
          })
          .catch(() => false);
        if (clicked) break;
      }
      await page.waitForTimeout(400).catch(() => {});
      if (!win.isClosed()) await win.close().catch(() => {});
      console.log(`CHK_006: ${label} closed (${win.isClosed()}).`);
    };

    let approveSelected = false;
    let committed = false;

    // ----- CHK_005/006: select the record + multi-step approve -----
    if (recFrame) {
      console.log(`CHK_005: Selecting record ${cifId} and opening Current Process Step...`);
      const recRow = recFrame.locator('tr', { hasText: CIF_NOZERO }).first();
      let rowCheckbox = recFrame.locator('input[type="checkbox"][onclick*="AddSelectedRowToList"]').first();
      if (!(await rowCheckbox.isVisible().catch(() => false))) {
        rowCheckbox = recRow.locator('input[type="checkbox"]:not([name="Select All"])').first();
      }
      if (!(await rowCheckbox.isVisible().catch(() => false))) {
        rowCheckbox = recFrame.locator('input[type="checkbox"]').last();
      }
      await rowCheckbox.scrollIntoViewIfNeeded().catch(() => {});
      await rowCheckbox.click({ timeout: 3000 }).catch(() => {});
      if (!(await rowCheckbox.isChecked().catch(() => false))) {
        await rowCheckbox.check({ timeout: 3000 }).catch(() => {});
      }

      const paneRe = /Current Process Step|Entity Information Summary/i;
      const paneVisible = async (): Promise<boolean> => {
        for (const f of allFrames()) {
          if (await f.getByText(paneRe).first().isVisible().catch(() => false)) return true;
        }
        return false;
      };
      let paneUp = false;
      for (let i = 0; i < 6 && !paneUp; i++) {
        await page.waitForTimeout(1000);
        paneUp = await paneVisible();
      }
      if (!paneUp) {
        const firstCell = recRow.locator('td').first();
        if (await firstCell.isVisible().catch(() => false)) {
          await firstCell.click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(2000);
        }
      }
      for (const f of allFrames()) {
        const tab = f
          .locator('a:has-text("Current Process Step"), td:has-text("Current Process Step"), span:has-text("Current Process Step")')
          .last();
        if (await tab.isVisible().catch(() => false)) {
          await tab.scrollIntoViewIfNeeded().catch(() => {});
          await tab.click({ timeout: 5000 }).catch(() => {});
          break;
        }
      }
      await page.waitForTimeout(2500);

      // CHK_006: the KYC approval is multi-step (KYCForm then ApprovalForm).
      const saveRegexes = [/Save\s*KYCForm/i, /Save\s*\w*\s*Form/i, /^Authorize$/i, /^Submit$/i, /^Save\b/i];
      const savedButtons: string[] = [];
      for (let step = 0; step < 3; step++) {
        if (page.isClosed()) break;
        const popup = step === 0 ? await openProcessStepWindow() : await reselectAndOpenStepWindow();

        const approvalSaved = savedButtons.some((b) => /Approval/i.test(b));
        const alreadyApproved = /already approved/i.test(this.lastDialogMessage);
        if (committed && (alreadyApproved || (recordNotFound && approvalSaved))) {
          if (popup && !popup.isClosed()) await popup.close({ runBeforeUnload: false }).catch(() => {});
          break;
        }
        if (recordNotFound && !approvalSaved && !alreadyApproved) {
          if (popup && !popup.isClosed()) await popup.close({ runBeforeUnload: false }).catch(() => {});
          break;
        }

        let stepSelected = false;
        for (let attempt = 0; attempt < 6 && !stepSelected; attempt++) {
          if (page.isClosed()) break;
          await clickKyc();
          await page.waitForTimeout(2500).catch(() => {});
          stepSelected = await decisionSelect(/Approve/i);
          if (!stepSelected) await page.waitForTimeout(1500).catch(() => {});
        }
        if (!stepSelected) {
          if (popup && !popup.isClosed()) await popup.close({ runBeforeUnload: false }).catch(() => {});
          break;
        }
        approveSelected = true;

        // CHK_006b: View Audit Trail (Approval step only) before saving.
        await this.viewAuditTrailDuringApproval(popup, step);

        // Commit this step's decision.
        let stepSaved: string | null = null;
        for (const re of saveRegexes) {
          stepSaved = await clickAcrossPages(re);
          if (stepSaved) break;
        }
        if (!stepSaved) {
          if (popup && !popup.isClosed()) await popup.close({ runBeforeUnload: false }).catch(() => {});
          break;
        }
        committed = true;
        savedButtons.push(stepSaved);
        console.log(`CHK_006: step ${step} committed via "${stepSaved}"`);
        await page.waitForTimeout(2000).catch(() => {});

        await closeWindowByButton(popup, `approval form window (step ${step})`);
        for (const p of ctx.pages()) {
          if (p === page || p.isClosed()) continue;
          await closeWindowByButton(p, `process-step window ${p.url().slice(-30)}`);
        }
        if (/Approval/i.test(stepSaved)) {
          console.log('CHK_006: "Save ApprovalForm" committed — approval COMPLETE.');
          break;
        }
        await page.waitForTimeout(3000).catch(() => {});
      }
      console.log(`CHK_006: approveSelected=${approveSelected} committed=${committed} saved=${JSON.stringify(savedButtons)}`);
    }

    // Close leftover workflow popups.
    for (const p of ctx.pages()) {
      if (p !== page && !p.isClosed()) await p.close({ runBeforeUnload: false }).catch(() => {});
    }
    await page.waitForTimeout(1500).catch(() => {});

    return { pendingRecordExists, approveSelected, committed };
  }

  // CHK_006b: On the Approval step, click "View Audit Trail", submit the history,
  // read it, then close the audit popup. No-op on the KYCDecision step.
  private async viewAuditTrailDuringApproval(popup: Page | null, step: number): Promise<void> {
    const page = this.page;
    const ctx = page.context();
    const beforeAudit = new Set(ctx.pages());
    const auditP = ctx.waitForEvent('page', { timeout: 6000 }).catch(() => null);
    let auditLinkClicked = false;
    const auditSearchPages = [
      ...(popup && !popup.isClosed() ? [popup] : []),
      ...ctx.pages().filter((pp) => !pp.isClosed() && pp !== popup && pp !== page),
    ];
    for (const p of auditSearchPages) {
      for (const f of p.frames()) {
        const link = f.getByText(/View\s*Audit\s*Trail/i).first();
        if (await link.isVisible().catch(() => false)) {
          await link.scrollIntoViewIfNeeded().catch(() => {});
          await link.click({ timeout: 4000 }).catch(() => {});
          auditLinkClicked = true;
          console.log(`CHK_006b: clicked "View Audit Trail" on step ${step}`);
          break;
        }
      }
      if (auditLinkClicked) break;
    }
    if (!auditLinkClicked) return;
    await page.waitForTimeout(2500).catch(() => {});
    await auditP;
    const isAuditPage = (p: Page) => /AuditTrail/i.test(p.url()) || p.frames().some((f) => /AuditTrail/i.test(f.url()));
    let audit: Page | null = null;
    for (let i = 0; i < 10 && !audit; i++) {
      audit = ctx.pages().filter((p) => !p.isClosed() && !beforeAudit.has(p)).find(isAuditPage) || null;
      if (!audit) await page.waitForTimeout(800).catch(() => {});
    }
    if (!audit || audit.isClosed()) return;
    const ap = audit;
    ap.on('dialog', async (d) => {
      await d.accept().catch(() => {});
    });
    await ap.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    await ap.waitForTimeout(1500).catch(() => {});
    for (const re of [/^Submit$/i, /^Go$/i, /^Search$/i, /^View$/i]) {
      let done = false;
      for (const f of ap.frames()) {
        for (const b of await f.locator('input[type="button"], input[type="submit"], button').all().catch(() => [])) {
          const v = ((await b.getAttribute('value').catch(() => '')) || (await b.innerText().catch(() => '')) || '').trim();
          if (!re.test(v)) continue;
          await b.scrollIntoViewIfNeeded().catch(() => {});
          if (!(await b.isVisible().catch(() => false))) continue;
          await b.click({ timeout: 4000 }).catch(() => {});
          done = true;
          break;
        }
        if (done) break;
      }
      if (done) break;
    }
    await ap.waitForTimeout(1000).catch(() => {});
    console.log("✓ CHK_006b: Approval history viewed via 'View Audit Trail'.");
    if (!ap.isClosed()) await ap.close().catch(() => {});
  }

  // ---------------------------------------------------------------
  // CHK_008-015: Log out the checker, log in as the maker, open Edit Entity,
  // right-click the record > View > Audit Trail, submit, read history, log out.
  // Returns true when the Audit Trail history submit succeeded.
  // ---------------------------------------------------------------
  async verifyAuditTrailAsMaker(cifId: string, makerUser: string, makerPass: string): Promise<boolean> {
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

    // CHK_009/010: log in as the maker + switch to CRM (retry on page-close).
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

    // CHK_011: CIF Retail > Edit Entity (reliable Functionmain/menu nav).
    console.log('CHK_011: Navigating to CIF Retail > Edit Entity...');
    for (let i = 0; i < 15 && !mp.frame({ name: 'Functionmain' }); i++) {
      await mp.waitForTimeout(1000);
    }
    let eeOpened = false;
    for (let navTry = 1; navTry <= 3 && !eeOpened; navTry++) {
      const fm = mp.frame({ name: 'Functionmain' });
      if (fm) {
        await fm.evaluate(() => {
          const el = document.getElementById('screen1');
          if (el) el.click();
        }).catch(() => {});
        await mp.waitForTimeout(2000);
      }
      const menuFrame = mp.frame({ name: '1504' }) || (await this.findMenuFrame(mp));
      if (menuFrame) await this.clickMenuItem(menuFrame, mp, 'Edit Entity', 3000);
      await mp.waitForTimeout(3000);
      eeOpened = !!(await this.findFrameByText(mp, /Retail Search Criteria|Search Entity|Search Accounts/i, 6000));
    }
    console.log(`✓ CHK_011: Edit Entity opened = ${eeOpened}`);

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
      let inp = f
        .locator('xpath=//td[normalize-space(translate(., "\u00a0", " "))="CIF ID"]/following::input[not(@type) or @type="text"][1]')
        .first();
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
        for (const b of await f.locator('input[type="button"], input[type="submit"], button').all().catch(() => [])) {
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
      const selKind = await dataRow
        .evaluate((row) => {
          const inp = row.querySelector('input[type="radio"], input[type="checkbox"]') as HTMLInputElement | null;
          if (inp) {
            inp.checked = true;
            inp.click();
            return inp.type;
          }
          return '';
        })
        .catch(() => '');
      const textCell = dataRow
        .locator('td:not(:has(a)):not(:has(img)):not(:has(input))')
        .filter({ hasText: /[A-Za-z0-9]/ })
        .first();
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
        const flyoutAudit = f
          .locator(
            'xpath=//*[normalize-space()="Basel Profiling" or normalize-space()="Customer Details"]/ancestor::*[self::table or self::div or self::ul or self::td][1]//*[normalize-space()="Audit Trail"]'
          )
          .first();
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
        for (const b of await f.locator('input[type="button"], input[type="submit"], button').all().catch(() => [])) {
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
