# Clarien Automation – Standard Operating Procedure (SOP)

> **Who is this for?**  
> This SOP is written so that a non-IT person can understand the project, set it up, add test data, build a flow, run a test and generate reports without writing any code.

---

## 1. What is this project?

This project automatically tests the **Finacle Core Banking** application used by Clarien Bank.

- It mimics the actions a human user would perform on the Finacle web screens (e.g., create a CIF, open a savings account, transfer money, verify a loan).
- The tool used is **Playwright**, an open-source browser-automation library.
- The test scripts are written in **TypeScript** (a superset of JavaScript).
- The data that drives the tests is kept in **Excel sheets** (`data/test-data.xlsx`) so that business users can change values without touching code.
- The project also uses **Page Object Model** (POM) design, **Shared State** for passing IDs between tests, and **Allure / PDF** reporting.

### What the project can do today
- CIF creation, modification, suspend/undo-suspend for **Retail** and **Corporate**
- Savings, current, term-deposit and top-up deposit account opening/verification
- Transfer maintenance, payment orders (HPORDM), retail loans, collateral
- Demand drafts, standing instructions, account freeze/unfreeze/modify

---

## 2. Project structure (in plain English)

| Folder / File | Purpose |
| --- | --- |
| `data/` | All test data: Excel workbook, JSON data files, credentials, shared state. |
| `data/test-data.xlsx` | The **master Excel workbook** where all editable data lives. |
| `tests/` | The actual test scripts (`.spec.ts`). |
| `tests/Finacle/` | Test specs grouped by Finacle module (savings, current, loans, etc.). |
| `tests/pages/` | **Page Object Model** classes. One class per screen or major area. |
| `tests/helpers/` | Helper functions (login, screenshots, shared state). |
| `tests/config/` | Configuration and test-order files. |
| `scripts/` | Utility scripts that run suites, read Excel, and generate PDF/Allure reports. |
| `reports/` | Output folder for HTML, Allure and PDF reports. |
| `package.json` | Lists dependencies and the `npm` commands you can run. |
| `playwright.config.ts` | Core Playwright settings (browsers, workers, reporters). |

---

## 3. Setup from scratch

### 3.1 Install prerequisites

1. **Node.js LTS** (v20 or later).  
   Download from https://nodejs.org/ and run the installer.  
   Verify by opening a command prompt and typing:  
   ```
   node -v
   npm -v
   ```
2. **Google Chrome** (the tests use Chromium which is downloaded by Playwright).
3. (Optional) **Git** if you are cloning the repository.

### 3.2 Get the project

If using Git:
```
git clone <repository-url>
cd Clarien-Automation
```

If you have a zip, extract it and open a command prompt **inside the `Clarien-Automation` folder**.

### 3.3 Install dependencies

Open a command prompt in the project root (`Clarien-Automation`) and run:

```
npm install
```

This downloads Playwright, the Excel reader, the Allure reporter and all other libraries.

### 3.4 Install browsers

Run:

```
npx playwright install chromium
```

This downloads the Chromium browser used by the tests.

### 3.5 Verify setup

Run the sample login test:

```
npx playwright test tests/Finacle/sampleExcelLogin.spec.ts --headed
```

If the browser opens and you see `appSelect` in the output, the setup is working.

---

## 4. How data is managed – the Excel workbook

All the data that a human would type into Finacle is stored in **`data/test-data.xlsx`**.

### 4.1 Important sheets and what they contain

| Sheet name | What it holds |
| --- | --- |
| `CRM` | Retail / Corporate CIF creation data. Each `instance` row is one customer. |
| `CRM_Mod` | Data for CIF modification. |
| `SavingsAccountData` | Savings account opening details (scheme, currency, CIF, dispatch mode, etc.). |
| `CurrentAccountData` | Current account opening details. |
| `CurrentAccountModifyData` / `CurrentAccountModifyVerifyData` | Current account modification & verification details. |
| `SavingsAccountModifyData` / `SavingsAccountModifyVerifyData` | Savings account modification & verification details. |
| `TransferMaintenanceData` | Transfer (HTM) debit/credit/amount details. Supports multi-line groups. |
| `term_deposits` | Term deposit opening data. |
| `topup_deposits` | Top-up / recurring deposit opening data. |
| `HPORDM` | Payment order remittance data(ACH & SWIFT). |
| `SavingsAccountRelatedPartyData`, `SavingsAccountDelRelPartyData`, etc. | Related-party add/delete/freeze/unfreeze data. |
| `FlowConfig` | **The orchestrator.** Lists which spec to run, in what order, and which Excel data sheet/row to use. |

### 4.2 Key concept: `instance` column

- Every data sheet has a column named **`instance`**.
- `instance` is simply a **row number / test-case number**.
- Example: `instance = 1` is the first savings-account test case, `instance = 2` is the second, and so on.
- The `FlowConfig` sheet points to the `instance` number it wants to use.

### 4.3 How to add or change data in any sheet

1. Open `data/test-data.xlsx` in **Microsoft Excel**.
2. Go to the sheet you want (e.g., `SavingsAccountData`).
3. Do **not** change the header row (row 1).  
   If a column does not exist yet, you may add a new column at the end, but the script must already know how to use it. Ask the automation team before adding brand-new columns.
4. To add a **new test case**, add a new row and give it the next `instance` number.
5. To change existing data, edit the cell values.  
   Dates should be entered as **dd/mm/yyyy** or in a date-formatted Excel cell.
6. Save the workbook and close Excel before running a test.
7. Always ensure that the data you enter in the excel sheet is in text format. (No other formats like date, numeric, general etc are not accepted).

### 4.4 Important rule for multi-line data

Some sheets (e.g., `TransferMaintenanceData`) use **merged / grouped rows**.  
The first row of a group has the `instance` value; the rows below it (with blank `instance` cells) belong to the same `instance`.

Example – one transfer with multiple credits:

| instance | debitAccount | creditAccount | amount |
| --- | --- | --- | --- |
| 1 | 7500001515 |  | 1000 |
| |  | 4600000111 | 600 |
| |  | 7710003367 | 400 |

This means: debit `7500001515` with `1000` and split it as `600` to `4600000111` and `400` to `7710003367`.

---

## 5. The `FlowConfig` sheet – how to configure and run a flow

`FlowConfig` is the **control centre**. It tells the runner which tests to run and which data to feed them.

### 5.1 Columns in `FlowConfig`

| Column | Meaning |
| --- | --- |
| `flowName` | The name of the flow / suite (e.g., `crmCIFRetail`, `savingsAccount`). This is the name you pass to the runner. |
| `step` | Order of execution (1, 2, 3 …). |
| `spec` | The `.spec.ts` file to run. Must be the path from the project root, e.g., `tests/Finacle/savingsaccount/savingsaccountcreation.spec.ts`. |
| `dataSheet` | Which Excel sheet has the data for this step. Can be left blank if no Excel data is needed. |
| `dataRowId` | Which `instance`(s) from the data sheet to use. Can be a single number (`1`) or a comma-separated list (`1,2,3`). |
| `enabled` | `Y` = run this step, `N` = skip this step. |
| `sharedStateIn` | Shared-state key to read before this step (e.g., `currentAccounts`). |
| `sharedStateOut` | Shared-state key this step will write (usually empty; most specs write in code). |
| `customerType` | For CRM steps: `retail` or `corporate` (used by `crmDataResolver.js`). |

### 5.2 How to create a new flow

1. Open `data/test-data.xlsx` and go to the `FlowConfig` sheet.
2. Decide a new `flowName`, for example `myNewSavingsFlow`.
3. Add one row for every test step in the order you want it to run.

Example – a simple savings flow:

| flowName | step | spec | dataSheet | dataRowId | enabled | sharedStateIn | customerType |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mySavingsFlow | 1 | `tests/Finacle/savingsaccount/savingsaccountcreation.spec.ts` | `SavingsAccountData` | 1 | Y | | savings |
| mySavingsFlow | 2 | `tests/Finacle/savingsaccount/savingsaccountcreationverify.spec.ts` | `SavingsAccountData` | 1 | Y | | savings |
| mySavingsFlow | 3 | `tests/Finacle/transfermaintainence/accountfundingsavingsaccount.spec.ts` | `TransferMaintenanceData` | 1 | Y | | savings |
| mySavingsFlow | 4 | `tests/Finacle/transfermaintainence/transfermaintainenceverification.spec.ts` | `TransferMaintenanceData` | 1 | Y | | savings |

4. Save the Excel file.
5. Run the flow with:  
   ```
   node scripts/runOrdered.js mySavingsFlow
   ```

### 5.3 How to add a data sheet to a flow step

If a spec needs data from a sheet:

- Put the **exact** sheet name in `dataSheet`.
- Put the `instance` number(s) in `dataRowId`.
- For CRM steps, also set `customerType` to `retail` or `corporate`.

If a spec does **not** need Excel data, leave `dataSheet` and `dataRowId` blank.

### 5.4 Disabling or enabling a step

Change the `enabled` cell:

- `Y` – run.
- `N` – skip.

Save the Excel file before running the test.

---

## 6. Intermittent / step JSON files (the bridge between Excel and the test)

When a flow runs, the runner (`scripts/runOrdered.js`) takes the relevant Excel rows and writes them into small **intermittent JSON files** in the `data/` folder. The test then reads that JSON file.

### 6.1 Why this exists

The Excel data is not read directly inside the test script. Instead:

1. The runner reads the Excel row requested by `FlowConfig`.
2. It converts the flat Excel columns back into the nested shape the code expects.
3. It writes a JSON file such as `data/crm-step-data.json`.
4. The test reads the JSON file and fills the form.

### 6.2 Main intermittent files

| File | Created from | Used by |
| --- | --- | --- |
| `data/crm-step-data.json` | `CRM` or `CRM_Mod` sheet | `crmCIFRetail` / `crmCIFCorporate` specs |
| `data/flow-step-data.json` | `SavingsAccountData`, `CurrentAccountData`, `TransferMaintenanceData`, etc. | Account creation, funding, modification specs |
| `data/hpordm-step-data.json` | `HPORDM` sheet | Payment-order specs |
| `data/term-deposit-step-data.json` | `term_deposits` sheet | Term-deposit specs |
| `data/top-up-deposit-step-data.json` | `topup_deposits` sheet | Top-up deposit specs |

### 6.3 What you need to know

- These files are **generated automatically**. Do not edit them by hand.
- If a test is acting on the wrong data, update the **Excel sheet** and re-run the flow. The intermittent JSON will be overwritten.
- If an intermittent JSON looks wrong, it is a symptom that the Excel sheet or `FlowConfig` has wrong data, not the file itself.

---

## 7. Shared State – passing values from one test to another

Many Finacle flows are **chained**. For example:

1. Test A creates a savings account and gets a new account number.
2. Test B needs that account number to verify the account.
3. Test C uses it to fund the account.

Because every Playwright test starts with a fresh browser, the account number must be saved to a **shared runtime file**.

### 7.1 File involved

- `data/shared-state.json` (git-ignored, generated at runtime).

### 7.2 What is stored

- `cifId` – the CIF just created.
- `accountId` – the savings/current account just created.
- `loanAccountNumber` – the retail loan account number.
- `termDepositAccounts`, `topUpDepositAccounts` – deposit accounts keyed by scheme.
- `transactionIds` – list of transaction reference numbers.
- `collateralIds` – list of collateral IDs.
- `hpordmId` – payment order ID.

### 7.3 How it works (no code change needed)

- When a spec creates an account, it writes the new number to `shared-state.json` automatically.
- The next spec in the same flow **reads** `shared-state.json` to get the number.
- In `FlowConfig`, the `sharedStateIn` column can hint which key a step depends on (informational; the actual read is in the code).

### 7.4 Example from a real test

In `crmCIFEndtoEnd.spec.ts`:

```ts
sharedCifId = retailPage.cifId;
if (sharedCifId) {
  writeSharedState({ cifId: sharedCifId });
  saveCif('retail', sharedCifId);
}
```

In the next spec (`crmCIFSuspend.spec.ts`), it uses the same CIF ID from `shared-state.json`.

---

## 8. Page Object Model (POM)

### 8.1 What is POM?

Each screen of the Finacle application is represented by a **class** in `tests/pages/`.

- `LoginPage` – the login screen.
- `HomePage` – the app-selection and logout actions.
- `CrmRetailEndToEndPage` – the retail CIF creation wizard.
- `CrmVerificationPage` – the approval/verification queues.
- `SavingsBankAccountPage` – savings account creation.
- `servicepackpage` – shared service-pack details.

### 8.2 Why this matters to a business user

POM means:

- The locator of a button (e.g., `#usertxt` for username) is defined in **one place**.
- The action of logging in is defined in **one place**.
- If Finacle changes a field ID, the automation team only updates one class, not every test.

### 8.3 Typical contents of a page class

- **Locators** – how to find a button, field or dropdown.
- **Methods** – what to do on that screen (fill, click, select).
- **Asserts** – built-in checks that the expected values appeared.

### 8.4 Example – `LoginPage`

```ts
export class LoginPage {
  private get usernameInput() { return this.loginFrame.locator('#usertxt'); }
  private get passwordInput() { return this.loginFrame.locator('#passtxt'); }
  private get loginButton() { return this.loginFrame.getByRole('button', { name: 'Login' }); }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
```

The spec simply calls `loginPage.login(user, pass)`.

---

## 9. How to run a suite / flow

A **suite** (or **flow**) is a list of tests that run one after another.

### 9.1 Run from `FlowConfig` (recommended)

Use the `runOrdered.js` script with the `flowName`:

```
node scripts/runOrdered.js <flowName>
```

Examples:

```
node scripts/runOrdered.js crmCIFRetail
node scripts/runOrdered.js savingsAccount
node scripts/runOrdered.js currentAccount
node scripts/runOrdered.js paymentorder
node scripts/runOrdered.js flow7
```

What happens:

1. The script reads `FlowConfig` for that flow.
2. It generates intermittent JSON from the Excel data.
3. It runs each `spec` one at a time (`--workers=1`).
4. If a step fails, it stops immediately and shows the failed spec.
5. At the end it creates a `.last-run.json` manifest used by the PDF report.

### 9.2 Run from `testOrder.json` (fallback)

If a flow is **not** in `FlowConfig`, the runner looks in `tests/config/testOrder.json`.

Example:

```
node scripts/runOrdered.js endtoendcustom
```

This uses the hard-coded order in `testOrder.json`.

### 9.3 Convenience `npm` scripts

You can also run a pre-defined `npm` command from `package.json`:

```
npm run test-crmCIFRetail
npm run test-crmCIFCorporate
npm run test-paymentorder
npm run test-flow7
npm run test-savingsaccount
```

Each of these is a shortcut for `node scripts/runOrdered.js <flowName>` followed by `npm run allure:generate`.

---

## 10. How to run a single spec file

A **spec file** is one `.spec.ts` file and usually contains one test case.

### 10.1 Direct Playwright command

```
npx playwright test tests/Finacle/savingsaccount/savingsaccountcreation.spec.ts --headed
```

- Remove `--headed` to run in the background.
- Add `--project=chromium` if you want a specific browser.

### 10.2 Run with the runner (for one spec in a flow)

If the spec needs data from Excel, the easiest way is to create a `FlowConfig` row with just that one step and run it as a flow.

Example: create a one-step flow called `oneSavingsCreate` in `FlowConfig` and run:

```
node scripts/runOrdered.js oneSavingsCreate
```

This ensures the Excel data is converted to JSON before the spec starts.

---

## 11. How to generate Allure reports

### 11.1 What is Allure?

Allure is a web-based report showing every test, its status, duration, screenshots and logs.

### 11.2 Generate after a run

Most `npm` suites automatically generate Allure, but if you need to do it manually:

```
npm run allure:generate
```

This command:

1. Runs `npx allure generate ./reports/allureReports --clean -o ./reports/allure-report`
2. Runs `node scripts/generateAllurePdf.js` to also create a PDF.

### 11.3 Open the Allure report

```
npm run allure:open
```

This opens `reports/allure-report/index.html` in the default browser.

---

## 12. How to generate the PDF report

The project creates a **business-friendly PDF** with a dashboard and annotated screenshots.

### 12.1 Automatically

The `npm` suite commands and `allure:generate` create the PDF as part of their workflow.

The default output is:

```
reports/currentaccountcreationandmodification report.pdf
reports/currentaccountcreationandmodification report.html
```

### 12.2 Manually

```
npm run pdf:generate
```

or

```
node scripts/generateAllurePdf.js
```

### 12.3 Filtered PDF (one test only)

If you want a PDF for a specific test by name:

```
node scripts/generateAllurePdf.js --only "Savings Account Creation"
```

The `--only` value is matched against the suite/test name in the Allure results.

### 12.4 What the PDF contains

- Summary box: passed, failed, broken, skipped, total, pass rate, duration.
- List of spec files that were executed.
- One section per test with:
  - Test name and suite.
  - Status (green = passed, red = failed, orange = broken).
  - Screenshot(s) for every important action.
  - Input data panel (the values filled into the form).
  - Error message if the test failed.

---

## 13. Common commands cheat sheet

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Install browser | `npx playwright install chromium` |
| Run a flow from FlowConfig | `node scripts/runOrdered.js <flowName>` |
| Run a single spec with browser visible | `npx playwright test <path-to-spec> --headed` |
| Run a single spec headless | `npx playwright test <path-to-spec>` |
| Run the full Playwright suite | `npm run test` |
| Generate Allure + PDF | `npm run allure:generate` |
| Open Allure report | `npm run allure:open` |
| Generate only PDF | `npm run pdf:generate` |

---

## 14. Troubleshooting quick guide

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Workbook not found: data/test-data.xlsx` | Excel file missing or renamed | Ensure `data/test-data.xlsx` exists. |
| `No row with instance=... in sheet ...` | Wrong `dataRowId` in `FlowConfig` or missing row in data sheet | Check the `instance` number and the sheet. |
| `Suite not found in FlowConfig or testOrder.json` | Typo in `flowName` or flow not added yet | Verify the `flowName` in `FlowConfig` or `testOrder.json`. |
| Test uses stale account number | `shared-state.json` not updated | The creating spec must have passed; otherwise delete `data/shared-state.json` and re-run the full flow. |
| Browser not opening | Playwright browsers not installed | Run `npx playwright install chromium`. |
| Empty PDF | No Allure results | Run the tests first; then generate the PDF. |

---

## 15. Data-change checklist

Before running a test after changing data, verify:

1. Excel file saved and closed.
2. `FlowConfig` row uses the correct `flowName`.
3. `dataSheet` and `dataRowId` point to the right place.
4. `enabled` is `Y` for the steps you want.
5. `shared-state.json` is cleared if the new flow should not reuse old IDs.

---

## 16. Contact / escalation

For technical issues that are not solved by this SOP, reach out to the automation team with:

- The exact command you ran.
- The `flowName` or spec path.
- The last 20 lines of the console output (or the log file).
- The names of any Excel sheets you changed.
