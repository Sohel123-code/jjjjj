export async function compressImage(file, maxDimension = 1600, maxSizeBytes = 800 * 1024) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('Choose a JPEG, PNG or WebP photo.');
  if (file.size > 10 * 1024 * 1024) throw Error('Choose a photo smaller than 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(Error('This photo could not be read.')); img.src = url; });
    if (!img.width || !img.height || img.width * img.height > 60_000_000) throw Error('This image is too large to process.');
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('Photo processing is unavailable in this browser.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(img, 0, 0, canvas.width, canvas.height);
    let dataUrl;
    for (let quality = 0.85; quality >= 0.25; quality -= 0.1) { dataUrl = canvas.toDataURL('image/jpeg', quality); if (dataUrl.length * 0.75 <= maxSizeBytes) break; }
    if (dataUrl.length * 0.75 > maxSizeBytes) throw Error('Please choose a smaller photo.');
    // Re-encoding removes the original EXIF/location metadata.
    return { dataUrl, width: canvas.width, height: canvas.height, sizeBytes: Math.ceil(dataUrl.length * 0.75) };
  } finally { URL.revokeObjectURL(url); }
}
