const store = require('./store');
const { toResultJson } = require('./format');

// scores is a partial object, e.g. { ata: 23 } or { dtl: 24, doubles: 47 }.
// Only the disciplines present in `scores` are written; others are left untouched.
async function upsertResult(competitionId, shooterName, shooterClass, scores = {}) {
  const columns = {};
  if (scores.ata !== undefined) columns.ata_score = scores.ata;
  if (scores.dtl !== undefined) columns.dtl_score = scores.dtl;
  if (scores.doubles !== undefined) columns.doubles_score = scores.doubles;

  const existing = store.findResult(competitionId, shooterName);

  if (existing) {
    const updated = store.updateResult(existing.id, {
      ...columns,
      shooter_class: shooterClass || existing.shooter_class,
      updated_at: new Date().toISOString()
    });
    return toResultJson(updated);
  }

  const created = store.createResult({
    competition_id: competitionId,
    shooter_name: shooterName,
    shooter_class: shooterClass || '',
    ...columns
  });
  return toResultJson(created);
}

module.exports = { upsertResult };
