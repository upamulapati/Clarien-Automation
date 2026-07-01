import { Frame, Page, Dialog } from '@playwright/test';
import { AppConfig } from '../../config/crmTestData';
import { CrmBasePage } from './crmBasePage';

// =====================================================================
// CrmModificationBasePage — shared base for the CIF *modification* page
// objects (retail + corporate maker/checker flows).
//
// The modification specs interact with the legacy Finacle frameset via a
// robust login (handles the "already logged in" screen), a CoreServer->CRM
// solution switch, and a large set of frame-scanning helpers. These are
// common to both retail and corporate, so they live here; the retail and
// corporate modification pages extend this class and add their own
// entity-specific steps.
// =====================================================================

export class CrmModificationBasePage extends CrmBasePage {
  // Track the most recent native dialog message (e.g. "The Entity is under
  // Verification") so callers can react to it.
  lastDialogMessage = '';

  constructor(page: Page, config: AppConfig, lastDialogMessages: string[] = []) {
    super(page, config, lastDialogMessages);
  }

  // ---------------------------------------------------------------
  // Generic frame helpers
  // ---------------------------------------------------------------

  // Find the frame that contains the login form (>1 input field).
  protected async getLoginFrame(page: Page): Promise<Frame> {
    const frames = page.frames();
    for (let i = 0; i < frames.length; i++) {
      const frameInputs = await frames[i].locator('input').all();
      if (frameInputs.length > 1) return frames[i];
    }
    return page.mainFrame();
  }

  // Wait until the post-login dashboard header is visible. The app is a
  // frameset that keeps the SSOLogin.jsp URL, so detect the dashboard by the
  // "User:" / "Solution:" labels or the CoreServer/CRM solution dropdown.
  async waitForDashboard(page: Page, timeoutMs = 30000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const f of page.frames()) {
        const marker = f.locator('text=/User\\s*:/i, text=/Solution\\s*:/i').first();
        if (await marker.isVisible().catch(() => false)) return true;
        const sol = f.locator('select').filter({ hasText: /CoreServer|CRM/i }).first();
        if (await sol.isVisible().catch(() => false)) return true;
      }
      await page.waitForTimeout(1000);
    }
    return false;
  }

  // Locate the Solution dropdown (the <select> listing CoreServer/CRM).
  protected async getSolutionDropdown(page: Page) {
    for (const f of page.frames()) {
      const selects = await f.locator('select').all();
      for (const sel of selects) {
        if (!(await sel.isVisible().catch(() => false))) continue;
        const opts = await sel.locator('option').allTextContents().catch(() => []);
        if (opts.some((t) => /CoreServer|CRM/i.test(t))) {
          return { frame: f, select: sel, options: opts };
        }
      }
    }
    return null;
  }

  // After selecting CRM, Finacle may show an in-page confirmation requiring a
  // Submit/OK/Yes click. Search all frames of all pages.
  async clickSolutionSubmit(page: Page, timeoutMs = 10000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const selector =
      'input[type="submit"][value="Submit"], input[type="button"][value="Submit"], ' +
      'button:has-text("Submit"), input[value="OK"], button:has-text("OK"), ' +
      'input[value="Yes"], button:has-text("Yes")';
    while (Date.now() < deadline) {
      const pages = [page, ...page.context().pages().filter((p) => p !== page)];
      for (const p of pages) {
        for (const f of p.frames()) {
          const btn = f.locator(selector).first();
          if (await btn.isVisible().catch(() => false)) {
            const label =
              (await btn.getAttribute('value').catch(() => null)) ||
              (await btn.textContent().catch(() => null)) ||
              'Submit';
            console.log(`Clicking solution-switch confirm button: "${label.trim()}"`);
            await btn.click({ timeout: 6000 }).catch(() => {});
            return true;
          }
        }
      }
      await page.waitForTimeout(500);
    }
    return false;
  }

  // Find the frame showing the CRM dashboard menu (CIF Retail / CIF Corporate
  // / 360 Degrees View) after the solution switch.
  async getCrmMenuFrame(page: Page, timeoutMs = 15000): Promise<Frame | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const f of page.frames()) {
        const menu = f
          .getByText(/CIF\s*Retail/i)
          .or(f.getByText(/CIF\s*Corporate/i))
          .or(f.getByText(/360\s*Degree/i))
          .first();
        if (await menu.isVisible().catch(() => false)) return f;
      }
      await page.waitForTimeout(500);
    }
    return null;
  }

  // Click a control labelled like "Submit"/"Search" across all frames.
  async clickButtonByLabel(page: Page, label: string, timeoutMs = 12000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const css =
      `input[type="submit"][value="${label}"], input[type="button"][value="${label}"], ` +
      `input[type="image"][title="${label}"], input[type="image"][alt="${label}"], ` +
      `button:has-text("${label}"), a[title="${label}"]`;
    while (Date.now() < deadline) {
      for (const f of page.frames()) {
        const byCss = f.locator(css).first();
        if (await byCss.isVisible().catch(() => false)) {
          await byCss.click({ timeout: 6000 }).catch(() => {});
          return true;
        }
        const byText = f.getByText(new RegExp(`^\\s*${label}\\s*$`, 'i')).first();
        if (await byText.isVisible().catch(() => false)) {
          await byText.click({ timeout: 6000 }).catch(() => {});
          return true;
        }
      }
      await page.waitForTimeout(400);
    }
    return false;
  }

  // Return the first frame where the given text is visible (polls). Tolerates
  // the page being closed mid-poll (e.g. a transient popup window).
  async findFrameByText(page: Page, re: RegExp, timeoutMs = 15000): Promise<Frame | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (page.isClosed()) return null;
      for (const f of page.frames()) {
        const loc = f.getByText(re).first();
        if (await loc.isVisible().catch(() => false)) return f;
      }
      await page.waitForTimeout(500).catch(() => {});
    }
    return null;
  }

  // Return the first frame where the given CSS selector is visible (polls).
  async findFrameWithSelector(page: Page, selector: string, timeoutMs = 15000): Promise<Frame | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const f of page.frames()) {
        const loc = f.locator(selector).first();
        if (await loc.isVisible().catch(() => false)) return f;
      }
      await page.waitForTimeout(500);
    }
    return null;
  }

  // Click a tab/sub-tab by its exact label text across all frames of a page.
  async clickTabByText(ownerPage: Page, label: string): Promise<boolean> {
    const re = new RegExp(`^\\s*${label}\\s*$`, 'i');
    for (const f of ownerPage.frames()) {
      const tab = f.locator('a, td, span, div').filter({ hasText: re }).first();
      if (await tab.isVisible().catch(() => false)) {
        await tab.scrollIntoViewIfNeeded().catch(() => {});
        await tab.click({ timeout: 4000 }).catch(() => {});
        console.log(`Clicked tab "${label}" in ${f.url().slice(-40)}`);
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------
  // Login (robust — handles "already logged in")
  // ---------------------------------------------------------------

  async login(userId: string, password: string, targetPage: Page = this.page): Promise<void> {
    const page = targetPage;

    // ACCEPT only the "reset previous session and re-login?" confirmation so a
    // stale session is actually cleared; DISMISS other login-time dialogs.
    const loginDialogHandler = async (d: Dialog) => {
      const m = d.message();
      console.log('Login dialog:', m);
      if (/reset.*session|re-?login|already logged/i.test(m)) await d.accept().catch(() => {});
      else await d.dismiss().catch(() => {});
    };
    page.on('dialog', loginDialogHandler);
    await page.goto(this.config.baseUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    const frame = await this.getLoginFrame(page);

    const userField = frame.locator('#usertxt, input[name="usertxt"]').first();
    const passField = frame.locator('#passtxt, input[name="passtxt"]').first();
    await userField.fill(userId);
    await passField.fill(password);
    const loginButton = frame
      .locator('#Submit, input[name="Submit"], button[type="submit"], input[type="submit"], input[value="Login"]')
      .first();
    await loginButton.click({ timeout: 8000 }).catch(() => {});
    // Wait for the post-login page to load before proceeding (matches the proven
    // savings-account loginToFinacle flow, which waits ~5s after submitting).
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(5000);
    console.log('URL after login attempt:', page.url());

    let loginMessage = await this.readLoginMessage();

    // Handle "User is already logged in" -> force a fresh login session.
    for (let sessionTry = 1; /already logged in/i.test(loginMessage) && sessionTry <= 4; sessionTry++) {
      console.log(`Stale session detected (attempt ${sessionTry}). Forcing fresh login...`);
      let clickedLogin = false;
      for (const f of page.frames()) {
        const loginBtn = f
          .locator('input[value="Login"], button:has-text("Login"), input[type="submit"], input[type="button"]')
          .first();
        if (await loginBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await loginBtn.click({ timeout: 5000 }).catch(() => {});
          clickedLogin = true;
          break;
        }
      }
      if (clickedLogin) await page.waitForTimeout(2000);

      if (/SSOLogin/i.test(page.url())) {
        const f2 = await this.getLoginFrame(page);
        const u = f2.locator('#usertxt, input[name="usertxt"]').first();
        const p = f2.locator('#passtxt, input[name="passtxt"]').first();
        const s = f2.locator('#Submit, input[name="Submit"], button[type="submit"], input[type="submit"]').first();
        if (await u.isVisible({ timeout: 5000 }).catch(() => false)) {
          await u.fill(userId, { timeout: 8000 }).catch(() => {});
          await p.fill(password, { timeout: 8000 }).catch(() => {});
          await s.click({ timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(5000);
        } else {
          break;
        }
      }
      loginMessage = await this.readLoginMessage();
    }
    if (/already logged in/i.test(loginMessage)) {
      console.log('⚠ Session still held server-side after retries; may need admin clear or timeout.');
    }

    // Handle the "Last Login Information" info screen -> click Continue.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!/SSOLogin/i.test(page.url())) break;
      let proceeded = false;
      for (const f of page.frames()) {
        const btns = await f.locator('input[type="button"], input[type="submit"], button').all();
        for (const b of btns) {
          if (!(await b.isVisible().catch(() => false))) continue;
          const val =
            (await b.getAttribute('value').catch(() => null)) || (await b.textContent().catch(() => null)) || '';
          if (/continue|proceed|ok|home|dashboard|enter/i.test(val.trim())) {
            await b.click({ timeout: 6000 }).catch(() => {});
            await page.waitForTimeout(2000);
            proceeded = true;
            break;
          }
        }
        if (proceeded) break;
      }
      if (!proceeded) break;
    }
    console.log('URL after post-login handling:', page.url());
    page.off('dialog', loginDialogHandler);
  }

  private async readLoginMessage(): Promise<string> {
    for (const f of this.page.frames()) {
      const errLoc = f.locator('text=/Invalid|incorrect|failed|already|locked/i').first();
      if ((await errLoc.count()) > 0) {
        const errText = await errLoc.textContent({ timeout: 1000 }).catch(() => null);
        if (errText) {
          console.log('LOGIN MESSAGE:', errText.trim());
          return errText.trim();
        }
      }
    }
    return '';
  }

  // ---------------------------------------------------------------
  // CoreServer -> CRM solution switch
  // ---------------------------------------------------------------

  // Switch the Solution dropdown from CoreServer to CRM and return the CRM
  // dashboard menu frame. Returns null if the switch could not be confirmed.
  async switchToCrm(attachDialogHandler = true, targetPage: Page = this.page): Promise<Frame | null> {
    const page = targetPage;
    console.log('Switching solution from CoreServer to CRM...');

    // Callers that manage their own dialog handling (e.g. the checker flow, which
    // must NOT auto-accept a logout confirmation mid-approval) pass false.
    if (attachDialogHandler) {
      page.on('dialog', async (d) => {
        this.lastDialogMessage = d.message();
        console.log('Dialog during solution switch:', d.message());
        await d.accept().catch(() => {});
      });
    }

    // Retry the whole select+submit until the CRM dashboard menu (CIF Retail /
    // CIF Corporate) actually renders. A single attempt can leave the app on the
    // CoreServer "Welcome to Finacle Core Banking" page ("CRM not loading").
    let crmSelected = false;
    let crmFrame: Frame | null = null;
    for (let attempt = 1; attempt <= 3 && !crmFrame; attempt++) {
      const sol = await this.getSolutionDropdown(page);
      if (!sol) {
        console.log(`⚠ Solution dropdown not found (attempt ${attempt}).`);
        await page.waitForTimeout(1500);
        continue;
      }
      if (attempt === 1) console.log('Solution dropdown options:', JSON.stringify(sol.options));
      await sol.select.focus().catch(() => {});
      await sol.select.selectOption('CRMServer').catch(async () => {
        await sol.select.selectOption({ label: 'CRM' }).catch(() => {});
      });
      await page.waitForTimeout(1200);
      const submitted = await this.clickSolutionSubmit(page);
      console.log(`Solution-switch Submit clicked (attempt ${attempt}):`, submitted);
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});

      // Lingering confirmation: click submit again if it re-appears.
      if (await this.clickSolutionSubmit(page, 2500)) {
        console.log('Lingering confirmation detected, clicked Submit.');
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      }

      // Poll for the actual CRM dashboard menu (not just the dropdown value).
      crmFrame = await this.getCrmMenuFrame(page, 15000);
      if (crmFrame) {
        crmSelected = true;
        break;
      }
      console.log(`CRM dashboard menu not ready after attempt ${attempt}; retrying switch...`);
      await page.waitForTimeout(1500);
    }
    return crmSelected ? crmFrame : null;
  }

  // ---------------------------------------------------------------
  // Cleanup (best-effort) — safe to call from afterEach
  // ---------------------------------------------------------------

  // Close any open edit window (releases the uncommitted edit lock) then log
  // out to release the server-side session. Never throws.
  async cleanupAndLogout(): Promise<void> {
    const context = this.page.context();
    try {
      for (const p of context.pages()) {
        if (p.isClosed()) continue;
        p.on('dialog', (d) => d.accept().catch(() => {}));
        for (const f of p.frames()) {
          const closeBtn = f
            .locator(
              'input[type="button"][value="Close"], input[type="submit"][value="Close"], input[value="Cancel"], button:has-text("Close")'
            )
            .first();
          if (await closeBtn.isVisible({ timeout: 800 }).catch(() => false)) {
            console.log('[cleanup] Closing open edit window to release the edit lock.');
            await closeBtn.click({ timeout: 4000 }).catch(() => {});
            await p.waitForTimeout(1500).catch(() => {});
            break;
          }
        }
      }
    } catch {
      /* ignore cleanup errors */
    }
    await this.logout().catch(() => {});
  }

  // Best-effort logout — searches all frames for the logout control.
  async logout(targetPage: Page = this.page): Promise<boolean> {
    const sel =
      'a[title*="Logout" i], a[title*="Sign Out" i], a[title*="Exit" i], ' +
      'img[title*="Logout" i], img[alt*="Logout" i], img[title*="Sign Out" i], ' +
      'input[value*="Logout" i], button:has-text("Logout"), a:has-text("Logout"), ' +
      'a[href*="logout" i], a[onclick*="logout" i]';
    try {
      if (targetPage.isClosed()) return false;
      for (const f of targetPage.frames()) {
        const btn = f.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click({ timeout: 5000 }).catch(() => {});
          await targetPage.waitForTimeout(1200).catch(() => {});
          console.log('Logout clicked to release session.');
          return true;
        }
      }
    } catch {
      /* ignore */
    }
    console.log('Logout control not found (session may remain until timeout).');
    return false;
  }
}
