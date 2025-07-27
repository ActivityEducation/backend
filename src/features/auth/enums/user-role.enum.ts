// src/features/auth/enums/user-role.enum.ts
export enum UserRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  USER = 'user',
  GUEST = 'guest', // Optional: for unauthenticated users if you have a guest role
}
