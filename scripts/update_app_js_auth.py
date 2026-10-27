with open("App.js", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update setAuthMode
old_set_auth = """function setAuthMode(mode) {
  state.authMode = mode === 'signup' ? 'signup' : 'login';
  const signup = state.authMode === 'signup';
  if (signupFields) signupFields.hidden = !signup;
  if (gateTitle) gateTitle.textContent = signup ? 'Create Player Account' : 'CrickEye Login';
  if (gateSubtitle) gateSubtitle.textContent = signup
    ? 'Register to start tracking your cricket sessions.'
    : 'Login to continue your batting analytics.';
  if (gatePrimaryBtn) gatePrimaryBtn.textContent = signup ? 'Create Account' : 'Login';
  if (gateSwitchMode) gateSwitchMode.textContent = signup
    ? 'Already have an account? Login'
    : 'Need an account? Sign up';
  if (gatePassword) gatePassword.autocomplete = signup ? 'new-password' : 'current-password';
  setGateMessage('', true);
}"""

new_set_auth = """function setAuthMode(mode) {
  state.authMode = mode === 'signup' ? 'signup' : 'login';
  const signup = state.authMode === 'signup';
  if (signupFields) signupFields.hidden = !signup;
  if (gateTitle) gateTitle.textContent = signup ? 'Create Player Account' : 'CrickEye Login';
  if (gateSubtitle) gateSubtitle.textContent = signup
    ? 'Sign up to continue'
    : 'Sign in to continue';
  if (gatePrimaryBtn) gatePrimaryBtn.textContent = signup ? 'Create Account' : 'Sign in';
  if (gateSwitchMode) gateSwitchMode.textContent = signup
    ? 'Already have an account? Sign in'
    : 'Need an account? Sign up';
  if (gatePassword) gatePassword.autocomplete = signup ? 'new-password' : 'current-password';
  setGateMessage('', true);
}"""

if old_set_auth in text:
    text = text.replace(old_set_auth, new_set_auth)
    print("setAuthMode updated")
else:
    print("Warning: old_set_auth not found directly")

# 2. Wire up password toggle and remember me in init()
old_init_btn = """  gatePrimaryBtn?.addEventListener('click', () => {
    if (state.authMode === 'signup') signup();
    else login();
  });
  gateSwitchMode?.addEventListener('click', () => {
    setAuthMode(state.authMode === 'signup' ? 'login' : 'signup');
  });"""

new_init_btn = """  gatePrimaryBtn?.addEventListener('click', () => {
    if (state.authMode === 'signup') signup();
    else login();
  });
  gateSwitchMode?.addEventListener('click', () => {
    setAuthMode(state.authMode === 'signup' ? 'login' : 'signup');
  });

  const gateTogglePassword = document.getElementById('gateTogglePassword');
  gateTogglePassword?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!gatePassword) return;
    const isPass = gatePassword.type === 'password';
    gatePassword.type = isPass ? 'text' : 'password';
    gateTogglePassword.textContent = isPass ? 'Hide' : 'Show';
  });

  const gateRememberMe = document.getElementById('gateRememberMe');
  if (gateRememberMe && gateEmail) {
    try {
      const savedUser = localStorage.getItem('crickeye_remember_username');
      if (savedUser) {
        gateEmail.value = savedUser;
        gateRememberMe.checked = true;
      }
    } catch (e) {}

    gateRememberMe.addEventListener('change', () => {
      try {
        if (gateRememberMe.checked && gateEmail.value.trim()) {
          localStorage.setItem('crickeye_remember_username', gateEmail.value.trim());
        } else {
          localStorage.removeItem('crickeye_remember_username');
        }
      } catch (e) {}
    });

    gateEmail.addEventListener('input', () => {
      try {
        if (gateRememberMe.checked && gateEmail.value.trim()) {
          localStorage.setItem('crickeye_remember_username', gateEmail.value.trim());
        }
      } catch (e) {}
    });
  }"""

if old_init_btn in text:
    text = text.replace(old_init_btn, new_init_btn)
    print("init() updated with toggle & remember me")
else:
    print("Warning: old_init_btn not found directly")

with open("App.js", "w", encoding="utf-8") as f:
    f.write(text)

print("App.js updated successfully!")
