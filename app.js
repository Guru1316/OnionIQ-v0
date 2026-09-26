/* =========================================================
   ONIONIQ — Application Logic
   Frontend-only PWA. No backend, no external AI API.
   ========================================================= */
'use strict';

/* ===================== Utilities ===================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const pad2 = (n) => String(n).padStart(2, '0');

function formatDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
function formatTime(d) {
  let h = d.getHours();
  const m = pad2(d.getMinutes());
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${pad2(h)}:${m} ${ampm}`;
}
function relativeDay(d) {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return 'Today';
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return formatDate(d);
}
function dateCode(d) {
  return `${String(d.getFullYear()).slice(2)}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/* Deterministic hash + seeded PRNG so the same image yields the same result */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seedStr) {
  const rng = mulberry32(hashString(seedStr));
  return {
    next: rng,
    range: (min, max) => min + rng() * (max - min),
    int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(rng() * arr.length)],
    weighted: (weights) => {
      const entries = Object.entries(weights);
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = rng() * total;
      for (const [key, w] of entries) { r -= w; if (r <= 0) return key; }
      return entries[entries.length - 1][0];
    }
  };
}

/* ===================== Toast Manager ===================== */
const ToastManager = {
  region: null,
  init() { this.region = $('#toastRegion'); },
  show(message, type = 'ok') {
    if (!this.region) this.init();
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'warn' ? ' warn' : '');
    el.setAttribute('role', 'status');
    el.textContent = message;
    this.region.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; }, 2600);
    setTimeout(() => el.remove(), 2900);
  }
};

/* ===================== Modal Manager ===================== */
const ModalManager = {
  root: null,
  lastFocused: null,
  init() { this.root = $('#modalRoot'); },
  open(innerHTML) {
    if (!this.root) this.init();
    this.lastFocused = document.activeElement;
    this.root.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${innerHTML}</div>`;
    this.root.classList.remove('hidden');
    this.root.setAttribute('aria-hidden', 'false');
    this.root.onclick = (e) => { if (e.target === this.root) this.close(); };
    const closeBtns = $$('[data-modal-close]', this.root);
    closeBtns.forEach(b => b.addEventListener('click', () => this.close()));
    const firstFocusable = $('button, input, [tabindex]', this.root);
    if (firstFocusable) firstFocusable.focus();
    document.addEventListener('keydown', this._escHandler);
  },
  _escHandler(e) { if (e.key === 'Escape') ModalManager.close(); },
  close() {
    if (!this.root) return;
    this.root.classList.add('hidden');
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = '';
    document.removeEventListener('keydown', this._escHandler);
    if (this.lastFocused && this.lastFocused.focus) this.lastFocused.focus();
  }
};

/* ===================== Storage Manager ===================== */
const StorageManager = (() => {
  const KEY = 'onioniq_inspections_v1';
  const SETTINGS_KEY = 'onioniq_settings_v1';
  const SEED_KEY = 'onioniq_seeded_v1';

  function readAll() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('ONIONIQ storage read failed', e);
      return [];
    }
  }
  function writeAll(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.warn('ONIONIQ storage write failed', e);
      ToastManager.show('⚠ Local storage is full — could not save', 'warn');
      return false;
    }
  }

  return {
    saveInspection(record) {
      const list = readAll();
      list.unshift(record);
      writeAll(list);
      return record;
    },
    getInspections() {
      return readAll().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    },
    getInspection(id) {
      return readAll().find(r => r.id === id || r.batchId === id) || null;
    },
    deleteInspection(id) {
      const list = readAll().filter(r => r.id !== id);
      writeAll(list);
    },
    clearAll() {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    },
    getSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? JSON.parse(raw) : { theme: 'light', animations: true };
      } catch (e) { return { theme: 'light', animations: true }; }
    },
    saveSettings(settings) {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
    },
    hasSeeded() {
      try { return localStorage.getItem(SEED_KEY) === '1'; } catch (e) { return true; }
    },
    markSeeded() {
      try { localStorage.setItem(SEED_KEY, '1'); } catch (e) { /* ignore */ }
    }
  };
})();

/* ===================== Image Processor ===================== */
const ImageProcessor = {
  /** Load a File into an <img>-ready dataURL + metadata */
  loadFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        reject(new Error('Unsupported file type. Please choose an image.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({
        dataUrl: reader.result,
        name: file.name || 'captured-image',
        size: file.size || 0,
        lastModified: file.lastModified || Date.now()
      });
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.readAsDataURL(file);
    });
  },

  /** Load the bundled demo sample */
  loadDemoSample() {
    return fetch('assets/demo/onion-batch.jpg')
      .then(res => {
        if (!res.ok) throw new Error('demo asset missing');
        return res.blob();
      })
      .then(blob => this.loadFromFile(new File([blob], 'demo-onion-batch.jpg', { type: blob.type || 'image/jpeg' })))
      .catch(() => this.generateSyntheticDemo());
  },

  /** Fallback: if the bundled demo asset can't be fetched, draw one procedurally */
  generateSyntheticDemo() {
    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 620;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2b2218';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const palette = ['#d99a4e', '#e0a458', '#c9862e', '#b97a3a', '#6b4423'];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 10; col++) {
        const cx = 55 + col * 82 + (Math.random() * 10 - 5);
        const cy = 55 + row * 80 + (Math.random() * 10 - 5);
        const r = 28 + Math.random() * 12;
        ctx.beginPath();
        ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
        ctx.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3d2a12'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return Promise.resolve({ dataUrl, name: 'synthetic-demo.jpg', size: dataUrl.length, lastModified: Date.now() });
  },

  /** Load an HTMLImageElement from a dataURL */
  toImageElement(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image could not be decoded.'));
      img.src = dataUrl;
    });
  },

  /** Sample pixel statistics for brightness / contrast (blur proxy) */
  sampleStats(imgEl) {
    const SAMPLE = 96;
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE; canvas.height = SAMPLE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, SAMPLE, SAMPLE);
    let data;
    try {
      data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
    } catch (e) {
      return { avgBrightness: 128, variance: 20, ok: false };
    }
    let sum = 0;
    const lum = new Array(SAMPLE * SAMPLE);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      lum[p] = l;
      sum += l;
    }
    const avg = sum / lum.length;
    let varSum = 0;
    for (let i = 0; i < lum.length; i++) varSum += (lum[i] - avg) * (lum[i] - avg);
    const variance = varSum / lum.length;
    // simple edge-energy proxy for sharpness: mean abs diff between neighboring samples
    let edgeEnergy = 0, edgeCount = 0;
    for (let y = 0; y < SAMPLE - 1; y++) {
      for (let x = 0; x < SAMPLE - 1; x++) {
        const idx = y * SAMPLE + x;
        edgeEnergy += Math.abs(lum[idx] - lum[idx + 1]) + Math.abs(lum[idx] - lum[idx + SAMPLE]);
        edgeCount += 2;
      }
    }
    const sharpnessProxy = edgeEnergy / edgeCount;
    return { avgBrightness: avg, variance, sharpnessProxy, ok: true };
  },

  /** Validate an image for the inspection workflow */
  validateQuality(imgEl, meta, stats) {
    const results = {};

    const minDim = Math.min(imgEl.naturalWidth, imgEl.naturalHeight);
    results.resolution = {
      pass: minDim >= 320,
      label: minDim >= 640 ? 'Good' : (minDim >= 320 ? 'Acceptable' : 'Too low'),
      value: `${imgEl.naturalWidth}×${imgEl.naturalHeight}px`
    };

    results.lighting = {
      pass: stats.avgBrightness >= 40 && stats.avgBrightness <= 235,
      label: stats.avgBrightness < 40 ? 'Too dark' : (stats.avgBrightness > 235 ? 'Overexposed' : (stats.avgBrightness < 80 || stats.avgBrightness > 200 ? 'Fair' : 'Good')),
      value: `${Math.round(stats.avgBrightness)} / 255`
    };

    results.sharpness = {
      pass: stats.sharpnessProxy >= 3,
      label: stats.sharpnessProxy >= 8 ? 'Good' : (stats.sharpnessProxy >= 3 ? 'Fair' : 'Blurry'),
      value: stats.sharpnessProxy.toFixed(1)
    };

    const aspect = imgEl.naturalWidth / imgEl.naturalHeight;
    results.framing = {
      pass: aspect >= 0.4 && aspect <= 2.6,
      label: (aspect >= 0.6 && aspect <= 2.0) ? 'Good' : 'Fair',
      value: `${aspect.toFixed(2)}:1`
    };

    results.overallPass = results.resolution.pass && results.lighting.pass && results.sharpness.pass && results.framing.pass;
    return results;
  }
};

/* ===================== Onion Vision Engine (Simulation) ===================== */
const CATEGORY_META = {
  healthy: { label: 'Healthy', color: 'var(--cat-healthy)', defect: 'None', weightBase: 0.62 },
  damaged: { label: 'Damaged', color: 'var(--cat-damaged)', defect: 'Surface damage', weightBase: 0.10 },
  rotten: { label: 'Rotten', color: 'var(--cat-rotten)', defect: 'Rot', weightBase: 0.06 },
  sprouted: { label: 'Sprouted', color: 'var(--cat-sprouted)', defect: 'Sprouting', weightBase: 0.06 },
  undersized: { label: 'Undersized', color: 'var(--cat-undersized)', defect: 'Below size threshold', weightBase: 0.16 }
};
const REASONING = {
  healthy: ['Uniform coloration and firm surface texture detected.', 'No visible defects; skin integrity intact.', 'Consistent shape and healthy outer layer observed.'],
  damaged: ['Visible discoloration and irregular surface region detected.', 'Surface bruising pattern consistent with mechanical damage.', 'Localized skin rupture identified during boundary scan.'],
  rotten: ['Dark decayed tissue and soft-spot pattern identified.', 'Localized discoloration consistent with microbial decay.', 'Collapsed texture region detected at surface scan.'],
  sprouted: ['Green shoot growth detected extending from the crown region.', 'Sprout elongation indicates extended storage duration.', 'Emerging shoot structure identified above bulb outline.'],
  undersized: ['Estimated diameter falls below the minimum size threshold for grading.', 'Bulb dimensions fall under the standard size class.', 'Bounding region area below expected onion footprint.']
};

class OnionVisionEngine {
  async analyze(imgEl, meta, stats) {
    // Simulated pipeline stages are surfaced to the UI separately (see runAnalysisAnimation);
    // this method performs the actual deterministic computation.
    const seedSource = `${meta.name}|${meta.size}|${imgEl.naturalWidth}x${imgEl.naturalHeight}|${Math.round(stats.avgBrightness)}|${Math.round(stats.variance)}`;
    const rng = makeRng(seedSource);

    // Adjust category weighting based on real pixel measurements
    const weights = {};
    Object.keys(CATEGORY_META).forEach(k => weights[k] = CATEGORY_META[k].weightBase);

    const darkness = clamp((120 - stats.avgBrightness) / 120, 0, 1);
    weights.healthy -= darkness * 0.15;
    weights.rotten += darkness * 0.09;
    weights.damaged += darkness * 0.06;

    const blur = clamp((6 - (stats.sharpnessProxy || 6)) / 6, 0, 1);
    weights.undersized += blur * 0.08;
    weights.healthy -= blur * 0.08;

    Object.keys(weights).forEach(k => { weights[k] = Math.max(0.02, weights[k]); });

    const total = rng.int(68, 132);
    const aspect = imgEl.naturalWidth / imgEl.naturalHeight;
    const cols = Math.max(4, Math.round(Math.sqrt(total * aspect)));
    const rows = Math.max(3, Math.ceil(total / cols));

    const detections = [];
    for (let i = 0; i < total; i++) {
      const category = rng.weighted(weights);
      const row = Math.floor(i / cols);
      const col = i % cols;
      const jitterX = rng.range(-0.35, 0.35);
      const jitterY = rng.range(-0.35, 0.35);
      let cx = clamp((col + 0.5 + jitterX) / cols, 0.03, 0.97);
      let cy = clamp((row + 0.5 + jitterY) / rows, 0.03, 0.97);

      let sizeMm, confidence;
      if (category === 'undersized') {
        sizeMm = rng.range(28, 45);
        confidence = rng.range(0.70, 0.90);
      } else {
        sizeMm = rng.range(48, 92);
        confidence = category === 'healthy' ? rng.range(0.90, 0.99)
          : category === 'rotten' ? rng.range(0.80, 0.97)
          : category === 'sprouted' ? rng.range(0.78, 0.95)
          : rng.range(0.75, 0.93);
      }

      const sizeFactor = clamp(sizeMm / 70, 0.55, 1.35);
      const w = clamp((0.62 / cols) * sizeFactor, 0.03, 0.16);
      const h = clamp((0.62 / rows) * sizeFactor, 0.03, 0.22);

      detections.push({
        id: i + 1,
        x: clamp(cx - w / 2, 0, 1 - w),
        y: clamp(cy - h / 2, 0, 1 - h),
        width: w,
        height: h,
        category,
        confidence: Math.round(confidence * 1000) / 1000,
        sizeMm: Math.round(sizeMm * 10) / 10,
        reasoning: rng.pick(REASONING[category])
      });
    }

    const summary = { healthy: 0, damaged: 0, rotten: 0, sprouted: 0, undersized: 0 };
    let confSum = {}, confCount = {};
    detections.forEach(d => {
      summary[d.category]++;
      confSum[d.category] = (confSum[d.category] || 0) + d.confidence;
      confCount[d.category] = (confCount[d.category] || 0) + 1;
    });
    const avgConfidence = {};
    Object.keys(CATEGORY_META).forEach(k => {
      avgConfidence[k] = confCount[k] ? confSum[k] / confCount[k] : 0;
    });

    const totalDetected = detections.length;
    const avgDiameter = detections.reduce((s, d) => s + d.sizeMm, 0) / totalDetected;
    const sizeDistribution = { large: 0, medium: 0, small: 0 };
    detections.forEach(d => {
      if (d.sizeMm >= 70) sizeDistribution.large++;
      else if (d.sizeMm >= 45) sizeDistribution.medium++;
      else sizeDistribution.small++;
    });

    const grade = GradingEngine.computeGrade(summary, totalDetected);

    return {
      batchId: meta.batchId,
      totalDetected,
      detections,
      summary,
      avgConfidence,
      avgDiameter: Math.round(avgDiameter * 10) / 10,
      sizeDistribution,
      gradeA: grade.gradeA,
      urs: grade.urs,
      reject: grade.reject,
      qualityScore: grade.qualityScore,
      imageWidth: imgEl.naturalWidth,
      imageHeight: imgEl.naturalHeight,
      seed: seedSource
    };
  }
}
const visionEngine = new OnionVisionEngine();

/* ===================== Grading Engine ===================== */
const GradingEngine = {
  computeGrade(summary, total) {
    if (!total) return { gradeA: 0, urs: 0, reject: 0, qualityScore: 0 };
    const gradeA = (summary.healthy / total) * 100;
    const reject = (summary.rotten / total) * 100;
    let urs = 100 - gradeA - reject;
    urs = clamp(urs, 0, 100);

    const weighted = (
      summary.healthy * 1.0 +
      summary.damaged * 0.6 +
      summary.sprouted * 0.5 +
      summary.undersized * 0.55 +
      summary.rotten * 0.0
    ) / total * 100;

    return {
      gradeA: Math.round(gradeA * 10) / 10,
      urs: Math.round(urs * 10) / 10,
      reject: Math.round(reject * 10) / 10,
      qualityScore: Math.round(clamp(weighted, 0, 100))
    };
  }
};

/* ===================== Detection Renderer ===================== */
const DetectionRenderer = {
  frame: null, img: null, canvas: null,
  init() {
    this.frame = $('#cvFrame');
    this.img = $('#analysisImg');
    this.canvas = $('#overlayCanvas');
  },

  getDisplayRect() {
    const box = this.frame.getBoundingClientRect();
    const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
    if (!iw || !ih) return { left: 0, top: 0, width: box.width, height: box.height };
    const cw = this.img.clientWidth, ch = this.img.clientHeight;
    const scale = Math.min(cw / iw, ch / ih);
    const rw = iw * scale, rh = ih * scale;
    return { left: (cw - rw) / 2, top: (ch - rh) / 2, width: rw, height: rh };
  },

  render(detections, showOverlay, showLabels) {
    if (!this.frame) this.init();
    // clear existing DOM boxes
    $$('.det-box', this.frame).forEach(b => b.remove());
    const ctx = this.canvas.getContext('2d');
    this.canvas.width = this.frame.clientWidth;
    this.canvas.height = this.frame.clientHeight;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!showOverlay) return;

    const rect = this.getDisplayRect();
    const colorMap = {
      healthy: '#2D6A4F', damaged: '#C9862E', rotten: '#B23A2E', sprouted: '#7B4FA0', undersized: '#D9B23C'
    };

    detections.forEach(d => {
      const left = rect.left + d.x * rect.width;
      const top = rect.top + d.y * rect.height;
      const w = d.width * rect.width;
      const h = d.height * rect.height;

      // canvas box
      ctx.strokeStyle = colorMap[d.category];
      ctx.lineWidth = 1.6;
      ctx.strokeRect(left, top, w, h);

      // DOM hit target + label (for click interaction + accessible labels)
      const box = document.createElement('button');
      box.type = 'button';
      box.className = `det-box det-${d.category}`;
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.width = w + 'px';
      box.style.height = h + 'px';
      box.setAttribute('aria-label', `Onion ${d.id}, ${CATEGORY_META[d.category].label}, ${Math.round(d.confidence * 100)} percent confidence`);
      if (showLabels && w > 26) {
        const lbl = document.createElement('span');
        lbl.className = 'det-label';
        lbl.textContent = `${CATEGORY_META[d.category].label} ${Math.round(d.confidence * 100)}%`;
        box.appendChild(lbl);
      }
      box.addEventListener('click', () => UI.openDetectionModal(d));
      this.frame.appendChild(box);
    });
  }
};

/* ===================== Report Generator ===================== */
const ReportGenerator = {
  buildRecord(flow) {
    const now = new Date();
    const code = dateCode(now);
    const existing = StorageManager.getInspections().filter(r => r.batchId && r.batchId.includes(code));
    const batchId = `ON-${code}-${String(existing.length + 1).padStart(3, '0')}`;
    const reportId = `ON-RPT-${code}-${String(existing.length + 1).padStart(3, '0')}`;
    const r = flow.analysisResult;

    return {
      id: reportId,
      batchId,
      timestamp: now.toISOString(),
      demo: !!flow.isDemoImage,
      totalDetected: r.totalDetected,
      summary: r.summary,
      avgConfidence: r.avgConfidence,
      avgDiameter: r.avgDiameter,
      sizeDistribution: r.sizeDistribution,
      gradeA: r.gradeA,
      urs: r.urs,
      reject: r.reject,
      qualityScore: r.qualityScore,
      originalImage: flow.thumbOriginal,
      overlayImage: flow.thumbOverlay
    };
  },

  summaryRows(record) {
    const total = record.totalDetected || 1;
    return Object.keys(CATEGORY_META).map(key => ({
      key,
      label: CATEGORY_META[key].label,
      count: record.summary[key] || 0,
      pct: Math.round(((record.summary[key] || 0) / total) * 1000) / 10,
      conf: record.avgConfidence && record.avgConfidence[key] ? Math.round(record.avgConfidence[key] * 1000) / 10 : 0
    }));
  },

  buildHTML(record) {
    const d = new Date(record.timestamp);
    const rows = this.summaryRows(record);
    const tableRows = rows.map(r => `
      <tr>
        <td>${r.label}</td>
        <td class="num">${r.count}</td>
        <td class="num">${r.pct}%</td>
        <td class="num">${r.conf}%</td>
      </tr>`).join('');

    return `
      <div class="report-header">
        <div>
          <div class="report-brand">ONIONIQ</div>
          <div class="report-tag">AI Quality Inspection Report</div>
        </div>
        <div class="report-tag">${record.demo ? 'DEMO RECORD' : 'AI VISION • DEMO MODE'}</div>
      </div>

      <div class="report-meta">
        <div><span>Report ID</span><strong>${record.id}</strong></div>
        <div><span>Batch ID</span><strong>${record.batchId}</strong></div>
        <div><span>Inspection Date</span><strong>${formatDate(d)}</strong></div>
        <div><span>Inspection Time</span><strong>${formatTime(d)}</strong></div>
        <div><span>Inspection Mode</span><strong>AI Vision Demonstration</strong></div>
        <div><span>Total Onions</span><strong>${record.totalDetected}</strong></div>
      </div>

      <div class="report-summary-grid">
        <div class="report-summary-cell"><span>Total Onions</span><strong>${record.totalDetected}</strong></div>
        <div class="report-summary-cell"><span>Grade A</span><strong style="color:var(--success)">${record.gradeA}%</strong></div>
        <div class="report-summary-cell"><span>URS</span><strong style="color:var(--warning)">${record.urs}%</strong></div>
        <div class="report-summary-cell"><span>Reject</span><strong style="color:var(--danger)">${record.reject}%</strong></div>
        <div class="report-summary-cell"><span>Quality Score</span><strong>${record.qualityScore}/100</strong></div>
      </div>

      <h3 class="report-section-title">Visual Evidence</h3>
      <div class="report-evidence-grid">
        <figure>
          <img src="${record.originalImage}" alt="Original onion batch image">
          <figcaption>Original batch image</figcaption>
        </figure>
        <figure>
          <img src="${record.overlayImage || record.originalImage}" alt="AI detection overlay on onion batch">
          <figcaption>AI detection overlay</figcaption>
        </figure>
      </div>

      <h3 class="report-section-title">Defect Classification</h3>
      <table class="report-table">
        <thead>
          <tr><th>Classification</th><th class="num">Count</th><th class="num">Percentage</th><th class="num">Avg Confidence</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <p class="report-disclaimer">Grade estimates shown are demonstration outputs based on simulated AI measurements. Official procurement grading should follow applicable government quality standards and inspection procedures.</p>
    `;
  },

  summaryText(record) {
    return `ONIONIQ Quality Report ${record.id}\nBatch ${record.batchId}\nGrade A: ${record.gradeA}%  URS: ${record.urs}%  Reject: ${record.reject}%\nQuality Score: ${record.qualityScore}/100\nTotal onions: ${record.totalDetected}`;
  },

  downloadJSON(record) {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${record.id}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    ToastManager.show('✓ JSON downloaded');
  },

  print(record) {
    const printRoot = $('#printRoot');
    printRoot.innerHTML = `<div class="report">${this.buildHTML(record)}</div>`;
    printRoot.classList.add('active');
    setTimeout(() => {
      window.print();
      setTimeout(() => printRoot.classList.remove('active'), 400);
    }, 60);
  },

  async share(record) {
    const text = this.summaryText(record);
    if (navigator.share) {
      try {
        await navigator.share({ title: `ONIONIQ Report ${record.id}`, text });
        return;
      } catch (e) { /* user cancelled or unsupported — fall through */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      ToastManager.show('✓ Report copied to clipboard');
    } catch (e) {
      ToastManager.show('⚠ Could not share or copy report', 'warn');
    }
  }
};

/* ===================== Image thumbnail helper ===================== */
function makeThumbnail(imgEl, maxW = 640, quality = 0.72) {
  const scale = Math.min(1, maxW / imgEl.naturalWidth);
  const w = Math.round(imgEl.naturalWidth * scale);
  const h = Math.round(imgEl.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(imgEl, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
function makeOverlayThumbnail(imgEl, detections, maxW = 640, quality = 0.72) {
  const scale = Math.min(1, maxW / imgEl.naturalWidth);
  const w = Math.round(imgEl.naturalWidth * scale);
  const h = Math.round(imgEl.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, w, h);
  const colorMap = { healthy: '#2D6A4F', damaged: '#C9862E', rotten: '#B23A2E', sprouted: '#7B4FA0', undersized: '#D9B23C' };
  detections.forEach(d => {
    ctx.strokeStyle = colorMap[d.category];
    ctx.lineWidth = 1.4;
    ctx.strokeRect(d.x * w, d.y * h, d.width * w, d.height * h);
  });
  return canvas.toDataURL('image/jpeg', quality);
}

/* ===================== Router ===================== */
const Router = {
  routes: ['dashboard', 'inspect', 'history', 'reports', 'how-it-works', 'settings'],
  current: 'dashboard',
  init() {
    window.addEventListener('hashchange', () => this.handle());
    this.handle();
  },
  handle() {
    let route = (location.hash || '#/dashboard').replace('#/', '').split('?')[0];
    if (!this.routes.includes(route)) route = 'dashboard';
    this.current = route;
    $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === route));
    $$('.primary-nav a, .bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    document.title = `ONIONIQ — ${route.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`;
    $('#main-content').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (route === 'dashboard') UI.renderDashboard();
    if (route === 'history') UI.renderHistory();
    if (route === 'reports') UI.renderReports();
    if (route === 'inspect' && !InspectionFlow.started) InspectionFlow.reset();
  },
  go(route) { location.hash = `#/${route}`; }
};

/* ===================== Inspection Flow ===================== */
const InspectionFlow = {
  step: 1,
  started: false,
  imgEl: null,
  meta: null,
  quality: null,
  analysisResult: null,
  isDemoImage: false,
  thumbOriginal: null,
  thumbOverlay: null,
  savedRecord: null,
  zoom: 100,

  reset() {
    this.step = 1;
    this.started = false;
    this.imgEl = null;
    this.meta = null;
    this.quality = null;
    this.analysisResult = null;
    this.isDemoImage = false;
    this.thumbOriginal = null;
    this.thumbOverlay = null;
    this.savedRecord = null;
    this.zoom = 100;
    $('#imagePreviewCard').classList.add('hidden');
    $('#previewImg').removeAttribute('src');
    $('#cameraInput').value = '';
    $('#uploadInput').value = '';
    this.goStep(1);
  },

  goStep(n) {
    this.step = n;
    $$('.step-panel').forEach(p => p.classList.toggle('active', p.id === `step-${n}`));
    $$('#stepTracker li').forEach(li => {
      const s = Number(li.dataset.step);
      li.classList.toggle('active', s === n);
      li.classList.toggle('done', s < n);
    });
    $('#step-1').closest('.page-container') && window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async onImageLoaded(fileMeta, isDemo) {
    try {
      const imgEl = await ImageProcessor.toImageElement(fileMeta.dataUrl);
      this.imgEl = imgEl;
      this.meta = fileMeta;
      this.isDemoImage = !!isDemo;
      this.started = true;
      $('#previewImg').src = fileMeta.dataUrl;
      $('#imagePreviewCard').classList.remove('hidden');
      ToastManager.show(isDemo ? '✓ Demo sample loaded' : '✓ Image loaded');
    } catch (e) {
      ToastManager.show('⚠ Could not load that image. Try another file.', 'warn');
    }
  },

  runValidation() {
    if (!this.imgEl) { ToastManager.show('⚠ Please select an image first', 'warn'); return; }
    const stats = ImageProcessor.sampleStats(this.imgEl);
    this.stats = stats;
    this.quality = ImageProcessor.validateQuality(this.imgEl, this.meta, stats);
    $('#validateImg').src = this.meta.dataUrl;
    this.goStep(2);
    UI.renderQualityChecklist(this.quality);
  },

  async startAnalysis() {
    this.goStep(3);
    $('#analysisImg').src = this.meta.dataUrl;
    await UI.runAnalysisAnimation();
    const result = await visionEngine.analyze(this.imgEl, this.meta, this.stats);
    this.analysisResult = result;
    this.thumbOriginal = makeThumbnail(this.imgEl);
    this.thumbOverlay = makeOverlayThumbnail(this.imgEl, result.detections);
    UI.renderDetectionSummary(result);
    setTimeout(() => DetectionRenderer.render(result.detections, $('#overlayToggle').checked, $('#labelsToggle').checked), 80);
  },

  goToGrade() {
    this.goStep(4);
    UI.renderGrade(this.analysisResult);
  },

  generateReport() {
    const record = ReportGenerator.buildRecord(this);
    this.savedRecord = record;
    StorageManager.saveInspection(record);
    this.goStep(5);
    UI.renderComplete(record);
    ToastManager.show('✓ Inspection saved');
    ToastManager.show('✓ Report generated');
  }
};

/* ===================== UI ===================== */
const UI = {
  renderDashboard() {
    const list = StorageManager.getInspections();
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    $('#dashGreeting').textContent = `${greeting} 👋`;

    const total = list.length;
    const avgGradeA = total ? Math.round((list.reduce((s, r) => s + r.gradeA, 0) / total) * 10) / 10 : 0;
    const avgQuality = total ? Math.round((list.reduce((s, r) => s + r.qualityScore, 0) / total) * 10) / 10 : 0;

    $('#kpiTotal').textContent = total;
    $('#kpiBatches').textContent = total;
    $('#kpiGradeA').textContent = `${avgGradeA}%`;
    $('#kpiQuality').textContent = avgQuality;

    const recentBody = $('#recentInspectionBody');
    if (!total) {
      recentBody.innerHTML = `<div class="empty-state"><span class="es-icon">🧅</span>No inspections yet. Start your first AI quality check.</div>`;
    } else {
      const r = list[0];
      const d = new Date(r.timestamp);
      recentBody.innerHTML = `
        <div class="batch-summary-row">
          <span class="batch-id">Batch ${r.batchId}${r.demo ? '<span class="rc-demo-tag">DEMO</span>' : ''}</span>
          <span class="batch-time">${relativeDay(d)} • ${formatTime(d)}</span>
        </div>
        <div class="grade-strip">
          <div class="ga"><span>Grade A</span><strong>${r.gradeA}%</strong></div>
          <div class="urs"><span>URS</span><strong>${r.urs}%</strong></div>
          <div class="rej"><span>Rejected</span><strong>${r.reject}%</strong></div>
        </div>
        <div class="quality-score-line"><strong>${r.qualityScore}</strong><span>/ 100 Quality Score</span></div>
        <button class="btn btn-secondary" type="button" data-view-report="${r.id}">View Report</button>
      `;
      $('[data-view-report]', recentBody).addEventListener('click', () => UI.openReportModal(r.id));
    }
  },

  renderQualityChecklist(quality) {
    const rows = [
      ['resolution', 'Resolution'], ['lighting', 'Lighting'], ['sharpness', 'Sharpness'], ['framing', 'Framing']
    ];
    const html = rows.map(([key, label]) => {
      const q = quality[key];
      const cls = q.pass ? 'pass' : 'fail';
      const icon = q.pass ? '✓' : '⚠';
      return `<div class="qc-row ${cls}"><span class="qc-icon">${icon}</span>${label}<span class="qc-value">${q.value} · ${q.label}</span></div>`;
    }).join('');
    const verdict = quality.overallPass
      ? `<div class="qc-verdict pass">Ready for analysis</div>`
      : `<div class="qc-verdict fail">⚠ Image quality insufficient — please capture another image with better lighting and less blur.</div>`;
    $('#qualityChecklist').innerHTML = html + verdict;

    const actions = $('#validateActions');
    if (quality.overallPass) {
      actions.innerHTML = `
        <button class="btn btn-secondary" id="backToCaptureBtn" type="button">Back</button>
        <button class="btn btn-primary btn-lg" id="startAnalysisBtn" type="button">Start AI Analysis</button>`;
      $('#startAnalysisBtn').addEventListener('click', () => InspectionFlow.startAnalysis());
    } else {
      actions.innerHTML = `<button class="btn btn-primary" id="recaptureBtn" type="button">Recapture</button>`;
      $('#recaptureBtn').addEventListener('click', () => InspectionFlow.goStep(1));
    }
    $('#backToCaptureBtn', actions) && $('#backToCaptureBtn', actions).addEventListener('click', () => InspectionFlow.goStep(1));
  },

  async runAnalysisAnimation() {
    const stages = ['scan', 'detect', 'defect', 'size', 'quality'];
    const items = {};
    stages.forEach(s => items[s] = $(`#progressSteps li[data-key="${s}"]`));
    $$('#progressSteps li').forEach(li => li.classList.remove('doing', 'done'));
    $('#scanLine').classList.add('active');
    const fill = $('#analysisProgressFill');
    const pct = $('#analysisProgressPct');
    fill.style.width = '0%'; pct.textContent = '0%';

    const totalDuration = 2400 + Math.random() * 1400; // 2.4–3.8s
    const perStage = totalDuration / stages.length;

    for (let i = 0; i < stages.length; i++) {
      items[stages[i]].classList.add('doing');
      const startPct = Math.round((i / stages.length) * 100);
      const endPct = Math.round(((i + 1) / stages.length) * 100);
      await animateProgress(fill, pct, startPct, endPct, perStage);
      items[stages[i]].classList.remove('doing');
      items[stages[i]].classList.add('done');
    }
    $('#scanLine').classList.remove('active');
  },

  renderDetectionSummary(result) {
    const list = $('#detectionSummaryList');
    list.innerHTML = Object.keys(CATEGORY_META).map(key => `
      <li>
        <span class="dot" style="background:${CATEGORY_META[key].color}"></span>
        <span class="label">${CATEGORY_META[key].label}</span>
        <span class="count" data-count="${result.summary[key]}">0</span>
      </li>`).join('');
    animateCounters($$('.count', list), 700);
    animateCounterEl($('#detectionTotal'), result.totalDetected, 700);

    const actions = $('#analysisActions');
    actions.innerHTML = `
      <button class="btn btn-secondary" id="reanalyzeBtn" type="button">Recapture Image</button>
      <button class="btn btn-primary btn-lg" id="toGradeBtn" type="button">Continue to Grading</button>`;
    $('#toGradeBtn').addEventListener('click', () => InspectionFlow.goToGrade());
    $('#reanalyzeBtn').addEventListener('click', () => InspectionFlow.reset());
  },

  renderGrade(result) {
    // Score ring
    const ring = $('#ringFill');
    const circumference = 2 * Math.PI * 70;
    ring.style.strokeDasharray = `${circumference}`;
    requestAnimationFrame(() => {
      const offset = circumference - (result.qualityScore / 100) * circumference;
      ring.style.strokeDashoffset = offset;
    });
    animateCounterEl($('#qualityScoreNum'), result.qualityScore, 900);

    // Donut
    const donutCirc = 2 * Math.PI * 60;
    const segs = [
      { el: $('#donutGradeA'), pct: result.gradeA, offsetStart: 0 },
      { el: $('#donutUrs'), pct: result.urs, offsetStart: result.gradeA },
      { el: $('#donutReject'), pct: result.reject, offsetStart: result.gradeA + result.urs }
    ];
    segs.forEach(s => {
      const len = (s.pct / 100) * donutCirc;
      s.el.style.strokeDasharray = `${len} ${donutCirc - len}`;
      s.el.style.strokeDashoffset = `${-(s.offsetStart / 100) * donutCirc}`;
    });
    $('#legendGradeA').textContent = `${result.gradeA}%`;
    $('#legendUrs').textContent = `${result.urs}%`;
    $('#legendReject').textContent = `${result.reject}%`;

    // Quality breakdown bars
    const total = result.totalDetected || 1;
    const bars = $('#qualityBreakdownBars');
    bars.innerHTML = Object.keys(CATEGORY_META).map(key => {
      const pct = Math.round((result.summary[key] / total) * 1000) / 10;
      return `
        <div class="bar-row">
          <div class="bar-row-top"><span>${CATEGORY_META[key].label}</span><span>${pct}%</span></div>
          <div class="bar-track"><div class="bar-fill" data-pct="${pct}" style="background:${CATEGORY_META[key].color}"></div></div>
        </div>`;
    }).join('');
    requestAnimationFrame(() => {
      $$('.bar-fill', bars).forEach(el => { el.style.width = el.dataset.pct + '%'; });
    });

    // Size histogram
    const sd = result.sizeDistribution;
    const sTotal = sd.large + sd.medium + sd.small || 1;
    const hist = $('#sizeHistogram');
    const cols = [
      { label: 'Large', val: sd.large }, { label: 'Medium', val: sd.medium }, { label: 'Small', val: sd.small }
    ];
    hist.innerHTML = cols.map(c => {
      const pct = Math.round((c.val / sTotal) * 1000) / 10;
      return `<div class="hist-col">
        <span class="hist-val">${pct}%</span>
        <div class="hist-bar" data-h="${pct}"></div>
        <span class="hist-label">${c.label}</span>
      </div>`;
    }).join('');
    requestAnimationFrame(() => {
      $$('.hist-bar', hist).forEach(el => { el.style.height = el.dataset.h + '%'; });
    });
    $('#avgDiameter').textContent = `${result.avgDiameter} mm`;

    // Defect cards (excludes healthy)
    const defects = $('#defectCards');
    defects.innerHTML = ['damaged', 'rotten', 'sprouted', 'undersized'].map(key => `
      <div class="defect-card">
        <span>${CATEGORY_META[key].defect}</span>
        <strong style="color:${CATEGORY_META[key].color}">${result.summary[key]} onions</strong>
      </div>`).join('');

    $('#toReportBtn').onclick = () => InspectionFlow.generateReport();
  },

  renderComplete(record) {
    $('#completeBatchId').textContent = record.batchId;
    $('#completeGradeA').textContent = `${record.gradeA}%`;
    $('#completeQuality').textContent = record.qualityScore;
    $('#reportArticle').innerHTML = ReportGenerator.buildHTML(record);

    $('#viewFullReportBtn').onclick = () => $('#reportArticle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#completeDownloadBtn').onclick = () => ReportGenerator.print(record);
    $('#newInspectionBtn').onclick = () => InspectionFlow.reset();

    this.attachReportActions(record, $('#reportArticle'));
  },

  attachReportActions(record, container) {
    // Inject a shared actions row after the report content (once)
    let actions = $('.report-actions', container.parentElement);
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'report-actions';
      container.after(actions);
    }
    actions.innerHTML = `
      <button class="btn btn-primary" type="button" data-act="download">Download Report</button>
      <button class="btn btn-secondary" type="button" data-act="json">Download JSON</button>
      <button class="btn btn-ghost" type="button" data-act="share">Share Report</button>
    `;
    actions.querySelector('[data-act="download"]').onclick = () => ReportGenerator.print(record);
    actions.querySelector('[data-act="json"]').onclick = () => ReportGenerator.downloadJSON(record);
    actions.querySelector('[data-act="share"]').onclick = () => ReportGenerator.share(record);
  },

  openDetectionModal(d) {
    const meta = CATEGORY_META[d.category];
    ModalManager.open(`
      <button class="icon-btn modal-close" data-modal-close aria-label="Close">✕</button>
      <h2>Onion #${d.id}</h2>
      <div class="detail-grid">
        <div><span>Classification</span><strong style="color:${meta.color}">${meta.label}</strong></div>
        <div><span>Confidence</span><strong>${(d.confidence * 100).toFixed(1)}%</strong></div>
        <div><span>Estimated Size</span><strong>${d.sizeMm} mm</strong></div>
        <div><span>Detected Defect</span><strong>${meta.defect}</strong></div>
      </div>
      <p style="font-size:12px;color:var(--muted);font-weight:700;text-transform:uppercase;margin-bottom:6px;">AI Reasoning</p>
      <div class="detail-reasoning">${d.reasoning}</div>
    `);
  },

  openReportModal(id) {
    const record = StorageManager.getInspection(id);
    if (!record) { ToastManager.show('⚠ Report not found', 'warn'); return; }
    ModalManager.open(`
      <button class="icon-btn modal-close" data-modal-close aria-label="Close">✕</button>
      ${ReportGenerator.buildHTML(record)}
      <div class="report-actions">
        <button class="btn btn-primary" type="button" data-act="print">Print / Download</button>
        <button class="btn btn-secondary" type="button" data-act="json">Download JSON</button>
        <button class="btn btn-ghost" type="button" data-act="share">Share</button>
      </div>
    `);
    $('[data-act="print"]').onclick = () => ReportGenerator.print(record);
    $('[data-act="json"]').onclick = () => ReportGenerator.downloadJSON(record);
    $('[data-act="share"]').onclick = () => ReportGenerator.share(record);
  },

  renderHistory() {
    const search = ($('#historySearch').value || '').toLowerCase();
    const activeFilter = $('.pill.active', $('#historyFilters'))?.dataset.filter || 'all';
    let list = StorageManager.getInspections();

    if (search) {
      list = list.filter(r => r.batchId.toLowerCase().includes(search) || r.id.toLowerCase().includes(search));
    }
    if (activeFilter === 'high') list = list.filter(r => r.qualityScore >= 80);
    if (activeFilter === 'review') list = list.filter(r => r.qualityScore < 60 || r.reject > 15);
    if (activeFilter === 'recent') {
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      list = list.filter(r => new Date(r.timestamp).getTime() >= cutoff);
    }

    const container = $('#historyList');
    if (!list.length) {
      container.innerHTML = `<div class="empty-state"><span class="es-icon">🧅</span>No inspections match this view yet.</div>`;
      return;
    }
    container.innerHTML = list.map(r => this.recordCardHTML(r)).join('');
    list.forEach(r => {
      const card = $(`[data-record="${r.id}"]`, container);
      $('[data-act="view"]', card).addEventListener('click', () => UI.openReportModal(r.id));
      $('[data-act="delete"]', card).addEventListener('click', () => UI.confirmDelete(r.id));
    });
  },

  renderReports() {
    const list = StorageManager.getInspections();
    const container = $('#reportsList');
    if (!list.length) {
      container.innerHTML = `<div class="empty-state"><span class="es-icon">▣</span>No reports generated yet. Complete an inspection to generate one.</div>`;
      return;
    }
    container.innerHTML = list.map(r => this.recordCardHTML(r)).join('');
    list.forEach(r => {
      const card = $(`[data-record="${r.id}"]`, container);
      $('[data-act="view"]', card).addEventListener('click', () => UI.openReportModal(r.id));
      $('[data-act="delete"]', card).addEventListener('click', () => UI.confirmDelete(r.id));
    });
  },

  recordCardHTML(r) {
    const d = new Date(r.timestamp);
    return `
      <div class="record-card" data-record="${r.id}">
        <div class="rc-left">
          <span class="rc-id">${r.batchId}${r.demo ? '<span class="rc-demo-tag">DEMO</span>' : ''}</span>
          <span class="rc-date">${formatDate(d)} • ${formatTime(d)}</span>
        </div>
        <div class="rc-stats">
          <div><span>Grade A</span><strong style="color:var(--success)">${r.gradeA}%</strong></div>
          <div><span>URS</span><strong style="color:var(--warning)">${r.urs}%</strong></div>
          <div><span>Quality</span><strong>${r.qualityScore}</strong></div>
        </div>
        <div class="rc-actions">
          <button class="btn btn-secondary" type="button" data-act="view">View →</button>
          <button class="icon-btn" type="button" data-act="delete" aria-label="Delete inspection">🗑</button>
        </div>
      </div>`;
  },

  confirmDelete(id) {
    ModalManager.open(`
      <h2>Delete inspection?</h2>
      <p>This will permanently remove this inspection record from local storage on this browser.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-modal-close type="button">Cancel</button>
        <button class="btn btn-danger-outline" id="confirmDeleteBtn" type="button">Delete</button>
      </div>`);
    $('#confirmDeleteBtn').addEventListener('click', () => {
      StorageManager.deleteInspection(id);
      ModalManager.close();
      ToastManager.show('✓ Inspection deleted');
      if (Router.current === 'history') UI.renderHistory();
      if (Router.current === 'reports') UI.renderReports();
      if (Router.current === 'dashboard') UI.renderDashboard();
    });
  }
};

/* ===================== Animation helpers ===================== */
function animateProgress(fillEl, pctEl, from, to, duration) {
  return new Promise(resolve => {
    const start = performance.now();
    function tick(now) {
      const t = clamp((now - start) / duration, 0, 1);
      const val = Math.round(from + (to - from) * t);
      fillEl.style.width = val + '%';
      pctEl.textContent = val + '%';
      if (t < 1) requestAnimationFrame(tick); else resolve();
    }
    requestAnimationFrame(tick);
  });
}
function animateCounterEl(el, target, duration) {
  const start = performance.now();
  const from = 0;
  function tick(now) {
    const t = clamp((now - start) / duration, 0, 1);
    el.textContent = Math.round(from + (target - from) * t);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function animateCounters(elements, duration) {
  const start = performance.now();
  elements.forEach(el => {
    const target = Number(el.dataset.count || 0);
    function tick(now) {
      const t = clamp((now - start) / duration, 0, 1);
      el.textContent = Math.round(target * t);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

/* ===================== Demo Data Seeding ===================== */
function seedDemoDataIfNeeded() {
  if (StorageManager.hasSeeded()) return;
  const now = Date.now();
  const samples = [
    { offsetDays: 2, healthy: 71, damaged: 7, rotten: 4, sprouted: 3, undersized: 15 },
    { offsetDays: 5, healthy: 64, damaged: 10, rotten: 6, sprouted: 5, undersized: 15 },
    { offsetDays: 9, healthy: 79, damaged: 6, rotten: 3, sprouted: 2, undersized: 10 }
  ];
  samples.forEach((s, idx) => {
    const total = s.healthy + s.damaged + s.rotten + s.sprouted + s.undersized;
    const summary = { healthy: s.healthy, damaged: s.damaged, rotten: s.rotten, sprouted: s.sprouted, undersized: s.undersized };
    const grade = GradingEngine.computeGrade(summary, total);
    const d = new Date(now - s.offsetDays * 24 * 3600 * 1000);
    const code = dateCode(d);
    const svg = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280"><rect width="400" height="280" fill="#2b2218"/><text x="50%" y="50%" fill="#E0A458" font-family="sans-serif" font-size="16" text-anchor="middle">Demo Batch Sample</text></svg>`)}`;
    StorageManager.saveInspection({
      id: `ON-RPT-${code}-${String(90 + idx)}`,
      batchId: `ON-${code}-${String(90 + idx)}`,
      timestamp: d.toISOString(),
      demo: true,
      totalDetected: total,
      summary,
      avgConfidence: { healthy: 0.95, damaged: 0.85, rotten: 0.88, sprouted: 0.83, undersized: 0.79 },
      avgDiameter: 66.5,
      sizeDistribution: { large: Math.round(total * 0.4), medium: Math.round(total * 0.42), small: Math.round(total * 0.18) },
      gradeA: grade.gradeA, urs: grade.urs, reject: grade.reject, qualityScore: grade.qualityScore,
      originalImage: svg, overlayImage: svg
    });
  });
  StorageManager.markSeeded();
}

/* ===================== Connectivity ===================== */
function initConnectivity() {
  const dot = $('#connectivityDot');
  const label = $('#connectivityLabel');
  function update() {
    const online = navigator.onLine;
    dot.classList.toggle('offline', !online);
    label.textContent = online ? 'Online' : 'Offline';
  }
  window.addEventListener('online', () => { update(); ToastManager.show('✓ Back online'); });
  window.addEventListener('offline', () => { update(); ToastManager.show('⚠ You are offline — ONIONIQ still works', 'warn'); });
  update();
}

/* ===================== Settings ===================== */
function initSettings() {
  const settings = StorageManager.getSettings();
  applyTheme(settings.theme === 'dark');
  applyAnimations(settings.animations !== false);

  const themeToggle = $('#themeToggle');
  themeToggle.setAttribute('aria-checked', settings.theme === 'dark' ? 'true' : 'false');
  themeToggle.classList.toggle('active', settings.theme === 'dark');
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(!isDark);
    themeToggle.classList.toggle('active', !isDark);
    themeToggle.setAttribute('aria-checked', String(!isDark));
    const s = StorageManager.getSettings(); s.theme = !isDark ? 'dark' : 'light'; StorageManager.saveSettings(s);
  });

  const animToggle = $('#animationToggle');
  const animOn = settings.animations !== false;
  animToggle.classList.toggle('active', animOn);
  animToggle.setAttribute('aria-checked', String(animOn));
  animToggle.addEventListener('click', () => {
    const nowOn = !document.body.classList.contains('no-animations') ? false : true;
    applyAnimations(nowOn);
    animToggle.classList.toggle('active', nowOn);
    animToggle.setAttribute('aria-checked', String(nowOn));
    const s = StorageManager.getSettings(); s.animations = nowOn; StorageManager.saveSettings(s);
  });

  $('#clearHistoryBtn').addEventListener('click', () => {
    ModalManager.open(`
      <h2>Are you sure?</h2>
      <p>This will permanently remove locally stored inspection records from this browser.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-modal-close type="button">Cancel</button>
        <button class="btn btn-danger-outline" id="confirmClearBtn" type="button">Clear history</button>
      </div>`);
    $('#confirmClearBtn').addEventListener('click', () => {
      StorageManager.clearAll();
      ModalManager.close();
      ToastManager.show('✓ Inspection history cleared');
      UI.renderDashboard(); UI.renderHistory(); UI.renderReports();
    });
  });
}
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
function applyAnimations(on) {
  document.body.classList.toggle('no-animations', !on);
}

/* ===================== Demo Mode Modal ===================== */
function initDemoBadge() {
  $('#demoBadgeBtn').addEventListener('click', () => {
    ModalManager.open(`
      <button class="icon-btn modal-close" data-modal-close aria-label="Close">✕</button>
      <h2>Demo Mode</h2>
      <p>This application demonstrates the complete AI-assisted workflow using browser-based image processing and simulated inference.</p>
      <p>No backend or external AI API is used. All measurements, grading and reports are computed locally in your browser using deterministic, image-seeded simulation.</p>
    `);
  });
}

/* ===================== Event Wiring ===================== */
function initNavigation() {
  $$('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => Router.go(btn.dataset.nav));
  });
}

function initCaptureInputs() {
  $('#cameraInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const meta = await ImageProcessor.loadFromFile(file);
      InspectionFlow.onImageLoaded(meta, false);
    } catch (err) { ToastManager.show(`⚠ ${err.message}`, 'warn'); }
  });
  $('#uploadInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const meta = await ImageProcessor.loadFromFile(file);
      InspectionFlow.onImageLoaded(meta, false);
    } catch (err) { ToastManager.show(`⚠ ${err.message}`, 'warn'); }
  });
  $('#demoSampleBtn').addEventListener('click', async () => {
    ToastManager.show('Loading demo sample…');
    try {
      const meta = await ImageProcessor.loadDemoSample();
      InspectionFlow.onImageLoaded(meta, true);
    } catch (err) {
      ToastManager.show('⚠ Could not load demo sample', 'warn');
    }
  });
  $('#retakeBtn').addEventListener('click', () => InspectionFlow.reset());
  $('#validateBtn').addEventListener('click', () => InspectionFlow.runValidation());
}

function initAnalysisViewerControls() {
  $('#zoomInBtn').addEventListener('click', () => setZoom(InspectionFlow.zoom + 25));
  $('#zoomOutBtn').addEventListener('click', () => setZoom(InspectionFlow.zoom - 25));
  $('#fitBtn').addEventListener('click', () => setZoom(100));
  function setZoom(z) {
    InspectionFlow.zoom = clamp(z, 50, 200);
    $('#cvFrame').style.width = InspectionFlow.zoom + '%';
    $('#zoomLevel').textContent = InspectionFlow.zoom + '%';
    setTimeout(() => {
      if (InspectionFlow.analysisResult) {
        DetectionRenderer.render(InspectionFlow.analysisResult.detections, $('#overlayToggle').checked, $('#labelsToggle').checked);
      }
    }, 60);
  }
  $('#overlayToggle').addEventListener('change', (e) => {
    if (InspectionFlow.analysisResult) DetectionRenderer.render(InspectionFlow.analysisResult.detections, e.target.checked, $('#labelsToggle').checked);
  });
  $('#labelsToggle').addEventListener('change', (e) => {
    if (InspectionFlow.analysisResult) DetectionRenderer.render(InspectionFlow.analysisResult.detections, $('#overlayToggle').checked, e.target.checked);
  });
  window.addEventListener('resize', () => {
    if (InspectionFlow.analysisResult && Router.current === 'inspect') {
      DetectionRenderer.render(InspectionFlow.analysisResult.detections, $('#overlayToggle').checked, $('#labelsToggle').checked);
    }
  });
}

function initHistoryControls() {
  $('#historySearch').addEventListener('input', () => UI.renderHistory());
  $$('#historyFilters .pill').forEach(p => {
    p.addEventListener('click', () => {
      $$('#historyFilters .pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      UI.renderHistory();
    });
  });
}

/* ===================== PWA Registration ===================== */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {
        console.warn('ONIONIQ: service worker registration failed (this is expected if served via file:// — use a local static server).');
      });
    });
  }
}

/* ===================== Application Initialization ===================== */
document.addEventListener('DOMContentLoaded', () => {
  ToastManager.init();
  ModalManager.init();

  // Ensure a print root exists
  if (!$('#printRoot')) {
    const pr = document.createElement('div');
    pr.id = 'printRoot';
    document.body.appendChild(pr);
  }

  seedDemoDataIfNeeded();
  initSettings();
  initConnectivity();
  initDemoBadge();
  initNavigation();
  initCaptureInputs();
  initAnalysisViewerControls();
  initHistoryControls();
  registerServiceWorker();

  Router.init();
});
