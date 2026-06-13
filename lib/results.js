const supabase = require('./supabase');
const { toResultJson } = require('./format');

async function upsertResult(competitionId, shooterName, shooterClass, total) {
  const { data: existing } = await supabase
    .from('results')
    .select('*')
    .eq('competition_id', competitionId)
    .ilike('shooter_name', shooterName)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('results')
      .update({
        total,
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
    .insert({ competition_id: competitionId, shooter_name: shooterName, shooter_class: shooterClass || '', total })
    .select()
    .single();
  if (error) throw error;
  return toResultJson(data);
}

module.exports = { upsertResult };
