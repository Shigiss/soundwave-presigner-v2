// Immediately‐invoked wizard bootstrap
;(function(){
  console.log('🔥 wizard.js loaded and running (immediate)');

  const mount = document.getElementById('soundwave-wizard');
  console.log('🔍 mount point is', mount);

  if (!mount) return;

  const wizardState = {};
  const totalSteps = 5;

  function updateProgress(step) {
    const pct = Math.round((step / totalSteps) * 100);
    const bar = document.querySelector('.sw-progress-fill');
    if (bar) bar.style.width = pct + '%';
  }
  
  const bucketBase = 'https://my-soundwave-uploads-sp.s3.eu-north-1.amazonaws.com';


function renderStep1() {
  console.log('✅ renderStep1');
  updateProgress(1);

  mount.innerHTML = `
    <div class="sw-step sw-step-1">
      <h2>Step 1: Upload Your Audio</h2>
      <input type="file" id="sw-audio-upload" accept="audio/*" />
      <div id="sw-upload-progress" class="sw-progress"></div>
    </div>
  `;

  const fileInput   = mount.querySelector('#sw-audio-upload');
  const progressBar = mount.querySelector('#sw-upload-progress');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    // 1) Request presign PUT URL
    progressBar.textContent = 'Requesting upload URL…';
    const presignEndpoint = `${mount.dataset.presignUrl}?filename=${encodeURIComponent(file.name)}`;
    console.log('Calling presign URL:', presignEndpoint);

    let json;
    try {
      const resp = await fetch(presignEndpoint);
      console.log('Presign response status:', resp.status);
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Presign failed ${resp.status}: ${errText}`);
      }
      json = await resp.json();
      console.log('Presign JSON payload:', json);
    } catch (err) {
      console.error('Presign error:', err);
      progressBar.textContent = 'Error getting URL';
      return;
    }

    // 2) Upload to S3
    progressBar.textContent = 'Uploading…';
    try {
      const put = await fetch(json.url, { method: 'PUT', body: file });
      if (!put.ok) throw new Error(put.statusText);
    } catch (err) {
      console.error('Upload error', err);
      progressBar.textContent = 'Error uploading file';
      return;
    }

    // 3) Poll for conversion via GET-presign
    progressBar.textContent = 'Converting…';

    // Derive the converted .wav key
    const convertedKey = json.key
      .replace(/^incoming\//, 'converted/')
      .replace(/\.\w+$/, '.wav');
    wizardState.presignedKey = convertedKey;

    // Request a presigned GET URL for the converted file
    const getPresignUrl = `${mount.dataset.presignUrl}?get=true&key=${encodeURIComponent(convertedKey)}`;
    console.log('Requesting GET-presign URL:', getPresignUrl);

    let getUrl;
    try {
      const getResp = await fetch(getPresignUrl);
      console.log('GET-presign response status:', getResp.status);
      if (!getResp.ok) throw new Error(await getResp.text());
      ({ url: getUrl } = await getResp.json());
      console.log('Received GET-presign URL:', getUrl);
    } catch (err) {
      console.error('GET-presign error:', err);
      progressBar.textContent = 'Error preparing playback URL';
      return;
    }

    // Poll HEAD on the presigned GET URL
    let found = false;
    for (let i = 0; i < 30; i++) {
      const head = await fetch(getUrl, { method: 'HEAD' });
      console.log(`HEAD ${getUrl} →`, head.status);
      if (head.ok) { found = true; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!found) {
      progressBar.textContent = 'Conversion timed out';
      return;
    }

    // 4) Audio ready → Next
    mount.innerHTML = `
      <div class="sw-step sw-step-1-done">
        <p>Audio ready!</p>
        <audio controls src="${getUrl}"></audio>
        <button id="sw-next" class="sw-button sw-next">
          Next: Choose Shape ▶
        </button>
      </div>
    `;
    mount.querySelector('#sw-next').addEventListener('click', renderStep2);
  });
}

function renderStep2() {
  console.log('✅ renderStep2');
  updateProgress(2);

  // 🔍 Inspect what we actually got from the data- attribute:
  console.log('mount.dataset.shapeOptions:', mount.dataset.shapeOptions);

  // Safely parse (or default to empty array)
  let shapes;
  try {
    shapes = JSON.parse(mount.dataset.shapeOptions || '[]') || [];
  } catch (err) {
    console.error('Invalid shape JSON:', mount.dataset.shapeOptions, err);
    shapes = [];
  }

  // If that still gave us nothing, force a fallback so we have buttons:
  if (!shapes.length) {
    shapes = ['Line','Circle','Square'];
    console.warn('No shapes found—using fallback:', shapes);
  }

  // Build the buttons
  const buttons = shapes.map(s => `
    <button type="button"
            class="sw-shape-option"
            data-shape="${s}"
            role="radio"
            aria-checked="false">
      ${s}
    </button>
  `).join('');

  // Inject the markup
  mount.innerHTML = `
    <div class="sw-step sw-step-2">
      <h2>Step 2: Choose a Shape</h2>
      <div class="sw-shape-group" role="radiogroup" aria-label="Shape options">
        ${buttons}
      </div>
      <button id="sw-back" class="sw-button sw-back">◀ Back</button>
      <button id="sw-next" class="sw-button sw-next" disabled>
        Next: Style & Color ▶
      </button>
    </div>
  `;

  // Back → just reload for now
  mount.querySelector('#sw-back')
       .addEventListener('click', e => { e.preventDefault(); renderStep1 && renderStep1(); });

  // Clicking a shape toggles the radio state and enables Next
  const group = mount.querySelector('.sw-shape-group');
  const next  = mount.querySelector('#sw-next');

  group.addEventListener('click', e => {
    const b = e.target.closest('.sw-shape-option');
    if (!b) return;
    group.querySelectorAll('[role="radio"]')
         .forEach(x => x.setAttribute('aria-checked','false'));
    b.setAttribute('aria-checked','true');
    wizardState.chosenShape = b.dataset.shape;
    next.disabled = false;
  });

  // Next → Step 3
  next.addEventListener('click', renderStep3);
}

function renderStep3() {
  console.log('✅ renderStep3');
  updateProgress(3);

  // 1) Inspect what we actually got
  console.log('mount.dataset.styleOptions:', mount.dataset.styleOptions);
  console.log('mount.dataset.colorOptions:', mount.dataset.colorOptions);

  // 2) Safely parse styleOptions
  let styles;
  try {
    styles = JSON.parse(mount.dataset.styleOptions || '[]') || [];
  } catch (err) {
    console.error('Invalid style JSON:', mount.dataset.styleOptions, err);
    styles = [];
  }
  // Fallback if empty
  if (!styles.length) {
    styles = ['Solid', 'Gradient'];
    console.warn('No styles found—using fallback:', styles);
  }

  // 3) Safely parse colorOptions
  let colors;
  try {
    colors = JSON.parse(mount.dataset.colorOptions || '[]') || [];
  } catch (err) {
    console.error('Invalid color JSON:', mount.dataset.colorOptions, err);
    colors = [];
  }
  // Fallback if empty
  if (!colors.length) {
    colors = [
      { name: 'Black', hex: '#000000' },
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Red',   hex: '#FF0000' }
    ];
    console.warn('No colors found—using fallback:', colors);
  }

  // 4) Build buttons & swatches
  const styleBtns = styles.map(s => `
    <button type="button"
            class="sw-style-option"
            data-style="${s}"
            role="radio"
            aria-checked="false">
      ${s}
    </button>
  `).join('');

  const colorSwatches = colors.map(c => `
    <div class="sw-color-swatch"
         data-color="${c.hex}"
         role="radio"
         aria-checked="false"
         title="${c.name}"
         style="background:${c.hex}">
    </div>
  `).join('');

  // 5) Render Step 3 UI
  mount.innerHTML = `
    <div class="sw-step sw-step-3">
      <h2>Step 3: Choose Style & Color</h2>
      <div>
        <h3>Style</h3>
        <div class="sw-style-group" role="radiogroup">
          ${styleBtns}
        </div>
      </div>
      <div>
        <h3>Color</h3>
        <div class="sw-color-group" role="radiogroup">
          ${colorSwatches}
        </div>
      </div>
      <button id="sw-back" class="sw-button sw-back">◀ Back</button>
      <button id="sw-next" class="sw-button sw-next" disabled>
        Next: Size & Frame ▶
      </button>
    </div>
  `;

  // 6) Wire Back → Step 2
  mount.querySelector('#sw-back')
       .addEventListener('click', renderStep2);

  // 7) Wire style & color selection
  const styleGroup = mount.querySelector('.sw-style-group');
  const colorGroup = mount.querySelector('.sw-color-group');
  const nextBtn    = mount.querySelector('#sw-next');

  styleGroup.addEventListener('click', e => {
    const b = e.target.closest('.sw-style-option');
    if (!b) return;
    styleGroup.querySelectorAll('[role="radio"]')
              .forEach(x => x.setAttribute('aria-checked','false'));
    b.setAttribute('aria-checked','true');
    wizardState.chosenStyle = b.dataset.style;
    if (wizardState.chosenColor) nextBtn.disabled = false;
  });

  colorGroup.addEventListener('click', e => {
    const sw = e.target.closest('.sw-color-swatch');
    if (!sw) return;
    colorGroup.querySelectorAll('[role="radio"]')
              .forEach(x => x.setAttribute('aria-checked','false'));
    sw.setAttribute('aria-checked','true');
    wizardState.chosenColor = sw.dataset.color;
    if (wizardState.chosenStyle) nextBtn.disabled = false;
  });

  // 8) Wire Next → Step 4
  nextBtn.addEventListener('click', renderStep4);
}

  function renderStep5() {
    console.log('✅ renderStep5');
    updateProgress(5);
    mount.innerHTML = `
      <div class="sw-step sw-step-5">
        <h2>Step 5: Review & Add to Cart</h2>
        <ul class="review-list">
          <li><strong>Shape:</strong> ${wizardState.chosenShape}</li>
          <li><strong>Style:</strong> ${wizardState.chosenStyle}</li>
          <li><strong>Color:</strong> <span class="sw-color-swatch" style="background:${wizardState.chosenColor}"></span></li>
          <li><strong>Size:</strong> ${wizardState.size}</li>
          <li><strong>Frame:</strong> ${wizardState.frame}</li>
        </ul>
        <button id="sw-back" class="sw-button sw-back">◀ Back</button>
        <button id="sw-add" class="sw-button sw-next">Add to Cart</button>
      </div>`;
    mount.querySelector('#sw-back').addEventListener('click', renderStep4);
    mount.querySelector('#sw-add').addEventListener('click',()=>{/* cart logic */});
  }

  // kick off
// Start the wizard at Step 1
renderStep1();
})();
   