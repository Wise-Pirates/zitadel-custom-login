// Config mínima usada pelo CI (custom-login-casts.yml): só a regra dos duplos casts.
// Não precisa do @zitadel/proto gerado, porque só olha para a AST.
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  { ignores: ["node_modules/**", ".next/**", "dockerized/**", "acceptance/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tsParser, ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
    // Plugins registados sem regras, para os eslint-disable do upstream continuarem válidos.
    plugins: { "@typescript-eslint": tsPlugin, "react-hooks": reactHooksPlugin },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSAsExpression.expression[typeAnnotation.type='TSUnknownKeyword']",
          message: "Duplo cast `as unknown as` cala o compilador. Corrige o tipo na origem.",
        },
        {
          selector: "TSAsExpression[typeAnnotation.type='TSNeverKeyword']",
          message: "`as never` cala o compilador. Corrige o tipo na origem.",
        },
        {
          selector: "TSTypeAssertion > TSTypeAssertion.expression[typeAnnotation.type='TSUnknownKeyword']",
          message: "Duplo cast `<unknown>` cala o compilador. Corrige o tipo na origem.",
        },
      ],
    },
  },
];
