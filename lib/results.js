const supabase = require('./supabase');
const { toResultJson } = require('./format');

const SCORE_COLUMNS = { ata: 'ata_score', dtl: 'dtl_score', doubles: 'doubles_score' };

// scores is a partial object, e.g. { ata: 23 } or { dtl: 24, doubles: 47 }.
// Only the disciplines present in `scores` are written; others are left untouched.
async function upsertResult(competitionId, shooterName, shooterClass, scores = {}) {
  const { data: existing } = await supabase
    .from('results')
    .select('*')
    .eq('competition_id', competitionId)
    .ilike('shooter_name', shooterName)
    .maybeSingle();

  const columns = {};
  for (const [key, column] of Object.entries(SCORE_COLUMNS)) {
    if (scores[key] !== undefined) columns[column] = scores[key];
  }

  if (existing) {
    const { data, error } = await supabase
      .from('results')
      .update({
        ...columns,
        shooter_class: shooterClass || existing.shooter_class,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return toResultJson(data);
  }

  const { data, error } = await supabase
    .from('results')
    .insert({
      competition_id: competitionId,
      shooter_name: shooterName,
      shooter_class: shooterClass || '',
      ...columns
    })
    .select()
    .single();
  if (error) throw error;
  return toResultJson(data);
}

module.exports = { upsertResult };
