# 자동 검증 결과 (v2)

실행 환경: Windows 11 · Node v24.18.0 · npm 11.16.0 · TypeScript 7.0.2 · Vite 8.3.0 · Vitest 5.0.0
날짜: 2026-09-15

> **주의:** 아래는 **합성(가상) 입력 기반 자동 테스트**와 **시뮬레이션/시나리오 동작** 결과입니다.
> 실제 웹캠·사람으로 한 현장 시험이 아니며, 합성 테스트 통과가 현장 안정성을 보장하지 않습니다.
> 현장에서 사람이 확인해야 하는 항목은 [`UNVERIFIED.md`](UNVERIFIED.md) 참고.

## 명령별 결과

| 명령 | 결과 |
|------|------|
| `npm run typecheck` (tsc --noEmit) | ✅ 통과 (오류 0) |
| `npm test` (vitest run) | ✅ **38/38 통과**, 7개 파일 |
| `npm run build` (tsc + vite build) | ✅ 성공 · `dist/` 생성 (index JS ~199 KB gzip ~62 KB, **worker 청크 ~155 KB 분리**) |
| 로컬 서빙 스모크(`vite preview`) | ✅ HTTP 200, 캐릭터 PNG/모델(face·hand·pose)/WASM/worker 200 |

## v2 브라우저 실동작 확인 (시뮬레이션/시나리오)

- **시나리오 ‘engage’** 자동 재생 → `IDLE→ACQUIRING→GREETING→ENGAGED→HIGH_FIVE` 전 구간 관찰, 소스 배지 `scenario:engage`, 포즈 카운트 1.
- **시나리오 ‘bystanderHand’ + 포즈 결합 ON** → 얼굴 2/포즈 2에서 **HIGH_FIVE 미발동**(타인 손 거부) 확인.
- 파티클 오버레이·스파크라인 캔버스 마운트, 지연/가동시간 표시 갱신, 렌더러 전환, 콘솔 오류 0.
- 뷰어(발표 모드) 렌더 확인: 인사 표정(happy) + 하이파이브 파티클 + 시그니처 조명.

## 테스트 커버리지 (합성 입력 + 가상 시계)

- **stateMachine.test.ts** — 무인 시 오작동 없음 / 후보 확정→인사→바라봄 / 후보 소실 시 복귀 / 하이파이브 발동·복귀 / 유예 내 재연결 / 유예 초과→배웅→대기 / 카메라 오류 복구(forceIdle).
- **trackManager.test.ts** — 부드러운 이동 시 ID 유지 / 새 얼굴 별도 ID / TTL 만료 / 느린 분리에서 ID 유지 / **v2 속도 예측이 빠른 점프에서 ID 유지**(일반 NN은 새 ID 생성).
- **pose.test.ts** (v2) — 포즈 결합으로 대상 팔이 뻗은 손 귀속 / **타인 스켈레톤에 속한 손 거부** / 포즈 없을 때 거리 규칙 폴백.
- **targetSelector.test.ts** — ROI 밖 무시 / dwell 후 선택 / **더 큰 신규 얼굴이 대상 못 빼앗음** / clearTarget 후 재-dwell 필요 / 1프레임 저신뢰 후보 거부.
- **gaze.test.ts** — 좌우 반전 매핑 / 미반전 / **경계값 클램프** / 중앙=0 / 스무딩 수렴 / 데드존 억제.
- **highfive.test.ts** — 대상 손 귀속 / **모호(두 얼굴 사이) 손 거부** / 원거리 손 거부 / **계속 든 손은 1회만 발동** / **내렸다 들면 쿨다운 후 재발동** / 닫힌 손 무발동 / **타인 손 무발동**.
- **scenario.test.ts** (모듈 결합) — 무인 무발동 / 확정→바라봄 / **짧은 가림 후 재연결** / **유예 초과→배웅→대기** / 더 큰 신규 얼굴이 대상 유지.

## 시뮬레이션 실동작(브라우저) 확인

시뮬레이션 모드에서 합성 포인터 입력으로 확인:

- `IDLE → ACQUIRING → GREETING → ENGAGED` 전이 (dwell 100% 도달 후 선택).
- 손 들기(누름) 유지 → 약 0.35초 후 `HIGH_FIVE` 발동, 손 미터 100%.
- `Sprite ↔ 테스트글리프` 렌더러 전환 정상, 콘솔 오류 0.
- 재사용 PNG 캐릭터가 시그니처 조명과 함께 렌더링됨(발표 모드 스크린샷).

## 재현 방법

```bash
npm ci
npm run typecheck && npm test && npm run build
npm run preview   # 이후 http://127.0.0.1:4173 접속
```
