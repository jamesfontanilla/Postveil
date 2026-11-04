import { useState, useEffect, RefObject } from "react";

export type RibbonReductionTier = 0 | 1 | 2 | 3;

export interface RibbonReflowState {
  shelfWidth: number;
  tier: RibbonReductionTier;
  shouldHideButtonLabels: boolean;
  shouldCollapseGalleries: boolean;
  shouldCollapseGroups: boolean;
}

export function useRibbonReflow(shelfRef: RefObject<HTMLElement | null>): RibbonReflowState {
  const [shelfWidth, setShelfWidth] = useState<number>(1440);

  useEffect(() => {
    const el = shelfRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          setShelfWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [shelfRef]);

  let tier: RibbonReductionTier = 0;
  if (shelfWidth < 680) {
    tier = 3;
  } else if (shelfWidth < 900) {
    tier = 2;
  } else if (shelfWidth < 1200) {
    tier = 1;
  } else {
    tier = 0;
  }

  return {
    shelfWidth,
    tier,
    shouldHideButtonLabels: tier >= 1,
    shouldCollapseGalleries: tier >= 2,
    shouldCollapseGroups: tier >= 3,
  };
}
