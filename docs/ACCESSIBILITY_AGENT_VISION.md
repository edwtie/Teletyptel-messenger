# Accessibility Agent Vision

`Tiedragon.XmppMessenger` should grow into an accessible communication platform,
not only a generic XMPP chat client. The target is communication that works for
hearing, Deaf, hard-of-hearing, speech-impaired, multilingual and mobile users.

The long-term goal is an intelligent communication agent that can help people
communicate across hearing, speech, language and signing barriers.

## Inspiration And Reference Space

Current accessibility products and research directions include:

- realtime captions and transcription for Deaf and hard-of-hearing users;
- microphone-assisted group captioning, such as Speaksee-style multi-microphone
  setups;
- live caption apps and services such as Ava, HearU, HearAI and similar tools;
- speech-to-text plus translation;
- text-to-speech / voice relay for users who prefer typing;
- sign-language AI research and avatar-based sign generation;
- video-based sign-language recognition as a longer-term research problem.

References:

- Speaksee: https://www.speak-see.com/
- Speaksee support/about: https://support.speak-see.com/en/about-speaksee
- Ava: https://www.ava.me/
- Android Live Transcribe: https://support.google.com/accessibility/android/answer/9158064
- HearU: https://www.hearu.ai/
- HearAI: https://www.hearai.app/
- Dori: https://dorilabs.com/
- Iris / Lonia AI: https://iris.lonia.ai/
- Kozha: https://kozha-translate.com/

## Product Principle

Accessibility must be a core design goal, not an add-on.

The system should support:

- spoken language to written text;
- written text to spoken voice;
- real-time text between users;
- captions with speaker identification;
- translation between languages;
- video/sign-language experiments;
- AI assistance that can summarize, clarify or rephrase only when invited;
- privacy controls for audio/video/text data.

The first product path should be reliable live text. That means captions,
real-time text and transcripts before heavier video AI. Video and sign-language
work is valuable, but it must be treated as research until it is tested with
real users and real sign languages.

## Communication Modes

| Mode | Direction | Near-term feasibility |
| --- | --- | --- |
| Speech to text | spoken audio -> captions/RTT text | High |
| Text to speech | typed text -> voice output | High |
| Real-time text | typed text -> live remote text | Already started |
| Speech translation | speech -> text -> translated text | Medium |
| Speaker diarization | group audio -> speaker-labelled captions | Medium |
| Sign generation | text/speech -> signing avatar/video | Experimental |
| Sign recognition | video sign input -> text | Research-heavy |

## Input Sources

The agent should accept multiple input sources through one neutral model:

| Source | Example | Near-term handling |
| --- | --- | --- |
| Typed RTT | User types in the client | XEP-0301 live text. |
| Microphone | Laptop/phone microphone | Speech-to-text provider. |
| External microphone kit | Speaksee-style speaker microphones | Provider adapter, speaker labels. |
| Existing meeting audio | System audio or virtual device | Speech-to-text provider, opt-in only. |
| Camera/video | Sign-language video or lip-reading research | Research adapter, no claims of reliability. |
| Agent text | Summary, translation, correction | Marked as agent output. |

All input sources should produce typed events first. UI and XMPP code should not
know whether text came from keyboard, speech recognition, a microphone kit or a
future video model.

## Intelligent Agent Role

The agent should not replace human communication. It should assist:

- capture speech as readable text;
- clean up obvious transcription errors while preserving meaning;
- mark uncertainty instead of inventing words;
- summarize long conversations;
- translate text;
- speak typed replies;
- help route communication into XMPP/RTT messages;
- provide accessibility hints to the UI.

Agent output must be visibly distinguishable from human text.

The agent pipeline should be:

1. capture event: typed text, audio chunk, video frame or external device event;
2. recognize: speech-to-text, speaker label, translation or future sign model;
3. stabilize: mark partial/final text and uncertainty;
4. publish locally: caption panel, transcript, accessibility hint;
5. publish remotely: optional RTT or final XMPP message;
6. retain or discard based on explicit session privacy settings.

## XMPP Fit

XMPP is useful because it gives:

- identities/JIDs;
- presence;
- message routing;
- multi-device support;
- extension model through XEPs;
- real-time text with XEP-0301;
- future stream management and mobile behavior.

Possible mapping:

- speech-to-text output can become local captions and optional XEP-0301 RTT;
- final corrected utterances can become normal `<message><body>`;
- agent summaries can be sent as separate marked messages;
- device capabilities can be discovered through XEP-0030;
- transcripts can use XEP-0313 only when the user wants archiving;
- mobile clients need XEP-0198 and push support;
- later audio/video calling needs Jingle/WebRTC signaling.

## Live Caption To RTT Rules

Speech recognition emits unstable partial text. RTT is also live, so it is a
good fit, but it needs rules:

- partial captions can be sent as RTT edits;
- final recognized utterances can become normal chat messages;
- a visible setting must choose local-only captions or remote sharing;
- each agent/caption message should carry a source marker;
- uncertainty must be preserved, not silently rewritten;
- non-RTT clients still need a readable `<body>` fallback.

This makes the remote side see the conversation as it is forming, while still
keeping a final clean message or transcript.

## Architecture Additions

Future packages/modules:

- `Tiedragon.XmppMessenger.Accessibility`
- `Tiedragon.XmppMessenger.Speech`
- `Tiedragon.XmppMessenger.Agent`
- `Tiedragon.XmppMessenger.Video`
- `Tiedragon.XmppMessenger.SignLanguage`

Keep these independent from the RFC 6120 core library.

## Data And Privacy

Audio, video and sign-language data are sensitive.

Required principles:

- clear local/cloud processing choice;
- no hidden recording;
- explicit consent for saving transcripts;
- per-session retention settings;
- visible indicator when audio/video capture is active;
- redact or mark uncertain AI output;
- support offline/local engines where possible.

Default behavior should be conservative:

- no cloud speech/video provider without user choice;
- no saved audio or video by default;
- transcripts off by default for private chats;
- clear indicator when an AI agent is listening, translating or speaking;
- export/delete controls for transcripts.

## Milestones

### Accessibility Alpha 1 - Captions And RTT

- microphone input abstraction;
- speech-to-text provider abstraction;
- live captions panel;
- send caption text as RTT or final message;
- speaker label placeholder;
- no audio storage by default.

### Accessibility Alpha 2 - Agent Assist

- correction suggestions;
- summarization;
- translation;
- text-to-speech replies;
- agent messages visibly marked.

### Accessibility Beta - Group Conversations

- multiple microphone source support;
- speaker diarization;
- meeting transcript export;
- mobile clients with stream management and push.

### Research Track - Sign Language

- evaluate sign-language generation tools;
- evaluate video sign-recognition feasibility;
- consult Deaf/sign-language users;
- avoid claiming interpreter replacement;
- start with optional assistive visual summaries or avatar experiments.

## Implementation Checklist

- [ ] `IAccessibilityInputSource` for keyboard, microphone, device and video events.
- [ ] `LiveCaptionSegment` model with partial/final state.
- [ ] `SpeakerLabel` model for diarization and microphone kits.
- [ ] `CaptionToRttBridge` with local-only/remote-share modes.
- [ ] `IAgentOutputMarker` or stanza metadata for agent/caption messages.
- [ ] Privacy settings for capture, cloud provider, transcript storage and export.
- [ ] Provider abstraction for speech-to-text engines.
- [ ] Provider abstraction for text-to-speech engines.
- [ ] Provider abstraction for translation engines.
- [ ] Research adapter boundary for camera/video/sign-language experiments.
- [ ] Accessibility UX test notes with Deaf/hard-of-hearing users.

## Design Warning

Sign languages are full natural languages with grammar, culture and nuance.
AI sign-language support must be developed carefully and ideally with Deaf
community review. The first reliable product path is captions + RTT + text/voice
relay; video sign recognition/generation is a longer-term research track.
