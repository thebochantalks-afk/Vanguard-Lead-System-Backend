import { Router } from 'express';
import supabase from '../db/db.js';
import { sendMessage, welcomeMessage } from '../services/whatsapp.js';
import { scheduleFollowUps } from '../services/scheduler.js';
import { parseIncomingMessage } from '../services/interakt.js';

const router = Router();

/**
 * POST /webhook/lead
 * Ingest a new lead from Meta Ads or manual entry.
 * Body: { client_id, name, phone, email?, source? }
 */
router.post('/lead', async (req, res) => {
  try {
    const { client_id, name, phone, email, source } = req.body;

    // Validate required fields
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'phone is required' });
    }

    // Clean the phone number (remove whatsapp: prefix for storage)
    const cleanPhone = phone.replace(/^whatsapp[:\+]?/i, '').trim();

    // Verify the client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, business_name, qualifying_question, calendly_link')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Check if a lead with this phone already exists for this client
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('client_id', client_id)
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (existingLead) {
      return res.status(409).json({
        error: 'Lead with this phone number already exists for this client',
        lead_id: existingLead.id,
      });
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
        ai_tag: 'UNKNOWN',
        status: 'new',
        follow_up_count: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Lead insert error:', insertError.message);
      return res.status(500).json({ error: 'Failed to create lead' });
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
      // Don't fail the request — the lead was still created
    }

    // Schedule follow-up jobs
    try {
      await scheduleFollowUps(lead.id, lead.created_at);
    } catch (schedulerError) {
      console.error('Failed to schedule follow-ups:', schedulerError.message);
      // Non-critical — don't fail the request
    }

    // Update lead status to active (we've engaged)
    await supabase
      .from('leads')
      .update({
        status: 'active',
        last_message_at: new Date().toISOString(),
      })
      .eq('id', lead.id);

    return res.status(201).json({
      success: true,
      lead_id: lead.id,
      message: 'Lead created and welcome message sent',
    });
  } catch (err) {
    console.error('Webhook lead error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /webhook/whatsapp
 * Receive inbound WhatsApp messages.
 * Supports:
 *   - Interakt format: { from, msg, senderName }
 *   - Twilio format:  { From, Body, ProfileName }
 */
router.post('/whatsapp', async (req, res) => {
  try {
    // Parse the incoming message (supports Interakt + Twilio formats)
    const parsed = parseIncomingMessage(req.body);
    let From, Body, ProfileName;

    if (parsed) {
      // Interakt format detected
      From = parsed.phone;
      Body = parsed.message;
      ProfileName = parsed.name;
    } else {
      // Try Twilio format
      From = req.body.From;
      Body = req.body.Body;
      ProfileName = req.body.ProfileName;
    }

    if (!From || !Body) {
      return res.status(400).json({ error: 'From and Body are required' });
    }

    // Clean phone number (remove any whatsapp: prefix)
    const rawPhone = String(From).replace(/^whatsapp[:\+]?/i, '').trim();

    // Find the lead by phone number
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select(`
        id,
        name,
        phone,
        client_id,
        ai_tag,
        status,
        follow_up_count,
        clients!inner(
          id,
          name,
          business_name,
          industry,
          qualifying_question,
          whatsapp_number
        )
      `)
      .eq('phone', rawPhone)
      .maybeSingle();

    if (leadError || !lead) {
      // Unknown number — check if this is a client's own number
      console.log(`Inbound message from unknown number: ${rawPhone}`);
      
      const { data: clientByPhone } = await supabase
        .from('clients')
        .select('id, name')
        .eq('whatsapp_number', rawPhone)
        .maybeSingle();

      if (clientByPhone) {
        // This is a client's own number — ignore
        return res.status(200).json({ status: 'ignored', reason: 'client_number' });
      }

      // Unknown lead
      return res.status(200).json({ status: 'ignored', reason: 'unknown_number' });
    }

    const client = lead.clients;

    // Save the inbound message
    const { error: msgError } = await supabase.from('messages').insert({
      lead_id: lead.id,
      direction: 'inbound',
      content: Body,
      sent_at: new Date().toISOString(),
    });

    if (msgError) {
      console.error('Error saving inbound message:', msgError.message);
    }

    // Get conversation history (last 5 messages)
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

    // Import AI service dynamically to avoid circular imports
    const { qualifyLead } = await import('../services/ai.js');

    // Qualify the lead
    const { tag, reply, reason } = await qualifyLead(
      Body,
      conversationHistory,
      client.qualifying_question,
      client.business_name || client.name,
      client.industry
    );

    // Update lead with qualification results
    await supabase
      .from('leads')
      .update({
        ai_tag: tag,
        status: tag === 'HOT' ? 'active' : lead.status,
        ai_reason: reason,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', lead.id);

    // Send AI-generated reply via WhatsApp
    try {
      await sendMessage(lead.phone, reply);

      // Save the outbound AI reply
      await supabase.from('messages').insert({
        lead_id: lead.id,
        direction: 'outbound',
        content: reply,
        sent_at: new Date().toISOString(),
      });
    } catch (whatsappError) {
      console.error('Failed to send AI reply:', whatsappError.message);
      // Try fallback message
      try {
        const { fallbackMessage } = await import('../services/whatsapp.js');
        const fallback = fallbackMessage(lead.name);
        await sendMessage(lead.phone, fallback);
      } catch (fbError) {
        console.error('Fallback message failed too:', fbError.message);
      }
    }

    // If HOT tag, alert the client
    if (tag === 'HOT') {
      try {
        const { hotLeadAlert } = await import('../services/whatsapp.js');
        const alertMsg = hotLeadAlert(lead.name, lead.phone, Body);
        await sendMessage(client.whatsapp_number, alertMsg);
        console.log(`Hot lead alert sent to client ${client.id} for lead ${lead.id}`);
      } catch (alertError) {
        console.error('Failed to send hot lead alert:', alertError.message);
      }
    }

    // Cancel all pending follow-up jobs since lead replied
    await supabase
      .from('follow_up_jobs')
      .update({ status: 'cancelled' })
      .eq('lead_id', lead.id)
      .eq('status', 'pending');

    // Return success (Interakt expects JSON, Twilio used TwiML)
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/xml') || acceptHeader.includes('text/html')) {
      return res.status(200).type('text/xml').send('<Response></Response>');
    }
    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook WhatsApp error:', err.message);
    return res.status(200).json({ status: 'ok' }); // Always 200 to prevent retries
  }
});

export default router;