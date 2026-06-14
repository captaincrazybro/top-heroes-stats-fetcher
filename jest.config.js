// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.js'],
  moduleNameMapper: {
    '^pocketbase$': '<rootDir>/tests/__mocks__/pocketbase.js',
    '^@anthropic-ai/sdk$': '<rootDir>/tests/__mocks__/@anthropic-ai/sdk.js',
    '^sharp$': '<rootDir>/tests/__mocks__/sharp.js',
  },
};
