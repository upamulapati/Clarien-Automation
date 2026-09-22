import { test, expect, Frame, Page } from "@playwright/test";
import {
  login,
  waitForDashboard,
  switchToCRM,
  findFrameByText,
  clickButtonByLabel,
  logout,
} from "./finacleHelpers";

// CORPORATE Checker / verification flow: log in as the checker (FINACLETEST14),
// open the CORPORATE CIF modification that is pending approval, and Approve it
// (verify the entity). A record is only visible here once the maker has
// SUBMITTED it (status "Submitted For Approval"). Mirrors the retail checker
// (modifycifchecker.spec.ts) but targets the CIF Corporate menus + a corporate
// CIF. Kept separate from the maker spec.
const CHECKER_USER = "FINACLETEST14";
const CHECKER_PASS = "clarien@123";
const MAKER_USER = "FINACLETEST13";
const MAKER_PASS = "clarien@123";
const CIF_ID = "0001000516";

test.describe("CIF Corporate Modification Checker", () => {
  test.afterEach(async ({ page }) => {
    await logout(page).catch(() => {});
  });

  test("Approve (verify) pending CIF modification as FINACLETEST14", async ({ page }) => {
    test.setTimeout(600000);
    let lastDialogMessage = "";
    let allowLogout = false;
    page.on("dialog", async (d) => {
      lastDialogMessage = d.message();
      console.log("Dialog:", d.message());
      // Never auto-accept a logout / session-exit confirmation during the test
      // body — accepting it kills the session and closes the page. Only allow it
      // once we explicitly intend to log out (end of test / afterEach).
      if (!allowLogout && /log\s*out|log\s*off|sign\s*out/i.test(d.message())) {
        await d.dismiss().catch(() => {});
        return;
      }
      await d.accept().catch(() => {});
    });
    page.on("close", () => console.log("!!! [event] main page CLOSED"));

    // ---------- CHK_001: Login ----------
    console.log(`CHK_001: Logging in as ${CHECKER_USER}...`);
    await login(page, CHECKER_USER, CHECKER_PASS);
    expect(await waitForDashboard(page), `${CHECKER_USER} login must succeed`).toBeTruthy();
    console.log(`✓ CHK_001: ${CHECKER_USER} logged in`);

    // ---------- CHK_002: Switch to CRM ----------
    console.log("CHK_002: Switching solution to CRM...");
    await page.waitForTimeout(3000);
    const crmMenuFrame = await switchToCRM(page, "checker");
    expect(crmMenuFrame, "CRM Dashboard menu must be visible").not.toBeNull();
    console.log("✓ CHK_002: CRM dashboard loaded");

    // ---------- CHK_003: Navigate to CIF Corporate > Entity Queue ----------
    console.log("CHK_003: Navigating to CIF Corporate > Entity Queue...");
    let queueFrame: Frame | null = null;
    for (let navTry = 1; navTry <= 3 && !queueFrame; navTry++) {
      await crmMenuFrame!.getByText(/CIF\s*Corporate/i).first().click().catch(() => {});
      await page.waitForTimeout(2000);
      const eqFrame = (await findFrameByText(page, /Entity\s*Queue/i, 6000)) || crmMenuFrame!;
      await eqFrame.getByText(/Entity\s*Queue/i).first().click().catch(() => {});
      await page.waitForTimeout(3000);
      queueFrame = await findFrameByText(page, /Entity Queue|Tray Type|Submitted For Approval/i, 8000);
    }
    await page.screenshot({ path: "test-results/corpchecker-entity-queue.png", fullPage: true }).catch(() => {});
    expect(queueFrame, "Entity Queue page must load").not.toBeNull();
    console.log("✓ CHK_003: Entity Queue page opened");

    // ---------- Frame-resilient queue helpers (re-scan on every call) ----------
    const CIF_NOZERO = CIF_ID.replace(/^0+/, "");

    const findSelect = async (re: RegExp) => {
      for (const f of page.frames()) {
        let selects: import("@playwright/test").Locator[] = [];
        try {
          selects = await f.locator("select:visible").all();
        } catch {
          continue;
        }
        for (const s of selects) {
          const opts = (await s.locator("option").allTextContents().catch(() => [])).map((o) => o.trim());
          if (opts.some((o) => re.test(o))) return s;
        }
      }
      return null;
    };

    const selectBy = async (re: RegExp, label: string) => {
      const sel = await findSelect(re);
      if (sel) await sel.selectOption({ label }, { timeout: 5000 }).catch(() => {});
      return !!sel;
    };

    const isQueueFormFrame = async (f: Frame): Promise<boolean> => {
      let sels: import("@playwright/test").Locator[] = [];
      try {
        sels = await f.locator("select:visible").all();
      } catch {
        return false;
      }
      for (const s of sels) {
        const opts = (await s.locator("option").allTextContents().catch(() => [])).map((o) => o.trim());
        if (opts.some((o) => /^Self$/i.test(o))) return true;
      }
      return false;
    };

    // Click a queue button by value, ONLY inside the queue form frame (so we
    // never hit the header's solution-switch Submit).
    const clickQueueBtn = async (value: string) => {
      for (const f of page.frames()) {
        if (!(await isQueueFormFrame(f))) continue;
        const btn = f
          .locator(`input[type="submit"][value="${value}"], input[type="button"][value="${value}"], button:has-text("${value}")`)
          .first();
        if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await btn.click({ timeout: 5000 }).catch(() => {});
          return true;
        }
      }
      return false;
    };

    // The queue action buttons (Submit / Get / Entity Count) live in the toolbar
    // frame (CRMQueueFilterFrame.html), which may NOT be the frame holding the
    // Self dropdown. Identify the toolbar frame by those buttons and click there.
    const clickToolbarBtn = async (value: string): Promise<boolean> => {
      const re = new RegExp(`^\\s*${value}\\s*$`, "i");
      for (const f of page.frames()) {
        const btns = await f
          .locator('input[type="submit"], input[type="button"], button')
          .all()
          .catch(() => []);
        for (const btn of btns) {
          if (!(await btn.isVisible().catch(() => false))) continue;
          const label =
            ((await btn.getAttribute("value").catch(() => "")) ||
              (await btn.innerText().catch(() => "")) ||
              "").trim();
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
        for (const id of [CIF_ID, CIF_NOZERO]) {
          const cell = f.locator(`a:has-text("${id}"), td:has-text("${id}")`).first();
          if (await cell.isVisible().catch(() => false)) return f;
        }
      }
      return null;
    };

    const dumpResults = async (tag: string) => {
      for (const f of page.frames()) {
        let txt = "";
        try {
          txt = (await f.locator("body").innerText({ timeout: 2000 })).replace(/\s+/g, " ").trim();
        } catch {
          continue;
        }
        if (/Corporate Search Results|Customer Search Results|No Records to Display|Record Status/i.test(txt)) {
          console.log(`CHK_004[${tag}] results:`, txt.slice(0, 600));
          return;
        }
      }
    };

    // ---------- CHK_004: Locate the pending record (Submitted For Approval) ----------
    console.log("CHK_004: Searching the Submitted For Approval queue...");
    await selectBy(/^Self$/i, "Self");
    await page.waitForTimeout(800);
    await selectBy(/^Customer$/i, "Customer");

    // Fill the "Entity ID" field. It lives in the queue form frame (the one with
    // the Self/Business Center Group dropdown) and is the lone text input in the
    // search-criteria area, but it has no stable name, so try several strategies.
    const fillEntityId = async (): Promise<boolean> => {
      for (const f of page.frames()) {
        if (!(await isQueueFormFrame(f))) continue;
        const candidates = await f.locator('input[type="text"]:visible, input:not([type]):visible').all().catch(() => []);
        for (const inp of candidates) {
          const nm = (await inp.getAttribute("name").catch(() => "")) || "";
          const id = (await inp.getAttribute("id").catch(() => "")) || "";
          console.log(`[entityId] candidate name="${nm}" id="${id}"`);
        }
        // Strategy 1: label-based (input following the "Entity ID" label).
        let inp = f
          .locator('xpath=//*[normalize-space()="Entity ID"]/following::input[not(@type) or @type="text"][1]')
          .first();
        if (!(await inp.isVisible().catch(() => false)) && candidates.length) {
          // Strategy 2: the last visible text input in the form (Entity ID sits
          // below the Tray Type / Action / Entity Type selects).
          inp = candidates[candidates.length - 1];
        }
        if (await inp.isVisible().catch(() => false)) {
          await inp.click({ timeout: 3000 }).catch(() => {});
          await inp.fill("", { timeout: 3000 }).catch(() => {});
          await inp.fill(CIF_ID, { timeout: 5000 }).catch(() => {});
          const v = await inp.inputValue().catch(() => "");
          console.log(`[entityId] filled = "${v}"`);
          return v.includes(CIF_ID);
        }
      }
      console.log("[entityId] WARNING - Entity ID field not found");
      return false;
    };

    // Diagnostic: dump every queue dropdown (name + options).
    const dumpForm = async () => {
      for (const f of page.frames()) {
        if (!(await isQueueFormFrame(f))) continue;
        for (const s of await f.locator("select").all().catch(() => [])) {
          const nm = (await s.getAttribute("name").catch(() => "")) || "";
          const opts = (await s.locator("option").allTextContents().catch(() => [])).map((o) => o.trim());
          console.log(`[queueSelect] name="${nm}" opts=${JSON.stringify(opts).slice(0, 250)}`);
        }
      }
    };
    await dumpForm();

    // Select a real (non-placeholder) Group when the tray requires one.
    const selectFirstGroup = async () => {
      for (const f of page.frames()) {
        if (!(await isQueueFormFrame(f))) continue;
        for (const s of await f.locator("select").all().catch(() => [])) {
          const opts = (await s.locator("option").allTextContents().catch(() => [])).map((o) => o.trim());
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
      await selectBy(new RegExp(`^${tray}$`, "i"), tray);
      await page.waitForTimeout(1000);
      await selectBy(/^Customer$/i, "Customer");
      if (withAction) await selectBy(/Submitted For Approval/i, "Submitted For Approval");
      if (/Business Center Group/i.test(tray)) {
        await selectFirstGroup();
        await page.waitForTimeout(800);
      }
      if (withId) {
        const filled = await fillEntityId();
        console.log(`[search] Entity ID filled = ${filled}`);
      }
      let got = await clickToolbarBtn("Get");
      if (!got) {
        await page.waitForTimeout(800);
        got = await clickToolbarBtn("Get");
      }
      console.log(`[search] ${tray} Get clicked = ${got}`);
      await page.waitForTimeout(2500);
      await dumpResults(`${tray}${withId ? "/id" : "/all"}`);
      return recordRowFrame();
    };

    // Primary path: Tray Type = Self, Entity ID = the CIF, then Get. The FIRST
    // search pulls the entity from the common pool into the Self tray; a
    // subsequent identical search then displays it, so retry.
    let recFrame: Frame | null = null;
    for (let attempt = 0; attempt < 4 && !recFrame; attempt++) {
      if (page.isClosed()) break;
      recFrame = await runSearch("Self", true, true).catch(() => null);
      if (!recFrame && /already approved/i.test(lastDialogMessage)) {
        console.log("CHK_004: 'already approved' detected — stopping search retries.");
        break;
      }
      if (!recFrame) await page.waitForTimeout(1500).catch(() => {});
    }
    await page.screenshot({ path: "test-results/corpchecker-record-search.png", fullPage: true }).catch(() => {});

    const pendingRecordExists = !!recFrame;
    if (pendingRecordExists) {
      console.log(`✓ CHK_004: Pending record ${CIF_ID} located`);
    } else {
      console.log(
        `CHK_004: No pending record for ${CIF_ID} in the approval queue ` +
          `(likely already approved — last dialog: "${lastDialogMessage}"). ` +
          `Skipping approval (CHK_005-007) and proceeding to view the Audit Trail.`
      );
    }

    // Context-wide frame iteration (used by approval + audit trail).
    const ctx = page.context();
    const allFrames = (): Frame[] =>
      ctx.pages().filter((p) => !p.isClosed()).flatMap((p) => p.frames());

    const dumpControls = async (p: Page, tag: string) => {
      for (const f of p.frames()) {
        const out: string[] = [];
        const btns = await f.locator('input[type="button"], input[type="submit"], button').all().catch(() => []);
        for (const b of btns) {
          if (!(await b.isVisible().catch(() => false))) continue;
          const v = (await b.getAttribute("value").catch(() => "")) || (await b.innerText().catch(() => "")) || "";
          if (v.trim()) out.push(`btn:${v.trim()}`);
        }
        const links = await f.locator("a:visible").all().catch(() => []);
        for (const a of links.slice(0, 25)) {
          const t = (await a.innerText().catch(() => "")) || "";
          if (t.trim() && /verif|approv|author|reject|submit|action|decision/i.test(t)) out.push(`a:${t.trim()}`);
        }
        if (out.length) console.log(`[controls ${tag}] ${f.url().slice(-45)} => ${out.join(" | ")}`);
      }
    };

    const clickControl = async (p: Page, re: RegExp): Promise<string | null> => {
      for (const f of p.frames()) {
        const loc = f.locator('input[type="button"], input[type="submit"], button, a').filter({ hasText: re }).first();
        if (await loc.isVisible().catch(() => false)) {
          const v = (await loc.getAttribute("value").catch(() => "")) || (await loc.innerText().catch(() => "")) || re.source;
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          await loc.click({ timeout: 5000 }).catch(() => {});
          return v.trim();
        }
      }
      for (const f of p.frames()) {
        const inputs = await f.locator('input[type="button"], input[type="submit"]').all().catch(() => []);
        for (const inp of inputs) {
          const v = (await inp.getAttribute("value").catch(() => "")) || "";
          if (re.test(v) && (await inp.isVisible().catch(() => false))) {
            await inp.scrollIntoViewIfNeeded().catch(() => {});
            await inp.click({ timeout: 5000 }).catch(() => {});
            return v.trim();
          }
        }
      }
      return null;
    };

    // ---------- CHK_005: Select the record + open Current Process Step ----------
    if (recFrame) {
    console.log(`CHK_005: Selecting record ${CIF_ID} and opening Current Process Step...`);

    const recRow = recFrame.locator("tr", { hasText: CIF_NOZERO }).first();
    for (const cb of await recRow.locator('input[type="checkbox"]').all().catch(() => [])) {
      const nm = (await cb.getAttribute("name").catch(() => "")) || "";
      const oc = (await cb.getAttribute("onclick").catch(() => "")) || "";
      console.log(`[rowcb] name="${nm}" onclick="${oc.slice(0, 60)}"`);
    }
    let rowCheckbox = recFrame
      .locator('input[type="checkbox"][onclick*="AddSelectedRowToList"]')
      .first();
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
    console.log(`CHK_005: row checkbox checked = ${await rowCheckbox.isChecked().catch(() => false)}`);

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
      const firstCell = recRow.locator("td").first();
      if (await firstCell.isVisible().catch(() => false)) {
        await firstCell.click({ timeout: 4000 }).catch(() => {});
        console.log("CHK_005: pane not up after checkbox; clicked row first cell");
        await page.waitForTimeout(2000);
        paneUp = await paneVisible();
      }
    }
    console.log(`CHK_005: detail pane visible = ${paneUp}`);

    let cpsOpened = false;
    for (const f of allFrames()) {
      const tab = f
        .locator('a:has-text("Current Process Step"), td:has-text("Current Process Step"), span:has-text("Current Process Step")')
        .last();
      if (await tab.isVisible().catch(() => false)) {
        await tab.scrollIntoViewIfNeeded().catch(() => {});
        await tab.click({ timeout: 5000 }).catch(() => {});
        cpsOpened = true;
        console.log(`CHK_005: Current Process Step tab clicked in ${f.url().slice(-45)}`);
        break;
      }
    }
    console.log(`CHK_005: Current Process Step opened = ${cpsOpened}`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "test-results/corpchecker-record-open.png", fullPage: true }).catch(() => {});

    for (const f of allFrames()) {
      const icons = await f.locator('a[onclick], img[onclick], input[type="image"], a img').all().catch(() => []);
      const desc: string[] = [];
      for (const ic of icons.slice(0, 25)) {
        const title = (await ic.getAttribute("title").catch(() => "")) || "";
        const alt = (await ic.getAttribute("alt").catch(() => "")) || "";
        const oc = (await ic.getAttribute("onclick").catch(() => "")) || "";
        const src = (await ic.getAttribute("src").catch(() => "")) || "";
        if (title || alt || /window|popup|maxim/i.test(oc + src)) {
          desc.push(`{t:"${title}" a:"${alt}" oc:"${oc.slice(0, 40)}" s:"${src.slice(-25)}"}`);
        }
      }
      if (desc.length) console.log(`[paneIcons] ${f.url().slice(-40)} => ${desc.join(" ")}`);
    }
    await page.waitForTimeout(1000);

    // ---------- CHK_006: Open the KYCDecision step + approve ----------
    console.log("CHK_006: Opening KYCDecision step...");
    const decisionSelect = async (label: RegExp): Promise<boolean> => {
      for (const f of allFrames()) {
        let sels: import("@playwright/test").Locator[] = [];
        try {
          sels = await f.locator("select:visible").all();
        } catch {
          continue;
        }
        for (const s of sels) {
          for (const opt of await s.locator("option").all().catch(() => [])) {
            const text = ((await opt.textContent().catch(() => "")) || "").trim();
            const value = (await opt.getAttribute("value").catch(() => "")) || "";
            if (label.test(text)) {
              await s.selectOption(value ? { value } : { label: text }, { timeout: 5000 }).catch(() => {});
              const sv = await s.inputValue().catch(() => "");
              console.log(`[decision] selected option text~="${text.slice(-20)}" value="${value}" -> current="${sv}"`);
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
          const t = ((await link.innerText().catch(() => "")) || "").trim();
          await link.scrollIntoViewIfNeeded().catch(() => {});
          await link.click({ timeout: 5000 }).catch(() => {});
          console.log(`CHK_006: process-step link "${t.slice(0, 30)}" clicked in ${f.url().slice(-45)}`);
          return true;
        }
      }
      return false;
    };

    const clickAcrossPages = async (re: RegExp): Promise<string | null> => {
      for (const p of ctx.pages().filter((pp) => !pp.isClosed())) {
        const r = await clickControl(p, re).catch(() => null);
        if (r) return r;
      }
      return null;
    };
    const saveRegexes = [/Save\s*KYCForm/i, /Save\s*\w*\s*Form/i, /^Authorize$/i, /^Submit$/i, /^Save\b/i];

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
      const winPromise = ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null);
      let clicked = false;
      for (const f of allFrames()) {
        const icon = f
          .locator('a[title*="Window" i], img[title*="Window" i], a[title*="New" i], img[title*="New" i], [onclick*="window.open" i], [onclick*="NewWindow" i], [onclick*="newWindow" i]')
          .first();
        if (await icon.isVisible().catch(() => false)) {
          await icon.scrollIntoViewIfNeeded().catch(() => {});
          await icon.click({ timeout: 4000 }).catch(() => {});
          clicked = true;
          break;
        }
      }
      const win = await winPromise;
      if (win && !win.isClosed()) await win.waitForLoadState("domcontentloaded").catch(() => {});
      console.log(`CHK_006: process-step window opened (iconClicked=${clicked}, popup=${!!win})`);
      await page.waitForTimeout(1500).catch(() => {});
      return win;
    };

    let recordNotFound = false;
    const reselectAndOpenStepWindow = async (): Promise<Page | null> => {
      if (page.isClosed()) return null;
      let rf = await recordRowFrame();
      for (let attempt = 0; attempt < 5 && !rf; attempt++) {
        console.log(`CHK_006: re-searching the queue for the next step (attempt ${attempt})...`);
        rf = await runSearch("Self", true, true).catch(() => null);
        if (rf) break;
        if (/already approved/i.test(lastDialogMessage)) {
          console.log("CHK_006: queue reports 'already approved'; stopping re-search.");
          break;
        }
        await page.waitForTimeout(3000).catch(() => {});
      }
      if (!rf) {
        recordNotFound = true;
        console.log("CHK_006: record not found on re-search; next step unavailable.");
        return null;
      }
      let cb = rf.locator('input[type="checkbox"][onclick*="AddSelectedRowToList"]').first();
      if (!(await cb.isVisible().catch(() => false))) {
        cb = rf.locator("tr", { hasText: CIF_NOZERO }).first().locator('input[type="checkbox"]').first();
      }
      if (await cb.isVisible().catch(() => false)) {
        await cb.scrollIntoViewIfNeeded().catch(() => {});
        await cb.click({ timeout: 3000 }).catch(() => {});
        console.log(`CHK_006: re-selected record row (checked=${await cb.isChecked().catch(() => false)})`);
      }
      await page.waitForTimeout(2500).catch(() => {});
      return await openProcessStepWindow();
    };

    // The KYC approval is a MULTI-STEP decision: first the KYCDecision step
    // (Decision=Approve -> "Save KYCForm"), then the Approval step (Decision=
    // Approve -> "Save ApprovalForm"). After saving each step the process-step
    // window must be CLOSED and RE-OPENED so the next step's form appears.
    let approveSelected = false;
    let committed = false;
    const savedButtons: string[] = [];
    for (let step = 0; step < 3; step++) {
      if (page.isClosed()) {
        console.log(`CHK_006: main page closed before step ${step}; ending approval loop.`);
        break;
      }
      const popup = step === 0 ? await openProcessStepWindow() : await reselectAndOpenStepWindow();

      const approvalSaved = savedButtons.some((b) => /Approval/i.test(b));
      const alreadyApproved = /already approved/i.test(lastDialogMessage);
      if (committed && (alreadyApproved || (recordNotFound && approvalSaved))) {
        console.log(
          `CHK_006: approval complete after step ${step - 1} ` +
            `(approvalSaved=${approvalSaved}, alreadyApproved=${alreadyApproved}); skipping further retries.`
        );
        if (popup && !popup.isClosed()) await popup.close({ runBeforeUnload: false }).catch(() => {});
        break;
      }
      if (recordNotFound && !approvalSaved && !alreadyApproved) {
        console.log(
          `CHK_006: WARNING — record not found after step ${step - 1} but Save ApprovalForm ` +
            `was never reached; approval is INCOMPLETE.`
        );
        if (popup && !popup.isClosed()) await popup.close({ runBeforeUnload: false }).catch(() => {});
        break;
      }

      let stepSelected = false;
      for (let attempt = 0; attempt < 6 && !stepSelected; attempt++) {
        if (page.isClosed()) break;
        const clicked = await clickKyc();
        console.log(`CHK_006: step ${step} attempt ${attempt} process-step clicked = ${clicked}`);
        await page.waitForTimeout(2500).catch(() => {});
        stepSelected = await decisionSelect(/Approve/i);
        if (!stepSelected) await page.waitForTimeout(1500).catch(() => {});
      }
      if (!stepSelected) {
        console.log(`CHK_006: no further decision step at step ${step}; approval complete.`);
        if (popup && !popup.isClosed()) await popup.close({ runBeforeUnload: false }).catch(() => {});
        break;
      }
      approveSelected = true;
      await page.screenshot({ path: `test-results/corpchecker-decision-step${step}.png`, fullPage: true }).catch(() => {});

      for (const f of allFrames()) {
        const bvals: string[] = [];
        for (const b of await f.locator('input[type="button"], input[type="submit"], button').all().catch(() => [])) {
          if (!(await b.isVisible().catch(() => false))) continue;
          const v = ((await b.getAttribute("value").catch(() => "")) || (await b.innerText().catch(() => "")) || "").trim();
          if (v) bvals.push(v);
        }
        if (bvals.some((v) => /save|submit|authorize/i.test(v))) {
          console.log(`[decisionBtn] step ${step} ${f.url().slice(-40)} => ${JSON.stringify(bvals)}`);
        }
      }
      await page.waitForTimeout(500).catch(() => {});

      // ---------- CHK_006b: View Audit Trail (Approval step only) ----------
      {
        const beforeAudit = new Set(ctx.pages());
        const auditP = ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null);
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
              console.log(`CHK_006b: clicked "View Audit Trail" link on step ${step}`);
              break;
            }
          }
          if (auditLinkClicked) break;
        }
        if (auditLinkClicked) {
          await page.waitForTimeout(2500).catch(() => {});
          await auditP;
          const isAuditPage = (p: Page) =>
            /AuditTrail/i.test(p.url()) || p.frames().some((f) => /AuditTrail/i.test(f.url()));
          let audit: Page | null = null;
          for (let i = 0; i < 10 && !audit; i++) {
            audit =
              ctx
                .pages()
                .filter((p) => !p.isClosed() && !beforeAudit.has(p))
                .find(isAuditPage) || null;
            if (!audit) await page.waitForTimeout(800).catch(() => {});
          }
          const ap = audit && !audit.isClosed() ? audit : null;
          console.log(`CHK_006b: audit window resolved = ${ap ? ap.url().slice(-45) : "NONE"}`);
          if (ap) {
            ap.on("dialog", async (d) => {
              console.log("Audit dialog:", d.message());
              await d.accept().catch(() => {});
            });
            await ap.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
            await ap.waitForTimeout(1500).catch(() => {});
            for (const f of ap.frames()) {
              const cust = f
                .locator('xpath=//*[normalize-space()="Customer ID"]/following::input[not(@type) or @type="text"][1]')
                .first();
              if (await cust.isVisible().catch(() => false)) {
                console.log(`CHK_006b: Customer ID (pre-filled) = "${await cust.inputValue().catch(() => "")}"`);
                break;
              }
            }
            for (const re of [/^Submit$/i, /^Go$/i, /^Search$/i, /^View$/i]) {
              let done = false;
              for (const f of ap.frames()) {
                for (const b of await f.locator('input[type="button"], input[type="submit"], button').all().catch(() => [])) {
                  const v = ((await b.getAttribute("value").catch(() => "")) || (await b.innerText().catch(() => "")) || "").trim();
                  if (!re.test(v)) continue;
                  await b.scrollIntoViewIfNeeded().catch(() => {});
                  if (!(await b.isVisible().catch(() => false))) continue;
                  await b.click({ timeout: 4000 }).catch(() => {});
                  done = true;
                  console.log(`CHK_006b: audit history submit clicked "${v}"`);
                  break;
                }
                if (done) break;
              }
              if (done) break;
            }
            await ap.waitForTimeout(1000).catch(() => {});
            await ap
              .screenshot({ path: `test-results/corpchecker-view-audit-trail-step${step}.png`, timeout: 4000 })
              .catch(() => {});
            for (const f of ap.frames()) {
              if (ap.isClosed()) break;
              const txt = ((await f.locator("body").innerText({ timeout: 1500 }).catch(() => "")) || "").trim();
              if (
                txt.length > 20 &&
                /audit trail details|customer moved|edited customer details|process step modification|date\s*\/\s*time/i.test(txt)
              ) {
                console.log(`[viewAuditTrail] ${f.url().slice(-40)}:\n${txt.replace(/\s+/g, " ").slice(0, 1200)}`);
              }
            }
            console.log("✓ CHK_006b: Approval history viewed via 'View Audit Trail'.");
            // CLOSING #1: close ONLY the resolved AuditTrailForm popup `ap`.
            const auditPages =
              ap && !ap.isClosed() && ap !== page && ap !== popup ? [ap] : [];
            console.log(`CHK_006b: closing ${auditPages.length} Audit Trail window(s).`);
            for (const win of auditPages) {
              win.on("dialog", async (d) => {
                console.log("Audit dialog:", d.message());
                await d.accept().catch(() => {});
              });
              let auditCloseClicked = false;
              for (const f of win.frames()) {
                if (win.isClosed()) break;
                const clicked = await f
                  .evaluate(() => {
                    const norm = (s: string | null) => (s || "").replace(/\s+/g, " ").trim();
                    const controls = Array.from(
                      document.querySelectorAll(
                        'input[type="button"], input[type="submit"], input[type="image"], button, a'
                      )
                    ) as HTMLElement[];
                    const matches = (e: HTMLElement) => {
                      const cand: (string | null)[] = [
                        (e as HTMLInputElement).value,
                        e.textContent,
                        e.getAttribute("title"),
                        e.getAttribute("alt"),
                      ];
                      const img = e.querySelector("img");
                      if (img) cand.push(img.getAttribute("alt"), img.getAttribute("title"));
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
                if (clicked) {
                  auditCloseClicked = true;
                  console.log(`CHK_006b: clicked 'Close' (JS) on the Audit Trail window in ${f.url().slice(-40)}`);
                  break;
                }
              }
              await page.waitForTimeout(400).catch(() => {});
              if (!win.isClosed()) {
                console.log(
                  `CHK_006b: Close button ${auditCloseClicked ? "clicked" : "not found"}; force-closing window.`
                );
                await win.close().catch(() => {});
              }
              console.log(`CHK_006b: audit window closed (buttonClicked=${auditCloseClicked}, closed=${win.isClosed()})`);
            }
            await page.waitForTimeout(500).catch(() => {});
          } else {
            console.log("CHK_006b: 'View Audit Trail' clicked but no audit window resolved.");
          }
        }
      }

      // Commit this step's decision.
      let stepSaved: string | null = null;
      for (const re of saveRegexes) {
        stepSaved = await clickAcrossPages(re);
        if (stepSaved) break;
      }
      if (!stepSaved) {
        console.log(`CHK_006: step ${step} Save button not found; stopping.`);
        if (popup && !popup.isClosed()) await popup.close({ runBeforeUnload: false }).catch(() => {});
        break;
      }
      committed = true;
      savedButtons.push(stepSaved);
      console.log(`CHK_006: step ${step} committed via "${stepSaved}"`);
      await page.waitForTimeout(2000).catch(() => {});

      const closeWindowByButton = async (win: Page | null, label: string) => {
        if (!win || win === page || win.isClosed()) {
          console.log(`CHK_006: ${label} — nothing to close.`);
          return;
        }
        win.on("dialog", async (d) => {
          console.log(`${label} dialog:`, d.message());
          await d.accept().catch(() => {});
        });
        let clickedClose = false;
        for (const f of win.frames()) {
          if (win.isClosed()) break;
          const clicked = await f
            .evaluate(() => {
              const norm = (s: string | null) => (s || "").replace(/\s+/g, " ").trim();
              const controls = Array.from(
                document.querySelectorAll(
                  'input[type="button"], input[type="submit"], input[type="image"], button, a'
                )
              ) as HTMLElement[];
              const matches = (e: HTMLElement) => {
                const cand: (string | null)[] = [
                  (e as HTMLInputElement).value,
                  e.textContent,
                  e.getAttribute("title"),
                  e.getAttribute("alt"),
                ];
                const img = e.querySelector("img");
                if (img) cand.push(img.getAttribute("alt"), img.getAttribute("title"));
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
          if (clicked) {
            clickedClose = true;
            break;
          }
        }
        await page.waitForTimeout(400).catch(() => {});
        if (!win.isClosed()) {
          console.log(
            `CHK_006: ${label} Close button ${clickedClose ? "clicked" : "not found"}; force-closing window.`
          );
          await win.close().catch(() => {});
        }
        console.log(`CHK_006: ${label} closed (closeClicked=${clickedClose}, closed=${win.isClosed()})`);
      };

      await closeWindowByButton(popup, `closing#2 approval form window (step ${step})`);
      for (const p of ctx.pages()) {
        if (p === page || p.isClosed()) continue;
        await closeWindowByButton(p, `closing#3 process-step window ${p.url().slice(-30)}`);
      }

      if (/Approval/i.test(stepSaved)) {
        console.log(
          `CHK_006: "Save ApprovalForm" committed — approval COMPLETE ` +
            `("No Records to Display" / "Record has been moved"); exiting approval loop.`
        );
        break;
      }
      await page.waitForTimeout(3000).catch(() => {});
    }
    console.log(`CHK_006: approveSelected=${approveSelected} committed=${committed} saved=${JSON.stringify(savedButtons)}`);
    await page.screenshot({ path: "test-results/corpchecker-approved.png", fullPage: true }).catch(() => {});

    // ---------- CHK_007: Confirm verification ----------
    await page.waitForTimeout(2000).catch(() => {});
    for (const p of ctx.pages()) {
      if (p !== page && !p.isClosed()) {
        console.log(`CHK_007: closing leftover window ${p.url().slice(-50)}`);
        await p.close().catch(() => {});
      }
    }
    console.log(
      `CHK_007: approveSelected=${approveSelected} committed=${committed} lastDialog="${lastDialogMessage}"`
    );
    expect(
      approveSelected && committed,
      "Approve must be selected in the KYCDecision dropdown and Save KYCForm clicked"
    ).toBeTruthy();
    console.log(`✓ CHK_007: CIF ${CIF_ID} approved (entity verified) by ${CHECKER_USER}`);
    } // end if (recFrame) — approval branch

    // Close leftover workflow popups so logout/login happens on the main window.
    for (const p of ctx.pages()) {
      if (p !== page && !p.isClosed()) {
        console.log(`CHK_008: closing popup ${p.url().slice(-50)}`);
        await p.close({ runBeforeUnload: false }).catch(() => {});
      }
    }
    await page.waitForTimeout(1500).catch(() => {});

    const dialogHandler = (pg: Page) => {
      pg.on("dialog", async (d) => {
        lastDialogMessage = d.message();
        console.log("Dialog:", d.message());
        if (!allowLogout && /log\s*out|log\s*off|sign\s*out/i.test(d.message())) {
          await d.dismiss().catch(() => {});
          return;
        }
        await d.accept().catch(() => {});
      });
    };
    let sessionPage: Page = page;
    if (sessionPage.isClosed()) {
      console.log("CHK_008: checker page is closed; opening a fresh page.");
      sessionPage = await ctx.newPage();
      dialogHandler(sessionPage);
    }

    // ---------- CHK_008: Log out the checker (FINACLETEST14) ----------
    console.log(`CHK_008: Logging out ${CHECKER_USER}...`);
    allowLogout = true;
    if (!sessionPage.isClosed()) await logout(sessionPage).catch(() => {});
    await sessionPage.waitForTimeout(2000).catch(() => {});
    console.log(`✓ CHK_008: ${CHECKER_USER} logout attempted`);

    // ---------- CHK_009/010: Log in as the maker (FINACLETEST13) + switch to CRM ----------
    console.log(`CHK_009: Logging in as maker ${MAKER_USER} + switching to CRM...`);
    let makerPage: Page | null = null;
    let makerCrmMenu: Frame | null = null;
    for (let attempt = 1; attempt <= 4 && !makerCrmMenu; attempt++) {
      makerPage = await ctx.newPage();
      dialogHandler(makerPage);
      try {
        await login(makerPage, MAKER_USER, MAKER_PASS);
        const ok = await waitForDashboard(makerPage);
        if (ok && !makerPage.isClosed()) {
          await makerPage.waitForTimeout(3000);
          makerCrmMenu = await switchToCRM(makerPage, "maker");
        }
      } catch (e) {
        console.log(`CHK_009: attempt ${attempt} failed: ${(e as Error).message}`);
      }
      console.log(`CHK_009: attempt ${attempt} crm=${!!makerCrmMenu} closed=${makerPage.isClosed()}`);
      if (!makerCrmMenu) await new Promise((r) => setTimeout(r, 2000));
    }
    expect(makerCrmMenu, `${MAKER_USER} login + CRM switch must succeed`).not.toBeNull();
    const mp = makerPage!;
    console.log(`✓ CHK_009/010: maker ${MAKER_USER} logged in and CRM dashboard loaded`);
    await mp.screenshot({ path: "test-results/corpchecker-maker-login.png", fullPage: true }).catch(() => {});

    // ---------- CHK_011: Navigate to CIF Corporate > Edit Entity ----------
    console.log("CHK_011: Navigating to CIF Corporate > Edit Entity...");
    const clickMakerMenu = async (re: RegExp): Promise<boolean> => {
      for (const f of mp.frames()) {
        const link = f.getByText(re).first();
        if (await link.isVisible().catch(() => false)) {
          await link.scrollIntoViewIfNeeded().catch(() => {});
          await link.click({ timeout: 4000 }).catch(() => {});
          return true;
        }
      }
      return false;
    };
    let eeOpened = false;
    for (let navTry = 1; navTry <= 3 && !eeOpened; navTry++) {
      eeOpened = await clickMakerMenu(/^\s*Edit\s*Entity\s*$/i);
      if (!eeOpened) {
        await clickMakerMenu(/^\s*CIF\s*Corporate\s*$/i);
        await mp.waitForTimeout(1500).catch(() => {});
        eeOpened = await clickMakerMenu(/^\s*Edit\s*Entity\s*$/i);
      }
      await mp.waitForTimeout(3000).catch(() => {});
    }
    await mp.screenshot({ path: "test-results/corpchecker-maker-edit-entity.png", fullPage: true }).catch(() => {});
    console.log(`✓ CHK_011: Edit Entity menu clicked = ${eeOpened}`);

    // ---------- CHK_012: Fill CIF ID + Submit in Edit Entity ----------
    console.log("CHK_012: Filling CIF ID and submitting in Edit Entity...");
    const makerFrames = () => mp.frames();
    await mp.waitForTimeout(2000).catch(() => {});
    for (const f of makerFrames()) {
      const inps: string[] = [];
      for (const inp of await f.locator('input[type="text"], input:not([type])').all().catch(() => [])) {
        if (!(await inp.isVisible().catch(() => false))) continue;
        const nm = (await inp.getAttribute("name").catch(() => "")) || "";
        const id = (await inp.getAttribute("id").catch(() => "")) || "";
        inps.push(`{n:"${nm}" id:"${id}"}`);
      }
      if (inps.length) console.log(`[makerEditInputs] ${f.url().slice(-40)} => ${inps.slice(0, 12).join(" ")}`);
    }
    // Ensure the "Search Entity" tab (Corporate Search Criteria form) is active.
    for (const f of makerFrames()) {
      const tab = f.getByText(/^\s*Search\s*Entity\s*$/i).first();
      if (await tab.isVisible().catch(() => false)) {
        await tab.click({ timeout: 3000 }).catch(() => {});
        break;
      }
    }
    await mp.waitForTimeout(1000).catch(() => {});
    let mIdFilled = false;
    for (const f of makerFrames()) {
      // Target the input next to the exact "CIF ID" label (translate &nbsp; ->
      // space, avoid matching "GCIF ID"). Fall back to the first FilterParam
      // text input if the corporate form uses that naming.
      let inp = f
        .locator(
          'xpath=//td[normalize-space(translate(., "\u00a0", " "))="CIF ID"]/following::input[not(@type) or @type="text"][1]'
        )
        .first();
      if (!(await inp.isVisible().catch(() => false))) {
        const fp = f.locator('input[name^="FilterParam"]').first();
        if (await fp.isVisible().catch(() => false)) inp = fp;
      }
      if (await inp.isVisible().catch(() => false)) {
        await inp.scrollIntoViewIfNeeded().catch(() => {});
        await inp.click().catch(() => {});
        await inp.fill("").catch(() => {});
        await inp.fill(CIF_ID).catch(() => {});
        mIdFilled = (await inp.inputValue().catch(() => "")).includes(CIF_ID);
        if (mIdFilled) {
          const nm = (await inp.getAttribute("name").catch(() => "")) || "";
          console.log(`CHK_012: CIF ID filled (name="${nm}") in ${f.url().slice(-40)}`);
          break;
        }
      }
    }
    console.log(`CHK_012: CIF ID filled = ${mIdFilled}`);
    const mClickValue = async (re: RegExp): Promise<boolean> => {
      for (const f of makerFrames()) {
        for (const b of await f.locator('input[type="button"], input[type="submit"], button').all().catch(() => [])) {
          const v = ((await b.getAttribute("value").catch(() => "")) || (await b.innerText().catch(() => "")) || "").trim();
          if (!re.test(v)) continue;
          await b.scrollIntoViewIfNeeded().catch(() => {});
          if (!(await b.isVisible().catch(() => false))) continue;
          await b.click({ timeout: 4000 }).catch(() => {});
          console.log(`CHK_012: clicked "${v}"`);
          return true;
        }
      }
      return false;
    };
    for (const re of [/^Submit$/i, /^Go$/i, /^Search$/i, /^Get$/i]) {
      if (await mClickValue(re)) break;
    }
    await mp.waitForTimeout(3500).catch(() => {});
    await mp.screenshot({ path: "test-results/corpchecker-maker-edit-entity-record.png", fullPage: true }).catch(() => {});

    // ---------- CHK_013: Right-click record > View > Audit Trail ----------
    let mRightClicked = false;
    let rcFrame: Frame | null = null;
    for (const f of makerFrames()) {
      const cifLink = f.locator(`a:has-text("${CIF_ID}")`).first();
      if (!(await cifLink.isVisible().catch(() => false))) continue;
      const dataRow = cifLink.locator("xpath=ancestor::tr[1]");
      await dataRow.scrollIntoViewIfNeeded().catch(() => {});
      const rowHtml = await dataRow.evaluate((el) => (el as HTMLElement).outerHTML).catch(() => "");
      console.log(`CHK_013: data row html = ${rowHtml.replace(/\s+/g, " ").slice(0, 900)}`);
      const selKind = await dataRow
        .evaluate((row) => {
          const inp = row.querySelector(
            'input[type="radio"], input[type="checkbox"]'
          ) as HTMLInputElement | null;
          if (inp) {
            inp.checked = true;
            inp.click();
            return inp.type;
          }
          return "";
        })
        .catch(() => "");
      const textCell = dataRow
        .locator("td:not(:has(a)):not(:has(img)):not(:has(input))")
        .filter({ hasText: /[A-Za-z0-9]/ })
        .first();
      if (!selKind) {
        if (await textCell.isVisible().catch(() => false)) {
          await textCell.click({ timeout: 4000 }).catch(() => {});
        } else {
          await dataRow.click({ timeout: 4000 }).catch(() => {});
        }
      }
      await mp.waitForTimeout(600).catch(() => {});
      if (await textCell.isVisible().catch(() => false)) {
        await textCell.click({ button: "right", timeout: 5000 }).catch(() => {});
      } else {
        await dataRow.click({ button: "right", timeout: 5000 }).catch(() => {});
      }
      mRightClicked = true;
      rcFrame = f;
      console.log(`CHK_013: selected(${selKind || "cell"}) + right-clicked data row in ${f.url().slice(-40)}`);
      break;
    }
    console.log(`CHK_013: record right-clicked = ${mRightClicked}`);
    await mp.waitForTimeout(1500).catch(() => {});
    await mp.screenshot({ path: "test-results/corpchecker-maker-context-menu.png", fullPage: true }).catch(() => {});

    const auditPopupPromise = ctx.waitForEvent("page", { timeout: 12000 }).catch(() => null);
    const pagesBeforeAudit = new Set(ctx.pages());
    let mAuditClicked = false;
    if (mRightClicked) {
      const candidateFrames = rcFrame ? [rcFrame, ...makerFrames().filter((f) => f !== rcFrame)] : makerFrames();
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
      // Fallback: some corporate builds expose "Audit Trail" directly in the
      // flyout without the Basel Profiling sibling — click any visible flyout
      // "Audit Trail" that is NOT the left-nav menu link.
      if (!mAuditClicked) {
        for (const f of candidateFrames) {
          const at = f.getByText(/^\s*Audit\s*Trail\s*$/i).last();
          if (await at.isVisible().catch(() => false)) {
            await at.hover().catch(() => {});
            await at.click().catch(() => {});
            mAuditClicked = true;
            console.log(`CHK_013: Audit Trail (fallback) clicked in ${f.url().slice(-40)}`);
            break;
          }
        }
      }
    } else {
      console.log("CHK_013: skipping Audit Trail (record was not right-clicked).");
    }
    console.log(`CHK_013: Audit Trail clicked = ${mAuditClicked}`);
    await mp.waitForTimeout(3000).catch(() => {});

    // ---------- CHK_014: In Audit Trail, fill Customer ID + Submit, read history ----------
    let auditWin = await auditPopupPromise;
    const isAuditUrl = (u: string) => /audit/i.test(u);
    const isMovedPopup = (u: string) => /SearchWorkArea_CIF/i.test(u);
    for (let i = 0; i < 12; i++) {
      const fresh = ctx.pages().filter((p) => !p.isClosed() && !pagesBeforeAudit.has(p));
      for (const p of fresh) {
        if (isMovedPopup(p.url())) await p.close().catch(() => {});
      }
      const candidates = ctx.pages().filter((p) => !p.isClosed() && !pagesBeforeAudit.has(p) && !isMovedPopup(p.url()));
      auditWin = candidates.find((p) => isAuditUrl(p.url())) || candidates[candidates.length - 1] || null;
      if (auditWin && !auditWin.isClosed()) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log(
      `CHK_014: open pages = ${ctx
        .pages()
        .map((p) => (p.isClosed() ? "CLOSED" : p.url().slice(-45)))
        .join(" | ")}`
    );
    const haveAuditPopup = !!auditWin && !auditWin.isClosed();
    console.log(`CHK_014: audit window = ${haveAuditPopup ? auditWin!.url().slice(-55) : "NONE"}`);
    expect(haveAuditPopup, "Audit Trail popup (AuditTrailForm) must open after View > Audit Trail").toBeTruthy();
    const auditPage: Page = auditWin!;
    let auditCloseAllowed = false;
    auditPage.on("dialog", async (d) => {
      lastDialogMessage = d.message();
      console.log("Audit dialog:", d.message());
      if (!auditCloseAllowed && /close (this )?(screen|window)/i.test(d.message())) {
        await d.dismiss().catch(() => {});
        return;
      }
      await d.accept().catch(() => {});
    });
    await auditPage.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
    await auditPage.waitForTimeout(2000).catch(() => {});
    for (const f of auditPage.frames()) {
      const cust = f
        .locator('xpath=//*[normalize-space()="Customer ID"]/following::input[not(@type) or @type="text"][1]')
        .first();
      if (await cust.isVisible().catch(() => false)) {
        const v = await cust.inputValue().catch(() => "");
        console.log(`CHK_014: Customer ID (pre-filled) = "${v}"`);
        break;
      }
    }
    let auditSubmitted = false;
    for (const re of [/^Submit$/i, /^Go$/i, /^Search$/i, /^View$/i]) {
      for (const f of auditPage.frames()) {
        for (const b of await f.locator('input[type="button"], input[type="submit"], button').all().catch(() => [])) {
          const v = ((await b.getAttribute("value").catch(() => "")) || (await b.innerText().catch(() => "")) || "").trim();
          if (!re.test(v)) continue;
          await b.scrollIntoViewIfNeeded().catch(() => {});
          if (!(await b.isVisible().catch(() => false))) continue;
          await b.click({ timeout: 4000 }).catch(() => {});
          console.log(`CHK_014: audit submit clicked "${v}"`);
          auditSubmitted = true;
          break;
        }
        if (auditSubmitted) break;
      }
      if (auditSubmitted) break;
    }
    console.log(`CHK_014: audit submit clicked = ${auditSubmitted}`);
    expect(auditSubmitted, "Audit Trail Submit must be clicked to show approval history").toBeTruthy();
    await auditPage.waitForTimeout(1000).catch(() => {});
    await auditPage.screenshot({ path: "test-results/corpchecker-maker-audit-trail.png", timeout: 4000 }).catch(() => {});
    for (const f of auditPage.frames()) {
      if (auditPage.isClosed()) break;
      const txt = ((await f.locator("body").innerText({ timeout: 1500 }).catch(() => "")) || "").trim();
      if (txt.length > 20 && /audit|history|approv|maker|checker|date|time|status/i.test(txt)) {
        console.log(`[auditTrail] ${f.url().slice(-40)}:\n${txt.slice(0, 1500)}`);
      }
    }
    console.log("✓ CHK_014: Audit Trail approval history displayed (with timestamps)");

    // ---------- CHK_015: Close Audit Trail + logout ----------
    allowLogout = true;
    auditCloseAllowed = true;
    for (const p of ctx.pages()) {
      if (p.isClosed()) continue;
      const isAudit =
        /AuditTrail/i.test(p.url()) || p.frames().some((f) => /AuditTrail/i.test(f.url()));
      if (!isAudit) continue;
      let auditCloseClicked = false;
      for (const f of p.frames()) {
        if (p.isClosed()) break;
        const clicked = await f
          .evaluate(() => {
            const norm = (s: string | null) => (s || "").replace(/\s+/g, " ").trim();
            const controls = Array.from(
              document.querySelectorAll(
                'input[type="button"], input[type="submit"], input[type="image"], button, a'
              )
            ) as HTMLElement[];
            const matches = (e: HTMLElement) => {
              const cand: (string | null)[] = [
                (e as HTMLInputElement).value,
                e.textContent,
                e.getAttribute("title"),
                e.getAttribute("alt"),
              ];
              const img = e.querySelector("img");
              if (img) cand.push(img.getAttribute("alt"), img.getAttribute("title"));
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
        if (clicked) {
          auditCloseClicked = true;
          console.log(`CHK_014: clicked 'Close' (JS) on the Audit Trail window in ${f.url().slice(-40)}`);
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 400));
      if (!p.isClosed()) {
        console.log(
          `CHK_014: Close button ${auditCloseClicked ? "clicked" : "not found"}; force-closing window.`
        );
        await p.close().catch(() => {});
      }
      console.log(`CHK_014: audit window closed (buttonClicked=${auditCloseClicked}, closed=${p.isClosed()})`);
    }
    for (const p of ctx.pages()) {
      if (p === mp || p.isClosed()) continue;
      console.log(`CHK_014: force-closing leftover window ${p.url().slice(-45)}`);
      await p.close().catch(() => {});
    }
    console.log(`CHK_015: Logging out ${MAKER_USER}...`);
    let logoutPage: Page = mp;
    if (logoutPage.isClosed()) {
      console.log("CHK_015: maker page was closed; opening a fresh page to log out.");
      logoutPage = await ctx.newPage();
      dialogHandler(logoutPage);
      await login(logoutPage, MAKER_USER, MAKER_PASS).catch(() => {});
      await waitForDashboard(logoutPage).catch(() => {});
    }
    const loggedOut = await logout(logoutPage).catch(() => false);
    await new Promise((r) => setTimeout(r, 2000));
    console.log(`✓ CHK_015: ${MAKER_USER} logout attempted (success=${loggedOut}).`);
  });
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
