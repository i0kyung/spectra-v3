# 자산 출처 · 라이선스

## 캐릭터 아트 (v3 — 신규 전신 캐릭터)

- 출처: 사용자가 프로젝트 폴더에 올린 이미지 `KakaoTalk_20260915_182430990*.png` 5장(청록 머리 전신, 투명 배경 PNG, 원본 2000×3000).
- 가공: 5장의 **알파 경계 공통 크롭**(같은 포즈라 정렬 유지) 후 **폭 1200px로 다운스케일**(투명 배경 유지) → `public/assets/characters/main/` (각 ~420KB).
- 표정 매핑(원본 5종 → 앱 6감정):

  | 앱 파일 | 원본 | 표정 |
  |---|---|---|
  | neutral.png | `_04` | 부드러운 미소(대기 기본) |
  | happy.png | `_01` | 활짝 웃음(인사) |
  | playful.png | `_03` | 밝은 미소(하이파이브) |
  | sad.png | `_02` | 시무룩 |
  | cry.png | `_02` (재사용) | 울음 아트 없어 시무룩 재사용 |
  | angry.png | `_00` | 차분/쿨(삐짐 대체) |

  > 앱이 상시 노출하는 표정은 neutral/happy/playful(상태 연동)이며, sad/cry/angry는 운영자 수동 전환에만 사용.
  > 배경은 원본이 이미 투명(alpha)이라 별도 키잉 불필요. 스프라이트는 **원본 위 가짜 눈을 덧그리지 않고** 머리·몸 방향으로 시선 연출.
  > 캐릭터 저작권은 원저작자에게 있으며, **공개 배포(현재 GitHub Pages 공개)·상용 사용 조건은 사용자 책임하에 확인 필요**.
  > (v1/v2는 다른 캐릭터 — `내캐릭터펫/assets`의 치비 6종을 `characters/moa/`로 사용.)

## MediaPipe 모델 (실행 중 외부통신 없음 — 설치/빌드 시 1회 다운로드)

`scripts/fetch-models.mjs`가 아래에서 받아 `public/models/`에 저장합니다.

| 파일 | 출처 URL | 크기 |
|---|---|---|
| face_landmarker.task | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` | 3.76 MB |
| hand_landmarker.task | `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` | 7.82 MB |
| pose_landmarker_lite.task (v2, 포즈 결합) | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` | 5.78 MB |

- 라이선스: Google MediaPipe 모델 — **Apache License 2.0**. 배포 시 라이선스 고지 포함 권장.
- 세 파일은 `.gitignore` 처리(바이너리 비커밋). 재생성: `npm run fetch:models`.

## MediaPipe 런타임 WASM

- 출처: npm 패키지 `@mediapipe/tasks-vision@1.0.1`(Apache-2.0)의 `wasm/` 폴더.
- `scripts/fetch-models.mjs`가 `public/wasm/`로 복사 → 앱은 **로컬 WASM만** 로드(런타임 CDN 호출 없음).

## 런타임 의존성

| 패키지 | 버전 | 라이선스 |
|---|---|---|
| @mediapipe/tasks-vision | 1.0.1 | Apache-2.0 |
| vite (dev) | 8.3.0 | MIT |
| typescript (dev) | 7.0.2 | Apache-2.0 |
| vitest (dev) | 5.0.0 | MIT |
| jsdom (dev) | 30.0.1 | MIT |

버전은 `package.json`에 정확히 고정(exact), `package-lock.json` 커밋으로 재현성 보장.
