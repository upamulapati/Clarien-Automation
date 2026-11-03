import { Page } from '@playwright/test';
import { AccountPage } from './AccountPage';
import { DEFAULT_CUSTOMER } from '../../config/testData';
import COMMON_DATA from '../../../data/common-data.json';
import { getApplicationDate } from '../../helpers/common';

export interface LodgeResult {
  type: string;
  collateralId: string | null;
  statusMessage: string | null;
  error?: string | null;
}

/**
 * Page object model for HCLM (Collateral Lodgement) across all collateral types.
 * Each lodge method performs the complete HCLM flow, captures the generated
 * collateral ID and returns the on-screen status message so the spec can apply
 * hard assertions and continue with the next collateral type.
 */
export class CollateralLodgePage extends AccountPage {
  private scenarioData?: any;

  constructor(page: Page) {
    super(page);
  }

  setScenarioData(data: any): void {
    this.scenarioData = data;
  }

  private getData(key: string, fallback: string): string {
    return (this.scenarioData?.[key] ?? fallback) as string;
  }

  private async fillByAnyLabelSafe(labels: string[], value: string): Promise<boolean> {
    for (const label of labels) {
      if (await this.fillByLabel(label, value)) return true;
    }
    return false;
  }

  private async selectByLabel(label: string, option: string, nth = 0): Promise<boolean> {
    if (await this.selectOptionByLabel(label, option)) return true;

    const finwFrame = this.getFinwFrame();
    const selects = finwFrame.locator('select:visible');
    const count = await selects.count();
    const lblKey = label.toLowerCase();
    const matched: any[] = [];
    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);
      if (await sel.isDisabled().catch(() => true)) continue;
      const meta = await sel.evaluate(el => {
        const s = el as HTMLSelectElement;
        const row = el.closest('tr');
        return { id: s.id, near: (row?.innerText || '').toLowerCase() };
      }).catch(() => ({ id: '', near: '' }));
      if (meta.near.includes(lblKey) || (meta.id || '').toLowerCase().includes(lblKey.replace(/\s/g, ''))) {
        matched.push(sel);
      }
    }
    if (matched.length === 0) return false;
    const target = matched[Math.min(nth, matched.length - 1)];
    const opts = await target.locator('option').allTextContents();
    const kw = option.toLowerCase();
    const match =
      opts.find((o: string) => o.toLowerCase() === kw) ||
      opts.find((o: string) => o.toLowerCase().startsWith(kw + ' -')) ||
      opts.find((o: string) => o.toLowerCase().includes(kw));
    if (!match) return false;
    try {
      await target.selectOption({ label: match }, { timeout: 8000 });
      console.log(`Selected '${match}' for '${label}' via dropdown scan`);
      return true;
    } catch {
      try {
        await target.selectOption(match.split('-')[0].trim(), { timeout: 8000 });
        console.log(`Selected '${match}' for '${label}' by option value`);
        return true;
      } catch {
        return false;
      }
    }
  }

  private async setNatureOfCharge(keyword: string): Promise<void> {
    const popup = await this.clickLookupIconByLabel('Nature of Charge');
    if (popup) {
      try {
        await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        await popup.waitForTimeout(2000);
        const frames = [popup.mainFrame(), ...popup.frames().filter(f => f !== popup.mainFrame())];
        for (const frame of frames) {
          const searchInput = frame.locator('input[type="text"]').first();
          if (await searchInput.count() > 0 && await searchInput.isVisible().catch(() => false)) {
            await searchInput.fill(keyword);
            await frame.locator('input[type="submit"], input[type="button"], button, a').filter({ hasText: /search|go|submit|ok/i }).first().click({ timeout: 10000 }).catch(() => {});
            await popup.waitForTimeout(2000);
            break;
          }
        }
        let selected = false;
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped.replace(/\s+/g, '\\s*'), 'i');
        for (const frame of frames) {
          const link = frame.locator('a').filter({ hasText: regex }).first();
          if (await link.count() > 0 && await link.isVisible().catch(() => false)) {
            await link.click({ timeout: 10000 });
            selected = true;
            break;
          }
          const td = frame.locator('td').filter({ hasText: regex }).first();
          if (await td.count() > 0 && await td.isVisible().catch(() => false)) {
            await td.click({ timeout: 10000 });
            selected = true;
            break;
          }
        }
        if (!selected) {
          for (const frame of frames) {
            const firstLink = frame.locator('table td a').first();
            if (await firstLink.count() > 0 && await firstLink.isVisible().catch(() => false)) {
              await firstLink.click({ timeout: 10000 });
              console.log('Clicked first Nature of Charge link in popup as fallback');
              break;
            }
          }
        }
        await popup.waitForTimeout(1500);
        if (!popup.isClosed()) {
          await popup.close().catch(() => {});
        }
        await this.page.waitForTimeout(2000);
        console.log(`Selected Nature of Charge via lookup: ${keyword}`);
        return;
      } catch (e) {
        console.log(`Nature of Charge lookup failed, falling back to direct fill: ${e}`);
      }
    }
    const ok = await this.fillByAnyLabelSafe(['Nature of Charge'], keyword);
    if (!ok) {
      await this.setTextByCandidates(['natureOfCharge', 'clpar.natureOfCharge'], keyword, 'Nature of Charge');
    }
  }

  private async setVehicleCollateralValue(value: string): Promise<void> {
    const ok = await this.setTextByCandidates(['coltrlValue', 'clpar.coltrlValue', 'collateralValue'], value, 'Collateral Value');
    if (!ok) {
      await this.fillByAnyLabelSafe(['Collateral Value', 'Value'], value);
    }
  }

  private async invokeHclmMenu() {
    await this.selectCoreServer();
    await this.page.waitForTimeout(3000);
    await this.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
    await this.page.waitForTimeout(3000);
  }

  private async hclmStart(type: string) {
    const typeAliases: Record<string, string> = {
      'Transactional Accounts': 'Transaction accounts',
    };
    const selectedType = typeAliases[type] ?? type;
    await this.invokeHclmMenu();
    await this.selectCollateralDropdown('Lodge');
    await this.selectCollateralDropdown(selectedType);
    await this.clickGo();
    await this.page.waitForTimeout(3000);
    await this.visitLoanTab('General', 'general');
    await this.logVisibleFields(`HCLM General tab - ${type}`);
  }

  private async setGeneralBase(
    code: string,
    ceiling: string,
    status: string = 'Normal',
    chargeRegistration: string = 'No'
  ) {
    await this.setCollateralCode(code);
    await this.setCeilingLimitPerLinkage(ceiling);
    await this.setCollateralStatus(status);
    await this.setCollateralChargeRegistrationRequired(chargeRegistration);
    await this.page.waitForTimeout(2000);
  }

  private async validateHclm() {
    const finwFrame = this.getFinwFrame();
    const validateBtn = finwFrame.locator('input[type="button"][value="Validate" i], input[type="submit"][value="Validate" i], button:has-text("Validate"), a:has-text("Validate")').last();
    if (await validateBtn.count() > 0) {
      await validateBtn.click({ timeout: 15000 });
      console.log('Clicked Validate (bottom)');
    } else {
      console.log('Validate button not found');
    }
    await this.page.waitForTimeout(3000);
    await this.waitForFinwFrame(10000);
  }

  private async captureResult(type: string): Promise<LodgeResult> {
    await this.acceptWarningPopup(2);
    await this.logScreenMessages();

    // submitForm/clickOkButton stores the pre-OK confirmation text; it is the
    // most reliable source because Finacle removes the message after OK is pressed.
    const statusMessage = this.capturedPopupMessage ?? await this.getStatusMessage();
    let collateralId = await this.getGeneratedCollateralId();

    if (!collateralId && statusMessage) {
      const match = statusMessage.match(/collateral\s*id\s*[-=:]?\s*([A-Z]{2,}\d{2,})/i);
      if (match) collateralId = match[1].trim();
    }

    if (!collateralId) {
      return {
        type,
        collateralId: null,
        statusMessage,
        error: `No collateral ID generated for ${type}. Last status message: ${statusMessage}`,
      };
    }

    await this.clickOkButton();
    await this.clickAccept();
    await this.logScreenMessages();
    return { type, collateralId, statusMessage };
  }

  private async submitAndCapture(type: string): Promise<LodgeResult> {
    await this.submitForm();
    await this.page.waitForTimeout(3000);
    return this.captureResult(type);
  }

  // ===================== Deposits =====================
  async lodgeDepositsCollateral(): Promise<LodgeResult> {
    const type = 'Deposits';
    try {
      await this.hclmStart(type);
      await this.setGeneralBase(this.getData('collateralCode', 'CBLT1BMD'), this.getData('ceilingLimit', '500'));
      await this.visitLoanTab('Particulars', 'particulars', 'Full Benefit');
      await this.logVisibleFields('Deposit Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({
        lodgedDate: today,
        reviewDate: today,
        receivedDate: today,
        depositAccountId: this.getData('depositAccountId', '9200000614'),
        fullBenefit: this.getData('fullBenefit', 'no'),
      });
      return await this.submitAndCapture(type);
    } catch (e: any) {
      return { type, collateralId: null, statusMessage: null, error: e.message || String(e) };
    }
  }

  // ===================== Immovable Property =====================
  async lodgeImmovablePropertyCollateral(): Promise<LodgeResult> {
    const type = 'Immovable Property';
    try {
      await this.hclmStart(type);
      await this.setGeneralBase(this.getData('collateralCode', 'DBLD1BMD'), this.getData('ceilingLimit', '500'));
      await this.fillByAnyLabelSafe(['Margin Pct', 'Margin %', 'Margin Percent'], this.getData('marginPct', '100'));

      await this.visitLoanTab('Particulars', 'particulars');
      await this.logVisibleFields('Immovable Property Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.setCollateralDueDate(today);
      await this.setNatureOfCharge(this.getData('natureOfCharge', 'Immovable Property'));
      const assessedValue = this.getData('assessedValue', '1000');
      await this.fillCollateralImmovablePropertyParticulars({
        deriveValue: this.getData('deriveValue', 'Assessed'),
        assessedValue,
        collateralValue: this.getData('collateralValue', assessedValue),
        propertyDocumentNo: this.getData('propertyDocumentNo', '1234567890'),
        addressLine1: this.getData('addressLine1', 'MAPLE AVENUE'),
      });
      await this.validateHclm();

      await this.visitLoanTab('Insurance', 'insurance', 'Insurance Type');
      await this.logVisibleFields('Immovable Property Insurance tab');
      await this.fillCollateralInsuranceTab({
        insuranceType: this.getData('insuranceType', '999'),
        policyNo: this.getData('insurancePolicyNo', 'POL001'),
        policyAmt: this.getData('insurancePolicyAmt', '500'),
        premiumAmt: this.getData('insurancePremiumAmt', '500'),
        frequency: this.getData('insuranceFrequency', 'Monthly'),
      });
      return await this.submitAndCapture(type);
    } catch (e: any) {
      return { type, collateralId: null, statusMessage: null, error: e.message || String(e) };
    }
  }

  // ===================== Vehicle =====================
  async lodgeVehicleCollateral(): Promise<LodgeResult> {
    const type = 'Vehicle';
    try {
      await this.hclmStart(type);
      await this.setGeneralBase(this.getData('collateralCode', 'NVEH1BMD'), this.getData('ceilingLimit', '500'));
      await this.fillByAnyLabelSafe(['Debit Account Fee', 'Debit A/c Fee', 'Debit A/c. for Fees', 'Debit Fee Account'], this.getData('debitAccountFee', '9200000603'));
      await this.validateHclm();

      await this.visitLoanTab('Particulars', 'particulars');
      await this.logVisibleFields('Vehicle Particulars tab');
      const today = await getApplicationDate(this.page);
      const vehicleValue = this.getData('vehicleValue', '1000');
      const assessedValue = this.getData('assessedValue', vehicleValue);
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.setNatureOfCharge(this.getData('natureOfCharge', 'Motor Vehicles'));
      await this.selectByLabel('From Derive Value', this.getData('deriveValue', 'A - Assessed value'));
      await this.setTextByCandidates(['assessedValue', 'clpar.assessedValue', 'clpar.assessedValue_ui', 'assessedValue_ui', 'assessedAmt'], assessedValue, 'Assessed Value');
      await this.setVehicleCollateralValue(vehicleValue);
      await this.fillByAnyLabelSafe(['Engine Number', 'Engine No', 'Engine No.'], this.getData('engineNumber', 'ENG123456'));
      await this.fillByAnyLabelSafe(['Chassis Number', 'Chassis No', 'Chassis No.'], this.getData('chassisNumber', 'CHS123456'));
      await this.validateHclm();

      await this.visitLoanTab('Insurance', 'insurance', 'Insurance Type');
      await this.logVisibleFields('Vehicle Insurance tab');
      await this.fillCollateralInsuranceTab({
        insuranceType: this.getData('insuranceType', '007'),
        policyNo: this.getData('insurancePolicyNo', '101'),
        policyAmt: this.getData('insurancePolicyAmt', vehicleValue),
        frequency: this.getData('insuranceFrequency', 'Monthly'),
      });
      return await this.submitAndCapture(type);
    } catch (e: any) {
      return { type, collateralId: null, statusMessage: null, error: e.message || String(e) };
    }
  }

  // ===================== Others =====================
  async lodgeOthersCollateral(): Promise<LodgeResult> {
    const type = 'Others';
    try {
      await this.hclmStart(type);
      await this.setGeneralBase(this.getData('collateralCode', 'OTH01BMD'), this.getData('ceilingLimit', '500'));

      await this.visitLoanTab('Particulars', 'particulars');
      await this.logVisibleFields('Others Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      const othersValue = this.getData('collateralValue', '1000');
      await this.setTextByCandidates(['coltrlValue', 'clpar.coltrlValue', 'collateralValue', 'clpar.collateralValue'], othersValue, 'Collateral Value');
      await this.validateHclm();
      return await this.submitAndCapture(type);
    } catch (e: any) {
      return { type, collateralId: null, statusMessage: null, error: e.message || String(e) };
    }
  }

  // ===================== Life Insurance =====================
  async lodgeLifeInsuranceCollateral(): Promise<LodgeResult> {
    const type = 'Life Insurance';
    try {
      await this.hclmStart(type);
      await this.setGeneralBase(this.getData('collateralCode', 'MLPY1BMD'), this.getData('ceilingLimit', '500'));
      await this.fillByAnyLabelSafe(['Debit Account Fee', 'Debit A/c Fee', 'Debit Fee Account'], this.getData('debitAccountFee', '9200000603'));

      await this.visitLoanTab('Particulars', 'particulars');
      await this.logVisibleFields('Life Insurance Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.setTextByCandidates(['lastPrmPaidDate_ui', 'lastPrmPaidDate', 'clpar.lastPrmPaidDate', 'clpar.lastPrmPaidDate_ui', 'lastPremDate_ui', 'lastPremDate', 'clpar.lastPremDate', 'dateOfLastPremium'], today, 'Last Premium Date');
      await this.fillCollateralLifeInsuranceParticulars({
        policyNo: this.getData('policyNo', '001'),
        policyAmt: this.getData('policyAmt', '500'),
        frequencyForStatement: this.getData('frequencyForStatement', 'Monthly'),
        surrenderValue: this.getData('surrenderValue', '10000'),
      });
      await this.validateHclm();
      return await this.submitAndCapture(type);
    } catch (e: any) {
      return { type, collateralId: null, statusMessage: null, error: e.message || String(e) };
    }
  }

  // ===================== Guarantee =====================
  async lodgeGuaranteeCollateral(): Promise<LodgeResult> {
    const type = 'Guarantee';
    try {
      await this.hclmStart(type);
      await this.setGeneralBase(this.getData('collateralCode', 'GOVG1BMD'), this.getData('ceilingLimit', '500'));
      await this.setTextByCandidates(
        ['coltrlGroup', 'clgen.coltrlGroup'],
        this.getData('collateralGroup', 'Oth'),
        'Collateral Group'
      );
      await this.fillByAnyLabelSafe(['Debit Account Fee', 'Debit A/c Fee', 'Debit Fee Account'], this.getData('debitAccountFee', '9200000603'));

      await this.visitLoanTab('Particulars', 'particulars', 'Guarantor Name');
      await this.logVisibleFields('Guarantee Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today });
      await this.setGuaranteeGuarantorTypePersonal().catch(() => console.log('Guarantor Type Personal selector not available, skipping'));
      const guarantorId = this.getData('guarantorId', DEFAULT_CUSTOMER.cifCode);
      const guarantorFilled = await this.fillByAnyLabelSafe(['Guarantor ID', 'Guarantor'], guarantorId);
      if (!guarantorFilled) {
        await this.setTextByCandidates(['guarantorId', 'clpar.guarantorId', 'guarantor'], guarantorId, 'Guarantor ID');
      }
      await this.selectGuaranteeType(this.getData('guaranteeType', 'G002'));
      const guaranteeValue = this.getData('collateralValue', '500');
      await this.setTextByCandidates(['coltrlValue', 'clpar.coltrlValue', 'collateralValue'], guaranteeValue, 'Collateral Value');
      await this.fillByAnyLabelSafe(['Address Line 1', 'Address', 'Address1'], this.getData('addressLine1', 'MAPLE AVENUE'));
      await this.validateHclm();
      return await this.submitAndCapture(type);
    } catch (e: any) {
      return { type, collateralId: null, statusMessage: null, error: e.message || String(e) };
    }
  }

  // ===================== Transactional Accounts =====================
  async lodgeTransactionalAccountsCollateral(): Promise<LodgeResult> {
    const type = 'Transactional Accounts';
    try {
      await this.hclmStart(type);

      // Step 4: General tab
      await this.setCollateralCode(this.getData('collateralCode', 'CBLC1BMD'));
      await this.setCeilingLimitPerLinkage(this.getData('ceilingLimit', '500'));
      await this.setCollateralStatus('Normal');
      await this.page.waitForTimeout(2000);

      // Step 5: Validate and move to Particulars
      await this.validateHclm();

      await this.visitLoanTab('Particulars', 'particulars', 'A/c. ID');
      await this.logVisibleFields('Transactional Accounts Particulars tab');

      const today = await getApplicationDate(this.page);
      const accountNumber = this.getData('accountNumberWithBalance', '6000269620');
      await this.fillCollateralParticulars({ lodgedDate: today, reviewDate: today });
      const accountFilled = await this.fillByAnyLabelSafe(
        ['A/c. ID', 'A/c ID', 'A/c. No', 'Account ID', 'Account No', 'Account Number', 'Account Number with Balance'],
        accountNumber
      );
      if (!accountFilled) {
        await this.enterHacmAccountId(accountNumber);
      }
      await this.page.waitForTimeout(2000);

      await this.validateHclm();
      return await this.submitAndCapture(type);
    } catch (e: any) {
      return { type, collateralId: null, statusMessage: null, error: e.message || String(e) };
    }
  }

  // ===================== Inventory =====================
  async lodgeInventoryCollateral(): Promise<LodgeResult> {
    const type = 'Inventory';
    try {
      await this.hclmStart(type);
      await this.setGeneralBase(this.getData('collateralCode', 'LTSK1BMD'), this.getData('ceilingLimit', '500'));
      // Inventory's Collateral Group is a free-text code field, not a dropdown.
      await this.setTextByCandidates(['coltrlGroup', 'clgen.coltrlGroup', 'coltrlGroupDesc'], this.getData('collateralGroup', 'DEMAT'), 'Collateral Group');

      // Step 5: Validate General tab, then open Net Value tab.
      await this.validateHclm();
      await this.visitLoanTab('Net Value', 'netvalue', 'Gross value');
      await this.logVisibleFields('Inventory Netvalue tab');
      await this.setTextByCandidates(['grossValue', 'grossAmt', 'grossAmount', 'clpar.grossValue', 'clgen.grossValue'], this.getData('grossValue', '100'), 'Gross value');

      // Step 6-8: Go to Particulars, enter dates, frequency, then Validate and Submit.
      await this.visitLoanTab('Particulars', 'particulars', 'Frequency for Statement');
      await this.logVisibleFields('Inventory Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, reviewDate: today });
      await this.setCollateralDueDate(today);
      await this.selectByLabel('Frequency for Statement', this.getData('frequencyForStatement', 'Monthly'), 0);
      await this.selectByLabel('Week', this.getData('week', 'First Week'), 1);
      await this.selectByLabel('Day', this.getData('day', 'Monday'), 2);
      // Date dropdown must remain on its 'Date' placeholder; do not change it.
      await this.selectByLabel('Holiday', this.getData('holiday', 'Next Day'), 4);
      await this.validateHclm();
      return await this.submitAndCapture(type);
    } catch (e: any) {
      return { type, collateralId: null, statusMessage: null, error: e.message || String(e) };
    }
  }

  // ===================== Mutual Fund =====================
  async lodgeMutualFundCollateral(): Promise<LodgeResult> {
    const type = 'Mutual Fund';
    try {
      await this.hclmStart(type);
      await this.setGeneralBase(this.getData('collateralCode', 'MUFD1BMD'), this.getData('ceilingLimit', '500'));
      await this.setTextByCandidates(
        ['coltrlGroup', 'clgen.coltrlGroup'],
        this.getData('collateralGroup', 'OTH'),
        'Collateral Group'
      );

      await this.visitLoanTab('Particulars', 'particulars', 'No. of Units');
      await this.logVisibleFields('Mutual Fund Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.setCollateralDueDate(today);
      await this.addCollateralDistinctiveRow({
        fromDistinctiveNo: this.getData('fromDistinctiveNo', '170'),
        toDistinctiveNo: this.getData('toDistinctiveNo', '171'),
        units: this.getData('units', '20000'),
        skipAdd: true,
      });
      await this.validateHclm();
      return await this.submitAndCapture(type);
    } catch (e: any) {
      return { type, collateralId: null, statusMessage: null, error: e.message || String(e) };
    }
  }
}
