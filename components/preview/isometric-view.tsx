'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Screen, IsometricTransform } from '@/lib/types';

interface IsometricViewProps {
  screen: Screen;
  transform: IsometricTransform;
  animate?: boolean;
  maxWidth?: number;
  maxHeight?: number;
}

// Responsive screen dimensions based on content
const DEFAULT_MAX_WIDTH = 700;
const DEFAULT_MAX_HEIGHT = 500;

export function IsometricView({
  screen,
  transform,
  animate = true,
  maxWidth = DEFAULT_MAX_WIDTH,
  maxHeight = DEFAULT_MAX_HEIGHT,
}: IsometricViewProps) {
  // Calculate responsive dimensions
  const dimensions = useMemo(() => {
    const aspectRatio = screen.width / (screen.height || 1);
    let width = Math.min(screen.width, maxWidth);
    let height = width / aspectRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    return { width: Math.round(width), height: Math.round(height) };
  }, [screen.width, screen.height, maxWidth, maxHeight]);

  const transformStyle = useMemo(() => ({
    transform: `
      rotateX(${transform.rotateX}deg)
      rotateY(${transform.rotateY}deg)
      rotateZ(${transform.rotateZ}deg)
      scale(${transform.scale})
      translate3d(${transform.translateX}px, ${transform.translateY}px, ${transform.translateZ}px)
    `,
    transformStyle: 'preserve-3d' as const,
  }), [transform]);

  const MotionDiv = animate ? motion.div : 'div';

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        perspective: `${transform.perspective}px`,
        perspectiveOrigin: 'center center',
        // Reserve space for 3D transforms to prevent clipping
        minWidth: dimensions.width + 100,
        minHeight: dimensions.height + 100,
      }}
    >
      {/* Shadow - positioned behind */}
      <div
        className="absolute blur-3xl opacity-25 rounded-xl"
        style={{
          width: dimensions.width,
          height: dimensions.height,
          transform: `${transformStyle.transform} translateY(20px) translateZ(-60px)`,
          transformStyle: 'preserve-3d',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, transparent 70%)',
        }}
      />

      {/* Main Screen */}
      <MotionDiv
        className="relative overflow-hidden rounded-lg shadow-2xl"
        style={{
          ...transformStyle,
          width: dimensions.width,
          height: dimensions.height,
          boxShadow: '0 50px 100px -20px rgba(0,0,0,0.5)',
        }}
        initial={animate ? { opacity: 0, scale: 0.9 } : undefined}
        animate={animate ? { opacity: 1, scale: 1 } : undefined}
        transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
      >
        {/* Screen Content - Edge to Edge */}
        {screen.imageUrl ? (
          <img
            src={screen.imageUrl}
            alt="Screenshot"
            className="w-full h-full object-cover object-top"
            draggable={false}
          />
        ) : (
          <div
            className="flex items-center justify-center bg-muted"
            style={{ height: dimensions.height }}
          >
            <span className="text-muted-foreground text-sm">No image</span>
          </div>
        )}

        {/* Subtle vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 80px rgba(0,0,0,0.2)',
          }}
        />
      </MotionDiv>
    </div>
  );
}
