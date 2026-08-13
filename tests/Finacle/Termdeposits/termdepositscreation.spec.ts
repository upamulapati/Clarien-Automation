import { test } from '@playwright/test';
import { TermDepositPage } from '../../pages/CoreBanking/TermDepositPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import COMMON_DATA from '../../../data/common-data.json';
import { CREDENTIALS } from '../../../data/credentials';
import { saveTermDepositAccount } from '../../helpers/sharedState';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;
const TD = COMMON_DATA.termDeposit;

const SCHEME_OVERRIDE = (process.env.TD_SCHEMES || '').trim();
const SCHEME_CODES: string[] = SCHEME_OVERRIDE
  ? SCHEME_OVERRIDE.split(',').map(s => s.trim()).filter(Boolean)
  : TD.schemeCodes;

const DEPOSIT_AMOUNT_OVERRIDES: Record<string, string> = TD.depositAmountOverrides;

// Persists generated account IDs to the shared state for the verification spec.
function saveAccount(schemeCode: string, accountId: string) {
  saveTermDepositAccount(schemeCode, accountId);
}

test(TD.testLabel, async ({ page }) => {
  test.setTimeout(SCHEME_CODES.length * 300000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);
  const tdPage = new TermDepositPage(page);
  const generatedAccounts: Record<string, string> = {};

  console.log('Selecting Core Server...');
  await tdPage.selectCoreServer();
  await page.waitForTimeout(3000);

  const getFrame = () => {
    const f = page.frame({ name: 'FINW' });
    if (!f) throw new Error('FINW frame not found');
    return f;
  };

  const clickTab = async (label: string) => {
    const tab = getFrame().locator(`a:has-text("${label}")`).first();
    if (await tab.count() > 0) {
      await tab.click();
      await page.waitForTimeout(2500);
      console.log(`Navigated to tab: ${label}`);
    } else {
      console.log(`Tab '${label}' not found — may already be active`);
    }
  };

  const waitForFrameInput = async (inputId: string, label: string): Promise<boolean> => {
    for (let i = 0; i < 20; i++) {
      const f = page.frame({ name: 'FINW' });
      if (f && !f.isDetached() && await f.locator(inputId).count().catch(() => 0) > 0) return true;
      await page.waitForTimeout(1000);
    }
    console.log(`${label} not found — logging inputs for diagnosis...`);
    const ids = await getFrame().evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(i => `id=${i.id}|name=${i.name}|type=${i.type}`)
    ).catch(() => []);
    console.log(`${label} inputs:`, JSON.stringify(ids));
    return false;
  };

  const fillField = async (selector: string, value: string, waitMs = 800) => {
    const loc = getFrame().locator(selector);
    await loc.click({ clickCount: 3 });
    await loc.type(value);
    await loc.press('Tab');
    await page.waitForTimeout(waitMs);
  };

  const clickValidate = async () => {
    const btn = getFrame().locator(
      'input[type="button"][value="Validate"], input[type="submit"][value="Validate"], button:has-text("Validate")'
    ).first();
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(2000);
      console.log('Clicked Validate');
    }
  };

  const fillByLabel = async (labelText: string, value: string) => {
    const result = await getFrame().evaluate(({ label, val }) => {
      const cells = Array.from(document.querySelectorAll('td, th'));
      const labelCell = cells.find(c => (c.textContent?.trim() || '').startsWith(label));
      if (!labelCell) return { ok: false, reason: `label not found: ${label}` };
      let sib = labelCell.nextElementSibling;
      while (sib) {
        const inp = sib.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null;
        if (inp && !inp.disabled) {
          inp.focus(); inp.value = val;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.blur();
          return { ok: true, id: inp.id };
        }
        if ((sib.textContent?.trim() || '').length > 2 && !sib.querySelector('input')) break;
        sib = sib.nextElementSibling;
      }
      return { ok: false, reason: `no input found after label: ${label}` };
    }, { label: labelText, val: value });
    console.log(`fillByLabel("${labelText}", "${value}"): ${JSON.stringify(result)}`);
    return result.ok;
  };

  for (const schemeCode of SCHEME_CODES) {
    const depositAmount = DEPOSIT_AMOUNT_OVERRIDES[schemeCode] || TD.depositAmount;
    let accountId = await tdPage.createTermDeposit(schemeCode, depositAmount, TD);
    if (accountId) {
      generatedAccounts[schemeCode] = accountId;
      saveAccount(schemeCode, accountId);
    }
    continue;

    // Step 2: Search HOAACTD
    console.log(`Searching for ${TD.screens.create}...`);
    await tdPage.searchMenu(TD.screens.create);
    await page.waitForTimeout(3000);

    // Step 3: Fill account opening criteria header
    console.log('Filling account header...');
    await tdPage.openLoanHeader({
      ccy: TD.ccy,
      solId: TD.solId,
      cifCode: TD.cifCode,
      schemeCode,
    });
    await page.waitForTimeout(3000);

    // Fill GL Subhead Code if the field is still editable after openLoanHeader
    await getFrame().evaluate((glCode) => {
      const ids = ['glSubHeadCode', 'glSubHdCode', 'glSubhead', 'glSubHd'];
      for (const id of ids) {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el && !el.readOnly && !el.disabled) {
          el.value = glCode;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    }, TD.glSubHeadCode).catch(() => {});

    await tdPage.acceptWarningPopup().catch(() => {});

    // Close any extra popup pages
    for (const p of page.context().pages()) {
      if (p !== page) await p.close().catch(() => {});
    }

    // Step 4: General tab — dispatch mode + mode of operation
    console.log('Visiting General tab...');
    await clickTab('General');

    console.log('Setting Mode of Operation to 016...');
    await getFrame().evaluate(({ val }) => {
      const cells = Array.from(document.querySelectorAll('td'));
      const lbl = cells.find(c => (c.textContent?.trim() || '').startsWith('Mode of Operation'));
      if (!lbl) return;
      let sib = lbl.nextElementSibling;
      while (sib) {
        const inp = sib.querySelector('input[type="text"], input:not([type="hidden"])') as HTMLInputElement | null;
        if (inp && !inp.disabled) {
          inp.focus(); inp.value = val;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        sib = sib.nextElementSibling;
      }
    }, { val: TD.modeOfOperation });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1000);
    console.log(`Mode of operation set: ${TD.modeOfOperation}`);

    console.log('Setting Dispatch Mode to Post...');
    const dispatchResult = await getFrame().evaluate(() => {
      const allSels = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      for (const sel of allSels) {
        const postOpt = Array.from(sel.options).find(o =>
          o.text.trim() === 'P - Post' || /^post$/i.test(o.text.trim()) || /\bpost\b/i.test(o.text)
        );
        if (postOpt) {
          sel.value = postOpt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return `Selected "${postOpt.text}" in select id="${sel.id}"`;
        }
      }
      return 'Dispatch Mode Post not found';
    });
    console.log('Dispatch Mode result:', dispatchResult);
    await page.waitForTimeout(500);

    // Step 5: Interest & Tax tab
    console.log('Visiting Interest & Tax tab...');
    await clickTab('Interest & Tax');
    if (TD.operativeSbAccount) {
      await fillByLabel('Interest Credit A/c ID', TD.operativeSbAccount);
    } else {
      console.log('No operative SB account — skipping interest credit a/c');
    }
    await clickValidate();

    // Step 6: Scheme tab — deposit amount, deposit period, repayment a/c
    console.log('Visiting Scheme tab...');
    await clickTab('Scheme');

    console.log('Waiting for Scheme tab to settle...');
    const schemeReady = await waitForFrameInput('#depAmt', 'Scheme tab #depAmt');
    if (!schemeReady) {
      console.log('Warning: #depAmt not found, trying fallback field IDs...');
    }

    console.log('Filling Deposit Amount...');
    const depAmtFilled = await getFrame().evaluate((val) => {
      for (const id of ['depAmt', 'depositAmt', 'depositAmount', 'tdDepAmt']) {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el && !el.readOnly && !el.disabled) {
          el.focus(); el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
          return `filled via id=${id}`;
        }
      }
      return null;
    }, depositAmount);
    if (depAmtFilled) {
      console.log('Deposit Amount:', depAmtFilled);
      await page.waitForTimeout(800);
    } else {
      await fillField('#depAmt', depositAmount).catch(() => {});
    }

    console.log('Filling Deposit Period Months...');
    const periodFilled = await getFrame().evaluate((val) => {
      for (const id of ['depPerdMths', 'depPeriodMths', 'depositPeriodMonths', 'depPrdMth']) {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el && !el.readOnly && !el.disabled) {
          el.focus(); el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
          return `filled via id=${id}`;
        }
      }
      return null;
    }, TD.depositPeriodMonths);
    if (periodFilled) {
      console.log('Deposit Period Months:', periodFilled);
      await page.waitForTimeout(500);
    } else {
      await fillField('#depPerdMths', TD.depositPeriodMonths, 500).catch(() => {});
    }

    await fillField('#depPerdDays', '0').catch(() => {});

    if (TD.operativeSbAccount) {
      console.log('Filling Repayment A/c ID...');
      await fillField('#repayAcct', TD.operativeSbAccount, 1000).catch(async () => {
        await fillByLabel('Repayment A/c ID', TD.operativeSbAccount);
      });
    }

    console.log('Setting Nomination to No...');
    const nomResult = await getFrame().evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      const nomNoRadio = radios.find(r => /nomin/i.test(r.name) && (r.value === 'N' || r.value === 'No' || r.value === 'false'));
      if (nomNoRadio) {
        nomNoRadio.click();
        nomNoRadio.dispatchEvent(new Event('change', { bubbles: true }));
        return `clicked: id=${nomNoRadio.id} value=${nomNoRadio.value}`;
      }
      const tds = Array.from(document.querySelectorAll('td'));
      const nomTd = tds.find(td => td.textContent?.trim() === 'Nomination');
      if (!nomTd) return 'Nomination td not found';
      const row = nomTd.closest('tr');
      const rowRadios = Array.from(row?.querySelectorAll('input[type="radio"]') || []) as HTMLInputElement[];
      if (rowRadios.length < 2) return `row has only ${rowRadios.length} radios`;
      const noR = rowRadios.find(r => r.value === 'N' || r.value === 'No') ?? rowRadios[1];
      noR.click();
      noR.dispatchEvent(new Event('change', { bubbles: true }));
      return `fallback clicked: id=${noR.id} value=${noR.value}`;
    });
    console.log('Nomination result:', nomResult);
    await page.waitForTimeout(300);
    await clickValidate();

    // Step 7: Flow tab
    console.log('Visiting Flow tab...');
    await clickTab('Flow');
    await page.waitForTimeout(1000);

    // Step 8: Renewal & Closure tab — Auto Closure: No, Auto Renewal: Unlimited
    console.log('Visiting Renewal & Closure tab...');
    await clickTab('Renewal');

    console.log('Setting Auto Closure to No...');
    await getFrame().evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, th'));
      const label = cells.find(c => (c.textContent?.trim() || '').startsWith('Auto Closure'));
      if (!label) return;
      const radios = Array.from(label.nextElementSibling?.querySelectorAll('input[type="radio"]') || []) as HTMLInputElement[];
      const noRadio = radios.find(r => r.value === 'N' || r.value === 'No') || radios[1];
      if (noRadio) {
        noRadio.checked = true;
        noRadio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        noRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    console.log('Setting Auto Renewal to Unlimited...');
    await getFrame().evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, th'));
      const label = cells.find(c => (c.textContent?.trim() || '').startsWith('Auto Renewal'));
      if (!label) return;
      const nextCell = label.nextElementSibling;
      const sel = nextCell?.querySelector('select') as HTMLSelectElement | null;
      if (sel) {
        const opt = Array.from(sel.options).find(o => /unlimited/i.test(o.text));
        if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
      }
      const radios = Array.from(nextCell?.querySelectorAll('input[type="radio"]') || []) as HTMLInputElement[];
      const unlimitedRadio = radios.find(r => /unlimited/i.test(r.value) || r.value === 'U');
      if (unlimitedRadio) {
        unlimitedRadio.checked = true;
        unlimitedRadio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        unlimitedRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);
    console.log('Renewal & Closure settings applied');

    // Step 9: Related Party tab
    console.log('Visiting Related Party tab...');
    await clickTab('Related Party');
    await page.waitForTimeout(1000);

    // Step 10: Submit
    console.log('Clicking Submit...');
    const submitBtn = getFrame().locator('#Submit, input[value="Submit"], button:has-text("Submit")').first();
    if (await submitBtn.count().catch(() => 0) > 0) {
      await submitBtn.click().catch(() => {});
    } else {
      await tdPage.submitForm().catch(() => {});
    }
    await page.waitForTimeout(4000).catch(() => {});

    if (!page.isClosed()) {
      await tdPage.acceptWarningPopup().catch(() => {});
      await page.waitForTimeout(2000).catch(() => {});
    }

    // Capture the generated account ID
    accountId = null;
    if (!page.isClosed()) {
      for (const frame of page.frames()) {
        const id = await frame.evaluate(() => {
          const body = document.body?.innerText ?? '';
          const match = body.match(/(?:New\s+A\/c\.?\s*ID|Account\s+(?:ID|Number|No\.?))\s*[:\-]?\s*(\d{8,15})/i);
          return match ? match[1] : null;
        }).catch(() => null);
        if (id) { accountId = id; break; }
      }
    }

    console.log(`=== GENERATED TERM DEPOSIT ACCOUNT (${schemeCode}): ${accountId ?? 'NOT CAPTURED'} ===`);
    if (accountId) {
      generatedAccounts[schemeCode] = accountId!;
      saveAccount(schemeCode, accountId!);
    }

    // Click Accept to return to criteria screen for next scheme
    if (!page.isClosed()) {
      const acceptBtn = getFrame().locator('#Accept, input[value="Accept"], button:has-text("Accept")').first();
      if (await acceptBtn.count().catch(() => 0) > 0) {
        await acceptBtn.click().catch(() => {});
        await page.waitForTimeout(3000).catch(() => {});
        console.log('Clicked Accept — ready for next scheme');
      } else {
        await tdPage.clickAccept().catch(() => {});
      }
    }
  }

  console.log('\n===== All term deposit accounts created =====');
  console.log(JSON.stringify(generatedAccounts, null, 2));

  if (!page.isClosed()) {
    console.log('Logging out...');
    await homePage.logout().catch(() => {});
  }
});
