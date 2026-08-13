import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      // 플러그인에 번들한 검증기와 제3자 의존성은 생성기가 책임진다.
      "plugins/lounge-deploy/runtime/**",
      // Schema에서 생성한 파일은 생성기가 형식을 책임진다.
      "**/src/generated/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
      },
    },
  },
  {
    files: ["tests/plugin-e2e/fixtures/**/*.js"],
    languageOptions: {
      globals: {
        document: "readonly",
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
