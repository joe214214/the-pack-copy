import * as React from "react"

/**
 * The width below which the sidebar is a drawer rather than a fixed column.
 *
 * 1024, not the 768 this component ships with. At 768 the sidebar became a
 * persistent ~256px column while every page grid still sized itself against the
 * full viewport — sm:grid-cols-2 laid out two columns believing it had 768px
 * when it actually had ~512px, which pushed /dashboard/wallet 201px and an
 * order detail 144px wider than the window. Collapsing to a drawer until lg
 * gives those grids the room they assume and fixes the whole 768-1023 band at
 * once, instead of converting every page to container queries.
 *
 * Keep this in step with the lg: prefixes in components/ui/sidebar.tsx.
 */
const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
