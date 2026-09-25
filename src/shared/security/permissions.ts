import { Role } from './roles';

/**
 * Single source of truth for authorization.
 *
 * Routes are protected with `authorize(Permission.X)`, never with role names,
 * so granting a role a new capability is a one-line change here.
 *
 * Naming: '<module>:<action>' (lowercase, kebab-case module name).
 */
export const Permission = {
  /** Minimal user directory (id, name, role) for pickers such as "assign to". */
  USERS_LOOKUP: 'users:lookup',
  USERS_READ: 'users:read',
  USERS_MANAGE: 'users:manage',
  ENQUIRIES_READ: 'enquiries:read',
  ENQUIRIES_UPDATE: 'enquiries:update',
  ENQUIRIES_ASSIGN: 'enquiries:assign',
  ENQUIRIES_FOLLOW_UP: 'enquiries:follow-up',
  ENQUIRIES_DELETE: 'enquiries:delete',
  BRANDS_READ: 'brands:read',
  BRANDS_CREATE: 'brands:create',
  BRANDS_UPDATE: 'brands:update',
  BRANDS_DELETE: 'brands:delete',
  // @generator:permissions (new module permissions are inserted above this line)
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL_PERMISSIONS = Object.values(Permission) as Permission[];

/**
 * SUPER_ADMIN always holds every permission.
 * Every other role must be granted permissions explicitly.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.SUPER_ADMIN]: ALL_PERMISSIONS,
  [Role.SALES_MANAGER]: [
    Permission.USERS_LOOKUP,
    Permission.ENQUIRIES_READ,
    Permission.ENQUIRIES_UPDATE,
    Permission.ENQUIRIES_ASSIGN,
    Permission.ENQUIRIES_FOLLOW_UP,
    Permission.BRANDS_READ,
  ],
};

const permissionSets = new Map<Role, ReadonlySet<Permission>>(
  Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => [role as Role, new Set(permissions)])
);

export function permissionsFor(role: Role): ReadonlySet<Permission> {
  return permissionSets.get(role) ?? new Set();
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionsFor(role).has(permission);
}
