/*
 * Photos from a phone are often 5 to 10 MB. Before sending one we redraw it
 * smaller as a JPEG. That is quicker to upload, and drawing it again also
 * drops the hidden data phones attach to photos, such as the location.
 */

const loadBitmap = async (blob) => {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to the older route */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('unreadable'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Returns a smaller JPEG Blob, or throws if the file is not a picture. */
export async function shrinkImage(blob, maxSide = 1600, quality = 0.85) {
  if (!blob || !/^image\//.test(blob.type || '')) throw new Error('That file is not a photo we can read.');
  let bitmap;
  try {
    bitmap = await loadBitmap(blob);
  } catch {
    throw new Error('That file is not a photo we can read.');
  }
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  // The same rule the server applies, so the person hears it straight away.
  if (width < 300 || height < 200) {
    bitmap.close?.();
    throw new Error('This photo is too small to read. Take it again, closer.');
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((out) => (out ? resolve(out) : reject(new Error('That file is not a photo we can read.'))),
      'image/jpeg', quality);
  });
}
