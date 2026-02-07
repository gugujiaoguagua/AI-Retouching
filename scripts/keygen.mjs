import nacl from 'tweetnacl';

function b64u(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

const kp = nacl.sign.keyPair();
console.log('PUBLIC=' + b64u(kp.publicKey));
console.log('PRIVATE=' + b64u(kp.secretKey));
