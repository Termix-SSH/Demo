export interface UsersStatus {
  os: string;
  /** The user Termix logs in as. */
  user: string;
  root: boolean;
  /** "sudo", "wheel" or empty when neither group exists. */
  sudoGroup: string;
  shells: string[];
  /** Lowest uid of a normal account, from /etc/login.defs. */
  uidMin: number;
  /** useradd and friends are installed. */
  tools: boolean;
  canEdit: boolean;
  readOnly: boolean;
}

/**
 * - set: has a password
 * - locked: has a password but it is locked
 * - none: no password, so no password login
 * - empty: an empty password, anyone can log in
 * - unknown: needs root to tell
 */
export type PasswordState = "set" | "locked" | "none" | "empty" | "unknown";

export interface UserView {
  name: string;
  uid: number;
  gid: number;
  group: string;
  comment: string;
  home: string;
  shell: string;
  /** Supplementary groups. */
  groups: string[];
  sudo: boolean;
  system: boolean;
  self: boolean;
  password: PasswordState;
  /** The account itself has expired, which also blocks key logins. */
  expired: boolean;
  /** Date the password was last changed, YYYY-MM-DD, when known. */
  passwordChanged: string;
  canLogin: boolean;
}

export interface GroupView {
  name: string;
  gid: number;
  members: string[];
  /** Users whose primary group this is. */
  primaryOf: string[];
  system: boolean;
}

export interface UsersList {
  users: UserView[];
  groups: GroupView[];
}

export interface KeyView {
  /** Line number in authorized_keys, from 0. */
  line: number;
  type: string;
  fingerprint: string;
  comment: string;
  /** The line starts with options like from= or command=. */
  options: boolean;
}

export interface UserDetail {
  lastLogin: string;
  /** False when the host has no tool to read logins. */
  loginKnown: boolean;
  keys: KeyView[];
  keysError: string;
}

export interface CreateUserBody {
  name: string;
  comment?: string;
  shell?: string;
  home?: string;
  createHome?: boolean;
  groups?: string[];
  sudo?: boolean;
  password?: string;
}

export interface UpdateUserBody {
  comment?: string;
  shell?: string;
  groups?: string[];
}

export interface SessionView {
  user: string;
  tty: string;
  from: string;
  since: string;
}

export interface SessionsView {
  sessions: SessionView[];
  recent: string[];
}
