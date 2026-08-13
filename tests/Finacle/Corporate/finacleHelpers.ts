import { Frame, Page } from '@playwright/test';
import { getMakerConfig } from '../../config/crmTestData';
import { CrmModificationBasePage } from '../../pages/CRM/crmModificationBasePage';

// Shared helper wrappers for legacy corporate specs that still import from
// ./finacleHelpers. Internally they delegate to CrmModificationBasePage so the
// common login / dashboard / frame / logout logic lives in one place.

function base(page: Page): CrmModificationBasePage {
  return new CrmModificationBasePage(page, getMakerConfig(), []);
}

export async function login(page: Page, userId: string, password: string): Promise<void> {
  return base(page).login(userId, password, page);
}

export async function waitForDashboard(page: Page, timeoutMs = 30000): Promise<boolean> {
  return base(page).waitForDashboard(page, timeoutMs);
}

export async function switchToCRM(page: Page, _role = 'maker'): Promise<Frame | null> {
  return base(page).switchToCrm(true, page);
}

export async function findFrameByText(page: Page, re: RegExp, timeoutMs = 15000): Promise<Frame | null> {
  return base(page).findFrameByText(page, re, timeoutMs);
}

export async function clickButtonByLabel(page: Page, label: string, timeoutMs = 12000): Promise<boolean> {
  return base(page).clickButtonByLabel(page, label, timeoutMs);
}

export async function logout(page: Page): Promise<boolean> {
  return base(page).logout(page);
}
