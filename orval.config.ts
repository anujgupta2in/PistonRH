import { defineConfig } from "orval";

export default defineConfig({
  api_zod: {
    input: "./lib/api-spec/openapi.yaml",
    output: {
      mode: "single",
      target: "./lib/api-zod/src/generated/api.ts",
      client: "zod",
      override: {
        zod: {
          coerce: {
            param: true,
          },
        },
      },
      fileExtension: ".ts",
    },
  },
  api_client_react: {
    input: "./lib/api-spec/openapi.yaml",
    output: {
      mode: "single",
      target: "./lib/api-client-react/src/generated/api.ts",
      client: "react-query",
      httpClient: "fetch",
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: "./lib/api-client-react/src/custom-fetch.ts",
          name: "customFetch",
        },
        query: {
          useQuery: true,
        },
      },
      fileExtension: ".ts",
    },
  },
});
