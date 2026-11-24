const fs = require('fs');
const files = ['tests/pages/CRM/crmBasePage.ts', 'tests/pages/CRM/crmRetailEndToEndPage.ts'];
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const orig = content;
  // Add SELECT guard to any inline `fire` helper that does not already have it.
  const regex = /const fire = \(el: HTMLElement(?:,\s*events\s*=\s*\[[^\]]*\])?\) => \{(\s*\n?)(?!\s*if\s*\(el\.tagName\s*===\s*'SELECT'\s*\))/g;
  content = content.replace(regex, (m, ws) => {
    const guard = " if (el.tagName === 'SELECT') return;";
    return m.endsWith('\n') ? m + ws + guard + '\n' : m + guard;
  });
  if (content !== orig) {
    fs.writeFileSync(file, content);
    console.log('Updated', file);
  } else {
    console.log('No changes', file);
  }
}
