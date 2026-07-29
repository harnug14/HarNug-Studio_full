/**
 * Centralized Application Configuration
 * 
 * Gemini API Model Configuration:
 * Default: "gemini-3.6-flash"
 * 
 * Check https://ai.google.dev/gemini-api/docs/models for active models if a 404 'model not found' error occurs in the future.
 */

export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";