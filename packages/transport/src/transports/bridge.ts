import { request as http, setFetch as rSetFetch } from '../utils/http';
import * as check from '../utils/highlevel-checks';
import { buildOne } from '../lowlevel/send';
import { receiveOne } from '../lowlevel/receive';
import { DEFAULT_URL } from '../constants';
import { Transport } from './abstract';

import type { AcquireInput, TrezorDeviceInfoWithSession } from '../types';

type IncompleteRequestOptions = {
    body?: Array<any> | Record<string, unknown> | string;
    url: string;
};

export class BridgeTransport extends Transport {
    bridgeVersion?: string;
    debug = false;
    isOutdated?: boolean;
    // todo: name only 'bridge' ? or BridgeTransport and WebUsbTransport ?
    name = 'BridgeTransport';
    url: string;

    constructor({ url = DEFAULT_URL }: { url?: string }) {
        super({});
        this.url = url;
    }

    async init(debug: boolean) {
        this.debug = !!debug;
        await this._silentInit();
    }

    async enumerate(old?: Array<TrezorDeviceInfoWithSession>) {
        if (old) {
            const devicesS = await this._post({
                url: '/listen',
                body: old,
            });
            const devices = check.devices(devicesS);
            return devices;
        }
        const devicesS = await this._post({ url: '/enumerate' });
        const devices = check.devices(devicesS);
        return devices;
    }

    async acquire({ input, debug }: { input: AcquireInput; debug: boolean }) {
        const acquireS = await this._acquireMixed(input, debug);
        return check.acquire(acquireS);
    }

    async release(session: string, onclose: boolean, debugLink: boolean) {
        const res = this._post({
            url: `${debugLink ? '/debug' : ''}/release/${session}`,
        });
        if (onclose) {
            return;
        }
        await res;
    }

    async call({
        session,
        name,
        data,
        debug,
    }: {
        session: string;
        name: string;
        data: Record<string, unknown>;
        debug: boolean;
    }) {
        if (this.messages == null) {
            throw new Error('Transport not configured.');
        }
        const { messages } = this;
        const o = buildOne(messages, name, data);
        const outData = o.toString('hex');
        const resData = await this._post({
            url: `${debug ? '/debug' : ''}/call/${session}`,
            body: outData,
        });
        if (typeof resData !== 'string') {
            throw new Error('Returning data is not string.');
        }
        const jsonData = receiveOne(messages, resData);
        return check.call(jsonData);
    }

    async send({
        session,
        name,
        data,
        debug,
    }: {
        debug: boolean;
        session: string;
        data: Record<string, unknown>;
        name: string;
    }) {
        if (this.messages == null) {
            throw new Error('Transport not configured.');
        }
        const { messages } = this;
        const outData = buildOne(messages, name, data).toString('hex');
        await this._post({
            url: `${debug ? '/debug' : ''}/post/${session}`,
            body: outData,
        });
    }

    async receive({ session, debug }: { debug: boolean; session: string }) {
        if (this.messages == null) {
            throw new Error('Transport not configured.');
        }
        const { messages } = this;
        const resData = await this._post({
            url: `${debug ? '/debug' : ''}/read/${session}`,
        });
        if (typeof resData !== 'string') {
            throw new Error('Returning data is not string.');
        }
        const jsonData = receiveOne(messages, resData);
        return check.call(jsonData);
    }

    _post(options: IncompleteRequestOptions) {
        return http({
            ...options,
            method: 'POST',
            url: this.url + options.url,
            skipContentTypeHeader: true,
        });
    }

    async _silentInit() {
        const infoS = await http({
            url: this.url,
            method: 'POST',
        });
        const info = check.info(infoS);
        this.version = info.version;
        // const newVersion =
        //     typeof this.bridgeVersion === 'string'
        //         ? this.bridgeVersion
        //         : check.version(
        //               await http({
        //                   url: `${this.newestVersionUrl}?${Date.now()}`,
        //                   method: 'GET',
        //               }),
        //           );
        // this.isOutdated = versionUtils.isNewer(newVersion, this.version);
    }

    _acquireMixed(input: AcquireInput, debugLink: boolean) {
        const previousStr = input.previous == null ? 'null' : input.previous;
        const url = `${debugLink ? '/debug' : ''}/acquire/${input.path}/${previousStr}`;
        return this._post({ url });
    }

    static setFetch(fetch: any, isNode?: boolean) {
        rSetFetch(fetch, isNode);
    }
}
