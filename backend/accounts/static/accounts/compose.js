/* Gmail-style compose window for emailing clients from the admin.
 * Loaded as a file (the site's security policy blocks inline scripts). */
(function () {
  'use strict';
  var form = document.getElementById('gm');
  if (!form) return;

  var clients = JSON.parse(document.getElementById('gm-clients').textContent || '[]');
  var chosenIds = JSON.parse(document.getElementById('gm-chosen').textContent || '[]');
  var maxBytes = Number(form.dataset.maxMb || 10) * 1024 * 1024;
  var maxFiles = Number(form.dataset.maxFiles || 20);

  var chips = document.getElementById('gm-chips');
  var toInput = document.getElementById('gm-to-input');
  var suggest = document.getElementById('gm-suggest');
  var allBtn = document.getElementById('gm-all');
  var subject = document.getElementById('gm-subject');
  var body = document.getElementById('gm-body');
  var fileInput = document.getElementById('gm-file-input');
  var fileList = document.getElementById('gm-files');
  var errorBox = document.getElementById('gm-error');
  var sendBtn = document.getElementById('gm-send');
  var sendBtnTop = document.getElementById('gm-send-top');
  var uploadUrl = form.dataset.uploadUrl;
  var count = document.getElementById('gm-count');
  var sending = false;

  var byId = {};
  clients.forEach(function (c) { byId[c.id] = c; });
  var selected = [];          // client ids, in the order picked
  var files = [];             // { file, id, progress, state: 'uploading' | 'done' | 'failed', xhr }
  var active = -1;            // highlighted suggestion

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function sizeText(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = !msg;
  }
  function updateCount() {
    var total = files.reduce(function (s, i) { return s + i.file.size; }, 0);
    var parts = [];
    if (selected.length) parts.push(selected.length + ' recipient' + (selected.length === 1 ? '' : 's'));
    if (files.length) parts.push(files.length + ' file' + (files.length === 1 ? '' : 's') + ', ' + sizeText(total));
    count.textContent = parts.join(' · ');
    allBtn.textContent = selected.length === clients.length && clients.length ? 'Clear all' : 'Select all users';
  }

  /* ---------- Recipients ---------- */
  function renderChips() {
    Array.prototype.slice.call(chips.querySelectorAll('.gm__chip')).forEach(function (c) { c.remove(); });
    var showAll = selected.length > 8;
    var list = showAll ? selected.slice(0, 6) : selected;
    list.forEach(function (id) {
      var c = byId[id];
      var chip = el('span', 'gm__chip');
      chip.title = c.email;
      chip.appendChild(el('span', '', c.name !== c.email ? c.name + ' <' + c.email + '>' : c.email));
      var x = el('button', '', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove ' + c.email);
      x.addEventListener('click', function () { remove(id); });
      chip.appendChild(x);
      chips.insertBefore(chip, toInput);
    });
    if (showAll) {
      var more = el('span', 'gm__chip gm__chip--all');
      more.appendChild(el('span', '', '+ ' + (selected.length - 6) + ' more'));
      chips.insertBefore(more, toInput);
    }
    updateCount();
  }
  function add(id) {
    if (byId[id] && selected.indexOf(id) === -1) selected.push(id);
    toInput.value = '';
    renderChips();
    closeSuggest();
    toInput.focus();
  }
  function remove(id) {
    selected = selected.filter(function (x) { return x !== id; });
    renderChips();
  }
  function matches(q) {
    q = q.trim().toLowerCase();
    return clients.filter(function (c) {
      return selected.indexOf(c.id) === -1 &&
        (!q || c.email.toLowerCase().indexOf(q) !== -1 || c.name.toLowerCase().indexOf(q) !== -1);
    }).slice(0, 50);
  }
  function openSuggest() {
    var list = matches(toInput.value);
    suggest.innerHTML = '';
    active = list.length ? 0 : -1;
    if (!list.length) {
      suggest.appendChild(el('li', 'is-empty', clients.length ? 'No matching users' : 'There are no users with an email address yet'));
    }
    list.forEach(function (c, i) {
      var li = el('li', i === 0 ? 'is-active' : '');
      li.setAttribute('role', 'option');
      li.appendChild(el('b', '', c.name));
      if (c.name !== c.email) li.appendChild(el('small', '', c.email));
      li.addEventListener('mousedown', function (e) { e.preventDefault(); add(c.id); });
      li.dataset.id = c.id;
      suggest.appendChild(li);
    });
    suggest.hidden = false;
    toInput.setAttribute('aria-expanded', 'true');
  }
  function closeSuggest() {
    suggest.hidden = true;
    toInput.setAttribute('aria-expanded', 'false');
  }
  toInput.addEventListener('focus', openSuggest);
  toInput.addEventListener('input', openSuggest);
  toInput.addEventListener('blur', function () { setTimeout(closeSuggest, 150); });
  toInput.addEventListener('keydown', function (e) {
    var items = suggest.querySelectorAll('li[data-id]');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach(function (li, i) { li.classList.toggle('is-active', i === active); });
      items[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      if (items[active] && toInput.value.trim()) { e.preventDefault(); add(Number(items[active].dataset.id)); }
      else if (e.key === 'Enter') { e.preventDefault(); }
    } else if (e.key === 'Backspace' && !toInput.value && selected.length) {
      remove(selected[selected.length - 1]);
    } else if (e.key === 'Escape') {
      closeSuggest();
    }
  });
  chips.addEventListener('click', function (e) { if (e.target === chips) toInput.focus(); });
  allBtn.addEventListener('click', function () {
    selected = selected.length === clients.length ? [] : clients.map(function (c) { return c.id; });
    renderChips();
  });

  /* ---------- Editor ---------- */
  var toolbar = form.querySelector('.gm__toolbar');
  toolbar.addEventListener('mousedown', function (e) {
    if (e.target.closest('button')) e.preventDefault(); // keep the text selection
  });
  toolbar.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-cmd]');
    if (!btn) return;
    body.focus();
    var cmd = btn.dataset.cmd;
    if (cmd === 'createLink') {
      var url = window.prompt('Link address (https://…)', 'https://');
      if (!url || url === 'https://') return;
      if (!/^(https?:|mailto:|tel:)/i.test(url)) url = 'https://' + url;
      document.execCommand('createLink', false, url);
    } else {
      document.execCommand(cmd, false, null);
    }
    refreshToolbar();
  });
  toolbar.querySelector('select').addEventListener('change', function (e) {
    body.focus();
    document.execCommand('formatBlock', false, e.target.value);
    e.target.value = 'p';
  });
  function refreshToolbar() {
    ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].forEach(function (cmd) {
      var b = toolbar.querySelector('[data-cmd="' + cmd + '"]');
      try { b.classList.toggle('is-on', document.queryCommandState(cmd)); } catch (err) { /* not supported */ }
    });
  }
  document.addEventListener('selectionchange', function () {
    if (document.activeElement === body) refreshToolbar();
  });

  // Pasted images become attachments; pasted text and formatting stay in the message.
  body.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.files) || [];
    if (items.length) {
      e.preventDefault();
      addFiles(items);
    }
  });

  /* ---------- Attachments ---------- */
  function renderFiles() {
    fileList.innerHTML = '';
    files.forEach(function (item) {
      var f = item.file;
      var li = el('li', 'gm__file is-' + item.state);
      if (/^image\//.test(f.type)) {
        var img = el('img');
        img.alt = '';
        img.src = URL.createObjectURL(f);
        img.onload = function () { URL.revokeObjectURL(img.src); };
        li.appendChild(img);
      } else {
        li.appendChild(el('span', '', '📄'));
      }
      var name = el('span', 'gm__file-name', f.name);
      name.title = f.name;
      li.appendChild(name);
      var state = item.state === 'uploading' ? item.progress + '%'
        : item.state === 'failed' ? 'Failed' : sizeText(f.size) + ' ✓';
      li.appendChild(el('small', 'gm__state', state));
      if (item.state === 'failed') {
        var retry = el('button', '', '↻');
        retry.type = 'button';
        retry.title = 'Try again';
        retry.setAttribute('aria-label', 'Upload ' + f.name + ' again');
        retry.addEventListener('click', function () { upload(item); });
        li.appendChild(retry);
      }
      var x = el('button', '', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove ' + f.name);
      x.addEventListener('click', function () { removeFile(item); });
      li.appendChild(x);
      if (item.state === 'uploading') {
        var bar = el('span', 'gm__bar');
        bar.style.width = item.progress + '%';
        li.appendChild(bar);
      }
      fileList.appendChild(li);
    });
    updateCount();
    updateSend();
  }
  function uploading() { return files.some(function (i) { return i.state === 'uploading'; }); }
  function updateSend() {
    if (sending) return;
    var waiting = uploading();
    [sendBtn, sendBtnTop].forEach(function (b) {
      if (!b) return;
      b.disabled = waiting;
      b.textContent = waiting ? 'Uploading…' : 'Send';
    });
  }
  // Each file is uploaded the moment it is attached, so Send only has to send the message.
  function upload(item) {
    item.state = 'uploading';
    item.progress = 0;
    renderFiles();
    var data = new FormData();
    data.append('file', item.file, item.file.name);
    var xhr = new XMLHttpRequest();
    item.xhr = xhr;
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('X-CSRFToken', csrf());
    xhr.upload.onprogress = function (e) {
      if (!e.lengthComputable) return;
      item.progress = Math.min(99, Math.round((e.loaded / e.total) * 100));
      var li = fileList.children[files.indexOf(item)];
      if (li) {
        var bar = li.querySelector('.gm__bar');
        var st = li.querySelector('.gm__state');
        if (bar) bar.style.width = item.progress + '%';
        if (st) st.textContent = item.progress + '%';
      }
    };
    xhr.onload = function () {
      var out = {};
      try { out = JSON.parse(xhr.responseText); } catch (err) { /* not JSON */ }
      if (xhr.status === 200 && out.ok) {
        item.id = out.id;
        item.state = 'done';
      } else {
        item.state = 'failed';
        showError(out.error || ('"' + item.file.name + '" could not be uploaded. Press ↻ to try again.'));
      }
      if (files.indexOf(item) !== -1) renderFiles();
    };
    xhr.onerror = function () {
      item.state = 'failed';
      showError('"' + item.file.name + '" could not be uploaded. Check your connection and press ↻.');
      if (files.indexOf(item) !== -1) renderFiles();
    };
    xhr.send(data);
  }
  function removeFile(item) {
    if (item.xhr && item.state === 'uploading') item.xhr.abort();
    if (item.id) {
      var data = new FormData();
      data.append('delete', item.id);
      fetch(uploadUrl, { method: 'POST', body: data, credentials: 'same-origin', headers: { 'X-CSRFToken': csrf() } });
    }
    files = files.filter(function (i) { return i !== item; });
    renderFiles();
  }
  function addFiles(list) {
    showError('');
    var total = files.reduce(function (s, i) { return s + i.file.size; }, 0);
    Array.prototype.forEach.call(list, function (f) {
      if (files.length >= maxFiles) { showError('You can attach up to ' + maxFiles + ' files.'); return; }
      if (total + f.size > maxBytes) {
        showError('Attachments can be up to ' + (maxBytes / 1024 / 1024) + ' MB in total. "' + (f.name || 'The file') + '" was not added.');
        return;
      }
      var named = f.name ? f : new File([f], 'pasted-image.png', { type: f.type });
      var item = { file: named, id: null, progress: 0, state: 'uploading' };
      files.push(item);
      total += f.size;
      upload(item);
    });
    renderFiles();
  }
  fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) {
    form.addEventListener(t, function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) {
        e.preventDefault();
        form.classList.add('is-dragging');
      }
    });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    form.addEventListener(t, function (e) {
      if (t === 'drop' && e.dataTransfer && e.dataTransfer.files.length) {
        e.preventDefault();
        addFiles(e.dataTransfer.files);
      }
      if (t === 'drop' || e.target === form) form.classList.remove('is-dragging');
    });
  });

  /* ---------- Send ---------- */
  function csrf() {
    var input = form.querySelector('input[name="csrfmiddlewaretoken"]');
    return input ? input.value : '';
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    showError('');
    var text = (body.innerText || '').trim();
    if (!selected.length) { showError('Choose at least one recipient.'); toInput.focus(); return; }
    if (!subject.value.trim()) { showError('Add a subject.'); subject.focus(); return; }
    if (!text && !files.length) { showError('Write a message.'); body.focus(); return; }
    if (uploading()) { showError('Wait for the attachments to finish uploading.'); return; }
    if (files.some(function (i) { return i.state === 'failed'; })) {
      showError('An attachment did not upload. Press \u21bb to try again, or remove it.'); return;
    }

    var data = new FormData();
    selected.forEach(function (id) { data.append('to', id); });
    data.append('subject', subject.value);
    // Sent as a file part so a message of any length gets through.
    data.append('body', new Blob([body.innerHTML], { type: 'text/html' }), 'message.html');
    files.forEach(function (i) { data.append('attachment', i.id); });

    sending = true;
    [sendBtn, sendBtnTop].forEach(function (b) { if (b) { b.disabled = true; b.textContent = 'Sending\u2026'; } });
    fetch(window.location.pathname, {
      method: 'POST', body: data, credentials: 'same-origin',
      headers: { 'X-CSRFToken': csrf(), 'X-Requested-With': 'XMLHttpRequest' },
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: 'The server could not handle the request (' + res.status + ').' }; });
    }).then(function (out) {
      if (out.ok) {
        window.onbeforeunload = null;
        window.location.href = out.next;
        return;
      }
      showError(out.error || 'The email could not be sent.');
      sending = false;
      [sendBtn, sendBtnTop].forEach(function (b) { if (b) { b.disabled = false; b.textContent = 'Send'; } });
    }).catch(function () {
      showError('Network problem. Check your connection and try again.');
      sending = false;
      [sendBtn, sendBtnTop].forEach(function (b) { if (b) { b.disabled = false; b.textContent = 'Send'; } });
    });
  });

  // Warn before leaving with an unsent draft.
  window.onbeforeunload = function () {
    if (!sending && ((body.innerText || '').trim() || subject.value.trim() || files.length)) return true;
    return undefined;
  };
  form.querySelectorAll('.gm__leave').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (((body.innerText || '').trim() || subject.value.trim() || files.length) &&
          !window.confirm('Discard this message?')) { e.preventDefault(); return; }
      window.onbeforeunload = null;
    });
  });

  chosenIds.forEach(function (id) { if (byId[id] && selected.indexOf(id) === -1) selected.push(id); });
  renderChips();
  if (selected.length) subject.focus();
})();
