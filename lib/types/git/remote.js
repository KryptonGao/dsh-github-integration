const OWNER_REPOSITORY = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/;
/** Parse only the two public GitHub origin forms supported by the MVP. */
export function parseGitHubRemote(url, remoteName = 'origin') {
    if (remoteName !== 'origin')
        return null;
    const normalized = url.trim();
    let path;
    if (normalized.startsWith('https://github.com/')) {
        const rest = normalized.slice('https://github.com/'.length);
        if (rest.includes('?') || rest.includes('#') || rest.includes('//'))
            return null;
        path = rest;
    }
    else if (normalized.startsWith('git@github.com:')) {
        path = normalized.slice('git@github.com:'.length);
    }
    else {
        return null;
    }
    const match = OWNER_REPOSITORY.exec(path);
    if (match === null)
        return null;
    const owner = match[1];
    const repository = match[2];
    if (owner === undefined || repository === undefined)
        return null;
    return {
        provider: 'github',
        owner,
        repository,
        remoteName: 'origin',
        remoteUrl: normalized,
        authMode: 'user',
    };
}
export function safeBranchName(value) {
    if (typeof value !== 'string')
        throw new Error('branch name is invalid');
    const normalized = value
        .trim()
        .replace(/[^A-Za-z0-9._/-]+/g, '-')
        .replace(/\/{2,}/g, '/')
        .replace(/^[-/.]+|[-/.]+$/g, '');
    if (!normalized || normalized.startsWith('.') || normalized.includes('..')) {
        throw new Error('branch name is invalid');
    }
    return normalized.slice(0, 120);
}
export function issueBranchName(number, title) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return safeBranchName(`agent/issue-${String(number)}${slug ? `-${slug}` : ''}`);
}
//# sourceMappingURL=remote.js.map