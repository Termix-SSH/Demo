# Changelog

## 1.0.1

### Changed

- Runs in its own process on Termix 26.11.2 and later, with no access to the server beyond what Termix allows it
- Its process stops when it has nothing to watch or run, and Termix starts it again when there is work, which saves memory on Termix 26.11.2 and later

### Fixed

- Very long repository paths and addresses no longer keep the server busy for a long time

## 1.0.0

### Added

- Back up folders, MySQL, MariaDB, PostgreSQL and SQLite databases, and Docker volumes and stacks with restic
- Store backups in S3 compatible storage, a restic REST server, any rclone remote or a folder on the host
- Install restic on a host from the Backups tab
- Run jobs daily, weekly or on a custom cron, with commands before and after
- Remove old snapshots after each backup with a keep policy per job
- Watch a run live, stop it and read its log
- Browse snapshots, download a file or a folder, and restore to the same host or another one
- Alerts for failed backups and for jobs with no good backup for too long
- A warning when a backup goes to a folder on a host whose storage Storage Health reports as failing
- A dashboard card with every backup job, or one job per tile
- Termix actions to list jobs and snapshots, and to start or stop a backup
