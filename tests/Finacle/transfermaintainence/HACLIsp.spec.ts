import { test, expect } from '@playwright/test';
import { ServicePackPage } from '../../pages/servicepackpage';

test.describe('HACLIsp - Service Pack Transaction Validation', () => {
  test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

  test('HACLIsp - Complete maker/verifier/narrative flow', async ({ page }) => {
    test.setTimeout(900000);
    const spPage = new ServicePackPage(page);

    try {
      // Steps 1-23 are executed via the POM method in servicepackpage.ts:
      // maker HTM posting, verifier authorisation and HACLI narrative validation.
      const result = await spPage.servicePackHACLISpValidation();

      // Step 15: Hard assertion - Transaction ID must be captured and printed.
      expect(result.transactionId, 'Transaction ID was not captured. The HTM transaction may not have posted.').toBeTruthy();
      console.log(`Transaction ID: ${result.transactionId}`);

      // Step 15: Hard assertion - Post status message must be captured.
      expect(result.postStatus, 'Post status message was not captured. Please review the HTM post step.').toBeTruthy();
      console.log(`Post status: ${result.postStatus}`);

      // Step 18: Hard assertion - verification message must indicate success.
      expect(
        result.verificationMessage,
        `Verification did not complete successfully. Message: ${result.verificationMessage}`
      ).toMatch(/(verified|approved|authorised|authorized|success)/i);
      console.log(`Verification message: ${result.verificationMessage}`);

      // Step 22: Hard assertion - HACLI narrative must fully match the Transaction Particulars entered in HTM.
      expect(
        result.narrativeText,
        'HACLI narrative does not fully match the Transaction Particulars entered in HTM.'
      ).toBe(result.transactionParticulars);
      console.log(`HACLI narrative matches Transaction Particulars: ${result.narrativeText}`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`HACLIsp flow failed: ${errorMessage}`);
      throw e;
    }
  });
});
