## Classcard Match Auto-Clicker

클래스카드 매칭 게임(`https://www.classcard.net/Match/*`)에서 프롬프트 영역의 텍스트를 읽어, 두 개의 선택지 중 일치하는 항목을 자동으로 클릭합니다.

### 설치 방법 1: Tampermonkey 유저스크립트
- 브라우저에 Tampermonkey 확장 설치
- `userscripts/classcard-autoclick.user.js` 파일 내용을 새 유저스크립트로 추가/저장
- 매칭 게임 페이지 접속 시 자동 실행됩니다.
- 단축키: `Alt + M` 으로 시작/중지 토글

### 설치 방법 2: 북마클릿(Bookmarklet)
- 북마크를 하나 만들고, URL에 `bookmarklet/classcard-autoclick-bookmarklet.txt` 파일의 내용을 그대로 붙여넣습니다.
- 게임 페이지에서 해당 북마크를 클릭하면 시작/중지 토글 없이 자동 실행됩니다. (토글은 동일하게 `Alt + M` 동작)

### 동작 개요
- 프롬프트 선택자: `div[style*="font-size: 30px"][style*="overflow-wrap: break-word"]`
- 선택지 탐색: 프롬프트 인접 부모 → 상위 조상 → 전역 그룹 순서로 2개 후보를 찾습니다.
- 매칭 규칙: 완전 일치 → 부분 포함 → 간단 자카드 유사도(0.5 이상) 순으로 결정
- 클릭 전 강조(초록 테두리), 중앙 스크롤 후 클릭

### 팁
- 페이지 구조가 다르면 `OPTIONS_CONTAINER_SELECTOR`를 해당 컨테이너 셀렉터로 지정하면 더 견고합니다.
- 정규화 규칙은 공백/대소문자 중심입니다. 필요 시 구두점 제거 등을 추가할 수 있습니다.

### 주의사항
- 본 스크립트는 학습 편의를 위한 자동화 예시입니다. 서비스 약관을 준수해 사용하세요.


