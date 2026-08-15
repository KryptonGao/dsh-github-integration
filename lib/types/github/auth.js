import { createPrivateKey, createSign } from 'node:crypto';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { DEFAULT_GITHUB_APP_SETTINGS } from "../types.js";
function base64url(value) {
    return Buffer.from(value).toString('base64url');
}
function createAppJwt(appId, privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
    const unsigned = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    return `${unsigned}.${signer.sign(createPrivateKey(privateKey)).toString('base64url')}`;
}
async function readCredential(ctx, ref) {
    if (!ref)
        return undefined;
    const credentials = ctx.get('credentials');
    if (credentials !== undefined) {
        const value = await credentials.resolve(credentialRef(ref));
        if (value?.value)
            return value.value;
    }
    return process.env[ref] || undefined;
}
async function readSettings(ctx) {
    const settings = ctx.get('settings');
    if (settings === undefined)
        return { ...DEFAULT_GITHUB_APP_SETTINGS };
    const scope = settings.get?.('github-integration');
    return { ...DEFAULT_GITHUB_APP_SETTINGS, ...(scope ?? {}) };
}
async function githubTokenRequest(url, token, init = {}) {
    return fetch(url, {
        ...init,
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            Authorization: `Bearer ${token}`,
            ...(init.headers ?? {}),
        },
    });
}
/** Resolves GitHub App user and installation tokens without exposing secrets. */
export class GitHubAuthManager {
    ctx;
    installationTokens = new Map();
    userToken;
    constructor(ctx) {
        this.ctx = ctx;
    }
    async settings() {
        return readSettings(this.ctx);
    }
    async token(mode, installationId) {
        const config = await readSettings(this.ctx);
        if (mode === 'installation') {
            if (installationId === undefined)
                return undefined;
            const cached = this.installationTokens.get(installationId);
            if (cached !== undefined && cached.expiresAt > Date.now() + 60_000)
                return cached;
            const appId = config.appId.trim();
            const privateKey = await readCredential(this.ctx, config.privateKeyRef);
            if (!appId || !privateKey)
                return undefined;
            const jwt = createAppJwt(appId, privateKey);
            const response = await githubTokenRequest(`https://api.github.com/app/installations/${String(installationId)}/access_tokens`, jwt, { method: 'POST' });
            if (!response.ok)
                throw new Error(`GitHub App installation token failed: HTTP ${String(response.status)}`);
            const body = await response.json();
            if (!body.token)
                throw new Error('GitHub App installation token response did not include a token');
            const value = {
                token: body.token,
                expiresAt: body.expires_at ? Date.parse(body.expires_at) : Date.now() + 55 * 60_000,
                source: 'installation',
            };
            this.installationTokens.set(installationId, value);
            return value;
        }
        if (this.userToken !== undefined && this.userToken.expiresAt > Date.now() + 60_000)
            return this.userToken;
        const accessRef = config.userAccessTokenRef;
        const accessToken = await readCredential(this.ctx, accessRef);
        if (accessToken) {
            this.userToken = { token: accessToken, expiresAt: Date.now() + 50 * 60_000, source: 'user' };
            return this.userToken;
        }
        const refreshToken = await readCredential(this.ctx, config.userRefreshTokenRef);
        if (!refreshToken || !config.clientId || !config.clientSecretRef)
            return undefined;
        const clientSecret = await readCredential(this.ctx, config.clientSecretRef);
        if (!clientSecret)
            return undefined;
        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: config.clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
            }),
        });
        if (!response.ok)
            throw new Error(`GitHub user token refresh failed: HTTP ${String(response.status)}`);
        const body = await response.json();
        if (!body.access_token)
            throw new Error('GitHub user token refresh response did not include an access token');
        this.userToken = {
            token: body.access_token,
            expiresAt: Date.now() + (body.expires_in ?? 8 * 60 * 60) * 1_000,
            source: 'user',
        };
        try {
            const credentials = this.ctx.get('credentials');
            await credentials?.set(credentialRef(accessRef), body.access_token);
            if (body.refresh_token)
                await credentials?.set(credentialRef(config.userRefreshTokenRef), body.refresh_token);
        }
        catch {
            // Read-only credential layers can still be used for the current process.
        }
        return this.userToken;
    }
}
export function redactTokenMessage(value) {
    return value
        .replace(/Bearer\s+[A-Za-z0-9_\-]+/gi, 'Bearer [REDACTED_TOKEN]')
        .replace(/(?:gh[opsur]|github_pat)[A-Za-z0-9_\-]+/gi, '[REDACTED_TOKEN]');
}
//# sourceMappingURL=auth.js.map