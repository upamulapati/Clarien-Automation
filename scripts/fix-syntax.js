const fs = require('fs');
const p = 'tests/pages/CRM/crmRetailEndToEndPage.ts';
let s = fs.readFileSync(p, 'utf8');

const oldStr = `for (const n of names) {
          for (const inp of Array.from(document.querySelectorAll(\`input[name="\${n}"]\`) as HTMLInputElement[])) {`;
const newStr = `for (const n of names) {
          const nodeList = document.querySelectorAll(\`input[name="\${n}"]\`);
          for (let i = 0; i < nodeList.length; i++) {
            const inp = nodeList[i] as HTMLInputElement;`;

const count = s.split(oldStr).length - 1;
console.log('Occurrences to replace:', count);
if (count !== 2) {
  console.log('Unexpected count, aborting to avoid accidental changes');
  process.exit(1);
}
const newS = s.split(oldStr).join(newStr);
fs.writeFileSync(p, newS, 'utf8');
console.log('Replaced', count, 'occurrences');
