const fs = require('fs');
const file = process.argv[2] || 'test-results-temp/dump-basic-info-after-charge.html';
const pattern = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;

const html = fs.readFileSync(file, 'utf8');
const re = /<(input|select|textarea)([^>]*)>/gi;
let m;
const results = [];
while ((m = re.exec(html)) !== null) {
  const tag = m[1].toLowerCase();
  const attrs = m[2];
  const nameMatch = attrs.match(/name=["']([^"']+)["']/i);
  const valueMatch = attrs.match(/value=["']([^"']*)["']/i) || attrs.match(/value=([^\s>]+)/i);
  const idMatch = attrs.match(/id=["']([^"']+)["']/i);
  if (!nameMatch) continue;
  const name = nameMatch[1];
  const value = valueMatch ? valueMatch[1] : '';
  const id = idMatch ? idMatch[1] : '';
  if (pattern && !pattern.test(name + ' ' + id)) continue;
  results.push({ tag, name, value, id, attrs });
}

// also extract <L1 n="..."> option lists relevant to pattern
const lre = /<L1 n=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/L1>/gi;
let lm;
while ((lm = lre.exec(html)) !== null) {
  const name = lm[1];
  const inner = lm[3];
  if (pattern && !pattern.test(name)) continue;
  const opts = [];
  const cre = /<C1 value=["']([^"']*)["']\s+url=["']([^"']*)["']\s*\/?>/gi;
  let c;
  while ((c = cre.exec(inner)) !== null) { opts.push({ text: c[1], value: c[2] }); }
  if (opts.length) results.push({ tag: 'LOV', name, options: opts });
}

console.log(JSON.stringify(results, null, 2));
