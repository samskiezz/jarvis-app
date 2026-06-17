#!/bin/bash
export OLLAMA_HOST=127.0.0.1:11435
export OLLAMA_KEEP_ALIVE=24h
export OLLAMA_MAX_LOADED_MODELS=2
export OLLAMA_NUM_THREAD=4
exec /usr/local/bin/ollama serve
