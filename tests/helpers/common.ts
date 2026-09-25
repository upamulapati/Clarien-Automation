import { Page } from '@playwright/test';
import COMMON_DATA from '../../data/common-data.json';

/**
 * Shared HPORDM test data from the central JSON file.
 */
export const HPORDM_TEST_DATA = (COMMON_DATA as any).paymentOrderTestData ?? [];

/**
 * Shared HDDMI demand draft test data from the central JSON file.
 */
export const DD_DATA = COMMON_DATA.demandDraftData;

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

function formatDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function parseApplicationDate(text: string): string | null {
  // Pattern: "1 October, 2026"
  const alphaMatch = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,}),\s*(\d{4})\b/);
  if (alphaMatch) {
    const day = alphaMatch[1].padStart(2, '0');
    const month = MONTHS[alphaMatch[2].toLowerCase()] || '01';
    return `${day}-${month}-${alphaMatch[3]}`;
  }
  // Pattern: dd-mm-yyyy already displayed
  const numericMatch = text.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
  if (numericMatch) {
    return `${numericMatch[1]}-${numericMatch[2]}-${numericMatch[3]}`;
  }
  return null;
}

/**
 * Reads the application/business date displayed by Finacle and returns it as dd-mm-yyyy.
 * Falls back to the test machine's current date if the UI date cannot be read.
 */
export async function getApplicationDate(page: Page): Promise<string> {
  try {
    for (const frame of page.frames()) {
      const text = await frame.locator('body').innerText().catch(() => '');
      const parsed = parseApplicationDate(text);
      if (parsed) {
        console.log(`Application date read from UI: ${parsed}`);
        return parsed;
      }
    }
  } catch (e) {
    console.log(`Could not read application date from UI: ${e}`);
  }
  console.log('Falling back to system date for application date');
  return formatDDMMYYYY(new Date());
}

/**
 * Returns the application date offset by the given number of months, as dd-mm-yyyy.
 */
export async function getApplicationDateOffset(page: Page, months: number): Promise<string> {
  const base = await getApplicationDate(page);
  const [dd, mm, yyyy] = base.split('-').map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  const originalDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDay));
  return formatDDMMYYYY(d);
}
