import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../entities/user.entity';
import { Permission } from './permissions';
import { ROLES_KEY, PERMISSIONS_KEY } from './decorators/roles.decorator';
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from './permissions';

/**
 * Integration tests for RBAC system
 * Tests the interaction between permissions, roles, and guards
 */
describe('RBAC Integration', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createMockContext = (user: any) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  describe('Admin role permissions', () => {
    it('should have all permissions', () => {
      const adminPermissions = [
        Permission.CREATE_SOURCE,
        Permission.READ_SOURCE,
        Permission.UPDATE_SOURCE,
        Permission.DELETE_SOURCE,
        Permission.READ_DOCUMENT,
        Permission.UPDATE_DOCUMENT,
        Permission.USE_CHAT,
        Permission.USE_RETRIEVAL,
      ];

      adminPermissions.forEach((permission) => {
        expect(hasPermission(UserRole.ADMIN, permission)).toBe(true);
      });
    });

    it('should pass guard check for any permission', () => {
      const adminUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        orgId: 'org-1',
      };

      const permissions = [
        Permission.CREATE_SOURCE,
        Permission.DELETE_SOURCE,
        Permission.UPDATE_DOCUMENT,
      ];

      permissions.forEach((permission) => {
        const context = createMockContext(adminUser);
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockImplementation((key) => {
            if (key === PERMISSIONS_KEY) {
              return [permission];
            }
            return undefined;
          });

        expect(guard.canActivate(context)).toBe(true);
      });
    });
  });

  describe('User role permissions', () => {
    it('should have read-only permissions', () => {
      expect(hasPermission(UserRole.USER, Permission.READ_SOURCE)).toBe(true);
      expect(hasPermission(UserRole.USER, Permission.READ_DOCUMENT)).toBe(true);
      expect(hasPermission(UserRole.USER, Permission.USE_CHAT)).toBe(true);
      expect(hasPermission(UserRole.USER, Permission.USE_RETRIEVAL)).toBe(true);
    });

    it('should not have write permissions', () => {
      expect(hasPermission(UserRole.USER, Permission.CREATE_SOURCE)).toBe(
        false,
      );
      expect(hasPermission(UserRole.USER, Permission.UPDATE_SOURCE)).toBe(
        false,
      );
      expect(hasPermission(UserRole.USER, Permission.DELETE_SOURCE)).toBe(
        false,
      );
      expect(hasPermission(UserRole.USER, Permission.UPDATE_DOCUMENT)).toBe(
        false,
      );
    });

    it('should pass guard check for read permissions', () => {
      const user = {
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.USER,
        orgId: 'org-1',
      };

      const readPermissions = [
        Permission.READ_SOURCE,
        Permission.READ_DOCUMENT,
        Permission.USE_CHAT,
        Permission.USE_RETRIEVAL,
      ];

      readPermissions.forEach((permission) => {
        const context = createMockContext(user);
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockImplementation((key) => {
            if (key === PERMISSIONS_KEY) {
              return [permission];
            }
            return undefined;
          });

        expect(guard.canActivate(context)).toBe(true);
      });
    });

    it('should fail guard check for write permissions', () => {
      const user = {
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.USER,
        orgId: 'org-1',
      };

      const writePermissions = [
        Permission.CREATE_SOURCE,
        Permission.UPDATE_SOURCE,
        Permission.DELETE_SOURCE,
        Permission.UPDATE_DOCUMENT,
      ];

      writePermissions.forEach((permission) => {
        const context = createMockContext(user);
        jest
          .spyOn(reflector, 'getAllAndOverride')
          .mockImplementation((key) => {
            if (key === PERMISSIONS_KEY) {
              return [permission];
            }
            return undefined;
          });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });
    });
  });

  describe('Permission combinations', () => {
    it('should allow access if user has any required permission', () => {
      const user = {
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.USER,
        orgId: 'org-1',
      };

      const context = createMockContext(user);
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => {
          if (key === PERMISSIONS_KEY) {
            return [Permission.CREATE_SOURCE, Permission.READ_SOURCE];
          }
          return undefined;
        });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny access if user has none of the required permissions', () => {
      const user = {
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.USER,
        orgId: 'org-1',
      };

      const context = createMockContext(user);
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => {
          if (key === PERMISSIONS_KEY) {
            return [Permission.CREATE_SOURCE, Permission.DELETE_SOURCE];
          }
          return undefined;
        });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Role-based access', () => {
    it('should allow admin to access admin-only routes', () => {
      const adminUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        orgId: 'org-1',
      };

      const context = createMockContext(adminUser);
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => {
          if (key === ROLES_KEY) {
            return [UserRole.ADMIN];
          }
          return undefined;
        });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny user access to admin-only routes', () => {
      const user = {
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.USER,
        orgId: 'org-1',
      };

      const context = createMockContext(user);
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => {
          if (key === ROLES_KEY) {
            return [UserRole.ADMIN];
          }
          return undefined;
        });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Permission helper functions', () => {
    it('should correctly check hasAnyPermission', () => {
      expect(
        hasAnyPermission(UserRole.USER, [
          Permission.CREATE_SOURCE,
          Permission.READ_SOURCE,
        ]),
      ).toBe(true);

      expect(
        hasAnyPermission(UserRole.USER, [
          Permission.CREATE_SOURCE,
          Permission.DELETE_SOURCE,
        ]),
      ).toBe(false);
    });

    it('should correctly check hasAllPermissions', () => {
      expect(
        hasAllPermissions(UserRole.USER, [
          Permission.READ_SOURCE,
          Permission.USE_CHAT,
        ]),
      ).toBe(true);

      expect(
        hasAllPermissions(UserRole.USER, [
          Permission.READ_SOURCE,
          Permission.CREATE_SOURCE,
        ]),
      ).toBe(false);
    });
  });
});

