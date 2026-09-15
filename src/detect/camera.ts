import { CameraError } from './source';

/** Open a video-only camera stream + a ready <video>, mapping failures to typed errors. */
export async function openCamera(): Promise<{ stream: MediaStream; video: HTMLVideoElement }> {
  if (!window.isSecureContext) {
    throw new CameraError(
      'insecure',
      '보안 컨텍스트가 아닙니다. 개발은 http://localhost, 배포는 HTTPS 에서 열어야 카메라를 쓸 수 있습니다.',
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unknown', '이 브라우저는 카메라 API를 지원하지 않습니다.');
  }
  let stream: MediaStream;
  try {
    // Video only — never request the microphone.
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (e) {
    throw mapGumError(e);
  }
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  return { stream, video };
}

export function mapGumError(e: unknown): CameraError {
  const name = e instanceof DOMException ? e.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError('denied', '카메라 권한이 거부되었습니다. 브라우저 주소창의 카메라 아이콘에서 허용으로 바꾼 뒤 다시 시작하세요.');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraError('nodevice', '연결된 카메라를 찾지 못했습니다. 장치를 연결한 뒤 다시 시작하세요.');
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError('inuse', '다른 앱이 카메라를 사용 중입니다. 해당 앱을 닫고 다시 시작하세요.');
    default:
      return new CameraError('unknown', '카메라를 열지 못했습니다: ' + (e instanceof Error ? e.message : String(e)));
  }
}
