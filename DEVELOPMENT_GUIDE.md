# 📘 DART Pro 개발 및 운영 가이드

이 문서는 DART Pro 프로젝트의 배포 구조와 반복되는 설정 문제를 방지하기 위한 체크리스트를 담고 있습니다.

---

## 1. 프로젝트 구조 및 배포 경로
- **로컬 개발**: `/Users/greego/Desktop/dart pro`
- **운영 서버 (Ubuntu)**: `~/dart-pro-new` (최신 소스 기준 경로)
- **프론트엔드 호스팅**: GitHub Pages (`https://giroklabs.github.io/dart-pro/`)

> [!IMPORTANT]
> PM2로 서버를 실행할 때는 반드시 최신 소스 폴더(`~/dart-pro-new`)에서 실행 중인지 `pm2 show dart-pro` 명령어로 확인하세요.

---

## 2. 환경 변수 관리 (.env)
서버 실행에 필요한 민감한 정보는 `.env` 파일에 저장하며, 이 파일은 보안을 위해 Git 추적에서 제외됩니다.

- **위치**: `~/dart-pro-new/.env` (서버 실행 루트)
- **필수 항목**:
  ```text
  FIREBASE_API_KEY=your_web_api_key
  DART_API_KEY=your_dart_api_key
  GEMINI_API_KEY=your_gemini_api_key
  ```

---

## 3. 주요 운영 명령어 (Ubuntu)

### 최신 코드 반영 (배포)
```bash
cd ~/dart-pro-new
git fetch origin main
git reset --hard origin/main
npm install
pm2 restart all
```

### 서버 로그 확인 (디버깅)
```bash
pm2 logs dart-pro
```

---

## 4. 자주 발생하는 문제 해결 (Troubleshooting)

### Q1. 웹 사이트 로그인이 안 됩니다 (Firebase Init Error)
- **원인 1**: 서버의 `.env` 파일이 없거나 `FIREBASE_API_KEY`가 유효하지 않음.
- **원인 2**: `firebase-auth.js`에서 호출하는 주소가 상대 경로(`/api/config`)로 되어 있어 GitHub Pages에서 서버를 찾지 못함.
- **해결**: `firebase-auth.js`에서 `${BACKEND_URL}/api/config`와 같이 절대 경로를 사용 중인지 확인하세요.

### Q2. 코드를 수정했는데 브라우저에 반영이 안 됩니다.
- **원인**: GitHub Pages의 강력한 캐싱 정책 때문입니다.
- **해결**: `index.html`에서 JS 파일 호출 시 버전 번호를 올리세요 (예: `api.js?v=1.20`). 그 후 브라우저에서 `Ctrl + Shift + R`로 강력 새로고침하세요.

### Q3. AI 분석 결과가 'Unknown'으로 나옵니다.
- **원인**: Gemini 모델명(예: `gemini-1.5-flash`)이 구형이 되어 지원이 중단되었을 수 있습니다.
- **해결**: `node check_models.js`를 실행하여 현재 사용 가능한 최신 모델명을 확인하고 `server.js`를 업데이트하세요.

---

## 5. 보안 수칙
1. **GoogleService-Info.plist**: 절대로 GitHub에 푸시하지 마세요. (`git rm --cached` 활용)
2. **Key Rotation**: 키가 노출되었다고 판단되면 즉시 파이어베이스 콘솔에서 키를 삭제하고 새 키를 발급받아 서버 `.env`에 반영하세요.
