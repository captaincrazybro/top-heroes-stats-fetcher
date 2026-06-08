// jest.config.js
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^pocketbase$': '<rootDir>/tests/__mocks__/pocketbase.js',
  },
};
