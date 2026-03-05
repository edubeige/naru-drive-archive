# Apps Script Events Setup

## 1) 새 Google Sheet 생성
- 파일명 예시: `naru-events-db`
- 같은 스프레드시트 안에 시트 2개 생성:
  - `events_major`
  - `events_schedule`

헤더는 Apps Script가 자동으로 맞춥니다.

## 2) 새 Apps Script 프로젝트 생성
1. 스프레드시트에서 `확장 프로그램 > Apps Script`
2. 기본 코드를 지우고 `docs/apps-script-events/Code.gs` 내용 전체 붙여넣기
3. 저장

## 3) 웹앱 배포
1. `배포 > 새 배포`
2. 유형: `웹 앱`
3. 실행 사용자: `나`
4. 접근 권한: `링크가 있는 모든 사용자`
5. 배포 후 URL 복사

주의:
- `https://script.google.com/macros/s/.../exec` 형식 URL을 사용하세요.
- `https://script.google.com/a/macros/...` 형식은 GitHub Pages에서 CORS 문제가 날 수 있습니다.

## 4) 프론트 환경변수 설정
로컬 `.env` 또는 배포 환경 변수에 아래 추가:

```bash
VITE_EVENTS_API_URL=https://script.google.com/macros/s/XXXXXXXXXXXX/exec
```

기존 자료 API(`VITE_API_URL`)는 그대로 유지.

## 5) 동작 확인
홈 탭에서
- `학년 주요행사` 추가/삭제
- `일정 캘린더`에 날짜+행사명 추가

브라우저 새로고침 후에도 데이터 유지되면 성공.

## API payload 형식
프론트에서 `POST(form-urlencoded)`로 `action`과 필드를 전송합니다.

### getAll
- `action=getAll`

### addMajorEvent
- `action=addMajorEvent`
- `title=학부모 상담주간`

### removeMajorEvent
- `action=removeMajorEvent`
- `id=major_xxx`

### addScheduleEvent
- `action=addScheduleEvent`
- `date=2026-03-11`
- `title=학급 임원선거`

### removeScheduleEvent
- `action=removeScheduleEvent`
- `id=schedule_xxx`