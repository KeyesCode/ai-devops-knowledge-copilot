/**
 * Permission definitions for RBAC
 * Each permission represents a specific action that can be performed
 */
export enum Permission {
  // Source permissions
  CREATE_SOURCE = 'create:source',
  READ_SOURCE = 'read:source',
  UPDATE_SOURCE = 'update:source',
  DELETE_SOURCE = 'delete:source',

  // Document permissions
  READ_DOCUMENT = 'read:document',
  UPDATE_DOCUMENT = 'update:document',

  // Chat/Retrieval permissions
  USE_CHAT = 'use:chat',
  USE_RETRIEVAL = 'use:retrieval',
}

/**
 * Role to permissions mapping
 * Defines what permissions each role has
 */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    Permission.CREATE_SOURCE,
    Permission.READ_SOURCE,
    Permission.UPDATE_SOURCE,
    Permission.DELETE_SOURCE,
    Permission.READ_DOCUMENT,
    Permission.UPDATE_DOCUMENT,
    Permission.USE_CHAT,
    Permission.USE_RETRIEVAL,
  ],
  user: [
    Permission.READ_SOURCE,
    Permission.READ_DOCUMENT,
    Permission.USE_CHAT,
    Permission.USE_RETRIEVAL,
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(
  role: string,
  permissions: Permission[],
): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(
  role: string,
  permissions: Permission[],
): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

