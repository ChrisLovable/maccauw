const store = require('../lib/store');
const { toCompetitionJson } = require('../lib/format');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.json(store.listCompetitions().map(toCompetitionJson));
  }

  if (req.method === 'POST') {
    const { name, date } = req.body;
    if (!name || !date) {
      return res.status(400).json({ error: 'name and date required' });
    }
    const comp = store.createCompetition({ name, date });
    return res.json(toCompetitionJson(comp));
  }

  if (req.method === 'DELETE') {
    const id = parseInt(req.query.id);
    if (!id) return res.status(400).json({ error: 'id required' });
    store.deleteCompetition(id);
    return res.json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  res.status(405).json({ error: 'Method not allowed' });
};
