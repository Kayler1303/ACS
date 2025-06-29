// @ts-check

import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

const compat = new FlatCompat({
    baseDirectory: __dirname,
    resolvePluginsRelativeTo: __dirname,
});

const eslintConfig = [
    ...compat.extends("next/core-web-vitals", "next/typescript"),
    {
        rules: {
            "react/no-unescaped-entities": "off",
            "@typescript-eslint/no-unused-vars": "off"
        }
    }
];

export default eslintConfig;
