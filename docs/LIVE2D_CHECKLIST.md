# Live2D 교체 체크리스트

현재 렌더러는 **재사용 PNG 스프라이트**입니다. Live2D로 교체하면 시선(고개·눈)·입·몸 기울기를
파라미터로 자연스럽게 구동할 수 있습니다. `CharacterAdapter` 인터페이스(`lookAt/setExpression/playGesture/setProximity/update/dispose`)는
그대로 두고 **어댑터만 교체**하면 인식·상태 로직은 손대지 않아도 됩니다.

`src/character/live2dAdapter.ts`는 **비활성 스텁**입니다. 아래 자산이 준비되면 실제 SDK를 연결하세요.

## 필요한 파일

- `model/<name>.model3.json` — 모델 정의
- `model/<name>.moc3` — 리깅 바이너리
- `model/textures/texture_00.png` … — 텍스처 아틀라스
- `model/<name>.physics3.json` — 물리(머리카락/흔들림) *(권장)*
- `model/<name>.cdi3.json` — 파라미터/파츠 표시명 *(선택)*
- 모션:
  - `motions/greeting.motion3.json`
  - `motions/highfive.motion3.json`
  - (선택) idle, farewell

## 필요한 파라미터 (표준 Cubism 파라미터 권장)

| 용도 | 파라미터 |
|------|----------|
| 고개 좌우/상하/기울기 | `ParamAngleX`, `ParamAngleY`, `ParamAngleZ` |
| 눈동자 | `ParamEyeBallX`, `ParamEyeBallY` |
| 몸 기울기(접근 연출) | `ParamBodyAngleX` |
| 입/표정 | `ParamMouthOpenY`, 표정용 커스텀 파라미터 |
| 눈 깜빡임 | `ParamEyeLOpen`, `ParamEyeROpen` |

## 매핑 가이드 (어댑터에서 연결)

- `lookAt({x,y})` → `ParamAngleX = x*30`, `ParamEyeBallX = x`, `ParamAngleY = y*30`, `ParamEyeBallY = -y` (부호는 모델 기준으로 보정).
- `setProximity('near')` → `ParamBodyAngleX`로 살짝 기울이거나 스케일 업.
- `playGesture('greeting'|'highfive')` → 해당 `.motion3.json` 재생.
- `setExpression(...)` → 표정 파라미터/Expression 전환.

## SDK / 라이선스

- **Cubism SDK for Web**(`pixi-live2d-display` 또는 공식 `CubismSdkForWeb`)를 사용합니다.
- **상용 배포 시 라이선스 조건 확인 필수**(소규모/대규모 사업자 구분, 모델 저작권 별도). 실제 연결 전 조건을 확인하세요 — 이번 범위 밖입니다.

## 검증되지 않은 눈 위치 주의

원본 PNG 표정 프레임은 캔버스 크기가 제각각(882×1019 ~ 951×1088)이라 **고정 좌표로 가짜 눈을 덧그리면 어긋납니다.**
그래서 스프라이트 어댑터는 눈을 덧그리지 않습니다. Live2D 모델은 자체 눈 파라미터를 쓰므로 이 문제가 사라집니다.
