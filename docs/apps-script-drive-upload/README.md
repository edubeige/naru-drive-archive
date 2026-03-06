# Apps Script Drive Upload Setup (A안)

## 1) 새 Apps Script 프로젝트 생성
1. 원하는 Google Sheet(또는 단독 Apps Script)에서 `확장 프로그램 > Apps Script`
2. 기본 코드 삭제 후 [Code.gs](./Code.gs) 전체 붙여넣기
3. `ROOT_FOLDER_ID`를 반드시 입력

`ROOT_FOLDER_ID` 예시:
- 드라이브 폴더 URL이 `https://drive.google.com/drive/folders/ABC123...` 이면
- `ROOT_FOLDER_ID = 'ABC123...'`

## 2) 웹앱 배포
1. `배포 > 새 배포`
2. 유형: `웹 앱`
3. 실행 사용자: `나`
4. 접근 권한: `링크가 있는 모든 사용자`
5. 배포 후 URL 복사 (`https://script.google.com/macros/s/.../exec`)

## 3) 프론트 환경변수

```bash
VITE_ENABLE_MATERIALS_UPLOAD=true
VITE_MATERIALS_UPLOAD_API_URL=https://script.google.com/macros/s/XXXXXXXXXXXX/exec
```

롤백(즉시 끄기):

```bash
VITE_ENABLE_MATERIALS_UPLOAD=false
```

## 4) 업로드 동작
- 과목 자료 탭에서 파일 선택 후 `드라이브 업로드`
- 프론트가 `action=uploadFile`, `targetPath`, `fileName`, `mimeType`, `fileBase64`를 전송
- Apps Script가 대상 폴더를 찾아 Drive에 파일 생성

## 5) 제한/주의
- 기본 최대 업로드 크기: `20MB` (`MAX_UPLOAD_MB`)
- Apps Script/브라우저 base64 전송 특성상 큰 파일은 느릴 수 있음
- 큰 파일(PPT 영상 등)은 기존처럼 Drive에서 직접 업로드 권장

