import { test, expect } from '@playwright/test';
import {
  getPrimaryConfig,
  getVerificationConfig,
  CRM_TEST_DATA
} from '../../config/crmTestData';
import {
  login,
  setupDialogHandlers
} from '../../config/crmSetup';
import { CrmRetailEndToEndPage } from '../../pages/CRM/crmRetailEndToEndPage';
import {
  getExcelRetailEndToEndData,
  getAllRetailInstances
} from '../../config/excelReader';
import { CrmVerificationPage } from '../../pages/CRM/crmVerificationPage';
import { writeSharedState } from '../../helpers/sharedState';
import { ServicePackPage } from '../../pages/CRM/servicePackPage';

const CONFIG = getPrimaryConfig();
const VERIFY_CONFIG = getVerificationConfig();

const retailInstances = getAllRetailInstances();

if (retailInstances.length === 0) {
  throw new Error(
    'No valid test instances were found in RetailCustomerData.'
  );
}

for (const instance of retailInstances) {
  test.describe.serial(
    `Retail CIF End-to-End - Instance ${instance}`,
    () => {
      test.use({
        ignoreHTTPSErrors: true,
        actionTimeout: 30000
      });

      let cifId = '';

      test(
        `Complete CIF Creation Flow - Instance ${instance}`,
        async ({ page }) => {
          test.setTimeout(900000);

          const lastDialogMessages: string[] = [];

          setupDialogHandlers(
            page,
            lastDialogMessages
          );

          await login(page, CONFIG);

          const excelData =
            getExcelRetailEndToEndData(instance);

          expect(
            excelData.customerData,
            `Customer data must exist for instance ${instance}`
          ).toBeTruthy();

          console.log(
            `\nInstance ${instance} data counts:`
          );
          console.log(
            `  Contacts: ${excelData.contacts.length}`
          );
          console.log(
            `  Documents: ${excelData.documents.length}`
          );
          console.log(
            `  Currencies: ${excelData.currencies.length}`
          );
          console.log(
            `  Other Banks: ${excelData.otherBanks.length}`
          );

          const retailPage =
            new CrmRetailEndToEndPage(
              page,
              CONFIG,
              lastDialogMessages,
              excelData
            );

          const servicePackPage =
            new ServicePackPage(
              page,
              CONFIG,
              lastDialogMessages
            );

          // Step 1: Select CRM solution.
          await retailPage.selectCrm();

          // Step 2: Wait for CRM to load.
          await retailPage.waitForCrmLoad();

          // Step 3: Navigate to CIF Retail > New Entity > Customer.
          await retailPage.navigateToNewEntity();

          // Step 4: Wait for Customer form.
          await retailPage.waitForCustomerForm();

          // Step 5: Fill Basic Info.
          await retailPage.fillBasicInfo();

          const minorResult =
            await servicePackPage
              .verifyMinorDetailsAfterDobFocus(page);

          if (minorResult.dobFieldExists) {
            expect(
              minorResult.minorFieldVisible,
              'SP#6: CustomerMinor field must stay visible after DOB focus'
            ).toBe(true);
          }

          // Step 6: General/Currency sub-tab.
          await retailPage.fillCurrencySubTab();

          // Step 7: All addresses, phones and emails.
          await retailPage.fillContactTab();

          const addressResult =
            await servicePackPage
              .verifyAddressFieldsNotUndefined(page);

          if (addressResult.checked) {
            expect(
              addressResult.undefinedFields.length,
              'SP#5: Address fields must not contain undefined'
            ).toBe(0);
          }

          // Step 8: All identification documents.
          await retailPage.fillIdDocumentTab();

          // Step 9: All currency records.
          await retailPage.fillCurrencyTab();

          const currencyResult =
            await servicePackPage
              .verifyCurrencyAutoPopulate(page);

          if (currencyResult.ccyCodeValue) {
            expect(
              currencyResult.ccyDisplayValue,
              'SP#1: CCY display must not be undefined'
            ).not.toBe('undefined');
          }

          // Step 10: Demographic, employment and income.
          await retailPage.fillDemographicTab();

          const nationalityResult =
            await servicePackPage
              .verifyNationalityDisplayFormat(page);

          if (nationalityResult.codeValue) {
            expect(
              nationalityResult.hasDisplayText,
              'SP#3: Nationality display must contain descriptive text'
            ).toBe(true);
          }

          const employmentResult =
            await servicePackPage
              .verifyEmployeeNameSaved(page);

          if (employmentResult.employeeTypeField) {
            expect(
              employmentResult.isSaved,
              'SP#8: Employee Type must be saved'
            ).toBe(true);
          }

          // Step 11: Pre-submit verification.
          await retailPage.preSubmitVerification();

          const iconResult =
            await servicePackPage
              .verifyIconsFunctional(page);

          expect(
            iconResult.submitVisible,
            'SP#2: Submit button must be visible'
          ).toBe(true);

          // Step 12: Submit.
          await retailPage.submitForm();

          // Step 13: Process Selection.
          await retailPage.handleProcessSelection();

          cifId = retailPage.cifId.trim();

          expect(
            cifId,
            `CIF ID must be captured for instance ${instance}`
          ).toBeTruthy();

          // Retain compatibility with the existing shared-state helper.
          writeSharedState({ cifId });

          console.log(
            `\n=== E2E Summary - Instance ${instance} ===`
          );
          console.log('  ✓ Basic Info completed');
          console.log(
            `  ✓ ${excelData.contacts.length} contact row(s) processed`
          );
          console.log(
            `  ✓ ${excelData.documents.length} document row(s) processed`
          );
          console.log(
            `  ✓ ${excelData.currencies.length} currency row(s) processed`
          );
          console.log(
            '  ✓ Demographic details completed'
          );
          console.log(`  ✓ CIF ID: ${cifId}`);

          if (retailPage.processSaveConfirmed) {
            console.log(
              '  ✓ Process Selection save confirmed'
            );
          } else {
            console.log(
              '  ⚠ Process Selection confirmation not received'
            );
          }

          console.log(
            `=== Instance ${instance} creation completed ===`
          );

          await retailPage.doLogout();
        }
      );

      test(
        `Approve CIF via Entity Queue - Instance ${instance}`,
        async ({ page }) => {
          test.setTimeout(
            VERIFY_CONFIG.timeouts.testTimeout
          );

          expect(
            cifId,
            `No CIF ID is available for approval of instance ${instance}`
          ).toBeTruthy();

          const lastDialogMessages: string[] = [];

          setupDialogHandlers(
            page,
            lastDialogMessages
          );

          await login(page, VERIFY_CONFIG);

          const verificationPage =
            new CrmVerificationPage(
              page,
              VERIFY_CONFIG,
              lastDialogMessages
            );

          await verificationPage.performVerification({
            cifId,
            screenId:
              CRM_TEST_DATA.retail.screenId,
            menuKeywords:
              CRM_TEST_DATA.retail.menuKeywords,
            menuFrameName:
              CRM_TEST_DATA.retail.menuFrameName,
            popupCloseUrls:
              CRM_TEST_DATA.retail.verification
                .popupCloseUrls,
            approvalLinkStyle: 'retail',
            searchMenuItem:
              CRM_TEST_DATA.retail.verification
                .searchMenuItem,
            searchCriteria:
              CRM_TEST_DATA.retail.verification
                .searchCriteria,
            statusLabel: 'active',
            screenshotPrefix:
              `cif-e2e-approval-instance-${instance}`,
            summaryTitle:
              `CIF Approval Verification - Instance ${instance}`,
            sectionLabel: 'CIF Retail'
          });
        }
      );
    }
  );
}