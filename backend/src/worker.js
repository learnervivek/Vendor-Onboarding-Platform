import { Worker } from 'bullmq';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { OutboxEvent } from './models/outbox-event.js';
import { closeQueue, connection, queueName, redisEnabled } from './queues/queue.js';
import { processEvent } from './queues/process-event.js';
import { publishPendingEvents } from './services/outbox.js';

let worker;
let timer;

async function start() {
  await connectDatabase();
  if (redisEnabled) {
    worker = new Worker(queueName, async (job) => processEvent(job.data.eventId), { connection, concurrency: 5 });
    worker.on('failed', (job, error) => console.error(`Job ${job?.id} failed: ${error.message}`));
  }
  const poll = async () => {
    await publishPendingEvents();
    if (!redisEnabled) {
      const events = await OutboxEvent.find({ status: { $in: ['pending', 'published'] }, nextAttemptAt: { $lte: new Date() } }).limit(10);
      for (const event of events) await processEvent(event.eventId).catch((error) => console.error(`Fallback event ${event.eventId} failed: ${error.message}`));
    }
  };
  await poll();
  timer = setInterval(() => void poll().catch((error) => console.error(`Worker poll failed: ${error.message}`)), env.workerPollMs);
  console.log(`Edvexa worker started (${redisEnabled ? 'bullmq/redis' : 'mongo-outbox fallback'})`);
}

async function shutdown(signal) {
  console.log(`${signal} received; stopping worker`);
  clearInterval(timer);
  await worker?.close();
  await closeQueue();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
start().catch((error) => { console.error('Unable to start worker', error); process.exit(1); });
