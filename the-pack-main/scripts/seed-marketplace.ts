/**
 * Adds a handful of open tasks so the marketplace browse page reads as a
 * marketplace. After the development cleanup only one task was still OPEN, so
 * /dashboard/tasks showed a single card above two-thirds of empty space.
 *
 * Purely additive: these are tasks with no order attached, so no escrow, no
 * settlement and no balance is touched.
 *
 *   npx tsx --env-file=.env scripts/seed-marketplace.ts
 */
import { prisma } from "../src/lib/prisma";

const TASKS = [
  {
    type: "CONTENT_WRITING" as const,
    title: "Launch blog post for a project management tool",
    description:
      "Write an 800-word launch announcement for a team project management tool aimed at small agencies. Lead with the problem (status meetings eating the week), then the three features that fix it. Confident but not hyped; no exclamation marks. Include a short intro paragraph suitable for a newsletter.",
    budget: 65, deadlineHours: 24,
  },
  {
    type: "TRANSLATION" as const,
    title: "Translate onboarding emails to Japanese (EN → JP)",
    description:
      "Five onboarding emails, roughly 200 words each, from English into natural business Japanese. Keep the friendly tone, adapt idioms rather than translating them literally, and leave product names and UI labels in English.",
    budget: 90, deadlineHours: 48,
  },
  {
    type: "SUMMARIZATION" as const,
    title: "Summarise a 40-page market research PDF",
    description:
      "Condense an attached 40-page market research report into a one-page executive summary plus a bulleted list of the five findings that would change a go-to-market decision. Keep every number exact and cite the page it came from.",
    budget: 45, deadlineHours: 12,
  },
  {
    type: "IMAGE_GENERATION" as const,
    title: "Three hero images for a coffee subscription site",
    description:
      "Three 1600x900 hero images for a speciality coffee subscription: beans being roasted, a pour-over in progress, and a packed shipping box. Warm natural light, shallow depth of field, no visible text or logos. Deliver as PNG.",
    budget: 120, deadlineHours: 36,
  },
  {
    type: "DATA_EXTRACTION" as const,
    title: "Pull supplier contacts out of 60 invoice PDFs",
    description:
      "Sixty supplier invoices as PDFs. For each, extract supplier name, invoice number, date, total excluding tax, and the contact email if present. Deliver as a single CSV with one row per invoice; leave a cell empty rather than guessing.",
    budget: 80, deadlineHours: 24,
  },
  {
    type: "CONTENT_EDITING" as const,
    title: "Tighten a 2,000-word case study",
    description:
      "An existing customer case study runs long and buries the result. Cut it to about 1,200 words, move the outcome into the opening, and keep every quoted sentence exactly as the customer said it. Track what you removed so we can review the cuts.",
    budget: 55, deadlineHours: 18,
  },
  {
    type: "CUSTOM" as const,
    title: "Interactive pricing calculator as a single HTML page",
    description:
      "One self-contained HTML file (CSS and JS inline) with a pricing calculator: seat count slider, monthly/annual toggle showing the annual discount, and three plan cards that highlight the recommended one as inputs change. Dark theme, works down to 375px.",
    budget: 110, deadlineHours: 48,
  },
];

async function main() {
  const publisher = await prisma.user.findFirst({
    where: { email: "sarah@example.com" },
    select: { id: true, name: true },
  }) ?? await prisma.user.findFirst({
    where: { email: "alex@example.com" },
    select: { id: true, name: true },
  });
  if (!publisher) throw new Error("No publisher account found.");

  let created = 0;
  for (const [i, t] of TASKS.entries()) {
    const exists = await prisma.task.findFirst({ where: { title: t.title }, select: { id: true } });
    if (exists) { console.log(`  = ${t.title.slice(0, 50)} (已存在)`); continue; }
    await prisma.task.create({
      data: {
        ...t,
        publisherId: publisher.id,
        status: "OPEN",
        qualityCriteria: {},
        inputFiles: [],
        // Stagger so the list does not read as one bulk insert.
        createdAt: new Date(Date.now() - (i + 1) * 3 * 60 * 60 * 1000),
      },
    });
    console.log(`  + ${t.title.slice(0, 50)}`);
    created++;
  }
  console.log(`\n新增 ${created} 个公开任务，发布者 ${publisher.name}。未创建任何订单，余额不受影响。`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
