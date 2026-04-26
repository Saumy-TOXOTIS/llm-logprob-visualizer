# 🧠 LLM Logprob Visualizer + Answer Space Explorer

An advanced interactive web app to **visualize how Large Language Models generate responses internally**.

This project goes beyond simple chat — it reveals:
- token-level probabilities
- uncertainty regions
- alternative (discarded) outputs
- branching decisions
- and the hidden **“answer space”** behind a single response

---

## 🚀 What Makes This Different?

Most AI tools show only the **final answer**.

This tool shows:
> *what the model considered, what it rejected, and how confident it was at every step.*

---

## ✨ Core Features

### 🔤 Token-Level Visualization
- Per-token confidence heatmap
- Hover to inspect probabilities
- Identify low-confidence regions

---

### ⚡ Logprob Explorer
- View top-k token alternatives at each step
- Inspect discarded tokens
- Compare chosen vs rejected probabilities

---

### 🌳 Answer Space Explorer
- Explore multiple possible outputs
- Visualize alternative answers
- Cluster similar responses
- Detect divergence points

---

### 🧪 Discarded Branch Explorer
- Shows tokens that were **considered but not chosen**
- Reveals hidden possibilities
- Highlights uncertainty and decision boundaries

---

### 📊 Analytics Dashboard
- Average confidence
- Entropy (uncertainty)
- Low-confidence token count
- Non-top choices

---

### 🧬 Multi-Sampling Engine (if enabled)
- Generate multiple outputs for same prompt
- Compare variations
- Analyze stability vs randomness

---

### 🎛️ Advanced Controls
- Temperature
- Top-P / Top-K
- Min-P
- Presence penalty
- Repeat penalty
- Max tokens
- Top logprobs capture

---

### 🧩 Model Compatibility
Works with local LLM endpoints (e.g. LM Studio / OpenAI-compatible APIs)

---

## 🖼️ UI Overview

- Chat interface with token-level breakdown
- Right panel: Logprob + analytics + branching
- Answer Space Explorer (cluster + variation view)
- Discarded possibilities panel

---

## ⚙️ Tech Stack

- Frontend: React / Next.js
- Visualization:
  - Custom token heatmaps
  - Graph-based branching views
- API: OpenAI-compatible `/v1/responses`
- Model backend: LM Studio / local LLMs

---

## 🧠 How It Works

1. Send prompt → model generates tokens
2. Capture:
   - tokens
   - logprobs
   - top alternatives
3. Compute:
   - entropy
   - confidence
4. Visualize:
   - heatmap
   - branching
   - discarded options

---

## ⚠️ Important Note

This tool provides an **approximation of the model's decision space**.

> It does NOT show all possible outputs — only sampled and top-probability alternatives.

---

## 🎯 Use Cases

- Understanding LLM behavior
- Debugging prompts
- AI research & interpretability
- Studying uncertainty in language models
- Building trust in AI outputs

---

## 🔮 Future Improvements

- Full branching tree visualization
- Streaming + real-time logprob updates
- Embedding-based clustering
- Graph-based answer maps
- Interactive divergence explorer

---

## 🛠️ Setup

```bash
git clone <your-repo>
cd <your-repo>
npm install
npm run dev