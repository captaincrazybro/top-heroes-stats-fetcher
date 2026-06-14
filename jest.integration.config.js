module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.integration.test.js'],
  // pocketbase ships its main entry as an ES module (.mjs); Jest's CommonJS
  // runner can't inherit prototypes correctly from it, so explicitly use the
  // CJS build so that RecordService methods (getOne, delete, etc.) are intact.
  moduleNameMapper: {
    '^pocketbase$': '<rootDir>/node_modules/pocketbase/dist/pocketbase.cjs.js',
  },
};
