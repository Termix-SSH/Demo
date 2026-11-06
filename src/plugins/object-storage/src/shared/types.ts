export interface ProviderInfo {
  id: string;
  // {region} and {accountId} are filled in by the form
  endpoint: string;
  region: string;
  pathStyle: boolean;
  needsAccountId?: boolean;
}

export interface Account {
  id: number;
  provider: string;
  name: string;
  endpoint: string;
  region: string;
  pathStyle: boolean;
  hasCa: boolean;
  status: string;
  lastError: string | null;
  lastCheckAt: string | null;
}

export interface AccountInput {
  provider?: string;
  name: string;
  endpoint: string;
  region: string;
  pathStyle: boolean;
  ca?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface BucketRow {
  name: string;
  createdAt: string | null;
  bytes: number | null;
  objects: number | null;
  partial: boolean;
  scannedAt: string | null;
  maxBytes: number | null;
  maxObjects: number | null;
}

export interface ObjectRow {
  key: string;
  size: number;
  modifiedAt: string | null;
  etag: string | null;
  storageClass: string | null;
}

export interface Listing {
  prefix: string;
  folders: string[];
  objects: ObjectRow[];
  next: string | null;
}

export interface ObjectHead {
  key: string;
  size: number;
  contentType: string | null;
  modifiedAt: string | null;
  etag: string | null;
  metadata: Record<string, string>;
}

export interface UsagePoint {
  day: string;
  bytes: number;
  objects: number;
}

export interface LifecycleRule {
  id: string;
  prefix: string;
  enabled: boolean;
  expireDays: number | null;
  noncurrentDays: number | null;
  abortUploadDays: number | null;
}

export interface CorsRule {
  origins: string[];
  methods: string[];
  headers: string[];
  maxAge: number | null;
}

export interface PublicAccessBlock {
  blockPublicAcls: boolean;
  ignorePublicAcls: boolean;
  blockPublicPolicy: boolean;
  restrictPublicBuckets: boolean;
}

export interface BucketSettings {
  versioning: { supported: boolean; status: string };
  lifecycle: { supported: boolean; rules: LifecycleRule[] };
  cors: { supported: boolean; rules: CorsRule[] };
  policy: { supported: boolean; text: string };
  tags: { supported: boolean; tags: Array<{ key: string; value: string }> };
  encryption: { supported: boolean; enabled: boolean };
  publicAccess: { supported: boolean; block: PublicAccessBlock };
}

export type SettingKind = keyof BucketSettings;

export interface Summary {
  accounts: number;
  failingAccounts: number;
  buckets: number;
  bytes: number;
  overQuota: Array<{ account: string; bucket: string; percent: number }>;
}
