import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    // Disable browser scroll restoration
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const scrollToTop = () => {
      window.scrollTo(0, 0);
      const mainContent = document.getElementById("main-content");
      if (mainContent) {
        mainContent.scrollTop = 0;
      }
    };

    // Apply immediately
    scrollToTop();

    // Apply after next frame (catches layout shifts)
    const rafId = requestAnimationFrame(() => {
      scrollToTop();
    });

    // Apply after short delay (catches late component mounts)
    const timeoutId = setTimeout(() => {
      scrollToTop();
    }, 50);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [pathname]);

  return null;
}
