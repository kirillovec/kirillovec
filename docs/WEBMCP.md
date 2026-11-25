# WebMCP в kirillovec AI Studio

AI Studio exposes a small set of browser-native WebMCP tools for compatible agents.

## Registered tools

| Tool | Purpose | Side effects |
| --- | --- | --- |
| `get_studio_capabilities` | Describes available workspaces and safeguards | Read-only |
| `set_image_prompt` | Fills the visible image prompt | Changes the visible form only; does not generate |
| `prepare_music_prompt` | Fills title, Style, Lyrics and Suno settings | Changes visible fields only; does not open Suno or call an API |
| `build_video_prompt` | Builds a Text-to-Video or Image-to-Video prompt | Writes the visible prompt only |
| `build_text_draft` | Builds a structured writing brief | Writes the visible draft only |

All mutating tools use `readOnlyHint: false`, `consequentialHint: false` and `untrustedContentHint: true`. The capability lookup is marked read-only.

## User confirmation and safety

WebMCP tools only prepare visible workspace fields. They do not automatically:
- start image generation or consume the image-generation quota;
- upload an image or other file;
- open Suno, Kling, PixVerse, Hailuo or another external service;
- download a file;
- invoke server-side Suno generation (which remains disabled).

The user reviews the prepared content and clicks the existing page controls to continue.

## Compatibility

WebMCP is an experimental browser feature and is not required for normal site operation. The registration code checks for `document.modelContext.registerTool` and exits silently when the API is unavailable. The normal buttons and workflows continue to work in browsers without WebMCP.

See the [Chrome for Developers WebMCP guide](https://developer.chrome.com/docs/ai/webmcp/) and [Imperative API reference](https://developer.chrome.com/docs/ai/webmcp/imperative-api).
