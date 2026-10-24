async function generateAlert() {
  const incidentText = document.getElementById('incident').value.trim();
  const language = document.getElementById('language').value;
  const officialSource = document.getElementById('official-source').value.trim();

  if (!incidentText) {
    // Show inline error message and highlight the textarea
    const ta = document.getElementById('incident');
    const err = document.getElementById('incident-error');
    ta.style.borderColor = '#dc2626';
    ta.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.15)';
    err.classList.remove('hidden');
    ta.focus();

    // Clear error as soon as the user starts typing
    ta.addEventListener('input', function clearError() {
      ta.style.borderColor = '';
      ta.style.boxShadow = '';
      err.classList.add('hidden');
      ta.removeEventListener('input', clearError);
    });
    return;
  }

  setUIState('loading');

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: incidentText, language, official_source: officialSource }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Server error: ${response.status}`);
    }

    renderResult(data, language);
    setUIState('result');
  } catch (err) {
    document.getElementById('error-msg').textContent = err.message;
    setUIState('error');
  }
}

function renderResult(data, language) {
  // Summary
  document.getElementById('summary').textContent = data.summary || '—';

  // Action steps — rendered as an ordered list
  const stepsEl = document.getElementById('action-steps');
  const steps = data.action_steps || [];
  if (steps.length === 0) {
    stepsEl.innerHTML = '<p style="color:#52606d;font-style:italic;">No specific action steps identified.</p>';
  } else {
    const ol = document.createElement('ol');
    steps.forEach((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      ol.appendChild(li);
    });
    stepsEl.innerHTML = '';
    stepsEl.appendChild(ol);
  }

  // Uncertainty / missing info
  document.getElementById('uncertainty').textContent =
    data.uncertainty || 'No gaps identified.';

  // Translated alert — hide section when English is selected
  const translatedSection = document.querySelector('.translated-section');
  const translatedLabel = document.getElementById('translated-label');
  const translatedEl = document.getElementById('translated');

  if (language === 'English') {
    translatedSection.classList.add('hidden');
  } else {
    translatedSection.classList.remove('hidden');
    translatedLabel.textContent = `Alert in ${language}`;
    translatedEl.textContent = data.translated || '—';
  }

  // Verification & Priority panel
  renderVerification(data);
}

function renderVerification(data) {
  // ── Verification status badge ──
  const vBadge = document.getElementById('verification-badge');
  const vStatus = data.verification_status || 'Unverified';
  vBadge.textContent = vStatus;
  vBadge.className = 'vp-badge'; // reset
  if (vStatus === 'Confirmed')      vBadge.classList.add('badge-confirmed');
  else if (vStatus === 'Corroborated') vBadge.classList.add('badge-corroborated');
  else                              vBadge.classList.add('badge-unverified');

  // ── Priority badge ──
  const pBadge = document.getElementById('priority-badge');
  const priority = data.priority || 'Low';
  pBadge.textContent = priority;
  pBadge.className = 'vp-badge'; // reset
  if (priority === 'High')        pBadge.classList.add('badge-high');
  else if (priority === 'Medium') pBadge.classList.add('badge-medium');
  else                            pBadge.classList.add('badge-low');

  // ── Priority reason ──
  document.getElementById('priority-reason').textContent =
    data.priority_reason || '';

  // ── Confirmed facts list ──
  const confirmedEl = document.getElementById('confirmed-facts');
  confirmedEl.innerHTML = '';
  const confirmedFacts = data.confirmed_facts || [];
  if (confirmedFacts.length === 0) {
    confirmedEl.innerHTML = '<li class="vp-empty">None identified.</li>';
  } else {
    confirmedFacts.forEach((fact) => {
      const li = document.createElement('li');
      li.textContent = fact;
      confirmedEl.appendChild(li);
    });
  }

  // ── Needs verification list ──
  const needsEl = document.getElementById('needs-verification');
  needsEl.innerHTML = '';
  const needsFacts = data.needs_verification || [];
  if (needsFacts.length === 0) {
    needsEl.innerHTML = '<li class="vp-empty">None identified.</li>';
  } else {
    needsFacts.forEach((fact) => {
      const li = document.createElement('li');
      li.textContent = fact;
      needsEl.appendChild(li);
    });
  }
}

function setUIState(state) {
  const loadingEl = document.getElementById('loading');
  const errorEl   = document.getElementById('error-card');
  const resultEl  = document.getElementById('result');
  const btn       = document.getElementById('generate-btn');
  const btnText   = document.getElementById('btn-text');
  const btnIcon   = document.getElementById('btn-icon');

  // Hide all dynamic sections first
  loadingEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  resultEl.classList.add('hidden');

  if (state === 'loading') {
    loadingEl.classList.remove('hidden');
    btn.disabled = true;
    btnIcon.textContent = '';
    btnText.textContent = 'Generating\u2026';
    loadingEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (state === 'error') {
    errorEl.classList.remove('hidden');
    btn.disabled = false;
    btnIcon.textContent = '\u26A1';
    btnText.textContent = 'Generate alert draft';
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (state === 'result') {
    resultEl.classList.remove('hidden');
    btn.disabled = false;
    btnIcon.textContent = '\u26A1';
    btnText.textContent = 'Generate alert draft';
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function copyAlert() {
  const language   = document.getElementById('language').value;
  const summary    = document.getElementById('summary').textContent;
  const uncertainty = document.getElementById('uncertainty').textContent;
  const translated  = document.getElementById('translated').textContent;

  const steps = [];
  document.querySelectorAll('#action-steps li').forEach((li, i) => {
    steps.push(`${i + 1}. ${li.textContent}`);
  });

  let text = `SJSU CAMPUS ALERT\n`;
  text += `\u26A0 NEEDS COORDINATOR REVIEW \u2014 Verify all details before publishing.\n`;
  text += `${'='.repeat(60)}\n\n`;
  text += `SUMMARY\n${summary}\n\n`;

  if (steps.length) {
    text += `STUDENT ACTION STEPS\n${steps.join('\n')}\n\n`;
  }

  text += `MISSING / UNCERTAIN INFORMATION\n${uncertainty}\n`;

  // Verification & priority summary
  const vStatus  = document.getElementById('verification-badge').textContent;
  const priority = document.getElementById('priority-badge').textContent;
  const preason  = document.getElementById('priority-reason').textContent;
  text += `\nVERIFICATION STATUS: ${vStatus}  |  RECOMMENDED PRIORITY: ${priority}\n`;
  if (preason) text += `Priority reason: ${preason}\n`;

  const confirmedItems = [...document.querySelectorAll('#confirmed-facts li')]
    .map(li => li.textContent).filter(t => t !== 'None identified.');
  if (confirmedItems.length) {
    text += `\nCONFIRMED FACTS\n${confirmedItems.map(f => `• ${f}`).join('\n')}\n`;
  }
  const needsItems = [...document.querySelectorAll('#needs-verification li')]
    .map(li => li.textContent).filter(t => t !== 'None identified.');
  if (needsItems.length) {
    text += `\nNEEDS VERIFICATION\n${needsItems.map(f => `• ${f}`).join('\n')}\n`;
  }

  if (language !== 'English' && translated && translated !== '\u2014') {
    text += `\nALERT IN ${language.toUpperCase()}\n${translated}\n`;
  }

  text += `\n${'='.repeat(60)}\n`;
  text += `Source: Coordinator incident notes \u00B7 Generated by SpartanSignal \u00B7 Powered by Amazon Bedrock`;

  navigator.clipboard.writeText(text).then(() => {
    const btn      = document.getElementById('copy-btn');
    const copyIcon = document.getElementById('copy-icon');
    const copyText = document.getElementById('copy-text');

    btn.classList.add('copied');
    copyIcon.textContent = '\u2713';
    copyText.textContent = 'Copied!';

    setTimeout(() => {
      btn.classList.remove('copied');
      copyIcon.textContent = '\u2398';
      copyText.textContent = 'Copy alert';
    }, 2200);
  }).catch(() => {
    alert('Clipboard access denied. Please select and copy the text manually.');
  });
}

// ── Voice-to-text (Web Speech API) ──────────────────────────────────────────

(function initSpeech() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  const micBtn     = document.getElementById('mic-btn');
  const micIcon    = document.getElementById('mic-icon');
  const micText    = document.getElementById('mic-text');
  const statusEl   = document.getElementById('speech-status');
  const textarea   = document.getElementById('incident');

  // Browser does not support speech recognition
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = 'Speech recognition is not supported in this browser.';
    micBtn.style.opacity = '0.45';
    micBtn.style.cursor = 'not-allowed';

    statusEl.textContent =
      '⚠ Voice input is not supported in this browser. Try Chrome or Edge.';
    statusEl.className = 'speech-status unsupported-state';
    statusEl.classList.remove('hidden');
    return;
  }

  let recognition = null;
  let isListening = false;

  window.toggleSpeech = function () {
    if (isListening) {
      recognition.stop();
      return;
    }
    startListening();
  };

  function startListening() {
    recognition = new SpeechRecognition();
    recognition.continuous     = true;   // keep listening until manually stopped
    recognition.interimResults = true;   // show partial results while speaking
    recognition.lang = document.getElementById('speech-lang').value;

    // Track the text already committed from previous final results
    let committed = textarea.value;

    recognition.onstart = function () {
      isListening = true;
      micBtn.classList.add('listening');
      micIcon.textContent = '⏹';
      micText.textContent = 'Stop';
      micBtn.setAttribute('aria-label', 'Stop voice input');

      statusEl.textContent = '🎙 Listening… speak now, then click Stop.';
      statusEl.className = 'speech-status listening-state';
      statusEl.classList.remove('hidden');
    };

    recognition.onresult = function (event) {
      let interim = '';
      // Walk only new results since last event
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          committed += (committed && !committed.endsWith(' ') ? ' ' : '') + transcript;
        } else {
          interim += transcript;
        }
      }
      // Show committed text + live interim preview in the textarea
      textarea.value = committed + (interim ? ' ' + interim : '');
    };

    recognition.onerror = function (event) {
      const messages = {
        'not-allowed'  : '⚠ Microphone access denied. Allow microphone permission and try again.',
        'no-speech'    : '⚠ No speech detected. Please try again.',
        'network'      : '⚠ Network error during speech recognition.',
        'aborted'      : null,   // user stopped — not an error worth showing
      };
      const msg = messages[event.error];
      if (msg) {
        statusEl.textContent = msg;
        statusEl.className = 'speech-status error-state';
        statusEl.classList.remove('hidden');
      }
      stopListening();
    };

    recognition.onend = function () {
      stopListening();
    };

    recognition.start();
  }

  function stopListening() {
    isListening = false;
    micBtn.classList.remove('listening');
    micIcon.textContent = '🎤';
    micText.textContent = 'Speak';
    micBtn.setAttribute('aria-label', 'Start voice input');

    // Only update status if we're not already showing an error
    if (statusEl.classList.contains('listening-state')) {
      if (textarea.value.trim()) {
        statusEl.textContent = '✓ Voice input captured. Edit or add more text if needed.';
        statusEl.className = 'speech-status';
        statusEl.style.color = '#065f46';
      } else {
        statusEl.classList.add('hidden');
      }
    }
  }
})();
