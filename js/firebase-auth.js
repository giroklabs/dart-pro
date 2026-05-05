// js/firebase-auth.js
async function initFirebase() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    
    if (!config.apiKey) throw new Error('Firebase Config load failed');
    
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
  isPremium: false,
  currentUser: null,
  _unsubscribe: null,

  init() {
    auth().onAuthStateChanged(async (user) => {
      this.currentUser = user;
      if (user) {
        console.log('Firebase: User logged in:', user.displayName);
        this.syncInterestsFromCloud();
      } else {
        this.isPremium = false;
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
      alert('로그인에 실패했습니다.');
    }
  },

  async logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      await auth().signOut();
      location.reload();
    }
  },

  async saveInterestsToCloud() {
    if (!this.currentUser) return;
    try {
      const corpCodes = window.DART_API.getWatchlist();
      await db().collection('users').doc(this.currentUser.uid).set({
        interests: corpCodes,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log('Firebase: Interests synced to cloud successfully');
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
          this.isPremium = data.isPremium === true;
          
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
