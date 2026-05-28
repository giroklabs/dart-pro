# 📘 DART Pro 개발 및 운영 가이드

이 문서는 DART Pro 프로젝트의 배포 구조와 반복되는 설정 문제를 방지하기 위한 체크리스트를 담고 있습니다.

---

## 1. 프로젝트 구조 및 배포 경로
- **로컬 개발**: `/Users/greego/Desktop/dart pro`
- **운영 서버 (Ubuntu)**: `~/dart-pro-new`

### 🚀 주요 업데이트 이력 (2026-05-13)
#### 1. Firebase 푸시 알림 시스템 전면 안정화
- **직접 REST API 발송 엔진 도입**: `firebase-admin` SDK의 인증 버그 및 메모리 오염을 우회하기 위해 `google-auth-library`를 사용한 직접 REST API(HTTP v1) 전송 로직 구현.
- **iOS 토큰 정제 로직 강화**: iOS 클라이언트의 `Optional("...")` 래퍼와 Swift 로그 가공 문자를 정규식으로 완벽 제거하여 FCM API 규격 준수.
- **서버 시간 동기화**: 서버 시계 오차(8분 이상)로 인한 JWT 인증 실패(401)를 방지하기 위해 NTP 동기화 및 관리 가이드 추가.
- **APNs 통합 인증 키(.p8) 적용**: Sandbox/Production 환경 구분 없이 작동하는 통합 환경 인증 키로 교체하여 앱스토어 배포 버전의 알림 누락 해결.

> [!IMPORTANT]
> **FCM 푸시 알림 테스트는 반드시 앱스토어(Production) 앱으로 해야 합니다.**
> Xcode/TestFlight(개발) 앱은 Sandbox APNs 환경을 사용하므로, Production용 APNs 키로는 `THIRD_PARTY_AUTH_ERROR`가 발생합니다.
> → 개발 앱으로 테스트하려면 Firebase 콘솔에 **개발 APNs 인증 키**도 별도 등록 필요.

### 🚀 주요 업데이트 이력 (2026-05-07)

#### 1. QUICK 분석 엔진 강화 (Web & iOS)
- **추가 유형 (8종)**: 채권발행(일괄신고), 기업설명회(IR), 주주총회, 감자(자본감소), 기재정정, 이행결과(취득/처분), 사업확장(타법인출자/양수도), 배당일정(기준일).
- **반영 파일**: `js/pages/dashboard.js`, `QuickAnalysisManager.swift`.
- **웹 버전**: 캐시 무효화를 위해 `index.html`에서 `dashboard.js?v=1.12`로 버전 업데이트 필수.

#### 2. iOS UI/UX 개선
- **필터 칩 바**: 메인 화면 상단에 관심종목별 실시간 필터링 기능 추가.
- **로그인 버튼**: Google 로그인을 Apple 스타일(Black)로 통일하여 시각적 일관성 확보.
- **헤더 재배치**: 사용자 접근성을 위해 즐겨찾기(별) 버튼을 헤더 가장 왼쪽으로 이동.
- **설정 화면**: 계정 정보와 로그아웃 버튼 사이의 구분선을 제거하고 레이아웃 정돈.

#### 3. 알림 시스템 안정화
- **날짜 디코딩 수정**: Swift의 `.iso8601` 전략이 서버의 밀리초 형식을 파싱하지 못하는 버그를 커스텀 디코더로 해결.
- **서버 저장 로직**: FCM 전송 성공 여부와 관계없이 알림센터(DB)에는 항상 먼저 저장되도록 `server.js` 로직 개선.

#### 4. 앱 심사 대응 (Guideline 4.8 & 2.1a)
- **Apple 로그인**: 이미 구현 완료되었음을 확인 (SettingsView).
- **Google 로그인 튕김 현상**: Xcode의 **URL Types**에 `REVERSED_CLIENT_ID` 등록 누락이 원인. 신규 빌드 제출 시 반드시 해당 설정 포함 필수.

---

### 🛡️ 보안 관리 가이드 (중요)
- **GoogleService-Info.plist**: 절대 Git에 포함하지 말 것. 
  - 유출 시 `git rm --cached`로 인덱스에서 먼저 삭제 후 커밋해야 함.
  - 현재 `.gitignore`에 등록 완료되어 추적되지 않음.
- **환경 변수**: 운영 서버의 `.env` 경로는 `/home/ubuntu/dart-pro-new/.env`임. 수정 후 반드시 `pm2 restart all` 실행.
  ```text
  FIREBASE_API_KEY=your_web_api_key
  DART_API_KEY=your_dart_api_key
  GEMINI_API_KEY=your_gemini_api_key
  ```

---

## 2. 환경 변수 관리 (.env)
서버 실행에 필요한 민감한 정보는 `.env` 파일에 저장하며, 이 파일은 보안을 위해 Git 추적에서 제외됩니다.

- **위치**: `/home/ubuntu/dart-pro-new/.env` (서버 실행 루트)
- **필수 항목**:
  ```text
  FIREBASE_API_KEY=your_web_api_key
  DART_API_KEY=your_dart_api_key
  GEMINI_API_KEY=your_gemini_api_key
  ```

---

## 3. 주요 운영 명령어 (Ubuntu)

### 서버 정보
- **IP 주소**: `168.110.121.35`
- **사용자**: `ubuntu`
- **배포 경로**: `/home/ubuntu/dart-pro-new`
- **SSH 접속**: `ssh -i "path/to/key" ubuntu@168.110.121.35`

### 최신 코드 반영 (배포 - Mac 로컬 터미널 실행)
```bash
# 파일 전송 (Mac -> Server)
scp -i "path/to/key" "/Users/greego/Desktop/dart pro/server.js" ubuntu@168.110.121.35:/home/ubuntu/dart-pro-new/
scp -i "path/to/key" "/Users/greego/Desktop/dart pro/service-account.json" ubuntu@168.110.121.35:/home/ubuntu/dart-pro-new/

# 서버 재시작 (Server 접속 후 실행)
pm2 restart dart-pro
```

### 서버 시간 동기화 (인증 오류 방지)
```bash
sudo systemctl restart systemd-timesyncd  # 자동 동기화 서비스 재시작
date  # 현재 시간 확인 (한국 시간과 일치하는지 체크)
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

### Q3. AI 분석이 실패하거나 'Unknown' 500 에러가 발생합니다.
- **체크리스트**:
  1. **모델 버전 확인**: 구글 API 정책 변경으로 특정 모델(예: `1.5-flash`)이 중단될 수 있습니다. 현재 가장 안정적인 모델은 `gemini-2.5-flash`입니다.
  2. **요청 과부하 방지 (Chunking)**: `Promise.all`로 너무 많은 요청을 동시에 보내면 429(Too Many Requests) 또는 500 에러가 발생합니다. `dashboard.js`에서 `CHUNK_SIZE = 2`, `delay = 500ms`를 준수하세요.
  3. **에러 객체 구조**: 서버에서 에러 발생 시 반드시 `{ error: { message: "상세내용" } }` 구조로 응답해야 클라이언트에서 정확한 에러 원인을 파악할 수 있습니다.
  4. **디버그 로그**: 브라우저 콘솔에서 `[DEBUG] renderInsight` 로그를 통해 전송 데이터(기업명, 보고서명 등)의 유효성을 확인하세요.

---

## 5. 로컬 테스트 환경 구성 (보안 수칙)
운영 서버와 동일한 코드를 로컬에서 테스트할 때 다음을 주의하세요.

1. **Firebase Guard**: 로컬에 `service-account.json`이 없는 경우를 대비해, 서버 코드 내 `if (admin.apps.length > 0)` 체크를 통해 Firestore 관련 기능이 조건부 실행되도록 관리합니다.
2. **Key Check**: 로컬 테스트 시에도 반드시 `.env` 파일에 유효한 API 키들이 설정되어 있어야 AI 분석 기능을 테스트할 수 있습니다.

### Q4. FCM 알림 전송이 401(Unauthorized) 에러로 실패합니다.
- **체크리스트**:
  1. **서버 시간 확인**: `date` 명령어로 서버 시간이 현재 시간과 일치하는지 확인하세요. 5분 이상 차이 나면 구글 인증이 거부됩니다.
  2. **APNs 환경 설정**: 파이어베이스 콘솔에서 APNs 인증 키가 **`Sandbox & Production`** 통합 환경으로 생성되었는지 확인하세요. `Sandbox` 전용 키는 앱스토어 앱에 알림을 보낼 수 없습니다.
  3. **인증서 유출 및 무효화**: 비공개 키가 외부에 노출되면 구글이 자동으로 무효화합니다. 이 경우 파이어베이스 콘솔에서 새 키를 발급받아 교체해야 합니다.
  4. **직접 전송 로그**: `server.js`의 `sendFcmDirect` 함수를 통해 전송되는 로그에서 구글이 반환하는 구체적인 에러 사유(예: `BadEnvironmentKeyInToken`)를 확인하세요.

### Q5. 502 Bad Gateway 에러가 나타납니다.
- **원인**: 백엔드 포트(기본 `3002`)와 Nginx 설정 파일(`/etc/nginx/sites-available/dartpro`) 내 `proxy_pass` 포트가 일치하지 않는 경우 발생합니다.
- **해결**:
  1. 원격 서버 `.env`의 `PORT`가 `3002`인지 확인하고, Nginx 설정의 `proxy_pass`도 `http://localhost:3002;`로 동일한 포트를 가리키는지 점검하세요.
  2. Nginx 설정을 수정했다면 `sudo systemctl reload nginx`를 잊지 말고 실행하세요.

---

## 5. 보안 수칙
1. **GoogleService-Info.plist & service-account.json**: 절대로 GitHub에 푸시하지 마세요. (`git rm --cached` 활용)
2. **Key Rotation**: 키가 노출되었다고 판단되면 즉시 파이어베이스 콘솔에서 키를 삭제하고 새 키를 발급받아 서버에 반영하세요.
3. **P8 인증 키 관리**: APNs 인증 시 .p12 인증서 대신 **.p8 인증 키**를 사용하면 만료일 걱정 없이 운영할 수 있습니다.
