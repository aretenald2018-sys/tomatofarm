// ── 이미지 → base64 변환 (Apple-style food enhancement) ──────────
export function imageToBase64(file, maxDim = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else                { width  = Math.round(width  * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        // Apple-style food enhancement
        ctx.filter = 'contrast(1.06) saturate(1.12) brightness(1.03)';
        ctx.drawImage(img, 0, 0, width, height);
        ctx.filter = 'none';
        // Warm tint overlay
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(255, 173, 100, 0.06)';
        ctx.fillRect(0, 0, width, height);
        // Subtle vignette
        ctx.globalCompositeOperation = 'multiply';
        const vig = ctx.createRadialGradient(width/2, height/2, width*0.35, width/2, height/2, width*0.75);
        vig.addColorStop(0, 'rgba(255,255,255,1)');
        vig.addColorStop(1, 'rgba(240,235,230,1)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
