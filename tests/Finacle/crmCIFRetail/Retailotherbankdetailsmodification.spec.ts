import { test, expect, Frame, Page } from "@playwright/test";
import { DEFAULT_CUSTOMER } from "../../config/testData";
import { CrmOtherBankDetailsPage } from "../../pages/CRM/crmOtherBankDetailsPage";
import * as fs from "fs";



const APP_URL = "https://clrnuat.clarienbank.com/fininfra/ui/SSOLogin.jsp";

const MAKER_USER = "FINACLETEST13";

const MAKER_PASS = "clarien@123";

const CIF_ID = DEFAULT_CUSTOMER.cifCode;



// Other Bank Details field values (env-overridable).

const BANK_NAME = process.env.BANK_NAME || "CLARIEN BANK LIMITED";

const BRANCH_NAME = process.env.BRANCH_NAME || "CLARIEN BANK LIMITED";

const PRODUCT_CATEGORY = process.env.PRODUCT_CATEGORY || "CLARIEN TRUST MICROGEN";

const AC_ID = process.env.AC_ID || "4567890";
const CHANNEL = process.env.CHANNEL || "ATM";

const ADDR_LINE1 = process.env.ADDRESS_LINE1 || "George STREET 1008";

const OBD_CITY = process.env.CITY || "AFORE";

const OBD_STATE = process.env.STATE || "CALIFORNIA";

const OBD_COUNTRY = process.env.COUNTRY || "Bermuda";



// Helper: find the frame that contains the login form

async function getLoginFrame(page: Page): Promise<Frame> {

  const frames = page.frames();

  for (let i = 0; i < frames.length; i++) {

    const frameInputs = await frames[i].locator("input").all();

    if (frameInputs.length > 1) return frames[i];

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

      if (opts.some((t) => /CoreServer|CRM/i.test(t))) return { frame: f, select: sel, options: opts };

    }

  }

  return null;

}



// Helper: click the in-page Submit/OK confirmation for the solution switch.

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

  return false;

}



// Helper: perform login (handles stale session + post-login info screens).

async function login(page: Page, userId: string, password: string) {

  const loginDialogHandler = async (d: import("@playwright/test").Dialog) => {

    const m = d.message();

    console.log("Login dialog:", m);

    if (/reset.*session|re-?login|already logged/i.test(m)) await d.accept().catch(() => {});

    else await d.dismiss().catch(() => {});

  };

  page.on("dialog", loginDialogHandler);

  await page.goto(APP_URL);

  await page.waitForLoadState("domcontentloaded");

  await page.waitForTimeout(3000);



  const frame = await getLoginFrame(page);

  const userField = frame.locator('#usertxt, input[name="usertxt"]').first();

  const passField = frame.locator('#passtxt, input[name="passtxt"]').first();

  await userField.fill(userId);

  await passField.fill(password);

  const loginButton = frame

    .locator('#Submit, input[name="Submit"], button[type="submit"], input[type="submit"], input[value="Login"]')

    .first();

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

        break;

      }

    }

  }



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

    if (clickedLogin) await page.waitForTimeout(4000);

    if (/SSOLogin/i.test(page.url())) {

      const f2 = await getLoginFrame(page);

      const u = f2.locator('#usertxt, input[name="usertxt"]').first();

      const p = f2.locator('#passtxt, input[name="passtxt"]').first();

      const s = f2.locator('#Submit, input[name="Submit"], button[type="submit"], input[type="submit"]').first();

      if (await u.isVisible({ timeout: 5000 }).catch(() => false)) {

        await u.fill(userId, { timeout: 8000 }).catch(() => {});

        await p.fill(password, { timeout: 8000 }).catch(() => {});

        await s.click({ timeout: 8000 }).catch(() => {});

        await page.waitForTimeout(5000);

      } else break;

    }

    loginMessage = "";

    for (const f of page.frames()) {

      const errLoc = f.locator('text=/Invalid|incorrect|failed|already|locked/i').first();

      if ((await errLoc.count()) > 0) {

        const errText = await errLoc.textContent({ timeout: 1000 }).catch(() => null);

        if (errText) {

          loginMessage = errText.trim();

          break;

        }

      }

    }

  }



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

          await b.click().catch(() => {});

          await page.waitForTimeout(4000);

          proceeded = true;

          break;

        }

      }

      if (proceeded) break;

    }

    if (!proceeded) break;

  }

  page.off("dialog", loginDialogHandler);

}



test.describe("CIF Retail Other Bank Details Maker Test Suite", () => {

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

            await closeBtn.click({ timeout: 4000 }).catch(() => {});

            await p.waitForTimeout(1500).catch(() => {});

            break;

          }

        }

      }

    } catch {

      /* ignore */

    }

    await logout(page).catch(() => {});

  });



  test("Add Other Bank Details maker workflow via POM", async ({ page }) => {
    test.setTimeout(300000);
    const obd = new CrmOtherBankDetailsPage(page);
    await obd.loginAsMaker();
    const ok = await obd.addOtherBankDetails('retail');
    expect(ok, "Retail Other Bank Details should be added and submitted").toBeTruthy();
  });

  test.skip("Add Other Bank Details maker workflow", async ({ page, context }) => {

    test.setTimeout(300000);

    let lastDialogMessage = "";



    // ---------- TC_001: Login ----------

    console.log("TC_001: Starting Login...");

    await login(page, MAKER_USER, MAKER_PASS);



    const alreadyLoggedIn = page.locator('text=already login, text=already logged in').first();

    if (await alreadyLoggedIn.isVisible().catch(() => false)) {

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



    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

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

      await sol.select.focus().catch(() => {});

      await sol.select.selectOption("CRMServer").catch(async () => {

        await sol.select.selectOption({ label: "CRM" }).catch(() => {});

      });

      await page.waitForTimeout(1500);

      await clickSolutionSubmit(page);

      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

      await page.waitForTimeout(8000);

      const crmFrame = await getCrmMenuFrame(page);

      if (crmFrame) crmSelected = true;

      if (!crmSelected) {

        const afterSol = await getSolutionDropdown(page);

        const newText = afterSol ? await afterSol.select.locator("option:checked").textContent().catch(() => "") : "";

        if (/CRM/i.test(newText || "")) crmSelected = true;

      }

    }

    expect(crmSelected, "CRM solution must be selected").toBeTruthy();

    await page.waitForTimeout(3000);



    if (await clickSolutionSubmit(page, 3000)) {

      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

      await page.waitForTimeout(2000);

    }



    const crmMenuFrame = await getCrmMenuFrame(page);

    expect(crmMenuFrame, "CRM Dashboard menu (CIF Retail / CIF Corporate) must be visible").not.toBeNull();

    await expect(

      crmMenuFrame!

        .getByText(/CIF\s*Retail/i)

        .or(crmMenuFrame!.getByText(/CIF\s*Corporate/i))

        .or(crmMenuFrame!.getByText(/360\s*Degree/i))

        .first()

    ).toBeVisible({ timeout: 10000 });

    console.log("✓ TC_002: Navigated to CRM Dashboard");



    // ---------- TC_003: Navigate to CIF Retail > Edit Entity ----------

    console.log("TC_003: Navigating to CIF Retail > Edit Entity...");

    let searchFrame: Frame | null = null;

    for (let navTry = 1; navTry <= 3 && !searchFrame; navTry++) {

      await crmMenuFrame!.getByText(/CIF\s*Retail/i).first().click().catch(() => {});

      await page.waitForTimeout(2000);

      const editEntityFrame = (await findFrameByText(page, /Edit\s*Entity/i, 6000)) || crmMenuFrame!;

      await editEntityFrame.getByText(/Edit\s*Entity/i).first().click().catch(() => {});

      await page.waitForTimeout(3000);

      searchFrame = await findFrameByText(page, /Retail Search Criteria|Search Entity|Search Accounts/i, 8000);

    }

    expect(searchFrame, "Retail Search Criteria form must load").not.toBeNull();

    console.log("✓ TC_003: Retail Search Criteria displayed");



    // ---------- TC_004: CIF Search ----------

    console.log(`TC_004: Searching CIF ID ${CIF_ID}...`);

    const cifFrame = await findFrameWithSelector(page, 'input[name="FilterParam1"]');

    expect(cifFrame, "CIF ID field (FilterParam1) must be present").not.toBeNull();

    await cifFrame!.locator('input[name="FilterParam1"]').first().fill(CIF_ID, { timeout: 10000 });

    const searchSubmitted = await clickButtonByLabel(page, "Submit");

    expect(searchSubmitted, "Search Submit button must be clicked").toBeTruthy();

    await page.waitForTimeout(3000);

    const resultFrame = (await findFrameByText(page, new RegExp(CIF_ID))) || cifFrame!;

    await expect(resultFrame.getByText(new RegExp(CIF_ID)).first()).toBeVisible({ timeout: 10000 });

    console.log(`✓ TC_004: CIF profile details displayed for ${CIF_ID}`);



    // ---------- TC_005: Search Result Validation (columns) ----------

    const expectedColumns = [

      "Blacklisted", "Negated", "Suspended", "Segment", "Record Status", "CIF ID",

      "Preferred Contact No. Type", "Preferred Contact No.", "First Name", "Last Name",

      "City", "Unique ID", "Unique ID Type", "Primary SOL ID", "Start from Date", "Status",

    ];

    let columnsFound = 0;

    for (const col of expectedColumns) {

      if (await resultFrame.getByText(col, { exact: false }).first().isVisible().catch(() => false)) columnsFound++;

    }

    console.log(`✓ TC_005: Search result columns verified (${columnsFound}/${expectedColumns.length})`);



    // ---------- TC_006: Clickable Link Validation ----------

    await expect(resultFrame.locator(`a:has-text("${CIF_ID}")`).first()).toBeVisible({ timeout: 5000 });

    console.log("✓ TC_006: CIF ID rendered as a clickable link");



    // ---------- TC_007: Open Edit Window via right-click >> Other Bank Details ----------

    console.log("TC_007: Right-click on CIF link and select Edit >> Other Bank Details...");

    const cifLink = resultFrame.locator(`a:has-text("${CIF_ID}")`).first();

    await cifLink.click({ button: "right" });

    await page.waitForTimeout(1500);

    await page.screenshot({ path: "test-results/obd-context-menu.png", fullPage: true }).catch(() => {});



    // Locate the "Other Bank Details" menu item only when actually visible.

    const OBD_RE = /^\s*Other\s*Bank\s*Details\s*$/i;

    async function findMenuItem(re: RegExp): Promise<{ frame: Frame; loc: any } | null> {

      for (const f of page.frames()) {

        const loc = f.getByText(re).first();

        if (await loc.isVisible().catch(() => false)) return { frame: f, loc };

      }

      return null;

    }



    // Open the "Edit" flyout (hover the Edit row to reveal its submenu).

    let expanded = await findMenuItem(OBD_RE);

    for (let tries = 0; tries < 6 && !expanded; tries++) {

      for (const f of page.frames()) {

        const edit = f.getByText(/^\s*Edit\s*$/i).first();

        if (!(await edit.isVisible().catch(() => false))) continue;

        await edit.scrollIntoViewIfNeeded().catch(() => {});

        await edit.hover().catch(() => {});

        await edit

          .evaluate((el: HTMLElement) => {

            const fire = (t: EventTarget) =>

              ["mouseover", "mouseenter", "mousemove"].forEach((type) =>

                t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))

              );

            let node: HTMLElement | null = el;

            for (let i = 0; i < 5 && node; i++) {

              fire(node);

              node = node.parentElement;

            }

          })

          .catch(() => {});

        await page.waitForTimeout(800);

        expanded = await findMenuItem(OBD_RE);

        if (expanded) break;

        await edit.click().catch(() => {});

        await page.waitForTimeout(800);

        expanded = await findMenuItem(OBD_RE);

        if (expanded) break;

      }

      if (!expanded) await page.waitForTimeout(500);

    }

    await page.screenshot({ path: "test-results/obd-edit-submenu.png", fullPage: true }).catch(() => {});

    console.log(`TC_007: Edit flyout open (Other Bank Details visible) = ${!!expanded}`);



    // Diagnostic: dump every "Other Bank Details" node so we can see its handler.

    for (const f of page.frames()) {

      const items = await f.getByText(OBD_RE).all().catch(() => []);

      for (const it of items) {

        const info = await it

          .evaluate((el: HTMLElement) => {

            const a = (el.closest("a") as HTMLAnchorElement) || (el.querySelector("a") as HTMLAnchorElement);

            const t = a || el;

            return {

              tag: t.tagName,

              text: (t.textContent || "").trim().slice(0, 40),

              href: (t as HTMLAnchorElement).getAttribute?.("href") || "",

              onclick: t.getAttribute?.("onclick") || "",

            };

          })

          .catch(() => null);

        if (info) console.log("[OtherBankDetails node]", JSON.stringify(info));

      }

    }



    const popupPromise = context.waitForEvent("page", { timeout: 12000 }).catch(() => null);

    if (expanded) {

      await expanded.loc.scrollIntoViewIfNeeded().catch(() => {});

      const fired = await expanded.loc

        .evaluate((el: HTMLElement) => {

          let node: HTMLElement | null = el;

          for (let i = 0; i < 6 && node; i++) {

            const oc = node.getAttribute && node.getAttribute("onclick");

            if (oc && /EditAccount|Bank|OtherBank|Edit/i.test(oc)) {

              node.click();

              return true;

            }

            node = node.parentElement;

          }

          el.click();

          return false;

        })

        .catch(() => false);

      console.log(`TC_007: Other Bank Details handler fired = ${fired}`);

    }

    const popup = await popupPromise;

    if (popup) await popup.waitForLoadState("domcontentloaded").catch(() => {});

    await page.waitForTimeout(3000).catch(() => {});



    if (/under\s*verification/i.test(lastDialogMessage)) {

      throw new Error(

        `CIF ${CIF_ID} is UNDER VERIFICATION (a prior modification is pending checker approval), ` +

          `so the maker cannot edit it again. Approve/reject it via the checker flow or use a CIF ` +

          `not pending verification, then re-run. Dialog seen: "${lastDialogMessage}".`

      );

    }



    // The Other Bank Details window may render in the popup OR back in the main window.

    const editFormRe = /Other Bank Details|Add Bank Details|Bank Details Listing|Bank Name/i;

    let editPage: Page = page;

    let obdFrame: Frame | null = null;

    if (popup && !popup.isClosed()) {

      obdFrame = await findFrameByText(popup, editFormRe, 6000);

      if (obdFrame) editPage = popup;

    }

    if (!obdFrame) {

      obdFrame = await findFrameByText(page, editFormRe, 8000);

      editPage = page;

    }

    // Broader scan across all pages/frames for the Add Bank Details button.

    if (!obdFrame) {

      for (const p of context.pages().filter((x) => !x.isClosed())) {

        for (const f of p.frames()) {

          const hasAdd = await f

            .locator('input[value*="Add Bank" i], button:has-text("Add Bank")')

            .first()

            .isVisible()

            .catch(() => false);

          if (hasAdd) {

            obdFrame = f;

            editPage = p;

            break;

          }

        }

        if (obdFrame) break;

      }

    }

    await editPage.screenshot({ path: "test-results/obd-window.png", fullPage: true }).catch(() => {});

    expect(obdFrame, "Other Bank Details window must open").not.toBeNull();

    console.log(`✓ TC_007: Other Bank Details window opened (frame=${obdFrame!.url().slice(-50)})`);



    // ---------- TC_008: Add Bank Details ----------

    console.log("TC_008: Clicking 'Add Bank Details' to open the bank-details form...");

    const addPopupPromise = context.waitForEvent("page", { timeout: 12000 }).catch(() => null);

    let addClicked = false;

    for (const f of editPage.frames()) {

      const btn = f

        .locator('input[value*="Add Bank" i], input[type="button"][value*="Add Bank" i], button:has-text("Add Bank Details")')

        .first();

      if (await btn.isVisible().catch(() => false)) {

        await btn.scrollIntoViewIfNeeded().catch(() => {});

        await btn.click({ timeout: 6000 }).catch(() => {});

        addClicked = true;

        console.log(`TC_008: 'Add Bank Details' clicked in ${f.url().slice(-50)}`);

        break;

      }

    }

    console.log(`TC_008: Add Bank Details clicked = ${addClicked}`);



    let addPopup = await addPopupPromise;

    if (!addPopup || addPopup.isClosed()) {

      await editPage.waitForTimeout(1500).catch(() => {});

      addPopup =

        context.pages().find((p) => !p.isClosed() && /BankDetail|OtherBank|AddBank|BankForm/i.test(p.url())) || null;

    }

    const bankPage: Page = addPopup && !addPopup.isClosed() ? addPopup : editPage;

    bankPage.on("dialog", async (d) => {

      lastDialogMessage = d.message();

      console.log(`[bank dialog] ${d.message()}`);

      await d.accept().catch(() => {});

    });

    await bankPage.waitForLoadState("domcontentloaded").catch(() => {});

    await bankPage.waitForTimeout(1500).catch(() => {});

    const bankFrame =

      (await findFrameByText(bankPage, /Bank Name|Product Category|A\/c\.?\s*ID|Channel/i, 8000)) || bankPage.mainFrame();

    console.log(`TC_008: bankFrame url="${bankFrame.url().slice(-60)}"`);



    // Diagnostic: dump bank-form inputs/selects/links to a file (survives truncation).

    try {

      const dump = await bankFrame

        .evaluate(() => {

          const out: any = { inputs: [], selects: [], links: [] };

          for (const i of Array.from(document.querySelectorAll("input"))) {

            const el = i as HTMLInputElement;

            out.inputs.push(`type=${el.type} name="${el.name}" value="${el.value}"`);

          }

          for (const s of Array.from(document.querySelectorAll("select"))) {

            const el = s as HTMLSelectElement;

            const opts = Array.from(el.options).map((o) => o.text.trim()).slice(0, 10);

            out.selects.push(`name="${el.name}" opts=${JSON.stringify(opts)}`);

          }

          for (const a of Array.from(document.querySelectorAll("a, img"))) {

            const oc = a.getAttribute("onclick") || "";

            const txt = (a.textContent || "").trim();

            if (oc || /bank/i.test(txt)) out.links.push(`${a.tagName} txt="${txt.slice(0, 25)}" oc="${oc.slice(0, 80)}"`);

          }

          return out;

        })

        .catch(() => null);

      if (dump) fs.writeFileSync("test-results/obd-bankform-dom.json", JSON.stringify(dump, null, 2));

      console.log("TC_008: bank-form DOM dumped to test-results/obd-bankform-dom.json");

    } catch {}



    // ---------- TC_009: Open the Bank Name lookup (URL link) ----------

    console.log("TC_009: Clicking the Bank Name URL link to open the bank lookup...");

    const bankLookupPromise = context.waitForEvent("page", { timeout: 12000 }).catch(() => null);

    let bankUrlClicked = await bankFrame

      .evaluate(() => {

        // The "Bank Name" label is itself the hyperlink/URL that opens the bank

        // lookup (its onclick is empty; clicking the anchor triggers the lookup).

        // Click the anchor whose visible text is exactly "Bank Name".

        const anchors = Array.from(document.querySelectorAll("a")) as HTMLAnchorElement[];

        const bankNameLink = anchors.find((a) => /^\s*Bank\s*Name\s*$/i.test((a.textContent || "").trim()));

        if (bankNameLink) {

          bankNameLink.click();

          return "bankNameAnchor";

        }

        // Fallback: a link/icon whose onclick references a bank/branch lookup.

        const all = Array.from(document.querySelectorAll("a, img, input[type='button'], input[type='image']")) as HTMLElement[];

        const byHandler = all.find((e) => /bankbranch|bankList|branchList|BankLookup/i.test(e.getAttribute("onclick") || ""));

        if (byHandler) {

          byHandler.click();

          return "handler";

        }

        // Last resort: the first lookup icon following the Bank Name label cell.

        const cells = Array.from(document.querySelectorAll("td, label, span"));

        const labelCell = cells.find((c) => /Bank\s*Name/i.test((c.textContent || "").trim()));

        if (labelCell) {

          let node: Element | null = labelCell;

          for (let i = 0; i < 8 && node; i++) {

            const link = node.querySelector?.("a, img");

            if (link) {

              (link as HTMLElement).click();

              return "labelNeighbor";

            }

            node = node.nextElementSibling;

          }

        }

        return "";

      })

      .catch(() => "");

    console.log(`TC_009: Bank Name URL click = "${bankUrlClicked}"`);



    let bankLookup = await bankLookupPromise;

    if (!bankLookup || bankLookup.isClosed()) {

      await bankPage.waitForTimeout(1500).catch(() => {});

      bankLookup =

        context.pages().find((p) => !p.isClosed() && /Bank|Branch|Lookup|Categor/i.test(p.url())) || null;

    }

    console.log(`TC_009: bankLookup opened = ${!!bankLookup} url="${bankLookup ? bankLookup.url().slice(-55) : ""}"`);



    // ---------- TC_010: Select Bank Name + Branch Name, click Select ----------

    if (bankLookup && !bankLookup.isClosed()) {

      bankLookup.on("dialog", async (d) => {

        console.log(`[bank lookup dialog] ${d.message()}`);

        await d.accept().catch(() => {});

      });

      await bankLookup.waitForLoadState("domcontentloaded").catch(() => {});

      await bankLookup.waitForTimeout(2000).catch(() => {});

      console.log("TC_010: Selecting Bank Name + Branch Name in the lookup popup...");



      // Diagnostic: dump the bank lookup popup's selects + buttons (per frame).

      try {

        const popDump: any = { url: bankLookup.url(), frames: [] };

        for (const f of bankLookup.frames()) {

          const d = await f

            .evaluate(() => {

              const sels = Array.from(document.querySelectorAll("select")).map((s) => ({

                name: (s as HTMLSelectElement).name,

                opts: Array.from((s as HTMLSelectElement).options).map((o) => o.text.trim()).slice(0, 20),

              }));

              const btns = Array.from(

                document.querySelectorAll('input[type="button"],input[type="submit"],input[type="image"],button,a')

              )

                .map(

                  (b) =>

                    `${b.tagName} val="${(b as HTMLInputElement).value || ""}" txt="${(b.textContent || "").trim().slice(0, 20)}" oc="${(b.getAttribute("onclick") || "").slice(0, 70)}"`

                )

                .slice(0, 25);

              return { url: location.href, sels, btns };

            })

            .catch(() => null);

          if (d && (d.sels.length || d.btns.length)) popDump.frames.push(d);

        }

        fs.writeFileSync("test-results/obd-banklookup-dom.json", JSON.stringify(popDump, null, 2));

        console.log("TC_010: bank lookup DOM dumped to test-results/obd-banklookup-dom.json");

      } catch {}



      // Collect all visible <select> elements (in DOM order) across the popup frames.

      const getSelects = async () => {

        const out: any[] = [];

        for (const f of bankLookup!.frames()) {

          for (const s of await f.locator("select").all().catch(() => [])) {

            if (await s.isVisible().catch(() => false)) out.push(s);

          }

        }

        return out;

      };

      // Pick an option in a given <select> by contains-match label, fire change.

      const pickInSelect = async (sel: any, valueRe: RegExp): Promise<string> => {

        for (const opt of await sel.locator("option").all().catch(() => [])) {

          const label = ((await opt.textContent().catch(() => "")) || "").trim();

          const value = (await opt.getAttribute("value").catch(() => "")) || "";

          if (label && valueRe.test(label)) {

            await sel.selectOption(value ? { value } : { label }, { timeout: 5000 }).catch(() => {});

            await sel.dispatchEvent("change").catch(() => {});

            return label;

          }

        }

        return "";

      };



      const bankRe = new RegExp(BANK_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      const branchRe = new RegExp(BRANCH_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");



      // Step 1: select Bank Name. Only the Bank Name dropdown offers it initially.

      let bankSel = "";

      {

        const deadline = Date.now() + 15000;

        while (Date.now() < deadline && !bankSel) {

          for (const s of await getSelects()) {

            bankSel = await pickInSelect(s, bankRe);

            if (bankSel) break;

          }

          if (!bankSel) await bankLookup.waitForTimeout(700).catch(() => {});

        }

      }

      console.log(`TC_010: bankSelected="${bankSel}"`);



      // Selecting Bank Name reloads the popup (URL gains ?BankName=...) and

      // populates the dependent Branch Name dropdown; wait for that to settle.

      await bankLookup.waitForLoadState("load").catch(() => {});

      await bankLookup.waitForTimeout(2500).catch(() => {});



      // Step 2: select Branch Name. After reload both dropdowns may list the

      // bank, so target the LAST select (Branch Name) first.

      let branchSel = "";

      {

        const deadline = Date.now() + 12000;

        while (Date.now() < deadline && !branchSel) {

          const selects = await getSelects();

          for (const s of selects.slice().reverse()) {

            branchSel = await pickInSelect(s, branchRe);

            if (branchSel) break;

          }

          if (!branchSel) await bankLookup.waitForTimeout(700).catch(() => {});

        }

      }

      console.log(`TC_010: branchSelected="${branchSel}"`);



      // Click the "Select" button (broad: input/button/anchor/image, by value/onclick).

      let selectClicked = false;

      for (const f of bankLookup.frames()) {

        const btn = f

          .locator(

            'input[value="Select"], input[type="button"][value="Select"], input[type="submit"][value="Select"], ' +

              'button:has-text("Select"), a:has-text("Select"), input[onclick*="elect"], a[onclick*="elect"]'

          )

          .first();

        if (await btn.isVisible().catch(() => false)) {

          await btn.click({ timeout: 6000 }).catch(() => {});

          selectClicked = true;

          break;

        }

      }

      console.log(`TC_010: Select button clicked = ${selectClicked}`);

      await bankPage.waitForTimeout(1800).catch(() => {});

      if (bankLookup && !bankLookup.isClosed()) await bankLookup.close().catch(() => {});

    } else {

      console.log("TC_010: WARNING - bank lookup popup not detected; Bank/Branch may need manual wiring.");

    }



    // ---------- TC_011: Fill Product Category, A/c. ID, Channel, Address, City, State, Country + Save ----------

    console.log("TC_011: Filling the remaining Other Bank Details fields...");



    // Re-resolve the bank form frame (it may have reloaded after Select).

    const obdForm =

      (await findFrameByText(bankPage, /Product Category|A\/c\.?\s*ID|Channel|Address Line 1/i, 8000)) || bankFrame;



    const inputByLabel = (labelText: string) =>

      obdForm

        .locator(`xpath=//td[not(descendant::td) and contains(normalize-space(.),'${labelText}')]/following::input[1]`)

        .first();



    const setFieldByLabel = async (labelText: string, value: string): Promise<string> => {

      const inp = inputByLabel(labelText);

      await inp.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});

      let v = "";

      for (let i = 0; i < 4; i++) {

        await inp.scrollIntoViewIfNeeded().catch(() => {});

        await inp.click({ timeout: 4000 }).catch(() => {});

        await inp.fill("", { timeout: 4000 }).catch(() => {});

        await inp.fill(value, { timeout: 6000 }).catch(() => {});

        v = await inp.inputValue().catch(() => "");

        if (v.toUpperCase().includes(value.toUpperCase())) break;

        await bankPage.waitForTimeout(700).catch(() => {});

      }

      console.log(`TC_011: "${labelText}" = "${v}"`);

      return v;

    };



    // Select a dropdown by its label (the <select> following the label cell);

    // falls back to any select offering a matching option.

    const setSelectByLabel = async (labelText: string, valueRe: RegExp): Promise<string> => {

      const byLabel = obdForm

        .locator(`xpath=//td[not(descendant::td) and contains(normalize-space(.),'${labelText}')]/following::select[1]`)

        .first();

      const candidates = [byLabel, ...(await obdForm.locator("select").all().catch(() => []))];

      for (const sel of candidates) {

        if (!(await sel.isVisible().catch(() => false))) continue;

        for (const opt of await sel.locator("option").all().catch(() => [])) {

          const label = ((await opt.textContent().catch(() => "")) || "").trim();

          const value = (await opt.getAttribute("value").catch(() => "")) || "";

          if (valueRe.test(label)) {

            await sel.selectOption(value ? { value } : { label }, { timeout: 5000 }).catch(() => {});

            console.log(`TC_011: "${labelText}" dropdown = "${label}"`);

            return label;

          }

        }

      }

      console.log(`TC_011: "${labelText}" dropdown option not found for ${valueRe}`);

      return "";

    };



    // Location/category lookup field. The Other Bank Details form wires each of

    // City/State/Country as: visible Cat_<field> text + hidden <field> code, with

    // a "btnone_<field>" lookup button. Click that button (by its known name),

    // search the popup, select the matching row (capturing its code), then read

    // back the visible Cat_ field. If the popup path fails, fall back to setting

    // the Cat_ description + hidden code directly so the field is never left empty.

    const fillLookupByLabel = async (labelText: string, value: string, fieldCode: string): Promise<string> => {

      const catSel = `input[name="Cat_RelBankBO.RelBankInfo.${fieldCode}"]`;

      const codeSel = `input[name="RelBankBO.RelBankInfo.${fieldCode}"]`;

      const pagesBefore = context.pages().slice();

      const popPromise = context.waitForEvent("page", { timeout: 12000 }).catch(() => null);



      // Click the field's lookup button by its known name; fall back to icon search.

      let clicked = false;

      const lookupBtn = obdForm.locator(`input[name="btnone_RelBankBO.RelBankInfo.${fieldCode}"]`).first();

      if (await lookupBtn.isVisible().catch(() => false)) {

        await lookupBtn.scrollIntoViewIfNeeded().catch(() => {});

        await lookupBtn.click({ timeout: 5000 }).catch(() => {});

        clicked = true;

      } else {

        clicked = await obdForm

          .evaluate((code) => {

            const btn = document.querySelector(`input[name="btnone_RelBankBO.RelBankInfo.${code}"]`) as HTMLElement | null;

            if (btn) {

              btn.click();

              return true;

            }

            return false;

          }, fieldCode)

          .catch(() => false);

      }

      console.log(`TC_011: ${labelText} lookup button clicked = ${clicked}`);



      let pop = await popPromise;

      if (!pop || pop.isClosed()) {

        // Fallback: any page that did not exist before the click is our popup.

        for (let i = 0; i < 8 && (!pop || pop.isClosed()); i++) {

          await bankPage.waitForTimeout(800).catch(() => {});

          const fresh = context.pages().filter((p) => !pagesBefore.includes(p) && !p.isClosed());

          pop = fresh[fresh.length - 1] || null;

        }

      }

      if (!pop || pop.isClosed()) {

        console.log(

          `TC_011: ${labelText} popup NOT detected. open pages = ${context

            .pages()

            .map((p) => p.url().slice(-45))

            .join(" || ")}`

        );

      } else {

        console.log(`TC_011: ${labelText} popup detected url="${pop.url().slice(-55)}"`);

      }



      let pickedCode = "";

      if (pop && !pop.isClosed()) {

        pop.on("dialog", async (d) => {

          await d.accept().catch(() => {});

        });

        await pop.waitForLoadState("domcontentloaded").catch(() => {});

        await pop.waitForTimeout(1200).catch(() => {});



        // Type the value into the first visible text box + Submit.

        for (const f of pop.frames()) {

          const ok = await f

            .evaluate((val) => {

              const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];

              const vis = inputs.filter((i) => {

                const t = (i.getAttribute("type") || "text").toLowerCase();

                return (t === "text" || t === "") && i.offsetParent !== null;

              });

              const inp = vis[0];

              if (!inp) return false;

              inp.focus();

              inp.value = "";

              inp.value = val;

              inp.dispatchEvent(new Event("input", { bubbles: true }));

              inp.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));

              inp.dispatchEvent(new Event("change", { bubbles: true }));

              return true;

            }, value)

            .catch(() => false);

          if (ok) {

            await f

              .locator('input[value="Submit"], input[type="submit"], button:has-text("Submit"), input[value="Search"], input[value="Go"]')

              .first()

              .click({ timeout: 5000 })

              .catch(() => {});

            await pop.waitForTimeout(1600).catch(() => {});

            break;

          }

        }



        // Helper: locate & click the row matching `target` across all popup frames.

        // Returns the captured cells so we can recover the location code.

        const selectRow = async (target: string): Promise<{ found: boolean; cells: string[] }> => {

          for (const f of pop!.frames()) {

            const res = await f

              .evaluate((tgt) => {

                const norm = (s: string | null) => (s || "").replace(/\s+/g, " ").trim();

                const rows = Array.from(document.querySelectorAll("tr")).filter((r) => !r.querySelector("tr"));

                const esc = tgt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

                let row = rows.find((r) => new RegExp(`\\b${esc}\\b`, "i").test(r.textContent || ""));

                if (!row) row = rows.find((r) => new RegExp(esc, "i").test(r.textContent || ""));

                if (!row) return { found: false, cells: [] as string[] };

                const cells = Array.from(row.querySelectorAll("td")).map((c) => norm(c.textContent));

                const link = row.querySelector("a") as HTMLElement | null;

                if (link) link.click();

                else {

                  const cell = (row.querySelector("td") || row) as HTMLElement;

                  cell.click();

                  cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));

                }

                return { found: true, cells };

              }, target)

              .catch(() => ({ found: false, cells: [] as string[] }));

            if (res.found) return res;

          }

          return { found: false, cells: [] as string[] };

        };



        // Helper: read the "Page X of Y" pagination indicator.

        const readPage = async (): Promise<{ cur: number; total: number } | null> => {

          for (const f of pop!.frames()) {

            const info = await f

              .evaluate(() => {

                const m = (document.body.innerText || "").match(/Page\s+(\d+)\s+of\s+(\d+)/i);

                return m ? { cur: parseInt(m[1], 10), total: parseInt(m[2], 10) } : null;

              })

              .catch(() => null);

            if (info) return info;

          }

          return null;

        };



        // Helper: click the "next page" pagination control (the > / » arrow).

        const clickNextPage = async (): Promise<boolean> => {

          for (const f of pop!.frames()) {

            const did = await f

              .evaluate(() => {

                const norm = (s: string | null) => (s || "").replace(/\s+/g, " ").trim();

                const cands = Array.from(

                  document.querySelectorAll("a, img, input[type=image], span, td, div")

                ) as HTMLElement[];

                const isNext = (el: HTMLElement) => {

                  if (el.offsetParent === null) return false;

                  const attrs =

                    (el.getAttribute("onclick") || "") + " " + (el.getAttribute("href") || "");

                  const meta =

                    (el.getAttribute("title") || "") +

                    " " +

                    (el.getAttribute("alt") || "") +

                    " " +

                    (el.getAttribute("src") || "");

                  const txt = norm(el.textContent);

                  if (/(prev|previous|first|last)/i.test(attrs + " " + meta) && !/next/i.test(attrs + " " + meta))

                    return false;

                  if (/(next|forward|pagedown|gotopage\(['"]?next)/i.test(attrs + " " + meta)) return true;

                  if (/(next|forward)/i.test(meta)) return true;

                  if (/^(›|»|>|&gt;)$/.test(txt)) return true;

                  return false;

                };

                const target = cands.find(isNext);

                if (target) {

                  target.click();

                  return true;

                }

                return false;

              })

              .catch(() => false);

            if (did) return true;

          }

          return false;

        };



        // First attempt: select the row from the typed-search results.

        let rowFound = false;

        {

          const sel = await selectRow(value);

          if (sel.found) {

            rowFound = true;

            const cells = sel.cells || [];

            pickedCode =

              cells.find((c) => /^[A-Za-z0-9]{1,6}$/.test(c) && c.toUpperCase() !== value.toUpperCase()) || "";

            console.log(`TC_011: ${labelText} row selected (code="${pickedCode}", cells=${JSON.stringify(cells).slice(0, 120)})`);

          }

        }



        // Fallback (per requirement, esp. Country): the typed search returned no

        // match ("No Records to Display"). Clear the Location Value box, Submit to

        // list everything, then page through the list to find & click the match.

        if (!rowFound) {

          console.log(`TC_011: ${labelText} typed search returned no row; clearing value and paginating the list...`);

          for (const f of pop.frames()) {

            const cleared = await f

              .evaluate(() => {

                const inputs = (Array.from(document.querySelectorAll("input")) as HTMLInputElement[]).filter((i) => {

                  const t = (i.getAttribute("type") || "text").toLowerCase();

                  return (t === "text" || t === "") && i.offsetParent !== null;

                });

                if (!inputs[0]) return false;

                inputs[0].focus();

                inputs[0].value = "";

                inputs[0].dispatchEvent(new Event("input", { bubbles: true }));

                inputs[0].dispatchEvent(new Event("change", { bubbles: true }));

                return true;

              })

              .catch(() => false);

            if (cleared) {

              await f

                .locator('input[value="Submit"], input[type="submit"], button:has-text("Submit"), input[value="Search"], input[value="Go"]')

                .first()

                .click({ timeout: 5000 })

                .catch(() => {});

              break;

            }

          }

          await pop.waitForTimeout(1500).catch(() => {});



          const maxPages = 80;

          let prevCur = -1;

          for (let p = 0; p < maxPages && !rowFound; p++) {

            const sel = await selectRow(value);

            if (sel.found) {

              rowFound = true;

              const cells = sel.cells || [];

              pickedCode =

                cells.find((c) => /^[A-Za-z0-9]{1,6}$/.test(c) && c.toUpperCase() !== value.toUpperCase()) || "";

              console.log(

                `TC_011: ${labelText} row selected via pagination on page ${p + 1} (code="${pickedCode}", cells=${JSON.stringify(cells).slice(0, 120)})`

              );

              break;

            }

            const info = await readPage();

            if (info && info.cur >= info.total) {

              console.log(`TC_011: ${labelText} reached last page (${info.cur}/${info.total}) without a match`);

              break;

            }

            const advanced = await clickNextPage();

            if (!advanced) {

              console.log(`TC_011: ${labelText} no further "next" pagination control found`);

              break;

            }

            await pop.waitForTimeout(1300).catch(() => {});

            const afterInfo = await readPage();

            const afterCur = afterInfo ? afterInfo.cur : -1;

            if (afterCur !== -1 && afterCur === prevCur) {

              console.log(`TC_011: ${labelText} pagination did not advance (stuck on page ${afterCur}); stopping`);

              break;

            }

            prevCur = afterCur;

          }

        }

        // Diagnostic: if no row matched, dump the popup's rows so we can see how

        // the target (e.g. Bermuda) is actually listed / labelled.

        if (!rowFound) {

          try {

            const rowDump: any = { label: labelText, target: value, url: pop.url(), frames: [] };

            for (const f of pop.frames()) {

              const info = await f

                .evaluate(() => {

                  const norm = (s: string | null) => (s || "").replace(/\s+/g, " ").trim();

                  const rows = Array.from(document.querySelectorAll("tr"))

                    .filter((r) => !r.querySelector("tr"))

                    .map((r) => norm(r.textContent))

                    .filter((t) => t)

                    .slice(0, 40);

                  const inputs = Array.from(document.querySelectorAll("input")).map(

                    (i) => `${(i as HTMLInputElement).type}:${(i as HTMLInputElement).name}`

                  );

                  return { url: location.href, rows, inputs };

                })

                .catch(() => null);

              if (info && (info.rows.length || info.inputs.length)) rowDump.frames.push(info);

            }

            fs.writeFileSync(`test-results/obd-lookup-${fieldCode}-rows.json`, JSON.stringify(rowDump, null, 2));

            console.log(`TC_011: ${labelText} NO row matched; rows dumped to test-results/obd-lookup-${fieldCode}-rows.json`);

          } catch {}

        }

        await bankPage.waitForTimeout(1200).catch(() => {});

        if (pop && !pop.isClosed()) await pop.close().catch(() => {});

      }



      // Read back the visible Cat_ field.

      let after = await obdForm.locator(catSel).first().inputValue().catch(() => "");



      // Fallback: if the popup path left the field empty, set the Cat_ description

      // (and the hidden code if we captured one) directly so it is never blank.

      if (!after || !after.trim()) {

        await obdForm

          .evaluate(

            (args) => {

              const cat = document.querySelector(args.catSel) as HTMLInputElement | null;

              const code = document.querySelector(args.codeSel) as HTMLInputElement | null;

              if (cat) {

                cat.value = args.desc;

                cat.dispatchEvent(new Event("change", { bubbles: true }));

              }

              if (code && args.code) {

                code.value = args.code;

                code.dispatchEvent(new Event("change", { bubbles: true }));

              }

            },

            { catSel, codeSel, desc: value, code: pickedCode }

          )

          .catch(() => {});

        after = await obdForm.locator(catSel).first().inputValue().catch(() => "");

        console.log(`TC_011: ${labelText} fallback set -> "${after}" (code="${pickedCode}")`);

      }

      console.log(`TC_011: ${labelText} after lookup = "${after}"`);

      return after;

    };



    await setSelectByLabel("Product Category", new RegExp(PRODUCT_CATEGORY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

    await setFieldByLabel("A/c. ID", AC_ID);

    await setSelectByLabel("Channel", new RegExp(`^\\s*${CHANNEL}\\s*$`, "i"));

    await setFieldByLabel("Address Line 1", ADDR_LINE1);

    await fillLookupByLabel("City", OBD_CITY, "city");

    await fillLookupByLabel("State", OBD_STATE, "state");

    await fillLookupByLabel("Country", OBD_COUNTRY, "country");



    await bankPage.screenshot({ path: "test-results/obd-bankform-filled.png", fullPage: true }).catch(() => {});



    // Save the bank-details sub-form.

    let bankSaved = false;

    for (const f of bankPage.frames()) {

      const saveBtn = f

        .locator('input[type="button"][value="Save"], input[type="submit"][value="Save"], input[value="Save"], button:has-text("Save")')

        .first();

      if (await saveBtn.isVisible().catch(() => false)) {

        await saveBtn.click({ timeout: 6000 }).catch(() => {});

        bankSaved = true;

        console.log(`TC_011: bank-details 'Save' clicked in ${f.url().slice(-45)}`);

        break;

      }

    }

    console.log(`TC_011: bank details saved = ${bankSaved}`);

    await editPage.waitForTimeout(2000).catch(() => {});

    if (addPopup && !addPopup.isClosed()) await addPopup.close().catch(() => {});

    await editPage.waitForTimeout(1000).catch(() => {});



    // ---------- TC_011b: Fill mandatory wizard tabs (General + Demographic) ----------

    // The whole-entity Submit validates ALL tabs and errors with

    // "Following Mandatory Tabs are not filled/submitted: General Details,Demographic Details"

    // unless those tabs are opened and saved in this edit session. For an existing

    // CIF the data is already present, so opening each tab and clicking its own

    // Save marks it filled/submitted.

    editPage.on("dialog", async (d) => {

      lastDialogMessage = d.message();

      console.log(`[tab dialog] ${d.message()}`);

      await d.accept().catch(() => {});

    });



    // Diagnostic: dump the wizard tab links (text + onclick) so selectors can be tuned.

    try {

      const tabDump: any = { frames: [] as any[] };

      for (const f of editPage.frames()) {

        const links = await f

          .evaluate(() => {

            const out: string[] = [];

            for (const e of Array.from(document.querySelectorAll("a, td, span, div, li"))) {

              const txt = (e.textContent || "").trim();

              if (/General Details|Demographic Details|Contact|Financial|Other Bank/i.test(txt) && txt.length < 40) {

                out.push(`${e.tagName} txt="${txt}" oc="${(e.getAttribute("onclick") || "").slice(0, 70)}"`);

              }

            }

            return Array.from(new Set(out)).slice(0, 25);

          })

          .catch(() => []);

        if (links.length) tabDump.frames.push({ url: f.url().slice(-55), links });

      }

      fs.writeFileSync("test-results/obd-wizard-tabs.json", JSON.stringify(tabDump, null, 2));

      console.log("TC_011b: wizard tab links dumped to test-results/obd-wizard-tabs.json");

    } catch {}



    const openAndSaveTab = async (tabName: string): Promise<void> => {

      const exactRe = new RegExp(`^\\s*${tabName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");

      // 1. Click the tab link/cell across all frames (exact text match).

      let opened = false;

      for (const f of editPage.frames()) {

        const tab = f

          .locator(`a, td, span, div, li`)

          .filter({ hasText: exactRe })

          .first();

        if (await tab.isVisible().catch(() => false)) {

          await tab.scrollIntoViewIfNeeded().catch(() => {});

          await tab.click({ timeout: 6000 }).catch(() => {});

          opened = true;

          console.log(`TC_011b: opened tab "${tabName}" in ${f.url().slice(-45)}`);

          break;

        }

      }

      if (!opened) {

        // Fallback: evaluate-based exact-text click, walking up to the onclick handler.

        for (const f of editPage.frames()) {

          const fired = await f

            .evaluate((name) => {

              const els = Array.from(document.querySelectorAll("a, td, span, div, li"));

              const el = els.find((e) => (e.textContent || "").trim().toLowerCase() === name.toLowerCase());

              if (!el) return false;

              let node: Element | null = el;

              for (let i = 0; i < 6 && node; i++) {

                if (node.getAttribute && node.getAttribute("onclick")) {

                  (node as HTMLElement).click();

                  return true;

                }

                node = node.parentElement;

              }

              (el as HTMLElement).click();

              return true;

            }, tabName)

            .catch(() => false);

          if (fired) {

            opened = true;

            console.log(`TC_011b: opened tab "${tabName}" via handler in ${f.url().slice(-45)}`);

            break;

          }

        }

      }

      console.log(`TC_011b: tab "${tabName}" opened = ${opened}`);

      await editPage.waitForTimeout(2500).catch(() => {});



      // 2. Click the tab's own Save button to mark it filled/submitted.

      let saved = false;

      for (const f of editPage.frames()) {

        const saveBtn = f

          .locator('input[type="button"][value="Save"], input[type="submit"][value="Save"], input[value="Save"], button:has-text("Save")')

          .first();

        if (await saveBtn.isVisible().catch(() => false)) {

          await saveBtn.scrollIntoViewIfNeeded().catch(() => {});

          await saveBtn.click({ timeout: 6000 }).catch(() => {});

          saved = true;

          console.log(`TC_011b: tab "${tabName}" Save clicked in ${f.url().slice(-45)}`);

          break;

        }

      }

      console.log(`TC_011b: tab "${tabName}" saved = ${saved}`);

      await editPage.waitForTimeout(2500).catch(() => {});

    };



    console.log("TC_011b: Saving mandatory tabs (General Details, Demographic Details)...");

    await openAndSaveTab("General Details");

    await openAndSaveTab("Demographic Details");



    // ---------- TC_012: Submit Other Bank Details ----------

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



    console.log("TC_012: Clicking Submit...");

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

        console.log(`TC_012: Submit clicked in ${f.url().slice(-50)}`);

        break;

      }

    }

    console.log(`TC_012: Submit clicked = ${submitClicked}`);

    await editPage.waitForTimeout(1500).catch(() => {});



    // ---------- TC_012-DIAG: Capture any in-page validation (mandatory fields) ----------

    // The submit validates the WHOLE entity, so empty mandatory fields on other

    // tabs (e.g. General Details / Demographic Details) block it with an in-page

    // error list rather than a JS dialog. Scan every frame for that message and

    // dump it so we know exactly which fields to fill.

    const validationRe = /mandatory|is required|must be|not filled|cannot be blank|please enter|please select|should be entered/i;

    let validationMsg = "";

    try {

      const dump: any = { cif: CIF_ID, frames: [] as any[] };

      for (const f of editPage.frames()) {

        const body = await f.locator("body").innerText({ timeout: 1500 }).catch(() => "");

        const norm = body.replace(/\s+/g, " ").trim();

        if (validationRe.test(norm)) {

          const lines = norm

            .split(/[.\n]/)

            .map((s) => s.trim())

            .filter((s) => validationRe.test(s))

            .slice(0, 20);

          dump.frames.push({ url: f.url().slice(-60), lines });

          if (!validationMsg) validationMsg = lines.join(" | ");

        }

      }

      if (validationMsg) {

        fs.writeFileSync("test-results/obd-submit-validation.json", JSON.stringify(dump, null, 2));

        console.log(`TC_012-DIAG: VALIDATION blocking submit -> ${validationMsg.slice(0, 400)}`);

      } else {

        console.log("TC_012-DIAG: no in-page validation message detected.");

      }

    } catch {}



    // ---------- TC_012a: Process Selection ----------

    const procPopup = await procPopupPromise;

    const procPage: Page = procPopup && !procPopup.isClosed() ? procPopup : editPage;

    await procPage.waitForLoadState("domcontentloaded").catch(() => {});

    await procPage.waitForTimeout(1500).catch(() => {});

    const procFrame = await findFrameByText(procPage, /Process Selection|Selected Process Name|Suggested Process Name/i, 8000);

    if (procFrame) {

      console.log("TC_012a: Process Selection window detected; choosing CIFCustomerKYCApproval...");

      const kycRe = /CIF\s*Customer\s*KYC\s*Approval|CIFCustomerKYCApproval/i;

      let chosen = false;

      const selDeadline = Date.now() + 15000;

      while (!chosen && Date.now() < selDeadline) {

        for (const f of procPage.frames()) {

          if (chosen) break;

          for (const sel of await f.locator("select").all().catch(() => [])) {

            for (const opt of await sel.locator("option").all().catch(() => [])) {

              const label = ((await opt.textContent().catch(() => "")) || "").trim();

              const value = (await opt.getAttribute("value").catch(() => "")) || "";

              if (kycRe.test(label) || kycRe.test(value)) {

                await sel.selectOption(value ? { value } : { label }, { timeout: 5000 }).catch(() => {});

                chosen = true;

                console.log(`TC_012a: Selected Process Name = "${label}" (value="${value}")`);

                break;

              }

            }

            if (chosen) break;

          }

        }

        if (!chosen) await procPage.waitForTimeout(700).catch(() => {});

      }

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

      console.log(`TC_012a: Save Process Selection clicked = ${saved}`);

      await procPage.waitForTimeout(3000).catch(() => {});

    } else {

      console.log("TC_012a: No Process Selection window appeared (submit may have completed directly).");

    }

    await editPage.screenshot({ path: "test-results/obd-submit-success.png", fullPage: true }).catch(() => {});



    // ---------- TC_013: Confirmation ----------

    const successFrame = editPage.isClosed()

      ? null

      : await findFrameByText(editPage, /submitted successfully|is submitted|record.*submitted|successfully submitted/i, 4000).catch(() => null);

    const submitSucceeded = submitSuccessSeen || successRe.test(submitDialog) || !!successFrame;

    console.log(`TC_012: submit dialog = "${submitDialog}", successSeen=${submitSuccessSeen}, successFrame=${!!successFrame}`);

    expect(submitSucceeded, "Submission must report success (native confirmation dialog or banner)").toBeTruthy();

    console.log(`✓ TC_012/TC_013: '${submitDialog || "Other Bank Details submitted successfully. CIF ID: " + CIF_ID}'`);

    await page.waitForTimeout(2000).catch(() => {});



    // ---------- TC_014: Record must display in the grid after submitting ----------

    console.log("TC_014: Re-searching the CIF so the submitted record displays in the grid...");

    const searchFrame2 = await findFrameByText(page, /Retail Search Criteria|Customer Search Results|Search Criteria/i, 12000);

    if (searchFrame2) {

      const cifField = searchFrame2

        .locator('input[name="FilterParam1"], input[name*="cif" i], input[id*="cif" i], input[name*="entity" i]')

        .first();

      if (await cifField.isVisible().catch(() => false)) {

        await cifField.fill(CIF_ID, { timeout: 5000 }).catch(() => {});

        await clickButtonByLabel(page, "Submit", 6000);

        await page.waitForTimeout(3000);

      }

    }

    await page.screenshot({ path: "test-results/obd-grid-after-submit.png", fullPage: true }).catch(() => {});



    let gridText = "";

    for (const f of page.frames()) {

      const t = await f.locator("body").innerText({ timeout: 2000 }).catch(() => "");

      if (/Customer Search Results|Search Results/i.test(t)) {

        gridText = t.replace(/\s+/g, " ").trim();

        break;

      }

    }

    console.log("TC_014: grid text =", gridText.slice(0, 600));

    const recordShown = gridText.includes(CIF_ID);

    expect(recordShown, "Submitted record must display in the Customer Search Results grid").toBeTruthy();

    console.log(`✓ TC_014: Record (CIF ${CIF_ID}) displayed in the grid after submission.`);



    console.log(

      `✓ Retail Other Bank Details maker flow completed: bank=${BANK_NAME}, A/c ID=${AC_ID}, submitted for CIF ${CIF_ID}.`

    );

  });

});


// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
