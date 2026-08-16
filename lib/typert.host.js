import { z } from "zod";
//#region lib/types/remote.js
const JSON_VALUE = z.json();
const JSON_RESULT = z.union([z.json(), z.undefined()]);
function descriptor(method, hasSignal = true) {
	return {
		id: `dsh-github-integration#github/${method}`,
		service: "github",
		namespace: "github",
		method,
		invocation: { kind: "direct" },
		parameters: [{
			name: "input",
			wire: "input",
			source: "json",
			codec: {
				mode: "strict",
				typeSymbol: "dsh-github-integration#JsonValue",
				schema: JSON_VALUE
			}
		}],
		...hasSignal ? { cancellation: { parameter: "signal" } } : {},
		result: {
			mode: "strict",
			typeSymbol: "dsh-github-integration#JsonResult",
			schema: JSON_RESULT
		}
	};
}
//#endregion
//#region lib/types/typert.host.js
/** Hand-authored reflection companion for the standalone bundle package. */
const TYPERT = {
	package: "dsh-github-integration",
	face: "host",
	schemas: [],
	model: {
		services: [],
		events: [],
		objects: []
	},
	invocations: {
		package: "dsh-github-integration",
		descriptors: [
			descriptor("beginUserAuthorization"),
			descriptor("getAuthState"),
			descriptor("disconnect"),
			descriptor("getWorkspaceState"),
			descriptor("setWorkspaceAuth"),
			descriptor("listIssues"),
			descriptor("getIssue"),
			descriptor("getIssueComments"),
			descriptor("listPullRequests"),
			descriptor("listBranches"),
			descriptor("getPullRequest"),
			descriptor("getPullRequestFiles"),
			descriptor("getGitStatus"),
			descriptor("getGitDiff"),
			descriptor("createBranch"),
			descriptor("stage"),
			descriptor("commit"),
			descriptor("push"),
			descriptor("createPullRequest"),
			descriptor("linkSession"),
			descriptor("getSessionLink", false)
		]
	}.descriptors
};
//#endregion
export { TYPERT, TYPERT as default };
