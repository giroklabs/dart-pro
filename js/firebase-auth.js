// js/firebase-auth.js
const firebaseConfig = {
  apiKey: "AIzaSyD2lBztuTHT8LuFtatYl8FOHstfZ1CAHS0",
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
      const corpCodes = window.DART_API.getWatchlist();
      await db.collection('users').doc(this.currentUser.uid).set({
        interests: corpCodes,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log('Firebase: Interests synced to cloud successfully');
    } catch (error) {
      console.error('Cloud sync failed:', error);
    }
  },

  // 클라우드 데이터를 로컬로 불러오기 (데이터 병합)
  async syncInterestsFromCloud() {
    if (!this.currentUser) return;
    try {
      const doc = await db.collection('users').doc(this.currentUser.uid).get();
      let cloudCodes = [];
      if (doc.exists) {
        const data = doc.data();
        this.isPremium = data.isPremium === true;
        if (data.interests) {
          cloudCodes = data.interests.map(i => {
            if (typeof i === 'object' && i !== null) return i.code || i.corp_code;
            return String(i);
          });
        }
      }
      const localCodes = window.DART_API.getWatchlist();
      const finalSet = new Set();
      [...cloudCodes, ...localCodes].forEach(code => {
        const c = String(code).trim();
        if (/^[0-9]{8}$/.test(c)) finalSet.add(c);
      });
      const mergedInterests = Array.from(finalSet);
      localStorage.setItem('dart_watchlist', JSON.stringify(mergedInterests));
      console.log('Firebase: Watchlist merged and cleaned');
    } catch (error) {
      console.error('Cloud load failed:', error);
    }
  }
};

FB_AUTH.init();
window.FB_AUTH = FB_AUTH;
