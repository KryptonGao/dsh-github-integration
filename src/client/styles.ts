/**
 * GitHub surfaces use the same semantic tokens as DeepSeek Harness.  The
 * plugin is loaded as an independent ModuleLoader bundle, so its stylesheet
 * is installed once when the client face is applied instead of relying on a
 * separate CSS asset request.
 */

const STYLE_ID = 'dsh-github-integration-styles'

const styles = `
.dshGithubPanel,
.dshGithubPanel *,
.dshGithubPanel *::before,
.dshGithubPanel *::after {
  box-sizing: border-box;
}

.dshGithubPanel {
  width: 100%;
  min-height: 100%;
  overflow: auto;
  color: var(--dsw-alias-label-primary, #0f1115);
  background: var(--dsw-alias-bg-base, #fff);
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.dshGithubPanel button,
.dshGithubPanel input,
.dshGithubPanel select,
.dshGithubPanel textarea {
  font: inherit;
}

.dshGithubPanel button {
  color: inherit;
}

.dshGithubPanel button:focus-visible,
.dshGithubPanel input:focus-visible,
.dshGithubPanel select:focus-visible,
.dshGithubPanel textarea:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
  outline-offset: 2px;
}

.dshGithubPanelHeader {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 64px;
  padding: 12px 28px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 92%, transparent);
  backdrop-filter: blur(18px);
}

.dshGithubBrand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 140px;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -.02em;
}

.dshGithubMark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  color: var(--dsw-alias-label-primary-foreground, #fff);
  background: var(--dsw-alias-brand-primary, #0f1115);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -.08em;
}

.dshGithubTabs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dshGithubViewNav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 28px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
  background: var(--dsw-alias-bg-layer-1, #fff);
}

.dshGithubTab,
.dshGithubIconButton,
.dshGithubToolbarButton {
  appearance: none;
  border: 0;
  cursor: pointer;
  background: transparent;
}

.dshGithubTab {
  min-height: 34px;
  padding: 0 13px;
  border-radius: 10px;
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  font-size: 13px;
  transition: background .16s ease, color .16s ease;
}

.dshGithubTab:hover,
.dshGithubToolbarButton:hover,
.dshGithubIconButton:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .06));
}

.dshGithubTabActive {
  color: var(--dsw-alias-label-primary, #0f1115);
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
  font-weight: 600;
}

.dshGithubHeaderSpacer {
  flex: 1;
}

.dshGithubIconButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: var(--dsw-alias-label-tertiary, #545557);
  font-size: 21px;
  line-height: 1;
}

.dshGithubContext,
.dshGithubAuthBar {
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
  background: var(--dsw-alias-bg-layer-1, #fff);
}

.dshGithubContextInner,
.dshGithubAuthInner {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 1240px;
  margin: 0 auto;
  padding: 13px 28px;
}

.dshGithubContextInner {
  flex-wrap: wrap;
  min-height: 55px;
}

.dshGithubRepo {
  min-width: 0;
  font-weight: 650;
  letter-spacing: -.01em;
}

.dshGithubRepoPath {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshGithubMeta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary, #545557);
  font-size: 12px;
}

.dshGithubMeta code,
.dshGithubCode {
  padding: 2px 6px;
  border-radius: 6px;
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 12px;
}

.dshGithubStatusPill,
.dshGithubSessionBadge,
.dshGithubCredentialStatus {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 3px 9px;
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
}

.dshGithubStatusPillWarning {
  color: var(--dsw-alias-state-warn-label, #dd8629);
  background: var(--dsw-alias-state-warn-tertiary, #fef5e7);
}

.dshGithubStatusDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary, #22c55e);
}

.dshGithubStatusDotWarning {
  background: var(--dsw-alias-state-warn-primary, #f59e0b);
}

.dshGithubAuthInner {
  flex-wrap: wrap;
  font-size: 12px;
}

.dshGithubAuthLabel {
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  font-weight: 500;
}

.dshGithubInput,
.dshGithubSelect,
.dshGithubTextarea,
.dshGithubSettingsInput {
  width: 100%;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 8px;
  color: var(--dsw-alias-label-primary, #0f1115);
  background: var(--dsw-alias-bg-layer-3, #fff);
  transition: border-color .16s ease, background .16s ease;
}

.dshGithubInput,
.dshGithubSelect {
  height: 34px;
  padding: 0 10px;
}

.dshGithubSelect {
  width: auto;
  min-width: 174px;
}

.dshGithubInput::placeholder,
.dshGithubTextarea::placeholder,
.dshGithubSettingsInput::placeholder {
  color: var(--dsw-alias-label-caption, #a2a4a6);
}

.dshGithubInput:focus,
.dshGithubSelect:focus,
.dshGithubTextarea:focus,
.dshGithubSettingsInput:focus {
  border-color: var(--dsw-alias-brand-primary, #0f1115);
  outline: none;
}

.dshGithubAuthError {
  flex-basis: 100%;
  margin: 0;
  color: var(--dsw-alias-state-error-primary, #ec1313);
}

.dshGithubInstallInput {
  width: 150px;
}

.dshGithubMain {
  max-width: 1240px;
  margin: 0 auto;
  padding: 28px;
}

.dshGithubSurface {
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1, #fff);
}

.dshGithubSplit {
  display: grid;
  grid-template-columns: minmax(280px, .78fr) minmax(0, 1.42fr);
  min-height: 470px;
}

.dshGithubListPane {
  min-width: 0;
  border-right: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
}

.dshGithubPaneHeader,
.dshGithubDetailHeader {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 12px 18px;
}

.dshGithubPaneHeader {
  justify-content: space-between;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
}

.dshGithubPaneTitle {
  font-size: 14px;
  font-weight: 650;
}

.dshGithubToolbarButton {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  font-size: 12px;
}

.dshGithubList,
.dshGithubFileList {
  margin: 0;
  padding: 0;
  list-style: none;
}

.dshGithubListButton {
  display: block;
  width: 100%;
  padding: 14px 18px;
  border: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
  cursor: pointer;
  text-align: left;
  color: inherit;
  background: transparent;
  transition: background .16s ease;
}

.dshGithubListButton:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .06));
}

.dshGithubListButtonActive {
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
}

.dshGithubListTitle {
  display: block;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshGithubListMeta {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, #545557);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshGithubDetail {
  min-width: 0;
  overflow: auto;
  padding: 24px;
}

.dshGithubDetailHeader {
  min-height: auto;
  padding: 0 0 16px;
  align-items: flex-start;
}

.dshGithubDetailTitle {
  margin: 0;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -.025em;
  line-height: 1.3;
}

.dshGithubDetailNumber {
  color: var(--dsw-alias-label-tertiary, #545557);
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 13px;
  font-weight: 500;
}

.dshGithubLink {
  color: var(--dsw-alias-state-business-primary, #4176e6);
  text-decoration: none;
}

.dshGithubLink:hover {
  text-decoration: underline;
}

.dshGithubBody,
.dshGithubCommentBody {
  margin: 0;
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.dshGithubBody {
  padding: 16px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
  font-size: 13px;
}

.dshGithubSubheading {
  margin: 24px 0 10px;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 14px;
  font-weight: 650;
}

.dshGithubComment {
  padding: 13px 0;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
}

.dshGithubCommentAuthor {
  display: block;
  margin-bottom: 5px;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 12px;
  font-weight: 600;
}

.dshGithubActionBar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 22px;
}

.dshGithubButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 13px;
  border: 0;
  border-radius: 17px;
  cursor: pointer;
  color: var(--dsw-alias-label-primary, #0f1115);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  transition: background .16s ease, opacity .16s ease;
}

.dshGithubButton:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .06));
}

.dshGithubPanel .dshGithubButtonPrimary,
.dshGithubSettings .dshGithubButtonPrimary {
  color: var(--dsw-alias-label-primary-foreground, #fff);
  background: var(--dsw-alias-button-primary-fill, #0f1115);
}

.dshGithubPanel .dshGithubButtonPrimary:hover:not(:disabled),
.dshGithubSettings .dshGithubButtonPrimary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, #43454a);
}

.dshGithubButtonOutline {
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
}

.dshGithubButton:disabled {
  cursor: not-allowed;
  opacity: .4;
}

.dshGithubAlert {
  margin: 14px 18px;
  padding: 11px 12px;
  border-radius: 9px;
  color: var(--dsw-alias-state-error-primary, #ec1313);
  background: var(--dsw-alias-state-error-secondary, #fef2f2);
  font-size: 12px;
}

.dshGithubAlert p {
  margin: 0 0 8px;
}

.dshGithubSuccess {
  margin: 14px 18px;
  padding: 11px 12px;
  border-radius: 9px;
  color: var(--dsw-alias-state-success-primary, #15803d);
  background: var(--dsw-alias-state-success-tertiary, #e6faed);
  font-size: 12px;
}

.dshGithubNotice {
  padding: 48px 28px;
  text-align: center;
}

.dshGithubNoticeTitle {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -.02em;
}

.dshGithubNoticeText,
.dshGithubLoading {
  margin: 0;
  color: var(--dsw-alias-label-tertiary, #545557);
}

.dshGithubLoading {
  padding: 16px 18px;
}

.dshGithubChanges {
  padding: 24px 28px 34px;
}

.dshGithubChangesHeader {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.dshGithubChangesHeader .dshGithubPaneTitle {
  margin-right: auto;
  font-size: 18px;
}

.dshGithubBranchRow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  font-size: 12px;
}

.dshGithubFileList {
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 10px;
}

.dshGithubFileRow {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  font-size: 12px;
}

.dshGithubFileRow:last-child {
  border-bottom: 0;
}

.dshGithubFileRow label {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
}

.dshGithubFileRow input[type='checkbox'] {
  accent-color: var(--dsw-alias-state-business-primary, #4176e6);
}

.dshGithubFilePath {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshGithubFileStatus {
  margin-left: auto;
  color: var(--dsw-alias-label-tertiary, #545557);
  white-space: nowrap;
}

.dshGithubCommandBar,
.dshGithubPrForm {
  display: grid;
  gap: 10px;
  margin-top: 20px;
}

.dshGithubPrHeader {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
}

.dshGithubPrHeader .dshGithubSubheading {
  flex: 1;
  margin: 0;
}

.dshGithubBranchSelect {
  width: 100%;
  min-width: 0;
}

.dshGithubCommandBar {
  grid-template-columns: auto minmax(150px, 1fr) auto minmax(170px, 1fr) auto;
  align-items: center;
}

.dshGithubPrForm {
  max-width: 720px;
}

.dshGithubFieldLabel {
  display: grid;
  gap: 6px;
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  font-size: 12px;
  font-weight: 500;
}

.dshGithubTextarea {
  min-height: 104px;
  padding: 9px 10px;
  resize: vertical;
}

.dshGithubDiff {
  margin-top: 24px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
}

.dshGithubDiff summary {
  padding: 13px 0;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  font-size: 13px;
  font-weight: 600;
}

.dshGithubDiff pre {
  max-height: 320px;
  margin: 0 0 16px;
  padding: 14px;
  overflow: auto;
  border-radius: 9px;
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 12px;
  white-space: pre-wrap;
}

.dshGithubSettings {
  display: grid;
  gap: 18px;
  max-width: 720px;
  padding: 4px 0 20px;
}

.dshGithubSettingsTitle {
  margin: 0;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -.025em;
}

.dshGithubSettingsIntro {
  margin: -8px 0 0;
  color: var(--dsw-alias-label-tertiary, #545557);
  font-size: 13px;
  line-height: 1.6;
}

.dshGithubAuthCard {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3, #fff);
}

.dshGithubConnectPrompt,
.dshGithubConnectedUser {
  display: flex;
  align-items: center;
  gap: 14px;
}

.dshGithubConnectPrompt > div:first-child {
  display: grid;
  gap: 6px;
  margin-right: auto;
}

.dshGithubConnectedIdentity {
  display: grid;
  gap: 4px;
  margin-right: auto;
}

.dshGithubConnectedActions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dshGithubAvatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
}

.dshGithubDeveloperDetails {
  display: grid;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, .02));
}

.dshGithubDeveloperDetails summary {
  cursor: pointer;
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  font-size: 13px;
  font-weight: 600;
}

.dshGithubSettingsBaseFields {
  display: grid;
  gap: 14px;
}

.dshGithubSettingsField {
  display: grid;
  gap: 6px;
}

.dshGithubSettingsLabel {
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 13px;
  font-weight: 550;
}

.dshGithubSettingsHint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary, #545557);
  font-size: 12px;
}

.dshGithubSettingsInput {
  height: 36px;
  padding: 0 11px;
  font-size: 13px;
}

.dshGithubCredentialGroup {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3, #fff);
}

.dshGithubCredentialHeader {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dshGithubCredentialTitle {
  margin-right: auto;
  font-size: 14px;
  font-weight: 650;
}

.dshGithubCredentialStatusConfigured {
  color: var(--dsw-alias-state-success-primary, #22c55e);
  background: var(--dsw-alias-state-success-tertiary, #e6faed);
}

.dshGithubCredentialStatusMuted {
  color: var(--dsw-alias-label-tertiary, #545557);
}

.dshGithubCredentialActions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dshGithubSettingsError {
  margin: 0;
  color: var(--dsw-alias-state-error-primary, #ec1313);
  font-size: 12px;
}

.dshGithubSidebarAction {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary, #3c3c3d);
  background: transparent;
  font-size: 13px;
  transition: background .16s ease, color .16s ease;
}

.dshGithubSidebarAction:hover {
  color: var(--dsw-alias-label-primary, #0f1115);
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .06));
}

.dshGithubSidebarGlyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 8px;
  border-radius: 6px;
  color: var(--dsw-alias-label-primary-foreground, #fff);
  background: var(--dsw-alias-brand-primary, #0f1115);
  font-size: 10px;
  font-weight: 700;
}

.dshGithubSessionBadge {
  color: var(--dsw-alias-state-business-primary, #4176e6);
  background: var(--dsw-alias-state-business-tertiary, #e4edfd);
}

@media (max-width: 760px) {
  .dshGithubPanelHeader,
  .dshGithubViewNav,
  .dshGithubContextInner,
  .dshGithubAuthInner,
  .dshGithubMain {
    padding-left: 16px;
    padding-right: 16px;
  }

  .dshGithubBrand {
    min-width: auto;
  }

  .dshGithubTab {
    padding: 0 9px;
  }

  .dshGithubSplit {
    grid-template-columns: 1fr;
  }

  .dshGithubListPane {
    border-right: 0;
    border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06));
  }

  .dshGithubCommandBar {
    grid-template-columns: 1fr;
  }
}
`

export function installGitHubStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) return
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.dataset.plugin = 'dsh-github-integration'
  tag.textContent = styles
  document.head.appendChild(tag)
}
