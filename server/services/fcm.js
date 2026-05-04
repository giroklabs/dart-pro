const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// 서비스 계정 키 파일 경로 (사용자가 직접 설정해야 함)
const serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');

if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath)
  });
  console.log('[FCM] Firebase Admin SDK initialized.');
} else {
  console.warn('[FCM] Warning: Firebase Service Account file not found at', serviceAccountPath);
  console.warn('[FCM] Push notifications will be disabled.');
}

const sendPushNotification = async (token, title, body, data = {}) => {
  if (!admin.apps.length) return;

  const message = {
    notification: { title, body },
    data,
    token: token
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('[FCM] Successfully sent message:', response);
    return response;
  } catch (error) {
    console.error('[FCM] Error sending message:', error);
    if (error.code === 'messaging/registration-token-not-registered') {
        // 토큰이 유효하지 않으면 나중에 제거하는 로직 필요
    }
  }
};

module.exports = { sendPushNotification };
