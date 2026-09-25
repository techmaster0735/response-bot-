const loaded = require("../server/index.js");

module.exports = function handler(req, res) {
  const app =
    typeof loaded === "function"
      ? loaded
      : loaded && typeof loaded.default === "function"
        ? loaded.default
        : loaded && typeof loaded.app === "function"
          ? loaded.app
          : loaded && typeof loaded.handle === "function"
            ? loaded
            : loaded && loaded.default && typeof loaded.default.handle === "function"
              ? loaded.default
              : null;

  if (!app) {
    return res.status(500).json({
      ok: false,
      error: "Express application could not be loaded."
    });
  }

  if (typeof app === "function") {
    return app(req, res);
  }

  return app.handle(req, res);
};