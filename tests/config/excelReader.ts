import * as XLSX from 'xlsx';
import * as path from 'path';
import { AppConfig, TimeoutConfig } from './crmTestData';

// =====================================================================
// Excel-based Test Data Reader
// =====================================================================

const EXCEL_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'data',
  'testdata.xlsx'
);

const RETAIL_EXCEL_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'data',
  'testdata1.xlsx'
);

type RawExcelRow = Record<string, unknown>;

interface NormalizedInstanceRow {
  instance: number;
  values: Record<string, string>;
}

export interface RetailEndToEndExcelData {
  instance: number;
  customerData: Record<string, string>;
  contactData: Record<string, string>;
  validDocData: Record<string, string>;
  validCcyData: Record<string, string>;
  demographicData: Record<string, string>;
  employmentData: Record<string, string>;
  incomeExpenseData: Record<string, string>;
  contacts: Record<string, string>[];
  documents: Record<string, string>[];
  currencies: Record<string, string>[];
  otherBanks: Record<string, string>[];
}

// =====================================================================
// GENERIC SHEET READER
// =====================================================================

export function readSheet<T = Record<string, unknown>>(
  sheetName: string,
  filePath = EXCEL_PATH
): T[] {
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(
      `Sheet "${sheetName}" not found in ${filePath}`
    );
  }

  return XLSX.utils.sheet_to_json<T>(worksheet, {
    defval: '',
    raw: false,
    blankrows: false
  });
}

// =====================================================================
// VALUE NORMALIZATION
// =====================================================================

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function isProvidedExcelValue(value: unknown): boolean {
  const normalized = normalizeCellValue(value).toLowerCase();

  return (
    normalized.length > 0 &&
    normalized !== '-' &&
    normalized !== 'undefined' &&
    normalized !== 'null' &&
    normalized !== 'nan'
  );
}

function parseInstanceNumber(
  value: unknown
): number | undefined {
  if (!isProvidedExcelValue(value)) {
    return undefined;
  }

  const parsed = Number(normalizeCellValue(value));

  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return undefined;
  }

  return parsed;
}

function findInstanceColumn(
  row: RawExcelRow
): string | undefined {
  return Object.keys(row).find(
    key => key.trim().toLowerCase() === 'instance'
  );
}

// =====================================================================
// MERGED INSTANCE HANDLING
// =====================================================================

/**
 * Forward-fills blank instance cells created by merged Excel cells.
 *
 * Example Excel data:
 *
 * instance | ccy
 * 1        | BMD
 *          | GBP
 *          | EUR
 * 2        | SGD
 *
 * Normalized result:
 *
 * 1 | BMD
 * 1 | GBP
 * 1 | EUR
 * 2 | SGD
 */
function readNormalizedInstanceRows(
  sheetName: string,
  filePath = EXCEL_PATH
): NormalizedInstanceRow[] {
  const rawRows = readSheet<RawExcelRow>(sheetName, filePath);
  const normalizedRows: NormalizedInstanceRow[] = [];

  let currentInstance: number | undefined;

  for (
    let rowIndex = 0;
    rowIndex < rawRows.length;
    rowIndex++
  ) {
    const rawRow = rawRows[rowIndex];

    const instanceColumn = findInstanceColumn(rawRow);

    if (!instanceColumn) {
      throw new Error(
        `Column "instance" was not found in sheet "${sheetName}".`
      );
    }

    const rawInstance = rawRow[instanceColumn];
    const explicitInstance =
      parseInstanceNumber(rawInstance);

    if (explicitInstance !== undefined) {
      currentInstance = explicitInstance;
    } else if (isProvidedExcelValue(rawInstance)) {
      throw new Error(
        `Invalid instance value "${normalizeCellValue(
          rawInstance
        )}" in sheet "${sheetName}", Excel row ${
          rowIndex + 2
        }. Instance must be a positive integer.`
      );
    }

    const values: Record<string, string> = {};

    for (const [rawKey, rawValue] of Object.entries(rawRow)) {
      const key = rawKey.trim();

      if (key.toLowerCase() === 'instance') {
        continue;
      }

      values[key] = normalizeCellValue(rawValue);
    }

    const hasBusinessData = Object.values(values).some(
      isProvidedExcelValue
    );

    // Ignore completely blank rows or rows containing only "-".
    if (!hasBusinessData) {
      continue;
    }

    if (currentInstance === undefined) {
      throw new Error(
        `Data was found before the first instance number in ` +
        `sheet "${sheetName}", Excel row ${rowIndex + 2}.`
      );
    }

    normalizedRows.push({
      instance: currentInstance,
      values
    });
  }

  return normalizedRows;
}

/**
 * Returns a single object for non-repeatable sections.
 * The first supplied value for each column is retained.
 */
function readMergedInstance(
  sheetName: string,
  instance = 1,
  filePath = EXCEL_PATH
): Record<string, string> {
  const rows = readNormalizedInstanceRows(sheetName, filePath);
  const result: Record<string, string> = {};

  for (const row of rows) {
    if (row.instance !== instance) {
      continue;
    }

    for (const [key, value] of Object.entries(row.values)) {
      if (!isProvidedExcelValue(value)) {
        continue;
      }

      if (!isProvidedExcelValue(result[key])) {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Returns every row belonging to an instance.
 * Used for repeatable sections such as contact, document and currency.
 */
function readInstanceRows(
  sheetName: string,
  instance = 1,
  filePath = EXCEL_PATH
): Record<string, string>[] {
  return readNormalizedInstanceRows(sheetName, filePath)
    .filter(row => row.instance === instance)
    .map(row => ({ ...row.values }));
}

// =====================================================================
// CREDENTIAL HELPERS
// =====================================================================

interface CredentialRow {
  Role: string;
  Username: string;
  Password: string;
  BaseUrl: string;
}

function getCredentialsByRole(role: string): CredentialRow {
  const rows = readSheet<CredentialRow>('Credentials');

  const row = rows.find(
    item =>
      item.Role?.trim().toLowerCase() ===
      role.trim().toLowerCase()
  );

  if (!row) {
    throw new Error(
      `No credentials found for role "${role}" in Excel`
    );
  }

  return row;
}

function getTimeoutsFromExcel(): TimeoutConfig {
  const rows = readSheet<{
    Key: string;
    Value: number | string;
  }>('Timeouts');

  const timeoutMap: Record<string, number> = {};

  for (const row of rows) {
    const key = normalizeCellValue(row.Key);
    const value = Number(row.Value);

    if (!key) {
      continue;
    }

    if (!Number.isFinite(value)) {
      throw new Error(
        `Invalid timeout value "${row.Value}" for key "${key}"`
      );
    }

    timeoutMap[key] = value;
  }

  return timeoutMap as unknown as TimeoutConfig;
}

function buildConfig(
  role: string,
  overrides?: Partial<AppConfig>
): AppConfig {
  const credentials = getCredentialsByRole(role);
  const timeouts = getTimeoutsFromExcel();

  return {
    baseUrl: credentials.BaseUrl,
    username: credentials.Username,
    password: credentials.Password,
    timeouts,
    ...overrides
  };
}

export function getExcelPrimaryConfig(
  overrides?: Partial<AppConfig>
): AppConfig {
  return buildConfig('primary', overrides);
}

export function getExcelVerificationConfig(
  overrides?: Partial<AppConfig>
): AppConfig {
  return buildConfig('verification', overrides);
}

export function getExcelMakerConfig(
  overrides?: Partial<AppConfig>
): AppConfig {
  return buildConfig('maker', overrides);
}

export function getExcelCheckerConfig(
  overrides?: Partial<AppConfig>
): AppConfig {
  return buildConfig('checker', overrides);
}

// =====================================================================
// RETAIL END-TO-END DATA
// =====================================================================

export function getExcelRetailEndToEndData(
  instance = 1,
  filePath = RETAIL_EXCEL_PATH
): RetailEndToEndExcelData {
  if (
    !Number.isInteger(instance) ||
    instance <= 0
  ) {
    throw new Error(
      `Invalid Retail test instance: ${instance}`
    );
  }

  const customerData = readMergedInstance(
    'RetailCustomerData',
    instance,
    filePath
  );

  if (Object.keys(customerData).length === 0) {
    throw new Error(
      `No RetailCustomerData found for instance ${instance}`
    );
  }

  const contacts = readInstanceRows(
    'RetailContactData',
    instance,
    filePath
  );

  const documents = readInstanceRows(
    'RetailDocData',
    instance,
    filePath
  );

  const currencies = readInstanceRows(
    'RetailCcyData',
    instance,
    filePath
  );

  const otherBanks = readInstanceRows(
    'RetailOtherBankData',
    instance,
    filePath
  );

  return {
    instance,
    customerData,

    // Compatibility objects for existing singular page-object code.
    contactData: readMergedInstance(
      'RetailContactData',
      instance,
      filePath
    ),

    validDocData: readMergedInstance(
      'RetailDocData',
      instance,
      filePath
    ),

    validCcyData: readMergedInstance(
      'RetailCcyData',
      instance,
      filePath
    ),

    demographicData: readMergedInstance(
      'RetailDemographicData',
      instance,
      filePath
    ),

    employmentData: readMergedInstance(
      'RetailEmploymentData',
      instance,
      filePath
    ),

    incomeExpenseData: readMergedInstance(
      'RetailIncomeExpenseData',
      instance,
      filePath
    ),

    // Repeatable records.
    contacts,
    documents,
    currencies,
    otherBanks
  };
}

// =====================================================================
// INSTANCE DISCOVERY
// =====================================================================

export function getAllInstances(
  sheetName: string,
  filePath = EXCEL_PATH
): number[] {
  const instances = new Set<number>();

  for (const row of readNormalizedInstanceRows(sheetName, filePath)) {
    instances.add(row.instance);
  }

  return Array.from(instances).sort(
    (left, right) => left - right
  );
}

export function getAllRetailInstances(
  filePath = RETAIL_EXCEL_PATH
): number[] {
  return getAllInstances('RetailCustomerData', filePath);
}