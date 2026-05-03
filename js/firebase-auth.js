// js/firebase-auth.js
// 배포 시 GitHub Actions에 의해 실제 값으로 교체됩니다.
const firebaseConfig = __FIREBASE_CONFIG__;

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const FB_AUTH = {
  currentUser: null,

  init() {
    auth.onAuthStateChanged(async (user) => {
      this.currentUser = user;
      if (user) {
        console.log('Firebase: User logged in:', user.displayName);
        await this.syncInterestsFromCloud();
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
      const interests = JSON.parse(localStorage.getItem('dart_interests') || '[]');
      await db.collection('users').doc(this.currentUser.uid).set({
        interests: interests,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log('Firebase: Interests synced to cloud');
    } catch (error) {
      console.error('Cloud sync failed:', error);
    }
  },

  // 클라우드 데이터를 로컬로 불러오기
  async syncInterestsFromCloud() {
    if (!this.currentUser) return;
    try {
      const doc = await db.collection('users').doc(this.currentUser.uid).get();
      if (doc.exists && doc.data().interests) {
        const cloudInterests = doc.data().interests;
        localStorage.setItem('dart_interests', JSON.stringify(cloudInterests));
        console.log('Firebase: Interests loaded from cloud');
      }
    } catch (error) {
      console.error('Cloud load failed:', error);
    }
  }
};

FB_AUTH.init();
window.FB_AUTH = FB_AUTH;
