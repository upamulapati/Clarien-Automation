const fs = require('fs');
const step = JSON.parse(fs.readFileSync('data/crm-step-data.json', 'utf8'));
const def = JSON.parse(fs.readFileSync('tests/config/crmTestData.json', 'utf8'));

function compare(prefix, s, d) {
  const keys = Array.from(new Set([...Object.keys(s || {}), ...Object.keys(d || {})]));
  for (const k of keys) {
    const sv = s && s[k] !== undefined ? JSON.stringify(s[k]) : 'undefined';
    const dv = d && d[k] !== undefined ? JSON.stringify(d[k]) : 'undefined';
    if (sv !== dv) {
      console.log(`${prefix}.${k}: STEP=${sv} DEF=${dv}`);
    }
  }
}

compare('retail.endToEnd.customerData', step.retail?.endToEnd?.customerData, def.retail?.endToEnd?.customerData);
compare('retail.endToEnd.contactData', step.retail?.endToEnd?.contactData, def.retail?.endToEnd?.contactData);
compare('retail.endToEnd.taxCertificationData', step.retail?.endToEnd?.taxCertificationData, def.retail?.endToEnd?.taxCertificationData);
compare('retail.endToEnd.employmentData', step.retail?.endToEnd?.employmentData, def.retail?.endToEnd?.employmentData);
compare('retail.endToEnd.incomeExpenseData', step.retail?.endToEnd?.incomeExpenseData, def.retail?.endToEnd?.incomeExpenseData);
