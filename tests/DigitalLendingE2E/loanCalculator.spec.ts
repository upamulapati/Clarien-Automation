import { test } from '@playwright/test';
import { LoanCalculatorPage } from '../pages/DigitalLending/loanCalculatorPage';
import testData from '../config/testData.json';

/**
 * Test Scenario: Digital Lending - Vehicle Loan Calculator (POM)
 * Data-driven flow validating the loan calculator across all vehicle types.
 * - Test data: tests/config/testData.json
 * - Page object: tests/pages/DigitalLendingPages/loanCalculatorPage.ts
 * - Common actions: tests/basePage/basepage.ts
 */

interface VehicleTypeData {
    type: string;
    downPaymentPercent: number;
    maxLoanLength: string;
    expectedInterestRate: string;
}

const { loanPortalUrl, vehiclePrice, vehicleTypes } = testData as {
    loanPortalUrl: string;
    vehiclePrice: number;
    vehicleTypes: VehicleTypeData[];
};

let loanCalculatorPage: LoanCalculatorPage;

test.describe('Digital Lending - Vehicle Loan Calculator (POM)', () => {

    test.beforeEach(async ({ page }) => {
        loanCalculatorPage = new LoanCalculatorPage(page);
    });

    test('Validate loan calculator across all vehicle types', async () => {
        for (const data of vehicleTypes) {
            console.log(`\n--- Validating vehicle type: ${data.type} ---`);

            // Step 1: Open the loan portal
            await loanCalculatorPage.navigate(loanPortalUrl);

            // Step 2: Select vehicle type
            await loanCalculatorPage.selectVehicleType(data.type);

            // Step 3: Validate Interest Rate matches expected default
            await loanCalculatorPage.validateInterestRate(data.expectedInterestRate);
            console.log(`Interest Rate matched: ${data.expectedInterestRate}`);

            // Step 4: Enter Vehicle Price
            await loanCalculatorPage.enterVehiclePrice(vehiclePrice);

            // Step 5: Verify Down Payment matches expected percentage
            const expectedDownPayment = vehiclePrice * data.downPaymentPercent;
            await loanCalculatorPage.validateDownPayment(expectedDownPayment);
            console.log(
                `Down Payment matched: ${expectedDownPayment.toLocaleString('en-US')} ` +
                `(${data.downPaymentPercent * 100}% of ${vehiclePrice})`
            );

            // Step 6: Verify max loan length is available for this vehicle type
            await loanCalculatorPage.validateMaxLoanLength(data.maxLoanLength);
            console.log(`Max Loan Length present: ${data.maxLoanLength}`);
        }
    });
});
