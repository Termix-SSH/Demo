import { useEffect, useRef, useState } from "react";
import {
  Button,
  Select2,
  LoadingState,
  getUserList,
  roleLabel,
  type Role,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AccordionSection } from "./AdminSettingsShared";
import {
  hasUserAdminApi,
  requireUserAdminApi,
  type AccessKind,
  type AccessReviewFilter,
  type AccessReviewRow,
} from "./user-admin-api";

const PAGE_SIZE = 50;

function shortDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function AdminAccessReviewSection({
  open,
  onToggle,
  roles,
  initialUserId,
}: {
  open: boolean;
  onToggle: () => void;
  roles: Role[];
  /** Starts filtered to one user, as on the user's own page. */
  initialUserId?: string;
}) {
  const { t } = useTranslation();
  const supported = hasUserAdminApi(
    "getAccessReview",
    "downloadAccessReviewCsv",
  );
  const [kind, setKind] = useState<AccessKind | "">("");
  const [userId, setUserId] = useState(initialUserId ?? "");
  const [roleId, setRoleId] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AccessReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const [users, setUsers] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    if (!open || !supported || initialUserId) return;
    getUserList()
      .then(({ users: list }) =>
        setUsers(
          list.map((user) => ({
            id: user.userId,
            label:
              (user as { display_name?: string | null }).display_name ||
              user.username,
          })),
        ),
      )
      .catch(() => {});
  }, [open, supported, initialUserId]);

  const filter: AccessReviewFilter = {
    ...(kind ? { kind } : {}),
    ...(userId ? { userId } : {}),
    ...(roleId ? { roleId: Number(roleId) } : {}),
  };

  function load() {
    if (!supported) return;
    const request = ++requestRef.current;
    setLoading(true);
    requireUserAdminApi()
      .getAccessReview({
        ...filter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      .then((result) => {
        if (request !== requestRef.current) return;
        setRows(result.shares);
        setTotal(result.total);
      })
      .catch(() => {})
      .finally(() => {
        if (request === requestRef.current) setLoading(false);
      });
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, userId, roleId, page]);

  useEffect(() => setPage(0), [kind, userId, roleId]);

  if (!supported) return null;

  async function exportCsv() {
    try {
      const blob = await requireUserAdminApi().downloadAccessReviewCsv(filter);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "termix-access-review.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("admin.accessExportFailed"));
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectClass =
    "h-7 border border-border bg-(--field) px-2 text-xs text-foreground outline-none";

  return (
    <AccordionSection
      label={t("admin.sectionAccess")}
      icon={<ShieldCheck className="size-3.5" />}
      open={open}
      onToggle={onToggle}
    >
      <div className="flex flex-col pt-2">
        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-[10px] text-muted-foreground">
            {t("admin.accessCount", { count: total })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={load}
              title={t("common.refresh")}
              aria-label={t("common.refresh")}
            >
              <RefreshCw className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => void exportCsv()}
            >
              <Download className="size-3" />
              {t("admin.accessExport")}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 py-2 border-b border-border">
          <Select2
            value={kind}
            onChange={(e) => setKind(e.target.value as AccessKind | "")}
            aria-label={t("admin.accessKind")}
            className={selectClass}
          >
            <option value="">{t("admin.accessKindAll")}</option>
            <option value="host">{t("admin.accessKind_host")}</option>
            <option value="folder">{t("admin.accessKind_folder")}</option>
            <option value="credential">
              {t("admin.accessKind_credential")}
            </option>
          </Select2>
          {!initialUserId && (
            <Select2
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              aria-label={t("admin.accessUser")}
              className={selectClass}
            >
              <option value="">{t("admin.accessAnyUser")}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </Select2>
          )}
          <Select2
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            aria-label={t("admin.accessRole")}
            className={selectClass}
          >
            <option value="">{t("admin.accessAnyRole")}</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {roleLabel(t, role.displayName)}
              </option>
            ))}
          </Select2>
        </div>

        {loading && rows.length === 0 ? (
          <LoadingState />
        ) : (
          rows.map((row) => (
            <div
              key={`${row.kind}-${row.accessId}`}
              className="flex flex-col gap-0.5 py-2 border-b border-border last:border-0"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[9px] font-semibold px-1 py-px border border-border text-muted-foreground shrink-0">
                  {t(`admin.accessKind_${row.kind}`)}
                </span>
                <span className="truncate text-xs font-semibold">
                  {row.targetName}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {row.permissionLevel}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {[
                  row.granteeUsername
                    ? t("admin.accessToUser", { name: row.granteeUsername })
                    : row.granteeRoleName
                      ? t("admin.accessToRole", { name: row.granteeRoleName })
                      : null,
                  row.ownerUsername
                    ? t("admin.accessOwner", { name: row.ownerUsername })
                    : null,
                  row.grantedByUsername
                    ? t("admin.accessGrantedBy", {
                        name: row.grantedByUsername,
                      })
                    : null,
                  row.expiresAt
                    ? t("admin.accessExpires", {
                        date: shortDate(row.expiresAt),
                      })
                    : null,
                  row.lastAccessedAt
                    ? t("admin.accessLastUsed", {
                        date: shortDate(row.lastAccessedAt),
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" | ")}
              </span>
            </div>
          ))
        )}
        {!loading && rows.length === 0 && (
          <div className="py-4 text-center text-[10px] text-muted-foreground">
            {t("admin.accessEmpty")}
          </div>
        )}
        {pageCount > 1 && (
          <div className="flex items-center justify-between py-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] rounded-none"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              {t("common.previous")}
            </Button>
            <span className="text-[10px] text-muted-foreground">
              {t("admin.pageOf", { page: page + 1, total: pageCount })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] rounded-none"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("common.next")}
            </Button>
          </div>
        )}
      </div>
    </AccordionSection>
  );
}
