import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '@trezor/components';

import { ThemeProvider } from 'styled-components';

import { THEME } from '@trezor/components';
import { initLog } from '@trezor/connect/src/utils/debug';

interface ReactWrapperProps {
    children: React.ReactNode;
}

export const ThemeWrapper = ({ children }: ReactWrapperProps) => (
    <ThemeProvider theme={THEME.light}>{children}</ThemeProvider>
);

const MAX_ENTRIES = 1000;

const DownloadButton = ({ array, filename }: { array: any[]; filename: string }) => {
    const downloadArrayAsFile = () => {
        const data = JSON.stringify(array, null, 2);
        const blob = new Blob([data], { type: 'application/json' });

        // Temporary anchor element.
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);

        // Programmatically trigger a click event on the anchor element.
        a.click();

        // Remove the anchor element from the document body.
        document.body.removeChild(a);

        URL.revokeObjectURL(a.href);
    };

    return (
        <Button data-test="@log-container/download-button" onClick={downloadArrayAsFile}>
            Download Logs
        </Button>
    );
};

const useLogWorker = (setLogs: React.Dispatch<React.SetStateAction<any[]>>) => {
    const logWorker = new SharedWorker('./workers/shared-logger-worker.js');

    const logger = initLog('', true);

    useEffect(() => {
        logWorker.port.onmessage = function (event) {
            const { data } = event;
            switch (data.type) {
                case 'get-logs':
                    setLogs(data.payload);
                    data.payload.forEach(log => {
                        // todo: DRY this
                        const { level, prefix, css, message } = log;
                        logger.prefix = prefix;
                        logger.css = css;

                        // TODO: fix types
                        // @ts-expect-error
                        logger[level](...message);
                    });
                    break;
                case 'log-entry':
                    setLogs(prevLogs => {
                        if (prevLogs.length > MAX_ENTRIES) {
                            prevLogs.shift();
                        }
                        return [...prevLogs, data.payload];
                    });

                    // todo in one fn
                    const { level, prefix, css, message } = data.payload;
                    logger.prefix = prefix;
                    logger.css = css;

                    // TODO: fix types
                    // @ts-expect-error
                    logger[level](...message);

                    break;
                default:
            }
        };

        logWorker.port.postMessage({ type: 'get-logs' });
        logWorker.port.postMessage({ type: 'subscribe' });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return logWorker;
};

const Inspector = () => {
    const [logs, setLogs] = useState<any[]>([]);
    useLogWorker(setLogs);

    return (
        <>
            {logs.length > 0 ? (
                <>
                    <DownloadButton array={logs} filename="trezor-connect-logs.json" />
                    
                    To see logs, open dev tools.
                </>
            ) : (
                <p>No logs yet.</p>
            )}
        </>
    );
};

const App = () => (
    <ThemeWrapper>
        <h1>TrezorConnect Logger</h1>
        <Inspector />
    </ThemeWrapper>
);

const renderUI = () => {
    const logReact = document.getElementById('log-react');
    const root = createRoot(logReact!);
    const Component = <App />;

    root.render(Component);
};

renderUI();
