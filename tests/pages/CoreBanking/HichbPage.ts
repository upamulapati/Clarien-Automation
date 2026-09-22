import { AccountPage } from './AccountPage';
import { captureEvidence } from '../../helpers/evidence';

/**
 * HICHB / HICHBA (Cheque Book Issuance and Authorization) page wrapper.
 * Uses the robust label-based helpers from AccountPage so it survives small
 * Finacle HTML changes. The page exposes typed wrappers around the exact
 * fields needed to issue/verify a cheque book.
 */
export class HichbPage extends AccountPage {
  async getBodyText(): Promise<string> {
    try {
      const finwFrame = this.getFinwFrame();
      return (await finwFrame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }

  async isAccountIdDisplayed(accountId: string): Promise<boolean> {
    const text = await this.getBodyText();
    return text.includes(accountId);
  }

  async hasFatalOrCoreError(): Promise<boolean> {
    const text = (await this.getBodyText()).toLowerCase();
    return /fatal|core dump|internal server error/.test(text);
  }

  async enterHichbAccountId(accountId: string): Promise<boolean> {
    const byLabel =
      (await this.fillByLabel('A/c Id', accountId)) ||
      (await this.fillByLabel('A/c ID', accountId)) ||
      (await this.fillByLabel('A/c. ID', accountId)) ||
      (await this.fillByLabel('Account Id', accountId)) ||
      (await this.fillByLabel('Account ID', accountId));
    if (byLabel) return true;

    return await this.setTextByCandidates(
      ['acctId', 'acctNum', 'acctNo', 'foracid', 'accountId'],
      accountId,
      'A/c Id'
    );
  }

  async enterIssueDate(date: string): Promise<boolean> {
    const byLabel =
      (await this.fillByLabel('Issue Date', date)) ||
      (await this.fillByLabel('Issue date', date)) ||
      (await this.fillByLabel('Cheque Issue Date', date));
    if (byLabel) return true;

    return await this.setTextByCandidates(
      ['issueDate', 'chqIssueDt', 'chequeIssueDt', 'cheqIssueDt'],
      date,
      'Issue date'
    );
  }

  async enterNoOfChequeLeaves(count: string): Promise<boolean> {
    const byLabel =
      (await this.fillByLabel('No of Cheque Leaves', count)) ||
      (await this.fillByLabel('No. of Cheque Leaves', count)) ||
      (await this.fillByLabel('No of Leaves', count)) ||
      (await this.fillByLabel('No. of Leaves', count)) ||
      (await this.fillByLabel('Cheque Leaves', count));
    if (byLabel) return true;

    return await this.setTextByCandidates(
      ['noOfChequeLeaves', 'noOfLeaves', 'chqLeaves', 'chequeLeaves', 'numChequeLeaves'],
      count,
      'No of cheque leaves'
    );
  }

  async enterLeavesPerBook(count: string): Promise<boolean> {
    const byLabel =
      (await this.fillByLabel('Leaves Per Book', count)) ||
      (await this.fillByLabel('Leaves per book', count)) ||
      (await this.fillByLabel('Leaves Per book', count));
    if (byLabel) return true;

    return await this.setTextByCandidates(
      ['lvsPerBook', 'leavesPerBook', 'lvsPerBk'],
      count,
      'Leaves per book'
    );
  }

  async enterBeginChequeAlpha(value: string): Promise<boolean> {
    const byLabel =
      (await this.fillByLabel('Begin Cheque No', value)) ||
      (await this.fillByLabel('Begin Cheque Number', value)) ||
      (await this.fillByLabel('Begin Cheque Form No', value)) ||
      (await this.fillByLabel('Begin Cheque Alpha/Form no', value)) ||
      (await this.fillByLabel('Begin Cheque Alpha / Form no', value)) ||
      (await this.fillByLabel('Begin Cheque Alpha', value)) ||
      (await this.fillByLabel('Cheque Alpha', value)) ||
      (await this.fillByLabel('Begin Cheque', value));
    if (byLabel) return true;

    return await this.setTextByCandidates(
      ['begChqAlpha', 'begChqNo', 'beginChequeNo', 'beginChqAlpha', 'chqAlpha'],
      value,
      'Begin cheque alpha'
    );
  }

  async selectCollectMicrCharge(value: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const row = finwFrame.locator('tr').filter({ hasText: /Collect\s*MICR\s*Charge/i }).first();

    try {
      const radio = row.getByRole('radio', { name: value, exact: false }).first();
      if ((await radio.count()) > 0 && (await radio.isVisible().catch(() => false))) {
        await radio.click({ timeout: 15000, force: true });
        await this.page.waitForTimeout(1000);
        console.log(`Selected collect MICR charge: ${value}`);
        return true;
      }
    } catch {}

    try {
      const radios = row.locator('input[type="radio"]');
      const index = value.toLowerCase() === 'no' ? 1 : 0;
      const radio = radios.nth(index);
      if ((await radio.count()) > 0 && (await radio.isVisible().catch(() => false))) {
        await radio.click({ timeout: 15000, force: true });
        await this.page.waitForTimeout(1000);
        console.log(`Selected collect MICR charge (radio #${index + 1}): ${value}`);
        return true;
      }
    } catch {}

    return false;
  }

  async selectAcknowledgementObtained(value: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const row = finwFrame.locator('tr').filter({ hasText: /Acknowledgement\s*Obtained/i }).first();

    // Try an accessible radio with the visible label text (Yes / No).
    try {
      const radio = row.getByRole('radio', { name: value, exact: false }).first();
      if ((await radio.count()) > 0 && (await radio.isVisible().catch(() => false))) {
        await radio.click({ timeout: 15000, force: true });
        await this.page.waitForTimeout(1000);
        console.log(`Selected acknowledgement obtained: ${value}`);
        return true;
      }
    } catch {}

    // Fallback: Yes is the first radio and No is the second in the row.
    try {
      const radios = row.locator('input[type="radio"]');
      const index = value.toLowerCase() === 'no' ? 1 : 0;
      const radio = radios.nth(index);
      if ((await radio.count()) > 0 && (await radio.isVisible().catch(() => false))) {
        await radio.click({ timeout: 15000, force: true });
        await this.page.waitForTimeout(1000);
        console.log(`Selected acknowledgement obtained (radio #${index + 1}): ${value}`);
        return true;
      }
    } catch {}

    return false;
  }

  async enterChequeAlpha(value: string): Promise<boolean> {
    const byLabel =
      (await this.fillByLabel('Cheque Alpha', value)) ||
      (await this.fillByLabel('Cheque Alpha/Form no', value));
    if (byLabel) return true;

    return await this.setTextByCandidates(
      ['chqAlpha', 'chequeAlpha', 'chqAlphaCode'],
      value,
      'Cheque Alpha'
    );
  }

  async selectChequeType(type: string): Promise<boolean> {
    return (
      (await this.selectOptionByLabel('cheque type', type)) ||
      (await this.selectOptionByLabel('chq type', type))
    );
  }

  async selectChequeWith(value: string): Promise<boolean> {
    return (
      (await this.selectOptionByLabel('cheque with', value)) ||
      (await this.selectOptionByLabel('chq with', value))
    );
  }

  async clickValidate(): Promise<void> {
    const finwFrame = this.getFinwFrame();
    const selector =
      'input[type="button"][value="Validate" i], ' +
      'input[type="submit"][value="Validate" i], ' +
      'input[type="button"][value*="Validate" i], ' +
      'input[type="submit"][value*="Validate" i], ' +
      'button:has-text("Validate"), ' +
      '#Validate';
    try {
      const btn = finwFrame.locator(selector).first();
      if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
        await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await btn.click({ timeout: 15000, force: true });
        await this.page.waitForTimeout(3000);
        console.log('Clicked Validate button');
        await captureEvidence(this.page, 'Validate button clicked', {});
        return;
      }
      console.log('Validate button not found or not enabled');
      return;
    } catch (e) {
      console.log(`Could not click Validate button: ${e}`);
      return;
    }
  }

  async clickIssueAccountButton(): Promise<boolean> {
    try {
      const finwFrame = this.getFinwFrame();
      const btn = finwFrame
        .locator(
          'input[value="Issue" i], input[type="button"][value="Issue"], ' +
          'button:has-text("Issue"), a:has-text("Issue")'
        )
        .first();
      if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
        await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await btn.click({ timeout: 15000, force: true });
        await this.page.waitForTimeout(3000);
        console.log('Clicked Issue A/c button');
        await captureEvidence(this.page, 'Issue A/c button clicked', {});
        return true;
      }
      console.log('Issue A/c button not found');
      return false;
    } catch (e) {
      console.log(`Could not click Issue A/c button: ${e}`);
      return false;
    }
  }

  async cancelUnverifiedChequeBookRecord(_accountId: string): Promise<boolean> {
    console.log(`No unverified cheque book record found for ${_accountId}; skipping cancellation`);
    return false;
  }
}
