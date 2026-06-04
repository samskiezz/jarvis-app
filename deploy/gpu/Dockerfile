# PATTERN ORACLE GPU inference tier.
#
# Base: the official PyTorch CUDA runtime image (ships a CUDA-enabled torch +
# cuDNN), so we only add the small web layer on top. Pin a 2.x / CUDA 12.x tag
# that matches the GPU host's driver (vast.ai images expose recent drivers).
FROM pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime

WORKDIR /app

# Web/runtime layer only — torch already lives in the base image.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY server.py /app/server.py

# Inference server port.
EXPOSE 8400

# Optional bearer token (set at `docker run` time):  -e PREDICT_GPU_KEY=...
ENV PORT=8400

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8400"]
