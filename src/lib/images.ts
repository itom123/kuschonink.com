import type { ImageMetadata } from 'astro';

// Every file in src/assets/images, keyed by its path below that folder.
const files = import.meta.glob<ImageMetadata>('../assets/images/**/*.{jpg,jpeg,png,webp,gif,JPG,JPEG,PNG}', {
  eager: true,
  import: 'default',
});

const byPath = new Map(Object.entries(files).map(([p, m]) => [p.replace('../assets/images/', ''), m]));

export function img(src: string): ImageMetadata {
  const meta = byPath.get(src);
  if (!meta) throw new Error(`Image not found in src/assets/images: ${src}`);
  return meta;
}

export function focalPosition(focal?: [number, number]): string | undefined {
  return focal ? `${(focal[0] * 100).toFixed(1)}% ${(focal[1] * 100).toFixed(1)}%` : undefined;
}
