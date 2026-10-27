import re

with open("index.html", "r", encoding="utf-8") as f:
    content = f.read()

replacement = '''  <!-- ═══════════════ AUTH GATE ═══════════════ -->
  <div id="authGate" class="auth-gate auth-gate--pending">
    <div class="auth-restore-status" role="status" aria-live="polite">
      <span class="auth-restore-spinner" aria-hidden="true"></span>
      <strong>Restoring your session</strong>
      <span>Please wait a moment…</span>
    </div>

    <div class="auth-login-card">
      <!-- Centered Header & Branding (matches reference layout) -->
      <div class="auth-card-header">
        <div class="auth-brand-badge">
          <svg width="42" height="42" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="14" stroke="#0891B2" stroke-width="2"/>
            <path d="M8 16 Q16 6 24 16 Q16 26 8 16Z" fill="#0891B2" fill-opacity="0.18" stroke="#0891B2" stroke-width="1.5"/>
            <circle cx="16" cy="16" r="3" fill="#0891B2"/>
            <path d="M11 16 H21" stroke="#0891B2" stroke-width="1.2" stroke-dasharray="2 2"/>
          </svg>
          <div class="auth-brand-text">
            <span class="auth-brand-name">CRICKEYE<span class="auth-brand-tag">PRO</span></span>
            <span class="auth-brand-sub">AI BATTING ANALYTICS</span>
          </div>
        </div>
        <p id="gateSubtitle" class="auth-card-subtitle">Sign in to continue</p>
        <h2 id="gateTitle" class="sr-only">CrickEye Login</h2>
      </div>

      <!-- Form Body -->
      <div class="auth-form-body">
        <!-- Signup-only fields (shown only when mode is signup) -->
        <div id="signupFields" class="auth-signup-group" hidden>
          <div class="auth-field-row">
            <label for="gateFullName" class="auth-label">Full Name</label>
            <input type="text" id="gateFullName" placeholder="Enter full name" autocomplete="name" class="auth-input-pill" />
          </div>
          <div class="auth-grid-2">
            <div class="auth-field-row">
              <label for="gateAge" class="auth-label">Age</label>
              <input type="number" id="gateAge" placeholder="Age" min="8" max="100" class="auth-input-pill" />
            </div>
            <div class="auth-field-row">
              <label for="gateGender" class="auth-label">Gender</label>
              <select id="gateGender" class="auth-input-pill auth-select">
                <option value="">Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Username / Email Field -->
        <div class="auth-field-row">
          <label for="gateEmail" class="auth-label">Username</label>
          <input type="email" id="gateEmail" placeholder="Enter username or email" autocomplete="email" class="auth-input-pill" />
        </div>

        <!-- Password Field with Show Toggle -->
        <div class="auth-field-row">
          <label for="gatePassword" class="auth-label">Password</label>
          <div class="auth-password-wrapper" id="gatePasswordWrapper">
            <input type="password" id="gatePassword" placeholder="••••••••••••" autocomplete="current-password" class="auth-input-pill auth-input-password" />
            <button type="button" id="gateTogglePassword" class="auth-password-toggle-btn" tabindex="-1">Show</button>
          </div>
        </div>

        <!-- Remember Me Checkbox -->
        <div class="auth-options-row">
          <label class="auth-remember-row" for="gateRememberMe">
            <input type="checkbox" id="gateRememberMe" class="auth-checkbox" />
            <span class="auth-remember-text">Remember my username</span>
          </label>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="auth-card-actions">
        <button type="button" id="gatePrimaryBtn" class="auth-primary-submit-btn">Sign in</button>
        <button type="button" id="gateSwitchMode" class="auth-switch-mode-btn">Need an account? Sign up</button>
      </div>

      <div id="gateMessage" class="auth-message-box"></div>
    </div>
  </div>'''

pattern = re.compile(r'<!-- [═\?].*?AUTH GATE.*?-->\s*<div id="authGate".*?</div>\s*</div>', re.DOTALL)
new_content, count = pattern.subn(replacement, content, count=1)
if count == 0:
    print("Error: Pattern did not match")
else:
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully replaced authGate HTML in index.html")
