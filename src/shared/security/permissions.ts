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
  CATEGORIES_READ: 'categories:read',
  CATEGORIES_CREATE: 'categories:create',
  CATEGORIES_UPDATE: 'categories:update',
  CATEGORIES_DELETE: 'categories:delete',
  PRODUCTS_READ: 'products:read',
  PRODUCTS_CREATE: 'products:create',
  PRODUCTS_UPDATE: 'products:update',
  PRODUCTS_DELETE: 'products:delete',
  MEDIA_READ: 'media:read',
  MEDIA_CREATE: 'media:create',
  MEDIA_DELETE: 'media:delete',
  DASHBOARD_READ: 'dashboard:read',
  CONTACTS_READ: 'contacts:read',
  CONTACTS_UPDATE: 'contacts:update',
  CONTACTS_DELETE: 'contacts:delete',
  NOTIFICATIONS_READ: 'notifications:read',
  HOMEPAGE_READ: 'homepage:read',
  HOMEPAGE_CREATE: 'homepage:create',
  HOMEPAGE_UPDATE: 'homepage:update',
  HOMEPAGE_DELETE: 'homepage:delete',
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
    Permission.BRANDS_CREATE,
    Permission.BRANDS_UPDATE,
    Permission.BRANDS_DELETE,
    Permission.CATEGORIES_READ,
    Permission.CATEGORIES_CREATE,
    Permission.CATEGORIES_UPDATE,
    Permission.CATEGORIES_DELETE,
    Permission.PRODUCTS_READ,
    Permission.PRODUCTS_CREATE,
    Permission.PRODUCTS_UPDATE,
    Permission.PRODUCTS_DELETE,
    Permission.MEDIA_READ,
    Permission.MEDIA_CREATE,
    Permission.MEDIA_DELETE,
    Permission.DASHBOARD_READ,
    Permission.CONTACTS_READ,
    Permission.CONTACTS_UPDATE,
    Permission.NOTIFICATIONS_READ,
    Permission.HOMEPAGE_READ,
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
