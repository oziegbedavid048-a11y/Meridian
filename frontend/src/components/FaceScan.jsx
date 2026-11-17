import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';

/*
 * Face check, styled like phone face-unlock setup: the camera sits in a circle
 * ringed with ticks. The ticks glow red while the face is out of place and
 * green once it is right; then they spin while the photo is taken.
 *
 * Where the browser has a built-in face detector it is used. Otherwise each
 * frame is checked directly: how much of the circle is skin-toned, where that
 * area sits, and whether the light is good enough. Nothing leaves the device
 * until the finished photo is sent with the rest of the verification.
 */

const TICKS = 72;
const HOLD_MS = 700;      // how long the face must stay in place before capture starts
const CAPTURE_MS = 2200;  // the spin while capturing
const SAMPLE = 56;        // frames are checked at this size

/**
 * Looks at one small square frame (RGBA pixels) and says whether a face is in place.
 * Returns { ok, reason } where reason is a short instruction when not ok.
 */
export function analyseFrame(pixels, size) {
  const r = size / 2;
  let total = 0;
  let skin = 0;
  let sx = 0;
  let sy = 0;
  let sumY = 0;
  let sumY2 = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      if (dx * dx + dy * dy > r * r) continue; // only inside the circle
      const i = (y * size + x) * 4;
      const R = pixels[i];
      const G = pixels[i + 1];
      const B = pixels[i + 2];
      const Y = 0.299 * R + 0.587 * G + 0.114 * B;
      const Cb = 128 - 0.168736 * R - 0.331264 * G + 0.5 * B;
      const Cr = 128 + 0.5 * R - 0.418688 * G - 0.081312 * B;
      total += 1;
      sumY += Y;
      sumY2 += Y * Y;
      if (Y > 45 && Cr >= 133 && Cr <= 178 && Cb >= 75 && Cb <= 130) {
        skin += 1;
        sx += dx;
        sy += dy;
      }
    }
  }
  const mean = sumY / total;
  const spread = Math.sqrt(Math.max(0, sumY2 / total - mean * mean));
  if (mean < 55) return { ok: false, reason: 'Find better light' };
  if (mean > 235) return { ok: false, reason: 'Too bright: move away from the light' };
  const cover = skin / total;
  if (cover < 0.035) return { ok: false, reason: 'Place your face in the circle' };
  if (cover > 0.8) return { ok: false, reason: 'Move back a little' };
  if (spread < 12) return { ok: false, reason: 'Place your face in the circle' }; // a plain wall, not a face
  const cx = sx / skin / r;
  const cy = sy / skin / r;
  if (Math.hypot(cx, cy) > 0.3) return { ok: false, reason: 'Center your face in the circle' };
  if (cover < 0.22) return { ok: false, reason: 'Move a little closer' };
  return { ok: true, reason: 'Hold still' };
}

/** Uses the browser's own face detector where there is one. */
async function detectWithBrowser(detector, video, crop) {
  const faces = await detector.detect(video);
  if (!faces.length) return { ok: false, reason: 'Place your face in the circle' };
  if (faces.length > 1) return { ok: false, reason: 'Only one face, please' };
  const box = faces[0].boundingBox;
  const cx = (box.x + box.width / 2 - (crop.x + crop.size / 2)) / (crop.size / 2);
  const cy = (box.y + box.height / 2 - (crop.y + crop.size / 2)) / (crop.size / 2);
  const ratio = box.width / crop.size;
  if (Math.hypot(cx, cy) > 0.3) return { ok: false, reason: 'Center your face in the circle' };
  if (ratio < 0.35) return { ok: false, reason: 'Move a little closer' };
  if (ratio > 0.85) return { ok: false, reason: 'Move back a little' };
  return { ok: true, reason: 'Hold still' };
}

export default function FaceScan({ onCapture, onCancel, onUpload }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [camera, setCamera] = useState('starting'); // starting, ready, denied, unsupported
  const [phase, setPhase] = useState('search'); // search, hold, capturing, done
  const [reason, setReason] = useState('Place your face in the circle');
  const [progress, setProgress] = useState(0); // 0..1 while capturing
  const phaseRef = useRef('search');
  const good = useRef(0); // when the face first came into place
  const captureStart = useRef(0);

  // Open the front camera; always switch it off again.
  useEffect(() => {
    let stream = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCamera('unsupported'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        for (let i = 0; i < 40 && !cancelled && (video.videoWidth || 0) < 200; i += 1) {
          await new Promise((res) => setTimeout(res, 100));
        }
        if (!cancelled) setCamera(video.videoWidth >= 200 ? 'ready' : 'unsupported');
      } catch (err) {
        if (!cancelled) setCamera(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'unsupported');
      }
    })();
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const side = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    // Mirror it back, so the saved photo looks like the person sees themselves.
    ctx.translate(side, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, side, side);
    canvas.toBlob((blob) => blob && onCapture(blob), 'image/jpeg', 0.92);
  }, [onCapture]);

  // Check the face several times a second.
  useEffect(() => {
    if (camera !== 'ready' || phaseRef.current === 'done') return undefined;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const detector = 'FaceDetector' in window ? (() => { try { return new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 }); } catch { return null; } })() : null;
    let stopped = false;
    let busy = false;

    const tick = async () => {
      if (stopped || busy) return;
      busy = true;
      try {
        const side = Math.min(video.videoWidth, video.videoHeight) * 0.78; // the circle on screen
        const crop = { x: (video.videoWidth - side) / 2, y: (video.videoHeight - side) / 2, size: side };
        let result;
        if (detector) {
          try { result = await detectWithBrowser(detector, video, crop); } catch { result = null; }
        }
        if (!result) {
          ctx.drawImage(video, crop.x, crop.y, side, side, 0, 0, SAMPLE, SAMPLE);
          result = analyseFrame(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data, SAMPLE);
        }
        const now = performance.now();
        let p = phaseRef.current;
        if (!result.ok) {
          p = 'search';
          setProgress(0);
        } else if (p === 'search') {
          good.current = now;
          p = 'hold';
        } else if (p === 'hold' && now - good.current >= HOLD_MS) {
          captureStart.current = now;
          p = 'capturing';
        } else if (p === 'capturing') {
          const done = Math.min(1, (now - captureStart.current) / CAPTURE_MS);
          setProgress(done);
          if (done >= 1) {
            p = 'done';
            stopped = true;
            takePhoto();
          }
        }
        phaseRef.current = p;
        setReason(result.reason);
        setPhase(p);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(tick, 120);
    return () => { stopped = true; clearInterval(timer); };
  }, [camera, takePhoto]);

  const state = phase === 'search' ? 'bad' : phase === 'done' ? 'done' : 'good';
  const lit = phase === 'capturing' || phase === 'done' ? Math.round(progress * TICKS) : TICKS;
  const message = camera === 'starting' ? 'Starting the camera…'
    : phase === 'capturing' ? 'Verifying…'
      : phase === 'done' ? 'Verification successful' : reason;

  return (
    <div className="fs" role="dialog" aria-modal="true" aria-label="Face check">
      <header className="fs-bar">
        <button type="button" className="fs-close" onClick={onCancel} aria-label="Close the face check"><X size={22} aria-hidden="true" /></button>
      </header>

      {camera === 'denied' || camera === 'unsupported' ? (
        <div className="fs-body">
          <span className="fs-icon"><Camera size={30} aria-hidden="true" /></span>
          <h2>{camera === 'denied' ? 'Allow camera access' : 'No camera found'}</h2>
          <p>{camera === 'denied'
            ? 'Your browser blocked the camera. Allow camera access for this site in your browser settings, then try again.'
            : 'We could not open a camera on this device. You can upload a clear, recent photo of your face instead.'}</p>
          <button type="button" className="fs-btn" onClick={onUpload}><Upload size={18} aria-hidden="true" /> Upload a photo instead</button>
        </div>
      ) : (
        <div className="fs-body">
          <div className={`fs-ring fs-ring--${state} ${phase === 'capturing' ? 'is-spinning' : ''}`}>
            <svg className="fs-ticks" viewBox="0 0 300 300" aria-hidden="true">
              {Array.from({ length: TICKS }, (_, i) => {
                const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
                const r1 = 136;
                const r2 = 148;
                return (
                  <line key={i} x1={150 + Math.cos(a) * r1} y1={150 + Math.sin(a) * r1}
                    x2={150 + Math.cos(a) * r2} y2={150 + Math.sin(a) * r2}
                    className={i < lit ? 'is-lit' : ''} />
                );
              })}
            </svg>
            {phase === 'capturing' && <span className="fs-spinner" aria-hidden="true" />}
            <div className="fs-cam">
              <video ref={videoRef} playsInline muted autoPlay />
            </div>
          </div>
          <p className={`fs-msg fs-msg--${state}`} role="status" aria-live="polite">{message}</p>
          <p className="fs-sub">Look straight at the camera, in good light, with nothing covering your face.</p>
        </div>
      )}
      <canvas ref={canvasRef} width={SAMPLE} height={SAMPLE} hidden />
    </div>
  );
}
