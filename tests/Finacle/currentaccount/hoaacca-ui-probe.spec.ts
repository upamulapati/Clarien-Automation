import { test, expect, Page } from '@playwright/test';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { CREDENTIALS } from '../../../data/credentials';
import COMMON_DATA from '../../../data/common-data.json';
import { captureEvidence } from '../../helpers/evidence';
import * as fs from 'fs';

async function dumpTabInfo(page: Page, label: string) {
  const finw = page.frame({ name: 'FINW' });
  if (!finw) {
    console.warn(`FINW frame missing for ${label}`);
    return;
  }
  const bodyText = await finw.locator('body').innerText().catch((e) => String(e));
  const bodyHtml = await finw.locator('body').innerHTML().catch((e) => String(e));
  const info = test.info();
  const safe = label.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const textPath = info.outputPath(`hoaacca-${safe}.txt`);
  const htmlPath = info.outputPath(`hoaacca-${safe}.html`);
  await fs.promises.writeFile(textPath, `=== ${label} BODY TEXT ===\n\n${bodyText}`, 'utf8').catch(() => {});
  await fs.promises.writeFile(htmlPath, bodyHtml, 'utf8').catch(() => {});
  await captureEvidence(page, label);
  console.log(`\n--- ${label} ---`);
  console.log(bodyText.substring(0, 1200));
}

test('HOAACCA UI probe - capture tabs and HTML', async ({ page }) => {
  test.setTimeout(300000);
  await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);

  const accountPage = new AccountPage(page);
  await accountPage.selectCoreServer();
  await page.waitForTimeout(2000);
  await accountPage.searchMenu(COMMON_DATA.currentAccount.screens.create);

  const data = {
    functionOption: 'O',
    ccy: 'BMD',
    solId: '100',
    cifCode: '0002040146',
    schemeCode: 'CAREG',
  };

  await accountPage.fillBasicAccountDetails(data as any);
  await accountPage.selectSchemeCode(data.schemeCode);
  await page.waitForTimeout(2000);
  await dumpTabInfo(page, '00-basic-details');

  await accountPage.acceptButton.click();
  await page.waitForTimeout(5000);
  await dumpTabInfo(page, '01-after-accept');

  const tabMethods: { label: string; method: string }[] = [
    { label: '02-general-details', method: 'visitGeneralDetailsTab' },
    { label: '03-interest-details', method: 'visitInterestDetailsTab' },
    { label: '04-scheme-details', method: 'visitSchemeDetailsTab' },
    { label: '05-related-party', method: 'visitRelatedPartyTab' },
    { label: '06-mis-codes', method: 'visitMiscodesTab' },
    { label: '07-account-limits', method: 'visitAccountLimitsTab' },
    { label: '08-others', method: 'visitOthersTab' },
    { label: '09-nomination', method: 'visitNominationDetailsTab' },
    { label: '10-document', method: 'visitDocumentDetailsTab' },
  ];

  for (const tab of tabMethods) {
    try {
      await (accountPage as any)[tab.method]();
      await page.waitForTimeout(3500);
      await dumpTabInfo(page, tab.label);
    } catch (e: any) {
      console.warn(`Skipping tab ${tab.label}: ${e.message}`);
    }
  }

  // Force a failure so the artifacts are retained in Allure / HTML reports
  expect(true).toBe(false);
});
