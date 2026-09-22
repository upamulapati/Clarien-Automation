import { test, expect } from '@playwright/test';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';

async function logBodyText(page: any, label: string) {
  const finw = page.frame({ name: 'FINW' });
  const login = page.frame({ name: 'loginFrame' });
  const finwText = finw ? await finw.locator('body').innerText().catch((e: any) => String(e)) : 'NO FINW';
  const loginText = login ? await login.locator('body').innerText().catch((e: any) => String(e)) : 'NO LOGIN';
  console.log(`\n--- ${label} ---`);
  console.log('FINW first 1500 chars:', finwText.substring(0, 1500));
  console.log('loginFrame first 1500 chars:', loginText.substring(0, 1500));
}

test('probe menu codes for standing instruction', async ({ page }) => {
  test.setTimeout(180000);
  await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page);
  await accountPage.selectCoreServer();
  await page.waitForTimeout(5000);

  await logBodyText(page, 'after selectCoreServer');

  const loginFrame = page.frame({ name: 'loginFrame' });
  if (!loginFrame) throw new Error('loginFrame not found');

  // Inspect menu search area
  const menu = loginFrame.locator('#menuSelect');
  const parentHtml = await menu.evaluate((el: any) => {
    const p = el.parentElement;
    return p ? p.innerHTML.substring(0, 2000) : 'no parent';
  });
  console.log('\n--- menuSelect parent HTML ---');
  console.log(parentHtml);

  const candidates = ['HSIM', 'HSTM', 'HSTD', 'HSTDM', 'STDM', 'HSTDI', 'HSIMM', 'HSSM'];
  for (const code of candidates) {
    console.log(`\n>>> Trying menu code: ${code}`);
    await menu.fill(code);
    await menu.press('Enter');
    await page.waitForTimeout(5000);
    await logBodyText(page, `after menu ${code}`);
  }

  // Try typing a label instead
  console.log('\n>>> Trying label: Standing Instruction');
  await menu.fill('Standing Instruction');
  await menu.press('Enter');
  await page.waitForTimeout(5000);
  await logBodyText(page, 'after label Standing Instruction');

  expect(true).toBe(false); // Force failure to keep artifacts
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
