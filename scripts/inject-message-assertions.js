const fs = require('fs');
const path = require('path');

const DRY_RUN = process.env.DRY_RUN === '1';
const ONLY_FILE = process.env.ONLY_FILE || '';
const TESTS_DIR = path.resolve(__dirname, '..', 'tests');
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'test-results', 'Clarien-Automation']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      out.push(...walk(full));
    } else if (entry.name.endsWith('.spec.ts')) {
      if (!ONLY_FILE || full.includes(ONLY_FILE)) out.push(full);
    }
  }
  return out;
}

function getExpectedRegex(filePath, testTitles) {
  const lowerPath = filePath.toLowerCase();
  const lowerTitles = testTitles.map(t => t.toLowerCase()).join(' ');
  const combined = lowerPath + ' ' + lowerTitles;

  if (/error|invalid|negative|fail|unauthorized|duplicate|rejected/.test(combined)) {
    return '/error|failed|cannot|invalid|rejected/i';
  }

  const rules = [
    { test: /verification|verify/, regex: '/verified/i' },
    { test: /modify|modification/, regex: '/modified|updated/i' },
    { test: /closure|close/, regex: '/closed/i' },
    { test: /delete|deletion/, regex: '/deleted/i' },
    { test: /add[^d]|addition/, regex: '/added/i' },
    { test: /creation|create|opened/, regex: '/created|opened|generated/i' },
    { test: /suspension|suspend/, regex: '/saved|suspended/i' },
    { test: /freeze|unfreeze/, regex: '/freeze|successfully/i' },
    { test: /transfer|post|funding/, regex: '/posted|successfully/i' },
    { test: /remittance|payment|demanddraft|dd/, regex: '/added successfully|verified|success/i' },
    { test: /standinginstruction|collateral|loan|cif|corporate|retail/, regex: '/successfully/i' },
  ];

  for (const rule of rules) {
    if (rule.test.test(combined)) return rule.regex;
  }

  return '/successfully/i';
}

function ensureExpectImport(content) {
  if (/import\s+.*\bexpect\b/.test(content)) return content;
  if (/import\s+\{\s*test\s*\}\s+from\s+['"]@playwright\/test['"]/.test(content)) {
    return content.replace(
      /import\s+\{\s*test\s*\}\s+from\s+(['"])@playwright\/test\1/,
      `import { test, expect } from '@playwright/test'`
    );
  }
  if (/import\s+\{\s*test,/.test(content) && !/import\s+\{\s*test,\s*expect/.test(content)) {
    return content.replace(/import\s+\{\s*test,/, `import { test, expect,`);
  }
  return `import { expect } from '@playwright/test';\n` + content;
}

function findPageObjectVar(content, testStart, testEnd) {
  const prefix = content.slice(0, testEnd);
  const assignments = [...prefix.matchAll(/(?:const|let)\s+(\w+)\s*[:=]\s*new\s+(\w+Page)\(page\)/g)];
  if (assignments.length) return assignments[assignments.length - 1][1];
  const decls = [...prefix.matchAll(/(?:const|let)\s+(\w+)\s*:\s*(\w+Page)\s*;/g)];
  if (decls.length) return decls[decls.length - 1][1];
  return null;
}

function escapeForRegexString(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  const testTitles = [...content.matchAll(/test\(['"]([^'"]+)['"]/g)].map(m => m[1]);
  const expectedRegex = getExpectedRegex(filePath, testTitles);

  // Track which variables have already been guarded to avoid duplicate assertions.
  const guarded = new Set();

  // Pattern 1: const/let <var> = await <something>getStatusMessage() / getPageText() / verifyAccountCreated();
  content = content.replace(
    /([ \t]*)(?:const|let)\s+(\w+)\s*=\s*await\s+([\w.]+(?:getStatusMessage|getPageText|verifyAccountCreated)\([^)]*\));\n/g,
    (match, indent, varName, callExpr, offset) => {
      if (guarded.has(varName)) return match;
      if (new RegExp('\\bexpect\\(\\s*' + varName + '\\b').test(original)) {
        guarded.add(varName);
        return match;
      }
      const block =
        `${match}` +
        `${indent}if (!${varName}) { throw new Error('No status message captured for ${varName} in ${path.basename(filePath)}'); }\n` +
        `${indent}expect(${varName}).toMatch(${expectedRegex});\n`;
      guarded.add(varName);
      return block;
    }
  );

  // Pattern 2: console.log(... result.message / result.statusMessage ...)
  const resultLogRe = /([ \t]*)console\.log\(['"]([^'"]*)['"],\s*(\w+\.(?:message|statusMessage))\);\n/g;
  content = content.replace(resultLogRe, (match, indent, label, expr, offset) => {
    if (guarded.has(expr)) return match;
    if (new RegExp('\\bexpect\\(\\s*' + escapeForRegexString(expr) + '\\b').test(original)) {
      guarded.add(expr);
      return match;
    }
    const varName = expr.split('.')[0];
    const block =
      `${match}` +
      `${indent}if (!${varName} || !${expr}) { throw new Error('No result captured for ${expr} in ${path.basename(filePath)}'); }\n` +
      `${indent}expect(${expr}).toMatch(${expectedRegex});\n`;
    guarded.add(expr);
    return block;
  });

  // Pattern 3: add end-of-test status capture for test blocks that still don't assert a message
  const testBlockRe = /test(?:\.skip|\.only|\.fixme)?\(['"]([^'"]+)['"],?\s*async\s*\(\{\s*page\s*\}\)\s*=>\s*\{/g;
  let match;
  while ((match = testBlockRe.exec(original)) !== null) {
    const startIdx = match.index;
    let braceDepth = 1;
    let i = match.index + match[0].length;
    while (i < original.length && braceDepth > 0) {
      if (original[i] === '{') braceDepth++;
      else if (original[i] === '}') braceDepth--;
      i++;
    }
    const endIdx = i;
    const testBody = original.slice(startIdx, endIdx);
    if (!/getStatusMessage|getPageText|verifyAccountCreated/.test(testBody)) {
      const pageVar = findPageObjectVar(original, startIdx, endIdx);
      if (pageVar && !new RegExp(`\\b${pageVar}\\.getStatusMessage\\(\\)`).test(testBody)) {
        // Find the last logout line or the closing brace.
        const logoutRe = new RegExp(`([ \t]*)(await\s+\\w+\\.logout\\([^\\)]*\\);)`, 'g');
        const logoutMatch = [...testBody.matchAll(logoutRe)].pop();
        if (logoutMatch) {
          const globalLogoutOffset = startIdx + logoutMatch.index;
          const indent = logoutMatch[1];
          const inject =
            `${indent}// Capture and assert the final Finacle status message\n` +
            `${indent}const _statusMessage = await ${pageVar}.getStatusMessage();\n` +
            `${indent}console.log('Final Finacle status message:', _statusMessage);\n` +
            `${indent}if (!_statusMessage) { throw new Error('No status message captured in test "${match[1]}"'); }\n` +
            `${indent}expect(_statusMessage).toMatch(${expectedRegex});\n`;
          const before = original.slice(0, globalLogoutOffset);
          const after = original.slice(globalLogoutOffset);
          content = before + inject + after;
        }
      }
    }
  }

  content = ensureExpectImport(content);

  if (content !== original) {
    if (DRY_RUN) {
      console.log(`[DRY-RUN] Would modify: ${filePath}`);
    } else {
      try {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
      } catch (err) {
        console.error(`ERROR writing ${filePath}:`, err.message);
        return 0;
      }
    }
    return 1;
  }
  return 0;
}

const files = walk(TESTS_DIR);
let modified = 0;
for (const file of files) {
  modified += processFile(file);
}
console.log(DRY_RUN ? `Would modify ${modified} of ${files.length} files.` : `Modified ${modified} of ${files.length} files.`);
