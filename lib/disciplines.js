const DEFAULT_MAX_SCORE = 25;

const DISCIPLINE_MAX_SCORES = {
  'ata trap': 25,
  'ata trap doubles': 50,
  'nssa skeet': 25,
  'nssa skeet doubles': 50,
  'universal trench': 25,
  'dtl': 25
};

function maxScoreFor(discipline) {
  if (!discipline) return DEFAULT_MAX_SCORE;
  return DISCIPLINE_MAX_SCORES[discipline.trim().toLowerCase()] || DEFAULT_MAX_SCORE;
}

module.exports = { maxScoreFor, DEFAULT_MAX_SCORE };
