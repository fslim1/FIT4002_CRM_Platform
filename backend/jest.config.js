module.exports = {
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/**/*.test.js'],
    // setupFiles run before each test file is loaded, so environment variables
    // are in place before app.js reads them at require time.
    setupFiles: ['<rootDir>/tests/setup-env.js'],
    // globalSetup resolves a mongod once for the whole run (see tests/README.md).
    globalSetup: '<rootDir>/tests/globalSetup.js',
    globalTeardown: '<rootDir>/tests/globalTeardown.js',
    testTimeout: 30000,
    clearMocks: true,
}
