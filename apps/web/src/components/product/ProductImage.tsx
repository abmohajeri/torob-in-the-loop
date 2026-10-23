import { useState } from 'react';
import { ImageOff, Package } from 'lucide-react';
import { CATEGORY_GROUPS } from '@titl/shared';
import { iconByName } from '../../lib/icons.js';
import { cn } from '../../lib/cn.js';

export interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  /** Category group id → placeholder icon when there is no image. */
  group?: string | null;
  className?: string;
  /** Inner padding around the contained image (product photos on white). */
  padded?: boolean;
  /** Eager-load (first visible items / gallery hero). */
  priority?: boolean;
  rounded?: string;
}

/**
 * Square product image: lazy, `object-contain` on white, graceful placeholder (category icon) when missing or
 * broken. Torob images are public and cacheable (service worker caches them).
 */
export function ProductImage({ src, alt, group, className, padded = true, priority, rounded = 'rounded-xl' }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImg = !!src && !failed;
  const groupIcon = CATEGORY_GROUPS.find((g) => g.id === group)?.icon;
  const Placeholder = failed ? ImageOff : iconByName(groupIcon, Package);
  return (
    <div className={cn('relative aspect-square w-full overflow-hidden bg-white', rounded, className)}>
      {showImg ? (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'size-full object-contain transition-opacity duration-300',
            padded && 'p-2.5',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}
      {showImg && !loaded ? <span aria-hidden className="skeleton absolute inset-3 rounded-lg" /> : null}
      {!showImg ? (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-surface-2 to-sunken">
          <div className="flex flex-col items-center gap-1 text-faint">
            <Placeholder aria-hidden className="size-8" />
            <span className="text-caption">{failed ? 'تصویر بارگیری نشد' : 'بدون تصویر'}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
