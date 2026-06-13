const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../lib/supabase');
const { toCompetitionJson } = require('../lib/format');
const { upsertResult } = require('../lib/results');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `You are reading 1-4 photos of clay target shooting scorecards from Maccauw Clay Target Club. Each photo shows a scorecard for ONE discipline from the same competition/event — different photos may cover different disciplines (ATA Trap, DTL, Doubles), or multiple photos may cover the same discipline's card.

For each photo:
1. Determine which discipline it shows:
   - "ata" — ATA Trap (single targets, commonly out of 25)
   - "dtl" — Down-The-Line / DTL (single targets, commonly out of 25)
   - "doubles" — any doubles event (ATA Trap Doubles, Universal Trench doubles, etc — commonly out of 50)
   Infer from labels, headings, and column layout.
2. Read every shooter row: name (often handwritten, sometimes cursive), class if shown (AA/A/B/C/D), and the final total score for that round (the TOTAL column, or a circled/boxed number).

Then MERGE all photos into ONE list of shooters:
- Match the same shooter across photos by name, allowing for minor handwriting/spelling variation (treat as the same person).
- For each shooter, populate "ata", "dtl", "doubles" with that shooter's score from the matching discipline's scorecard if present, otherwise null. A shooter who only appears on one card should have the other two fields as null.

SCORING NOTES:
- The scoring system often uses a running countdown: numbers in cells show hits remaining, and a diagonal slash (/) marks a hit.
- Pre-printed diagonal lines on the card template are not marks — ignore them.
- Only include shooters who have a name written. Skip blank rows.

Also extract:
- "competition": the name/title of the competition or event written on the card(s). If not visible, use null.
- "date": the date of the event, formatted as YYYY-MM-DD. If not visible, use null.

Return ONLY valid JSON, no markdown, no explanation:
{
  "competition": "string or null",
  "date": "YYYY-MM-DD or null",
  "shooters": [
    { "name": "string", "class": "string or null", "ata": 23, "dtl": null, "doubles": null, "confidence": "high" }
  ]
}`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.query.action === 'confirm') {
    return confirmScan(req, res);
  }
  return scanPhotos(req, res);
};

async function scanPhotos(req, res) {
  const { photos } = req.body;
  if (!Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: 'No photos provided' });
  }
  if (photos.length > 4) {
    return res.status(400).json({ error: 'Maximum 4 photos' });
  }

  try {
    const content = [{ type: 'text', text: PROMPT }];

    for (const photo of photos) {
      const match = /^data:(image\/\w+);base64,(.+)$/.exec(photo);
      if (!match) return res.status(400).json({ error: 'Invalid photo format' });
      content.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content }]
    });

    const raw = response.content[0].text.trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function confirmScan(req, res) {
  const { competition, shooters } = req.body;
  if (!competition || !competition.name || !competition.date) {
    return res.status(400).json({ error: 'Competition name and date are required' });
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
      .maybeSingle();
    if (findErr) throw findErr;

    if (existing) {
      comp = existing;
    } else {
      const { data, error } = await supabase
        .from('competitions')
        .insert({ name: competition.name, date: competition.date })
        .select()
        .single();
      if (error) throw error;
      comp = data;
    }

    let saved = 0;
    for (const s of shooters) {
      if (!s.name || !s.name.trim()) continue;
      const scores = {};
      if (s.ata !== undefined && s.ata !== null && s.ata !== '') scores.ata = Number(s.ata);
      if (s.dtl !== undefined && s.dtl !== null && s.dtl !== '') scores.dtl = Number(s.dtl);
      if (s.doubles !== undefined && s.doubles !== null && s.doubles !== '') scores.doubles = Number(s.doubles);
      if (Object.keys(scores).length === 0) continue;

      await upsertResult(comp.id, s.name.trim(), s.class || '', scores);
      saved++;
    }

    res.json({ competition: toCompetitionJson(comp), saved });
  } catch (err) {
    console.error('Confirm error:', err);
    res.status(500).json({ error: err.message });
  }
}
