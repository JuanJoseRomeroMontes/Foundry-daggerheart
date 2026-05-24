const MODULE_ID = "daggerheart-quickrules";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const MODELS = {
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-flash-latest": "Gemini Flash Latest",
    "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite"
};

let _srdCache = null;

/**
 * Load and cache the SRD JSON content for AI context.
 */
async function loadSRD() {
    if (_srdCache) return _srdCache;
    const response = await fetch(`modules/${MODULE_ID}/data/srd.json`);
    if (!response.ok) throw new Error("Failed to load SRD data.");
    const data = await response.json();
    _srdCache = JSON.stringify(data);
    return _srdCache;
}

/**
 * Parse a Gemini API error into a user-friendly message.
 */
function parseGeminiError(status, responseText) {
    try {
        const json = JSON.parse(responseText);
        const msg = json.error?.message || "";

        if (status === 429) {
            const retryInfo = json.error?.details?.find(d => d["@type"]?.includes("RetryInfo"));
            const delay = retryInfo?.retryDelay || "";
            return `Rate limit exceeded. ${delay ? `Try again in ${delay}.` : "Wait a moment and try again."}`;
        }
        if (status === 403) return "API key doesn't have access. Check your key at aistudio.google.com.";
        if (status === 400) return `Bad request: ${msg}`;
        return msg || `API error (${status})`;
    } catch {
        return `API error (${status})`;
    }
}

/**
 * Check if an API error status is retryable with a different model.
 */
function isRetryableError(status) {
    return status === 429 || status === 503;
}

/**
 * Call the Gemini API with a single model. Returns { ok, text, status, errText }.
 */
async function callGeminiModel(apiKey, model, question, srdContent) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

    const body = {
        system_instruction: {
            parts: [{
                text: `You are a Daggerheart TTRPG rules assistant. Answer ONLY based on the rules data provided below. Be concise and helpful. If the answer is not in the data, say you don't have that information. Always answer in the same language the user asked the question.\n\nRules data:\n${srdContent}`
            }]
        },
        contents: [{
            parts: [{ text: question }]
        }]
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text();
        return { ok: false, status: response.status, errText };
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, status: 0, errText: "No response from Gemini API." };
    return { ok: true, text };
}

/**
 * Call the Gemini API with automatic fallback to other models on rate limit/overload.
 */
async function callGeminiAPI(apiKey, preferredModel, question, srdContent) {
    const modelKeys = Object.keys(MODELS);
    // Build ordered list: preferred model first, then the rest
    const modelsToTry = [preferredModel, ...modelKeys.filter(m => m !== preferredModel)];

    let lastError = null;
    for (const model of modelsToTry) {
        console.log(`Daggerheart AI Assistant | Trying model: ${model}`);
        const result = await callGeminiModel(apiKey, model, question, srdContent);

        if (result.ok) {
            if (model !== preferredModel) {
                console.log(`Daggerheart AI Assistant | Fallback to ${model} succeeded.`);
            }
            return result.text;
        }

        console.warn(`Daggerheart AI Assistant | ${model} failed (${result.status})`);
        lastError = result;

        // Only retry with next model if it's a rate limit / overload error
        if (!isRetryableError(result.status)) break;
    }

    // All models failed
    if (lastError.errText) {
        throw new Error(parseGeminiError(lastError.status, lastError.errText));
    }
    throw new Error(lastError.errText || "All models failed.");
}

/**
 * Initialize AI Assistant: register settings.
 * Call this from the module's "init" hook.
 */
export { callGeminiAPI, loadSRD };

export function initAIAssistant() {
    game.settings.register(MODULE_ID, "geminiApiKey", {
        name: "Gemini API Key",
        hint: "Free API key from https://aistudio.google.com/app/apikey — enables the AI button in the Quick Rules window.",
        scope: "world",
        config: true,
        type: String,
        default: "",
        requiresReload: false
    });

    game.settings.register(MODULE_ID, "geminiModel", {
        name: "Gemini Model",
        hint: "Choose the AI model. Flash-Lite is recommended for free tier (higher rate limits).",
        scope: "world",
        config: true,
        type: String,
        choices: MODELS,
        default: "gemini-2.5-flash",
        requiresReload: false
    });

    console.log("Daggerheart Quick Rules | AI Assistant initialized.");
}
