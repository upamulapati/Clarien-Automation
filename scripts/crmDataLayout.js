const fs = require('fs');
const path = require('path');

const CRM_JSON = path.resolve(__dirname, '../tests/config/crmTestData.json');
const crm = JSON.parse(fs.readFileSync(CRM_JSON, 'utf8'));

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

module.exports = { crm, LAYOUT, getCustomerLayout, flatten, inflate };
