/// <reference lib="webworker" />
// MediaPipe inference in a Web Worker. The main thread grabs camera frames as
// ImageBitmaps and transfers them here; landmark math never touches the UI
// thread. Falls back to the main-thread source (mediapipeSource.ts) when module
// workers aren't available.
import { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { faceFromLandmarks, handFromLandmarks, poseFromLandmarks } from './landmarks';

interface InitMsg {
  type: 'init';
  wasmBase: string;
  faceModel: string;
  handModel: string;
  poseModel: string;
  maxFaces: number;
  maxHands: number;
  wantPose: boolean;
}
interface FrameMsg {
  type: 'frame';
  bitmap: ImageBitmap;
  captureT: number;
  wantPose: boolean;
}
interface SetPoseMsg {
  type: 'setPose';
  enable: boolean;
}
type InMsg = InitMsg | FrameMsg | SetPoseMsg;

let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
let face: FaceLandmarker | null = null;
let hand: HandLandmarker | null = null;
let pose: PoseLandmarker | null = null;
let poseModelPath = '';
let ts = 0;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

async function makePose(): Promise<void> {
  if (pose || !fileset || !poseModelPath) return;
  pose = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: poseModelPath },
    runningMode: 'VIDEO',
    numPoses: 4,
  });
}

ctx.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      fileset = await FilesetResolver.forVisionTasks(msg.wasmBase);
      face = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: msg.faceModel },
        runningMode: 'VIDEO',
        numFaces: msg.maxFaces,
      });
      hand = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: msg.handModel },
        runningMode: 'VIDEO',
        numHands: msg.maxHands,
      });
      poseModelPath = msg.poseModel;
      if (msg.wantPose) await makePose();
      ctx.postMessage({ type: 'ready' });
      return;
    }

    if (msg.type === 'setPose') {
      if (msg.enable) await makePose();
      else if (pose) {
        pose.close();
        pose = null;
      }
      return;
    }

    if (msg.type === 'frame') {
      if (!face || !hand) {
        msg.bitmap.close();
        return;
      }
      ts = Math.max(ts + 1, Math.round(performance.now()));
      const fr = face.detectForVideo(msg.bitmap, ts);
      const hr = hand.detectForVideo(msg.bitmap, ts);
      let poses = null as ReturnType<typeof poseFromLandmarks>[] | null;
      if (msg.wantPose) {
        if (!pose) await makePose();
        if (pose) {
          const pr = pose.detectForVideo(msg.bitmap, ts);
          poses = (pr.landmarks ?? []).map((lm) => poseFromLandmarks(lm));
        }
      }
      msg.bitmap.close();
      ctx.postMessage({
        type: 'result',
        faces: (fr.faceLandmarks ?? []).map((lm) => faceFromLandmarks(lm)),
        hands: (hr.landmarks ?? []).map((lm) => handFromLandmarks(lm)),
        poses,
        captureT: msg.captureT,
        doneT: performance.now(),
      });
    }
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
