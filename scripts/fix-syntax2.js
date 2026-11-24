const fs = require('fs');
const p = 'tests/pages/CRM/crmRetailEndToEndPage.ts';
const lines = fs.readFileSync(p, 'utf8').split('\n');
let count = 0;
const target = '          for (const inp of Array.from(document.querySelectorAll(`input[name="${n}"]`) as HTMLInputElement[])) {';
const repl = [
  '          const nodeList = document.querySelectorAll(`input[name="${n}"]`);',
  '          for (let i = 0; i < nodeList.length; i++) {',
  '            const inp = nodeList[i] as HTMLInputElement;'
];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].replace(/\r$/, '');
  if (line === target) {
    lines[i] = repl.join('\n');
    i += 2;
    count++;
  } else {
    lines[i] = line;
  }
}
fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log('Replaced', count);
