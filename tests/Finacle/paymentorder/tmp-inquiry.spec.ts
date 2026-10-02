import { test } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { PaymentOrderPage } from '../../pages/CoreBanking/PaymentOrderPage';
import { CREDENTIALS } from '../../../data/credentials';
import { setupDialogHandlers } from '../../config/crmSetup';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

test('Manual HPORDM inquiry - dump FX fields', async ({ page }) => {
  test.setTimeout(300000);
  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page);
  const paymentOrderPage = new PaymentOrderPage(page);

  console.log('Selecting Core Server...');
  await accountPage.selectCoreServer();

  console.log('Searching for HPORDM...');
  await accountPage.searchTransactionManagement('HPORDM');
  await page.waitForTimeout(8000);

  console.log('Selecting Verify function...');
  await accountPage.selectFunction('V');

  console.log('Entering Payment Order ID: 000000471730');
  await paymentOrderPage.enterPaymentOrderId('000000471730');
  await paymentOrderPage.getFinwFrame().locator('#pymtRefNum').press('Tab');
  await page.waitForTimeout(1000);
  await paymentOrderPage.clickGo();
  await page.waitForTimeout(5000);

  const finw = paymentOrderPage.getFinwFrame();
  const fx = await finw.evaluate(() => {
    const get = (n: string) => {
      const el = document.querySelector(`[name="${n}"]`) as any;
      return el ? { value: el.value, disabled: el.disabled } : null;
    };
    const customData = (document.querySelector('input[name="customData"]') as any)?.value;
    return {
      customData,
      exchRateCode: get('pordm.exchRateCode'),
      drexchRateCode: get('pordm.drexchRateCode'),
      chrgExchRateCode: get('pordm.chrgExchRateCode'),
      exchRate: get('pordm.exchRate'),
      drexchRate: get('pordm.drexchRate'),
      chrgExchRate: get('pordm.chrgExchRate'),
      tresExchRate: get('pordm.tresExchRate'),
    };
  });
  console.log('Manual inquiry FX state:', JSON.stringify(fx));

  await paymentOrderPage.dumpFinwHtml('manual-inquiry.html');
  console.log('Dumped manual inquiry HTML to manual-inquiry.html');

  await homePage.logout();
});
