import type { Request, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type { GitStatus } from "../shared/types.js";
import { body, createHttp, str } from "./http.js";
import {
  actions,
  cleanBranch,
  cleanFile,
  cleanFiles,
  cleanHash,
  cleanInt,
  cleanPath,
  cleanRef,
  cleanRemote,
  cleanUrl,
} from "./scripts.js";
import type { GitService } from "./service.js";
import type { SummaryCache } from "./summary.js";
import { registerSummary } from "./summary.js";
import type { RepoStore } from "./store.js";

const MAX_MESSAGE = 10_000;
const MAX_POST = 2000;

/**
 * Mounts the Git routes, served at /plugin-api/git with auth and the git.use
 * permission in front. Every repo route takes the repo folder as `path`
 * and only works for repos added to the host.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: { service: GitService; store: RepoStore; summary: SummaryCache },
): void {
  const { service, store, summary } = deps;
  const { read, write, canEdit } = createHttp(router, ctx);

  const repo = (req: Request) =>
    cleanPath(str(req.query.path) || str(body(req).path));
  const target = (req: Request) => {
    try {
      return repo(req);
    } catch {
      return "";
    }
  };

  registerSummary(router, ctx, summary);

  /**
   * @openapi
   * /plugin-api/git/{hostId}/status:
   *   get:
   *     summary: Git status of a host
   *     description: Whether git is installed, its version, the login user and the folders scanned for repos.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The status.
   *       404:
   *         description: Host not found.
   */
  router.get(
    "/:hostId/status",
    read(async (hostId, _req, settings) => {
      const info = await service.host(hostId, settings);
      const status: GitStatus = {
        installed: info.installed === true,
        version: info.version ?? "",
        user: info.user ?? "",
        roots: settings.roots,
        canEdit: await canEdit(hostId, settings),
        readOnly: settings.readOnly,
        canRunCommands: await ctx.rbac.has("run-commands"),
      };
      return status;
    }),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repos:
   *   get:
   *     summary: Repos added to a host
   *     description: Each repo with its branch, ahead and behind counts, changed files, last commit and auto pull setup.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The repos.
   */
  router.get(
    "/:hostId/repos",
    read(async (hostId, _req, settings) => ({
      repos: await service.repos(hostId, settings),
    })),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repos:
   *   post:
   *     summary: Add repos to a host
   *     description: Adds git folders that already exist on the host. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               paths:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: The folders that were added.
   *       400:
   *         description: A folder is not a git repo.
   */
  router.post(
    "/:hostId/repos",
    write("add", async (hostId, req, settings) => {
      const raw = body(req).paths;
      if (!Array.isArray(raw) || !raw.length || raw.length > 100) {
        throw new HostScriptError("Pick between 1 and 100 folders");
      }
      const added: string[] = [];
      for (const value of raw) {
        added.push(await service.toplevel(hostId, settings, cleanPath(value)));
      }
      await service.add(hostId, added);
      return { added };
    }),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repos:
   *   delete:
   *     summary: Remove a repo from the list
   *     description: Only forgets the repo in Termix. Nothing is deleted on the host.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Removed.
   */
  router.delete(
    "/:hostId/repos",
    write(
      "remove",
      async (hostId, req) => {
        await service.remove(hostId, repo(req));
      },
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/discover:
   *   get:
   *     summary: Find repos on the host
   *     description: Looks four levels deep in the scan folders for git repos that are not added yet.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Folder paths.
   */
  router.get(
    "/:hostId/discover",
    read(async (hostId, _req, settings) => ({
      found: await service.discover(hostId, settings),
    })),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/clone:
   *   post:
   *     summary: Clone a repo onto the host
   *     description: Runs git clone with the login user's own keys and adds the repo. The folder must not exist. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               url:
   *                 type: string
   *               path:
   *                 type: string
   *     responses:
   *       200:
   *         description: The result.
   */
  router.post(
    "/:hostId/clone",
    write(
      "clone",
      (hostId, req, settings) =>
        service.clone(
          hostId,
          settings,
          cleanUrl(body(req).url),
          cleanPath(body(req).path),
        ),
      (req) => str(body(req).path),
    ),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/status:
   *   get:
   *     summary: Changed files in a repo
   *     description: The branch, its upstream, ahead and behind counts and every changed or untracked file.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The status.
   */
  router.get(
    "/:hostId/repo/status",
    read((hostId, req, settings) =>
      service.status(hostId, settings, repo(req)),
    ),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/log:
   *   get:
   *     summary: Commit history
   *     description: Commits, newest first. Pick a ref, a file, or all branches, and page with skip.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: ref
   *         schema:
   *           type: string
   *       - in: query
   *         name: file
   *         schema:
   *           type: string
   *       - in: query
   *         name: all
   *         schema:
   *           type: string
   *       - in: query
   *         name: skip
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The commits.
   */
  router.get(
    "/:hostId/repo/log",
    read(async (hostId, req, settings) => ({
      commits: await service.log(hostId, settings, repo(req), {
        ref: req.query.ref ? cleanRef(req.query.ref) : undefined,
        file: req.query.file ? cleanFile(req.query.file) : undefined,
        all: req.query.all === "1",
        skip: cleanInt(req.query.skip, 0, 100_000, 0),
        limit: cleanInt(req.query.limit, 1, 200, 50),
      }),
    })),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/commit:
   *   get:
   *     summary: One commit
   *     description: The message, the changed files and the patch. Long patches are cut.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: hash
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The commit.
   */
  router.get(
    "/:hostId/repo/commit",
    read((hostId, req, settings) =>
      service.show(hostId, settings, repo(req), cleanHash(req.query.hash)),
    ),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/diff:
   *   get:
   *     summary: Diff of one file
   *     description: The working tree change, the staged change, or a whole untracked file.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: file
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: mode
   *         schema:
   *           type: string
   *           enum: [tree, staged, untracked]
   *     responses:
   *       200:
   *         description: The diff text.
   */
  router.get(
    "/:hostId/repo/diff",
    read((hostId, req, settings) => {
      const mode = str(req.query.mode);
      return service.diff(
        hostId,
        settings,
        repo(req),
        cleanFile(req.query.file),
        mode === "staged" || mode === "untracked" ? mode : "tree",
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/branches:
   *   get:
   *     summary: Branches
   *     description: Local and remote branches with their upstream and ahead and behind counts.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The branches.
   */
  router.get(
    "/:hostId/repo/branches",
    read(async (hostId, req, settings) => ({
      branches: await service.branches(hostId, settings, repo(req)),
    })),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/remotes:
   *   get:
   *     summary: Remotes
   *     description: Remote names and addresses. A password in an https address is hidden.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The remotes.
   */
  router.get(
    "/:hostId/repo/remotes",
    read(async (hostId, req, settings) => ({
      remotes: await service.remotes(hostId, settings, repo(req)),
    })),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/stashes:
   *   get:
   *     summary: Stashes
   *     description: The stash list of a repo.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The stashes.
   */
  router.get(
    "/:hostId/repo/stashes",
    read(async (hostId, req, settings) => ({
      stashes: await service.stashes(hostId, settings, repo(req)),
    })),
  );

  // The changes below all answer { ok, output } and need edit access.
  const change = (
    name: string,
    build: (req: Request) => string,
    slow = false,
  ) =>
    write(
      name,
      (hostId, req, settings) =>
        service.change(hostId, settings, repo(req), build(req), slow),
      target,
    );
  const path = (req: Request) => repo(req);

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/fetch:
   *   post:
   *     summary: Fetch all remotes
   *     description: Runs git fetch --all --prune. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/fetch",
    change("fetch", (req) => actions.fetch(path(req)), true),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/pull:
   *   post:
   *     summary: Pull the current branch
   *     description: Runs git pull --ff-only, so it never creates a merge commit. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/pull",
    change("pull", (req) => actions.pull(path(req)), true),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/push:
   *   post:
   *     summary: Push the current branch
   *     description: Runs git push, or git push -u when the branch has no upstream. Never forces. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *               remote:
   *                 type: string
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/push",
    change(
      "push",
      (req) =>
        actions.push(path(req), cleanRemote(body(req).remote || "origin")),
      true,
    ),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/checkout:
   *   post:
   *     summary: Switch branch
   *     description: Checks out a branch. With remote true it creates a local branch that tracks the remote one. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *               branch:
   *                 type: string
   *               remote:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/checkout",
    change("checkout", (req) =>
      actions.checkout(
        path(req),
        cleanBranch(body(req).branch),
        body(req).remote === true,
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/branch:
   *   post:
   *     summary: Create a branch
   *     description: Creates a branch from the current commit or from start, and switches to it. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *               name:
   *                 type: string
   *               start:
   *                 type: string
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/branch",
    change("branch.create", (req) =>
      actions.createBranch(
        path(req),
        cleanBranch(body(req).name),
        body(req).start ? cleanRef(body(req).start) : undefined,
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/branch:
   *   delete:
   *     summary: Delete a local branch
   *     description: Uses git branch -d, which refuses an unmerged branch. With force it uses -D. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: force
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.delete(
    "/:hostId/repo/branch",
    change("branch.delete", (req) =>
      actions.deleteBranch(
        path(req),
        cleanBranch(req.query.name),
        req.query.force === "1",
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/merge:
   *   post:
   *     summary: Merge a branch into the current one
   *     description: Runs git merge. A merge with conflicts is undone right away. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *               branch:
   *                 type: string
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/merge",
    change("merge", (req) =>
      actions.merge(path(req), cleanRef(body(req).branch)),
    ),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/stage:
   *   post:
   *     summary: Stage files
   *     description: Runs git add for the files, or for everything with all true. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *               files:
   *                 type: array
   *                 items:
   *                   type: string
   *               all:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/stage",
    change("stage", (req) => {
      const all = body(req).all === true;
      const files = cleanFiles(body(req).files);
      if (!all && !files.length) throw new HostScriptError("Pick a file");
      return actions.stage(path(req), files, all);
    }),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/unstage:
   *   post:
   *     summary: Unstage files
   *     description: Takes files out of the next commit and keeps their changes. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *               files:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/unstage",
    change("unstage", (req) => {
      const files = cleanFiles(body(req).files);
      if (!files.length) throw new HostScriptError("Pick a file");
      return actions.unstage(path(req), files);
    }),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/discard:
   *   post:
   *     summary: Throw away changes
   *     description: Restores tracked files and deletes untracked ones. This cannot be undone. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *               tracked:
   *                 type: array
   *                 items:
   *                   type: string
   *               untracked:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/discard",
    change("discard", (req) => {
      const tracked = cleanFiles(body(req).tracked);
      const untracked = cleanFiles(body(req).untracked);
      if (!tracked.length && !untracked.length)
        throw new HostScriptError("Pick a file");
      return actions.discard(path(req), tracked, untracked);
    }),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/commit:
   *   post:
   *     summary: Commit staged changes
   *     description: Commits with the login user's git identity. With all true it also commits every tracked change. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *               message:
   *                 type: string
   *               all:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/commit",
    change("commit", (req) => {
      const message = str(body(req).message).trim();
      if (!message) throw new HostScriptError("Write a commit message");
      if (message.length > MAX_MESSAGE)
        throw new HostScriptError("The commit message is too long");
      return actions.commit(path(req), message, body(req).all === true);
    }),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/stash:
   *   post:
   *     summary: Stash, apply, pop or drop
   *     description: Works with the stash list. Dropping a stash cannot be undone. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *               op:
   *                 type: string
   *                 enum: [push, pop, apply, drop]
   *               index:
   *                 type: integer
   *               message:
   *                 type: string
   *               untracked:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/stash",
    change("stash", (req) => {
      const op = str(body(req).op);
      if (op !== "push" && op !== "pop" && op !== "apply" && op !== "drop") {
        throw new HostScriptError("Unknown stash action");
      }
      const message = str(body(req).message).trim().slice(0, 300);
      return actions.stash(
        path(req),
        op,
        cleanInt(body(req).index, 0, 999, 0),
        message,
        body(req).untracked === true,
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/reset:
   *   post:
   *     summary: Reset hard
   *     description: Runs git reset --hard to a ref, HEAD by default. All uncommitted changes to tracked files are lost. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *               ref:
   *                 type: string
   *     responses:
   *       200:
   *         description: ok and the git output.
   */
  router.post(
    "/:hostId/repo/reset",
    change("reset", (req) =>
      actions.resetHard(path(req), cleanRef(body(req).ref || "HEAD")),
    ),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/auto:
   *   put:
   *     summary: Set up auto pull
   *     description: Pulls the repo on a schedule with git merge --ff-only. It skips repos with uncommitted changes or diverged branches. A post command needs the git.run-commands permission. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *               enabled:
   *                 type: boolean
   *               intervalMin:
   *                 type: integer
   *               postCommand:
   *                 type: string
   *     responses:
   *       200:
   *         description: The auto pull setup.
   */
  router.put(
    "/:hostId/repo/auto",
    write(
      "auto",
      async (hostId, req) => {
        const postCommand = str(body(req).postCommand).trim();
        if (postCommand.length > MAX_POST)
          throw new HostScriptError("The command is too long");
        if (postCommand && !(await ctx.rbac.has("run-commands"))) {
          throw new HostScriptError(
            "You need the run commands permission for a post pull command",
            403,
          );
        }
        const userId = ctx.currentActor();
        if (!userId) throw new HostScriptError("Not signed in", 401);
        return {
          auto: await service.setAuto(hostId, repo(req), {
            enabled: body(req).enabled === true,
            intervalMin: cleanInt(body(req).intervalMin, 1, 10_080, 15),
            postCommand,
            userId,
          }),
        };
      },
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/git/{hostId}/repo/auto/run:
   *   post:
   *     summary: Run auto pull now
   *     description: Does one auto pull straight away and records it in the run list. Needs edit access.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path:
   *                 type: string
   *     responses:
   *       200:
   *         description: The recorded run.
   */
  router.post(
    "/:hostId/repo/auto/run",
    write(
      "auto.run",
      async (hostId, req, settings) => {
        const p = repo(req);
        const saved = (await store.list(hostId)).find((r) => r.path === p);
        if (!saved?.auto)
          throw new HostScriptError(
            "Auto pull is not set up for this repo",
            400,
          );
        const post =
          saved.auto.postCommand && (await ctx.rbac.has("run-commands"))
            ? saved.auto.postCommand
            : "";
        const result = await service.autoPull(hostId, settings, p, post);
        return { run: result.run };
      },
      target,
    ),
  );
}
