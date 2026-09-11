import type { Language } from "./codegen";

/** GitHub Actions workflow that runs the generated project's tests. */
export function workflowYaml(language: Language, testCommand: string, dir: string): string {
  const setup =
    language === "python"
      ? `      - uses: actions/setup-python@v7
        with:
          python-version: "3.12"
      - run: pip install pytest && ( [ -f requirements.txt ] && pip install -r requirements.txt || true )`
      : language === "node"
        ? `      - uses: actions/setup-node@v7
        with:
          node-version: "22"
      - run: '[ -f package.json ] && [ -f package-lock.json ] && npm ci || true'`
        : `      - uses: actions/setup-java@v6
        with:
          distribution: temurin
          java-version: "21"
          cache: maven`;

  // Quote the command for YAML safety.
  const cmd = JSON.stringify(testCommand);

  return `name: aetheris-factory
on:
  push:
    branches: ["run/**"]
permissions:
  contents: read
concurrency:
  group: \${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    defaults:
      run:
        working-directory: ${dir}
    steps:
      - uses: actions/checkout@v7
${setup}
      - name: Run tests
        run: ${cmd}
`;
}
