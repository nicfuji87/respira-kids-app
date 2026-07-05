// AI dev note: Compressão/redimensionamento de imagem no cliente ANTES do upload.
// Reduz a maior dimensão e re-encoda em WebP (fallback JPEG), deixando os arquivos
// leves (~<200KB) — bom para miniaturas na aplicação e para economizar storage.

export interface CompressImageOptions {
  maxDimension?: number; // maior lado, em px
  quality?: number; // 0..1
}

export interface CompressedImage {
  blob: Blob;
  ext: 'webp' | 'jpg';
}

export async function compressImage(
  file: File,
  opts: CompressImageOptions = {}
): Promise<CompressedImage> {
  const maxDimension = opts.maxDimension ?? 600;
  const quality = opts.quality ?? 0.8;

  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  let width = img.width;
  let height = img.height;
  if (width >= height && width > maxDimension) {
    height = Math.round((height * maxDimension) / width);
    width = maxDimension;
  } else if (height > width && height > maxDimension) {
    width = Math.round((width * maxDimension) / height);
    height = maxDimension;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas não suportado neste navegador.');
  ctx.drawImage(img, 0, 0, width, height);

  const supportsWebp = canvas
    .toDataURL('image/webp')
    .startsWith('data:image/webp');
  const type = supportsWebp ? 'image/webp' : 'image/jpeg';
  const ext: 'webp' | 'jpg' = supportsWebp ? 'webp' : 'jpg';

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem.'))),
      type,
      quality
    );
  });

  return { blob, ext };
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar a imagem.'));
    img.src = src;
  });
}
