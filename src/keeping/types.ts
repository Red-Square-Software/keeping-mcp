// Loose-by-design response typings for the Keeping API (D-34).
// These are *cache typings*, not validators — additional fields tolerated.
// The live probe in Plan 02-05 will reveal exact shapes; until then we keep
// the contract permissive so we can iterate without breaking downstream code.

export interface KeepingUser {
  id: string;
  name?: string;
  email?: string;
  // Room for whatever the live probe reveals; additional fields tolerated.
}

export interface KeepingOrg {
  id: string;
  name: string;
  // Feature flags — exact key names TBD by live probe per IDENT-02.
  projects?: boolean;
  tasks?: boolean;
  timesheet_mode?: string;
}
