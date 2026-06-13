import { Router } from 'express';
import supabase from '../db/db.js';

const router = Router();

/**
 * GET /admin/stats
 * Complete admin dashboard with client management, revenue, alerts.
 */
router.get('/stats', async (req, res) => {
  try {
    // Get all clients with subscription info
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (clientsError) throw clientsError;

    // Get total lead count
    const { count: totalLeads } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true });

    // Get lead counts per client
    const { data: leadCounts } = await supabase
      .from('leads')
      .select('client_id');

    const leadsPerClient = {};
    (leadCounts || []).forEach(l => {
      leadsPerClient[l.client_id] = (leadsPerClient[l.client_id] || 0) + 1;
    });

    // Calculate subscription stats
    const now = new Date();
    const monthEnd = new Date();
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const activeClients = (clients || []).filter(c => c.subscription_status === 'active');
    const expiredClients = (clients || []).filter(c => c.subscription_status === 'expired');
    const expiringThisMonth = (clients || []).filter(c => {
      const end = new Date(c.subscription_end);
      return c.subscription_status === 'active' && end <= monthEnd && end > now;
    });

    // MRR (Monthly Recurring Revenue)
    const mrr = activeClients.reduce((sum, c) => sum + (c.amount || 0), 0);

    // Pending payments
    const pendingPayments = (clients || []).filter(c => c.payment_status === 'pending' || c.payment_status === 'overdue');

    // Revenue this month
    const revenueThisMonth = (clients || []).reduce((sum, c) => {
      const lastPay = new Date(c.last_payment_date || c.created_at);
      const currentMonth = new Date();
      return lastPay.getMonth() === currentMonth.getMonth() && lastPay.getFullYear() === currentMonth.getFullYear()
        ? sum + (c.amount || 0)
        : sum;
    }, 0);

    return res.json({
      clients: (clients || []).map(c => ({
        id: c.id,
        name: c.name,
        business_name: c.business_name,
        industry: c.industry,
        email: c.email,
        plan: c.plan || 'starter',
        amount: c.amount || 5000,
        subscription_start: c.subscription_start,
        subscription_end: c.subscription_end,
        subscription_status: c.subscription_status || 'active',
        payment_status: c.payment_status || 'paid',
        last_payment_date: c.last_payment_date,
        whatsapp_number: c.whatsapp_number,
        created_at: c.created_at,
        total_leads: leadsPerClient[c.id] || 0,
        qualifying_question: c.qualifying_question,
      })),
      stats: {
        total_clients: (clients || []).length,
        active_clients: activeClients.length,
        expired_clients: expiredClients.length,
        total_leads: totalLeads || 0,
        mrr: mrr,
        revenue_this_month: revenueThisMonth,
        pending_payments_count: pendingPayments.length,
        expiring_this_month: expiringThisMonth.length,
      },
      alerts: [
        ...expiringThisMonth.map(c => ({
          type: 'warning',
          message: `${c.business_name || c.name}'s subscription ends on ${new Date(c.subscription_end).toLocaleDateString('en-IN')}`,
          client_id: c.id,
        })),
        ...pendingPayments.map(c => ({
          type: 'error',
          message: `${c.business_name || c.name} has ${c.payment_status} payment of ₹${(c.amount || 5000).toLocaleString('en-IN')}`,
          client_id: c.id,
        })),
      ],
    });
  } catch (err) {
    console.error('Admin stats error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;