import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';

export const queueName = 'edvexa-application-events';
export const redisEnabled = env.queueAdapter === 'redis';
export const connection = redisEnabled ? new IORedis(env.redisUrl, { maxRetriesPerRequest: null }) : null;
export const eventQueue = redisEnabled ? new Queue(queueName, { connection }) : null;

export async function enqueueEvent(event) {
  if (!eventQueue) return false;
  await eventQueue.add(event.type, { eventId: event.eventId }, {
    jobId: event.eventId,
    attempts: env.queueMaxAttempts,
    backoff: { type: 'exponential', delay: env.queueBackoffMs },
    removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 30 * 24 * 60 * 60, count: 5000 }
  });
  return true;
}

export async function closeQueue() {
  await eventQueue?.close();
  await connection?.quit();
}
