const fs = require('fs');
const p = 'tests/pages/CRM/crmRetailEndToEndPage.ts';
const lines = fs.readFileSync(p, 'utf8').split('\n');
const target = '          for (const inp of Array.from(document.querySelectorAll(`input[name="${n}"]`) as HTMLInputElement[])) {';
const line = lines[378].replace(/\r$/, '');
console.log('line len:', line.length, 'target len:', target.length);
console.log('line:', JSON.stringify(line));
console.log('target:', JSON.stringify(target));
for (let i = 0; i < Math.max(line.length, target.length); i++) {
  if (line[i] !== target[i]) {
    console.log('first diff at', i, 'line:', line.charCodeAt(i), line[i] || '<end>', 'target:', target.charCodeAt(i), target[i] || '<end>');
    break;
  }
}
