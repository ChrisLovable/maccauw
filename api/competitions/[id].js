const supabase = require('../../lib/supabase');

module.exports = async (req, res) => {
  const id = parseInt(req.query.id);

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('competitions').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.setHeader('Allow', 'DELETE');
  res.status(405).json({ error: 'Method not allowed' });
};
