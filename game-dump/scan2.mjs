import fs from "node:fs";
const root = "C:/Users/Ricairo/Desktop/栀子花/game-dump/";
const f = root + "libUE4-arm64.so";
const buf = fs.readFileSync(f);
console.log(`libUE4-arm64.so  ${(buf.length/1048576).toFixed(1)} MB`);
const text = buf.toString("latin1");
const patterns = [
  ["XXTEA/TEA", /(xxtea|XXTEA|tea_encrypt|tea_decrypt|TeaEncrypt|TeaDecrypt)/g],
  ["AES", /(AES_encrypt|AES_decrypt|aes_encrypt|aes_decrypt|rijndael|Rijndael|AES_cbc|AES_ecb)/g],
  ["RC4/ChaCha", /(RC4_|rc4_|ChaCha|chacha20)/g],
  ["通用加解密", /(EncryptData|DecryptData|EncryptString|DecryptString|::Encrypt|::Decrypt|EncryptBuffer|DecryptBuffer|cryptMsg|CryptMsg)/g],
  ["TLS 栈", /(SSL_CTX_new|mbedtls_ssl|BoringSSL|ssl3_|tls1_)/g],
  ["protobuf", /(google::protobuf|pb_descriptor|__PPBIO_Unmarshal|__pb_)/g],
  ["acoral 协议", /(acoral|Acoral|ACORAL)/g],
  ["发包/收包", /(SendPacket|RecvPacket|OnRecvPacket|PacketHandler|SerializePacket|NetPacket)/g],
];
for (const [label, re] of patterns) {
  const seen = new Map();
  let total = 0, m;
  while ((m = re.exec(text)) !== null) {
    total++;
    if (seen.size < 8) seen.set(m[1], true);
  }
  console.log(`  ${label.padEnd(12)} ${String(total).padStart(7)}   ${[...seen.keys()].join(", ")}`);
}

