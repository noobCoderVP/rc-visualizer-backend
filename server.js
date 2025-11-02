// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import Ajv from "ajv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RC_ANALYSIS_PROMPT } from "./prompt.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------------------
// Initialize Gemini client
// ------------------------------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // or gemini-2.5-flash

// ------------------------------
// AJV Schema
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
// POST /analyze
// ------------------------------
app.post("/analyze", async (req, res) => {
    try {
        const { passage } = req.body;
        if (!passage) {
            return res.status(400).json({ error: "Passage is required" });
        }

        const prompt = `${RC_ANALYSIS_PROMPT}\n\nPassage:\n${passage}`;

        // Call Gemini
        let result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        console.log("🤖 Gemini response:", responseText);

        // Clean and extract JSON
        const cleanText = responseText.replace(/```json|```/g, "").trim();
        const start = cleanText.indexOf("{");
        const end = cleanText.lastIndexOf("}");
        if (start === -1 || end === -1) {
            return res.status(400).json({ error: "No valid JSON found in AI response" });
        }

        const jsonString = cleanText.slice(start, end + 1);
        const parsed = JSON.parse(jsonString); // ✅ fixed variable name

        // Validate schema
        const valid = validate(parsed); // ✅ now refers to parsed correctly
        if (!valid) {
            console.warn("⚠️ Schema validation failed:", validate.errors);
            return res.status(422).json({
                error: "Response schema validation failed",
                validationErrors: validate.errors,
                rawOutput: parsed,
            });
        }

        // ✅ Send validated structured output
        res.json(parsed);

    } catch (err) {
        console.error("❌ Server error:", err);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});


// ------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Gemini Server running on port ${PORT}`));
