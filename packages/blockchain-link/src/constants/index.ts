import * as MESSAGES from './messages';
import * as RESPONSES from './responses';

export { MESSAGES, RESPONSES };

export const NETWORKS = {
    RIPPLE: 'ripple',
    BLOCKBOOK: 'blockbook',
    BLOCKFROST: 'blockfrost',
    WABISABI: 'wabisabi',
} as const;
