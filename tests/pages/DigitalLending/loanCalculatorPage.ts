import { Page, Locator, expect } from "@playwright/test";

export class LoanCalculatorPage {
    readonly page: Page;
    public readonly vehiclePriceInput: Locator;
    public readonly downPaymentInput: Locator;

    constructor(page: Page) {
        this.page = page;
        // The first textbox on the calculator card is Vehicle Price,
        // the second is Down Payment.
        this.vehiclePriceInput = page.getByRole('textbox').first();
        this.downPaymentInput = page.getByRole('textbox').nth(1);
    }

    async navigate(url: string) {
        await this.page.goto(url);
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForLoadState('networkidle');
    }

    private vehicleTypeTile(type: string): Locator {
        // Click the parent card of the type label so the LWC click handler fires reliably.
        return this.page
            .getByText(type, { exact: true })
            .locator('xpath=ancestor::*[self::div or self::section][1]');
    }

    async selectVehicleType(type: string) {
        const tile = this.vehicleTypeTile(type);
        await tile.waitFor({ timeout: 15_000 });
        await tile.click();
    }

    private interestRateValue(expectedRate: string): Locator {
        // Locator that targets the value cell next to the "Interest Rate" label
        // only when its text equals the expected rate.
        return this.page.locator(
            `xpath=//*[normalize-space(text())="Interest Rate"]` +
            `/following-sibling::*[normalize-space(text())="${expectedRate}"]`
        );
    }

    async validateInterestRate(expectedRate: string) {
        await expect(this.interestRateValue(expectedRate))
            .toBeVisible({ timeout: 20_000 });
    }

    async enterVehiclePrice(price: number) {
        await this.vehiclePriceInput.click();
        await this.vehiclePriceInput.fill(String(price));
        await this.page.keyboard.press('Tab');
    }

    async validateDownPayment(expectedAmount: number) {
        // The down payment field is rendered with thousand-separator formatting.
        const expectedText = expectedAmount.toLocaleString('en-US');
        await expect(this.downPaymentInput)
            .toHaveValue(expectedText, { timeout: 20_000 });
    }

    private maxLoanLengthOption(length: string): Locator {
        return this.page.locator('.loan-tenure-item', {
            hasText: new RegExp(`^${length}$`),
        });
    }

    async validateMaxLoanLength(length: string) {
        await expect(this.maxLoanLengthOption(length))
            .toBeVisible({ timeout: 20_000 });
    }
}
