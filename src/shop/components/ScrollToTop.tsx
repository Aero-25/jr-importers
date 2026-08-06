import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Restores the top of the page on navigation.
 *
 * Without this, moving from halfway down a category listing into a product
 * lands you halfway down the product page.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return null;
}
