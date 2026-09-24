/**
 * Application roles. Must stay in sync with the `Role` enum in prisma/schema.prisma
 * (a test enforces this once the enum exists).
 */
export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SALES_MANAGER: 'SALES_MANAGER',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES = Object.values(Role);
