const fs = require('fs');
const p = 'tests/pages/CRM/crmRetailEndToEndPage.ts';
let s = fs.readFileSync(p, 'utf8');
const bad = 'document.querySelectorAll(`input[name="${n}"]`) as HTMLInputElement[]))';
const good = 'document.querySelectorAll(`input[name="${n}"]`)) as HTMLInputElement[])';
let count = 0;
while (s.includes(bad)) {
  s = s.replace(bad, good);
  count++;
}
fs.writeFileSync(p, s, 'utf8');
console.log('Fixed', count, 'occurrences');
