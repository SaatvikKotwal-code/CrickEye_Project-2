import os

app_path = r'c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\App.js'

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update setAuthMode texts
old_sub = (
    "  if (gateSubtitle) gateSubtitle.textContent = signup\n"
    "    ? 'Register to start tracking your cricket sessions.'\n"
    "    : 'Login to continue your batting analytics.';\n"
    "  if (gatePrimaryBtn) gatePrimaryBtn.textContent = signup ? 'Create Account' : 'Login';\n"
    "  if (gateSwitchMode) gateSwitchMode.textContent = signup\n"
    "    ? 'Already have an account? Login'\n"
    "    : 'Need an account? Sign up';"
)

new_sub = (
    "  if (gateSubtitle) gateSubtitle.textContent = signup\n"
    "    ? 'Sign up to continue'\n"
    "    : 'Sign in to continue';\n"
    "  if (gatePrimaryBtn) gatePrimaryBtn.textContent = signup ? 'Create Account' : 'Sign in';\n"
    "  if (gateSwitchMode) gateSwitchMode.textContent = signup\n"
    "    ? 'Already have an account? Sign in'\n"
    "    : 'Need an account? Sign up';"
)

# Normalize CRLF for matching
content_crlf = '\r\n' in content

def norm(s):
    return s.replace('\r\n', '\n')

content_norm = norm(content)

if old_sub in content_norm:
    content_norm = content_norm.replace(old_sub, new_sub, 1)
    print("Updated setAuthMode texts.")
else:
    print("Warning: old_sub not found in content_norm.")

# 2. Add gateTogglePassword and gateRememberMe
old_switch = (
    "  gateSwitchMode?.addEventListener('click', () => {\n"
    "    setAuthMode(state.authMode === 'signup' ? 'login' : 'signup');\n"
    "  });"
)

new_switch = (
    "  gateSwitchMode?.addEventListener('click', () => {\n"
    "    setAuthMode(state.authMode === 'signup' ? 'login' : 'signup');\n"
    "  });\n"
    "\n"
    "  const gateTogglePassword = document.getElementById('gateTogglePassword');\n"
    "  gateTogglePassword?.addEventListener('click', (e) => {\n"
    "    e.preventDefault();\n"
    "    if (!gatePassword) return;\n"
    "    const isPass = gatePassword.type === 'password';\n"
    "    gatePassword.type = isPass ? 'text' : 'password';\n"
    "    gateTogglePassword.textContent = isPass ? 'Hide' : 'Show';\n"
    "  });\n"
    "\n"
    "  const gateRememberMe = document.getElementById('gateRememberMe');\n"
    "  if (gateRememberMe && gateEmail) {\n"
    "    try {\n"
    "      const savedUser = localStorage.getItem('crickeye_remember_username');\n"
    "      if (savedUser) {\n"
    "        gateEmail.value = savedUser;\n"
    "        gateRememberMe.checked = true;\n"
    "      }\n"
    "    } catch (e) {}\n"
    "\n"
    "    gateRememberMe.addEventListener('change', () => {\n"
    "      try {\n"
    "        if (gateRememberMe.checked && gateEmail.value.trim()) {\n"
    "          localStorage.setItem('crickeye_remember_username', gateEmail.value.trim());\n"
    "        } else {\n"
    "          localStorage.removeItem('crickeye_remember_username');\n"
    "        }\n"
    "      } catch (e) {}\n"
    "    });\n"
    "\n"
    "    gateEmail.addEventListener('input', () => {\n"
    "      try {\n"
    "        if (gateRememberMe.checked && gateEmail.value.trim()) {\n"
    "          localStorage.setItem('crickeye_remember_username', gateEmail.value.trim());\n"
    "        }\n"
    "      } catch (e) {}\n"
    "    });\n"
    "  }"
)

if old_switch in content_norm:
    content_norm = content_norm.replace(old_switch, new_switch, 1)
    print("Added gateTogglePassword and gateRememberMe.")
else:
    print("Warning: old_switch not found.")

# 3. Add initFontSizeSwitcher call in init()
old_init_calls = (
    "  initThemeToggle();\n"
    "  initFeedFullscreen();"
)

new_init_calls = (
    "  initThemeToggle();\n"
    "  initFontSizeSwitcher();\n"
    "  initFeedFullscreen();"
)

if old_init_calls in content_norm:
    content_norm = content_norm.replace(old_init_calls, new_init_calls, 1)
    print("Added initFontSizeSwitcher() call.")
else:
    print("Warning: old_init_calls not found.")

# 4. Add FONT_SIZE functions above initThemeToggle
old_theme = "function initThemeToggle() {"

new_font_and_theme = (
    "const FONT_SIZE_KEY = 'ce-font-size';\n"
    "\n"
    "function applyFontSize(size) {\n"
    "  const validSize = size === 'sm' || size === 'lg' ? size : 'md';\n"
    "  document.documentElement.dataset.fontSize = validSize;\n"
    "  try { localStorage.setItem(FONT_SIZE_KEY, validSize); } catch (e) {}\n"
    "\n"
    "  document.querySelectorAll('.font-size-btn').forEach((btn) => {\n"
    "    const isTarget = btn.getAttribute('data-font-size') === validSize;\n"
    "    btn.classList.toggle('is-active', isTarget);\n"
    "    btn.setAttribute('aria-pressed', String(isTarget));\n"
    "  });\n"
    "}\n"
    "\n"
    "function initFontSizeSwitcher() {\n"
    "  let saved = 'md';\n"
    "  try { saved = localStorage.getItem(FONT_SIZE_KEY) || 'md'; }\n"
    "  catch (e) {}\n"
    "  applyFontSize(saved);\n"
    "\n"
    "  document.addEventListener('click', (e) => {\n"
    "    const btn = e.target.closest('.font-size-btn');\n"
    "    if (!btn) return;\n"
    "    const size = btn.getAttribute('data-font-size');\n"
    "    if (size) applyFontSize(size);\n"
    "  });\n"
    "}\n"
    "\n"
    "function initThemeToggle() {"
)

if old_theme in content_norm:
    content_norm = content_norm.replace(old_theme, new_font_and_theme, 1)
    print("Added applyFontSize and initFontSizeSwitcher.")
else:
    print("Warning: old_theme not found.")

if content_crlf:
    final_content = content_norm.replace('\n', '\r\n')
else:
    final_content = content_norm

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(final_content)

print("Saved App.js successfully.")

