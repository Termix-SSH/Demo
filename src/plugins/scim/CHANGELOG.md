# Changelog

## 1.0.0

### Added

- SCIM 2.0 server so an identity provider like Entra ID or Okta can create, update, turn off and remove Termix accounts
- More than one identity provider, each with its own URL and token
- Map pushed groups to Termix roles, plus default roles for every user
- Optional mapping of a group to the admin role
- Choose whether a deleted user is turned off or deleted
- Optional take over of existing accounts with the same username or email, never admins
- New accounts link to their SSO or LDAP sign in by email
- Recent changes per connection on the settings page
