 const loaded = require("../server/index.js");

const app =
  typeof loaded === "function"
    ? loaded
    : loaded && typeof loaded.default === "function"
      ? loaded.default
      : null;

if (!app) {
  throw new Error("Could not load the Express application from server/index.js");
}

module.exports = app;