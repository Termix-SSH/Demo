import { getErrorMessage, type SnippetInput } from "./helpers.js";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  invokeAction,
  useTranslation,
  useHosts,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Input,
  Textarea,
  Checkbox,
  FOLDER_COLORS,
  Select2,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InlineView,
  useConfirm,
  AddButton,
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  PanelSearch,
  BackButton,
  FormFooter,
  TabStrip,
  Segmented,
} from "@termix-ssh/plugin-sdk/ui";
import { toast } from "sonner";
import {
  Boxes,
  Check,
  Download,
  ExternalLink,
  Loader2,
  Package,
  Play,
  RefreshCw,
  Server,
  Settings2,
  Share2,
  Shield,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import type {
  FleetsApi,
  FleetRow,
  FleetMemberRow,
  FleetHostResult,
  FleetInventoryEntry,
  FleetPackageAction,
  FleetShareHostResult,
  ShareableUser,
  ShareableRole,
  SharePermissionLevel,
  ShareTarget,
} from "./fleets-api.js";
import { docsUrl } from "./docs";

const SHARE_PERMISSION_LEVELS: SharePermissionLevel[] = [
  "connect",
  "view",
  "edit",
  "manage",
];

const SHARE_EXPIRY_PRESETS = [
  { key: "never", hours: undefined },
  { key: "oneHour", hours: 1 },
  { key: "oneDay", hours: 24 },
  { key: "sevenDays", hours: 24 * 7 },
  { key: "thirtyDays", hours: 24 * 30 },
  { key: "custom", hours: undefined },
] as const;

type ShareExpiryPresetKey = (typeof SHARE_EXPIRY_PRESETS)[number]["key"];

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "-";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ResultsList({ results }: { results: FleetHostResult[] }) {
  const { t } = useTranslation();
  if (results.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {results.map((r) => (
        <div
          key={r.hostId}
          className="flex flex-col gap-1 border border-border p-2.5"
        >
          <div className="flex items-center gap-2">
            <Server className="size-3 shrink-0 text-muted-foreground" />
            <span className="text-xs font-semibold">{r.hostName}</span>
            <span
              className={`ml-auto text-[10px] px-1.5 py-0.5 ${
                r.success
                  ? "bg-green-500/10 text-green-500"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {r.success
                ? t("newUi.sidebar.fleets.resultSuccess")
                : t("newUi.sidebar.fleets.resultFailed")}
            </span>
          </div>
          {(r.output || r.error) && (
            <pre className="text-xs bg-muted/30 p-2 overflow-x-auto whitespace-pre-wrap font-mono text-muted-foreground max-h-40">
              {r.error ? r.error : r.output}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function FleetFormDialog({
  api,
  open,
  onClose,
  fleet,
  onSaved,
}: {
  api: FleetsApi;
  open: boolean;
  onClose: () => void;
  fleet: FleetRow | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(FOLDER_COLORS[0]);
  const [tagRulesText, setTagRulesText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(fleet?.name ?? "");
    setDescription(fleet?.description ?? "");
    setColor(fleet?.color ?? FOLDER_COLORS[0]);
    setTagRulesText((fleet?.tagRules ?? []).join(", "));
  }, [open, fleet]);

  async function handleSave() {
    if (!name.trim()) {
      toast.error(t("newUi.sidebar.fleets.nameRequired"));
      return;
    }
    const tagRules = tagRulesText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      if (fleet) {
        await api.update(fleet.id, {
          name: name.trim(),
          description: description.trim() || null,
          color,
          tagRules,
        });
        toast.success(t("newUi.sidebar.fleets.fleetUpdated"));
      } else {
        await api.create({
          name: name.trim(),
          description: description.trim() || null,
          color,
          tagRules,
        });
        toast.success(t("newUi.sidebar.fleets.fleetCreated"));
      }
      onSaved();
      onClose();
    } catch (error) {
      const message = getErrorMessage(error, "");
      toast.error(message || t("newUi.sidebar.fleets.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <InlineView
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={
        <>
          {fleet
            ? t("newUi.sidebar.fleets.editFleetTitle")
            : t("newUi.sidebar.fleets.createFleetTitle")}
        </>
      }
      footer={
        <FormFooter
          saving={saving}
          onCancel={onClose}
          onSave={() => void handleSave()}
        />
      }
    >
      <p className="text-xs text-muted-foreground">
        {t("newUi.sidebar.fleets.createFleetDescription")}
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">
            {t("newUi.sidebar.fleets.nameLabel")}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("newUi.sidebar.fleets.namePlaceholder")}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">
            {t("newUi.sidebar.fleets.descriptionLabel")}
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("newUi.sidebar.fleets.descriptionPlaceholder")}
            rows={2}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">
            {t("newUi.sidebar.fleets.colorLabel")}
          </label>
          <div className="flex gap-1.5">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`size-6 transition-all ${
                  color === c
                    ? "ring-2 ring-offset-2 ring-offset-background ring-white/50"
                    : "opacity-75 hover:opacity-100"
                }`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">
            {t("newUi.sidebar.fleets.tagRulesLabel")}
          </label>
          <Input
            value={tagRulesText}
            onChange={(e) => setTagRulesText(e.target.value)}
            placeholder={t("newUi.sidebar.fleets.tagRulesPlaceholder")}
          />
          <span className="text-[11px] text-muted-foreground">
            {t("newUi.sidebar.fleets.tagRulesHint")}
          </span>
        </div>
      </div>
    </InlineView>
  );
}

function MemberPickerDialog({
  api,
  open,
  onClose,
  fleetId,
  allHosts,
  memberIds,
  onChanged,
}: {
  api: FleetsApi;
  open: boolean;
  onClose: () => void;
  fleetId: number;
  allHosts: PluginHostRecord[];
  memberIds: Set<number>;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const visibleHosts = useMemo(
    () =>
      allHosts.filter((h) =>
        h.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [allHosts, search],
  );

  async function toggleHost(host: PluginHostRecord, isMember: boolean) {
    const hostId = Number(host.id);
    setBusyId(hostId);
    try {
      if (isMember) {
        await api.removeMember(fleetId, hostId);
      } else {
        await api.addMember(fleetId, hostId);
      }
      onChanged();
    } catch (error) {
      const message = getErrorMessage(error, "");
      toast.error(message || t("newUi.sidebar.fleets.memberUpdateFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <InlineView
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t("newUi.sidebar.fleets.manageMembersTitle")}
      footer={<FormFooter onSave={onClose} saveLabel={t("common.close")} />}
    >
      <p className="text-xs text-muted-foreground">
        {t("newUi.sidebar.fleets.manageMembersDescription")}
      </p>
      <PanelSearch
        value={search}
        onChange={setSearch}
        placeholder={t("newUi.sidebar.fleets.searchHosts")}
        fill
      />

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
        {visibleHosts.map((host) => {
          const hostId = Number(host.id);
          const isMember = memberIds.has(hostId);
          return (
            <label
              key={host.id}
              className="flex items-center gap-2 text-xs cursor-pointer py-1"
            >
              <Checkbox
                checked={isMember}
                disabled={busyId === hostId}
                onCheckedChange={() => toggleHost(host, isMember)}
              />
              <span className="truncate flex-1">{host.name}</span>
              <span className="text-muted-foreground text-[11px]">
                {host.ip}
              </span>
            </label>
          );
        })}
        {visibleHosts.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">
            {t("newUi.sidebar.fleets.noHostsFound")}
          </div>
        )}
      </div>
    </InlineView>
  );
}

function FleetShareDialog({
  api,
  open,
  onClose,
  fleet,
}: {
  api: FleetsApi;
  open: boolean;
  onClose: () => void;
  fleet: FleetRow | null;
}) {
  const { t } = useTranslation();
  const [targetTab, setTargetTab] = useState<"user" | "role">("user");
  const [search, setSearch] = useState("");
  const [shareUsers, setShareUsers] = useState<ShareableUser[]>([]);
  const [shareRoles, setShareRoles] = useState<ShareableRole[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<number>>(
    new Set(),
  );
  const [permissionLevel, setPermissionLevel] =
    useState<SharePermissionLevel>("connect");
  const [expiryPreset, setExpiryPreset] =
    useState<ShareExpiryPresetKey>("never");
  const [customHours, setCustomHours] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<{
    hostsShared: number;
    hostsTotal: number;
    hostResults: FleetShareHostResult[];
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedUserIds(new Set());
    setSelectedRoleIds(new Set());
    setPermissionLevel("connect");
    setExpiryPreset("never");
    setCustomHours("");
    setTargetTab("user");
    setSummary(null);
    Promise.all([
      api.shareTargetUsers().catch(() => ({ users: [] })),
      api.shareTargetRoles().catch(() => ({ roles: [] })),
    ]).then(([usersRes, rolesRes]) => {
      setShareUsers(usersRes.users ?? []);
      setShareRoles(rolesRes.roles ?? []);
    });
  }, [open, api]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? shareUsers.filter((u) => u.username.toLowerCase().includes(q))
      : shareUsers;
  }, [shareUsers, search]);

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? shareRoles.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.displayName ?? "").toLowerCase().includes(q),
        )
      : shareRoles;
  }, [shareRoles, search]);

  const selectedCount = selectedUserIds.size + selectedRoleIds.size;

  const durationHours = (() => {
    if (expiryPreset === "never") return undefined;
    if (expiryPreset === "custom") {
      const hours = Number(customHours);
      return Number.isFinite(hours) && hours > 0 ? hours : undefined;
    }
    return (
      SHARE_EXPIRY_PRESETS.find((p) => p.key === expiryPreset)?.hours ??
      undefined
    );
  })();

  async function handleShare() {
    if (!fleet || selectedCount === 0) return;
    const targets: ShareTarget[] = [
      ...[...selectedUserIds].map(
        (id) => ({ type: "user", id }) as ShareTarget,
      ),
      ...[...selectedRoleIds].map(
        (id) => ({ type: "role", id }) as ShareTarget,
      ),
    ];

    setSubmitting(true);
    try {
      const result = await api.share(fleet.id, {
        targets,
        permissionLevel,
        ...(durationHours ? { durationHours } : {}),
      });
      setSummary({
        hostsShared: result.hostsShared,
        hostsTotal: result.hostsTotal,
        hostResults: result.hostResults,
      });
      setSelectedUserIds(new Set());
      setSelectedRoleIds(new Set());
      toast.success(
        t("newUi.sidebar.fleets.fleetSharedSuccessfully", {
          shared: result.hostsShared,
          total: result.hostsTotal,
        }),
      );
    } catch (error) {
      const message = getErrorMessage(error, "");
      toast.error(message || t("newUi.sidebar.fleets.failedToShareFleet"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <InlineView
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={
        <>
          {t("newUi.sidebar.fleets.shareFleetTitle", {
            name: fleet?.name ?? "",
          })}
        </>
      }
      footer={
        <FormFooter
          onCancel={onClose}
          cancelLabel={t("common.close")}
          saving={submitting}
          disabled={
            selectedCount === 0 || (expiryPreset === "custom" && !durationHours)
          }
          onSave={
            fleet && fleet.memberCount > 0
              ? () => void handleShare()
              : undefined
          }
          saveLabel={
            selectedCount > 0
              ? t("hosts.sharing.shareWithCount", { count: selectedCount })
              : t("hosts.sharing.shareButton")
          }
        />
      }
    >
      <p className="text-xs text-muted-foreground">
        {t("newUi.sidebar.fleets.shareFleetDescription")}
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {fleet && fleet.memberCount === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">
            {t("newUi.sidebar.fleets.noMembersToShare")}
          </div>
        ) : (
          <>
            <div className="flex gap-1.5">
              {(["user", "role"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTargetTab(tab)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-colors ${targetTab === tab ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {tab === "user" ? (
                    <User className="size-3 shrink-0" />
                  ) : (
                    <Shield className="size-3 shrink-0" />
                  )}
                  {tab === "user"
                    ? t("hosts.sharing.usersTab")
                    : t("hosts.sharing.rolesTab")}
                  {tab === "user" && selectedUserIds.size > 0 && (
                    <span>({selectedUserIds.size})</span>
                  )}
                  {tab === "role" && selectedRoleIds.size > 0 && (
                    <span>({selectedRoleIds.size})</span>
                  )}
                </button>
              ))}
            </div>

            <PanelSearch
              value={search}
              onChange={setSearch}
              placeholder={t("hosts.sharing.searchPlaceholder")}
              fill
            />

            <div className="flex flex-col border border-border h-28 overflow-y-auto shrink-0">
              {targetTab === "user" &&
                (filteredUsers.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground/50 text-center">
                    {t("hosts.sharing.noMatches")}
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelected = selectedUserIds.has(user.id);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() =>
                          setSelectedUserIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(user.id)) next.delete(user.id);
                            else next.add(user.id);
                            return next;
                          })
                        }
                        className={`flex items-center gap-2 px-2.5 py-1.5 text-xs text-left border-b border-border/50 last:border-0 transition-colors shrink-0 ${isSelected ? "bg-accent-brand/10 text-accent-brand" : "hover:bg-muted/40"}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          tabIndex={-1}
                          className="pointer-events-none"
                        />
                        <User className="size-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{user.username}</span>
                      </button>
                    );
                  })
                ))}
              {targetTab === "role" &&
                (filteredRoles.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground/50 text-center">
                    {t("hosts.sharing.noMatches")}
                  </div>
                ) : (
                  filteredRoles.map((role) => {
                    const isSelected = selectedRoleIds.has(role.id);
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() =>
                          setSelectedRoleIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(role.id)) next.delete(role.id);
                            else next.add(role.id);
                            return next;
                          })
                        }
                        className={`flex items-center gap-2 px-2.5 py-1.5 text-xs text-left border-b border-border/50 last:border-0 transition-colors shrink-0 ${isSelected ? "bg-accent-brand/10 text-accent-brand" : "hover:bg-muted/40"}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          tabIndex={-1}
                          className="pointer-events-none"
                        />
                        <Shield className="size-3 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          {role.displayName || role.name}
                        </span>
                      </button>
                    );
                  })
                ))}
            </div>

            <div className="flex items-end gap-2 shrink-0">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("hosts.sharing.permissionLevelLabel")}
                </span>
                <Select2
                  value={permissionLevel}
                  onChange={(e) =>
                    setPermissionLevel(e.target.value as SharePermissionLevel)
                  }
                  className="h-8 w-full px-2.5 text-xs border border-border bg-background hover:bg-muted/40 transition-colors"
                >
                  {SHARE_PERMISSION_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {t(`hosts.sharing.levels.${level}.label`)}
                    </option>
                  ))}
                </Select2>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex flex-col gap-1 shrink-0"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-left">
                      {t("hosts.sharing.expiryLabel")}
                    </span>
                    <span className="h-8 flex items-center justify-center px-2.5 text-xs border border-border hover:bg-muted/40 transition-colors whitespace-nowrap">
                      {t(`hosts.sharing.expiry.${expiryPreset}`)}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-xs">
                  {SHARE_EXPIRY_PRESETS.map((preset) => (
                    <DropdownMenuItem
                      key={preset.key}
                      onClick={() => setExpiryPreset(preset.key)}
                    >
                      {expiryPreset === preset.key ? (
                        <Check className="size-3 mr-1.5" />
                      ) : (
                        <span className="size-3 mr-1.5" />
                      )}
                      {t(`hosts.sharing.expiry.${preset.key}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p className="text-[11px] text-muted-foreground leading-snug shrink-0">
              {t(`hosts.sharing.levels.${permissionLevel}.description`)}
            </p>

            {expiryPreset === "custom" && (
              <Input
                type="number"
                autoFocus
                placeholder={t("hosts.sharing.customHoursPlaceholder")}
                value={customHours}
                onChange={(e) => setCustomHours(e.target.value)}
                className="shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            )}

            {summary && (
              <div className="flex flex-col gap-1 text-xs text-muted-foreground border-t border-border pt-2 shrink-0">
                <span>
                  {t("newUi.sidebar.fleets.fleetSharedSuccessfully", {
                    shared: summary.hostsShared,
                    total: summary.hostsTotal,
                  })}
                </span>
                {summary.hostResults.some((r) => !r.shared) && (
                  <div className="flex flex-col gap-0.5">
                    {summary.hostResults
                      .filter((r) => !r.shared)
                      .map((r) => (
                        <span
                          key={r.hostId}
                          className="text-[10px] text-destructive"
                        >
                          {t("newUi.sidebar.fleets.resultFailed")}: #{r.hostId}{" "}
                          ({r.reason ?? "unknown"})
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </InlineView>
  );
}

function RunCommandTab({ api, fleetId }: { api: FleetsApi; fleetId: number }) {
  const { t } = useTranslation();
  const [command, setCommand] = useState("");
  const [inputs, setInputs] = useState<SnippetInput[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<FleetHostResult[] | null>(null);

  // The snippets plugin owns $INPUT_n parsing; without it the command
  // runs as typed.
  useEffect(() => {
    let cancelled = false;
    void invokeAction("snippets.extractInputs", command).then((found) => {
      if (!cancelled) setInputs(Array.isArray(found) ? found : []);
    });
    return () => {
      cancelled = true;
    };
  }, [command]);

  async function handleRun() {
    if (!command.trim()) {
      toast.error(t("newUi.sidebar.fleets.commandRequired"));
      return;
    }
    setRunning(true);
    setResults(null);
    try {
      const { results: r } = await api.runCommand(
        fleetId,
        command,
        inputs.length > 0 ? inputValues : undefined,
      );
      setResults(r);
      const failed = r.filter((x) => !x.success).length;
      if (failed === 0) {
        toast.success(t("newUi.sidebar.fleets.commandSucceeded"));
      } else {
        toast.warning(
          t("newUi.sidebar.fleets.commandPartialFailure", {
            failed,
            total: r.length,
          }),
        );
      }
    } catch (error) {
      const message = getErrorMessage(error, "");
      toast.error(message || t("newUi.sidebar.fleets.commandFailed"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder={t("newUi.sidebar.fleets.commandPlaceholder")}
        rows={4}
        className="font-mono text-xs"
      />
      {inputs.length > 0 && (
        <div className="flex flex-col gap-2 border border-border p-2.5">
          <span className="text-xs text-muted-foreground">
            {t("newUi.sidebar.fleets.commandInputsLabel")}
          </span>
          {inputs.map((input) => (
            <div key={input.key} className="flex flex-col gap-1">
              <label className="text-xs">{input.label}</label>
              <Input
                value={inputValues[input.key] ?? ""}
                onChange={(e) =>
                  setInputValues((prev) => ({
                    ...prev,
                    [input.key]: e.target.value,
                  }))
                }
              />
            </div>
          ))}
        </div>
      )}
      <Button
        variant="outline"
        onClick={handleRun}
        disabled={running}
        className="self-start border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
      >
        {running ? (
          <Loader2 className="size-3.5 mr-2 animate-spin" />
        ) : (
          <Play className="size-3.5 mr-2" />
        )}
        {t("newUi.sidebar.fleets.runOnFleet")}
      </Button>
      {results && <ResultsList results={results} />}
    </div>
  );
}

function TransferTab({ api, fleetId }: { api: FleetsApi; fleetId: number }) {
  const { t } = useTranslation();
  const [direction, setDirection] = useState<"push" | "pull">("push");
  const [remotePath, setRemotePath] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FleetHostResult[] | null>(null);

  async function handleTransfer() {
    if (!remotePath.trim()) {
      toast.error(t("newUi.sidebar.fleets.remotePathRequired"));
      return;
    }
    if (direction === "push" && !file) {
      toast.error(t("newUi.sidebar.fleets.fileRequired"));
      return;
    }

    setBusy(true);
    setResults(null);
    try {
      if (direction === "push" && file) {
        const { results: r } = await api.pushFile(fleetId, file, remotePath);
        setResults(r);
      } else {
        const {
          results: r,
          blob,
          fileName,
        } = await api.pullFile(fleetId, remotePath);
        setResults(r);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      toast.success(t("newUi.sidebar.fleets.transferComplete"));
    } catch (error) {
      const message = getErrorMessage(error, "");
      toast.error(message || t("newUi.sidebar.fleets.transferFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant={direction === "push" ? "default" : "outline"}
          onClick={() => setDirection("push")}
        >
          <Upload className="size-3.5 mr-1.5" />
          {t("newUi.sidebar.fleets.push")}
        </Button>
        <Button
          size="sm"
          variant={direction === "pull" ? "default" : "outline"}
          onClick={() => setDirection("pull")}
        >
          <Download className="size-3.5 mr-1.5" />
          {t("newUi.sidebar.fleets.pull")}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground">
          {t("newUi.sidebar.fleets.remotePathLabel")}
        </label>
        <Input
          value={remotePath}
          onChange={(e) => setRemotePath(e.target.value)}
          placeholder="/etc/hosts"
          className="font-mono text-xs"
        />
      </div>

      {direction === "push" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">
            {t("newUi.sidebar.fleets.fileLabel")}
          </label>
          <Input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      <span className="text-[11px] text-muted-foreground">
        {direction === "push"
          ? t("newUi.sidebar.fleets.pushHint")
          : t("newUi.sidebar.fleets.pullHint")}
      </span>

      <Button
        variant="outline"
        onClick={handleTransfer}
        disabled={busy}
        className="self-start border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
      >
        {busy && <Loader2 className="size-3.5 mr-2 animate-spin" />}
        {direction === "push"
          ? t("newUi.sidebar.fleets.push")
          : t("newUi.sidebar.fleets.pull")}
      </Button>

      {results && <ResultsList results={results} />}
    </div>
  );
}

function InventoryTab({ api, fleetId }: { api: FleetsApi; fleetId: number }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<FleetInventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.inventory(fleetId);
      setEntries(data);
    } catch (error) {
      const message = getErrorMessage(error, "");
      toast.error(message || t("newUi.sidebar.fleets.inventoryLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [api, fleetId, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const { results } = await api.refreshInventory(fleetId);
      const failed = results.filter((r) => !r.success).length;
      if (failed > 0) {
        toast.warning(
          t("newUi.sidebar.fleets.commandPartialFailure", {
            failed,
            total: results.length,
          }),
        );
      } else {
        toast.success(t("newUi.sidebar.fleets.inventoryRefreshed"));
      }
      await load();
    } catch (error) {
      const message = getErrorMessage(error, "");
      toast.error(message || t("newUi.sidebar.fleets.inventoryRefreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        onClick={handleRefresh}
        disabled={refreshing}
        size="sm"
        className="self-start border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
      >
        {refreshing ? (
          <Loader2 className="size-3.5 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5 mr-2" />
        )}
        {t("newUi.sidebar.fleets.refreshInventory")}
      </Button>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <div
              key={entry.hostId}
              className="flex flex-col gap-1 border border-border p-2.5"
            >
              <div className="flex items-center gap-2">
                <Server className="size-3 shrink-0 text-muted-foreground" />
                <span className="text-xs font-semibold">{entry.hostName}</span>
              </div>
              {entry.inventory ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground pl-5">
                  <span>
                    {t("newUi.sidebar.fleets.inventoryOs")}:{" "}
                    {entry.inventory.osPrettyName ?? "-"}
                  </span>
                  <span>
                    {t("newUi.sidebar.fleets.inventoryKernel")}:{" "}
                    {entry.inventory.kernel ?? "-"}
                  </span>
                  <span>
                    {t("newUi.sidebar.fleets.inventoryArch")}:{" "}
                    {entry.inventory.architecture ?? "-"}
                  </span>
                  <span>
                    {t("newUi.sidebar.fleets.inventoryUptime")}:{" "}
                    {formatUptime(entry.inventory.uptimeSeconds)}
                  </span>
                  <span>
                    {t("newUi.sidebar.fleets.inventoryPackageManager")}:{" "}
                    {entry.inventory.packageManager ?? "-"}
                  </span>
                  <span>
                    {t("newUi.sidebar.fleets.inventoryCollectedAt")}:{" "}
                    {new Date(entry.inventory.collectedAt).toLocaleString()}
                  </span>
                </div>
              ) : (
                <span className="text-[11px] text-muted-foreground pl-5">
                  {t("newUi.sidebar.fleets.inventoryNoData")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PackagesTab({ api, fleetId }: { api: FleetsApi; fleetId: number }) {
  const { t } = useTranslation();
  const [action, setAction] = useState<FleetPackageAction>("install");
  const [packageName, setPackageName] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<FleetHostResult[] | null>(null);

  async function handleRun() {
    if (action !== "upgrade-all" && !packageName.trim()) {
      toast.error(t("newUi.sidebar.fleets.packageNameRequired"));
      return;
    }
    setRunning(true);
    setResults(null);
    try {
      const { results: r } = await api.runPackageAction(
        fleetId,
        action,
        action === "upgrade-all" ? undefined : packageName.trim(),
      );
      setResults(r);
      const failed = r.filter((x) => !x.success).length;
      if (failed === 0) {
        toast.success(t("newUi.sidebar.fleets.commandSucceeded"));
      } else {
        toast.warning(
          t("newUi.sidebar.fleets.commandPartialFailure", {
            failed,
            total: r.length,
          }),
        );
      }
    } catch (error) {
      const message = getErrorMessage(error, "");
      toast.error(message || t("newUi.sidebar.fleets.commandFailed"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground">
          {t("newUi.sidebar.fleets.packageActionLabel")}
        </label>
        <Segmented<FleetPackageAction>
          value={action}
          onChange={setAction}
          className="w-full [&>button]:flex-1"
          options={[
            {
              value: "install",
              label: t("newUi.sidebar.fleets.packageInstall"),
            },
            { value: "remove", label: t("newUi.sidebar.fleets.packageRemove") },
            {
              value: "upgrade-all",
              label: t("newUi.sidebar.fleets.packageUpgradeAll"),
            },
          ]}
        />
      </div>

      {action !== "upgrade-all" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">
            {t("newUi.sidebar.fleets.packageNameLabel")}
          </label>
          <Input
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder="curl"
            className="font-mono text-xs"
          />
        </div>
      )}

      <span className="text-[11px] text-muted-foreground">
        {t("newUi.sidebar.fleets.packageHint")}
      </span>

      <Button
        variant="outline"
        onClick={handleRun}
        disabled={running}
        className="self-start border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
      >
        {running ? (
          <Loader2 className="size-3.5 mr-2 animate-spin" />
        ) : (
          <Package className="size-3.5 mr-2" />
        )}
        {t("newUi.sidebar.fleets.runOnFleet")}
      </Button>

      {results && <ResultsList results={results} />}
    </div>
  );
}

type FleetActionView = "run" | "transfer" | "inventory" | "packages";

function FleetDetail({
  api,
  fleet,
  allHosts,
  onBack,
  onFleetChanged,
  onOpenFleetInventory,
}: {
  api: FleetsApi;
  fleet: FleetRow;
  allHosts: PluginHostRecord[];
  onBack: () => void;
  onFleetChanged: () => void;
  onOpenFleetInventory?: (fleetId: number) => void;
}) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<FleetMemberRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [actionView, setActionView] = useState<FleetActionView>("run");

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const data = await api.members(fleet.id);
      setMembers(data);
    } catch (error) {
      const message = getErrorMessage(error, "");
      toast.error(message || t("newUi.sidebar.fleets.membersLoadFailed"));
    } finally {
      setLoadingMembers(false);
    }
  }, [api, fleet.id, t]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  function handleMembersChanged() {
    loadMembers();
    onFleetChanged();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex h-11 shrink-0 items-center border-b border-border">
        <BackButton onClick={onBack} className="w-11" />
        <div className="flex min-w-0 flex-1 items-center gap-2 border-l border-border px-3">
          <span
            className="size-2.5 shrink-0"
            style={{ backgroundColor: fleet.color ?? "#6b7280" }}
          />
          <span className="min-w-0 truncate text-[13px] font-semibold tracking-tight">
            {fleet.name}
          </span>
          <ListBadge>
            {t("newUi.sidebar.fleets.memberCount", { count: members.length })}
          </ListBadge>
        </div>
        <div className="flex shrink-0 items-center gap-1 px-2">
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("newUi.sidebar.fleets.shareFleet")}
            aria-label={t("newUi.sidebar.fleets.shareFleet")}
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("newUi.sidebar.fleets.manageMembers")}
            aria-label={t("newUi.sidebar.fleets.manageMembers")}
            onClick={() => setPickerOpen(true)}
          >
            <Settings2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {members.length > 0 && (
        <div className="shrink-0 border-b border-border px-1">
          <TabStrip
            tabs={[
              { id: "run", label: t("newUi.sidebar.fleets.tabRun") },
              { id: "transfer", label: t("newUi.sidebar.fleets.tabTransfer") },
              {
                id: "inventory",
                label: t("newUi.sidebar.fleets.tabInventory"),
              },
              { id: "packages", label: t("newUi.sidebar.fleets.tabPackages") },
            ]}
            activeTab={actionView}
            onTabChange={(id) => setActionView(id as FleetActionView)}
            trailing={
              actionView === "inventory" && onOpenFleetInventory ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onOpenFleetInventory(fleet.id)}
                  title={t("newUi.sidebar.fleets.openInventoryTab")}
                  aria-label={t("newUi.sidebar.fleets.openInventoryTab")}
                >
                  <ExternalLink />
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-2.5">
        {loadingMembers ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <EmptyState
            icon={Server}
            title={t("newUi.sidebar.fleets.noMembers")}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {actionView === "run" && (
              <RunCommandTab api={api} fleetId={fleet.id} />
            )}
            {actionView === "transfer" && (
              <TransferTab api={api} fleetId={fleet.id} />
            )}
            {actionView === "inventory" && (
              <InventoryTab api={api} fleetId={fleet.id} />
            )}
            {actionView === "packages" && (
              <PackagesTab api={api} fleetId={fleet.id} />
            )}
          </div>
        )}
      </div>

      <MemberPickerDialog
        api={api}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        fleetId={fleet.id}
        allHosts={allHosts}
        memberIds={memberIds}
        onChanged={handleMembersChanged}
      />

      <FleetShareDialog
        api={api}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        fleet={fleet}
      />
    </div>
  );
}

export function FleetsPanel({
  api,
  active,
  onOpenFleetInventory,
}: {
  api: FleetsApi;
  active?: boolean;
  onOpenFleetInventory?: (fleetId: number) => void;
}) {
  const { t } = useTranslation();
  const { hosts: allHosts } = useHosts();
  const [fleets, setFleets] = useState<FleetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedFleet, setSelectedFleet] = useState<FleetRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingFleet, setEditingFleet] = useState<FleetRow | null>(null);
  const confirm = useConfirm();
  const [shareTarget, setShareTarget] = useState<FleetRow | null>(null);
  const hasLoadedRef = useRef(false);

  const loadFleets = useCallback(async () => {
    try {
      const data = await api.list();
      setFleets(data);
      setSelectedFleet((prev) =>
        prev ? (data.find((f) => f.id === prev.id) ?? null) : null,
      );
    } catch (error) {
      const message = getErrorMessage(error, "");
      toast.error(message || t("newUi.sidebar.fleets.loadFailed"));
    }
  }, [api, t]);

  useEffect(() => {
    if (!active || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    setLoading(true);
    loadFleets()
      .catch((error: unknown) => {
        const message = getErrorMessage(error, "");
        toast.error(message || t("newUi.sidebar.fleets.loadFailed"));
      })
      .finally(() => setLoading(false));
  }, [active, hasLoadedRef, loadFleets, t]);

  async function handleDelete(fleet: FleetRow) {
    const ok = await confirm({
      title: t("newUi.sidebar.fleets.deleteFleetTitle"),
      description: t("newUi.sidebar.fleets.deleteFleetDescription", {
        name: fleet.name,
      }),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await api.remove(fleet.id);
      toast.success(t("newUi.sidebar.fleets.fleetDeleted"));
      if (selectedFleet?.id === fleet.id) setSelectedFleet(null);
      loadFleets();
    } catch (error) {
      const message = getErrorMessage(error, "");
      toast.error(message || t("newUi.sidebar.fleets.deleteFailed"));
    }
  }

  const visibleFleets = fleets.filter((f) =>
    f.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  if (selectedFleet) {
    return (
      <FleetDetail
        api={api}
        fleet={selectedFleet}
        allHosts={allHosts}
        onBack={() => setSelectedFleet(null)}
        onFleetChanged={loadFleets}
        onOpenFleetInventory={onOpenFleetInventory}
      />
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("newUi.sidebar.fleets.searchFleets")}
          fill
        />
        <Button variant="outline" size="icon" asChild>
          <a
            href={docsUrl()}
            target="_blank"
            rel="noreferrer"
            title={t("hosts.docsLink")}
            aria-label={t("hosts.docsLink")}
          >
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
        <AddButton
          label={t("newUi.sidebar.fleets.createFleet")}
          onClick={() => {
            setEditingFleet(null);
            setFormOpen(true);
          }}
        />
      </div>

      <PanelList
        empty={
          loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : (
            <EmptyState
              icon={Boxes}
              title={t("newUi.sidebar.fleets.noFleets")}
            />
          )
        }
      >
        {!loading &&
          visibleFleets.map((fleet, index) => (
            <ListRow
              key={fleet.id}
              stripe={index}
              color={fleet.color ?? undefined}
              tone="muted"
              icon={<Boxes />}
              title={fleet.name}
              onClick={() => setSelectedFleet(fleet)}
              badges={
                <ListBadge className="ml-auto">
                  {t("newUi.sidebar.fleets.memberCount", {
                    count: fleet.memberCount,
                  })}
                </ListBadge>
              }
              meta={fleet.description || undefined}
              actions={
                <>
                  <ListRowAction
                    label={t("newUi.sidebar.fleets.shareFleet")}
                    onClick={() => setShareTarget(fleet)}
                  >
                    <Share2 />
                  </ListRowAction>
                  <ListRowAction
                    label={t("newUi.sidebar.fleets.editFleetTitle")}
                    onClick={() => {
                      setEditingFleet(fleet);
                      setFormOpen(true);
                    }}
                  >
                    <Settings2 />
                  </ListRowAction>
                  <ListRowAction
                    label={t("common.delete")}
                    tone="destructive"
                    onClick={() => void handleDelete(fleet)}
                  >
                    <Trash2 />
                  </ListRowAction>
                </>
              }
            />
          ))}
      </PanelList>

      <FleetFormDialog
        api={api}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        fleet={editingFleet}
        onSaved={loadFleets}
      />

      <FleetShareDialog
        api={api}
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        fleet={shareTarget}
      />
    </div>
  );
}
