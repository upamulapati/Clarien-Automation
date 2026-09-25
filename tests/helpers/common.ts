import COMMON_DATA from '../../data/common-data.json';

/**
 * Shared HPORDM test data from the central JSON file.
 * Import this instead of repeating `const DATA = COMMON_DATA.paymentOrderData` in every spec.
 */
export const HPORDM_DATA = COMMON_DATA.paymentOrderData;

/**
 * Shared HPORDM SWIFT test data from the central JSON file.
 */
export const HPORDM_DATA_SWIFT = COMMON_DATA.paymentOrderDataSwift;

/**
 * Shared HPORDM ACH FCC/FCTP test data from the central JSON file.
 */
export const HPORDM_DATA_ACH_FCC = COMMON_DATA.paymentOrderDataAchFcc;

/**
 * Shared HPORDM SWIFT FCC/FCTP test data from the central JSON file.
 */
export const HPORDM_DATA_SWIFT_FCC = COMMON_DATA.paymentOrderDataSwiftFcc;

/**
 * Shared HDDMI demand draft test data from the central JSON file.
 */
export const DD_DATA = COMMON_DATA.demandDraftData;

/**
 * Returns today's date as dd-mm-yyyy, matching the Finacle date format used in HPORDM.
 */
export function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}
