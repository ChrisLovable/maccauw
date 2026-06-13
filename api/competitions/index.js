const supabase = require('../../lib/supabase');
const { toCompetitionJson } = require('../../lib/format');
const { maxScoreFor } = require('../../lib/disciplines');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('competitions')
      .select('*')
      .order('date', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data.map(toCompetitionJson));
  }

  if (req.method === 'POST') {
    const { name, date, discipline, maxScore } = req.body;
    if (!name || !date || !discipline) {
      return res.status(400).json({ error: 'name, date, discipline required' });
    }
    const { data, error } = await supabase
      .from('competitions')
      .insert({ name, date, discipline, max_score: maxScore || maxScoreFor(discipline) })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(toCompetitionJson(data));
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
};
