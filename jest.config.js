/** @type {import('jest').Config} */
const shared = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: { "^(\.{1,2}/.*)\.js$": "$1" },
};

module.exports = {
  projects: [
    {
      ...shared,
      displayName: "unit",
      testMatch: ["<rootDir>/src/**/*.test.ts"],
    },
    {
      ...shared,
      displayName: "e2e",
      testMatch: ["<rootDir>/tests/e2e/**/*.e2e.test.ts"],
      setupFilesAfterEnv: ["<rootDir>/tests/e2e/setup.ts"],
    },
  ],
};
