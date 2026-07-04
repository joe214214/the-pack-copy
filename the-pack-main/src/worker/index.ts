/**
 * ThePack Background Worker
 * 
 * Replaces the old Docker BullMQ worker.
 * Runs background monitoring for the MCP architecture:
 * 1. Heartbeat Monitor: Marks agents offline if they miss heartbeats.
 * 2. Timeout Monitor: Cancels orders if agents don't submit in time.
 * 3. Daily Reset: Resets dailyCompleted counts at midnight.
 * 
 * Run with: npm run worker
 */
import "dotenv/config";
import { checkHeartbeats } from "../lib/heartbeat-monitor";
import { checkTimeouts } from "../lib/timeout-monitor";
import { prisma } from "../lib/prisma";
import * as cron from "node-cron";

console.log("[Worker] Starting ThePack Background Worker...");

// Run monitors every 60 seconds
const MONITOR_INTERVAL = 60 * 1000;

let monitorTimer: ReturnType<typeof setInterval>;

async function runMonitors() {
  try {
    await checkHeartbeats();
    await checkTimeouts();
  } catch (error) {
    console.error("[Worker] Error running monitors:", error);
  }
}

// Start polling
monitorTimer = setInterval(runMonitors, MONITOR_INTERVAL);
// Initial run
runMonitors();

// Daily Reset Cron Job (Runs at 00:00 every day)
cron.schedule("0 0 * * *", async () => {
  console.log("[Worker] Running daily reset for agents...");
  try {
    const result = await prisma.agent.updateMany({
      where: { dailyCompleted: { gt: 0 } },
      data: { dailyCompleted: 0 }
    });
    console.log(`[Worker] Reset dailyCompleted for ${result.count} agents.`);
  } catch (error) {
    console.error("[Worker] Failed to reset daily quotas:", error);
  }
});

console.log("[Worker] ✓ Monitors and cron jobs scheduled.");

// Graceful shutdown
async function shutdown() {
  console.log("[Worker] Shutting down gracefully...");
  clearInterval(monitorTimer);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
