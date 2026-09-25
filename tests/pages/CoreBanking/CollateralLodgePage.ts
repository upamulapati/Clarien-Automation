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
  constructor(page: Page) {
    super(page);
  }


  private async fillByAnyLabelSafe(labels: string[], value: string): Promise<boolean> {
    for (const label of labels) {
      if (await this.fillByLabel(label, value)) return true;
    }
    return false;
  }

  private async selectByLabel(label: string, option: string, nth = 0): Promise<boolean> {
    return this.selectOptionByLabel(label, option);
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
    await this.invokeHclmMenu();
    await this.selectCollateralDropdown('Lodge');
    await this.selectCollateralDropdown(type);
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
    const collateralId = await this.getGeneratedCollateralId();
    const statusMessage = await this.getStatusMessage();

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
      await this.setGeneralBase('CBLT1BMD', '500');
      await this.visitLoanTab('Particulars', 'particulars', 'Full Benefit');
      await this.logVisibleFields('Deposit Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({
        lodgedDate: today,
        reviewDate: today,
        receivedDate: today,
        depositAccountId: '9200000603',
        fullBenefit: 'no',
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
      await this.setGeneralBase('DBLD1BMD', '500');
      await this.fillByAnyLabelSafe(['Margin Pct', 'Margin %', 'Margin Percent'], '100');

      await this.visitLoanTab('Particulars', 'particulars');
      await this.logVisibleFields('Immovable Property Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.setCollateralDueDate(today);
      await this.selectByLabel('Nature of Charge', 'Immovable Property');
      await this.fillCollateralImmovablePropertyParticulars({
        deriveValue: 'Assessed',
        assessedValue: '1000',
        propertyDocumentNo: '1234567890',
        addressLine1: 'MAPLE AVENUE',
      });
      await this.validateHclm();

      await this.visitLoanTab('Insurance', 'insurance', 'Insurance Type');
      await this.logVisibleFields('Immovable Property Insurance tab');
      await this.fillCollateralInsuranceTab({
        insuranceType: '999',
        policyNo: 'POL001',
        policyAmt: '500',
        premiumAmt: '500',
        frequency: 'Monthly',
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
      await this.setGeneralBase('NVEH1BMD', '500');
      await this.validateHclm();

      await this.visitLoanTab('Particulars', 'particulars');
      await this.logVisibleFields('Vehicle Particulars tab');
      const today = await getApplicationDate(this.page);
      const vehicleValue = '1000'; // policy amount equals the collateral value
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.setNatureOfCharge('Motor Vehicles');
      // Step 7: From Derive Value = Assessed value before entering assessed/collateral values.
      await this.selectByLabel('From Derive Value', 'A - Assessed value');
      await this.fillByAnyLabelSafe(['Assessed Value', 'Assessed Amt', 'Assessed Amount'], vehicleValue);
      await this.setVehicleCollateralValue(vehicleValue);
      await this.fillByAnyLabelSafe(['Engine Number', 'Engine No', 'Engine No.'], 'ENG123456');
      await this.fillByAnyLabelSafe(['Chassis Number', 'Chassis No', 'Chassis No.'], 'CHS123456');
      await this.validateHclm();

      await this.visitLoanTab('Insurance', 'insurance', 'Insurance Type');
      await this.logVisibleFields('Vehicle Insurance tab');
      await this.fillCollateralInsuranceTab({
        insuranceType: '007',
        policyNo: '101',
        policyAmt: vehicleValue,
        frequency: 'Monthly',
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
      await this.setGeneralBase('OTH01BMD', '500');

      await this.visitLoanTab('Particulars', 'particulars');
      await this.logVisibleFields('Others Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.fillByAnyLabelSafe(['Collateral Value', 'Collateral Amt', 'Collateral Amount', 'Value'], '1000');
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
      await this.setGeneralBase('MLPY1BMD', '500');
      await this.fillByAnyLabelSafe(['Debit Account Fee', 'Debit A/c Fee', 'Debit Fee Account'], '9200000603');

      await this.visitLoanTab('Particulars', 'particulars');
      await this.logVisibleFields('Life Insurance Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.fillByAnyLabelSafe(['Last Premium Date', 'Date of Last Premium'], today);
      await this.fillCollateralLifeInsuranceParticulars({
        policyNo: '001',
        policyAmt: '500',
        frequencyForStatement: 'Monthly',
        surrenderValue: '10000',
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
      await this.setGeneralBase('GOVG1BMD', '500');
      await this.selectByLabel('Collateral Group', 'Oth');
      await this.fillByAnyLabelSafe(['Debit Account Fee', 'Debit A/c Fee', 'Debit Fee Account'], '9200000603');

      await this.visitLoanTab('Particulars', 'particulars', 'Guarantor Name');
      await this.logVisibleFields('Guarantee Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today });
      await this.setGuaranteeGuarantorTypePersonal();
      await this.fillByLabel('Guarantor ID', DEFAULT_CUSTOMER.cifCode);
      await this.selectGuaranteeType('G002');
      await this.fillByLabel('Collateral Value', '500');
      await this.fillByAnyLabelSafe(['Address Line 1', 'Address', 'Address1'], 'MAPLE AVENUE');
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
      // Steps 1-3: Invoke HCLM, select function Lodge, choose Transactional Accounts, click Go.
      await this.invokeHclmMenu();
      await this.selectCollateralDropdown('Lodge');
      await this.selectOptionByLabel('Type', 'Transaction Accounts');
      await this.clickGo();
      await this.page.waitForTimeout(3000);
      await this.visitLoanTab('General', 'general');
      await this.logVisibleFields(`HCLM General tab - ${type}`);

      // Step 4: General tab - Collateral code, Ceiling limit, Status Normal.
      // Fill directly to avoid the collateral code lookup popup, which closes the page.
      const code = 'CBLC1BMD';
      await this.fillByAnyLabelSafe(['Collateral Code', 'Code', 'coltrlCode'], code);
      await this.setTextByCandidates(['coltrlCodeDesc', 'clgen.coltrlCodeDesc'], code, 'Collateral Code Desc');
      await this.fillByAnyLabelSafe(['Ceiling Limit', 'Ceiling Limit per Linkage', 'Ceiling Lmt'], '500');
      await this.setCollateralStatus('Normal');
      // Step 5: Validate and move to Particulars tab.
      await this.validateHclm();

      await this.visitLoanTab('Particulars', 'particulars', 'A/c. ID');
      await this.logVisibleFields('Transactional Accounts Particulars tab');

      // Step 6: Lodged and Review Date.
      const today = await getApplicationDate(this.page);
      await this.setTextByCandidates(['lodgedDate_ui', 'lodgedDate'], today, 'Lodged Date');
      await this.setTextByCandidates(['reviewDate_ui', 'reviewDate'], today, 'Review Date');

      // Step 7: Account number with Balance.
      await this.setTextByCandidates(
        ['depAcctId', 'acctId', 'acid', 'acId', 'foracid', 'depositForacid', 'depositAccountId', 'depositAcctId', 'depositAcctNo', 'linkedDepositId'],
        '6000269620',
        'Account Number with Balance'
      );

      // Step 8: Validate and Submit.
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
      await this.setGeneralBase('LTSK1BMD', '500');
      // Inventory's Collateral Group is a free-text code field, not a dropdown.
      await this.setTextByCandidates(['coltrlGroup', 'clgen.coltrlGroup', 'coltrlGroupDesc'], 'DEMAT', 'Collateral Group');

      // Step 5: Validate General tab, then open Net Value tab.
      await this.validateHclm();
      await this.visitLoanTab('Net Value', 'netvalue', 'Gross value');
      await this.logVisibleFields('Inventory Netvalue tab');
      const grossFilled = await this.fillByAnyLabelSafe(['Gross value', 'Gross Value', 'Gross Amt', 'Gross Amount', 'Gross'], '100');
      if (!grossFilled) {
        await this.setTextByCandidates(['grossValue', 'grossAmt', 'grossAmount', 'clpar.grossValue', 'clgen.grossValue'], '100', 'Gross value');
      }

      // Step 6-8: Go to Particulars, enter dates, frequency, then Validate and Submit.
      await this.visitLoanTab('Particulars', 'particulars', 'Frequency for Statement');
      await this.logVisibleFields('Inventory Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, reviewDate: today });
      await this.setCollateralDueDate(today);
      await this.selectByLabel('Frequency for Statement', 'Monthly', 0);
      await this.selectByLabel('Week', 'First Week', 1);
      await this.selectByLabel('Day', 'Monday', 2);
      // Date dropdown must remain on its 'Date' placeholder; do not change it.
      await this.selectByLabel('Holiday', 'Next Day', 4);
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
      await this.setGeneralBase('MUFD1BMD', '500');
      await this.selectByLabel('Collateral Group', 'OTH');

      await this.visitLoanTab('Particulars', 'particulars', 'No. of Units');
      await this.logVisibleFields('Mutual Fund Particulars tab');
      const today = await getApplicationDate(this.page);
      await this.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.setCollateralDueDate(today);
      await this.addCollateralDistinctiveRow({
        fromDistinctiveNo: '170',
        toDistinctiveNo: '171',
        units: '20000',
        skipAdd: true,
      });
      await this.validateHclm();
      return await this.submitAndCapture(type);
    } catch (e: any) {
      return { type, collateralId: null, statusMessage: null, error: e.message || String(e) };
    }
  }
}
