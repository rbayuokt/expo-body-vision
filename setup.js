// Subpath entry so the main entry stays free of Skia and Reanimated. A real file rather than
// only an "exports" map, so bundlers without package exports support resolve it too.
module.exports = require('./build/setup');
