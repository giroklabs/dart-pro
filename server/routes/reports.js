const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// lean_engine.db 파일 경로 (server 디렉토리 기준 부모 폴더 내 lean_engine 안)
const dbPath = path.resolve(__dirname, '../../lean_engine/lean_engine.db');

// DB 연결 헬퍼 함수
function getDbConnection() {
  return new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('Error opening database', err.message);
    }
  });
}

// GET /api/reports - 리포트 목록 조회
router.get('/', (req, res) => {
  const db = getDbConnection();
  
  // 리스트 조회이므로 content 제외하고 최신순 조회
  const query = `
    SELECT report_id as id, category, corp_name, title, summary, publish_date 
    FROM ai_reports 
    ORDER BY report_id DESC 
    LIMIT 20
  `;
  
  db.all(query, [], (err, rows) => {
    db.close();
    if (err) {
      console.error('Error fetching reports:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch reports' });
    }
    res.json({ success: true, data: rows });
  });
});

// GET /api/reports/:id - 개별 리포트 상세 조회
router.get('/:id', (req, res) => {
  const reportId = req.params.id;
  const db = getDbConnection();
  
  const query = `
    SELECT report_id as id, category, corp_name, title, summary, content, publish_date 
    FROM ai_reports 
    WHERE report_id = ?
  `;
  
  db.get(query, [reportId], (err, row) => {
    db.close();
    if (err) {
      console.error('Error fetching report detail:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch report detail' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }
    res.json({ success: true, data: row });
  });
});

module.exports = router;
