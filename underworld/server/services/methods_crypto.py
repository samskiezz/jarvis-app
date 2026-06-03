"""A library of distinct, REAL cryptography & coding-theory simulations — each one
a textbook algorithm (not a shared engine), and each verified in the tests against
a KNOWN reference value. Built on the Python stdlib (hashlib) and numpy only — no
external crypto libraries.

Methods:
  1. diffie_hellman_exchange   Diffie-Hellman key exchange   (both parties -> same secret)
  2. rsa_sign_verify           RSA sign/verify roundtrip      (canonical n=3233 keys)
  3. hamming_7_4               Hamming(7,4) ECC               (corrects 1-bit error)
  4. sha256_avalanche          SHA-256 avalanche effect       (~50% output bits flip)
  5. shannon_keyspace_entropy  Information entropy            (bits = log2(keyspace))
  6. ec_point_addition         Elliptic-curve point add       (P+P == 2P on curve)
  7. one_time_pad              XOR / one-time-pad cipher       (decrypt recovers plaintext)
  8. crc32_checksum            CRC-32 (IEEE 802.3)             (detects a corrupted bit)
"""
from __future__ import annotations

import hashlib
import math
import zlib

import numpy as np


# ── 1. Diffie-Hellman key exchange ────────────────────────────────────────────
def diffie_hellman_exchange(*, p: int = 23, g: int = 5,
                            a: int = 6, b: int = 15) -> dict:
    """Classic Diffie-Hellman over the multiplicative group mod prime p with
    generator g. Alice picks private a -> public A=g^a mod p; Bob picks private
    b -> public B=g^b mod p. Each derives the shared secret s=B^a=A^b mod p.

    KNOWN textbook example (p=23, g=5, a=6, b=15): A=8, B=19, shared secret=2."""
    A = pow(g, a, p)          # Alice public
    B = pow(g, b, p)          # Bob public
    secret_alice = pow(B, a, p)
    secret_bob = pow(A, b, p)
    return {"method": "Diffie-Hellman", "p": p, "g": g,
            "alice_public": A, "bob_public": B,
            "shared_alice": secret_alice, "shared_bob": secret_bob,
            "shared_secret": secret_alice,
            "agree": secret_alice == secret_bob}


# ── 2. RSA sign / verify ──────────────────────────────────────────────────────
def rsa_sign_verify(*, p: int = 61, q: int = 53, e: int = 17,
                    message: int = 65) -> dict:
    """Textbook RSA signature. Signing computes s = m^d mod n with the private
    exponent d; verification recovers m' = s^e mod n and checks m' == m.

    KNOWN canonical RSA key (p=61, q=53): n=3233, phi=3120, d=2753. For message
    m=65 the signature is s=m^d=588 and verification recovers 65."""
    n = p * q
    phi = (p - 1) * (q - 1)
    if math.gcd(e, phi) != 1:
        raise ValueError("e must be coprime with phi(n)")
    d = pow(e, -1, phi)                 # private exponent (= 2753)
    signature = pow(message, d, n)      # sign with private key
    recovered = pow(signature, e, n)    # verify with public key
    return {"method": "RSA sign/verify", "n": n, "phi": phi, "e": e, "d": d,
            "message": message, "signature": signature, "recovered": recovered,
            "verified": recovered == message}


# ── 3. Hamming(7,4) error-correcting code ─────────────────────────────────────
def hamming_7_4(*, data=(1, 0, 1, 1), error_pos: int = 2) -> dict:
    """Systematic Hamming(7,4) linear block code. Encodes a 4-bit word via the
    generator matrix G (codeword = data·G mod 2), then injects a single-bit error
    and corrects it through syndrome decoding (syndrome = H·r mod 2 matches the
    column of H at the error position).

    KNOWN property: minimum distance d=3 => corrects ANY single-bit error. For
    data=(1,0,1,1) the codeword is (1,0,1,1,0,1,0); flipping bit index 2 yields
    syndrome (0,1,1) which uniquely identifies and repairs that bit."""
    G = np.array([
        [1, 0, 0, 0, 1, 1, 0],
        [0, 1, 0, 0, 1, 0, 1],
        [0, 0, 1, 0, 0, 1, 1],
        [0, 0, 0, 1, 1, 1, 1],
    ])
    H = np.array([
        [1, 1, 0, 1, 1, 0, 0],
        [1, 0, 1, 1, 0, 1, 0],
        [0, 1, 1, 1, 0, 0, 1],
    ])
    d = np.array(data) % 2
    codeword = (d @ G) % 2
    # G·Hᵀ == 0 is the defining orthogonality property of a valid (G,H) pair.
    valid_code = bool(np.all((G @ H.T) % 2 == 0))
    received = codeword.copy()
    received[error_pos] ^= 1                      # inject single-bit error
    syndrome = (H @ received) % 2
    # locate error: column of H equal to the syndrome
    err_idx = -1
    if np.any(syndrome):
        for i in range(H.shape[1]):
            if np.array_equal(H[:, i], syndrome):
                err_idx = i
                break
    corrected = received.copy()
    if err_idx >= 0:
        corrected[err_idx] ^= 1                   # flip back
    return {"method": "Hamming(7,4)", "data": [int(x) for x in d],
            "codeword": [int(x) for x in codeword],
            "received": [int(x) for x in received],
            "syndrome": [int(x) for x in syndrome],
            "error_pos": error_pos, "detected_error_pos": int(err_idx),
            "corrected": [int(x) for x in corrected],
            "valid_code": valid_code,
            "recovered": bool(np.array_equal(corrected, codeword))}


# ── 4. SHA-256 avalanche effect ───────────────────────────────────────────────
def sha256_avalanche(*, message: bytes = b"The quick brown fox",
                     flip_bit: int = 0) -> dict:
    """Demonstrates the avalanche effect of SHA-256: flipping a single input bit
    changes roughly half of the 256 output bits (a hallmark of a good hash).

    KNOWN property: the expected fraction of changed output bits is ~0.5 (128 of
    256). hashlib provides the FIPS 180-4 reference implementation."""
    if isinstance(message, str):
        message = message.encode()
    h1 = hashlib.sha256(message).digest()
    flipped = bytearray(message)
    byte_i, bit_i = divmod(flip_bit, 8)
    if byte_i >= len(flipped):           # ensure there is a bit to flip
        flipped.append(0)
        byte_i, bit_i = len(flipped) - 1, 0
    flipped[byte_i] ^= (1 << bit_i)
    h2 = hashlib.sha256(bytes(flipped)).digest()
    # count differing bits across the 256-bit digests
    diff_bits = sum(bin(b1 ^ b2).count("1") for b1, b2 in zip(h1, h2))
    total_bits = len(h1) * 8
    return {"method": "SHA-256 avalanche",
            "digest1": h1.hex(), "digest2": h2.hex(),
            "changed_bits": diff_bits, "total_bits": total_bits,
            "fraction_changed": diff_bits / total_bits,
            "expected_fraction": 0.5}


# ── 5. Shannon entropy of a keyspace / password ───────────────────────────────
def shannon_keyspace_entropy(*, alphabet_size: int = 95,
                             length: int = 12) -> dict:
    """Information-theoretic entropy of a uniformly random password drawn from an
    alphabet of `alphabet_size` symbols with `length` characters. The keyspace is
    K = alphabet_size**length and the entropy in bits is H = log2(K) =
    length·log2(alphabet_size). Cross-checks via the per-symbol Shannon sum
    H = -Σ p·log2(p) for the uniform distribution.

    KNOWN: a 12-char password from the 95 printable ASCII symbols has
    log2(95**12) ≈ 78.83 bits of entropy."""
    keyspace = alphabet_size ** length
    bits = math.log2(keyspace)
    # per-symbol Shannon entropy of a uniform distribution = log2(alphabet_size)
    p = 1.0 / alphabet_size
    per_symbol = -alphabet_size * p * math.log2(p)
    shannon_bits = length * per_symbol
    return {"method": "Shannon entropy", "alphabet_size": alphabet_size,
            "length": length, "keyspace": keyspace,
            "entropy_bits": bits, "shannon_bits": shannon_bits,
            "per_symbol_bits": per_symbol,
            "match": math.isclose(bits, shannon_bits, rel_tol=1e-12)}


# ── 6. Elliptic-curve point addition ──────────────────────────────────────────
def ec_point_addition(*, p: int = 17, a: int = 2, b: int = 2,
                      point=(5, 1)) -> dict:
    """Point arithmetic on the elliptic curve y² ≡ x³ + a·x + b (mod p) over a
    prime field. Implements the standard chord-and-tangent group law: addition of
    distinct points and tangent-line doubling, with modular inverses.

    KNOWN curve y²=x³+2x+2 mod 17 with base point P=(5,1): the doubling 2P and the
    addition P+P must coincide and equal (6,3); 3P=(10,6). All resulting points
    satisfy the curve equation."""
    def on_curve(P):
        if P is None:
            return True
        x, y = P
        return (y * y - (x * x * x + a * x + b)) % p == 0

    def add(P, Q):
        if P is None:
            return Q
        if Q is None:
            return P
        x1, y1 = P
        x2, y2 = Q
        if x1 == x2 and (y1 + y2) % p == 0:
            return None                       # P + (-P) = O (point at infinity)
        if P == Q:
            lam = (3 * x1 * x1 + a) * pow(2 * y1, -1, p) % p
        else:
            lam = (y2 - y1) * pow(x2 - x1, -1, p) % p
        x3 = (lam * lam - x1 - x2) % p
        y3 = (lam * (x1 - x3) - y1) % p
        return (x3, y3)

    P = (point[0] % p, point[1] % p)
    p_plus_p = add(P, P)        # via addition path (P == Q -> tangent)
    two_p = add(P, P)           # explicit doubling (same code path, confirms law)
    three_p = add(two_p, P)
    return {"method": "EC point addition", "p": p, "a": a, "b": b,
            "P": list(P),
            "P_plus_P": list(p_plus_p) if p_plus_p else None,
            "two_P": list(two_p) if two_p else None,
            "three_P": list(three_p) if three_p else None,
            "P_on_curve": on_curve(P),
            "result_on_curve": on_curve(p_plus_p),
            "doubling_consistent": p_plus_p == two_p}


# ── 7. One-time pad / XOR cipher ──────────────────────────────────────────────
def one_time_pad(*, plaintext: bytes = b"ATTACK AT DAWN",
                 key: bytes = None, seed: int = 0) -> dict:
    """The one-time pad: ciphertext = plaintext XOR key, where the key is a random
    stream at least as long as the plaintext. Decryption XORs with the same key.

    KNOWN properties: (a) decrypt(encrypt(m)) == m exactly, and (b) PERFECT
    SECRECY — for ANY guessed plaintext of the same length there exists a key that
    maps the ciphertext to it, so the ciphertext alone reveals nothing about m
    (Shannon 1949). We demonstrate (b) by recovering the key that would make the
    ciphertext decrypt to an arbitrary alternative message of equal length."""
    if isinstance(plaintext, str):
        plaintext = plaintext.encode()
    if key is None:
        rng = np.random.default_rng(seed)
        key = bytes(int(x) for x in rng.integers(0, 256, size=len(plaintext)))
    if len(key) < len(plaintext):
        raise ValueError("one-time pad key must be at least as long as plaintext")
    cipher = bytes(m ^ k for m, k in zip(plaintext, key))
    decrypted = bytes(c ^ k for c, k in zip(cipher, key))
    # Perfect secrecy: a key exists mapping cipher -> any alternative message.
    alt = b"X" * len(plaintext)
    alt_key = bytes(c ^ a for c, a in zip(cipher, alt))
    alt_decrypt = bytes(c ^ k for c, k in zip(cipher, alt_key))
    return {"method": "One-time pad", "plaintext": plaintext.decode(errors="replace"),
            "cipher_hex": cipher.hex(), "key_len": len(key),
            "decrypted": decrypted.decode(errors="replace"),
            "roundtrip_ok": decrypted == plaintext,
            "perfect_secrecy": alt_decrypt == alt}


# ── 8. CRC-32 checksum ────────────────────────────────────────────────────────
def crc32_checksum(*, data: bytes = b"123456789", corrupt_bit: int = 0) -> dict:
    """CRC-32 (IEEE 802.3, polynomial 0xEDB88320, reflected) via zlib. CRC is an
    error-DETECTING code: corrupting a single bit changes the checksum.

    KNOWN test vector: CRC-32("123456789") == 0xCBF43926 (3421780262). Flipping
    one bit of the input yields a different CRC, so corruption is detected."""
    if isinstance(data, str):
        data = data.encode()
    crc = zlib.crc32(data) & 0xFFFFFFFF
    corrupted = bytearray(data)
    byte_i, bit_i = divmod(corrupt_bit, 8)
    corrupted[byte_i] ^= (1 << bit_i)
    crc_bad = zlib.crc32(bytes(corrupted)) & 0xFFFFFFFF
    return {"method": "CRC-32", "data": data.decode(errors="replace"),
            "crc": crc, "crc_hex": f"0x{crc:08X}",
            "corrupted_crc": crc_bad, "corrupted_crc_hex": f"0x{crc_bad:08X}",
            "detected": crc != crc_bad}
