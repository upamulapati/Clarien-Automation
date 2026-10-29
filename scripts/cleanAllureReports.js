const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function isPermissionError(err) {
  return err && (err.code === 'EPERM' || err.code === 'EACCES');
}

function shellRemove(targetPath) {
  try {
    if (process.platform === 'win32') {
      execFileSync('cmd', ['/c', `rmdir /s /q "${targetPath}"`], { stdio: 'ignore' });
    } else {
      execFileSync('rm', ['-rf', targetPath], { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

function safeEmptyDir(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        safeEmptyDir(full);
        fs.rmdirSync(full);
      } else {
        fs.unlinkSync(full);
      }
    } catch (err) {
      if (isPermissionError(err)) {
        try {
          fs.chmodSync(full, entry.isDirectory() ? 0o777 : 0o666);
          if (entry.isDirectory()) {
            safeEmptyDir(full);
            fs.rmdirSync(full);
          } else {
            fs.unlinkSync(full);
          }
        } catch {
          // File is still locked (e.g. by a browser or allure server); leave it.
        }
      }
    }
  }

  try {
    fs.rmdirSync(dir);
  } catch {
    // Directory contains locked files; that is acceptable.
  }
}

function cleanAllureReports() {
  const paths = ['reports/allureReports', 'reports/allure-report'];
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;

    if (shellRemove(p)) {
      console.log(`[cleanAllureReports] removed ${p}`);
    } else {
      console.log(`[cleanAllureReports] ${p} is locked/read-only; removing files individually...`);
      safeEmptyDir(p);
      console.log(`[cleanAllureReports] emptied ${p}`);
    }
  }

  fs.mkdirSync('reports/allureReports', { recursive: true });
}

async function globalSetup() {
  try {
    cleanAllureReports();
  } catch (err) {
    console.warn(`[cleanAllureReports] unable to fully clean stale results: ${err.message}`);
  }
}

module.exports = globalSetup;

if (require.main === module) {
  globalSetup().catch((err) => {
    console.error('[cleanAllureReports] failed:', err);
    process.exit(1);
  });
}
