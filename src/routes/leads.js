import { Router } from 'express';
import supabase from '../db/db.js';

const router = Router();

/**
 * GET /leads/:client_id
 * Get all leads for a specific client with filtering and pagination.
 * Query params: tag, status, source, date_from, date_to, page, limit
 */
router.get('/:client_id', async (req, res) => {
  try {
    const { client_id } = req.params;
    const { tag, status, source, date_from, date_to, page, limit } = req.query;

    // Pagination defaults
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    // Start building query
    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('client_id', client_id);

    // Apply filters
    if (tag) {
      query = query.eq('ai_tag', tag.toUpperCase());
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (source) {
      query = query.eq('source', source);
    }
    if (date_from) {
      query = query.gte('created_at', date_from);
    }
    if (date_to) {
      query = query.lte('created_at', date_to);
    }

    // Apply ordering, pagination
    const { data: leads, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      console.error('Leads list error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch leads' });
    }

    return res.json({
      leads: leads || [],
      total: count || 0,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error('Leads list error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /leads/:id
 * Update a lead's tag, status, notes, appointment_date.
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};

    // Allowed update fields
    const allowedFields = ['ai_tag', 'status', 'notes', 'appointment_date', 'email', 'name', 'source'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        // Validate ai_tag
        if (field === 'ai_tag') {
          const validTags = ['HOT', 'WARM', 'COLD', 'UNKNOWN'];
          if (!validTags.includes(req.body[field])) {
            return res.status(400).json({ error: `Invalid ai_tag. Must be one of: ${validTags.join(', ')}` });
          }
        }
        // Validate status
        if (field === 'status') {
          const validStatuses = ['new', 'active', 'appointment_set', 'converted', 'dead', 'cancelled'];
          if (!validStatuses.includes(req.body[field])) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
          }
        }
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Lead update error:', error.message);
      return res.status(500).json({ error: 'Failed to update lead' });
    }

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    return res.json(lead);
  } catch (err) {
    console.error('Lead update error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /leads/detail/:id
 * Get a single lead with full conversation history.
 */
router.get('/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select(`
        *,
        clients!inner(
          id,
          name,
          business_name,
          industry,
          whatsapp_number,
          calendly_link
        )
      `)
      .eq('id', id)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get conversation messages ordered by time
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', id)
      .order('sent_at', { ascending: true });

    if (msgError) {
      console.error('Messages fetch error:', msgError.message);
    }

    // Get follow-up jobs
    const { data: followUpJobs } = await supabase
      .from('follow_up_jobs')
      .select('*')
      .eq('lead_id', id)
      .order('scheduled_at', { ascending: true });

    return res.json({
      ...lead,
      messages: messages || [],
      follow_up_jobs: followUpJobs || [],
    });
  } catch (err) {
    console.error('Lead detail error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;