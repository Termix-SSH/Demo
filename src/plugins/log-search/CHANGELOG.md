# Changelog

## 1.1.0

### Changed

- Runs in its own process on Termix 26.11.2 and later, with no access to the server beyond what Termix allows it

## 1.0.0

### Added

- Search the systemd journal, log files and Docker logs on many hosts at once
- Plain text or regular expression search with a time range and level filter
- One merged result list with a status line for every host
- Live search over SSH, nothing is stored or indexed
- A search action for Operations, the assistant and the CLI
