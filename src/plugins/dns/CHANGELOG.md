# Changelog

## 1.1.0

### Changed

- Runs in its own process on Termix 26.11.2 and later, with no access to the server beyond what Termix allows it
- Its process stops when it has nothing to watch or run, and Termix starts it again when there is work, which saves memory on Termix 26.11.2 and later

## 1.0.0

### Added

- A DNS tab to manage records at Cloudflare, Amazon Route 53, DigitalOcean, Hetzner, Namecheap, GoDaddy, Porkbun and Gandi
- A domain list with expiry dates, auto renew, transfer lock and name servers from Route 53, Namecheap, GoDaddy, Porkbun and Gandi
- Watch any domain by name through RDAP
- Alerts when a domain is about to expire
- Links that keep a record pointed at a host or at this server's public address
- Health checks for name servers, DNSSEC, mail records and broken CNAMEs, and a check against public resolvers
- Zone copies before each change, with compare and restore, and an alert when a zone changes outside Termix
- BIND zone file import and export
- A dns.records service for other plugins, and actions for the assistant, rules and the CLI
- A dashboard card with domains close to expiry
