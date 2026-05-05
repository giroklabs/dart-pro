const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Firebase Admin 초기화
const serviceAccount = require('./service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const USER_DATA_FILE = path.join(__dirname, 'data', 'user_watchlist.json');

async function migrate() {
  console.log('🚀 마이그레이션 시작...');
  
  if (!fs.existsSync(USER_DATA_FILE)) {
    console.log('✅ 마이그레이션 할 데이터가 없습니다 (user_watchlist.json 없음).');
    process.exit(0);
  }

  const userData = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf8'));
  let count = 0;

  for (const [uid, codes] of Object.entries(userData)) {
    if (!codes || codes.length === 0) continue;
    
    console.log(`[${uid}] ${codes.length}개 종목 마이그레이션 중...`);
    try {
      await db.collection('users').doc(uid).set({
        interests: codes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      count++;
    } catch (e) {
      console.error(`❌ [${uid}] 마이그레이션 실패:`, e.message);
    }
  }

  console.log(`🎉 총 ${count}명의 데이터가 Firestore로 성공적으로 이관되었습니다.`);
  process.exit(0);
}

migrate();
