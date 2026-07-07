import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.resolve(__dirname, '../../data/shared-state.json');

interface SharedState {
  cifId?: string;
  accountId?: string;
  [key: string]: string | undefined;
}

// Reads the current shared state from disk. Returns an empty object if the
// file does not exist or cannot be parsed.
export function readSharedState(): SharedState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {
    // Corrupted or missing file – start fresh
  }
  return {};
}

// Merges the given key/value pairs into the existing shared state file.
export function writeSharedState(data: Partial<SharedState>): void {
  const current = readSharedState();
  const merged = { ...current, ...data };
  fs.writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`[SharedState] Wrote to ${STATE_FILE}:`, data);
}

// Convenience getter – returns a single value or undefined.
export function getSharedValue(key: string): string | undefined {
  return readSharedState()[key];
}
