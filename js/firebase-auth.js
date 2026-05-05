// js/firebase-auth.js
const firebaseConfig = {
  apiKey: "AIzaSyCuc9XCf3u0DWxke6LD2oXd2tlraACX4Es",
  authDomain: "dart-pro-26816.firebaseapp.com",
  projectId: "dart-pro-26816",
  storageBucket: "dart-pro-26816.firebasestorage.app",
  messagingSenderId: "184831339253",
  appId: "1:184831339253:web:f79382f532eb1be0ba73bc",
  measurementId: "G-7EWXBZJJGT"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firestore 통신 에러(CORS/Access Control) 해결을 위한 설정 추가
firebase.firestore().settings({
  experimentalForceLongPolling: true // 강제 롱폴링 설정
});
const auth = firebase.auth();
const db = firebase.firestore();

const FB_AUTH = {
  isPremium: false,

  init() {
    auth.onAuthStateChanged(async (user) => {
      this.currentUser = user;
      if (user) {
        console.log('Firebase: User logged in:', user.displayName);
        await this.syncInterestsFromCloud();
      } else {
        this.isPremium = false;
      }
      document.dispatchEvent(new CustomEvent('auth-changed', { detail: user }));
    });
  },

  async login() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(provider);
    } catch (error) {
      console.error('Login failed:', error);
      alert('로그인에 실패했습니다.');
    }
  },

  async logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      await auth.signOut();
      location.reload();
    }
  },

  // 로컬 데이터를 클라우드에 강제 동기화 (종목 추가/삭제 시 호출)
  async saveInterestsToCloud() {
    if (!this.currentUser) return;
    try {
      // api.js의 getWatchlist를 통해 정제된 코드 배열 가져오기
      const corpCodes = window.DART_API.getWatchlist();

      // 1. Firestore 저장 (문자열 배열로 저장)
      await db.collection('users').doc(this.currentUser.uid).set({
        interests: corpCodes,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // 2. Node.js 서버 동기화
      const BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') 
                          ? 'http://localhost:3000' : 'https://dartpro.duckdns.org';
      
      await fetch(`${BACKEND_URL}/api/push/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: this.currentUser.uid,
          corp_codes: corpCodes,
          token: 'WEB_USER'
        })
      });
      console.log('Firebase: Interests synced to cloud successfully');

    } catch (error) {
      console.error('Cloud sync failed:', error);
    }
  },

  // 클라우드 데이터를 로컬로 불러오기 (데이터 병합)
  async syncInterestsFromCloud() {
    if (!this.currentUser) return;
    try {
      const BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') 
                          ? 'http://localhost:3000' : 'https://dartpro.duckdns.org';

      // 1. Firestore 데이터 가져오기
      const doc = await db.collection('users').doc(this.currentUser.uid).get();
      let cloudCodes = [];
      if (doc.exists && doc.data().interests) {
        cloudCodes = doc.data().interests.map(i => {
          if (typeof i === 'object' && i !== null) return i.code || i.corp_code;
          return String(i);
        });
      }

      // 2. Node.js 서버 데이터 가져오기
      let nodeCodes = [];
      try {
        const res = await fetch(`${BACKEND_URL}/api/push/watchlist?uid=${this.currentUser.uid}`);
        if (res.ok) nodeCodes = await res.json();
      } catch (e) {
        console.warn('Node.js sync failed:', e);
      }
      
      // 3. 데이터 병합 및 정제
      const localCodes = window.DART_API.getWatchlist();
      const finalSet = new Set();
      
      // 8자리 숫자 형식만 엄격하게 필터링
      [...cloudCodes, ...nodeCodes, ...localCodes].forEach(code => {
        const c = String(code).trim();
        if (/^[0-9]{8}$/.test(c)) finalSet.add(c);
      });

      const mergedInterests = Array.from(finalSet);
      localStorage.setItem('dart_watchlist', JSON.stringify(mergedInterests));
      console.log('Firebase: Watchlist merged and cleaned');
      
      // 주의: 무한 루프 방지를 위해 여기서 자동 저장을 수행하지 않음
    } catch (error) {
      console.error('Cloud load failed:', error);
    }
  }
};

FB_AUTH.init();
window.FB_AUTH = FB_AUTH;
