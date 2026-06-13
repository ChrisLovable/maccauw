const Anthropic = require('@anthropic-ai/sdk');
const { maxScoreFor } = require('../lib/disciplines');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `You are reading 1-4 photos of a clay target shooting scorecard from Maccauw Clay Target Club. The photos may show different parts of the same scorecard, or multiple scorecards from the same competition — treat them together as one combined record.

From the scorecard(s), determine:
1. "competition": the name/title of the competition or event written on the card (e.g. "Club Monthly Shoot", "President's Trophy"). If not visible, use null.
2. "date": the date of the event, formatted as YYYY-MM-DD. If not visible, use null.
3. "discipline": the shooting discipline printed or written on the card (e.g. "ATA Trap", "ATA Trap Doubles", "NSSA Skeet", "NSSA Skeet Doubles", "Universal Trench", "DTL"). Infer from labels, column counts, and layout.
4. "maxScore": the total number of targets for the round, as shown on the card (commonly 25 or 50).
5. "shooters": every shooter row across the card(s), each with:
   - "name": the shooter's name (handwritten, often cursive)
   - "class": shooting class if shown (AA/A/B/C/D), else null
   - "total": final score for the round (a number from 0 to maxScore)
   - "confidence": "high", "medium", or "low" based on how legible the entry is

SCORING NOTES:
- Each row is one shooter. Target columns are numbered across the top.
- The scoring system often uses a running countdown: numbers in cells show hits remaining, and a diagonal slash (/) marks a hit.
- The TOTAL column on the right (or a circled/boxed number) shows the final score for the round.
- Pre-printed diagonal lines on the card template are not marks — ignore them.
- Only include shooters who have a name written. Skip blank rows.

Return ONLY valid JSON, no markdown, no explanation:
{
  "competition": "string or null",
  "date": "YYYY-MM-DD or null",
  "discipline": "string or null",
  "maxScore": 25,
  "shooters": [
    { "name": "string", "class": "string or null", "total": 21, "confidence": "high" }
  ]
}`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    if (!parsed.maxScore) parsed.maxScore = maxScoreFor(parsed.discipline);

    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: err.message });
  }
};
