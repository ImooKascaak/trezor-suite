import { AbstractMethod } from '../core/AbstractMethod';
import { validateParams } from './common/paramsValidator';
import { AuthenticateDeviceParams } from '../types/api/authenticateDevice';
import { getRandomChallenge, verifyAuthenticityProof } from './firmware/verifyAuthenticityProof';

export default class AuthenticateDevice extends AbstractMethod<
    'authenticateDevice',
    AuthenticateDeviceParams
> {
    init() {
        this.useEmptyPassphrase = true;
        this.requiredPermissions = ['management'];
        this.useDeviceState = false;

        const { payload } = this;

        // TODO validate firmware/model version

        validateParams(payload, [
            { name: 'blacklistedCaPubkeys', type: 'array', allowEmpty: true },
        ]);

        this.params = {
            blacklistedCaPubkeys: payload.blacklistedCaPubkeys,
        };
    }

    async run() {
        const challenge = getRandomChallenge();

        const { message } = await this.device
            .getCommands()
            .typedCall('AuthenticateDevice', 'AuthenticityProof', {
                challenge: challenge.toString('hex'),
            });

        const rootPublicKeys = [
            '04626d58aca84f0fcb52ea63f0eb08de1067b8d406574a715d5e7928f4b67f113a00fb5c5918e74d2327311946c446b242c20fe7347482999bdc1e229b94e27d96',
        ];
        const valid = await verifyAuthenticityProof({
            ...message,
            challenge,
            rootPublicKeys,
            deviceModel: this.device.features.internal_model,
        });

        return valid;
    }
}
