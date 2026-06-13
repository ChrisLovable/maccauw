const ExcelJS = require('exceljs');
const supabase = require('../../lib/supabase');
const { maxScoreFor } = require('../../lib/disciplines');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { competitionId } = req.body;

    const { data: comp, error: compErr } = await supabase
      .from('competitions')
      .select('*')
      .eq('id', competitionId)
      .maybeSingle();
    if (compErr) throw compErr;
    if (!comp) return res.status(404).json({ error: 'Competition not found' });

    const { data: compResults, error: resErr } = await supabase
      .from('results')
      .select('*')
      .eq('competition_id', competitionId)
      .order('total', { ascending: false });
    if (resErr) throw resErr;

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

    const maxScore = comp.max_score || maxScoreFor(comp.discipline);

    compResults.forEach((r, i) => {
      const row = sheet.addRow([i + 1, r.shooter_name, r.shooter_class || '-', r.total, maxScore]);
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
};
