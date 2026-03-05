# Google Drive Archive (2026 나루초 3학년 연구실)

구글 앱스 스크립트 웹앱 API를 호출해 과목 > 단원 > 차시 구조로 수업 자료를 탐색하는 React + Vite 웹앱입니다.

## 실행

```bash
npm install
npm run dev
```

## 환경 변수

`.env` 파일에 아래 값을 설정하세요.

```bash
VITE_API_URL=https://script.google.com/macros/s/AKfycbzONOmQfiiuOEn7_jeOChPkzS-_qAsuFfMDreUs3o43OLOF6e8GezyDny8yqtL_TUBR6Q/exec
```

## 테스트 / 빌드

```bash
npm run test:run
npm run build
```

## GitHub Pages 배포

이 저장소에는 GitHub Actions 기반 Pages 배포 워크플로우가 포함되어 있습니다.

1. GitHub 저장소에 코드를 push
2. 저장소 Settings > Pages > Build and deployment 에서 Source를 `GitHub Actions`로 설정
3. `master` 브랜치 push 시 자동 배포

배포 URL 형식:

`https://<github-username>.github.io/<repo-name>/`
