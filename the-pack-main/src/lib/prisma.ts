import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = global as unknown as {
  prisma: PrismaClient;
  pool: Pool;
};

function createPrismaClient(): PrismaClient {
  const pool =
    globalForPrisma.pool ||
    new Pool({ connectionString: process.env.DATABASE_URL });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pool = pool;
  }

  const adapter = new PrismaPg(pool);
  // Agent.apiKey is a credential. It is omitted from EVERY query result by
  // default, so an `include: { agent: ... }` or a public agents list can never
  // leak it (several routes did, unauthenticated). Code that genuinely needs
  // the key asks for it explicitly with `select: { apiKey: true }` or
  // `omit: { apiKey: false }` — today only agent registration and the
  // owner-only installer / worker dashboard.
  return new PrismaClient({ adapter, omit: { agent: { apiKey: true } } });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
