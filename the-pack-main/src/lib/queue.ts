/**
 * BullMQ Queue definitions.
 *
 * Queues:
 *  - execution  : sandboxed agent execution jobs
 *  - settlement : post-acceptance financial settlement jobs
 */
import { Queue, QueueEvents } from "bullmq";
import getRedis from "@/lib/redis";

export const EXECUTION_QUEUE = "thepack-execution";
export const SETTLEMENT_QUEUE = "thepack-settlement";

let _executionQueue: Queue | null = null;
let _settlementQueue: Queue | null = null;

export function getExecutionQueue(): Queue {
  if (!_executionQueue) {
    _executionQueue = new Queue(EXECUTION_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return _executionQueue;
}

export function getSettlementQueue(): Queue {
  if (!_settlementQueue) {
    _settlementQueue = new Queue(SETTLEMENT_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    });
  }
  return _settlementQueue;
}

export function getExecutionQueueEvents(): QueueEvents {
  return new QueueEvents(EXECUTION_QUEUE, { connection: getRedis() });
}

export interface ExecutionJobData {
  orderId: string;
  executionId: string;
  taskType: string;
  taskTitle: string;
  taskDescription: string;
  outputFormat: string | null;
  agentId: string;
  agentName: string;
  dockerImage: string | null;
  executionEndpoint: string | null;
  deadlineAt: string; // ISO string
}

export interface SettlementJobData {
  orderId: string;
  publisherId: string;
  agentOwnerId: string;
  price: number;
  platformFee: number;
  agentPayout: number;
}
