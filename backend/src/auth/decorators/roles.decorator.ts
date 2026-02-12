import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../entities/user.entity';
import { Permission } from '../permissions';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to specify which roles are allowed to access a route
 * @param roles - Array of roles that can access this route
 * 
 * @example
 * @Roles(UserRole.ADMIN)
 * @Post('create')
 * async create() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Decorator to specify which permissions are required to access a route
 * @param permissions - Array of permissions required to access this route
 * 
 * @example
 * @RequirePermissions(Permission.CREATE_SOURCE)
 * @Post('create')
 * async create() { ... }
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

