// Used by Jest only (the app runs on Node directly). It must be a root
// babel.config.js, not a "babel" key in package.json: only a root config is
// applied to files inside node_modules, and Jest has to compile Prisma's
// runtime (.mjs) and the generated client (.mts) to CommonJS.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],
  plugins: ['babel-plugin-transform-import-meta'],
};
