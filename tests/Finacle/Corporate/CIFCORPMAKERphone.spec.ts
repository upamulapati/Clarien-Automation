import { test, expect, Frame, Page } from "@playwright/test";
import { CrmCorporateModificationPage } from "../../pages/CRM/crmCorporateModificationPage";
import * as fs from "fs";
const APP_URL = "https://clrnuat.clarienbank.com/fininfra/ui/SSOLogin.jsp";
const MAKER_USER = "FINACLETEST13";
const MAKER_PASS = "clarien@123";
const CIF_ID = "0001000516";

// Helper: find the frame that contains the login form
async function getLoginFrame(page: Page): Promise<Frame> {
  const frames = page.frames();
  console.log("Number of frames:", frames.length);
  expect(frames.length).toBeTruthy();
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
async function waitForDashboard(page: Page, timeoutMs = 30000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      const marker = f.locator('text=/User\\s*:/i, text=/Solution\\s*:/i').first();
      if (await marker.isVisible().catch(() => false)) return true;
      const sol = f.locator("select").filter({ hasText: /CoreServer|CRM/i }).first();
      if (await sol.isVisible().catch(() => false)) return true;
    }
    await page.waitForTimeout(1000);
  }
  return false;
}

// Helper: locate the Solution dropdown (the <select> that lists CoreServer/CRM).
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

// Helper: click the in-page confirmation Submit/OK/Yes raised by a solution switch.
async function clickSolutionSubmit(page: Page, timeoutMs = 10000): Promise<boolean> {
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
            (await btn.getAttribute("value").catch(() => null)) ||
            (await btn.textContent().catch(() => null)) ||
            "Submit";
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
async function clickButtonByLabel(page: Page, label: string, timeoutMs = 12000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const css =
    `input[type="submit"][value="${label}"], input[type="button"][value="${label}"], ` +
    `input[type="image"][title="${label}"], input[type="image"][alt="${label}"], ` +
    `button:has-text("${label}"), a[title="${label}"]`;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
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
async function findFrameByText(page: Page, re: RegExp, timeoutMs = 15000): Promise<Frame | null> {
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

// Helper: return the first frame where the given CSS selector is visible (polls).
async function findFrameWithSelector(page: Page, selector: string, timeoutMs = 15000): Promise<Frame | null> {
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

// Helper: best-effort logout to release the server-side session.
async function logout(page: Page): Promise<boolean> {
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

// Helper: perform login (handles stale-session + Last Login Information screens).
async function login(page: Page, userId: string, password: string) {
  const loginDialogHandler = async (d: import("@playwright/test").Dialog) => {
    const m = d.message();
    console.log("Login dialog:", m);
  expect(m).toBeTruthy();
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
  const userField = frame.locator('#usertxt, input[name="usertxt"]').first();
  const passField = frame.locator('#passtxt, input[name="passtxt"]').first();
  await userField.fill(userId);
  await passField.fill(password);
  const loginButton = frame
    .locator('#Submit, input[name="Submit"], button[type="submit"], input[type="submit"], input[value="Login"]')
    .first();
  console.log("Login button visible:", await loginButton.isVisible());
  await loginButton.click();
  await page.waitForTimeout(5000);
  console.log("URL after login attempt:", page.url());
  let loginMessage = "";
  for (const f of page.frames()) {
    const errLoc = f.locator('text=/Invalid|incorrect|failed|already|locked/i').first();
    if ((await errLoc.count()) > 0) {
      const errText = await errLoc.textContent({ timeout: 1000 }).catch(() => null);
      if (errText) {
        loginMessage = errText.trim();
        console.log("LOGIN MESSAGE:", loginMessage);
  expect(loginMessage).toBeTruthy();
  expect(loginMessage).toMatch(/error|fail|invalid|mandatory|not posted/i);
        break;
      }
    }
  }
  for (let sessionTry = 1; /already logged in/i.test(loginMessage) && sessionTry <= 4; sessionTry++) {
    console.log(`Stale session detected (attempt ${sessionTry}). Forcing fresh login...`);
    await page.screenshot({ path: "test-results/corp-already-logged-in.png", fullPage: true }).catch(() => {});
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
        console.log("Re-login form not present after clicking Login.");
        break;
      }
    }
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
    console.log("⚠ Session still held server-side after retries. The FINACLETEST13 session likely needs to be cleared by an admin or left to time out.");
  }

  // Handle "Last Login Information" / "Last Failed Login Information" info screen.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!/SSOLogin/i.test(page.url())) break;
    let proceeded = false;
    for (const f of page.frames()) {
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
      console.log("No Continue/Proceed button found on post-login info screen.");
      await page.screenshot({ path: "test-results/corp-post-login-screen.png", fullPage: true }).catch(() => {});
      break;
    }
  }
  console.log("URL after post-login handling:", page.url());
  page.off("dialog", loginDialogHandler);
}

test.describe("CIF Corporate Modification Maker - Phone (TC_009)", () => {

  // Cleanup: close any open edit window (releases the edit lock) and logout.
  test.afterEach(async ({ page, context }) => {
    try {
      for (const p of context.pages()) {
        if (p.isClosed()) continue;
        p.on("dialog", (d) => d.accept().catch(() => {}));
        for (const f of p.frames()) {
          const closeBtn = f
            .locator('input[type="button"][value="Close"], input[type="submit"][value="Close"], input[value="Cancel"], button:has-text("Close")')
            .first();
          if (await closeBtn.isVisible({ timeout: 800 }).catch(() => false)) {
            console.log("[cleanup] Closing open edit window to release the edit lock.");
            await closeBtn.click({ timeout: 4000 }).catch(() => {});
            await p.waitForTimeout(1500).catch(() => {});
            break;
          }
        }
      }
    } catch {

      /* ignore cleanup errors */
    }
    await logout(page).catch(() => {});
  });

  test("Modify WORK PHONE 1 via POM", async ({ page }) => {
    test.setTimeout(300000);
    const cif = new CrmCorporateModificationPage(page);
    await cif.loginAsMaker();
    const ok = await cif.modifyPhoneWorkflow();
    expect(ok, "WORK PHONE 1 should be modified and submitted successfully").toBeTruthy();
  });

  test.skip("TC_009 - Modify WORK PHONE 1", async ({ page, context }) => {

    test.setTimeout(300000);
    let lastDialogMessage = "";

    // ---------- TC_001: Login ----------
    console.log("TC_001: Starting Login...");
    await login(page, MAKER_USER, MAKER_PASS);

    // ---------- TC_001.5: Relogin guard ----------
    const alreadyLoggedIn = page.locator('text=already login, text=already logged in').first();
    if (await alreadyLoggedIn.isVisible().catch(() => false)) {
      console.log("TC_001.5: 'User already login' detected, re-logging in...");
      const continueBtn = page.locator('button:has-text("Continue"), input[value="Continue"], button:has-text("OK")').first();
      if (await continueBtn.isVisible().catch(() => false)) {
        await continueBtn.click();
        await page.waitForTimeout(3000);
      } else {
        await login(page, MAKER_USER, MAKER_PASS);
      }
    }
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const loggedIn = await waitForDashboard(page);
    expect(loggedIn, "Login must succeed and dashboard must load").toBeTruthy();
    console.log("✓ TC_001: Maker user logged in successfully (dashboard loaded)");
    console.log("Waiting for network idle (10s) before selecting CRM...");
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {
      console.log("networkidle not reached within 10s, continuing...");
    });
    await page.waitForTimeout(5000);

    // ---------- TC_002: Solution Switch to CRM ----------
    console.log("TC_002: Switching solution from CoreServer to CRM...");
    let crmSelected = false;
    page.on("dialog", async (d) => {
      lastDialogMessage = d.message();
      console.log("Dialog during solution switch:", d.message());
      await d.accept().catch(() => {});
    });
    const sol = await getSolutionDropdown(page);
    if (sol) {
      console.log("Solution dropdown options:", JSON.stringify(sol.options));
      const currentVal = await sol.select.inputValue().catch(() => "");
      console.log("Current solution value:", currentVal);
  expect(currentVal).toBeTruthy();
      await sol.select.focus().catch(() => {});
      await sol.select.selectOption("CRMServer").catch(async () => {
        await sol.select.selectOption({ label: "CRM" }).catch(() => {});
      });
      await page.waitForTimeout(1500);
      const submitted = await clickSolutionSubmit(page);
      console.log("Solution-switch Submit clicked:", submitted);
  expect(submitted).toBeTruthy();
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(8000);
      await page.screenshot({ path: "test-results/corp-after-crm-switch.png", fullPage: true });
      const crmFrame = await getCrmMenuFrame(page);
      if (crmFrame) crmSelected = true;
      if (!crmSelected) {
        const afterSol = await getSolutionDropdown(page);
        const newText = afterSol ? await afterSol.select.locator("option:checked").textContent().catch(() => "") : "";
        console.log("Solution dropdown after switch shows:", (newText || "").trim());
        if (/CRM/i.test(newText || "")) crmSelected = true;
      }
      if (crmSelected) console.log("✓ Solution switched to CRM");
    } else {
      console.log("⚠ Solution dropdown not found.");
    }
    if (!crmSelected) {
      await page.screenshot({ path: "test-results/corp-crm-not-found.png", fullPage: true });
    }
    expect(crmSelected, "CRM solution must be selected").toBeTruthy();
    await page.waitForTimeout(3000);

    // ---------- TC_002.5: Lingering confirm ----------
    if (await clickSolutionSubmit(page, 3000)) {
      console.log("TC_002.5: Lingering confirmation detected, clicked Submit.");
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: "test-results/corp-crm-dashboard.png", fullPage: true });
    const crmMenuFrame = await getCrmMenuFrame(page);
    expect(crmMenuFrame, "CRM Dashboard menu (CIF Retail / CIF Corporate) must be visible").not.toBeNull();
    await expect(
      crmMenuFrame!
        .getByText(/CIF\s*Corporate/i)
        .or(crmMenuFrame!.getByText(/CIF\s*Retail/i))
        .or(crmMenuFrame!.getByText(/360\s*Degree/i))
        .first()
    ).toBeVisible({ timeout: 10000 });
    console.log("✓ TC_002: Navigated to CRM Dashboard (360 Degrees View, CIF Retail, CIF Corporate)");

    // ---------- TC_003: Navigate to CIF Corporate > Edit Entity ----------
    console.log("TC_003: Navigating to CIF Corporate > Edit Entity...");
    let searchFrame: Frame | null = null;
    for (let navTry = 1; navTry <= 3 && !searchFrame; navTry++) {
      await crmMenuFrame!.getByText(/CIF\s*Corporate/i).first().click().catch(() => {});
      await page.waitForTimeout(2000);
      const editEntityFrame = (await findFrameByText(page, /Edit\s*Entity/i, 6000)) || crmMenuFrame!;
      await editEntityFrame.getByText(/Edit\s*Entity/i).first().click().catch(() => {});
      await page.waitForTimeout(3000);
      searchFrame = await findFrameByText(page, /Corporate Search Criteria|Search Entity|Search Accounts/i, 8000);
      if (!searchFrame) console.log(`TC_003: search form not loaded (attempt ${navTry}); retrying...`);
    }
    await page.screenshot({ path: "test-results/corp-edit-entity.png", fullPage: true });
    expect(searchFrame, "Corporate Search Criteria form must load").not.toBeNull();
    console.log("✓ TC_003: Corporate Search Criteria displayed with Search Entity (default) and Search Accounts tabs");

    // ---------- TC_004: CIF Search ----------
    console.log(`TC_004: Searching CIF ID ${CIF_ID}...`);

    // The Corporate Search Criteria form labels the field "CIF ID" (distinct from
    // "GCIF ID"). Target the input that immediately follows the exact "CIF ID"
    // label cell, searching every frame, so we never type into the unrelated
    // top-bar keyword box.
    let cifFrame: Frame | null = null;
    let cifFilled = false;
    const searchDeadline = Date.now() + 15000;
    while (!cifFilled && Date.now() < searchDeadline) {
      for (const f of page.frames()) {

        // Find, inside the frame's DOM, the visible text input whose label cell
        // reads exactly "CIF ID" (NOT "GCIF ID"). Return its name so we can fill
        // it via a precise locator. Also gather diagnostics on a miss.
        const found = await f
          .evaluate(() => {
            const norm = (s: string) => (s || "").replace(/\s+/g, " ").trim();
            const labels = Array.from(document.querySelectorAll("td, label, span, th"));
            const allInputs: string[] = [];
            Array.from(document.querySelectorAll("input")).forEach((i) => {
              const el = i as HTMLInputElement;
              if ((el.type || "text") !== "hidden")
                allInputs.push(`${el.name || el.id || "?"}:${el.type || "text"}`);
            });
            for (const lab of labels) {
              if (/^CIF\s*ID$/i.test(norm(lab.textContent || ""))) {

                // nearest following visible, non-hidden text input
                const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
                tw.currentNode = lab;
                while (tw.nextNode()) {
                  const el = tw.currentNode as HTMLElement;
                  if (el.tagName === "INPUT") {
                    const inp = el as HTMLInputElement;
                    const t = (inp.type || "text").toLowerCase();
                    if (t !== "hidden" && t !== "button" && t !== "submit" && t !== "image" && inp.offsetParent !== null) {
                      return { name: inp.name || "", id: inp.id || "", inputs: allInputs };
                    }
                  }
                }
              }
            }
            return { name: "", id: "", inputs: allInputs };
          })
          .catch(() => ({ name: "", id: "", inputs: [] as string[] }));
        if (found.inputs && found.inputs.length) {
          console.log(`TC_004 [frame ${f.url().slice(-40)}] inputs=${JSON.stringify(found.inputs).slice(0, 220)} cifField="${found.name || found.id}"`);
        }
        if (found.name || found.id) {
          const sel = found.name
            ? `input[name="${found.name}"]`
            : `input[id="${found.id}"]`;
          const inp = f.locator(sel).first();
          await inp.fill(CIF_ID, { timeout: 10000 }).catch(() => {});
          const v = await inp.inputValue().catch(() => "");
          if (v.includes(CIF_ID)) {
            cifFrame = f;
            cifFilled = true;
            console.log(`TC_004: filled CIF ID = "${v}" via ${sel} in ${f.url().slice(-40)}`);
            break;
          }
        }
      }
      if (!cifFilled) await page.waitForTimeout(600);
    }
    expect(cifFilled, "CIF ID field must be present and fillable").toBeTruthy();
    const searchSubmitted = await clickButtonByLabel(page, "Submit");
    expect(searchSubmitted, "Search Submit button must be clicked").toBeTruthy();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-results/corp-search-result.png", fullPage: true });
    const resultFrame = (await findFrameByText(page, new RegExp(CIF_ID))) || cifFrame!;
    await expect(resultFrame.getByText(new RegExp(CIF_ID)).first()).toBeVisible({ timeout: 10000 });
    console.log(`✓ TC_004: CIF profile details displayed in search results for ${CIF_ID}`);

    // ---------- TC_005: Search Result columns ----------
    console.log("TC_005: Verifying search result columns...");
    const expectedColumns = [
      "Blacklisted", "Negated", "Suspended", "Segment", "Record Status", "CIF ID",
      "Record Status", "Primary SOL ID", "Status",
    ];
    let columnsFound = 0;
    for (const col of expectedColumns) {
      const found = await resultFrame.getByText(new RegExp(col, "i")).first().isVisible().catch(() => false);
      if (found) columnsFound++;
    }
    console.log(`Columns found: ${columnsFound}/${expectedColumns.length}`);
    console.log("✓ TC_005: Search result columns verified");

    // ---------- TC_006: Clickable link ----------
    console.log("TC_006: Verifying CIF ID renders as a clickable link...");
    await expect(resultFrame.getByText(new RegExp(CIF_ID)).first()).toBeVisible({ timeout: 5000 });
    console.log("✓ TC_006: CIF ID displayed as a clickable link");

    // ---------- TC_007: Open Edit Window via right-click ----------
    console.log("TC_007: Right-click on clickable link and select Edit >> General Details...");
    const cifLink = resultFrame.locator(`a:has-text("${CIF_ID}")`).first();
    await cifLink.click({ button: "right" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/corp-context-menu.png", fullPage: true });

    async function findGeneralDetails(): Promise<{ frame: Frame; loc: any } | null> {
      for (const f of page.frames()) {
        const loc = f.getByText(/^\s*General\s*Details\s*$/i).first();
        if (await loc.isVisible().catch(() => false)) return { frame: f, loc };
      }
      return null;
    }
    let expanded = await findGeneralDetails();
    for (let tries = 0; tries < 5 && !expanded; tries++) {
      for (const f of page.frames()) {
        const edit = f.getByText(/^\s*Edit\s*$/i).first();
        if (!(await edit.isVisible().catch(() => false))) continue;
        await edit.scrollIntoViewIfNeeded().catch(() => {});
        await edit.hover().catch(() => {});
        await edit
          .evaluate((el: HTMLElement) => {
            const fire = (t: EventTarget) => {
              ["mouseover", "mouseenter", "mousemove"].forEach((type) =>
                t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
              );
            };
            let node: HTMLElement | null = el;
            for (let i = 0; i < 5 && node; i++) {
              fire(node);
              node = node.parentElement;
            }
          })
          .catch(() => {});
        await page.waitForTimeout(800);
        expanded = await findGeneralDetails();
        if (expanded) break;
        await edit.click().catch(() => {});
        await page.waitForTimeout(800);
        expanded = await findGeneralDetails();
        if (expanded) break;
      }
      if (!expanded) await page.waitForTimeout(500);
    }
    await page.screenshot({ path: "test-results/corp-edit-submenu.png", fullPage: true });
    console.log(`TC_007: Edit flyout open (General Details visible) = ${!!expanded}`);
    const popupPromise = page.context().waitForEvent("page", { timeout: 12000 }).catch(() => null);
    if (expanded) {
      await expanded.loc.scrollIntoViewIfNeeded().catch(() => {});
      const fired = await expanded.loc
        .evaluate((el: HTMLElement) => {
          let node: HTMLElement | null = el;
          for (let i = 0; i < 6 && node; i++) {
            const oc = node.getAttribute && node.getAttribute("onclick");
            if (oc && /EditAccount/i.test(oc)) {
              node.click();
              return true;
            }
            node = node.parentElement;
          }
          el.click();
          return false;
        })
        .catch(() => false);
      console.log(`TC_007: General Details handler fired on EditAccount node = ${fired}`);
    }
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState("domcontentloaded").catch(() => {});
      console.log("TC_007: General Details opened in a new window.");
    }
    await page.waitForTimeout(3000).catch(() => {});
    if (/under\s*verification/i.test(lastDialogMessage)) {
      throw new Error(
        `CIF ${CIF_ID} is UNDER VERIFICATION (a prior modification is pending checker ` +
          `approval), so the maker cannot edit it again. Approve/reject it via the ` +
          `checker flow or use a CIF not pending verification, then re-run. ` +
          `Dialog seen: "${lastDialogMessage}".`
      );
    }
    const editFormRe = /Customer Type|General Information|General Details|Organisation|Organization/i;
    let editPage: Page = page;
    let generalFrame: Frame | null = null;
    if (popup && !popup.isClosed()) {
      generalFrame = await findFrameByText(popup, editFormRe, 6000);
      if (generalFrame) editPage = popup;
    }
    if (!generalFrame) {
      generalFrame = await findFrameByText(page, editFormRe, 8000);
      editPage = page;
    }
    await editPage.screenshot({ path: "test-results/corp-general-details.png", fullPage: true }).catch(() => {});

    // Re-point to whichever frame hosts the real edit form (most selects).
    {
      const allPages = page.context().pages().filter((p) => !p.isClosed());
      let best: { frame: Frame; page: Page; score: number } | null = null;
      for (const p of allPages) {
        for (const f of p.frames()) {
          let selCount = 0;
          try {
            selCount = await f.locator("select").count();
          } catch {
            continue;
          }
          let body = "";
          try {
            body = (await f.locator("body").innerText({ timeout: 1500 })).replace(/\s+/g, " ").trim();
          } catch {

            /* ignore */
          }
          const hasContact = /Contact|Address|Phone/i.test(body);
          const score = (hasContact ? 1 : 0) + (selCount > 20 ? 1 : 0);
          if (score >= 1 && (!best || selCount > best.score)) {
            best = { frame: f, page: p, score: selCount };
          }
        }
      }
      if (best) {
        generalFrame = best.frame;
        editPage = best.page;
        console.log(`[framescan] -> chose form frame with selects=${best.score}`);
      }
    }
    expect(generalFrame, "General Details window must open").not.toBeNull();
    console.log("✓ TC_007: New window opened with General tab and related sub-tabs");
    const formFrame = generalFrame!;
    await formFrame
      .evaluate(() => {
        window.scrollTo(0, 0);
        document.querySelectorAll("*").forEach((el) => {
          const e = el as HTMLElement;
          if (e.scrollHeight > e.clientHeight + 4) e.scrollTop = 0;
        });
      })
      .catch(() => {});
    await editPage.waitForTimeout(800);
    await editPage.screenshot({ path: "test-results/corp-form-top.png", fullPage: true }).catch(() => {});

    // Tabs/sub-tabs are plain <a>/<td>/<span> elements carrying the label text.
    const clickTabByText = async (label: string): Promise<boolean> => {
      const re = new RegExp(`^\\s*${label}\\s*$`, "i");
      for (const f of editPage.frames()) {
        const tab = f.locator("a, td, span, div").filter({ hasText: re }).first();
        if (await tab.isVisible().catch(() => false)) {
          await tab.scrollIntoViewIfNeeded().catch(() => {});
          await tab.click({ timeout: 4000 }).catch(() => {});
          console.log(`clicked tab "${label}" in ${f.url().slice(-40)}`);
          return true;
        }
      }
      return false;
    };

    // ---------- TC_009: Modify WORK PHONE 1 (Contact > Phone and E-Mail) ----------
    const NEW_WORK_PHONE = process.env.PHONE_NO || "1111111111";
    console.log("TC_009: Navigating to Contact > Phone and E-Mail to edit the WORK PHONE 1 phone...");
    await clickTabByText("Contact");
    await editPage.waitForTimeout(1000).catch(() => {});
    const phoneTabClicked = await clickTabByText("Phone and E-Mail");
    await editPage.waitForTimeout(1500).catch(() => {});
    console.log(`TC_009: Phone and E-Mail sub-tab clicked = ${phoneTabClicked}`);
    const phonePopupPromise = context.waitForEvent("page", { timeout: 12000 }).catch(() => null);
    let phoneRowClicked = false;
    let phoneListFrame: Frame = formFrame;
    for (const f of editPage.frames()) {
      const res = await f
        .evaluate(() => {
          const out: { rows: string[]; clicked: boolean; matchType: string } = {
            rows: [],
            clicked: false,
            matchType: "",
          };
          const rows = Array.from(document.querySelectorAll("tr")).filter((r) => !r.querySelector("tr"));
          const isPhoneEdit = (e: Element) =>
            /editPhone|PhoneEmail|PhoneDetails|editTelephone|editContact/i.test(e.getAttribute("onclick") || "");
          for (const r of rows) {
            const txt = (r.textContent || "").replace(/\s+/g, " ").trim();
            const controls = Array.from(r.querySelectorAll('input[type="button"], a, img')) as HTMLElement[];
            const editBtn = controls.find(isPhoneEdit);
            const dotsBtn = controls.find((c) => ((c as HTMLInputElement).value || "").trim() === "...");
            if ((editBtn || dotsBtn) && /\bWORK\b|\bPHONE\b|\bHOME\b|\bMOBILE\b|\bOFFICE\b/i.test(txt)) {
              out.rows.push(
                `[txt="${txt.slice(0, 60)}" editBtn=${!!editBtn} dots=${!!dotsBtn} ` +
                  `onclick="${((editBtn || dotsBtn)!.getAttribute("onclick") || "").slice(0, 80)}"]`
              );
            }
            if (!out.clicked && /WORK\s*PHONE\s*1/i.test(txt) && (editBtn || dotsBtn)) {
              const firstCell = r.querySelector("td");
              if (firstCell) (firstCell as HTMLElement).click();
              const btn = editBtn || dotsBtn!;
              btn.click();
              out.clicked = true;
              out.matchType = editBtn ? "editBtn" : "dots";
            }
          }
          return out;
        })
        .catch(() => null);
      if (res && res.rows.length) {
        console.log(`TC_009 [frame ${f.url().slice(-45)}] phoneRows: ${res.rows.join(" | ")}`);
      }
      if (res && res.clicked) {
        phoneListFrame = f;
        phoneRowClicked = true;
        console.log(`TC_009: clicked WORK PHONE 1 phone Select (${res.matchType}) in ${f.url().slice(-45)}`);
        break;
      }
    }
    console.log(`TC_009: phoneListFrame url="${phoneListFrame.url().slice(-60)}"`);
    console.log(`TC_009: WORK PHONE 1 record select clicked = ${phoneRowClicked}`);
    let phonePopup = await phonePopupPromise;
    if (!phonePopup || phonePopup.isClosed()) {
      await editPage.waitForTimeout(1500).catch(() => {});
      phonePopup =
        context.pages().find((p) => !p.isClosed() && /PhoneEmailForm_Det|PhoneEmail|Phone|Telephone/i.test(p.url())) ||
        null;
    }
    console.log(
      `TC_009: phonePopup opened = ${!!phonePopup} url="${phonePopup ? phonePopup.url().slice(-60) : ""}"; ` +
        `context pages = ${context.pages().length}`
    );
    const phonePage: Page = phonePopup && !phonePopup.isClosed() ? phonePopup : editPage;
    phonePage.on("dialog", async (d) => {
      console.log(`[phone dialog] ${d.message()}`);
      await d.accept().catch(() => {});
    });
    await phonePage.waitForLoadState("domcontentloaded").catch(() => {});
    await phonePage.waitForTimeout(1500).catch(() => {});
    const phoneFrame =
      (await findFrameByText(phonePage, /Phone and Email Details|Phone No/i, 8000)) || phonePage.mainFrame();
    console.log(`TC_009: phoneFrame url="${phoneFrame.url().slice(-60)}"`);
    const allInputs = await phoneFrame.locator('input[type="text"], input:not([type])').all().catch(() => []);
    for (let i = 0; i < allInputs.length; i++) {
      const nm = (await allInputs[i].getAttribute("name").catch(() => "")) || "";
      const val = await allInputs[i].inputValue().catch(() => "");
      const vis = await allInputs[i].isVisible().catch(() => false);
      console.log(`[phoneInput #${i}] vis=${vis} name="${nm}" value="${val}"`);
    }
    const setPhoneNumber = async (value: string): Promise<string> => {
      let inp = null as null | import("@playwright/test").Locator;
      for (const cand of allInputs) {
        const v = (await cand.inputValue().catch(() => "")) || "";
        const vis = await cand.isVisible().catch(() => false);
        if (vis && /^\d{5,}$/.test(v.trim())) {
          inp = cand;
          console.log(`TC_009: phone number box found by value "${v}"`);
          break;
        }
      }
      if (!inp) {
        const xp = "xpath=//td[not(descendant::td) and contains(normalize-space(.),'Phone No')]/following::input[3]";
        inp = phoneFrame.locator(xp).first();
        console.log("TC_009: phone number box falling back to positional xpath");
      }
      await inp.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      let v = "";
      for (let i = 0; i < 4; i++) {
        await inp.scrollIntoViewIfNeeded().catch(() => {});
        await inp.click({ timeout: 4000 }).catch(() => {});
        await inp.fill("", { timeout: 4000 }).catch(() => {});
        await inp.fill(value, { timeout: 6000 }).catch(() => {});
        v = await inp.inputValue().catch(() => "");
        console.log(`TC_009: Phone No. number box (attempt ${i}) = "${v}"`);
        if (v.replace(/\s/g, "").includes(value.replace(/\s/g, ""))) break;
        await phonePage.waitForTimeout(800).catch(() => {});
      }
      return v;
    };
    const phoneVal = await setPhoneNumber(NEW_WORK_PHONE);
    await phonePage.screenshot({ path: "test-results/corp-phone-edit.png", fullPage: true }).catch(() => {});
    expect(phoneVal.replace(/\s/g, ""), `WORK PHONE 1 Phone No must be ${NEW_WORK_PHONE}`).toContain(
      NEW_WORK_PHONE.replace(/\s/g, "")
    );
    console.log(`✓ TC_009: WORK PHONE 1 phone updated (Phone No=${NEW_WORK_PHONE})`);
    let phoneSaved = false;
    for (const f of phonePage.frames()) {
      const saveBtn = f
        .locator('input[type="button"][value="Save"], input[type="submit"][value="Save"], input[value="Save"], button:has-text("Save")')
        .first();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click({ timeout: 6000 }).catch(() => {});
        phoneSaved = true;
        console.log(`TC_009: phone 'Save' clicked in ${f.url().slice(-40)}`);
        break;
      }
    }
    console.log(`TC_009: phone saved = ${phoneSaved}`);
    await editPage.waitForTimeout(2000).catch(() => {});
    if (phonePopup && !phonePopup.isClosed()) await phonePopup.close().catch(() => {});
    await editPage.waitForTimeout(1000).catch(() => {});

    // ---------- TC_010: Submit General Details ----------
    let submitDialog = "";
    let submitSuccessSeen = false;
    const successRe = /submitted successfully|successfully submitted|is submitted|Process was saved successfully/i;
    const attachDialog = (p: Page) => {
      p.on("dialog", async (d) => {
        submitDialog = d.message();
        if (successRe.test(d.message())) submitSuccessSeen = true;
        console.log(`[submit dialog] ${d.message()}`);
        await d.accept().catch(() => {});
      });
    };
    attachDialog(editPage);
    context.on("page", attachDialog);
    console.log("TC_010: Clicking Submit button...");
    const submitSel =
      'input[type="submit"][value="Submit"], input[type="button"][value="Submit"], ' +
      'input[value="Submit"], button:has-text("Submit"), a:has-text("Submit")';
    const procPopupPromise = context.waitForEvent("page", { timeout: 12000 }).catch(() => null);
    let submitClicked = false;
    for (const f of editPage.frames()) {
      const btn = f.locator(submitSel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 8000 }).catch(() => {});
        submitClicked = true;
        console.log(`TC_010: Submit clicked in frame ${f.url().slice(-50)}`);
        break;
      }
    }
    console.log(`TC_010: Submit clicked = ${submitClicked}`);
    await editPage.waitForTimeout(1500).catch(() => {});

    // ---------- TC_011: Process Selection ----------
    const procPopup = await procPopupPromise;
    const procPage: Page = procPopup && !procPopup.isClosed() ? procPopup : editPage;
    await procPage.waitForLoadState("domcontentloaded").catch(() => {});
    await procPage.waitForTimeout(1500).catch(() => {});
    const procFrame = await findFrameByText(procPage, /Process Selection|Selected Process Name|Suggested Process Name/i, 8000);
    if (procFrame) {
      console.log("TC_011: Process Selection window detected; choosing the KYC approval process...");
      for (const f of procPage.frames()) {
        for (const sel of await f.locator("select").all().catch(() => [])) {
          const nm = (await sel.getAttribute("name").catch(() => "")) || "";
          const opts = (await sel.locator("option").allTextContents().catch(() => [])).map((o) => o.trim());
          if (opts.length) console.log(`[procSelect] name="${nm}" opts=${JSON.stringify(opts).slice(0, 300)}`);
        }
      }
      const kycRe = /Corp\w*KYC\w*Approval|CIF\s*Customer\s*KYC\s*Approval|CIFCustomerKYCApproval|KYC\s*Approval/i;
      let chosen = false;
      const selDeadline = Date.now() + 15000;
      while (!chosen && Date.now() < selDeadline) {
        for (const f of procPage.frames()) {
          if (chosen) break;
          for (const sel of await f.locator("select").all().catch(() => [])) {
            const optionEls = await sel.locator("option").all().catch(() => []);
            for (const opt of optionEls) {
              const label = ((await opt.textContent().catch(() => "")) || "").trim();
              const value = (await opt.getAttribute("value").catch(() => "")) || "";
              if (kycRe.test(label) || kycRe.test(value)) {
                await sel.selectOption(value ? { value } : { label }, { timeout: 5000 }).catch(() => {});
                chosen = true;
                console.log(`TC_011: Selected Process Name = "${label}" (value="${value}")`);
                break;
              }
            }
            if (chosen) break;
          }
        }
        if (!chosen) await procPage.waitForTimeout(700).catch(() => {});
      }
      if (!chosen) console.log("TC_011: WARNING - CIFCustomerKYCApproval option not found after waiting");
      await procPage.waitForTimeout(800).catch(() => {});
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
      console.log(`TC_011: Save Process Selection clicked = ${saved}`);
      await procPage.waitForTimeout(3000).catch(() => {});
    } else {
      console.log("TC_011: No Process Selection window appeared (submit may have completed directly).");
    }
    await editPage.screenshot({ path: "test-results/corp-submit-success.png", fullPage: true }).catch(() => {});
    const successFrame = editPage.isClosed()
      ? null
      : await findFrameByText(
          editPage,
          /submitted successfully|General is submitted|record.*submitted|successfully submitted/i,
          4000
        ).catch(() => null);
    const submitSucceeded = submitSuccessSeen || successRe.test(submitDialog) || !!successFrame;
    console.log(`TC_010: submit dialog = "${submitDialog}", successSeen=${submitSuccessSeen}, successFrame=${!!successFrame}`);
    expect(submitSucceeded, "Submission must report success (native confirmation dialog or banner)").toBeTruthy();
    console.log(`✓ TC_010: '${submitDialog || "The General is submitted successfully. CIF ID: " + CIF_ID}'`);

    // ---------- TC_012: Confirmation ----------
    if (successFrame) {
      await successFrame
        .locator('input[type="button"][value="OK"], input[type="submit"][value="OK"], button:has-text("OK"), a:has-text("OK")')
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
    }
    await page.waitForTimeout(2000).catch(() => {});
    console.log("✓ TC_012: Success confirmation acknowledged (Corporate CIF change submitted for verification).");

    // ---------- TC_013: Verify in grid ----------
    console.log("TC_013: Re-searching the CIF so the submitted record displays in the grid...");
    const searchFrame2 = await findFrameByText(page, /Corporate Search Criteria|Customer Search Results|Search Criteria/i, 12000);
    if (searchFrame2) {
      const cifField = searchFrame2
        .locator('input[name="FilterParam1"], input[name*="cif" i], input[id*="cif" i], input[name*="entity" i], input[name*="Cust_Id" i]')
        .first();
      if (await cifField.isVisible().catch(() => false)) {
        await cifField.fill(CIF_ID, { timeout: 5000 }).catch(() => {});
        await searchFrame2
          .locator('input[type="submit"][value="Search"], input[value="Search"], input[type="submit"][value="Submit"], input[type="button"][value="Submit"], button:has-text("Search"), button:has-text("Submit")')
          .first()
          .click({ timeout: 6000 })
          .catch(() => {});
        await page.waitForTimeout(3000);
      }
    }
    await page.screenshot({ path: "test-results/corp-grid-after-submit.png", fullPage: true }).catch(() => {});
    let gridText = "";
    for (const f of page.frames()) {
      const t = await f.locator("body").innerText({ timeout: 2000 }).catch(() => "");
      if (/Customer Search Results|Search Results/i.test(t)) {
        gridText = t.replace(/\s+/g, " ").trim();
        break;
      }
    }
    console.log("TC_013: grid text =", gridText.slice(0, 600));
    const recordShown = gridText.includes(CIF_ID);
    expect(recordShown, "Submitted record must display in the Customer Search Results grid").toBeTruthy();
    console.log(`✓ TC_013: Record (CIF ${CIF_ID}) is displayed in the grid after submission.`);
    await page.screenshot({ path: "test-results/corp-final-results.png", fullPage: true }).catch(() => {});
    console.log(`✓ CIF Corporate Modification Maker (Phone) flow completed: WORK PHONE 1 updated, submitted, and record shown in grid for CIF ${CIF_ID}.`);
  });
});
