"""Each REAL cryptography / coding-theory method must reproduce its KNOWN value.

References (KNOWN values):
  Diffie-Hellman (p=23,g=5,a=6,b=15): A=8, B=19, shared secret = 2
  RSA canonical key  n=3233, d=2753; sign(65)=588 -> verify -> 65
  Hamming(7,4): data(1,0,1,1) -> codeword(1,0,1,1,0,1,0); minimum distance 3
                corrects ANY single-bit error; syndrome (0,1,1) for error idx 2
  SHA-256 avalanche: 1-bit input flip changes ~50% (128/256) of output bits
                SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223...  (FIPS 180-4)
  Shannon entropy: log2(95**12) = 78.838...  (= length*log2(alphabet))
  EC y²=x³+2x+2 mod 17, P=(5,1): 2P = P+P = (6,3); 3P = (10,6)
  One-time pad: decrypt(encrypt(m)) == m; perfect secrecy (Shannon 1949)
  CRC-32("123456789") = 0xCBF43926  (IEEE 802.3 test vector)
"""
import hashlib
import math

from underworld.server.services.methods_crypto import (
    diffie_hellman_exchange,
    rsa_sign_verify,
    hamming_7_4,
    sha256_avalanche,
    shannon_keyspace_entropy,
    ec_point_addition,
    one_time_pad,
    crc32_checksum,
)


def test_diffie_hellman_shared_secret():
    r = diffie_hellman_exchange(p=23, g=5, a=6, b=15)
    # KNOWN textbook example: A=8, B=19, shared secret = 2
    assert r["alice_public"] == 8
    assert r["bob_public"] == 19
    assert r["shared_alice"] == r["shared_bob"] == 2
    assert r["agree"]


def test_rsa_sign_verify_roundtrip():
    r = rsa_sign_verify(p=61, q=53, e=17, message=65)
    # KNOWN canonical RSA: n=3233, d=2753, sign(65)=588, verify -> 65
    assert r["n"] == 3233
    assert r["d"] == 2753
    assert r["signature"] == 588
    assert r["recovered"] == 65
    assert r["verified"]


def test_hamming_corrects_single_bit_error():
    r = hamming_7_4(data=(1, 0, 1, 1), error_pos=2)
    # KNOWN: valid (G,H) pair (G·Hᵀ=0); codeword (1,0,1,1,0,1,0)
    assert r["valid_code"]
    assert r["codeword"] == [1, 0, 1, 1, 0, 1, 0]
    # syndrome identifies the corrupted bit and it is repaired
    assert r["syndrome"] == [0, 1, 1]
    assert r["detected_error_pos"] == 2
    assert r["recovered"]


def test_hamming_corrects_every_single_bit_position():
    # KNOWN: minimum distance 3 -> ANY single-bit error is correctable
    for pos in range(7):
        r = hamming_7_4(data=(1, 0, 1, 1), error_pos=pos)
        assert r["detected_error_pos"] == pos
        assert r["recovered"]


def test_sha256_avalanche_about_half_bits_flip():
    r = sha256_avalanche(message=b"The quick brown fox", flip_bit=0)
    # KNOWN avalanche property: ~50% of 256 output bits change on a 1-bit flip
    assert r["total_bits"] == 256
    assert 0.35 < r["fraction_changed"] < 0.65
    # sanity: the two digests differ
    assert r["digest1"] != r["digest2"]


def test_sha256_known_digest_abc():
    # KNOWN FIPS 180-4 vector underpins the hash used above
    assert (hashlib.sha256(b"abc").hexdigest()
            == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")


def test_shannon_entropy_equals_log2_keyspace():
    r = shannon_keyspace_entropy(alphabet_size=95, length=12)
    # KNOWN: bits == log2(keyspace) == length*log2(alphabet)
    assert r["keyspace"] == 95 ** 12
    assert math.isclose(r["entropy_bits"], math.log2(95 ** 12), rel_tol=1e-12)
    assert math.isclose(r["entropy_bits"], 78.83826729997138, rel_tol=1e-12)
    assert r["match"]


def test_ec_point_doubling_on_curve():
    r = ec_point_addition(p=17, a=2, b=2, point=(5, 1))
    # KNOWN: y²=x³+2x+2 mod 17, P=(5,1) -> 2P = P+P = (6,3); 3P = (10,6)
    assert r["P_plus_P"] == [6, 3]
    assert r["two_P"] == [6, 3]
    assert r["three_P"] == [10, 6]
    assert r["doubling_consistent"]
    assert r["P_on_curve"]
    assert r["result_on_curve"]


def test_one_time_pad_roundtrip_and_secrecy():
    r = one_time_pad(plaintext=b"ATTACK AT DAWN", seed=0)
    # KNOWN: decrypt recovers plaintext exactly; perfect secrecy holds
    assert r["roundtrip_ok"]
    assert r["decrypted"] == "ATTACK AT DAWN"
    assert r["perfect_secrecy"]


def test_crc32_known_value_and_detects_corruption():
    r = crc32_checksum(data=b"123456789", corrupt_bit=0)
    # KNOWN IEEE 802.3 test vector: CRC-32("123456789") = 0xCBF43926
    assert r["crc"] == 0xCBF43926
    assert r["crc_hex"] == "0xCBF43926"
    # corrupting one bit changes the checksum -> detected
    assert r["corrupted_crc"] != r["crc"]
    assert r["detected"]
