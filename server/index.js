require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.json());

// 헬스 체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'DART Pro Backend Server is running.' });
});

// 라우터 연결
const dartRouter = require('./routes/dart');
const geminiRouter = require('./routes/gemini');
const pushRouter = require('./routes/push');

app.use('/api/dart', dartRouter);
app.use('/api/gemini', geminiRouter);
app.use('/api/push', pushRouter);

// 실시간 폴링 시작
const { startPolling } = require('./services/polling');
startPolling(5 * 60 * 1000); // 5분 주기

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: { message: err.message || '서버 오류가 발생했습니다.' } });
});

app.listen(port, () => {
  console.log(`DART Pro Backend listening at http://localhost:${port}`);
});
