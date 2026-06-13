function toCompetitionJson(row) {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    discipline: row.discipline,
    maxScore: row.max_score,
    createdAt: row.created_at
  };
}

function toResultJson(row) {
  return {
    id: row.id,
    competitionId: row.competition_id,
    shooterName: row.shooter_name,
    shooterClass: row.shooter_class || '',
    total: row.total,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = { toCompetitionJson, toResultJson };
