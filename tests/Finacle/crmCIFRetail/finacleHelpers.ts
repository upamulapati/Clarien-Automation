import { Frame, Page } from "@playwright/test";

// Shared Finacle helpers used by the Retail CIF maker/checker specs.
// These were originally inlined in Retailcifmodification.spec.ts; extracted here
// so the verification (checker) spec can reuse the exact same login/navigation
// flow.

export const APP_URL = "https://clrnuat.clarienbank.com/fininfra/ui/SSOLogin.jsp";

// Helper: find the frame that contains the login form.
async function getLoginFrame(page: Page): Promise<Frame> {
  const frames = page.frames();
  console.log("Number of frames:", frames.length);
  for (let i = 0; i < frames.length; i++) {
    const frameInputs = await frames[i].locator("input").all();
    console.log(`Frame ${i} has ${frameInputs.length} input fields`);
    if (frameInputs.length > 1) {
      console.log(`Found login form in frame ${i}`);
      return frames[i];
    }
  }
  return page.mainFrame();
}

// Helper: wait until the post-login dashboard header is visible.
// The app is a frameset that keeps the SSOLogin.jsp URL, so we detect the
// dashboard by the "User:" label / Solution dropdown in the top header frame.
export async function waitForDashboard(page: Page, timeoutMs = 30000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      const marker = f.locator('text=/User\\s*:/i, text=/Solution\\s*:/i').first();
      if (await marker.isVisible().catch(() => false)) return true;

      // Solution dropdown showing CoreServer/CRM is the strongest signal
      const sol = f.locator('select').filter({ hasText: /CoreServer|CRM/i }).first();
      if (await sol.isVisible().catch(() => false)) return true;
    }
    await page.waitForTimeout(1000);
  }
  return false;
}

// Helper: locate the Solution dropdown (the <select> that lists CoreServer/CRM)
// and return both the frame and the locator.
async function getSolutionDropdown(page: Page) {
  for (const f of page.frames()) {
    const selects = await f.locator("select").all();
    for (const sel of selects) {
      if (!(await sel.isVisible().catch(() => false))) continue;
      const opts = await sel.locator("option").allTextContents().catch(() => []);
      if (opts.some((t) => /CoreServer|CRM/i.test(t))) {
        return { frame: f, select: sel, options: opts };
      }
    }
  }
  return null;
}

// Helper: after selecting CRM in the solution dropdown, Finacle shows an
// in-page confirmation that requires clicking Submit/OK/Yes to actually apply
// the switch. The button lives inside one of the frames, so search them all.
async function clickSolutionSubmit(page: Page, timeoutMs = 10000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const selector =
    'input[type="submit"][value="Submit"], input[type="button"][value="Submit"], ' +
    'button:has-text("Submit"), input[value="OK"], button:has-text("OK"), ' +
    'input[value="Yes"], button:has-text("Yes")';
  while (Date.now() < deadline) {

    // The confirmation may render inside any frame of the main page OR inside a
    // separate popup window opened by Finacle - search both.
    const pages = [page, ...page.context().pages().filter((p) => p !== page)];
    for (const p of pages) {
      for (const f of p.frames()) {
        const btn = f.locator(selector).first();
        if (await btn.isVisible().catch(() => false)) {
          const label = (await btn.getAttribute("value").catch(() => null)) ||
            (await btn.textContent().catch(() => null)) || "Submit";
          console.log(`Clicking solution-switch confirm button: "${label.trim()}"`);
          await btn.click().catch(() => {});
          return true;
        }
      }
    }
    await page.waitForTimeout(500);
  }
  return false;
}

// Helper: find the frame that shows the CRM dashboard menu after the switch.
// CIF Retail / CIF Corporate / 360 Degrees View live inside a frame, so a
// top-level page.locator() will not see them - search every frame.
async function getCrmMenuFrame(page: Page, timeoutMs = 15000): Promise<Frame | null> {
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

// Helper: click a control labelled like "Submit"/"Search" across all frames.
// Finacle action buttons may be anchors, image inputs, or live in a separate
// frame from the form fields, so search broadly.
export async function clickButtonByLabel(page: Page, label: string, timeoutMs = 12000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const css =
    `input[type="submit"][value="${label}"], input[type="button"][value="${label}"], ` +
    `input[type="image"][title="${label}"], input[type="image"][alt="${label}"], ` +
    `button:has-text("${label}"), a[title="${label}"]`;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {

      // Try concrete controls first, then any element exactly showing the label.
      const byCss = f.locator(css).first();
      if (await byCss.isVisible().catch(() => false)) {
        await byCss.click().catch(() => {});
        return true;
      }
      const byText = f.getByText(new RegExp(`^\\s*${label}\\s*$`, "i")).first();
      if (await byText.isVisible().catch(() => false)) {
        await byText.click().catch(() => {});
        return true;
      }
    }
    await page.waitForTimeout(400);
  }
  return false;
}

// Helper: return the first frame where the given text is visible (polls).
// Tolerates the page being closed mid-poll (e.g., a transient popup window).
export async function findFrameByText(page: Page, re: RegExp, timeoutMs = 15000): Promise<Frame | null> {
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

// Helper: best-effort logout to release the server-side session. Finacle's
// logout is a header icon/anchor (title/alt "Logout"/"Sign Out"/"Exit").
// Searches all frames; never throws so it is safe to call from afterEach.
export async function logout(page: Page): Promise<boolean> {
  const sel =
    'a[title*="Logout" i], a[title*="Sign Out" i], a[title*="Exit" i], ' +
    'img[title*="Logout" i], img[alt*="Logout" i], img[title*="Sign Out" i], ' +
    'input[value*="Logout" i], button:has-text("Logout"), a:has-text("Logout"), ' +
    'a[href*="logout" i], a[onclick*="logout" i]';
  try {
    for (const f of page.frames()) {
      const btn = f.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
        console.log("Logout clicked to release session.");
        return true;
      }
    }
  } catch {

    /* ignore */
  }
  console.log("Logout control not found (session may remain until timeout).");
  return false;
}

// Helper: perform login.
export async function login(page: Page, userId: string, password: string) {

  // ACCEPT only the "Do you want to reset the previous session and re-login?"
  // confirmation so a stale session is actually cleared (Playwright would
  // otherwise auto-dismiss it). DISMISS other login-time dialogs (e.g. the
  // "redirected to your default application" notice) to preserve the prior
  // behaviour — accepting that one can close the page.
  const loginDialogHandler = async (d: import("@playwright/test").Dialog) => {
    const m = d.message();
    console.log("Login dialog:", m);
    if (/reset.*session|re-?login|already logged/i.test(m)) {
      await d.accept().catch(() => {});
    } else {
      await d.dismiss().catch(() => {});
    }
  };
  page.on("dialog", loginDialogHandler);
  await page.goto(APP_URL);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);
  const frame = await getLoginFrame(page);

  // Debug: dump all visible input fields with their attributes
  const inputs = await frame.locator("input").all();
  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute("type").catch(() => null);
    const name = await inputs[i].getAttribute("name").catch(() => null);
    const id = await inputs[i].getAttribute("id").catch(() => null);
    const visible = await inputs[i].isVisible().catch(() => false);
    if (visible) {
      console.log(`Input ${i}: type=${type}, name=${name}, id=${id}, visible=${visible}`);
    }
  }

  // Target user ID and password fields by their actual names
  const userField = frame.locator('#usertxt, input[name="usertxt"]').first();
  const passField = frame.locator('#passtxt, input[name="passtxt"]').first();
  await userField.fill(userId);
  await passField.fill(password);

  // The real submit button is <input type="button" id="Submit" name="Submit">
  const loginButton = frame
    .locator('#Submit, input[name="Submit"], button[type="submit"], input[type="submit"], input[value="Login"]')
    .first();
  console.log("Login button visible:", await loginButton.isVisible());
  await loginButton.click();
  await page.waitForTimeout(5000);
  console.log("URL after login attempt:", page.url());

  // Capture any error message displayed on the login page (non-blocking)
  let loginMessage = "";
  for (const f of page.frames()) {
    const errLoc = f.locator('text=/Invalid|incorrect|failed|already|locked/i').first();
    if ((await errLoc.count()) > 0) {
      const errText = await errLoc.textContent({ timeout: 1000 }).catch(() => null);
      if (errText) {
        loginMessage = errText.trim();
        console.log("LOGIN MESSAGE:", loginMessage);
        break;
      }
    }
  }

  // Handle "User is already logged in" -> force a fresh login session.
  // The server may hold the previous session, so retry the force-login a few
  // times; Finacle typically releases the stale session after a re-login.
  for (let sessionTry = 1; /already logged in/i.test(loginMessage) && sessionTry <= 4; sessionTry++) {
    console.log(`Stale session detected (attempt ${sessionTry}). Forcing fresh login...`);
    await page.screenshot({ path: "test-results/already-logged-in.png", fullPage: true }).catch(() => {});

    // The "already logged in" screen only shows a "Login" button. Clicking it
    // returns to the login form so we can re-submit credentials and force the
    // session. Search across all frames since it may not be in the same frame.
    let clickedLogin = false;
    for (const f of page.frames()) {
      const loginBtn = f
        .locator('input[value="Login"], button:has-text("Login"), input[type="submit"], input[type="button"]')
        .first();
      if (await loginBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await loginBtn.click({ timeout: 5000 }).catch(() => {});
        clickedLogin = true;
        console.log("Clicked 'Login' on the 'already logged in' screen.");
        break;
      }
    }
    if (clickedLogin) await page.waitForTimeout(4000);

    // Re-fill and re-submit on the returned login form to force the session.
    // Bounded timeouts (8s) prevent a hung field from consuming the whole test.
    if (/SSOLogin/i.test(page.url())) {
      const f2 = await getLoginFrame(page);
      const u = f2.locator('#usertxt, input[name="usertxt"]').first();
      const p = f2.locator('#passtxt, input[name="passtxt"]').first();
      const s = f2.locator('#Submit, input[name="Submit"], button[type="submit"], input[type="submit"]').first();
      if (await u.isVisible({ timeout: 5000 }).catch(() => false)) {
        await u.fill(userId, { timeout: 8000 }).catch((e) => console.log("re-login fill user failed:", e.message));
        await p.fill(password, { timeout: 8000 }).catch((e) => console.log("re-login fill pass failed:", e.message));
        await s.click({ timeout: 8000 }).catch((e) => console.log("re-login submit failed:", e.message));
        await page.waitForTimeout(5000);
        console.log("URL after forced re-login:", page.url());
      } else {
        console.log("Re-login form not present after clicking Login; see test-results/already-logged-in.png");
        break;
      }
    }

    // Re-read the login message to decide whether to retry.
    loginMessage = "";
    for (const f of page.frames()) {
      const errLoc = f.locator('text=/Invalid|incorrect|failed|already|locked/i').first();
      if ((await errLoc.count()) > 0) {
        const errText = await errLoc.textContent({ timeout: 1000 }).catch(() => null);
        if (errText) {
          loginMessage = errText.trim();
          console.log(`LOGIN MESSAGE after re-login attempt ${sessionTry}:`, loginMessage);
          break;
        }
      }
    }
  }
  if (/already logged in/i.test(loginMessage)) {
    console.log("⚠ Session still held server-side after retries. The session likely needs to be cleared by an admin or left to time out.");
  }

  // Handle "Last Login Information" / "Last Failed Login Information" info screen
  // Finacle shows this after a successful authentication; click Continue to proceed.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!/SSOLogin/i.test(page.url())) break;
    let proceeded = false;
    for (const f of page.frames()) {

      // Only scan buttons/inputs - scanning every anchor is very slow on the
      // CRM/CoreServer menu frames which contain 100+ links.
      const btns = await f.locator('input[type="button"], input[type="submit"], button').all();
      for (const b of btns) {
        if (!(await b.isVisible().catch(() => false))) continue;
        const val = (await b.getAttribute("value").catch(() => null)) || (await b.textContent().catch(() => null)) || "";
        const label = val.trim();
        if (/continue|proceed|ok|home|dashboard|enter/i.test(label)) {
          console.log(`Clicking post-login button: "${label}"`);
          await b.click().catch(() => {});
          await page.waitForTimeout(4000);
          proceeded = true;
          break;
        }
      }
      if (proceeded) break;
    }
    if (!proceeded) {
      console.log("No Continue/Proceed button found on post-login info screen; see test-results/post-login-screen.png");
      await page.screenshot({ path: "test-results/post-login-screen.png", fullPage: true }).catch(() => {});
      break;
    }
  }
  console.log("URL after post-login handling:", page.url());

  // Detach the login-only dialog handler so it cannot interfere with later
  // handlers (e.g. the solution-switch confirmation that must be ACCEPTED).
  page.off("dialog", loginDialogHandler);
}

// Helper: switch the Solution dropdown from CoreServer to CRM and return the
// CRM dashboard menu frame (CIF Retail / CIF Corporate / 360 Degrees View).
// `role` is used only for clearer log output (e.g. "maker"/"checker").
export async function switchToCRM(page: Page, role = ""): Promise<Frame | null> {
  const who = role ? ` (${role})` : "";
  console.log(`Switching solution from CoreServer to CRM${who}...`);

  // Auto-accept any confirmation dialog that the switch may raise.
  const switchDialogHandler = async (d: import("@playwright/test").Dialog) => {
    console.log("Dialog during solution switch:", d.message());
    await d.accept().catch(() => {});
  };
  page.on("dialog", switchDialogHandler);

  let crmMenuFrame: Frame | null = null;
  try {
    const sol = await getSolutionDropdown(page);
    if (!sol) {
      console.log("⚠ Solution dropdown not found.");
      return null;
    }
    console.log("Solution dropdown options:", JSON.stringify(sol.options));
    const currentVal = await sol.select.inputValue().catch(() => "");
    console.log("Current solution value:", currentVal);

    // The CRM option's value is "CRMServer" (text shows "CRM"). Use a real
    // selectOption (trusted change event) so Finacle's onchange navigation fires.
    await sol.select.focus().catch(() => {});
    await sol.select.selectOption("CRMServer").catch(async () => {
      await sol.select.selectOption({ label: "CRM" }).catch(() => {});
    });

    await page.waitForTimeout(1500);
    const submitted = await clickSolutionSubmit(page);
    console.log("Solution-switch Submit clicked:", submitted);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(8000);

    crmMenuFrame = await getCrmMenuFrame(page);

    // Lingering confirmation: click submit again, then re-check.
    if (!crmMenuFrame && (await clickSolutionSubmit(page, 3000))) {
      console.log("Lingering confirmation detected, clicked Submit.");
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
      crmMenuFrame = await getCrmMenuFrame(page);
    }
    if (crmMenuFrame) console.log(`✓ Solution switched to CRM${who}`);
  } finally {
    page.off("dialog", switchDialogHandler);
  }
  return crmMenuFrame;
}
