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
    { name: 'demographicData', data: crm.retail.endToEnd.demographicData },
    { name: 'employmentData', data: crm.retail.endToEnd.employmentData },
    { name: 'incomeExpenseData', data: crm.retail.endToEnd.incomeExpenseData }
  ]},
  { customerType: 'corporate', instance: 2, sections: [
    { name: 'corporateData', data: crm.corporate.endToEnd.corporateData },
    { name: 'contactData', data: crm.corporate.endToEnd.contactData },
    { name: 'validDocData', data: crm.corporate.endToEnd.validDocData },
    { name: 'validCcyData', data: crm.corporate.endToEnd.validCcyData }
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

module.exports = { crm, LAYOUT, getCustomerLayout, flatten, inflate, MOD_LAYTOUT, getModificationLayout, modFlatten, modInflate };
