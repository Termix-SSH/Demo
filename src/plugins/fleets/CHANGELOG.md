# Changelog

## 1.1.0

### Added

- Fleet actions try a host again when its SSH connection times out, only for the hosts that failed, with admin settings for how many tries and how long to wait

## 1.0.2

### Added

- Pick a snippet in a fleet's Run command tab to run it on every host in the fleet

### Changed

- The plugin name and description show in your language

## 1.0.1

### Fixed

- Fleet commands, package actions and file transfers no longer time out after 30 seconds
- Fleet commands can run for up to an hour per host

## 1.0.0

### Added

- First release
- Group hosts by hand or with tag rules, so new hosts join on their own
- Run one command on every host and see each result
- Install, remove or upgrade packages across the fleet
- Push and pull files on every host
- Collect an inventory of OS, kernel, architecture and uptime
- Share a fleet with users or roles
