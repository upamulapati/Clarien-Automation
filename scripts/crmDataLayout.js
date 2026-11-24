const fs = require('fs');
const path = require('path');

const CRM_JSON = path.resolve(__dirname, '../tests/config/crmTestData.json');
const crm = JSON.parse(fs.readFileSync(CRM_JSON, 'utf8'));

const COMBINED_MOD = {
  cifId: '',
  address: {
    type: 'Mailing',
    houseNo: 'BLOCK NO 13',
    streetNo: '13',
    streetName: 'HM STREET',
    postalCode: '531310',
    state: 'CALIFORNIA',
    stateCode: 'US005',
    city: 'JAFFREY',
    country: 'Bermuda',
    countryCode: 'BM'
  },
  phone: {
    type: 'MOBILE NUMBER 1',
    phoneNo: '88888888'
  },
  otherBank: {
    bankName: 'CLARIEN BANK LIMITED',
    branchName: 'CLARIEN BANK LIMITED',
    productCategory: 'CLARIEN TRUST MICROGEN',
    accountId: '666666666',
    channel: 'EMAIL',
    addressLine1: 'SYENT STREET 08',
    city: 'AFORE',
    state: 'CALIFORNIA',
    country: 'Bermuda'
  }
};
// Sections that make up the CRM CIF creation data, in the order they appear in crmTestData.json.
const LAYOUT = [
  { customerType: 'retail', instance: 1, sections: [
    { name: 'customerData', data: crm.retail.endToEnd.customerData },
    { name: 'contactData', data: crm.retail.endToEnd.contactData },
    { name: 'validDocData', data: crm.retail.endToEnd.validDocData },
    { name: 'validCcyData', data: crm.retail.endToEnd.validCcyData },
    { name: 'taxCertificationData', data: crm.retail.endToEnd.taxCertificationData },
    { name: 'demographicData', data: crm.retail.endToEnd.demographicData },
    { name: 'employmentData', data: crm.retail.endToEnd.employmentData },
    { name: 'incomeExpenseData', data: crm.retail.endToEnd.incomeExpenseData }
  ]},
  { customerType: 'corporate', instance: 4, sections: [
    { name: 'corporateData', data: crm.corporate.endToEnd.corporateData },
    { name: 'contactData', data: crm.corporate.endToEnd.contactData },
    { name: 'validDocData', data: crm.corporate.endToEnd.validDocData },
    { name: 'validCcyData', data: crm.corporate.endToEnd.validCcyData },
    { name: 'taxCertificationData', data: crm.corporate.endToEnd.taxCertificationData }
  ]}
];

const MOD_LAYTOUT = [
  { customerType: 'retail', instance: 1, sections: [
    { name: 'modification', target: ['retail', 'modification'], data: crm.retail.modification },
    { name: 'otherBankDetails', target: ['corporate', 'otherBankDetails'], data: crm.corporate.otherBankDetails }
  ]},
  { customerType: 'corporate', instance: 2, sections: [
    { name: 'modification', target: ['corporate', 'modification'], data: crm.corporate.modification },
    { name: 'otherBankDetails', target: ['corporate', 'otherBankDetails'], data: crm.corporate.otherBankDetails }
  ]},
  { customerType: 'retail', instance: 3, sections: [
    { name: 'modification', target: ['retail', 'modification'], data: COMBINED_MOD },
    { name: 'otherBankDetails', target: ['corporate', 'otherBankDetails'], data: COMBINED_MOD.otherBank }
  ]}
];

function getModificationLayout(customerType, instance) {
  return MOD_LAYTOUT.find(l => l.customerType === customerType && l.instance === Number(instance));
}

function getCustomerLayout(customerType, instance) {
  return LAYOUT.find(l => l.customerType === customerType && l.instance === Number(instance));
}

/**
 * Flatten one customer row into the Excel columns used by buildCrmSheet.js.
 */
function flatten(customerType, instance) {
  const layout = getCustomerLayout(customerType, instance);
  if (!layout) throw new Error(`No CRM layout for ${customerType} / ${instance}`);

  const row = { instance: Number(instance) };
  const usedKeys = new Set();

  for (const section of layout.sections) {
    for (const key of Object.keys(section.data)) {
      const value = section.data[key];
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) continue;
      if (typeof value === 'object') continue;

      let col = key;
      if (usedKeys.has(key)) {
        col = `${section.name}.${key}`;
      }
      usedKeys.add(key);
      row[col] = value;
    }
  }

  return row;
}

/**
 * Inflate a flat Excel row back into the nested crmTestData shape for one customer type.
 */
function inflate(customerType, instance, flatRow) {
  const layout = getCustomerLayout(customerType, instance);
  if (!layout) throw new Error(`No CRM layout for ${customerType} / ${instance}`);

  // Start from the original endToEnd data so that any objects/arrays not in the Excel sheet are preserved.
  const endToEnd = JSON.parse(JSON.stringify(crm[customerType].endToEnd));
  const usedKeys = new Set();

  for (const section of layout.sections) {
    const target = endToEnd[section.name];
    for (const key of Object.keys(target)) {
      // Skip non-primitives — they were not written to the Excel sheet and should stay as-is.
      const baseValue = target[key];
      if (baseValue === null || baseValue === undefined) continue;
      if (Array.isArray(baseValue) || typeof baseValue === 'object') continue;

      let col = key;
      if (usedKeys.has(key)) {
        col = `${section.name}.${key}`;
      }
      usedKeys.add(key);

      if (flatRow[col] !== undefined) {
        target[key] = flatRow[col];
      }
    }
  }

  return endToEnd;
}

function modFlatten(customerType, instance) {
  const layout = getModificationLayout(customerType, instance);
  if (!layout) throw new Error(`No CRM modification layout for ${customerType} / ${instance}`);

  const row = { instance: Number(instance) };
  for (const section of layout.sections) {
    for (const [key, value] of Object.entries(section.data)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) continue;

      if (typeof value === 'object') {
        for (const [subKey, subValue] of Object.entries(value)) {
          if (subValue === null || subValue === undefined) continue;
          if (Array.isArray(subValue) || typeof subValue === 'object') continue;
          row[`${section.name}.${key}.${subKey}`] = subValue;
        }
      } else {
        row[`${section.name}.${key}`] = value;
      }
    }
  }

  return row;
}

function modInflate(customerType, instance, flatRow) {
  const layout = getModificationLayout(customerType, instance);
  if (!layout) throw new Error(`No CRM modification layout for ${customerType} / ${instance}`);

  const stepData = JSON.parse(JSON.stringify(crm));
  for (const section of layout.sections) {
    let target = stepData;
    for (const k of section.target) target = target[k];

    for (const [key, value] of Object.entries(section.data)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) continue;

      if (typeof value === 'object') {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        for (const subKey of Object.keys(value)) {
          const col = `${section.name}.${key}.${subKey}`;
          if (flatRow[col] !== undefined) target[key][subKey] = flatRow[col];
        }
      } else {
        const col = `${section.name}.${key}`;
        if (flatRow[col] !== undefined) target[key] = flatRow[col];
      }
    }
  }

  return stepData;
}

// =====================================================================
// Explicit CRM column-range -> section mapping for the expanded CRM sheet.
// Each section defines the Excel column indices (zero-based) it covers,
// plus whether it is repeatable (isArray) and which column acts as the
// record identifier (arrayKey).  Extras are appended after the main range.
// =====================================================================

const SECTION_RANGES = {
  retail: [
    { name: 'customerData', start: 1, end: 88 },
    { name: 'contactData', start: 111, end: 135, extras: [224] },
    { name: 'documents', start: 136, end: 151, extras: [225, 226], isArray: true, arrayKey: 'uniqueId', fallback: 'validDocData' },
    { name: 'currencies', start: 152, end: 157, isArray: true, arrayKey: 'ccy', fallback: 'validCcyData' },
    { name: 'taxCertificationData', start: 158, end: 160 },
    { name: 'demographicData', start: 161, end: 179 },
    { name: 'qualificationData', start: 180, end: 186, isArray: true, arrayKey: 'qualification' },
    { name: 'employmentData', start: 187, end: 198 },
    { name: 'incomeExpenseData', start: 199, end: 212 },
    { name: 'individualProfileOrPreferenceData', start: 228, end: 231 },
    { name: 'segmentationData', start: 232, end: 238 },
    { name: 'relationshipData', start: 239, end: 239, isArray: true, arrayKey: 'relation' },
    { name: 'assetData', start: 240, end: 242, isArray: true, arrayKey: 'assetType' },
    { name: 'productPreferenceData', start: 313, end: 320, isArray: true, arrayKey: 'productPreference' },
    { name: 'creditBureauPreferenceData', start: 321, end: 328, isArray: true, arrayKey: 'creditBureauPreference' },
    { name: 'transactionPlanData', start: 329, end: 336, isArray: true, arrayKey: 'transactionPlan' },
    { name: 'otherBankData', start: 255, end: 271, isArray: true, arrayKey: 'bankName' },
    { name: 'creditCardData', start: 272, end: 283, isArray: true, arrayKey: 'cardType' },
    { name: 'riskBaselData', start: 284, end: 311 },
    { name: 'groupDetailsData', start: 341, end: 350 },
    { name: 'coreInterfaceDetailsData', start: 351, end: 360 }
  ],
  corporate: [
    { name: 'corporateData', start: 1, end: 110, extras: [213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 227] },
    { name: 'contactData', start: 111, end: 135, extras: [224] },
    { name: 'documents', start: 136, end: 151, extras: [225, 226], isArray: true, arrayKey: 'uniqueId', fallback: 'validDocData' },
    { name: 'currencies', start: 152, end: 157, isArray: true, arrayKey: 'ccy', fallback: 'validCcyData' },
    { name: 'taxCertificationData', start: 158, end: 160 },
    { name: 'demographicData', start: 161, end: 179 },
    { name: 'qualificationData', start: 180, end: 186, isArray: true, arrayKey: 'qualification' },
    { name: 'employmentData', start: 187, end: 198 },
    { name: 'incomeExpenseData', start: 199, end: 212 },
    { name: 'psychographicData', start: 230, end: 242, extras: [228, 229] },
    { name: 'corporateFinanceData', start: 243, end: 254 },
    { name: 'otherBankData', start: 255, end: 271, isArray: true, arrayKey: 'bankName' },
    { name: 'creditCardData', start: 272, end: 283, isArray: true, arrayKey: 'cardType' },
    { name: 'riskBaselData', start: 284, end: 311 },
    { name: 'groupDetailsData', start: 341, end: 350 },
    { name: 'coreInterfaceDetailsData', start: 351, end: 360 }
  ]
};

const FIELD_KEY_OVERRIDES = {
  'Country of Issue': 'countryOfIssue',
  'A/c. ID': 'accountId',
  'Employement Type(Employment Details)': 'employmentType',
  'Employment Type(Employment Details)': 'employmentType',
  'Employment Type( Income and Expense Details)': 'employmentType',
  'Employment Type(Income and Expense Details)': 'employmentType',
  'Nature of Income': 'incomeType',
  'Marital Status': 'maritalStatus',
  'Asset Classification Control': 'assetClassification',
  'Customer SWIFT Code': 'customerSwiftCode',
  'Bank SWIFT Code Indicator': 'bankSwiftCodeIndicator',
  'Customer Rating': 'customerRating',
  'Risk Profile Score': 'riskProfileScore',
  'Risk Rating': 'riskRating',
  'Basel Profiling Required': 'baselProfilingRequired',
  'Office / RC': 'officeRc',
  'PD Risk Rating': 'pdRiskRating',
  'PD%': 'pdPercent',
  'Communication Indemnity': 'communicationIndemnity',
  'Country of Head Office': 'countryOfHeadOffice',
  'Publicly Listed': 'publiclyListed',
  'Entity Name': 'entityName',
  'RM Name': 'rmName',
  'Customer Business Size': 'customerBusinessSize',
  'Sub-sector': 'subSector'
};

const FIELD_TYPE_OVERRIDES = {
  'No. of Employees': 'number',
  'Investment in Shares and Units': 'number',
  'Total Share Investment': 'number',
  'Deposits in Other Banks': 'number',
  'Deposits': 'number',
  'Financial Year End (Month)': 'select',
  'Shareholder Indicator': 'select',
  'Occupation Legal': 'select',
  'CCY': 'select',
  'Qualification': 'select',
  'Class Obtained': 'select',
  'Marks Obtained': 'number',
  'Marks Obtained (Pcnt.)': 'number',
  'Available Channels': 'multiselect',
  'Foreign A/c. Tax Reporting Required': 'select',
  'Foreign Tax Reporting Status': 'select',
  'Foreign Tax Reporting Country': 'lov',
  'Employment Type( Income and Expense Details)': 'select',
  'Employment Type(Income and Expense Details)': 'select',
  'Nature of Income': 'select',
  'Employement Type(Employment Details)': 'select',
  'Employment Type(Employment Details)': 'select'
};

function getFieldType(sectionName, header, key) {
  const candidates = [
    String(header || '').trim(),
    String(key || '').trim(),
    String(header || '').trim().toLowerCase(),
    String(key || '').trim().toLowerCase()
  ];
  for (const c of candidates) {
    if (FIELD_TYPE_OVERRIDES[c]) return FIELD_TYPE_OVERRIDES[c];
  }
  return inferFieldType(header, key);
}

function toCamelCase(str) {
  if (!str) return '';
  let s = String(str).trim();
  s = s.replace(/\s*\*\s*$/g, '');
  s = s.replace(/\ba\/c\.\b/gi, 'Ac');
  s = s.replace(/%/g, 'Percent');
  s = s.replace(/'/g, '');
  s = s.replace(/\//g, ' ');

  if (/^[A-Za-z][A-Za-z0-9]*$/.test(s) && !s.includes(' ')) {
    if (s === s.toUpperCase()) return s.toLowerCase();
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  const parts = s.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts[0].toLowerCase() + parts.slice(1).map(p => {
    const lower = p.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join('');
}

function inferFieldType(header, key) {
  const h = String(header || '').toLowerCase();
  const k = String(key || '').toLowerCase();
  if (/\b(date|day|since|from|till|expiry|review|joining|on)\b/.test(h) || /date$/.test(k)) return 'date';
  if (/\b(indicator|required|verified|preferred|enable|flag|exemption|allowed|listed|conglomerate)\b/.test(h) || k.endsWith('indicator') || k.startsWith('is') || k.startsWith('enable') || k.startsWith('submit')) return 'checkbox';
  if (/\b(amount|amt|income|expense|expenses|limit|balance|score|rate|pcnt|percentage|pct|deposit|net worth|assets|revenue|sales|outstanding|lgd|split)\b/.test(h) || k.includes('amount') || k.includes('pcnt') || k.includes('percentage') || k.endsWith('pct') || k.includes('income') || k.includes('expense')) return 'number';
  if (/\b(country|nationality|city|state|birth|language|sector|code|type|status|channel|category|mode|subject|class|priority|rating|grade|communication)\b/.test(h) || k.endsWith('code') || k.endsWith('type') || k.endsWith('status') || k.endsWith('channel')) return 'select';
  return 'text';
}

function resolveFieldKey(sectionName, header, existingKeys, usedKeys) {
  if (!header) return null;
  const h = String(header).replace(/[\s\u00A0]+/g, ' ').trim();

  if (h.includes('.')) {
    const parts = h.split('.');
    if (parts[0].toLowerCase() === sectionName.toLowerCase() && parts[1]) return parts[1];
  }

  if (/^[a-z][A-Za-z0-9]*$/.test(h) && !usedKeys.has(h)) {
    return h;
  }

  if (FIELD_KEY_OVERRIDES[h] && !usedKeys.has(FIELD_KEY_OVERRIDES[h])) {
    return FIELD_KEY_OVERRIDES[h];
  }

  const normalized = toCamelCase(h);
  if (!normalized) return null;

  if (!usedKeys.has(normalized)) return normalized;

  if (/display|description|desc/i.test(h)) {
    const candidate = normalized + 'Display';
    if (!usedKeys.has(candidate)) return candidate;
  }

  let i = 2;
  let candidate = normalized + i;
  while (usedKeys.has(candidate)) i++;
  return candidate;
}

function getSectionIndices(section) {
  const indices = [];
  for (let i = section.start; i <= section.end; i++) indices.push(i);
  if (Array.isArray(section.extras)) {
    for (const e of section.extras) indices.push(e);
  }
  return indices;
}

function buildContactArrays(endToEnd, rows) {
  if (!endToEnd.contactData) endToEnd.contactData = {};
  endToEnd.contactData.addresses = [];
  endToEnd.contactData.phones = [];
  endToEnd.contactData.emails = [];

  const addressFields = ['addressType', 'addressLabel', 'startDate', 'streetNo', 'streetName', 'houseNo', 'premiseName', 'buildingLevel', 'suburb', 'localityName', 'zip', 'addressLine1', 'city', 'state', 'country'];
  const phoneFields = ['phoneType', 'countryCode', 'areaCode', 'phoneNumber'];
  const emailFields = ['emailType', 'email'];

  for (const row of rows) {
    const address = {};
    let hasAddress = false;
    for (const f of addressFields) {
      const v = row[f] !== undefined && row[f] !== null ? String(row[f]) : '';
      address[f] = v;
      if (v.trim()) hasAddress = true;
    }
    if (hasAddress) endToEnd.contactData.addresses.push(address);

    const phone = {};
    let hasPhone = false;
    for (const f of phoneFields) {
      const v = row[f] !== undefined && row[f] !== null ? String(row[f]) : '';
      phone[f] = v;
      if (v.trim()) hasPhone = true;
    }
    if (hasPhone) endToEnd.contactData.phones.push(phone);

    const email = {};
    let hasEmail = false;
    for (const f of emailFields) {
      const v = row[f] !== undefined && row[f] !== null ? String(row[f]) : '';
      email[f] = v;
      if (v.trim()) hasEmail = true;
    }
    if (hasEmail) endToEnd.contactData.emails.push(email);
  }
}

function buildSectionArray(endToEnd, rows, section, headers) {
  const records = [];
  const meta = {};

  for (const row of rows) {
    const record = {};
    const usedKeys = new Set();
    let hasKey = false;
    const indices = getSectionIndices(section);

    for (const idx of indices) {
      const header = headers[idx];
      if (!header) continue;
      const raw = row._raw && row._raw[idx] !== undefined ? row._raw[idx] : row[header];
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      const value = String(raw);
      const existingKeys = Object.keys(endToEnd[section.name] || {});
      const key = resolveFieldKey(section.name, header, existingKeys, usedKeys);
      if (!key) continue;
      record[key] = value;
      usedKeys.add(key);
      if (section.arrayKey && key === section.arrayKey && value.trim()) hasKey = true;
      if (!meta[key]) meta[key] = { label: header, index: idx, type: getFieldType(section.name, header, key) };
    }

    if (Object.keys(record).length === 0) continue;
    if (section.arrayKey && !hasKey) continue;
    records.push(record);
  }

  endToEnd[section.name] = records;
  if (records.length > 0 && section.fallback) {
    if (!endToEnd[section.fallback]) {
      endToEnd[section.fallback] = { ...records[0] };
    }
    // Do not overwrite an existing fallback (e.g. Passport validDocData) with a different workbook record.
  }

  return meta;
}

function buildSectionObject(endToEnd, rows, section, headers) {
  const firstRow = rows[0] || {};
  const usedKeys = new Set();
  // Start from the static fallback values and overwrite only with non-blank workbook values,
  // so valid defaults (e.g. sectorCode) are kept when the CRM sheet does not include the column.
  const target = JSON.parse(JSON.stringify(endToEnd[section.name] || {}));
  const existingKeys = Object.keys(target);
  const meta = {};

  for (const idx of getSectionIndices(section)) {
    const header = headers[idx];
    if (!header) continue;
    const raw = firstRow._raw && firstRow._raw[idx] !== undefined ? firstRow._raw[idx] : firstRow[header];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const value = String(raw);
    const key = resolveFieldKey(section.name, header, existingKeys, usedKeys);
    if (!key) continue;
    target[key] = value;
    usedKeys.add(key);
    meta[key] = { label: header, index: idx, type: getFieldType(section.name, header, key) };
  }

  // When the workbook provides a main lookup field (e.g. sector, countryOfIncorporation),
  // drop any stale fallback companion code/display keys that were not also supplied
  // by the workbook. This ensures the first textbox receives the workbook value as the
  // code rather than an outdated fallback code.
  for (const key of usedKeys) {
    const companions = new Set();
    if (key.length > 4 && key.endsWith('Code')) {
      companions.add(key.slice(0, -4));
      companions.add(key.slice(0, -4) + 'Display');
    } else if (key.length > 7 && key.endsWith('Display')) {
      companions.add(key.slice(0, -7));
      companions.add(key.slice(0, -7) + 'Code');
    } else {
      companions.add(key + 'Code');
      companions.add(key + 'Display');
    }
    for (const companion of companions) {
      if (companion && !usedKeys.has(companion) && existingKeys.includes(companion)) {
        delete target[companion];
      }
    }
  }

  endToEnd[section.name] = target;
  return meta;
}

function inflateFromHeaders(customerType, dataRowId, headers, rows) {
  if (!SECTION_RANGES[customerType]) {
    throw new Error(`No section ranges for customerType=${customerType}`);
  }

  const endToEnd = JSON.parse(JSON.stringify(crm[customerType].endToEnd));
  const sectionMeta = {};
  const fieldMeta = {};
  const covered = new Set();

  for (const section of SECTION_RANGES[customerType]) {
    if (!endToEnd[section.name]) {
      endToEnd[section.name] = section.isArray ? [] : {};
    }

    if (section.name === 'contactData') {
      const meta = buildSectionObject(endToEnd, rows, section, headers);
      fieldMeta[section.name] = meta;
      buildContactArrays(endToEnd, rows);
    } else if (section.isArray) {
      const meta = buildSectionArray(endToEnd, rows, section, headers);
      fieldMeta[section.name] = meta;
    } else {
      const meta = buildSectionObject(endToEnd, rows, section, headers);
      fieldMeta[section.name] = meta;
    }

    sectionMeta[section.name] = {
      isArray: !!section.isArray,
      arrayKey: section.arrayKey,
      fallback: section.fallback,
      indices: getSectionIndices(section)
    };

    for (const idx of getSectionIndices(section)) covered.add(idx);
  }

  const unmapped = [];
  for (const row of rows) {
    for (let idx = 0; idx < headers.length; idx++) {
      if (covered.has(idx)) continue;
      const header = headers[idx];
      if (!header || header === 'instance') continue;
      const raw = row._raw && row._raw[idx] !== undefined ? row._raw[idx] : row[header];
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        unmapped.push({ index: idx, header, value: String(raw) });
      }
    }
  }

  endToEnd._meta = {
    customerType,
    dataRowId,
    sections: sectionMeta,
    fields: fieldMeta,
    unmapped: unmapped.slice(0, 50)
  };

  return endToEnd;
}

module.exports = {
  crm, LAYOUT, getCustomerLayout, flatten, inflate, inflateFromHeaders,
  MOD_LAYTOUT, getModificationLayout, modFlatten, modInflate
};
