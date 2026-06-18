import { Page, Frame } from '@playwright/test';

export class CRMPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ============ Frame Helpers ============
  private getFuncMainFrame(): Frame {
    const frame = this.page.frame({ name: 'Functionmain' });
    if (!frame) {
      throw new Error('Functionmain frame not found!');
    }
    return frame;
  }

  private getCIFRetailFrame(): Frame {
    const frame = this.page.frame({ name: '1504' });
    if (!frame) {
      throw new Error('CIFRetail frame (1504) not found!');
    }
    return frame;
  }

  // ============ Navigation Methods ============
  async navigateToCIFRetail() {
    const funcMainFrame = this.getFuncMainFrame();
    await funcMainFrame.locator('span#spanFor1').click({ force: true });
    await this.page.waitForTimeout(3000);
  }

  async navigateToEntityQueue() {
    const cifRetailFrame = this.getCIFRetailFrame();
    await cifRetailFrame.locator('span#spanFor2').click();
    await this.page.waitForTimeout(5000);
  }
}
