document.addEventListener('DOMContentLoaded', () => {
  const mount = document.getElementById('soundwave-wizard');
  if (!mount) return;

  // Pull presigner URL from the Liquid scaffold:
  // <div id="soundwave-wizard" data-presign-url="https://.../">
  const presignUrl = mount.dataset.presignUrl;
  const bucketBase = 'https://my-soundwave-uploads-sp.s3.eu-north-1.amazonaws.com';

  // Render Step 1 markup
  mount.innerHTML = `
    <div class="sw-step sw-step-1">
      <h2>Step 1: Upload Your Audio</h2>
      <input type="file" accept="audio/*" id="sw-audio-upload" />
      <div id="sw-upload-progress" class="sw-progress"></div>
    </div>
  `;

  const fileInput   = mount.querySelector('#sw-audio-upload');
  const progressBar = mount.querySelector('#sw-upload-progress');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    // 1) Request a presigned PUT URL
    progressBar.textContent = `Requesting upload URL…`;
    let json;
    try {
      const resp = await fetch(`${presignUrl}?filename=${encodeURIComponent(file.name)}`);
      if (!resp.ok) throw new Error(await resp.text());
      json = await resp.json();
    } catch (err) {
      console.error('Presign error', err);
      progressBar.textContent = `Error getting URL`;
      return;
    }

    // 2) Upload the file to S3
    progressBar.textContent = `Uploading…`;
    try {
      const put = await fetch(json.url, { method: 'PUT', body: file });
      if (!put.ok) throw new Error(put.statusText);
    } catch (err) {
      console.error('Upload error', err);
      progressBar.textContent = `Error uploading file`;
      return;
    }

    // 3) Poll for conversion
    progressBar.textContent = `Converting…`;
    const convertedKey = json.key.replace('incoming/', 'converted/').replace(/\.\w+$/, '.wav');
    const convertedUrl = `${bucketBase}/${encodeURIComponent(convertedKey)}`;

    let wavFound = false;
    for (let i = 0; i < 30; i++) {
      const head = await fetch(convertedUrl, { method: 'HEAD' });
      if (head.ok) { wavFound = true; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!wavFound) {
      progressBar.textContent = `Conversion timed out.`;
      return;
    }

    // 4) Show audio preview + Next button
    mount.innerHTML = `
      <div class="sw-step sw-step-1-done">
        <p>Audio ready!</p>
        <audio controls src="${convertedUrl}"></audio>
        <button id="sw-next" class="sw-button sw-next">Next: Choose Shape</button>
      </div>
    `;

    // Advance to Step 2
    const nextBtn = mount.querySelector('#sw-next');
    nextBtn.addEventListener('click', () => renderStep2());
  });

  // Step 2 renderer
  function renderStep2() {
    const raw = mount.dataset.shapeOptions || '[]';
    let shapes = [];
    try { shapes = JSON.parse(raw); }
    catch (e) { console.error('Invalid shape JSON', raw); }

    const shapeButtons = shapes.map(shape => `
      <button
        type="button"
        class="sw-shape-option"
        data-shape="${shape}"
        role="radio"
        aria-checked="false"
      >${shape.charAt(0).toUpperCase() + shape.slice(1)}</button>
    `).join('');

    mount.innerHTML = `
      <div class="sw-step sw-step-2">
        <h2>Step 2: Choose a Shape</h2>
        <div class="sw-shape-group" role="radiogroup" aria-label="Shape options">
          ${shapeButtons}
        </div>
        <button id="sw-back" class="sw-button sw-back">◀ Back</button>
      </div>
    `;

    // Wire up Back
    mount.querySelector('#sw-back').addEventListener('click', () => {
      window.location.reload(); // or re-render Step 1
    });

    // Wire up shape selection
    const group = mount.querySelector('.sw-shape-group');
    group.addEventListener('click', e => {
      const btn = e.target.closest('.sw-shape-option');
      if (!btn) return;
      group.querySelectorAll('.sw-shape-option')
           .forEach(el => el.setAttribute('aria-checked','false'));
      btn.setAttribute('aria-checked','true');
      mount.dataset.chosenShape = btn.dataset.shape;
      renderStep3();
    });
  }

function renderStep3() {
  currentStep = 3;
  updateProgress();

  // Parse options from data attributes
  const styles = JSON.parse(mount.dataset.styleOptions || '[]');
  const colors = JSON.parse(mount.dataset.colorOptions || '[]');

  // Build style buttons
  const styleButtons = styles.map(style => `
    <button
      type="button"
      class="sw-style-option"
      data-style="${style}"
      role="radio"
      aria-checked="false"
    >
      ${style}
    </button>
  `).join('');

  // Build color swatches
  const colorSwatches = colors.map(c => `
    <div
      class="sw-color-swatch"
      data-color="${c.hex}"
      role="radio"
      aria-checked="false"
      title="${c.name}"
      style="background:${c.hex}"
    ></div>
  `).join('');

  // Render Step 3 UI
  mount.innerHTML = `
    <div class="sw-step sw-step-3">
      <h2>Step 3: Choose Style & Color</h2>
      <div>
        <h3>Style</h3>
        <div class="sw-style-group" role="radiogroup" aria-label="Style options">
          ${styleButtons}
        </div>
      </div>
      <div>
        <h3>Color</h3>
        <div class="sw-color-group" role="radiogroup" aria-label="Color options">
          ${colorSwatches}
        </div>
      </div>
      <button id="sw-back" class="sw-button sw-back">◀ Back</button>
      <button id="sw-next" class="sw-button sw-next">Next: Size & Frame ▶</button>
    </div>
  `;

  // Back: go to Step 2
  mount.querySelector('#sw-back').addEventListener('click', renderStep2);

  // Handle style selection
  const styleGroup = mount.querySelector('.sw-style-group');
  styleGroup.addEventListener('click', e => {
    const btn = e.target.closest('.sw-style-option');
    if (!btn) return;
    styleGroup.querySelectorAll('.sw-style-option')
      .forEach(el => el.setAttribute('aria-checked','false'));
    btn.setAttribute('aria-checked','true');
    mount.dataset.chosenStyle = btn.dataset.style;
  });

  // Handle color selection
  const colorGroup = mount.querySelector('.sw-color-group');
  colorGroup.addEventListener('click', e => {
    const sw = e.target.closest('.sw-color-swatch');
    if (!sw) return;
    colorGroup.querySelectorAll('.sw-color-swatch')
      .forEach(el => el.setAttribute('aria-checked','false'));
    sw.setAttribute('aria-checked','true');
    mount.dataset.chosenColor = sw.dataset.color;
  });

  // Next: advance to Step 4
  mount.querySelector('#sw-next').addEventListener('click', renderStep4);
}
