import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.warn('⚠️  REDIS_URL is not set. Falling back to default localhost Redis.');
}

const redisOptions = {
  maxRetriesPerRequest: null,
};

// If using SSL (rediss://), we usually need to allow unauthorized certs for managed services like Railway/Upstash
if (REDIS_URL && REDIS_URL.startsWith('rediss://')) {
  redisOptions.tls = {
    rejectUnauthorized: false
  };
}

const connection = new IORedis(REDIS_URL || 'redis://127.0.0.1:6379', redisOptions);

connection.on('error', (err) => {
  console.error('[Redis] Connection Error:', err.message);
});

export const followUpQueue = new Queue('follow-up-queue', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export const queueEvents = new QueueEvents('follow-up-queue', { connection });

/**
 * Add a follow-up job to the queue.
 * 
 * @param {Object} data - Job data
 * @param {number} delay - Delay in milliseconds
 */
export async function addFollowUpJob(data, delay) {
  const jobId = `follow-up-${data.leadId}-${data.followUpNumber}`;
  await followUpQueue.add('process-follow-up', data, {
    delay,
    jobId, // Ensure we don't add duplicate jobs for the same follow-up
  });
  console.log(`[Queue] Added follow-up #${data.followUpNumber} for lead ${data.leadId} with delay ${delay}ms`);
}

/**
 * Remove pending follow-up jobs for a lead.
 * Used when a lead replies.
 * 
 * @param {string} leadId - Lead ID
 */
export async function cancelFollowUps(leadId) {
  // This is a bit complex with BullMQ if we want to remove specific delayed jobs.
  // We can use jobIds or iterate.
  for (let i = 1; i <= 3; i++) {
    const jobId = `follow-up-${leadId}-${i}`;
    const job = await followUpQueue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[Queue] Cancelled job ${jobId}`);
    }
  }
}
