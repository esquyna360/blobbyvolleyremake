import {
  fromJson,
  genId,
  getRelays,
  hashWith,
  libName,
  makeSocket,
  selfId,
  socketGetter,
  strToNum,
  strategy_default,
  toHex,
  toJson
} from "./chunk-XDJLQOG3.js";

// web/node_modules/.pnpm/@noble+secp256k1@3.2.0/node_modules/@noble/secp256k1/index.js
var freeze = Object.freeze;
var P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
var N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
var Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
var Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;
var secp256k1_CURVE = freeze({
  p: P,
  n: N,
  h: 1n,
  a: 0n,
  b: 7n,
  Gx,
  Gy
});
var L = 32;
var isBytes = (a) => {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && a.BYTES_PER_ELEMENT === 1;
};
var abytes = (value, length, title = "") => {
  if (isBytes(value) && (length === void 0 || value.length === length))
    return value;
  const bytes = isBytes(value);
  const ofLen = length !== void 0 ? ` of length ${length}` : "";
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
  const message = (title ? `"${title}" ` : "") + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes)
    throw new TypeError(message);
  throw new RangeError(message);
};
var cloneBytes = (value) => Uint8Array.from(value);
var snapshotBytes = (value, title, length) => cloneBytes(abytes(value, length, title));
var padh = (n, pad) => n.toString(16).padStart(pad, "0");
var bytesToHex = (bytes) => {
  let hex = "";
  for (const byte of abytes(bytes))
    hex += padh(byte, 2);
  return hex;
};
var hexToBytes = (hex) => {
  const e = "hex invalid";
  if (typeof hex !== "string")
    throw new TypeError(e);
  if (hex.length % 2 || !/^[\da-f]*$/i.test(hex))
    throw new RangeError(e);
  const array = new Uint8Array(hex.length / 2);
  for (let ai = 0, hi = 0; ai < array.length; ai++, hi += 2) {
    const n1 = hex.charCodeAt(hi);
    const n2 = hex.charCodeAt(hi + 1);
    array[ai] = ((n1 & 15) + (n1 >> 6) * 9) * 16 + (n2 & 15) + (n2 >> 6) * 9;
  }
  return array;
};
var subtle = () => {
  const s = globalThis?.crypto?.subtle;
  if (s)
    return s;
  throw new Error("crypto.subtle must be defined, consider polyfill");
};
var concatBytes = (...arrays) => {
  let sum = 0;
  for (const a of arrays)
    sum += abytes(a).length;
  const res = new Uint8Array(sum);
  let pad = 0;
  for (const a of arrays) {
    res.set(a, pad);
    pad += a.length;
  }
  return res;
};
var randomBytes = (len = L) => {
  const c = globalThis?.crypto;
  if (typeof c?.getRandomValues !== "function")
    throw new Error("crypto.getRandomValues must be defined, consider polyfill");
  return c.getRandomValues(new Uint8Array(len));
};
var big = BigInt;
var arange = (n, min, max, msg = "bad number: out of range") => {
  if (typeof n !== "bigint")
    throw new TypeError(msg);
  if (min <= n && n < max)
    return n;
  throw new RangeError(msg);
};
var M = (a, b = P) => (a %= b) >= 0n ? a : b + a;
var modN = (a) => M(a, N);
var invert = (number, modulo) => {
  if (number === 0n)
    throw new Error("invert: expected non-zero number");
  if (modulo <= 1n)
    throw new Error("invert: expected modulus > 1, got " + modulo);
  let a = M(number, modulo);
  let b = modulo;
  let x = 0n, u = 1n;
  while (a !== 0n) {
    const q = b / a;
    const r = b - a * q;
    const m = x - u * q;
    b = a, a = r, x = u, u = m;
  }
  const gcd = b;
  if (gcd !== 1n)
    throw new Error("invert: does not exist");
  return M(x, modulo);
};
var _hash = (name) => {
  const fn = hashes[name];
  if (typeof fn !== "function")
    throw new Error("hashes." + name + " not set");
  return fn;
};
var callHash = (name, a, b) => abytes(_hash(name)(a, b), L, "digest");
var callHashAsync = async (name, a, b) => abytes(await _hash(name)(a, b), L, "digest");
var apoint = (p) => {
  if (p instanceof Point)
    return p;
  throw new TypeError("Point expected");
};
var E_BADPOINT = "bad point: not on curve";
var koblitz = (x) => M(M(x * x) * x + 7n);
var FpIsValid = (n) => arange(n, 0n, P);
var FpIsValidNot0 = (n) => arange(n, 1n, P);
var FnIsValidNot0 = (n) => arange(n, 1n, N);
var isEven = (y) => !(y & 1n);
var getPrefix = (y) => Uint8Array.of(isEven(y) ? 2 : 3);
var lift_x = (x) => {
  const c = koblitz(FpIsValidNot0(x));
  let r = 1n;
  for (let num = c, e = (P + 1n) / 4n; e > 0n; e >>= 1n) {
    if (e & 1n)
      r = r * num % P;
    num = num * num % P;
  }
  if (M(r * r) !== c)
    throw new Error("sqrt invalid");
  return new Point(x, isEven(r) ? r : M(-r), 1n);
};
var Point = class _Point {
  static BASE;
  static ZERO;
  X;
  Y;
  Z;
  constructor(X, Y, Z) {
    this.X = FpIsValid(X);
    this.Y = FpIsValidNot0(Y);
    this.Z = FpIsValid(Z);
    freeze(this);
  }
  /** Returns the shared curve metadata object by reference.
   * It is readonly only at type level, and mutating it won't retarget arithmetic,
   * which already uses module-load snapshots. */
  static CURVE() {
    return secp256k1_CURVE;
  }
  /** Create 3d xyz point from 2d xy. (0, 0) => (0, 1, 0), not (0, 0, 1) */
  static fromAffine(ap) {
    const { x, y } = ap;
    return x === 0n && y === 0n ? I : new _Point(x, y, 1n);
  }
  /** Convert Uint8Array or hex string to Point. */
  static fromBytes(bytes) {
    abytes(bytes);
    const length = bytes.length;
    const head = bytes[0];
    const x = sliceBytesNumBE(bytes, 1, 33);
    try {
      if (length === 33 && (head === 2 || head === 3)) {
        const p = lift_x(x);
        return head === 3 ? p.negate() : p;
      }
      if (length === 65 && head === 4)
        return new _Point(x, sliceBytesNumBE(bytes, 33, 65), 1n).assertValidity();
    } catch (error) {
      throw new Error(E_BADPOINT);
    }
    throw new Error(E_BADPOINT);
  }
  static fromHex(hex) {
    return _Point.fromBytes(hexToBytes(hex));
  }
  get x() {
    return this.toAffine().x;
  }
  get y() {
    return this.toAffine().y;
  }
  /** Equality check: compare points P&Q. */
  equals(other) {
    const { X: X1, Y: Y1, Z: Z1 } = this;
    const { X: X2, Y: Y2, Z: Z2 } = apoint(other);
    return M(X1 * Z2) === M(X2 * Z1) && M(Y1 * Z2) === M(Y2 * Z1);
  }
  is0() {
    return this.Z === 0n;
  }
  /** Flip point over y coordinate. */
  negate() {
    return new _Point(this.X, M(-this.Y), this.Z);
  }
  /** Point doubling: P+P, complete formula. */
  double() {
    return this.add(this);
  }
  /**
   * Point addition: P+Q, complete, exception-free formula
   * (Renes-Costello-Batina, algo 1 of [2015/1060](https://eprint.iacr.org/2015/1060)).
   * Cost: `12M + 0S + 3*a + 3*b3 + 23add`.
   */
  // prettier-ignore
  add(other) {
    const { X: X1, Y: Y1, Z: Z1 } = this;
    const { X: X2, Y: Y2, Z: Z2 } = apoint(other);
    const a = 0n;
    const b = 7n;
    let X3 = 0n, Y3 = 0n, Z3 = 0n;
    const b3 = M(b * 3n);
    let t0 = M(X1 * X2), t1 = M(Y1 * Y2), t2 = M(Z1 * Z2), t3 = M(X1 + Y1);
    let t4 = M(X2 + Y2);
    t3 = M(t3 * t4);
    t4 = M(t0 + t1);
    t3 = M(t3 - t4);
    t4 = M(X1 + Z1);
    let t5 = M(X2 + Z2);
    t4 = M(t4 * t5);
    t5 = M(t0 + t2);
    t4 = M(t4 - t5);
    t5 = M(Y1 + Z1);
    X3 = M(Y2 + Z2);
    t5 = M(t5 * X3);
    X3 = M(t1 + t2);
    t5 = M(t5 - X3);
    Z3 = M(a * t4);
    X3 = M(b3 * t2);
    Z3 = M(X3 + Z3);
    X3 = M(t1 - Z3);
    Z3 = M(t1 + Z3);
    Y3 = M(X3 * Z3);
    t1 = M(t0 + t0);
    t1 = M(t1 + t0);
    t2 = M(a * t2);
    t4 = M(b3 * t4);
    t1 = M(t1 + t2);
    t2 = M(t0 - t2);
    t2 = M(a * t2);
    t4 = M(t4 + t2);
    t0 = M(t1 * t4);
    Y3 = M(Y3 + t0);
    t0 = M(t5 * t4);
    X3 = M(t3 * X3);
    X3 = M(X3 - t0);
    t0 = M(t3 * t1);
    Z3 = M(t5 * Z3);
    Z3 = M(Z3 + t0);
    return new _Point(X3, Y3, Z3);
  }
  subtract(other) {
    return this.add(apoint(other).negate());
  }
  /**
   * Point-by-scalar multiplication. Scalar must be in range 1 <= n < CURVE.n.
   * Uses {@link wNAF} for base point.
   * Uses fake point to mitigate leakage shape in JS, not as a hard constant-time guarantee.
   * @param n scalar by which point is multiplied
   * @param safe safe mode guards against timing attacks; unsafe mode is faster
   */
  multiply(n, safe = true) {
    if (!safe && n === 0n)
      return I;
    FnIsValidNot0(n);
    if (n === 1n)
      return this;
    if (this.equals(G))
      return wNAF(n).p;
    let p = I;
    let f = G;
    let d = this;
    for (let i = 0; safe ? i < 256 : n > 0n; i++) {
      if (n & 1n)
        p = p.add(d);
      else if (safe)
        f = f.add(d);
      d = d.double();
      n >>= 1n;
    }
    return p;
  }
  multiplyUnsafe(scalar) {
    return this.multiply(scalar, false);
  }
  /** Convert point to 2d xy affine point. (X, Y, Z) ∋ (x=X/Z, y=Y/Z) */
  toAffine() {
    const { X: x, Y: y, Z: z } = this;
    if (z === 0n)
      return { x: 0n, y: 0n };
    if (z === 1n)
      return { x, y };
    const iz = invert(z, P);
    if (M(z * iz) !== 1n)
      throw new Error("inverse invalid");
    return { x: M(x * iz), y: M(y * iz) };
  }
  /** Checks if the point is valid and on-curve. */
  assertValidity() {
    const { x, y } = this.toAffine();
    FpIsValidNot0(x);
    FpIsValidNot0(y);
    if (M(y * y) !== koblitz(x))
      throw new Error(E_BADPOINT);
    return this;
  }
  /** Converts point to 33/65-byte Uint8Array. */
  toBytes(isCompressed = true) {
    const { x, y } = this.assertValidity().toAffine();
    const x32b = numTo32b(x);
    if (isCompressed)
      return concatBytes(getPrefix(y), x32b);
    return concatBytes(Uint8Array.of(4), x32b, numTo32b(y));
  }
  toHex(isCompressed) {
    return bytesToHex(this.toBytes(isCompressed));
  }
};
var G = new Point(Gx, Gy, 1n);
var I = new Point(0n, 1n, 0n);
Point.BASE = G;
Point.ZERO = I;
var doubleScalarMulUns = (R, u1, u2) => {
  return G.multiply(u1, false).add(R.multiply(u2, false)).assertValidity();
};
var bytesToNumBE = (b) => big("0x" + (bytesToHex(b) || "0"));
var sliceBytesNumBE = (b, from, to) => bytesToNumBE(b.subarray(from, to));
var numTo32b = (num) => hexToBytes(padh(arange(num, 0n, 2n ** 256n), L * 2));
var secretKeyToScalar = (secretKey2) => {
  const num = bytesToNumBE(abytes(secretKey2, L, "secret key"));
  return arange(num, 1n, N, "invalid secret key: outside of range");
};
var getPublicKey = (privKey, isCompressed = true) => {
  return G.multiply(secretKeyToScalar(privKey)).toBytes(isCompressed);
};
var isValidSecretKey = (secretKey2) => {
  try {
    return !!secretKeyToScalar(secretKey2);
  } catch (error) {
    return false;
  }
};
var isValidPublicKey = (publicKey2, isCompressed) => {
  try {
    const l = publicKey2.length;
    if (isCompressed === true && l !== 33)
      return false;
    if (isCompressed === false && l !== 65)
      return false;
    return !!Point.fromBytes(publicKey2);
  } catch (error) {
    return false;
  }
};
var _sha = "SHA-256";
var hashes = {
  hmacSha256Async: async (key, message) => {
    const s = subtle();
    const k = await s.importKey("raw", key, { name: "HMAC", hash: _sha }, false, ["sign"]);
    return new Uint8Array(await s.sign("HMAC", k, message));
  },
  hmacSha256: void 0,
  sha256Async: async (msg) => new Uint8Array(await subtle().digest(_sha, msg)),
  sha256: void 0
};
var NULL = new Uint8Array(0);
var byte0 = Uint8Array.of(0);
var byte1 = Uint8Array.of(1);
var randomSecretKey = (seed) => {
  seed = seed === void 0 ? randomBytes(48) : seed;
  abytes(seed);
  if (seed.length < 48 || seed.length > 1024)
    throw new RangeError("expected 48-1024b");
  const num = M(bytesToNumBE(seed), N - 1n);
  return numTo32b(num + 1n);
};
var createKeygen = (getPublicKey2) => (seed) => {
  const secretKey2 = randomSecretKey(seed);
  return { secretKey: secretKey2, publicKey: getPublicKey2(secretKey2) };
};
var keygen = createKeygen(getPublicKey);
var etc = freeze({
  hexToBytes,
  bytesToHex,
  concatBytes,
  bytesToNumberBE: bytesToNumBE,
  numberToBytesBE: numTo32b,
  mod: M,
  invert,
  randomBytes,
  secretKeyToScalar,
  abytes
});
var utils = freeze({
  isValidSecretKey,
  isValidPublicKey,
  randomSecretKey
});
var getTag = (tag2) => Uint8Array.from("BIP0340/" + tag2, (c) => c.charCodeAt(0));
var taggedHash = (tag2, ...messages) => {
  const tagH = callHash("sha256", getTag(tag2));
  return callHash("sha256", concatBytes(tagH, tagH, ...messages));
};
var taggedHashAsync = (tag2, ...messages) => callHashAsync("sha256Async", getTag(tag2)).then((tagH) => callHashAsync("sha256Async", concatBytes(tagH, tagH, ...messages)));
var extpubSchnorr = (priv) => {
  const d_ = secretKeyToScalar(priv);
  const p = G.multiply(d_);
  const { x, y } = p.assertValidity().toAffine();
  const d = isEven(y) ? d_ : modN(-d_);
  const px = numTo32b(x);
  return { d, px };
};
var bytesModN = (bytes) => modN(bytesToNumBE(bytes));
var challenge = (...args) => bytesModN(taggedHash("challenge", ...args));
var challengeAsync = async (...args) => bytesModN(await taggedHashAsync("challenge", ...args));
var pubSchnorr = (secretKey2) => {
  return extpubSchnorr(secretKey2).px;
};
var keygenSchnorr = createKeygen(pubSchnorr);
var prepSigSchnorr = (message, secretKey2, auxRand) => {
  const m = snapshotBytes(message, "message");
  const { px, d } = extpubSchnorr(secretKey2);
  return { m, px, d, a: abytes(auxRand, L) };
};
var extractK = (rand) => {
  const k_ = bytesModN(rand);
  if (k_ === 0n)
    throw new Error("sign failed: k is zero");
  const { px, d } = extpubSchnorr(numTo32b(k_));
  return { rx: px, k: d };
};
var createSigSchnorr = (k, px, e, d) => {
  return concatBytes(px, numTo32b(modN(k + e * d)));
};
var E_INVSIG = "invalid signature produced";
var signSchnorr = (message, secretKey2, auxRand = randomBytes(L)) => {
  const { m, px, d, a } = prepSigSchnorr(message, secretKey2, auxRand);
  const t = numTo32b(d ^ bytesToNumBE(taggedHash("aux", a)));
  const { rx, k } = extractK(taggedHash("nonce", t, px, m));
  const sig = createSigSchnorr(k, rx, challenge(rx, px, m), d);
  if (!verifySchnorr(sig, m, px))
    throw new Error(E_INVSIG);
  return sig;
};
var signSchnorrAsync = async (message, secretKey2, auxRand = randomBytes(L)) => {
  const { m, px, d, a } = prepSigSchnorr(message, secretKey2, auxRand);
  const t = numTo32b(d ^ bytesToNumBE(await taggedHashAsync("aux", a)));
  const { rx, k } = extractK(await taggedHashAsync("nonce", t, px, m));
  const sig = createSigSchnorr(k, rx, await challengeAsync(rx, px, m), d);
  if (!await verifySchnorrAsync(sig, m, px))
    throw new Error(E_INVSIG);
  return sig;
};
var callSyncAsyncFn = (res, later) => {
  return res instanceof Promise ? res.then(later) : later(res);
};
var _verifSchnorr = (signature, message, publicKey2, challengeFn) => {
  const sig = abytes(signature, 64, "signature");
  const msg = abytes(message, void 0, "message");
  const pub = abytes(publicKey2, L, "publicKey");
  let P_;
  let r;
  let s;
  let chalInput;
  try {
    const x = bytesToNumBE(pub);
    P_ = lift_x(x);
    r = FpIsValidNot0(sliceBytesNumBE(sig, 0, L));
    s = FnIsValidNot0(sliceBytesNumBE(sig, L, 64));
    chalInput = concatBytes(numTo32b(r), pub, msg);
  } catch (error) {
    return false;
  }
  return callSyncAsyncFn(challengeFn(chalInput), (e) => {
    try {
      const { x, y } = doubleScalarMulUns(P_, s, modN(-e)).toAffine();
      if (!isEven(y) || x !== r)
        return false;
      return true;
    } catch (error) {
      return false;
    }
  });
};
var verifySchnorr = (s, m, p) => _verifSchnorr(s, m, p, challenge);
var verifySchnorrAsync = async (s, m, p) => _verifSchnorr(s, m, p, challengeAsync);
var schnorr = freeze({
  keygen: keygenSchnorr,
  getPublicKey: pubSchnorr,
  sign: signSchnorr,
  verify: verifySchnorr,
  signAsync: signSchnorrAsync,
  verifyAsync: verifySchnorrAsync
});
var precompute = () => {
  const points = [];
  let p = G;
  let b = p;
  for (let w = 0; w < 33; w++) {
    b = p;
    points.push(b);
    for (let i = 1; i < 128; i++) {
      b = b.add(p);
      points.push(b);
    }
    p = b.double();
  }
  return points;
};
var Gpows = void 0;
var ctneg = (cnd, p) => {
  const n = p.negate();
  return cnd ? n : p;
};
var wNAF = (n) => {
  const comp = Gpows || (Gpows = precompute());
  let p = I;
  let f = G;
  for (let w = 0; w < 33; w++) {
    let wbits = Number(n & 255n);
    n >>= 8n;
    if (wbits > 128) {
      wbits -= 256;
      n += 1n;
    }
    const off = w * 128;
    const offP = off + Math.abs(wbits) - 1;
    const isOddW = w % 2 !== 0;
    const isNeg = wbits < 0;
    if (wbits === 0) {
      f = f.add(ctneg(isOddW, comp[off]));
    } else {
      p = p.add(ctneg(isNeg, comp[offP]));
    }
  }
  if (n !== 0n)
    throw new Error("invalid wnaf");
  return { p, f };
};
var __TEST = freeze({
  // Shared tests expect the BIP340 helper to expose the canonical even-y point, not just the root.
  lift_x,
  extractK
});

// web/node_modules/.pnpm/trystero@0.21.8_patch_hash=0f996a67be939374c9fb8781108d984800a87165aa5490f6091c582d151f_286f6546a6b71589aa8b66317ea7a1bd/node_modules/trystero/src/nostr.js
var clients = {};
var defaultRedundancy = 5;
var tag = "x";
var eventMsgType = "EVENT";
var { secretKey, publicKey } = schnorr.keygen();
var pubkey = toHex(publicKey);
var subIdToTopic = {};
var msgHandlers = {};
var kindCache = {};
var now = () => Math.floor(Date.now() / 1e3);
var topicToKind = (topic) => kindCache[topic] ??= strToNum(topic, 1e4) + 2e4;
var createEvent = async (topic, content) => {
  const payload = {
    kind: topicToKind(topic),
    tags: [[tag, topic]],
    created_at: now(),
    content,
    pubkey
  };
  const id = await hashWith(
    "SHA-256",
    toJson([
      0,
      payload.pubkey,
      payload.created_at,
      payload.kind,
      payload.tags,
      payload.content
    ])
  );
  return toJson([
    eventMsgType,
    {
      ...payload,
      id: toHex(id),
      sig: toHex(await schnorr.signAsync(id, secretKey))
    }
  ]);
};
var subscribe = (subId, topic) => {
  subIdToTopic[subId] = topic;
  return toJson([
    "REQ",
    subId,
    {
      kinds: [topicToKind(topic)],
      since: now(),
      ["#" + tag]: [topic]
    }
  ]);
};
var unsubscribe = (subId) => {
  delete subIdToTopic[subId];
  return toJson(["CLOSE", subId]);
};
var joinRoom = strategy_default({
  init: (config) => getRelays(config, defaultRelayUrls, defaultRedundancy, true).map((url) => {
    const client = makeSocket(url, (data) => {
      const [msgType, subId, payload, relayMsg] = fromJson(data);
      if (msgType !== eventMsgType) {
        const prefix = `${libName}: relay failure from ${client.url} - `;
        if (msgType === "NOTICE") {
          console.warn(prefix + subId);
        } else if (msgType === "OK" && !payload) {
          console.warn(prefix + relayMsg);
        }
        return;
      }
      msgHandlers[subId]?.(subIdToTopic[subId], payload.content);
    });
    clients[url] = client;
    return client.ready;
  }),
  subscribe: (client, rootTopic, selfTopic, onMessage) => {
    const rootSubId = genId(64);
    const selfSubId = genId(64);
    msgHandlers[rootSubId] = msgHandlers[selfSubId] = (topic, data) => onMessage(
      topic,
      data,
      async (peerTopic, signal) => client.send(await createEvent(peerTopic, signal))
    );
    client.send(subscribe(rootSubId, rootTopic));
    client.send(subscribe(selfSubId, selfTopic));
    return () => {
      client.send(unsubscribe(rootSubId));
      client.send(unsubscribe(selfSubId));
      delete msgHandlers[rootSubId];
      delete msgHandlers[selfSubId];
    };
  },
  announce: async (client, rootTopic) => client.send(await createEvent(rootTopic, toJson({ peerId: selfId })))
});
var getRelaySockets = socketGetter(clients);
var defaultRelayUrls = [
  "black.nostrcity.club",
  "ftp.halifax.rwth-aachen.de/nostr",
  "nos.lol",
  "nostr.cool110.xyz",
  "nostr.data.haus",
  "nostr.sathoarder.com",
  "nostr.vulpem.com",
  "relay.agorist.space",
  "relay.binaryrobot.com",
  "relay.damus.io",
  "relay.fountain.fm",
  "relay.mostro.network",
  "relay.nostraddress.com",
  "relay.nostrdice.com",
  "relay.nostromo.social",
  "relay.oldenburg.cool",
  "relay.verified-nostr.com",
  "yabu.me/v2"
].map((url) => "wss://" + url);
export {
  createEvent,
  defaultRelayUrls,
  getRelaySockets,
  joinRoom,
  selfId,
  subscribe
};
//# sourceMappingURL=trystero_nostr.js.map
