import { Router } from 'express';
import supabase from '../db/db.js';

const router = Router();

/**
 * POST /clients
 * Create a new client.
 */
router.post('/', async (req, res) => {
  try {
    const { 
      name, business_name, whatsapp_number, industry, 
      qualifying_question, calendly_link, email, password,
      plan, amount 
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!whatsapp_number || !whatsapp_number.trim()) {
      return res.status(400).json({ error: 'whatsapp_number is required' });
    }

    const cleanPhone = whatsapp_number.replace(/^whatsapp[:\+]?/i, '').trim();

    // Set subscription defaults
    const clientPlan = plan || 'starter';
    const planAmount = amount || (clientPlan === 'starter' ? 5000 : clientPlan === 'growth' ? 12000 : 25000);
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

    const clientPassword = password || Math.random().toString(36).slice(-8); // random 8 char default

    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        name: name.trim(),
        business_name: business_name || name.trim(),
        whatsapp_number: cleanPhone,
        industry: industry || 'other',
        qualifying_question: qualifying_question || 'What made you interested in our services today?',
        calendly_link: calendly_link || null,
        email: email || null,
        password: clientPassword,
        plan: clientPlan,
        amount: planAmount,
        subscription_start: startDate.toISOString(),
        subscription_end: endDate.toISOString(),
        subscription_status: 'active',
        payment_status: 'paid',
        last_payment_date: startDate.toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Client create error:', error.message);
      return res.status(500).json({ error: 'Failed to create client' });
    }

    return res.status(201).json({
      ...client,
      password: undefined, // Don't send password back
      login_url: `${process.env.FRONTEND_URL || 'https://vanguard-lead-system-frontend.vercel.app'}/login`,
      login_email: email || `${name.toLowerCase().replace(/\s+/g, '.')}@client.com`,
      login_password: clientPassword,
    });
  } catch (err) {
    console.error('Client create error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /clients
 * List all clients.
 */
router.get('/', async (req, res) => {
  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Clients list error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch clients' });
    }

    return res.json(clients || []);
  } catch (err) {
    console.error('Clients list error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /clients/:id
 * Get a single client by ID.
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    return res.json(client);
  } catch (err) {
    console.error('Client get error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /clients/:id
 * Update a client.
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};

    // Only allow updating specific fields
    const allowedFields = ['name', 'business_name', 'whatsapp_number', 'industry', 'qualifying_question', 'calendly_link'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
        // Clean whatsapp_number if present
        if (field === 'whatsapp_number') {
          updates[field] = req.body[field].replace(/^whatsapp[:\+]?/i, '').trim();
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data: client, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Client update error:', error.message);
      return res.status(500).json({ error: 'Failed to update client' });
    }

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    return res.json(client);
  } catch (err) {
    console.error('Client update error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /clients/:id
 * Delete a client and all associated data (cascading).
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: client, error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Client delete error:', error.message);
      return res.status(500).json({ error: 'Failed to delete client' });
    }

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    return res.json({ message: 'Client deleted successfully', id });
  } catch (err) {
    console.error('Client delete error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;