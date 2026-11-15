import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, ScanFace, Upload, X } from 'lucide-react';

/*
 * Full-screen camera for taking a photo of an ID (rear camera) or a face
 * (front camera, with an animated face scan).
 *
 * The face scan is a practice-account simulation: it guides the person through
 * a short head turn and then takes a photo. Nothing is matched against anyone.
 */

const FACE_STEPS = [
  ['Look straight at the camera', 1500],
  ['Slowly turn your head to the left', 1500],
  ['Slowly turn your head to the right', 1500],
  ['Hold still', 1100],
];
const MIN_SIDE = 320; // a camera picture smaller than this is not a real picture yet
const FACE_TOTAL = FACE_STEPS.reduce((sum, [, ms]) => sum + ms, 0);

export default function CameraCapture({ mode = 'document', onCapture, onCancel, onUpload }) {
  const face = mode === 'face';
  const videoRef = useRef(null);
  const closeRef = useRef(null);
  const [state, setState] = useState('starting'); // starting, ready, scanning, denied, unsupported, error
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  // Open the camera, and always switch it off again (the light must go out).
  useEffect(() => {
    let stream = null;
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: face ? 'user' : { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        // Some devices report a tiny size for a moment before the picture arrives.
        for (let i = 0; i < 40 && !cancelled && (video.videoWidth || 0) < MIN_SIDE; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (cancelled) return;
        setState((video.videoWidth || 0) >= MIN_SIDE ? 'ready' : 'error');
      } catch (err) {
        if (cancelled) return;
        setState(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'error');
      }
    };
    start();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [face]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onCancel]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || (video.videoWidth || 0) < MIN_SIDE) {
      setState('error');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => (blob ? onCapture(blob) : setState('error')), 'image/jpeg', 0.9);
  }, [onCapture]);

  // The face scan: a ring fills while the prompts change, then the photo is taken.
  useEffect(() => {
    if (state !== 'scanning') return undefined;
    const began = performance.now();
    let frame;
    const tick = (now) => {
      const elapsed = now - began;
      setProgress(Math.min(1, elapsed / FACE_TOTAL));
      let sum = 0;
      let idx = 0;
      for (let i = 0; i < FACE_STEPS.length; i += 1) {
        sum += FACE_STEPS[i][1];
        if (elapsed < sum) { idx = i; break; }
        idx = i;
      }
      setStepIdx(idx);
      if (elapsed >= FACE_TOTAL) {
        capture();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, capture]);

  const problem = {
    denied: 'The camera is blocked. Allow camera access for this site in your browser settings, then try again. You can also choose a photo from your device.',
    unsupported: 'This device or browser cannot open a camera here. You can choose a photo from your device instead.',
    error: 'We could not use the camera. Check that no other app is using it, or choose a photo from your device instead.',
  }[state];

  const prompt = face
    ? state === 'scanning' ? FACE_STEPS[stepIdx][0] : 'Fit your face inside the oval, in good light.'
    : 'Put the document inside the frame. All four corners and every word should be sharp and free of glare.';

  return (
    <div className="cam" role="dialog" aria-modal="true" aria-label={face ? 'Face check' : 'Take a photo of your document'}>
      <div className="cam__bar">
        <b>{face ? 'Face check' : 'Take a photo'}</b>
        <button ref={closeRef} type="button" className="cam__close" onClick={onCancel} aria-label="Close the camera">
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="cam__stage">
        <video ref={videoRef} playsInline muted autoPlay className={`cam__video ${face ? 'is-mirrored' : ''}`} />
        {(state === 'ready' || state === 'scanning') && (
          <>
            <div className={face ? 'cam__oval' : 'cam__card'} aria-hidden="true" />
            {face && (
              <svg className="cam__ring" viewBox="0 0 100 130" aria-hidden="true">
                <ellipse cx="50" cy="65" rx="38.5" ry="51" pathLength="1" className="cam__ring-bg" />
                <ellipse cx="50" cy="65" rx="38.5" ry="51" pathLength="1" className="cam__ring-fg"
                  style={{ strokeDashoffset: 1 - progress }} />
              </svg>
            )}
          </>
        )}
        {state === 'starting' && (
          <div className="cam__msg" role="status">
            <Loader2 size={30} className="spin" aria-hidden="true" />
            <p>Allow camera access when your browser asks.</p>
          </div>
        )}
        {problem && (
          <div className="cam__msg" role="alert">
            <Camera size={30} aria-hidden="true" />
            <p>{problem}</p>
          </div>
        )}
      </div>

      <div className="cam__foot">
        {(state === 'ready' || state === 'scanning') && (
          <p className="cam__prompt" role="status" aria-live="polite">{prompt}</p>
        )}
        <div className="cam__actions">
          {state === 'ready' && !face && (
            <button type="button" className="cam__shutter" onClick={capture} aria-label="Take the photo">
              <span />
            </button>
          )}
          {state === 'ready' && face && (
            <button type="button" className="btn btn--primary" onClick={() => { setProgress(0); setStepIdx(0); setState('scanning'); }}>
              <ScanFace size={20} aria-hidden="true" /> Start face scan
            </button>
          )}
          {state === 'scanning' && <p className="cam__hint">Keep your face in the oval</p>}
          {onUpload && state !== 'scanning' && (
            <button type="button" className="btn btn--outline cam__alt" onClick={onUpload}>
              <Upload size={18} aria-hidden="true" /> Choose a photo instead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
