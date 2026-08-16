# GitHub OAuth Broker

This Cloudflare Worker keeps the GitHub App Client Secret out of the public
Harness plugin. It owns the GitHub callback, exchanges authorization codes with
PKCE, and exposes short-lived flow handoff, refresh, and revoke endpoints.

Deploy from this directory:

```sh
npx wrangler deploy
npx wrangler secret put GITHUB_APP_CLIENT_SECRET
```

The Client Secret must never be committed to this repository. The Worker uses
a Durable Object for the ten-minute, single-use OAuth flow store.
