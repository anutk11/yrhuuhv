# Agents notes
- AI question generation runs only in the `generate-questions` edge function (admin check via has_role, model openai/gpt-6-astra on /v1/responses, streamed) — keeps the key and prompts server-side.
- Telephone host audio volume/mute is passed into useGameAudio as masterVolume/muted and stored in localStorage — per-projector preference, not a room setting.
