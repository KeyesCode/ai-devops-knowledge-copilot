import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../entities/user.entity';
import { Permission } from './permissions';
import { ROLES_KEY, PERMISSIONS_KEY } from './decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let context: ExecutionContext;

  const createMockContext = (user: any, handler?: any, controller?: any) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
      getHandler: () => handler,
      getClass: () => controller,
    } as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  describe('when no roles or permissions are required', () => {
    it('should allow access', () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        role: UserRole.USER,
        orgId: 'org-1',
      };
      context = createMockContext(user);

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when roles are required', () => {
    it('should allow access if user has required role', () => {
      const user = {
        id: 'user-1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        orgId: 'org-1',
      };
      context = createMockContext(user);

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

    it('should deny access if user does not have required role', () => {
      const user = {
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.USER,
        orgId: 'org-1',
      };
      context = createMockContext(user);

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => {
          if (key === ROLES_KEY) {
            return [UserRole.ADMIN];
          }
          return undefined;
        });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Access denied. Required roles: admin',
      );
    });

    it('should allow access if user has one of multiple required roles', () => {
      const user = {
        id: 'user-1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        orgId: 'org-1',
      };
      context = createMockContext(user);

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => {
          if (key === ROLES_KEY) {
            return [UserRole.ADMIN, UserRole.USER];
          }
          return undefined;
        });

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when permissions are required', () => {
    it('should allow access if user has required permission', () => {
      const user = {
        id: 'user-1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        orgId: 'org-1',
      };
      context = createMockContext(user);

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => {
          if (key === PERMISSIONS_KEY) {
            return [Permission.CREATE_SOURCE];
          }
          return undefined;
        });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny access if user does not have required permission', () => {
      const user = {
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.USER,
        orgId: 'org-1',
      };
      context = createMockContext(user);

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => {
          if (key === PERMISSIONS_KEY) {
            return [Permission.CREATE_SOURCE];
          }
          return undefined;
        });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Access denied. Required permissions: create:source',
      );
    });

    it('should allow access if user has any of the required permissions', () => {
      const user = {
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.USER,
        orgId: 'org-1',
      };
      context = createMockContext(user);

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
  });

  describe('when both roles and permissions are required', () => {
    it('should require both role and permission', () => {
      const user = {
        id: 'user-1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        orgId: 'org-1',
      };
      context = createMockContext(user);

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => {
          if (key === ROLES_KEY) {
            return [UserRole.ADMIN];
          }
          if (key === PERMISSIONS_KEY) {
            return [Permission.CREATE_SOURCE];
          }
          return undefined;
        });

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when user is not authenticated', () => {
    it('should throw ForbiddenException', () => {
      context = createMockContext(null);

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => {
          if (key === ROLES_KEY) {
            return [UserRole.ADMIN];
          }
          return undefined;
        });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'User not authenticated',
      );
    });
  });
});

