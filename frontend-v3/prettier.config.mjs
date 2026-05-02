/**
 * @type {import('prettier').Config}
 * `bracketSameLine` replaces Prettier’s deprecated `jsxBracketSameLine` (same meaning).
 */
const config = {
  arrowParens: 'always',
  bracketSpacing: true,
  /** closing `>` of multiline HTML/JSX on its own line */
  bracketSameLine: false,
  htmlWhitespaceSensitivity: 'css',
  insertPragma: false,
  jsxSingleQuote: true,
  printWidth: 80,
  proseWrap: 'always',
  quoteProps: 'as-needed',
  requirePragma: false,
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
};

export default config;
