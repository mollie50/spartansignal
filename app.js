async function generateAlert() {
  const incidentText = document.getElementById('incident').value.trim();
  const language = document.getElementById('language').value;

  if (!incidentText) {
    alert('Please enter incident notes before generating an alert.');
    return;
  }

  // UI state: loading
  setUIState('loading');

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: incidentText, language }),
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

  // Action steps — render as ordered list
  const stepsEl = document.getElementById('action-steps');
  const steps = data.action_steps || [];
  if (steps.length === 0) {
    stepsEl.innerHTML = '<p>No specific action steps identified.</p>';
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

  // Translated alert
  const translatedLabel = document.getElementById('translated-label');
  const translatedEl = document.getElementById('translated');

  if (language === 'English') {
    // Hide the translated section when output is already English
    document.querySelector('.translated-section').classList.add('hidden');
  } else {
    document.querySelector('.translated-section').classList.remove('hidden');
    translatedLabel.textContent = `Alert in ${language}`;
    translatedEl.textContent = data.translated || '—';
  }
}

function setUIState(state) {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error-card');
  const resultEl = document.getElementById('result');
  const btn = document.getElementById('generate-btn');

  // Hide all dynamic sections first
  loadingEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  resultEl.classList.add('hidden');

  if (state === 'loading') {
    loadingEl.classList.remove('hidden');
    btn.disabled = true;
    btn.textContent = 'Generating…';
  } else if (state === 'error') {
    errorEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Generate alert draft';
  } else if (state === 'result') {
    resultEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Generate alert draft';
    // Scroll result into view
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function copyAlert() {
  const language = document.getElementById('language').value;

  const summary = document.getElementById('summary').textContent;

  const steps = [];
  document.querySelectorAll('#action-steps li').forEach((li, i) => {
    steps.push(`${i + 1}. ${li.textContent}`);
  });

  const uncertainty = document.getElementById('uncertainty').textContent;
  const translated = document.getElementById('translated').textContent;

  let text = `SJSU CAMPUS ALERT\n⚠ NEEDS COORDINATOR REVIEW\n\n`;
  text += `SUMMARY\n${summary}\n\n`;

  if (steps.length) {
    text += `STUDENT ACTION STEPS\n${steps.join('\n')}\n\n`;
  }

  text += `MISSING / UNCERTAIN INFORMATION\n${uncertainty}\n`;

  if (language !== 'English' && translated && translated !== '—') {
    text += `\nALERT IN ${language.toUpperCase()}\n${translated}\n`;
  }

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy alert';
      btn.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    alert('Copy failed. Please select and copy the text manually.');
  });
}
