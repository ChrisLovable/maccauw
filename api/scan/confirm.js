const supabase = require('../../lib/supabase');
const { maxScoreFor } = require('../../lib/disciplines');
const { toCompetitionJson } = require('../../lib/format');
const { upsertResult } = require('../../lib/results');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { competition, shooters } = req.body;
  if (!competition || !competition.name || !competition.date || !competition.discipline) {
    return res.status(400).json({ error: 'Competition name, date and discipline are required' });
  }
  if (!Array.isArray(shooters) || shooters.length === 0) {
    return res.status(400).json({ error: 'At least one shooter is required' });
  }

  try {
    let comp;
    const { data: existing, error: findErr } = await supabase
      .from('competitions')
      .select('*')
      .ilike('name', competition.name)
      .eq('date', competition.date)
      .ilike('discipline', competition.discipline)
      .maybeSingle();
    if (findErr) throw findErr;

    if (existing) {
      comp = existing;
    } else {
      const { data, error } = await supabase
        .from('competitions')
        .insert({
          name: competition.name,
          date: competition.date,
          discipline: competition.discipline,
          max_score: competition.maxScore || maxScoreFor(competition.discipline)
        })
        .select()
        .single();
      if (error) throw error;
      comp = data;
    }

    const valid = shooters.filter(s =>
      s.name && s.name.trim() && s.total !== undefined && s.total !== null && s.total !== ''
    );

    for (const s of valid) {
      await upsertResult(comp.id, s.name.trim(), s.class || '', Number(s.total));
    }

    res.json({ competition: toCompetitionJson(comp), saved: valid.length });
  } catch (err) {
    console.error('Confirm error:', err);
    res.status(500).json({ error: err.message });
  }
};
