export interface AnsibleStatus {
  installed: boolean;
  version: string;
  user: string;
  projectDir: string;
  projectExists: boolean;
  sshpass: boolean;
  canEdit: boolean;
  readOnly: boolean;
}

export interface ProjectFile {
  path: string;
  size: number;
  modified: number;
  playbook: boolean;
}

export interface FilesView {
  files: ProjectFile[];
}

export interface FileView {
  path: string;
  text: string;
}

export interface Target {
  id: number;
  name: string;
  address: string;
  folder: string;
  tags: string[];
}

export type RunKind = "playbook" | "adhoc" | "facts";
export type RunState = "running" | "ok" | "failed" | "cancelled" | "lost";

export interface RecapLine {
  host: string;
  ok: number;
  changed: number;
  unreachable: number;
  failed: number;
  skipped: number;
}

export interface RunMeta {
  id: string;
  kind: RunKind;
  title: string;
  command: string;
  startedAt: number;
  startedBy: string;
  check: boolean;
  hosts: string[];
}

export interface RunSummary extends RunMeta {
  state: RunState;
  exitCode: number | null;
  endedAt: number | null;
}

export interface RunDetail extends RunSummary {
  log: string;
  truncated: boolean;
  recap: RecapLine[];
}

export interface RunBody {
  kind: RunKind;
  /** Playbook path inside the project. */
  playbook?: string;
  /** Termix host ids to run on. Empty uses the project's own inventory. */
  hostIds?: number[];
  /** Inventory file in the project, when no Termix hosts are picked. */
  inventory?: string;
  limit?: string;
  tags?: string;
  skipTags?: string;
  /** key=value lines. */
  extraVars?: string;
  check?: boolean;
  diff?: boolean;
  become?: boolean;
  verbosity?: number;
  /** Ad-hoc. */
  pattern?: string;
  module?: string;
  args?: string;
}

export interface FactsHost {
  host: string;
  ok: boolean;
  message: string;
  facts: Record<string, unknown>;
}

/** One host in the Ansible dashboard card. */
export interface AnsibleHostSummary {
  hostId: number;
  checkedAt: string;
  running: number;
  /** Runs in the last 7 days that failed or were lost. */
  failed: number;
  last: {
    id: string;
    title: string;
    state: RunState;
    startedAt: number;
  } | null;
  error?: string;
}
