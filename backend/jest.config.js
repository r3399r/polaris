/* eslint-env node */
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

module.exports = {
  cacheDirectory: '<rootDir>/tmp/test/cache',
  coverageDirectory: '<rootDir>/coverage',
  /**
   * Ignored during coverage analysis: these only construct external clients --
   * connection pools, the AWS sdk, the Google sdk -- which are mocked in every
   * test, so they can never be covered by a suite that touches no real service.
   */
  coveragePathIgnorePatterns: [
    '<rootDir>/src/db/mysql.ts',
    '<rootDir>/src/db/cockroach.ts',
    '<rootDir>/src/lib/'
  ],
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'cobertura', 'html'],
  // coverageThreshold: {
  //   global: {
  //     branches: 80,
  //     functions: 80,
  //     lines: 80,
  //     statements: 80,
  //   },
  // },
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/',
  }),
  preset: 'ts-jest',
  roots: ['<rootDir>/src/'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
};
