(function() {
  const ICONS = {
    // Navigation & header
    'videocam': '<i class="fa-solid fa-video" aria-hidden="true"></i>',
    'scoreboard': '<i class="fa-solid fa-gauge-high" aria-hidden="true"></i>',
    'sports_cricket': '<i class="fa-solid fa-baseball-bat-ball" aria-hidden="true"></i>',
    'accessibility_new': '<i class="fa-solid fa-person-running" aria-hidden="true"></i>',
    'video_library': '<i class="fa-solid fa-film" aria-hidden="true"></i>',
    'tune': '<i class="fa-solid fa-sliders" aria-hidden="true"></i>',
    'wifi': '<i class="fa-solid fa-wifi" aria-hidden="true"></i>',
    'usb': '<i class="fa-brands fa-usb" aria-hidden="true"></i>',
    'cloud': '<i class="fa-solid fa-cloud" aria-hidden="true"></i>',
    'router': '<i class="fa-solid fa-network-wired" aria-hidden="true"></i>',
    'dns': '<i class="fa-solid fa-server" aria-hidden="true"></i>',
    'dark_mode': '<i class="fa-solid fa-moon" aria-hidden="true"></i>',
    'light_mode': '<i class="fa-solid fa-sun" aria-hidden="true"></i>',
    'menu': '<i class="fa-solid fa-bars" aria-hidden="true"></i>',
    'left_panel_close': '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>',
    'timer': '<i class="fa-solid fa-stopwatch" aria-hidden="true"></i>',
    'bolt': '<i class="fa-solid fa-bolt" aria-hidden="true"></i>',
    'whatshot': '<i class="fa-solid fa-fire-flame-curved" aria-hidden="true"></i>',
    'warning': '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>',
    'info': '<i class="fa-solid fa-circle-info" aria-hidden="true"></i>',
    'insights': '<i class="fa-solid fa-chart-line" aria-hidden="true"></i>',
    'flag': '<i class="fa-solid fa-flag" aria-hidden="true"></i>',
    'star': '<i class="fa-solid fa-star" aria-hidden="true"></i>',
    'check': '<i class="fa-solid fa-check" aria-hidden="true"></i>',
    'close': '<i class="fa-solid fa-xmark" aria-hidden="true"></i>',
    'arrow_back': '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i>',
    'arrow_forward': '<i class="fa-solid fa-arrow-right" aria-hidden="true"></i>',
    'chevron_left': '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>',
    'chevron_right': '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>',
    'expand_more': '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>',
    'compare_arrows': '<i class="fa-solid fa-code-compare" aria-hidden="true"></i>',
    'delete_sweep': '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>',
    'restart_alt': '<i class="fa-solid fa-rotate-left" aria-hidden="true"></i>',
    'phone_android': '<i class="fa-solid fa-mobile-screen" aria-hidden="true"></i>',
    'laptop': '<i class="fa-solid fa-laptop" aria-hidden="true"></i>',
    'photo_camera': '<i class="fa-solid fa-camera" aria-hidden="true"></i>',
    'flip_camera_android': '<i class="fa-solid fa-camera-rotate" aria-hidden="true"></i>',
    'cameraswitch': '<i class="fa-solid fa-camera-rotate" aria-hidden="true"></i>',
    'filter_center_focus': '<i class="fa-solid fa-crosshairs" aria-hidden="true"></i>',
    'fiber_manual_record': '<i class="fa-solid fa-circle" aria-hidden="true"></i>',
    'stop_circle': '<i class="fa-solid fa-circle-stop" aria-hidden="true"></i>',
    'hourglass_empty': '<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>',
    'download': '<i class="fa-solid fa-download" aria-hidden="true"></i>',
    'description': '<i class="fa-solid fa-file-lines" aria-hidden="true"></i>',
    'scatter_plot': '<i class="fa-solid fa-chart-scatter" aria-hidden="true"></i>',
    'track_changes': '<i class="fa-solid fa-bullseye" aria-hidden="true"></i>',
    'sports_baseball': '<i class="fa-solid fa-baseball" aria-hidden="true"></i>',
    'speed': '<i class="fa-solid fa-gauge" aria-hidden="true"></i>',
    'open_in_full': '<i class="fa-solid fa-expand" aria-hidden="true"></i>',
    'repeat': '<i class="fa-solid fa-repeat" aria-hidden="true"></i>',
    'cloud_upload': '<i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>',
    'movie': '<i class="fa-solid fa-clapperboard" aria-hidden="true"></i>',
    'play_arrow': '<i class="fa-solid fa-play" aria-hidden="true"></i>',
    'circle': '<i class="fa-solid fa-circle" aria-hidden="true"></i>'
  };

  function transformElement(el) {
    if (el.dataset.faProcessed) return;
    const key = (el.textContent || '').trim();
    if (ICONS[key]) {
      el.dataset.faProcessed = 'true';
      el.classList.add('fa-icon-replaced');
      el.innerHTML = ICONS[key];
    }
  }

  function scanAll(root) {
    const targets = (root || document).querySelectorAll('.material-symbols-outlined, .mui-icon');
    targets.forEach(transformElement);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scanAll(document.body));
  } else {
    scanAll(document.body);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches && (node.matches('.material-symbols-outlined') || node.matches('.mui-icon'))) {
              transformElement(node);
            }
            if (node.querySelectorAll) {
              scanAll(node);
            }
          }
        });
      } else if (m.type === 'characterData') {
        const parent = m.target.parentElement;
        if (parent && (parent.classList.contains('material-symbols-outlined') || parent.classList.contains('mui-icon'))) {
          parent.removeAttribute('data-fa-processed');
          transformElement(parent);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.FontAwesomeAdapter = {
    render: (key) => ICONS[key] || `<i class="fa-solid fa-circle"></i>`,
    scan: scanAll
  };
})();
