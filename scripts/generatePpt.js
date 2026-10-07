const PptxGenJS = require('pptxgenjs');
const path = require('path');

const OUTPUT = path.resolve(__dirname, '../docs/automation-proposal.pptx');

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_16x9';
pptx.author = 'Clarien Automation Team';
pptx.company = 'Clarien Bank';
pptx.subject = 'Data-driven test automation approach and roadmap';

pptx.defineSlideMaster({
  title: 'MASTER',
  background: { color: 'FFFFFF' },
  objects: [
    { rect: { x: 0, y: 0, w: '100%', h: 0.75, fill: { color: '1a4d8f' } } },
    { text: { text: 'Data-Driven Test Automation — Proposed Approach & Roadmap', options: { x: 0.3, y: 0.18, w: '90%', h: 0.4, fontSize: 13, color: 'FFFFFF', fontFace: 'Arial' } } },
    { line: { x: 0, y: 0.75, w: '100%', h: 0, line: { color: 'F0AD4E', width: 2 } } },
    { slideNumber: { x: '92%', y: '95%', color: '999999', fontSize: 9 } }
  ]
});

function addTitleSlide(title, subtitle) {
  const s = pptx.addSlide({ masterName: 'MASTER' });
  s.addText(title, { x: 0.5, y: 2.2, w: 9, h: 1.2, fontSize: 36, bold: true, color: '1a4d8f', align: 'center', fontFace: 'Arial' });
  if (subtitle) s.addText(subtitle, { x: 0.5, y: 3.5, w: 9, h: 0.8, fontSize: 18, color: '555555', align: 'center', fontFace: 'Arial' });
}

function addSectionSlide(title) {
  const s = pptx.addSlide({ masterName: 'MASTER' });
  s.addText(title, { x: 0.5, y: 2.4, w: 9, h: 1, fontSize: 32, bold: true, color: '1a4d8f', align: 'center', fontFace: 'Arial' });
}

function addBulletSlide(title, bullets) {
  const s = pptx.addSlide({ masterName: 'MASTER' });
  s.addText(title, { x: 0.5, y: 0.95, w: 9, h: 0.6, fontSize: 22, bold: true, color: '1a4d8f', fontFace: 'Arial' });
  const items = bullets.map(b => ({ text: b, options: { bullet: { type: 'number', color: '1a4d8f' }, breakLine: true } }));
  s.addText(items, { x: 0.5, y: 1.7, w: 9, h: 4.2, fontSize: 15, color: '222222', fontFace: 'Arial', lineSpacing: 26 });
}

function addTwoColumnSlide(title, leftTitle, left, rightTitle, right) {
  const s = pptx.addSlide({ masterName: 'MASTER' });
  s.addText(title, { x: 0.5, y: 0.95, w: 9, h: 0.6, fontSize: 22, bold: true, color: '1a4d8f', fontFace: 'Arial' });
  s.addText(leftTitle, { x: 0.5, y: 1.6, w: 4.3, h: 0.4, fontSize: 15, bold: true, color: 'F0AD4E', fontFace: 'Arial' });
  s.addText(rightTitle, { x: 5.1, y: 1.6, w: 4.4, h: 0.4, fontSize: 15, bold: true, color: 'F0AD4E', fontFace: 'Arial' });
  s.addText(left.map(b => ({ text: b, options: { bullet: true, breakLine: true } })), { x: 0.5, y: 2.05, w: 4.3, h: 3.8, fontSize: 13, color: '222222', fontFace: 'Arial', lineSpacing: 22 });
  s.addText(right.map(b => ({ text: b, options: { bullet: true, breakLine: true } })), { x: 5.1, y: 2.05, w: 4.4, h: 3.8, fontSize: 13, color: '222222', fontFace: 'Arial', lineSpacing: 22 });
}

function addTableSlide(title, headers, rows, opts = {}) {
  const s = pptx.addSlide({ masterName: 'MASTER' });
  s.addText(title, { x: 0.5, y: 0.95, w: 9, h: 0.6, fontSize: 22, bold: true, color: '1a4d8f', fontFace: 'Arial' });
  const head = headers.map(h => ({ text: h, options: { fill: '1a4d8f', color: 'FFFFFF', bold: true, fontSize: opts.fontSize || 12, align: 'center', fontFace: 'Arial' } }));
  const data = rows.map(r => r.map(c => ({ text: String(c), options: { fill: 'F9FBFD', color: '222222', fontSize: opts.fontSize || 11, fontFace: 'Arial' } })));
  s.addTable([head, ...data], { x: 0.5, y: 1.65, w: 9, h: 4.5, colW: opts.colW, fontFace: 'Arial', border: { pt: 1, color: 'CCCCCC' } });
}

function addCodeSlide(title, code) {
  const s = pptx.addSlide({ masterName: 'MASTER' });
  s.addText(title, { x: 0.5, y: 0.95, w: 9, h: 0.6, fontSize: 22, bold: true, color: '1a4d8f', fontFace: 'Arial' });
  s.addText(code, { x: 0.5, y: 1.65, w: 9, h: 4.3, fontSize: 10, fontFace: 'Courier New', color: '222222', fill: 'F4F6F8', align: 'left', inset: 0.2 });
}

// ---------------- SLIDES ----------------

addTitleSlide(
  'Data-Driven Test Automation',
  'Proposed Approach & Roadmap\nFinalised Design: Excel-driven data + Menu-driven execution'
);

addBulletSlide('Agenda', [
  'Background and client observations',
  'Three candidate approaches that were evaluated',
  'Finalised approach: Excel + menu-driven runner',
  'Detailed end-to-end architecture and data flow',
  'Deep implementation roadmap with phases and timelines',
  'Sample workbook, FlowConfig sheet and code snippets',
  'Data dictionary, shared-state rules and validation',
  'Benefits, risks, mitigation and next steps'
]);

addBulletSlide('Background & Client Observations', [
  'The Finacle automation suite is functionally stable and all flows are currently running correctly.',
  'Switching between flows requires re-pointing the runner to the correct data file.',
  'Multiple data files create ambiguity about which source to use.',
  'A business user with no JSON/TypeScript knowledge cannot maintain the suite today.',
  'Target: script files must remain untouched; only data and execution configuration should change.'
]);

addBulletSlide('Problem Statement', [
  'Current model is script-centric: flow logic is hard-coded in runOrdered.js.',
  'Data is scattered across common-data.json and several per-flow JSON files.',
  'Each new flow risks another change to the runner and the specs.',
  'Client needs a self-service model where they can run any flow by picking from a menu.',
  'Business team should be able to modify data in Excel without asking the automation team.'
]);

addTableSlide(
  'Design Objectives',
  ['Objective', 'Why it matters'],
  [
    ['Scripts stay intact', 'After the one-time refactor, .spec.ts files and the runner never change for a new flow.'],
    ['Single source of truth', 'One workbook makes it obvious which data belongs to which step.'],
    ['Business-user ready', 'Excel is familiar and needs no coding knowledge.'],
    ['Easy execution', 'Menu or batch files remove the need to remember commands.'],
    ['Maintainable & traceable', 'All changes live in one workbook; logs show the flow and step data used.']
  ]
);

addTableSlide(
  'Approach Comparison',
  ['Approach', 'How it works', 'Best for', 'Verdict'],
  [
    ['A. Central JSON + Flow Config', 'One common-data.json + a flow-config.json with data keys per step.', 'Technical teams who prefer Git diffs and JSON.', 'Rejected — requires JSON editing.'],
    ['B. Excel + FlowConfig sheet', 'Single test-data.xlsx with data sheets and a FlowConfig sheet that drives the runner.', 'Business users comfortable with Excel.', 'Selected.'],
    ['C. Hybrid JSON manifest', 'Keep common-data.json and enrich testOrder.json with data keys.', 'Teams wanting the smallest change from today.', 'Rejected — still JSON.']
  ]
);

addSectionSlide('Finalised Approach\nExcel + Menu-Driven Runner');

addBulletSlide('Finalised Approach — Key Principles', [
  'All test data and flow declarations move into one Excel workbook.',
  'A FlowConfig sheet lists every flow, step number, spec path and data row id.',
  'The generic runner reads the FlowConfig, resolves data and passes it to the spec.',
  'Each spec consumes data through a shared dataManager helper.',
  'The business user selects a flow from a menu or double-clicks a batch file.',
  'New flows are added by editing Excel only — no code changes.'
]);

addTwoColumnSlide(
  'Architecture Overview',
  'Data Layer',
  [
    'data/test-data.xlsx',
    'FlowConfig sheet',
    'Domain data sheets',
    'One workbook = one source of truth'
  ],
  'Execution Layer',
  [
    'runOrdered.js (generic runner)',
    'Excel parser (xlsx package)',
    'dataManager.ts helper',
    'Playwright .spec.ts files',
    'Menu / batch wrappers'
  ]
);

addTableSlide(
  'Component Responsibilities',
  ['Component', 'Responsibility'],
  [
    ['data/test-data.xlsx', 'Holds all data including the FlowConfig sheet and one data sheet per domain.'],
    ['FlowConfig sheet', 'Lists every flow, step number, spec, data sheet, row id, enabled flag and shared-state rules.'],
    ['scripts/runOrdered.js', 'Generic. Reads the flow, resolves each step data, runs Playwright specs one by one.'],
    ['tests/helpers/dataManager.ts', 'Single helper used by all specs to read the current step data.'],
    ['scripts/runFlowMenu.js', 'Interactive menu that lists flows from FlowConfig and calls runOrdered.js.'],
    ['Batch files', 'Optional double-click shortcuts such as run-flow6.bat for non-technical users.']
  ]
);

addBulletSlide('Data Flow — Step by Step', [
  'User selects a flow from the menu or double-clicks a batch file.',
  'runOrdered.js opens test-data.xlsx and reads the FlowConfig rows for that flow.',
  'For each enabled step, the runner reads the requested data sheet and row.',
  'Step data is written to a temporary file or exposed via environment variables.',
  'The Playwright spec reads the data through the dataManager.ts helper.',
  'Shared state (e.g. created account id) is saved and re-injected into later steps as configured.'
]);

addTableSlide(
  'Workbook Sheet Design',
  ['Sheet', 'Purpose'],
  [
    ['FlowConfig', 'List of flows, step order, spec path, data sheet/row, enabled, shared state in/out.'],
    ['Common', 'Credentials, default customer, SOL/CCY, default dispatch mode.'],
    ['Savings', 'Scheme, SOL, initial funding, dispatch mode, related-party values.'],
    ['Current', 'Current account scheme, funding HTM rows, modification flags.'],
    ['Payment', 'Debit account, BIC, bank code, branch code, charge option, amount, currency.'],
    ['Loans', 'Loan amount, scheme, repayment account, collateral links.'],
    ['TermDeposit', 'GL sub-head, period, amount, repayment account.'],
    ['Collateral', 'Lodgement, linkage and unlinking data.']
  ]
);

addTableSlide(
  'FlowConfig Sheet — Example',
  ['flowName', 'step', 'spec', 'dataSheet', 'dataRowId', 'enabled', 'stateOut', 'stateIn'],
  [
    ['flow7', '1', 'savingsaccountcreation.spec.ts', 'Savings', 'flow7-create', 'TRUE', 'accountId', ''],
    ['flow7', '2', 'savingsaccountcreationverify.spec.ts', 'Savings', 'flow7-verify', 'TRUE', '', 'accountId'],
    ['flow7', '3', 'accountfundingsavingsaccount.spec.ts', 'Payment', 'flow7-fund-1', 'TRUE', '', 'accountId'],
    ['flow7', '4', 'transfermaintainenceverification.spec.ts', 'Payment', 'flow7-fund-1', 'TRUE', '', 'accountId']
  ],
  { fontSize: 10 }
);

addTableSlide(
  'Data Dictionary (More Detail)',
  ['Field / Entity', 'Sheet', 'Example', 'Purpose'],
  [
    ['credentials.username', 'Common', 'finacletest1', 'Maker login for creation steps'],
    ['verifierCredentials.username', 'Common', 'finacletest5', 'Checker / verifier login'],
    ['cifCode', 'Common', '0005000599', 'Customer to use for existing-CIF flows'],
    ['schemeCode', 'Savings', 'SVREG', 'Scheme selected on savings account creation'],
    ['solId', 'Savings/Current', '100', 'Branch / SOL where account is opened'],
    ['dispatchMode', 'Savings/Current', 'email', 'Statement dispatch mode'],
    ['debitAccount', 'Payment', '7010003820', 'Account debited for a payment order'],
    ['beneficiaryAccountId', 'Payment', '010247526001', 'Beneficiary account for the transfer'],
    ['paymentMethod', 'Payment', 'SWIFT / BCBBM', 'Payment channel used'],
    ['chargeOption', 'Payment', 'OUR', 'Who bears the charges'],
    ['accountId (shared)', 'SharedState', 'created in step 1', 'Passed from creation to verification / funding steps']
  ]
);

addTableSlide(
  'Shared-State Contract',
  ['Concept', 'How it is implemented'],
  [
    ['Purpose', 'Allow a value created in one step to be used in a later step without hard-coding.'],
    ['Production', 'When a spec creates an entity it writes the key value to data/shared-state.json.'],
    ['Consumption', 'The runner reads the FlowConfig stateIn column and injects the value into the step data.'],
    ['Example', 'flow7 step 1 creates accountId; step 3 (funding) receives accountId as the credit account.'],
    ['Rule', 'Every stateOut key must match a stateIn key in a later step unless it is only logged.']
  ]
);

addBulletSlide('Generic Runner Responsibilities', [
  'Accept a flow name from command line or the menu wrapper.',
  'Load the FlowConfig sheet and sort steps by step number.',
  'Skip steps where enabled = FALSE.',
  'For each enabled step, resolve the data sheet and row id.',
  'Inject any shared-state values specified in stateIn.',
  'Write the resolved data to a temporary step file or environment variables.',
  'Run the Playwright spec with --workers=1.',
  'Capture any stateOut values produced by the spec.',
  'Continue until the flow ends or a spec fails.',
  'Log the flow name, step number and data row used for traceability.'
]);

addCodeSlide(
  'Spec Using the Data Helper',
  "// tests/Finacle/savingsaccount/savingsaccountcreation.spec.ts\n" +
  "import { test } from '@playwright/test';\n" +
  "import { getStepData } from '../../helpers/dataManager';\n\n" +
  "test('create savings account', async ({ page }) => {\n" +
  "  const data = getStepData();\n" +
  "  // data.schemeCode, data.solId, data.ccy, data.dispatchMode ...\n" +
  "  // All values came from the Excel row selected by the runner.\n" +
  "});"
);

addBulletSlide('Execution Wrappers — Menu & Batch', [
  'Option A: npm run test-menu — opens an interactive numbered menu.',
  'Option B: npm run test-flow -- flow6 — one-line command for any flow.',
  'Option C: run-flow6.bat, run-flow7.bat etc. — double-click shortcuts for non-technical users.',
  'Option D: CI mode — node scripts/runOrdered.js <flowName> with CI=true for headless runs.',
  'The business user never needs to open package.json, testOrder.json or the .spec.ts files.'
]);

addCodeSlide(
  'Menu Runner Skeleton',
  "// scripts/runFlowMenu.js\n" +
  "const readline = require('readline');\n" +
  "const { execSync } = require('child_process');\n" +
  "const { getFlowNames } = require('./excelLoader');\n\n" +
  "const flows = getFlowNames('data/test-data.xlsx');\n" +
  "console.log('Available flows:');\n" +
  "flows.forEach((f, i) => console.log(`${i + 1}. ${f}`));\n\n" +
  "const rl = readline.createInterface({ input: process.stdin, output: process.stdout });\n" +
  "rl.question('Pick a flow: ', (answer) => {\n" +
  "  const idx = parseInt(answer, 10) - 1;\n" +
  "  if (flows[idx]) {\n" +
  "    execSync(`node scripts/runOrdered.js ${flows[idx]}`, { stdio: 'inherit' });\n" +
  "  } else { console.log('Invalid choice.'); }\n" +
  "  rl.close();\n" +
  "});"
);

addSectionSlide('Detailed Implementation Roadmap');

addTableSlide(
  'Roadmap — Phases 1 to 3',
  ['Phase', 'Duration', 'Owner', 'Key deliverable'],
  [
    ['1. Data inventory & workbook design', '2–3 days', 'Automation lead + BA', 'Approved test-data.xlsx skeleton with all sheets'],
    ['2. Excel loader & data helper', '3–4 days', 'Automation lead', 'scripts/excelLoader.js + tests/helpers/dataManager.ts passing smoke tests'],
    ['3. Generic runner', '3–5 days', 'Automation lead', 'runOrdered.js reading FlowConfig and running any flow']
  ]
);

addTableSlide(
  'Roadmap — Phases 4 to 7',
  ['Phase', 'Duration', 'Owner', 'Key deliverable'],
  [
    ['4. Spec refactor', '4–6 days', 'Automation lead', 'All .spec.ts files using dataManager.ts, no flow-specific env variables'],
    ['5. Migration of existing flows', '3–4 days', 'Automation lead + QA', 'All current flows running from Excel data'],
    ['6. Execution wrappers', '2 days', 'Automation lead', 'Menu, generic npm script and optional batch files tested'],
    ['7. Validation & handover', '2–3 days', 'Automation lead + Client', 'Client demonstrates adding a flow from Excel only']
  ]
);

addTableSlide(
  'Implementation Checklist (More Detail)',
  ['Area', 'Action'],
  [
    ['Data', 'List every field currently in common-data.json and per-flow JSON files.'],
    ['Data', 'Map each field to one workbook sheet and one row id.'],
    ['Workbook', 'Protect sheet/column names with a validation script.'],
    ['Runner', 'Remove getFlow6StepEnv and getFlow7StepEnv from runOrdered.js.'],
    ['Runner', 'Add shared-state read/write between steps.'],
    ['Specs', 'Replace direct env reads with getStepData() calls.'],
    ['Package', 'Update npm scripts to test-menu and test-flow.'],
    ['Docs', 'Write a 1-page Excel user guide for the client.'],
    ['Cleanup', 'Remove old JSON data files after final sign-off.']
  ]
);

addTableSlide(
  'Workbook Validation Rules',
  ['Rule', 'Rationale'],
  [
    ['Sheet and column names must not change', 'The runner and the specs depend on exact names.'],
    ['Every dataRowId must be unique within its sheet', 'Prevents the runner from loading the wrong row.'],
    ['FlowConfig step numbers must be sequential per flow', 'Guarantees the correct execution order.'],
    ['stateOut keys must be created before they are consumed by stateIn', 'Catches missing shared-state links at validation time.'],
    ['enabled flag supports TRUE / FALSE only', 'Avoids ambiguity in whether a step runs.'],
    ['Empty required fields must be marked N/A, not blank', 'Lets the validation script distinguish missing data from empty values.']
  ]
);

addTableSlide(
  'Benefits of the Finalised Approach',
  ['Benefit', 'Impact'],
  [
    ['No-code data changes', 'Business users maintain the suite without coding.'],
    ['Single workbook', 'Removes confusion over which file to edit.'],
    ['Flow composition in one place', 'FlowConfig is the only authority for test ordering.'],
    ['Reusable specs', 'The same .spec.ts can run in many flows by changing the data row.'],
    ['One-click execution', 'Menu and batch files make running tests as simple as opening a file.'],
    ['Stable scripts', 'Script files are protected from accidental changes by business users.']
  ]
);

addTableSlide(
  'Risks & Mitigation',
  ['Risk', 'Mitigation'],
  [
    ['Excel is binary and hard to diff in Git', 'Keep a changelog sheet; use CSV snapshots for major releases.'],
    ['Business user may rename a column/sheet', 'Add a pre-run validation script that checks names and stops with a clear error.'],
    ['Shared-state logic becomes complex', 'Document the stateIn / stateOut contract and provide templates.'],
    ['Initial refactor touches every spec', 'Migrate domain by domain; keep old JSON until sign-off.'],
    ['Large workbook may become slow', 'Split into multiple workbooks by domain only if needed; current volume fits one workbook.'],
    ['Multiple users editing the file', 'Use shared drive check-in/check-out or a simple version naming convention.']
  ]
);

addBulletSlide('Next Steps', [
  'Confirm the workbook domain split (Common, Savings, Current, Payment, Loans, Term Deposit, Collateral).',
  'Approve the FlowConfig sheet columns and shared-state rules.',
  'Identify the business user who will own the Excel workbook.',
  'Schedule Phase 1 (data inventory) and gather all current data files.',
  'Begin implementation after approval of this plan.'
]);

addTitleSlide('Thank You', 'Questions & Next Discussion');

pptx.writeFile({ fileName: OUTPUT })
  .then(() => console.log(`PPTX written to: ${OUTPUT}`))
  .catch(err => {
    console.error('Failed to write PPTX:', err);
    process.exit(1);
  });
