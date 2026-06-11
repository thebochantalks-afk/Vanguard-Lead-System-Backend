import { Router } from 'express';
import supabase from '../db/db.js';

const router = Router();

/**
 * GET /dashboard/:client_id
 * Get dashboard stats for a specific client.
 */
router.get('/:client_id', async (req, res) => {
  try {
    const { client_id } = req.params;

    // Total leads count
    const { count: totalLeads, error: totalError } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client_id);

    if (totalError) throw totalError;

    // HOT / WARM / COLD counts
    const { data: tagCounts, error: tagError } = await supabase
      .from('leads')
      .select('ai_tag')
      .eq('client_id', client_id);

    if (tagError) throw tagError;

    const tagDistribution = { HOT: 0, WARM: 0, COLD: 0, UNKNOWN: 0 };
    (tagCounts || []).forEach(l => {
      if (tagDistribution[l.ai_tag] !== undefined) {
        tagDistribution[l.ai_tag]++;
      } else {
        tagDistribution.UNKNOWN++;
      }
    });

    // Appointments this week
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const { count: appointmentsThisWeek, error: apptError } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client_id)
      .eq('status', 'appointment_set')
      .gte('appointment_date', startOfWeek.toISOString())
      .lt('appointment_date', endOfWeek.toISOString());

    if (apptError) throw apptError;

    // Conversion rate
    const conversionRate = totalLeads > 0
      ? Math.round((tagDistribution.HOT / totalLeads) * 100)
      : 0;

    // Daily leads for last 30 days (for chart)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: dailyLeadsRaw, error: dailyError } = await supabase
      .from('leads')
      .select('created_at')
      .eq('client_id', client_id)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (dailyError) throw dailyError;

    // Aggregate leads by day
    const dailyMap = {};
    (dailyLeadsRaw || []).forEach(l => {
      const day = new Date(l.created_at).toISOString().split('T')[0];
      dailyMap[day] = (dailyMap[day] || 0) + 1;
    });

    const dailyLeads = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Recent leads (last 10)
    const { data: recentLeads, error: recentError } = await supabase
      .from('leads')
      .select('id, name, phone, ai_tag, status, source, created_at')
      .eq('client_id', client_id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) throw recentError;

    return res.json({
      client_id,
      total_leads: totalLeads || 0,
      tag_distribution: tagDistribution,
      hot_leads: tagDistribution.HOT,
      warm_leads: tagDistribution.WARM,
      cold_leads: tagDistribution.COLD,
      appointments_this_week: appointmentsThisWeek || 0,
      conversion_rate: conversionRate,
      daily_leads: dailyLeads,
      recent_leads: recentLeads || [],
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /dashboard/admin
 * Aggregated dashboard stats for all clients.
 */
router.get('/admin', async (req, res) => {
  try {
    // Total clients
    const { count: totalClients, error: clientsError } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true });

    if (clientsError) throw clientsError;

    // Total leads across all clients
    const { count: totalLeads, error: leadsError } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true });

    if (leadsError) throw leadsError;

    // Tag distribution across all clients
    const { data: allTags, error: tagsError } = await supabase
      .from('leads')
      .select('ai_tag');

    if (tagsError) throw tagsError;

    const globalTagDist = { HOT: 0, WARM: 0, COLD: 0, UNKNOWN: 0 };
    (allTags || []).forEach(l => {
      if (globalTagDist[l.ai_tag] !== undefined) {
        globalTagDist[l.ai_tag]++;
      } else {
        globalTagDist.UNKNOWN++;
      }
    });

    // Status distribution
    const { data: allStatuses, error: statusError } = await supabase
      .from('leads')
      .select('status');

    if (statusError) throw statusError;

    const statusDistribution = {};
    (allStatuses || []).forEach(l => {
      statusDistribution[l.status] = (statusDistribution[l.status] || 0) + 1;
    });

    // Appointments this week
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const { count: allApptsThisWeek } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'appointment_set')
      .gte('appointment_date', startOfWeek.toISOString())
      .lt('appointment_date', endOfWeek.toISOString());

    // Daily leads for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: allDailyLeads } = await supabase
      .from('leads')
      .select('created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    const dailyMap = {};
    (allDailyLeads || []).forEach(l => {
      const day = new Date(l.created_at).toISOString().split('T')[0];
      dailyMap[day] = (dailyMap[day] || 0) + 1;
    });

    const dailyLeads = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Conversion rate across all clients
    const globalConversionRate = totalLeads > 0
      ? Math.round((globalTagDist.HOT / totalLeads) * 100)
      : 0;

    return res.json({
      total_clients: totalClients || 0,
      total_leads: totalLeads || 0,
      tag_distribution: globalTagDist,
      status_distribution: statusDistribution,
      hot_leads: globalTagDist.HOT,
      warm_leads: globalTagDist.WARM,
      cold_leads: globalTagDist.COLD,
      appointments_this_week: allApptsThisWeek || 0,
      conversion_rate: globalConversionRate,
      daily_leads: dailyLeads,
    });
  } catch (err) {
    console.error('Admin dashboard error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;