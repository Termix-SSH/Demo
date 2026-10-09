# Changelog

## 1.0.0

### Added

- First release
- Certificates from Let's Encrypt or any ACME directory
- HTTP challenge on port 80, or a Cloudflare DNS challenge when port 80 is closed
- Renews before the certificate expires and alerts admins when a renewal fails
- Swaps in the new certificate without a restart
