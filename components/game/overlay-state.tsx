'use client';
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
const ModalContext = createContext(false);
const selector =
  '[data-slot="dialog-overlay"], [data-slot="alert-dialog-overlay"], [aria-modal="true"][role="dialog"], [aria-modal="true"][role="alertdialog"]';
/** One observer covers Radix portals, including nested report/confirmation dialogs. */
export function OverlayState({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState(false);
  useLayoutEffect(() => {
    const update = () => setModal(!!document.querySelector(selector));
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'role'],
    });
    update();
    return () => observer.disconnect();
  }, []);
  return <ModalContext.Provider value={modal}>{children}</ModalContext.Provider>;
}
export const useModalOpen = () => useContext(ModalContext);
