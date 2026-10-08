const created = "2026-08-14T09:12:00.000Z";

function credential(seed: {
  id: number;
  name: string;
  username: string;
  authType: "password" | "key";
  folder?: string;
  description?: string;
  tags?: string[];
  usageCount?: number;
  pin?: boolean;
}) {
  const isKey = seed.authType === "key";
  return {
    folder: "",
    description: "",
    tags: [] as string[],
    usageCount: 0,
    pin: false,
    sortOrder: seed.id,
    publicKey: isKey
      ? `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoOnly${seed.id}PlaceholderKeyMaterial ${seed.username}@termix`
      : undefined,
    keyType: isKey ? "ssh-ed25519" : undefined,
    detectedKeyType: isKey ? "ssh-ed25519" : undefined,
    hasCertPublicKey: false,
    lastUsed: "2026-10-07T18:40:00.000Z",
    createdAt: created,
    updatedAt: created,
    ...seed,
  };
}

export const DEMO_CREDENTIALS = [
  credential({
    id: 1,
    name: "deploy key",
    username: "deploy",
    authType: "key",
    folder: "Production",
    description: "Shared deploy identity for production web nodes",
    tags: ["prod"],
    usageCount: 3,
    pin: true,
  }),
  credential({
    id: 2,
    name: "postgres admin",
    username: "postgres",
    authType: "key",
    folder: "Production",
    description: "Database maintenance account",
    tags: ["prod", "db"],
  }),
  credential({
    id: 3,
    name: "homelab root",
    username: "root",
    authType: "password",
    folder: "Homelab",
    description: "Local-only hypervisor and NAS access",
    tags: ["lab"],
    usageCount: 3,
  }),
  credential({
    id: 4,
    name: "raspberry pi",
    username: "pi",
    authType: "key",
    folder: "Homelab",
    tags: ["lab"],
    usageCount: 1,
  }),
  credential({
    id: 5,
    name: "break glass",
    username: "admin",
    authType: "password",
    description: "Emergency console login. Rotate after use.",
    tags: ["emergency"],
  }),
];
