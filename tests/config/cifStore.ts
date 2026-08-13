import { getCif, saveCif } from '../helpers/sharedState';

// =====================================================================
// cifStore — persists the CIF ID created by an end-to-end (E2E) flow so
// that the modification specs (which run as separate spec files) can pick
// up the SAME dynamically-created CIF.
//
// The E2E creation specs call saveCreatedCif('retail'|'corporate', cifId)
// after capturing the new CIF. The modification specs call
// getCreatedCif('retail'|'corporate', fallback) to read it. If no E2E run
// has produced a CIF (the shared state is missing/empty), getCreatedCif
// logs a message and returns the supplied hardcoded fallback so the spec
// can still run standalone.
// =====================================================================

export type CifSection = 'retail' | 'corporate';

// Persist the CIF ID created by an E2E flow.
export function saveCreatedCif(section: CifSection, cifId: string): void {
  if (!cifId) {
    console.log(`[cifStore] No ${section} CIF ID to save (empty); skipping persistence.`);
    return;
  }
  try {
    saveCif(section, cifId);
  } catch (e) {
    console.log(`[cifStore] Failed to save ${section} CIF ID: ${(e as Error).message}`);
  }
}

// Read the CIF ID created by an E2E flow, falling back to `fallback` (a
// hardcoded CIF) with a clear log message when no E2E CIF is available.
export function getCreatedCif(section: CifSection, fallback: string): string {
  const cifId = getCif(section);
  if (cifId) {
    console.log(
      `[cifStore] Using ${section} CIF ID "${cifId}" created by the E2E flow (shared-state).`
    );
    return String(cifId);
  }
  console.log(
    `[cifStore] No E2E-created ${section} CIF found. Falling back to hardcoded CIF "${fallback}". ` +
      `Run the ${section} end-to-end creation spec first to modify a freshly-created CIF.`
  );
  return fallback;
}
