"""Tests for the JARVIS climate stack (AirTouch 5 control).

Run on the VPS — deliberately NO dependency on `airtouch5py` being installed (the lib lives only on
the home bridge). Covers three layers:

  1. PROTOCOL  — an independent reference implementation of the documented AirTouch 5 framing
                 (header 55 55 55 AA, address, msg id/type, datalen, CRC16/MODBUS over res[4:]) plus
                 the setpoint byte codecs. A mock socket proves a frame round-trips. This is the
                 protocol ground truth, verified without the third-party lib.
  2. RELAY     — climate_relay round-trip: enqueue cmd -> poll dequeues it -> report -> state reflects.
  3. INTENT    — parse_intent maps spoken phrases to the right ops (and keeps them off the builder).
  4. BRIDGE    — airtouch5_bridge.execute() + serialize_state() against a FAKE client, with the
                 airtouch5py packet modules stubbed in sys.modules so no real lib/socket is needed.

    cd /opt/jarvis-app-1 && .venv/bin/python -m pytest server/services/test_climate.py -q
    (or:  .venv/bin/python server/services/test_climate.py   for a plain run)
"""
from __future__ import annotations

import os
import sys
import types

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


# ===========================================================================
# 1. PROTOCOL — self-contained reference (documented AirTouch 5 spec)
# ===========================================================================
HEADER = b"\x55\x55\x55\xaa"
ADDR_CONTROL = 0x80B0
MSGTYPE_CONTROL = 0xC0
SUBTYPE_ZONE_CONTROL = 0x20


def crc16_modbus(data: bytes) -> int:
    """CRC16/MODBUS — poly 0xA001, init 0xFFFF. Matches `crc.Crc16.MODBUS` used by airtouch5py."""
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if (crc & 1) else (crc >> 1)
    return crc & 0xFFFF


def encode_setpoint_zone(celsius: float) -> int:
    """Zone-control setpoint value byte = int(°C*10 - 100)  (airtouch5py packet_encoder.py)."""
    return int(round(celsius * 10 - 100))


def decode_setpoint_zone(byte: int) -> float | None:
    """Inverse: zone set_point byte 0xFF == None, else (byte+100)/10."""
    if byte == 0xFF:
        return None
    return (byte + 100) / 10.0


def decode_temperature(raw: int) -> float | None:
    """Zone current temperature: (raw-500)/10; raw>2000 invalid (None)."""
    if raw > 2000:
        return None
    return (raw - 500) / 10.0


def build_zone_setpoint_frame(msg_id: int, zone_number: int, celsius: float) -> bytes:
    """Build a full Zone-Control 'set target setpoint, power ON' frame per the documented spec.

    Data block: [subtype][0x00][normalLen 2B][repeatLen 2B][repeatCount 2B][record...]
    Record (4B): [zone][(setting<<5)|power][value][0x00]
    setting SET_TARGET_SETPOINT=0b101, power SET_TO_ON=0b011.
    """
    setting, power = 0b101, 0b011
    record = bytes([zone_number, (setting << 5) | power, encode_setpoint_zone(celsius), 0x00])
    # sub-header: subtype, 0x00, normal-data-len=0, repeat-len=4, repeat-count=1
    data = bytes([SUBTYPE_ZONE_CONTROL, 0x00]) + (0).to_bytes(2, "big") + \
        (4).to_bytes(2, "big") + (1).to_bytes(2, "big") + record
    body = ADDR_CONTROL.to_bytes(2, "big") + bytes([msg_id, MSGTYPE_CONTROL]) + \
        len(data).to_bytes(2, "big") + data
    return HEADER + body + crc16_modbus(body).to_bytes(2, "big")


def parse_frame(buf: bytes) -> dict:
    """Minimal reader: validate header + CRC, return fields. Mirrors packet_reader.py logic."""
    assert buf[:4] == HEADER, "bad header"
    body = buf[4:-2]
    crc_rx = int.from_bytes(buf[-2:], "big")
    assert crc16_modbus(body) == crc_rx, "CRC mismatch"
    address = int.from_bytes(body[0:2], "big")
    msg_id = body[2]
    msg_type = body[3]
    data_len = int.from_bytes(body[4:6], "big")
    data = body[6:6 + data_len]
    return {"address": address, "msg_id": msg_id, "msg_type": msg_type, "data": data}


class _MockSocket:
    """A loopback socket: whatever is sent can be recv'd back — proves a frame survives the wire."""
    def __init__(self):
        self._buf = b""

    def sendall(self, b):
        self._buf += b

    def recv(self, n):
        out, self._buf = self._buf[:n], self._buf[n:]
        return out


def test_crc16_modbus_known_vector():
    # Classic MODBUS CRC check value for b"123456789" is 0x4B37.
    assert crc16_modbus(b"123456789") == 0x4B37


def test_setpoint_codec_roundtrip():
    for c in (16.0, 18.0, 21.0, 23.0, 24.0, 30.0):
        b = encode_setpoint_zone(c)
        assert 0 <= b <= 255
        assert abs(decode_setpoint_zone(b) - c) < 0.05
    assert encode_setpoint_zone(24.0) == 140      # documented example
    assert decode_setpoint_zone(0xFF) is None


def test_temperature_decode():
    assert decode_temperature(720) == 22.0        # (720-500)/10
    assert decode_temperature(5000) is None        # >2000 -> invalid


def test_frame_build_parse_over_mock_socket():
    frame = build_zone_setpoint_frame(msg_id=7, zone_number=3, celsius=24.0)
    s = _MockSocket()
    s.sendall(frame)
    received = s.recv(len(frame))
    got = parse_frame(received)
    assert got["address"] == ADDR_CONTROL
    assert got["msg_id"] == 7
    assert got["msg_type"] == MSGTYPE_CONTROL
    # data: subtype + 0x00 + 4 header bytes counts + record
    assert got["data"][0] == SUBTYPE_ZONE_CONTROL
    record = got["data"][-4:]
    assert record[0] == 3                          # zone number
    assert record[1] == (0b101 << 5) | 0b011       # set target setpoint + power on
    assert decode_setpoint_zone(record[2]) == 24.0


def test_frame_rejects_corruption():
    frame = bytearray(build_zone_setpoint_frame(1, 1, 22.0))
    frame[-1] ^= 0xFF                              # flip CRC
    try:
        parse_frame(bytes(frame))
        raise AssertionError("should have rejected bad CRC")
    except AssertionError as e:
        assert "CRC" in str(e)


# ===========================================================================
# 2. RELAY round-trip
# ===========================================================================
def _fresh_relay():
    """Import a clean climate_relay (reset module globals between tests)."""
    import importlib
    from server.services import climate_relay as CR
    importlib.reload(CR)
    return CR


def test_relay_roundtrip_cmd_poll_report_state():
    CR = _fresh_relay()
    # initially: no bridge, nothing pending
    st0 = CR.state()
    assert st0["connected"] is False
    assert st0["pending"] == 0

    # voice/chat enqueues a command
    r = CR.enqueue({"op": "set_zone_temp", "zone": "lounge", "value": 23.0})
    assert r["ok"] and r["id"] == 1

    # bridge polls -> gets it and it's dequeued
    poll = CR.poll()
    assert len(poll["commands"]) == 1
    assert poll["commands"][0]["op"] == "set_zone_temp"
    assert poll["commands"][0]["value"] == 23.0
    assert CR.poll()["commands"] == []             # drained

    # bridge reports state
    CR.report({"connected": True, "console_id": "94302563",
               "zones": [{"number": 1, "name": "Lounge", "power": "ON", "temperature": 21.5,
                          "set_point": 23.0, "has_sensor": True}],
               "acs": [{"number": 0, "name": "Daikin", "power": "ON", "mode": "HEAT",
                        "setpoint": 23.0, "temperature": 21.5}],
               "results": [{"id": 1, "ok": True}]})

    st = CR.state()
    assert st["connected"] is True
    assert st["console_id"] == "94302563"
    assert st["zones"][0]["name"] == "Lounge"
    assert st["zones"][0]["set_point"] == 23.0
    assert st["target_console_id"] == "94302563"


def test_relay_bad_op_rejected():
    CR = _fresh_relay()
    assert CR.enqueue({"op": "explode"})["ok"] is False


def test_relay_zone_resolution_and_warm_zone():
    CR = _fresh_relay()
    CR.report({"connected": True, "zones": [
        {"number": 1, "name": "Lounge", "has_sensor": True, "power": "ON"},
        {"number": 2, "name": "Mum's Room", "has_sensor": True, "power": "ON"},
        {"number": 3, "name": "Study", "has_sensor": False, "power": "OFF"},
    ], "acs": []})
    assert CR.find_zone("lounge")["number"] == 1
    assert CR.find_zone(2)["name"] == "Mum's Room"
    assert CR.find_zone("study")["number"] == 3
    assert CR.find_zone("nonexistent") is None
    # warm_zone prefers a name hinting at the mother's room
    assert CR.warm_zone()["number"] == 2


def test_relay_clamp():
    CR = _fresh_relay()
    assert CR.clamp_c(99) == CR.SAFE_MAX_C
    assert CR.clamp_c(-5) == CR.SAFE_MIN_C
    assert CR.clamp_c(22.3) == 22.5                # snaps to 0.5 grid


# ===========================================================================
# 3. INTENT routing
# ===========================================================================
def test_intent_i_am_cold_warms():
    CR = _fresh_relay()
    assert CR.parse_intent("Jarvis I am cold")["op"] == "warmer"
    assert CR.parse_intent("I'm freezing")["op"] == "warmer"
    assert CR.parse_intent("can you make it warmer")["op"] == "warmer"


def test_intent_too_hot_cools():
    CR = _fresh_relay()
    assert CR.parse_intent("I'm too hot")["op"] == "cooler"
    assert CR.parse_intent("make it cooler please")["op"] == "cooler"


def test_intent_set_named_zone():
    CR = _fresh_relay()
    i = CR.parse_intent("set the lounge to 23")
    assert i["op"] == "set_zone_temp" and i["zone"] == "lounge" and i["value"] == 23.0
    i2 = CR.parse_intent("change the bedroom to 19.5")
    assert i2["op"] == "set_zone_temp" and i2["value"] == 19.5


def test_intent_queries():
    CR = _fresh_relay()
    assert CR.parse_intent("what is the temperature")["query"] == "temperature"
    assert CR.parse_intent("which zones do we have")["query"] == "zones"
    assert CR.parse_intent("which zones")["query"] == "zones"


def test_intent_zone_on_off():
    CR = _fresh_relay()
    i = CR.parse_intent("turn off the study")
    assert i["op"] == "set_zone_power" and i["on"] is False and "study" in i["zone"]
    i2 = CR.parse_intent("turn on the bedroom")
    assert i2["op"] == "set_zone_power" and i2["on"] is True


def test_intent_mode():
    CR = _fresh_relay()
    assert CR.parse_intent("set it to heat")["op"] == "set_ac_mode"
    assert CR.parse_intent("set it to heat")["mode"] == "heat"
    assert CR.parse_intent("switch to cooling")["mode"] == "cool"


def test_intent_turn_on_off_heating_is_ac():
    CR = _fresh_relay()
    i = CR.parse_intent("turn off the heating")
    assert i["op"] == "set_ac_power" and i["on"] is False


def test_intent_non_climate_returns_none():
    CR = _fresh_relay()
    # These must fall through to normal chat / builder, NOT be hijacked by climate.
    assert CR.parse_intent("tell me a story about the sea") is None
    assert CR.parse_intent("build me a 3d model of a dragon") is None
    assert CR.parse_intent("how are you today") is None


# ===========================================================================
# 4. BRIDGE execute()/serialize_state() against a fake client (airtouch5py stubbed)
# ===========================================================================
def _install_fake_airtouch5py():
    """Stub the airtouch5py packet enums/classes execute() imports, so we can test the bridge's
    command translation on the VPS without the real lib or a socket."""
    import enum

    def _mk(name, members):
        return enum.Enum(name, members)

    zc = types.ModuleType("airtouch5py.packets.zone_control")
    zc.ZoneSettingValue = _mk("ZoneSettingValue", {
        "KEEP_SETTING_VALUE": 0, "VALUE_DECREASE": 2, "VALUE_INCREASE": 3,
        "SET_OPEN_PERCENTAGE": 4, "SET_TARGET_SETPOINT": 5})
    zc.ZoneSettingPower = _mk("ZoneSettingPower", {
        "KEEP_POWER_STATE": 0, "CHANGE_ON_OFF_STATE": 1, "SET_TO_OFF": 2,
        "SET_TO_ON": 3, "SET_TO_TURBO": 5})

    class ZoneControlZone:
        def __init__(self, zone_number, zone_setting_value, power, value_to_set):
            self.zone_number = zone_number
            self.zone_setting_value = zone_setting_value
            self.power = power
            self.value_to_set = value_to_set
    zc.ZoneControlZone = ZoneControlZone

    ac = types.ModuleType("airtouch5py.packets.ac_control")
    ac.SetPowerSetting = _mk("SetPowerSetting", {
        "KEEP_POWER_SETTING": 0, "CHANGE_ON_OFF_STATUS": 1, "SET_TO_OFF": 2,
        "SET_TO_ON": 3, "SET_TO_AWAY": 4, "SET_TO_SLEEP": 5})
    ac.SetAcMode = _mk("SetAcMode", {
        "KEEP_AC_MODE": 15, "SET_TO_AUTO": 0, "SET_TO_HEAT": 1, "SET_TO_DRY": 2,
        "SET_TO_FAN": 3, "SET_TO_COOL": 4})
    ac.SetAcFanSpeed = _mk("SetAcFanSpeed", {"KEEP_AC_FAN_SPEED": 15, "SET_TO_AUTO": 0})
    ac.SetpointControl = _mk("SetpointControl", {
        "INVALIDATE_DATA": 255, "CHANGE_SETPOINT": 64, "KEEP_SETPOINT_VALUE": 0})

    class AcControl:
        def __init__(self, power_setting, ac_number, ac_mode, ac_fan_speed, setpoint_control, setpoint):
            self.power_setting = power_setting
            self.ac_number = ac_number
            self.ac_mode = ac_mode
            self.ac_fan_speed = ac_fan_speed
            self.setpoint_control = setpoint_control
            self.setpoint = setpoint
    ac.AcControl = AcControl

    pkgs = types.ModuleType("airtouch5py")
    pkts = types.ModuleType("airtouch5py.packets")
    sys.modules.setdefault("airtouch5py", pkgs)
    sys.modules.setdefault("airtouch5py.packets", pkts)
    sys.modules["airtouch5py.packets.zone_control"] = zc
    sys.modules["airtouch5py.packets.ac_control"] = ac
    return zc, ac


class _FakeZoneName:
    def __init__(self, n, name):
        self.zone_number, self.zone_name = n, name


class _FakeAbility:
    def __init__(self, num=0, start=1, count=3):
        self.ac_number, self.start_zone_number, self.zone_count = num, start, count
        self.ac_name = "Daikin"
        self.min_heat_set_point, self.max_heat_set_point = 16, 30
        self.min_cool_set_point, self.max_cool_set_point = 18, 30


class _En:
    def __init__(self, name):
        self.name = name


class _FakeZoneStatus:
    def __init__(self, n, sp=21.0, temp=20.0, power="ON", sensor=True):
        self.zone_number = n
        self.set_point = sp
        self.temperature = temp
        self.zone_power_state = _En(power)
        self.control_method = _En("TEMPERATURE_CONTROL")
        self.open_percentage = 1.0
        self.has_sensor = sensor
        self.spill_active = False
        self.is_low_battery = False


class _FakeAcStatus:
    def __init__(self):
        self.ac_power_state = _En("ON")
        self.ac_mode = _En("HEAT")
        self.ac_fan_speed = _En("AUTO")
        self.ac_setpoint = 22.0
        self.temperature = 20.5
        self.error_code = 0


class _FakeFactory:
    def __init__(self, sent):
        self._sent = sent

    def zone_control(self, zones):
        self._sent.append(("zone_control", zones))
        return ("zone_control", zones)

    def ac_control(self, acs):
        self._sent.append(("ac_control", acs))
        return ("ac_control", acs)


class _FakeClient:
    def __init__(self):
        self.sent = []
        self.data_packet_factory = _FakeFactory(self.sent)
        self.zones = [_FakeZoneName(1, "Lounge"), _FakeZoneName(2, "Mum's Room"),
                      _FakeZoneName(3, "Study")]
        self.ac = [_FakeAbility()]
        self.latest_zone_status = {1: _FakeZoneStatus(1, sp=21.0, temp=20.0),
                                   2: _FakeZoneStatus(2, sp=20.0, temp=19.0),
                                   3: _FakeZoneStatus(3, sp=22.0, temp=23.0, power="OFF", sensor=False)}
        self.latest_ac_status = {0: _FakeAcStatus()}

    async def send_packet(self, pkt):
        return None


def _run(coro):
    import asyncio
    return asyncio.run(coro)


def test_bridge_serialize_state():
    _install_fake_airtouch5py()
    from server.services import airtouch5_bridge as B
    c = _FakeClient()
    st = B.serialize_state(c, "94302563")
    assert st["connected"] is True and st["console_id"] == "94302563"
    names = {z["name"] for z in st["zones"]}
    assert {"Lounge", "Mum's Room", "Study"} <= names
    ac0 = st["acs"][0]
    assert ac0["mode"] == "HEAT" and ac0["min_heat"] == 16 and ac0["max_heat"] == 30


def test_bridge_execute_warmer_picks_mum_and_heats():
    zc, acc = _install_fake_airtouch5py()
    from server.services import airtouch5_bridge as B
    c = _FakeClient()
    res = _run(B.execute(c, {"id": 5, "op": "warmer"}))
    assert res["ok"] is True
    # warm_zone hint -> Mum's Room (zone 2), bumped from 20.0 to 21.0
    assert res["detail"]["zone"] == 2
    assert res["detail"]["target"] == 21.0
    kinds = [s[0] for s in c.sent]
    assert "ac_control" in kinds and "zone_control" in kinds       # set heat+on, then bump zone
    zone_pkt = next(s for s in c.sent if s[0] == "zone_control")[1][0]
    assert zone_pkt.zone_setting_value == zc.ZoneSettingValue.SET_TARGET_SETPOINT
    assert zone_pkt.power == zc.ZoneSettingPower.SET_TO_ON
    ac_pkt = next(s for s in c.sent if s[0] == "ac_control")[1][0]
    assert ac_pkt.ac_mode == acc.SetAcMode.SET_TO_HEAT


def test_bridge_execute_set_zone_temp_clamps_to_heat_max():
    _install_fake_airtouch5py()
    from server.services import airtouch5_bridge as B
    c = _FakeClient()
    res = _run(B.execute(c, {"id": 9, "op": "set_zone_temp", "zone": "Lounge", "value": 99}))
    assert res["ok"] is True
    assert res["detail"]["zone"] == 1
    assert res["detail"]["target"] == 30          # clamped to AC max_heat_set_point


def test_bridge_execute_zone_on_off_and_mode_and_unknown():
    zc, acc = _install_fake_airtouch5py()
    from server.services import airtouch5_bridge as B
    c = _FakeClient()
    assert _run(B.execute(c, {"id": 1, "op": "set_zone_power", "zone": "study", "on": False}))["ok"]
    z = c.sent[-1][1][0]
    assert z.power == zc.ZoneSettingPower.SET_TO_OFF

    assert _run(B.execute(c, {"id": 2, "op": "set_ac_mode", "ac": 0, "mode": "cool"}))["ok"]
    a = c.sent[-1][1][0]
    assert a.ac_mode == acc.SetAcMode.SET_TO_COOL

    bad = _run(B.execute(c, {"id": 3, "op": "set_zone_temp", "zone": "no-such-zone", "value": 22}))
    assert bad["ok"] is False
    nope = _run(B.execute(c, {"id": 4, "op": "frobnicate"}))
    assert nope["ok"] is False


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
