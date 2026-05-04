const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const USER_DATA_FILE = path.join(__dirname, '../data/user_watchlist.json');

// 구독 등록 (FCM 토큰 + 종목 코드 + UID)
router.post('/register', (req, res) => {
  const { token, corp_codes, uid } = req.body;

  if (!token || !Array.isArray(corp_codes)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  try {
    // 1. FCM 구독 정보 저장 (polling용)
    let subs = {};
    if (fs.existsSync(SUBS_FILE)) {
      subs = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
    }

    // 토큰 중복 방지 처리
    for (const code in subs) {
      subs[code] = subs[code].filter(t => t !== token);
    }

    corp_codes.forEach(code => {
      if (!subs[code]) subs[code] = [];
      subs[code].push(token);
    });
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));

    // 2. UID 기반 관심 종목 저장 (웹 동기화용)
    if (uid) {
      let userData = {};
      if (fs.existsSync(USER_DATA_FILE)) {
        userData = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf8'));
      }
      userData[uid] = corp_codes;
      fs.writeFileSync(USER_DATA_FILE, JSON.stringify(userData, null, 2));
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UID 기반 관심 종목 조회
router.get('/watchlist', (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: 'UID required' });

  try {
    if (fs.existsSync(USER_DATA_FILE)) {
      const userData = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf8'));
      return res.json(userData[uid] || []);
    }
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
