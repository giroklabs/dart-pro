const express = require('express');
const axios = require('axios');
const router = express.Router();

const fs = require('fs');
const path = require('path');
const DART_BASE_URL = 'https://opendart.fss.or.kr/api';

// 기업 코드 데이터 로드 (root의 corps.json 사용)
let corps = [];
try {
  const corpsPath = path.join(__dirname, '../../corps.json');
  if (fs.existsSync(corpsPath)) {
    corps = JSON.parse(fs.readFileSync(corpsPath, 'utf8'));
  }
} catch (e) {
  console.error('corps.json 로드 실패:', e);
}

// 기업 검색 API
router.get('/search', (req, res) => {
  const { query } = req.query;
  if (!query || query.length < 2) return res.json([]);
  
  const results = corps
    .filter(c => c.name.includes(query) || c.code.includes(query))
    .slice(0, 20)
    .map(c => ({ name: c.name, code: c.code }));
    
  res.json(results);
});

// 공통 프록시 핸들러
router.get('/:endpoint', async (req, res, next) => {
  try {
    const { endpoint } = req.params;
    const apiKey = process.env.DART_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: { message: '서버에 DART API 키가 설정되지 않았습니다.' } });
    }

    // 클라이언트가 보낸 쿼리 파라미터에서 DART용 파라미터 구성
    const params = {
      crtfc_key: apiKey,
      ...req.query
    };

    // DART API 호출
    const dartUrl = `${DART_BASE_URL}/${endpoint}`;
    
    // axios 설정: 문서 원본 등 XML/바이너리가 올 수 있으므로 responseType은 기본적으로 처리하지 않고 통과시킴
    // 하지만 list.json 등은 json으로 받음. 편의상 axios의 자동 변환 활용.
    const response = await axios.get(dartUrl, {
      params,
      responseType: endpoint.endsWith('.xml') || endpoint.endsWith('.zip') ? 'arraybuffer' : 'json'
    });

    // Content-Type 그대로 전달
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }

    if (Buffer.isBuffer(response.data)) {
      res.send(response.data);
    } else {
      res.json(response.data);
    }

  } catch (error) {
    if (error.response) {
      res.status(error.response.status).send(error.response.data);
    } else {
      next(error);
    }
  }
});

module.exports = router;
