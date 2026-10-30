# Presentations

공개 목록: https://jaeyeonkim.kr/presentations/
편집 목록: https://jaeyeonkim.kr/presentations/edit/

- `/presentations/2026-09-09-ahn-byunghak-graduation-project/`: 안병학 교수님 졸업프로젝트 발표, 92쪽 보관본 복원.
- `/presentations/2026-11-03-yoon-jaeyoung-graduation-project/`: 윤재영 교수님 졸업프로젝트 발표, 새 구성.
- 편집 주소는 `/presentations/edit/<slug>/`. 공개 화면에는 편집 UI가 없고 게시된 JSON만 읽습니다.
- 예전 형식의 발표 5개는 외부 링크로 유지합니다. 새 항목은 `app/catalog.ts`에 등록합니다.

## 저장·게시

**저장**은 발표별로 현재 브라우저에만 저장합니다. **게시 → 공개본 게시**는 숨기지 않은 장표와 필요한 이미지를 `Recrude/presentation`의 `main`에 한 커밋으로 올립니다. Vercel 배포가 끝나면 공개 링크에 반영됩니다. 게시 중 동시 변경이 있으면 강제로 덮어쓰지 않고 재시도를 안내합니다.

온라인 게시에는 GitHub fine-grained personal access token이 필요합니다. 저장소를 `Recrude/presentation`으로 제한하고 **Contents: Read and write** 권한을 지정하세요. 토큰은 입력한 탭의 메모리에서만 사용하며 GitHub API에 직접 전송합니다. localStorage/IndexedDB/서버/백업에는 저장하지 않고 게시 성공 시 지웁니다. 편집 페이지 자체는 로그인으로 잠그지 않았으며, 공개본 수정에는 GitHub 쓰기 권한이 반드시 필요합니다.

이 컴퓨터에서는 `npm run dev -- --host 127.0.0.1` 후 로컬 편집 페이지를 열면 현재 `gh` 로그인으로 게시합니다. 개발 전용 프록시는 루프백 Host, 동일 Origin, 사용자 정의 헤더와 고정 저장소의 Git API 경로만 허용하며 프로덕션에는 배포하지 않습니다.

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
