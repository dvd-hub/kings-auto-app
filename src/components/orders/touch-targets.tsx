/** Keep tablet targets in CSS pixels: the approved root font is 15px, so 11
 * spacing units produce only 41.25px. Scope these rules to the orders module,
 * including its portaled controls and the navigation used to leave the module. */
export function OrderTouchTargets() {
  return <style>{`
    body:has([data-orders-module]) [data-orders-module] button,
    body:has([data-orders-module]) [data-orders-module] [data-slot="button"],
    body:has([data-orders-module]) [data-orders-module] input:not([type="checkbox"]):not([type="hidden"]),
    body:has([data-orders-module]) [data-orders-module] select,
    body:has([data-orders-module]) header button,
    body:has([data-orders-module]) header input,
    body:has([data-orders-module]) [role="dialog"] button,
    body:has([data-orders-module]) [role="dialog"] select,
    body:has([data-orders-module]) [role="dialog"] input:not([type="checkbox"]),
    body:has([data-orders-module]) [role="menuitem"],
    body:has([data-orders-module]) [role="option"],
    body:has([data-orders-module]) nav a,
    body:has([data-orders-module]) label:has(input[type="checkbox"]) { min-height: 44px; }
    body:has([data-orders-module]) [data-orders-module] button,
    body:has([data-orders-module]) [data-orders-module] [data-slot="button"],
    body:has([data-orders-module]) header button,
    body:has([data-orders-module]) [role="dialog"] button { min-width: 44px; }
    [data-orders-module] h1.font-mono { font-family: var(--font-ibm-plex-mono), monospace; }
  `}</style>;
}
