const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'tests', 'pages', 'CRM', 'crmRetailEndToEndPage.ts');
let content = fs.readFileSync(filePath, 'utf8');

const newMethod = `
  // ==================== ENSURE NATIONALITY / RESIDENCE VALUES ====================
  /**
   * Re-apply Nationality, Country of Birth and Marital Status values across all
   * frames immediately before final Submit.  Finacle keeps each tab in its own
   * iframe and the values can be lost during tab navigation / LOV popups.
   */
  private async ensureNationalityValues(): Promise<string[]> {
    const page = this.workingPage;
    const TD = this.TD;
    const allFixes: string[] = [];

    const natCode = String(TD.demographicData?.nationality || '').trim();
    const natDisplay = String(TD.demographicData?.nationalityDisplay || natCode).trim();
    const resCode = String(TD.demographicData?.countryOfBirth || '').trim();
    const resDisplay = String(TD.demographicData?.countryOfBirthDisplay || resCode).trim();
    const marital = String(TD.demographicData?.maritalStatus || '').trim();

    if (!natCode && !resCode && !marital) return [];

    for (const f of page.frames()) {
      try {
        const result = await f.evaluate((args: { natCode: string; natDisplay: string; resCode: string; resDisplay: string; marital: string }) => {
          const fire = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
          const fixes: string[] = [];

          const inputs = Array.from(document.querySelectorAll('input')).map((i) => (i as HTMLInputElement).name);
          const selects = Array.from(document.querySelectorAll('select')).map((s) => (s as HTMLSelectElement).name);

          const findName = (arr: string[], check: (n: string) => boolean) => arr.find((n) => check(n.toLowerCase())) || '';

          const natCodeName = findName(inputs, (n) => n.includes('nationality') && !n.startsWith('cat_') && !n.startsWith('btn') && !n.startsWith('pi_'));
          const natDispName = findName(inputs, (n) => n.includes('nationality') && n.startsWith('cat_'));

          const setInp = (name: string, val: string) => {
            if (!name || !val) return;
            const el = document.querySelector(\`input[name="\${name}"]\`) as HTMLInputElement;
            if (el && el.value !== val) {
              el.removeAttribute('readonly');
              el.value = val;
              fire(el);
            }
          };

          if (natCodeName && args.natCode) {
            setInp(natCodeName, args.natCode);
            // Hidden / prefixed variants
            for (const pre of ['h_', 'H_', '3_']) {
              setInp(pre + natCodeName, args.natCode);
            }
            fixes.push('NationalityCode');
          }
          if (natDispName && args.natDisplay) {
            setInp(natDispName, args.natDisplay);
            for (const pre of ['h_', 'H_', '3_']) {
              setInp(pre + natDispName, args.natDisplay);
            }
            fixes.push('NationalityDisplay');
          }

          // Marital Status
          const marName = findName(selects, (n) => n.includes('marital'));
          if (marName && args.marital) {
            const sel = document.querySelector(\`select[name="\${marName}"]\`) as HTMLSelectElement;
            if (sel) {
              const m = args.marital.toUpperCase();
              for (const o of Array.from(sel.options)) {
                const t = o.text.trim().toUpperCase();
                if (t.includes(m) && !t.includes('UN')) {
                  if (sel.value !== o.value) { sel.value = o.value; fire(sel); }
                  fixes.push('Marital');
                  break;
                }
              }
            }
          }

          // Residence Country / Country of Birth (code + display)
          const resCodeName = findName(inputs, (n) => (n.includes('residence_country') || n.includes('countryofbirth') || n.includes('birth_country')));
          const resDispName = findName(inputs, (n) => (n.includes('residence_country') || n.includes('countryofbirth') || n.includes('birth_country')) && n.startsWith('cat_'));

          if (resCodeName && args.resCode) {
            setInp(resCodeName, args.resCode);
            for (const pre of ['h_', 'H_', '3_']) setInp(pre + resCodeName, args.resCode);
            fixes.push('ResidenceCode');
          }
          if (resDispName && args.resDisplay) {
            setInp(resDispName, args.resDisplay);
            for (const pre of ['h_', 'H_', '3_']) setInp(pre + resDispName, args.resDisplay);
            fixes.push('ResidenceDisplay');
          }

          return fixes;
        }, { natCode, natDisplay, resCode, resDisplay, marital });

        if (result && result.length) allFixes.push(...result);
      } catch (_) {}
    }

    const unique = [...new Set(allFixes)];
    if (unique.length) console.log(\`  ✓ Nationality/Residence/Marital ensured: \${unique.join(', ')}\`);
    return unique;
  }
`;

// 1. Insert new method after ensureBasicInfoValues() closing brace (before FILL CURRENCY SUB-TAB comment)
const methodAnchor = /(  \/\/ ==================== FILL CURRENCY SUB-TAB \(within General\) ====================)/;
if (!methodAnchor.test(content)) {
  console.error('Could not find currency sub-tab anchor');
  process.exit(1);
}
content = content.replace(methodAnchor, newMethod + '$1');

// 2. Replace the General Details re-fill block in preSubmitVerification with a call to ensureNationalityValues()
const preSubmitBlock = /    \/\/ General Details\n    try \{[\s\S]*?\} catch \(e\) \{ console\.log\(\`  \\u26a0 General Details re-fill error\`\); \}/;
if (!preSubmitBlock.test(content)) {
  console.error('Could not find General Details block');
  process.exit(1);
}
content = content.replace(preSubmitBlock, `    // Nationality / Residence / Marital re-fill across all frames\n    await this.ensureNationalityValues().catch(() => {});`);

// 3. Add ensureNationalityValues call inside submitForm before the actual submit click.
// Find the line calling ensureBasicInfoValues inside submitForm and insert after it.
const submitAnchor = /(    \/\/ Re-apply Basic Info values to protect against data loss from earlier tab reloads\.\n    await this\.ensureBasicInfoValues\(\)\.catch\(\(\) => \{\}\);)/;
if (submitAnchor.test(content)) {
  content = content.replace(submitAnchor, `$1\n    await this.ensureNationalityValues().catch(() => {});`);
} else {
  // fallback: insert before the submit-button click
  const clickAnchor = /(    const submitBtn = .*await this\.accountFrame\.locator\('input\[value="Submit"\]'\)\.first\(\);)/;
  if (clickAnchor.test(content)) {
    content = content.replace(clickAnchor, `    await this.ensureNationalityValues().catch(() => {});\n$1`);
  } else {
    console.error('Could not find submit anchor');
    process.exit(1);
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patched nationality handling');
