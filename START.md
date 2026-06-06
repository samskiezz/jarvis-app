# START HERE — it just runs

Two machines. One command each. One URL. No config to type — the app finds
the GPU brain by itself.

```
HOSTINGER VPS  76.13.176.135   = THE APP   →  you open this :8080
VAST.AI GPU    211.72.13.201   = THE BRAIN →  just runs the model :11434
```

---

## On the vast.ai box (the brain) — paste this once
```bash
ssh -p 41154 root@211.72.13.201
curl -fsSL https://ollama.com/install.sh | sh && ollama pull llama3.1:8b
OLLAMA_HOST=0.0.0.0:11434 nohup ollama serve >/tmp/ollama.log 2>&1 &
```

## On the Hostinger VPS (the app) — paste this once
```bash
cd jarvis-app && ./update.sh
```

## Then open this in a browser
```
http://76.13.176.135:8080/
```

That's everything. `./update.sh` pulls the latest code, builds, and runs the
whole app (UI + API) on **one port: 8080**. The app auto-detects the vast.ai
brain at `211.72.13.201:11434` — nothing to configure.

- Open **port 8080** on the Hostinger firewall, **port 11434** on vast.ai.
- To update later: just re-run `./update.sh` on the VPS.
- One box only? Run both blocks on the same machine — it still lands at `:8080`.
