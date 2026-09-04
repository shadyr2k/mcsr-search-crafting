import { useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import { iconUrl } from '../data/iconManifest'


export interface ItemIconProps {
  itemId: string
  name: string
  manifest: IconManifest
  size?: 'compact' | 'picker' | 'detail'
  className?: string
}

export function ItemIcon({
  itemId,
  name,
  manifest,
  size = 'compact',
  className,
}: ItemIconProps) {
  const url = iconUrl(manifest, itemId)
  const requestKey = `${itemId}\u0000${url ?? ''}`
  const [failedRequestKey, setFailedRequestKey] = useState<string | null>(null)
  const classes = ['item-icon', `item-icon--${size}`, className].filter(Boolean).join(' ')

  if (url === undefined || failedRequestKey === requestKey) {
    return <span
      role="img"
      aria-label={name}
      title={name}
      className={`${classes} item-icon--fallback`}
    >
      <span className="item-icon__fallback-label">{name}</span>
    </span>
  }

  return <img
    src={url}
    alt={name}
    title={name}
    loading={size === 'detail' ? 'eager' : 'lazy'}
    className={classes}
    onError={() => setFailedRequestKey(requestKey)}
  />
}
