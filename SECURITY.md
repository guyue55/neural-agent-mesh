# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | ✅ |
| < 1.0 | ❌ |

## Reporting a vulnerability

This project is a static, client-side visualization. It has no server-side logic, no authentication, no database and collects no user data. The most relevant risk classes are therefore: unsafe HTML injection into the DOM, a malicious dependency or vendored file, and a deployed page serving unexpected content.

Please **do not open a public issue** for a security concern. Use GitHub's private vulnerability reporting: <https://github.com/guyue55/neural-agent-mesh/security/advisories/new>, or contact the maintainer through the account profile.

Include the affected file, a reproduction, and the impact you expect. You should receive an acknowledgement within 7 days; if the report is accepted, a fix and a release note will follow.

## Dependency notes

- Runtime has **no third-party network dependency**: Three.js r180 is vendored under `vendor/three/` and pinned. Updating it should be a deliberate, reviewed change.
- `three` and `playwright` in `package.json` are used for vendoring and verification only; neither is fetched by the deployed page.
- GitHub Pages serves the repository root with `.nojekyll`; no build pipeline executes untrusted code during deployment.
