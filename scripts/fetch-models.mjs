// Vendors the MediaPipe runtime locally so the app makes NO external calls at
// run time (only this script, run at install/build, touches the network).
//
// It does two things, both idempotent:
//   1) copies the WASM runtime from node_modules into public/wasm/
//   2) downloads the two .task models into public/models/ (if missing)
//
// Sources + licenses are recorded in docs/ASSET_SOURCES.md.
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDst = join(root, 'public', 'wasm');
const modelDst = join(root, 'public', 'models');

const MODELS = [
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  {
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
  {
    // v2: optional pose model, used only when the operator enables pose fusion
    // for more reliable hand->person attribution with multiple people.
    file: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
];

function ensureDir(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

async function copyWasm() {
  if (!existsSync(wasmSrc)) {
    console.warn('[fetch-models] WASM source not found — did you run `npm install`?');
    return;
  }
  ensureDir(wasmDst);
  const files = await readdir(wasmSrc);
  let n = 0;
  for (const f of files) {
    const to = join(wasmDst, f);
    if (!existsSync(to)) {
      copyFileSync(join(wasmSrc, f), to);
      n++;
    }
  }
  console.log(`[fetch-models] WASM ready in public/wasm (${files.length} files, ${n} copied).`);
}

async function download(url, to) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await new Promise((resolve, reject) => {
    const out = createWriteStream(to);
    Readable.fromWeb(res.body).pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

async function fetchModels() {
  ensureDir(modelDst);
  for (const m of MODELS) {
    const to = join(modelDst, m.file);
    if (existsSync(to) && statSync(to).size > 0) {
      console.log(`[fetch-models] ${m.file} already present — skipping.`);
      continue;
    }
    try {
      console.log(`[fetch-models] downloading ${m.file} …`);
      await download(m.url, to);
      console.log(`[fetch-models] saved ${m.file} (${(statSync(to).size / 1e6).toFixed(2)} MB).`);
    } catch (err) {
      console.warn(
        `[fetch-models] could not download ${m.file}: ${err.message}\n` +
          `  The app will still build, but real-camera mode needs this file.\n` +
          `  Download it manually from:\n    ${m.url}\n  and place it at public/models/${m.file}`,
      );
    }
  }
}

await copyWasm();
await fetchModels();
