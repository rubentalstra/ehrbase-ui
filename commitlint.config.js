/** Conventional Commits — docs/architecture.md §17 Conventions. */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [2, 'never', ['pascal-case', 'upper-case']],
    'body-max-line-length': [1, 'always', 100],
  },
}
