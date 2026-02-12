import {
  Permission,
  ROLE_PERMISSIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from './permissions';
import { UserRole } from '../entities/user.entity';

describe('Permissions', () => {
  describe('ROLE_PERMISSIONS', () => {
    it('should have admin role with all permissions', () => {
      const adminPermissions = ROLE_PERMISSIONS[UserRole.ADMIN];
      expect(adminPermissions).toContain(Permission.CREATE_SOURCE);
      expect(adminPermissions).toContain(Permission.READ_SOURCE);
      expect(adminPermissions).toContain(Permission.UPDATE_SOURCE);
      expect(adminPermissions).toContain(Permission.DELETE_SOURCE);
      expect(adminPermissions).toContain(Permission.READ_DOCUMENT);
      expect(adminPermissions).toContain(Permission.UPDATE_DOCUMENT);
      expect(adminPermissions).toContain(Permission.USE_CHAT);
      expect(adminPermissions).toContain(Permission.USE_RETRIEVAL);
    });

    it('should have user role with read-only permissions', () => {
      const userPermissions = ROLE_PERMISSIONS[UserRole.USER];
      expect(userPermissions).toContain(Permission.READ_SOURCE);
      expect(userPermissions).toContain(Permission.READ_DOCUMENT);
      expect(userPermissions).toContain(Permission.USE_CHAT);
      expect(userPermissions).toContain(Permission.USE_RETRIEVAL);
      expect(userPermissions).not.toContain(Permission.CREATE_SOURCE);
      expect(userPermissions).not.toContain(Permission.UPDATE_SOURCE);
      expect(userPermissions).not.toContain(Permission.DELETE_SOURCE);
      expect(userPermissions).not.toContain(Permission.UPDATE_DOCUMENT);
    });
  });

  describe('hasPermission', () => {
    it('should return true if admin has permission', () => {
      expect(hasPermission(UserRole.ADMIN, Permission.CREATE_SOURCE)).toBe(
        true,
      );
      expect(hasPermission(UserRole.ADMIN, Permission.READ_SOURCE)).toBe(true);
      expect(hasPermission(UserRole.ADMIN, Permission.USE_CHAT)).toBe(true);
    });

    it('should return false if user does not have permission', () => {
      expect(hasPermission(UserRole.USER, Permission.CREATE_SOURCE)).toBe(
        false,
      );
      expect(hasPermission(UserRole.USER, Permission.DELETE_SOURCE)).toBe(
        false,
      );
    });

    it('should return true if user has permission', () => {
      expect(hasPermission(UserRole.USER, Permission.READ_SOURCE)).toBe(true);
      expect(hasPermission(UserRole.USER, Permission.USE_CHAT)).toBe(true);
    });

    it('should return false for unknown role', () => {
      expect(hasPermission('unknown-role' as UserRole, Permission.READ_SOURCE)).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true if role has any of the permissions', () => {
      expect(
        hasAnyPermission(UserRole.USER, [
          Permission.CREATE_SOURCE,
          Permission.READ_SOURCE,
        ]),
      ).toBe(true);
    });

    it('should return false if role has none of the permissions', () => {
      expect(
        hasAnyPermission(UserRole.USER, [
          Permission.CREATE_SOURCE,
          Permission.DELETE_SOURCE,
        ]),
      ).toBe(false);
    });

    it('should return true if role has all permissions', () => {
      expect(
        hasAnyPermission(UserRole.ADMIN, [
          Permission.CREATE_SOURCE,
          Permission.READ_SOURCE,
        ]),
      ).toBe(true);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true if role has all permissions', () => {
      expect(
        hasAllPermissions(UserRole.ADMIN, [
          Permission.CREATE_SOURCE,
          Permission.READ_SOURCE,
        ]),
      ).toBe(true);
    });

    it('should return false if role is missing any permission', () => {
      expect(
        hasAllPermissions(UserRole.USER, [
          Permission.READ_SOURCE,
          Permission.CREATE_SOURCE,
        ]),
      ).toBe(false);
    });

    it('should return true if role has all required permissions', () => {
      expect(
        hasAllPermissions(UserRole.USER, [
          Permission.READ_SOURCE,
          Permission.USE_CHAT,
        ]),
      ).toBe(true);
    });
  });
});

