import type { Params, Response } from '../params';

export interface AuthenticateDeviceParams {
    blacklistedCaPubkeys?: string[];
}

export type AuthenticateDeviceResponse =
    | {
          valid: true;
          caPubKey: string;
          error?: typeof undefined;
      }
    | {
          valid: false;
          caPubKey?: typeof undefined;
          error:
              | 'OUTDATED_ROOT_PUBKEY'
              | 'INVALID_CA_CERTIFICATE'
              | 'INVALID_DEVICE_MODEL'
              | 'INVALID_DEVICE_CERTIFICATE'
              | 'INVALID_DEVICE_SIGNATURE';
      };

export declare function authenticateDevice(
    params: Params<AuthenticateDeviceParams>,
): Response<AuthenticateDeviceResponse>;
