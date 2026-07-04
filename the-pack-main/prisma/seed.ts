/**
 * ThePack — Database Seed Script
 * 
 * Populates the database with realistic test data for development:
 * - Users (publishers, agent owners, admin)
 * - Agents (content-focused, various specialties)
 * - Tasks (content structuring type)
 * - Sample orders, executions, reviews, settlements
 * 
 * Usage: npx prisma db seed
 * (Configure in package.json: "prisma": { "seed": "npx tsx prisma/seed.ts" })
 */

import "dotenv/config";
import crypto from "crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Mirror of hashPassword() in src/lib/auth.ts ("scrypt$<salt>$<hash>").
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

// All seeded accounts share this password for easy testing.
const DEMO_PASSWORD = "password123";
// Admin gets effectively unlimited funds.
const ADMIN_BALANCE = 999_999_999;

async function main() {
  console.log("🌱 Seeding database...\n");

  // ----------------------------------------------------------------------------
  // Clean transactional + task data for a fresh demo state (users & agents kept,
  // they're upserted below). Order matters for FK constraints.
  // ----------------------------------------------------------------------------
  console.log("🧹 Clearing transactional data...");
  await prisma.creditRecord.deleteMany({});
  await prisma.settlement.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.dispute.deleteMany({});
  await prisma.execution.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.task.deleteMany({});
  // No fabricated agents — the platform only has agents users register themselves.
  await prisma.agent.deleteMany({});

  // ============================================================================
  // USERS
  // ============================================================================
  console.log("👤 Creating users...");

  const pw = hashPassword(DEMO_PASSWORD);

  await prisma.user.upsert({
    where: { email: "admin@thepack.ai" },
    update: { passwordHash: pw, roles: ["ADMIN"], balance: ADMIN_BALANCE },
    create: {
      supabaseId: "admin-supabase-id-001",
      email: "admin@thepack.ai",
      name: "Platform Admin",
      passwordHash: pw,
      roles: ["ADMIN"],
      balance: ADMIN_BALANCE,
    },
  });

  const publisher1 = await prisma.user.upsert({
    where: { email: "alex@example.com" },
    update: { passwordHash: pw },
    create: {
      supabaseId: "publisher-supabase-id-001",
      email: "alex@example.com",
      name: "Alex Chen",
      passwordHash: pw,
      roles: ["PUBLISHER"],
      balance: 2450.0,
    },
  });

  const publisher2 = await prisma.user.upsert({
    where: { email: "sarah@example.com" },
    update: { passwordHash: pw },
    create: {
      supabaseId: "publisher-supabase-id-002",
      email: "sarah@example.com",
      name: "Sarah Kim",
      passwordHash: pw,
      roles: ["PUBLISHER"],
      balance: 1800.0,
    },
  });

  await prisma.user.upsert({
    where: { email: "marco@agents.io" },
    update: { passwordHash: pw },
    create: {
      supabaseId: "agentowner-supabase-id-001",
      email: "marco@agents.io",
      name: "Marco Rossi",
      passwordHash: pw,
      roles: ["AGENT_OWNER", "PUBLISHER"],
      balance: 3200.0,
    },
  });

  await prisma.user.upsert({
    where: { email: "yuki@agents.io" },
    update: { passwordHash: pw },
    create: {
      supabaseId: "agentowner-supabase-id-002",
      email: "yuki@agents.io",
      name: "Yuki Tanaka",
      passwordHash: pw,
      roles: ["AGENT_OWNER", "PUBLISHER"],
      balance: 1890.0,
    },
  });

  await prisma.user.upsert({
    where: { email: "jordan@example.com" },
    update: { passwordHash: pw },
    create: {
      supabaseId: "both-supabase-id-001",
      email: "jordan@example.com",
      name: "Jordan Blake",
      passwordHash: pw,
      roles: ["PUBLISHER", "AGENT_OWNER"],
      balance: 5400.0,
    },
  });

  console.log(`  ✅ Created ${6} users`);

  // ============================================================================
  // AGENTS — none seeded. Every agent on the platform is registered by a user.
  // ============================================================================

  // ============================================================================
  // SAMPLE TASKS
  // ============================================================================
  console.log("📋 Creating sample tasks...");

  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        publisherId: publisher1.id,
        type: "CONTENT_WRITING",
        title: "Blog Post: AI in Healthcare",
        description:
          "Write a 1500-word blog post about the impact of AI on healthcare diagnostics. Include 3 case studies and maintain a professional but accessible tone.",
        budget: 45.0,
        deadlineHours: 4,
        outputFormat: "Markdown file (.md), 1200-1800 words",
        qualityCriteria: {
          minWords: 1200,
          maxWords: 1800,
          requiredSections: ["Introduction", "Case Studies", "Conclusion"],
          tone: "professional",
        },
        status: "OPEN",
      },
    }),
    prisma.task.create({
      data: {
        publisherId: publisher1.id,
        type: "REPORT_GENERATION",
        title: "Q4 Sales Report Formatting",
        description:
          "Take the attached raw sales data CSV and generate a formatted quarterly report with charts, tables, and executive summary.",
        inputFiles: [{ name: "sales_q4_raw.csv", url: "/uploads/mock/sales.csv", size: 245000, type: "text/csv" }],
        budget: 32.0,
        deadlineHours: 2,
        outputFormat: "PDF report with embedded charts",
        status: "OPEN",
      },
    }),
    prisma.task.create({
      data: {
        publisherId: publisher2.id,
        type: "CONTENT_EDITING",
        title: "Email Campaign Copy Review",
        description:
          "Review and improve 5 email campaign drafts for a SaaS product launch. Focus on subject lines, CTAs, and overall engagement.",
        budget: 28.0,
        deadlineHours: 3,
        outputFormat: "Edited markdown files with tracked changes",
        status: "OPEN",
      },
    }),
    prisma.task.create({
      data: {
        publisherId: publisher2.id,
        type: "SUMMARIZATION",
        title: "Meeting Notes Summary",
        description:
          "Summarize a 90-minute product strategy meeting transcript into key decisions, action items, and follow-ups.",
        inputFiles: [{ name: "meeting_transcript.txt", url: "/uploads/mock/meeting.txt", size: 128000, type: "text/plain" }],
        budget: 15.0,
        deadlineHours: 1,
        outputFormat: "Structured markdown with bullet points",
        status: "OPEN",
      },
    }),
    prisma.task.create({
      data: {
        publisherId: publisher1.id,
        type: "TRANSLATION",
        title: "Product Documentation Translation (EN→JP)",
        description:
          "Translate 20 pages of product documentation from English to Japanese. Maintain technical accuracy and formatting.",
        budget: 55.0,
        deadlineHours: 8,
        outputFormat: "Translated markdown files preserving original formatting",
        status: "DRAFT",
      },
    }),
  ]);

  console.log(`  ✅ Created ${tasks.length} tasks`);

  // No sample orders: agents start with a clean slate (no fabricated history).
  // Real orders are created when a publisher hires/dispatches an agent.

  // ============================================================================
  console.log("\n✨ Seed completed successfully!\n");
  console.log("Test accounts:");
  console.log("  Publisher:    alex@example.com");
  console.log("  Publisher:    sarah@example.com");
  console.log("  Agent Owner:  marco@agents.io");
  console.log("  Agent Owner:  yuki@agents.io");
  console.log("  Both Roles:   jordan@example.com");
  console.log("  Admin:        admin@thepack.ai");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
