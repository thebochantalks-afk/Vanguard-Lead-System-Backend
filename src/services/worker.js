import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import supabase from '../db/db.js';
import { sendMessage, followUp1, followUp2, followUp3 } from './whatsapp.js';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.warn('⚠️  REDIS_URL is not set for worker. Falling back to default localhost Redis.');
}

const redisOptions = {
  maxRetriesPerRequest: null,
};

if (REDIS_URL && REDIS_URL.startsWith('rediss://')) {
  redisOptions.tls = {
    rejectUnauthorized: false
  };
}

const connection = new IORedis(REDIS_URL || 'redis://127.0.0.1:6379', redisOptions);

connection.on('error', (err) => {
  console.error('[Redis Worker] Connection Error:', err.message);
});

export function initWorker() {
  console.log('[Worker] Initializing BullMQ worker...');

  const worker = new Worker('follow-up-queue', async (job) => {
    const { leadId, followUpNumber, scheduledAt } = job.data;
    console.log(`[Worker] Processing job ${job.id} (Follow-up #${followUpNumber} for Lead ${leadId})`);

    try {
      // 1. Fetch latest lead and client data
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select(`
          id,
          name,
          phone,
          status,
          follow_up_count,
          clients!inner(
            calendly_link
          )
        `)
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        console.error(`[Worker] Error fetching lead ${leadId}:`, leadError?.message);
        return;
      }

      // 2. Safety Check: If lead is already 'dead', 'converted', or 'qualified', skip
      if (['dead', 'converted', 'qualified'].includes(lead.status)) {
        console.log(`[Worker] Lead ${leadId} status is '${lead.status}' - skipping follow-up`);
        return;
      }

      // 3. Safety Check: Check for recent inbound messages
      const { data: recentMessages, error: msgError } = await supabase
        .from('messages')
        .select('id')
        .eq('lead_id', leadId)
        .eq('direction', 'inbound')
        .gte('sent_at', scheduledAt) // scheduledAt was when this job was *supposed* to run
        .limit(1);

      if (msgError) {
        console.error(`[Worker] Error checking messages for lead ${leadId}:`, msgError.message);
        throw new Error(msgError.message);
      }

      if (recentMessages && recentMessages.length > 0) {
        console.log(`[Worker] Lead ${leadId} replied - skipping and cancelling further follow-ups`);
        
        // Update lead's status if they replied (optional, maybe keep as 'contacted')
        // But we definitely stop the follow-ups.
        
        // We could call cancelFollowUps here too just in case
        return;
      }

      // 4. Send the message
      const client = lead.clients;
      let message;
      switch (followUpNumber) {
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

      await sendMessage(lead.phone, message);

      // 5. Record the outbound message
      await supabase.from('messages').insert({
        lead_id: lead.id,
        direction: 'outbound',
        content: message,
        sent_at: new Date().toISOString(),
      });

      // 6. Update lead's follow_up_count
      const newCount = (lead.follow_up_count || 0) + 1;
      const leadUpdate = {
        follow_up_count: newCount,
        last_message_at: new Date().toISOString(),
      };

      if (newCount >= 3) {
        leadUpdate.status = 'dead';
      }

      await supabase
        .from('leads')
        .update(leadUpdate)
        .eq('id', lead.id);

      // 7. Update the DB job status if it exists (legacy compatibility)
      await supabase
        .from('follow_up_jobs')
        .update({ status: 'sent' })
        .eq('lead_id', leadId)
        .eq('follow_up_number', followUpNumber)
        .eq('status', 'pending');

      console.log(`[Worker] Successfully sent follow-up #${followUpNumber} to ${lead.name}`);

    } catch (error) {
      console.error(`[Worker] Error processing job ${job.id}:`, error.message);
      throw error; // Let BullMQ handle retries
    }
  }, {
    connection,
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job.id} failed:`, err.message);
  });

  return worker;
}
