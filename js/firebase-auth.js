// js/firebase-auth.js
async function initFirebase() {
  try {
    // api.js에 정의된 BACKEND_URL 사용 (없을 경우 로컬 기본값 사용)
    const baseUrl = typeof BACKEND_URL !== 'undefined' ? BACKEND_URL : '';
    const res = await fetch(`${baseUrl}/api/config`);
    const config = await res.json();
    
    if (!config.apiKey) throw new Error('Firebase Config load failed');
    
    console.log('[Firebase] Loaded API Key:', config.apiKey ? (config.apiKey.slice(0, 10) + '...') : 'None');
    firebase.initializeApp(config);
    
    // Firestore 설정
    firebase.firestore().settings({
      experimentalForceLongPolling: true 
    });
    
    FB_AUTH.init();
    window.FB_AUTH = FB_AUTH;
  } catch (err) {
    console.error('[Firebase] Init Error:', err);
  }
}

const auth = () => firebase.auth();
const db = () => firebase.firestore();

const FB_AUTH = {
  isPremium: true,
  currentUser: null,
  _unsubscribe: null,

  init() {
    auth().onAuthStateChanged(async (user) => {
      this.currentUser = user;
      if (user) {
        console.log('Firebase: User logged in:', user.displayName);
        this.syncInterestsFromCloud();
      } else {
        this.isPremium = true;
        if (this._unsubscribe) {
          this._unsubscribe();
          this._unsubscribe = null;
        }
      }
      document.dispatchEvent(new CustomEvent('auth-changed', { detail: user }));
    });
  },

  async login() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth().signInWithPopup(provider);
    } catch (error) {
      console.error('Login failed:', error);
      window.showToast('로그인에 실패했습니다.', 'error');
    }
  },
  
  async loginWithApple() {
    const provider = new firebase.auth.OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    try {
      await auth().signInWithPopup(provider);
    } catch (error) {
      console.error('Apple Login failed:', error);
      window.showToast(`애플 로그인 실패: [${error.code}] ${error.message}`, 'error');
    }
  },

  async logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      await auth().signOut();
      location.reload();
    }
  },

  async addInterestToCloud(corpCode) {
    if (!this.currentUser) return;
    try {
      await db().collection('users').doc(this.currentUser.uid).set({
        interests: firebase.firestore.FieldValue.arrayUnion(corpCode),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log(`Firebase: Interest ${corpCode} added to cloud successfully`);
    } catch (error) {
      console.error('Cloud sync failed:', error);
    }
  },

  async removeInterestFromCloud(corpCode) {
    if (!this.currentUser) return;
    try {
      await db().collection('users').doc(this.currentUser.uid).set({
        interests: firebase.firestore.FieldValue.arrayRemove(corpCode),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log(`Firebase: Interest ${corpCode} removed from cloud successfully`);
    } catch (error) {
      console.error('Cloud sync failed:', error);
    }
  },

  async clearInterestsInCloud() {
    if (!this.currentUser) return;
    try {
      await db().collection('users').doc(this.currentUser.uid).set({
        interests: [],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log('Firebase: Watchlist cleared in cloud successfully');
    } catch (error) {
      console.error('Cloud sync failed:', error);
    }
  },

  syncInterestsFromCloud() {
    if (!this.currentUser) return;
    if (this._unsubscribe) this._unsubscribe();

    this._unsubscribe = db().collection('users').doc(this.currentUser.uid)
      .onSnapshot((doc) => {
        if (doc.exists) {
          const data = doc.data();
          this.isPremium = true;
          
          let cloudCodes = [];
          if (data.interests) {
            cloudCodes = data.interests.map(i => String(i.code || i.corp_code || i));
          }

          const finalSet = new Set();
          cloudCodes.forEach(code => {
            if (/^[0-9]{8}$/.test(code.trim())) finalSet.add(code.trim());
          });

          const mergedInterests = Array.from(finalSet);
          const currentLocal = JSON.parse(localStorage.getItem('dart_watchlist') || '[]');
          
          if (JSON.stringify(currentLocal) !== JSON.stringify(mergedInterests)) {
            localStorage.setItem('dart_watchlist', JSON.stringify(mergedInterests));
            console.log('Firebase: Watchlist updated in real-time');
            document.dispatchEvent(new CustomEvent('watchlist-updated'));
          }
        }
      }, (error) => {
        console.error('Cloud listen failed:', error);
      });
  }
};

initFirebase();
