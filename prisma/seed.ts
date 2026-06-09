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
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...\n");

  // ============================================================================
  // USERS
  // ============================================================================
  console.log("👤 Creating users...");

  const admin = await prisma.user.upsert({
    where: { email: "admin@thepack.ai" },
    update: {},
    create: {
      supabaseId: "admin-supabase-id-001",
      email: "admin@thepack.ai",
      name: "Platform Admin",
      roles: ["ADMIN"],
      balance: 0,
    },
  });

  const publisher1 = await prisma.user.upsert({
    where: { email: "alex@example.com" },
    update: {},
    create: {
      supabaseId: "publisher-supabase-id-001",
      email: "alex@example.com",
      name: "Alex Chen",
      roles: ["PUBLISHER"],
      balance: 2450.0,
    },
  });

  const publisher2 = await prisma.user.upsert({
    where: { email: "sarah@example.com" },
    update: {},
    create: {
      supabaseId: "publisher-supabase-id-002",
      email: "sarah@example.com",
      name: "Sarah Kim",
      roles: ["PUBLISHER"],
      balance: 1800.0,
    },
  });

  const agentOwner1 = await prisma.user.upsert({
    where: { email: "marco@agents.io" },
    update: {},
    create: {
      supabaseId: "agentowner-supabase-id-001",
      email: "marco@agents.io",
      name: "Marco Rossi",
      roles: ["AGENT_OWNER"],
      balance: 3200.0,
    },
  });

  const agentOwner2 = await prisma.user.upsert({
    where: { email: "yuki@agents.io" },
    update: {},
    create: {
      supabaseId: "agentowner-supabase-id-002",
      email: "yuki@agents.io",
      name: "Yuki Tanaka",
      roles: ["AGENT_OWNER"],
      balance: 1890.0,
    },
  });

  const bothRoles = await prisma.user.upsert({
    where: { email: "jordan@example.com" },
    update: {},
    create: {
      supabaseId: "both-supabase-id-001",
      email: "jordan@example.com",
      name: "Jordan Blake",
      roles: ["PUBLISHER", "AGENT_OWNER"],
      balance: 5400.0,
    },
  });

  console.log(`  ✅ Created ${6} users`);

  // ============================================================================
  // AGENTS
  // ============================================================================
  console.log("🤖 Creating agents...");

  const agents = await Promise.all([
    prisma.agent.upsert({
      where: { slug: "contentcraft-ai" },
      update: {},
      create: {
        ownerId: agentOwner1.id,
        name: "ContentCraft AI",
        slug: "contentcraft-ai",
        description:
          "Premium content writing agent specialized in blog posts, articles, and marketing copy. Uses advanced language models fine-tuned on high-converting content.",
        status: "ACTIVE",
        supportedTaskTypes: ["CONTENT_WRITING", "CONTENT_EDITING", "SUMMARIZATION"],
        sampleOutputs: {
          blogPost: "# How to Build Scalable APIs\n\nIn today's fast-paced development world...",
          marketingCopy: "Unlock your productivity with AI-powered solutions that...",
        },
        modelInfo: "GPT-4o fine-tuned",
        dockerImage: "thepack/agent-contentcraft:latest",
        basePrice: 25.0,
        avgCost: 32.5,
        avgDurationSecs: 180,
        successRate: 0.965,
        avgRating: 4.8,
        completedOrders: 342,
        totalOrders: 355,
        creditScore: 0.928,
        creditTier: "PLATINUM",
        // MCP Gateway
        connectionType: "MCP",
        apiKey: "tpk_contentcraft_a1b2c3d4e5f6",
        isOnline: true,
        autoAccept: true,
        acceptTaskTypes: ["CONTENT_WRITING", "CONTENT_EDITING", "SUMMARIZATION"],
        dailyLimit: 15,
        dailyCompleted: 3,
      },
    }),
    prisma.agent.upsert({
      where: { slug: "dataweaver" },
      update: {},
      create: {
        ownerId: agentOwner1.id,
        name: "DataWeaver",
        slug: "dataweaver",
        description:
          "Data extraction and report formatting specialist. Excels at transforming unstructured data into clean, presentable reports with charts and tables.",
        status: "ACTIVE",
        supportedTaskTypes: ["DATA_EXTRACTION", "REPORT_GENERATION", "FORMATTING"],
        sampleOutputs: {
          report: "## Q4 Financial Summary\n\n| Metric | Value | Change |\n|---|---|---|\n| Revenue | $2.4M | +12% |",
        },
        modelInfo: "Claude 3.5 Sonnet",
        dockerImage: "thepack/agent-dataweaver:latest",
        basePrice: 20.0,
        avgCost: 28.0,
        avgDurationSecs: 240,
        successRate: 0.942,
        avgRating: 4.6,
        completedOrders: 178,
        totalOrders: 189,
        creditScore: 0.891,
        creditTier: "GOLD",
        // MCP Gateway
        connectionType: "MCP",
        apiKey: "tpk_dataweaver_g7h8i9j0k1l2",
        isOnline: true,
        autoAccept: false,
        acceptTaskTypes: ["DATA_EXTRACTION", "REPORT_GENERATION", "FORMATTING"],
        dailyLimit: 10,
        dailyCompleted: 1,
      },
    }),
    prisma.agent.upsert({
      where: { slug: "copysmith-pro" },
      update: {},
      create: {
        ownerId: agentOwner2.id,
        name: "CopySmith Pro",
        slug: "copysmith-pro",
        description:
          "High-conversion copywriting specialist for emails, landing pages, social media, and ad campaigns. Trained on thousands of successful marketing campaigns.",
        status: "ACTIVE",
        supportedTaskTypes: ["CONTENT_WRITING", "CONTENT_EDITING"],
        sampleOutputs: {
          emailSubject: "🚀 Your productivity just got a 10x upgrade",
          socialPost: "Ready to transform your workflow? Our AI agents handle the heavy lifting while you focus on strategy. #AIProductivity",
        },
        modelInfo: "GPT-4o",
        dockerImage: "thepack/agent-copysmith:latest",
        basePrice: 15.0,
        avgCost: 22.0,
        avgDurationSecs: 120,
        successRate: 0.978,
        avgRating: 4.9,
        completedOrders: 521,
        totalOrders: 533,
        creditScore: 0.956,
        creditTier: "DIAMOND",
        // MCP Gateway
        connectionType: "MCP",
        apiKey: "tpk_copysmith_m3n4o5p6q7r8",
        isOnline: true,
        autoAccept: true,
        acceptTaskTypes: ["CONTENT_WRITING", "CONTENT_EDITING"],
        dailyLimit: 20,
        dailyCompleted: 5,
      },
    }),
    prisma.agent.upsert({
      where: { slug: "summarize-bot" },
      update: {},
      create: {
        ownerId: agentOwner2.id,
        name: "SummarizeBot",
        slug: "summarize-bot",
        description:
          "Lightning-fast document summarization and key points extraction. Handles meeting transcripts, research papers, and long-form content.",
        status: "ACTIVE",
        supportedTaskTypes: ["SUMMARIZATION", "DATA_EXTRACTION"],
        sampleOutputs: {
          summary: "## Key Takeaways\n- Revenue grew 15% YoY\n- Customer retention improved to 94%\n- New product launch scheduled for Q2",
        },
        modelInfo: "Gemini 2.5 Pro",
        dockerImage: "thepack/agent-summarize:latest",
        basePrice: 10.0,
        avgCost: 15.0,
        avgDurationSecs: 60,
        successRate: 0.991,
        avgRating: 4.7,
        completedOrders: 892,
        totalOrders: 900,
        creditScore: 0.945,
        creditTier: "DIAMOND",
        // MCP Gateway
        connectionType: "OPENCLAW",
        apiKey: "tpk_summarize_s9t0u1v2w3x4",
        isOnline: true,
        autoAccept: true,
        acceptTaskTypes: ["SUMMARIZATION", "DATA_EXTRACTION"],
        dailyLimit: 30,
        dailyCompleted: 8,
      },
    }),
    prisma.agent.upsert({
      where: { slug: "translate-x" },
      update: {},
      create: {
        ownerId: bothRoles.id,
        name: "TranslateX",
        slug: "translate-x",
        description:
          "Professional translation agent supporting 50+ language pairs. Preserves formatting, tone, and cultural nuance across languages.",
        status: "ACTIVE",
        supportedTaskTypes: ["TRANSLATION", "CONTENT_EDITING"],
        sampleOutputs: {
          translation: "Original: 'Building the future of work'\n→ Japanese: '仕事の未来を築く'\n→ Spanish: 'Construyendo el futuro del trabajo'",
        },
        modelInfo: "Custom multilingual model",
        dockerImage: "thepack/agent-translate:latest",
        basePrice: 18.0,
        avgCost: 24.0,
        avgDurationSecs: 150,
        successRate: 0.955,
        avgRating: 4.5,
        completedOrders: 234,
        totalOrders: 245,
        creditScore: 0.912,
        creditTier: "GOLD",
        // MCP Gateway
        connectionType: "MCP",
        apiKey: "tpk_translatex_y5z6a7b8c9d0",
        isOnline: false,
        autoAccept: false,
        acceptTaskTypes: ["TRANSLATION", "CONTENT_EDITING"],
        dailyLimit: 8,
        dailyCompleted: 0,
      },
    }),
    prisma.agent.upsert({
      where: { slug: "template-master" },
      update: {},
      create: {
        ownerId: bothRoles.id,
        name: "TemplateMaster",
        slug: "template-master",
        description:
          "Document template filling and formatting specialist. Takes raw data and produces perfectly formatted documents matching any template.",
        status: "ACTIVE",
        supportedTaskTypes: ["TEMPLATE_FILLING", "FORMATTING", "REPORT_GENERATION"],
        sampleOutputs: {
          invoice: "Generated a formatted invoice from raw transaction data with proper tax calculations and branding.",
        },
        modelInfo: "Claude 3.5 Sonnet",
        dockerImage: "thepack/agent-template:latest",
        basePrice: 12.0,
        avgCost: 18.0,
        avgDurationSecs: 90,
        successRate: 0.982,
        avgRating: 4.8,
        completedOrders: 156,
        totalOrders: 159,
        creditScore: 0.934,
        creditTier: "PLATINUM",
        // MCP Gateway
        connectionType: "COZE",
        apiKey: "tpk_template_e1f2g3h4i5j6",
        isOnline: true,
        autoAccept: true,
        acceptTaskTypes: ["TEMPLATE_FILLING", "FORMATTING", "REPORT_GENERATION"],
        dailyLimit: 12,
        dailyCompleted: 2,
      },
    }),
    // Pending agent for admin review testing
    prisma.agent.upsert({
      where: { slug: "draft-agent-pending" },
      update: {},
      create: {
        ownerId: agentOwner1.id,
        name: "ResearchAssist",
        slug: "draft-agent-pending",
        description:
          "Research paper analysis and literature review assistant. Currently under review.",
        status: "PENDING",
        supportedTaskTypes: ["SUMMARIZATION", "DATA_EXTRACTION", "REPORT_GENERATION"],
        modelInfo: "GPT-4o",
        dockerImage: "thepack/agent-research:latest",
        basePrice: 30.0,
        avgCost: 0,
        avgDurationSecs: 0,
        successRate: 0,
        avgRating: 0,
        completedOrders: 0,
        totalOrders: 0,
        creditScore: 0,
        creditTier: "BRONZE",
        // MCP Gateway — no API key yet (pending approval)
        connectionType: "MCP",
        isOnline: false,
        autoAccept: false,
        acceptTaskTypes: ["SUMMARIZATION", "DATA_EXTRACTION", "REPORT_GENERATION"],
        dailyLimit: 5,
        dailyCompleted: 0,
      },
    }),
  ]);

  console.log(`  ✅ Created ${agents.length} agents`);

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
        status: "MATCHED",
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

  // ============================================================================
  // SAMPLE ORDERS (for the matched/completed tasks)
  // ============================================================================
  console.log("📦 Creating sample orders...");

  const order1 = await prisma.order.create({
    data: {
      taskId: tasks[3].id, // Meeting Notes Summary
      agentId: agents[3].id, // SummarizeBot
      publisherId: publisher2.id,
      price: 15.0,
      platformFee: 1.5,
      escrowAmount: 15.0,
      paymentMethod: "BALANCE",
      status: "SETTLED",
      deadline: new Date(Date.now() + 1 * 60 * 60 * 1000),
    },
  });

  // Create execution for settled order
  await prisma.execution.create({
    data: {
      orderId: order1.id,
      sandboxId: "sandbox-001",
      containerId: "docker-abc123",
      logs: [
        { timestamp: "2024-01-15T10:00:00Z", level: "info", message: "Starting execution..." },
        { timestamp: "2024-01-15T10:00:05Z", level: "info", message: "Loading transcript file..." },
        { timestamp: "2024-01-15T10:00:15Z", level: "info", message: "Processing with Gemini 2.5 Pro..." },
        { timestamp: "2024-01-15T10:00:45Z", level: "info", message: "Summary generated successfully" },
        { timestamp: "2024-01-15T10:00:48Z", level: "info", message: "Formatting output..." },
        { timestamp: "2024-01-15T10:00:50Z", level: "info", message: "Execution completed" },
      ],
      outputFiles: [{ name: "meeting_summary.md", url: "/outputs/mock/summary.md", size: 4200, type: "text/markdown" }],
      exitCode: 0,
      cpuUsageSecs: 12.5,
      memoryPeakMb: 256,
      status: "COMPLETED",
      startedAt: new Date("2024-01-15T10:00:00Z"),
      completedAt: new Date("2024-01-15T10:00:50Z"),
    },
  });

  // Create review
  await prisma.review.create({
    data: {
      orderId: order1.id,
      reviewerId: publisher2.id,
      autoChecks: [
        { check: "format_valid", passed: true, details: "Markdown format correct" },
        { check: "sections_present", passed: true, details: "All required sections found" },
        { check: "min_length", passed: true, details: "Content meets minimum length" },
      ],
      autoPassed: true,
      autoScore: 0.95,
      userAccepted: true,
      userRating: 5,
      userComment: "Excellent summary! Captured all key decisions and action items perfectly.",
    },
  });

  // Create settlement
  await prisma.settlement.create({
    data: {
      orderId: order1.id,
      totalAmount: 15.0,
      platformFee: 1.5,
      agentPayout: 13.5,
      status: "COMPLETED",
      settledAt: new Date("2024-01-15T10:05:00Z"),
    },
  });

  // Create credit record
  await prisma.creditRecord.create({
    data: {
      agentId: agents[3].id,
      orderId: order1.id,
      successScore: 1.0,
      timelinessScore: 1.0,
      qualityScore: 0.95,
      ratingScore: 1.0,
    },
  });

  console.log(`  ✅ Created 1 completed order with execution, review, settlement, and credit`);

  // ============================================================================
  // AUDIT LOGS
  // ============================================================================
  console.log("📝 Creating audit logs...");

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: admin.id,
        action: "agent.approve",
        entityType: "agent",
        entityId: agents[0].id,
        details: { reason: "Meets quality standards" },
      },
      {
        actorId: admin.id,
        action: "agent.approve",
        entityType: "agent",
        entityId: agents[1].id,
        details: { reason: "Verified output quality" },
      },
      {
        actorId: publisher2.id,
        action: "order.accept",
        entityType: "order",
        entityId: order1.id,
        details: { rating: 5 },
      },
    ],
  });

  console.log("  ✅ Created 3 audit logs");

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
