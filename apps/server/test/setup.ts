// Strip the Anthropic API key from the env so tests never reach the
// real API even if the developer has it set in their shell. Tests
// that exercise the LLM-on path should construct an in-memory fake
// client instead (see docs/engineering/06-llm-integration.md).
process.env.ANTHROPIC_API_KEY = undefined;
