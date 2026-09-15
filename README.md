# SPECTRA — 인터랙션 레이어 프로토타입 (v3)

**▶ 라이브 데모: https://i0kyung.github.io/spectra-v3/** (링크만 열면 바로 실행됩니다)

화면 앞 체험 구역의 관람객 **한 명**을 선택해, 캐릭터가 그 사람에게 **시선을 유지**하며 이동·접근·손동작(가상 하이파이브)에 반응하는 로컬/웹 프로토타입입니다.
캐릭터 1종 · 일반 웹캠 1대 · Windows PC 1대 · 디스플레이 1대 기준.

> **v3 = v2 엔진 + 신규 전신 캐릭터**(청록 머리, 표정 5종을 6감정에 매핑). 기능은 v2와 동일합니다.
> 이 저장소는 **실제로 동작**합니다. 빌드·타입검사·핵심 로직 테스트·시뮬레이션/시나리오는 검증했고,
> **실제 웹캠·사람이 필요한 항목은 [`docs/UNVERIFIED.md`](docs/UNVERIFIED.md)에 ‘미검증’으로 분리**했습니다.

### v2/v3 강화 (v1 대비 4개 영역)

- **성능·안정성** — MediaPipe 인식을 **Web Worker로 오프로딩**(미지원 시 메인스레드 자동 폴백), **캡처→인식→표시 지연(ms)** 계측, 가동 시간, rAF 워치독.
- **인식 정확도** — **포즈 결합**(손↔사람 귀속 개선, 운영자 토글) + **속도 예측 추적**(교차 시 ID 안정).
- **뷰어 연출** — 하이파이브 **파티클**, 인사/배웅 손 흔들기, 조명 강화.
- **운영·검증 도구** — **보정 도우미**, **FPS·지연 스파크라인**, **시나리오 자동 재생**(합성 입력, 카메라 아님), **이벤트 요약**.

변경 이력: [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

---

## 빠른 시작

```bash
npm install          # 의존성 설치 (postinstall 없음)
npm run dev          # http://127.0.0.1:5173 (predev가 WASM/모델을 로컬로 준비)
```

- 처음 열면 **시뮬레이션 모드**입니다. 화면 위에서 마우스를 움직이면 캐릭터가 바라보고, **누르고 있으면**(또는 `Space`) 하이파이브를 시도합니다.
- 실제 시연은 운영자 패널의 **카메라 시작**(또는 `C`). 카메라는 `localhost`(개발) 또는 **HTTPS**(배포)에서만 열립니다.
- **발표 모드**(`F` 또는 버튼)는 운영자 패널을 숨긴 관람객 화면입니다.

빌드 / 검증:

```bash
npm run typecheck    # tsc --noEmit
npm test             # vitest (합성 입력 기반 로직 테스트)
npm run build        # 타입검사 + 프로덕션 번들 (dist/)
npm run preview      # 빌드 결과 정적 서빙
```

---

## 무엇이 동작하나 (검증됨)

- **재사용 PNG 캐릭터 렌더링** — 원본 표정 6종(neutral/happy/playful/sad/cry/angry)을 프로젝트로 **복사**해 사용. 시선은 원본 위에 **가짜 눈을 덧그리지 않고** 머리·몸 전체의 방향/기울기로 표현.
- **스왑 가능한 `CharacterAdapter`** — 지금은 `SpriteAdapter`(PNG). 눈·시선 방향을 정밀 검증하려면 **`DebugGlyph`(코드로 그린 테스트 캐릭터)**로 전환(운영자 패널). Live2D 어댑터는 **자산이 없어 비활성 스텁**([`docs/LIVE2D_CHECKLIST.md`](docs/LIVE2D_CHECKLIST.md)).
- **대상 선택** — 설정 가능한 체험 ROI 안에 일정 시간(dwell) 머문 한 명을 선택. 선택 후에는 **더 큰/가까운 얼굴이 와도 대상을 빼앗기지 않음**(히스테리시스).
- **상태 전이** — `IDLE → ACQUIRING → GREETING → ENGAGED → HIGH_FIVE / LOST_GRACE → FAREWELL`. 카메라 오류는 별도 **시스템 상태**로 분리.
- **놓침 유예 + 재연결** — 짧은 가림은 유예(grace) 동안 마지막 방향 유지, 같은 자리로 돌아오면 재연결. 유예 초과 시 배웅 후 대기.
- **시선/접근/가상 하이파이브** — 얼굴 위치→시선 매핑(반전·게인·데드존·클램프·시간기반 스무딩), 얼굴 크기 기반 **상대** 근접(진입/이탈 히스테리시스), 대상에게 **명확히 귀속되는** 손이 열린 채 들려 유지되면 하이파이브 1회 발동(내렸다 다시 들어야 재발동, 쿨다운).
- **운영자 패널** — 카메라 시작/정지/재연결, 미리보기 위 ROI 드래그, 검출·선택 대상 오버레이, 반전·시선 보정·근접·타이밍 슬라이더, 렌더/인식 FPS, 실제/시뮬 **모드 명시**, 설정 저장/초기화, 익명 이벤트.
- **익명 로컬 이벤트** — 기본 꺼짐. 운영자만 활성화. 임시 세션 ID·시작/종료·하이파이브 횟수만. 보관기간·전체삭제 제공. **장기 개인 추적 ID 없음.**
- **키오스크 내구성** — 렌더는 `requestAnimationFrame`, 여기에 **워치독**을 더해 탭이 백그라운드로 가도 상태가 멈추지 않음.

## 무엇을 하지 않나 (이번 범위 밖)

LLM API, NFC/RFID, 결제, 회원가입, VR, 굿즈 인식, 클라우드 대시보드, 얼굴 생체 식별/재방문 인식, 마이크. **생성형 AI API 키 불필요.**

---

## 아키텍처

```
detect/ (입력)          core/ (순수 로직, DOM 무관, 테스트 대상)     character/ (렌더)
  mediapipeSource  ─┐     trackManager  임시 track ID                spriteAdapter (PNG)
  simSource        ─┼──▶  targetSelector ROI dwell + 히스테리시스   debugGlyphAdapter (테스트)
  (DetectionFrame)  │     gaze / proximity / highfive                live2dAdapter (스텁)
                    │     stateMachine  행동 FSM
                    └──▶  app.ts (Engine) 이 모두를 연결하고 Telemetry 방출 ──▶ ui (index.html + main.ts)
```

- `core/*`는 **DOM·MediaPipe에 의존하지 않는 순수 모듈**이라, `test/`에서 **가상 시계 + 합성 검출 입력**으로 결정론적으로 검증합니다.
- 인식과 렌더 주기를 분리하고, MediaPipe는 **새 카메라 프레임이 있을 때만** 추론해 누적을 방지합니다.

## 개인정보 / 네트워크

- 영상과 얼굴·손 좌표는 **메모리에서만** 처리하고 저장·업로드하지 않습니다. 마이크는 요청하지 않습니다.
- 모델(`.task`)과 MediaPipe **WASM은 `public/`에 로컬로 제공**되어, **실행 중 외부 통신이 없습니다**. 다운로드는 설치/빌드 시 `scripts/fetch-models.mjs`만 수행합니다(출처·라이선스: [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md)).

## 문서

- [`docs/OPERATOR_GUIDE.md`](docs/OPERATOR_GUIDE.md) — 설치·보정·운영
- [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md) — 자동 검증 결과
- [`docs/UNVERIFIED.md`](docs/UNVERIFIED.md) — **직접 확인해야 하는 항목(미검증)**
- [`docs/FIELD_TEST_SHOOT.md`](docs/FIELD_TEST_SHOOT.md) — 30초 실기 촬영/점검 시나리오
- [`docs/LIVE2D_CHECKLIST.md`](docs/LIVE2D_CHECKLIST.md) — Live2D 교체에 필요한 자산
- [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md) — 모델·WASM·캐릭터 출처와 라이선스
