// In-memory data store (no external database). Data resets on server restart.

let competitions = [];
let results = [];
let nextCompetitionId = 1;
let nextResultId = 1;

function withTotal(row) {
  return {
    ...row,
    total: (row.ata_score ?? 0) + (row.dtl_score ?? 0) + (row.doubles_score ?? 0)
  };
}

function listCompetitions() {
  return [...competitions].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function findCompetition(id) {
  return competitions.find(c => c.id === id);
}

function findCompetitionByNameDate(name, date) {
  return competitions.find(c => c.name.toLowerCase() === name.toLowerCase() && c.date === date);
}

function createCompetition({ name, date }) {
  const comp = { id: nextCompetitionId++, name, date, created_at: new Date().toISOString() };
  competitions.push(comp);
  return comp;
}

function deleteCompetition(id) {
  competitions = competitions.filter(c => c.id !== id);
  results = results.filter(r => r.competition_id !== id);
}

function listResults(competitionId) {
  return results
    .filter(r => r.competition_id === competitionId)
    .map(withTotal)
    .sort((a, b) => b.total - a.total);
}

function findResult(competitionId, shooterName) {
  return results.find(r => r.competition_id === competitionId && r.shooter_name.toLowerCase() === shooterName.toLowerCase());
}

function createResult(data) {
  const row = {
    id: nextResultId++,
    competition_id: data.competition_id,
    shooter_name: data.shooter_name,
    shooter_class: data.shooter_class || '',
    ata_score: data.ata_score ?? null,
    dtl_score: data.dtl_score ?? null,
    doubles_score: data.doubles_score ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  results.push(row);
  return withTotal(row);
}

function updateResult(id, updates) {
  const row = results.find(r => r.id === id);
  if (!row) return null;
  Object.assign(row, updates);
  return withTotal(row);
}

function deleteResult(id) {
  results = results.filter(r => r.id !== id);
}

module.exports = {
  listCompetitions, findCompetition, findCompetitionByNameDate, createCompetition, deleteCompetition,
  listResults, findResult, createResult, updateResult, deleteResult
};
