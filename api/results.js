const supabase = require('../lib/supabase');
const { toResultJson } = require('../lib/format');
const { upsertResult } = require('../lib/results');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { competitionId, shooterName, shooterClass, total } = req.body;
    if (!competitionId || !shooterName || total === undefined) {
      return res.status(400).json({ error: 'competitionId, shooterName, total required' });
    }
    try {
      const result = await upsertResult(competitionId, shooterName.trim(), shooterClass, total);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'GET') {
    const competitionId = parseInt(req.query.competitionId);
    if (!competitionId) return res.status(400).json({ error: 'competitionId required' });
    const { data, error } = await supabase
      .from('results')
      .select('*')
      .eq('competition_id', competitionId)
      .order('total', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    const withRank = data.map((r, i) => ({ ...toResultJson(r), rank: i + 1 }));
    return res.json(withRank);
  }

  if (req.method === 'PUT') {
    const id = parseInt(req.query.id);
    if (!id) return res.status(400).json({ error: 'id required' });
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

  if (req.method === 'DELETE') {
    const id = parseInt(req.query.id);
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('results').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, PUT, DELETE');
  res.status(405).json({ error: 'Method not allowed' });
};
