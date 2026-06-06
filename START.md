# START HERE — the only page you need

Two machines, each with one job. One command on each. One URL to open.

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  HOSTINGER VPS          │  asks   │  VAST.AI GPU BOX         │
│  76.13.176.135          │ ──────▶ │  211.72.13.201           │
│  = THE APP (UI + API)   │  the    │  = THE JARVIS BRAIN      │
│  you open this in a     │  brain  │  (Ollama LLM on :11434)  │
│  browser, port 8080     │         │                          │
└─────────────────────────┘         └──────────────────────────┘
```

---

## 1. The GPU brain — on the vast.ai box (run once)

SSH in:
```bash
ssh -p 41154 root@211.72.13.201
```
Start the model (only needed on the GPU box):
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1:8b
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```
Leave it running. That's the whole job of the vast.ai box.

---

## 2. The app — on the Hostinger VPS (this is what you open)

SSH in, point it at the GPU brain, and start:
```bash
cd jarvis-app
export OLLAMA_HOST=http://211.72.13.201:11434
./update.sh
```

`./update.sh` does everything: pulls the latest code, builds, and runs the
**whole app (UI + API) on ONE port: 8080**. When it finishes it prints your URL.

---

## 3. Open it

In any browser:
```
http://76.13.176.135:8080/
```

That's it. **One command per box. One URL.**

- Only **port 8080** needs to be open in the Hostinger firewall.
- Only **port 11434** needs to be open on the vast.ai box (and only the VPS needs to reach it).
- To update later: just re-run `./update.sh` on the VPS.

---

### If you ever want it all on ONE box
Run both steps on the same machine and use `export OLLAMA_HOST=http://localhost:11434`.
Everything still ends up at `http://<that-box-ip>:8080/`.
