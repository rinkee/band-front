"use client";

import React, { memo, useEffect, useState } from "react";
import Image from "next/image";

function OptimizedImageComponent({
  src,
  alt,
  className = "",
  width,
  height,
  fill = false,
  sizes,
  priority = false,
  fallback = null,
  unoptimized = true,
}) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return fallback;
  }

  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={className}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        unoptimized={unoptimized}
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      className={className}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      unoptimized={unoptimized}
      onError={() => setHasError(true)}
    />
  );
}

const areEqual = (prevProps, nextProps) =>
  prevProps.src === nextProps.src &&
  prevProps.alt === nextProps.alt &&
  prevProps.className === nextProps.className &&
  prevProps.width === nextProps.width &&
  prevProps.height === nextProps.height &&
  prevProps.fill === nextProps.fill &&
  prevProps.sizes === nextProps.sizes &&
  prevProps.priority === nextProps.priority &&
  prevProps.unoptimized === nextProps.unoptimized &&
  Boolean(prevProps.fallback) === Boolean(nextProps.fallback);

const OptimizedImage = memo(OptimizedImageComponent, areEqual);

export default OptimizedImage;
