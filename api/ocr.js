const Anthropic = require('@anthropic-ai/sdk');
const store = require('../lib/store');
const { toCompetitionJson } = require('../lib/format');
const { upsertResult } = require('../lib/results');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `You are reading 1-4 photos of clay target shooting scorecards from Maccauw Clay Target Club. Each photo shows a scorecard for ONE discipline from the same competition/event — different photos may cover different disciplines (ATA Trap, DTL, Doubles), or multiple photos may cover the same discipline's card.

SCORECARD LAYOUT:
Each card has two parts:
1. NAME SHEET — a left-hand column listing shooter names in numbered slots (1, 2, 3, 4, 5, 6, ...), with class (AA/A/B/C/D) often alongside.
2. SCORE SHEET — to the right, one numbered row per slot showing a COUNTDOWN of numbers across the row, followed by a printed TOTAL column/box at the end of the row.

Match shooters to score rows BY POSITION NUMBER: slot 1's name corresponds to row 1's score, slot 2 to row 2, and so on — not by visual proximity.

For each photo:
1. Determine which discipline it shows:
   - "ata" — ATA Trap (single targets, commonly out of 25)
   - "dtl" — Down-The-Line / DTL (single targets, commonly out of 25)
   - "doubles" — any doubles event (ATA Trap Doubles, Universal Trench doubles, etc — commonly out of 50)
   Infer from labels, headings, and column layout.
2. For each numbered row:
   - Read the shooter's name and class from the NAME SHEET at that position number.
   - COUNTDOWN SCORING: each row starts at the maximum for the discipline (25, or 50 for doubles), and the written number drops by 1 for each miss. A diagonal slash (/) marks a hit — for a hit, no new number is written and the previous written number still applies.
   - The shooter's final_score for THIS discipline is the LAST number actually written in the countdown sequence (reading left to right across the row), BEFORE the printed TOTAL column.
   - DO NOT read the printed TOTAL column/box on the score sheet — derive final_score only from the last countdown number written in the row.

Extract ATA, DTL and Doubles scores (each discipline's final_score, matched by position number) per shooter. IGNORE the printed TOTAL column completely — never extract it. The overall Totaal is always computed by the app as ATA + DTL + Doubles.

Then MERGE all photos into ONE list of shooters:
- Match the same shooter across photos first by position number, then confirm/refine using name (allowing for minor handwriting/spelling variation — treat as the same person).
- For each shooter, populate "ata", "dtl", "doubles" with that shooter's final_score from the matching discipline's scorecard if present, otherwise null. A shooter who only appears on one card should have the other two fields as null.

SCORING NOTES:
- Pre-printed diagonal lines on the card template are not marks — ignore them.
- Only include shooters who have a name written. Skip blank rows.
- Never read or report any "Totaal"/"Total" column value, on any sheet — totals are always computed by the app as ATA + DTL + Doubles (treating any missing discipline as 0).

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
    let comp = store.findCompetitionByNameDate(competition.name, competition.date);
    if (!comp) {
      comp = store.createCompetition({ name: competition.name, date: competition.date });
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
