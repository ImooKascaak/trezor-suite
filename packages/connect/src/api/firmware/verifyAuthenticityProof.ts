import * as crypto from 'crypto';
import { bufferUtils } from '@trezor/utils';

import { PROTO } from '../../constants';
import { AuthenticateDeviceResponse } from '../../types/api/authenticateDevice';

/**
 * Module used by `authenticateDevice` method.
 *
 * Purpose 1:
 * Parse x509 certificate returned from Trezor (PROTO.AuthenticityProof) from DER format.
 * inspired by https://blog.engelke.com/2014/10/21/web-crypto-and-x-509-certificates/
 *
 * Purpose 2:
 * Validate x509 certificate values.
 */

interface Asn1 {
    cls: number; // ASN.1 class of the object.
    tag: number; // ASN.1 object type.
    structured: boolean; // Structured objects are encoded ASN.1 objects. Other objects (primitive) values depends on the tag and class
    byteLength: number; // value size
    contents: Uint8Array; // byte array containing the object value.
    raw: Uint8Array; // original byte array
}

const derToAsn1 = (byteArray: Uint8Array): Asn1 => {
    let position = 0;

    function getTag() {
        let tag = byteArray[0] & 0x1f;
        position += 1;
        if (tag === 0x1f) {
            tag = 0;
            while (byteArray[position] >= 0x80) {
                tag = tag * 128 + byteArray[position] - 0x80;
                position += 1;
            }
            tag = tag * 128 + byteArray[position] - 0x80;
            position += 1;
        }
        return tag;
    }

    function getLength() {
        let length = 0;

        if (byteArray[position] < 0x80) {
            length = byteArray[position];
            position += 1;
        } else {
            const numberOfDigits = byteArray[position] & 0x7f;
            position += 1;
            length = 0;
            for (let i = 0; i < numberOfDigits; i++) {
                length = length * 256 + byteArray[position];
                position += 1;
            }
        }
        return length;
    }

    const cls = (byteArray[0] & 0xc0) / 64;
    const structured = (byteArray[0] & 0x20) === 0x20;
    const tag = getTag();

    let length = getLength(); // As encoded, which may be special value 0
    let byteLength;
    let contents;

    if (length === 0x80) {
        length = 0;
        while (byteArray[position + length] !== 0 || byteArray[position + length + 1] !== 0) {
            length += 1;
        }
        byteLength = position + length + 2;
        contents = byteArray.subarray(position, position + length);
    } else {
        byteLength = position + length;
        contents = byteArray.subarray(position, byteLength);
    }

    const raw = byteArray.subarray(0, byteLength); // May not be the whole input array

    return {
        cls,
        tag,
        structured,
        byteLength,
        contents,
        raw,
    };
};

const derToAsn1List = (byteArray: Uint8Array) => {
    const result = [];
    let nextPosition = 0;
    while (nextPosition < byteArray.length) {
        const nextPiece = derToAsn1(byteArray.subarray(nextPosition));
        result.push(nextPiece);
        nextPosition += nextPiece.byteLength;
    }
    return result;
};

const derBitStringValue = (byteArray: Uint8Array) => ({
    unusedBits: byteArray[0],
    bytes: byteArray.subarray(1),
});

const parseSignatureValue = (asn1: Asn1) => {
    if (asn1.cls !== 0 || asn1.tag !== 3 || asn1.structured) {
        throw new Error('Bad signature value. Not a BIT STRING.');
    }
    return {
        asn1,
        bits: derBitStringValue(asn1.contents),
    };
};

const derObjectIdentifierValue = (byteArray: Uint8Array) => {
    let oid = `${Math.floor(byteArray[0] / 40)}.${byteArray[0] % 40}`;
    let position = 1;
    while (position < byteArray.length) {
        let nextInteger = 0;
        while (byteArray[position] >= 0x80) {
            nextInteger = nextInteger * 0x80 + (byteArray[position] & 0x7f);
            position += 1;
        }
        nextInteger = nextInteger * 0x80 + byteArray[position];
        position += 1;
        oid += `.${nextInteger}`;
    }
    return oid;
};

/*
 * AlgorithmIdentifier ::= SEQUENCE {
 *   algorithm     OBJECT IDENTIFIER,
 *   parameters    ANY DEFINED BY algorithm OPTIONAL
 * }
 */
const parseAlgorithmIdentifier = (asn1: Asn1) => {
    if (asn1.cls !== 0 || asn1.tag !== 16 || !asn1.structured) {
        throw new Error('Bad algorithm identifier. Not a SEQUENCE.');
    }
    const pieces = derToAsn1List(asn1.contents);
    if (pieces.length > 2) {
        throw new Error('Bad algorithm identifier. Contains too many child objects.');
    }
    const encodedAlgorithm = pieces[0];
    if (encodedAlgorithm.cls !== 0 || encodedAlgorithm.tag !== 6 || encodedAlgorithm.structured) {
        throw new Error('Bad algorithm identifier. Does not begin with an OBJECT IDENTIFIER.');
    }
    const algorithm = derObjectIdentifierValue(encodedAlgorithm.contents);

    return {
        asn1,
        algorithm,
        parameters: pieces.length === 2 ? { asn1: pieces[1] } : null,
    };
};

/*
 * Name ::= SEQUENCE {
 *   algorithm     OBJECT IDENTIFIER,
 *   parameters    ANY DEFINED BY algorithm OPTIONAL
 * }
 */
export const parseName = (asn1: Asn1) =>
    // SEQUENCE > SET > SEQUENCE
    derToAsn1List(asn1.contents).map(item => {
        const attrSet = derToAsn1(item.contents);
        return parseAlgorithmIdentifier(attrSet);
    });

/*
 * SubjectPublicKeyInfo ::= SEQUENCE {
 *   algorithm            AlgorithmIdentifier,
 *   subjectPublicKey     BIT STRING
 * }
 */
const parseSubjectPublicKeyInfo = (asn1: Asn1) => {
    if (asn1.cls !== 0 || asn1.tag !== 16 || !asn1.structured) {
        throw new Error('Bad SPKI. Not a SEQUENCE.');
    }
    const pieces = derToAsn1List(asn1.contents);
    if (pieces.length !== 2) {
        throw new Error('Bad SubjectPublicKeyInfo. Wrong number of child objects.');
    }

    return {
        asn1,
        algorithm: parseAlgorithmIdentifier(pieces[0]),
        bits: derBitStringValue(pieces[1].contents),
    };
};

/*
 * TBSCertificate ::= SEQUENCE {
 *   version         [0]  EXPLICIT Version DEFAULT v1,
 *   serialNumber         CertificateSerialNumber,
 *   signature            AlgorithmIdentifier,
 *   issuer               Name[],
 *   validity             Validity,
 *   subject              Name[],
 *   subjectPublicKeyInfo SubjectPublicKeyInfo,
 *   issuerUniqueID  [1]  IMPLICIT UniqueIdentifier OPTIONAL,
 *   subjectUniqueID [2]  IMPLICIT UniqueIdentifier OPTIONAL,
 *   extensions      [3]  EXPLICIT Extensions OPTIONAL
 * }
 */
const parseTBSCertificate = (asn1: Asn1) => {
    if (asn1.cls !== 0 || asn1.tag !== 16 || !asn1.structured) {
        throw new Error("This can't be a TBSCertificate. Wrong data type.");
    }
    const pieces = derToAsn1List(asn1.contents);
    if (pieces.length < 7) {
        throw new Error('Bad TBS Certificate. There are fewer than the seven required children.');
    }

    return {
        asn1,
        version: pieces[0],
        serialNumber: pieces[1],
        signature: parseAlgorithmIdentifier(pieces[2]),
        issuer: pieces[3],
        validity: pieces[4],
        subject: parseName(pieces[5]),
        subjectPublicKeyInfo: parseSubjectPublicKeyInfo(pieces[6]),
        extensions: pieces[7],
    };
};

/*
 * Certificate ::= SEQUENCE {
 *   tbsCertificate       TBSCertificate,
 *   signatureAlgorithm   AlgorithmIdentifier,
 *   signatureValue       BIT STRING
 * }
 */
const parseCertificate = (byteArray: Uint8Array) => {
    const asn1 = derToAsn1(byteArray);
    if (asn1.cls !== 0 || asn1.tag !== 16 || !asn1.structured) {
        throw new Error("This can't be an X.509 certificate. Wrong data type.");
    }
    const pieces = derToAsn1List(asn1.contents);
    if (pieces.length !== 3) {
        throw new Error('Certificate contains more than the three specified children.');
    }

    return {
        asn1,
        tbsCertificate: parseTBSCertificate(pieces[0]),
        signatureAlgorithm: parseAlgorithmIdentifier(pieces[1]),
        signatureValue: parseSignatureValue(pieces[2]),
    };
};

// There is incomparability in results between nodejs and window SubtleCrypto api.
// window.crypto.subtle.importKey (CryptoKey) cannot be used by `crypto-browserify`.Verify
// The only common format of publicKey is PEM.
const verifySignature = async (rawKey: Buffer, data: Uint8Array, signature: Uint8Array) => {
    const signer = crypto.createVerify('sha256');
    signer.update(Buffer.from(data));

    // use native SubtleCrypto api.
    // Unfortunately `crypto-browserify`.subtle polyfill is missing so needs to be referenced directly from window object (if exists)
    // https://github.com/browserify/crypto-browserify/issues/221
    const SubtleCrypto = typeof window !== 'undefined' ? window.crypto.subtle : crypto.subtle;

    // get ECDSA P-256 (secp256r1) key from RAW key
    const ecPubKey = await SubtleCrypto.importKey(
        'raw',
        rawKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify'],
    );

    // export ECDSA key as spki
    const spkiPubKey = await SubtleCrypto.exportKey('spki', ecPubKey);

    // create PEM from spki
    const key = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(spkiPubKey).toString(
        'base64',
    )}\n-----END PUBLIC KEY-----`;

    // verify using PEM key
    return signer.verify({ key }, Buffer.from(signature));
};

interface AuthenticityProofData extends PROTO.AuthenticityProof {
    challenge: Buffer;
    rootPublicKeys: string[];
    deviceModel: keyof typeof PROTO.DeviceModelInternal; // Device.features.internal_model
}

export const getRandomChallenge = () => crypto.randomBytes(32);

export const verifyAuthenticityProof = async ({
    ca_certificate,
    device_certificate,
    signature,
    challenge,
    rootPublicKeys,
    deviceModel,
}: AuthenticityProofData): Promise<AuthenticateDeviceResponse> => {
    // 1. parse x509 CA certificate from AuthenticityProof
    const caCert = parseCertificate(new Uint8Array(Buffer.from(ca_certificate, 'hex')));

    // 2. parse x509 DEVICE certificate from AuthenticityProof
    const deviceCert = parseCertificate(new Uint8Array(Buffer.from(device_certificate, 'hex')));

    // 3. validate that CA certificate was created using one of rootPubkeys
    const isCertSignedByRootPubkey = await Promise.all(
        rootPublicKeys.map(rootPubKey =>
            verifySignature(
                Buffer.from(rootPubKey, 'hex'),
                caCert.tbsCertificate.asn1.raw,
                caCert.signatureValue.bits.bytes,
            ),
        ),
    );

    const isCaCertValid = isCertSignedByRootPubkey.some(r => !!r);
    if (!isCaCertValid) {
        // there is a possibility that rootPubKeys list is outdated, check if caCertificate is created earlier
        // TODO
    }

    // 4. validate DEVICE certificate subject (Trezor features internal_model)
    const [subject] = deviceCert.tbsCertificate.subject;
    if (!subject.parameters || subject.algorithm !== '2.5.4.3') {
        throw new Error('Missing certificate subject');
    }
    // slice 4 bytes from the subject (internal model)
    const subjectValue = Buffer.from(subject.parameters.asn1.contents.subarray(0, 4)).toString();
    if (subjectValue !== deviceModel) {
        return {
            valid: false,
            error: 'INVALID_DEVICE_MODEL',
        };
    }

    // 5. validate that DEVICE certificate was created using pubKey from CA certificate
    const isDeviceCertValid = await verifySignature(
        Buffer.from(caCert.tbsCertificate.subjectPublicKeyInfo.bits.bytes),
        deviceCert.tbsCertificate.asn1.raw,
        deviceCert.signatureValue.bits.bytes,
    );

    // 6. validate that the signature from AuthenticityProof was created using prefixed challenge **and** DEVICE certificate pubKey
    const challengePrefix = Buffer.from('AuthenticateDevice:');
    const prefixedChallenge = Buffer.concat([
        bufferUtils.getChunkSize(challengePrefix.length),
        challengePrefix,
        bufferUtils.getChunkSize(challenge.length),
        challenge,
    ]);
    const isSignatureValid = await verifySignature(
        Buffer.from(deviceCert.tbsCertificate.subjectPublicKeyInfo.bits.bytes),
        prefixedChallenge,
        Buffer.from(signature, 'hex'),
    );

    if (isCaCertValid && isDeviceCertValid && isSignatureValid) {
        return {
            valid: true,
            caPubKey: Buffer.from(caCert.tbsCertificate.subjectPublicKeyInfo.bits.bytes).toString(
                'hex',
            ),
        };
    }
    if (!isCaCertValid) {
        return {
            valid: false,
            error: 'INVALID_CA_CERTIFICATE',
        };
    }
    if (!isDeviceCertValid) {
        return {
            valid: false,
            error: 'INVALID_DEVICE_CERTIFICATE',
        };
    }

    return {
        valid: false,
        error: 'INVALID_DEVICE_SIGNATURE',
    };
};
