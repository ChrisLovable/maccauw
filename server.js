require('dotenv').config();
const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const ExcelJS = require('exceljs');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory store (replace with Supabase in Phase 2)
let competitions = [];
let results = [];
let nextCompId = 1;
let nextResultId = 1;

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

function upsertResult({ competitionId, shooterName, shooterClass, total }) {
  const existing = results.find(r =>
    r.competitionId === competitionId &&
    r.shooterName.toLowerCase() === shooterName.toLowerCase()
  );
  if (existing) {
    existing.total = total;
    existing.shooterClass = shooterClass || existing.shooterClass;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }
  const result = {
    id: nextResultId++,
    competitionId,
    shooterName,
    shooterClass: shooterClass || '',
    total,
    createdAt: new Date().toISOString()
  };
  results.push(result);
  return result;
}

// ── Health check ────────────────────────────────────────────────────────────
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ── Competitions ────────────────────────────────────────────────────────────
app.get('/api/competitions', (req, res) => {
  res.json([...competitions].sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/competitions', (req, res) => {
  const { name, date, discipline, maxScore } = req.body;
  if (!name || !date || !discipline) return res.status(400).json({ error: 'name, date, discipline required' });
  const comp = {
    id: nextCompId++,
    name,
    date,
    discipline,
    maxScore: maxScore || maxScoreFor(discipline),
    createdAt: new Date().toISOString()
  };
  competitions.push(comp);
  res.json(comp);
});

app.delete('/api/competitions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  competitions = competitions.filter(c => c.id !== id);
  results = results.filter(r => r.competitionId !== id);
  res.json({ ok: true });
});

// ── Results ─────────────────────────────────────────────────────────────────
app.get('/api/results/:compId', (req, res) => {
  const compId = parseInt(req.params.compId);
  const compResults = results
    .filter(r => r.competitionId === compId)
    .sort((a, b) => b.total - a.total);
  compResults.forEach((r, i) => { r.rank = i + 1; });
  res.json(compResults);
});

app.post('/api/results', (req, res) => {
  const { competitionId, shooterName, shooterClass, total } = req.body;
  if (!competitionId || !shooterName || total === undefined) {
    return res.status(400).json({ error: 'competitionId, shooterName, total required' });
  }
  res.json(upsertResult({ competitionId, shooterName, shooterClass, total }));
});

app.put('/api/results/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = results.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  results[idx] = { ...results[idx], ...req.body, id };
  res.json(results[idx]);
});

app.delete('/api/results/:id', (req, res) => {
  const id = parseInt(req.params.id);
  results = results.filter(r => r.id !== id);
  res.json({ ok: true });
});

// ── Scan: Claude Vision reads up to 4 photos of a scorecard ──────────────────
app.post('/api/scan', upload.array('photos', 4), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' });
    }

    const content = [{
      type: 'text',
      text: `You are reading 1-4 photos of a clay target shooting scorecard from Maccauw Clay Target Club. The photos may show different parts of the same scorecard, or multiple scorecards from the same competition — treat them together as one combined record.

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
}`
    }];

    for (const file of req.files) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: file.mimetype || 'image/jpeg', data: file.buffer.toString('base64') }
      });
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
});

// ── Confirm scan: find-or-create competition, then save all shooter scores ───
app.post('/api/scan/confirm', (req, res) => {
  const { competition, shooters } = req.body;
  if (!competition || !competition.name || !competition.date || !competition.discipline) {
    return res.status(400).json({ error: 'Competition name, date and discipline are required' });
  }
  if (!Array.isArray(shooters) || shooters.length === 0) {
    return res.status(400).json({ error: 'At least one shooter is required' });
  }

  let comp = competitions.find(c =>
    c.name.toLowerCase() === competition.name.toLowerCase() &&
    c.date === competition.date &&
    c.discipline.toLowerCase() === competition.discipline.toLowerCase()
  );

  if (!comp) {
    comp = {
      id: nextCompId++,
      name: competition.name,
      date: competition.date,
      discipline: competition.discipline,
      maxScore: competition.maxScore || maxScoreFor(competition.discipline),
      createdAt: new Date().toISOString()
    };
    competitions.push(comp);
  }

  const saved = shooters
    .filter(s => s.name && s.name.trim() && s.total !== undefined && s.total !== null && s.total !== '')
    .map(s => upsertResult({
      competitionId: comp.id,
      shooterName: s.name.trim(),
      shooterClass: s.class || '',
      total: Number(s.total)
    }));

  res.json({ competition: comp, saved: saved.length });
});

// ── Excel Export ───────────────────────────────────────────────────────────
app.post('/api/export/excel', async (req, res) => {
  try {
    const { competitionId } = req.body;
    const comp = competitions.find(c => c.id === competitionId);
    if (!comp) return res.status(404).json({ error: 'Competition not found' });

    const compResults = results
      .filter(r => r.competitionId === competitionId)
      .sort((a, b) => b.total - a.total);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Maccauw Clay Target Club';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Results');

    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = 'MACCAUW KLEITEIKENKLUB / CLAY TARGET CLUB';
    sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells('A2:E2');
    sheet.getCell('A2').value = `${comp.discipline} — ${comp.name} — ${new Date(comp.date).toLocaleDateString('af-ZA')}`;
    sheet.getCell('A2').font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16213E' } };
    sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 22;

    const headerRow = sheet.addRow(['Rank', 'Name', 'Class', 'Score', 'Out of']);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FF1A1A2E' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4AF37' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF1A1A2E' } } };
    });

    const maxScore = comp.maxScore || maxScoreFor(comp.discipline);

    compResults.forEach((r, i) => {
      const row = sheet.addRow([i + 1, r.shooterName, r.shooterClass || '-', r.total, maxScore]);
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(5).alignment = { horizontal: 'center' };
      if (i % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
        });
      }
      if (i === 0) row.getCell(2).font = { bold: true, color: { argb: 'FFD4AF37' } };
      if (i === 1) row.getCell(2).font = { bold: true, color: { argb: 'FF808080' } };
      if (i === 2) row.getCell(2).font = { bold: true, color: { argb: 'FFCD7F32' } };
    });

    sheet.getColumn(1).width = 8;
    sheet.getColumn(2).width = 28;
    sheet.getColumn(3).width = 10;
    sheet.getColumn(4).width = 10;
    sheet.getColumn(5).width = 10;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Maccauw_${comp.discipline.replace(/ /g, '_')}_${comp.date}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Maccauw Scorer running on http://localhost:${PORT}`));
