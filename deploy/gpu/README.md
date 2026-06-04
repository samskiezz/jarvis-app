# PATTERN ORACLE — GPU prediction tier (vast.ai runbook)

A drop-in PyTorch + CUDA inference server for the PATTERN ORACLE prediction
stack. It runs **on a rented GPU box**; the JARVIS backend dispatches forecasts
to it over HTTP when the operator sets `PREDICT_GPU_URL`. Nothing here runs (or
is imported) on the JARVIS side — `torch` lives only in this directory.

The whole tier is **optional and graceful**: with `PREDICT_GPU_URL` unset,
JARVIS forecasts entirely on CPU, unchanged. The moment you set the endpoint, it
auto-activates; if the box dies, JARVIS transparently falls back to the local
CPU forecaster (a circuit breaker stops it hammering a dead host).

---

## 1. Rent a GPU (vast.ai)

1. Create an instance from a CUDA image (the `pytorch/pytorch:*-cuda12*` images
   work out of the box; vast.ai hosts ship the NVIDIA Container Toolkit).
2. Make sure an external TCP port maps to container port **8400** (vast.ai's
   "Open Ports" / `-p` mapping). Note the **public IP** and the **mapped port**.

## 2. Run the server on the GPU box

### Option A — Docker (recommended)

```bash
# on the GPU host, inside this deploy/gpu/ directory
docker build -t pattern-oracle-gpu .

docker run --gpus all -p 8400:8400 \
  -e PREDICT_GPU_KEY=$(openssl rand -hex 16) \   # optional bearer; copy it
  pattern-oracle-gpu
```

### Option B — bare pip (no Docker)

```bash
# install a CUDA-matched torch first: https://pytorch.org/get-started/locally/
pip install -r requirements.txt
pip install torch        # the CUDA build matching the host driver
PREDICT_GPU_KEY=secret123 uvicorn server:app --host 0.0.0.0 --port 8400
```

## 3. Smoke-test it

```bash
curl http://<vast-ip>:<port>/health
# -> {"ok":true,"device":"cuda","cuda":true,"torch_version":"2.3.1","gpu_name":"...","tasks":["forecast"]}
```

## 4. Activate it on the JARVIS side

```bash
export PREDICT_GPU_URL=http://<vast-ip>:<port>
export PREDICT_GPU_KEY=<the same bearer you set above>   # optional
# export PREDICT_GPU_MODEL=gpu_gru                        # optional variant hint
# restart / re-run the JARVIS backend — the GPU tier is now live.
```

That's it. JARVIS now sends forecasts to the GPU; remove the env var (or stop
the box) and it falls straight back to CPU.

---

## Env contract

| Variable            | Side   | Meaning                                                            |
|---------------------|--------|-------------------------------------------------------------------|
| `PREDICT_GPU_URL`   | JARVIS | Base URL of this server, e.g. `http://1.2.3.4:8400`. Empty = off. |
| `PREDICT_GPU_KEY`   | both   | Optional bearer token. If set on the server, requests must match. |
| `PREDICT_GPU_MODEL` | JARVIS | Optional model-variant hint forwarded as `model` in the payload.  |
| `PORT`              | server | Listen port (default `8400`).                                     |

## `/infer` task schema

`POST /infer` with `Content-Type: application/json` and (if a key is set)
`Authorization: Bearer <PREDICT_GPU_KEY>`.

### Request

```json
{
  "task": "forecast",
  "series": [{"t": 1717000000000, "v": 100.2}, {"t": 1717003600000, "v": 100.7}, "..."],
  "horizon_steps": 1,
  "confidence": 0.9,
  "model": "gpu_gru"
}
```

- `series` — the canonical `[{t, v}, …]` (or a plain list of numbers).
- `horizon_steps` — steps ahead to forecast (>= 1).
- `confidence` — interval confidence in (0, 1).
- `model` — optional; echoed from `PREDICT_GPU_MODEL`.

### Response (same schema as the local `MLForecaster.predict_next`)

```json
{
  "status": "ok",
  "point": 101.4,
  "interval": {"low": 98.1, "high": 104.9, "confidence": 0.9},
  "prob_up": 0.57,
  "model": "gpu_gru",
  "horizon_steps": 1,
  "last_value": 100.7,
  "method": "Torch GRU over lagged returns + Gaussian residual interval",
  "device": "cuda"
}
```

On too-little data it returns `{"status": "insufficient_data", ...}`; on an
internal error `{"status": "error", "reason": ...}`. The JARVIS client treats any
non-`ok` (or a network failure) as a miss and uses the local CPU forecaster.

## How the forecast works

For `task="forecast"` the server builds causal lagged one-step log-returns from
the supplied series, trains a small **GRU + MLP** (on GPU when available) to map
the recent return window to the forward log-return over the horizon, then emits a
point estimate, a Gaussian residual interval scaled to the requested confidence,
and `prob_up` — the same contract the local model returns, so it is a genuine
drop-in accelerator.

## Adding heavier models later

The dispatch table in `server.py` (`_TASKS`) is keyed by `task`. Add a foundation
model (TimesFM / Chronos) as a new entry, e.g. `"forecast_chronos": _chronos_fn`,
and call it from JARVIS by passing that `task` — no wire-protocol change needed.
