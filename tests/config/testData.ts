import COMMON_DATA from '../../data/common-data.json';

// Single source of truth for the shared customer/branch defaults.
// Product test data below is built by merging these defaults with product-specific
// values from common-data.json. Changing defaultCustomer in the JSON is enough
// to change the CIF/SOL/currency for every account creation flow.
export const DEFAULT_CUSTOMER = COMMON_DATA.defaultCustomer;

// Default account fields without the dispatch mode (savings/term don't need it at creation).
const { dispatchMode: _dispatchMode, ...CUSTOMER_DEFAULTS } = DEFAULT_CUSTOMER;

export const SAVINGS_TEST_DATA = {
  ...CUSTOMER_DEFAULTS,
  schemeCode: COMMON_DATA.savingsAccount.schemeCode,
};

export const CURRENT_ACCOUNT_DATA = {
  ...CUSTOMER_DEFAULTS,
  dispatchMode: DEFAULT_CUSTOMER.dispatchMode as 'email' | 'post' | 'no dispatch',
};

export const TERM_DEPOSIT_DATA = {
  ...CUSTOMER_DEFAULTS,
  ...COMMON_DATA.termDeposit,
};

export const TOP_UP_DEPOSIT_DATA = {
  ...CUSTOMER_DEFAULTS,
  ...COMMON_DATA.topUpDeposit,
};

export const SERVICE_PACK_NOMINATION_DATA = {
  ...CUSTOMER_DEFAULTS,
  ...COMMON_DATA.servicePackNominationValidation,
  dispatchMode: COMMON_DATA.servicePackNominationValidation.dispatchMode as 'email' | 'post' | 'no dispatch',
};
