css_replacement = """/* ═══════════════ NEW AUTH GATE & LOGIN CARD (REFERENCE DESIGN) ═══════════════ */
.auth-gate {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #f1f3f7;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
  font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.auth-gate.hidden {
  display: none !important;
}

.auth-restore-status {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #1e293b;
  text-align: center;
}

.auth-restore-status strong {
  font-size: 1.05rem;
  font-weight: 600;
  color: #0f172a;
}

.auth-restore-status > span:last-child {
  color: #64748b;
  font-size: 0.85rem;
}

.auth-restore-spinner {
  width: 32px;
  height: 32px;
  margin-bottom: 6px;
  border: 3px solid rgba(148, 163, 184, 0.25);
  border-top-color: #0891b2;
  border-radius: 50%;
  animation: auth-restore-spin 0.8s linear infinite;
}

.auth-gate--pending .auth-login-card {
  display: none !important;
}

.auth-gate--pending .auth-restore-status {
  display: flex !important;
}

@keyframes auth-restore-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .auth-restore-spinner { animation: none; }
}

/* The login card */
.auth-login-card {
  background: #ffffff !important;
  border-radius: 26px !important;
  padding: 38px 34px 32px !important;
  width: min(420px, 94vw) !important;
  box-shadow: 0 20px 45px -12px rgba(15, 23, 42, 0.08), 0 0 1px 1px rgba(15, 23, 42, 0.04) !important;
  border: 1px solid #f1f5f9 !important;
  display: flex !important;
  flex-direction: column !important;
  margin: auto !important;
  box-sizing: border-box !important;
}

/* Header with Brand */
.auth-card-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;
}

.auth-brand-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 4px 10px;
}

.auth-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  text-align: left;
}

.auth-brand-name {
  font-family: 'Manrope', 'Plus Jakarta Sans', sans-serif;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #0f172a;
}

.auth-brand-tag {
  color: #0891b2;
  margin-left: 2px;
}

.auth-brand-sub {
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #64748b;
  margin-top: 2px;
}

.auth-card-subtitle {
  font-size: 13.5px;
  color: #64748b;
  margin-top: 14px;
  margin-bottom: 0;
  text-align: center;
  font-weight: 500;
}

/* Form layout */
.auth-form-body {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.auth-signup-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-signup-group[hidden] {
  display: none !important;
}

.auth-field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.auth-label {
  font-size: 13px;
  font-weight: 550;
  color: #334155;
  text-align: left;
}

.auth-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* Soft light-blue pill input field matching reference */
.auth-input-pill {
  background: #eef4ff !important;
  border: 1px solid #dbeafe !important;
  border-radius: 12px !important;
  padding: 13px 16px !important;
  font-size: 14px !important;
  color: #0f172a !important;
  outline: none !important;
  width: 100% !important;
  box-sizing: border-box !important;
  transition: all 0.15s ease !important;
  font-family: inherit !important;
}

.auth-input-pill::placeholder {
  color: #94a3b8 !important;
  font-size: 13.5px !important;
}

.auth-input-pill:focus {
  background: #ffffff !important;
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15) !important;
}

.auth-select {
  appearance: auto;
  cursor: pointer;
}

/* Password wrapper with right-side Show button */
.auth-password-wrapper {
  display: flex;
  align-items: stretch;
  background: #eef4ff;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.15s ease;
  width: 100%;
  box-sizing: border-box;
}

.auth-password-wrapper:focus-within {
  background: #ffffff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.auth-input-password {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  flex: 1;
  min-width: 0;
  padding: 13px 16px !important;
}

.auth-password-toggle-btn {
  background: #ffffff;
  border: none;
  border-left: 1px solid #e2e8f0;
  color: #0f172a;
  font-weight: 550;
  font-size: 13px;
  padding: 0 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  transition: background 0.12s ease;
}

.auth-password-toggle-btn:hover {
  background: #f8fafc;
}

.auth-password-toggle-btn:active {
  background: #f1f5f9;
}

/* Remember me row */
.auth-options-row {
  margin-top: -3px;
  margin-bottom: 5px;
}

.auth-remember-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.auth-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #0f172a;
  border-radius: 4px;
  cursor: pointer;
  margin: 0;
}

.auth-remember-text {
  font-size: 13px;
  color: #475569;
  font-weight: 450;
}

/* Action button (Full width solid black pill button) */
.auth-card-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.auth-primary-submit-btn {
  background: #111827;
  color: #ffffff;
  font-size: 14.5px;
  font-weight: 600;
  padding: 14px 20px;
  border-radius: 12px;
  width: 100%;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 4px 10px rgba(17, 24, 39, 0.08);
  font-family: inherit;
}

.auth-primary-submit-btn:hover {
  background: #1f2937;
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(17, 24, 39, 0.14);
}

.auth-primary-submit-btn:active {
  transform: translateY(0);
}

.auth-primary-submit-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none;
}

.auth-switch-mode-btn {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  width: 100%;
  cursor: pointer;
  padding: 4px 0;
  text-align: center;
  transition: color 0.12s ease;
  font-family: inherit;
}

.auth-switch-mode-btn:hover {
  color: #0f172a;
  text-decoration: underline;
}

.auth-message-box {
  min-height: 18px;
  font-size: 12.5px;
  text-align: center;
  margin-top: 10px;
  font-weight: 500;
  color: #ef4444;
}

"""

with open('style.css', 'r', encoding='utf-8') as f:
    text = f.read()

start = text.find('.auth-gate {')
end = text.find('body.criceye-role-coach #playerAppShell {')

new_text = text[:start] + css_replacement + text[end:]
with open('style.css', 'w', encoding='utf-8') as f:
    f.write(new_text)

print("Updated style.css successfully!")
