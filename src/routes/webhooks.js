import { Router } from 'express';
import crypto from 'crypto';
import supabase from '../db/db.js';
import { sendMessage, welcomeMessage } from '../services/whatsapp.js';
import { scheduleFollowUps } from '../services/scheduler.js';
import { cancelFollowUps } from '../services/queue.js';
import { parseIncomingMessage } from '../services/interakt.js';
import { getMetaLeadDetails } from '../services/meta.js';

const router = Router();

/**
 * Utility to verify Meta Hub Signature
 */
function verifyMetaSignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.warn('⚠️ META_APP_SECRET not set, skipping signature verification');
    return true; 
  }

  try {
    const signatureHash = signature.split('=')[1];
    const expectedHash = crypto
      .createHmac('sha256', appSecret)
      .update(req.rawBody || JSON.stringify(req.body))
      .digest('hex');

    return signatureHash === expectedHash;
  } catch (err) {
    console.error('Error verifying Meta signature:', err.message);
    return false;
  }
}

/**
 * Internal function to create a lead and start the follow-up sequence
 */
async function createLeadAndStartFollowUp({ client_id, name, phone, email, source, meta_leadgen_id }) {
  // Clean the phone number
  const cleanPhone = phone.replace(/^whatsapp[:\+]?/i, '').trim();

  // Verify the client exists
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, business_name, qualifying_question, calendly_link')
    .eq('id', client_id)
    .single();

  if (clientError || !client) {
    throw new Error('Client not found');
  }

  // Check if a lead with this phone already exists for this client
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('client_id', client_id)
    .eq('phone', cleanPhone)
    .maybeSingle();

  if (existingLead) {
    console.log(`Lead with phone ${cleanPhone} already exists for client ${client_id}`);
    return { success: true, already_exists: true, lead_id: existingLead.id };
  }

  // Insert the lead
  const { data: lead, error: insertError } = await supabase
    .from('leads')
    .insert({
      client_id: client_id,
      name: name.trim(),
      phone: cleanPhone,
      email: email || null,
      source: source || 'meta-ads',
      meta_leadgen_id: meta_leadgen_id || null,
      ai_tag: 'UNKNOWN',
      status: 'new',
      follow_up_count: 0,
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create lead: ${insertError.message}`);
  }

  // Send welcome WhatsApp message
  try {
    const welcomeMsg = welcomeMessage(
      lead.name,
      client.business_name || client.name,
      client.qualifying_question
    );
    await sendMessage(lead.phone, welcomeMsg);

    // Record the outbound welcome message
    await supabase.from('messages').insert({
      lead_id: lead.id,
      direction: 'outbound',
      content: welcomeMsg,
      sent_at: new Date().toISOString(),
    });
  } catch (whatsappError) {
    console.error('Failed to send welcome message:', whatsappError.message);
  }

  // Schedule follow-up jobs
  try {
    await scheduleFollowUps(lead.id, lead.created_at);
  } catch (schedulerError) {
    console.error('Failed to schedule follow-ups:', schedulerError.message);
  }

  // Update lead status to active
  await supabase
    .from('leads')
    .update({
      status: 'active',
      last_message_at: new Date().toISOString(),
    })
    .eq('id', lead.id);

  return { success: true, lead_id: lead.id };
}

/**
 * GET /webhook/lead
 * Meta Ads Webhook Verification (Challenge)
 */
router.get('/lead', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.META_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ Meta Webhook Verified');
    return res.status(200).send(challenge);
  } else {
    console.error('❌ Meta Webhook Verification Failed');
    return res.status(403).end();
  }
});

/**
 * POST /webhook/lead
 * Ingest a new lead from Meta Ads or manual entry.
 */
router.post('/lead', async (req, res) => {
  // 1. Check for Meta Signature if header present
  if (req.headers['x-hub-signature-256']) {
    if (!verifyMetaSignature(req)) {
      console.error('❌ Invalid Meta Signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } 

  try {
    // 2. Handle Meta Webhook Payload
    if (req.body.object === 'page') {
      console.log('📦 Received Meta Webhook Payload');
      
      for (const entry of req.body.entry) {
        const pageId = entry.id;
        
        // Find client by meta_page_id
        const { data: client, error: clientError } = await supabase
          .from('clients')
          .select('id, meta_page_access_token')
          .eq('meta_page_id', pageId)
          .single();

        if (clientError || !client) {
          console.warn(`⚠️ Received lead for unknown Meta Page ID: ${pageId}`);
          continue;
        }

        for (const change of entry.changes) {
          if (change.field === 'leadgen') {
            const leadgenId = change.value.leadgen_id;
            console.log(`🔍 Processing Leadgen ID: ${leadgenId}`);

            try {
              // Fetch details from Meta
              const leadDetails = await getMetaLeadDetails(leadgenId, client.meta_page_access_token);
              
              await createLeadAndStartFollowUp({
                client_id: client.id,
                name: leadDetails.name || 'Meta Lead',
                phone: leadDetails.phone,
                email: leadDetails.email,
                source: 'meta-ads',
                meta_leadgen_id: leadgenId
              });
            } catch (err) {
              console.error(`Error processing lead ${leadgenId}:`, err.message);
            }
          }
        }
      }
      return res.status(200).json({ status: 'ok' });
    }

    // 3. Handle Direct Ingestion (for manual/direct entry)
    const providedToken = req.headers['x-webhook-token'] || req.query.token;
    const expectedToken = process.env.WEBHOOK_LEAD_TOKEN;
    
    if (expectedToken && providedToken !== expectedToken) {
      console.error('❌ Unauthorized Lead Webhook Attempt');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { client_id, name, phone, email, source } = req.body;

    // Validate required fields
    if (!client_id) return res.status(400).json({ error: 'client_id is required' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!phone || !phone.trim()) return res.status(400).json({ error: 'phone is required' });

    const result = await createLeadAndStartFollowUp({
      client_id,
      name,
      phone,
      email,
      source: source || 'direct ingestion'
    });

    if (result.already_exists) {
      return res.status(200).json({
        success: true,
        message: 'Lead already exists',
        lead_id: result.lead_id
      });
    }

    return res.status(201).json({
      success: true,
      lead_id: result.lead_id,
      message: 'Lead created and welcome message sent',
    });

  } catch (err) {
    console.error('Webhook lead error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /webhook/whatsapp
 * Interakt Webhook Verification (Challenge)
 */
router.get('/whatsapp', (req, res) => {
  const token = req.query['hub.verify_token'] || req.query.token;
  const challenge = req.query['hub.challenge'] || req.query.challenge;

  const verifyToken = process.env.INTERAKT_VERIFY_TOKEN;

  if (verifyToken && token === verifyToken) {
    return res.status(200).send(challenge || 'ok');
  }
  return res.status(403).end();
});

/**
 * POST /webhook/whatsapp
 * Receive inbound WhatsApp messages.
 */
router.post('/whatsapp', async (req, res) => {
  // Verify Interakt Token
  const providedToken = req.headers['x-webhook-token'] || req.query.token || req.body.token;
  const expectedToken = process.env.INTERAKT_VERIFY_TOKEN;

  if (expectedToken && providedToken !== expectedToken) {
    console.error('❌ Unauthorized WhatsApp Webhook Attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const parsed = parseIncomingMessage(req.body);
    let From, Body, ProfileName;

    if (parsed) {
      From = parsed.phone;
      Body = parsed.message;
      ProfileName = parsed.name;
    } else {
      From = req.body.From;
      Body = req.body.Body;
      ProfileName = req.body.ProfileName;
    }

    if (!From || !Body) {
      return res.status(400).json({ error: 'From and Body are required' });
    }

    const rawPhone = String(From).replace(/^whatsapp[:\+]?/i, '').trim();

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select(`
        id, name, phone, client_id, ai_tag, status, follow_up_count,
        clients!inner(id, name, business_name, industry, qualifying_question, whatsapp_number)
      `)
      .eq('phone', rawPhone)
      .maybeSingle();

    if (leadError || !lead) {
      const { data: clientByPhone } = await supabase
        .from('clients')
        .select('id, name')
        .eq('whatsapp_number', rawPhone)
        .maybeSingle();

      if (clientByPhone) {
        return res.status(200).json({ status: 'ignored', reason: 'client_number' });
      }
      return res.status(200).json({ status: 'ignored', reason: 'unknown_number' });
    }

    const client = lead.clients;

    // Save the inbound message
    await supabase.from('messages').insert({
      lead_id: lead.id,
      direction: 'inbound',
      content: Body,
      sent_at: new Date().toISOString(),
    });

    // Get conversation history
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('direction, content, sent_at')
      .eq('lead_id', lead.id)
      .order('sent_at', { ascending: false })
      .limit(5);

    const conversationHistory = (recentMessages || [])
      .reverse()
      .map(m => ({
        role: m.direction === 'outbound' ? 'assistant' : 'user',
        content: m.content,
      }));

    const { qualifyLead } = await import('../services/ai.js');

    const { tag, reply, reason } = await qualifyLead(
      Body,
      conversationHistory,
      client.qualifying_question,
      client.business_name || client.name,
      client.industry,
      lead.name
    );

    await supabase
      .from('leads')
      .update({
        ai_tag: tag,
        status: tag === 'HOT' ? 'active' : lead.status,
        ai_reason: reason,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', lead.id);

    try {
      await sendMessage(lead.phone, reply);
      await supabase.from('messages').insert({
        lead_id: lead.id,
        direction: 'outbound',
        content: reply,
        sent_at: new Date().toISOString(),
      });
    } catch (whatsappError) {
      console.error('Failed to send AI reply:', whatsappError.message);
    }

    if (tag === 'HOT') {
      try {
        const { hotLeadAlert } = await import('../services/whatsapp.js');
        const alertMsg = hotLeadAlert(lead.name, lead.phone, Body, reason);
        await sendMessage(client.whatsapp_number, alertMsg);
      } catch (alertError) {
        console.error('Failed to send hot lead alert:', alertError.message);
      }
    }

    // Cancel scheduled follow-ups as the lead has replied
    await cancelFollowUps(lead.id);

    await supabase
      .from('follow_up_jobs')
      .update({ status: 'cancelled' })
      .eq('lead_id', lead.id)
      .eq('status', 'pending');

    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/xml') || acceptHeader.includes('text/html')) {
      return res.status(200).type('text/xml').send('<Response></Response>');
    }
    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook WhatsApp error:', err.message);
    return res.status(200).json({ status: 'ok' });
  }
});

export default router;
