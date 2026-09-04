import { expect, Frame, Page } from '@playwright/test';
import { AccountPage } from './AccountPage';

export class TermDepositSpflowPage extends AccountPage {
  constructor(page: Page) {
    super(page);
  }

  private finw(): Frame {
    const frame = this.page.frame({ name: 'FINW' });
    if (!frame) throw new Error('FINW frame not found');
    return frame;
  }

  private async selectSpflowFunction(value: string, labelRegex: RegExp) {
    const finwFrame = this.finw();
    const selected = await finwFrame.evaluate(({ value, labelSource, labelFlags }) => {
      const optionLabel = new RegExp(labelSource, labelFlags);
      const dropdown = Array.from(document.querySelectorAll('select')).find(select =>
        Array.from((select as HTMLSelectElement).options).some(option => option.value === value || optionLabel.test(option.text))
      ) as HTMLSelectElement | undefined;
      if (!dropdown) return optionLabel.test(document.body?.innerText ?? '');
      const option = Array.from(dropdown.options).find(item => item.value === value || optionLabel.test(item.text));
      if (!option) return false;
      dropdown.value = option.value;
      dropdown.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, { value, labelSource: labelRegex.source, labelFlags: labelRegex.flags });
    if (!selected) throw new Error(`Unable to select function ${value}`);
    await this.page.waitForTimeout(1000);
  }

  private async clickSpflowGo() {
    const go = this.finw().locator('#Go, input[value="Go" i], button:has-text("Go")').first();
    await go.waitFor({ state: 'visible', timeout: 15000 });
    await go.click();
    await this.page.waitForTimeout(4000);
  }

  private async clickSpflowTab(label: string) {
    const tab = this.finw().locator('a, button, input[type="button"]').filter({ hasText: new RegExp(label, 'i') }).first();
    if (await tab.count() === 0) throw new Error(`Tab '${label}' was not found`);
    await tab.click();
    await this.page.waitForTimeout(2000);
  }

  private async setInputByIds(ids: string[], value: string) {
    const selectors = ids.map(id => `#${id}`).join(', ');
    const partialSelectors = ids.map(id => `input[id*="${id}" i], input[name*="${id}" i]`).join(', ');
    const input = this.finw().locator(`${selectors}, ${partialSelectors}`).first();
    await input.waitFor({ state: 'visible', timeout: 15000 });
    await input.fill(value);
    await input.press('Tab');
  }

  private async submitAndAccept() {
    const submit = this.finw().locator('#Submit, input[value="Submit" i], button:has-text("Submit")').first();
    await submit.waitFor({ state: 'visible', timeout: 15000 });
    await submit.click();
    await this.page.waitForTimeout(3000);
    await this.acceptWarningPopup().catch(() => {});
    await this.page.waitForTimeout(2500);
    await this.acceptWarningPopup().catch(() => {});
    await this.page.waitForTimeout(2000);
  }

  async modifyInterestOutflow(accountId: string, startDate: string, modifyScreen: string): Promise<void> {
    await this.selectCoreServer();
    await this.searchMenu(modifyScreen);
    await this.selectSpflowFunction('M', /modify/i);
    await this.setInputByIds(['acctId', 'acid', 'acId'], accountId);
    await this.clickSpflowGo();

    await this.clickSpflowTab('Flow');
    const finwFrame = this.finw();
    const modifyHeader = finwFrame.locator('#modifyHeader, #ModifyHeader, input[value="Modify Header" i], button:has-text("Modify Header")').first();
    await modifyHeader.waitFor({ state: 'visible', timeout: 15000 });
    await modifyHeader.click();
    await this.page.waitForTimeout(1000);

    const interestOutflowRow = finwFrame.locator('tr:has(> td:text-is("IO / Interest Outflow"))');
    const interestOutflowStartDate = interestOutflowRow.locator('input').first();
    const interestOutflowCalendar = interestOutflowRow.locator('a[href*="startDate_ui"]').first();
    await interestOutflowCalendar.waitFor({ state: 'visible', timeout: 15000 });

    const calendarPopupPromise = this.page.context().waitForEvent('page', { timeout: 10000 }).catch(() => null);
    await interestOutflowCalendar.click();
    const calendarPopup = await calendarPopupPromise;
    if (calendarPopup && !calendarPopup.isClosed()) await calendarPopup.close();

    await interestOutflowStartDate.waitFor({ state: 'visible', timeout: 15000 });
    await interestOutflowStartDate.fill(startDate);
    await interestOutflowStartDate.dispatchEvent('change');
    await interestOutflowStartDate.dispatchEvent('blur');
    await interestOutflowStartDate.press('Tab');
    await expect(interestOutflowStartDate).toHaveValue(startDate);

    const recomputeFlows = finwFrame.locator('#recomputeFlows, #RecomputeFlows, input[value="Recompute Flows" i], button:has-text("Recompute Flows")').first();
    await recomputeFlows.waitFor({ state: 'visible', timeout: 15000 });
    await recomputeFlows.click();
    await this.page.waitForTimeout(3000);
    await expect(interestOutflowRow.locator('input').first()).toHaveValue(startDate);

    await this.page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('a')).filter(tab => {
        const text = (tab.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
        const bounds = (tab as HTMLElement).getBoundingClientRect();
        return text === 'scheme' && bounds.width > 0 && bounds.height > 0;
      });
      const schemeTab = tabs[tabs.length - 1] as HTMLElement | undefined;
      if (schemeTab) schemeTab.click();
    });
    await this.page.waitForTimeout(3000);
    await expect(finwFrame.locator('body')).toContainText(/Deposit Type/i);

    await this.submitAndAccept();
  }

  async verifySpFlow(accountId: string, verifyScreen: string): Promise<void> {
    await this.selectCoreServer();
    await this.searchMenu(verifyScreen);
    await this.selectSpflowFunction('V', /verify/i);
    await this.setInputByIds(['tempForacid', 'acctId', 'acid', 'acId'], accountId);
    await this.clickSpflowGo();

    for (const tab of ['General', 'Interest & Tax', 'Scheme']) await this.clickSpflowTab(tab);
    for (const tab of ['Flow', 'Renewal', 'Related Party']) await this.clickSpflowTab(tab);
    await this.submitAndAccept();
  }

  async inquirySpFlow(accountId: string, inquiryScreen: string): Promise<string> {
    await this.selectCoreServer();
    await this.searchMenu(inquiryScreen);
    await this.selectSpflowFunction('I', /inquire/i);
    await this.setInputByIds(['acctId', 'acid', 'acId'], accountId);
    await this.clickSpflowGo();

    await this.clickSpflowTab('Flow');
    const persistedInterestOutflowStartDate = this.finw().locator('tr:has(> td:text-is("IO / Interest Outflow")) input').first();
    await persistedInterestOutflowStartDate.waitFor({ state: 'visible', timeout: 15000 });
    return await persistedInterestOutflowStartDate.inputValue();
  }

  async clickOk(): Promise<void> {
    const ok = this.finw().locator('#OK, input[value="OK" i], button:has-text("OK")').first();
    if (await ok.count() > 0 && await ok.isVisible().catch(() => false)) {
      await ok.click();
      await this.page.waitForTimeout(1000);
    }
  }
}
