import type {
  BucketSettings,
  CorsRule,
  LifecycleRule,
  PublicAccessBlock,
  SettingKind,
} from "../../shared/types.js";
import { S3Error, type S3Client } from "./client.js";
import { all, child, childText, escapeXml } from "./xml.js";

// Answers that mean "nothing is set" rather than "something broke"
const EMPTY = new Set([
  "NoSuchLifecycleConfiguration",
  "NoSuchCORSConfiguration",
  "NoSuchBucketPolicy",
  "NoSuchTagSet",
  "ServerSideEncryptionConfigurationNotFoundError",
  "NoSuchPublicAccessBlockConfiguration",
  "NoSuchWebsiteConfiguration",
]);

const UNSUPPORTED = new Set([
  "NotImplemented",
  "MethodNotAllowed",
  "XNotImplemented",
  "InvalidRequest",
  "AccessDenied",
  "UnsupportedOperation",
]);

function unsupported(error: unknown): boolean {
  return (
    error instanceof S3Error &&
    (error.status === 501 ||
      error.status === 405 ||
      UNSUPPORTED.has(error.code))
  );
}

async function guarded<T>(
  read: () => Promise<T>,
  empty: T,
  off: T,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof S3Error && EMPTY.has(error.code)) return empty;
    if (unsupported(error)) return off;
    throw error;
  }
}

const num = (value: string | undefined) => {
  const n = Number(value);
  return value && Number.isFinite(n) ? n : null;
};

export async function readSettings(
  client: S3Client,
  bucket: string,
): Promise<BucketSettings> {
  const [versioning, lifecycle, cors, policy, tags, encryption, publicAccess] =
    await Promise.all([
      guarded(
        async () => {
          const root = await client.readSub(bucket, "versioning");
          return {
            supported: true,
            status: childText(root, "Status") ?? "Off",
          };
        },
        { supported: true, status: "Off" },
        { supported: false, status: "Off" },
      ),
      guarded(
        async () => {
          const root = await client.readSub(bucket, "lifecycle");
          return {
            supported: true,
            rules: all(root, "Rule").map((rule): LifecycleRule => ({
              id: childText(rule, "ID") ?? "",
              prefix:
                childText(rule, "Prefix") ??
                childText(child(rule, "Filter"), "Prefix") ??
                "",
              enabled: childText(rule, "Status") !== "Disabled",
              expireDays: num(childText(child(rule, "Expiration"), "Days")),
              noncurrentDays: num(
                childText(
                  child(rule, "NoncurrentVersionExpiration"),
                  "NoncurrentDays",
                ),
              ),
              abortUploadDays: num(
                childText(
                  child(rule, "AbortIncompleteMultipartUpload"),
                  "DaysAfterInitiation",
                ),
              ),
            })),
          };
        },
        { supported: true, rules: [] },
        { supported: false, rules: [] },
      ),
      guarded(
        async () => {
          const root = await client.readSub(bucket, "cors");
          return {
            supported: true,
            rules: all(root, "CORSRule").map((rule): CorsRule => ({
              origins: all(rule, "AllowedOrigin").map((n) => n.text),
              methods: all(rule, "AllowedMethod").map((n) => n.text),
              headers: all(rule, "AllowedHeader").map((n) => n.text),
              maxAge: num(childText(rule, "MaxAgeSeconds")),
            })),
          };
        },
        { supported: true, rules: [] },
        { supported: false, rules: [] },
      ),
      guarded(
        async () => ({
          supported: true,
          text: await client.readSubText(bucket, "policy"),
        }),
        { supported: true, text: "" },
        { supported: false, text: "" },
      ),
      guarded(
        async () => {
          const root = await client.readSub(bucket, "tagging");
          return {
            supported: true,
            tags: all(child(root, "TagSet"), "Tag").map((tag) => ({
              key: childText(tag, "Key") ?? "",
              value: childText(tag, "Value") ?? "",
            })),
          };
        },
        { supported: true, tags: [] },
        { supported: false, tags: [] },
      ),
      guarded(
        async () => {
          const root = await client.readSub(bucket, "encryption");
          const rule = child(root, "Rule");
          const algorithm = childText(
            child(rule, "ApplyServerSideEncryptionByDefault"),
            "SSEAlgorithm",
          );
          return { supported: true, enabled: !!algorithm };
        },
        { supported: true, enabled: false },
        { supported: false, enabled: false },
      ),
      guarded(
        async () => {
          const root = await client.readSub(bucket, "publicAccessBlock");
          const flag = (name: string) => childText(root, name) === "true";
          return {
            supported: true,
            block: {
              blockPublicAcls: flag("BlockPublicAcls"),
              ignorePublicAcls: flag("IgnorePublicAcls"),
              blockPublicPolicy: flag("BlockPublicPolicy"),
              restrictPublicBuckets: flag("RestrictPublicBuckets"),
            },
          };
        },
        { supported: true, block: noBlock() },
        { supported: false, block: noBlock() },
      ),
    ]);
  return {
    versioning,
    lifecycle,
    cors,
    policy,
    tags,
    encryption,
    publicAccess,
  };
}

const noBlock = (): PublicAccessBlock => ({
  blockPublicAcls: false,
  ignorePublicAcls: false,
  blockPublicPolicy: false,
  restrictPublicBuckets: false,
});

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];

const days = (value: unknown): number | null => {
  const n = Number(value);
  return value !== null && value !== "" && Number.isInteger(n) && n > 0
    ? n
    : null;
};

function lifecycleXml(rules: LifecycleRule[]): string {
  return `<LifecycleConfiguration>${rules
    .map((rule, index) => {
      const parts = [
        `<ID>${escapeXml(rule.id || `rule-${index + 1}`)}</ID>`,
        `<Filter><Prefix>${escapeXml(rule.prefix ?? "")}</Prefix></Filter>`,
        `<Status>${rule.enabled === false ? "Disabled" : "Enabled"}</Status>`,
      ];
      const expire = days(rule.expireDays);
      const old = days(rule.noncurrentDays);
      const abort = days(rule.abortUploadDays);
      if (expire) parts.push(`<Expiration><Days>${expire}</Days></Expiration>`);
      if (old) {
        parts.push(
          `<NoncurrentVersionExpiration><NoncurrentDays>${old}</NoncurrentDays></NoncurrentVersionExpiration>`,
        );
      }
      if (abort) {
        parts.push(
          `<AbortIncompleteMultipartUpload><DaysAfterInitiation>${abort}</DaysAfterInitiation></AbortIncompleteMultipartUpload>`,
        );
      }
      return `<Rule>${parts.join("")}</Rule>`;
    })
    .join("")}</LifecycleConfiguration>`;
}

function corsXml(rules: CorsRule[]): string {
  return `<CORSConfiguration>${rules
    .map((rule) => {
      const maxAge = days(rule.maxAge);
      return `<CORSRule>${list(rule.origins)
        .map((o) => `<AllowedOrigin>${escapeXml(o)}</AllowedOrigin>`)
        .join("")}${list(rule.methods)
        .map((m) => `<AllowedMethod>${escapeXml(m)}</AllowedMethod>`)
        .join("")}${list(rule.headers)
        .map((h) => `<AllowedHeader>${escapeXml(h)}</AllowedHeader>`)
        .join(
          "",
        )}${maxAge ? `<MaxAgeSeconds>${maxAge}</MaxAgeSeconds>` : ""}</CORSRule>`;
    })
    .join("")}</CORSConfiguration>`;
}

/** Saves one kind of bucket setting. An empty list removes the setting. */
export async function writeSetting(
  client: S3Client,
  bucket: string,
  kind: SettingKind,
  value: unknown,
): Promise<void> {
  const input = (value ?? {}) as Record<string, unknown>;
  switch (kind) {
    case "versioning": {
      const status = input.status === "Enabled" ? "Enabled" : "Suspended";
      await client.writeSub(
        bucket,
        "versioning",
        `<VersioningConfiguration><Status>${status}</Status></VersioningConfiguration>`,
      );
      return;
    }
    case "lifecycle": {
      const rules = (input.rules ?? []) as LifecycleRule[];
      if (!rules.length) await client.deleteSub(bucket, "lifecycle");
      else await client.writeSub(bucket, "lifecycle", lifecycleXml(rules));
      return;
    }
    case "cors": {
      const rules = ((input.rules ?? []) as CorsRule[]).filter(
        (rule) => list(rule.origins).length && list(rule.methods).length,
      );
      if (!rules.length) await client.deleteSub(bucket, "cors");
      else await client.writeSub(bucket, "cors", corsXml(rules));
      return;
    }
    case "policy": {
      const text = String(input.text ?? "").trim();
      if (!text) {
        await client.deleteSub(bucket, "policy");
        return;
      }
      try {
        JSON.parse(text);
      } catch {
        throw new S3Error(400, "InvalidPolicy", "The policy is not valid JSON");
      }
      await client.writeSub(bucket, "policy", text, "application/json");
      return;
    }
    case "tags": {
      const tags = ((input.tags ?? []) as Array<{ key: string; value: string }>)
        .map((tag) => ({
          key: String(tag.key ?? "").trim(),
          value: String(tag.value ?? ""),
        }))
        .filter((tag) => tag.key);
      if (!tags.length) await client.deleteSub(bucket, "tagging");
      else {
        await client.writeSub(
          bucket,
          "tagging",
          `<Tagging><TagSet>${tags
            .map(
              (tag) =>
                `<Tag><Key>${escapeXml(tag.key)}</Key><Value>${escapeXml(tag.value)}</Value></Tag>`,
            )
            .join("")}</TagSet></Tagging>`,
        );
      }
      return;
    }
    case "encryption": {
      if (!input.enabled) {
        await client.deleteSub(bucket, "encryption");
        return;
      }
      await client.writeSub(
        bucket,
        "encryption",
        "<ServerSideEncryptionConfiguration><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>AES256</SSEAlgorithm></ApplyServerSideEncryptionByDefault></Rule></ServerSideEncryptionConfiguration>",
      );
      return;
    }
    case "publicAccess": {
      const block = (input.block ?? {}) as Partial<PublicAccessBlock>;
      const flag = (v: unknown) => (v ? "true" : "false");
      await client.writeSub(
        bucket,
        "publicAccessBlock",
        `<PublicAccessBlockConfiguration><BlockPublicAcls>${flag(block.blockPublicAcls)}</BlockPublicAcls><IgnorePublicAcls>${flag(block.ignorePublicAcls)}</IgnorePublicAcls><BlockPublicPolicy>${flag(block.blockPublicPolicy)}</BlockPublicPolicy><RestrictPublicBuckets>${flag(block.restrictPublicBuckets)}</RestrictPublicBuckets></PublicAccessBlockConfiguration>`,
      );
      return;
    }
  }
}
