const { upsertResult } = require('../../lib/results');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { competitionId, shooterName, shooterClass, total } = req.body;
  if (!competitionId || !shooterName || total === undefined) {
    return res.status(400).json({ error: 'competitionId, shooterName, total required' });
  }

  try {
    const result = await upsertResult(competitionId, shooterName.trim(), shooterClass, total);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
