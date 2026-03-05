# Google Drive Archive (2026 나루초 3학년 연구실)

구글 앱스 스크립트 웹앱 API를 호출해 아래 기능을 제공하는 React + Vite 웹앱입니다.
- 홈: 학년 주요행사, 캘린더 일정
- 과목 자료: 과목 > 단원 > 차시 자료 탐색
- 예약: 물품 예약/반납 체크

## 실행

```bash
npm install
npm run dev
```

## 환경 변수

`.env` 파일에 아래 값을 설정하세요.

```bash
VITE_API_URL=https://script.google.com/macros/s/DRIVE_WEBAPP_ID/exec
VITE_EVENTS_API_URL=https://script.google.com/macros/s/EVENTS_WEBAPP_ID/exec
VITE_RESERVATION_API_URL=https://script.google.com/macros/s/RESERVATION_WEBAPP_ID/exec
VITE_ENABLE_MATERIALS_UPLOAD=false
VITE_MATERIALS_UPLOAD_API_URL=https://script.google.com/macros/s/DRIVE_UPLOAD_WEBAPP_ID/exec
```

## Apps Script 문서

- 이벤트/캘린더 API: [docs/apps-script-events/README.md](./docs/apps-script-events/README.md)
- 물품 예약 API: [docs/apps-script-reservations/README.md](./docs/apps-script-reservations/README.md)

## 테스트 / 빌드

```bash
npm run test:run
npm run build
```

## GitHub Pages 배포

이 저장소에는 GitHub Actions 기반 Pages 배포 워크플로우가 포함되어 있습니다.

1. GitHub 저장소에 코드 push
2. 저장소 `Settings > Pages > Build and deployment`에서 Source를 `GitHub Actions`로 설정
3. `master` 브랜치 push 시 자동 배포

배포 URL 형식:

`https://<github-username>.github.io/<repo-name>/`


## 과목 자료 업로드(A안)

- `VITE_ENABLE_MATERIALS_UPLOAD=true` 로 설정하면 과목 자료 화면에 `드라이브 업로드` 버튼이 표시됩니다.
- 롤백(즉시 끄기): `VITE_ENABLE_MATERIALS_UPLOAD=false` 로 변경 후 재배포하면 업로드 UI가 사라집니다.
- 업로드 API가 준비되지 않으면 화면에 실패 메시지가 표시됩니다.


