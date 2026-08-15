import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
const EMPTY_STATE = { bindings: {}, sessions: {} };
function storagePath() {
    const root = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
    return join(root, 'github-integration', 'state.json');
}
/** Small serialized JSON store for plugin-owned Workspace and Session links. */
export class GitHubStateStore {
    state = structuredClone(EMPTY_STATE);
    loaded = false;
    tail = Promise.resolve();
    async load() {
        if (this.loaded)
            return;
        this.loaded = true;
        try {
            const raw = await readFile(storagePath(), 'utf8');
            const parsed = JSON.parse(raw);
            this.state = {
                bindings: parsed.bindings ?? {},
                sessions: parsed.sessions ?? {},
            };
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    binding(workspaceId) {
        return this.state.bindings[workspaceId];
    }
    async setBinding(workspaceId, value) {
        this.state.bindings[workspaceId] = value;
        await this.persist();
    }
    session(sessionId) {
        return this.state.sessions[sessionId];
    }
    async setSession(value) {
        this.state.sessions[value.sessionId] = value;
        await this.persist();
    }
    persist() {
        this.tail = this.tail.then(async () => {
            const path = storagePath();
            const temp = `${path}.tmp`;
            await mkdir(dirname(path), { recursive: true });
            await writeFile(temp, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
            await rename(temp, path);
        });
        return this.tail;
    }
}
//# sourceMappingURL=storage.js.map