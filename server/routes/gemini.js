const express = require('express');
const axios = require('axios');
const router = express.Router();

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

router.post('/analyze', async (req, res, next) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: { message: '서버에 Gemini API 키가 설정되지 않았습니다.' } });
    }

    // TODO: Firebase Admin SDK를 통한 토큰 검증 및 Premium 유저 확인 (Auth Middleware 적용 예정)
    /*
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: '인증 토큰이 없습니다.' } });
    }
    const token = authHeader.split('Bearer ')[1];
    // verify token -> check isPremium -> if false, return 403 Forbidden
    */

    const { reportNm, corpName } = req.body;
    if (!reportNm || !corpName) {
      return res.status(400).json({ error: { message: '기업명과 공시제목이 필요합니다.' } });
    }

    // 모델 고정 (Flash 1.5)
    const modelId = 'gemini-1.5-flash';
    const url = `${GEMINI_BASE_URL}/models/${modelId}:generateContent?key=${apiKey}`;

    const prompt = `당신은 전문 주식 투자 분석가입니다. 다음 공시 정보를 바탕으로 투자자에게 도움이 될 만한 '인사이트 요약'과 '시장 영향력'을 한국어로 작성해 주세요. 
반드시 다음 JSON 형식으로만 응답하세요. **나 * 같은 마크다운 기호는 절대 사용하지 마세요.
{ "insight": "공시의 핵심 의미 요약", "impact": "긍정적/부정적/정보확인 중 하나", "points": ["포인트1", "포인트2", "포인트3"] }

공시 정보:
기업명: ${corpName}
공시제목: ${reportNm}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' }
    });

    res.json(response.data);

  } catch (error) {
    if (error.response) {
      // 429 처리
      if (error.response.status === 429) {
        return res.status(429).json({ error: { message: 'Gemini API 할당량을 초과했습니다.' } });
      }
      res.status(error.response.status).json(error.response.data);
    } else {
      next(error);
    }
  }
});

module.exports = router;
