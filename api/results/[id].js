const supabase = require('../../lib/supabase');
const { toResultJson } = require('../../lib/format');

module.exports = async (req, res) => {
  const id = parseInt(req.query.id);

  // GET /api/results/:competitionId — leaderboard for a competition
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('results')
      .select('*')
      .eq('competition_id', id)
      .order('total', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    const withRank = data.map((r, i) => ({ ...toResultJson(r), rank: i + 1 }));
    return res.json(withRank);
  }

  // PUT /api/results/:id — update a single result
  if (req.method === 'PUT') {
    const updates = {};
    if (req.body.shooterName !== undefined) updates.shooter_name = req.body.shooterName;
    if (req.body.shooterClass !== undefined) updates.shooter_class = req.body.shooterClass;
    if (req.body.total !== undefined) updates.total = req.body.total;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('results')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(404).json({ error: error.message });
    return res.json(toResultJson(data));
  }

  // DELETE /api/results/:id — remove a single result
  if (req.method === 'DELETE') {
    const { error } = await supabase.from('results').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  res.status(405).json({ error: 'Method not allowed' });
};
