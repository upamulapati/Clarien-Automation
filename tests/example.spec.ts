import { test, expect } from '@playwright/test';

test('login to Clarien Bank', async ({ page }) => {
  // Navigate to the login page
  await page.goto('https://clrnuat.clarienbank.com/fininfra/ui/SSOLogin.jsp');

  // Fill in username
  await page.fill('input[name="username"], input[type="text"], #username', 'finacletest01');

  // Fill in password
  await page.fill('input[name="password"], input[type="password"], #password', 'clarien@123');

  // Click login button
  await page.click('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")');

  // Wait for navigation or successful login indication
  await page.waitForLoadState('networkidle');

  // Verify login was successful (adjust selector based on actual logged-in page)
  await expect(page).toHaveURL(/.*dashboard|.*home|.*welcome/i);
});
