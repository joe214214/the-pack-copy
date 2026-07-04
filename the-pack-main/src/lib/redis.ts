/**
 * Redis connection — shared singleton for BullMQ and status polling.
 * Uses ioredis with lazy connection and automatic reconnect.
 */
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Singleton in production; new connection per hot-reload in dev
const globalForRedis = globalThis as unknown as { redis?: IORedis };

export function getRedis(): IORedis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,  // Required by BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return globalForRedis.redis;
}

export default getRedis;
