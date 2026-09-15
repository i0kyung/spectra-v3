# 변경 이력

## v2 (2026-09-15)

v1의 구조(`CharacterAdapter`, 순수 core 로직, 검출 소스 추상화)를 유지한 채 4개 영역을 강화했습니다.

### 성능·안정성
- **Web Worker 인식 경로** 추가 (`detect/worker.ts`, `detect/workerSource.ts`): 카메라 프레임을 `ImageBitmap`으로 워커에 전송해 MediaPipe 추론을 UI 스레드에서 분리. `WorkerSource.supported()`가 false면 메인스레드(`MediapipeSource`)로 **자동 폴백**.
- **지연 계측**: 프레임에 `captureT`를 실어 캡처→인식(`detectLatencyMs`)과 캡처→표시(`pipelineLatencyMs`)를 분리 측정, 운영자 패널에 표시.
- **가동 시간** 표시, rAF 워치독 유지(백그라운드에서도 상태 진행).

### 인식 정확도
- **포즈 결합**(`PoseLandmarker` + `associateHandByPose`): 손→(가장 가까운 포즈 손목)→(가장 가까운 얼굴)로 귀속해 다중 인물 상황을 개선. 운영자 토글, 기본 꺼짐(부하 고려). 포즈 미검출 시 거리 규칙으로 폴백.
- **속도 예측 추적**(`trackManager`): 예측 위치 + 크기 유사도로 매칭해 교차 시 ID 스왑 감소.

### 뷰어 연출
- 하이파이브 **파티클 버스트**(`ui/particles.ts`), 인사/배웅 **손 흔들기** 모션, 시그니처 조명 강화.

### 운영·검증 도구
- **보정 도우미**: 시뮬 대상을 우측/상단에 놓고 시선 방향을 실시간 화살표로 확인 → 반전 토글로 교정.
- **FPS·지연 스파크라인**(`ui/sparkline.ts`).
- **시나리오 자동 재생**(`detect/scenarioSource.ts`): 무인 / 입장·하이파이브 / 2인 교차 / 타인 손 / 가림 복귀 / 연타 — **합성 입력**, ‘카메라 아님’ 명시.
- **이벤트 요약**(하이파이브 수, 평균 체험시간).

### 기타
- 설정 저장 키를 `spectra.config.v2`로 분리(v1과 충돌 없음).
- 테스트 34 → **38** (포즈 귀속 3, 속도 예측 1 추가).
- 모델: `pose_landmarker_lite.task` 추가 다운로드(`scripts/fetch-models.mjs`).

### 알려진 제약 (v2 시점)
- Web Worker 경로와 포즈 결합의 **실제 카메라 구동은 빌드·타입만 검증**됨(이 세션 프리뷰창에 카메라 없음). 시뮬레이션/시나리오로 **로직**은 검증. 자세히는 `docs/UNVERIFIED.md`.
