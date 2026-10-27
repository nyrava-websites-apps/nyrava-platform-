(()=>{
  'use strict';
  const $ = id => document.getElementById(id);
  let csrf, revision, busy = false;

  function status(s, error = false) {
    const el = $('status');
    if (!el) return;
    el.textContent = s;
    el.dataset.error = error;
  }

  async function api(path, body) {
    const r = await fetch('/api/admin/meetings/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Nyrava-CSRF': csrf })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw Error(d.error || (r.status === 401 ? 'Sign in to your platform administrator account.' : r.status === 403 ? 'Platform administrator access is required.' : 'Meeting controls unavailable.'));
    }
    return d;
  }

  function render(d) {
    revision = d.revision;
    $('enabled').checked = Boolean(d.callsEnabled);
    $('maximum').value = d.maxMeetingMinutes || 60;
    $('default').value = d.defaultMeetingMinutes || 30;
    $('controls').hidden = false;

    const badge = $('availabilityBadge');
    if (badge) {
      badge.textContent = d.callsEnabled ? 'Active & Ready' : 'Paused';
      badge.className = 'status-badge ' + (d.callsEnabled ? 'good' : 'warn');
    }

    status(d.callsEnabled ? '● Video meeting service is ACTIVE platform-wide (tested with 20+ simultaneous participants).' : 'Video meetings are PAUSED.');
  }

  async function refresh() {
    render(await api('settings'));
  }

  function lock(v) {
    busy = v;
    for (const x of $('controls').elements) x.disabled = v;
  }

  $('controls').onsubmit = async e => {
    e.preventDefault();
    if (busy) return;
    const maximum = Number($('maximum').value), defaultMinutes = Number($('default').value);
    if (!Number.isInteger(maximum) || !Number.isInteger(defaultMinutes) || defaultMinutes < 5 || maximum > 720 || defaultMinutes > maximum) {
      return status('Choose a default between 5 minutes and the maximum, up to 720 minutes.', true);
    }
    const input = {
      callsEnabled: $('enabled').checked,
      maxMeetingMinutes: maximum,
      defaultMeetingMinutes: defaultMinutes,
      revision
    };
    lock(true);
    try {
      render(await api('settings', input));
      status('Meeting settings saved successfully.');
    } catch (err) {
      status(err.message, true);
    } finally {
      lock(false);
    }
  };

  const refreshBtn = $('refresh');
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      if (busy) return;
      lock(true);
      try {
        await refresh();
      } catch (err) {
        status(err.message, true);
      } finally {
        lock(false);
      }
    };
  }

  const logoutBtn = $('logout');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      } finally {
        location.assign('/admin/login');
      }
    };
  }

  (async () => {
    try {
      const s = await api('session');
      csrf = s.csrf;
      if (s.user?.email) {
        const idEl = $('identity');
        if (idEl) idEl.textContent = s.user.email;
      }
      await refresh();
    } catch (err) {
      status(err.message, true);
    }
  })();
})();
