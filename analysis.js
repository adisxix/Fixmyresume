const fixResumeBtn = document.getElementById("fixResumeBtn");
const analysisLoader = document.getElementById("analysisLoader");
const analysisLoaderText = document.getElementById("analysisLoaderText");
const overallScoreText = document.getElementById("overallScoreText");
const overallScoreBar = document.getElementById("overallScoreBar");
const atsFriendly = document.getElementById("atsFriendly");
const toneAnalysis = document.getElementById("toneAnalysis");
const clarityLevel = document.getElementById("clarityLevel");
const suggestionsList = document.getElementById("suggestionsList");
const sectionAnalysis = document.getElementById("sectionAnalysis");

const AI_STORAGE_KEY = "fixmyresume.aiData.v1";

function loadAIData() {
  const raw = localStorage.getItem(AI_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isValidData(data) {
  return Boolean(
    data &&
      data.analysis &&
      Number.isFinite(Number(data.analysis.overallScore)) &&
      Array.isArray(data.suggestions) &&
      data.suggestions.length > 0 &&
      Array.isArray(data.sections) &&
      data.sections.length > 0
  );
}

const loaderTaglines = [
  "Fixing things up...",
  "Making it hireable...",
  "Polishing every section..."
];

function populateAnalysis() {
  const data = loadAIData();

  if (!isValidData(data)) {
    if (suggestionsList) {
      suggestionsList.innerHTML = `
        <li class="list-none text-red-700 font-bold">
          No analysis data found. 
          <a href="index.html" class="underline text-[#252422] ml-1">Upload your resume first</a>.
        </li>
      `;
    }
    if (sectionAnalysis) {
      sectionAnalysis.innerHTML =
        '<div class="col-span-full rounded-xl bg-[#252422]/10 border border-[#252422]/20 p-4">No section analysis found.</div>';
    }
    return;
  }

  const score = Math.max(1, Math.min(5, Number(data.analysis.overallScore)));

  if (overallScoreText) {
    overallScoreText.textContent = `${score}/5`;
  }
  if (overallScoreBar) {
    overallScoreBar.style.width = `${score * 20}%`;
  }
  if (atsFriendly) {
    atsFriendly.textContent = String(data.analysis.atsFriendly || "Yes");
  }
  if (toneAnalysis) {
    toneAnalysis.textContent = String(data.analysis.tone || "Professional");
  }
  if (clarityLevel) {
    clarityLevel.textContent = String(data.analysis.clarity || "High");
  }

  if (suggestionsList) {
    suggestionsList.innerHTML = data.suggestions
      .map((point) => `<li class="break-words">${point}</li>`)
      .join("");
  }

  if (sectionAnalysis) {
    sectionAnalysis.innerHTML = data.sections
      .map(
        (section) => `
          <div class="rounded-xl bg-[#252422]/10 border border-[#252422]/20 p-3.5 font-bold flex flex-col justify-between break-words">
            <span class="text-[#EB5E28] text-base">${section.name}</span>
            <span class="text-[#252422] text-sm md:text-base mt-1">${section.status}</span>
          </div>
        `
      )
      .join("");
  }
}

populateAnalysis();

if (fixResumeBtn && analysisLoader && analysisLoaderText) {
  fixResumeBtn.addEventListener("click", () => {
    let taglineIndex = 0;
    analysisLoaderText.textContent = loaderTaglines[taglineIndex];

    analysisLoader.classList.remove("hidden");
    analysisLoader.classList.add("flex");

    const taglineInterval = setInterval(() => {
      if (taglineIndex < loaderTaglines.length - 1) {
        taglineIndex += 1;
        analysisLoaderText.textContent = loaderTaglines[taglineIndex];
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(taglineInterval);
      window.location.href = "resume.html";
    }, 2800);
  });
}
