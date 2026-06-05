"""Rate-limit-aware fetcher: caching + backoff (mocked transport, no real net)."""
import io, json, time, urllib.error
from server.services import net_ratelimit as nr

class _Resp:
    status=200
    def __init__(self, body): self._b=body.encode()
    def read(self): return self._b
    def __enter__(self): return self
    def __exit__(self,*a): return False

def test_cache_avoids_refetch(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path/"rl.db"))
    calls={"n":0}
    def fake_urlopen(req, timeout=15):
        calls["n"]+=1; return _Resp(json.dumps({"hello":"world"}))
    monkeypatch.setattr(nr.urllib.request,"urlopen",fake_urlopen)
    u="https://example.test/data?x=1"
    r1=nr.polite_get(u, ttl=300); r2=nr.polite_get(u, ttl=300)
    assert r1["ok"] and r1["json"]=={"hello":"world"} and r1["from_cache"] is False
    assert r2["from_cache"] is True and calls["n"]==1   # second served from cache

def test_backoff_on_429_then_success(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path/"rl2.db"))
    seq={"n":0}
    def fake_urlopen(req, timeout=15):
        seq["n"]+=1
        if seq["n"]==1:
            raise urllib.error.HTTPError(req.full_url,429,"slow down",{"Retry-After":"0"},io.BytesIO(b""))
        return _Resp(json.dumps({"ok":1}))
    monkeypatch.setattr(nr.urllib.request,"urlopen",fake_urlopen)
    r=nr.polite_get("https://example.test/cve", ttl=0, max_retries=3)
    assert r["ok"] and r["json"]=={"ok":1} and seq["n"]==2   # retried after 429
