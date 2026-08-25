(() => {
  const addScript = (src, done) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    if (done) script.addEventListener("load", done, { once: true });
    document.head.appendChild(script);
  };
  const addCss = (href) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = href;
    document.head.appendChild(css);
  };
  addCss("/v24.css?v=24.0");
  addCss("/v24-1.css?v=24.1");
  addScript("/v22-core.js?v=22-core", () => addScript("/v24.js?v=24.0", () => addScript("/v24-1.js?v=24.1")));
})();
