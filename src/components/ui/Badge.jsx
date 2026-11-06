// src/components/ui/Badge.jsx
import React from 'react';
import { cn } from '@/utils/cn';

const STAGE_VARIANTS = {
  registered: 'badge-stage-registered',
  certified: 'badge-stage-certified',
  dispatched: 'badge-stage-dispatched',
  received: 'badge-stage-received',
  sold: 'badge-stage-sold',
};

/**
 * @param {'brand'|'success'|'warning'|'danger'|'info'|'neutral'} variant
 * @param {string} stage  Optional supply-chain stage; overrides variant.
 */
export default function Badge({ variant = 'neutral', stage, dot = false, className, children }) {
  const stageClass = stage ? STAGE_VARIANTS[String(stage).toLowerCase()] : null;
  return (
    <span className={cn('badge', stageClass || `badge-${variant}`, dot && 'badge-dot', className)}>
      {children}
    </span>
  );
}
