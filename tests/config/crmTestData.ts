import crmTestData from './crmTestData.json';

// =====================================================================
// Type Definitions
// =====================================================================

export interface TimeoutConfig {
  veryShort: number;
  short: number;
  short3: number;
  medium: number;
  medium4: number;
  long: number;
  long15: number;
  popupLoad: number;
  formLoad: number;
  crmLoad: number;
  testTimeout: number;
}

export interface AppConfig {
  baseUrl: string;
  username: string;
  password: string;
  timeouts: TimeoutConfig;
}

export interface VerificationOptions {
  cifId: string;
  screenId: string;
  menuKeywords: string[];
  menuFrameName?: string;
  popupCloseUrls: string[];
  approvalLinkStyle: 'retail' | 'corporate';
  searchMenuItem: string;
  searchCriteria: string;
  statusLabel: string;
  screenshotPrefix: string;
  summaryTitle: string;
  sectionLabel: string;
}

// =====================================================================
// Exported Test Data
// =====================================================================

export const CRM_TEST_DATA = crmTestData;

export function getPrimaryConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    baseUrl: crmTestData.common.baseUrl,
    username: crmTestData.common.credentials.primary.username,
    password: crmTestData.common.credentials.primary.password,
    timeouts: crmTestData.common.timeouts as TimeoutConfig,
    ...overrides
  };
}

export function getVerificationConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    baseUrl: crmTestData.common.baseUrl,
    username: crmTestData.common.credentials.verification.username,
    password: crmTestData.common.credentials.verification.password,
    timeouts: crmTestData.common.timeouts as TimeoutConfig,
    ...overrides
  };
}
