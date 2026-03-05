# Apps Script Reservations Setup

## 1) 새 Google Sheet 생성
- 파일명 예시: `naru-reservations-db`
- 시트 2개 생성:
  - `Items`
  - `Loans`

헤더는 `Code.gs`가 자동 생성/보정합니다.

## 2) 새 Apps Script 프로젝트 생성
1. 스프레드시트에서 `확장 프로그램 > Apps Script`
2. 기본 코드를 지우고 [Code.gs](./Code.gs) 전체 붙여넣기
3. 저장

## 3) 웹앱 배포
1. `배포 > 새 배포`
2. 유형: `웹 앱`
3. 실행 사용자: `나`
4. 접근 권한: `링크가 있는 모든 사용자`
5. 배포 후 URL 복사

권장 URL 형식:
- `https://script.google.com/macros/s/.../exec`

## 4) 프론트 환경변수
`.env` 또는 배포 환경변수에 추가:

```bash
VITE_RESERVATION_API_URL=https://script.google.com/macros/s/XXXXXXXXXXXX/exec
```

## 5) 동작 확인
`예약` 탭에서:
- 학급(3-1~3-5), 물품명, 날짜, 교시(1~6) 입력 후 `예약 저장`
- `반납 체크`에서 항목별 `반납 완료`

예약 시 물품명이 `Items`에 없으면 자동으로 추가됩니다(`total_qty=1`).

## API actions
모두 `POST(form-urlencoded)` 사용.

### getInitData
- `action=getInitData`

### createLoan
- `action=createLoan`
- `className=3-2`
- `itemName=주사위`
- `date=2026-03-06`
- `periodStart=3`
- `periodEnd=5`

### returnLoan
- `action=returnLoan`
- `id=loan_...`

### getOpenLoans
- `action=getOpenLoans`
