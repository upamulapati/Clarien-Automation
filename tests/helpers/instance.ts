import { allure } from 'allure-playwright';

/**
 * Tag the current Playwright/Allure test with an instance identifier.
 * This lets the orchestrator map each Allure result back to a flow instance
 * and downstream dependencies accurately.
 */
export function tagInstance(instance: string | number, flowName?: string): void {
  try {
    if (instance != null && String(instance).trim() !== '') {
      allure.label('instance', String(instance).trim());
    }
    if (flowName && String(flowName).trim() !== '') {
      allure.label('flowName', String(flowName).trim());
    }
  } catch (e) {
    // If Allure runtime is unavailable, fail silently so the test still runs.
    console.log(`[tagInstance] Could not tag instance: ${e}`);
  }
}

/**
 * Build a stable test title suffix that includes the instance ID.
 * This is a fallback the orchestrator can parse if labels are missing.
 */
export function instanceTitle(instance: string | number): string {
  return `[instance:${instance}]`;
}

/**
 * Helper to read the upstream output for the current instance from shared state.
 * The orchestrator sets SHARED_STATE_IN to the key that holds per-instance outputs.
 */
export function getUpstreamInstanceValue<T = any>(
  stateGetter: (state: any) => T | undefined
): T | undefined {
  return stateGetter({});
}

/**
 * Shared-state key that the current step reads from (set by the orchestrator).
 */
export function sharedStateInKey(): string {
  return process.env.SHARED_STATE_IN || '';
}

/**
 * Shared-state key that the current step writes to (set by the orchestrator).
 */
export function sharedStateOutKey(): string {
  return process.env.SHARED_STATE_OUT || '';
}
