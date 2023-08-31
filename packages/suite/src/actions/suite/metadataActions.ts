/* eslint @typescript-eslint/no-use-before-define: 1 */

import TrezorConnect from '@trezor/connect';
import { analytics, EventType } from '@trezor/suite-analytics';
import {
    createDeferred,
    promiseAllSequence,
    getWeakRandomId,
    getRandomNumberInRange,
    arrayPartition,
    cloneObject,
} from '@trezor/utils';
import { MetadataState } from '@suite-common/metadata-types';

import { METADATA } from 'src/actions/suite/constants';
import { Dispatch, GetState, TrezorDevice } from 'src/types/suite';
import {
    MetadataProviderType,
    MetadataProvider,
    MetadataAddPayload,
    Tokens,
    DeviceMetadata,
    Error as MetadataProviderError,
    OAuthServerEnvironment,
    ProviderErrorAction,
    Labels,
    DataType,
    MetadataEncryptionVersion,
    WalletLabels,
    AccountLabels,
} from 'src/types/suite/metadata';
import { Account } from 'src/types/wallet';
import * as metadataUtils from 'src/utils/suite/metadata';
import * as modalActions from 'src/actions/suite/modalActions';
import DropboxProvider from 'src/services/suite/metadata/DropboxProvider';
import GoogleProvider from 'src/services/suite/metadata/GoogleProvider';
import FileSystemProvider from 'src/services/suite/metadata/FileSystemProvider';
import { selectSelectedProviderForLabels } from 'src/reducers/suite/metadataReducer';

import { createAction } from '@reduxjs/toolkit';
import { notificationsActions } from '@suite-common/toast-notifications';

export const setAccountAdd = createAction(METADATA.ACCOUNT_ADD, (payload: Account) => ({
    payload,
}));

export type MetadataAction =
    | { type: typeof METADATA.ENABLE }
    | { type: typeof METADATA.DISABLE }
    | { type: typeof METADATA.SET_EDITING; payload: string | undefined }
    | { type: typeof METADATA.SET_INITIATING; payload: boolean }
    | { type: typeof METADATA.SET_MIGRATION_STATUS; payload: MetadataState['migration']['status'] }
    | { type: typeof METADATA.SET_ENTITIES_DESCRIPTORS; payload: MetadataState['entities'] }
    | {
          type: typeof METADATA.SET_DEVICE_METADATA;
          payload: { deviceState: string; metadata: DeviceMetadata };
      }
    | {
          type: typeof METADATA.REMOVE_PROVIDER;
          payload: MetadataProvider;
      }
    | {
          type: typeof METADATA.ADD_PROVIDER;
          payload: MetadataProvider;
      }
    | {
          type: typeof METADATA.SET_DATA;
          payload: {
              provider: MetadataProvider;
              data: Record<string, Labels>;
          };
      }
    | {
          type: typeof METADATA.SET_SELECTED_PROVIDER;
          payload: {
              dataType: DataType;
              clientId: string;
          };
      }
    | ReturnType<typeof setAccountAdd>;

// needs to be declared here in top level context because it's not recommended to keep classes instances in redux state (serialization)
let providerInstance: DropboxProvider | GoogleProvider | FileSystemProvider | undefined;
const fetchIntervals: { [deviceState: string]: any } = {}; // any because of native at the moment, otherwise number | undefined

const createProviderInstance = (
    type: MetadataProvider['type'],
    tokens: Tokens = {},
    environment: OAuthServerEnvironment = 'production',
) => {
    switch (type) {
        case 'dropbox':
            return new DropboxProvider({
                token: tokens?.refreshToken,
                clientId: METADATA.DROPBOX_CLIENT_ID,
            });
        case 'google':
            return new GoogleProvider(tokens, environment);
        case 'fileSystem':
            return new FileSystemProvider();
        default:
            throw new Error(`provider of type ${type} is not implemented`);
    }
};

/**
 * dispose metadata from all labelable objects.
 * Has keys parameter,
 * if true - dispose also metadata keys
 * if false - dispose only metadata values
 */
export const disposeMetadata = (keys?: boolean) => (dispatch: Dispatch, getState: GetState) => {
    const provider = selectSelectedProviderForLabels(getState());
    if (!provider) {
        return;
    }
    dispatch({
        type: METADATA.SET_DATA,
        payload: {
            provider,
            data: undefined,
        },
    });

    if (keys) {
        getState().wallet.accounts.forEach(account => {
            const updatedAccount = JSON.parse(JSON.stringify(account));

            delete updatedAccount.metadata[METADATA.ENCRYPTION_VERSION];
            dispatch(setAccountAdd(updatedAccount));
        });

        getState().devices.forEach(device => {
            if (device.state) {
                // set metadata as disabled for this device, remove all metadata related information
                dispatch({
                    type: METADATA.SET_DEVICE_METADATA,
                    payload: {
                        deviceState: device.state,
                        metadata: { status: 'disabled' },
                    },
                });
            }
        });
    }
};

export const disconnectProvider =
    ({ clientId, removeMetadata = true }: { clientId: string; removeMetadata?: boolean }) =>
    async (dispatch: Dispatch) => {
        Object.values(fetchIntervals).forEach((deviceState, num) => {
            clearInterval(num);
            delete fetchIntervals[deviceState];
        });

        // dispose metadata values (not keys)
        if (removeMetadata) {
            dispatch(disposeMetadata());
        }

        /* eslint-disable-next-line @typescript-eslint/no-use-before-define */
        const provider = dispatch(getProviderInstance({ clientId }));
        if (provider) {
            await provider.disconnect();
            providerInstance = undefined;
        }
        // flush reducer
        dispatch({
            type: METADATA.REMOVE_PROVIDER,
            payload: provider,
        });
        dispatch({
            type: METADATA.SET_SELECTED_PROVIDER,
            payload: { dataType: 'labels', clientId: undefined },
        });

        analytics.report({
            type: EventType.SettingsGeneralLabelingProvider,
            payload: {
                provider: '',
            },
        });
    };

/**
 * handleProviderError method controls how application reacts to various errors from metadata providers
 * Toasts go in this format:
 * Error: <Action>: <Reason>
 * Error: Upload failed: Access token is invalid
 */
const handleProviderError =
    ({
        error,
        action,
        clientId,
    }: {
        error: MetadataProviderError;
        action: string;
        clientId?: string;
    }) =>
    (dispatch: Dispatch) => {
        // error should be of specified type, but in case it is not (catch is not typed) show generic error
        // if this happens, it means that there is a hole in error handling and it should be fixed
        const toastError = error.code
            ? `${action}: ${error?.error}`
            : `Labeling action failed. ${error}`;

        dispatch(
            notificationsActions.addToast({
                type: 'error',
                error: toastError,
            }),
        );

        if (clientId) {
            // handle nicely wrapped errors here
            switch (error.code) {
                // possibly programmer errors
                // something is screwed up, we don't really know what.
                // react by disabling all metadata and toasting error;
                case 'ACCESS_ERROR':
                case 'BAD_INPUT_ERROR':
                case 'OTHER_ERROR':
                    dispatch(disposeMetadata());
                    dispatch(
                        disconnectProvider({
                            clientId,
                        }),
                    );
                    break;
                case 'PROVIDER_ERROR':
                case 'RATE_LIMIT_ERROR':
                case 'AUTH_ERROR':
                    dispatch(
                        disconnectProvider({
                            clientId,
                        }),
                    );
                    break;
                case 'CONNECTIVITY_ERROR':
                default:
                    break;
            }
        }
    };

/**
 * Return already existing instance of AbstractProvider or recreate it from token;
 */
const getProviderInstance =
    ({ clientId }: { clientId: string }) =>
    (_dispatch: Dispatch, getState: GetState) => {
        const state = getState();
        const { providers } = state.metadata;

        const provider = providers.find(p => p.clientId === clientId);

        if (!provider) return;

        // instance already exists but user did not finish log in and decided to use another provider;
        if (providerInstance && providerInstance.type !== provider.type) {
            providerInstance = undefined;
        }

        if (providerInstance) return providerInstance;

        providerInstance = createProviderInstance(
            provider.type,
            provider.tokens,
            state.suite.settings.debug.oauthServerEnvironment,
        );

        return providerInstance;
    };

export const enableMetadata = (): MetadataAction => ({
    type: METADATA.ENABLE,
});

export const disableMetadata = () => (dispatch: Dispatch) => {
    dispatch({
        type: METADATA.DISABLE,
    });
    // dispose metadata values and keys
    dispatch(disposeMetadata(true));
};

export const initProvider = () => (dispatch: Dispatch) => {
    const decision = createDeferred<boolean>();
    dispatch(modalActions.openModal({ type: 'metadata-provider', decision }));
    return decision.promise;
};

const setMetadata =
    ({
        provider,
        fileName,
        data,
    }: {
        provider: MetadataProvider;
        fileName: string;
        data: WalletLabels | AccountLabels | undefined;
    }) =>
    (dispatch: Dispatch) => {
        dispatch({
            type: METADATA.SET_DATA,
            payload: {
                provider,
                data: {
                    [fileName]: data,
                },
            },
        });
    };

export const getLabelableEntities =
    (deviceState: string) => (_dispatch: Dispatch, getState: GetState) => {
        const { accounts } = getState().wallet;
        const { devices } = getState();

        return [
            ...accounts
                .filter(a => a.deviceState === deviceState)
                .map(account => ({
                    ...account.metadata,
                    key: account.key,
                    type: 'account' as const,
                })),
            ...devices
                .filter((device: TrezorDevice) => device.state === deviceState)
                .map((device: TrezorDevice) => ({
                    ...device.metadata,
                    state: device.state,
                    type: 'device' as const,
                })),
        ];
    };

type LabelableEntity = ReturnType<ReturnType<typeof getLabelableEntities>>[number];

export const fetchMetadata =
    ({
        provider,
        entity,
        encryptionVersion = METADATA.ENCRYPTION_VERSION,
    }: {
        provider: MetadataProvider;
        entity: LabelableEntity;
        encryptionVersion?: MetadataEncryptionVersion;
    }) =>
    async (dispatch: Dispatch) => {
        const providerInstance = dispatch(
            getProviderInstance({
                clientId: provider.clientId,
            }),
        );

        if (!providerInstance) {
            throw new Error('no provider instance');
        }

        if (entity.type === 'device' && entity.status !== 'enabled') {
            throw new Error('metadata not enabled'); // because of ts
        }

        const entityMetadata = entity[encryptionVersion];
        if (!entityMetadata) {
            throw new Error('trying to fetch entity without metadata');
        }

        const { fileName, aesKey } = entityMetadata;

        const response = await providerInstance.getFileContent(fileName);

        if (!response.success) {
            throw response;
        }

        if (!response.payload) {
            return undefined;
        }

        // we found associated metadata file for given account, decrypt it and return it
        const decryptedData = metadataUtils.decrypt(
            metadataUtils.arrayBufferToBuffer(response.payload),
            aesKey,
        );

        return {
            fileName,
            data: decryptedData,
        };
    };

export const fetchAndSaveMetadata =
    (deviceStateArg?: string) => async (dispatch: Dispatch, getState: GetState) => {
        const provider = selectSelectedProviderForLabels(getState());
        if (!provider) return;

        const deviceState = deviceStateArg || getState().suite.device?.state;

        if (!deviceState) {
            return;
        }

        const providerInstance = dispatch(
            getProviderInstance({
                clientId: provider.clientId,
            }),
        );
        if (!providerInstance) {
            return;
        }

        const device = getState().devices.find(d => d.state === deviceState);

        try {
            // this triggers renewal of access token if needed. Otherwise multiple requests
            // to renew access token are issued by every provider.getFileContent
            const response = await providerInstance.getProviderDetails();

            if (!response.success) {
                dispatch(
                    handleProviderError({
                        error: response,
                        action: ProviderErrorAction.LOAD,
                        clientId: provider.clientId,
                    }),
                );
                return;
            }

            // device is disconnected or something is wrong with it
            if (device?.metadata?.status !== 'enabled') {
                if (fetchIntervals[deviceState]) {
                    clearInterval(fetchIntervals[deviceState]);
                    delete fetchIntervals[deviceState];
                }
                return;
            }

            const labelableEntities = dispatch(getLabelableEntities(deviceState));

            const promises = labelableEntities.map(entity =>
                dispatch(fetchMetadata({ provider, entity })).then(result => {
                    if (result) {
                        dispatch(setMetadata({ ...result, provider }));
                    }
                }),
            );
            await Promise.all(promises);
        } catch (error) {
            // This handles cases of providers that do not support token renewal.
            // We want those to work normally as long as their short-lived token allows. And only if
            // it expires, we want them to silently disconnect provider, keep metadata in place.
            // So that users will not notice that token expired until they will try to add or edit
            // already existing label
            if (fetchIntervals[deviceState]) {
                return dispatch(
                    disconnectProvider({ removeMetadata: false, clientId: provider.clientId }),
                );
            }
            // If there is no interval set, it means that error occurred in the first fetch
            // in such case, display error notification
            dispatch(
                handleProviderError({
                    error,
                    action: ProviderErrorAction.LOAD,
                    clientId: provider.clientId,
                }),
            );
        }
    };

export const setAccountMetadataKey =
    (account: Account, encryptionVersion = METADATA.ENCRYPTION_VERSION) =>
    (dispatch: Dispatch, getState: GetState) => {
        const { devices } = getState();
        const device = devices.find(d => d.state === account.deviceState);
        if (
            !device ||
            device.metadata.status !== 'enabled' ||
            !device.metadata[METADATA.ENCRYPTION_VERSION]?.key
        ) {
            return account;
        }

        const deviceMetaKey = device.metadata[encryptionVersion]?.key;

        if (!deviceMetaKey) {
            throw new Error('device meta key is missing');
        }
        try {
            const metaKey = metadataUtils.deriveMetadataKey(deviceMetaKey, account.metadata.key);
            const fileName = metadataUtils.deriveFilenameForLabeling(metaKey, encryptionVersion);

            const aesKey = metadataUtils.deriveAesKey(metaKey);
            return {
                ...account,
                metadata: {
                    ...account.metadata,
                    [encryptionVersion]: { fileName, aesKey },
                },
            };
        } catch (error) {
            dispatch(handleProviderError({ error, action: ProviderErrorAction.SAVE }));
        }
        return account;
    };

/**
 * Fill any record in reducer that may have metadata with metadata keys (not values).
 */
const syncMetadataKeys =
    (encryptionVersion = METADATA.ENCRYPTION_VERSION) =>
    (dispatch: Dispatch, getState: GetState) => {
        const accountsWithoutKeys = getState().wallet.accounts.filter(
            acc => !acc.metadata[encryptionVersion]?.fileName,
        );

        accountsWithoutKeys.forEach(account => {
            const accountWithMetadata = dispatch(setAccountMetadataKey(account, encryptionVersion));
            dispatch(setAccountAdd(accountWithMetadata));
        });
        // note that devices are intentionally omitted here - device receives metadata
        // keys sooner when enabling labeling on device;
    };

export const selectProvider =
    ({ dataType, clientId }: { dataType: DataType; clientId: string }) =>
    (dispatch: Dispatch) => {
        dispatch({
            type: METADATA.SET_SELECTED_PROVIDER,
            payload: {
                dataType,
                clientId,
            },
        });
    };

export const connectProvider =
    ({ type, dataType = 'labels' }: { type: MetadataProviderType; dataType?: DataType }) =>
    async (dispatch: Dispatch, getState: GetState) => {
        const providerInstance = createProviderInstance(
            type,
            {},
            getState().suite.settings.debug.oauthServerEnvironment,
        );

        const isConnected = await providerInstance.isConnected();
        if (!isConnected) {
            const connectionResult = await providerInstance.connect();
            if ('error' in connectionResult) {
                return connectionResult.error;
            }
        }

        const providerDetails = await providerInstance.getProviderDetails();
        if (!providerDetails.success) {
            dispatch(
                handleProviderError({
                    error: providerDetails,
                    action: ProviderErrorAction.CONNECT,
                    clientId: providerInstance.clientId,
                }),
            );
            return;
        }

        dispatch({
            type: METADATA.ADD_PROVIDER,
            payload: {
                ...providerDetails.payload,
                data: {},
            },
        });

        analytics.report({
            type: EventType.SettingsGeneralLabelingProvider,
            payload: {
                provider: providerDetails.payload.type,
            },
        });

        dispatch(selectProvider({ dataType, clientId: providerInstance.clientId }));

        return true;
    };

export const addDeviceMetadata =
    (payload: Extract<MetadataAddPayload, { type: 'walletLabel' }>) =>
    (dispatch: Dispatch, getState: GetState) => {
        const device = getState().devices.find(d => d.state === payload.deviceState);
        const provider = selectSelectedProviderForLabels(getState());

        if (!device || device.metadata.status !== 'enabled') return Promise.resolve(false);

        if (!provider) return Promise.resolve(false);

        const { fileName, aesKey } = device.metadata[METADATA.ENCRYPTION_VERSION] || {};
        if (!fileName || !aesKey) {
            console.error('fileName or aesKey is missing for device', device.state);
            return Promise.resolve(false);
        }

        // todo: not danger overwrite empty?
        const metadata = fileName ? provider.data[fileName] : undefined;

        const nextMetadata = cloneObject(
            metadata ?? METADATA.DEFAULT_WALLET_METADATA,
        ) as WalletLabels;

        const walletLabel =
            typeof payload.value === 'string' && payload.value.length > 0
                ? payload.value
                : undefined;

        nextMetadata.walletLabel = walletLabel;

        dispatch(
            setMetadata({
                provider,
                fileName,
                data: nextMetadata,
            }),
        );

        return dispatch(
            encryptAndSaveMetadata({
                data: { walletLabel },
                aesKey,
                fileName,
                provider,
            }),
        );
    };

/**
 * @param payload - metadata payload
 * @param save - should metadata be saved into persistent storage? this is useful when you are updating multiple records
 *               in a single account you may want to set "save" param to true only for the last call
 */
export const addAccountMetadata =
    (payload: Exclude<MetadataAddPayload, { type: 'walletLabel' }>, save = true) =>
    async (dispatch: Dispatch, getState: GetState) => {
        const account = getState().wallet.accounts.find(a => a.key === payload.accountKey);
        const provider = selectSelectedProviderForLabels(getState());

        if (!account || !provider) return false;

        // todo: not danger overwrite empty?
        const { fileName, aesKey } = account.metadata?.[METADATA.ENCRYPTION_VERSION] || {};

        if (!fileName || !aesKey) {
            throw new Error(
                `filename of version ${METADATA.ENCRYPTION_VERSION} does not exist for account ${account.path}`,
            );
        }
        const data = provider.data[fileName];

        const nextMetadata = cloneObject(
            data ?? METADATA.DEFAULT_ACCOUNT_METADATA,
        ) as AccountLabels;

        if (payload.type === 'outputLabel') {
            if (typeof payload.value !== 'string' || payload.value.length === 0) {
                if (!nextMetadata.outputLabels[payload.txid]) return false;
                delete nextMetadata.outputLabels[payload.txid][payload.outputIndex];
                if (Object.keys(nextMetadata.outputLabels[payload.txid]).length === 0) {
                    delete nextMetadata.outputLabels[payload.txid];
                }
            } else {
                if (!nextMetadata.outputLabels[payload.txid]) {
                    nextMetadata.outputLabels[payload.txid] = {};
                }

                nextMetadata.outputLabels[payload.txid][payload.outputIndex] = payload.value;

                // 2.0.0
                // metadata.outputLabels[payload.txid][payload.outputIndex] = {
                //     ts,
                //     value: payload.value,
                // };
            }
        }

        if (payload.type === 'addressLabel') {
            if (typeof payload.value !== 'string' || payload.value.length === 0) {
                delete nextMetadata.addressLabels[payload.defaultValue];
            } else {
                nextMetadata.addressLabels[payload.defaultValue] = payload.value;
            }
        }

        if (payload.type === 'accountLabel') {
            if (typeof payload.value !== 'string' || payload.value.length === 0) {
                delete nextMetadata.accountLabel;
            } else {
                nextMetadata.accountLabel = payload.value;
            }
        }

        dispatch(
            setMetadata({
                fileName,
                provider,
                data: nextMetadata,
            }),
        );

        // we might intentionally skip saving metadata content to persistent storage.
        if (!save) return true;

        await dispatch(
            encryptAndSaveMetadata({
                data: {
                    accountLabel: nextMetadata.accountLabel,
                    outputLabels: nextMetadata.outputLabels,
                    addressLabels: nextMetadata.addressLabels,
                },
                aesKey,
                fileName,
                provider,
            }),
        );

        return true;
    };

const encryptAndSaveMetadata =
    ({
        data,
        aesKey,
        fileName,
        provider,
    }: {
        data: AccountLabels | WalletLabels;
        aesKey: string;
        fileName: string;
        provider: MetadataProvider;
    }) =>
    async (dispatch: Dispatch) => {
        const providerInstance = dispatch(getProviderInstance({ clientId: provider.clientId }));

        if (!providerInstance) {
            // provider should always be set here
            return false;
        }

        try {
            const encrypted = await metadataUtils.encrypt(
                {
                    version: METADATA.FORMAT_VERSION,
                    ...data,
                },
                aesKey,
            );

            const result = await providerInstance.setFileContent(fileName, encrypted);
            if (!result.success) {
                dispatch(
                    handleProviderError({
                        error: result,
                        action: ProviderErrorAction.SAVE,
                        clientId: provider.clientId,
                    }),
                );
                return false;
            }
        } catch (err) {
            const error = providerInstance.error('OTHER_ERROR', err.message);
            dispatch(
                handleProviderError({
                    error,
                    action: ProviderErrorAction.SAVE,
                    clientId: provider.clientId,
                }),
            );
            return false;
        }
    };

/**
 * Generate device master-key
 * */
export const setDeviceMetadataKey =
    (encryptionVersion = METADATA.ENCRYPTION_VERSION) =>
    async (dispatch: Dispatch, getState: GetState) => {
        const { device } = getState().suite;
        if (!device || !device.state || !device.connected) return;

        // in case of migration device.metadata.status is already enabled
        // if (device.metadata.status === 'enabled') return;

        const result = await TrezorConnect.cipherKeyValue({
            device: {
                path: device.path,
                state: device.state,
                instance: device.instance,
            },
            useEmptyPassphrase: device.useEmptyPassphrase,
            ...METADATA.ENCRYPTION_VERSION_CONFIGS[encryptionVersion],
        });

        if (result.success) {
            if (!getState().metadata.enabled) {
                dispatch({
                    type: METADATA.ENABLE,
                });
            }

            const [stateAddress] = device.state.split('@'); // address@device_id:instance
            const metaKey = metadataUtils.deriveMetadataKey(result.payload.value, stateAddress);
            const fileName = metadataUtils.deriveFilenameForLabeling(metaKey, encryptionVersion);
            const aesKey = metadataUtils.deriveAesKey(metaKey);

            dispatch({
                type: METADATA.SET_DEVICE_METADATA,
                payload: {
                    deviceState: device.state,
                    metadata: {
                        ...device.metadata,
                        status: 'enabled',
                        [encryptionVersion]: {
                            fileName,
                            aesKey,
                            key: result.payload.value,
                        },
                    },
                },
            });
        } else {
            // TODO: After metadata migration is implemented, I am not sure that 'cancelled' state makes sense
            // anymore. With version 2 encryption user does not even have the option to cancel metadata on device
            // user only has option to cancel labeling during migration. How should we handle this?
            dispatch({
                type: METADATA.SET_DEVICE_METADATA,
                payload: {
                    deviceState: device.state,
                    metadata: {
                        status: 'cancelled',
                    },
                },
            });
            // TODO: THIS SHOULD BE CHANGED I BELIEVE

            // in effort to resolve https://github.com/trezor/trezor-suite/issues/2315
            // also turn of global metadata.enabled setting
            // pros:
            // - user without saved device is not bothered with labeling when reloading page
            // cons:
            // - it makes concept device.metadata.status "cancelled" useless
            // - new device will not be prompted with metadata when connected so even when there is
            //   existing metadata for this device, user will not see it until he clicks "add label" button
            dispatch({
                type: METADATA.DISABLE,
            });
        }
    };

export const addMetadata = (payload: MetadataAddPayload) => (dispatch: Dispatch) => {
    if (payload.type === 'walletLabel') {
        return dispatch(addDeviceMetadata(payload));
    }
    return dispatch(addAccountMetadata(payload));
};

/**
 * init - prepare everything needed to load + decrypt and upload + decrypt metadata. Note that this method
 * consists of number of steps of which not all have to necessarily happen. For example
 * user may directly navigate to /settings, enable metadata (by invoking init), but his device
 * does not have state yet.
 * In this case, setDeviceMetadataKey method (in case user requests v1 keys) and those that follow
 * are skipped and user will be asked again either after authorization process or when user
 * tries to add new label.
 */
export const init = () => async (dispatch: Dispatch, getState: GetState) => {
    const { device } = getState().suite;

    // 1. set metadata enabled globally
    if (!getState().metadata.enabled) {
        dispatch(enableMetadata());
    }

    if (!device?.state) {
        return false;
    }

    dispatch({ type: METADATA.SET_INITIATING, payload: true });

    let deviceMetadata: DeviceMetadata | undefined = device.metadata;
    // 2. set device metadata key (master key).
    if (deviceMetadata?.status !== 'enabled') {
        await dispatch(setDeviceMetadataKey(METADATA.ENCRYPTION_VERSION));
    }

    // there was an async action which might have failed (user disconnected device).
    // we don't have keys, we can'd do any labeling
    deviceMetadata = getState().suite.device?.metadata;
    if (
        deviceMetadata?.status === 'disabled' ||
        !deviceMetadata?.[METADATA.ENCRYPTION_VERSION]?.key
    ) {
        dispatch({ type: METADATA.SET_INITIATING, payload: false });
        dispatch({ type: METADATA.SET_EDITING, payload: undefined });

        return false;
    }

    // 3. we have master key. use it to derive account keys
    dispatch(syncMetadataKeys(METADATA.ENCRYPTION_VERSION));

    // 4. connect to provider
    if (!selectSelectedProviderForLabels(getState())) {
        const providerResult = await dispatch(initProvider());
        if (!providerResult) {
            dispatch({ type: METADATA.SET_INITIATING, payload: false });
            dispatch({ type: METADATA.SET_EDITING, payload: undefined });

            return false;
        }
    }

    // 5. migration
    if (getState().metadata.migration.status !== 'in-progress') {
        // todo: do something with statues
        const migrationResult = await dispatch(handleEncryptionVersionMigration());
        dispatch(setMigrationStatus('idle'));

        // failed migration => labeling disabled
        if (!migrationResult.success) {
            dispatch({ type: METADATA.SET_INITIATING, payload: false });
            dispatch({ type: METADATA.SET_EDITING, payload: undefined });
            dispatch(
                notificationsActions.addToast({ type: 'error', error: migrationResult.error! }),
            );
            return;
        }
    }

    // 6. fetch metadata
    await dispatch(fetchAndSaveMetadata(device.state));

    // now we may allow user to edit labels. everything is ready, local data is synced with provider
    if (getState().metadata.initiating) {
        dispatch({ type: METADATA.SET_INITIATING, payload: false });
    }

    // 7. if interval for watching provider is not set, create it
    if (device.state && !fetchIntervals[device.state]) {
        // todo: possible race condition, user is editing label and at that very moment update arrives. updates to specific entities should be probably discarded in such case?
        fetchIntervals[device.state] = setInterval(() => {
            const { device } = getState().suite;
            if (!getState().suite.online || !device?.state) {
                return;
            }
            dispatch(fetchAndSaveMetadata(device.state));
        }, METADATA.FETCH_INTERVAL);
    }

    return true;
};

export const setEditing = (payload: string | undefined): MetadataAction => ({
    type: METADATA.SET_EDITING,
    payload,
});

export const getLabelableEntitiesDescriptors = () => (dispatch: Dispatch, getState: GetState) => {
    const { device } = getState().suite;

    if (!device?.state) return [];

    const entitites = dispatch(getLabelableEntities(device.state));

    return entitites
        .map(entity => {
            if ('key' in entity) return entity.key;
            if ('state' in entity && entity.state) return entity.state;
            throw new Error('entity without unique identifier');
        })
        .sort((a, b) => a.localeCompare(b));
};

export const setEntititesDescriptors = (descriptors: string[]) => (dispatch: Dispatch) => {
    dispatch({
        type: METADATA.SET_ENTITIES_DESCRIPTORS,
        payload: descriptors,
    });
};

/**
 *
 * @returns files in storage provider split into [[...current][...old]].
 */
const getMetadataFiles = () => async (dispatch: Dispatch, getState: GetState) => {
    const providerInstance = dispatch(
        getProviderInstance({
            // todo: huh!
            clientId: getState().metadata.providers[0].clientId,
        }),
    );

    if (!providerInstance) {
        throw new Error('no provider instance');
    }

    // fetch list of all files saved withing currently selected provider for labeling
    const files = await providerInstance.getFilesList().then(response => {
        if (!response.success) {
            dispatch(
                handleProviderError({
                    error: response,
                    action: ProviderErrorAction.LOAD,
                    clientId: providerInstance.clientId,
                }),
            );
            return;
        }
        // todo: imho [] should be default return, it should not be also nullable
        return response?.payload || [];
    });

    // no files, fresh account, no metadata encryption version migration needed
    if (!files?.length) {
        return [[], [], []];
    }

    // todo: this is not future proof in case there is another encryption version
    const [currentEncryptionFiles, restFiles] = arrayPartition(files, file =>
        file.endsWith(`_v${METADATA.ENCRYPTION_VERSION}.mtdt`),
    );

    const [renamedOldEncryptionFiles, oldEncryptionFiles] = arrayPartition(restFiles, file =>
        file.endsWith(`_v${METADATA.ENCRYPTION_VERSION - 1}.mtdt`),
    );

    // todo: actually I don't need to return 'renamedOldEncryptionFiles' here
    return [currentEncryptionFiles, oldEncryptionFiles, renamedOldEncryptionFiles];
};

const createMigrationPromise =
    (
        entity: LabelableEntity,
        prevEncryptionVersion: MetadataEncryptionVersion,
        fetchData: boolean,
    ) =>
    (dispatch: Dispatch, getState: GetState) =>
    () =>
        // eslint-disable-next-line no-async-promise-executor
        new Promise(async resolve => {
            const { device } = getState().suite;
            if (!device?.state || device.metadata.status !== 'enabled') {
                console.error('metadata migration: device unexpected state'); // or throw, or error? i never know
                return;
            }

            try {
                const prevData =
                    fetchData &&
                    (await dispatch(
                        fetchMetadata({
                            entity,
                            encryptionVersion: prevEncryptionVersion,
                            // tudu huh
                            provider: getState().metadata.providers[0],
                        }),
                    ));

                if (entity.type === 'device' && entity.status !== 'enabled') {
                    console.error('meetadata migration: unexpected entity');
                    return; // ts. should not happen
                }

                const nextKeys = entity[METADATA.ENCRYPTION_VERSION];

                if (!nextKeys) {
                    console.error('metadata migration: next keys are missing');
                    return; // should never happen
                }

                const dummy = { dummy: getWeakRandomId(getRandomNumberInRange(1, 100)) };
                const prevKeys = entity[prevEncryptionVersion];
                if (!prevKeys) {
                    console.error('metadata migration: prev keys are missing');
                    return; // should never happen
                }

                const defaultEntityData =
                    entity.type === 'account'
                        ? cloneObject(METADATA.DEFAULT_ACCOUNT_METADATA)
                        : cloneObject(METADATA.DEFAULT_WALLET_METADATA);
                const nextData =
                    prevData && 'data' in prevData
                        ? prevData.data
                        : { ...defaultEntityData, ...dummy };

                const providerInstance = dispatch(
                    getProviderInstance({ clientId: getState().metadata.providers[0]!.clientId }),
                );

                if (!providerInstance) {
                    // provider should always be set here
                    return false;
                }

                dispatch(
                    setMetadata({
                        ...nextKeys,
                        data: nextData,
                        // todo: huh huh
                        provider: getState().metadata.providers[0]!,
                    }),
                );

                // todo: this could run in parallel with rename, ratelimiting should happen elsehwere (in provider)
                await dispatch(
                    encryptAndSaveMetadata({
                        ...nextKeys,
                        data: nextData,
                        // todo: huh huh
                        provider: getState().metadata.providers[0]!,
                    }),
                );

                if (fetchData) {
                    await providerInstance.renameFile(
                        prevKeys.fileName,
                        prevKeys.fileName.replace('.mtdt', '_v1.mtdt'),
                    );
                }
            } catch (err) {
                console.error('metadata migration failed');
            } finally {
                resolve(undefined);
            }
        });

export const setMigrationStatus = (
    payload: MetadataState['migration']['status'],
): MetadataAction => ({
    type: METADATA.SET_MIGRATION_STATUS,
    payload,
});

/**
 * Check whether encryption version migration is needed and if yes execute it
 */
const handleEncryptionVersionMigration =
    () =>
    async (
        dispatch: Dispatch,
        getState: GetState,
    ): Promise<{ success: boolean; error?: string }> => {
        // 1. select lower encryption version
        const prevEncryptionVersion = (METADATA.ENCRYPTION_VERSION -
            1) as MetadataEncryptionVersion;
        if (prevEncryptionVersion < 1) {
            return {
                success: false,
                error: `metadata migration: can not migrate to version ${prevEncryptionVersion}`,
            };
        }

        // 2. in general, metadata related actions are per device as everything is encrypted by device.metadata[version].key
        let { device } = getState().suite;
        if (!device?.state || device.metadata.status !== 'enabled') {
            return { success: false, error: 'metadata migration: device unexpected state' };
        }

        // 3. fetch list of all files saved withing currently selected provider for labeling. based on file suffix we are
        //    able to determine which files are associated with which encryption version
        const [currentEncryptionFiles, oldEncryptionFiles, renamedOldEncryptionFiles] =
            await dispatch(getMetadataFiles());
        console.log(
            'currentEncryptionFiles, oldEncryptionFiles',
            'renamedOldEncryptionFiles',
            currentEncryptionFiles.length,
            oldEncryptionFiles.length,
            renamedOldEncryptionFiles.length,
        );

        // 4. there are no old files (either labeling was never used before, old old files were renamed to file_v1.mdtd)
        if (oldEncryptionFiles.length === 0) {
            return { success: true };
        }

        // 5. there are old files, but also all labelable entities currently known to suite have some record in currentEncryptionFiles.
        //    this means that they have already been migrated or dummy file was created
        const everyEntityHasNewFile = dispatch(getLabelableEntities(device.state)).every(entity => {
            if (entity.type === 'device' && entity.status === 'disabled') return; // ts.

            const nextKeys = entity[METADATA.ENCRYPTION_VERSION];

            if (!nextKeys) {
                // todo: should never happend but happend once during testing.
                throw new Error('metadata migration: next keys are missing');
            }
            return currentEncryptionFiles.find(file => file === nextKeys.fileName);
        });

        if (everyEntityHasNewFile) {
            return { success: true };
        }

        // 6. now we know that migration is needed. set a flag to prevent multiple migrations at once
        dispatch(setMigrationStatus('in-progress'));

        // 7. sync metadata keys for prev encryption version.
        //    NOTE: result of this operation is saved for device and account encryption keys are computed from it. This means that we can add new accounts at any point of time later without calling this again
        if (!device.metadata[prevEncryptionVersion]) {
            await dispatch(setDeviceMetadataKey(prevEncryptionVersion));
        }
        device = getState().suite.device;
        if (
            device?.metadata.status !== 'enabled' ||
            !device?.metadata[prevEncryptionVersion]?.key
        ) {
            return { success: false, error: 'metadata migration: cancelled' };
        }

        dispatch(syncMetadataKeys(prevEncryptionVersion));

        if (!device?.state) {
            // this should never happen
            return { success: false, error: 'metadata migration: device not authorized' };
        }

        // 8. get labelable entitites again (there was async operation in between)
        const allEntities = dispatch(getLabelableEntities(device.state));

        // 9. split labelable entities into 2 groups:
        //    - entitiesToMigrate: don't have new file && have old file
        //    - entititiesToCreateDummies: don't have new file && don't have old file

        const entitiesToMigrate: LabelableEntity[] = [];
        const entititiesToCreateDummies: LabelableEntity[] = [];
        allEntities.forEach(entity => {
            if (entity.type === 'device' && entity.status === 'disabled') return; // ts.

            const prevKeys = entity[prevEncryptionVersion];

            if (!prevKeys) {
                console.error('metadata migration: prev keys are missing');
                return; // should never happen
            }
            const nextKeys = entity[METADATA.ENCRYPTION_VERSION];

            if (!nextKeys) {
                console.error('metadata migration: next keys are missing');
                return; // should never happen
            }

            const oldFileExists = oldEncryptionFiles.find(file => file === prevKeys.fileName);
            const newFileExists = currentEncryptionFiles.find(file => file === nextKeys.fileName);

            if (newFileExists) {
                return; // already migrated
            }

            if (!oldFileExists) {
                entititiesToCreateDummies.push(entity);
                return; // there is nothing to migrate,
            }

            entitiesToMigrate.push(entity);
        });

        console.log('entitiesToMigrate', entitiesToMigrate);
        console.log('entititiesToCreateDummies', entititiesToCreateDummies);

        // 10. now all data is ready. we know what operations should be carried out. dummy files will be created, old files will be migrated and their content will be filled into local state

        // NOTE: I understand that this is not the right layer to rate limit access to provider API. It should be handled in provider service itself but
        // I don't have free hands to do it now. So I am running all requests in series as a workaround now. Correct solution would be
        // implementing provider.batchWrite and do batching if possible and if not, use single requests with some rate limiting

        // NOTE2: If application exits in the process of running this, no hardship should happen. Migration will be left unfinished meaning that it will
        // prompt user next time again for the remaining 'labelableEntitites'

        // todo: handle error from Promise.allSequence. it throws right?
        await promiseAllSequence([
            ...entitiesToMigrate.map(entity => {
                const promise = dispatch(
                    createMigrationPromise(entity, prevEncryptionVersion, true),
                );
                return () => promise();
            }),
            ...entititiesToCreateDummies.map(entity => {
                const promise = dispatch(
                    createMigrationPromise(entity, prevEncryptionVersion, false),
                );
                return () => promise();
            }),
        ]);

        dispatch(setMigrationStatus('finished'));
        return { success: true };
    };
