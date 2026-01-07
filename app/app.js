const startCaptureButton = document.getElementById("startCapture");
const stopCaptureButton = document.getElementById("stopCapture");
const screenPreview = document.getElementById("screenPreview");
const captureCanvas = document.getElementById("captureCanvas");
const templateCanvas = document.getElementById("templateCanvas");
const thresholdInput = document.getElementById("threshold");
const thresholdValue = document.getElementById("thresholdValue");
const scoreValue = document.getElementById("scoreValue");
const ttsText = document.getElementById("ttsText");
const autoSpeak = document.getElementById("autoSpeak");
const statusBadge = document.getElementById("status");
const logEl = document.getElementById("log");
const templateUpload = document.getElementById("templateUpload");
const testSpeak = document.getElementById("testSpeak");

const captureContext = captureCanvas.getContext("2d", { willReadFrequently: true });
const templateContext = templateCanvas.getContext("2d", { willReadFrequently: true });

let captureStream = null;
let scanHandle = null;
let templateData = null;
let lastSpokenAt = 0;
let lastDetectedAt = 0;

const scanConfig = {
  downscaleWidth: 320,
  downscaleHeight: 180,
  step: 3,
  minGapMs: 2500,
};

const log = (message) => {
  const time = new Date().toLocaleTimeString();
  logEl.innerHTML = `[${time}] ${message}<br />` + logEl.innerHTML;
};

const updateStatus = (text, active = false) => {
  statusBadge.textContent = text;
  statusBadge.style.background = active ? "#fecaca" : "#e2e8f0";
  statusBadge.style.color = active ? "#7f1d1d" : "#1f2937";
};

const speak = (text) => {
  if (!autoSpeak.checked) {
    return;
  }
  const now = Date.now();
  if (now - lastSpokenAt < scanConfig.minGapMs) {
    return;
  }
  lastSpokenAt = now;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
};

const drawDefaultTemplate = () => {
  const size = templateCanvas.width;
  templateContext.clearRect(0, 0, size, size);
  templateContext.fillStyle = "#ef4444";
  templateContext.beginPath();
  templateContext.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  templateContext.fill();

  templateContext.fillStyle = "#fef2f2";
  templateContext.beginPath();
  templateContext.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  templateContext.fill();

  templateContext.fillStyle = "#ef4444";
  templateContext.beginPath();
  templateContext.arc(size / 2, size / 2, size / 2 - 11, 0, Math.PI * 2);
  templateContext.fill();

  templateContext.fillStyle = "#fef2f2";
  templateContext.beginPath();
  templateContext.arc(size / 2, size / 2, size / 2 - 15, 0, Math.PI * 2);
  templateContext.fill();

  templateData = templateContext.getImageData(0, 0, size, size);
};

const updateTemplateFromImage = (image) => {
  const size = templateCanvas.width;
  templateContext.clearRect(0, 0, size, size);
  templateContext.drawImage(image, 0, 0, size, size);
  templateData = templateContext.getImageData(0, 0, size, size);
};

const loadTemplateFile = (file) => {
  const image = new Image();
  image.onload = () => {
    updateTemplateFromImage(image);
    log("사용자 템플릿을 적용했습니다.");
  };
  image.src = URL.createObjectURL(file);
};

const computeDifference = (frameData, template, offsetX, offsetY, frameWidth) => {
  const templateWidth = template.width;
  const templateHeight = template.height;
  let diff = 0;

  for (let y = 0; y < templateHeight; y += 1) {
    const frameRow = (offsetY + y) * frameWidth;
    const templateRow = y * templateWidth;

    for (let x = 0; x < templateWidth; x += 1) {
      const frameIndex = (frameRow + offsetX + x) * 4;
      const templateIndex = (templateRow + x) * 4;

      const dr = frameData[frameIndex] - template.data[templateIndex];
      const dg = frameData[frameIndex + 1] - template.data[templateIndex + 1];
      const db = frameData[frameIndex + 2] - template.data[templateIndex + 2];

      diff += Math.abs(dr) + Math.abs(dg) + Math.abs(db);
    }
  }

  return diff;
};

const scanFrame = () => {
  if (!captureStream || !templateData) {
    return;
  }

  const scaleWidth = scanConfig.downscaleWidth;
  const scaleHeight = scanConfig.downscaleHeight;
  captureCanvas.width = scaleWidth;
  captureCanvas.height = scaleHeight;
  captureContext.drawImage(screenPreview, 0, 0, scaleWidth, scaleHeight);

  const frame = captureContext.getImageData(0, 0, scaleWidth, scaleHeight);
  const templateWidth = templateData.width;
  const templateHeight = templateData.height;
  const maxX = scaleWidth - templateWidth;
  const maxY = scaleHeight - templateHeight;

  let bestDiff = Number.POSITIVE_INFINITY;
  let bestLocation = null;

  for (let y = 0; y <= maxY; y += scanConfig.step) {
    for (let x = 0; x <= maxX; x += scanConfig.step) {
      const diff = computeDifference(frame.data, templateData, x, y, scaleWidth);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestLocation = { x, y };
      }
    }
  }

  const normalizedDiff = bestDiff / (templateWidth * templateHeight * 255 * 3);
  scoreValue.textContent = normalizedDiff.toFixed(3);

  const threshold = Number.parseFloat(thresholdInput.value);
  if (normalizedDiff < threshold) {
    const now = Date.now();
    if (now - lastDetectedAt > 800) {
      lastDetectedAt = now;
      updateStatus("아이콘 감지!", true);
      log(`아이콘 감지 (score ${normalizedDiff.toFixed(3)}) 위치 ${bestLocation.x},${bestLocation.y}`);
      speak(ttsText.value);
    }
  } else {
    updateStatus("감지 대기", false);
  }
};

const startScanLoop = () => {
  if (scanHandle) {
    cancelAnimationFrame(scanHandle);
  }

  const loop = () => {
    scanFrame();
    scanHandle = requestAnimationFrame(loop);
  };

  loop();
};

const startCapture = async () => {
  try {
    captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 10 },
      audio: false,
    });
    screenPreview.srcObject = captureStream;
    stopCaptureButton.disabled = false;
    startCaptureButton.disabled = true;
    updateStatus("화면 공유 중", false);
    log("화면 공유를 시작했습니다.");
    startScanLoop();
  } catch (error) {
    log("화면 공유를 시작하지 못했습니다.");
    console.error(error);
  }
};

const stopCapture = () => {
  if (captureStream) {
    captureStream.getTracks().forEach((track) => track.stop());
    captureStream = null;
  }
  if (scanHandle) {
    cancelAnimationFrame(scanHandle);
    scanHandle = null;
  }
  screenPreview.srcObject = null;
  stopCaptureButton.disabled = true;
  startCaptureButton.disabled = false;
  updateStatus("대기 중", false);
  log("화면 공유를 중지했습니다.");
};

startCaptureButton.addEventListener("click", startCapture);
stopCaptureButton.addEventListener("click", stopCapture);

templateUpload.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) {
    loadTemplateFile(file);
  }
});

thresholdInput.addEventListener("input", () => {
  thresholdValue.textContent = Number.parseFloat(thresholdInput.value).toFixed(2);
});

testSpeak.addEventListener("click", () => {
  speak(ttsText.value);
});

drawDefaultTemplate();
updateStatus("대기 중", false);
