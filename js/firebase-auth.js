// js/firebase-auth.js
const firebaseConfig = {
  apiKey: "RESTRICTED_KEY_ON_SERVER",
  authDomain: "dart-pro-26816.firebaseapp.com",
  projectId: "dart-pro-26816",
  storageBucket: "dart-pro-26816.firebasestorage.app",
  messagingSenderId: "184831339253",
  appId: "1:184831339253:web:f79382f532eb1be0ba73bc",
  measurementId: "G-7EWXBZJJGT"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firestore 통신 에러 해결을 위한 설정
firebase.firestore().settings({
  experimentalForceLongPolling: true 
});

const auth = firebase.auth();
const db = firebase.firestore();

const FB_AUTH = {
  isPremium: false,
  currentUser: null,
  _unsubscribe: null,

  init() {
    auth.onAuthStateChanged((user) => {
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

  syncInterestsFromCloud() {
    if (!this.currentUser) return;
    if (this._unsubscribe) this._unsubscribe();

    this._unsubscribe = db.collection('users').doc(this.currentUser.uid)
      .onSnapshot((doc) => {
        if (doc.exists) {
          const data = doc.data();
          this.isPremium = data.isPremium === true;
          
          let cloudCodes = [];
          if (data.interests) {
            cloudCodes = data.interests.map(i => {
              if (typeof i === 'object' && i !== null) return i.code || i.corp_code;
              return String(i);
            });
          }

          const finalSet = new Set();
          cloudCodes.forEach(code => {
            const c = String(code).trim();
            if (/^[0-9]{8}$/.test(c)) finalSet.add(c);
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

FB_AUTH.init();
window.FB_AUTH = FB_AUTH;
