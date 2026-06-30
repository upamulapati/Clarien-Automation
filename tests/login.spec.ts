import { test } from '@playwright/test';
import { loginToFinacle } from './helpers/finacleSetup';
import { HomePage } from './pages/HomePages/HomePage';
import { CREDENTIALS } from '../data/credentials';

const USERNAME = CREDENTIALS.credentials.username;
const PASSWORD = CREDENTIALS.credentials.password;

test('login and navigate to Entity Queue in CRM', async ({ page }) => {
  test.setTimeout(180000);

  const { homePage } = await loginToFinacle(page, USERNAME, PASSWORD);

  // Select CRM module from home page
  console.log('Selecting CRM...');
  await homePage.selectCRM();

  // Navigate to CIF Retail via Functionmain frame
  console.log('Navigating to CIF Retail...');
  const functionmainFrame = page.frame({ name: 'Functionmain' });
  if (functionmainFrame) {
    await functionmainFrame.evaluate(() => document.getElementById('screen1')?.click());
    await page.waitForTimeout(3000);
  }

  // Navigate to Entity Queue via frame 1504
  console.log('Navigating to Entity Queue...');
  const frame1504 = page.frame({ name: '1504' });
  if (frame1504) {
    await frame1504.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const s of spans) {
        if (s.textContent?.includes('Entity Queue')) { s.click(); break; }
      }
    });
    await page.waitForTimeout(3000);
  }

  // Logout from home page
  console.log('Logging out...');
  await homePage.logout();
});
