export function createInput(canvas, handlers) {
  const toWorld = event => {
    const rect = canvas.getBoundingClientRect();
    return handlers.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
  };

  const onContextMenu = event => {
    event.preventDefault();
  };

  const onPointerDown = event => {
    canvas.setPointerCapture?.(event.pointerId);
    if (event.button === 2) {
      event.preventDefault();
      handlers.onSecondary(toWorld(event));
      return;
    }
    if (event.button === 0) {
      event.preventDefault();
      handlers.onPrimary(toWorld(event));
    }
  };

  const onKeyDown = event => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === "q" || key === "w" || key === "e" || event.code === "Space" || event.key === "Escape") {
      event.preventDefault();
    }
    if (event.key === "Escape") handlers.onKey("ESC");
    if (key === "q") handlers.onKey("Q");
    if (key === "w") handlers.onKey("W");
    if (key === "e") handlers.onKey("E");
    if (event.code === "Space") handlers.onKey("ROLL");
  };

  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);

  return {
    destroy() {
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    }
  };
}
