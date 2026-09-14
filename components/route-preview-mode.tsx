'use client'
import { createContext, useContext } from 'react'

/**
 * Whether the list shows each route's photo/video, or its GPX track.
 *
 * A separate module rather than living in `route-filters.tsx`: the card's
 * media component reads this, and it must not import the component that
 * renders the grid it lives inside.
 *
 * The card itself is server-rendered per route (`RouteCardMediaAsync` fetches
 * the photo and the parsed track), so this can't travel as a prop through
 * that server component's own interface. Context reaches it anyway: the
 * client components on both ends of that server-rendered subtree share the
 * same React tree, and a context value crosses server/client boundaries by
 * following the tree rather than the props.
 */
export type PreviewMode = 'media' | 'map'

const PreviewModeContext = createContext<PreviewMode>('media')

export const PreviewModeProvider = PreviewModeContext.Provider

export function usePreviewMode(): PreviewMode {
  return useContext(PreviewModeContext)
}
