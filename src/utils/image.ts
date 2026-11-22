export async function compressImageToDataUrl(
  file: File,
  maxWidth = 900,
  maxHeight = 900,
  quality = 0.76
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الملف المحدد ليس صورة صالحة'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر معالجة الصورة'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let result = canvas.toDataURL('image/jpeg', quality);
        // Ensure payload remains well below Firestore validation bounds (340KB limit)
        if (result.length > 320000) {
          result = canvas.toDataURL('image/jpeg', 0.56);
        }
        if (result.length > 340000) {
          const smaller = document.createElement('canvas');
          smaller.width = Math.round(width * 0.7);
          smaller.height = Math.round(height * 0.7);
          const sctx = smaller.getContext('2d');
          if (sctx) {
            sctx.drawImage(img, 0, 0, smaller.width, smaller.height);
            result = smaller.toDataURL('image/jpeg', 0.62);
          }
        }
        resolve(result);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function getInitials(name: string): string {
  const parts = (name || 'مستخدم').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] || '') + (parts[1][0] || '');
}
