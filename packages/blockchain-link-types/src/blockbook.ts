import type {
    AccountBalanceHistoryParams,
    GetCurrentFiatRatesParams,
    GetFiatRatesForTimestampsParams,
    GetFiatRatesTickersListParams,
    EstimateFeeParams,
    AccountInfoParams,
} from './params';
import type { AccountBalanceHistory, FiatRates, TokenStandard } from './common';
import {
    Vin,
    Vout,
    Utxo as BlockbookUtxo,
    WsInfoRes,
    WsBlockHashRes,
    Block as BlockbookBlock,
    Tx as BlockbookTx,
    TokenTransfer as BlockbookTokenTransfer,
} from './blockbook-api';

type OptionalKey<M, K extends keyof M> = Omit<M, K> & Partial<Pick<M, K>>;
type RequiredKey<M, K extends keyof M> = Omit<M, K> & Required<Pick<M, K>>;

export type AccountUtxo = RequiredKey<BlockbookUtxo, 'address' | 'height' | 'value' | 'path'>[];

export type Block = Omit<BlockbookBlock, 'txs'> & {
    txs?: Transaction[];
};

export interface Subscribe {
    subscribed: boolean;
}

export type ServerInfo = WsInfoRes;

export type BlockHash = WsBlockHashRes;

export interface XPUBAddress {
    type: 'XPUBAddress';
    name: string;
    path: string;
    transfers: number;
    balance: string;
    totalSent: string;
    totalReceived: string;
}

export interface ERC20 {
    type: 'ERC20';
    name?: string;
    symbol?: string;
    contract: string;
    balance?: string;
    decimals?: number;
}

export interface AccountInfo {
    address: string;
    balance: string;
    totalReceived: string;
    totalSent: string;
    txs: number;
    unconfirmedBalance: string;
    unconfirmedTxs: number;
    page?: number;
    itemsOnPage: number;
    totalPages: number;
    nonTokenTxs?: number;
    transactions?: Transaction[];
    nonce?: string;
    tokens?: (XPUBAddress | ERC20)[];
    erc20Contract?: ERC20;
}

export interface AccountUtxoParams {
    descriptor: string;
}

export type VinVout = OptionalKey<Vin & Vout, 'addresses'>;

export type Transaction = Omit<BlockbookTx, 'vin' | 'vout' | 'tokenTransfers'> & {
    vin: VinVout[];
    vout: VinVout[];
    tokenTransfers?: (Omit<BlockbookTokenTransfer, 'type'> & { type: TokenStandard })[];
};

export interface Push {
    result: string;
}

export type Fee = {
    feePerUnit: string;
    feePerTx?: string;
    feeLimit?: string;
}[];

export interface BlockNotification {
    height: number;
    hash: string;
}

export interface MempoolTransactionNotification extends Transaction {
    confirmationETABlocks: number;
    confirmationETASeconds: number;
}

export interface AddressNotification {
    address: string;
    tx: Transaction;
}

export interface FiatRatesNotification {
    rates: FiatRates;
}

export interface TimestampedFiatRates {
    ts: number;
    rates: FiatRates;
}

export interface FiatRatesForTimestamp {
    tickers: TimestampedFiatRates[];
}

export interface AvailableCurrencies {
    ts: number;
    available_currencies: string[];
}

declare function FSend(method: 'getInfo'): Promise<ServerInfo>;
declare function FSend(method: 'getBlockHash', params: { height: number }): Promise<BlockHash>;
declare function FSend(method: 'getBlock', params: { id: string }): Promise<Block>;
declare function FSend(method: 'getAccountInfo', params: AccountInfoParams): Promise<AccountInfo>;
declare function FSend(method: 'getAccountUtxo', params: AccountUtxoParams): Promise<AccountUtxo>;
declare function FSend(method: 'getTransaction', params: { txid: string }): Promise<Transaction>;
declare function FSend(method: 'sendTransaction', params: { hex: string }): Promise<Push>;
declare function FSend(
    method: 'getBalanceHistory',
    params: AccountBalanceHistoryParams,
): Promise<AccountBalanceHistory[]>;
declare function FSend(
    method: 'getCurrentFiatRates',
    params: GetCurrentFiatRatesParams,
): Promise<TimestampedFiatRates>;
declare function FSend(
    method: 'getFiatRatesTickersList',
    params: GetFiatRatesTickersListParams,
): Promise<AvailableCurrencies>;
declare function FSend(
    method: 'getFiatRatesForTimestamps',
    params: GetFiatRatesForTimestampsParams,
): Promise<FiatRatesForTimestamp>;
declare function FSend(method: 'estimateFee', params: EstimateFeeParams): Promise<Fee>;
declare function FSend(
    method: 'subscribeAddresses',
    params: { addresses: string[] },
): Promise<Subscribe>;
declare function FSend(method: 'unsubscribeAddresses'): Promise<Subscribe>;
declare function FSend(method: 'subscribeNewBlock'): Promise<Subscribe>;
declare function FSend(method: 'unsubscribeNewBlock'): Promise<Subscribe>;
declare function FSend(
    method: 'subscribeFiatRates',
    params: { currency?: string },
): Promise<Subscribe>;
declare function FSend(method: 'unsubscribeFiatRates'): Promise<Subscribe>;
declare function FSend(method: 'subscribeNewTransaction'): Promise<Subscribe>;
declare function FSend(method: 'unsubscribeNewTransaction'): Promise<Subscribe>;
export type Send = typeof FSend;
