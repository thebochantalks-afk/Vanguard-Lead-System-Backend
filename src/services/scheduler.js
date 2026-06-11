import cron from 'node-cron';
import supabase from '../db/db.js';
import { sendMessage, followUp1, followUp2, followUp3 } from './whatsapp.js';

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
  }
}

/**
 * Process due follow-up jobs.
 * Called every 30 minutes by the cron job.
 */
async function processDueFollowUps() {
  console.log('[Scheduler] Checking due follow-up jobs...');

  try {
    // Find all pending jobs that are due
    const { data: dueJobs, error } = await supabase
      .from('follow_up_jobs')
      .select(`
        id,
        lead_id,
        follow_up_number,
        scheduled_at,
        leads!inner(
          id,
          name,
          phone,
          client_id,
          follow_up_count,
          clients!inner(
            calendly_link
          )
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .limit(50);

    if (error) {
      console.error('[Scheduler] Error fetching due jobs:', error.message);
      return;
    }

    if (!dueJobs || dueJobs.length === 0) {
      console.log('[Scheduler] No due jobs found.');
      return;
    }

    console.log(`[Scheduler] Processing ${dueJobs.length} due job(s)...`);

    for (const job of dueJobs) {
      try {
        const lead = job.leads;
        const client = lead.clients;

        // Check if lead has sent any inbound messages since this job was created
        const { data: recentMessages, error: msgError } = await supabase
          .from('messages')
          .select('id')
          .eq('lead_id', lead.id)
          .eq('direction', 'inbound')
          .gte('sent_at', job.scheduled_at)
          .limit(1);

        if (msgError) {
          console.error(`[Scheduler] Error checking messages for lead ${lead.id}:`, msgError.message);
          continue;
        }

        // If lead replied after job was created, cancel remaining jobs
        if (recentMessages && recentMessages.length > 0) {
          console.log(`[Scheduler] Lead ${lead.id} replied - cancelling follow-up #${job.follow_up_number}`);
          
          await supabase
            .from('follow_up_jobs')
            .update({ status: 'cancelled' })
            .eq('id', job.id);

          // Cancel all remaining pending jobs for this lead too
          await supabase
            .from('follow_up_jobs')
            .update({ status: 'cancelled' })
            .eq('lead_id', lead.id)
            .eq('status', 'pending');

          continue;
        }

        // Decide which message to send based on follow_up_number
        let message;
        switch (job.follow_up_number) {
          case 1:
            message = followUp1(lead.name);
            break;
          case 2:
            message = followUp2(lead.name);
            break;
          case 3:
            message = followUp3(lead.name, client.calendly_link);
            break;
          default:
            message = followUp1(lead.name);
        }

        // Send the WhatsApp message
        await sendMessage(lead.phone, message);

        // Record the outbound message
        await supabase.from('messages').insert({
          lead_id: lead.id,
          direction: 'outbound',
          content: message,
          sent_at: new Date().toISOString(),
        });

        // Update job status to 'sent'
        await supabase
          .from('follow_up_jobs')
          .update({ status: 'sent' })
          .eq('id', job.id);

        // Update lead's follow_up_count
        const newCount = (lead.follow_up_count || 0) + 1;
        const leadUpdate = {
          follow_up_count: newCount,
          last_message_at: new Date().toISOString(),
        };

        // If this is the 3rd follow-up, mark lead as 'dead'
        if (newCount >= 3) {
          leadUpdate.status = 'dead';
        }

        await supabase
          .from('leads')
          .update(leadUpdate)
          .eq('id', lead.id);

        console.log(`[Scheduler] Sent follow-up #${job.follow_up_number} to lead ${lead.name} (${lead.id})`);
      } catch (jobError) {
        console.error(`[Scheduler] Error processing job ${job.id}:`, jobError.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Unexpected error:', err.message);
  }
}

/**
 * Initialize the cron scheduler.
 * Runs every 30 minutes.
 */
export function initScheduler() {
  console.log('[Scheduler] Initializing cron job (every 30 minutes)...');

  // Run every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    processDueFollowUps();
  });

  // Run an initial check 10 seconds after startup
  setTimeout(() => {
    processDueFollowUps();
  }, 10000);

  console.log('[Scheduler] Cron job initialized successfully.');
}