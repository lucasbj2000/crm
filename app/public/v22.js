(() => {
  const addScript = (src, done) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    if (done) script.addEventListener("load", done, { once: true });
    document.head.appendChild(script);
  };
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/v24.css?v=24.0";
  document.head.appendChild(css);
  addScript("/v22-core.js?v=22-core", () => addScript("/v24.js?v=24.0"));
})();
