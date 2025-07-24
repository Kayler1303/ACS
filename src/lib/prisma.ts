import { PrismaClient } from '@prisma/client';

// In a real application, you should be careful about the number of PrismaClient
// instances you create. In development, the global object is cleared on every
// file change, which can lead to a new PrismaClient instance being created
// on every reload. This prevents that by storing it on the global object.
declare global {
  // allow global `var` declarations
  var prisma: PrismaClient | undefined;
}

// Force new instance to clear cached schema
export const prisma = new PrismaClient({
  log: ['query'],
}); 