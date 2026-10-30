# Presentations

공개 목록: https://jaeyeonkim.kr/presentations/
편집 목록: https://jaeyeonkim.kr/presentations/edit/

- `/presentations/260909-ahn/`: 안병학 교수님 졸업프로젝트 발표, 92쪽 보관본 복원.
- `/presentations/261103-yun/`: 윤재영 교수님 졸업프로젝트 발표, 새 구성.
- 개별 장표 편집 주소는 `/presentations/edit/260909-ahn/`, `/presentations/edit/261103-yun/`. 긴 예전 주소도 같은 발표를 열고 짧은 주소로 정리합니다. 저장 키와 자료 경로는 바꾸지 않습니다. 공개 화면에는 편집 UI가 없고 게시된 JSON만 읽습니다.
- 예전 형식의 발표 5개는 외부 링크로 유지합니다. 새 항목은 `app/catalog.ts`에 등록합니다.

## 목록 관리

`/presentations/edit/`에서 새 발표 2개와 예전 발표 링크 5개를 함께 관리합니다. ↕ 손잡이를 끌거나 ↑↓ 버튼으로 순서를 바꾸고, 공개/비공개 버튼으로 목록 표시 여부를 결정합니다. 제목을 누르면 새 발표는 장표 편집기로, 예전 발표는 기존 링크로 연결됩니다.

저장은 `presentation-catalog-draft-v1`이라는 별도 브라우저 키에 저장합니다. 게시하면 `public/decks/catalog.json`만 GitHub에 반영하며 장표나 이미지를 변경하지 않습니다. 공개 목록은 브라우저 초안을 읽지 않습니다. 목록 설정은 전체 항목이 한 번씩 들어 있는지 검사하고 읽기에 실패하면 공개 목록을 대신 만들어 노출하지 않습니다.

비공개는 이 목록과 새 형식의 공개 발표 화면에서 숨기는 기능입니다. 공개된 GitHub 저장소의 원본 파일 및 기존 외부 발표 링크에 로그인 보호를 추가하는 기능은 아닙니다. 공개 화면은 비공개 발표의 장표 JSON을 요청하지 않으며 편집 화면은 계속 접근할 수 있습니다.

## 저장·게시

**저장**은 발표별로 현재 브라우저에만 저장합니다. **게시**는 숨기지 않은 장표와 필요한 이미지를 `Recrude/presentation`의 `main`에 한 커밋으로 올립니다. Vercel 배포가 끝나면 공개 링크에 반영됩니다. 게시 중 동시 변경이 있으면 강제로 덮어쓰지 않고 재시도를 안내합니다.

온라인에서는 비밀번호로 로그인한 뒤 **게시**를 누르면 됩니다. 브라우저는 같은 도메인의 게시 API만 호출하며 GitHub 토큰을 입력하거나 보관하지 않습니다. 서버는 로그인 세션·Origin·전용 헤더를 확인하고, 등록된 발표의 장표·이미지·목록만 고정 저장소에 기록합니다. 소스 코드, 임의 경로, 브랜치 변경은 받지 않습니다.

Vercel presentation 프로젝트의 Production에만 `PRESENTATION_GITHUB_TOKEN` 비밀 환경변수를 설정합니다. 자격 증명은 서버에서만 사용하며 클라이언트 응답·로그·번들에 포함하지 않습니다. 교체 시에는 `Recrude/presentation`의 Contents 쓰기 권한만 있는 토큰을 권장합니다. 홈페이지 프로젝트에는 이 자격 증명이 필요하지 않습니다.

이미지는 2MiB 단위로 전송하고, 서버가 서명한 업로드 확인 정보와 SHA-256을 검사하여 원본 바이트 그대로 합칩니다. 파일당 최대 40MiB이며, 모든 장표와 이미지 참조를 한 커밋으로 게시합니다. 목록 내용이 기존 공개본과 같으면 커밋이나 재배포를 만들지 않습니다.

이 컴퓨터에서는 `npm run dev -- --host 127.0.0.1` 후 로컬 편집 페이지를 열면 현재 `gh` 로그인으로 게시합니다. 개발용 API도 같은 게시 검증을 사용하고, 루프백 Host·동일 Origin·전용 헤더만 허용합니다.

## 편집 로그인

관리 목록(`/presentations/edit/`)과 개별 장표 편집, 이전 주소 자료 가져오기, 캡처·게시 API는 Vercel Routing Middleware에서 비밀번호를 확인합니다. `jaeyeonkim.kr` 홈페이지와 원래 Vercel 앱 모두 동일한 서버 인증 모듈을 사용합니다. 공개 목록과 게시된 장표에는 로그인을 요구하지 않습니다.

비밀번호 평문은 저장소나 브라우저 번들에 넣지 않습니다. Vercel의 `PRESENTATION_AUTH` 비밀 환경변수에 PBKDF2-SHA256 검증값, salt, 세션 서명 키만 저장합니다. 로그인은 HTTPS POST로 처리하고 서명된 HttpOnly·Secure·SameSite 쿠키로 8시간 유지합니다. 로그인 화면과 편집 응답은 캐시하지 않습니다. 로그인 실패를 인스턴스별로 제한하며, 로그아웃은 세션 쿠키만 지우고 브라우저의 장표·사진·목록 저장값은 유지합니다.

`server/presentation-auth.mjs`와 `middleware.js`는 개인 홈페이지 저장소에도 동일하게 반영해야 합니다. 두 프로젝트의 인증 환경변수는 함께 관리합니다. 환경변수가 빠지면 편집 경로는 503으로 닫히고 공개 발표는 계속 열립니다. 로컬 `vite` 서버는 개인 개발용이며 미들웨어 검증은 인증 단위 테스트 및 실제 Vercel 배포에서 수행합니다.

## 기존 자료 보존

이전 `jaeyeon-slide-studio` IndexedDB의 `current`와 `images`는 그대로 유지합니다. 9월 9일 편집 페이지만 기존 `current`를 읽으며, 이후 저장은 `presentation:<slug>` 키를 사용합니다. 11월 3일 구성과 공개 화면은 기존 `current`를 읽지 않습니다.

도메인별 브라우저 저장은 자동으로 공유되지 않습니다. `jaeyeonkim.kr`의 9월 9일 편집 페이지에서 **추가 → 이전 Vercel 작업 가져오기**를 누르면 이전 Vercel 주소의 팝업이 같은 브라우저의 자료를 읽어 전달합니다. 양쪽에서 전송 origin과 팝업 출처를 제한합니다. 기존 자료가 없는 브라우저에서는 PDF 보관본에서 복원한 공개본으로 시작합니다. 복원 범위는 `docs/archive-source.md` 참고.

**추가 → 백업 내보내기/불러오기**로 사진까지 포함한 JSON을 다른 브라우저로 옮길 수 있습니다. 불러온 구성은 확인 후 저장 또는 게시하세요.

## 배포

기존 `Recrude/presentation` Vercel 앱을 유지합니다. Vite base는 `/presentations/`이며, 개인 홈페이지의 Vercel rewrite가 이 경로 전체를 앱으로 전달합니다. 주소창은 `jaeyeonkim.kr/presentations/…`를 유지합니다. `/presentation/` 목록은 새 목록으로 이동하고 과거 `/presentation/nmd02/` 등 개별 발표는 유지합니다.

`public/decks/<slug>/deck.json`은 매번 재검증하고, 내용 해시를 사용하는 업로드 이미지는 1년 캐시합니다. 공개 화면은 IndexedDB에 접근하지 않습니다. 영상은 해당 발표에 포함되어 있을 때만 미리 다운로드합니다.

## 검증

```sh
npm test
npm run build
# dev 서버 포트 3100에서 브라우저 검증
node scripts/verify-presentations.mjs
```

브라우저 검증은 공개/편집 분리, 기존 자료 보존, 발표별 저장 격리, 공개 스냅샷 독립성, 이미지 포함 원자적 게시, 동시 게시 충돌을 확인합니다. GitHub 쓰기 API는 모의 응답으로 검증하며 실제 저장소를 수정하지 않습니다.

---

포트폴리오 이미지 79장을 재정렬·숨김 처리하고 웹, 영상, 이미지 묶음을 추가하는 발표 도구.

## Vercel

이 저장소를 Import하고 Deploy하면 됩니다. `vercel.json`에 Vite, `npm run build`, 출력 폴더 `dist`, 캡처 함수 설정이 포함되어 있습니다. Node.js 22.x를 사용합니다. ChatGPT Sites나 Cloudflare 계정은 필요하지 않습니다.

## 사용

- 기본 배열은 작업 시작 시기순입니다. [확인한 시기와 원본 페이지](docs/chronology.md). 저장된 발표에는 **시기순** 버튼으로 적용할 수 있습니다.
- 카드를 드래그하거나 이동 버튼으로 순서를 변경합니다.
- 추가 → **포트폴리오 조판면 추가**: 완성된 JPG/PNG 등을 한 파일씩 한 슬라이드로 넣고 원본 비율로 표시합니다. 별도 여백이나 이미지 재배치 없이 원본 화면으로 표시합니다. 추가한 장표에는 쪽번호를 덧입히지 않습니다.
- 추가 → 이미지 선택: 여러 이미지를 검정 배경 한 장에 배치합니다. 비율과 원본 파일을 유지합니다.
- 저장: 현재 브라우저의 IndexedDB에 편집 내용을 저장합니다.
- 발표: 방향키로 이동, Esc로 종료. 영상 기본값은 음소거 자동 재생, 재생바가 표시됩니다.
- PDF: 숨김을 제외한 순서와 새 쪽번호로 인쇄 창을 엽니다. PDF로 저장하세요.

## PDF 임베드 미리보기

제공된 웹 3개와 영상의 캡처 파일을 `public/previews`에 포함했습니다. 웹은 1920×1080 첫 화면, 영상은 YouTube 미리보기 이미지입니다. PDF에서 이미지를 클릭하면 해당 웹이나 영상이 열립니다.

선택한 웹/영상의 **캡처 갱신**으로 새 이미지를 만들 수 있습니다. 로그인이나 사용자가 조작한 iframe의 현재 상태는 자동 캡처에 반영되지 않습니다. 이런 화면은 **캡처 이미지 지정**으로 직접 저장한 이미지를 넣으세요. 자동 캡처 실패 시 빈 PDF 페이지로 진행하지 않고 오류를 표시합니다.

서버 캡처는 `ved.kr`, `whatareyoudoingnow.vercel.app`, `jaeyeonkim.kr` 및 YouTube 영상 미리보기를 지원합니다. 다른 웹사이트는 Vercel 환경변수 `CAPTURE_ALLOWED_HOSTS`에 호스트를 쉼표로 구분해 추가하거나 캡처 파일을 직접 지정하세요. 외부로 공개된 HTTPS 주소만 허용합니다.

## 쪽번호

원본 3840×2716 좌표계의 숫자 영역만 가립니다. SF Pro Display Regular 숫자 윤곽을 SVG로 사용하므로 운영체제와 PDF에서 폰트 대체가 일어나지 않습니다. 원본 비교 기준: 중심 x=209, 베이스라인 y=135.5, 크기 46.5, Regular. 전체 폰트 파일은 배포하지 않습니다. `scripts/folio-outlines.py`는 macOS에 해당 폰트가 설치된 경우에만 재생성할 수 있으며 일반 빌드에는 필요하지 않습니다.

## 로컬 개발

```sh
npm ci
npm run dev
npm test
npm run build
```

macOS에서는 설치된 Google Chrome으로 캡처합니다. 다른 환경의 로컬 Chrome 경로는 `CHROME_EXECUTABLE_PATH`로 지정할 수 있습니다. Vercel에서는 포함된 서버용 Chromium을 사용합니다.

편집 데이터와 업로드한 이미지는 브라우저·도메인별 저장입니다. GitHub에는 기본 슬라이드와 코드가 올라가며, 이전 ChatGPT 사이트의 브라우저 저장 데이터는 새 Vercel 주소로 자동 이동하지 않습니다.

## 음향형태론 전시 영상

`/audio-morphology.html`은 영상만 보여주는 전용 페이지입니다. 검정 배경에서 화면 비율을 유지하며, 음소거 자동 재생으로 시작합니다. 기본 플레이어에서 소리를 켜거나 전체화면으로 전환할 수 있습니다.

발표 편집기에서는 **추가 → 음향형태론 전시 영상**으로 선택한 장 다음에 넣습니다. PDF에는 영상의 미리보기 프레임이 들어갑니다. YouTube나 외부 영상 서비스는 사용하지 않습니다.

### Image loading and cache

The editor uses 640px WebP thumbnails (1.52 MB total instead of 28.50 MB of original images). Presentation and PDF keep the full-resolution sources. The PDF image tree is mounted only during export. After opening the editor, two background requests at a time warm the visible original slides; the status shows progress and failures without blocking editing. Embedded websites and YouTube remain subject to their own network loading.

Vercel caches original images and local media for seven days, and content-hashed thumbnails for one year. Original image URLs carry a content hash so replacements bypass stale cached versions. After changing original assets, run `python3 scripts/prepare-slide-assets.py` (requires Pillow) to regenerate thumbnails and the source manifest. Saved deck IDs and source keys remain unchanged. Uploaded images are read in one IndexedDB transaction.

Run `node scripts/verify-loading.mjs` with the dev server on port 3100 to verify thumbnail selection, deferred PDF rendering, background warmup, and full-resolution PDF sources.

The exhibition video is downloaded in the background after the saved deck opens. `app/video-cache.ts` keeps the complete versioned MP4 in a separate Cache Storage cache and supplies a Blob URL for playback and seeking. The toolbar reports progress, completion, or retry. Saved deck data is never rewritten. Storage quota failures still allow playback from memory in the current tab; browser cache eviction requires another download. When replacing the MP4, update its hash and byte length in `video-cache.ts`. A video already playing keeps its source until it is reopened, avoiding playback resets when a download completes. Run `node scripts/verify-video-cache.mjs` against port 3100 to verify persistent cache and playback with video network requests blocked.
