/*
base64 of trezor logo 800x205px. png. (from wallet)
 */
const trezorLogo =
    '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';

export { trezorLogo };
