const fs = require('fs');
const path = require('path');

const testsDir = path.join(__dirname, '..', 'tests');
const marker = '// === STRICT ASSERTIONS INJECTION ===';
const afterEachSnippet = `\n${marker}\ntest.afterEach(async ({ page }) => {\n  const html = (await page.content()).toLowerCase();\n  expect(html).not.toMatch(/core dump|internal server error/);\n});\n`;

function ensureExpectImport(content) {
  // Matches imports from @playwright/test, e.g.:
  // import { test } from '@playwright/test';
  // import { test, Page } from '@playwright/test';
  const importRe = /import\s*\{\s*([^}]*?)\s*\}\s*from\s*['"]@playwright\/test['"];/;
  const match = content.match(importRe);
  if (!match) return content;

  const existing = match[1];
  if (/\bexpect\b/.test(existing)) return content;

  const withExpect = existing.trimEnd().replace(/,\s*$/, '') + ', expect';
  return content.replace(importRe, `import { ${withExpect} } from '@playwright/test';`);
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Avoid double-injecting on re-runs
  if (content.includes(marker)) {
    console.log(`Skipping (already injected): ${filePath}`);
    return false;
  }

  content = ensureExpectImport(content);

  // Ensure the file ends with a newline before appending
  if (!content.endsWith('\n')) content += '\n';
  content += afterEachSnippet;

  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

function collectSpecFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Respect Playwright's testIgnore: deprecated and basePage
      if (entry.name === 'deprecated' || entry.name === 'basePage') continue;
      collectSpecFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const specFiles = collectSpecFiles(testsDir);
let modified = 0;

for (const file of specFiles) {
  if (processFile(file)) {
    modified++;
    console.log(`Injected: ${file}`);
  }
}

console.log(`\nDone. Modified ${modified} of ${specFiles.length} .spec.ts files.`);
