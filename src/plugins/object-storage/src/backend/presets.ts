import type { ProviderInfo } from "../shared/types.js";

// Endpoint templates. {region} and {accountId} are filled in by the form.
export const providers: ProviderInfo[] = [
  {
    id: "aws",
    endpoint: "https://s3.{region}.amazonaws.com",
    region: "us-east-1",
    pathStyle: false,
  },
  {
    id: "minio",
    endpoint: "http://minio.local:9000",
    region: "us-east-1",
    pathStyle: true,
  },
  {
    id: "r2",
    endpoint: "https://{accountId}.r2.cloudflarestorage.com",
    region: "auto",
    pathStyle: true,
    needsAccountId: true,
  },
  {
    id: "b2",
    endpoint: "https://s3.{region}.backblazeb2.com",
    region: "us-west-004",
    pathStyle: true,
  },
  {
    id: "wasabi",
    endpoint: "https://s3.{region}.wasabisys.com",
    region: "us-east-1",
    pathStyle: false,
  },
  {
    id: "spaces",
    endpoint: "https://{region}.digitaloceanspaces.com",
    region: "nyc3",
    pathStyle: false,
  },
  {
    id: "hetzner",
    endpoint: "https://{region}.your-objectstorage.com",
    region: "fsn1",
    pathStyle: false,
  },
  {
    id: "other",
    endpoint: "https://s3.example.com",
    region: "us-east-1",
    pathStyle: true,
  },
];

export const providerIds = providers.map((p) => p.id);
