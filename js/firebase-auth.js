// js/firebase-auth.js
// 배포 시 GitHub Actions에 의해 실제 값으로 교체됩니다.
const firebaseConfig = __FIREBASE_CONFIG__;

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
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
      // 사이드바 및 UI 갱신을 위한 커스텀 이벤트 발생
      document.dispatchEvent(new CustomEvent('auth-changed', { detail: user }));
    });
  },

  async login() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(provider);
    } catch (error) {
      console.error('Login failed:', error);
      alert('로그인에 실패했습니다. (팝업 차단 여부를 확인해 주세요)');
    }
  },

  async logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      await auth.signOut();
      location.reload();
    }
  },

  // 로컬 데이터를 클라우드에 강제 동기화 (관심종목 추가/삭제 시 호출용)
  async saveInterestsToCloud() {
    if (!this.currentUser) return;
    try {
      const interests = JSON.parse(localStorage.getItem('dart_watchlist') || '[]');
      const corpCodes = interests.map(i => i.code);

      // 1. Firestore 저장 (기존 방식 유지)
      await db.collection('users').doc(this.currentUser.uid).set({
        interests: interests,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log('Firebase: Interests synced to Firestore');

      // 2. Node.js 서버 동기화 (앱과 공유)
      const BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') 
                          ? 'http://localhost:3000' : 'https://dartpro.duckdns.org';
      
      await fetch(`${BACKEND_URL}/api/push/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: this.currentUser.uid,
          corp_codes: corpCodes,
          token: 'WEB_USER' // 웹은 푸시 토큰이 없으므로 식별자만 전송
        })
      });
      console.log('Firebase: Interests synced to Node.js Backend');

    } catch (error) {
      console.error('Cloud sync failed:', error);
    }
  },

  // 클라우드 및 Node.js 서버 데이터를 로컬로 불러오기 (데이터 병합)
  async syncInterestsFromCloud() {
    if (!this.currentUser) return;
    try {
      const BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') 
                          ? 'http://localhost:3000' : 'https://dartpro.duckdns.org';

      // 1. Firestore 데이터 가져오기
      const doc = await db.collection('users').doc(this.currentUser.uid).get();
      let cloudInterests = [];
      if (doc.exists) {
        this.isPremium = doc.data().isPremium === true;
        if (doc.data().interests) cloudInterests = doc.data().interests;
      }

      // 2. Node.js 서버 데이터 가져오기 (앱 동기화용)
      let nodeCodes = [];
      try {
        const res = await fetch(`${BACKEND_URL}/api/push/watchlist?uid=${this.currentUser.uid}`);
        if (res.ok) nodeCodes = await res.json();
      } catch (e) {
        console.warn('Node.js backend sync failed:', e);
      }
      
      // 3. 데이터 병합 (Firestore + Node.js + Local)
      let localInterests = JSON.parse(localStorage.getItem('dart_watchlist') || '[]');
      const mergedMap = new Map();
      
      // Firestore 데이터 우선
      cloudInterests.forEach(item => mergedMap.set(item.code, item));
      
      // Node.js 데이터 병합 (코드로만 되어 있으므로 이름 매핑 필요)
      for (const code of nodeCodes) {
        if (!mergedMap.has(code)) {
          const name = await window.DART_API.getCorpName(code);
          mergedMap.set(code, { code, name });
        }
      }

      // 로컬 데이터 병합
      localInterests.forEach(item => {
        if (!mergedMap.has(item.code)) mergedMap.set(item.code, item);
      });
      
      const mergedInterests = Array.from(mergedMap.values());
      localStorage.setItem('dart_watchlist', JSON.stringify(mergedInterests));
      console.log('Firebase: Interests merged from Firestore & Node.js Backend');
      
      if (mergedInterests.length > cloudInterests.length) {
        await this.saveInterestsToCloud();
      }
    } catch (error) {
      console.error('Cloud load failed:', error);
    }
  }
};

FB_AUTH.init();
window.FB_AUTH = FB_AUTH;
