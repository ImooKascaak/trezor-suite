import { MiddlewareAPI } from 'redux';
import * as metadataActions from 'src/actions/suite/metadataActions';
import { AppState, Action, Dispatch } from 'src/types/suite';
import { ROUTER } from 'src/actions/suite/constants';
import { accountsActions } from '@suite-common/wallet-core';

const metadata =
    (api: MiddlewareAPI<Dispatch, AppState>) =>
    (next: Dispatch) =>
    (action: Action): Action => {
        if (accountsActions.createAccount.match(action)) {
            action.payload = api.dispatch(metadataActions.setAccountMetadataKey(action.payload));
        }

        const prevState = api.getState().metadata.entities || [];

        // pass action
        next(action);

        switch (action.type) {
            // detect changes in state in labelable entities.
            // if labelable entitities differ from previous state after discovery completed init metadata

            // todo:
            // @suite/auth-device (device received state). this unfortunatelly does not work yet
            // this action updates "state.devices" but "state.suite.device" gets updated only after next action.
            // I don't really know which device I am working with.
            // worst case scenario without having this implemented is:
            // 1. user has labeling enabled
            // 2. goes directly to settings
            // 3. enables labeling - label of his wallet would not load
            case '@suite/auth-device':
            // '@common/wallet-core/discovery/complete' changes account entities
            case '@common/wallet-core/discovery/complete': {
                const nextState = api.dispatch(metadataActions.getLabelableEntitiesDescriptors());
                if (api.getState().metadata.enabled) {
                    if (prevState.join('') !== nextState.join('')) {
                        api.dispatch(metadataActions.init());
                    } else {
                        console.log('states are equal!');
                    }
                }

                api.dispatch(metadataActions.setEntititesDescriptors(nextState));

                break;
            }

            case ROUTER.LOCATION_CHANGE:
                // if there is editing field active, changing route turns it inactive
                if (api.getState().metadata.editing) {
                    api.dispatch(metadataActions.setEditing(undefined));
                }
                break;
            default:
            // no default
        }

        return action;
    };

export default metadata;
