/* eslint-disable import/no-named-as-default */

import TrezorConnect from '../../../src';

const { getController, setup, initTrezorConnect } = global.Trezor;

const controller = getController();

describe('TrezorConnect.authenticateDevice', () => {
    beforeAll(async () => {
        await setup(controller, {
            mnemonic: 'mnemonic_all',
        });
        await initTrezorConnect(controller);
    });

    afterAll(async () => {
        controller.dispose();
        await TrezorConnect.dispose();
    });

    it('validation successful', async () => {
        const result = await TrezorConnect.authenticateDevice({});

        if (result.success) {
            expect(typeof result.payload.valid).toEqual(true);
            // expect(typeof result.payload.caPubKey).toEqual('string');
        }
    });
});
