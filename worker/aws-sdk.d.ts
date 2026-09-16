// The AWS SDK packages ship runtime modules without declarations in this
// Worker bundle. Wrangler bundles these imports; keep the type fallback local
// so the application and Worker builds can share one strict TypeScript pass.
declare module "@aws-sdk/client-s3";
declare module "@aws-sdk/client-sesv2";
