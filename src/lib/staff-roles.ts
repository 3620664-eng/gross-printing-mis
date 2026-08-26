/**
 * What each role in the shop can reach.
 *
 * These facts were previously stated in two places that had no way of agreeing:
 * the navigation in `MISApp` decided what a role could open, while the role
 * descriptions on the Admin screen described it in prose. Nothing kept the
 * prose honest, so an owner changing someone's role read one thing and got
 * another.
 *
 * The navigation now derives its role lists from here, so the description an
 * owner reads before changing a role is generated from the same values that
 * decide what that person will actually see.
 *
 * This is the shop's own boundary, not a security control. The server decides
 * what leaves the building: `stateForRole` in `src/app/api/shop-data/route.ts`
 * strips invoice fields out of the data sent to production roles, so hiding a
 * menu item is the last line here, not the only one.
 */

/**
 * The same union as `AppRole` in `gmail-server.ts`, restated here because that
 * module is server-only and this one is imported by client components. A
 * security check keeps the two lists in step.
 */
export type StaffRole = "admin" | "front_desk" | "prepress" | "press" | "finishing";

/** Alias so callers that already speak in terms of AppRole read naturally. */
export type AppRole = StaffRole;

export const ALL_ROLES: AppRole[] = ["admin", "front_desk", "prepress", "press", "finishing"];

/** Roles that handle customers, quotes, and money. */
export const OFFICE_ROLES: AppRole[] = ["admin", "front_desk"];

/** Roles that work on the floor and never see what a job is worth. */
export const PRODUCTION_ROLES: AppRole[] = ["prepress", "press", "finishing"];

export interface RoleProfile {
  role: AppRole;
  label: string;
  /** What this person does, in the shop's own words. */
  summary: string;
  /** Whether they can see pricing, quotes, and invoices anywhere in the app. */
  seesMoney: boolean;
  /** Whether they can change shop-wide settings, staff, and catalog rates. */
  administers: boolean;
}

export const ROLE_PROFILES: RoleProfile[] = [
  {
    role: "admin",
    label: "Administrator",
    summary: "Everything: production, customers, pricing, invoices, staff, and settings.",
    seesMoney: true,
    administers: true
  },
  {
    role: "front_desk",
    label: "Office / Estimator",
    summary: "Takes work in, quotes it, and bills it. No staff or shop settings.",
    seesMoney: true,
    administers: false
  },
  {
    role: "prepress",
    label: "Prepress Worker",
    summary: "Their assigned work and the job board. Artwork and notes, no money.",
    seesMoney: false,
    administers: false
  },
  {
    role: "press",
    label: "Press Worker",
    summary: "Their assigned work and the job board. Run instructions, no money.",
    seesMoney: false,
    administers: false
  },
  {
    role: "finishing",
    label: "Finishing Worker",
    summary: "Their assigned work and the job board. Finishing notes, no money.",
    seesMoney: false,
    administers: false
  }
];

export function roleProfile(role: AppRole) {
  return ROLE_PROFILES.find((profile) => profile.role === role);
}

export function roleLabel(role: AppRole) {
  return roleProfile(role)?.label ?? role;
}

/**
 * Plain sentence describing what changing someone's role will do to their
 * access, for the owner to read before committing to it.
 */
export function roleChangeEffect(from: AppRole, to: AppRole) {
  const before = roleProfile(from);
  const after = roleProfile(to);
  if (!before || !after || from === to) return "";

  const parts: string[] = [`${after.label}: ${after.summary}`];
  if (before.seesMoney && !after.seesMoney) {
    parts.push("They will no longer see pricing, quotes, or invoices anywhere.");
  }
  if (!before.seesMoney && after.seesMoney) {
    parts.push("They will now be able to see pricing, quotes, and invoices.");
  }
  if (before.administers && !after.administers) {
    parts.push("They will lose access to staff, settings, and catalog rates.");
  }
  if (!before.administers && after.administers) {
    parts.push("They will be able to change staff, settings, and catalog rates.");
  }
  return parts.join(" ");
}
