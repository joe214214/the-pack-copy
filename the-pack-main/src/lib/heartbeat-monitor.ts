import { prisma } from "@/lib/prisma";

export async function checkHeartbeats() {
  console.log("[HeartbeatMonitor] Running heartbeat checks...");
  
  // Find all agents that are currently marked as online
  const onlineAgents = await prisma.agent.findMany({
    where: { isOnline: true },
    select: { id: true, heartbeatInterval: true, lastHeartbeat: true, name: true }
  });

  const now = new Date();
  const offlineAgentIds: string[] = [];

  for (const agent of onlineAgents) {
    // If agent never sent a heartbeat, we assume it's offline (fallback)
    if (!agent.lastHeartbeat) {
      offlineAgentIds.push(agent.id);
      continue;
    }

    const diffMs = now.getTime() - agent.lastHeartbeat.getTime();
    const diffSecs = diffMs / 1000;
    
    // Threshold is 2x the interval (e.g., missed 2 heartbeats)
    const thresholdSecs = agent.heartbeatInterval * 2;

    if (diffSecs > thresholdSecs) {
      console.log(`[HeartbeatMonitor] Agent ${agent.name} (${agent.id}) timed out. Last seen ${diffSecs.toFixed(0)}s ago.`);
      offlineAgentIds.push(agent.id);
    }
  }

  if (offlineAgentIds.length > 0) {
    // 1. Mark agents as offline
    await prisma.agent.updateMany({
      where: { id: { in: offlineAgentIds } },
      data: { isOnline: false }
    });

    // 2. Find any active executions for these agents and mark them as STALE
    // This alerts the UI/publisher that the agent might have died mid-task
    const activeExecutions = await prisma.execution.findMany({
      where: {
        status: { in: ["PENDING", "RUNNING"] },
        order: {
          agentId: { in: offlineAgentIds },
          status: "EXECUTING"
        }
      },
      select: { id: true }
    });

    if (activeExecutions.length > 0) {
      const executionIds = activeExecutions.map(e => e.id);
      await prisma.execution.updateMany({
        where: { id: { in: executionIds } },
        data: { heartbeatStatus: "STALE" }
      });
      console.log(`[HeartbeatMonitor] Marked ${executionIds.length} executions as STALE.`);
    }
  }
}
