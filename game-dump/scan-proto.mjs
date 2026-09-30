import fs from "node:fs";
const files = ["libUE4.so", "lua.cat"];
const patterns = [
  ["加密/解密", /(xxtea|XXTEA|Rijndael|AES_|aes_encrypt|RC4|rc4_|ChaCha|chacha|blowfish|TEA_|tea_encrypt|EncryptData|DecryptData|EncryptString|DecryptString)/],
  ["TLS/SSL", /(openssl|SSL_|mbedtls|BoringSSL|X509_|ssl_write|tls_)/],
  ["网络层", /(PacketHandler|NetDriver|NetConnection|MessageHandler|ProtoBuf|protobuf|SerializeMessage|SendPacket|RecvPacket)/],
  ["自研协议", /(lzkp|Lzkp|grc_|Grc|Acoral|acoral|zulong|Zulong)/],
  ["压缩", /(zlib|inflate|deflate|zstd|lz4|snappy)/],
];
for (const f of files) {
  let buf;
  try { buf = fs.readFileSync(f); } catch (e) { console.log(`SKIP ${f}`); continue; }
  console.log(`\n########## ${f} (${(buf.length/1048576).toFixed(1)} MB) ##########`);
  const text = buf.toString("latin1");
  for (const [label, re] of patterns) {
    const g = new RegExp(re.source, "gi");
    const samples = new Map();
    let total = 0, m;
    while ((m = g.exec(text)) !== null) {
      total++;
      if (samples.size < 6) samples.set(m[1], true);
      if (total > 400000) break;
    }
    console.log(`  ${label.padEnd(10)} 命中 ${String(total).padStart(7)}   ${[...samples.keys()].join(", ")}`);
  }
}
