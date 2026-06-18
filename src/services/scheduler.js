import supabase from '../db/db.js';
import { addFollowUpJob } from './queue.js';

/**
 * Schedule 3 follow-up jobs for a lead.
 * Called when a new lead is created.
 *
 * @param {string} leadId - The lead's UUID
 * @param {string} createdAt - ISO timestamp of when lead was created
 */
export async function scheduleFollowUps(leadId, createdAt) {
  const createdDate = new Date(createdAt);

  const jobs = [
    { number: 1, hours: 24 },   // 1 day
    { number: 2, hours: 72 },   // 3 days
    { number: 3, hours: 168 },  // 7 days
  ];

  for (const job of jobs) {
    const scheduledDate = new Date(createdDate.getTime() + job.hours * 60 * 60 * 1000);
    const delay = scheduledDate.getTime() - Date.now();

    // 1. Record in DB (legacy & visibility)
    const { error } = await supabase.from('follow_up_jobs').insert({
      lead_id: leadId,
      scheduled_at: scheduledDate.toISOString(),
      follow_up_number: job.number,
      status: 'pending',
    });

    if (error) {
      console.error(`Error scheduling follow-up #${job.number} for lead ${leadId}:`, error.message);
    } else {
      console.log(`Scheduled follow-up #${job.number} for lead ${leadId} at ${scheduledDate.toISOString()}`);
    }

    // 2. Add to BullMQ
    // Only add if it's in the future or within a reasonable past window for immediate processing
    await addFollowUpJob({
      leadId,
      followUpNumber: job.number,
      scheduledAt: scheduledDate.toISOString()
    }, Math.max(0, delay));
  }
}

/**
 * Migrate existing pending jobs from DB to BullMQ.
 * Useful for recovery or initial deployment.
 */
export async function migrateJobsToQueue() {
  console.log('[Scheduler] Migrating pending jobs to BullMQ...');
  
  const { data: pendingJobs, error } = await supabase
    .from('follow_up_jobs')
    .select('*')
    .eq('status', 'pending');

  if (error) {
    console.error('[Scheduler] Error fetching pending jobs for migration:', error.message);
    return;
  }

  console.log(`[Scheduler] Found ${pendingJobs.length} pending jobs to migrate.`);

  for (const job of pendingJobs) {
    const scheduledDate = new Date(job.scheduled_at);
    const delay = Math.max(0, scheduledDate.getTime() - Date.now());

    await addFollowUpJob({
      leadId: job.lead_id,
      followUpNumber: job.follow_up_number,
      scheduledAt: job.scheduled_at
    }, delay);
  }
}

/**
 * Initialize the scheduler.
 */
export function initScheduler() {
  console.log('[Scheduler] Initializing BullMQ-based scheduler...');
  
  // Run migration after a short delay to ensure Redis/Worker are ready
  setTimeout(() => {
    migrateJobsToQueue();
  }, 5000);

  console.log('[Scheduler] Scheduler initialized.');
}
