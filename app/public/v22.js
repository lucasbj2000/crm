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
  addCss("/v25.css?v=25.2.1");
  addCss("/v25-3.css?v=25.3");
  addCss("/v25-4.css?v=25.4.1");
  addCss("/v25-4-2.css?v=25.4.2");
  addScript("/v22-core.js?v=22-core", () =>
    addScript("/v24.js?v=24.0", () =>
      addScript("/v24-1.js?v=24.1", () =>
        addScript("/v25-2-1.js?v=25.2.1", () =>
          addScript("/v25-3.js?v=25.3", () =>
            addScript("/v25.js?v=25.2.1", () =>
              addScript("/v25-4.js?v=25.4", () =>
                addScript("/v25-4-1.js?v=25.4.2")
              )
            )
          )
        )
      )
    )
  );
})();
