# LLM Logprob Visualizer

A local-first AI chat and observability dashboard for seeing how a language model makes token-by-token decisions.

Most chat apps only show the final answer. This app is built for the part you usually do not get to see: token probabilities, uncertainty, discarded alternatives, branch paths, replay, and the wider answer space around a response.

It works with local model servers such as LM Studio and llama.cpp, so you can run experiments against models on your own machine.

## What This App Is For

LLM Logprob Visualizer helps you inspect a model response like a decision trace.

You can use it to answer questions like:

- Which tokens was the model confident about?
- Where did the answer become uncertain?
- What other tokens were likely but not chosen?
- What happens if I force the model down a different branch?
- How does probability change as a branch grows token by token?
- Is the model giving one stable answer, or are many possible answers nearby?

It is useful for prompt debugging, local model research, interpretability experiments, uncertainty analysis, and understanding how sampling settings change model behavior.

## Main Features

### Chat + Response Cards

The center panel is a normal chat interface, but every assistant response becomes an analysis card. Each card includes the answer, token count, confidence, entropy, run count, and quick actions for logprobs, answer-space exploration, comparison, and Full Universe mode.

### Token Heatmap

Generated tokens are shown as a confidence heatmap.

- Green means high confidence
- Yellow means uncertain
- Red means low confidence
- Entropy mode highlights tokens where the probability distribution was wider

Hover or click a token to inspect its probability, rank, entropy, and alternatives.

### Time Replay

Replay a generated answer token by token. This is useful for watching where the model slowed down, became uncertain, or took a surprising turn. Replay includes speed controls, token metadata, and a recent-token trail.

### Metrics Dashboard

The analytics panel summarizes response-level behavior:

- average confidence
- average entropy
- low-confidence token count
- non-top token choices
- most uncertain tokens

### Discarded Branch Explorer

For each generated token, the app can show alternatives exposed by `top_logprobs`.

These are not complete answers by themselves. They are next-token candidates that the model assigned probability to at that step. You can inspect the probability gap, compare the chosen token against alternatives, and continue an alternate branch locally.

### Answer Space Explorer

The Answer Space Explorer gives a larger view of possible outputs.

It includes:

- semantic answer clusters
- discarded branch views
- saved branch archive
- comparison between output variants
- Full Universe next-token explorer

### Full Universe Explorer

When connected to llama.cpp, the app can request a full next-token distribution using llama.cpp's native `/completion` endpoint with `n_probs` set to the model vocabulary size.

For example, if the model vocabulary is `248,320`, the explorer can ask:

> "At this exact position, what probability did the model assign to every possible next token?"

Then you can expand any token and repeat the same question for the next position. This creates an interactive branch tree where every node is a real model probability distribution for that prefix.

Important: this does not mean the model has already written every possible full answer internally. It means you are repeatedly probing the model for the full next-token distribution at each chosen branch point.

### Branch Tree Map

Every expanded token becomes a node in a tree. You can jump between branches, inspect path depth, and see how the selected path evolves.

### Probability Timeline

The timeline tracks selected-token probability and cumulative path probability as you force a branch token by token. This makes it easier to see when a branch stays plausible or starts becoming unlikely.

### Lab Settings

The Lab Settings modal controls model endpoint configuration and generation behavior.

Settings include:

- active provider: LM Studio or llama.cpp
- base URL and endpoint path
- model name or llama.cpp alias
- temperature
- top-p
- top-k
- min-p
- penalties
- max output tokens
- top logprobs captured
- multimodal/image settings
- Full Universe visible rows and `n_probs`

## How It Works

At a high level:

1. You send a message.
2. The app sends the request to your selected local backend.
3. The backend returns generated text plus token probability data, when available.
4. The app parses tokens, logprobs, alternatives, entropy, confidence, and metadata.
5. The UI visualizes the response as heatmaps, metrics, discarded branches, replay, and branch trees.

With LM Studio, the app mainly uses OpenAI-compatible endpoints and whatever logprob data the server exposes.

With llama.cpp, the app can additionally use the native `/completion` endpoint for Full Universe scans.

## What "Full Universe" Really Means

Full Universe means:

> all possible next tokens from the model vocabulary at one exact position.

It does not mean:

> all complete answers already existed somewhere and the app simply reveals them.

A model generates text one token at a time. At each step, it produces a probability distribution over the vocabulary. The app captures or probes that distribution.

Example:

```text
Prompt: "Should I go outside?"

Position 1 possible next tokens:
"Yes"       42%
"No"        21%
"It"         8%
"Maybe"      6%
...
```

If you click `Yes`, the app asks again:

```text
Prefix: "Yes"

Next possible tokens:
","         31%
"."         28%
" if"       12%
" because"  9%
...
```

So you are walking the answer tree one token at a time.

## Tech Stack

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Zustand for app state
- Dexie / IndexedDB for local persistence
- TanStack Virtual for large token lists
- Lucide icons
- LM Studio-compatible proxy route
- llama.cpp-compatible proxy route

## Requirements

- Node.js 18 or newer
- npm
- A local model backend:
  - LM Studio, or
  - llama.cpp server

The app itself does not download models. It connects to a model server you run locally.

## Install

Clone the repository:

```bash
git clone https://github.com/Saumy-TOXOTIS/llm-logprob-visualizer.git
cd llm-logprob-visualizer
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the URL shown in the terminal, usually:

```text
http://localhost:3000
```

If another Next.js server is already running, Next may choose `3001`, `3002`, or another nearby port.

## Build For Production

```bash
npm run build
npm run start
```

## Option 1: Use With LM Studio

1. Open LM Studio.
2. Download or select a GGUF model.
3. Load the model.
4. Start the local server.
5. In this app, open Lab Settings.
6. Set Active Inference Provider to `LM Studio`.
7. Set the Base URL, usually:

```text
http://localhost:1234
```

Common endpoint paths:

```text
/v1/responses
/v1/chat/completions
/v1/completions
```

For token-level visualization, make sure your backend exposes logprobs/top logprobs. The more alternatives you expose, the richer the discarded-branch view becomes.

## Option 2: Use With llama.cpp

llama.cpp is recommended if you want the Full Universe explorer, because it can expose large next-token probability distributions through native `/completion`.

Example Windows command:

```powershell
.\llama-server.exe `
  -m "C:\Users\saumy\.lmstudio\models\lmstudio-community\Qwen3.5-9B-GGUF\Qwen3.5-9B-Q8_0.gguf" `
  --host 127.0.0.1 `
  --port 8080 `
  --alias qwen3.5-9b `
  -c 150000 `
  --n-gpu-layers 10 `
  -t 8 `
  -tb 8 `
  -b 512 `
  -ub 512 `
  -np 5 `
  --kv-unified `
  --kv-offload `
  --cache-type-k q8_0 `
  --cache-type-v q8_0 `
  --mlock `
  --mmap `
  --flash-attn on `
  --temp 1 `
  --top-k 20 `
  --top-p 0.95 `
  --min-p 0 `
  --presence-penalty 1.5 `
  --repeat-penalty 1
```

If you want Qwen-style chat without automatically entering thinking mode, you can add a custom chat template:

```powershell
--chat-template "{% for message in messages %}<|im_start|>{{ message['role'] }}{{ '\n' }}{{ message['content'] }}<|im_end|>{{ '\n' }}{% endfor %}<|im_start|>assistant{{ '\n' }}"
```

After the server starts, check that it is available:

```powershell
curl.exe http://127.0.0.1:8080/v1/models
```

Then open Lab Settings in the app:

- Active Inference Provider: `llama.cpp`
- llama.cpp Base URL: `http://127.0.0.1:8080`
- llama.cpp Model Alias: `qwen3.5-9b`
- Full Vocab `n_probs`: `0` for auto-detect vocabulary size
- Default Visible Rows: `500`, `2000`, `10000`, or whatever your machine can handle comfortably

## LM Studio vs llama.cpp

Use LM Studio if you want:

- easy model loading
- normal local chat
- OpenAI-compatible endpoints
- simple setup

Use llama.cpp if you want:

- Full Universe scans
- full next-token vocabulary distributions
- deeper branch-tree exploration
- more direct control over native generation settings

Only one backend needs to have the model loaded at a time. In Lab Settings, choose the provider that currently owns the loaded model.

## Recommended Workflow

1. Start LM Studio or llama.cpp.
2. Start this app with `npm run dev`.
3. Open Lab Settings and select the correct provider.
4. Send a prompt.
5. Click `Logprobs` on a response to inspect token confidence.
6. Use the heatmap to find uncertain tokens.
7. Open `Explore` or `Universe` for deeper branching.
8. In Full Universe mode, scan the first token or scan after the current output.
9. Expand tokens to walk alternate answer paths.
10. Use the Branch Tree and Probability Timeline to understand the path.

## Notes And Limitations

This app shows model probability data exposed by your backend. The quality and depth of the visualization depends on what the backend returns.

LM Studio/OpenAI-compatible endpoints may only expose top-k alternatives, so the discarded branch view may be limited.

llama.cpp Full Universe mode can request the full vocabulary distribution, but this can be heavy. A model with a 248,320-token vocabulary can return a very large probability list. The UI virtualizes large lists, but the backend still has to compute and send them.

Branch exploration is a probing tool. Every expanded branch is a new model query using the selected prefix. It is real probability data for that prefix, not a recording of a hidden complete answer the model had already generated.

## Project Scripts

```bash
npm run dev      # start local development server
npm run build    # create production build
npm run start    # run production server
npm run lint     # run Next.js lint checks
```

## Why This Exists

LLMs often feel like they simply "answer". In reality, every answer is a chain of probability decisions. This project makes those decisions visible enough to inspect, compare, and experiment with.

The goal is simple: make local model behavior easier to understand.
