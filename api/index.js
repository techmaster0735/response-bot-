const app = require("../server/index.js");

module.exports = function handler(req, res) {
  return app(req, res);
};