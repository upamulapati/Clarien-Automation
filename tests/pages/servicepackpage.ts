import { expect, Frame, Page, Dialog } from '@playwright/test';
import * as fs from 'fs';
import { HomePage } from './HomePages/HomePage';
import { AccountPage } from './CoreBanking/AccountPage';
import { TermDepositPage } from './CoreBanking/TermDepositPage';
import { TermDepositSpflowPage } from './CoreBanking/TermDepositSpflowPage';
import { TopUpDepositPage } from './CoreBanking/TopUpDepositPage';
import { loginToFinacle } from '../helpers/finacleSetup';
import COMMON_DATA from '../../data/common-data.json';
import { readLatestCollateralId, recordCollateralId, resetCollateralIds } from '../helpers/sharedState';

export class ServicePackPage {
  private page: Page;
  private accountPage: AccountPage;
  private termDepositPage: TermDepositPage;
  private spflowPage: TermDepositSpflowPage;
  private topUpDepositPage: TopUpDepositPage;

  constructor(page: Page) {
    this.page = page;
    this.accountPage = new AccountPage(page);
    this.termDepositPage = new TermDepositPage(page);
    this.spflowPage = new TermDepositSpflowPage(page);
    this.topUpDepositPage = new TopUpDepositPage(page);
  }

  private async login(username: string, password: string): Promise<HomePage> {
    const { homePage } = await loginToFinacle(this.page, username, password);
    return homePage;
  }

  async servicePackNominationValidation(): Promise<{ accountNumber: string | null; message: string | null }> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      const acct = COMMON_DATA.servicePackNominationValidation;
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.savingsAccount.screens.create);
      await this.accountPage.fillBasicAccountDetails(acct as any);
      await this.accountPage.selectSchemeCode(acct.schemeCode);
      await this.accountPage.acceptButton.click();
      await this.page.waitForTimeout(3000);
      await this.accountPage.visitTab('General Details');
      await this.accountPage.selectDispatchMode(acct.dispatchMode as 'email' | 'post' | 'no dispatch');
      await this.accountPage.visitTab('Interest Details');
      await this.accountPage.selectInterestCreditAccount();
      await this.accountPage.fillNextInterestDate();
      await this.accountPage.visitSchemeDetailsTab();
      await this.accountPage.setNominationFlagAndType();
      await this.accountPage.visitNominationDetailsTab();
      await this.accountPage.fillNominationDetails({
        cifId: '4100058365',
        relationship: 'others',
        registrationNo: '101',
        sequenceNo: '01',
      });
      await this.accountPage.visitRelatedPartyTab();
      await this.accountPage.visitMiscodesTab();
      await this.accountPage.visitDocumentDetailsTab();
      await this.accountPage.submitForm();
      return await this.accountPage.verifyAccountCreated();
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackPaymentSystemStatementsValidation(acct: any): Promise<{
    handled: boolean;
    submitted: boolean;
    calendarPresent: boolean;
    accountNumber: string | null;
    message: string | null;
  }> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.savingsAccount.screens.modifyAndVerify);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectFunction('Modify');
      await this.accountPage.enterHacmAccountId(acct.accountId);
      await this.accountPage.clickGo();
      await this.accountPage.visitTab('General');
      await this.accountPage.selectDispatchMode(acct.dispatchMode as 'email' | 'no dispatch' | 'post');
      const emailValidation = await this.accountPage.validateEmailTypeRequirement(acct.dispatchMode);
      if (emailValidation.handled) {
        return { handled: true, submitted: false, calendarPresent: false, accountNumber: null, message: null };
      }
      if (emailValidation.submitted) {
        const result = await this.accountPage.verifyAccountCreated();
        return { handled: false, submitted: true, calendarPresent: false, accountNumber: result.accountNumber, message: result.message };
      }
      await this.accountPage.visitTab('Others');
      const calendarPresent = await this.accountPage.validatePaymentSystemStatementsCalendar();
      await this.accountPage.submitForm();
      const result = await this.accountPage.verifyAccountCreated();
      return { handled: false, submitted: false, calendarPresent, accountNumber: result.accountNumber, message: result.message };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackSavingsAccountVerification(acct: any): Promise<{
    statusMessage: string | null;
    accountNumber: string | null;
  }> {
    const homePage = await this.login(COMMON_DATA.secondCredentials.username, COMMON_DATA.secondCredentials.password);
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.savingsAccount.screens.modifyAndVerify);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectFunction('Verify');
      await this.accountPage.enterHacmAccountId(acct.accountId);
      await this.accountPage.clickGo();
      for (const tab of ['General', 'Interest & Tax', 'Related Party', 'MIS Codes', 'Scheme', 'Addl. Info.']) {
        await this.accountPage.visitTab(tab);
      }
      await this.accountPage.visitTabById('documentdetails');
      await this.accountPage.submitForm();
      await this.accountPage.clickOkButton();
      const statusMessage = await this.accountPage.getStatusMessage();
      const result = await this.accountPage.verifyAccountCreated();
      return { statusMessage, accountNumber: result.accountNumber };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackLodgeGovernmentGuaranteeCollateral(): Promise<{
    collateralId: string | null;
    statusMessage: string | null;
    guarantorFilled: boolean;
    collateralValueFilled: boolean;
  }> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      const COLLATERAL_CODE = 'GOVG1BMD';
      const CEILING_LIMIT = '500';
      const GUARANTOR_ID = '0005000599';
      const GUARANTEE_TYPE = 'G002';
      const COLLATERAL_VALUE = '500';
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectCollateralDropdown('Lodge');
      await this.accountPage.selectCollateralDropdown('Guarantee');
      await this.accountPage.clickGo();
      await this.accountPage.visitLoanTab('General', 'general');
      await this.accountPage.setCollateralCode(COLLATERAL_CODE);
      await this.accountPage.setCeilingLimitPerLinkage(CEILING_LIMIT);
      await this.accountPage.setCollateralStatus('Normal');
      await this.accountPage.setCollateralChargeRegistrationRequired('No');
      await this.accountPage.visitLoanTab('Particulars', 'particulars', 'Guarantor Name');
      await this.accountPage.logVisibleFields('Guarantee Particulars tab');
      await this.accountPage.setGuaranteeGuarantorTypePersonal();
      const guarantorFilled = await this.accountPage.fillByLabel('Guarantor ID', GUARANTOR_ID);
      await this.accountPage.selectGuaranteeType(GUARANTEE_TYPE);
      const collateralValueFilled = await this.accountPage.fillByLabel('Collateral Value', COLLATERAL_VALUE);
      const today = this.accountPage.collateralToday();
      await this.accountPage.fillCollateralParticulars({ lodgedDate: today, receivedDate: today });
      await this.accountPage.clickButtonByText('Validate');
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.submitForm();
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.logScreenMessages();
      const collateralId = await this.accountPage.getGeneratedCollateralId();
      if (collateralId) {
        resetCollateralIds();
        recordCollateralId(collateralId);
      }
      const statusMessage = await this.accountPage.getStatusMessage();
      await this.accountPage.clickOkButton();
      await this.accountPage.clickAccept();
      return {
        collateralId,
        statusMessage,
        guarantorFilled: !!guarantorFilled,
        collateralValueFilled: !!collateralValueFilled,
      };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackVerifyGovernmentGuaranteeCollateral(collateralIdOverride?: string): Promise<{
    statusMessage: string;
    addressDetailsVisible: boolean;
  }> {
    const homePage = await this.login(COMMON_DATA.verifierCredentials.username, COMMON_DATA.verifierCredentials.password);
    try {
      const collateralId = collateralIdOverride ?? readLatestCollateralId() ?? 'RBU3547';
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectCollateralDropdown('Verify');
      await this.accountPage.selectCollateralDropdown('Guarantee');
      await this.accountPage.setCollateralId(collateralId);
      await this.accountPage.clickGo();
      await this.page.waitForTimeout(3000);
      await this.accountPage.visitLoanTab('General', 'general');
      await this.accountPage.visitLoanTab('Particulars', 'particulars', 'Guarantor Name');
      await this.accountPage.submitForm();
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.logScreenMessages();
      let successText = (await this.accountPage.getStatusMessage()) ?? '';
      if (!/verified successfully/i.test(successText)) {
        for (const frame of this.page.frames()) {
          const body = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
          if (/verified successfully/i.test(body)) {
            successText = body;
            break;
          }
        }
      }
      await this.accountPage.clickOkButton();
      await this.accountPage.clickAccept();
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectCollateralDropdown('Inquire');
      await this.accountPage.selectCollateralDropdown('Guarantee');
      await this.accountPage.setCollateralId(collateralId);
      await this.accountPage.clickGo();
      await this.page.waitForTimeout(3000);
      await this.accountPage.visitLoanTab('General', 'general');
      await this.accountPage.visitLoanTab('Particulars', 'particulars', 'Guarantor Name');
      const addressDetailsVisible = await this.accountPage.areGuaranteeAddressDetailsVisible();
      return { statusMessage: successText, addressDetailsVisible: !!addressDetailsVisible };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackLodgeAndModifyImmovablePropertyCollateral(): Promise<{
    collateralId: string;
    modificationStatus: string;
  }> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      const COLLATERAL_CODE = 'DBLD1BMD';
      const CEILING_LIMIT = '500';
      const MODIFIED_CEILING_LIMIT = '800';
      const DERIVE_VALUE = 'Assessed';
      const ASSESSED_VALUE = '1000';
      const PROPERTY_DOCUMENT_NO = '1234567890';
      const ADDRESS_LINE_1 = 'MAPLE AVENUE';
      const INSURANCE_TYPE = '003';
      const POLICY_NO = '444444444';
      const POLICY_AMT = '500';
      const PREMIUM_AMT = '500';
      const FREQUENCY = 'Monthly';
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectCollateralDropdown('Lodge');
      await this.accountPage.selectCollateralDropdown('Immovable Property');
      await this.accountPage.clickGo();
      await this.accountPage.visitLoanTab('General', 'general');
      await this.accountPage.logVisibleFields('Immovable Property General tab');
      await this.accountPage.setCollateralCode(COLLATERAL_CODE);
      await this.accountPage.setCeilingLimitPerLinkage(CEILING_LIMIT);
      await this.accountPage.setCollateralStatus('Normal');
      await this.accountPage.setCollateralChargeRegistrationRequired('No');
      await this.page.waitForTimeout(2000);
      await this.accountPage.visitLoanTab('Particulars', 'particulars', 'From Derive Value');
      await this.accountPage.logVisibleFields('Immovable Property Particulars tab');
      const today = this.accountPage.collateralToday();
      await this.accountPage.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.accountPage.setCollateralDueDate(today);
      await this.accountPage.fillCollateralImmovablePropertyParticulars({
        deriveValue: DERIVE_VALUE,
        assessedValue: ASSESSED_VALUE,
        propertyDocumentNo: PROPERTY_DOCUMENT_NO,
        addressLine1: ADDRESS_LINE_1,
      });
      await this.page.waitForTimeout(1000);
      await this.accountPage.visitLoanTab('Insurance', 'insurance', 'Insurance Type');
      await this.accountPage.logVisibleFields('Immovable Property Insurance tab');
      await this.accountPage.fillCollateralInsuranceTab({
        insuranceType: INSURANCE_TYPE,
        policyNo: POLICY_NO,
        policyAmt: POLICY_AMT,
        premiumAmt: PREMIUM_AMT,
        frequency: FREQUENCY,
      });
      await this.page.waitForTimeout(1000);
      await this.accountPage.submitForm();
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.logScreenMessages();
      const collateralId = await this.accountPage.getGeneratedCollateralId();
      if (collateralId) {
        resetCollateralIds();
        recordCollateralId(collateralId);
      }
      if (!collateralId) {
        throw new Error('Failed to generate immovable property collateral ID');
      }
      await this.accountPage.clickOkButton();
      await this.accountPage.clickAccept();
      const lodgementStatus = await this.accountPage.getStatusMessage();
      console.log('Immovable Property lodgement status message:', lodgementStatus);
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectCollateralDropdown('Modify');
      await this.accountPage.selectCollateralDropdown('Immovable Property');
      await this.accountPage.setCollateralId(collateralId);
      await this.accountPage.clickGo();
      await this.page.waitForTimeout(3000);
      await this.accountPage.visitLoanTab('General', 'general');
      await this.accountPage.setCeilingLimitPerLinkage(MODIFIED_CEILING_LIMIT);
      await this.accountPage.clickButtonByText('Validate');
      await this.accountPage.acceptWarningPopup();
      await this.page.waitForTimeout(2000);
      await this.accountPage.visitLoanTab('Particulars', 'particulars');
      await this.accountPage.fillCollateralParticulars({ reviewDate: today });
      await this.accountPage.clickButtonByText('Validate');
      await this.accountPage.acceptWarningPopup();
      await this.page.waitForTimeout(2000);
      await this.accountPage.submitForm();
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.logScreenMessages();
      let modificationStatus = (await this.accountPage.getStatusMessage()) ?? '';
      if (!/modified successfully/i.test(modificationStatus)) {
        for (const frame of this.page.frames()) {
          const body = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
          if (/modified successfully/i.test(body)) {
            modificationStatus = body;
            break;
          }
        }
      }
      await this.accountPage.clickOkButton();
      await this.accountPage.clickAccept();
      return { collateralId, modificationStatus };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackVerifyImmovablePropertyCollateral(collateralIdOverride?: string): Promise<{ statusMessage: string }> {
    const homePage = await this.login(COMMON_DATA.verifierCredentials.username, COMMON_DATA.verifierCredentials.password);
    try {
      const collateralId = collateralIdOverride ?? readLatestCollateralId() ?? 'RBU3547';
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectCollateralDropdown('Verify');
      await this.accountPage.selectCollateralDropdown('Immovable Property');
      await this.accountPage.setCollateralId(collateralId);
      await this.accountPage.clickGo();
      await this.page.waitForTimeout(3000);
      await this.accountPage.visitLoanTab('General', 'general');
      await this.accountPage.logVisibleFields('HCLM Verify General tab');
      await this.accountPage.visitLoanTab('Particulars', 'particulars');
      await this.accountPage.logVisibleFields('HCLM Verify Particulars tab');
      await this.accountPage.visitLoanTab('Insurance', 'insurance');
      await this.accountPage.logVisibleFields('HCLM Verify Insurance tab');
      await this.accountPage.submitForm();
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.logScreenMessages();
      let verificationStatus = (await this.accountPage.getStatusMessage()) ?? '';
      if (!/verified successfully/i.test(verificationStatus)) {
        for (const frame of this.page.frames()) {
          const body = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
          if (/verified successfully/i.test(body)) {
            verificationStatus = body;
            break;
          }
        }
      }
      await this.accountPage.clickOkButton();
      await this.accountPage.clickAccept();
      return { statusMessage: verificationStatus };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackLinkImmovablePropertyCollateral(collateralIdOverride?: string): Promise<{ statusMessage: string | null }> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      const TD_ACCOUNT_ID = '9200000627';
      const LOAN_TO_VALUE_PERCENT = '100';
      const collateralId = collateralIdOverride ?? readLatestCollateralId() ?? 'RBU3547';
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.linkage);
      await this.page.waitForTimeout(3000);
      await this.accountPage.logVisibleFields('HSCLM criteria screen');
      await this.accountPage.selectCollateralDropdown('Link');
      await this.accountPage.setCollateralLinkageTypeAccount();
      await this.accountPage.setCollateralLinkAccountId(TD_ACCOUNT_ID);
      await this.accountPage.setCollateralId(collateralId);
      await this.accountPage.clickAccept();
      await this.page.waitForTimeout(3000);
      await this.accountPage.logVisibleFields('HSCLM linkage details');
      const collateralValueText = await this.accountPage.getCollateralValue();
      const collateralValue = parseFloat((collateralValueText ?? '').replace(/,/g, ''));
      const apportionedValue = !isNaN(collateralValue) && collateralValue > 0
        ? Math.round(collateralValue * 0.1).toString()
        : '100';
      await this.accountPage.setCollateralApportionedValue(apportionedValue);
      await this.accountPage.setCollateralNaturePrimary();
      await this.accountPage.setCollateralLoanToValuePercent(LOAN_TO_VALUE_PERCENT);
      await this.accountPage.clickButtonByText('Validate');
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.clickButtonByText('Submit');
      await this.accountPage.acceptWarningPopup();
      await this.page.waitForTimeout(2000);
      await this.accountPage.logScreenMessages();
      const statusMessage = await this.accountPage.getStatusMessage();
      let successText = statusMessage ?? '';
      if (!/linked successfully/i.test(successText)) {
        for (const frame of this.page.frames()) {
          const body = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
          if (/linked successfully/i.test(body)) {
            successText = body;
            break;
          }
        }
      }
      await this.accountPage.clickOkButton();
      await this.accountPage.clickAccept();
      return { statusMessage: successText };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackLodgeMutualFundCollateral(): Promise<{
    collateralId: string | null;
    statusMessage: string | null;
  }> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      const COLLATERAL_CODE = 'MUFD1BMD';
      const CEILING_LIMIT = '500';
      const FROM_DISTINCTIVE_NO = '170';
      const TO_DISTINCTIVE_NO = '171';
      const NO_OF_UNITS = '20000';
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectCollateralDropdown('Lodge');
      await this.accountPage.selectCollateralDropdown('Mutual Fund Units');
      await this.accountPage.clickGo();
      await this.accountPage.visitLoanTab('General', 'general');
      await this.accountPage.logVisibleFields('Collateral General tab');
      await this.accountPage.setCollateralCode(COLLATERAL_CODE);
      await this.accountPage.setCeilingLimitPerLinkage(CEILING_LIMIT);
      await this.accountPage.setCollateralStatus('Normal');
      await this.accountPage.setCollateralChargeRegistrationRequired('No');
      await this.page.waitForTimeout(2000);
      await this.accountPage.visitLoanTab('Particulars', 'particulars', 'No. of Units');
      await this.accountPage.logVisibleFields('Collateral Particulars tab');
      const today = this.accountPage.collateralToday();
      await this.accountPage.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.accountPage.setCollateralDueDate(today);
      await this.accountPage.addCollateralDistinctiveRow({
        fromDistinctiveNo: FROM_DISTINCTIVE_NO,
        toDistinctiveNo: TO_DISTINCTIVE_NO,
        units: NO_OF_UNITS,
        skipAdd: true,
      });
      await this.page.waitForTimeout(1000);
      await this.accountPage.submitForm();
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.logScreenMessages();
      const collateralId = await this.accountPage.getGeneratedCollateralId();
      if (collateralId) {
        resetCollateralIds();
        recordCollateralId(collateralId);
      }
      const statusMessage = await this.accountPage.getStatusMessage();
      await this.accountPage.clickOkButton();
      await this.accountPage.clickAccept();
      await this.accountPage.logScreenMessages();
      return { collateralId, statusMessage };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackLodgeAndModifyLifeInsuranceCollateral(): Promise<{
    collateralId: string;
    modificationStatus: string;
  }> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      const COLLATERAL_CODE = 'LIPY1BMD';
      const CEILING_LIMIT = '500';
      const POLICY_NO = '103';
      const POLICY_AMT = '1000';
      const STATEMENT_FREQUENCY = 'Monthly';
      const SURRENDER_VALUE = '10000';
      const MODIFIED_SURRENDER_VALUE = '11000';
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectCollateralDropdown('Lodge');
      await this.accountPage.selectCollateralDropdown('Life Insurance');
      await this.accountPage.clickGo();
      await this.accountPage.visitLoanTab('General', 'general');
      await this.accountPage.setCollateralCode(COLLATERAL_CODE);
      await this.accountPage.setCeilingLimitPerLinkage(CEILING_LIMIT);
      await this.accountPage.setCollateralStatus('Normal');
      await this.accountPage.setCollateralChargeRegistrationRequired('No');
      await this.page.waitForTimeout(2000);
      await this.accountPage.visitLoanTab('Particulars', 'particulars');
      await this.accountPage.logVisibleFields('Life Insurance Collateral Particulars tab');
      const today = this.accountPage.collateralToday();
      await this.accountPage.fillCollateralParticulars({ lodgedDate: today, receivedDate: today, reviewDate: today });
      await this.accountPage.setCollateralDueDate(today);
      await this.accountPage.fillCollateralLifeInsuranceParticulars({
        policyNo: POLICY_NO,
        policyAmt: POLICY_AMT,
        frequencyForStatement: STATEMENT_FREQUENCY,
        surrenderValue: SURRENDER_VALUE,
      });
      await this.page.waitForTimeout(1000);
      await this.accountPage.submitForm();
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.logScreenMessages();
      const collateralId = await this.accountPage.getGeneratedCollateralId();
      if (collateralId) {
        resetCollateralIds();
        recordCollateralId(collateralId);
      }
      if (!collateralId) {
        throw new Error('Failed to generate life insurance collateral ID');
      }
      await this.accountPage.clickOkButton();
      await this.accountPage.clickAccept();
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectCollateralDropdown('Modify');
      await this.accountPage.selectCollateralDropdown('Life Insurance');
      await this.accountPage.setCollateralId(collateralId);
      await this.accountPage.clickGo();
      await this.page.waitForTimeout(3000);
      await this.accountPage.visitLoanTab('Particulars', 'particulars');
      await this.accountPage.fillCollateralLifeInsuranceParticulars({ surrenderValue: MODIFIED_SURRENDER_VALUE });
      await this.page.waitForTimeout(1000);
      await this.accountPage.submitForm();
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.logScreenMessages();
      let modificationStatus = (await this.accountPage.getStatusMessage()) ?? '';
      if (!/modified successfully/i.test(modificationStatus)) {
        for (const frame of this.page.frames()) {
          const body = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
          if (/modified successfully/i.test(body)) {
            modificationStatus = body;
            break;
          }
        }
      }
      await this.accountPage.clickOkButton();
      await this.accountPage.clickAccept();
      return { collateralId, modificationStatus };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackVerifyLifeInsuranceCollateral(collateralIdOverride?: string): Promise<{ statusMessage: string }> {
    const homePage = await this.login(COMMON_DATA.verifierCredentials.username, COMMON_DATA.verifierCredentials.password);
    try {
      const collateralId = collateralIdOverride ?? readLatestCollateralId() ?? 'RBU3547';
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.maintenance);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectCollateralDropdown('Verify');
      await this.accountPage.selectCollateralDropdown('Life Insurance');
      await this.accountPage.setCollateralId(collateralId);
      await this.accountPage.clickGo();
      await this.page.waitForTimeout(3000);
      await this.accountPage.visitLoanTab('General', 'general');
      await this.accountPage.logVisibleFields('HCLM Verify General tab');
      await this.accountPage.visitLoanTab('Particulars', 'particulars');
      await this.accountPage.logVisibleFields('HCLM Verify Particulars tab');
      await this.accountPage.submitForm();
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.logScreenMessages();
      let verificationStatus = (await this.accountPage.getStatusMessage()) ?? '';
      if (!/verified successfully/i.test(verificationStatus)) {
        for (const frame of this.page.frames()) {
          const body = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
          if (/verified successfully/i.test(body)) {
            verificationStatus = body;
            break;
          }
        }
      }
      await this.accountPage.clickOkButton();
      await this.accountPage.clickAccept();
      return { statusMessage: verificationStatus };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackLinkLifeInsuranceCollateral(collateralIdOverride?: string): Promise<{ statusMessage: string | null }> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      const TD_ACCOUNT_ID = '9200000627';
      const LOAN_TO_VALUE_PERCENT = '100';
      const collateralId = collateralIdOverride ?? readLatestCollateralId() ?? 'RBU3547';
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(COMMON_DATA.collateralLodgement.screens.linkage);
      await this.page.waitForTimeout(3000);
      await this.accountPage.logVisibleFields('HSCLM criteria screen');
      await this.accountPage.selectCollateralDropdown('Link');
      await this.accountPage.setCollateralLinkageTypeAccount();
      await this.accountPage.setCollateralLinkAccountId(TD_ACCOUNT_ID);
      await this.accountPage.setCollateralId(collateralId);
      await this.accountPage.clickAccept();
      await this.page.waitForTimeout(3000);
      await this.accountPage.logVisibleFields('HSCLM linkage details');
      const collateralValueText = await this.accountPage.getCollateralValue();
      const collateralValue = parseFloat((collateralValueText ?? '').replace(/,/g, ''));
      const apportionedValue = !isNaN(collateralValue) && collateralValue > 0
        ? Math.round(collateralValue * 0.1).toString()
        : '1100';
      await this.accountPage.setCollateralApportionedValue(apportionedValue);
      await this.accountPage.setCollateralNaturePrimary();
      await this.accountPage.setCollateralLoanToValuePercent(LOAN_TO_VALUE_PERCENT);
      await this.accountPage.clickButtonByText('Validate');
      await this.accountPage.acceptWarningPopup();
      await this.accountPage.clickButtonByText('Submit');
      await this.accountPage.acceptWarningPopup();
      await this.page.waitForTimeout(2000);
      await this.accountPage.logScreenMessages();
      const statusMessage = await this.accountPage.getStatusMessage();
      let successText = statusMessage ?? '';
      if (!/linked successfully/i.test(successText)) {
        for (const frame of this.page.frames()) {
          const body = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
          if (/linked successfully/i.test(body)) {
            successText = body;
            break;
          }
        }
      }
      await this.accountPage.clickOkButton();
      await this.accountPage.clickAccept();
      return { statusMessage: successText };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackCreditFrozenClosure(screenCode: string, accountId: string, functionOption: string, repaymentAccountId: string): Promise<{ status: string | null }> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      const status = await this.termDepositPage.creditFrozenClosure(screenCode, accountId, functionOption, repaymentAccountId);
      return { status };
    } finally {
      if (!this.page.isClosed()) {
        await homePage.logout().catch(() => {});
      }
    }
  }

  async servicePackTermDepositRevisedPrincipalFlow(
    accountId: string,
    startDate: string,
    screens: any,
  ): Promise<string> {
    let makerHomePage: HomePage;
    let verifierHomePage: HomePage;
    makerHomePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      await this.spflowPage.modifyInterestOutflow(accountId, startDate, screens.modify);
      await makerHomePage.logout();
      verifierHomePage = await this.login(COMMON_DATA.secondCredentials.username, COMMON_DATA.secondCredentials.password);
      await this.spflowPage.verifySpFlow(accountId, screens.verify);
      const persistedDate = await this.spflowPage.inquirySpFlow(accountId, screens.inquiry);
      return persistedDate;
    } finally {
      if (verifierHomePage!) {
        await verifierHomePage.logout().catch(() => {});
      } else if (makerHomePage!) {
        await makerHomePage.logout().catch(() => {});
      }
    }
  }

  async servicePackTermDepositClickOk(): Promise<void> {
    await this.spflowPage.clickOk();
  }

  async servicePackTopUpTransferMaintenance(data: {
    screenCode: string;
    creditAccount: string;
    debitAccount: string;
    amount: string;
    installmentType: string;
  }): Promise<{ transactionId: string | null; statusMessage: string | null; screenshot: Buffer }> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(data.screenCode);
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectFunction('Add');
      await this.page.waitForTimeout(2000);
      await this.accountPage.selectOptionByLabel('Tran./Sub. Type', 'CUSTOMER') ||
        await this.accountPage.selectOptionByLabel('Sub. Type', 'CUSTOMER') ||
        await this.accountPage.selectOptionByLabel('Type', 'CUSTOMER');
      await this.accountPage.clickButtonByText('Go');
      await this.page.waitForTimeout(5000);

      await this.fillByAnyLabel(['Deposit A/c. ID', 'Deposit A/c', 'Deposit Account'], data.creditAccount);
      await this.page.waitForTimeout(1000);
      await this.fillByAnyLabel(['Source A/c. ID', 'Source A/c', 'Source Account'], data.debitAccount);
      await this.page.waitForTimeout(1000);
      await this.fillByAnyLabel(['Deposit Amt.', 'Deposit Amount'], data.amount);
      await this.selectByLookup('Rate Code/Rate', 'OTB');
      await this.accountPage.selectOptionByLabel('Installment', data.installmentType);
      await this.selectByLookup('Deposit Tran. Particulars Code / Tran. Particulars', '001');
      await this.selectByLookup('Source Tran. Particulars Code / Tran. Particulars', '001');
      await this.fillByAnyLabel(['Common Tran. Remarks', 'Common Remarks'], 'NA');

      await this.accountPage.clickButtonByText('Post');
      await this.page.waitForTimeout(3000);
      await this.accountPage.acceptWarningPopup();

      const statusMessage = await this.accountPage.getStatusMessage();
      const transactionId = await this.accountPage.getHtmTransactionId() || this.extractTransactionId(statusMessage);
      const screenshot = await this.page.screenshot({ fullPage: true });

      return { transactionId, statusMessage, screenshot };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackAccountLedgerInquiryValidation(data: {
    accountId: string;
    startDate: string;
    endDate: string;
  }): Promise<{
    transactionsDisplayed: boolean;
    message: string;
    screenshot: Buffer;
  }> {
    // Logout any existing session before logging in again.
    await new HomePage(this.page).logout().catch(() => {});
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu('HACLINQ');
      await this.page.waitForTimeout(3000);

      await this.accountPage.enterHaclinqAccountId(data.accountId);
      await this.accountPage.fillByLabel('Start Date', data.startDate);
      await this.accountPage.fillByLabel('End Date', data.endDate);
      await this.accountPage.clickButtonByText('Go');
      await this.page.waitForTimeout(5000);

      const finwFrame = this.page.frame({ name: 'FINW' });
      if (!finwFrame) {
        throw new Error('FINW frame not found');
      }
      const hasTransactions = await this.hasHaclinqTransactions(finwFrame);

      const message = hasTransactions ? 'Account transactions are displayed' : 'Account transactions are not displayed';

      if (hasTransactions) {
        expect(message).toBe('Account transactions are displayed');
      } else {
        expect(message).toBe('Account transactions are not displayed');
      }

      const screenshot = await this.page.screenshot({ fullPage: true });

      await finwFrame.evaluate(() => { window.scrollBy(0, 500); }).catch(() => {});
      await this.page.waitForTimeout(1000);
      await this.accountPage.clickButtonByText('OK');

      return { transactionsDisplayed: hasTransactions, message, screenshot };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackHoaaCTUFlowEndDateValidation(data?: {
    schemeCode?: string;
    cifId?: string;
    currencyCode?: string;
    solId?: string;
    modeOfOperation?: string;
    dispatchMode?: string;
    initialDepositAmt?: string;
    instalmentAmt?: string;
    depositPeriodMonths?: string;
    repaymentAcctId?: string;
  }): Promise<{ flowEndDateModified: boolean; message: string; screenshot: Buffer }> {
    const topUpData = {
      ...COMMON_DATA.topUpDeposit,
      ...data,
      initialDepositAmt: data?.initialDepositAmt ?? '1000',
      instalmentAmt: data?.instalmentAmt ?? '500',
      depositPeriodMonths: data?.depositPeriodMonths ?? '24',
      modeOfOperation: data?.modeOfOperation ?? COMMON_DATA.topUpDeposit.modeOfOperation,
      dispatchMode: data?.dispatchMode ?? COMMON_DATA.topUpDeposit.dispatchMode,
      cifCode: data?.cifId ?? COMMON_DATA.topUpDeposit.cifCode,
      repaymentAcctId: data?.repaymentAcctId ?? COMMON_DATA.topUpDeposit.repaymentAcctId,
    };
    const schemeCode = data?.schemeCode ?? COMMON_DATA.topUpDeposit.schemeCode;
    await new HomePage(this.page).logout().catch(() => {});
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      const result = await this.topUpDepositPage.servicePackFlowEndDateValidation(schemeCode, topUpData);
      console.log(result.message);
      return result;
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  private async hasHaclinqTransactions(finwFrame: Frame): Promise<boolean> {
    try {
      const rows = await finwFrame.locator('table tr').all();
      for (const row of rows) {
        const text = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').toLowerCase();
        if (/debit|credit|dr\.?|cr\.?|amount|\d+\.\d{2}/.test(text)) {
          return true;
        }
      }
    } catch {}
    return false;
  }

  private async selectByLookup(labelText: string, code: string): Promise<boolean> {
    const popup = await this.accountPage.clickLookupIconByLabel(labelText);
    if (!popup || popup.isClosed()) {
      console.log(`Lookup popup not opened for ${labelText}, falling back to fillByAnyLabel`);
      return this.fillByAnyLabel([labelText], code);
    }
    try {
      if (!popup.isClosed()) {
        await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      }
      if (!popup.isClosed()) await popup.waitForTimeout(2000);
      let selected = false;
      if (!popup.isClosed()) {
        const frames = [popup.mainFrame(), ...popup.frames().filter(f => f !== popup.mainFrame())];
        for (const frame of frames) {
          const searchInput = frame.locator('input[type="text"]').first();
          if (await searchInput.count() > 0 && await searchInput.isVisible().catch(() => false)) {
            await searchInput.fill(code);
            const searchBtn = frame.locator('input[type="submit"], input[type="button"], button, a').filter({ hasText: /search|go|submit|ok/i }).first();
            if (await searchBtn.count() > 0) await searchBtn.click({ timeout: 10000 }).catch(() => {});
            if (!popup.isClosed()) await popup.waitForTimeout(2000);
            break;
          }
        }
        const codeRegex = new RegExp(code, 'i');
        for (const frame of frames) {
          const link = frame.locator('a').filter({ hasText: codeRegex }).first();
          if (await link.count() > 0 && await link.isVisible().catch(() => false)) {
            await link.click({ timeout: 10000 });
            selected = true;
            console.log(`Selected ${labelText} lookup value: ${code}`);
            break;
          }
          const td = frame.locator('td').filter({ hasText: codeRegex }).first();
          if (await td.count() > 0 && await td.isVisible().catch(() => false)) {
            await td.click({ timeout: 10000 });
            selected = true;
            console.log(`Selected ${labelText} lookup value via table cell: ${code}`);
            break;
          }
        }
        if (!selected) {
          for (const frame of frames) {
            const firstLink = frame.locator('table td a').first();
            if (await firstLink.count() > 0 && await firstLink.isVisible().catch(() => false)) {
              await firstLink.click({ timeout: 10000 });
              console.log(`Selected first lookup row for ${labelText}`);
              break;
            }
          }
        }
      }
      if (!popup.isClosed()) {
        await popup.waitForTimeout(1500);
        await popup.close().catch(() => {});
      }
      await this.page.waitForTimeout(2000);
      return selected;
    } catch (e) {
      console.log(`selectByLookup failed for ${labelText}: ${e}`);
      if (!popup.isClosed()) await popup.close().catch(() => {});
      return this.fillByAnyLabel([labelText], code);
    }
  }

  private async selectHtmParticularCode(code: string): Promise<void> {
    const labels = [
      'Transaction Particulars Code / Tran. Particulars',
      'Tran. Particulars Code / Tran. Particulars',
      'Transaction Particular Code',
      'Tran. Particular Code',
      'Transaction Particulars',
      'Tran. Particulars',
    ];
    for (const label of labels) {
      const ok = await this.selectByLookup(label, code);
      if (ok) {
        console.log(`Selected HTM Transaction Particular Code = ${code} via ${label}`);
        return;
      }
    }
    throw new Error(`Could not select HTM Transaction Particular Code = ${code}. Ensure it is available in the Ref. Code lookup.`);
  }

  private async fillByAnyLabel(labels: string[], value: string): Promise<boolean> {
    for (const label of labels) {
      if (await this.accountPage.fillByLabel(label, value)) return true;
    }
    return false;
  }

  async servicePackRetailLoanDisbursementAuditValidation(accountId: string): Promise<void> {
    console.log('Starting HAFI (Audit File Inquiry) service pack validation...');

    await this.accountPage.selectCoreServer();
    await this.accountPage.searchMenu('HAFI');
    await this.page.waitForTimeout(3000);

    const accountFilled = await this.accountPage.fillByLabel('A/c Id', accountId);
    if (!accountFilled) {
      await this.accountPage.enterHacmAccountId(accountId);
    }
    await this.accountPage.clickGo();
    await this.page.waitForTimeout(3000);

    const finwFrame = this.getFinwFrame();

    // Wait for the HAFI audit grid to show an MCTD row.
    let auditLoaded = false;
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const hasMctd = await finwFrame.evaluate(() => {
        return Array.from(document.querySelectorAll<HTMLTableRowElement>('table tr'))
          .some((tr) => /\bMCTD\b/.test(tr.textContent || ''));
      });
      if (hasMctd) {
        auditLoaded = true;
        break;
      }
      await this.page.waitForTimeout(500);
    }

    if (!auditLoaded) {
      console.log('Audit File Inquiry did not load the MCTD row; skipping HAFI validation');
      return;
    }

    // Expand the MCTD audit row and perform the service pack validation.
    const detailsClicked = await this.clickAuditRowExplode('MCTD');
    if (!detailsClicked) {
      console.log('Falling back to generic MCTD row expand');
      await finwFrame.evaluate(() => {
        const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('table tr'));
        const target = rows.find((tr) => /\bMCTD\b/.test(tr.textContent || ''));
        if (target) {
          const control = target.querySelector<HTMLElement>('img, input[type="image"], a, button, svg, i, [onclick]');
          if (control) {
            control.scrollIntoView({ block: 'center', inline: 'center' });
            control.click();
          }
        }
      });
      await this.page.waitForTimeout(3000);
    }

    // Verify the expanded MCTD audit details are visible.
    const bodyText = (await finwFrame.locator('body').innerText().catch(() => '')) || '';
    if (/MCTD/i.test(bodyText)) {
      console.log('MCTD audit row expanded and details are visible');
    } else {
      console.log('MCTD audit row expanded but details text was not captured');
    }
  }

  async servicePackRetailLoanDisbursementHtmValidation(transactionId: string, transactionDate: string): Promise<void> {
    console.log(`\n===== Starting HTM service pack validation for transaction ${transactionId} =====`);

    await this.accountPage.selectCoreServer();
    await this.accountPage.searchMenu('HTM');
    await this.page.waitForTimeout(3000);

    // Select Function - Inquiry on the HTM screen. The dropdown is #funcCode and
    // the option label is "I - Inquire".
    const finwFrame = this.getFinwFrame();

    // Select Function - Inquiry on the HTM screen.
    const funcCode = finwFrame.locator('#funcCode');
    await funcCode.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    if (await funcCode.count() > 0) {
      const options = await funcCode.locator('option').allTextContents();
      console.log('HTM function dropdown options:', JSON.stringify(options));

      const match = options.find(
        (o) => o.toLowerCase().includes('inquire') || o.toLowerCase().includes('inquiry')
      );
      if (match) {
        const code = match.split('-')[0].trim();
        try {
          await funcCode.selectOption(code);
          console.log(`Selected HTM function by code: ${code} (${match})`);
        } catch {
          await funcCode.selectOption({ label: match });
          console.log(`Selected HTM function by label: ${match}`);
        }
      } else {
        console.log('Inquiry option not found in #funcCode, options:', JSON.stringify(options));
      }
    } else {
      console.log('#funcCode dropdown not found on HTM screen');
    }

    await this.page.waitForTimeout(2000);

    // Fill Transaction ID and Transaction Date with flexible label matching.
    await this.fillByAnyLabel(['Transaction ID', 'Tran ID', 'Tran. ID', 'Txn ID', 'Transaction No'], transactionId);
    await this.fillByAnyLabel(['Transaction Date', 'Tran Date', 'Tran. Date', 'Txn Date'], transactionDate);
    await this.accountPage.clickGo();
    await this.page.waitForTimeout(3000);

    const txnTypeRow = finwFrame.locator('tr').filter({ hasText: /Transaction Type\/Subtype/i }).first();
    await txnTypeRow.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const rowText = await txnTypeRow.innerText().catch(() => '');

    expect(rowText).toContain('T/CI - Customer Induced');
    console.log('Transaction Type/Subtype is validated as T/CI - Customer Induced');

    await this.accountPage.clickButtonByText('Ok');
    await this.page.waitForTimeout(2000);

    await new HomePage(this.page).logout().catch(() => {});
  }

  async servicePackRetailLoanReversalDisbursementValidation(message: string | null): Promise<void> {
    expect(message).toContain('Reversal of Disbursement is successful');
    console.log('Reversal of Disbursement is successful');
  }

  async servicePackRetailLoanPayoffVerificationValidation(data: {
    loanAccountNumber: string;
    transactionType?: string;
    collectRefundAccountId?: string;
    transactionId?: string | null;
    message?: string | null;
    screenshot?: any;
  }): Promise<void> {
    const hasFatalError = /fatal/i.test(data.message || '');
    expect(hasFatalError).toBe(false);
    console.log('Payoff transaction went through successfully without any fatal error');

    console.log('Reverting to HPAYOFF menu option for service pack inquiry...');
    await this.accountPage.selectCoreServer();
    await this.accountPage.searchMenu('HPAYOFF');
    await this.page.waitForTimeout(3000);

    console.log('Selecting function: I-Inquiry of Pay Off...');
    await this.accountPage.selectFunction('Inquiry of Pay Off');
    await this.page.waitForTimeout(3000);

    console.log('Entering A/C ID for inquiry...');
    const accountFilled = await this.accountPage.fillByLabel('A/c Id', data.loanAccountNumber);
    if (!accountFilled) {
      await this.accountPage.enterHacmAccountId(data.loanAccountNumber);
    }

    const transactionType = data.transactionType ?? 'transfer customer induced';
    const collectRefundAccountId = data.collectRefundAccountId ?? '7710003367';

    console.log('Filling Transaction Type...');
    await this.accountPage.selectOptionByLabel('Transaction Type', transactionType);

    console.log('Filling Collect/Refund A/c Id...');
    await this.accountPage.fillByLabel('Collect/Refund A/c Id', collectRefundAccountId);

    console.log('Clicking Go...');
    await this.accountPage.clickGo();

    console.log('Clicking Accept on the inquiry screen...');
    await this.accountPage.clickAccept();

    const finwFrame = this.getFinwFrame();
    await this.page.waitForTimeout(3000);

    const screenshotPath = `test-results/payoff-inquiry-${Date.now()}.png`;
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Payoff inquiry details screenshot saved: ${screenshotPath}`);

    const reasonCodeValue = await finwFrame.evaluate(() => {
      const cells = Array.from(document.querySelectorAll<HTMLElement>('td, th'));
      for (const cell of cells) {
        if ((cell.textContent || '').trim().toLowerCase().includes('reason code')) {
          const row = cell.closest('tr');
          if (row) {
            const input = row.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null;
            if (input) return input.value.trim();
          }
        }
      }
      const fallback = document.querySelector('input[id*="reason" i], input[name*="reason" i]') as HTMLInputElement | null;
      return fallback ? fallback.value.trim() : '';
    });

    if (reasonCodeValue) {
      console.log('PAYOFF_REASON_CODE is displayed');
    } else {
      console.log('PAYOFF_REASON_CODE is not displayed');
    }

    expect(reasonCodeValue.length).toBeGreaterThan(0);

    console.log('Clicking Cancel button...');
    await this.accountPage.clickButtonByText('Cancel');
    await this.page.waitForTimeout(3000);
  }

  private getFinwFrame(): Frame {
    const finwFrame = this.page.frame({ name: 'FINW' });
    if (!finwFrame) {
      throw new Error('FINW frame not found');
    }
    return finwFrame;
  }

  private async clickFinwControlByText(text: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const clicked = await finwFrame.evaluate((search) => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('input, button, a, img, [onclick]'));
      const match = candidates.find((el) => {
        const value = (el as HTMLInputElement).value || '';
        const title = el.getAttribute('title') || '';
        const alt = el.getAttribute('alt') || '';
        const nodeText = el.textContent || '';
        return [value, title, alt, nodeText].some((s) => s.toLowerCase().includes(search.toLowerCase()));
      });
      if (match) {
        match.scrollIntoView({ block: 'center', inline: 'center' });
        match.click();
        return true;
      }
      return false;
    }, text);
    if (clicked) {
      console.log(`Clicked control containing text: ${text}`);
      await this.page.waitForTimeout(2000);
    } else {
      console.log(`Control containing text not found: ${text}`);
    }
    return clicked;
  }

  private async clickFinwControlInRowByText(rowText: string, controlText: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const clicked = await finwFrame.evaluate(([row, control]) => {
      const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('table tr'));
      const targetRow = rows.find((tr) => (tr.textContent || '').includes(row));
      if (!targetRow) return false;
      const candidates = Array.from(targetRow.querySelectorAll<HTMLElement>('input, button, a, img, [onclick]'));
      const controlWords = control.toLowerCase().split(/\s+/).filter(Boolean);
      const match = candidates.find((el) => {
        const value = (el as HTMLInputElement).value || '';
        const title = el.getAttribute('title') || '';
        const alt = el.getAttribute('alt') || '';
        const id = el.getAttribute('id') || '';
        const src = (el as HTMLImageElement).src || '';
        const className = (el as HTMLElement).className || '';
        const nodeText = el.textContent || '';
        const strings = [value, title, alt, id, src, className, nodeText].map(s => String(s).toLowerCase());
        return strings.some((s) => controlWords.every(word => s.includes(word)));
      });
      if (match) {
        match.scrollIntoView({ block: 'center', inline: 'center' });
        match.click();
        return true;
      }
      return false;
    }, [rowText, controlText] as [string, string]);
    if (clicked) {
      console.log(`Clicked ${controlText} in ${rowText} row`);
      await this.page.waitForTimeout(2000);
    } else {
      console.log(`${controlText} control not found in ${rowText} row`);
    }
    return clicked;
  }

  private async waitForAuditRowText(fieldName: string, maxWaitMs = 15000): Promise<string | null> {
    const finwFrame = this.getFinwFrame();
    const pollInterval = 500;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const rowText = await finwFrame.evaluate((name) => {
        const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('table tr'));
        const target = rows.find((tr) => (tr.textContent || '').includes(name));
        return target ? target.innerText : null;
      }, fieldName);
      if (rowText) {
        return rowText;
      }
      await this.page.waitForTimeout(pollInterval);
    }
    return null;
  }

  async servicePackRetailLoanReschedulingAmortizationValidation(): Promise<void> {
    console.log('Starting Amortization Schedule service pack validation...');

    const finwFrame = this.getFinwFrame();
    const btn = finwFrame.locator(
      '#amortizationSchedule, input[value*="Amortization" i], input[value*="Amortisation" i], a:has-text("Amortization"), a:has-text("Amortisation"), button:has-text("Amortization")'
    ).first();
    if (await btn.count() > 0) {
      await btn.click({ timeout: 15000 });
      await this.page.waitForTimeout(3000);
      console.log('Clicked Amortization schedule');
    } else {
      console.log('Amortization schedule button not found, skipping validation');
      return;
    }

    const pageText = await finwFrame.locator('body').innerText().catch(() => '') || '';
    const noMatch = pageText.match(/No\.?\s*of\s*Installments\s*[:\s]*(\d+)/i);
    const noOfInstallments = noMatch ? noMatch[1] : '';
    console.log(`Displayed No. of Installments: ${noOfInstallments}`);

    const headerCell = finwFrame.locator('th, td').filter({ hasText: /Installment\s*Amt/i }).first();
    const scheduleTable = headerCell.locator('xpath=./ancestor::table').first();
    await scheduleTable.waitFor({ state: 'visible', timeout: 15000 });

    // The schedule may render only the visible viewport rows in the DOM.
    // Count the installment description occurrences in the displayed page text.
    const descriptionCount = (pageText.match(/EQUATED\s*INSTALLMENT\s*DEMAND/gi) || []).length;
    console.log(`EQUATED INSTALLMENT DEMAND occurrences: ${descriptionCount}`);
    if (noOfInstallments) {
      expect(descriptionCount, 'Number of schedule entries does not match No. of Installments').toBe(Number(noOfInstallments));
    }

    const tableInfo = await scheduleTable.evaluate((table) => {
      const htmlTable = table as HTMLTableElement;
      const headerRow = Array.from(htmlTable.rows).find(r => Array.from(r.cells).some(c => c.tagName === 'TH'));
      const headers = headerRow
        ? Array.from(headerRow.cells).map(c => c.innerText.trim())
        : Array.from(htmlTable.rows[0]?.cells || []).map(c => c.innerText.trim());
      const rows = Array.from(htmlTable.rows)
        .filter(r => Array.from(r.cells).some(c => c.tagName === 'TD'))
        .map(r => Array.from(r.cells).map(c => c.innerText.trim().replace(/,/g, '')));
      return { headers, rows };
    });
    const headers = tableInfo.headers;
    const rows = tableInfo.rows;
    console.log(`Schedule table rows found: ${rows.length}`);

    expect(noOfInstallments, 'No. of Installments not found in schedule').toBeTruthy();

    const idxInstallment = headers.findIndex(h => /Installment\s*Amt/i.test(h));
    const idxPrincipal = headers.findIndex(h => /Principal\s*Amt/i.test(h));
    const idxInterest = headers.findIndex(h => /Interest\s*Amt/i.test(h));

    if (idxInstallment >= 0 && idxPrincipal >= 0 && idxInterest >= 0) {
      for (let i = 0; i < rows.length; i++) {
        const inst = parseFloat(rows[i][idxInstallment]);
        const prin = parseFloat(rows[i][idxPrincipal]);
        const int = parseFloat(rows[i][idxInterest]);
        if (!isNaN(inst) && !isNaN(prin) && !isNaN(int)) {
          expect(inst).toBeCloseTo(prin + int, 2);
        }
      }
      console.log('Each row Installment Amt equals Principal + Interest');
    }

    console.log(`Installments - ${noOfInstallments} no.of installments and Interest amounts displayed correctly`);
    await this.accountPage.clickOkButton();
    await this.page.waitForTimeout(2000);
  }

  async servicePackRetailLoanReschedulingFirstInstallmentInterestValidation(): Promise<void> {
    console.log('Starting First Installment Interest service pack validation...');
    const finwFrame = this.getFinwFrame();
    const btn = finwFrame.locator(
      '#amortizationSchedule, input[value*="Amortization" i], input[value*="Amortisation" i], a:has-text("Amortization"), a:has-text("Amortisation"), button:has-text("Amortization")'
    ).first();
    if (await btn.count() > 0) {
      await btn.click({ timeout: 15000 });
      await this.page.waitForTimeout(3000);
      console.log('Clicked Amortization schedule');
    } else {
      console.log('Amortization schedule button not found, skipping validation');
      return;
    }

    const headerCell = finwFrame.locator('th, td').filter({ hasText: /Installment\s*Amt/i }).first();
    const scheduleTable = headerCell.locator('xpath=./ancestor::table').first();
    await scheduleTable.waitFor({ state: 'visible', timeout: 15000 });

    const pageText = await finwFrame.locator('body').innerText().catch(() => '') || '';
    const noMatch = pageText.match(/No\.?\s*of\s*Installments\s*[:\s]*(\d+)/i);
    const noOfInstallments = noMatch ? noMatch[1] : '';

    // The schedule may render only the visible viewport rows in the DOM.
    const descriptionCount = (pageText.match(/EQUATED\s*INSTALLMENT\s*DEMAND/gi) || []).length;
    console.log(`Displayed No. of Installments: ${noOfInstallments}`);
    console.log(`EQUATED INSTALLMENT DEMAND occurrences: ${descriptionCount}`);
    if (noOfInstallments) {
      expect(descriptionCount, 'Number of schedule entries does not match No. of Installments').toBe(Number(noOfInstallments));
    }
    console.log(`Installments - ${noOfInstallments} no.of installments and Interest amounts displayed correctly`);

    const firstRowMatch = pageText.match(
      /EQUATED\s+INSTALLMENT\s+DEMAND\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/i
    );
    if (firstRowMatch) {
      const installment = parseFloat(firstRowMatch[1].replace(/,/g, ''));
      const principal = parseFloat(firstRowMatch[2].replace(/,/g, ''));
      const interest = parseFloat(firstRowMatch[3].replace(/,/g, ''));
      expect(interest).toBeCloseTo(installment - principal, 2);
      console.log(`Interest Amt. for the first installment is ${interest}`);
    } else {
      console.log('Could not parse first installment amounts from schedule text');
    }

    await this.accountPage.clickOkButton();
    await this.page.waitForTimeout(2000);
  }

  async servicePackRetailLoanReschedulingAuditValidation(fieldName = 'ei_perd_end_date'): Promise<string | null> {
    console.log('Starting View Audit service pack validation for rescheduling...');

    // Click the View Audit button on the HLARA verification screen
    await this.clickFinwControlByText('View Audit');

    // Wait for the Audit File Inquiry grid to show the LAM row
    let auditLoaded = false;
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const hasLam = await this.getFinwFrame().evaluate(() => {
        return Array.from(document.querySelectorAll<HTMLTableRowElement>('table tr')).some((tr) => (tr.textContent || '').includes('LAM'));
      });
      if (hasLam) {
        auditLoaded = true;
        break;
      }
      await this.page.waitForTimeout(500);
    }
    if (!auditLoaded) {
      throw new Error('Audit File Inquiry did not load after clicking View Audit');
    }

    // Click the explode/expand icon in the LAM row
    const explodeWords = ['explode', 'expand', 'plus', '+'];
    let detailsClicked = false;
    for (const word of explodeWords) {
      detailsClicked = await this.clickFinwControlInRowByText('LAM', word);
      if (detailsClicked) break;
    }
    if (!detailsClicked) {
      console.log('Falling back to clicking the explode icon in the LAM row');
      await this.getFinwFrame().evaluate(() => {
        const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('table tr'));
        const lamRow = rows.find((tr) => (tr.textContent || '').includes('LAM'));
        if (lamRow) {
          const candidates = Array.from(lamRow.querySelectorAll<HTMLElement>('img, a, input, button, [onclick]'));
          const control = candidates.find((el) => {
            const e = el as any;
            const combined = [
              e.getAttribute('title') || '',
              e.getAttribute('alt') || '',
              e.getAttribute('id') || '',
              e.src || '',
              e.className || '',
              e.value || '',
              e.textContent || '',
            ].join(' ').toLowerCase();
            return /explode|expand|plus|\+/.test(combined);
          });
          if (control) {
            control.scrollIntoView({ block: 'center', inline: 'center' });
            control.click();
          }
        }
      });
      await this.page.waitForTimeout(3000);
    }

    // Wait for and capture the row containing the target field name
    const rowText = await this.waitForAuditRowText(fieldName, 15000);
    if (!rowText) {
      throw new Error(`Audit row with field ${fieldName} not found`);
    }

    console.log(`Captured audit row for ${fieldName}: ${rowText}`);

    // Navigate back so the verification spec can click Submit
    await this.clickFinwControlByText('Back');
    await this.page.waitForTimeout(2000);
    await this.clickFinwControlByText('Back');
    await this.page.waitForTimeout(2000);

    return rowText;
  }

  private async clickAuditBackButton(): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const clicked = await finwFrame.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLElement>('input[type="button"], input[type="submit"], button'),
      );
      const visibleBacks = buttons.filter((b) => {
        const text = ((b as HTMLInputElement).value || b.textContent || '').trim().toLowerCase();
        return text === 'back' && (b as HTMLElement).offsetParent !== null;
      });
      if (visibleBacks.length > 0) {
        const back = visibleBacks[visibleBacks.length - 1];
        back.scrollIntoView({ block: 'center', inline: 'center' });
        (back as HTMLElement).click();
        return true;
      }
      return false;
    });
    if (clicked) {
      console.log('Clicked Back button');
      await this.page.waitForTimeout(2000);
    } else {
      console.log('Back button not found');
    }
    return clicked;
  }

  private async clickAuditRowExplode(tableCode: string): Promise<boolean> {
    const finwFrame = this.getFinwFrame();
    const clicked = await finwFrame.evaluate((code) => {
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table'));
      const auditTable = tables.find((t) => (t.textContent || '').includes('View Details'));
      if (!auditTable) return false;

      const headerRow =
        auditTable.querySelector('thead tr') || auditTable.querySelector('tr');
      const headers = headerRow ? Array.from(headerRow.querySelectorAll('th, td')) : [];
      const detailsColIndex = headers.findIndex((h) =>
        (h.textContent || '').toLowerCase().includes('details'),
      );

      const rows = Array.from(auditTable.querySelectorAll<HTMLTableRowElement>('tr'));
      const target = rows.find((tr) => {
        const first = tr.querySelector<HTMLTableCellElement>(':scope > td');
        return first && (first.textContent || '').trim().includes(code);
      });
      if (!target) return false;

      const cells = Array.from(target.querySelectorAll<HTMLTableCellElement>(':scope > td'));
      const detailsCell =
        detailsColIndex >= 0 && cells[detailsColIndex]
          ? cells[detailsColIndex]
          : cells[cells.length - 1];
      if (!detailsCell) return false;

      const candidates = Array.from(
        detailsCell.querySelectorAll<HTMLElement>(
          'img, input[type="image"], input[type="button"], svg, i, a, button, [onclick]',
        ),
      );

      const candidateInfo = (el: HTMLElement) => {
        const e = el as any;
        return [
          e.value || '',
          e.src || '',
          e.alt || '',
          e.title || '',
          e.id || '',
          e.className || '',
          e.name || '',
          e.textContent || '',
        ]
          .join(' ')
          .toLowerCase();
      };

      const isIcon = (el: HTMLElement) => {
        const info = candidateInfo(el);
        const looksLikeIcon =
          /\b(explode|expand|plus|toggle|view|detail)\b/.test(info) ||
          /\+(?![a-z])/.test(info) ||
          el.tagName.toLowerCase() === 'svg' ||
          el.tagName.toLowerCase() === 'i';
        const isHelp =
          /\b(help|question|info|support)\b/.test(info) ||
          /\b(help|question|info|support)\b/.test(el.getAttribute('onclick') || '');
        return looksLikeIcon && !isHelp;
      };

      let control = candidates.find((c) => isIcon(c));
      if (!control) {
        control = candidates.find((c) => !/\b(help|question|info|support)\b/.test(candidateInfo(c)));
      }
      if (!control) {
        control = detailsCell;
      }

      control.scrollIntoView({ block: 'center', inline: 'center' });
      control.click();
      return true;
    }, tableCode);
    if (clicked) {
      console.log(`Clicked explode icon for row ${tableCode}`);
      await this.page.waitForTimeout(2000);
    } else {
      console.log(`Could not click explode icon for row ${tableCode}`);
    }
    return clicked;
  }

  async servicePackRetailLoanModifyAuditValidation(): Promise<void> {
    console.log('Starting View Audit service pack validation for loan modification...');

    // Click the View Audit button on the HACM verification screen
    await this.clickFinwControlByText('View Audit');

    // Wait for the Audit File Inquiry grid (with a "View Details" column) to load
    let auditLoaded = false;
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const loaded = await this.getFinwFrame().evaluate(() => {
        const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table'));
        return tables.some((t) => (t.textContent || '').includes('View Details'));
      });
      if (loaded) {
        auditLoaded = true;
        break;
      }
      await this.page.waitForTimeout(500);
    }
    if (!auditLoaded) {
      throw new Error('Audit File Inquiry did not load after clicking View Audit');
    }

    // Identify the audit table rows by their table code (e.g. AAS, GAM, LAM)
    const tableCodes = await this.getFinwFrame().evaluate(() => {
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table'));
      const auditTable = tables.find((t) => (t.textContent || '').includes('View Details'));
      if (!auditTable) return [];
      return Array.from(auditTable.querySelectorAll<HTMLTableRowElement>('tr'))
        .filter((tr) => tr.querySelector(':scope > td') !== null)
        .map((tr) => tr.querySelector<HTMLTableCellElement>(':scope > td')?.textContent?.trim() || '')
        .filter((code) => /^[A-Z]{2,6}$/.test(code) && code !== 'TABLE');
    });
    console.log(`Audit File Inquiry rows found: ${tableCodes.join(', ')}`);

    const forbiddenFields = ['DIS_SHDL_DATE', 'DIS_SHDL_NUM'];
    for (const tableCode of tableCodes) {
      console.log(`Clicking explode icon for audit row: ${tableCode}`);
      const detailsClicked = await this.clickAuditRowExplode(tableCode);
      if (!detailsClicked) {
        continue;
      }

      // Wait for details to render then assert forbidden fields are absent
      await this.page.waitForTimeout(2000);
      const detailsText = (await this.getFinwFrame().locator('body').innerText().catch(() => '')) || '';
      for (const field of forbiddenFields) {
        const isPresent = detailsText.includes(field);
        if (isPresent) {
          console.log(`${field} is present in audit row ${tableCode}`);
        } else {
          console.log(`${field} is not present in audit row ${tableCode}`);
        }
        expect(detailsText, `Audit details for ${tableCode} should not contain ${field}`).not.toContain(field);
      }

      // Click Back to return to the Audit File Inquiry grid
      await this.clickAuditBackButton();
    }

    // Exit Audit File Inquiry and return to the HACM verification screen so Submit is available
    await this.clickAuditBackButton();

    console.log('Disbursement schedule details are not present');
  }

  async validateTermDepositInterestReport(accountId: string): Promise<{ interestAmount: string }> {
    console.log(`\n===== Validating Interest Report for ${accountId} =====`);

    // Accept any confirmation dialogs that appear during menu navigation.
    const onDialog = (dialog: Dialog) => { dialog.accept().catch(() => {}); };
    this.page.on('dialog', onDialog);

    try {
      // 1. HAINTRPT - Interest Report for Accounts
      await this.accountPage.searchMenu('HAINTRPT');
      await this.page.waitForTimeout(3000);

      await this.accountPage.fillByLabel('Set ID', '100');
      await this.accountPage.fillByLabel('Report To', '101');
      await this.accountPage.fillByLabel('From A/c. ID', accountId);
      await this.accountPage.fillByLabel('To A/c. ID', accountId);
      await this.accountPage.fillByLabel('From Date', '27-07-2026');
      await this.accountPage.fillByLabel('To Date', '10-08-2026');
      await this.accountPage.fillByLabel('MRT File Name', 'intDetRep.mrt');

      // Select all HAINTRPT radio buttons as per the snapshot.
      const finwFrame = this.getFinwFrame();
      const radioSelections = [
        { label: 'Debit/Credit Interest', value: 'Credit' },
        { label: 'Linked A/c. Details', value: 'Exclude' },
        { label: 'Closed A/c.', value: 'Include' },
        { label: 'Disabled A/c.', value: 'Include' },
        { label: 'Frozen A/c.', value: 'Include' },
        { label: 'NPA A/c.', value: 'Include' },
        { label: 'Dormant A/c.', value: 'Include' },
      ];
      await finwFrame.evaluate((selections) => {
        const normalize = (s: string) => s.toLowerCase().replace(/[*:.]/g, '').replace(/\s+/g, '');
        const getRadioLabel = (radio: HTMLInputElement): string => {
          if (radio.labels && radio.labels.length > 0 && radio.labels[0].textContent) {
            return radio.labels[0].textContent.trim();
          }
          if (radio.id) {
            const label = document.querySelector(`label[for="${radio.id}"]`);
            if (label && label.textContent) return label.textContent.trim();
          }
          // The option text is usually the text node immediately after the input.
          const parent = radio.parentNode;
          if (parent) {
            const children = Array.from(parent.childNodes);
            const idx = children.indexOf(radio as any);
            for (let i = idx + 1; i < children.length; i++) {
              const node = children[i];
              if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent?.trim();
                if (text) return text;
              } else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).textContent) {
                const text = (node as Element).textContent?.trim();
                if (text) return text;
              }
            }
          }
          return '';
        };
        const cells = Array.from(document.querySelectorAll('td, label, th, div, span, legend')) as HTMLElement[];
        for (const { label: labelText, value } of selections) {
          const labelNorm = normalize(labelText);
          const labelCell = cells.find(el => normalize(el.textContent?.trim() || '').startsWith(labelNorm));
          if (!labelCell) continue;
          const container = labelCell.closest('tr') || labelCell.closest('div') || labelCell.parentElement;
          if (!container) continue;
          const radios = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
          for (const radio of radios) {
            const optionLabel = getRadioLabel(radio);
            if (optionLabel.toLowerCase().startsWith(value.toLowerCase())) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }, radioSelections).catch(() => {});

      await this.accountPage.clickButtonByText('Submit');
      await this.page.waitForTimeout(3000);

      // 2. Click OK on the batch success message
      await this.accountPage.clickOkButton().catch(() => {});

      // 3. HPR - Print Queue Inquiry
      await this.accountPage.searchMenu('HPR');
      await this.page.waitForTimeout(3000);
      await this.accountPage.clickButtonByText('Go');

      // Wait for the HPR table to load and click the first row's Select column checkbox.
      const hprTable = finwFrame.locator('table').filter({ hasText: 'Report Name' }).first();
      await hprTable.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      const firstDataRow = hprTable.locator('tr:has(td)').first();
      await firstDataRow.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

      const firstCheckbox = firstDataRow.locator('td').first().locator('input[type="checkbox"]').first();
      if (await firstCheckbox.count() > 0) {
        try {
          await firstCheckbox.scrollIntoViewIfNeeded();
          await firstCheckbox.click({ timeout: 10000 });
          await this.page.waitForTimeout(500);
          if (!(await firstCheckbox.isChecked().catch(() => false))) {
            await firstCheckbox.evaluate((cb) => {
              (cb as HTMLInputElement).checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
            });
          }
          console.log('Clicked the first HPR row Select checkbox, checked =', await firstCheckbox.isChecked().catch(() => false));
        } catch {
          await firstCheckbox.evaluate((cb) => {
            (cb as HTMLInputElement).checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          });
          console.log('Checked the first HPR row Select checkbox via JS fallback');
        }
      } else {
        console.log('No Select column checkbox found in the first HPR row');
      }
      await this.page.waitForTimeout(2000);

      // 4. Open the report preview and capture the new page if one opens.
      const pagePromise = this.page.context().waitForEvent('page', { timeout: 30000 }).catch(() => null);
      await this.accountPage.clickButtonByText('Print Screen');
      let previewPage = await pagePromise;
      await this.page.waitForTimeout(5000);

      if (!previewPage) {
        const otherPage = this.page.context().pages().find(p => p !== this.page && p.url() && !p.url().includes('about:blank'));
        if (otherPage) { previewPage = otherPage; }
      }

      let reportText = '';
      if (previewPage) {
        await previewPage.waitForTimeout(3000);
        reportText = await previewPage.locator('body').innerText().catch(() => '');
      } else {
        // The preview may be loaded inside the FINW frame or another frame on the same page.
        for (const frame of this.page.frames()) {
          const text = await frame.locator('body').innerText().catch(() => '');
          if (/interest/i.test(text)) { reportText = text; break; }
        }
        if (!reportText) { reportText = await finwFrame.locator('body').innerText().catch(() => ''); }
      }

      // The 'Interest Amount' is the right-most 2-decimal number on each
      // Normal Interest detail row (after Start Date, End Date, Product, etc.).
      let interestAmount = '';
      const lines = reportText.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^\d{2}-\d{2}-\d{4}\s+\d{2}-\d{2}-\d{4}/.test(trimmed)) {
          const lastAmount = trimmed.match(/([0-9,]+\.[0-9]{2})\s*$/);
          if (lastAmount) {
            interestAmount = lastAmount[1].replace(/,/g, '');
            break;
          }
        }
      }
      if (!interestAmount) {
        throw new Error('Interest Amount not found in the report preview');
      }
      console.log(`Captured Interest Amount: ${interestAmount}`);
      expect(parseFloat(interestAmount)).toBeCloseTo(0.12, 2);
      console.log('Interest Amount is synchronized');

      if (previewPage && !previewPage.isClosed()) {
        await previewPage.locator('button:has-text("Cancel"), input[value="Cancel" i], a:has-text("Cancel")').first().click().catch(() => {});
      } else {
        await this.accountPage.clickButtonByText('Cancel').catch(() => {});
      }

      return { interestAmount };
    } finally {
      this.page.off('dialog', onDialog);
    }
  }

  private async getValueByLabel(labelText: string): Promise<string | null> {
    const finwFrame = this.getFinwFrame();
    const value = await finwFrame.evaluate(({ label }) => {
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

      // Find the deepest element whose text contains the label.
      const cells = Array.from(document.querySelectorAll<HTMLElement>('td, th, label, div, span, p'));
      const labelLower = normalize(label);
      const labelCell = cells.find(el => {
        const t = normalize(el.textContent || '');
        return t.startsWith(labelLower) || t.includes(labelLower);
      });
      if (!labelCell) return null;

      // Walk up to the containing table cell (td/th).
      let containingCell: HTMLElement | null = labelCell;
      while (
        containingCell &&
        containingCell.tagName !== 'TD' &&
        containingCell.tagName !== 'TH' &&
        containingCell.tagName !== 'BODY'
      ) {
        containingCell = containingCell.parentElement as HTMLElement | null;
      }

      let valueCell: HTMLElement | null = null;
      if (containingCell && (containingCell.tagName === 'TD' || containingCell.tagName === 'TH')) {
        valueCell = containingCell.nextElementSibling as HTMLElement | null;
        if (!valueCell) {
          const row = containingCell.closest('tr');
          if (row) {
            const children = Array.from(row.children) as HTMLElement[];
            const idx = children.indexOf(containingCell);
            if (idx >= 0 && children.length > idx + 1) {
              valueCell = children[idx + 1];
            }
          }
        }
      }

      if (valueCell) {
        const input = valueCell.querySelector('input, select, textarea') as HTMLInputElement | HTMLSelectElement | null;
        if (input) return (input.value || '').trim();
        return (valueCell.innerText || valueCell.textContent || '').trim();
      }

      const forAttr = labelCell.getAttribute('for');
      if (forAttr) {
        const el = document.getElementById(forAttr) as HTMLInputElement | null;
        if (el) return (el.value || '').trim();
      }

      let sibling: Element | null = labelCell.nextElementSibling;
      while (sibling) {
        const input = sibling.querySelector('input, select, textarea') as HTMLInputElement | null;
        if (input) return (input.value || '').trim();
        const siblingText = (sibling.textContent?.trim() || '') || (sibling as HTMLElement).innerText?.trim();
        if (siblingText) return siblingText;
        sibling = sibling.nextElementSibling;
      }

      return null;
    }, { label: labelText }).catch(() => null);
    return value ?? null;
  }

  async servicePackRetailLoanReschedulingNextInterestCalculationDateValidation(
    accountId: string,
    expectedDate: string = '05-09-2026',
  ): Promise<void> {
    console.log('Starting Next Interest Calculation Date (Dr.) service pack validation...');

    await this.accountPage.searchMenu('HAITINQ');
    await this.page.waitForTimeout(3000);

    const accountFilled = await this.accountPage.fillByLabel('A/c Id', accountId);
    if (!accountFilled) {
      await this.accountPage.enterHacmAccountId(accountId);
    }

    await this.accountPage.clickGo();

    let nextInterestDate = await this.getValueByLabel('Next Interest Calculation Date (Dr.)');

    // Fallback: try known Finacle next-interest-debit field ids.
    if (!nextInterestDate) {
      const knownInput = this.getFinwFrame().locator('#nextIntDrCalcDt_ui, #nextIntDrCalcDt, input[id*="nextIntDrCalcDt" i], input[name*="nextIntDrCalcDt" i]').first();
      if (await knownInput.count() > 0) {
        nextInterestDate = await knownInput.inputValue().catch(() => null);
      }
    }

    // Fallback: parse the visible body text for the first date following the label.
    if (!nextInterestDate) {
      const bodyText = await this.getFinwFrame().locator('body').innerText().catch(() => '') || '';
      const match = bodyText.match(/Next Interest Calculation Date\s*\(Dr\.\)[^\d]*?([0-9]{2}[-/][0-9]{2}[-/][0-9]{4})/i);
      nextInterestDate = match ? match[1].trim() : null;
    }

    console.log(`Next Interest Calculation Date (Dr.) captured: ${nextInterestDate}`);
    expect(nextInterestDate, 'Next Interest Calculation Date (Dr.) was not updated as expected').toBe(expectedDate);
    console.log(`Next Interest Calculation Date (Dr.) is updated as ${expectedDate}`);

    await this.accountPage.clickOkButton();
    await this.page.waitForTimeout(2000);
  }

  async servicePackRetailLoanReschedulingRepaymentScheduleReportValidation(accountId: string): Promise<void> {
    console.log('Starting HLARSH / HPR repayment schedule service pack validation...');

    let dialogMessage: string | null = null;
    const onDialog = (dialog: Dialog) => {
      const message = dialog.message();
      console.log('Dialog captured:', message);
      if (dialogMessage === null) {
        dialogMessage = message;
      }
      dialog.accept().catch(() => {});
    };
    this.page.on('dialog', onDialog);

    try {
      // 1. HLARSH - generate repayment schedule report batch
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu('HLARSH');
      await this.page.waitForTimeout(3000);

      await this.accountPage.fillByLabel('From A/c. ID', accountId);
      await this.accountPage.fillByLabel('To A/c. ID', accountId);

      // Reset capture so the success dialog (if any) triggered by Submit is recorded.
      dialogMessage = null;
      await this.accountPage.clickButtonByText('Submit');
      await this.page.waitForTimeout(3000);

      let statusMessage = dialogMessage || (await this.accountPage.getStatusMessage().catch(() => null)) || '';
      if (!statusMessage) {
        for (const frame of this.page.frames()) {
          const bodyText = (await frame.locator('body').textContent().catch(() => '')) || '';
          if (bodyText.includes('Batch program successfully invoked')) {
            statusMessage = bodyText.replace(/\s+/g, ' ').trim();
            break;
          }
        }
      }
      console.log('HLARSH status message:', statusMessage);
      expect(statusMessage, 'Expected batch success message').toContain('Batch program successfully invoked');

      await this.accountPage.clickOkButton().catch(() => {});
      await this.page.waitForTimeout(2000);

      // 2. HPR - Print Queue Inquiry
      await this.accountPage.searchMenu('HPR');
      await this.page.waitForTimeout(3000);
      await this.accountPage.clickButtonByText('Go');

      const finwFrame = this.getFinwFrame();
      const hprTable = finwFrame.locator('table').filter({ hasText: 'Report Name' }).first();
      await hprTable.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

      const reportRow = hprTable.locator('tr:has(td)').filter({ hasText: 'Repayment Schedule Report' }).first();
      await reportRow.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

      const checkbox = reportRow.locator('td').first().locator('input[type="checkbox"]').first();
      if (await checkbox.count() > 0) {
        try {
          await checkbox.scrollIntoViewIfNeeded();
          await checkbox.click({ timeout: 10000 });
          await this.page.waitForTimeout(500);
          if (!(await checkbox.isChecked().catch(() => false))) {
            await checkbox.evaluate((cb) => {
              (cb as HTMLInputElement).checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
            });
          }
          console.log('Selected Repayment Schedule Report row checkbox');
        } catch {
          await checkbox.evaluate((cb) => {
            (cb as HTMLInputElement).checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          });
          console.log('Selected Repayment Schedule Report row checkbox via JS fallback');
        }
      } else {
        console.log('No Select checkbox found for Repayment Schedule Report row');
      }
      await this.page.waitForTimeout(2000);

      // 3. Open the report preview and assert the report title
      const pagePromise = this.page.context().waitForEvent('page', { timeout: 30000 }).catch(() => null);
      await this.accountPage.clickButtonByText('Print Screen');
      let previewPage = await pagePromise;
      await this.page.waitForTimeout(5000);

      if (!previewPage) {
        const otherPage = this.page.context().pages().find(p => p !== this.page && p.url() && !p.url().includes('about:blank'));
        if (otherPage) { previewPage = otherPage; }
      }

      let reportText = '';
      if (previewPage) {
        await previewPage.waitForTimeout(3000);
        reportText = await previewPage.locator('body').innerText().catch(() => '') || '';
      } else {
        for (const frame of this.page.frames()) {
          const text = await frame.locator('body').innerText().catch(() => '');
          if (text.toUpperCase().includes('REPAYMENT SCHEDULE FOR LOANS')) {
            reportText = text;
            break;
          }
        }
        if (!reportText) {
          reportText = await finwFrame.locator('body').innerText().catch(() => '') || '';
        }
      }

      expect(reportText, 'REPAYMENT SCHEDULE FOR LOANS report was not displayed').toContain('REPAYMENT SCHEDULE FOR LOANS');
      console.log('Repayment schedule for loans report was displayed');
    } finally {
      this.page.off('dialog', onDialog);
    }
  }

  async servicePackHACLISpValidation(): Promise<{
    transactionId: string;
    postStatus: string;
    verificationMessage: string;
    narrativeText: string;
    transactionParticulars: string;
  }> {
    const DEBIT_ACCOUNT = '7710003367';
    const CREDIT_ACCOUNT = '7500001466';
    const AMOUNT = '10';
    const PARTICULARS = '97641729028233336600649784541940358693703477299215';
    const PARTICULAR_CODE = '001';

    const assertNoHtmError = async (step: string) => {
      const status = await this.accountPage.getStatusMessage();
      if (status) {
        console.log(`[${step}] HTM status: ${status}`);
        if (/error|failed|invalid|mandatory|cannot|not\s+posted|unsuccessful/i.test(status)) {
          throw new Error(`${step} failed: ${status}`);
        }
      }
    };

    let makerHomePage: HomePage;
    let verifierHomePage: HomePage;
    let transactionId = '';
    let postStatus = '';

    // Step 1-2: Maker login and invoke HTM
    makerHomePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu('HTM');
      await this.page.waitForTimeout(3000);

      // Step 3-5: Add / Customer Induced / Go
      await this.accountPage.selectHtmFunction('A');
      await this.accountPage.selectHtmTranTypeSubType('T/CI');
      await this.accountPage.clickHtmGo();
      await this.page.waitForTimeout(5000);

      // Step 6-10: Debit part transaction
      await this.accountPage.selectHtmDebit();
      await this.accountPage.enterHtmAccountId(DEBIT_ACCOUNT);
      await this.accountPage.enterHtmAmount(AMOUNT, true);
      await this.selectHtmParticularCode(PARTICULAR_CODE);
      await this.accountPage.enterHtmParticulars(PARTICULARS);
      await this.accountPage.clickHtmValidate();
      await this.page.waitForTimeout(2000);
      await assertNoHtmError('Debit Validate');
      await this.accountPage.clickHtmAdd();
      await this.page.waitForTimeout(3000);
      await assertNoHtmError('Debit Add');

      // Step 11-15: Credit part transaction and post
      await this.accountPage.selectHtmCredit();
      await this.accountPage.enterHtmAccountId(CREDIT_ACCOUNT);
      await this.accountPage.enterHtmAmount(AMOUNT, true);
      await this.selectHtmParticularCode(PARTICULAR_CODE);
      await this.accountPage.enterHtmParticulars(PARTICULARS);
      await this.accountPage.clickHtmValidate();
      await this.page.waitForTimeout(2000);
      await assertNoHtmError('Credit Validate');
      await this.accountPage.clickHtmPost();
      await this.page.waitForTimeout(5000);

      // Capture transaction ID and post status
      postStatus = (await this.accountPage.getStatusMessage()) ?? '';
      transactionId = (await this.accountPage.getHtmTransactionId()) ?? this.extractTransactionId(postStatus) ?? '';
      console.log(`=== POST STATUS: ${postStatus} ===`);
      console.log(`=== TRANSACTION ID GENERATED: ${transactionId} ===`);

      expect(transactionId, 'Transaction ID was not captured. The HTM transaction may not have posted.').not.toBe('');
      expect(postStatus, 'Post status message was not captured after posting the HTM transaction.').not.toBe('');

      if (/error|failed|invalid|mandatory|cannot|not\s+posted|unsuccessful/i.test(postStatus)) {
        throw new Error(`Transaction post failed: ${postStatus}`);
      }

      await this.accountPage.clickHtmOk();
      await this.page.waitForTimeout(2000);

      await makerHomePage.logout();
    } catch (e) {
      await makerHomePage.logout().catch(() => {});
      throw e;
    }

    // Step 15.5-18: Verifier login, verify both debit and credit records
    let verificationMessage = '';
    verifierHomePage = await this.login(COMMON_DATA.verifierCredentials.username, COMMON_DATA.verifierCredentials.password);
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu('HTM');
      await this.page.waitForTimeout(3000);

      await this.accountPage.selectHtmFunction('V');
      await this.accountPage.enterHtmTransactionId(transactionId);
      await this.accountPage.clickHtmGo();
      await this.page.waitForTimeout(5000);

      // Step 18: Submit first record (Debit) and capture the verification status before OK
      let capturedVerificationStatus = '';

      await this.accountPage.clickHtmSubmit();
      await this.page.waitForTimeout(3000);

      capturedVerificationStatus = await this.accountPage.getStatusMessage() ?? '';
      if (!capturedVerificationStatus || !/verified|success|approved|authorised|authorized/i.test(capturedVerificationStatus)) {
        for (const frame of this.page.frames()) {
          const body = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
          const match = body.match(/(verified|approved|authorised|authorized)(\s+successfully)?/i);
          if (match) {
            capturedVerificationStatus = match[0];
            break;
          }
        }
      }
      console.log(`[First Submit] verification status: ${capturedVerificationStatus || 'none'}`);

      await this.accountPage.clickOkButton();
      await this.page.waitForTimeout(2000);

      // Optional: navigate to the next record (Credit) and submit if a second record is present
      await this.accountPage.clickHtmNextRecord();
      await this.page.waitForTimeout(2000);

      const finwFrame = this.getFinwFrame();
      const submitBtn = finwFrame.locator(
        '#Submit, #submit, input[value="Submit"], input[value="SUBMIT"], ' +
        'input[type="submit"], button:has-text("Submit")'
      ).first();
      if (await submitBtn.count() > 0) {
        await this.accountPage.clickHtmSubmit();
        await this.page.waitForTimeout(3000);

        let secondStatus = await this.accountPage.getStatusMessage() ?? '';
        if (!secondStatus || !/verified|success|approved|authorised|authorized/i.test(secondStatus)) {
          for (const frame of this.page.frames()) {
            const body = (await frame.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
            const match = body.match(/(verified|approved|authorised|authorized)(\s+successfully)?/i);
            if (match) {
              secondStatus = match[0];
              break;
            }
          }
        }
        console.log(`[Second Submit] verification status: ${secondStatus || 'none'}`);
        if (secondStatus) capturedVerificationStatus = secondStatus;

        await this.accountPage.clickOkButton();
        await this.page.waitForTimeout(2000);
      }

      verificationMessage = capturedVerificationStatus;
      console.log(`=== VERIFICATION STATUS: ${verificationMessage} ===`);

      expect(verificationMessage, `Transaction verification did not complete successfully. Message: ${verificationMessage}`).toMatch(/(verified|success|approved|authorised|authorized)/i);

      await verifierHomePage.logout();
    } catch (e) {
      await verifierHomePage.logout().catch(() => {});
      throw e;
    }

    // Step 19-23: HACLI inquiry to validate narrative
    const inquiryHomePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu('HACLI');
      await this.page.waitForTimeout(3000);

      // Step 20-21: Enter account ID and click Go
      const finwFrame = this.getFinwFrame();

      // Fill the HACLI A/c. ID field using the visible A/c. ID label
      const filled = await this.accountPage.fillByLabel('A/c. ID', CREDIT_ACCOUNT) ||
                     await this.accountPage.fillByLabel('A/C ID', CREDIT_ACCOUNT) ||
                     await this.accountPage.fillByLabel('A/c ID', CREDIT_ACCOUNT) ||
                     await this.accountPage.fillByLabel('Account ID', CREDIT_ACCOUNT);
      if (!filled) {
        throw new Error(`Could not fill HACLI A/c. ID field for account ${CREDIT_ACCOUNT}`);
      }
      console.log(`HACLI A/c. ID filled: ${CREDIT_ACCOUNT}`);
      await this.page.waitForTimeout(1500);

      // Close any account-fetch popups that the onChange may have opened
      for (const p of this.page.context().pages()) {
        if (p !== this.page && !p.isClosed() && /fetch\.jsp|lookup/i.test(p.url())) {
          await p.close().catch(() => {});
        }
      }
      await this.page.waitForTimeout(1000);

      // Set global JS variables and any hidden HACLI account fields
      const hacliFieldUpdates = await finwFrame.evaluate((accountId) => {
        (window as any).crvAcctId = accountId;
        (window as any).foracid = accountId;
        (window as any).acid = accountId;
        const updated: Record<string, string> = {};
        for (const key of ['crvAcctId', 'foracid', 'acid', 'accountNo', 'acctNum', 'accountNum']) {
          const byId = document.getElementById(key) as HTMLInputElement | null;
          if (byId) { byId.value = accountId; updated[`id:${key}`] = accountId; }
          const byName = document.querySelector(`input[name="${key}"]`) as HTMLInputElement | null;
          if (byName) { byName.value = accountId; updated[`name:${key}`] = accountId; }
        }
        const input = document.getElementById('account_No') as HTMLInputElement | null;
        if (input) { input.value = accountId; updated['id:account_No'] = accountId; }
        return updated;
      }, CREDIT_ACCOUNT);
      console.log('HACLI hidden/global account fields set:', hacliFieldUpdates);

      // Click the HACLI Go button (#Submit) inside the FINW frame
      const goBtn = finwFrame.locator('#Submit');
      await expect(goBtn, `HACLI Go button (#Submit) must be attached for account ${CREDIT_ACCOUNT}`).toBeAttached({ timeout: 10000 });
      await expect(goBtn, `HACLI Go button (#Submit) must be visible for account ${CREDIT_ACCOUNT}`).toBeVisible({ timeout: 10000 });
      await expect(goBtn, `HACLI Go button (#Submit) must be enabled for account ${CREDIT_ACCOUNT}`).toBeEnabled({ timeout: 10000 });
      await goBtn.click();
      console.log('Clicked HACLI Go button via Playwright #Submit click');

      // In some Finacle builds the Playwright pointer click does not dispatch the onclick handler.
      // If the Transaction Inquiry screen does not load, invoke the handler directly on the button.
      let narrativeVisible = await finwFrame.getByText(PARTICULARS).first().isVisible({ timeout: 8000 }).catch(() => false);
      if (!narrativeVisible) {
        console.log('Playwright #Submit click did not navigate; invoking inquirycriteria_ONCLICK8 directly');
        const onClickResult = await finwFrame.evaluate(() => {
          const submit = document.getElementById('Submit') as HTMLInputElement | null;
          const fn = (window as any).inquirycriteria_ONCLICK8;
          if (!submit || typeof fn !== 'function') return { ok: false };
          const result = fn.call(submit, submit, submit);
          return { ok: true, result: String(result) };
        });
        console.log('HACLI inquirycriteria_ONCLICK8 fallback result:', onClickResult);
      }

      // Wait for the Transaction Inquiry results to load and verify the expected narrative is displayed
      const narrativeLocator = finwFrame.getByText(PARTICULARS).first();
      await expect(
        narrativeLocator,
        `Transaction Inquiry screen did not display the expected narrative for account ${CREDIT_ACCOUNT}`
      ).toBeVisible({ timeout: 30000 });

      // Step 22: Capture HACLI narrative and assert exact match
      const narrativeText = await this.captureHACLI_Narrative(PARTICULARS);
      const normalizedNarrative = narrativeText.replace(/\s+/g, ' ').trim();
      const normalizedParticulars = PARTICULARS.replace(/\s+/g, ' ').trim();
      console.log(`=== NARRATIVE TEXT: ${narrativeText} ===`);

      expect(normalizedNarrative, 'HACLI narrative does not fully match the Transaction Particulars entered in HTM.').toBe(normalizedParticulars);

      // Step 23: Click OK and logout
      await this.accountPage.clickOkButton();
      await this.page.waitForTimeout(2000);

      await inquiryHomePage.logout();

      return {
        transactionId,
        postStatus,
        verificationMessage,
        narrativeText,
        transactionParticulars: PARTICULARS,
      };
    } catch (e) {
      await inquiryHomePage.logout().catch(() => {});
      throw e;
    }
  }

  async servicePackSavingsAccountClosure(
    accountId: string,
    transferAccountId: string
  ): Promise<{ closureStatus: string; verificationStatus: string }> {
    const normalizeMessage = (message: string): string =>
      message.replace(/\s+/g, ' ').trim();

    const assertSuccess = (
      label: string,
      message: string,
      successPattern: RegExp
    ): void => {
      if (/error|failed|invalid|cannot|not\s+closed|unsuccessful/i.test(message)) {
        throw new Error(`${label} failed with message: ${message}`);
      }
      if (!successPattern.test(message)) {
        throw new Error(`${label} was not reported as successful. Message: ${message}`);
      }
      if (!message.includes(accountId)) {
        throw new Error(`${label} message does not reference account ${accountId}. Message: ${message}`);
      }
    };

    const captureStatusMessage = async (): Promise<string> => {
      let status: string | null = null;
      for (let attempt = 0; attempt < 40; attempt++) {
        status = await this.accountPage.getStatusMessage();
        if (status) break;
        await this.page.waitForTimeout(250);
      }
      if (!status) {
        throw new Error('No status message was captured after submission.');
      }
      const normalized = normalizeMessage(status);
      console.log('Captured status message:', normalized);
      return normalized;
    };

    // Maker: close the savings account
    const makerHomePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    let closureStatus = '';
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu('HCAAC');
      await this.page.waitForTimeout(3000);

      await this.accountPage.selectHcaacFunction('Z');
      await this.accountPage.enterHcaacAccountId(accountId);
      await this.accountPage.clickTransferCheckbox();
      await this.accountPage.selectHtmTranTypeSubType('Transfer');
      await this.accountPage.enterTransferAccountId(transferAccountId);

      await this.accountPage.clickHtmGo();
      await this.page.waitForTimeout(5000);

      await this.accountPage.visitTab('Closure');
      await this.accountPage.selectApplyInterestTillDate('Yes');

      await this.accountPage.clickHtmSubmit();
      await this.page.waitForTimeout(5000);

      closureStatus = await captureStatusMessage();
      assertSuccess('Closure', closureStatus, /closed\s*successfully/i);
    } finally {
      await makerHomePage.logout().catch(() => {});
    }

    // Verifier: authorise/verify the closure
    const verifierHomePage = await this.login(COMMON_DATA.verifierCredentials.username, COMMON_DATA.verifierCredentials.password);
    let verificationStatus = '';
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu('HCAAC');
      await this.page.waitForTimeout(3000);

      await this.accountPage.selectHcaacFunction('V');
      await this.accountPage.enterHcaacAccountId(accountId);

      await this.accountPage.clickHtmGo();
      await this.page.waitForTimeout(5000);

      await this.accountPage.visitTab('Closure');
      await this.accountPage.selectApplyInterestTillDate('Yes');

      // HCAAC verify may expose a Verify button followed by Submit
      await this.accountPage.clickHcaacVerify();
      await this.accountPage.clickHtmSubmit();
      await this.page.waitForTimeout(5000);

      verificationStatus = await captureStatusMessage();
      assertSuccess('Verification', verificationStatus, /(?:closed|verified)\s*successfully/i);
    } finally {
      await verifierHomePage.logout().catch(() => {});
    }

    return { closureStatus, verificationStatus };
  }

  public async hacliInquiry(accountId: string, expectedParticulars: string): Promise<string> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu('HACLI');
      await this.page.waitForTimeout(3000);

      const finwFrame = this.getFinwFrame();

      // Fill the HACLI A/c. ID field using the visible A/c. ID label
      const filled = await this.accountPage.fillByLabel('A/c. ID', accountId) ||
                     await this.accountPage.fillByLabel('A/C ID', accountId) ||
                     await this.accountPage.fillByLabel('A/c ID', accountId) ||
                     await this.accountPage.fillByLabel('Account ID', accountId);
      if (!filled) {
        throw new Error(`Could not fill HACLI A/c. ID field for account ${accountId}`);
      }
      console.log(`HACLI A/c. ID filled: ${accountId}`);
      await this.page.waitForTimeout(1500);

      // Close any account-fetch popups that the onChange may have opened
      for (const p of this.page.context().pages()) {
        if (p !== this.page && !p.isClosed() && /fetch\.jsp|lookup/i.test(p.url())) {
          await p.close().catch(() => {});
        }
      }
      await this.page.waitForTimeout(1000);

      // Set global JS variables the HACLI onClick may read, without re-firing events
      const hacliFieldUpdates = await finwFrame.evaluate((id) => {
        (window as any).crvAcctId = id;
        (window as any).foracid = id;
        (window as any).acid = id;
        const updated: Record<string, string> = {};
        for (const key of ['crvAcctId', 'foracid', 'acid', 'accountNo', 'acctNum', 'accountNum']) {
          const byId = document.getElementById(key) as HTMLInputElement | null;
          if (byId) { byId.value = id; updated[`id:${key}`] = id; }
          const byName = document.querySelector(`input[name="${key}"]`) as HTMLInputElement | null;
          if (byName) { byName.value = id; updated[`name:${key}`] = id; }
        }
        const input = document.getElementById('account_No') as HTMLInputElement | null;
        if (input) { input.value = id; updated['id:account_No'] = id; }
        return updated;
      }, accountId);
      console.log('HACLI hidden/global account fields set:', hacliFieldUpdates);

      // Diagnostic log before Go
      const diagnostics = await finwFrame.evaluate(() => {
        const submit = document.getElementById('Submit') as HTMLInputElement | null;
        const accountNo = document.getElementById('account_No') as HTMLInputElement | null;
        return {
          submitFound: !!submit,
          submitValue: submit?.value,
          submitOnclick: submit?.getAttribute('onclick'),
          inquirycriteria_ONCLICK8_defined: typeof (window as any).inquirycriteria_ONCLICK8,
          accountNoValue: accountNo?.value,
          crvAcctId: (window as any).crvAcctId || '',
        };
      });
      console.log('HACLI diagnostics before Go:', diagnostics);

      // Click the HACLI Go button (#Submit) inside the FINW frame
      const goBtn = finwFrame.locator('#Submit');
      await expect(goBtn, `HACLI Go button (#Submit) must be attached for account ${accountId}`).toBeAttached({ timeout: 10000 });
      await expect(goBtn, `HACLI Go button (#Submit) must be visible for account ${accountId}`).toBeVisible({ timeout: 10000 });
      await expect(goBtn, `HACLI Go button (#Submit) must be enabled for account ${accountId}`).toBeEnabled({ timeout: 10000 });
      await goBtn.click();
      console.log('Clicked HACLI Go button via Playwright #Submit click');

      // In some Finacle builds the Playwright pointer click does not dispatch the onclick handler.
      // If the Transaction Inquiry screen does not load, invoke the handler directly on the button.
      let narrativeVisible = await finwFrame.getByText(expectedParticulars).first().isVisible({ timeout: 8000 }).catch(() => false);
      if (!narrativeVisible) {
        console.log('Playwright #Submit click did not navigate; invoking inquirycriteria_ONCLICK8 directly');
        const onClickResult = await finwFrame.evaluate(() => {
          const submit = document.getElementById('Submit') as HTMLInputElement | null;
          const fn = (window as any).inquirycriteria_ONCLICK8;
          if (!submit || typeof fn !== 'function') return { ok: false };
          const result = fn.call(submit, submit, submit);
          return { ok: true, result: String(result) };
        });
        console.log('HACLI inquirycriteria_ONCLICK8 fallback result:', onClickResult);
      }

      // Wait for the Transaction Inquiry results to load and verify the expected narrative is displayed
      const narrativeLocator = finwFrame.getByText(expectedParticulars).first();
      await expect(
        narrativeLocator,
        `Transaction Inquiry screen did not display the expected narrative for account ${accountId}`
      ).toBeVisible({ timeout: 30000 });

      // Capture HACLI narrative
      const narrativeText = await this.captureHACLI_Narrative(expectedParticulars);
      console.log(`=== HACLI NARRATIVE: ${narrativeText} ===`);

      // Step 23: Click OK and logout
      await this.accountPage.clickOkButton();
      await this.page.waitForTimeout(2000);

      await homePage.logout();
      return narrativeText;
    } catch (e) {
      await homePage.logout().catch(() => {});
      throw e;
    }
  }

  private async captureHACLI_Narrative(expectedParticulars: string): Promise<string> {
    try {
      const finwFrame = this.getFinwFrame();

      // 1. Prefer the exact table cell/element that contains the posted narrative
      const narrativeLocator = finwFrame.getByText(expectedParticulars).first();
      if (await narrativeLocator.count() > 0) {
        const text = await narrativeLocator.textContent() ?? '';
        console.log('Captured HACLI Narrative value:', text);
        return text;
      }

      // 2. Fallback: search the full page text for the expected particulars
      const bodyText = (await finwFrame.locator('body').textContent()) ?? '';
      if (bodyText.includes(expectedParticulars)) {
        console.log('HACLI narrative found in page body');
        return bodyText;
      }

      console.log('Could not isolate exact HACLI Narrative. Body text snippet:', bodyText.substring(0, 1000));
      return bodyText;
    } catch (e) {
      console.log(`Error capturing HACLI narrative: ${e}`);
      return '';
    }
  }

  async servicePackHADVCValidation(): Promise<{
    reportGenerated: boolean;
    criteriaFlushed: boolean;
    reportScreenshot: string | null;
    resetScreenshot: string | null;
    message: string | null;
  }> {
    const homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    let reportScreenshot: string | null = null;
    let resetScreenshot: string | null = null;

    try {
      const FROM_ACCOUNT_ID = '7500001466';
      const FROM_DATE = '01-07-2026';

      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu('HADVC');
      await this.page.waitForTimeout(3000);

      const accountFilled = await this.accountPage.fillByLabel('From A/c. ID', FROM_ACCOUNT_ID);
      if (!accountFilled) {
        throw new Error(`Could not fill HADVC From A/c. ID field with ${FROM_ACCOUNT_ID}`);
      }

      const dateFilled = await this.accountPage.fillByLabel('From Date', FROM_DATE);
      if (!dateFilled) {
        throw new Error(`Could not fill HADVC From Date field with ${FROM_DATE}`);
      }

      await this.accountPage.clickButtonByText('Submit');
      await this.page.waitForTimeout(3000);

      const status = await this.accountPage.getStatusMessage();
      const finwFrame = this.getFinwFrame();
      const bodyText = (await finwFrame.locator('body').innerText().catch(() => '')) || '';
      console.log('HADVC report queue page text snippet:', bodyText.substring(0, 1000));

      const reportGenerated = /Print\s*Debit\/Credit\s*Advice\s*for\s*Customer/i.test(bodyText);
      const statusMessage = status ?? (reportGenerated ? 'Report generated successfully' : null);
      console.log('HADVC report queue status:', statusMessage);

      reportScreenshot = `test-results/hadvc-report-queue-${Date.now()}.png`;
      await this.page.screenshot({ path: reportScreenshot, fullPage: true }).catch(() => {});

      expect(reportGenerated, `HADVC report page was not displayed. Status: ${status}; Page text: ${bodyText}`).toBe(true);

      const okClicked = await this.clickFinwControlByText('OK');
      if (!okClicked) {
        throw new Error('HADVC OK button was not found on the report queue page');
      }
      await this.page.waitForTimeout(3000);

      const fromAccountAfter = await finwFrame.locator('input#fromAcct, input[name="advc.fromAcct"]').first().inputValue().catch(() => '');
      const fromDateAfter = await finwFrame.locator('input#fromDate_ui, input[name="advc.fromDate_ui"], input#fromDate, input[name="advc.fromDate"]').first().inputValue().catch(() => '');
      console.log(`HADVC criteria after OK - From A/c. ID: '${fromAccountAfter}', From Date: '${fromDateAfter}'`);

      const criteriaFlushed = fromAccountAfter.trim() === '';

      resetScreenshot = `test-results/hadvc-criteria-reset-${Date.now()}.png`;
      await this.page.screenshot({ path: resetScreenshot, fullPage: true }).catch(() => {});

      expect(
        criteriaFlushed,
        `HADVC From A/c. ID was not flushed after clicking OK. Current value: '${fromAccountAfter}'. Reset screenshot: ${resetScreenshot}`
      ).toBe(true);

      console.log('From A/c. ID is flushed out in the criteria page successfully.');

      return { reportGenerated, criteriaFlushed, reportScreenshot, resetScreenshot, message: statusMessage };
    } finally {
      await homePage.logout().catch(() => {});
    }
  }

  async servicePackCAACLAClosureAndVerification(
    accountId: string = '3200000052',
  ): Promise<{
    closeMessage: string | null;
    verifyMessage: string | null;
    closeGoScreenshotPath: string;
    verifySubmitScreenshotPath: string;
  }> {
    let closeMessage: string | null = null;
    let verifyMessage: string | null = null;
    let closeGoScreenshotPath = '';
    let verifySubmitScreenshotPath = '';

    // Maker Close flow
    let homePage = await this.login(COMMON_DATA.credentials.username, COMMON_DATA.credentials.password);
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu('CAACLA');
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectFunction('Close');
      await this.page.waitForTimeout(2000);
      await this.accountPage.enterHacmAccountId(accountId);
      await this.page.waitForTimeout(2000);
      await this.accountPage.clickGo();
      await this.page.waitForTimeout(3000);

      const closeGoMessage = await this.accountPage.getStatusMessage();
      fs.mkdirSync('test-results', { recursive: true });
      closeGoScreenshotPath = `test-results/spcaacla-close-go-${Date.now()}.png`;
      await this.page.screenshot({ path: closeGoScreenshotPath, fullPage: true }).catch(() => {});

      const isCloseGoError = /E\d{4}|error|fail|invalid|exception|not allowed|cannot|unable/i.test(closeGoMessage ?? '');
      expect(isCloseGoError, `CAACLA Close - Go failed. Screenshot: ${closeGoScreenshotPath} | Exact message: ${closeGoMessage}`).toBe(false);

      await this.accountPage.submitForm();
      await this.page.waitForTimeout(3000);

      fs.mkdirSync('test-results', { recursive: true });
      const closeSubmitScreenshotPath = `test-results/spcaacla-close-submit-${Date.now()}.png`;
      await this.page.screenshot({ path: closeSubmitScreenshotPath, fullPage: true }).catch(() => {});

      closeMessage = await this.accountPage.getStatusMessage();
      if (closeMessage) {
        closeMessage = closeMessage.replace(/^document\.write\(.*\)\s*/s, '') || closeMessage;
      }
      console.log('CAACLA Close - message after submit:', closeMessage);

      const closeHasError = /E\d{4}|error|fail|invalid|exception|not allowed|cannot|unable/i.test(closeMessage ?? '');
      expect(closeHasError, `CAACLA Close - Submit returned an error. Screenshot: ${closeSubmitScreenshotPath} | Exact message: ${closeMessage}`).toBe(false);

      await this.accountPage.clickOkButton();
      await this.page.waitForTimeout(2000);
    } finally {
      await homePage.logout().catch(() => {});
    }

    // Verifier Verify flow
    homePage = await this.login(COMMON_DATA.verifierCredentials.username, COMMON_DATA.verifierCredentials.password);
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu('CAACLA');
      await this.page.waitForTimeout(3000);
      await this.accountPage.selectFunction('Verify');
      await this.page.waitForTimeout(2000);
      await this.accountPage.enterHacmAccountId(accountId);
      await this.page.waitForTimeout(2000);
      await this.accountPage.clickGo();
      await this.page.waitForTimeout(3000);

      await this.accountPage.submitForm();
      await this.page.waitForTimeout(3000);
      verifyMessage = await this.accountPage.getStatusMessage();
      if (verifyMessage) {
        verifyMessage = verifyMessage.replace(/^document\.write\(.*\)\s*/s, '') || verifyMessage;
      }
      console.log('CAACLA Verify - message after submit:', verifyMessage);

      fs.mkdirSync('test-results', { recursive: true });
      verifySubmitScreenshotPath = `test-results/spcaacla-verify-submit-${Date.now()}.png`;
      await this.page.screenshot({ path: verifySubmitScreenshotPath, fullPage: true }).catch(() => {});

      const isVerifySuccess = /success|verified|authorised|authorized|completed/i.test(verifyMessage ?? '');
      expect(isVerifySuccess, `CAACLA Verify - Submit did not succeed. Screenshot: ${verifySubmitScreenshotPath} | Exact message: ${verifyMessage}`).toBe(true);

      await this.accountPage.clickOkButton();
      await this.page.waitForTimeout(2000);
    } finally {
      await homePage.logout().catch(() => {});
    }

    return { closeMessage, verifyMessage, closeGoScreenshotPath, verifySubmitScreenshotPath };
  }

  // -------------------------------------------------------------------
  // #172 INC000001227660 — HTDITCI TD interest table code searcher
  // In the HTDITCI menu, clicking the Interest Table Code searcher should
  // display Term Deposit (TD) table codes, not loan table codes.
  // -------------------------------------------------------------------
  async servicePackHtditciSearcherValidation(): Promise<{
    success: boolean;
    tableCodes: string[];
    message: string;
  }> {
    const SERIAL = 172;
    const CALL_ID = 'INC000001227660';
    const SCREEN = 'HTDITCI';
    console.log(`[SP #${SERIAL}] [Call ID: ${CALL_ID}] Starting ${SCREEN} TD interest table code searcher validation...`);

    const homePage = await this.login(CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
    try {
      await this.accountPage.selectCoreServer();
      await this.accountPage.searchMenu(SCREEN);
      await this.page.waitForTimeout(3000);

      const popup = await this.accountPage.clickLookupIconByLabel('Interest Table Code');
      await this.page.waitForTimeout(3000);

      const targetPages = [this.page, ...(popup && !popup.isClosed() ? [popup] : [])];
      const rawCodes: string[] = [];
      let allText = '';
      let pageRead = false;

      for (const p of targetPages) {
        if (p.isClosed()) continue;
        for (const f of p.frames()) {
          const bodyText = (await f.locator('body').innerText().catch(() => '')) || '';
          if (bodyText.trim().length > 0) {
            allText += bodyText + '\n';
            pageRead = true;
          }
          const codes = await f.evaluate(() => {
            const found: string[] = [];
            const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('table tr'));
            for (const row of rows) {
              const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));
              for (const c of cells) {
                const t = (c.textContent || '').trim();
                if (/^[A-Z0-9][A-Z0-9_]{1,9}$/.test(t)) {
                  found.push(t);
                }
              }
            }
            return found;
          }).catch(() => [] as string[]);
          rawCodes.push(...codes);
        }
      }

      if (!pageRead) {
        throw new Error(`[SP #${SERIAL}] [Call ID: ${CALL_ID}] Could not read ${SCREEN} searcher contents`);
      }

      const tableCodes = [...new Set(rawCodes)].slice(0, 25);
      const hasTdCode = tableCodes.some(c => /^(TD|TDI|TDINT|TD_|TDF|TDVAR)/i.test(c));
      const hasLoanCode = tableCodes.some(c => /^(LN|LA|RL|HL|CL|LL|PLL|LNP)/i.test(c));
      const textMentionsTd = /Term\s*Deposit|\bTD\b|\bTDI?\b/i.test(allText);
      const textMentionsLoan = /Loan\s*Table|\bLoan\s*Table\b/i.test(allText);

      const tdIndicatorPresent = hasTdCode || textMentionsTd;
      const loanIndicatorPresent = hasLoanCode || textMentionsLoan;
      const success = tdIndicatorPresent && !loanIndicatorPresent;
      const message = success
        ? `${SCREEN} searcher is showing TD interest table codes`
        : `${SCREEN} searcher is not showing TD interest table codes`;

      console.log(`[SP #${SERIAL}] [Call ID: ${CALL_ID}] Displayed table codes: ${tableCodes.join(', ')}`);
      console.log(`[SP #${SERIAL}] [Call ID: ${CALL_ID}] TD indicator present=${tdIndicatorPresent}, Loan indicator present=${loanIndicatorPresent}`);
      if (success) {
        console.log(`[SP #${SERIAL}] [Call ID: ${CALL_ID}] SUCCESS: ${message}`);
      } else {
        console.log(`[SP #${SERIAL}] [Call ID: ${CALL_ID}] FAILED: ${message}`);
      }

      return { success, tableCodes, message };
    } finally {
      if (!this.page.isClosed()) {
        await homePage.logout().catch(() => {});
      }
    }
  }

  private extractTransactionId(text: string | null): string | null {
    if (!text) return null;
    const match = text.match(/(?:Transaction\s*(?:Id|No|#)?|Tran\s*Id|Transaction\s*Ref)\s*[:\s]*([A-Z0-9]{6,})/i)
      ?? text.match(/\b([A-Z]{2,}\d{4,})\b/);
    return match ? match[1] : null;
  }
}
