import * as path from "path";
import flowConfig from "../Finacle/crmCIFRetail/cifmodificationflowconfig.json";

export type UpdateSection = "address" | "phone" | "bank";

/**
 * Resolves the flow key from an optional explicit value, the CIF_MOD_FLOW
 * environment variable, or the base name of the running spec file.
 */
export function resolveFlow(specFile?: string): string {
  if (process.env.CIF_MOD_FLOW) return process.env.CIF_MOD_FLOW;
  if (specFile) return path.basename(specFile, ".spec.ts");
  return "flow1";
}

/**
 * Checks whether a given section should be updated for the resolved flow.
 * Usage: if (shouldUpdate("address") && !isEmpty(data.address)) { ... }
 */
export function shouldUpdate(section: UpdateSection, specFile?: string): boolean {
  const flow = resolveFlow(specFile);
  const cfg = (flowConfig as any)[flow];
  return !!cfg?.[section];
}
