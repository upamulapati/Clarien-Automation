import { Page, Dialog } from '@playwright/test';
import { AppConfig } from './crmTestData';
import { LoginPage } from '../pages/HomePages/LoginPage';

// =====================================================================
// Helper: Login to the application
// =====================================================================
export async function login(page: Page, config: AppConfig) {
  setupDialogHandlers(page);
  const loginPage = new LoginPage(page);
  const lf = page.frameLocator('iframe[name="loginFrame"]');

  for (let attempt = 0; attempt < 3; attempt++) {
    await loginPage.goto(config.baseUrl);
    await loginPage.login(config.username, config.password);
    await page.waitForTimeout(10000);

    // Check if appSelect is visible (normal login success)
    const appSelectVisible = await lf.locator('#appSelect').isVisible({ timeout: 5000 }).catch(() => false);
    if (appSelectVisible) {
      console.log('✓ appSelect visible after login');
      return;
    }

    // Handle "already logged in" scenarios (Reset Login page, errorPage.jsp)
    await loginPage.handleAlreadyLoggedIn(config.username, config.password);

    // Check appSelect again after handling
    const appSelectAfter = await lf.locator('#appSelect').isVisible({ timeout: 10000 }).catch(() => false);
    if (appSelectAfter) {
      console.log('✓ appSelect visible after session reset');
      return;
    }

    console.log(`⚠ appSelect not visible after login (attempt ${attempt + 1}/3)`);
    if (attempt < 2) await page.waitForTimeout(3000);
  }
  console.log('⚠ Login failed after all attempts — proceeding anyway');
}

// =====================================================================
// Helper: Setup dialog and popup handlers
// Auto-accepts all dialogs and logs messages. When lastDialogMessages
// is provided, messages are also tracked in that array (used by CRM
// flows that inspect dialog text for CIF IDs or confirmations).
// =====================================================================
export function setupDialogHandlers(page: Page, lastDialogMessages?: string[]) {
  page.on('dialog', async (d: Dialog) => {
    const msg = d.message();
    lastDialogMessages?.push(msg);
    console.log(`Dialog message: ${msg.substring(0, 150)}`);
    await d.accept().catch(() => {});
  });

  page.on('popup', async popup => {
    try {
      await new Promise(r => setTimeout(r, 500));
      if (popup.isClosed()) return;
      const url = popup.url();
      console.log(`Global popup handler: ${url.substring(url.lastIndexOf('/') + 1).substring(0, 80)}`);
      popup.on('dialog', async (dialog) => {
        const msg = dialog.message();
        console.log(`Popup dialog: "${msg}"`);
        lastDialogMessages?.push(msg);
        await dialog.accept().catch(() => {});
      });
    } catch (_) {}
  });
}
