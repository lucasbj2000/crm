(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 900px)";
  const HIDE_SELECTORS = [
    "#deal-drawer .chat-only-section.v2645-deal-chat > .v2645-ai-row",
    "#deal-drawer .chat-only-section.v2645-deal-chat .v2645-composer > .quick-reply-bar",
    "#deal-drawer .chat-only-section.v2645-deal-chat .v2645-composer > .message-tools"
  ];

  function setImportant(node, property, value) {
    if (!node) return;
    node.style.setProperty(property, value, "important");
  }

  function clearImportant(node, property) {
    if (!node) return;
    node.style.removeProperty(property);
  }

  function hideSecondaryTools(mobile) {
    for (const selector of HIDE_SELECTORS) {
      document.querySelectorAll(selector).forEach((node) => {
        if (mobile) {
          node.dataset.v2662MobileHidden = "1";
          setImportant(node, "display", "none");
          setImportant(node, "visibility", "hidden");
          setImportant(node, "height", "0px");
          setImportant(node, "min-height", "0px");
          setImportant(node, "max-height", "0px");
          setImportant(node, "margin", "0px");
          setImportant(node, "padding", "0px");
          setImportant(node, "border", "0px");
          setImportant(node, "overflow", "hidden");
          setImportant(node, "pointer-events", "none");
        } else if (node.dataset.v2662MobileHidden === "1") {
          delete node.dataset.v2662MobileHidden;
          for (const property of [
            "display", "visibility", "height", "min-height", "max-height",
            "margin", "padding", "border", "overflow", "pointer-events"
          ]) clearImportant(node, property);
        }
      });
    }
  }

  function resizeConversation(mobile) {
    const section = document.querySelector("#deal-drawer .chat-only-section.v2645-deal-chat");
    const messages = document.querySelector("#deal-drawer #drawer-messages.v2645-messages");
    const composer = document.querySelector("#deal-drawer .v2645-composer");

    if (mobile) {
      if (section) {
        section.dataset.v2662MobileLayout = "1";
        setImportant(section, "display", "grid");
        setImportant(section, "grid-template-rows", "minmax(0, 1fr) auto");
        setImportant(section, "height", "100%");
        setImportant(section, "min-height", "0");
        setImportant(section, "max-height", "100%");
        setImportant(section, "overflow", "hidden");
      }

      if (messages) {
        messages.dataset.v2662MobileLayout = "1";
        setImportant(messages, "grid-row", "1");
        setImportant(messages, "height", "100%");
        setImportant(messages, "min-height", "0");
        setImportant(messages, "max-height", "none");
        setImportant(messages, "overflow-x", "hidden");
        setImportant(messages, "overflow-y", "auto");
        setImportant(messages, "-webkit-overflow-scrolling", "touch");
        setImportant(messages, "touch-action", "pan-y");
      }

      if (composer) {
        composer.dataset.v2662MobileLayout = "1";
        setImportant(composer, "grid-row", "2");
        setImportant(composer, "display", "block");
        setImportant(composer, "height", "auto");
        setImportant(composer, "min-height", "0");
        setImportant(composer, "max-height", "92px");
        setImportant(composer, "margin", "0");
        setImportant(composer, "padding", "6px 8px calc(7px + env(safe-area-inset-bottom))");
        setImportant(composer, "overflow", "visible");
      }
    } else {
      for (const node of [section, messages, composer]) {
        if (!node || node.dataset.v2662MobileLayout !== "1") continue;
        delete node.dataset.v2662MobileLayout;
        for (const property of [
          "display", "grid-template-rows", "grid-row", "height", "min-height",
          "max-height", "overflow", "overflow-x", "overflow-y",
          "-webkit-overflow-scrolling", "touch-action", "margin", "padding"
        ]) clearImportant(node, property);
      }
    }
  }

  let scheduled = false;
  function apply() {
    scheduled = false;
    const mobile = window.matchMedia?.(MOBILE_QUERY)?.matches === true;
    hideSecondaryTools(mobile);
    resizeConversation(mobile);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  function install() {
    apply();

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "style"]
    });

    const media = window.matchMedia?.(MOBILE_QUERY);
    if (media?.addEventListener) media.addEventListener("change", schedule);
    else media?.addListener?.(schedule);

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(schedule, 80), { passive: true });
    document.addEventListener("click", (event) => {
      if (event.target.closest("#deal-drawer,[data-v2651-deal],[data-deal-id]")) {
        setTimeout(schedule, 0);
        setTimeout(schedule, 120);
      }
    }, true);

    setTimeout(schedule, 250);
    setTimeout(schedule, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
