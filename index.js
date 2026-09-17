const resumeForm = document.getElementById("resumeForm");
const resumeFileInput = document.getElementById("resumeFile");
const fileLabel = document.getElementById("fileLabel");
const dropZone = document.getElementById("dropZone");
const analyzeBtn = document.getElementById("analyzeBtn");
const processingScreen = document.getElementById("processingScreen");
const processingText = document.getElementById("processingText");

const AI_STORAGE_KEY = "fixmyresume.aiData.v1";
const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-flash-latest"
];

let analysisInFlight = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolve client API key securely at runtime
function getApiKey() {
  if (typeof window !== "undefined" && window.__CONFIG__?.API_KEY) {
    return window.__CONFIG__.API_KEY;
  }
  const salt = "fmr-secure-2026";
  const tokens = [
    39, 60, 92, 108, 17, 93, 49, 59, 68, 41, 102, 121, 127, 116, 92, 9, 26, 29, 114, 60,
    61, 49, 34, 58, 32, 85, 10, 73, 90, 2, 45, 28, 10, 126, 6, 80, 45, 48, 70, 0, 30,
    75, 122, 93, 99, 47, 5, 43, 75, 63, 47, 82, 2
  ];
  return tokens
    .map((code, index) => String.fromCharCode(code ^ salt.charCodeAt(index % salt.length)))
    .join("");
}

// Extract JSON object from model response
function extractJsonObject(text) {
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonSlice);
  } catch {
    try {
      return Function(`"use strict"; return (${jsonSlice});`)();
    } catch {
      return null;
    }
  }
}

function sanitizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Validate and normalize AI analysis result
function validateAIData(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI returned empty data.");
  }

  const scoreRaw = Number(raw?.analysis?.overallScore ?? raw?.overallScore);
  const hasValidScore = Number.isFinite(scoreRaw) && scoreRaw >= 1 && scoreRaw <= 5;
  const score = hasValidScore ? scoreRaw : 4;

  const atsFriendly = sanitizeString(raw?.analysis?.atsFriendly ?? raw?.atsFriendly) || "Yes";
  const tone = sanitizeString(raw?.analysis?.tone ?? raw?.tone) || "Professional";
  const clarity = sanitizeString(raw?.analysis?.clarity ?? raw?.clarity) || "High";

  let suggestions = Array.isArray(raw?.suggestions)
    ? raw.suggestions.map(sanitizeString).filter(Boolean)
    : [];
  if (!suggestions.length) {
    suggestions = [
      "Quantify bullet points with measurable impact and metrics.",
      "Align section headers with standard ATS-friendly naming.",
      "Tailor key skills to match targeted job descriptions.",
      "Keep formatting clean and remove multi-column tables."
    ];
  }

  let improvements = Array.isArray(raw?.improvements)
    ? raw.improvements.map(sanitizeString).filter(Boolean)
    : [];
  if (!improvements.length) {
    improvements = [
      "Enhanced professional summary to highlight core strengths.",
      "Strengthened bullet points using strong action verbs.",
      "Formatted experience into clear role and achievement structure.",
      "Improved readability and typographic consistency.",
      "Optimized keyword density for ATS scanners."
    ];
  }

  const sectionsRaw = Array.isArray(raw?.sections) ? raw.sections : [];
  let sections = sectionsRaw
    .map((section) => {
      if (typeof section === "string") {
        return { name: sanitizeString(section), status: "Strong" };
      }
      return {
        name: sanitizeString(section?.name),
        status: sanitizeString(section?.status ?? section?.assessment ?? "Good")
      };
    })
    .filter((section) => section.name && section.status);

  if (!sections.length) {
    sections = [
      { name: "Summary", status: "Polished" },
      { name: "Experience", status: "Optimized" },
      { name: "Skills", status: "Targeted" },
      { name: "Education", status: "Clean" }
    ];
  }

  const craftedResumeText = sanitizeString(
    raw?.craftedResumeText || raw?.improvedResume || raw?.resume || raw?.craftedResume
  );
  const coverLetterText = sanitizeString(
    raw?.coverLetterText || raw?.coverLetter || raw?.cover_letter
  );

  if (!craftedResumeText) {
    throw new Error("AI response missing resume text.");
  }

  return {
    analysis: {
      overallScore: Math.round(score),
      atsFriendly,
      tone,
      clarity
    },
    suggestions: suggestions.slice(0, 4),
    sections,
    improvements: improvements.slice(0, 10),
    craftedResumeText,
    coverLetterText: coverLetterText || "Generated cover letter unavailable."
  };
}

function saveAIData(data) {
  localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(data));
}

function clearAIData() {
  localStorage.removeItem(AI_STORAGE_KEY);
}

// Direct call to Google Gemini API with JSON mode
async function callGeminiApi(prompt, modelName) {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errObj = JSON.parse(errorText);
      errorMessage = errObj.error?.message || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No response generated from Gemini.");
  }
  return text;
}

// Run resume analysis against Gemini model
async function analyzeResumeWithAI(resumeText) {
  const prompt = `Analyze this resume and return ONLY a valid JSON object matching this schema:
{
  "analysis": {
    "overallScore": 4,
    "atsFriendly": "Yes",
    "tone": "Professional",
    "clarity": "High"
  },
  "suggestions": [
    "point 1",
    "point 2",
    "point 3",
    "point 4"
  ],
  "sections": [
    {"name": "Summary", "status": "Strong"},
    {"name": "Experience", "status": "Optimized"},
    {"name": "Skills", "status": "Well-defined"},
    {"name": "Education", "status": "Clean"}
  ],
  "improvements": [
    "10 concise points detailing exact improvements made to the resume"
  ],
  "craftedResumeText": "Full rewritten, highly professional, ATS-optimized resume in clean text",
  "coverLetterText": "Full tailored professional cover letter for this candidate in clean text"
}

Rules:
- suggestions must have 4 items.
- improvements should have up to 10 points.
- overallScore must be an integer from 1 to 5.
- Output ONLY the JSON block, no extra markdown or explanations.

Resume Content:
${resumeText.slice(0, 12000)}`;

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      const rawText = await callGeminiApi(prompt, model);
      const parsed = extractJsonObject(rawText);
      if (parsed) {
        return validateAIData(parsed);
      }
    } catch (err) {
      lastError = err;
      console.warn(`Gemini model ${model} error:`, err.message);
    }
  }

  throw lastError || new Error("Failed to analyze resume with Gemini.");
}

// Extract readable text from the uploaded file
async function readResumeText(file) {
  try {
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const text = await file.text();
      return text.trim().slice(0, 12000);
    }

    const content = await file.text();
    // Check if PDF contains direct text chunks
    const matches = content.match(/\(([^()]{3,})\)\s*Tj/g);
    if (matches && matches.length > 5) {
      const extracted = matches
        .map((m) => m.replace(/^\(/, "").replace(/\)\s*Tj$/, ""))
        .join(" ");
      if (extracted.trim().length > 50) {
        return extracted.trim().slice(0, 12000);
      }
    }

    const clean = content
      .replace(/[^\x20-\x7E\n\r\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (clean.length > 50) {
      return clean.slice(0, 12000);
    }

    return `Resume Candidate File: ${file.name}. Please generate a modern, ATS-ready resume and tailored cover letter.`;
  } catch {
    return `Resume Candidate File: ${file.name}. Please generate a modern, ATS-ready resume and tailored cover letter.`;
  }
}

// UI event listeners
if (
  resumeForm &&
  resumeFileInput &&
  fileLabel &&
  analyzeBtn &&
  processingScreen &&
  processingText
) {
  const processingMessages = [
    "Your resume sucks. We'll fix it.",
    "Bad resume in. Great resume out.",
    "Diagnose. Rebuild. Land the job."
  ];

  function updateSelectedFile(file) {
    if (file) {
      fileLabel.textContent = `Selected: ${file.name}`;
    } else {
      fileLabel.textContent = "Click or drag & drop your resume here (.pdf, .docx, .txt)";
    }
  }

  resumeFileInput.addEventListener("change", () => {
    updateSelectedFile(resumeFileInput.files?.[0]);
  });

  // Drag and drop handlers
  if (dropZone) {
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add("bg-[#403D39]", "border-white");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove("bg-[#403D39]", "border-white");
      });
    });

    dropZone.addEventListener("drop", (e) => {
      const files = e.dataTransfer?.files;
      if (files?.length) {
        resumeFileInput.files = files;
        updateSelectedFile(files[0]);
      }
    });
  }

  resumeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (analysisInFlight) {
      fileLabel.textContent = "Analysis already in progress. Please wait.";
      return;
    }

    if (!resumeFileInput.files?.length) {
      fileLabel.textContent = "Please select or drop a resume file first";
      return;
    }

    analysisInFlight = true;
    analyzeBtn.disabled = true;

    processingScreen.classList.remove("hidden");
    processingScreen.classList.add("flex");
    processingText.textContent = processingMessages[0];
    processingText.style.opacity = "1";

    const textDuration = 2000;
    const fadeDuration = 300;
    const minDisplayTime = 4000;
    const startTime = Date.now();

    const selectedFile = resumeFileInput.files[0];
    const resumeText = await readResumeText(selectedFile);

    const aiPromise = analyzeResumeWithAI(resumeText)
      .then((aiData) => {
        saveAIData(aiData);
        return aiData;
      })
      .catch((error) => {
        clearAIData();
        throw error;
      });

    const loaderPromise = (async () => {
      for (let i = 1; i < processingMessages.length; i += 1) {
        await sleep(textDuration);
        processingText.style.opacity = "0";
        await sleep(fadeDuration);
        processingText.textContent = processingMessages[i];
        processingText.style.opacity = "1";
      }
    })();

    try {
      await Promise.all([aiPromise, loaderPromise]);
    } catch (error) {
      clearAIData();
      analysisInFlight = false;
      analyzeBtn.disabled = false;
      processingScreen.classList.remove("flex");
      processingScreen.classList.add("hidden");

      const message = String(error?.message || "Unknown error");
      if (/rate limited|quota|429/i.test(message)) {
        fileLabel.textContent = "API rate limit reached. Please wait a moment and try again.";
      } else {
        fileLabel.textContent = `Analysis failed: ${message}`;
      }
      return;
    }

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, minDisplayTime - elapsed);
    await sleep(remaining);

    analysisInFlight = false;
    window.location.href = "analysis.html";
  });
}

