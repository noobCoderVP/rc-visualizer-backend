// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import Ajv from "ajv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RC_ANALYSIS_PROMPT } from "./prompts/analyze.js";
import { RC_MINDMAP_PROMPT } from "./prompts/read.js";
import { RC_THOUGHT_SOLVER_PROMPT } from "./prompts/solve.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------------------
// Initialize Gemini client
// ------------------------------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ------------------------------
// AJV Schema for /analyze
// ------------------------------
const schema = {
    type: "object",
    properties: {
        vocabulary: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    word: { type: "string" },
                    meaning: { type: "string" },
                },
                required: ["word", "meaning"],
            },
        },
        title: { type: "string" },
        main_idea: {
            type: "object",
            properties: {
                direct: { type: "string" },
                indirect: { type: "string" },
            },
            required: ["direct", "indirect"],
        },
        facts_opinions_inferences: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    type: {
                        type: "string",
                        enum: ["Fact", "Opinion", "Inference"],
                    },
                    text: { type: "string" },
                },
                required: ["type", "text"],
            },
        },
        transitions: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    src: { type: "string" },
                    dest: { type: "string" },
                    relation: {
                        type: "string",
                        enum: [
                            "logical",
                            "contrastive",
                            "sequential",
                            "causal",
                        ],
                    },
                },
                required: ["src", "dest", "relation"],
            },
        },
        keywords: {
            type: "array",
            items: { type: "string" },
        },
        purpose: { type: "string" },
    },
    required: [
        "vocabulary",
        "title",
        "main_idea",
        "facts_opinions_inferences",
        "transitions",
        "keywords",
        "purpose",
    ],
    additionalProperties: false,
};

const ajv = new Ajv();
const validate = ajv.compile(schema);

// ------------------------------
// Helper Function to call Gemini
// ------------------------------
async function generateWithModel(prompt) {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
}

// ------------------------------
// 1️⃣ POST /analyze
// ------------------------------
app.post("/analyze", async (req, res) => {
    try {
        const { passage } = req.body;
        if (!passage)
            return res.status(400).json({ error: "Passage is required" });

        const prompt = `${RC_ANALYSIS_PROMPT}\n\nPassage:\n${passage}`;
        const responseText = await generateWithModel(prompt);
        console.log("🤖 /analyze Gemini response:", responseText);

        const cleanText = responseText.replace(/```json|```/g, "").trim();
        const start = cleanText.indexOf("{");
        const end = cleanText.lastIndexOf("}");
        if (start === -1 || end === -1)
            return res.status(400).json({ error: "No valid JSON found" });

        const parsed = JSON.parse(cleanText.slice(start, end + 1));
        const valid = validate(parsed);

        if (!valid) {
            console.warn("⚠️ Schema validation failed:", validate.errors);
            return res.status(422).json({
                error: "Response schema validation failed",
                validationErrors: validate.errors,
                rawOutput: parsed,
            });
        }

        res.json(parsed);
    } catch (err) {
        console.error("❌ /analyze error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ------------------------------
// 2️⃣ POST /mindmap
// ------------------------------
// Input: { passage }
// Output: HTML (string)
app.post("/mindmap", async (req, res) => {
    try {
        const { passage } = req.body;
        if (!passage)
            return res.status(400).json({ error: "Passage is required" });

        const prompt = `${RC_MINDMAP_PROMPT}\n\nPassage:\n${passage}`;
        const responseText = await generateWithModel(prompt);
        console.log("🤖 /mindmap Gemini response:", responseText);

        // Clean HTML from code block wrappers if present
        const cleanHTML = responseText.replace(/```html|```/g, "").trim();

        res.send(cleanHTML);
    } catch (err) {
        console.error("❌ /mindmap error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ------------------------------
// 3️⃣ POST /solve
// ------------------------------
// Input: { passage, questions }
// Output: JSON reasoning structure
app.post("/solve", async (req, res) => {
    try {
        const { passage, questions } = req.body;
        if (!passage || !questions)
            return res
                .status(400)
                .json({ error: "Passage and questions are required" });

        const combinedQuestions =
            Array.isArray(questions) && questions.length > 0
                ? questions.map((q, i) => `${i + 1}. ${q}`).join("\n")
                : questions;

        const prompt = `${RC_THOUGHT_SOLVER_PROMPT}\n\nPassage:\n${passage}\n\nQuestions:\n${combinedQuestions}`;
        const responseText = await generateWithModel(prompt);
        console.log("🤖 /solve Gemini response:", responseText);

        const cleanText = responseText.replace(/```json|```/g, "").trim();
        const start = cleanText.indexOf("{");
        const end = cleanText.lastIndexOf("}");
        if (start === -1 || end === -1)
            return res.status(400).json({ error: "No valid JSON found" });

        const parsed = JSON.parse(cleanText.slice(start, end + 1));
        res.json(parsed);
    } catch (err) {
        console.error("❌ /solve error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
    console.log(`✅ Gemini RC Server running on port ${PORT}`)
);
